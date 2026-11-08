import { describe, it, expect, vi, afterEach } from 'vitest'
import { loadBillingCurrentPlan, fetchBillingCurrentPlan } from './fetch-billing-current-plan'

/** BL-2: a failed plan load is told apart from "no plan". */

afterEach(() => vi.unstubAllGlobals())

describe('loadBillingCurrentPlan', () => {
    it('answers the plan', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ current: { subscriptionStatus: 'active' } }))))
        expect(await loadBillingCurrentPlan('f1')).toEqual({ ok: true, current: { subscriptionStatus: 'active' } })
    })

    it("answers a refusal as a failure with the server's words", async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })))
        expect(await loadBillingCurrentPlan('f1')).toEqual({ ok: false, error: 'Forbidden' })
    })

    it('answers a network failure as a failure, never rejecting', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new TypeError('Failed to fetch')
        }))
        const r = await loadBillingCurrentPlan('f1')
        expect(r.ok).toBe(false)
        // The old helper still answers null for the onboarding sidebar, and no longer rejects.
        await expect(fetchBillingCurrentPlan('f1')).resolves.toBeNull()
    })
})
