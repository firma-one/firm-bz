import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { addToast, signOutEverywhere } = vi.hoisted(() => ({ addToast: vi.fn(), signOutEverywhere: vi.fn() }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast }) }))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ signOutEverywhere }) }))

import { SessionsCard } from './sessions-card'
import { SignOutEveryoneCard } from '@/app/(app)/system/sign-out-everyone-card'

beforeEach(() => {
    addToast.mockReset()
    signOutEverywhere.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe('Profile — Sign out of all devices', () => {
    it('asks first, then ends every sign-in', async () => {
        signOutEverywhere.mockResolvedValue(undefined)
        render(<SessionsCard />)
        fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }))
        expect(signOutEverywhere).not.toHaveBeenCalled()
        expect(screen.getByText('Sign out of all devices?')).toBeTruthy()

        const confirm = screen.getAllByRole('button', { name: 'Sign out everywhere' }).at(-1)!
        fireEvent.click(confirm)
        await waitFor(() => expect(signOutEverywhere).toHaveBeenCalledTimes(1))
    })

    it('says so when it fails', async () => {
        signOutEverywhere.mockRejectedValue(new Error('nope'))
        render(<SessionsCard />)
        fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }))
        fireEvent.click(screen.getAllByRole('button', { name: 'Sign out everywhere' }).at(-1)!)
        await waitFor(() => expect(addToast).toHaveBeenCalledWith(expect.objectContaining({
            type: 'error',
            title: "Couldn't sign out of all devices",
            message: "Something went wrong on our side, so you're still signed in everywhere. Try again.",
        })))
    })

    it('says the request never left when the browser is offline', async () => {
        signOutEverywhere.mockRejectedValue(new TypeError('Failed to fetch'))
        render(<SessionsCard />)
        fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }))
        fireEvent.click(screen.getAllByRole('button', { name: 'Sign out everywhere' }).at(-1)!)
        await waitFor(() => expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/^Couldn't reach/) })))
    })
})

describe('/system — Sign out everyone', () => {
    it('asks first, then reports how many sessions ended', async () => {
        const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ended: 7 }) }) as Response)
        vi.stubGlobal('fetch', fetchMock)
        render(<SignOutEveryoneCard />)

        fireEvent.click(screen.getByRole('button', { name: 'Sign out everyone' }))
        expect(fetchMock).not.toHaveBeenCalled()
        expect(screen.getByText('Everyone except you, on every device.')).toBeTruthy()

        fireEvent.click(screen.getAllByRole('button', { name: 'Sign out everyone' }).at(-1)!)
        await waitFor(() => expect(addToast).toHaveBeenCalledWith(expect.objectContaining({
            type: 'success',
            title: 'Everyone else is signed out',
            message: '7 sessions ended. Your own sign-in is kept.',
        })))
        expect(fetchMock).toHaveBeenCalledWith('/api/system/sessions', { method: 'DELETE' })
        expect(screen.getByText(/^7 sessions ended ·/)).toBeTruthy()
    })

    it("shows the server's reason when it can't", async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: 'permission denied for table sessions' }) }) as Response))
        render(<SignOutEveryoneCard />)
        fireEvent.click(screen.getByRole('button', { name: 'Sign out everyone' }))
        fireEvent.click(screen.getAllByRole('button', { name: 'Sign out everyone' }).at(-1)!)
        await waitFor(() => expect(addToast).toHaveBeenCalledWith(expect.objectContaining({
            type: 'error',
            message: 'permission denied for table sessions',
        })))
    })
})
