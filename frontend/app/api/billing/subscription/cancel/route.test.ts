import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/** P2-53: the (uncalled) cancel route says Polar's reason, and a failure after Polar canceled still answers ok. */

const { polar, db } = vi.hoisted(() => ({
    polar: { fail: null as unknown },
    db: { updateFails: false },
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) } }),
}))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        firmMember: { findFirst: vi.fn(async () => ({ id: 'm' })) },
        subscription: {
            update: vi.fn(async () => {
                if (db.updateFails) throw new Error('db down')
                return {}
            }),
        },
    },
}))
vi.mock('@/lib/billing/active-billing-subscription', () => ({
    getActiveSubscriptionForGroup: vi.fn(async () => ({ id: 's1', polarSubscriptionId: 'sub_1' })),
}))
vi.mock('@/lib/billing/billing-group', () => ({ resolveGroupId: vi.fn(async () => 'g1') }))
vi.mock('@/lib/billing/billing-user-session-sync', () => ({ refreshBillingPlanForFirmGroupUsers: vi.fn() }))
vi.mock('@/lib/billing/polar-client', () => ({
    createPolarClient: () => ({
        subscriptions: {
            update: async () => {
                if (polar.fail) throw polar.fail
                return { currentPeriodEnd: new Date('2026-12-01T00:00:00Z'), cancelAtPeriodEnd: true }
            },
        },
    }),
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))

import { POST } from './route'

const cancel = () =>
    POST(new NextRequest(new URL('/api/billing/subscription/cancel', 'http://localhost'), { method: 'POST', body: JSON.stringify({ firmId: 'f1' }) }))

beforeEach(() => {
    process.env.POLAR_ACCESS_TOKEN = 'tok'
    polar.fail = null
    db.updateFails = false
})

describe('POST /api/billing/subscription/cancel', () => {
    it("answers Polar's refusal with words, plan unchanged", async () => {
        polar.fail = Object.assign(new Error('x'), { name: 'ConnectionError' })
        const res = await cancel()
        expect(res.status).toBe(502)
        expect((await res.json()).error).toMatch(/Your plan is unchanged/)
    })

    it('answers ok with a warning when Polar canceled but saving it here failed', async () => {
        db.updateFails = true
        const res = await cancel()
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.ok).toBe(true)
        expect(body.warning).toMatch(/Billing may take a minute/)
    })
})
