import 'server-only'
import type { Polar } from '@polar-sh/sdk'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { createPolarClient } from '@/lib/billing/polar-client'
import { noticeSystemAdmins } from '@/lib/ai/spend-ceiling-notice'
import { clipToMeteredEra, METERED_BY_TOKENS_FROM, utcMonthLabel } from '@/lib/ai/ledger-window'

/**
 * Sends the AI usage ledger to Polar as usage events (.claude/plans/ai-metering-by-tokens.md, step 3).
 *
 * The ledger (`PlatformAiUsage`) stays the source of truth: credit enforcement and the spend ceiling
 * read it. Polar gets a copy, one event per row, for its meter, the Meter Credits benefit, invoices and
 * the Customer Portal. Each event's `externalId` is the row id, so a resend after a partial failure is
 * reported back as a duplicate and never counts twice.
 *
 * Off until `POLAR_AI_EVENTS=true`, so nothing is sent before the meter exists in Polar.
 */

/** Rows from before metering by tokens are never sent. */
export const POLAR_AI_EVENTS_FROM = METERED_BY_TOKENS_FROM

/** The event name the Polar meter filters on. */
export const POLAR_AI_EVENT_NAME = 'ai_usage'

/** Rows read per run (the cron runs every 10 minutes) and events per ingest call. */
const SYNC_LIMIT = 500
const INGEST_BATCH = 100

/** A row unsent this long after its call means the sync is stuck. */
const UNSENT_ALERT_AFTER_MS = 60 * 60 * 1000

/** Reconciliation tolerance: a group is flagged only past both. */
const TOLERANCE_CREDITS = 1
const TOLERANCE_SHARE = 0.01

/** Groups named in a mismatch notice. */
const WORST_GROUPS_SHOWN = 5

type SkipReason = 'disabled' | 'not_configured' | 'no_meter'

/** The Polar client for AI usage events, or why there is none. */
function polarForAiEvents(): { polar: Polar } | { skipped: SkipReason } {
    if (process.env.POLAR_AI_EVENTS !== 'true') return { skipped: 'disabled' }
    const token = process.env.POLAR_ACCESS_TOKEN?.trim()
    if (!token) return { skipped: 'not_configured' }
    return { polar: createPolarClient(token) }
}

function logSkip(job: string, reason: SkipReason): void {
    if (reason === 'disabled') {
        logger.info(`[polar-ai-usage] ${job} skipped: POLAR_AI_EVENTS is not 'true'`)
    } else if (reason === 'not_configured') {
        logger.warn(`[polar-ai-usage] ${job} skipped: POLAR_AI_EVENTS is on but POLAR_ACCESS_TOKEN is missing`)
    } else {
        logger.warn(`[polar-ai-usage] ${job} skipped: POLAR_AI_CREDITS_METER_ID is not set`)
    }
}

/** Prisma's Decimal (or a plain number in tests) as a number. */
function toNumber(value: unknown): number {
    const n = Number(typeof value === 'object' && value !== null ? String(value) : value)
    return Number.isFinite(n) ? n : 0
}

export type AiUsageSyncResult = { sent: number; duplicates: number; failed: number; skipped?: SkipReason }

/**
 * Sends up to {@link SYNC_LIMIT} unsent ledger rows to Polar, oldest first, {@link INGEST_BATCH} per
 * call. A batch Polar accepts is marked sent; a batch that fails stays unsent for the next run.
 * Never throws for a Polar failure (it's logged and counted); a database failure does throw, so the
 * cron run shows it.
 */
export async function syncAiUsageToPolar(): Promise<AiUsageSyncResult> {
    const client = polarForAiEvents()
    if ('skipped' in client) {
        logSkip('Sync', client.skipped)
        return { sent: 0, duplicates: 0, failed: 0, skipped: client.skipped }
    }
    const { polar } = client

    const rows = await prisma.platformAiUsage.findMany({
        where: { polarSentAt: null, createdAt: { gte: POLAR_AI_EVENTS_FROM } },
        orderBy: { createdAt: 'asc' },
        take: SYNC_LIMIT,
        select: {
            id: true,
            groupId: true,
            createdAt: true,
            feature: true,
            model: true,
            status: true,
            inputTokens: true,
            outputTokens: true,
            credits: true,
            costMicros: true,
            estimated: true,
        },
    })

    const result: AiUsageSyncResult = { sent: 0, duplicates: 0, failed: 0 }
    for (let i = 0; i < rows.length; i += INGEST_BATCH) {
        const batch = rows.slice(i, i + INGEST_BATCH)
        try {
            const response = await polar.events.ingest({
                events: batch.map((row) => ({
                    name: POLAR_AI_EVENT_NAME,
                    externalCustomerId: row.groupId,
                    externalId: row.id,
                    timestamp: row.createdAt,
                    metadata: {
                        credits: toNumber(row.credits),
                        cost_micros: row.costMicros,
                        feature: row.feature,
                        status: row.status,
                        model: row.model,
                        input_tokens: row.inputTokens,
                        output_tokens: row.outputTokens,
                        estimated: row.estimated,
                    },
                })),
            })
            // Duplicates were sent by an earlier run whose marking failed: they're in Polar, so mark them too.
            await prisma.platformAiUsage.updateMany({
                where: { id: { in: batch.map((row) => row.id) }, polarSentAt: null },
                data: { polarSentAt: new Date() },
            })
            result.sent += response.inserted
            result.duplicates += response.duplicates
        } catch (error) {
            result.failed += batch.length
            logger.error(
                `[polar-ai-usage] Sending ${batch.length} AI usage events to Polar failed; they stay unsent and the next run retries`,
                error instanceof Error ? error : new Error(String(error)),
            )
        }
    }

    if (rows.length > 0) logger.info('[polar-ai-usage] Sync finished', { ...result, rows: rows.length })
    return result
}

