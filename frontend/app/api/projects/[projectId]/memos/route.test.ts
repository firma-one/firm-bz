import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Who may see and add internal memos, and what each refusal says. Storage is lib/memos/memo-store.ts,
 * stubbed here (memo-store.test.ts covers it): nothing reaches Google Drive or OneDrive.
 */

const h = vi.hoisted(() => ({
    user: { id: 'u1', email: 'alex@firm.com', user_metadata: { full_name: 'Alex Jordan' } } as object | null,
    canEdit: true,
    canViewInternal: true,
    status: 'ACTIVE' as string,
    listMemos: vi.fn(),
    saveMemo: vi.fn(),
    recordMemoApplied: vi.fn(),
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
}))
vi.mock('@/lib/resolve-project-context', () => ({ resolveProjectContext: async () => ({ firmId: 'f1', orgId: 'f1', clientId: 'c1', projectId: 'p1' }) }))
vi.mock('@/lib/permission-helpers', () => ({
    canEditProject: async () => h.canEdit,
    canViewProjectInternalTabs: async () => h.canViewInternal,
}))
vi.mock('@/lib/engagement-access', () => ({
    getEngagementStatus: async () => h.status,
    blockIfEngagementCompleted: async () => (h.status === 'COMPLETED'
        ? NextResponse.json({ error: "This engagement is completed, so it's read only." }, { status: 403 })
        : null),
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/prisma', () => ({
    prisma: { engagement: { findUnique: async () => ({ client: { connectorId: 'conn-1', connector: { type: 'ONEDRIVE' } } }) } },
}))
vi.mock('@/lib/memos/memo-store', () => ({
    listMemos: h.listMemos,
    saveMemo: h.saveMemo,
    recordMemoApplied: h.recordMemoApplied,
    MEMO_NOT_FOUND: 'This memo was not found in this engagement. Refresh the list and try again.',
}))

import { GET, POST } from './route'
import { POST as POST_APPLIED } from './[documentId]/applied/route'
import { StorageFailure } from '@/lib/connectors/storage-failure'
import { userFacing } from '@/lib/actions/action-result'

const params = { params: Promise.resolve({ projectId: 'p1' }) }
const get = () => GET(new NextRequest('http://localhost/api/projects/p1/memos'), params)
const BODY = { title: 'Call notes', date: '2026-11-12', body: '- Chase the 1099-B' }
const post = (body: unknown = BODY) =>
    POST(new NextRequest('http://localhost/api/projects/p1/memos', { method: 'POST', body: JSON.stringify(body) }), params)
const MEMO_ID = '11111111-1111-4111-8111-111111111111'
const postApplied = (body: unknown) =>
    POST_APPLIED(
        new NextRequest(`http://localhost/api/projects/p1/memos/${MEMO_ID}/applied`, { method: 'POST', body: JSON.stringify(body) }),
        { params: Promise.resolve({ projectId: 'p1', documentId: MEMO_ID }) },
    )
const APPLIED = { kind: 'reminder', target: 'chase the 1099-b', date: '2026-11-16', quote: 'chase the 1099-b', label: 'Reminder · Chase the 1099-B' }

beforeEach(() => {
    h.user = { id: 'u1', email: 'alex@firm.com', user_metadata: { full_name: 'Alex Jordan' } }
    h.canEdit = true
    h.canViewInternal = true
    h.status = 'ACTIVE'
    h.listMemos.mockReset().mockResolvedValue([{ id: MEMO_ID, title: 'Call notes' }])
    h.saveMemo.mockReset().mockResolvedValue({ memo: { id: MEMO_ID, title: 'Call notes' }, fileName: '2026-11-12-Call-notes.md' })
    h.recordMemoApplied.mockReset().mockResolvedValue(1)
})

describe('who', () => {
    it('401 when signed out', async () => {
        h.user = null
        expect((await get()).status).toBe(401)
        expect((await post()).status).toBe(401)
    })

    it('403 for a Reviewer, who can neither list nor add', async () => {
        h.canEdit = false
        h.canViewInternal = false
        const res = await get()
        expect(res.status).toBe(403)
        expect((await res.json()).error).toBe('Internal memos are for a Lead or a Contributor · Full Access only.')
        expect((await post()).status).toBe(403)
        expect(h.listMemos).not.toHaveBeenCalled()
        expect(h.saveMemo).not.toHaveBeenCalled()
    })

    it('403 for a Contributor · Limited Access, who can edit but not see what is internal', async () => {
        h.canViewInternal = false
        expect((await get()).status).toBe(403)
        expect((await post()).status).toBe(403)
        expect((await postApplied(APPLIED)).status).toBe(403)
        expect(h.saveMemo).not.toHaveBeenCalled()
        expect(h.recordMemoApplied).not.toHaveBeenCalled()
    })

    it('a completed engagement lists its memos read only, and refuses a new one or a note on one', async () => {
        h.status = 'COMPLETED'
        const res = await get()
        expect(res.status).toBe(200)
        expect((await res.json()).data).toEqual(expect.objectContaining({ readOnly: true }))
        const refused = await post()
        expect(refused.status).toBe(403)
        expect((await refused.json()).error).toBe("This engagement is completed, so it's read only.")
        expect((await postApplied(APPLIED)).status).toBe(403)
        expect(h.saveMemo).not.toHaveBeenCalled()
        expect(h.recordMemoApplied).not.toHaveBeenCalled()
    })
})

