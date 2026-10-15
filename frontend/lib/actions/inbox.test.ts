import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prisma, auth, reminders } = vi.hoisted(() => ({
    prisma: { notification: { groupBy: vi.fn() } },
    auth: { user: { id: 'u1' } as { id: string } | null },
    reminders: { list: [] as any[] },
}))
vi.mock('@/lib/prisma', () => ({ prisma }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: auth.user } }) } }),
}))
vi.mock('@/lib/actions/user-reminders', () => ({ computeDueReminders: vi.fn(async () => reminders.list) }))

import { getInboxCounts } from './inbox'
import { computeDueReminders } from '@/lib/actions/user-reminders'

beforeEach(() => {
    vi.clearAllMocks()
    auth.user = { id: 'u1' }
    reminders.list = []
    prisma.notification.groupBy.mockResolvedValue([])
})

describe('getInboxCounts', () => {
    it('counts only the signed-in user\'s unread notifications, per firm', async () => {
        prisma.notification.groupBy.mockResolvedValue([
            { firmId: 'f1', _count: { _all: 2 } },
            { firmId: null, _count: { _all: 1 } },
        ])
        const counts = await getInboxCounts()
        expect(prisma.notification.groupBy.mock.calls[0][0].where).toEqual({ userId: 'u1', readAt: null })
        expect(counts).toEqual({ byFirm: { f1: 2 }, platform: 1 })
    })

    it('adds reminders due today, overdue or undated — not future or hidden ones', async () => {
        reminders.list = [
            { firmId: 'f1', hiddenAt: null, delta: 0 },
            { firmId: 'f1', hiddenAt: null, delta: -3 },
            { firmId: 'f2', hiddenAt: null, delta: null },
            { firmId: 'f2', hiddenAt: null, delta: 4 },
            { firmId: 'f2', hiddenAt: '2026-10-01', delta: -1 },
        ]
        const counts = await getInboxCounts()
        expect(computeDueReminders).toHaveBeenCalledWith('u1')
        expect(counts.byFirm).toEqual({ f1: 2, f2: 1 })
    })

    it('returns nothing when signed out', async () => {
        auth.user = null
        expect(await getInboxCounts()).toEqual({ byFirm: {}, platform: 0 })
        expect(prisma.notification.groupBy).not.toHaveBeenCalled()
    })
})
