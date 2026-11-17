import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: null }) }))

import { TooltipProvider } from '@/components/ui/tooltip'
import { DemoDeliverableComments } from './demo-deliverable-comments'

/** /tour's comments pane, as the app's: "#" tags the deliverable's documents, and a chip opens one in the pane. */

const DOCS = [
    { id: 'a', docId: 'ACME-12', name: 'Market sizing.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    { id: 'b', docId: 'ACME-13', name: 'Competitor teardown.pdf', mimeType: 'application/pdf' },
]

beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0 })
    Element.prototype.scrollIntoView = vi.fn()
})

const renderPane = () => render(<TooltipProvider><DemoDeliverableComments documents={DOCS} /></TooltipProvider>)

describe('/tour comments: document tags', () => {
    it('lists the deliverable’s documents at "#"', () => {
        renderPane()
        const box = screen.getByLabelText('Comment') as HTMLTextAreaElement
        fireEvent.change(box, { target: { value: '#ACME-', selectionStart: 6, selectionEnd: 6 } })
        const menu = screen.getByRole('listbox', { name: 'Tag a document' })
        expect(menu.textContent).toContain('Market sizing.xlsx')
        expect(menu.textContent).toContain('Competitor teardown.pdf')
    })

    it('opens a tagged document in the pane from its chip, and goes back', () => {
        renderPane()
        fireEvent.click(screen.getAllByRole('button', { name: /ACME-12/ })[0])
        expect(screen.getByRole('region', { name: 'Preview of Market sizing.xlsx' })).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Back to comments' }))
        expect(screen.queryByRole('region', { name: /Preview of/ })).toBeNull()
    })
})

describe('/tour comments: internal only', () => {
    it('is a lock switch in the toolbar that turns the composer into an internal note', () => {
        renderPane()
        const lock = screen.getByRole('switch', { name: 'Internal only' })
        expect(lock.getAttribute('aria-checked')).toBe('false')
        expect(screen.queryByRole('radiogroup', { name: 'Who sees this comment' })).toBeNull()
        fireEvent.click(lock)
        expect(lock.getAttribute('aria-checked')).toBe('true')
        expect((screen.getByLabelText('Internal note') as HTMLTextAreaElement).placeholder).toMatch(/only Leads and Full Access/)
        fireEvent.click(lock)
        expect(lock.getAttribute('aria-checked')).toBe('false')
        expect(screen.getByLabelText('Comment')).toBeTruthy()
    })
})

describe('/tour comments: after posting an internal note', () => {
    it('opens the lock again', () => {
        renderPane()
        const lock = screen.getByRole('switch', { name: 'Internal only' })
        fireEvent.click(lock)
        const box = screen.getByLabelText('Internal note') as HTMLTextAreaElement
        fireEvent.change(box, { target: { value: 'Between us', selectionStart: 10, selectionEnd: 10 } })
        fireEvent.submit(box.closest('form')!)
        expect(lock.getAttribute('aria-checked')).toBe('false')
        expect(screen.getByLabelText('Comment')).toBeTruthy()
    })
})
