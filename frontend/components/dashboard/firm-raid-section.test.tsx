import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, within, cleanup, fireEvent } from '@testing-library/react'
import { FirmRaidSection, FirmRaidView } from './firm-raid-section'
import { demoFirmRaid } from '@/lib/demo/demo-firm-raid'
import type { FirmRaidOverview } from '@/lib/raid/raid-shared'
import type { DemoFirm } from '@/lib/demo/static-demo-data'

/**
 * The Firm Overview's risks and issues: the count line, a row per entry opening its engagement's RAID tab,
 * and nothing at all for anyone the route refuses.
 */

afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
})

const DATA: FirmRaidOverview = {
    counts: { openIssues: 3, openRisks: 1, high: 1, engagements: 2 },
    rows: [
        {
            id: 'i1',
            type: 'ISSUE',
            priority: 'HIGH',
            title: 'The client hasn’t approved the creative brief',
            ownerFirstName: 'Sam',
            raisedAt: '2026-11-08T12:00:00Z',
            engagement: { name: 'Q4 Brand Refresh', clientName: 'Acme Robotics', href: '/g/beacon/acme/q4/raid' },
        },
        {
            id: 'r1',
            type: 'RISK',
            priority: 'LOW',
            title: 'The signed change order may hold up the launch',
            ownerFirstName: null,
            raisedAt: '2026-11-12T12:00:00Z',
            engagement: { name: 'Q2 Launch', clientName: 'Horizon FinTech', href: '/g/beacon/horizon/q2/raid' },
        },
    ],
    more: 2,
}

describe('FirmRaidView', { timeout: 20_000 }, () => {
    it('counts the open ones, and lists each with its engagement, owner and day, linking to its RAID tab', () => {
        render(<FirmRaidView data={DATA} />)
        expect(screen.getByRole('heading', { name: 'Risks and issues' })).toBeTruthy()
        expect(screen.getByText('3 open issues')).toBeTruthy()
        expect(screen.getByText('1 open risk')).toBeTruthy()
        expect(screen.getByText('across 2 engagements')).toBeTruthy()
        expect(screen.getByText('1 High')).toBeTruthy()

        const issue = screen.getByTestId('firm-raid-row-i1')
        expect(issue.getAttribute('href')).toBe('/g/beacon/acme/q4/raid')
        expect(within(issue).getByText('Issue')).toBeTruthy()
        // Its priority, as gray bars and the word.
        expect(within(issue).getByText('High')).toBeTruthy()
        expect(within(screen.getByTestId('firm-raid-row-r1')).getByText('Low')).toBeTruthy()
        expect(within(issue).getByRole('img', { name: 'Client' })).toBeTruthy()
        expect(within(issue).getByText('Acme Robotics')).toBeTruthy()
        expect(within(issue).getByRole('img', { name: 'Engagement' })).toBeTruthy()
        expect(within(issue).getByText('Q4 Brand Refresh')).toBeTruthy()
        expect(within(issue).getByText('Sam')).toBeTruthy()
        expect(within(issue).getByText('Nov 8')).toBeTruthy()
        expect(within(screen.getByTestId('firm-raid-row-r1')).getByText('No owner')).toBeTruthy()
        expect(screen.getByText(/and 2 more/)).toBeTruthy()
    })

    it('says so when nothing is open', () => {
        render(<FirmRaidView data={{ counts: { openIssues: 0, openRisks: 0, high: 0, engagements: 0 }, rows: [], more: 0 }} />)
        expect(screen.getByText('No open risks or issues in your engagements.')).toBeTruthy()
        expect(screen.queryByText(/across/)).toBeNull()
    })

    it('draws the tour’s sample firm with links to the tour’s own RAID tabs', () => {
        const firm = {
            clients: [
                { slug: 'acme', name: 'Acme', engagements: [{ slug: 'q4', name: 'Q4' }, { slug: 'q2', name: 'Q2' }] },
            ],
        } as unknown as DemoFirm
        render(<FirmRaidView data={demoFirmRaid(firm, Date.UTC(2026, 10, 14))} />)
        const rows = screen.getAllByTestId(/^firm-raid-row-/)
        expect(rows).toHaveLength(5)
        expect(rows[0].getAttribute('href')).toBe('/tour/acme/q4?tab=raid')
    })
})

describe('FirmRaidView · Show all', { timeout: 20_000 }, () => {
    const firm = {
        clients: [{ slug: 'acme', name: 'Acme', engagements: [{ slug: 'q4', name: 'Q4' }, { slug: 'q2', name: 'Q2' }] }],
    } as unknown as DemoFirm
    const seven = demoFirmRaid(firm, Date.UTC(2026, 10, 14))

    it('shows the first five, and opens the rest in place', () => {
        render(<FirmRaidView data={seven} />)
        expect(screen.getAllByTestId(/^firm-raid-row-/)).toHaveLength(5)
        const toggle = screen.getByRole('button', { name: /Show all 7/ })
        expect(toggle.getAttribute('aria-expanded')).toBe('false')

        fireEvent.click(toggle)
        expect(screen.getAllByTestId(/^firm-raid-row-/)).toHaveLength(7)
        expect(toggle.getAttribute('aria-expanded')).toBe('true')
        expect(toggle.textContent).toContain('Show fewer')

        fireEvent.click(toggle)
        expect(screen.getAllByTestId(/^firm-raid-row-/)).toHaveLength(5)
    })

    it('has nothing to open when five or fewer are open', () => {
        render(<FirmRaidView data={DATA} />)
        expect(screen.queryByRole('button', { name: /Show/ })).toBeNull()
    })

    it('past the rows sent, says how many more and where they are once opened', () => {
        render(<FirmRaidView data={{ ...seven, more: 3 }} />)
        expect(screen.queryByText(/and 3 more/)).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: /Show 2 more/ }))
        expect(screen.getByText(/and 3 more, in their engagements/)).toBeTruthy()
    })
})

describe('FirmRaidSection', { timeout: 20_000 }, () => {
    it.each([401, 403, 404])('renders nothing when the route refuses (%i)', async (status) => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: 'no' }), { status }))
        vi.stubGlobal('fetch', fetchMock)
        const { container } = render(<FirmRaidSection firmId="f1" />)
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/firms/f1/raid'))
        await waitFor(() => expect(container.innerHTML).toBe(''))
    })

    it('renders the section once it loads', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: DATA }), { status: 200 })))
        render(<FirmRaidSection firmId="f1" />)
        expect(await screen.findByTestId('firm-raid-row-i1')).toBeTruthy()
    })

    it('says why when it did not load', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: "The risks and issues didn't load. Try again." }), { status: 500 })))
        render(<FirmRaidSection firmId="f1" />)
        expect(await screen.findByText(/didn't load/)).toBeTruthy()
    })
})
