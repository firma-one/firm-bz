import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Sending a status update: only a Lead, only what a person finished writing, and only to the
 * engagement's Reviewers and Limited Access contributors. Email and notifications are mocked.
 */

const st = vi.hoisted(() => ({
    lead: true,
    status: 'ACTIVE' as string,
    members: [{ userId: 'dana' }] as Array<{ userId: string }>,
}))
const { update, notify, email } = vi.hoisted(() => ({
    update: vi.fn(async () => ({})),
    notify: vi.fn(async () => {}),
    email: vi.fn(async () => {}),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'lead', email: 'priya@halden.co', user_metadata: { full_name: 'Priya Shah' } } } }) } }),
}))
vi.mock('@/lib/resolve-project-context', () => ({
    resolveProjectContext: async () => ({ firmId: 'f1', clientId: 'c1', projectId: 'p1' }),
}))
vi.mock('@/lib/permission-helpers', () => ({ canManageProject: async () => st.lead }))
vi.mock('@/lib/engagement-access', () => ({ getEngagementStatus: async () => st.status }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagementMember: { findMany: async () => st.members },
        engagement: {
            findFirst: async () => ({ name: 'Q4', slug: 'q4', client: { id: 'c1', slug: 'halden', firm: { name: 'Halden Advisory', slug: 'halden', group: { slug: 'g' } } } }),
            findUnique: async () => ({ settings: { internalMemo: 'kept' } }),
            update,
        },
    },
}))
vi.mock('@/lib/notify-event', () => ({
    createEventNotifications: notify,
    sendEventEmailToUser: email,
    buildAbsoluteUrl: (p: string) => `https://app${p}`,
}))
vi.mock('@/lib/audit/emit', () => ({ emitAuditEvent: async () => {} }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/ai/status-update', async () => {
    const actual = await vi.importActual<typeof import('@/lib/ai/status-update')>('@/lib/ai/status-update')
    return { ...actual, loadStatusUpdateInputs: vi.fn(), clientSideRecipients: vi.fn() }
})
vi.mock('@/lib/insights/engagement-insights', () => ({ computeEngagementInsights: vi.fn() }))

import { sendStatusUpdate } from './status-update'

beforeEach(() => {
    st.lead = true
    st.status = 'ACTIVE'
    st.members = [{ userId: 'dana' }]
    update.mockClear(); notify.mockClear(); email.mockClear()
})

describe('sendStatusUpdate', () => {
    it('sends to each recipient, keeps it as the last update, and keeps the other settings', async () => {
        const r = await sendStatusUpdate('p1', 'QSR-3 is approved.', ['dana'])
        expect(r.ok).toBe(true)
        expect(email).toHaveBeenCalledTimes(1)
        expect(notify).toHaveBeenCalledWith([expect.objectContaining({ userId: 'dana', type: 'ENGAGEMENT_STATUS_UPDATE' })])
        const saved = (update.mock.calls[0] as unknown as [{ data: { settings: Record<string, any> } }])[0].data.settings
        expect(saved.internalMemo).toBe('kept')
        expect(saved.statusUpdates[0]).toMatchObject({ text: 'QSR-3 is approved.', recipientUserIds: ['dana'] })
    })

    it('refuses a draft with [bracketed] spots left to fill', async () => {
        const r = await sendStatusUpdate('p1', 'Done.\n\n[Add next steps]', ['dana'])
        expect(r).toMatchObject({ ok: false, code: 'placeholders' })
        expect(email).not.toHaveBeenCalled()
    })

    it('refuses anyone who is not a Reviewer or Limited Access contributor here', async () => {
        st.members = []
        const r = await sendStatusUpdate('p1', 'Hello.', ['someone-else'])
        expect(r).toMatchObject({ ok: false, code: 'bad_recipients' })
        expect(update).not.toHaveBeenCalled()
    })

    it('refuses a non-Lead, an empty update, and a completed engagement', async () => {
        expect(await sendStatusUpdate('p1', '  ', ['dana'])).toMatchObject({ ok: false, code: 'empty' })
        st.status = 'COMPLETED'
        expect(await sendStatusUpdate('p1', 'Hi.', ['dana'])).toMatchObject({ ok: false, code: 'completed' })
        st.lead = false
        expect(await sendStatusUpdate('p1', 'Hi.', ['dana'])).toMatchObject({ ok: false, code: 'forbidden' })
        expect(email).not.toHaveBeenCalled()
    })
})
