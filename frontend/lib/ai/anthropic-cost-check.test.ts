import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The monthly check against Anthropic's bill: the cost report is paged and its amounts are cents
 * (strings or numbers), and the ledger is flagged only below 90% of the bill.
 */

const { aggregate, noticeSystemAdmins, warn } = vi.hoisted(() => ({
    aggregate: vi.fn(),
    noticeSystemAdmins: vi.fn<(notice: unknown) => Promise<void>>(async () => {}),
    warn: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn, error: vi.fn() } }))
vi.mock('@/lib/ai/spend-ceiling-notice', () => ({ noticeSystemAdmins }))
vi.mock('@/lib/prisma', () => ({ prisma: { platformAiUsage: { aggregate } } }))

import { anthropicCostCents, checkAnthropicBillAgainstLedger } from './anthropic-cost-check'
import { previousUtcMonth } from './ledger-window'

const DEC = [new Date('2026-12-01T00:00:00Z'), new Date('2027-01-01T00:00:00Z')] as const

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

/** A fake fetch that answers the given pages in order and records each URL and its headers. */
function pagedFetch(pages: unknown[]) {
    const calls: { url: URL; headers: Record<string, string> }[] = []
    const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: new URL(String(input)), headers: init?.headers as Record<string, string> })
        return json(pages[calls.length - 1])
    })
    return { fetch: fn as unknown as typeof fetch, calls }
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('ANTHROPIC_ADMIN_KEY', 'sk-ant-admin-test')
})
afterEach(() => vi.unstubAllEnvs())

describe('anthropicCostCents', () => {
    it('follows next_page while has_more and sums cents from strings and numbers', async () => {
        const { fetch, calls } = pagedFetch([
            {
                data: [
                    { starting_at: '2026-12-01T00:00:00Z', ending_at: '2026-12-02T00:00:00Z', results: [{ amount: '123.45', currency: 'USD' }, { amount: 10, currency: 'USD' }] },
                ],
                has_more: true,
                next_page: 'page-2',
            },
            {
                data: [
                    { starting_at: '2026-12-02T00:00:00Z', ending_at: '2026-12-03T00:00:00Z', results: [{ amount: '0.55', currency: 'USD' }] },
                    { starting_at: '2026-12-03T00:00:00Z', ending_at: '2026-12-04T00:00:00Z', results: [] },
                ],
                has_more: false,
                next_page: null,
            },
        ])

        const cents = await anthropicCostCents(DEC[0], DEC[1], fetch)

        expect(cents).toBeCloseTo(134, 6)
        expect(calls).toHaveLength(2)
        expect(calls[0].url.origin + calls[0].url.pathname).toBe('https://api.anthropic.com/v1/organizations/cost_report')
        expect(calls[0].url.searchParams.get('starting_at')).toBe('2026-12-01T00:00:00.000Z')
        expect(calls[0].url.searchParams.get('ending_at')).toBe('2027-01-01T00:00:00.000Z')
        expect(calls[0].url.searchParams.get('page')).toBeNull()
        expect(calls[1].url.searchParams.get('page')).toBe('page-2')
        expect(calls[0].headers['x-api-key']).toBe('sk-ant-admin-test')
        expect(calls[0].headers['anthropic-version']).toBe('2023-06-01')
    })

    it('skips non-USD and unreadable amounts with a warning', async () => {
        const { fetch } = pagedFetch([
            { data: [{ starting_at: 'x', results: [{ amount: '50', currency: 'EUR' }, { amount: 'n/a', currency: 'USD' }, { amount: '7.5', currency: 'USD' }] }], has_more: false },
        ])
        expect(await anthropicCostCents(DEC[0], DEC[1], fetch)).toBe(7.5)
        expect(warn).toHaveBeenCalledTimes(2)
    })

    it('throws when the report answers an error', async () => {
        const fetch = vi.fn(async () => new Response('forbidden', { status: 403 })) as unknown as typeof globalThis.fetch
        await expect(anthropicCostCents(DEC[0], DEC[1], fetch)).rejects.toThrow('403')
    })
})

describe('checkAnthropicBillAgainstLedger', () => {
    /** Anthropic charged $10.00 (1,000 cents). */
    const bill = () => pagedFetch([{ data: [{ starting_at: 'x', results: [{ amount: '1000', currency: 'USD' }] }], has_more: false }]).fetch

    it('flags a ledger under 90% of the bill', async () => {
        aggregate.mockResolvedValueOnce({ _sum: { costMicros: 8_900_000 } }) // $8.90
        const result = await checkAnthropicBillAgainstLedger(DEC[0], DEC[1], bill())

        expect(result).toMatchObject({ anthropicCents: 1000, ledgerCents: 890, flagged: true })
        expect(noticeSystemAdmins).toHaveBeenCalledTimes(1)
        const notice = noticeSystemAdmins.mock.calls[0][0] as { body: string; dedupeKey: string }
        expect(notice.body).toContain('ledger $8.90 vs Anthropic $10.00 for December 2026')
        expect(notice.dedupeKey).toBe('ai-usage-anthropic-check:2026-12')
    })

    it('stays quiet at 90% or more', async () => {
        aggregate.mockResolvedValueOnce({ _sum: { costMicros: 9_000_000 } }) // $9.00, exactly 90%
        const result = await checkAnthropicBillAgainstLedger(DEC[0], DEC[1], bill())
        expect(result.flagged).toBe(false)
        expect(noticeSystemAdmins).not.toHaveBeenCalled()
    })

    it('skips without an admin key', async () => {
        vi.stubEnv('ANTHROPIC_ADMIN_KEY', '')
        const fetch = vi.fn() as unknown as typeof globalThis.fetch
        const result = await checkAnthropicBillAgainstLedger(DEC[0], DEC[1], fetch)
        expect(result.skipped).toBe('no_admin_key')
        expect(fetch).not.toHaveBeenCalled()
    })

    it('reads both sides from the start of metering by tokens in its first month', async () => {
        aggregate.mockResolvedValueOnce({ _sum: { costMicros: 10_000_000 } })
        const { fetch, calls } = pagedFetch([{ data: [], has_more: false }])
        await checkAnthropicBillAgainstLedger(new Date('2026-11-01T00:00:00Z'), new Date('2026-12-01T00:00:00Z'), fetch)
        expect(calls[0].url.searchParams.get('starting_at')).toBe('2026-11-19T00:00:00.000Z')
        expect(aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { createdAt: { gte: new Date('2026-11-19T00:00:00Z'), lt: new Date('2026-12-01T00:00:00Z') } } }))
    })
})

describe('previousUtcMonth', () => {
    it('is the calendar month before, in UTC, across a year end', () => {
        expect(previousUtcMonth(new Date('2027-01-02T08:30:00Z'))).toEqual({
            start: new Date('2026-12-01T00:00:00Z'),
            end: new Date('2027-01-01T00:00:00Z'),
        })
    })
})
