import { describe, it, expect, vi, beforeEach } from 'vitest'

const { meter, create } = vi.hoisted(() => ({ meter: vi.fn(async () => {}), create: vi.fn() }))
vi.mock('./guarded-client', () => ({
    getGuardedAnthropic: async () => ({ messages: { create } }),
    meterAiCall: meter,
}))
vi.mock('./client', () => ({ AI_MODEL: 'model', completeText: vi.fn() }))
vi.mock('./credit-cap', () => ({ assertWithinAiCreditCap: vi.fn() }))

import { streamFirmBrief } from './firm-brief'
import type { FirmInsightsResponse } from '@/app/api/firms/[firmId]/insights/route'

const DATA = {
    clientCounts: { ACTIVE: 1, PROSPECT: 0, ON_HOLD: 0, PAST: 0 }, activeEngagements: 1, totalEngagementCount: 1,
    engagementStatusBreakdown: { PLANNED: 0, ACTIVE: 1, PAUSED: 0 }, overdueDueDates: 0, nearingDueDates: 0,
    clientPipelineBreakdown: [], pipelineValue: 0, closingSoonValue: 0, revenueAtRisk: 0, currencySymbol: '$',
} as unknown as FirmInsightsResponse

/** A model stream: its start, a text delta per piece, and the end with the output tokens. */
async function* events(pieces: string[], signal?: AbortController) {
    yield { type: 'message_start', message: { usage: { input_tokens: 100 } } }
    for (let i = 0; i < pieces.length; i++) {
        if (signal && i === 1) signal.abort()
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: pieces[i] } }
    }
    yield { type: 'message_delta', usage: { output_tokens: 20 } }
}

beforeEach(() => { meter.mockClear(); create.mockReset() })

describe('streamFirmBrief', () => {
    it('hands each piece over as it is written, and meters the whole call once', async () => {
        create.mockResolvedValue(events(['## Where things stand\n', 'All quiet.']))
        const seen: string[] = []
        const content = await streamFirmBrief(DATA, { firmId: 'f1', userId: 'u1' }, (t) => seen.push(t))
        expect(seen).toEqual(['## Where things stand\n', 'All quiet.'])
        expect(content).toBe('## Where things stand\nAll quiet.')
        expect(create).toHaveBeenCalledWith(expect.objectContaining({ stream: true }), expect.anything())
        expect(meter).toHaveBeenCalledWith({ firmId: 'f1', userId: 'u1', feature: 'brief' }, { inputTokens: 100, outputTokens: 20 })
    })

    it('stopped part-way: returns nothing and is not charged', async () => {
        const ctrl = new AbortController()
        create.mockResolvedValue(events(['First. ', 'Second.'], ctrl))
        const content = await streamFirmBrief(DATA, { firmId: 'f1' }, () => {}, ctrl.signal)
        expect(content).toBeNull()
        expect(meter).not.toHaveBeenCalled()
    })

    it('returns nothing for an empty answer', async () => {
        create.mockResolvedValue(events(['  ']))
        expect(await streamFirmBrief(DATA, { firmId: 'f1' }, () => {})).toBeNull()
    })
})
