import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * P2-39 and P1-07: a client's branding that fails to load must not read as "uses firm branding",
 * since saving that deletes the real brand record. And a save says why it was refused.
 */

const { actions, toast } = vi.hoisted(() => ({
    actions: {
        updateClient: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ ok: true, data: undefined })),
        upsertClientBrand: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ ok: true, data: undefined })),
        deleteClient: vi.fn(),
        getFirmMembers: vi.fn(async () => ({ ok: true, data: { members: [], invitations: [] } })),
    },
    toast: { addToast: vi.fn() },
}))
vi.mock('@/lib/actions/client', () => ({ updateClient: actions.updateClient, upsertClientBrand: actions.upsertClientBrand, deleteClient: actions.deleteClient }))
vi.mock('@/lib/actions/firm-members', () => ({ getFirmMembers: actions.getFirmMembers }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => toast }))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/components/connectors/client-drive-section', () => ({ ClientDriveSection: () => null }))

import { ClientSettingsForm } from './client-settings-form'

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
    vi.clearAllMocks()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
// Stable: the form resets its fields whenever initialTags changes, so a fresh [] each render loops.
const TAGS: string[] = []
const renderForm = () => render(<ClientSettingsForm groupSlug="g" orgSlug="acme" firmId="f1" clientId="c1" clientSlug="contoso" initialName="Contoso" initialTags={TAGS} />)

describe('ClientSettingsForm branding', () => {
    it('says the branding did not load, and offers no way to save over it', async () => {
        fetchMock.mockResolvedValue(json({ error: 'Something went wrong on our side. Try again.' }, 500))
        renderForm()
        expect(await screen.findByText("Couldn't load this client's branding")).toBeTruthy()
        expect(screen.queryByText(/This client uses your firm/)).toBeNull()
        expect((screen.getByRole('button', { name: 'Save branding' }) as HTMLButtonElement).disabled).toBe(true)
        expect((screen.getByRole('button', { name: 'Firm branding' }) as HTMLButtonElement).disabled).toBe(true)
        expect(actions.upsertClientBrand).not.toHaveBeenCalled()
    })

    it('loads again from the failure, and shows the real brand', async () => {
        fetchMock
            .mockResolvedValueOnce(json({ error: 'busy' }, 503))
            .mockResolvedValueOnce(json({ brand: { name: 'Contoso Brand' } }))
        renderForm()
        fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
        expect(await screen.findByDisplayValue('Contoso Brand')).toBeTruthy()
    })
})

describe('ClientSettingsForm details', () => {
    it("shows the save's reason under the action's name", async () => {
        fetchMock.mockResolvedValue(json({ brand: null }))
        actions.updateClient.mockResolvedValueOnce({ ok: false, code: 'invalid_owner', error: 'The owner must be a member of this firm.' })
        renderForm()
        const name = await screen.findByLabelText(/Name/)
        fireEvent.change(name, { target: { value: 'Contoso Ltd' } })
        fireEvent.click(screen.getByRole('button', { name: /Save changes/ }))
        await waitFor(() => expect(toast.addToast).toHaveBeenCalledWith({ type: 'error', title: "Couldn't save client", message: 'The owner must be a member of this firm.' }))
    })
})
