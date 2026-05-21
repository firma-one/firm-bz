import { basePrisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encryption'
import type { ModelSummary, ScriptResult } from './index'

const BATCH = 100

function isCiphertext(val: string): boolean {
  return /^v\d+\$/.test(val)
}

function encryptIfNeeded(val: unknown): string | null {
  if (val === null || val === undefined) return null
  const str = typeof val === 'string' ? val : String(val)
  if (str.length === 0) return null
  if (isCiphertext(str)) return null // already encrypted, skip
  return encrypt(str)
}

type Row = { id: string } & Record<string, unknown>

async function backfillFields(
  fetcher: (cursor?: string) => Promise<Row[]>,
  fields: string[],
  updater: (id: string, data: Record<string, string>) => Promise<unknown>,
): Promise<ModelSummary> {
  let cursor: string | undefined
  const summary: ModelSummary = { processed: 0, skipped: 0, errors: 0 }

  while (true) {
    const rows = await fetcher(cursor)
    if (!rows.length) break

    for (const row of rows) {
      const updates: Record<string, string> = {}
      for (const field of fields) {
        const enc = encryptIfNeeded(row[field])
        if (enc !== null) updates[field] = enc
      }

      if (Object.keys(updates).length > 0) {
        try {
          await updater(row.id, updates)
          summary.processed++
        } catch {
          summary.errors++
        }
      } else {
        summary.skipped++
      }
    }

    cursor = rows[rows.length - 1].id
    if (rows.length < BATCH) break
  }

  return summary
}

export async function run(): Promise<ScriptResult> {
  const start = Date.now()
  const summary: Record<string, ModelSummary> = {}

  try {
    summary.client = await backfillFields(
      async (id) => {
        const rows = await basePrisma.client.findMany({
          take: BATCH,
          ...(id ? { skip: 1, cursor: { id } } : {}),
          select: { id: true, description: true, internalMemo: true, billingAddress: true, relationshipValue: true },
          orderBy: { id: 'asc' },
        })
        return rows as Row[]
      },
      ['description', 'internalMemo', 'billingAddress', 'relationshipValue'],
      (id, data) => basePrisma.client.update({ where: { id }, data }),
    )

    summary.engagement = await backfillFields(
      async (id) => {
        const rows = await basePrisma.engagement.findMany({
          take: BATCH,
          ...(id ? { skip: 1, cursor: { id } } : {}),
          select: { id: true, description: true, rateOrValue: true },
          orderBy: { id: 'asc' },
        })
        return rows as Row[]
      },
      ['description', 'rateOrValue'],
      (id, data) => basePrisma.engagement.update({ where: { id }, data }),
    )

    summary.clientContact = await backfillFields(
      async (id) => {
        const rows = await basePrisma.clientContact.findMany({
          take: BATCH,
          ...(id ? { skip: 1, cursor: { id } } : {}),
          select: { id: true, name: true, email: true, phone: true, notes: true },
          orderBy: { id: 'asc' },
        })
        return rows as Row[]
      },
      ['name', 'email', 'phone', 'notes'],
      (id, data) => basePrisma.clientContact.update({ where: { id }, data }),
    )

    summary.docCommentMessage = await backfillFields(
      async (id) => {
        const rows = await basePrisma.docCommentMessage.findMany({
          take: BATCH,
          ...(id ? { skip: 1, cursor: { id } } : {}),
          select: { id: true, content: true },
          orderBy: { id: 'asc' },
        })
        return rows as Row[]
      },
      ['content'],
      (id, data) => basePrisma.docCommentMessage.update({ where: { id }, data }),
    )

    summary.connector = await backfillFields(
      async (id) => {
        const rows = await basePrisma.connector.findMany({
          take: BATCH,
          ...(id ? { skip: 1, cursor: { id } } : {}),
          select: { id: true, name: true },
          orderBy: { id: 'asc' },
        })
        return rows as Row[]
      },
      ['name'],
      (id, data) => basePrisma.connector.update({ where: { id }, data }),
    )

    return { script: 'encrypt-backfill', status: 'success', summary, durationMs: Date.now() - start }
  } catch (error) {
    return {
      script: 'encrypt-backfill',
      status: 'error',
      summary,
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
