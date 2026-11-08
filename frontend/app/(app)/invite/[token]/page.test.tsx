import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

/** P1-17: an expired invitation says so instead of a 404; an unknown token stays a 404. */

const { verify } = vi.hoisted(() => ({ verify: vi.fn() }))

vi.mock('@/lib/actions/invitations', () => ({ verifyInvitation: verify, acceptInvitationAction: vi.fn() }))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }))
vi.mock('next/navigation', () => ({
    notFound: () => {
        throw new Error('NEXT_NOT_FOUND')
    },
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ signOut: vi.fn() }) }))

import InvitePage from './page'

const page = (token = 'tok') => InvitePage({ params: Promise.resolve({ token }) })

beforeEach(() => vi.clearAllMocks())

describe('InvitePage', () => {
    it('says an expired invitation has expired', async () => {
        verify.mockRejectedValueOnce(new Error('Invitation expired'))
        render(await page())
        expect(screen.getByText('This invitation has expired')).toBeTruthy()
    })

    it('keeps an unknown token a 404', async () => {
        verify.mockRejectedValueOnce(new Error('Invalid token'))
        await expect(page()).rejects.toThrow('NEXT_NOT_FOUND')
    })

    it('says to try again when the lookup itself fails', async () => {
        verify.mockRejectedValueOnce(new Error("Can't reach database server"))
        render(await page())
        expect(screen.getByText("Couldn't open this invitation")).toBeTruthy()
    })

    it('says a withdrawn invitation is no longer active', async () => {
        verify.mockResolvedValueOnce({ type: 'firm', id: 'i', token: 'tok', email: 'a@b.test', status: 'SUPERSEDED', firm: { name: 'A', slug: 'a' } })
        render(await page())
        expect(screen.getByText('This invitation is no longer active')).toBeTruthy()
    })
})
