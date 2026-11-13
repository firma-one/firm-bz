import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Who may ask Brio to find actions in an engagement's notes, and what each refusal says. The model
 * is mocked: nothing here reaches Anthropic.
 */

const h = vi.hoisted(() => {
    class LimitError extends Error {
        kind = 'period' as const
        limit = 500
        used = 500
    }
    return {
        LimitError,
        user: { id: 'u1' } as { id: string } | null,
        ctx: { firmId: 'f1', orgId: 'f1', clientId: 'c1', projectId: 'p1' } as object | null,
        canEdit: true,
        canViewInternal: true,
        completed: false,
        creditCap: vi.fn(async () => {}),
        create: vi.fn(),
        recordAiUsage: vi.fn(async () => {}),
        findMany: vi.fn(async () => [] as unknown[]),
    }
})

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
}))
vi.mock('@/lib/resolve-project-context', () => ({ resolveProjectContext: async () => h.ctx }))
vi.mock('@/lib/permission-helpers', () => ({
    canEditProject: async () => h.canEdit,
    canViewProjectInternalTabs: async () => h.canViewInternal,
}))
vi.mock('@/lib/engagement-access', () => ({
    blockIfEngagementCompleted: async () => (h.completed
        ? NextResponse.json({ error: "This engagement is completed, so it's read only." }, { status: 403 })
        : null),
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/ai/client', () => ({
    isAiConfigured: () => true,
    AI_MODEL: 'test-model',
    AI_EFFORT: { proposals: 'medium' },
    getAnthropic: () => ({ messages: { create: h.create } }),
}))
vi.mock('@/lib/ai/credit-cap', () => ({ assertWithinAiCreditCap: h.creditCap, AiCreditLimitError: h.LimitError }))
vi.mock('@/lib/ai/usage', () => ({ recordAiUsage: h.recordAiUsage }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagementDocument: { findMany: h.findMany },
        engagement: {
            findUnique: async () => ({
                name: '2025 Individual Return',
                slug: 'return-2025',
                client: { slug: 'dana', firm: { slug: 'northpoint', group: { slug: 'np' } } },
            }),
        },
    },
}))

import { POST } from './route'

const NOTES = "- I need to chase the brokerage 1099-B, still missing\n- Next check-in after Thanksgiving"

const post = (body: unknown = { notes: NOTES, today: '2026-11-12' }) =>
    POST(
        new NextRequest('http://localhost/api/projects/p1/ai-notes-proposals', { method: 'POST', body: JSON.stringify(body) }),
        { params: Promise.resolve({ projectId: 'p1' }) },
    )

const toolAnswer = (input: unknown) => ({
    stop_reason: 'tool_use',
    usage: { input_tokens: 800, output_tokens: 200 },
    content: [{ type: 'tool_use', id: 't1', name: 'record_actions', input }],
})

beforeEach(() => {
    h.user = { id: 'u1' }
    h.ctx = { firmId: 'f1', orgId: 'f1', clientId: 'c1', projectId: 'p1' }
    h.canEdit = true
    h.canViewInternal = true
    h.completed = false
    h.creditCap.mockReset()
    h.creditCap.mockResolvedValue(undefined)
    h.create.mockReset()
    h.recordAiUsage.mockClear()
    h.findMany.mockReset()
    h.findMany.mockResolvedValue([])
})

