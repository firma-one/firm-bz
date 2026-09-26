import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Validation of what the model returns. The model itself is mocked: these assert the guards that
 * stand between a hallucinated id and a search filter, which is where the security property lives.
 */
const mockCreate = vi.fn()

vi.mock('@/lib/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock('./guarded-client', () => ({
    getGuardedAnthropic: vi.fn(async () => ({ messages: { create: mockCreate } })),
}))

import { interpretSearchQuery, type InterpretCandidates } from './search-interpreter'

const candidates: InterpretCandidates = {
    clients: [{ id: 'client-acme', name: 'Acme Corp' }],
    engagements: [
        { id: 'eng-q2', name: 'Q2 Go-To-Market Positioning', clientId: 'client-acme' },
        { id: 'eng-legal', name: 'Legal Review', clientId: 'client-acme' },
    ],
    deliverables: [{ id: 'del-1', name: 'Market Report', engagementId: 'eng-q2' }],
}

const scope = { firmId: 'f1', userId: 'u1', feature: 'searchInterpret' as const }

/** Canned tool-use response, the shape the SDK returns. */
const toolUse = (input: Record<string, unknown>) => ({
    content: [{ type: 'tool_use', name: 'apply_filters', input }],
    usage: { input_tokens: 100, output_tokens: 20 },
})

// mockReset, not mockClear: mockImplementation persists across tests, so a throwing
// implementation would leak into every test declared after it.
beforeEach(() => mockCreate.mockReset())

describe('interpretSearchQuery — id validation', () => {
    it('keeps an id that exists in the candidate list', async () => {
        mockCreate.mockResolvedValue(toolUse({ clientId: 'client-acme', residualText: 'scope doc' }))
        const r = await interpretSearchQuery('Acme scope doc', candidates, scope)
        expect(r!.chips).toContainEqual({ stage: 'client', id: 'client-acme', name: 'Acme Corp' })
    })

    it('drops an id the model invented', async () => {
        // The candidate list is built from the caller's own access scope, so an id outside it is
        // either a hallucination or an attempt to reach another firm's data. Either way: dropped.
        mockCreate.mockResolvedValue(toolUse({ clientId: 'client-not-visible', residualText: 'x' }))
        const r = await interpretSearchQuery('other client', candidates, scope)
        expect(r!.chips).toHaveLength(0)
    })
})

describe('interpretSearchQuery — period tokens must not resolve as entities', () => {
    it('drops an engagement matched only on a quarter token', async () => {
        // The reported bug: "playbooks from Q2" set an Engagement filter of "Q2 Go-To-Market
        // Positioning". The user asked for a time period and got a scope filter that hid
        // everything else.
        mockCreate.mockResolvedValue(toolUse({
            clientId: 'client-acme', engagementId: 'eng-q2', residualText: 'playbooks',
        }))
        const r = await interpretSearchQuery('Acme playbooks from Q2', candidates, scope)
        expect(r!.chips.map((c) => c.stage)).not.toContain('engagement')
        expect(r!.chips.map((c) => c.stage)).toContain('client')
    })

    it('keeps an engagement the query genuinely names', async () => {
        mockCreate.mockResolvedValue(toolUse({
            engagementId: 'eng-q2', residualText: 'playbooks',
        }))
        const r = await interpretSearchQuery('Q2 Go-To-Market playbooks', candidates, scope)
        expect(r!.chips.map((c) => c.stage)).toContain('engagement')
    })
})

describe('interpretSearchQuery — dates', () => {
    it('accepts a known relative preset', async () => {
        mockCreate.mockResolvedValue(toolUse({ dateRange: 'Last 7 days', residualText: 'x' }))
        const r = await interpretSearchQuery('recent docs', candidates, scope)
        expect(r!.chips).toContainEqual({ stage: 'dateRange', id: 'Last 7 days', name: 'Last 7 days' })
    })

    it('rejects a preset that is not in the fixed list', async () => {
        mockCreate.mockResolvedValue(toolUse({ dateRange: 'Last 3 fortnights', residualText: 'x' }))
        const r = await interpretSearchQuery('odd range', candidates, scope)
        expect(r!.chips.map((c) => c.stage)).not.toContain('dateRange')
    })

    it('resolves an absolute period token', async () => {
        mockCreate.mockResolvedValue(toolUse({ period: 'Q1 2026', residualText: 'x' }))
        const r = await interpretSearchQuery('docs from Q1 2026', candidates, scope)
        expect(r!.chips).toContainEqual({ stage: 'dateRange', id: 'Q1 2026', name: 'Q1 2026' })
    })

    it('rejects an explicit date, which the grammar must never accept', async () => {
        // The model emits a period NAME and the server does the arithmetic. Accepting a raw date
        // is the failure that killed the 2026-07 chrono approach.
        mockCreate.mockResolvedValue(toolUse({ period: '2026-03-01', residualText: 'x' }))
        const r = await interpretSearchQuery('docs from March', candidates, scope)
        expect(r!.chips.map((c) => c.stage)).not.toContain('dateRange')
    })
})

describe('interpretSearchQuery — failure handling', () => {
    it('returns null when the model errors, so the caller falls back to plain search', async () => {
        mockCreate.mockImplementationOnce(() => { throw new Error('upstream failed') })
        expect(await interpretSearchQuery('anything', candidates, scope)).toBeNull()
    })

    it('returns null when the response carries no tool call', async () => {
        mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'sorry' }], usage: { input_tokens: 1, output_tokens: 1 } })
        expect(await interpretSearchQuery('anything', candidates, scope)).toBeNull()
    })
})
