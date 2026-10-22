import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FirmActions, type FirmActionLinks } from './firm-actions'
import type { FirmActionsData } from '@/lib/insights/firm-actions'

const LINKS: FirmActionLinks = {
    engagement: (c, e, tab) => `/c/${c}/e/${e}${tab ? `/${tab}` : ''}`,
    client: (c, tab) => `/c/${c}${tab ? `/${tab}` : ''}`,
}

const EMPTY: FirmActionsData = {
    overdueEngagements: [], threads: [], setupGaps: [], invitations: [], idleClients: [], prospects: [], currencySymbol: '$',
}

describe('FirmActions', () => {
    it('is one line when everything is clear, the checks a click away', () => {
        render(<FirmActions data={EMPTY} links={LINKS} />)
        expect(screen.getByText('All clear')).toBeTruthy()
        expect(screen.queryByText('Engagements')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: /6 checks passed/ }))
        expect(screen.getByText('Extend or close overdue engagements')).toBeTruthy()
        expect(screen.getByText('Resend invitations')).toBeTruthy()
    })

    it('lists the work in one list, groups only the passed checks, and opens an item\'s work', () => {
        render(<FirmActions
            links={LINKS}
            data={{
                ...EMPTY,
                setupGaps: [{ engagementId: 'e1', name: 'GTM', slug: 'gtm', clientName: 'Acme', clientSlug: 'acme', missing: ['lead', 'due date'] }],
                invitations: [{ invitationId: 'i1', email: 'jo@client.com', engagementId: 'e1', engagementName: 'GTM', engagementSlug: 'gtm', clientSlug: 'acme', expireAt: '', daysUntilExpiry: -2 }],
            }}
        />)
        // The two rows with work, ungrouped; the four clear checks fold into one line.
        expect(screen.queryByText('Engagements')).toBeNull()
        expect(screen.getByRole('button', { name: /4 checks passed/ })).toBeTruthy()

        fireEvent.click(screen.getByText('Finish engagement setup'))
        const link = screen.getByRole('link', { name: /GTM/ })
        expect(link.getAttribute('href')).toBe('/c/acme/e/gtm/analytics')
        expect(link.textContent).toContain('No lead · No due date')

        fireEvent.click(screen.getByRole('button', { name: /Back/ }))
        fireEvent.click(screen.getByText('Resend invitations'))
        const invite = screen.getByRole('link', { name: /jo@client.com/ })
        expect(invite.getAttribute('href')).toBe('/c/acme/e/gtm/members')
        expect(invite.textContent).toContain('Expired 2 days ago')
    })

    it('has no file checks, personal reminders or follow-ups', () => {
        render(<FirmActions data={EMPTY} links={LINKS} />)
        fireEvent.click(screen.getByRole('button', { name: /checks passed/ }))
        for (const gone of ['Sensitive files', 'Sharing alerts', 'Large files', 'Overdue', 'Upcoming', 'Follow up with prospects']) {
            expect(screen.queryByText(gone)).toBeNull()
        }
    })

    it('puts invitations under Engagements, and prospects to decide on under Clients', () => {
        render(<FirmActions data={EMPTY} links={LINKS} />)
        fireEvent.click(screen.getByRole('button', { name: /checks passed/ }))
        const engagements = screen.getByText('Engagements').parentElement!
        const clients = screen.getByText('Clients').parentElement!
        expect(engagements.textContent).toContain('Resend invitations')
        expect(clients.textContent).toContain('Decide on prospects')
        expect(clients.textContent).toContain('Start work with idle clients')
        expect(clients.textContent).not.toContain('Resend invitations')
    })

    it('sends a prospect to its settings, saying how long past its expected close it is', () => {
        render(<FirmActions
            links={LINKS}
            data={{ ...EMPTY, prospects: [
                { clientId: 'p1', clientName: 'Northwind', clientSlug: 'northwind', expectedCloseDate: '2026-10-01T00:00:00.000Z', daysPast: 16 },
                { clientId: 'p2', clientName: 'Tailspin', clientSlug: 'tailspin', expectedCloseDate: null, daysPast: null },
            ] }}
        />)
        fireEvent.click(screen.getByText('Decide on prospects'))
        const past = screen.getByRole('link', { name: /Northwind/ })
        expect(past.getAttribute('href')).toBe('/c/northwind/settings')
        expect(past.textContent).toContain('16 days past')
        expect(screen.getByRole('link', { name: /Tailspin/ }).textContent).toContain('No expected close')
    })
})
