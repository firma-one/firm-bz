import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'

/**
 * BL-2: Billing never offers Checkout to someone whose plan didn't load, and keeps the last known plan
 * on a failed refresh. P1-24: a checkout that didn't open comes back with its reason. P2-52: a failed
 * permission check says so instead of bouncing off Billing.
 */

const { nav, net } = vi.hoisted(() => ({
    nav: { params: new URLSearchParams(), replace: vi.fn(), router: null as unknown },
    net: {
        plan: (() => new Response(JSON.stringify({ current: null }))) as () => Response,
        perm: (() => new Response(JSON.stringify({ canManage: true }))) as () => Response,
    },
}))

vi.mock('next/navigation', () => ({
    usePathname: () => '/d/billing',
    // Stable, as Next's is: the page's effects depend on it.
    useRouter: () => (nav.router ??= { replace: nav.replace, push: vi.fn() }),
    useSearchParams: () => nav.params,
}))
vi.mock('@/lib/actions/firms', () => ({
    getUserFirms: vi.fn(async () => [{ id: 'f1', slug: 'acme', name: 'Acme', isDefault: true, groupSlug: 'acme', groupName: 'Acme' }]),
}))
vi.mock('react-joyride', () => ({ Joyride: () => null, EVENTS: {}, STATUS: {} }))

import { BillingPageClient } from './billing-page-client'
import { upgradeCopy } from '@/lib/billing/upgrade-copy'

const CATALOG = {
    items: [
        {
            id: 'prod-standard',
            name: 'Standard',
            pricingModel: 'recurring_subscription',
            priceLabel: '$10',
            recurringInterval: 'month',
            recurringAmountCents: 1000,
            description: null,
        },
    ],
}

beforeEach(() => {
    nav.params = new URLSearchParams()
    nav.replace.mockClear()
    net.plan = () => new Response(JSON.stringify({ current: null }))
    net.perm = () => new Response(JSON.stringify({ canManage: true }))
    vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input)
            if (url.startsWith('/api/permissions/firm')) return net.perm()
            if (url.startsWith('/api/billing/current-plan')) return net.plan()
            if (url.startsWith('/api/billing/catalog')) return new Response(JSON.stringify(CATALOG))
            return new Response('{}')
        })
    )
})
afterEach(() => vi.unstubAllGlobals())

describe('BillingPageClient', () => {
    it('offers Checkout once the plan has loaded (the button the next test expects to be held back)', async () => {
        render(<BillingPageClient />)
        expect(await screen.findByRole('button', { name: new RegExp(upgradeCopy.planPickerCta, 'i') })).toBeTruthy()
    })

    it("holds Checkout back and says why when the plan didn't load", async () => {
        net.plan = () => new Response(JSON.stringify({ error: 'Billing is down for a moment.' }), { status: 502 })
        render(<BillingPageClient />)
        expect(await screen.findByText(/Couldn.t load your plan · Billing is down for a moment\./)).toBeTruthy()
        await screen.findByText('Standard')
        expect(screen.queryByRole('button', { name: new RegExp(upgradeCopy.planPickerCta, 'i') })).toBeNull()
        expect(screen.getByText(/Checkout is held back until your current plan loads/)).toBeTruthy()
    })

    it('keeps the last known plan when a refresh fails', async () => {
        net.plan = () =>
            new Response(
                JSON.stringify({
                    current: {
                        subscriptionStatus: 'active',
                        subscriptionPlan: 'Standard',
                        subscriptionProductId: 'prod-standard',
                        pricingModel: 'recurring_subscription',
                        periodEndIso: null,
                        isFirmBillingAdmin: true,
                    },
                })
            )
        render(<BillingPageClient />)
        await waitFor(() => expect(screen.getAllByText('Standard').length).toBeGreaterThan(0))
        net.plan = () => new Response(JSON.stringify({ error: 'offline' }), { status: 502 })
        await act(async () => {
            window.dispatchEvent(new Event('focus'))
        })
        await new Promise((r) => setTimeout(r, 20))
        expect(screen.queryByText(/Couldn.t load your plan/)).toBeNull()
    })

    it("shows why checkout didn't open, and that nobody was charged", async () => {
        nav.params = new URLSearchParams({ checkout_error: "That plan isn't offered anymore. Refresh Billing and pick a plan again." })
        render(<BillingPageClient />)
        expect(
            await screen.findByText(
                "Checkout didn't open · That plan isn't offered anymore. Refresh Billing and pick a plan again. You have not been charged."
            )
        ).toBeTruthy()
    })

    it('says the permission check failed instead of bouncing off Billing', async () => {
        net.perm = () => new Response(JSON.stringify({ error: 'Database unavailable' }), { status: 500 })
        render(<BillingPageClient />)
        expect(await screen.findByText("Couldn't load billing")).toBeTruthy()
        expect(screen.getByText('Database unavailable')).toBeTruthy()
        expect(nav.replace).not.toHaveBeenCalled()
    })
})
