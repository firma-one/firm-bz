import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/**
 * P1-23: the workspaces load that fails says so, with Retry. It used to spin forever (getUserGroups
 * threw), or read "No workspaces yet · Create your own workspace", where one click makes a real extra
 * workspace.
 */

const { getUserGroups } = vi.hoisted(() => ({ getUserGroups: vi.fn() }))
vi.mock('@/lib/actions/firms', () => ({ getUserGroups, createOwnWorkspace: vi.fn(), switchFirm: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: { app_metadata: {} } }) }))

import { GroupPicker } from './group-picker'

beforeEach(() => vi.clearAllMocks())

describe('GroupPicker', () => {
    it('says the workspaces did not load, and offers no Create', async () => {
        getUserGroups.mockResolvedValue({ ok: false, code: 'internal', error: 'Something went wrong on our side. Try again.' })
        render(<GroupPicker />)
        expect(await screen.findByText("Couldn't load your workspaces")).toBeTruthy()
        expect(screen.queryByText('No workspaces yet')).toBeNull()
        expect(screen.queryByRole('button', { name: /Create your own workspace/ })).toBeNull()
    })

    it('says so when the request never got there', async () => {
        getUserGroups.mockRejectedValue(new TypeError('Failed to fetch'))
        render(<GroupPicker />)
        expect(await screen.findByText(/Check your connection/)).toBeTruthy()
    })

    it('tries again, and shows the groups once they load', async () => {
        getUserGroups
            .mockResolvedValueOnce({ ok: false, code: 'internal', error: 'Something went wrong on our side. Try again.' })
            .mockResolvedValueOnce({ ok: true, data: { groups: [{ id: 'g1', slug: 'acme', name: 'Acme Group', isGroupAdmin: true, firmCount: 2 }], firms: [] } })
        render(<GroupPicker />)
        fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
        expect(await screen.findByText('Acme Group')).toBeTruthy()
    })
})
