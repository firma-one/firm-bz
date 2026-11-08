import { describe, it, expect, vi, beforeEach } from 'vitest'

// What the comments route answers when part of the work fails (error-handling audit CM-1, P1-70):
// a mention's reminder is awaited and its failure said, and a failure on our side reads as words.

const { st, upserts } = vi.hoisted(() => ({
    st: { upsertFails: false, createFails: false, findManyFails: false, deleteFails: false },
    upserts: [] as any[],
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'me', email: 'me@firm.com' } } }) } }),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/resolve-project-context', () => ({ resolveProjectContext: async () => ({ orgId: 'f', clientId: 'c', projectId: 'p' }) }))
vi.mock('@/lib/permission-helpers', () => ({ canViewProject: async () => true }))
vi.mock('@/lib/file-utils', () => ({ getProjectDocumentContext: async () => ({ id: 'd1', externalId: 'ext1', clientId: 'c' }) }))
vi.mock('@/lib/engagement-access', () => ({
    getEngagementStatus: async () => 'ACTIVE',
    blockIfEngagementCompleted: async () => null,
    requireEngagementMember: async () => ({ role: 'eng_member' }),
    visibleDocumentIdsFor: async () => null,
    externalMemberCanAccessDocument: async () => true,
    isExternalEngagementRole: () => false,
}))
vi.mock('@/lib/comments/tagged-documents', () => ({ taggedDocumentsIn: async () => ({}) }))
vi.mock('@/lib/comments/discussions', () => ({ markDiscussionRead: async () => {}, reopenDiscussion: async () => {} }))
vi.mock('@/lib/ai/agent-email', () => ({ isAgentUserIdAsync: async () => false }))
vi.mock('@/lib/billing/effective-billing-caps', () => ({ loadAnchorForCaps: async () => null, effectiveCommentHistoryDays: () => null }))
vi.mock('@/lib/navigation/firm-paths', () => ({ engagementDocCommentPath: () => '/c' }))
vi.mock('@/lib/firm-reminder-config', () => ({ getFirmReminderConfig: async () => ({ events: { externalClientComment: {} } }) }))
vi.mock('@/lib/notify-event', () => ({ createEventNotifications: vi.fn(), sendEventEmailToUser: vi.fn(), buildAbsoluteUrl: () => null }))
vi.mock('@/lib/email-templates/client-comment', () => ({ renderClientCommentEmail: () => ({}) }))
vi.mock('@/lib/inngest/client', () => ({ safeInngestSend: async () => true }))
vi.mock('@/lib/reminders/reminder-service', () => ({
    upsertFollowUpReminder: async (args: any) => {
        // A write that takes a moment: an unawaited one would land after the answer.
        await new Promise((r) => setTimeout(r, 5))
        if (st.upsertFails) throw new Error('deadlock detected')
        upserts.push(args)
    },
}))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        docCommentMessage: {
            findMany: async () => { if (st.findManyFails) throw new Error('connection terminated unexpectedly'); return [] },
            create: async (args: any) => {
                if (st.createFails) throw new Error('P2002 unique constraint')
                return { id: 'm-new', createdAt: new Date(), authorUserId: 'me', content: args.data.content, reactions: {}, settings: {}, isInternal: false }
            },
            findFirst: async (args: any) => (args.where.createdAt ? null : { id: 'm1', content: 'Please review', isInternal: false, authorUserId: 'me', createdAt: new Date() }),
            delete: async () => { if (st.deleteFails) throw new Error('db down') },
        },
        engagementMember: { findFirst: async () => ({ role: 'eng_member' }) },
        engagement: { findUnique: async () => null },
        userPersonalization: { findFirst: async () => null, findMany: async () => [] },
    },
}))

import { DELETE, GET, PATCH, POST } from './route'

const ctx = { params: Promise.resolve({ projectId: 'p', documentId: 'd1' }) }
const get = () => GET({ nextUrl: new URL('http://x/api/projects/p/documents/d1/doc-comments') } as any, ctx)
const post = (body: unknown) => POST({ json: async () => body } as any, ctx)
const patch = (body: unknown) => PATCH({ json: async () => body } as any, ctx)
const del = (body: unknown) => DELETE({ json: async () => body } as any, ctx)

beforeEach(() => {
    st.upsertFails = false
    st.createFails = false
    st.findManyFails = false
    st.deleteFails = false
    upserts.length = 0
})

describe('a mention’s reminder (PATCH)', () => {
    it('is written before the route answers', async () => {
        const res = await patch({ messageId: 'm1', recipientId: 'ana', dateValue: null })
        expect(res.status).toBe(200)
        expect(upserts).toHaveLength(1)
        expect(upserts[0]).toMatchObject({ userId: 'ana', entityKey: 'platform.doc_comments', entityValue: 'm1' })
    })

    it('answers a failure, in words, when it could not be saved', async () => {
        st.upsertFails = true
        const res = await patch({ messageId: 'm1', recipientId: 'ana', dateValue: null })
        expect(res.status).toBe(500)
        expect((await res.json()).error).toBe("The reminder wasn't saved on our side. Try again.")
    })
})

describe('posting a comment that reminds someone (POST)', () => {
    it('keeps the comment, and says who was not notified', async () => {
        st.upsertFails = true
        const res = await post({ content: 'Please review', isReminder: true, recipientId: 'ana' })
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.message.id).toBe('m-new')
        expect(data.notNotified).toEqual(['ana'])
        expect(data.warning).toMatch(/wasn't notified/)
    })

    it('says nothing more when the reminder was saved', async () => {
        const data = await (await post({ content: 'Please review', isReminder: true, recipientId: 'ana' })).json()
        expect(upserts).toHaveLength(1)
        expect(data.warning).toBeUndefined()
        expect(data.notNotified).toBeUndefined()
    })
})

describe('a failure on our side reads as words, never the raw error', () => {
    it('loading the thread', async () => {
        st.findManyFails = true
        const res = await get()
        expect(res.status).toBe(500)
        expect((await res.json()).error).toBe("Couldn't load the comments. Try again.")
    })

    it('posting', async () => {
        st.createFails = true
        const res = await post({ content: 'Hi' })
        expect(res.status).toBe(500)
        expect((await res.json()).error).toBe("Couldn't post your comment on our side. Try again.")
    })

    it('deleting a comment', async () => {
        st.deleteFails = true
        const res = await del({ action: 'delete-comment', messageId: 'm1' })
        expect(res.status).toBe(500)
        expect((await res.json()).error).toBe("Couldn't delete the comment on our side. Try again.")
    })
})
