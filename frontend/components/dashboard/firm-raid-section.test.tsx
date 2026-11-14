import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, within, cleanup } from '@testing-library/react'
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
    counts: { openIssues: 3, openRisks: 1, engagements: 2 },
    rows: [
        {
            id: 'i1',
            type: 'ISSUE',
            title: 'The client hasn’t approved the creative brief',
            ownerFirstName: 'Sam',
            raisedAt: '2026-11-08T12:00:00Z',
            engagement: { name: 'Q4 Brand Refresh', clientName: 'Acme Robotics', href: '/g/beacon/acme/q4/raid' },
        },
        {
            id: 'r1',
            type: 'RISK',
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

        const issue = screen.getByTestId('firm-raid-row-i1')
        expect(issue.getAttribute('href')).toBe('/g/beacon/acme/q4/raid')
        expect(within(issue).getByText('Issue')).toBeTruthy()
        expect(within(issue).getByText('· Acme Robotics · Q4 Brand Refresh')).toBeTruthy()
        expect(within(issue).getByText(/^Sam · Nov/)).toBeTruthy()
        expect(within(screen.getByTestId('firm-raid-row-r1')).getByText(/^No owner · Nov/)).toBeTruthy()
        expect(screen.getByText(/and 2 more/)).toBeTruthy()
    })

    it('says so when nothing is open, and when the open ones are all status and health items', () => {
        const { rerender } = render(<FirmRaidView data={{ counts: { openIssues: 0, openRisks: 0, engagements: 0 }, rows: [], more: 0 }} />)
        expect(screen.getByText('No open risks or issues in your engagements.')).toBeTruthy()
        expect(screen.queryByText(/across/)).toBeNull()
        rerender(<FirmRaidView data={{ counts: { openIssues: 2, openRisks: 0, engagements: 1 }, rows: [], more: 0 }} />)
        expect(screen.getByText(/None raised in threads or memos/)).toBeTruthy()
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
