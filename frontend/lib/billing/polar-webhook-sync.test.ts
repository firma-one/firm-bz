import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/** BL-1: a paid subscription that matches no group reaches an operator and is retried. */

const { db, log } = vi.hoisted(() => ({
    db: { groups: new Set<string>() },
    log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({
    prisma: {
        group: { findUnique: vi.fn(async ({ where }: any) => (db.groups.has(where.id) ? { id: where.id } : null)) },
        $transaction: vi.fn(async () => undefined),
    },
}))
vi.mock('@/lib/logger', () => ({ logger: log }))
vi.mock('@/lib/billing/active-billing-subscription', () => ({
    findGroupIdByPolarCustomerId: vi.fn(async () => null),
    findGroupIdByPolarSubscriptionId: vi.fn(async () => null),
}))
vi.mock('@/lib/billing/billing-user-session-sync', () => ({ refreshBillingPlanForFirmGroupUsers: vi.fn() }))
vi.mock('@/lib/billing/subscription-audit', () => ({ resolveSubscriptionAuditUserId: vi.fn(async () => null) }))
vi.mock('@/lib/onboarding/advance-past-subscribe-on-paid', () => ({ advanceOnboardingPastSubscribeForBillingAnchor: vi.fn() }))
vi.mock('@/lib/billing/polar-client', () => ({ polarServer: () => (process.env.POLAR_SERVER === 'production' ? 'production' : 'sandbox') }))

import { syncFirmSubscriptionFromPolarEvent } from './polar-webhook-sync'
import { PolarWebhookRetryError } from './polar-webhook-retry'

function payload(over: { status?: string; productId?: string; metadata?: Record<string, string>; timestamp?: Date } = {}) {
    return {
        type: 'subscription.active',
        timestamp: over.timestamp ?? new Date(),
        data: {
            id: 'sub_1',
            status: over.status ?? 'active',
            customerId: 'cus_1',
            checkoutId: 'chk_1',
            productId: over.productId ?? 'prod_standard',
            customer: { id: 'cus_1', externalId: 'gone-group' },
            metadata: over.metadata ?? {},
        },
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    db.groups = new Set()
    vi.stubEnv('POLAR_SERVER', 'production')
    vi.stubEnv('POLAR_FREE_PRODUCT_ID', 'prod_free')
})
afterEach(() => vi.unstubAllEnvs())

describe('syncFirmSubscriptionFromPolarEvent with no matching group', () => {
    it('logs an error with the ids and throws, so the webhook fails and Polar retries', async () => {
        await expect(syncFirmSubscriptionFromPolarEvent(payload())).rejects.toBeInstanceOf(PolarWebhookRetryError)
        expect(log.error).toHaveBeenCalledTimes(1)
        const [, err, , meta] = log.error.mock.calls[0]
        expect(err).toBeInstanceOf(Error)
        expect(meta).toMatchObject({ subscriptionId: 'sub_1', checkoutId: 'chk_1', customerId: 'cus_1' })
    })

    it('gives up (logged, not thrown) once the event is past the retry window', async () => {
        const old = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
        await expect(syncFirmSubscriptionFromPolarEvent(payload({ timestamp: old }))).resolves.toBeNull()
        expect(log.error).toHaveBeenCalledTimes(1)
        expect(String(log.error.mock.calls[0][0])).toContain('giving up')
    })

    it('only warns for a free or ended subscription: nobody paid for it', async () => {
        await expect(syncFirmSubscriptionFromPolarEvent(payload({ productId: 'prod_free' }))).resolves.toBeNull()
        await expect(syncFirmSubscriptionFromPolarEvent(payload({ status: 'canceled' }))).resolves.toBeNull()
        expect(log.error).not.toHaveBeenCalled()
        expect(log.warn).toHaveBeenCalled()
    })

    it('only warns on a sandbox Polar organization, which every environment shares', async () => {
        vi.stubEnv('POLAR_SERVER', 'sandbox')
        await expect(syncFirmSubscriptionFromPolarEvent(payload())).resolves.toBeNull()
        expect(log.error).not.toHaveBeenCalled()
    })

    it("falls back to the group our checkout named in metadata when the customer's external id is stale", async () => {
        db.groups.add('real-group')
        const r = await syncFirmSubscriptionFromPolarEvent(payload({ metadata: { groupId: 'real-group' } }))
        expect(r?.groupId).toBe('real-group')
        expect(log.error).not.toHaveBeenCalled()
    })
})
