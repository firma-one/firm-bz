import { describe, it, expect, vi, beforeEach } from 'vitest'

// A file's notes: its engagement's firm members only, never clients (2026-10-28). The SQL itself
// (lib/files/document-notes.ts) is stubbed here; these cover who may do what, and what is checked.

const { st, notes, audited } = vi.hoisted(() => {
    const st = {
        user: { id: 'u1' } as { id: string } | null,
        role: 'eng_member' as string | null,
        status: 'ACTIVE' as string,
        file: { id: 'doc-row', organizationId: 'f1', externalId: 'ext1', connectorId: 'conn1', fileName: 'Plan.xlsx', documentType: 'FILE' } as Record<string, unknown> | null,
    }
    const notes = { listNotes: vi.fn(), addNote: vi.fn(), editNote: vi.fn(), deleteNote: vi.fn() }
    const audited: string[] = []
    return { st, notes, audited }
})

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: st.user } }) } }),
}))
vi.mock('@/lib/file-utils', () => ({ getFileInfo: async () => st.file }))
vi.mock('@/lib/engagement-access', () => ({
    requireEngagementMember: async () => (st.role ? { role: st.role } : null),
    isExternalEngagementRole: (role: string) => role === 'eng_ext_collaborator' || role === 'eng_viewer',
    getEngagementStatus: async () => st.status,
    isEngagementMemberReadOnlyWhenCompleted: (status: string, role: string) => status === 'COMPLETED' && (role === 'eng_member' || role === 'eng_admin'),
    isEngagementLeadRole: (role: string) => role === 'eng_admin',
}))
vi.mock('@/lib/prisma', () => ({ prisma: { engagement: { findUnique: async () => ({ clientId: 'c1' }) } } }))
vi.mock('@/lib/files/document-notes', async () => {
    const actual = await vi.importActual<typeof import('@/lib/files/document-notes')>('@/lib/files/document-notes')
    return { ...actual, ...notes }
})
vi.mock('@/lib/audit', () => {
    const chain = (event: string) => {
        const c: Record<string, unknown> = {}
        for (const k of ['scope', 'firm', 'client', 'engagement', 'document', 'actor', 'meta']) c[k] = () => c
        c.fireAndForget = () => { audited.push(event) }
        return c
    }
    return {
        audit: chain,
        AUDIT_EVENT: { DOCUMENT_NOTE_CREATED: 'DOCUMENT_NOTE_CREATED', DOCUMENT_NOTE_CHANGED: 'DOCUMENT_NOTE_CHANGED', DOCUMENT_NOTE_DELETED: 'DOCUMENT_NOTE_DELETED' },
        AUDIT_SCOPE: { DOCUMENT: 'DOCUMENT' },
    }
})
vi.mock('server-only', () => ({}))

import { GET, POST } from './route'
import { PATCH, DELETE } from './[noteId]/route'

const NOTE_ID = '11111111-1111-4111-8111-111111111111'
const ctx = { params: Promise.resolve({ projectId: 'p1', documentId: 'ext1' }) }
const noteCtx = { params: Promise.resolve({ projectId: 'p1', documentId: 'ext1', noteId: NOTE_ID }) }
const req = (body?: unknown) => ({ json: async () => body ?? {} }) as never

beforeEach(() => {
    st.user = { id: 'u1' }
    st.role = 'eng_member'
    st.status = 'ACTIVE'
    st.file = { id: 'doc-row', organizationId: 'f1', externalId: 'ext1', connectorId: 'conn1', fileName: 'Plan.xlsx', documentType: 'FILE' }
    Object.values(notes).forEach((fn) => fn.mockReset())
    notes.listNotes.mockResolvedValue([{ id: NOTE_ID, kind: 'note', body: 'hello', authorUserId: 'u1', createdAt: '2026-10-28' }])
    notes.addNote.mockImplementation(async (_doc: string, author: string, input: { kind: string; body: string }) => ({ id: NOTE_ID, ...input, authorUserId: author, createdAt: '2026-10-28' }))
    notes.editNote.mockResolvedValue(true)
    notes.deleteNote.mockResolvedValue(true)
    audited.length = 0
})

