import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'

/**
 * The firm Overview when its data fails to load: it says so, with the reason, where the Action
 * Center and the overview used to keep their loading shimmer for good.
 */

// One session object, as the real provider keeps: the load runs again whenever it changes.
const { auth } = vi.hoisted(() => ({ auth: { session: { access_token: 't' } } }))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => auth }))

import { FirmBusinessInsights } from './firm-business-insights'

afterEach(() => vi.unstubAllGlobals())

describe('FirmBusinessInsights', () => {
    it('a failed load reads as one, with the route’s reason, in both places', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string) => (
            String(url).includes('/insights')
                ? ({ ok: false, status: 500, json: async () => ({ error: 'Something went wrong on our side. Try again.' }) } as Response)
                : ({ ok: true, json: async () => ({ brief: null, configured: false }) } as Response)
        )))
        render(<TooltipProvider><FirmBusinessInsights firmId="f1" firmSlug="acme" groupSlug="acme-group" /></TooltipProvider>)

        expect(await screen.findByText("Couldn't load the Action Center")).toBeTruthy()
        expect(screen.getByText("Couldn't load this overview")).toBeTruthy()
        expect(screen.getAllByText('Something went wrong on our side. Try again.')).toHaveLength(2)
    })

    it('a request that never left says Firma couldn’t be reached', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            if (String(url).includes('/insights')) throw new TypeError('Failed to fetch')
            return { ok: true, json: async () => ({ brief: null, configured: false }) } as Response
        }))
        render(<TooltipProvider><FirmBusinessInsights firmId="f1" firmSlug="acme" groupSlug="acme-group" /></TooltipProvider>)

        expect(await screen.findByText("Couldn't load the Action Center")).toBeTruthy()
        expect(screen.getAllByText(/Couldn't reach/).length).toBe(2)
    })
})
