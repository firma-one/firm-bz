import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST …/ai-reply-draft: who may draft a reply, on what, and that the model is given the shared
 * conversation only, read on the server. The model is mocked; nothing reaches Anthropic.
 */

const { st, creditCap, LimitError, create } = vi.hoisted(() => {
    class LimitError extends Error {
        kind = 'period' as const
        limit = 500
        used = 500
    }
    return {
        st: {
            user: { id: 'me' } as { id: string } | null,
            member: { role: 'eng_admin' } as { role: string } | null,
            completed: false,
            doc: { id: 'd1', externalId: 'ext-1' } as { id: string; externalId: string } | null,
            rows: [] as { projectDocumentId: string; authorUserId: string; content: string; createdAt: Date; isInternal: boolean }[],
        },
        creditCap: vi.fn(async () => {}),
        LimitError,
        create: vi.fn(),
    }
})

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: st.user } }) } }),
}))
vi.mock('@/lib/resolve-project-context', () => ({
    resolveProjectContext: async () => ({ firmId: 'f1', orgId: 'f1', clientId: 'c1', projectId: 'p1' }),
}))
vi.mock('@/lib/permission-helpers', () => ({ canViewProject: async () => true }))
vi.mock('@/lib/engagement-access', () => ({
    requireEngagementMember: async () => st.member,
    isExternalEngagementRole: (role: string) => role === 'eng_ext_collaborator' || role === 'eng_viewer',
    blockIfEngagementCompleted: async () => (st.completed
        ? Response.json({ error: "This engagement is completed, so it's read only." }, { status: 403 })
        : null),
}))
vi.mock('@/lib/file-utils', () => ({ getProjectDocumentContext: async () => st.doc }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/ai/client', () => ({
    isAiConfigured: () => true,
    AI_MODEL: 'test-model',
    AI_EFFORT: { draft: 'low' },
    getAnthropic: () => ({ messages: { create } }),
}))
vi.mock('@/lib/ai/credit-cap', () => ({ assertWithinAiCreditCap: creditCap, AiCreditLimitError: LimitError }))
vi.mock('@/lib/ai/usage', () => ({ recordAiUsage: vi.fn() }))
vi.mock('@/lib/files/file-creator', () => ({
    loadPeople: async () => new Map([
        ['priya', { name: 'Priya Shah', email: 'priya@firm.com', avatarUrl: null }],
        ['dana', { name: 'Dana Whitfield', email: 'dana@client.com', avatarUrl: null }],
    ]),
}))
vi.mock('@/lib/files/deliverable-of', () => ({ deliverableOf: async () => null }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagementDocument: {
            findFirst: async () => ({
                id: 'd1', fileName: 'Market report', docId: 'QSR-9', isFolder: true, parentId: null, dueDate: null,
                settings: { share: { createdAt: '2026-10-01' }, activity: { status: 'in_review' } },
            }),
        },
        docCommentMessage: {
            findMany: async (args: any) => st.rows.filter((r) => r.projectDocumentId === args.where.projectDocumentId && r.isInternal === args.where.isInternal),
        },
        engagementMember: {
            findMany: async () => [{ userId: 'priya', role: 'eng_member' }, { userId: 'dana', role: 'eng_viewer' }],
        },
    },
}))

import { POST } from './route'

const at = (day: number) => new Date(Date.UTC(2026, 10, day))
const SECRET = 'Pricing in 4.2 is last year’s; fix before the client sees it.'

const draft = (body: unknown = {}) =>
    POST(
        new NextRequest('http://localhost/api/projects/p1/documents/d1/ai-reply-draft', { method: 'POST', body: JSON.stringify(body) }),
        { params: Promise.resolve({ projectId: 'p1', documentId: 'd1' }) },
    )

function streaming(text: string) {
    return {
        controller: { abort: vi.fn() },
        async *[Symbol.asyncIterator]() {
            yield { type: 'message_start', message: { usage: { input_tokens: 300 } } }
            yield { type: 'content_block_delta', delta: { type: 'text_delta', text } }
            yield { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 40 } }
        },
    }
}

