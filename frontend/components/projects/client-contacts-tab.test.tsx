import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'

const { actions, toast } = vi.hoisted(() => ({
    actions: {
        list: vi.fn(),
        create: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ ok: true, data: undefined })),
        update: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ ok: true, data: undefined })),
        remove: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ ok: true, data: undefined })),
    },
    toast: { addToast: vi.fn() },
}))
vi.mock('@/lib/actions/client', () => ({
    listClientContacts: actions.list,
    createClientContact: actions.create,
    updateClientContact: actions.update,
    deleteClientContact: actions.remove,
}))
vi.mock('@/components/ui/toast', () => ({ useToast: () => toast }))

import { ClientContactsTab } from './client-contacts-tab'

const render = () => rtlRender(<TooltipProvider><ClientContactsTab orgSlug="acme" clientSlug="ds" canManage /></TooltipProvider>)

beforeEach(() => {
    vi.clearAllMocks()
    actions.list.mockResolvedValue({ ok: true, data: [
        { id: 'c1', name: 'Ana Lopez', email: 'ana@ds.com', phone: null, title: 'CFO', notes: null, tags: ['billing'] },
    ] })
})

describe('ClientContactsTab — the contact dialog', () => {
    it('creates a contact from the property rows, with a tag typed under More properties', async () => {
        render()
        await screen.findByText('Ana Lopez')
        fireEvent.click(screen.getByRole('button', { name: /New contact/ }))
        expect(screen.getByRole('dialog', { name: 'New contact' })).toBeTruthy()
        fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'Ben Cho' } })
        fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ben@ds.com' } })
        fireEvent.click(screen.getByRole('button', { name: 'More properties' }))
        const tags = screen.getByLabelText('Tags')
        fireEvent.change(tags, { target: { value: 'primary' } })
        fireEvent.keyDown(tags, { key: 'Enter' })
        fireEvent.click(screen.getByRole('button', { name: 'Create' }))
        await waitFor(() => expect(actions.create).toHaveBeenCalledWith('acme', 'ds', {
            name: 'Ben Cho', email: 'ben@ds.com', phone: undefined, title: undefined, notes: undefined, tags: ['primary'],
        }))
    })

    it('edits a contact with Save, opening More properties when it has tags or notes', async () => {
        render()
        await screen.findByText('Ana Lopez')
        fireEvent.click(screen.getByRole('button', { name: 'Edit Ana Lopez' }))
        expect(screen.getByRole('dialog', { name: 'Edit Ana Lopez' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Fewer properties' }).getAttribute('aria-expanded')).toBe('true')
        fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'CEO' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(actions.update).toHaveBeenCalledWith('acme', 'ds', 'c1', expect.objectContaining({ name: 'Ana Lopez', title: 'CEO', tags: ['billing'] })))
    })

    it('won’t create a contact without a name', async () => {
        render()
        await screen.findByText('Ana Lopez')
        fireEvent.click(screen.getByRole('button', { name: /New contact/ }))
        expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true)
    })

    it('shows the plan limit in the toast, not "Failed" (P1-07)', async () => {
        actions.create.mockResolvedValueOnce({ ok: false, code: 'plan_limit', error: 'Your plan allows 25 contacts. Upgrade to add more.' })
        render()
        await screen.findByText('Ana Lopez')
        fireEvent.click(screen.getByRole('button', { name: /New contact/ }))
        fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'Ben Cho' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create' }))
        await waitFor(() => expect(toast.addToast).toHaveBeenCalledWith({ type: 'error', title: "Couldn't add contact", message: 'Your plan allows 25 contacts. Upgrade to add more.' }))
        // The dialog stays, with what was typed.
        expect(screen.getByRole('dialog', { name: 'New contact' })).toBeTruthy()
    })
})

describe('ClientContactsTab — a failed load (P1-07)', () => {
    it('says the contacts did not load, never "No contacts yet"', async () => {
        actions.list.mockResolvedValue({ ok: false, code: 'forbidden', error: "You don't have permission to see this client's contacts." })
        render()
        expect(await screen.findByText("Couldn't load contacts")).toBeTruthy()
        expect(screen.getByText("You don't have permission to see this client's contacts.")).toBeTruthy()
        expect(screen.queryByText('No contacts yet')).toBeNull()
    })

    it('tries again from the failure', async () => {
        actions.list.mockResolvedValueOnce({ ok: false, code: 'internal', error: 'Something went wrong on our side. Try again.' })
        render()
        fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
        expect(await screen.findByText('Ana Lopez')).toBeTruthy()
    })
})

