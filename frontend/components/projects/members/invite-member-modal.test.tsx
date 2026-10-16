import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { inviteMember } = vi.hoisted(() => ({ inviteMember: vi.fn(async () => {}) }))
vi.mock('@/lib/actions/invitations', () => ({ inviteMember }))

import { InviteMemberModal } from './invite-member-modal'

const personas = [
    { id: 'p-admin', slug: 'eng_admin', displayName: 'Engagement Lead', description: 'Runs the engagement' },
    { id: 'p-member', slug: 'eng_member', displayName: 'Contributor (Internal)', description: 'Does the work' },
    { id: 'p-ext', slug: 'eng_ext_collaborator', displayName: 'Contributor (External)', description: 'Outside help' },
    { id: 'p-viewer', slug: 'eng_viewer', displayName: 'Reviewer', description: 'Client reviewer' },
] as never[]

function renderModal(preselectedUiRole: 'owner' | 'contributor' | 'reviewer' | null = null) {
    const onSuccess = vi.fn()
    const onOpenChange = vi.fn()
    render(
        <InviteMemberModal
            projectId="eng-1"
            open
            onOpenChange={onOpenChange}
            personas={personas}
            preselectedUiRole={preselectedUiRole}
            onSuccess={onSuccess}
        />,
    )
    return { onSuccess, onOpenChange }
}

const sendButton = () => screen.getByRole('button', { name: 'Send invitation' })

beforeEach(() => vi.clearAllMocks())

describe('InviteMemberModal', () => {
    it('is a Notion form: a visible title, property rows and a single primary action', () => {
        renderModal('owner')
        expect(screen.getByRole('dialog', { name: 'Invite to engagement' })).toBeTruthy()
        expect(screen.getByLabelText('Email')).toBeTruthy()
        expect(screen.getByText('Role')).toBeTruthy()
        expect(screen.getByText('Engagement Lead · manages the engagement and its members · internal')).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
        expect((sendButton() as HTMLButtonElement).disabled).toBe(true)
    })

    it('offers the access level only for contributors, and describes the one picked', () => {
        renderModal('contributor')
        const full = screen.getByRole('radio', { name: 'Full Access' })
        expect(full.getAttribute('aria-checked')).toBe('true')
        expect(screen.getByText('Contributor · edits all engagement content · internal')).toBeTruthy()

        fireEvent.click(screen.getByRole('radio', { name: 'Limited Access' }))
        expect(screen.getByRole('radio', { name: 'Limited Access' }).getAttribute('aria-checked')).toBe('true')
        expect(screen.getByText('Contributor · edits only what is shared with them · guest')).toBeTruthy()
    })

    it('has no access level for an owner', () => {
        renderModal('owner')
        expect(screen.queryByRole('radiogroup', { name: 'Access' })).toBeNull()
    })

    it('flags an invalid email and keeps Send disabled', async () => {
        renderModal('reviewer')
        fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } })
        expect(await screen.findByText('Please enter a valid email address')).toBeTruthy()
        expect((sendButton() as HTMLButtonElement).disabled).toBe(true)
    })

    it('invites with the persona the role and access resolve to', async () => {
        const { onSuccess, onOpenChange } = renderModal('contributor')
        fireEvent.click(screen.getByRole('radio', { name: 'Limited Access' }))
        fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sam@out.test' } })
        await waitFor(() => expect((sendButton() as HTMLButtonElement).disabled).toBe(false))

        fireEvent.click(sendButton())
        await waitFor(() => expect(inviteMember).toHaveBeenCalledWith('eng-1', 'sam@out.test', 'p-ext'))
        expect(onSuccess).toHaveBeenCalled()
        expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it('shows the server error in the notice', async () => {
        inviteMember.mockRejectedValueOnce(new Error('Already a member'))
        renderModal('reviewer')
        fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'pat@acme.test' } })
        await waitFor(() => expect((sendButton() as HTMLButtonElement).disabled).toBe(false))
        fireEvent.click(sendButton())
        expect((await screen.findByRole('alert')).textContent).toContain('Already a member')
    })
})
