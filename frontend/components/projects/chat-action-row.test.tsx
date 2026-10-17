import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChatTaskHeader, ChatTaskList, type ChatAction } from './chat-action-row'

const review = (overrides: Partial<ChatAction> = {}): ChatAction => ({
    id: 'review-folders',
    label: 'Review folder organization',
    busyLabel: 'Reviewing…',
    description: 'Checks names, then applies the fixes you approve. Nothing is deleted.',
    run: vi.fn(),
    ...overrides,
})

describe('ChatTaskList', () => {
    it('shows a task under its own heading, with what it will do', () => {
        render(<ChatTaskList actions={[review()]} />)
        expect(screen.getByText('Task')).toBeTruthy()
        expect(screen.getByText('Checks names, then applies the fixes you approve. Nothing is deleted.')).toBeTruthy()
    })

    it('starts the task on click', () => {
        const run = vi.fn()
        render(<ChatTaskList actions={[review({ run })]} />)
        fireEvent.click(screen.getByRole('button', { name: 'Review folder organization' }))
        expect(run).toHaveBeenCalledTimes(1)
    })

    it('says it is running and cannot be started twice', () => {
        render(<ChatTaskList actions={[review({ busy: true })]} />)
        const button = screen.getByRole('button', { name: 'Reviewing…' }) as HTMLButtonElement
        expect(button.disabled).toBe(true)
    })

    it('shows the last failure under the description', () => {
        render(<ChatTaskList actions={[review({ error: 'Could not review the files' })]} />)
        expect(screen.getByText('Could not review the files')).toBeTruthy()
    })

    it('draws nothing when there is no task to offer', () => {
        const { container } = render(<ChatTaskList actions={[]} />)
        expect(container.textContent).toBe('')
    })
})

describe('ChatTaskHeader', () => {
    it('marks the thread block as a task, with where it stands', () => {
        render(<ChatTaskHeader title="Review folder organization" status="2 of 5 answered" />)
        expect(screen.getByText('Task')).toBeTruthy()
        expect(screen.getByText('Review folder organization')).toBeTruthy()
        expect(screen.getByText('2 of 5 answered')).toBeTruthy()
    })
})
