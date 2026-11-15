import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The one gate to the model: the group's credits, then the person's own limits, before any token is
 * spent; over either, the route answers 429 in the limit's words.
 */

const h = vi.hoisted(() => ({
    order: [] as string[],
    creditCap: vi.fn(),
    personLimit: vi.fn(),
    client: { messages: {} },
}))

vi.mock('./client', () => ({ getAnthropic: () => h.client }))
vi.mock('./credit-cap', () => ({
    assertWithinAiCreditCap: h.creditCap,
    AiCreditLimitError: class AiCreditLimitError extends Error {
        constructor(message: string, readonly kind: string, readonly limit: number, readonly used: number) { super(message) }
    },
}))
vi.mock('./person-limit', () => ({ assertWithinPersonLimits: h.personLimit }))
vi.mock('./usage', () => ({ recordAiUsage: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { AiCreditLimitError, aiFailureResponse, getGuardedAnthropic } from './guarded-client'

beforeEach(() => {
    h.order = []
    h.creditCap.mockReset().mockImplementation(async () => { h.order.push('credits') })
    h.personLimit.mockReset().mockImplementation(async () => { h.order.push('person') })
})

describe('getGuardedAnthropic', () => {
    it("checks the group's credits, then the person's own limits, for every feature, free ones too", async () => {
        expect(await getGuardedAnthropic({ firmId: 'f1', userId: 'u1', feature: 'dayBrief' }, { vault: null })).toBe(h.client)
        expect(h.order).toEqual(['credits', 'person'])
        expect(h.personLimit).toHaveBeenCalledWith({ userId: 'u1', feature: 'dayBrief' })
    })

    it("doesn't count a call the group's credits refused against the person", async () => {
        h.creditCap.mockRejectedValue(new AiCreditLimitError('out of credits', 'period', 25, 25))
        await expect(getGuardedAnthropic({ firmId: 'f1', userId: 'u1', feature: 'chat' }, { vault: null })).rejects.toThrow('out of credits')
        expect(h.personLimit).not.toHaveBeenCalled()
    })

    it("over the person's limit, gives no client, and the route answers 429 in the limit's words", async () => {
        h.personLimit.mockRejectedValue(new AiCreditLimitError('Wait a moment and try again.', 'person', 10, 10))
        const error = await getGuardedAnthropic({ firmId: 'f1', userId: 'u1', feature: 'chat' }, { vault: null }).catch((e) => e)
        const res = aiFailureResponse(error, 'Brio failed.', 'test')
        expect(res.status).toBe(429)
        expect(await res.json()).toMatchObject({ error: 'Wait a moment and try again.', kind: 'person' })
    })
})
