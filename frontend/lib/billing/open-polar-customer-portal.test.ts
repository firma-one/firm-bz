import { describe, it, expect, vi, afterEach } from 'vitest'
import { openPolarCustomerPortalSession } from './open-polar-customer-portal'

/** P1-25: the browser side never rejects and always says why. */

afterEach(() => vi.unstubAllGlobals())

describe('openPolarCustomerPortalSession', () => {
    it("words the server's reason, and says the plan is unchanged", async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Polar said: Customer is locked.' }), { status: 502 })))
        expect(await openPolarCustomerPortalSession({ firmId: 'f1' })).toEqual({
            ok: false,
            error: "Couldn't open billing · Polar said: Customer is locked. Your plan is unchanged.",
        })
    })

    it('says the connection failed instead of rejecting when the request never left', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new TypeError('Failed to fetch')
        }))
        const r = await openPolarCustomerPortalSession({ firmId: 'f1' })
        expect(r.ok).toBe(false)
        expect(!r.ok && r.error).toMatch(/Check your connection/)
    })
})
