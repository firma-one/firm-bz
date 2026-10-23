import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Done takes a reminder out of the caller's own list only. It used to clear the date the reminder
 * watches too, so marking "Engagement due" done erased the engagement's due date for everyone.
 */

const { store, prisma } = vi.hoisted(() => ({
    store: {
        loadReminderItems: vi.fn(),
        saveReminderItems: vi.fn(async () => {}),
        withReminderLock: vi.fn(async (_userId: string, fn: () => Promise<void>) => fn()),
    },
    prisma: { engagement: { update: vi.fn() }, client: { update: vi.fn() } },
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u-session' } }, error: null }) } }),
}))
vi.mock('@/lib/prisma', () => ({ prisma }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
vi.mock('@/lib/inngest/client', () => ({ safeInngestSend: vi.fn() }))
vi.mock('@/lib/reminders/reminder-store', () => store)
vi.mock('@/lib/reminders/reminder-service', () => ({ computeDueReminders: vi.fn(), upsertFollowUpReminder: vi.fn() }))

import { markReminderDone } from './user-reminders'

const due = {
    id: 'r-due', entityKey: 'platform.engagements.id', entityValue: 'e1', action: 'Engagement due',
    dateKey: 'platform.engagements.dueDate', dateValue: '2027-01-31T00:00:00.000Z', hiddenAt: null, createdAt: '2026-10-01T00:00:00.000Z',
}
const other = { ...due, id: 'r-other', action: 'Follow-up', dateKey: 'platform.clients.followUpDate', entityValue: 'c1' }

beforeEach(() => {
    vi.clearAllMocks()
    store.loadReminderItems.mockResolvedValue([due, other])
})

describe('markReminderDone', () => {
    it('removes the reminder from the signed-in user\'s list and leaves the date it watches alone', async () => {
        await markReminderDone('r-due')
        expect(store.saveReminderItems).toHaveBeenCalledWith('u-session', [other])
        expect(prisma.engagement.update).not.toHaveBeenCalled()
        expect(prisma.client.update).not.toHaveBeenCalled()
    })
})
