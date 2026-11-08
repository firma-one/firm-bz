import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * ST-2 and P1-01: a firm that was created but whose details weren't saved is said so (and opened), so
 * it isn't created twice; a refusal ("A firm with this name already exists") shows in the dialog.
 */

const { createFirm, push, toast } = vi.hoisted(() => ({
    createFirm: vi.fn(),
    push: vi.fn(),
    toast: { addToast: vi.fn() },
}))
vi.mock('@/lib/actions/firms', () => ({ createFirm }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => toast }))

import { AddFirmModal } from './add-firm-modal'

beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ allowed: true }), { status: 200 })))
})
afterEach(() => vi.unstubAllGlobals())

const submit = async () => {
    render(<AddFirmModal open onOpenChange={() => {}} groupSlug="g" />)
    fireEvent.change(await screen.findByLabelText(/Firm name/), { target: { value: 'Acme' } })
    fireEvent.click(screen.getByRole('button', { name: /Create/ }))
}

describe('AddFirmModal', () => {
    it('creates the firm with its details in one call, and says when the details did not save', async () => {
        createFirm.mockResolvedValue({ ok: true, data: { id: 'f1', slug: 'acme', name: 'Acme', groupSlug: 'g' }, warning: "Firm created, but its details weren't saved. Open its settings to finish." })
        await submit()
        await waitFor(() => expect(toast.addToast).toHaveBeenCalledWith({ type: 'warning', title: 'Firm created', message: "Firm created, but its details weren't saved. Open its settings to finish." }))
        expect(createFirm).toHaveBeenCalledWith({ name: 'Acme', groupSlug: 'g' }, expect.objectContaining({ notes: null }))
        expect(push).toHaveBeenCalledWith('/d/g/f/acme')
    })

    it('shows the refusal in the dialog', async () => {
        createFirm.mockResolvedValue({ ok: false, code: 'name_taken', error: 'A firm with this name already exists' })
        await submit()
        expect((await screen.findByRole('alert')).textContent).toContain('A firm with this name already exists')
        expect(push).not.toHaveBeenCalled()
    })
})
