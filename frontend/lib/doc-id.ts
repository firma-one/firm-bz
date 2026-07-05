import { prisma } from '@/lib/prisma'

const CONSONANTS = new Set('bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ')

/** Derive a 3-char uppercase prefix from an engagement name (first 3 consonants, fallback to first 3 chars). */
export function deriveDocIdPrefix(name: string): string {
  const consonants = name.split('').filter((c) => CONSONANTS.has(c))
  const base = consonants.length >= 3
    ? consonants.slice(0, 3).join('').toUpperCase()
    : name.replace(/\s+/g, '').slice(0, 3).toUpperCase()
  return base || 'DOC'
}

/**
 * Get or initialize the docIdPrefix for an engagement, then atomically increment
 * docIdSeq and return the next DOC_ID string (e.g. "NVQ-7").
 *
 * Uses a raw SQL atomic increment to avoid race conditions.
 */
export async function nextDocId(engagementId: string): Promise<string> {
  const result = await prisma.$queryRaw<Array<{ docIdSeq: number; docIdPrefix: string | null }>>`
    UPDATE platform.engagements
    SET "docIdSeq" = "docIdSeq" + 1
    WHERE id = ${engagementId}::uuid
    RETURNING "docIdSeq", "docIdPrefix"
  `

  if (!result.length) throw new Error(`Engagement ${engagementId} not found`)

  const { docIdSeq: seq, docIdPrefix: prefix } = result[0]
  return `${prefix}-${seq}`
}

/**
 * Ensure the engagement has a docIdPrefix set (idempotent).
 * Call once on engagement creation or lazily on first document insert.
 */
export async function ensureDocIdPrefix(engagementId: string, engagementName: string): Promise<string> {
  const engagement = await prisma.engagement.findUnique({
    where: { id: engagementId },
    select: { docIdPrefix: true, firmId: true },
  })
  if (!engagement) throw new Error(`Engagement ${engagementId} not found`)
  if (engagement.docIdPrefix) return engagement.docIdPrefix

  const base = deriveDocIdPrefix(engagementName)

  // Check for prefix collisions within the same firm
  const existing = await prisma.engagement.findMany({
    where: { firmId: engagement.firmId, docIdPrefix: { startsWith: base } },
    select: { docIdPrefix: true },
  })

  const usedPrefixes = new Set(existing.map((e) => e.docIdPrefix))
  let prefix = base
  let suffix = 2
  while (usedPrefixes.has(prefix)) {
    prefix = `${base}${suffix}`
    suffix++
  }

  await prisma.engagement.update({
    where: { id: engagementId },
    data: { docIdPrefix: prefix },
  })

  return prefix
}

/**
 * Assign a docId to a document atomically. Initializes the engagement prefix first if needed.
 * Returns the assigned docId string.
 */
export async function assignDocId(documentId: string, engagementId: string, engagementName: string): Promise<string> {
  await ensureDocIdPrefix(engagementId, engagementName)
  const docId = await nextDocId(engagementId)
  await prisma.engagementDocument.update({
    where: { id: documentId },
    data: { docId },
  })
  return docId
}
