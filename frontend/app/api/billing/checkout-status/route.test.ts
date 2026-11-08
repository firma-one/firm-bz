import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/** P1-27, BL-1: the success page asks whether the plan really is active before saying so. */

const { polar, db, log } = vi.hoisted(() => ({
    polar: { checkout: null as any, fail: null as unknown },
    db: { active: null as any, member: true },
    log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'me@acme.test' } } }) } }),
}))
vi.mock('@/lib/prisma', () => ({ prisma: { firmMember: { findFirst: vi.fn(async () => (db.member ? { id: 'm' } : null)) } } }))
vi.mock('@/lib/billing/active-billing-subscription', () => ({ getActiveSubscriptionForGroup: vi.fn(async () => db.active) }))
vi.mock('@/lib/billing/polar-client', () => ({
    createPolarClient: () => ({
        checkouts: {
            get: async () => {
                if (polar.fail) throw polar.fail
                return polar.checkout
            },
        },
    }),
}))
vi.mock('@/lib/logger', () => ({ logger: log }))

import { GET } from './route'

const ask = (q = 'checkoutId=chk_1') => GET(new NextRequest(new URL(`/api/billing/checkout-status?${q}`, 'http://localhost')))

beforeEach(() => {
    vi.clearAllMocks()
    process.env.POLAR_ACCESS_TOKEN = 'tok'
    polar.fail = null
    polar.checkout = {
        status: 'succeeded',
        customerEmail: 'other@x.test',
        externalCustomerId: 'g1',
        metadata: {},
        subscriptionId: null,
        product: { name: 'Standard' },
        products: [{ name: 'Standard' }],
    }
    db.active = { plan: 'Free', polarSubscriptionId: 'sub_free' }
    db.member = true
})

describe('GET /api/billing/checkout-status', () => {
    it('is "activating" while the group still shows the old plan', async () => {
        expect(await (await ask()).json()).toEqual({ state: 'activating' })
        expect(log.error).not.toHaveBeenCalled()
    })

    it('is "active" once the group shows the plan that was bought', async () => {
        db.active = { plan: 'Standard', polarSubscriptionId: 'sub_2' }
        expect(await (await ask()).json()).toEqual({ state: 'active' })
    })

    it('alerts an operator when the page gives up waiting on a paid checkout', async () => {
        await ask('checkoutId=chk_1&final=1')
        expect(log.error).toHaveBeenCalledTimes(1)
        expect(log.error.mock.calls[0][3]).toMatchObject({ checkoutId: 'chk_1', groupId: 'g1' })
    })

    it('is "not_paid" when Polar says the checkout expired or failed', async () => {
        polar.checkout.status = 'expired'
        expect(await (await ask()).json()).toEqual({ state: 'not_paid' })
    })

    it("refuses someone outside the checkout's billing group", async () => {
        db.member = false
        expect((await ask()).status).toBe(403)
    })

    it("answers Polar's failure in words", async () => {
        polar.fail = Object.assign(new Error('x'), { name: 'ConnectionError' })
        const res = await ask()
        expect(res.status).toBe(502)
        expect((await res.json()).error).toMatch(/didn't answer/)
    })
})
