import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }))
vi.mock('@/lib/supabase', () => ({ getSession: async () => ({ access_token: 't' }) }))

import { TooltipProvider } from '@/components/ui/tooltip'
import { DocumentNotesSection, type NoteAuthor } from './document-notes-section'

const MEMBERS: NoteAuthor[] = [
    { userId: 'me', name: 'Deepak', email: 'd@firm.com', avatarUrl: null },
    { userId: 'ana', name: 'Ana', email: 'a@firm.com', avatarUrl: null },
]
const NOTES = [
    { id: 'n2', kind: 'risk', body: 'Client data has personal fields', authorUserId: 'ana', createdAt: '2026-10-27T10:00:00Z' },
    { id: 'n1', kind: 'decision', body: 'Use the EU split', authorUserId: 'me', createdAt: '2026-10-20T10:00:00Z', editedAt: '2026-10-21T10:00:00Z' },
]

const fetchMock = vi.fn()
beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
            const body = JSON.parse(String(init.body))
            return new Response(JSON.stringify({ note: { id: 'n3', ...body, authorUserId: 'me', createdAt: '2026-10-28T10:00:00Z' } }), { status: 201 })
        }
        if (url.endsWith('/notes')) return new Response(JSON.stringify({ notes: NOTES }))
        return new Response('{}', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
})

// The app's layout supplies the tooltip provider the note dates use.
const renderSection = (isLead = false) =>
    render(<TooltipProvider><DocumentNotesSection projectId="p1" documentId="doc-row" members={MEMBERS} currentUserId="me" isLead={isLead} /></TooltipProvider>)

describe('DocumentNotesSection', () => {
    it('lists the notes with their kind, author and whether they were edited', async () => {
        renderSection()
        await waitFor(() => expect(screen.getByText('Client data has personal fields')).toBeTruthy())
        // Once on the note, once among the composer's kinds.
        expect(screen.getAllByText('Risk')).toHaveLength(2)
        expect(screen.getByText('Ana')).toBeTruthy()
        expect(screen.getByText('· edited')).toBeTruthy()
        expect(screen.getByText(/Only the firm's team sees these/)).toBeTruthy()
    })

    it('offers edit on your own notes only, and delete on yours unless you lead', async () => {
        renderSection()
        await waitFor(() => expect(screen.getByText('Use the EU split')).toBeTruthy())
        expect(screen.getAllByRole('button', { name: 'Edit note' })).toHaveLength(1)
        expect(screen.getAllByRole('button', { name: 'Delete note' })).toHaveLength(1)
    })

    it('lets the lead delete any note', async () => {
        renderSection(true)
        await waitFor(() => expect(screen.getByText('Use the EU split')).toBeTruthy())
        expect(screen.getAllByRole('button', { name: 'Delete note' })).toHaveLength(2)
    })

    it('adds a note of the chosen kind at the top', async () => {
        renderSection()
        await waitFor(() => expect(screen.getByText('Use the EU split')).toBeTruthy())
        fireEvent.change(screen.getByLabelText('New note'), { target: { value: 'Client asked for a v2 by Friday' } })
        fireEvent.click(screen.getByRole('radio', { name: 'Client request' }))
        fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
        await waitFor(() => expect(screen.getByText('Client asked for a v2 by Friday')).toBeTruthy())
        const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
        expect(post[0]).toBe('/api/projects/p1/documents/doc-row/notes')
        expect(JSON.parse(String(post[1].body))).toEqual({ kind: 'client_request', body: 'Client asked for a v2 by Friday' })
        expect((screen.getByLabelText('New note') as HTMLTextAreaElement).value).toBe('')
    })
})
