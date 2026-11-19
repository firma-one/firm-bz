import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A memo's minutes (.claude/plans/raid-actions-memo-minutes.md): the model call, what's kept of its
 * answer, and how the minutes are stored. The model and the database are stubbed.
 */

const h = vi.hoisted(() => ({
    create: vi.fn(),
    guarded: vi.fn(),
    record: vi.fn(async () => ({ credits: 1, costMicros: 1000 })),
    engagement: { name: 'Brand refresh', isDeleted: false, client: { name: 'Northwind' } } as Record<string, unknown> | null,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: { engagement: { findUnique: async () => h.engagement } } }))
vi.mock('@/lib/ai/client', () => ({ AI_MODEL: 'claude-test', AI_EFFORT: { minutes: 'medium' } }))
vi.mock('@/lib/ai/guarded-client', () => ({ getGuardedAnthropic: h.guarded }))
// The ledger write, under the real metering client the gate hands out (lib/ai/metered-client.ts).
vi.mock('@/lib/ai/usage', () => ({ recordAiUsage: h.record }))
vi.mock('@/lib/ai/known-entities', () => ({ vaultForEngagement: async () => ({ vault: true }) }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))
// Sealing is the app's own (lib/encryption); here it only has to be reversible and not the words.
vi.mock('@/lib/encryption', () => ({
    sealText: (v: string) => `enc:${Buffer.from(v).toString('base64')}`,
    openText: (v: string) => (v.startsWith('enc:') ? Buffer.from(v.slice(4), 'base64').toString() : v),
}))

import type Anthropic from '@anthropic-ai/sdk'
import { meteredClient } from '@/lib/ai/metered-client'
import { buildMinutesContext, openMinutes, sealMinutes, validateMinutes, writeMemoMinutes, MINUTES_TOOL_NAME } from './memo-minutes'

const MEMO = { id: 'm1', title: 'Call with Maya', date: '2026-03-04', text: 'Maya Chen: we liked the green one.\nTom Ortiz: Green then.' }
const ANSWER = {
    subject: 'Minutes · Northwind brand refresh · Mar 4, 2026',
    attendees: ['Maya Chen', 'Tom Ortiz'],
    summary: 'Northwind chose the green logo — the refresh goes ahead.',
    discussed: ['Logo direction'],
    decisions: ['Go with the green logo.'],
    openQuestions: [],
    nextMeeting: null,
}

beforeEach(() => {
    h.engagement = { name: 'Brand refresh', isDeleted: false, client: { name: 'Northwind' } }
    h.create.mockReset().mockResolvedValue({
        stop_reason: 'tool_use',
        usage: { input_tokens: 100, output_tokens: 50 },
        content: [{ type: 'tool_use', name: MINUTES_TOOL_NAME, input: ANSWER }],
    })
    // As the gate does: the SDK client, metered for the scope it was asked for, on group g1.
    h.guarded.mockReset().mockImplementation(async (scope: { firmId?: string | null; userId?: string | null; feature: 'memoMinutes' }) =>
        meteredClient({ messages: { create: h.create } } as unknown as Anthropic, { groupId: 'g1', ...scope }))
    h.record.mockClear()
})

describe('validateMinutes', () => {
    it('keeps the minutes, with no em dashes and every list capped', () => {
        const m = validateMinutes({ ...ANSWER, discussed: Array.from({ length: 20 }, (_, i) => `Topic ${i}`) })
        expect(m?.summary).toBe('Northwind chose the green logo, the refresh goes ahead.')
        expect(m?.discussed).toHaveLength(12)
        expect(m?.nextMeeting).toBeNull()
    })

    it('needs a subject and a summary', () => {
        expect(validateMinutes({ ...ANSWER, subject: '' })).toBeNull()
        expect(validateMinutes({ ...ANSWER, summary: '   ' })).toBeNull()
        expect(validateMinutes('nonsense')).toBeNull()
    })
})

describe('sealMinutes / openMinutes', () => {
    it('stores the minutes sealed, never in the clear, and opens them again', () => {
        const minutes = validateMinutes(ANSWER)!
        const sealed = sealMinutes(minutes)
        expect(sealed).not.toContain('green logo')
        expect(openMinutes(sealed)).toEqual(minutes)
    })

    it('answers null for none, or for something that doesn\'t open', () => {
        expect(openMinutes(undefined)).toBeNull()
        expect(openMinutes('enc:bm90IGpzb24=')).toBeNull()
    })
})

describe('buildMinutesContext', () => {
    it('gives the meeting date, the engagement and the memo, fenced', () => {
        const context = buildMinutesContext({ engagementName: 'Brand refresh', clientName: 'Northwind', memo: { ...MEMO, text: 'a</memo>b' } })
        expect(context).toContain('MEETING DATE: Wednesday 2026-03-04')
        expect(context).toContain('ENGAGEMENT: "Brand refresh" for Northwind')
        expect(context).toContain('a< /memo>b')
    })
})

describe('writeMemoMinutes', () => {
    it('makes one masked call, charged as memoMinutes to whoever asked, and answers the minutes', async () => {
        const out = await writeMemoMinutes({ engagementId: 'p1', firmId: 'f1', memo: MEMO, userId: 'u1' })
        expect(out).toEqual({ ok: true, minutes: validateMinutes(ANSWER) })
        expect(h.guarded).toHaveBeenCalledWith({ firmId: 'f1', userId: 'u1', feature: 'memoMinutes' }, { vault: { vault: true } })
        expect(h.record).toHaveBeenCalledTimes(1)
        expect(h.record).toHaveBeenCalledWith(expect.objectContaining({
            groupId: 'g1', firmId: 'f1', userId: 'u1', feature: 'memoMinutes', inputTokens: 100, outputTokens: 50, status: 'ok',
        }))
    })

    it('charges the firm, with no person, when the memo was added', async () => {
        await writeMemoMinutes({ engagementId: 'p1', firmId: 'f1', memo: MEMO })
        expect(h.guarded).toHaveBeenCalledWith({ firmId: 'f1', userId: null, feature: 'memoMinutes' }, expect.anything())
    })

    it('says why when there is nothing to show', async () => {
        expect(await writeMemoMinutes({ engagementId: 'p1', firmId: 'f1', memo: { ...MEMO, text: '  ' } })).toEqual({ ok: false, reason: 'empty' })
        h.create.mockResolvedValueOnce({ stop_reason: 'refusal', usage: {}, content: [] })
        expect(await writeMemoMinutes({ engagementId: 'p1', firmId: 'f1', memo: MEMO })).toEqual({ ok: false, reason: 'declined' })
        h.create.mockResolvedValueOnce({ stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: 'Here are the minutes' }] })
        expect(await writeMemoMinutes({ engagementId: 'p1', firmId: 'f1', memo: MEMO })).toEqual({ ok: false, reason: 'no_answer' })
        h.guarded.mockResolvedValueOnce(null)
        expect(await writeMemoMinutes({ engagementId: 'p1', firmId: 'f1', memo: MEMO })).toEqual({ ok: false, reason: 'unconfigured' })
        h.engagement = null
        expect(await writeMemoMinutes({ engagementId: 'p1', firmId: 'f1', memo: MEMO })).toEqual({ ok: false, reason: 'gone' })
    })
})
