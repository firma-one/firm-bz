import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MyWork } from '@/lib/home/my-work'

/**
 * Your day's route, with the real day-brief module behind it: only the session, the database, the
 * Home loaders and the model are stand-ins. Nothing reaches Anthropic.
 */

const { who, store, data, create, recordAiUsage, cfg, personLimit } = vi.hoisted(() => ({
    who: { user: { id: 'u1' } as { id: string } | null },
    store: { dayBrief: null as unknown, timezone: 'Europe/London' },
    data: {
        work: null as unknown as MyWork,
        failReminders: false,
    },
    create: vi.fn(),
    recordAiUsage: vi.fn(async () => {}),
    cfg: { configured: true },
    personLimit: vi.fn(async (_p: { userId?: string | null; feature: string }) => {}),
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: who.user } }) } }),
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        userPersonalization: {
            findUnique: vi.fn(async () => ({ dayBrief: store.dayBrief })),
            upsert: vi.fn(async ({ update }: { update: { dayBrief: unknown } }) => {
                store.dayBrief = update.dayBrief
                return {}
            }),
            updateMany: vi.fn(async () => {
                store.dayBrief = null
                return { count: 1 }
            }),
        },
        engagementDocument: { findMany: vi.fn(async () => [{ id: '11111111-1111-4111-8111-111111111111', docId: 'QSR-9' }]) },
    },
}))
vi.mock('@/lib/notification-prefs', () => ({
    getUserNotificationPrefs: async () => ({ timezone: store.timezone, remindersDigest: { lastNotifiedDate: null } }),
}))
vi.mock('@/lib/home/home-firms', () => ({
    getHomeFirms: async () => ({ firms: [{ id: 'f1', name: 'Halden', slug: 'halden', groupSlug: 'g' }], unavailable: [] }),
}))
vi.mock('@/lib/home/my-work', () => ({ getMyWork: async () => data.work }))
vi.mock('@/lib/calendar/calendar-data', () => ({ loadCalendarData: async () => ({ engagements: [], events: [] }) }))
vi.mock('@/lib/reminders/reminder-service', () => ({
    computeDueReminders: async () => {
        if (data.failReminders) throw new Error('db down')
        return []
    },
}))
vi.mock('@/lib/ai/client', () => ({
    isAiConfigured: () => cfg.configured,
    AI_MODEL: 'claude-haiku-5-5',
    AI_EFFORT: { dayBrief: 'low' },
    getAnthropic: () => (cfg.configured ? { messages: { create } } : null),
    extractText: (m: { content: { type: string; text?: string }[] }) =>
        m.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim(),
}))
vi.mock('@/lib/ai/credit-cap', () => ({ assertWithinAiCreditCap: vi.fn(async () => {}), AiCreditLimitError: class extends Error {} }))
vi.mock('@/lib/ai/usage', () => ({ recordAiUsage }))
vi.mock('@/lib/ai/person-limit', () => ({ assertWithinPersonLimits: personLimit }))

import { GET, POST } from './route'
import { AiCreditLimitError } from '@/lib/ai/credit-cap'

/** Home's request, with the firm selected in its sidebar when given. */
const req = (firm?: string) => new Request(`http://localhost/api/me/day-brief${firm ? `?firm=${firm}` : ''}`)

const DOC = '11111111-1111-4111-8111-111111111111'

const oneThread: MyWork = {
    engagements: [],
    needsYou: [{
        id: `comment:${DOC}`, kind: 'client_comment', firmId: 'f1', title: 'Market & Competitive Intelligence Report',
        context: 'Contoso · Q4 Strategy', href: '/c', actionLabel: 'Reply', at: '2026-11-09T10:00:00Z',
    }],
    dueSoon: [],
}

const reply = (stop_reason = 'end_turn') => ({
    content: [{ type: 'text', text: '**One client thread has waited since Monday**: QSR-9 · Market & Competitive Intelligence Report.' }],
    stop_reason,
    usage: { input_tokens: 800, output_tokens: 120 },
})

const json = async (res: Response) => ({ status: res.status, body: await res.json() })

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-12T08:00:00Z'))
    who.user = { id: 'u1' }
    personLimit.mockClear()
    store.dayBrief = null
    store.timezone = 'Europe/London'
    data.work = oneThread
    data.failReminders = false
    cfg.configured = true
    create.mockReset()
    create.mockResolvedValue(reply())
    recordAiUsage.mockClear()
})

afterEach(() => {
    vi.useRealTimers()
})

