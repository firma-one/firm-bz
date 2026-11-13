import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/** The status update draft: Leads only, never on a completed engagement, and Brio's words on failure. */

const st = vi.hoisted(() => ({
    lead: true,
    completed: false,
    inputs: { summary: 'Approved.', changes: [{ kind: 'approved', text: 'QSR-3 approved' }] } as Record<string, unknown> | null,
}))
const { creditCap, LimitError, streamDraft } = vi.hoisted(() => {
    class LimitError extends Error { kind = 'period' as const; limit = 500; used = 500 }
    return { creditCap: vi.fn(async () => {}), LimitError, streamDraft: vi.fn(async () => new Response('stream')) }
})

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }),
}))
vi.mock('@/lib/resolve-project-context', () => ({
    resolveProjectContext: async () => ({ firmId: 'f1', clientId: 'c1', projectId: 'p1' }),
}))
vi.mock('@/lib/permission-helpers', () => ({ canManageProject: async () => st.lead }))
vi.mock('@/lib/engagement-access', () => ({
    blockIfEngagementCompleted: async () => (st.completed ? Response.json({ error: 'read only' }, { status: 403 }) : null),
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/ai/client', () => ({
    isAiConfigured: () => true, AI_EFFORT: { draft: 'low' }, getAnthropic: () => ({ messages: {} }),
}))
vi.mock('@/lib/ai/credit-cap', () => ({ assertWithinAiCreditCap: creditCap, AiCreditLimitError: LimitError }))
vi.mock('@/lib/ai/usage', () => ({ recordAiUsage: vi.fn() }))
vi.mock('@/lib/ai/stream-draft', () => ({ streamDraft }))
vi.mock('@/lib/ai/status-update', () => ({
    STATUS_UPDATE_SYSTEM_PROMPT: 'system',
    buildStatusUpdatePrompt: () => 'facts',
    loadStatusUpdateInputs: async () => st.inputs,
}))

import { POST } from './route'

const post = () => POST(
    new NextRequest('http://localhost/api/projects/p1/ai-status-update', { method: 'POST' }),
    { params: Promise.resolve({ projectId: 'p1' }) },
)

beforeEach(() => {
    st.lead = true
    st.completed = false
    st.inputs = { summary: 'Approved.', changes: [{ kind: 'approved', text: 'QSR-3 approved' }] }
    creditCap.mockReset()
    creditCap.mockResolvedValue(undefined)
    streamDraft.mockClear()
})

describe('POST /api/projects/[projectId]/ai-status-update', () => {
    it('streams a draft for a Lead, as feature statusUpdate', async () => {
        expect(await (await post()).text()).toBe('stream')
        expect(streamDraft).toHaveBeenCalledWith(expect.objectContaining({
            scope: expect.objectContaining({ feature: 'statusUpdate' }),
            user: 'facts',
        }))
    })

    it('refuses anyone who is not a Lead', async () => {
        st.lead = false
        expect((await post()).status).toBe(403)
        expect(streamDraft).not.toHaveBeenCalled()
    })

    it('refuses a completed engagement', async () => {
        st.completed = true
        expect((await post()).status).toBe(403)
    })

    it('says so when there is nothing to write from, without a model call', async () => {
        st.inputs = { summary: null, changes: [] }
        const res = await post()
        expect(res.status).toBe(409)
        expect(streamDraft).not.toHaveBeenCalled()
    })

    it('out of credits: the limit’s own words, before any tokens are spent', async () => {
        creditCap.mockRejectedValue(new LimitError("You have used this month's 500 AI credits."))
        const res = await post()
        expect(res.status).toBe(429)
        expect((await res.json()).error).toBe("You have used this month's 500 AI credits.")
        expect(streamDraft).not.toHaveBeenCalled()
    })
})