describe('GET', () => {
    it('lists the memos and says where they are kept', async () => {
        const { data } = await (await get()).json()
        expect(data).toEqual({ memos: [{ id: MEMO_ID, title: 'Call notes' }], readOnly: false, storage: 'OneDrive' })
        expect(h.listMemos).toHaveBeenCalledWith('p1')
    })
})

describe('POST', () => {
    it('saves the memo with the caller as its author', async () => {
        const res = await post({ ...BODY, source: 'transcript', durationMinutes: 42, speakers: 3 })
        expect(res.status).toBe(201)
        expect((await res.json()).data).toEqual({ memo: { id: MEMO_ID, title: 'Call notes' }, fileName: '2026-11-12-Call-notes.md' })
        expect(h.saveMemo).toHaveBeenCalledWith(expect.objectContaining({
            engagementId: 'p1', title: 'Call notes', date: '2026-11-12', source: 'transcript', durationMinutes: 42, speakers: 3,
            author: { userId: 'u1', name: 'Alex Jordan', firstName: 'Alex' },
        }))
    })

    it('asks for a title, a real day and some notes', async () => {
        expect((await post({ ...BODY, title: '  ' })).status).toBe(400)
        expect((await post({ ...BODY, date: '2026-02-30' })).status).toBe(400)
        expect((await post({ ...BODY, body: ' \n ' })).status).toBe(400)
        expect(h.saveMemo).not.toHaveBeenCalled()
    })

    it('413 over 200,000 characters, in plain words', async () => {
        const res = await post({ ...BODY, body: 'x'.repeat(200_001) })
        expect(res.status).toBe(413)
        expect((await res.json()).error).toBe('This memo is too long to save. Keep it under 200,000 characters.')
    })

    it('says why storage refused it', async () => {
        h.saveMemo.mockRejectedValue(new StorageFailure('storage_full', 'The OneDrive account connected to this client is out of storage space. Free some up, then try again.'))
        const res = await post()
        expect(res.status).toBe(507)
        expect((await res.json()).error).toMatch(/out of storage space/)
    })

    it('says what to do when there is nowhere to save it', async () => {
        h.saveMemo.mockRejectedValue(userFacing('No storage is connected to this client. Connect Google Drive or OneDrive for this client, then try again.', 'no_connector'))
        const res = await post()
        expect(res.status).toBe(409)
        expect((await res.json()).error).toMatch(/^No storage is connected/)
    })

    it('never answers with a bare failure', async () => {
        h.saveMemo.mockRejectedValue(new Error('P2002 unique constraint'))
        const res = await post()
        expect(res.status).toBe(500)
        const { error } = await res.json()
        expect(error).not.toMatch(/P2002|Failed to/)
        expect(error).toMatch(/memo wasn't saved/)
    })
})

describe('POST …/applied', () => {
    it('notes an applied action on the memo', async () => {
        const res = await postApplied(APPLIED)
        expect(res.status).toBe(200)
        expect((await res.json()).data).toEqual({ appliedCount: 1 })
        expect(h.recordMemoApplied).toHaveBeenCalledWith('p1', MEMO_ID, expect.objectContaining({ kind: 'reminder', target: 'chase the 1099-b', date: '2026-11-16' }))
    })

    it('404 for anything that isn\'t a memo of this engagement', async () => {
        h.recordMemoApplied.mockResolvedValue(null)
        expect((await postApplied(APPLIED)).status).toBe(404)
    })

    it('400 for an action that was never a proposal', async () => {
        expect((await postApplied({ ...APPLIED, kind: 'deliverable' })).status).toBe(400)
        expect((await postApplied({ ...APPLIED, date: 'soon' })).status).toBe(400)
        expect(h.recordMemoApplied).not.toHaveBeenCalled()
    })
})
