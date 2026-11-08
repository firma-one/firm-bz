import { describe, it, expect, vi, beforeEach } from 'vitest'

/** P2-49: webhook side jobs that fail reach an operator and fail the webhook, so Polar retries. */

const { polar, log, free } = vi.hoisted(() => ({
    polar: {
        customers: { getStateExternal: vi.fn() },
        subscriptions: { revoke: vi.fn() },
    },
    log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
    free: { ensureGroupFreePlan: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({ prisma: { groupMember: { findFirst: vi.fn(async () => null) } } }))
vi.mock('@/lib/logger', () => ({ logger: log }))
vi.mock('@/lib/billing/polar-free-plan', () => free)
vi.mock('@/lib/reminders/reminder-service', () => ({ upsertFollowUpReminder: vi.fn() }))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/billing/polar-client', () => ({ createPolarClient: () => polar }))

import { revokeAllOtherPolarSubscriptions, resyncGroupFreePlanAfterPaidSubscriptionEnd } from './polar-billing-lifecycle'
import { PolarWebhookRetryError } from './polar-webhook-retry'

beforeEach(() => {
    vi.clearAllMocks()
    process.env.POLAR_ACCESS_TOKEN = 'tok'
})

describe('revokeAllOtherPolarSubscriptions', () => {
    it('throws a retry error (logged) when Polar state cannot be read', async () => {
        polar.customers.getStateExternal.mockRejectedValueOnce(new Error('503'))
        await expect(revokeAllOtherPolarSubscriptions({ groupId: 'g', keepSubscriptionId: 'keep' })).rejects.toBeInstanceOf(
            PolarWebhookRetryError
        )
        expect(log.error).toHaveBeenCalled()
    })

    it('revokes the others it can, then throws naming the ones it could not', async () => {
        polar.customers.getStateExternal.mockResolvedValueOnce({
            activeSubscriptions: [{ id: 'keep' }, { id: 'dup1' }, { id: 'dup2' }],
        })
        polar.subscriptions.revoke.mockImplementation(async ({ id }: { id: string }) => {
            if (id === 'dup2') throw new Error('nope')
        })
        await expect(revokeAllOtherPolarSubscriptions({ groupId: 'g', keepSubscriptionId: 'keep' })).rejects.toThrow(/dup2/)
        expect(polar.subscriptions.revoke).toHaveBeenCalledTimes(2)
    })

    it('counts one Polar already canceled as done', async () => {
        polar.customers.getStateExternal.mockResolvedValueOnce({ activeSubscriptions: [{ id: 'keep' }, { id: 'dup1' }] })
        polar.subscriptions.revoke.mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'AlreadyCanceledSubscription' }))
        await expect(revokeAllOtherPolarSubscriptions({ groupId: 'g', keepSubscriptionId: 'keep' })).resolves.toBeUndefined()
    })
})

describe('resyncGroupFreePlanAfterPaidSubscriptionEnd', () => {
    it('throws a retry error (logged) when the free plan cannot be restored', async () => {
        free.ensureGroupFreePlan.mockRejectedValueOnce(new Error('polar down'))
        await expect(resyncGroupFreePlanAfterPaidSubscriptionEnd('g')).rejects.toBeInstanceOf(PolarWebhookRetryError)
        expect(log.error).toHaveBeenCalled()
    })
})
