import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/** BL-1, P2-49: a failed Polar webhook answers 500 so Polar retries, but not past the retry window. */

const { handler, log } = vi.hoisted(() => ({
    handler: { impl: (async () => new Response(JSON.stringify({ received: true }))) as (req: NextRequest) => Promise<Response> },
    log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock('@polar-sh/nextjs', () => ({ Webhooks: () => (req: NextRequest) => handler.impl(req) }))
vi.mock('@/lib/logger', () => ({ logger: log }))
vi.mock('@/lib/billing/polar-webhook-sync', () => ({ syncFirmSubscriptionFromPolarEvent: vi.fn() }))
vi.mock('@/lib/billing/billing-user-session-sync', () => ({ refreshBillingPlanForFirmGroupUsers: vi.fn() }))
vi.mock('@/lib/billing/polar-billing-lifecycle', () => ({
    maybeRevokeFreePolarAfterPaidSubscriptionSync: vi.fn(),
    resyncGroupFreePlanAfterPaidSubscriptionEnd: vi.fn(),
    createSubscriptionCancellationRemindersForAdmins: vi.fn(),
    clearSubscriptionCancellationRemindersForAdmins: vi.fn(),
}))

import { POST } from './route'
import { PolarWebhookRetryError } from '@/lib/billing/polar-webhook-retry'

function webhook(timestamp: Date) {
    return new NextRequest('http://localhost/api/webhooks/polar', {
        method: 'POST',
        body: JSON.stringify({ type: 'subscription.active', timestamp: timestamp.toISOString(), data: { id: 'sub_1' } }),
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    process.env.POLAR_WEBHOOK_SECRET = 'whsec'
})

describe('POST /api/webhooks/polar', () => {
    it('answers 500 when a handler fails, so Polar delivers the event again', async () => {
        handler.impl = async (req) => {
            await req.text()
            throw new PolarWebhookRetryError('Paid Polar subscription sub_1 matches no billing group')
        }
        const res = await POST(webhook(new Date()))
        expect(res.status).toBe(500)
        // Already logged where it was thrown: not logged twice.
        expect(log.error).not.toHaveBeenCalled()
    })

    it('logs any other failure as an error', async () => {
        handler.impl = async () => {
            throw new Error('database is down')
        }
        const res = await POST(webhook(new Date()))
        expect(res.status).toBe(500)
        expect(log.error).toHaveBeenCalledTimes(1)
    })

    it('acknowledges an event still failing after the retry window, and says it gave up', async () => {
        handler.impl = async () => {
            throw new Error('still broken')
        }
        const res = await POST(webhook(new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)))
        expect(res.status).toBe(200)
        expect(await res.json()).toMatchObject({ gaveUp: true })
        expect(String(log.error.mock.calls[0][0])).toContain('giving up')
    })
})
