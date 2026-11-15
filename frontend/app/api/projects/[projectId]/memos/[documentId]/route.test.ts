import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Editing a memo (§14.3): who may, what's refused and why, and when Brio reads the new notes. Storage is
 * lib/memos/memo-store.ts, stubbed here (memo-store.test.ts covers the edit itself): nothing reaches
 * Google Drive, OneDrive or Anthropic.
 */

const MEMO_ID = '11111111-1111-4111-8111-111111111111'

const h = vi.hoisted(() => ({
    user: { id: 'u1', email: 'alex@firm.com', user_metadata: { full_name: 'Alex Jordan' } } as object | null,
    canEdit: true,
    canViewInternal: true,
    status: 'ACTIVE' as string,
    editMemo: vi.fn(),
    // Work queued with Next's after(): run by the test, as Next runs it once the answer has gone.
    afterTasks: [] as Array<() => unknown>,
    reviewMemoOnAdd: vi.fn(async () => ({ status: 'reviewed', actionItems: 2, raidSuggested: 0 })),
}))

vi.mock('next/server', async (importOriginal) => ({
    ...(await importOriginal<typeof import('next/server')>()),
    after: (task: () => unknown) => { h.afterTasks.push(task) },
}))
vi.mock('@/lib/memos/memo-review', () => ({ reviewMemoOnAdd: h.reviewMemoOnAdd }))
vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
}))
vi.mock('@/lib/resolve-project-context', () => ({ resolveProjectContext: async () => ({ firmId: 'f1', orgId: 'f1', clientId: 'c1', projectId: 'p1' }) }))
vi.mock('@/lib/permission-helpers', () => ({
    canEditProject: async () => h.canEdit,
    canViewProjectInternalTabs: async () => h.canViewInternal,
}))
vi.mock('@/lib/engagement-access', () => ({
    blockIfEngagementCompleted: async () => (h.status === 'COMPLETED'
        ? NextResponse.json({ error: "This engagement is completed, so it's read only." }, { status: 403 })
        : null),
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/memos/memo-store', () => ({ editMemo: h.editMemo }))

import { PATCH } from './route'
import { StorageFailure } from '@/lib/connectors/storage-failure'

const BODY = { title: 'Call with Dana', date: '2026-11-12' }
const patch = (body: unknown = BODY) => PATCH(
    new NextRequest(`http://localhost/api/projects/p1/memos/${MEMO_ID}`, { method: 'PATCH', body: JSON.stringify(body) }),
    { params: Promise.resolve({ projectId: 'p1', documentId: MEMO_ID }) },
)
const EDITED = (notesChanged: boolean) => ({
    ok: true,
    memo: { id: MEMO_ID, title: 'Call with Dana', reviewedAt: '2026-11-12T18:00:00.000Z' },
    fileName: '2026-11-12-Call-with-Dana.md',
    notesChanged,
})

beforeEach(() => {
    h.user = { id: 'u1', email: 'alex@firm.com', user_metadata: { full_name: 'Alex Jordan' } }
    h.canEdit = true
    h.canViewInternal = true
    h.status = 'ACTIVE'
    h.editMemo.mockReset().mockResolvedValue(EDITED(false))
    h.afterTasks.length = 0
    h.reviewMemoOnAdd.mockClear()
})

describe('PATCH a memo', () => {
    it('a new title: the edit, by this person, with the notes left as they are', async () => {
        const res = await patch()
        expect(res.status).toBe(200)
        expect(h.editMemo).toHaveBeenCalledWith(expect.objectContaining({
            engagementId: 'p1', documentId: MEMO_ID, title: 'Call with Dana', date: '2026-11-12', body: null,
            actor: { userId: 'u1', name: 'Alex Jordan' },
        }))
        expect((await res.json()).data).toEqual(expect.objectContaining({ fileName: '2026-11-12-Call-with-Dana.md', notesChanged: false, identifying: false }))
        expect(h.afterTasks).toHaveLength(0)
    })

    it('new notes with the box ticked: Brio reads them once the answer has gone, at the person\'s asking', async () => {
        h.editMemo.mockResolvedValue(EDITED(true))
        const res = await patch({ ...BODY, body: '- Dana sends the figures by Friday', identify: true })
        expect((await res.json()).data.identifying).toBe(true)
        expect(h.reviewMemoOnAdd).not.toHaveBeenCalled()
        await Promise.all(h.afterTasks.map((t) => t()))
        expect(h.reviewMemoOnAdd).toHaveBeenCalledWith({
            engagementId: 'p1', firmId: 'f1', clientId: 'c1', memoId: MEMO_ID, actorUserId: 'u1', trigger: 'edited', requested: true,
        })
    })

    it('new notes, box unticked, or ticked with nothing new: Brio reads nothing', async () => {
        h.editMemo.mockResolvedValue(EDITED(true))
        await patch({ ...BODY, body: '- New notes', identify: false })
        h.editMemo.mockResolvedValue(EDITED(false))
        await patch({ ...BODY, body: '- The same notes', identify: true })
        expect(h.afterTasks).toHaveLength(0)
    })

    it('says what\'s missing, in words a person can act on', async () => {
        expect(await (await patch({ ...BODY, title: '  ' })).json()).toEqual({ error: 'Give the memo a title.' })
        expect(await (await patch({ ...BODY, date: '12/11/2026' })).json()).toEqual({ error: 'Choose the day of the call.' })
        expect((await patch({ ...BODY, body: '   ' })).status).toBe(400)
        expect((await patch({ ...BODY, body: 'x'.repeat(200_001) })).status).toBe(413)
        expect(h.editMemo).not.toHaveBeenCalled()
    })

    it('not a memo of this engagement: 404 in the store\'s words', async () => {
        h.editMemo.mockResolvedValue({ ok: false, status: 404, error: 'This memo was not found in this engagement. Refresh the list and try again.' })
        const res = await patch()
        expect(res.status).toBe(404)
        expect((await res.json()).error).toBe('This memo was not found in this engagement. Refresh the list and try again.')
    })

    it('storage\'s refusal in storage\'s words, and a rename it refused as a warning', async () => {
        h.editMemo.mockRejectedValue(new StorageFailure('no_permission', "The Google Drive account connected to this client doesn't have permission to change this."))
        const refused = await patch()
        expect(refused.status).toBe(403)
        expect((await refused.json()).error).toBe("The Google Drive account connected to this client doesn't have permission to change this.")

        h.editMemo.mockResolvedValue({ ...EDITED(false), warning: "Saved, but Google Drive didn't rename the file." })
        expect((await (await patch()).json()).warning).toBe("Saved, but Google Drive didn't rename the file.")
    })

    it('a Reviewer, a Contributor · Limited Access and a completed engagement are refused, before anything is written', async () => {
        h.canEdit = false
        expect((await patch()).status).toBe(403)
        h.canEdit = true
        h.canViewInternal = false
        expect((await patch()).status).toBe(403)
        h.canViewInternal = true
        h.status = 'COMPLETED'
        expect((await patch()).status).toBe(403)
        h.user = null
        expect((await patch()).status).toBe(401)
        expect(h.editMemo).not.toHaveBeenCalled()
    })
})