describe('/api/me/day-brief', () => {
    it('answers 401 without a session, and reads nothing', async () => {
        who.user = null
        expect((await GET(req())).status).toBe(401)
        expect((await POST(req())).status).toBe(401)
        expect(create).not.toHaveBeenCalled()
    })

    it('writes the first brief of the day, saves it for the day, and records a free dayBrief row', async () => {
        const { status, body } = await json(await GET(req()))
        expect(status).toBe(200)
        expect(body.brief).toMatchObject({ date: '2026-11-12', text: expect.stringContaining('QSR-9 · Market') })
        expect(body.brief).not.toHaveProperty('fingerprint')
        expect(create).toHaveBeenCalledTimes(1)
        expect(store.dayBrief).toMatchObject({ date: '2026-11-12', fingerprint: expect.any(String) })
        expect(recordAiUsage).toHaveBeenCalledWith(expect.objectContaining({ feature: 'dayBrief', firmId: 'f1', userId: 'u1' }))
        // What the model was given: this person's item, by DOC-ID, as data.
        expect(create.mock.calls[0][0].messages[0].content).toContain('QSR-9 · "Market & Competitive Intelligence Report"')
    })

    it('serves the same day from the cache, with no model call', async () => {
        await GET(req())
        vi.setSystemTime(new Date('2026-11-12T16:00:00Z'))
        const { body } = await json(await GET(req()))
        expect(body.brief.text).toContain('QSR-9')
        expect(create).toHaveBeenCalledTimes(1)
    })

    it('writes a new one when the person\'s local day has changed', async () => {
        await GET(req())
        // 00:30 in Kolkata on the 13th is still the 12th in UTC: the person's day decides.
        store.timezone = 'Asia/Kolkata'
        vi.setSystemTime(new Date('2026-11-12T19:00:00Z'))
        const { body } = await json(await GET(req()))
        expect(body.brief.date).toBe('2026-11-13')
        expect(create).toHaveBeenCalledTimes(2)
    })

    it('Rewrite with nothing changed answers today\'s brief, unchanged, with no model call', async () => {
        await GET(req())
        const { body } = await json(await POST(req()))
        expect(body).toMatchObject({ unchanged: true, brief: { date: '2026-11-12' } })
        expect(create).toHaveBeenCalledTimes(1)
    })

    it('Rewrite after a change writes a new brief, for a credit, within the person\'s limits', async () => {
        await GET(req())
        expect(personLimit).toHaveBeenLastCalledWith({ userId: 'u1', feature: 'dayBrief' })
        data.work = { ...oneThread, needsYou: [...oneThread.needsYou, { ...oneThread.needsYou[0], id: 'review:x', kind: 'deliverable_review', title: 'Pricing' }] }
        const { body } = await json(await POST(req()))
        expect(body.unchanged).toBeUndefined()
        expect(create).toHaveBeenCalledTimes(2)
        // The morning brief is free; a rewrite is a choice, so it is its own, charged, feature.
        expect(personLimit).toHaveBeenLastCalledWith({ userId: 'u1', feature: 'dayBriefRewrite' })
        expect(recordAiUsage).toHaveBeenLastCalledWith(expect.objectContaining({ feature: 'dayBriefRewrite', userId: 'u1' }))
    })

    it("bills the firm selected in Home's sidebar when the person is in it, and ignores one they aren't", async () => {
        await GET(req('f1'))
        expect(recordAiUsage).toHaveBeenLastCalledWith(expect.objectContaining({ firmId: 'f1' }))
        data.work = { ...oneThread, needsYou: [...oneThread.needsYou, { ...oneThread.needsYou[0], id: 'review:x', kind: 'deliverable_review', title: 'Pricing' }] }
        await POST(req('someone-elses-firm'))
        expect(recordAiUsage).toHaveBeenLastCalledWith(expect.objectContaining({ feature: 'dayBriefRewrite', firmId: 'f1' }))
    })

    it('Rewrite with no brief today yet writes the day\'s first, free', async () => {
        const { body } = await json(await POST(req()))
        expect(body.brief).toMatchObject({ date: '2026-11-12' })
        expect(recordAiUsage).toHaveBeenLastCalledWith(expect.objectContaining({ feature: 'dayBrief' }))
    })

    it('Rewrite over the day\'s limit answers 429 in the limit\'s words, and keeps today\'s brief', async () => {
        await GET(req())
        const saved = store.dayBrief
        data.work = { ...oneThread, needsYou: [...oneThread.needsYou, { ...oneThread.needsYou[0], id: 'review:x', kind: 'deliverable_review', title: 'Pricing' }] }
        personLimit.mockRejectedValueOnce(new AiCreditLimitError("You've rewritten Your day 4 times today, the most for one day.", 'person', 4, 4))
        const { status, body } = await json(await POST(req()))
        expect(status).toBe(429)
        expect(body.error).toBe("You've rewritten Your day 4 times today, the most for one day.")
        expect(create).toHaveBeenCalledTimes(1)
        expect(store.dayBrief).toBe(saved)
    })

    it('with nothing to brief, answers empty and never calls the model', async () => {
        data.work = { engagements: [], needsYou: [], dueSoon: [] }
        const { body } = await json(await GET(req()))
        expect(body).toEqual({ brief: null, empty: true })
        expect(create).not.toHaveBeenCalled()
        expect(store.dayBrief).toBeNull()
    })

    it('drops today\'s brief once everything in it is dealt with', async () => {
        await GET(req())
        data.work = { engagements: [], needsYou: [], dueSoon: [] }
        const { body } = await json(await POST(req()))
        expect(body).toEqual({ brief: null, empty: true })
        expect(store.dayBrief).toBeNull()
        expect(create).toHaveBeenCalledTimes(1)
    })

    it('a refusal reads as Brio\'s failure words, and nothing is saved', async () => {
        create.mockResolvedValue(reply('refusal'))
        const { status, body } = await json(await GET(req()))
        expect(status).toBe(500)
        expect(body.error).toBe("Brio couldn't write your day. Try again.")
        expect(store.dayBrief).toBeNull()
    })

    it('a provider error reads as Brio\'s failure words, never its own text', async () => {
        create.mockRejectedValue(new Error('529 overloaded_error'))
        const { status, body } = await json(await GET(req()))
        expect(status).toBe(500)
        expect(body.error).toBe("Brio couldn't write your day. Try again.")
    })

    it('when Home\'s data does not load, says so and writes nothing', async () => {
        data.failReminders = true
        const { status, body } = await json(await GET(req()))
        expect(status).toBe(502)
        expect(body.error).toBe("Brio couldn't read the data it works from. Try again.")
        expect(create).not.toHaveBeenCalled()
    })

    it('with no model configured, Home leaves the card out', async () => {
        cfg.configured = false
        const { body } = await json(await GET(req()))
        expect(body).toEqual({ brief: null, available: false })
    })
})
