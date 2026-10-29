import { describe, it, expect, vi, beforeEach } from 'vitest'

// Internal notes in a document's thread (2026-10-29): a client never sees one, never writes one,
// and is never reminded of one.

const { st, calls, reopened } = vi.hoisted(() => ({
    reopened: [] as string[],
    st: {
        role: 'eng_member' as string,
        recipientRole: 'eng_member' as string | null,
        messageInternal: false,
    },
    calls: { findMany: [] as any[], create: [] as any[], findFirst: [] as any[] },
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'me', email: 'me@firm.com' } } }) } }),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/resolve-project-context', () => ({ resolveProjectContext: async () => ({ orgId: 'f', clientId: 'c', projectId: 'p' }) }))
vi.mock('@/lib/permission-helpers', () => ({ canViewProject: async () => true }))
vi.mock('@/lib/file-utils', () => ({ getProjectDocumentContext: async () => ({ id: 'd1', externalId: 'ext1', clientId: 'c' }) }))
vi.mock('@/lib/engagement-access', () => ({
    requireEngagementMember: async () => ({ role: st.role }),
    visibleDocumentIdsFor: async () => null,
    externalMemberCanAccessDocument: async () => true,
    isExternalEngagementRole: (role: string) => role === 'eng_ext_collaborator' || role === 'eng_viewer',
}))
vi.mock('@/lib/comments/tagged-documents', () => ({ taggedDocumentsIn: async () => ({}) }))
vi.mock('@/lib/comments/discussions', () => ({ markDiscussionRead: async () => {}, reopenDiscussion: async (id: string) => { reopened.push(id) } }))
vi.mock('@/lib/ai/agent-email', () => ({ isAgentUserIdAsync: async () => false }))
vi.mock('@/lib/billing/effective-billing-caps', () => ({ loadAnchorForCaps: async () => null, effectiveCommentHistoryDays: () => null }))
vi.mock('@/lib/navigation/firm-paths', () => ({ engagementDocCommentPath: () => '/' }))
vi.mock('@/lib/firm-reminder-config', () => ({ getFirmReminderConfig: async () => ({ events: { externalClientComment: {} } }) }))
vi.mock('@/lib/notify-event', () => ({ createEventNotifications: vi.fn(), sendEventEmailToUser: vi.fn(), buildAbsoluteUrl: () => null }))
vi.mock('@/lib/email-templates/client-comment', () => ({ renderClientCommentEmail: () => ({}) }))
vi.mock('@/lib/reminders/reminder-service', () => ({ upsertFollowUpReminder: async () => {} }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        docCommentMessage: {
            findMany: async (args: any) => { calls.findMany.push(args); return [] },
            create: async (args: any) => {
                calls.create.push(args)
                return { id: 'm-new', createdAt: new Date(), authorUserId: 'me', content: args.data.content, reactions: {}, settings: {}, isInternal: args.data.isInternal }
            },
            findFirst: async (args: any) => {
                calls.findFirst.push(args)
                // A client's lookup is filtered: an internal note isn't there for them.
                if (st.messageInternal && args.where.isInternal === false) return null
                return { id: 'm1', content: 'x', isInternal: st.messageInternal }
            },
        },
        engagementMember: { findFirst: async () => (st.recipientRole ? { role: st.recipientRole } : null) },
        engagement: { findUnique: async () => null },
    },
}))

import { GET, PATCH, POST } from './route'

const ctx = { params: Promise.resolve({ projectId: 'p', documentId: 'd1' }) }
const get = () => GET({ nextUrl: new URL('http://x/api/projects/p/documents/d1/doc-comments') } as any, ctx)
const post = (body: unknown) => POST({ json: async () => body } as any, ctx)
const patch = (body: unknown) => PATCH({ json: async () => body } as any, ctx)

beforeEach(() => {
    st.role = 'eng_member'
    st.recipientRole = 'eng_member'
    st.messageInternal = false
    calls.findMany = []
    calls.create = []
    calls.findFirst = []
    reopened.length = 0
})

describe('internal notes in a document thread', () => {
    it.each(['eng_ext_collaborator', 'eng_viewer'])('leaves them out of the thread for %s', async (role) => {
        st.role = role
        await get()
        expect(calls.findMany[0].where.isInternal).toBe(false)
    })

    it("shows them to the firm's own roles", async () => {
        await get()
        expect(calls.findMany[0].where).not.toHaveProperty('isInternal')
    })

    it('saves one for a firm member', async () => {
        const res = await post({ content: 'Pricing stays between us', internal: true })
        expect(res.status).toBe(200)
        expect(calls.create[0].data.isInternal).toBe(true)
    })

    it('saves an ordinary comment as shared', async () => {
        await post({ content: 'Thanks, reviewing now' })
        expect(calls.create[0].data.isInternal).toBe(false)
    })

    it('reopens a resolved discussion on a reply, but not on an internal note', async () => {
        await post({ content: 'Between us', internal: true })
        expect(reopened).toEqual([])
        await post({ content: 'Back to you' })
        expect(reopened).toEqual(['d1'])
    })

    it.each(['eng_ext_collaborator', 'eng_viewer'])('refuses one from %s', async (role) => {
        st.role = role
        const res = await post({ content: 'x', internal: true })
        expect(res.status).toBe(403)
        expect(calls.create).toHaveLength(0)
    })

    it('never reminds a client of one, at posting', async () => {
        st.recipientRole = 'eng_viewer'
        const res = await post({ content: 'x', internal: true, isReminder: true, recipientId: 'client-1' })
        expect(res.status).toBe(400)
        expect(calls.create).toHaveLength(0)
    })

    it('never reminds a client of one, afterwards', async () => {
        st.messageInternal = true
        st.recipientRole = 'eng_ext_collaborator'
        const res = await patch({ messageId: 'm1', recipientId: 'client-1' })
        expect(res.status).toBe(400)
    })

    it('lets a client reach none, even by its id', async () => {
        st.role = 'eng_viewer'
        st.messageInternal = true
        const res = await patch({ messageId: 'm1', recipientId: 'someone' })
        expect(res.status).toBe(404)
    })
})
