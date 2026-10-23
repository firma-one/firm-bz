import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'

const { actions, toast } = vi.hoisted(() => ({
    actions: {
        list: vi.fn(),
        create: vi.fn(async () => ({})),
        update: vi.fn(async () => ({})),
        remove: vi.fn(async () => ({})),
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
    actions.list.mockResolvedValue([
        { id: 'c1', name: 'Ana Lopez', email: 'ana@ds.com', phone: null, title: 'CFO', notes: null, tags: ['billing'] },
    ])
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
})
