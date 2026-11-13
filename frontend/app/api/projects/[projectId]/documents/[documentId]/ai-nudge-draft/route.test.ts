import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/** Nudge drafts: a Lead, a deliverable in review in THIS engagement, and a client-side person in it. */

const st = vi.hoisted(() => ({
    lead: true,
    doc: { fileName: 'Intel Report', docId: 'QSR-9', dueDate: null, settings: { share: { createdAt: 'x' }, activity: { status: 'in_review', updatedAt: '2026-11-06T00:00:00Z' } } } as Record<string, unknown> | null,
    recipient: { userId: 'dana' } as Record<string, unknown> | null,
}))
const { streamDraft } = vi.hoisted(() => ({ streamDraft: vi.fn(async () => new Response('stream')) }))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }),
}))
vi.mock('@/utils/supabase/admin', () => ({
    createAdminClient: () => ({ auth: { admin: { getUserById: async () => ({ data: { user: { user_metadata: { full_name: 'Dana Whitfield' } } } }) } } }),
}))
vi.mock('@/lib/resolve-project-context', () => ({
    resolveProjectContext: async () => ({ firmId: 'f1', clientId: 'c1', projectId: 'p1' }),
}))
vi.mock('@/lib/permission-helpers', () => ({ canManageProject: async () => st.lead }))
vi.mock('@/lib/engagement-access', () => ({ blockIfEngagementCompleted: async () => null }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagementDocument: { findFirst: async () => st.doc },
        engagementMember: { findFirst: async () => st.recipient },
        engagement: { findUnique: async () => ({ name: 'Q4' }) },
    },
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/ai/client', () => ({ isAiConfigured: () => true, AI_EFFORT: { draft: 'low' } }))
vi.mock('@/lib/ai/guarded-client', () => ({
    getGuardedAnthropic: async () => ({ messages: {} }),
    aiFailureResponse: (_e: unknown, words: string) => Response.json({ error: words }, { status: 500 }),
}))
vi.mock('@/lib/ai/stream-draft', () => ({ streamDraft }))

import { POST } from './route'

const post = (body: unknown = { recipientUserId: 'dana' }) => POST(
    new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify(body) }),
    { params: Promise.resolve({ projectId: 'p1', documentId: 'd1' }) },
)

beforeEach(() => {
    st.lead = true
    st.doc = { fileName: 'Intel Report', docId: 'QSR-9', dueDate: null, settings: { share: { createdAt: 'x' }, activity: { status: 'in_review', updatedAt: '2026-11-06T00:00:00Z' } } }
    st.recipient = { userId: 'dana' }
    streamDraft.mockClear()
})

describe('POST .../documents/[documentId]/ai-nudge-draft', () => {
    it('drafts for a Lead, greeting the person by first name', async () => {
        expect(await (await post()).text()).toBe('stream')
        const call = (streamDraft.mock.calls[0] as unknown as [{ user: string; scope: { feature: string } }])[0]
        expect(call.scope.feature).toBe('nudgeDraft')
        expect(call.user).toContain('"Dana"')
        expect(call.user).toContain('QSR-9')
    })

    it('refuses anyone who is not a Lead', async () => {
        st.lead = false
        expect((await post()).status).toBe(403)
    })

    it('asks who to nudge', async () => {
        expect((await post({})).status).toBe(400)
    })

    it('a document that is not a deliverable of this engagement is not found', async () => {
        st.doc = null
        expect((await post()).status).toBe(404)
    })

    it('a deliverable no longer in review is not nudged about', async () => {
        st.doc = { ...st.doc!, settings: { share: { createdAt: 'x' }, activity: { status: 'approved' } } }
        expect((await post()).status).toBe(409)
        expect(streamDraft).not.toHaveBeenCalled()
    })

    it('only Reviewers and Limited Access contributors on this engagement can be nudged', async () => {
        st.recipient = null
        expect((await post()).status).toBe(400)
        expect(streamDraft).not.toHaveBeenCalled()
    })
})
