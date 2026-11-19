import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * AI usage to Polar: rows go as events keyed by their own id, are marked sent only once Polar has them,
 * and nothing goes while the switch is off. The monthly reconciliation flags groups past the tolerance
 * and stays quiet within it.
 */

const { ingest, quantities, findMany, updateMany, count, groupBy, noticeSystemAdmins } = vi.hoisted(() => ({
    ingest: vi.fn(),
    quantities: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn<(args: unknown) => Promise<{ count: number }>>(async () => ({ count: 0 })),
    count: vi.fn(async () => 0),
    groupBy: vi.fn(),
    noticeSystemAdmins: vi.fn<(notice: unknown) => Promise<void>>(async () => {}),
}))

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/billing/polar-client', () => ({
    createPolarClient: () => ({ events: { ingest }, meters: { quantities } }),
}))
vi.mock('@/lib/ai/spend-ceiling-notice', () => ({ noticeSystemAdmins }))
vi.mock('@/lib/prisma', () => ({
    prisma: { platformAiUsage: { findMany, updateMany, count, groupBy } },
}))

import { syncAiUsageToPolar, reconcileAiUsageWithPolar, creditsDiffer, POLAR_AI_EVENTS_FROM } from './polar-ai-usage-sync'

const row = (n: number) => ({
    id: `row-${n}`,
    groupId: `group-${n % 2}`,
    createdAt: new Date(Date.UTC(2026, 10, 19, 12, 0, n)),
    feature: 'summary',
    model: 'claude-haiku-5-5',
    status: n % 3 === 0 ? 'cancelled' : 'ok',
    inputTokens: 1000 + n,
    outputTokens: 200,
    credits: '2.00',
    costMicros: 200 + n,
    estimated: false,
})

beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('POLAR_AI_EVENTS', 'true')
    vi.stubEnv('POLAR_ACCESS_TOKEN', 'polar_test_token')
    vi.stubEnv('POLAR_AI_CREDITS_METER_ID', 'meter-1')
})
afterEach(() => vi.unstubAllEnvs())

describe('syncAiUsageToPolar', () => {
    it('sends nothing while POLAR_AI_EVENTS is off', async () => {
        vi.stubEnv('POLAR_AI_EVENTS', '')
        const result = await syncAiUsageToPolar()
        expect(result).toEqual({ sent: 0, duplicates: 0, failed: 0, skipped: 'disabled' })
        expect(findMany).not.toHaveBeenCalled()
        expect(ingest).not.toHaveBeenCalled()
    })

    it('sends nothing when Polar has no access token', async () => {
        vi.stubEnv('POLAR_ACCESS_TOKEN', '')
        const result = await syncAiUsageToPolar()
        expect(result.skipped).toBe('not_configured')
        expect(ingest).not.toHaveBeenCalled()
    })

    it('reads only unsent rows from the metered era, oldest first', async () => {
        findMany.mockResolvedValueOnce([])
        await syncAiUsageToPolar()
        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { polarSentAt: null, createdAt: { gte: POLAR_AI_EVENTS_FROM } },
                orderBy: { createdAt: 'asc' },
                take: 500,
            }),
        )
        expect(POLAR_AI_EVENTS_FROM.toISOString()).toBe('2026-11-19T00:00:00.000Z')
    })

    it('sends events keyed by the row id, in batches of 100, and marks each batch sent', async () => {
        const rows = Array.from({ length: 250 }, (_, i) => row(i))
        findMany.mockResolvedValueOnce(rows)
        ingest.mockImplementation(async ({ events }: { events: unknown[] }) => ({ inserted: events.length, duplicates: 0 }))

        const result = await syncAiUsageToPolar()

        expect(result).toEqual({ sent: 250, duplicates: 0, failed: 0 })
        expect(ingest).toHaveBeenCalledTimes(3)
        expect(ingest.mock.calls.map(([req]) => req.events.length)).toEqual([100, 100, 50])

        const first = ingest.mock.calls[0][0].events[0]
        expect(first).toEqual({
            name: 'ai_usage',
            externalCustomerId: 'group-0',
            externalId: 'row-0',
            timestamp: rows[0].createdAt,
            metadata: {
                credits: 2,
                cost_micros: 200,
                feature: 'summary',
                status: 'cancelled',
                model: 'claude-haiku-5-5',
                input_tokens: 1000,
                output_tokens: 200,
                estimated: false,
            },
        })
        for (const value of Object.values(first.metadata)) {
            expect(['string', 'number', 'boolean']).toContain(typeof value)
        }

        expect(updateMany).toHaveBeenCalledTimes(3)
        const marked = updateMany.mock.calls[0][0] as { where: { id: { in: string[] }; polarSentAt: null }; data: { polarSentAt: Date } }
        expect(marked.where.id.in).toEqual(rows.slice(0, 100).map((r) => r.id))
        expect(marked.where.polarSentAt).toBeNull()
        expect(marked.data.polarSentAt).toBeInstanceOf(Date)
    })

    it('leaves a failed batch unsent and still sends the others', async () => {
        const rows = Array.from({ length: 150 }, (_, i) => row(i))
        findMany.mockResolvedValueOnce(rows)
        ingest
            .mockRejectedValueOnce(new Error('Polar is down'))
            .mockResolvedValueOnce({ inserted: 40, duplicates: 10 })

        const result = await syncAiUsageToPolar()

        expect(result).toEqual({ sent: 40, duplicates: 10, failed: 100 })
        expect(updateMany).toHaveBeenCalledTimes(1)
        const marked = updateMany.mock.calls[0][0] as { where: { id: { in: string[] } } }
        expect(marked.where.id.in).toEqual(rows.slice(100).map((r) => r.id))
    })
})

