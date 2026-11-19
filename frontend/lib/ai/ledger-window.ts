/**
 * Time windows for the monthly AI usage checks (.claude/plans/ai-metering-by-tokens.md, steps 3 and 8).
 *
 * Rows from before metering by tokens carry no cost (costMicros 0) and were never meant for Polar, so
 * every check clips its window to start no earlier than {@link METERED_BY_TOKENS_FROM}.
 */

/** The first moment the ledger records a cost per call and rows go to Polar. A UTC midnight. */
export const METERED_BY_TOKENS_FROM = new Date('2026-11-19T00:00:00Z')

/** The calendar month (UTC) before the one `now` falls in, as `[start, end)`. */
export function previousUtcMonth(now: Date = new Date()): { start: Date; end: Date } {
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1))
    return { start, end }
}

/** "November 2026" for the month a window starts in. */
export function utcMonthLabel(start: Date): string {
    return start.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** `[start, end)` clipped to the metered era, or null when the whole window predates it. */
export function clipToMeteredEra(start: Date, end: Date): { start: Date; end: Date } | null {
    const from = start < METERED_BY_TOKENS_FROM ? METERED_BY_TOKENS_FROM : start
    return from < end ? { start: from, end } : null
}
