import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { updateProject } = vi.hoisted(() => ({ updateProject: vi.fn(async () => ({})) }))
vi.mock('@/lib/actions/project', () => ({ updateProject, deleteProject: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }))

import { EngagementSettingsForm } from './engagement-settings-form'

const props = {
    projectId: 'e1', groupSlug: 'g', orgSlug: 'acme', clientSlug: 'contoso',
    initialName: 'FY26 Audit', initialStatus: 'ACTIVE' as const, initialContractType: 'Retainer',
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => null })))
})

describe('EngagementSettingsForm', () => {
    it('saves the edited properties, including a status change to Completed', async () => {
        render(<EngagementSettingsForm {...props} />)
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'FY26 Year-end audit' } })
        fireEvent.click(screen.getByRole('button', { name: /Active/ }))
        fireEvent.click(await screen.findByText('Completed'))
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
        await waitFor(() => expect(updateProject).toHaveBeenCalledTimes(1))
        expect(updateProject).toHaveBeenCalledWith('e1', expect.objectContaining({
            name: 'FY26 Year-end audit', status: 'COMPLETED', contractType: 'Retainer',
        }), 'acme', 'contoso')
    })

    it('will not save an engagement without a name', () => {
        render(<EngagementSettingsForm {...props} />)
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  ' } })
        expect((screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled).toBe(true)
    })

    it('locks the other fields while the engagement is completed', () => {
        render(<EngagementSettingsForm {...props} initialStatus="COMPLETED" />)
        expect(screen.getByText(/This engagement is completed/)).toBeTruthy()
        expect((screen.getByLabelText('Name') as HTMLInputElement).disabled).toBe(true)
        expect(screen.getByRole('button', { name: /Completed/ })).toBeTruthy()
    })
})
