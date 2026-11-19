import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * The engagement summary's failure words: out of credits answers the limit's own message (the gate
 * throws before the stream, so the outer catch must answer it), and a model failure reads as Brio's.
 */

const { creditCap, LimitError, create, record } = vi.hoisted(() => {
    class LimitError extends Error {
        kind = 'period' as const
        limit = 500
        used = 500
    }
    return { creditCap: vi.fn(async () => {}), LimitError, create: vi.fn(), record: vi.fn(async () => ({ credits: 1, costMicros: 1000 })) }
})

// Masking has its own tests (lib/ai/pseudonymize, masked-client, known-entities): no vault here.
vi.mock('@/lib/ai/known-entities', () => ({ vaultForEngagement: async () => null, vaultForFirms: async () => null }))
vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }),
}))
vi.mock('@/lib/resolve-project-context', () => ({
    resolveProjectContext: async () => ({ firmId: 'f1', clientId: 'c1', projectId: 'p1' }),
}))
vi.mock('@/lib/permission-helpers', () => ({ canManageProject: async () => true }))
vi.mock('@/lib/engagement-access', () => ({ blockIfEngagementCompleted: async () => null }))
const { warn } = vi.hoisted(() => ({ warn: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn } }))
vi.mock('@/lib/ai/client', () => ({
    isAiConfigured: () => true,
    AI_MODEL: 'test-model',
    AI_EFFORT: { summary: 'medium' },
    getAnthropic: () => ({ messages: { create } }),
}))
vi.mock('@/lib/ai/credit-cap', () => ({ assertWithinAiCreditCap: creditCap, AiCreditLimitError: LimitError }))
vi.mock('@/lib/ai/usage', () => ({ recordAiUsage: record }))
vi.mock('@/lib/insights/engagement-insights', () => ({ computeEngagementInsights: async () => ({}) }))
vi.mock('@/lib/ai/engagement-chat', () => ({ buildEngagementContext: () => 'snapshot' }))
vi.mock('@/lib/ai/engagement-summary', () => ({
    SUMMARY_MAX_TOKENS: 8000,
    SUMMARY_SYSTEM_PROMPT: 'system',
    fingerprintInsights: () => 'fp',
    readInsightsSummary: () => ({ draft: null }),
}))
const { engagementUpdate, findUnique } = vi.hoisted(() => ({
    engagementUpdate: vi.fn(async () => ({})),
    findUnique: vi.fn(async () => ({ settings: {} as Record<string, unknown> })),
}))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        // The billing group the gate charges the call to (lib/ai/guarded-client.ts).
        firm: { findUnique: async () => ({ groupId: 'g1' }) },
        engagement: {
            findFirst: async () => ({ settings: {}, name: 'Audit', description: null, tags: [], contractType: null, client: { name: 'Acme' } }),
            findUnique,
            update: engagementUpdate,
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
    record.mockClear()
    engagementUpdate.mockClear()
    findUnique.mockReset()
    findUnique.mockResolvedValue({ settings: {} })
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
        expect(engagementUpdate).not.toHaveBeenCalled()
        // Charged for what it spent before it broke, an estimate (lib/ai/metered-client.ts).
        expect(record).toHaveBeenCalledTimes(1)
        expect(record).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'g1', feature: 'summary', status: 'error', estimated: true }))
    })

    it('thinking spends the whole cap and no text comes: an error event, logged with why, nothing saved', async () => {
        // Production, 2026-11-19: ~12s of thinking, max_tokens, zero characters. It used to leave no log line.
        warn.mockClear()
        create.mockResolvedValue({
            controller: { abort: vi.fn() },
            async *[Symbol.asyncIterator]() {
                yield { type: 'message_start', message: { usage: { input_tokens: 4000 } } }
                yield { type: 'message_delta', delta: { stop_reason: 'max_tokens' }, usage: { output_tokens: 8000 } }
            },
        })
        const out = await lines(await post())
        expect(out.map((l) => l.type)).toEqual(['meta', 'error'])
        // Says why: it ran out of room, not a bare "couldn't".
        expect(out[1].message).toBe('Brio ran out of room before finishing the summary. Nothing was saved. Try again.')
        expect(engagementUpdate).not.toHaveBeenCalled()
        expect(warn).toHaveBeenCalledWith('AI summary not saved', 'AiSummary', expect.objectContaining({
            stopReason: 'max_tokens', textChars: 0,
        }))
        // The thinking was paid for: metered, as cut off.
        expect(record).toHaveBeenCalledTimes(1)
        expect(record).toHaveBeenCalledWith(expect.objectContaining({
            groupId: 'g1', feature: 'summary', inputTokens: 4000, outputTokens: 8000, status: 'cut_off', stopReason: 'max_tokens',
        }))
    })

    it('a declined summary says so, and saves nothing', async () => {
        create.mockResolvedValue({
            controller: { abort: vi.fn() },
            async *[Symbol.asyncIterator]() {
                yield { type: 'message_start', message: { usage: { input_tokens: 4000 } } }
                yield { type: 'message_delta', delta: { stop_reason: 'refusal' }, usage: { output_tokens: 10 } }
            },
        })
        const out = await lines(await post())
        expect(out.map((l) => l.type)).toEqual(['meta', 'error'])
        expect(out[1].message).toBe('Brio declined to write the summary. Nothing was saved.')
        expect(engagementUpdate).not.toHaveBeenCalled()
        expect(record).toHaveBeenCalledWith(expect.objectContaining({ feature: 'summary', status: 'refused' }))
    })

    it('an empty answer says so, and saves nothing', async () => {
        create.mockResolvedValue({
            controller: { abort: vi.fn() },
            async *[Symbol.asyncIterator]() {
                yield { type: 'message_start', message: { usage: { input_tokens: 4000 } } }
                yield { type: 'content_block_delta', delta: { type: 'text_delta', text: '  ' } }
                yield { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 10 } }
            },
        })
        const out = await lines(await post())
        expect(out.at(-1)).toEqual({ type: 'error', message: 'Brio came back with nothing for the summary. Nothing was saved. Try again.' })
        expect(engagementUpdate).not.toHaveBeenCalled()
    })

    it('saves onto the settings as they are when the stream ends, not as they were when it began', async () => {
        // A memo saved while the summary was being written must survive the save.
        findUnique.mockResolvedValue({ settings: { internalMemo: 'saved meanwhile' } })
        create.mockResolvedValue({
            controller: { abort: vi.fn() },
            async *[Symbol.asyncIterator]() {
                yield { type: 'message_start', message: { usage: { input_tokens: 10 } } }
                yield { type: 'content_block_delta', delta: { type: 'text_delta', text: '## Summary\nOn track.' } }
                yield { type: 'message_delta', usage: { output_tokens: 5 } }
            },
        })
        const out = await lines(await post())
        expect(out.map((l) => l.type)).toEqual(['meta', 'delta', 'done'])
        expect(engagementUpdate).toHaveBeenCalledWith(expect.objectContaining({
            data: { settings: expect.objectContaining({ internalMemo: 'saved meanwhile' }) },
        }))
        // Metered once, by the client, with the model's own counts.
        expect(record).toHaveBeenCalledTimes(1)
        expect(record).toHaveBeenCalledWith(expect.objectContaining({
            groupId: 'g1', firmId: 'f1', userId: 'u1', feature: 'summary', inputTokens: 10, outputTokens: 5, status: 'ok', estimated: false,
        }))
    })

    it('the reader leaving does not stop the model: the summary is finished and saved for when they come back', async () => {
        const abort = vi.fn()
        let release!: () => void
        const gate = new Promise<void>((resolve) => { release = resolve })
        create.mockResolvedValue({
            controller: { abort },
            async *[Symbol.asyncIterator]() {
                yield { type: 'message_start', message: { usage: { input_tokens: 10 } } }
                yield { type: 'content_block_delta', delta: { type: 'text_delta', text: '## Summary\n' } }
                // The reader leaves here, mid-answer.
                await gate
                yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'On track.' } }
                yield { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } }
            },
        })
        const res = await post()
        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let seen = ''
        while (!seen.includes('"delta"')) seen += decoder.decode((await reader.read()).value)
        await reader.cancel()
        release()

        await vi.waitFor(() => expect(engagementUpdate).toHaveBeenCalled())
        expect(abort).not.toHaveBeenCalled()
        expect(engagementUpdate).toHaveBeenCalledWith(expect.objectContaining({
            data: { settings: expect.objectContaining({
                insightsSummary: expect.objectContaining({ draft: expect.objectContaining({ text: '## Summary\nOn track.', status: 'pending_review' }) }),
            }) },
        }))
        await vi.waitFor(() => expect(record).toHaveBeenCalledTimes(1))
        expect(record).toHaveBeenCalledWith(expect.objectContaining({ feature: 'summary', status: 'ok', inputTokens: 10, outputTokens: 5 }))
    })
})
