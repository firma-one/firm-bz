import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { notesOf } from './document-notes'

describe('notesOf', () => {
    it('reads well-formed notes, newest first', () => {
        const notes = notesOf({
            notes: [
                { id: 'a', kind: 'note', body: 'older', authorUserId: 'u', createdAt: '2026-10-01T00:00:00Z' },
                { id: 'b', kind: 'risk', body: 'newer', authorUserId: 'u', createdAt: '2026-10-20T00:00:00Z' },
            ],
        })
        expect(notes.map((n) => n.id)).toEqual(['b', 'a'])
    })

    it('skips anything that is not a note', () => {
        expect(notesOf({ notes: [null, { id: 'x' }, { id: 'y', kind: 'gossip', body: 'b', authorUserId: 'u', createdAt: 'c' }] })).toEqual([])
        expect(notesOf({ notes: 'nope' })).toEqual([])
        expect(notesOf(null)).toEqual([])
    })
})
