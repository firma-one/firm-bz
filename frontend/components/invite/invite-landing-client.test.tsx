import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

/** P1-18: Sign out works and returns to the invite. P2-56: no raw Prisma text. */

const { auth, accept } = vi.hoisted(() => ({
    auth: { signOut: vi.fn(async () => undefined) },
    accept: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => auth }))
vi.mock('@/lib/actions/invitations', () => ({ acceptInvitationAction: accept }))

import { InviteLandingClient, joinFailureMessage } from './invite-landing-client'

const invitation = {
    type: 'firm',
    id: 'i1',
    token: 'tok123',
    email: 'invitee@acme.test',
    status: 'PENDING',
    firm: { name: 'Acme', slug: 'acme' },
} as any

beforeEach(() => {
    vi.clearAllMocks()
})

describe('InviteLandingClient', () => {
    it("signs out with the app's own sign-out, then returns to sign-in for this invite", async () => {
        const assign = vi.fn()
        Object.defineProperty(window, 'location', { value: { ...window.location, set href(v: string) { assign(v) } }, writable: true })
        render(<InviteLandingClient invitation={invitation} userEmail="someone@else.test" />)
        fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
        await waitFor(() => expect(auth.signOut).toHaveBeenCalled())
        await waitFor(() => expect(assign).toHaveBeenCalled())
        const target = assign.mock.calls[0][0] as string
        expect(target).toContain('/signin?next=%2Finvite%2Ftok123')
        expect(target).toContain('#email=invitee%40acme.test')
    })

    it('shows plain words, not the raw error, when joining fails', async () => {
        accept.mockResolvedValueOnce({ success: false, error: 'Invalid `prisma.firmMember.create()` invocation: Unique constraint failed' })
        render(<InviteLandingClient invitation={invitation} userEmail="invitee@acme.test" />)
        expect(await screen.findByText("Couldn't join just now. Try again.")).toBeTruthy()
        expect(screen.queryByText(/prisma/)).toBeNull()
    })
})

describe('joinFailureMessage', () => {
    it('lets the reasons written for people through', () => {
        expect(joinFailureMessage('This invitation is for a@b.test')).toBe('This invitation is for a@b.test')
        expect(joinFailureMessage('Invitation expired')).toMatch(/has expired/)
    })
})
