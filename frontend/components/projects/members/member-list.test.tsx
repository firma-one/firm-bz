import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

vi.mock('@/lib/actions/members', () => ({ removeMember: vi.fn(), revokeInvitation: vi.fn(), updateMemberPersona: vi.fn() }))
vi.mock('@/lib/actions/invitations', () => ({ resendInvitation: vi.fn() }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }))

import { MemberList } from './member-list'

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
        expect(within(header('Pat Lee')).getByText('Owner')).toBeTruthy()
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
