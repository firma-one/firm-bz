import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }))
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: () => '/d/u/home', useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh }) }))

import { HomeView } from './home-view'
import type { MyWork } from '@/lib/home/my-work'

const ACME = { id: 'f1', name: 'Acme', slug: 'acme', groupSlug: 'g' }
const BETA = { id: 'f2', name: 'Beta', slug: 'beta', groupSlug: 'h' }

const work: MyWork = {
    engagements: [
        { id: 'e1', name: 'Audit', href: '/a', firmId: 'f1', clientName: 'Contoso', status: 'ACTIVE', dueDate: null, updatedAt: '2026-10-14T10:00:00Z', role: 'eng_member' },
        { id: 'e2', name: 'Tax', href: '/b', firmId: 'f2', clientName: 'Globex', status: 'ACTIVE', dueDate: null, updatedAt: '2026-10-14T10:00:00Z', role: 'eng_member' },
    ],
    needsYou: [
        { id: 'n1', kind: 'deliverable_review', firmId: 'f2', title: 'Q3 Report', context: 'Globex · Tax', href: '/b/shares/board', actionLabel: 'Review', at: null },
    ],
    dueSoon: [],
}

function renderHome(over: Partial<Parameters<typeof HomeView>[0]> = {}) {
    return render(
        <HomeView
            firstName="Dee"
            firms={[ACME, BETA]}
            selectedFirm={null}
            unavailable={[]}
            recents={[]}
            calendarEvents={[]}
            work={work}
            bookmarks={[]}
            {...over}
        />
    )
}

describe('HomeView', () => {
    it('names each row\'s firm across firms, with the firm filter and By firm grouping, and no single calendar', () => {
        renderHome()
        expect(screen.getByText('Beta · Globex · Tax')).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Showing all firms' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'By firm' })).toBeTruthy()
        expect(screen.queryByText('Open calendar')).toBeNull()
    })

    it('drops firm labels when filtered to one firm, and links that firm\'s calendar', () => {
        renderHome({ selectedFirm: BETA, work: { ...work, engagements: [work.engagements[1]] } })
        expect(screen.getByText('Globex · Tax')).toBeTruthy()
        expect(screen.queryByText('Beta · Globex · Tax')).toBeNull()
        expect(screen.queryByRole('button', { name: 'By firm' })).toBeNull()
        expect(screen.getByText('Open calendar').closest('a')!.getAttribute('href')).toBe('/d/h/f/beta?tab=calendar')
    })

    it('hides the filter and labels for someone in one firm', () => {
        renderHome({ firms: [ACME], work: { ...work, engagements: [work.engagements[0]], needsYou: [] } })
        expect(screen.queryByRole('button', { name: 'Showing all firms' })).toBeNull()
        expect(screen.getByText('Open calendar')).toBeTruthy()
    })

    it('says which firms are left out and why', () => {
        renderHome({
            unavailable: [{ ...BETA, id: 'f3', name: 'Locked Co', reason: 'subscription', href: '/d/h/f/locked/subscription-locked' }],
        })
        expect(screen.getByText('Locked Co').closest('a')!.getAttribute('href')).toBe('/d/h/f/locked/subscription-locked')
        expect(screen.getByText(/has an inactive subscription/)).toBeTruthy()
    })

    it('shows an empty state with no firm to open', () => {
        renderHome({ firms: [], work: { engagements: [], needsYou: [], dueSoon: [] } })
        expect(screen.getByText('Nothing here yet')).toBeTruthy()
    })

    describe('when part of it did not load (EM-2)', () => {
        const nothing: MyWork = { engagements: [], needsYou: [], dueSoon: [] }

        it('says the firms did not load, never "Nothing here yet", and Try again reloads', () => {
            renderHome({ firms: [], work: nothing, failed: { firms: true } })
            expect(screen.getByText("Couldn't load your Home")).toBeTruthy()
            expect(screen.queryByText('Nothing here yet')).toBeNull()
            fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
            expect(refresh).toHaveBeenCalled()
        })

        it('never reads "All caught up", "Nothing overdue" or "No open engagements" after a failed load', () => {
            renderHome({ work: nothing, failed: { work: true } })
            expect(screen.getByText("Couldn't load what needs you.")).toBeTruthy()
            expect(screen.queryByText(/All caught up/)).toBeNull()
            expect(screen.getByText("Couldn't load your engagements.")).toBeTruthy()
            expect(screen.queryByText(/No open engagements/)).toBeNull()
        })

        it('says the agenda did not load when the calendar failed', async () => {
            renderHome({ failed: { calendar: true } })
            expect(await screen.findByText("Couldn't load your agenda.")).toBeTruthy()
            expect(screen.queryByText('Nothing overdue or on the calendar this week.')).toBeNull()
        })

        it('keeps what loaded and says some may be missing when the reminders failed', () => {
            renderHome({ failed: { reminders: true } })
            expect(screen.getByText('Q3 Report')).toBeTruthy()
            const needs = screen.getByText('Q3 Report').closest('section')!
            expect(within(needs).getByText("Couldn't load all of what needs you, so some may be missing.")).toBeTruthy()
        })

        it('says the bookmarks did not load, never "No bookmarks yet"', () => {
            renderHome({ failed: { bookmarks: true } })
            expect(screen.getByText("Couldn't load your bookmarks.")).toBeTruthy()
            expect(screen.queryByText(/No bookmarks yet/)).toBeNull()
        })
    })
})
