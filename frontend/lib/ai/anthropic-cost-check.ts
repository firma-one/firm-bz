import 'server-only'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { noticeSystemAdmins } from '@/lib/ai/spend-ceiling-notice'
import { clipToMeteredEra, utcMonthLabel } from '@/lib/ai/ledger-window'

/**
 * Monthly check of the AI usage ledger against Anthropic's own bill
 * (.claude/plans/ai-metering-by-tokens.md, step 8). If the ledger covers clearly less than what
 * Anthropic charged, some model calls are running unmetered.
 *
 * Reads Anthropic's legacy Admin API cost report with raw `fetch`: the installed `@anthropic-ai/sdk`
 * has no binding for it, and Anthropic documents the legacy reports as raw HTTP only. Needs an Admin
 * API key (`ANTHROPIC_ADMIN_KEY`, sk-ant-admin...), not the regular API key.
 */

const COST_REPORT_URL = 'https://api.anthropic.com/v1/organizations/cost_report'

/** Generic client name: no personal or project details go to outside services. */
const USER_AGENT = 'usage-cost-check/1.0'

/** A ledger below this share of Anthropic's bill is flagged. */
export const LEDGER_COVERAGE_THRESHOLD = 0.9

/** Guard against a report that never stops paging. */
const MAX_PAGES = 100

type CostReportPage = {
    data?: Array<{ starting_at?: string; ending_at?: string; results?: Array<{ amount?: unknown; currency?: unknown }> }>
    has_more?: boolean
    next_page?: string | null
}

/** An amount from the report ("123.45" or 123.45, in US cents), or null when it isn't a number. */
function parseCents(amount: unknown): number | null {
    if (typeof amount === 'number') return Number.isFinite(amount) ? amount : null
    if (typeof amount === 'string' && amount.trim() !== '') {
        const n = Number(amount)
        return Number.isFinite(n) ? n : null
    }
    return null
}

/**
 * The organization's total cost on Anthropic for `[start, end)`, in US cents, summed over the cost
 * report's daily buckets and every page. Throws when the report can't be read (the cron run shows it).
 */
export async function anthropicCostCents(start: Date, end: Date, fetchImpl: typeof fetch = fetch): Promise<number> {
    const key = process.env.ANTHROPIC_ADMIN_KEY?.trim()
    if (!key) throw new Error('ANTHROPIC_ADMIN_KEY is not set')

    let totalCents = 0
    let page: string | null = null
    for (let pages = 0; pages < MAX_PAGES; pages++) {
        const params = new URLSearchParams({
            starting_at: start.toISOString(),
            ending_at: end.toISOString(),
            bucket_width: '1d',
        })
        if (page) params.set('page', page)
        const response = await fetchImpl(`${COST_REPORT_URL}?${params.toString()}`, {
            headers: {
                'x-api-key': key,
                'anthropic-version': '2023-06-01',
                'User-Agent': USER_AGENT,
            },
        })
        if (!response.ok) {
            const detail = await response.text().catch(() => '')
            throw new Error(`Anthropic cost report answered ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`)
        }
        const body = (await response.json()) as CostReportPage
        for (const bucket of body.data ?? []) {
            for (const result of bucket.results ?? []) {
                const currency = typeof result.currency === 'string' ? result.currency.toUpperCase() : 'USD'
                if (currency !== 'USD') {
                    logger.warn(`[anthropic-cost-check] Skipped a ${String(result.currency)} amount in the cost report (bucket ${bucket.starting_at ?? '?'})`)
                    continue
                }
                const cents = parseCents(result.amount)
                if (cents === null) {
                    logger.warn(`[anthropic-cost-check] Skipped an unreadable amount in the cost report (bucket ${bucket.starting_at ?? '?'})`)
                    continue
                }
                totalCents += cents
            }
        }
        if (!body.has_more || !body.next_page) return totalCents
        page = body.next_page
    }
    throw new Error(`Anthropic cost report still had more pages after ${MAX_PAGES}`)
}

export type AnthropicBillCheck = {
    anthropicCents: number
    ledgerCents: number
    /** Ledger ÷ Anthropic, or null when Anthropic charged nothing. */
    coverage: number | null
    flagged: boolean
    skipped?: 'no_admin_key' | 'before_metering'
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`

/**
 * Compares Anthropic's bill for `[monthStart, monthEnd)` with the ledger's total cost (all groups)
 * over the same window, and tells the system admins when the ledger covers less than
 * {@link LEDGER_COVERAGE_THRESHOLD} of it.
 *
 * The same API key may also serve development and local use, whose calls are billed by Anthropic
 * but write to a different ledger (or none), so part of a gap can be dev traffic rather than an
 * unmetered production path. The window starts no earlier than metering by tokens, since older rows
 * carry no cost.
 */
export async function checkAnthropicBillAgainstLedger(monthStart: Date, monthEnd: Date, fetchImpl: typeof fetch = fetch): Promise<AnthropicBillCheck> {
    if (!process.env.ANTHROPIC_ADMIN_KEY?.trim()) {
        logger.warn('[anthropic-cost-check] Skipped: ANTHROPIC_ADMIN_KEY is not set')
        return { anthropicCents: 0, ledgerCents: 0, coverage: null, flagged: false, skipped: 'no_admin_key' }
    }
    const window = clipToMeteredEra(monthStart, monthEnd)
    if (!window) {
        logger.info('[anthropic-cost-check] Skipped: the month is before metering by tokens')
        return { anthropicCents: 0, ledgerCents: 0, coverage: null, flagged: false, skipped: 'before_metering' }
    }

    const anthropicCents = await anthropicCostCents(window.start, window.end, fetchImpl)
    const agg = await prisma.platformAiUsage.aggregate({
        where: { createdAt: { gte: window.start, lt: window.end } },
        _sum: { costMicros: true },
    })
    // 1 cent = 10,000 micro-dollars.
    const ledgerCents = (agg._sum.costMicros ?? 0) / 10_000
    const coverage = anthropicCents > 0 ? ledgerCents / anthropicCents : null
    const flagged = coverage !== null && coverage < LEDGER_COVERAGE_THRESHOLD

    const month = utcMonthLabel(monthStart)
    if (flagged) {
        await noticeSystemAdmins({
            title: "Some AI calls aren't being metered",
            body:
                `Some AI calls aren't being metered: ledger ${dollars(ledgerCents)} vs Anthropic ${dollars(anthropicCents)} for ${month}. ` +
                'The same API key may also be used in development, so part of the gap can be dev traffic.',
            dedupeKey: `ai-usage-anthropic-check:${monthStart.toISOString().slice(0, 7)}`,
            metadata: { anthropicCents, ledgerCents, coverage },
        })
    }
    logger.info('[anthropic-cost-check] Finished', { month, anthropicCents, ledgerCents, coverage, flagged })
    return { anthropicCents, ledgerCents, coverage, flagged }
}
