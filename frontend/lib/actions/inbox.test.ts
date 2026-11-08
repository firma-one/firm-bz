import { describe, it, expect, vi, beforeEach } from 'vitest'

const { auth, reminders, work } = vi.hoisted(() => ({
    auth: { user: { id: 'u1' } as { id: string } | null },
    reminders: { list: [] as any[] },
    work: { needsYou: [] as any[] },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
vi.mock('next/navigation', () => ({ unstable_rethrow: vi.fn() }))
vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: auth.user } }) } }),
}))
vi.mock('@/lib/reminders/reminder-service', () => ({ computeDueReminders: vi.fn(async () => reminders.list) }))
vi.mock('@/lib/home/home-firms', () => ({ getHomeFirms: vi.fn(async () => ({ firms: [{ id: 'f1' }, { id: 'f2' }], unavailable: [] })) }))
vi.mock('@/lib/home/my-work', () => ({ getMyWork: vi.fn(async () => ({ engagements: [], needsYou: work.needsYou, dueSoon: [] })) }))

import { getInboxCounts, getNeedsYou } from './inbox'
import { getMyWork } from '@/lib/home/my-work'

beforeEach(() => {
    vi.clearAllMocks()
    auth.user = { id: 'u1' }
    reminders.list = []
    work.needsYou = []
})

describe('getInboxCounts', () => {
    it('counts Home\'s Needs you per firm, from the user\'s firms and reminders', async () => {
        reminders.list = [{ id: 'r1' }]
        work.needsYou = [
            { id: 'review:a', firmId: 'f1' },
            { id: 'comment:b', firmId: 'f1' },
            { id: 'reminder:c', firmId: 'f2' },
        ]
        const counts = await getInboxCounts()
        expect(getMyWork).toHaveBeenCalledWith({ userId: 'u1', firms: [{ id: 'f1' }, { id: 'f2' }], reminders: [{ id: 'r1' }] })
        expect(counts).toEqual({ byFirm: { f1: 2, f2: 1 }, platform: 0 })
    })

    it('never counts notifications: they are updates, not things waiting on you', async () => {
        expect(await getInboxCounts()).toEqual({ byFirm: {}, platform: 0 })
    })

    it('returns nothing when signed out', async () => {
        auth.user = null
        expect(await getInboxCounts()).toEqual({ byFirm: {}, platform: 0 })
        expect(getMyWork).not.toHaveBeenCalled()
    })
})

describe('getNeedsYou', () => {
    it('returns the same items Home lists, for the signed-in user only', async () => {
        work.needsYou = [{ id: 'review:a', firmId: 'f1' }]
        expect(await getNeedsYou()).toEqual({ ok: true, data: [{ id: 'review:a', firmId: 'f1' }] })
        auth.user = null
        expect(await getNeedsYou()).toEqual({ ok: false, code: 'unauthorized', error: 'Your session has ended. Sign in again.' })
    })

    it('answers that it did not load, never an empty list, when the lookup fails (EM-1)', async () => {
        vi.mocked(getMyWork).mockRejectedValueOnce(new Error('db down'))
        expect(await getNeedsYou()).toEqual({ ok: false, code: 'internal', error: 'Something went wrong on our side. Try again.' })
    })
})

describe('getInboxCounts when the lookup fails', () => {
    it('answers no badge rather than an error on every page', async () => {
        vi.mocked(getMyWork).mockRejectedValueOnce(new Error('db down'))
        expect(await getInboxCounts()).toEqual({ byFirm: {}, platform: 0 })
    })
})
