import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, within, cleanup } from '@testing-library/react'
import { RaidOverviewCard, RaidOverviewView } from './raid-overview-card'
import { demoRaidLog } from '@/components/demo/demo-raid'
import { dueDay } from '@/lib/raid/raid-shared'

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
        expect(screen.getByText('2 open actions')).toBeTruthy()
        expect(screen.getByText('2 decisions')).toBeTruthy()
        expect(screen.queryByText(/assumption/i)).toBeNull()
        // A memo's suggestion waits on the memo, so it isn't one to review here.
        expect(screen.getByRole('link', { name: '2 suggestions to review' }).getAttribute('href')).toBe('/d/e/q2/raid?view=suggested')
        expect(screen.getByRole('link', { name: /Open RAID log/ }).getAttribute('href')).toBe('/d/e/q2/raid')
    })

    it('lists every open entry, High first, issues before risks, then newest, and the latest decision people recorded', () => {
        render(<RaidOverviewView log={demoRaidLog(NOW)} engagementBase="" />)
        const rows = screen.getAllByTestId(/^raid-card-row-/).map((r) => r.getAttribute('data-testid'))
        expect(rows).toEqual([
            'raid-card-row-raid-overdue',
            'raid-card-row-raid-pace',
            'raid-card-row-raid-waiting',
            'raid-card-row-raid-planning',
            'raid-card-row-raid-scope',
        ])
        // Each with its priority; the decision has none.
        expect(within(screen.getByTestId('raid-card-row-raid-pace')).getByText('High')).toBeTruthy()
        expect(within(screen.getByTestId('raid-card-row-raid-planning')).getByText('Low')).toBeTruthy()
        expect(within(screen.getByTestId('raid-card-row-raid-scope')).getByLabelText('No priority')).toBeTruthy()
        // Six are open (the two Actions after the risks and issues) and four fit: "Show all" opens the RAID tab
        // rather than expanding here.
        expect(screen.getByRole('link', { name: 'Show all 6 in the RAID log' }).getAttribute('href')).toBe('?tab=raid')
        // The Board's approval is a decision too, but the Board already shows it.
        expect(screen.queryByText(/approved by Dana/)).toBeNull()
        expect(within(screen.getByTestId('raid-card-row-raid-scope')).getByText(/^· latest decision · Memo · Kickoff call$/)).toBeTruthy()
    })

    it('shows where each was raised, who owns it and when, and opens the RAID tab', () => {
        render(<RaidOverviewView log={demoRaidLog(NOW)} engagementBase="/d/e/q2" />)
        const row = screen.getByTestId('raid-card-row-raid-waiting')
        expect(row.getAttribute('href')).toBe('/d/e/q2/raid')
        expect(within(row).getByText('Issue')).toBeTruthy()
        expect(within(row).getByText('· Thread · QSR-14')).toBeTruthy()
        expect(within(row).getByText('Sam')).toBeTruthy()
        expect(within(row).getByText(/^Nov \d+$/)).toBeTruthy()
        expect(within(screen.getByTestId('raid-card-row-raid-planning')).getByText('No owner')).toBeTruthy()
    })

    it('lists Actions after the risks and issues, newest first, each with when it is due, in red once it is past', () => {
        const log = demoRaidLog(NOW)
        // Fewer risks and issues, so the Actions fit.
        render(<RaidOverviewView log={{ ...log, items: log.items.filter((i) => i.id !== 'raid-pace' && i.id !== 'raid-planning') }} engagementBase="" />)
        expect(screen.getAllByTestId(/^raid-card-row-/).map((r) => r.getAttribute('data-testid'))).toEqual([
            'raid-card-row-raid-overdue',
            'raid-card-row-raid-waiting',
            'raid-card-row-raid-k1',
            'raid-card-row-raid-letter',
            'raid-card-row-raid-scope',
        ])
        expect(screen.getByText('0 open risks')).toBeTruthy()
        expect(screen.getByText('2 open actions')).toBeTruthy()

        const due = (id: string) => within(screen.getByTestId(id)).getByTitle('Due')
        const k1 = log.items.find((i) => i.id === 'raid-k1')!
        const letter = log.items.find((i) => i.id === 'raid-letter')!
        expect(due('raid-card-row-raid-k1').textContent).toBe(dueDay(k1.dueDate))
        expect(due('raid-card-row-raid-k1').className).not.toContain('text-danger')
        expect(due('raid-card-row-raid-letter').textContent).toBe(dueDay(letter.dueDate))
        expect(due('raid-card-row-raid-letter').className).toContain('text-danger')
        // Everything else shows when it was raised.
        expect(within(screen.getByTestId('raid-card-row-raid-overdue')).getByTitle('Raised')).toBeTruthy()
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