describe('who may use notes', () => {
    it('lists them for a firm member, from the document row', async () => {
        const res = await GET(req(), ctx)
        expect(res.status).toBe(200)
        expect((await res.json()).notes).toHaveLength(1)
        expect(notes.listNotes).toHaveBeenCalledWith('doc-row')
    })

    it('needs sign-in', async () => {
        st.user = null
        expect((await GET(req(), ctx)).status).toBe(401)
    })

    it('treats a non-member as if the file were not there', async () => {
        st.role = null
        expect((await GET(req(), ctx)).status).toBe(404)
        expect(notes.listNotes).not.toHaveBeenCalled()
    })

    it.each(['eng_ext_collaborator', 'eng_viewer'])('never shows them to a client (%s)', async (role) => {
        st.role = role
        expect((await GET(req(), ctx)).status).toBe(403)
        expect((await POST(req({ body: 'x' }), ctx)).status).toBe(403)
        expect(notes.listNotes).not.toHaveBeenCalled()
        expect(notes.addNote).not.toHaveBeenCalled()
    })

    it('reads but does not write once the engagement is completed', async () => {
        st.status = 'COMPLETED'
        expect((await GET(req(), ctx)).status).toBe(200)
        expect((await POST(req({ body: 'x' }), ctx)).status).toBe(403)
        expect(notes.addNote).not.toHaveBeenCalled()
    })
})

describe('POST — adding a note', () => {
    it('adds it, trimmed, as a note by default, and records that it happened', async () => {
        const res = await POST(req({ body: '  Client wants the EU split  ' }), ctx)
        expect(res.status).toBe(201)
        expect(notes.addNote).toHaveBeenCalledWith('doc-row', 'u1', { kind: 'note', body: 'Client wants the EU split' })
        expect(audited).toEqual(['DOCUMENT_NOTE_CREATED'])
    })

    it.each([
        ['empty text', { body: '   ' }],
        ['text over the limit', { body: 'x'.repeat(1001) }],
        ['an unknown kind', { body: 'x', kind: 'gossip' }],
    ])('refuses %s', async (_label, body) => {
        expect((await POST(req(body), ctx)).status).toBe(400)
        expect(notes.addNote).not.toHaveBeenCalled()
    })

    it('says so when the file already keeps the most notes it can', async () => {
        notes.addNote.mockResolvedValue(null)
        const res = await POST(req({ body: 'x' }), ctx)
        expect(res.status).toBe(409)
        expect(audited).toEqual([])
    })
})

describe('PATCH and DELETE — changing a note', () => {
    it("edits only the author's own note", async () => {
        notes.editNote.mockResolvedValue(false)
        const res = await PATCH(req({ body: 'changed' }), noteCtx)
        expect(res.status).toBe(404)
        expect(notes.editNote).toHaveBeenCalledWith('doc-row', NOTE_ID, 'u1', { body: 'changed' })
        expect(audited).toEqual([])
    })

    it('lets the engagement lead delete anyone’s note, and no one else', async () => {
        st.role = 'eng_admin'
        await DELETE(req(), noteCtx)
        expect(notes.deleteNote).toHaveBeenLastCalledWith('doc-row', NOTE_ID, 'u1', true)
        st.role = 'eng_member'
        await DELETE(req(), noteCtx)
        expect(notes.deleteNote).toHaveBeenLastCalledWith('doc-row', NOTE_ID, 'u1', false)
        expect(audited).toEqual(['DOCUMENT_NOTE_DELETED', 'DOCUMENT_NOTE_DELETED'])
    })

    it('ignores a note id that is not one', async () => {
        const res = await DELETE(req(), { params: Promise.resolve({ projectId: 'p1', documentId: 'ext1', noteId: "1' OR '1'='1" }) })
        expect(res.status).toBe(404)
        expect(notes.deleteNote).not.toHaveBeenCalled()
    })
})
