import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * P1-24: the plan buttons navigate the tab to /api/checkout, so a failure must land back on Billing
 * with the reason, never as raw JSON on a bare page. A fetch caller still gets JSON.
 */

const { who, db, polar, catalog } = vi.hoisted(() => ({
    who: { user: { id: 'u1' } as { id: string } | null },
    db: { firmAdmin: true },
    polar: { answer: (() => new Response(null, { status: 302, headers: { location: 'https://polar.test/c' } })) as () => Response },
    catalog: { impl: (async () => [{ id: 'prod-standard' }]) as () => Promise<{ id: string }[]> },
}))

vi.mock('@/lib/prisma', () => ({
    prisma: { firmMember: { findFirst: vi.fn(async () => (db.firmAdmin ? { id: 'm' } : null)) } },
}))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: who.user } }) } }) }))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: () => ({ auth: { getUser: async () => ({ data: { user: who.user }, error: null }) } }) }))
vi.mock('@polar-sh/nextjs', () => ({ Checkout: () => async () => polar.answer() }))
vi.mock('@/lib/billing/billing-group', () => ({ resolveGroupId: vi.fn(async () => 'own-group') }))
vi.mock('@/lib/billing/polar-client', () => ({ polarServer: () => 'sandbox' }))
vi.mock('@/lib/billing/polar-catalog', () => ({ fetchBillingCatalogPlans: vi.fn(() => catalog.impl()) }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))

import { GET } from './route'

/** A plan button press: a page navigation from Billing. */
const navigate = (q: string, referer = 'http://localhost/d/billing?firmSlug=acme') =>
    new NextRequest(new URL(`/api/checkout?${q}`, 'http://localhost'), {
        headers: { accept: 'text/html', 'sec-fetch-mode': 'navigate', referer },
    })

function errorOn(res: Response): { path: string; error: string | null; returnTo: string | null } {
    const loc = new URL(res.headers.get('location') ?? '', 'http://localhost')
    return { path: loc.pathname, error: loc.searchParams.get('checkout_error'), returnTo: loc.searchParams.get('returnTo') }
}

beforeEach(() => {
    vi.clearAllMocks()
    process.env.POLAR_ACCESS_TOKEN = 'tok'
    process.env.POLAR_SUCCESS_URL = 'https://app.test/checkout/success'
    who.user = { id: 'u1' }
    db.firmAdmin = true
    polar.answer = () => new Response(null, { status: 302, headers: { location: 'https://polar.test/c' } })
    catalog.impl = async () => [{ id: 'prod-standard' }]
})

describe('GET /api/checkout from a plan button', () => {
    it('sends an unknown plan back to Billing with the reason', async () => {
        const res = await GET(navigate('firmId=f1&products=hidden'))
        expect(res.status).toBe(303)
        const back = errorOn(res)
        expect(back.path).toBe('/d/billing')
        expect(back.error).toMatch(/isn't offered anymore/)
    })

    it('sends a Polar refusal back with words (the helper answers Response.error())', async () => {
        polar.answer = () => Response.error()
        const back = errorOn(await GET(navigate('firmId=f1&products=prod-standard')))
        expect(back.error).toMatch(/Polar, our payment provider, couldn't open the checkout/)
    })

    it('sends a catalog that fails to load back with words, instead of throwing', async () => {
        catalog.impl = async () => {
            throw new Error('POLAR 500')
        }
        const back = errorOn(await GET(navigate('firmId=f1&products=prod-standard')))
        expect(back.error).toMatch(/Couldn't load plans/)
    })

    it('says a non-admin needs an admin, on Billing', async () => {
        db.firmAdmin = false
        const back = errorOn(await GET(navigate('firmId=f1&products=prod-standard')))
        expect(back.error).toMatch(/Only a firm admin/)
    })

    it('from another page, lands on Billing with that page as returnTo', async () => {
        const back = errorOn(await GET(navigate('firmId=f1&products=hidden', 'http://localhost/d/acme/f/acme')))
        expect(back.path).toBe('/d/billing')
        expect(back.returnTo).toBe('/d/acme/f/acme')
    })

    it('stays in onboarding when the button was on its billing step', async () => {
        const back = errorOn(await GET(navigate('firmId=f1&products=hidden', 'http://localhost/d/onboarding?step=2')))
        expect(back.path).toBe('/d/onboarding')
    })

    it('ignores a referer from another site', async () => {
        const back = errorOn(await GET(navigate('firmId=f1&products=hidden', 'https://evil.test/d/billing')))
        expect(back.path).toBe('/d/billing')
        expect(back.returnTo).toBeNull()
    })

    it('still redirects to Polar when all is well', async () => {
        const res = await GET(navigate('firmId=f1&products=prod-standard'))
        expect(res.headers.get('location')).toBe('https://polar.test/c')
    })
})

describe('GET /api/checkout from a fetch', () => {
    it('answers JSON with the reason', async () => {
        const res = await GET(new NextRequest(new URL('/api/checkout?firmId=f1&products=hidden', 'http://localhost')))
        expect(res.status).toBe(400)
        expect((await res.json()).error).toMatch(/isn't offered anymore/)
    })
})
