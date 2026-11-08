import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/* A deliverable's documents that didn't load say so, never "No documents in this deliverable." (P1-68) */

vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ session: { access_token: 't' } }) }))

import { CalendarEventDetailModal } from './calendar-event-detail-modal'
import type { CalendarEvent } from '@/lib/actions/calendar'

const EVENT: CalendarEvent = {
    id: 'ev1', engagementId: 'e1', firmId: 'f1', type: 'deliverable', title: 'Report · Due', date: '2026-11-20T00:00:00Z',
    ctaUrl: '/d/e/audit/board#doc-file:d1', clientName: 'Contoso', engagementName: 'FY26 Audit', engagementStatus: 'ACTIVE',
    engagementDueDate: null, documentName: 'Report', docId: 'AUD-1', status: 'in_progress', assignee: null, documentId: 'd1',
    deliverableId: null, hasReminder: false,
}

const fetchMock = vi.fn()

beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
})

describe('CalendarEventDetailModal', () => {
    it('says the documents did not load, with why, and Try again loads them', async () => {
        fetchMock.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: "You don't have access to this deliverable." }) })
        render(<CalendarEventDetailModal event={EVENT} onClose={() => {}} />)
        expect(await screen.findByText("Couldn't load its documents · You don't have access to this deliverable.")).toBeTruthy()
        expect(screen.queryByText('No documents in this deliverable.')).toBeNull()

        fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({
            subtasks: [{ documentId: 'doc-a', fileName: 'Draft.docx', docId: 'AUD-2', dueDate: null, status: 'to_do', assigneeName: null, assigneeEmail: null, assigneeAvatarUrl: null }],
            deliverable: { documentId: 'd1', fileName: 'Report', docId: 'AUD-1', dueDate: null, status: 'in_progress' },
        }) })
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
        expect(await screen.findByText('Draft.docx')).toBeTruthy()
        expect(screen.queryByText(/Couldn't load its documents/)).toBeNull()
    })

    it('still says "No documents" when the deliverable truly has none', async () => {
        fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ subtasks: [], deliverable: null }) })
        render(<CalendarEventDetailModal event={EVENT} onClose={() => {}} />)
        expect(await screen.findByText('No documents in this deliverable.')).toBeTruthy()
    })
})
