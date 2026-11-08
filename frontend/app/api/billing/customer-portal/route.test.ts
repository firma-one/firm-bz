import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/** P1-25: opening billing says Polar's reason; an outage is never reported as "no customer". */

const { polar, db } = vi.hoisted(() => ({
    polar: { fail: null as unknown },
    db: { active: null as any },
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) } }),
}))
vi.mock('@/lib/prisma', () => ({ prisma: { firmMember: { findFirst: vi.fn(async () => ({ id: 'm' })) } } }))
vi.mock('@/lib/billing/active-billing-subscription', () => ({ getActiveSubscriptionForGroup: vi.fn(async () => db.active) }))
vi.mock('@/lib/billing/billing-group', () => ({ resolveGroupId: vi.fn(async () => 'g1') }))
vi.mock('@/lib/billing/polar-client', () => ({
    createPolarClient: () => ({
        customerSessions: {
            create: async () => {
                if (polar.fail) throw polar.fail
                return { customerPortalUrl: 'https://polar.test/portal' }
            },
        },
    }),
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))

import { POST } from './route'

const open = () =>
    POST(new NextRequest(new URL('/api/billing/customer-portal', 'http://localhost'), { method: 'POST', body: JSON.stringify({ firmId: 'f1' }) }))

beforeEach(() => {
    process.env.POLAR_ACCESS_TOKEN = 'tok'
    polar.fail = null
    db.active = null
})

describe('POST /api/billing/customer-portal', () => {
    it('answers the portal link', async () => {
        expect(await (await open()).json()).toEqual({ url: 'https://polar.test/portal' })
    })

    it("says Polar didn't answer on an outage, even with no stored customer id", async () => {
        polar.fail = Object.assign(new Error('timeout'), { name: 'RequestTimeoutError' })
        const res = await open()
        expect(res.status).toBe(502)
        expect((await res.json()).error).toMatch(/didn't answer/)
    })

    it("carries Polar's own detail for a refusal", async () => {
        polar.fail = Object.assign(new Error('422'), { statusCode: 422, body: JSON.stringify({ detail: 'Customer is locked' }) })
        expect((await (await open()).json()).error).toBe('Polar said: Customer is locked.')
    })

    it('says there is no paid plan yet only when Polar says the customer is not found', async () => {
        polar.fail = Object.assign(new Error('404'), { statusCode: 404, detail: 'Not found' })
        const res = await open()
        expect(res.status).toBe(409)
        expect((await res.json()).code).toBe('no_customer')
    })
})
