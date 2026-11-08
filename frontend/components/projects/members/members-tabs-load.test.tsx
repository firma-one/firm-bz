import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

/**
 * EM-5 and MB-1: a members load that fails says so, with Retry, and never "No members yet" or
 * "0 people" with Invite beside it (an admin might re-invite everyone). The invitation pill tells the
 * truth (Email failed), and a resend whose email failed says so.
 */

const { actions, toast } = vi.hoisted(() => ({
    actions: {
        getFirmMembers: vi.fn(),
        resendFirmInvitation: vi.fn(),
        revokeFirmInvitation: vi.fn(),
        removeFirmMember: vi.fn(),
        getClientMembers: vi.fn(),
        resendClientInvitation: vi.fn(),
        revokeClientInvitation: vi.fn(),
        getProjectMembers: vi.fn(),
        getProjectPersonas: vi.fn(async () => []),
    },
    toast: { addToast: vi.fn() },
}))

vi.mock('@/lib/actions/firm-members', () => ({
    getFirmMembers: actions.getFirmMembers,
    resendFirmInvitation: actions.resendFirmInvitation,
    revokeFirmInvitation: actions.revokeFirmInvitation,
    removeFirmMember: actions.removeFirmMember,
    inviteFirmMember: vi.fn(),
}))
vi.mock('@/lib/actions/client-members', () => ({
    getClientMembers: actions.getClientMembers,
    resendClientInvitation: actions.resendClientInvitation,
    revokeClientInvitation: actions.revokeClientInvitation,
    inviteClientMember: vi.fn(),
}))
vi.mock('@/lib/actions/members', () => ({ getProjectMembers: actions.getProjectMembers, removeMember: vi.fn(), revokeInvitation: vi.fn(), updateMemberPersona: vi.fn() }))
vi.mock('@/lib/actions/invitations', () => ({ inviteMember: vi.fn(), resendInvitation: vi.fn() }))
vi.mock('@/lib/actions/personas', () => ({ getProjectPersonas: actions.getProjectPersonas }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => toast }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { FirmMembersTab } from './firm-members-tab'
import { ClientMembersTab } from './client-members-tab'
import { EngagementMembersTab } from './engagement-members-tab'
import { TooltipProvider } from '@/components/ui/tooltip'

const failed = { ok: false, code: 'forbidden', error: "You don't have permission to see this firm's members." }

beforeEach(() => {
    vi.clearAllMocks()
})

describe('Firm members', () => {
    const renderTab = () => render(<TooltipProvider><FirmMembersTab firmId="f1" groupSlug="g" orgSlug="acme" canManage /></TooltipProvider>)

    it('says the members did not load, never "No members yet"', async () => {
        actions.getFirmMembers.mockResolvedValue(failed)
        renderTab()
        expect(await screen.findByText("Couldn't load members")).toBeTruthy()
        expect(screen.getByText(failed.error)).toBeTruthy()
        expect(screen.queryByText('No members yet')).toBeNull()
    })

    it("shows each invitation's real status, not a hardcoded Invited", async () => {
        actions.getFirmMembers.mockResolvedValue({ ok: true, data: { members: [], invitations: [{ id: 'i1', email: 'ana@acme.test', status: 'ERROR' }] } })
        renderTab()
        const row = (await screen.findByText('ana@acme.test')).closest('tr') as HTMLElement
        expect(within(row).getByText('Email failed')).toBeTruthy()
    })

    it('says a resend whose email failed did, never "Invitation resent"', async () => {
        actions.getFirmMembers.mockResolvedValue({ ok: true, data: { members: [], invitations: [{ id: 'i1', email: 'ana@acme.test', status: 'PENDING' }] } })
        actions.resendFirmInvitation.mockResolvedValue({ ok: false, code: 'email_failed', error: "Couldn't email ana@acme.test. The invitation is still open, so try again in a moment." })
        renderTab()
        fireEvent.click(await screen.findByRole('button', { name: 'Resend invitation to ana@acme.test' }))
        await waitFor(() => expect(toast.addToast).toHaveBeenCalledWith({
            type: 'error',
            title: "Couldn't resend invitation",
            message: "Couldn't email ana@acme.test. The invitation is still open, so try again in a moment.",
        }))
    })
})

describe('Client members', () => {
    it('says the members did not load, never "No members yet"', async () => {
        actions.getClientMembers.mockResolvedValue({ ...failed, error: "You don't have permission to see this client's members." })
        render(<ClientMembersTab firmId="f1" clientId="c1" orgSlug="acme" clientSlug="contoso" canManage />)
        expect(await screen.findByText("Couldn't load members")).toBeTruthy()
        expect(screen.queryByText(/No members yet/)).toBeNull()
    })

    it("shows each invitation's real status", async () => {
        actions.getClientMembers.mockResolvedValue({ ok: true, data: { members: [], invitations: [{ id: 'i1', email: 'ana@client.test', status: 'ERROR' }] } })
        render(<ClientMembersTab firmId="f1" clientId="c1" orgSlug="acme" clientSlug="contoso" canManage />)
        expect(await screen.findByText('Email failed')).toBeTruthy()
    })
})

describe('Engagement members', () => {
    it('says the members did not load, never "0 people"', async () => {
        actions.getProjectMembers.mockResolvedValue({ ok: false, code: 'internal', error: 'Something went wrong on our side. Try again.' })
        render(<EngagementMembersTab projectId="e1" groupSlug="g" orgSlug="acme" canManage clientConnectorId="conn-1" />)
        expect(await screen.findByText("Couldn't load members")).toBeTruthy()
        expect(screen.queryByText('0 people')).toBeNull()
    })

    it('tries again from the failure', async () => {
        actions.getProjectMembers
            .mockResolvedValueOnce({ ok: false, code: 'internal', error: 'Something went wrong on our side. Try again.' })
            .mockResolvedValueOnce({ ok: true, data: { members: [], invitations: [] } })
        render(<EngagementMembersTab projectId="e1" groupSlug="g" orgSlug="acme" canManage clientConnectorId="conn-1" />)
        fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
        expect(await screen.findByText('0 people')).toBeTruthy()
    })
})
