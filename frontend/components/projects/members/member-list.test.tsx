import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

const { addToast } = vi.hoisted(() => ({ addToast: vi.fn() }))
vi.mock('@/lib/actions/members', () => ({ removeMember: vi.fn(), revokeInvitation: vi.fn(), updateMemberPersona: vi.fn() }))
vi.mock('@/lib/actions/invitations', () => ({ resendInvitation: vi.fn() }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast }) }))

import { MemberList } from './member-list'
import { updateMemberPersona } from '@/lib/actions/members'
import { waitFor } from '@testing-library/react'

const personas = [
    { id: 'p-admin', slug: 'eng_admin', description: 'Runs the engagement' },
    { id: 'p-member', slug: 'eng_member', description: 'Does the work' },
    { id: 'p-ext', slug: 'eng_ext_collaborator', description: 'Outside help' },
    { id: 'p-viewer', slug: 'eng_viewer', description: 'Client reviewer' },
]
const members = [
    { id: 'm1', role: 'eng_admin', createdAt: '2026-09-01', user: { name: 'Pat Lee', email: 'pat@acme.test', avatarUrl: null } },
    { id: 'm2', role: 'eng_ext_collaborator', createdAt: '2026-09-02', user: { name: 'Sam Roy', email: 'sam@out.test', avatarUrl: null } },
]
const invitations = [{ id: 'i1', email: 'new@client.test', personaId: 'p-viewer', status: 'PENDING' }]

beforeEach(() => vi.clearAllMocks())

function groupOf(text: string) {
    return screen.getByText(text).closest('tbody') as HTMLElement
}

describe('MemberList', () => {
    it('groups people and invitations under their role', () => {
        render(<MemberList members={members} invitations={invitations} personas={personas} onRefresh={() => {}} />)
        // The first row of each group is its header.
        const header = (text: string) => groupOf(text).querySelector('tr') as HTMLElement
        expect(within(header('Pat Lee')).getByText('Lead')).toBeTruthy()
        expect(within(header('Sam Roy')).getByText('Contributor')).toBeTruthy()
        expect(within(screen.getByText('Sam Roy').closest('tr') as HTMLElement).getByText('Contributor · Limited Access')).toBeTruthy()
        expect(within(header('new@client.test')).getByText('Reviewer')).toBeTruthy()
        expect(within(screen.getByText('new@client.test').closest('tr') as HTMLElement).getByText('Invited')).toBeTruthy()
    })

    it('hides every management control from people who cannot manage', () => {
        render(<MemberList members={members} invitations={invitations} personas={personas} onRefresh={() => {}} onInviteWithRole={() => {}} />)
        expect(screen.queryByRole('button', { name: /Actions for/ })).toBeNull()
        expect(screen.queryByRole('button', { name: /Change role for/ })).toBeNull()
        expect(screen.queryByRole('button', { name: /Cancel invitation/ })).toBeNull()
        expect(screen.queryByRole('button', { name: /Invite/ })).toBeNull()
    })

    it('lets a manager invite into a role and open the role dialog from the cell', () => {
        const onInviteWithRole = vi.fn()
        render(<MemberList members={members} invitations={invitations} personas={personas} onRefresh={() => {}} canManage onInviteWithRole={onInviteWithRole} />)
        fireEvent.click(screen.getByRole('button', { name: 'Invite reviewer' }))
        expect(onInviteWithRole).toHaveBeenCalledWith('reviewer')
        fireEvent.click(screen.getByRole('button', { name: 'Change role for Sam Roy' }))
        expect(screen.getByRole('dialog', { name: 'Change role' })).toBeTruthy()
    })

    it('says so when a role has nobody in it', () => {
        render(<MemberList members={[members[0]]} invitations={[]} personas={personas} onRefresh={() => {}} />)
        expect(screen.getAllByText('No one in this role yet.')).toHaveLength(2)
    })
})

describe('changing a role', () => {
    const save = async () => {
        render(<MemberList members={members} invitations={[]} personas={personas} onRefresh={() => {}} canManage />)
        fireEvent.click(screen.getByRole('button', { name: 'Change role for Sam Roy' }))
        fireEvent.click(within(screen.getByRole('dialog', { name: 'Change role' })).getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(addToast).toHaveBeenCalled())
        return addToast.mock.calls[0][0]
    }

    it("shows what storage still allows as a warning, under the action's name", async () => {
        vi.mocked(updateMemberPersona).mockResolvedValue({ ok: true, data: undefined, warning: 'Role updated in firma, but Google Drive still gives them access to Confidential · why' })
        expect(await save()).toEqual({ type: 'warning', title: 'Role changed', message: 'Role updated in firma, but Google Drive still gives them access to Confidential · why' })
    })

    it('shows the reason it was refused', async () => {
        vi.mocked(updateMemberPersona).mockResolvedValue({ ok: false, error: "You don't have permission to change this engagement's members.", code: 'forbidden' })
        expect(await save()).toEqual({ type: 'error', title: "Couldn't change role", message: "You don't have permission to change this engagement's members." })
    })
})

describe('resending an invitation (MB-1)', () => {
    it('says the email failed, never "Invitation resent", and refreshes so the pill agrees', async () => {
        const { resendInvitation } = await import('@/lib/actions/invitations')
        vi.mocked(resendInvitation).mockResolvedValue({ ok: false, code: 'email_failed', error: "Couldn't email new@client.test. The invitation is still open, so try again in a moment." })
        const onRefresh = vi.fn()
        render(<MemberList members={members} invitations={invitations} personas={personas} onRefresh={onRefresh} canManage />)
        fireEvent.click(screen.getByRole('button', { name: 'Resend invitation to new@client.test' }))
        await waitFor(() => expect(addToast).toHaveBeenCalledWith({
            type: 'error',
            title: "Couldn't resend invitation",
            message: "Couldn't email new@client.test. The invitation is still open, so try again in a moment.",
        }))
        expect(onRefresh).toHaveBeenCalled()
    })

    it('shows Email failed on the row when the invitation email did not go', () => {
        render(<MemberList members={[]} invitations={[{ ...invitations[0], status: 'ERROR' }]} personas={personas} onRefresh={() => {}} />)
        expect(within(screen.getByText('new@client.test').closest('tr') as HTMLElement).getByText('Email failed')).toBeTruthy()
    })
})
