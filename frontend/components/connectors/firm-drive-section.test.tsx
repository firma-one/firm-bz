import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * P1-35, CN-4, P1-08 and P2-34 in Firm Settings · Storage:
 * - a failed load says so, with Retry, and offers no Connect form (an empty panel with only that form
 *   reads as "nothing connected" and invites a second connection);
 * - "linked, but the folder couldn't be set up" arrives as the action's warning, with the ticket
 *   number, and the client shows as attached (an error class can't cross to the browser);
 * - a refused disconnect says why;
 * - a connection whose location didn't load says so, rather than "Choose a workspace folder".
 */

const { firms, client, toast } = vi.hoisted(() => ({
    firms: {
        getFirmConnectors: vi.fn(),
        getFirmAllClients: vi.fn(),
        disconnectFirmConnector: vi.fn(),
        removeFirmConnector: vi.fn(),
        renameFirmConnector: vi.fn(),
        detachConnectorFromClient: vi.fn(),
    },
    client: { shareConnectorWithClient: vi.fn() },
    toast: { addToast: vi.fn() },
}))
vi.mock('@/lib/actions/firms', () => firms)
vi.mock('@/lib/actions/client', () => client)
vi.mock('@/components/ui/toast', () => ({ useToast: () => toast }))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: { id: 'u1' }, session: { access_token: 't' } }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/components/google-drive/google-drive-workspace-root', () => ({ GoogleDriveWorkspaceRoot: () => <div>Location</div> }))
vi.mock('@/components/connectors/onedrive-workspace-root', () => ({ OneDriveWorkspaceRoot: () => null }))

import { FirmDriveSection } from './firm-drive-section'

const connector = {
    id: 'conn-1', type: 'GOOGLE_DRIVE', name: 'Acme Drive', email: 'pat@acme.test', status: 'ACTIVE',
    workspaceRootLocation: 'PERSONAL', rootFolderId: 'root', attachedClients: [], documentCount: 0,
}

let fetchMock: ReturnType<typeof vi.fn>
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
    vi.clearAllMocks()
    fetchMock = vi.fn(async () => json({ connector: { rootFolderId: 'root', rootFolderName: 'Acme', workspaceRootLocation: 'PERSONAL' } }))
    vi.stubGlobal('fetch', fetchMock)
    firms.getFirmConnectors.mockResolvedValue({ ok: true, data: [connector] })
    firms.getFirmAllClients.mockResolvedValue({ ok: true, data: [{ id: 'c1', name: 'Contoso', connectorId: null }] })
})
afterEach(() => vi.unstubAllGlobals())

describe('FirmDriveSection', () => {
    it('says the connections did not load, with Retry, and offers no Connect form', async () => {
        firms.getFirmConnectors.mockResolvedValue({ ok: false, code: 'forbidden', error: "You don't have permission to manage this firm's storage." })
        const onConnectorsLoaded = vi.fn()
        render(<FirmDriveSection firmId="f1" orgSlug="acme" onConnectorsLoaded={onConnectorsLoaded} />)
        expect(await screen.findByText("Couldn't load storage connections")).toBeTruthy()
        expect(screen.getByText("You don't have permission to manage this firm's storage.")).toBeTruthy()
        expect(screen.queryByText('Connect storage account')).toBeNull()
        // Firm Settings opens the Storage tab on "0 connectors": a failure isn't zero.
        expect(onConnectorsLoaded).not.toHaveBeenCalled()
    })

    it('loads again from the failure', async () => {
        firms.getFirmConnectors
            .mockResolvedValueOnce({ ok: false, code: 'internal', error: 'Something went wrong on our side. Try again.' })
            .mockResolvedValueOnce({ ok: true, data: [connector] })
        render(<FirmDriveSection firmId="f1" orgSlug="acme" />)
        fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
        expect(await screen.findByText('Acme Drive')).toBeTruthy()
    })

    it('shows "attached with a problem" with the ticket number, and the client as attached (CN-4)', async () => {
        const warning = "Attached, but its folder in Google Drive couldn't be set up · The Google Drive account connected to this client doesn't have permission to change this. Support ticket #42 filed."
        client.shareConnectorWithClient.mockResolvedValue({ ok: true, data: { folderFailed: true, engagementsWithoutFolder: [] }, warning })
        render(<FirmDriveSection firmId="f1" orgSlug="acme" />)
        await screen.findByText('Location')
        fireEvent.click(await screen.findByRole('button', { name: 'Link' }))
        await waitFor(() => expect(toast.addToast).toHaveBeenCalledWith({ type: 'warning', title: 'Attached with a problem', message: warning }))
        expect(await screen.findByRole('button', { name: 'Unlink' })).toBeTruthy()
    })

    it("shows an attach's refusal in words, and leaves the client unattached", async () => {
        client.shareConnectorWithClient.mockResolvedValue({ ok: false, code: 'forbidden', error: "You don't have permission to change this client's storage." })
        render(<FirmDriveSection firmId="f1" orgSlug="acme" />)
        await screen.findByText('Location')
        fireEvent.click(await screen.findByRole('button', { name: 'Link' }))
        await waitFor(() => expect(toast.addToast).toHaveBeenCalledWith({ type: 'error', title: "Couldn't attach the client", message: "You don't have permission to change this client's storage." }))
        expect(screen.getByRole('button', { name: 'Link' })).toBeTruthy()
    })

    it("says a connection's location didn't load, rather than asking to choose a folder (P2-34)", async () => {
        fetchMock.mockResolvedValue(json({ error: 'The connection to Google Drive needs renewing. Reconnect the storage, then try again.' }, 401))
        render(<FirmDriveSection firmId="f1" orgSlug="acme" />)
        expect(await screen.findByText(/Couldn't load this connection's location · The connection to Google Drive needs renewing/)).toBeTruthy()
    })
})
