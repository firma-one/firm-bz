import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/** A reminder that couldn't be saved says so, in the modal, instead of sitting there silently. */

import { SetupReminderModal } from './setup-reminder-modal'

const member = { userId: 'u2', email: 'sam@acme.test', name: 'Sam Lee', role: 'eng_member' }

describe('SetupReminderModal', () => {
    it('shows why the save failed and stays open', async () => {
        const onSubmit = vi.fn(async () => { throw new Error('Sam is no longer on this engagement.') })
        const onClose = vi.fn()
        render(<SetupReminderModal open onClose={onClose} members={[member]} onSubmit={onSubmit} />)
        fireEvent.click(screen.getByText('Sam Lee'))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        expect(await screen.findByRole('alert')).toBeTruthy()
        expect(screen.getByRole('alert').textContent).toBe("Couldn't save the reminder · Sam is no longer on this engagement.")
        expect(onClose).not.toHaveBeenCalled()
        expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false)
    })
})
