import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * A failed permissions load says so on the firm and client views, where Settings, Audit and New
 * client used to vanish exactly as though the person lacked access.
 */

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn() }),
    usePathname: () => '/d/g/f/acme',
    useSearchParams: () => new URLSearchParams('tab=analytics'),
}))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: { user_metadata: {} } }) }))
vi.mock('@/lib/actions/hierarchy', () => ({ getFirmName: async () => 'Acme', getIsOrgInternal: async () => false }))
vi.mock('@/lib/actions/members', () => ({ getProjectMemberSummaries: async () => ({}) }))
vi.mock('@/components/shell/shell-data-context', () => ({ useOptionalShellData: () => null }))
vi.mock('./client-list', () => ({ ClientList: () => <p>client list</p> }))
vi.mock('./add-client-modal', () => ({ AddClientModal: () => null }))
vi.mock('./firm-settings-form', () => ({ FirmSettingsForm: () => null }))
vi.mock('./members/firm-members-tab', () => ({ FirmMembersTab: () => null }))
vi.mock('@/components/search/global-search-view', () => ({ GlobalSearchView: () => null }))
vi.mock('./engagement-audit-pane', () => ({ EngagementAuditPane: () => null }))
vi.mock('@/components/dashboard/firm-business-insights', () => ({ FirmBusinessInsights: () => null }))
vi.mock('@/components/calendar/calendar-view', () => ({ CalendarView: () => null }))
vi.mock('@/components/app/landing-arrival', () => ({ LandingArrival: () => null }))
vi.mock('./engagement-list', () => ({ ProjectList: () => null }))
vi.mock('./client-settings-form', () => ({ ClientSettingsForm: () => null }))
vi.mock('./add-engagement-modal', () => ({ AddEngagementModal: () => null }))
vi.mock('./client-details-modal', () => ({ ClientDetailsModal: () => null }))
vi.mock('./client-contacts-tab', () => ({ ClientContactsTab: () => null }))
vi.mock('./members/client-members-tab', () => ({ ClientMembersTab: () => null }))
vi.mock('./client-header', () => ({ ClientHeader: () => <p>client header</p> }))

import { FirmClientsView } from './firm-clients-view'
import { ClientProjectView } from './client-project-view'

afterEach(() => vi.unstubAllGlobals())

const failing = () => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Something went wrong on our side.' }), { status: 500 })))

describe('permissions that fail to load', () => {
    it('the firm view says so, with a retry, and doesn’t rewrite an admin’s tab', async () => {
        failing()
        render(<FirmClientsView clients={[]} groupSlug="g" orgSlug="acme" orgId="f1" />)
        expect(await screen.findByText(/Couldn't load your permissions · Something went wrong on our side\./)).toBeTruthy()
        expect(replace).not.toHaveBeenCalled()

        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ canManage: true, isFirmOwner: true, canManageClients: true }), { status: 200 })))
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
        await waitFor(() => expect(screen.queryByText(/Couldn't load your permissions/)).toBeNull())
    })

    it('the client view says so too', async () => {
        failing()
        const clients = [{ id: 'c1', slug: 'contoso', name: 'Contoso', firmId: 'f1', engagements: [] }] as never
        render(<ClientProjectView clients={clients} groupSlug="g" firmSlug="acme" firmId="f1" selectedClientSlug="contoso" />)
        expect(await screen.findByText(/Couldn't load your permissions · Something went wrong on our side\./)).toBeTruthy()
    })
})
