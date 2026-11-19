import { describe, it, expect, vi, beforeEach } from 'vitest'

const { record, create } = vi.hoisted(() => ({ record: vi.fn(async () => ({ credits: 1, costMicros: 1000 })), create: vi.fn() }))
// Masking has its own tests (lib/ai/pseudonymize, masked-client, known-entities): no vault here.
vi.mock('@/lib/ai/known-entities', () => ({ vaultForEngagement: async () => null, vaultForFirms: async () => null }))
// As the gate does: the SDK client, metered (lib/ai/metered-client.ts) for the scope it was asked for.
vi.mock('./guarded-client', async () => {
    const { meteredClient } = await import('./metered-client')
    return {
        getGuardedAnthropic: async (scope: { firmId?: string | null; userId?: string | null; feature: 'brief' }) =>
            meteredClient({ messages: { create } } as never, { groupId: 'g1', ...scope }),
    }
})
vi.mock('./usage', () => ({ recordAiUsage: record }))
vi.mock('./client', () => ({ AI_MODEL: 'model', AI_EFFORT: { brief: 'low' }, completeText: vi.fn() }))
vi.mock('./credit-cap', () => ({ assertWithinAiCreditCap: vi.fn() }))

import Anthropic from '@anthropic-ai/sdk'
import { streamFirmBrief } from './firm-brief'
import type { FirmInsightsResponse } from '@/app/api/firms/[firmId]/insights/route'

const DATA = {
    clientCounts: { ACTIVE: 1, PROSPECT: 0, ON_HOLD: 0, PAST: 0 }, activeEngagements: 1, totalEngagementCount: 1,
    engagementStatusBreakdown: { PLANNED: 0, ACTIVE: 1, PAUSED: 0 }, overdueDueDates: 0, nearingDueDates: 0,
    clientPipelineBreakdown: [], pipelineValue: 0, closingSoonValue: 0, revenueAtRisk: 0, currencySymbol: '$',
} as unknown as FirmInsightsResponse

/**
 * A model stream: its start, a text delta per piece, and the end with the output tokens. Stopped
 * after the first piece, it throws as the SDK does when its signal aborts.
 */
async function* events(pieces: string[], signal?: AbortController, stopReason = 'end_turn') {
    yield { type: 'message_start', message: { usage: { input_tokens: 100 } } }
    for (let i = 0; i < pieces.length; i++) {
        if (signal && i === 1) {
            signal.abort()
            throw new Anthropic.APIUserAbortError()
        }
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: pieces[i] } }
    }
    yield { type: 'message_delta', delta: { stop_reason: stopReason }, usage: { output_tokens: 20 } }
}

beforeEach(() => { record.mockClear(); create.mockReset() })

describe('streamFirmBrief', () => {
    it('hands each piece over as it is written, and meters the whole call once', async () => {
        create.mockResolvedValue(events(['## Where things stand\n', 'All quiet.']))
        const seen: string[] = []
        const content = await streamFirmBrief(DATA, { firmId: 'f1', userId: 'u1' }, (t) => seen.push(t))
        expect(seen).toEqual(['## Where things stand\n', 'All quiet.'])
        expect(content).toBe('## Where things stand\nAll quiet.')
        expect(create).toHaveBeenCalledWith(expect.objectContaining({ stream: true }), expect.anything())
        expect(record).toHaveBeenCalledTimes(1)
        expect(record).toHaveBeenCalledWith(expect.objectContaining({
            groupId: 'g1', firmId: 'f1', userId: 'u1', feature: 'brief', inputTokens: 100, outputTokens: 20, status: 'ok', estimated: false,
        }))
    })

    it('stopped part-way: returns nothing, and is charged for what it spent (estimated)', async () => {
        const ctrl = new AbortController()
        create.mockResolvedValue(events(['First. ', 'Second.'], ctrl))
        const content = await streamFirmBrief(DATA, { firmId: 'f1' }, () => {}, ctrl.signal)
        expect(content).toBeNull()
        expect(record).toHaveBeenCalledTimes(1)
        expect(record).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'g1', feature: 'brief', inputTokens: 100, status: 'cancelled', estimated: true }))
    })

    it('a declined brief returns nothing, and is metered as refused', async () => {
        create.mockResolvedValue(events(['Partial.'], undefined, 'refusal'))
        expect(await streamFirmBrief(DATA, { firmId: 'f1' }, () => {})).toBeNull()
        expect(record).toHaveBeenCalledTimes(1)
        expect(record).toHaveBeenCalledWith(expect.objectContaining({ feature: 'brief', status: 'refused', stopReason: 'refusal' }))
    })

    it('returns nothing for an empty answer', async () => {
        create.mockResolvedValue(events(['  ']))
        expect(await streamFirmBrief(DATA, { firmId: 'f1' }, () => {})).toBeNull()
    })
})
