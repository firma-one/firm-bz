import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The dollar backstop (.claude/plans/ai-metering-by-tokens.md, decision 5): once a group's model spend
 * this month reaches its ceiling, Brio pauses for it, before credits are even looked at, and the group
 * admin and the system admins are told once.
 */

const h = vi.hoisted(() => ({
    sub: { plan: 'Standard', currentPeriodEnd: new Date('2026-12-05T00:00:00Z'), settings: {} } as Record<string, unknown> | null,
    period: { credits: 10, costMicros: 0 },
    notice: vi.fn(async () => {}),
}))

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/billing/active-billing-subscription', () => ({ getActiveSubscriptionForGroup: async () => h.sub }))
vi.mock('@/lib/billing/subscription-metadata', () => ({
    applyEntitlementOverrides: () => ({}),
    parseEntitledAiCredits: () => 500,
}))
vi.mock('./usage', async (orig) => ({
    ...(await orig<typeof import('./usage')>()),
    usageSince: async () => h.period,
    creditsUsedSince: async () => 0,
}))
vi.mock('./credit-pace-notify', () => ({ maybeNotifyCreditPace: async () => {} }))
vi.mock('./spend-ceiling-notice', () => ({ noticeSpendCeiling: h.notice }))

import { assertWithinAiCreditCap, aiCreditStatus } from './credit-cap'

beforeEach(() => {
    process.env.ENFORCE_BILLING_GATES = 'true'
    h.notice.mockClear()
    h.period = { credits: 10, costMicros: 0 }
})

describe('the dollar backstop', () => {
    it('lets a call through below the ceiling', async () => {
        h.period = { credits: 10, costMicros: 11_699_999 }
        await expect(assertWithinAiCreditCap({ groupId: 'g1', feature: 'chat' })).resolves.toBeUndefined()
        expect(h.notice).not.toHaveBeenCalled()
    })

    it('pauses Brio at the ceiling, with credits to spare, and tells the admins', async () => {
        h.period = { credits: 10, costMicros: 11_700_000 }
        const error = await assertWithinAiCreditCap({ groupId: 'g1', feature: 'chat' }).catch((e) => e)
        expect(error.kind).toBe('spend')
        expect(error.message).toMatch(/^Brio is paused for this workspace until /)
        expect(h.notice).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'g1', spentMicros: 11_700_000, ceilingMicros: 11_700_000 }))
    })

    it('reports the spend and the ceiling for display', async () => {
        h.period = { credits: 40, costMicros: 250_000 }
        const status = await aiCreditStatus('g1')
        expect(status).toMatchObject({ usedThisPeriod: 40, spentThisPeriodMicros: 250_000, spendCeilingMicros: 11_700_000 })
    })

    it('does nothing while billing gates are off', async () => {
        process.env.ENFORCE_BILLING_GATES = 'false'
        h.period = { credits: 10, costMicros: 99_000_000 }
        await expect(assertWithinAiCreditCap({ groupId: 'g1', feature: 'chat' })).resolves.toBeUndefined()
    })
})
