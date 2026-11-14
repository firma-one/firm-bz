import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, within, cleanup } from '@testing-library/react'
import { RaidOverviewCard, RaidOverviewView } from './raid-overview-card'
import { demoRaidLog } from '@/components/demo/demo-raid'

/**
 * The RAID section on the Overview: counts, the top open entries from every source and the latest decision,
 * never what the Action Center already shows, and nothing at all for anyone the log isn't for.
 */

const NOW = new Date('2026-11-12T12:00:00Z')

afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
})

describe('RaidOverviewView', { timeout: 20_000 }, () => {
    it('counts each type, and links the suggestions and the full log to the RAID tab', () => {
        render(<RaidOverviewView log={demoRaidLog(NOW)} engagementBase="/d/e/q2" />)
        expect(screen.getByRole('heading', { name: 'RAID' })).toBeTruthy()
        expect(screen.getByText('Internal only')).toBeTruthy()
        // Each count with its type's colored letter, as on the Firm Overview.
        expect(screen.getByText('2 open issues')).toBeTruthy()
        expect(screen.getByText('2 open risks')).toBeTruthy()
        expect(screen.getByText('1 assumption')).toBeTruthy()
        expect(screen.getByText('2 decisions')).toBeTruthy()
        // A memo's suggestion waits on the memo, so it isn't one to review here.
        expect(screen.getByRole('link', { name: '2 suggestions to review' }).getAttribute('href')).toBe('/d/e/q2/raid')
        expect(screen.getByRole('link', { name: /Open RAID log/ }).getAttribute('href')).toBe('/d/e/q2/raid')
    })

    it('lists every open entry, status and health ones too, issues first then newest, and the latest decision people recorded', () => {
        render(<RaidOverviewView log={demoRaidLog(NOW)} engagementBase="" />)
        const rows = screen.getAllByTestId(/^raid-card-row-/).map((r) => r.getAttribute('data-testid'))
        expect(rows).toEqual([
            'raid-card-row-raid-overdue',
            'raid-card-row-raid-waiting',
            'raid-card-row-raid-pace',
            'raid-card-row-raid-planning',
            'raid-card-row-raid-scope',
        ])
        // The assumption is the one open entry left over.
        expect(screen.getByText('and 1 more open, in the RAID log')).toBeTruthy()
        // The Board's approval is a decision too, but the Board already shows it.
        expect(screen.queryByText(/approved by Dana/)).toBeNull()
        expect(within(screen.getByTestId('raid-card-row-raid-scope')).getByText(/^latest decision · /)).toBeTruthy()
    })

    it('shows where each was raised, who owns it and when, and opens the RAID tab', () => {
        render(<RaidOverviewView log={demoRaidLog(NOW)} engagementBase="/d/e/q2" />)
        const row = screen.getByTestId('raid-card-row-raid-waiting')
        expect(row.getAttribute('href')).toBe('/d/e/q2/raid')
        expect(within(row).getByText('Issue')).toBeTruthy()
        expect(within(row).getByText('· Thread · QSR-14')).toBeTruthy()
        expect(within(row).getByText(/^Sam · Nov /)).toBeTruthy()
        expect(within(screen.getByTestId('raid-card-row-raid-planning')).getByText(/^No owner · /)).toBeTruthy()
    })

    it('says so when nothing is open and no decision was recorded', () => {
        render(<RaidOverviewView log={{ items: [], suggestions: [] }} engagementBase="" />)
        expect(screen.getByText('Nothing open, and no decisions recorded yet.')).toBeTruthy()
        expect(screen.queryByText(/to review/)).toBeNull()
    })
})

describe('RaidOverviewCard', { timeout: 20_000 }, () => {
    it.each([403, 404])('renders nothing for someone the log is not for (%i): a Reviewer or a Limited Access contributor', async (status) => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: 'no' }), { status }))
        vi.stubGlobal('fetch', fetchMock)
        const { container } = render(<RaidOverviewCard projectId="p1" engagementBase="/d/e/q2" />)
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/projects/p1/raid'))
        await new Promise((r) => setTimeout(r, 0))
        expect(container.innerHTML).toBe('')
    })

    it('renders the card for a Lead', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: demoRaidLog(NOW) }), { status: 200 })))
        render(<RaidOverviewCard projectId="p1" engagementBase="/d/e/q2" />)
        expect(await screen.findByRole('heading', { name: 'RAID' })).toBeTruthy()
    })

    it('says why when the log did not load', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: "The RAID log didn't load. Try again." }), { status: 500 })))
        render(<RaidOverviewCard projectId="p1" engagementBase="/d/e/q2" />)
        expect((await screen.findByRole('alert')).textContent).toContain("The RAID log didn't load. Try again.")
    })
})
