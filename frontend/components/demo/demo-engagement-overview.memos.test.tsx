import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { render, screen, act } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'

/**
 * Internal memos moved off the engagement Overview into Discussions › Memos
 * (.claude/plans/brio-features-round-2.md §8): neither the app's Overview nor the tour's shows the card.
 */

vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }), usePathname: () => '/tour' }))

import { DemoEngagementOverview } from './demo-engagement-overview'
import { DEMO_FIRM } from '@/lib/demo/static-demo-data'

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('/tour sends nothing') }))
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => vi.unstubAllGlobals())

describe('the Overview without Internal memos', () => {
    it('/tour: the Overview renders without the memos card', async () => {
        render(<TooltipProvider><DemoEngagementOverview engagement={DEMO_FIRM.clients[0].engagements[0]} /></TooltipProvider>)
        await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
        expect(screen.getByText('Engagement Health')).toBeTruthy()
        expect(screen.queryByRole('heading', { name: 'Internal memos' })).toBeNull()
        expect(screen.queryByText('Weekly check-in')).toBeNull()
    })

    it('the app: the Overview no longer mounts the card', () => {
        // The app's Overview needs a full insights payload to render; what it mounts is read here instead.
        const source = readFileSync(join(__dirname, '..', 'projects', 'engagement-insights-dashboard.tsx'), 'utf-8')
        expect(source).not.toMatch(/<InternalMemosCard\b/)
        expect(source).not.toMatch(/from '\.\/internal-memos-card'/)
        const tour = readFileSync(join(__dirname, 'demo-engagement-overview.tsx'), 'utf-8')
        expect(tour).not.toMatch(/<DemoInternalMemos\b/)
    })
})

describe('a Health link from the RAID log, on /tour', () => {
    afterEach(() => window.history.replaceState(null, '', '/'))

    it('lands on the Overview chart it names, once the dated sections are in', async () => {
        window.history.replaceState(null, '', '/tour?tab=analytics#ring-pace')
        const scrolled = vi.fn()
        Element.prototype.scrollIntoView = scrolled
        render(<TooltipProvider><DemoEngagementOverview engagement={DEMO_FIRM.clients[0].engagements[0]} /></TooltipProvider>)
        await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
        const pace = document.getElementById('ring-pace')
        expect(pace).toBeTruthy()
        expect(scrolled.mock.contexts).toContain(pace)
        expect(pace!.classList.contains('ring-pulse')).toBe(true)
    })
})