describe('creditsDiffer', () => {
    it('needs a gap over 1 credit and over 1%', () => {
        expect(creditsDiffer(100, 101)).toBe(false) // 1 credit: not over 1
        expect(creditsDiffer(1000, 1005)).toBe(false) // 5 credits but 0.5%
        expect(creditsDiffer(100, 98)).toBe(true) // 2 credits, 2%
        expect(creditsDiffer(0, 2)).toBe(true)
    })
})

describe('reconcileAiUsageWithPolar', () => {
    const DEC = [new Date('2026-12-01T00:00:00Z'), new Date('2027-01-01T00:00:00Z')] as const

    it('skips without a meter id', async () => {
        vi.stubEnv('POLAR_AI_CREDITS_METER_ID', '')
        const result = await reconcileAiUsageWithPolar(...DEC)
        expect(result.skipped).toBe('no_meter')
        expect(groupBy).not.toHaveBeenCalled()
        expect(noticeSystemAdmins).not.toHaveBeenCalled()
    })

    it('stays quiet when every group is within tolerance and nothing is stuck', async () => {
        groupBy.mockResolvedValueOnce([
            { groupId: 'g1', _sum: { credits: '100.00' } },
            { groupId: 'g2', _sum: { credits: '1000.00' } },
        ])
        quantities.mockImplementation(async ({ externalCustomerId }: { externalCustomerId: string }) =>
            ({ quantities: [], total: externalCustomerId === 'g1' ? 101 : 1005 }),
        )

        const result = await reconcileAiUsageWithPolar(...DEC)

        expect(result).toEqual({ groups: 2, mismatched: [], unreadable: [], unsentOverAnHour: 0 })
        expect(noticeSystemAdmins).not.toHaveBeenCalled()
        expect(quantities).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'meter-1', externalCustomerId: 'g1', startTimestamp: DEC[0], endTimestamp: DEC[1] }),
        )
    })

    it('flags a group past tolerance and names it', async () => {
        groupBy.mockResolvedValueOnce([
            { groupId: 'g1', _sum: { credits: '100.00' } },
            { groupId: 'g2', _sum: { credits: '50.00' } },
        ])
        quantities.mockImplementation(async ({ externalCustomerId }: { externalCustomerId: string }) =>
            ({ quantities: [], total: externalCustomerId === 'g1' ? 100 : 40 }),
        )

        const result = await reconcileAiUsageWithPolar(...DEC)

        expect(result.mismatched).toEqual([{ groupId: 'g2', ledgerCredits: 50, polarCredits: 40 }])
        expect(noticeSystemAdmins).toHaveBeenCalledTimes(1)
        const notice = noticeSystemAdmins.mock.calls[0][0] as { title: string; body: string; dedupeKey: string }
        expect(notice.title).toContain('December 2026')
        expect(notice.body).toContain('1 of 2 groups')
        expect(notice.body).toContain('group g2, ledger 50, Polar 40')
        expect(notice.dedupeKey).toBe('ai-usage-polar-reconcile:2026-12')
    })

    it('tells the admins when rows are stuck unsent for over an hour', async () => {
        count.mockResolvedValueOnce(7)
        groupBy.mockResolvedValueOnce([])

        const result = await reconcileAiUsageWithPolar(...DEC)

        expect(result.unsentOverAnHour).toBe(7)
        expect(noticeSystemAdmins).toHaveBeenCalledWith(expect.objectContaining({ title: 'AI usage is not reaching Polar' }))
    })

    it('clips a month that starts before metering by tokens', async () => {
        groupBy.mockResolvedValueOnce([])
        await reconcileAiUsageWithPolar(new Date('2026-11-01T00:00:00Z'), new Date('2026-12-01T00:00:00Z'))
        expect(groupBy).toHaveBeenCalledWith(
            expect.objectContaining({ where: { createdAt: { gte: POLAR_AI_EVENTS_FROM, lt: new Date('2026-12-01T00:00:00Z') } } }),
        )
    })
})
