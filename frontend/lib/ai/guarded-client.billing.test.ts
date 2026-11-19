import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * No free calls (2026-11-19): the gate charges every call to a billing group, refuses one with no
 * group to charge, and hands out a client that meters itself, so no route can forget to.
 */

const h = vi.hoisted(() => ({
    creditCap: vi.fn(async () => {}),
    personLimit: vi.fn(async () => {}),
    record: vi.fn(async () => ({ credits: 1, costMicros: 100 })),
    firmGroup: vi.fn(async () => ({ groupId: 'g-of-f1' }) as { groupId: string } | null),
    create: vi.fn(async () => ({ stop_reason: 'end_turn', content: [], usage: { input_tokens: 10, output_tokens: 5 } })),
}))

vi.mock('./client', () => ({ getAnthropic: () => ({ messages: { create: h.create } }) }))
vi.mock('./credit-cap', () => ({
    assertWithinAiCreditCap: h.creditCap,
    AiCreditLimitError: class AiCreditLimitError extends Error {
        constructor(message: string, readonly kind: string, readonly limit: number, readonly used: number) { super(message) }
    },
}))
vi.mock('./person-limit', () => ({ assertWithinPersonLimits: h.personLimit }))
vi.mock('./usage', () => ({ recordAiUsage: h.record }))
vi.mock('@/lib/prisma', () => ({ prisma: { firm: { findUnique: h.firmGroup } } }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { assertCanCallAi, getGuardedAnthropic } from './guarded-client'

beforeEach(() => {
    h.creditCap.mockClear()
    h.personLimit.mockClear()
    h.record.mockClear()
    h.create.mockClear()
    h.firmGroup.mockReset().mockResolvedValue({ groupId: 'g-of-f1' })
})

describe('getGuardedAnthropic · billing', () => {
    it("charges the firm's group, checking its credits by that group", async () => {
        const client = await getGuardedAnthropic({ firmId: 'f1', userId: 'u1', feature: 'chat' }, { vault: null })
        expect(h.creditCap).toHaveBeenCalledWith({ groupId: 'g-of-f1', feature: 'chat' })
        await client!.messages.create({ model: 'claude-haiku-5-5', max_tokens: 100, messages: [] } as never)
        expect(h.record).toHaveBeenCalledTimes(1)
        expect(h.record).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'g-of-f1', firmId: 'f1', userId: 'u1', feature: 'chat', status: 'ok' }))
    })

    it('uses a group the scope names, without looking up the firm', async () => {
        await getGuardedAnthropic({ groupId: 'g9', userId: 'u1', feature: 'raidCheck' }, { vault: null })
        expect(h.firmGroup).not.toHaveBeenCalled()
        expect(h.creditCap).toHaveBeenCalledWith({ groupId: 'g9', feature: 'raidCheck' })
    })

    it('refuses a call with no group to charge, before any check or token', async () => {
        h.firmGroup.mockResolvedValue(null)
        const error = await getGuardedAnthropic({ firmId: 'f-gone', userId: 'u1', feature: 'chat' }, { vault: null }).catch((e) => e)
        expect(error.kind).toBe('unbillable')
        expect(h.creditCap).not.toHaveBeenCalled()
        expect(h.create).not.toHaveBeenCalled()
    })

    it('refuses a scope with neither a group nor a firm', async () => {
        await expect(getGuardedAnthropic({ userId: 'u1', feature: 'dayBrief' }, { vault: null })).rejects.toMatchObject({ kind: 'unbillable' })
    })
})

describe('assertCanCallAi', () => {
    it("runs the group's checks without a client", async () => {
        await assertCanCallAi({ firmId: 'f1', userId: 'u1', feature: 'brief' })
        expect(h.creditCap).toHaveBeenCalledWith({ groupId: 'g-of-f1', feature: 'brief' })
    })

    it('refuses with no group, as the gate does', async () => {
        h.firmGroup.mockResolvedValue(null)
        await expect(assertCanCallAi({ firmId: 'f1', feature: 'brief' })).rejects.toMatchObject({ kind: 'unbillable' })
    })
})
