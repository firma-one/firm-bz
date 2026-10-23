import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: vi.fn() } } }))

import { keepOrder, rowsInView, type DocRow } from './engagement-comments-tab'

const row = (id: string, over: Partial<DocRow> = {}): DocRow => ({
    projectDocumentId: id, documentName: id, docId: null, count: 1, latest: null, ...over,
})

describe('keepOrder', () => {
    it('keeps rows where they were after a reload, puts new ones on top, and drops gone ones', () => {
        const prev = [row('a'), row('b', { unread: true }), row('c')]
        // The server now lists b (read) after the others; a new discussion d appeared; c is gone.
        const next = [row('d'), row('a'), row('b', { unread: false })]
        const kept = keepOrder(prev, next)
        expect(kept.map((r) => r.projectDocumentId)).toEqual(['d', 'a', 'b'])
        expect(kept[2].unread).toBe(false)
    })
})

describe('rowsInView', () => {
    const rows = [
        row('open'),
        row('client', { latest: { createdAt: '', preview: '', authorUserId: null, authorName: null, authorEmail: null, authorIsExternal: true } }),
        row('done', { resolved: { at: '2026-10-23', byName: null }, latest: { createdAt: '', preview: '', authorUserId: null, authorName: null, authorEmail: null, authorIsExternal: true } }),
    ]
    it('shows open discussions in All, the client’s turn in Awaiting reply, and resolved ones apart', () => {
        expect(rowsInView(rows, 'all').map((r) => r.projectDocumentId)).toEqual(['open', 'client'])
        expect(rowsInView(rows, 'awaiting').map((r) => r.projectDocumentId)).toEqual(['client'])
        expect(rowsInView(rows, 'resolved').map((r) => r.projectDocumentId)).toEqual(['done'])
    })
})
