import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, within, cleanup } from '@testing-library/react'
import { RaidOverviewCard, RaidOverviewView } from './raid-overview-card'
import { demoRaidLog } from '@/components/demo/demo-raid'

/**
 * The RAID card on the Overview: counts, the top entries raised in conversation and the latest decision,
 * never what the Action Center already shows, and nothing at all for anyone the log isn't for.
 */

const NOW = new Date('2026-11-12T12:00:00Z')

afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
})

describe('RaidOverviewView', { timeout: 20_000 }, () => {
    it('counts each type, and links the suggestions and the full log to the Discussions RAID sub-tab', () => {
        render(<RaidOverviewView log={demoRaidLog(NOW)} engagementBase="/d/e/q2" />)
        expect(screen.getByRole('heading', { name: 'RAID' })).toBeTruthy()
        expect(screen.getByText('Internal only')).toBeTruthy()
        expect(screen.getByText('open risks').previousSibling?.textContent).toBe('2')
        expect(screen.getByText('assumption').previousSibling?.textContent).toBe('1')
        expect(screen.getByText('open issues').previousSibling?.textContent).toBe('2')
        expect(screen.getByText('decisions').previousSibling?.textContent).toBe('2')
        expect(screen.getByRole('link', { name: '3 suggestions to review' }).getAttribute('href')).toBe('/d/e/q2/comments?view=raid')
        expect(screen.getByRole('link', { name: /Open RAID log/ }).getAttribute('href')).toBe('/d/e/q2/comments?view=raid')
    })

    it('leaves out status and health entries: only what was raised in threads and memos, and the latest decision people recorded', () => {
        render(<RaidOverviewView log={demoRaidLog(NOW)} engagementBase="" />)
        const rows = screen.getAllByTestId(/^raid-card-row-/).map((r) => r.getAttribute('data-testid'))
        expect(rows).toEqual(['raid-card-row-raid-k1', 'raid-card-row-raid-scope'])
        expect(screen.queryByText(/overdue by/)).toBeNull()
        expect(screen.queryByText(/Behind pace/)).toBeNull()
        expect(screen.queryByText(/planning gaps/)).toBeNull()
        expect(screen.queryByText(/has waited/)).toBeNull()
        // The Board's approval is a decision too, but the Board already shows it.
        expect(screen.queryByText(/approved by Dana/)).toBeNull()
        expect(within(screen.getByTestId('raid-card-row-raid-scope')).getByText('· latest decision')).toBeTruthy()
    })

    it('says so when nothing was raised in conversation', () => {
        const log = demoRaidLog(NOW)
        render(<RaidOverviewView log={{ items: log.items.filter((i) => i.sourceKind !== 'MEMO'), suggestions: [] }} engagementBase="" />)
        expect(screen.getByText(/Nothing raised in threads or memos yet/)).toBeTruthy()
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
