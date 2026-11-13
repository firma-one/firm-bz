import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Per-person limits on AI calls: calls a minute and a day across every feature, a day's cap on Your
 * day, free features included. The table is an in-memory stand-in that answers the same queries.
 */

type Row = { id: bigint; createdAt: Date; userId: string; feature: string }
type Where = { userId?: string; feature?: string; id?: { lte?: bigint }; createdAt?: { gt?: Date; lt?: Date } }

const h = vi.hoisted(() => ({
    rows: [] as Row[],
    nextId: BigInt(1),
    clock: new Date('2026-11-13T09:00:00Z'),
    failCreate: false,
    logError: vi.fn(),
}))

const matches = (r: Row, w: Where) =>
    (w.userId === undefined || r.userId === w.userId)
    && (w.feature === undefined || r.feature === w.feature)
    && (w.id?.lte === undefined || r.id <= w.id.lte)
    && (w.createdAt?.gt === undefined || r.createdAt > w.createdAt.gt)
    && (w.createdAt?.lt === undefined || r.createdAt < w.createdAt.lt)

vi.mock('@/lib/prisma', () => ({
    prisma: {
        aiCallStart: {
            create: async ({ data }: { data: { userId: string; feature: string } }) => {
                if (h.failCreate) throw new Error('relation "platform.ai_call_starts" does not exist')
                const row = { id: h.nextId, createdAt: new Date(h.clock), ...data }
                h.nextId += BigInt(1)
                h.rows.push(row)
                return { id: row.id, createdAt: row.createdAt }
            },
            count: async ({ where }: { where: Where }) => h.rows.filter((r) => matches(r, where)).length,
            delete: async ({ where }: { where: { id: bigint } }) => { h.rows = h.rows.filter((r) => r.id !== where.id) },
            deleteMany: async ({ where }: { where: Where }) => { h.rows = h.rows.filter((r) => !matches(r, where)) },
        },
    },
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: h.logError } }))
// The real error class, without credit-cap's billing imports.
vi.mock('./credit-cap', () => ({
    AiCreditLimitError: class AiCreditLimitError extends Error {
        constructor(message: string, readonly kind: string, readonly limit: number, readonly used: number) { super(message) }
    },
}))

import { assertWithinPersonLimits, PERSON_MINUTE_WORDS, personDayWords } from './person-limit'

const call = (feature: Parameters<typeof assertWithinPersonLimits>[0]['feature'] = 'chat', userId: string | null = 'u1') =>
    assertWithinPersonLimits({ userId, feature })
const later = (ms: number) => { h.clock = new Date(h.clock.getTime() + ms) }
const MIN = 60_000
const DAY = 24 * 60 * MIN

beforeEach(() => {
    h.rows = []
    h.nextId = BigInt(1)
    h.clock = new Date('2026-11-13T09:00:00Z')
    h.failCreate = false
    h.logError.mockClear()
})

describe('assertWithinPersonLimits', () => {
    it('lets 10 calls a minute through, refuses the 11th, and lets it through once the minute has passed', async () => {
        for (let i = 0; i < 10; i++) await call(i % 2 ? 'chat' : 'replyDraft')
        await expect(call()).rejects.toMatchObject({ message: PERSON_MINUTE_WORDS, kind: 'person', limit: 10, used: 10 })
        // A refused call didn't happen: it isn't counted against the next try.
        expect(h.rows).toHaveLength(10)
        later(MIN + 1)
        await expect(call()).resolves.toBeUndefined()
    })

    it('of requests sent at once, lets the first ten go and refuses the rest', async () => {
        const results = await Promise.allSettled(Array.from({ length: 12 }, () => call()))
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10)
        expect(results.slice(10).every((r) => r.status === 'rejected')).toBe(true)
    })

    it('caps a person at 200 calls in any 24 hours, across every feature', async () => {
        for (let i = 0; i < 200; i++) { await call(); later(6 * MIN) }
        await expect(call()).rejects.toMatchObject({ message: personDayWords(200), kind: 'person', limit: 200 })
        // The oldest ones age out of the rolling day.
        later(DAY - 199 * 6 * MIN)
        await expect(call()).resolves.toBeUndefined()
    })

    it("caps Your day: the day's first brief twice, rewrites four times, free or not", async () => {
        await call('dayBrief')
        await call('dayBrief')
        await expect(call('dayBrief')).rejects.toMatchObject({ message: expect.stringMatching(/^Your day has already been written twice today\./) })
        for (let i = 0; i < 4; i++) await call('dayBriefRewrite')
        await expect(call('dayBriefRewrite')).rejects.toMatchObject({
            message: "You've rewritten Your day 4 times today, the most for one day. Brio writes a new one tomorrow.",
            limit: 4,
            used: 4,
        })
        // Another feature isn't held by Your day's cap.
        await expect(call('chat')).resolves.toBeUndefined()
    })

    it('counts each person on their own', async () => {
        for (let i = 0; i < 10; i++) await call('chat', 'u1')
        await expect(call('chat', 'u2')).resolves.toBeUndefined()
    })

    it('leaves calls without a person to their own schedule (the daily RAID check)', async () => {
        await call('raidCheck', null)
        expect(h.rows).toHaveLength(0)
    })

    it('deletes a person\'s rows older than a day on their next call', async () => {
        await call()
        later(DAY + MIN)
        await call()
        expect(h.rows).toHaveLength(1)
    })

    it("lets the call go when the table can't be written, and logs it", async () => {
        h.failCreate = true
        await expect(call()).resolves.toBeUndefined()
        expect(h.logError).toHaveBeenCalledWith(expect.stringContaining("the call couldn't be recorded"), expect.any(Error))
    })
})