export type GroupMismatch = { groupId: string; ledgerCredits: number; polarCredits: number }

export type AiUsageReconcileResult = {
    groups: number
    mismatched: GroupMismatch[]
    unreadable: string[]
    unsentOverAnHour: number
    skipped?: SkipReason
}

/** True when the two totals differ by more than 1 credit and by more than 1%. */
export function creditsDiffer(ledger: number, polar: number): boolean {
    const gap = Math.abs(ledger - polar)
    return gap > TOLERANCE_CREDITS && gap > TOLERANCE_SHARE * Math.max(Math.abs(ledger), Math.abs(polar))
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))

/**
 * Compares, per billing group, the ledger's credits for `[monthStart, monthEnd)` with what Polar's
 * AI credits meter counted for that customer over the same window, and tells the system admins about
 * groups that differ past the tolerance. Also tells them when rows older than an hour are still unsent
 * (the sync is stuck or failing).
 *
 * Polar's window total comes from the meter's quantities endpoint, filtered to the customer, rather
 * than the customer meter's consumed units, which cover the current cycle only. Groups that exist
 * only in Polar (no ledger rows) aren't looked up: the ledger is where every call starts.
 */
export async function reconcileAiUsageWithPolar(monthStart: Date, monthEnd: Date): Promise<AiUsageReconcileResult> {
    const skipped = (reason: SkipReason): AiUsageReconcileResult => {
        logSkip('Reconciliation', reason)
        return { groups: 0, mismatched: [], unreadable: [], unsentOverAnHour: 0, skipped: reason }
    }
    const client = polarForAiEvents()
    if ('skipped' in client) return skipped(client.skipped)
    const meterId = process.env.POLAR_AI_CREDITS_METER_ID?.trim()
    if (!meterId) return skipped('no_meter')
    const { polar } = client
    const month = utcMonthLabel(monthStart)
    const monthKey = monthStart.toISOString().slice(0, 7)

    const unsentOverAnHour = await prisma.platformAiUsage.count({
        where: {
            polarSentAt: null,
            createdAt: { gte: POLAR_AI_EVENTS_FROM, lt: new Date(Date.now() - UNSENT_ALERT_AFTER_MS) },
        },
    })
    if (unsentOverAnHour > 0) {
        await noticeSystemAdmins({
            title: 'AI usage is not reaching Polar',
            body: `${unsentOverAnHour} AI usage ${unsentOverAnHour === 1 ? 'record is' : 'records are'} more than an hour old and still not sent to Polar. Check the Polar AI usage sync in Inngest and the logs.`,
            dedupeKey: `ai-usage-polar-unsent:${monthKey}`,
            metadata: { unsentOverAnHour },
        })
    }

    const window = clipToMeteredEra(monthStart, monthEnd)
    if (!window) return { groups: 0, mismatched: [], unreadable: [], unsentOverAnHour }

    const ledger = await prisma.platformAiUsage.groupBy({
        by: ['groupId'],
        where: { createdAt: { gte: window.start, lt: window.end } },
        _sum: { credits: true },
    })

    const mismatched: GroupMismatch[] = []
    const unreadable: string[] = []
    for (const row of ledger) {
        const ledgerCredits = toNumber(row._sum.credits)
        let polarCredits: number
        try {
            const quantities = await polar.meters.quantities({
                id: meterId,
                startTimestamp: window.start,
                endTimestamp: window.end,
                interval: 'day',
                timezone: 'UTC',
                externalCustomerId: row.groupId,
            })
            polarCredits = toNumber(quantities.total)
        } catch (error) {
            unreadable.push(row.groupId)
            logger.error(
                `[polar-ai-usage] Reading Polar's AI credits for group ${row.groupId} failed`,
                error instanceof Error ? error : new Error(String(error)),
            )
            continue
        }
        if (creditsDiffer(ledgerCredits, polarCredits)) {
            mismatched.push({ groupId: row.groupId, ledgerCredits, polarCredits })
        }
    }

    if (mismatched.length > 0 || unreadable.length > 0) {
        const worst = [...mismatched]
            .sort((a, b) => Math.abs(b.ledgerCredits - b.polarCredits) - Math.abs(a.ledgerCredits - a.polarCredits))
            .slice(0, WORST_GROUPS_SHOWN)
        const parts: string[] = []
        if (mismatched.length > 0) {
            parts.push(
                `${mismatched.length} of ${ledger.length} groups have different AI credit totals in the ledger and in Polar for ${month}. ` +
                    `Largest gaps: ${worst.map((m) => `group ${m.groupId}, ledger ${fmt(m.ledgerCredits)}, Polar ${fmt(m.polarCredits)}`).join('; ')}.`,
            )
        }
        if (unreadable.length > 0) {
            parts.push(`Polar's totals couldn't be read for ${unreadable.length} ${unreadable.length === 1 ? 'group' : 'groups'}.`)
        }
        await noticeSystemAdmins({
            title: `AI credits in Polar don't match the ledger for ${month}`,
            body: parts.join(' '),
            dedupeKey: `ai-usage-polar-reconcile:${monthKey}`,
            metadata: { month: monthKey, groups: ledger.length, mismatched: worst, unreadable: unreadable.length },
        })
    }

    logger.info('[polar-ai-usage] Reconciliation finished', {
        month: monthKey,
        groups: ledger.length,
        mismatched: mismatched.length,
        unreadable: unreadable.length,
        unsentOverAnHour,
    })
    return { groups: ledger.length, mismatched, unreadable, unsentOverAnHour }
}
