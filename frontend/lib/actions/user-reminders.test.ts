import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Done takes a reminder out of the caller's own list only. It used to clear the date the reminder
 * watches too, so marking "Engagement due" done erased the engagement's due date for everyone.
 */

const { store, prisma, session } = vi.hoisted(() => ({
    session: { user: { id: 'u-session' } as { id: string } | null },
    store: {
        loadReminderItems: vi.fn(),
        saveReminderItems: vi.fn(async () => {}),
        withReminderLock: vi.fn(async (_userId: string, fn: () => Promise<void>) => fn()),
    },
    prisma: { engagement: { update: vi.fn() }, client: { update: vi.fn() } },
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: session.user }, error: null }) } }),
}))
vi.mock('@/lib/prisma', () => ({ prisma }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
vi.mock('@/lib/inngest/client', () => ({ safeInngestSend: vi.fn() }))
vi.mock('@/lib/reminders/reminder-store', () => store)
vi.mock('@/lib/reminders/reminder-service', () => ({ computeDueReminders: vi.fn(), upsertFollowUpReminder: vi.fn() }))

vi.mock('next/navigation', () => ({ unstable_rethrow: vi.fn() }))

import { markReminderDone, hideReminder, showReminder, createManualReminder, getAllUserReminders } from './user-reminders'
import { computeDueReminders, upsertFollowUpReminder } from '@/lib/reminders/reminder-service'

const due = {
    id: 'r-due', entityKey: 'platform.engagements.id', entityValue: 'e1', action: 'Engagement due',
    dateKey: 'platform.engagements.dueDate', dateValue: '2027-01-31T00:00:00.000Z', hiddenAt: null, createdAt: '2026-10-01T00:00:00.000Z',
}
const other = { ...due, id: 'r-other', action: 'Follow-up', dateKey: 'platform.clients.followUpDate', entityValue: 'c1' }

beforeEach(() => {
    vi.clearAllMocks()
    session.user = { id: 'u-session' }
    store.loadReminderItems.mockResolvedValue([due, other])
})

describe('markReminderDone', () => {
    it('removes the reminder from the signed-in user\'s list and leaves the date it watches alone', async () => {
        expect(await markReminderDone('r-due')).toEqual({ ok: true, data: undefined })
        expect(store.saveReminderItems).toHaveBeenCalledWith('u-session', [other])
        expect(prisma.engagement.update).not.toHaveBeenCalled()
        expect(prisma.client.update).not.toHaveBeenCalled()
    })
})

describe('hideReminder and showReminder', () => {
    it('set and clear hiddenAt on the signed-in user\'s reminder', async () => {
        expect(await hideReminder('r-due')).toEqual({ ok: true, data: undefined })
        expect(store.saveReminderItems).toHaveBeenLastCalledWith('u-session', [expect.objectContaining({ id: 'r-due', hiddenAt: expect.any(String) }), other])
        expect(await showReminder('r-due')).toEqual({ ok: true, data: undefined })
        expect(store.saveReminderItems).toHaveBeenLastCalledWith('u-session', [expect.objectContaining({ id: 'r-due', hiddenAt: null }), other])
    })
})

describe('with the session gone (P2-30)', () => {
    it('answers why rather than return as if done, so the Inbox and the panel put the reminder back and say so', async () => {
        session.user = null
        const signedOut = { ok: false, code: 'unauthorized', error: 'Your session has ended. Sign in again.' }
        expect(await markReminderDone('r-due')).toEqual(signedOut)
        expect(await hideReminder('r-due')).toEqual(signedOut)
        expect(await showReminder('r-due')).toEqual(signedOut)
        expect(store.saveReminderItems).not.toHaveBeenCalled()
    })

    it('answers a plain sentence when the save itself fails', async () => {
        store.saveReminderItems.mockRejectedValueOnce(new Error('connection reset'))
        expect(await markReminderDone('r-due')).toEqual({ ok: false, code: 'internal', error: 'Something went wrong on our side. Try again.' })
    })
})

describe('getAllUserReminders (EM-1)', () => {
    it('answers the reminders, or why they did not load', async () => {
        vi.mocked(computeDueReminders).mockResolvedValueOnce([{ id: 'r-due' }] as any)
        expect(await getAllUserReminders()).toEqual({ ok: true, data: [{ id: 'r-due' }] })
        vi.mocked(computeDueReminders).mockRejectedValueOnce(new Error('db down'))
        expect(await getAllUserReminders()).toEqual({ ok: false, code: 'internal', error: 'Something went wrong on our side. Try again.' })
        session.user = null
        expect(await getAllUserReminders()).toMatchObject({ ok: false, code: 'unauthorized' })
    })
})

describe('createManualReminder (P1-13)', () => {
    const params = { entityKey: 'k', entityValue: 'v', action: 'Call Ana', dateValue: null, entityName: 'Acme', firmId: 'f1', ctaUrl: null }

    it('answers ok when saved', async () => {
        expect(await createManualReminder(params)).toEqual({ ok: true, data: undefined })
    })

    it('answers in words when the session is gone', async () => {
        session.user = null
        expect(await createManualReminder(params)).toEqual({ ok: false, code: 'unauthorized', error: 'Your session has ended. Sign in again.' })
        expect(upsertFollowUpReminder).not.toHaveBeenCalled()
    })

    it('answers a plain sentence, not the database\'s words, when the save fails', async () => {
        vi.mocked(upsertFollowUpReminder).mockRejectedValueOnce(new Error('P2002 unique constraint on reminders_pkey'))
        expect(await createManualReminder(params)).toEqual({ ok: false, code: 'internal', error: 'Something went wrong on our side. Try again.' })
    })
})
