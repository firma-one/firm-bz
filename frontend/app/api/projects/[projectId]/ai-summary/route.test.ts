import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * The engagement summary's failure words: out of credits answers the limit's own message (the gate
 * throws before the stream, so the outer catch must answer it), and a model failure reads as Brio's.
 */

const { creditCap, LimitError, create } = vi.hoisted(() => {
    class LimitError extends Error {
        kind = 'period' as const
        limit = 500
        used = 500
    }
    return { creditCap: vi.fn(async () => {}), LimitError, create: vi.fn() }
})

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }),
}))
vi.mock('@/lib/resolve-project-context', () => ({
    resolveProjectContext: async () => ({ firmId: 'f1', clientId: 'c1', projectId: 'p1' }),
}))
vi.mock('@/lib/permission-helpers', () => ({ canManageProject: async () => true }))
vi.mock('@/lib/engagement-access', () => ({ blockIfEngagementCompleted: async () => null }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/ai/client', () => ({
    isAiConfigured: () => true,
    AI_MODEL: 'test-model',
    getAnthropic: () => ({ messages: { create } }),
}))
vi.mock('@/lib/ai/credit-cap', () => ({ assertWithinAiCreditCap: creditCap, AiCreditLimitError: LimitError }))
vi.mock('@/lib/ai/usage', () => ({ recordAiUsage: vi.fn() }))
vi.mock('@/lib/insights/engagement-insights', () => ({ computeEngagementInsights: async () => ({}) }))
vi.mock('@/lib/ai/engagement-chat', () => ({ buildEngagementContext: () => 'snapshot' }))
vi.mock('@/lib/ai/engagement-summary', () => ({
    SUMMARY_SYSTEM_PROMPT: 'system',
    fingerprintInsights: () => 'fp',
    readInsightsSummary: () => ({ draft: null }),
}))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagement: {
            findFirst: async () => ({ settings: {}, name: 'Audit', description: null, tags: [], contractType: null, client: { name: 'Acme' } }),
            update: vi.fn(async () => ({})),
        },
    },
}))

import { POST } from './route'

const post = () =>
    POST(new NextRequest('http://localhost/api/projects/p1/ai-summary', { method: 'POST' }), { params: Promise.resolve({ projectId: 'p1' }) })

async function lines(res: Response) {
    return (await res.text()).trim().split('\n').map((l) => JSON.parse(l))
}

beforeEach(() => {
    creditCap.mockReset()
    creditCap.mockResolvedValue(undefined)
    create.mockReset()
})

describe('POST /api/projects/[projectId]/ai-summary', () => {
    it('out of credits: answers 429 with the limit’s own words, and never reaches the model', async () => {
        creditCap.mockRejectedValue(new LimitError("You have used this month's 500 AI credits. They refill on Dec 1. Upgrade your plan for more."))
        const res = await post()
        expect(res.status).toBe(429)
        expect((await res.json()).error).toBe("You have used this month's 500 AI credits. They refill on Dec 1. Upgrade your plan for more.")
        expect(create).not.toHaveBeenCalled()
    })

    it('the model refuses before streaming: Brio’s words, not "Internal server error"', async () => {
        create.mockRejectedValue(new Error('529 overloaded_error'))
        const res = await post()
        expect(res.status).toBe(500)
        expect((await res.json()).error).toBe("Brio couldn't write a summary. Try again.")
    })

    it('the stream breaks part-way: an error event in Brio’s words, nothing saved', async () => {
        create.mockResolvedValue({
            controller: { abort: vi.fn() },
            async *[Symbol.asyncIterator]() {
                yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Half a ' } }
                throw new Error('stream reset')
            },
        })
        const out = await lines(await post())
        expect(out.map((l) => l.type)).toEqual(['meta', 'delta', 'error'])
        expect(out[2].message).toBe("Brio couldn't write a summary. Try again.")
    })
})
