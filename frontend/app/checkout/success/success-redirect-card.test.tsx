import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, renderHook, screen, waitFor, act, fireEvent } from '@testing-library/react'

/**
 * P1-27: "Payment received. Activating your plan…" until the plan shows active, then "You're all set".
 * BL-1: when it never does, say so and that it was reported. P1-26: the invoice's "still being
 * generated" words reach the person.
 */

vi.mock('next/navigation', () => ({
    usePathname: () => '/checkout/success',
    useRouter: () => router,
    useSearchParams: () => new URLSearchParams(),
}))
const router = { push: vi.fn(), replace: vi.fn() }
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getUser: vi.fn(), getSession: vi.fn(async () => ({ data: { session: null } })) } } }))
vi.mock('@/components/Logo', () => ({ default: () => null }))
vi.mock('@/components/billing/billing-polar-inline', () => ({ BillingPolarExplainInline: () => null }))

import { SuccessRedirectCard, useCheckoutActivation, activationCopy } from './success-redirect-card'

const answers: Record<string, () => Response> = {}

beforeEach(() => {
    router.push.mockClear()
    answers.status = () => new Response(JSON.stringify({ state: 'activating' }))
    answers.invoice = () => new Response(JSON.stringify({ invoiceUrl: 'https://polar.test/inv.pdf' }))
    vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) =>
            String(input).startsWith('/api/billing/checkout-status') ? answers.status() : answers.invoice()
        )
    )
})
afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe('useCheckoutActivation', () => {
    it('is active as soon as the plan shows active', async () => {
        answers.status = () => new Response(JSON.stringify({ state: 'active' }))
        const { result } = renderHook(() => useCheckoutActivation('chk_1'))
        expect(result.current.state).toBe('checking')
        await waitFor(() => expect(result.current.state).toBe('active'))
    })

    it('stops waiting after a minute, sends the final report, and says it was reported', async () => {
        vi.useFakeTimers()
        const { result } = renderHook(() => useCheckoutActivation('chk_1'))
        await act(async () => {
            await vi.advanceTimersByTimeAsync(61_000)
        })
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3_000)
        })
        expect(result.current.state).toBe('stalled')
        expect(result.current.reported).toBe(true)
        const urls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]))
        expect(urls.some((u) => u.includes('final=1'))).toBe(true)
    })

    it('is unknown with no checkout id', () => {
        const { result } = renderHook(() => useCheckoutActivation(undefined))
        expect(result.current.state).toBe('unknown')
    })
})

describe('activationCopy', () => {
    it('says "Activating your plan…" while checking, never "all set"', () => {
        expect(activationCopy('checking', { isOnboarding: false, reported: false })).toMatchObject({
            title: 'Payment received',
            body: 'Activating your plan…',
        })
    })

    it('gives the reference when activation stalled', () => {
        expect(activationCopy('stalled', { isOnboarding: false, checkoutId: 'chk_1', reported: true }).body).toBe(
            "We couldn't activate your plan yet and have been alerted · reference chk_1."
        )
    })
})

describe('SuccessRedirectCard', () => {
    it('does not redirect while the plan is still activating', async () => {
        render(<SuccessRedirectCard checkoutId="chk_1" />)
        expect(await screen.findByText('Activating your plan…')).toBeTruthy()
        expect(screen.queryByText(/Redirecting in/)).toBeNull()
    })

    it("shows the invoice route's \"still being generated\" words from its 202", async () => {
        answers.invoice = () =>
            new Response(JSON.stringify({ error: 'Your invoice is still being generated. Find it in Billing in a minute.' }), {
                status: 202,
            })
        render(<SuccessRedirectCard checkoutId="chk_1" />)
        fireEvent.click(await screen.findByRole('button', { name: /Download invoice/ }))
        expect(await screen.findByText('Your invoice is still being generated. Find it in Billing in a minute.')).toBeTruthy()
    })
})
