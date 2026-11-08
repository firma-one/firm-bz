import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

/** P2-36: a failed check is never drawn as a connected (or disconnected) account. */

vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ session: { access_token: 'tok' } }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { ClientDriveSection } from './client-drive-section'

afterEach(() => vi.unstubAllGlobals())

const props = { connectorId: 'conn', clientId: 'c1', firmId: 'f1', groupSlug: 'g', orgSlug: 'acme' }

describe('ClientDriveSection', () => {
    it("says it couldn't check the connection when the status call fails", async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Database unavailable' }), { status: 500 })))
        render(<ClientDriveSection {...props} />)
        expect(await screen.findByText(/Couldn.t check the connection · Database unavailable/)).toBeTruthy()
        expect(screen.queryByText('Google account')).toBeNull()
    })

    it("says so when neither provider knows the connector, instead of 'Disconnected'", async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ isConnected: false, connector: null }))))
        render(<ClientDriveSection {...props} />)
        expect(await screen.findByText(/Couldn.t check the connection/)).toBeTruthy()
        expect(screen.queryByText(/Disconnected/)).toBeNull()
    })
})