describe('POST /api/projects/[projectId]/ai-notes-proposals: who', () => {
    it('401 when signed out', async () => {
        h.user = null
        expect((await post()).status).toBe(401)
        expect(h.create).not.toHaveBeenCalled()
    })

    it('404 for an engagement that does not exist', async () => {
        h.ctx = null
        expect((await post()).status).toBe(404)
    })

    it('403 for a Reviewer, who cannot edit', async () => {
        h.canEdit = false
        h.canViewInternal = false
        const res = await post()
        expect(res.status).toBe(403)
        expect((await res.json()).error).toBe('Only a Lead or a Contributor · Full Access can find actions in the notes.')
        expect(h.create).not.toHaveBeenCalled()
    })

    it('403 for a Contributor · Limited Access, who can edit but not see internal notes', async () => {
        h.canEdit = true
        h.canViewInternal = false
        expect((await post()).status).toBe(403)
        expect(h.create).not.toHaveBeenCalled()
    })

    it('403 on a completed engagement, in its own words, before any credit is spent', async () => {
        h.completed = true
        const res = await post()
        expect(res.status).toBe(403)
        expect((await res.json()).error).toBe("This engagement is completed, so it's read only.")
        expect(h.creditCap).not.toHaveBeenCalled()
        expect(h.create).not.toHaveBeenCalled()
    })

    it('429 with the limit\'s own words when credits have run out, and the model is never reached', async () => {
        h.creditCap.mockRejectedValue(new h.LimitError("You have used this month's 500 AI credits."))
        const res = await post()
        expect(res.status).toBe(429)
        expect((await res.json()).error).toBe("You have used this month's 500 AI credits.")
        expect(h.create).not.toHaveBeenCalled()
    })
})

describe('POST /api/projects/[projectId]/ai-notes-proposals: what', () => {
    it('400 for empty notes, 413 for notes too long to read at once', async () => {
        expect((await post({ notes: '   ' })).status).toBe(400)
        const long = await post({ notes: 'x'.repeat(12_001) })
        expect(long.status).toBe(413)
        expect((await long.json()).error).toMatch(/too long for Brio/)
        expect(h.create).not.toHaveBeenCalled()
    })

    it('a refusal answers in Brio\'s words, and the call is still metered', async () => {
        h.create.mockResolvedValue({ stop_reason: 'refusal', usage: { input_tokens: 800, output_tokens: 0 }, content: [] })
        const res = await post()
        expect(res.status).toBe(502)
        expect((await res.json()).error).toBe("Brio couldn't read actions from these notes. Nothing was changed.")
        expect(h.recordAiUsage).toHaveBeenCalledWith(expect.objectContaining({ feature: 'notesProposals', firmId: 'f1', userId: 'u1' }))
    })

    it('a model failure answers in Brio\'s words, never the provider\'s', async () => {
        h.create.mockRejectedValue(new Error('529 overloaded_error'))
        const res = await post()
        expect(res.status).toBe(500)
        expect((await res.json()).error).toBe("Brio couldn't read actions from these notes. Nothing was changed.")
    })

    it('answers validated proposals, with what a reminder needs to point back here', async () => {
        h.findMany.mockResolvedValue([
            { id: 'del-1', docId: 'NPT-6', fileName: 'Estimated Payments Schedule', dueDate: new Date('2026-12-15T00:00:00Z'), isFolder: true, settings: { share: { createdAt: '2026-10-01' } } },
        ])
        h.create.mockResolvedValue(toolAnswer({
            reminders: [{ title: 'Chase the brokerage 1099-B', date: '2026-11-16', quote: 'I need to chase the brokerage 1099-B, still missing' }],
            dueDates: [{ deliverableId: 'D7', newDate: '2026-11-30', quote: 'I need to chase the brokerage 1099-B, still missing' }],
            deliverables: [],
            skipped: [{ quote: 'Next check-in after Thanksgiving', reason: 'has no date' }],
        }))
        const res = await post()
        expect(res.status).toBe(200)
        const { data } = await res.json()
        expect(data.proposals).toEqual([expect.objectContaining({ kind: 'reminder', title: 'Chase the brokerage 1099-B', date: '2026-11-16' })])
        expect(data.dropped).toBe(1)
        expect(data.skipped).toHaveLength(1)
        expect(data.engagement).toEqual({ id: 'p1', name: '2025 Individual Return', firmId: 'f1', ctaUrl: '/d/np/f/northpoint/c/dana/e/return-2025' })

        // Only this engagement's deliverables were read, and they reached the prompt by ref.
        expect(h.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ engagementId: 'p1' }) }))
        const prompt = h.create.mock.calls[0][0].messages[0].content as string
        expect(prompt).toContain('D1 | NPT-6 | "Estimated Payments Schedule"')
        expect(prompt).toContain('TODAY: Thursday 2026-11-12')
    })
})