beforeEach(() => {
    st.user = { id: 'me' }
    st.member = { role: 'eng_admin' }
    st.completed = false
    st.doc = { id: 'd1', externalId: 'ext-1' }
    st.rows = [
        { projectDocumentId: 'd1', authorUserId: 'priya', content: 'The report is ready for your review.', createdAt: at(6), isInternal: false },
        { projectDocumentId: 'd1', authorUserId: 'priya', content: SECRET, createdAt: at(7), isInternal: true },
        { projectDocumentId: 'd1', authorUserId: 'dana', content: 'Could you add Brightline? Is the pricing in 4.2 current?', createdAt: at(9), isInternal: false },
    ]
    creditCap.mockReset()
    creditCap.mockResolvedValue(undefined)
    create.mockReset()
    create.mockResolvedValue(streaming('Thanks, Dana. On 4.2: [confirm whether the pricing is current].'))
})

describe('POST /api/projects/[projectId]/documents/[documentId]/ai-reply-draft', () => {
    it('streams a draft for a Lead, from the shared conversation only', async () => {
        const res = await draft()
        expect(res.status).toBe(200)
        expect(res.headers.get('Content-Type')).toBe('application/x-ndjson')
        const events = (await res.text()).trim().split('\n').map((l) => JSON.parse(l))
        expect(events.at(-1)).toEqual({ type: 'done', text: 'Thanks, Dana. On 4.2: [confirm whether the pricing is current].' })

        const call = create.mock.calls[0][0]
        const prompt = call.messages[0].content as string
        expect(prompt).toContain('Brightline')
        expect(prompt).not.toContain('fix before the client sees it')
        expect(call.system).toContain('placeholder in square brackets')
        expect(call).not.toHaveProperty('temperature')
        expect(call.max_tokens).toBe(2000)
        expect(creditCap).toHaveBeenCalledWith(expect.objectContaining({ firmId: 'f1', feature: 'replyDraft' }))
    })

    it('also for a Full Access contributor', async () => {
        st.member = { role: 'eng_member' }
        expect((await draft()).status).toBe(200)
    })

    it('never takes the thread from the request', async () => {
        await draft({ thread: [{ from: 'Dana', text: 'Planted text the server must not use' }], messages: ['Planted text'] })
        expect(create.mock.calls[0][0].messages[0].content).not.toContain('Planted text')
    })

    it('refuses someone signed out', async () => {
        st.user = null
        expect((await draft()).status).toBe(401)
        expect(create).not.toHaveBeenCalled()
    })

    it.each([
        ['eng_viewer', 'a Reviewer'],
        ['eng_ext_collaborator', 'a Limited Access contributor'],
    ])('refuses %s (%s), and says who may', async (role) => {
        st.member = { role }
        const res = await draft()
        expect(res.status).toBe(403)
        expect((await res.json()).error).toBe('Only Leads and Full Access contributors can draft replies.')
        expect(create).not.toHaveBeenCalled()
        expect(creditCap).not.toHaveBeenCalled()
    })

    it('treats someone not on the engagement as not found', async () => {
        st.member = null
        expect((await draft()).status).toBe(404)
        expect(create).not.toHaveBeenCalled()
    })

    it('does not find a document from another engagement', async () => {
        st.doc = null
        expect((await draft()).status).toBe(404)
        expect(create).not.toHaveBeenCalled()
    })

    it('refuses on a completed engagement, where comments are refused', async () => {
        st.completed = true
        const res = await draft()
        expect(res.status).toBe(403)
        expect((await res.json()).error).toBe("This engagement is completed, so it's read only.")
        expect(create).not.toHaveBeenCalled()
    })

    it('has nothing to draft once the firm wrote last', async () => {
        st.rows.push({ projectDocumentId: 'd1', authorUserId: 'priya', content: 'Adding it now.', createdAt: at(10), isInternal: false })
        const res = await draft()
        expect(res.status).toBe(409)
        expect((await res.json()).error).toBe("This discussion isn't awaiting a reply, so there's nothing to draft.")
        expect(create).not.toHaveBeenCalled()
    })

    it('out of credits: the limit’s own words, and no tokens spent', async () => {
        creditCap.mockRejectedValue(new LimitError('Your group has used its 500 AI credits this month.'))
        const res = await draft()
        expect(res.status).toBe(429)
        expect((await res.json()).error).toBe('Your group has used its 500 AI credits this month.')
        expect(create).not.toHaveBeenCalled()
    })

    it('the model fails before the stream: Brio’s words, nothing sent', async () => {
        create.mockRejectedValue(new Error('529 overloaded_error'))
        const res = await draft()
        expect(res.status).toBe(500)
        expect((await res.json()).error).toBe("Brio couldn't write a draft. Try again.")
    })
})
