import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * ST-1 and P1-05: Firm Settings must never save defaults over the firm's real settings after a failed
 * load. It used to mark itself loaded either way, so one change and Save wrote blanks over memo, notes,
 * reminder and event config, beta features and domain access, and Save branding erased the logo.
 */

const { updateFirm, toast } = vi.hoisted(() => ({
    updateFirm: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ ok: true, data: undefined })),
    toast: { addToast: vi.fn() },
}))
vi.mock('@/lib/actions/firms', () => ({ updateFirm, deleteFirm: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => toast }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) } } }))
vi.mock('@/components/connectors/firm-drive-section', () => ({ FirmDriveSection: () => null }))

import { FirmSettingsForm } from './firm-settings-form'

const firm = {
    id: 'f1',
    settings: { internalMemo: 'Real memo', notes: 'Real notes', branding: { logoData: 'data:image/png;base64,AAA' } },
    allowDomainAccess: true,
    allowedEmailDomain: 'acme.test',
}

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
    vi.clearAllMocks()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('FirmSettingsForm', () => {
    it('locks the form with the reason when its settings fail to load', async () => {
        fetchMock.mockResolvedValue(json({ error: 'Something went wrong on our side. Try again.' }, 500))
        render(<FirmSettingsForm orgSlug="acme" orgId="f1" initialName="Acme" />)
        expect(await screen.findByText("Couldn't load firm settings")).toBeTruthy()
        expect(screen.getByText(/Something went wrong on our side\. Try again\. Nothing here can be changed until they load\./)).toBeTruthy()
        // No field to change, and so nothing to save over the real settings.
        expect(screen.queryByLabelText('Firm name')).toBeNull()
        expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
        expect(updateFirm).not.toHaveBeenCalled()
    })

    it('locks Branding too, so Save branding can never erase the logo', async () => {
        fetchMock.mockResolvedValue(json({ error: 'Unauthorized' }, 401))
        render(<FirmSettingsForm orgSlug="acme" orgId="f1" initialName="Acme" initialSection="branding" />)
        expect(await screen.findByText("Couldn't load firm settings")).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'Save branding' })).toBeNull()
    })

    it('loads again from the failure, then saves what loaded', async () => {
        fetchMock
            .mockResolvedValueOnce(json({ error: 'busy' }, 503))
            .mockResolvedValueOnce(json({ firm }))
        render(<FirmSettingsForm orgSlug="acme" orgId="f1" initialName="Acme" />)
        fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
        const name = await screen.findByLabelText('Firm name')
        await waitFor(() => expect((screen.getByLabelText('Internal memo') as HTMLTextAreaElement).value).toBe('Real memo'))
        fireEvent.change(name, { target: { value: 'Acme Advisory' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
        await waitFor(() => expect(updateFirm).toHaveBeenCalled())
        expect(updateFirm.mock.calls[0][1]).toMatchObject({ name: 'Acme Advisory', internalMemo: 'Real memo', notes: 'Real notes', allowedEmailDomain: 'acme.test' })
    })

    it("shows the save's reason under the action's name", async () => {
        fetchMock.mockResolvedValue(json({ firm }))
        updateFirm.mockResolvedValueOnce({ ok: false, code: 'forbidden', error: 'Only firm admins can change firm settings.' })
        render(<FirmSettingsForm orgSlug="acme" orgId="f1" initialName="Acme" />)
        const name = await screen.findByLabelText('Firm name')
        await waitFor(() => expect((screen.getByLabelText('Internal memo') as HTMLTextAreaElement).value).toBe('Real memo'))
        fireEvent.change(name, { target: { value: 'Acme Advisory' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
        await waitFor(() => expect(toast.addToast).toHaveBeenCalledWith({ type: 'error', title: "Couldn't save firm settings", message: 'Only firm admins can change firm settings.' }))
    })
})
