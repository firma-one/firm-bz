import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Reading one memo for Discussions › Memos: who may, and which documents count. The real reader
 * (lib/memos/memo-store.ts) runs against an in-memory table; storage is stubbed, so nothing reaches
 * Google Drive or OneDrive.
 */

type Row = {
    id: string
    engagementId: string
    externalId: string
    parentId: string | null
    isFolder: boolean
    status: string
    connectorId: string | null
    settings: Record<string, unknown>
}

const MEMO_ID = '11111111-1111-4111-8111-111111111111'
const FOREIGN_ID = '22222222-2222-4222-8222-222222222222'
const NOT_A_MEMO_ID = '33333333-3333-4333-8333-333333333333'
const MOVED_OUT_ID = '44444444-4444-4444-8444-444444444444'
const TEXT = '# Call with Dana\n\nThursday, November 12, 2026 · Alex Jordan\n\nDana Whitfield: We will send the K-1s next week.'
const memoSettings = { memo: { date: '2026-11-12', title: 'Call with Dana', authorUserId: 'u1', authorFirstName: 'Alex' }, lock: { type: 'private' } }

const h = vi.hoisted(() => ({
    user: { id: 'u1', email: 'alex@firm.com' } as object | null,
    canEdit: true,
    canViewInternal: true,
    rows: [] as Row[],
    getRenderableContent: vi.fn(),
    getFilesMetadata: vi.fn(),
}))

const matches = (row: Row, where: Record<string, unknown>) => Object.entries(where).every(([key, value]) => {
    if (key === 'status') return row.status !== (value as { not: string }).not
    return row[key as keyof Row] === value
})

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
}))
vi.mock('@/lib/resolve-project-context', () => ({ resolveProjectContext: async () => ({ firmId: 'f1', orgId: 'f1', clientId: 'c1', projectId: 'p1' }) }))
vi.mock('@/lib/permission-helpers', () => ({
    canEditProject: async () => h.canEdit,
    canViewProjectInternalTabs: async () => h.canViewInternal,
}))
// Completed is read only, and this only reads: a refusal here must never reach it.
vi.mock('@/lib/engagement-access', () => ({
    blockIfEngagementCompleted: async () => NextResponse.json({ error: "This engagement is completed, so it's read only." }, { status: 403 }),
}))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagementDocument: {
            findFirst: async ({ where }: { where: Record<string, unknown> }) => h.rows.find((r) => matches(r, where)) ?? null,
        },
        engagement: { findUnique: async () => ({ client: { connectorId: 'conn-1' } }) },
        connector: { findUnique: async () => ({ type: 'ONEDRIVE' }) },
    },
}))
vi.mock('@/lib/connectors/registry', () => ({
    getStorageAdapter: async () => ({}),
    getContentAdapter: async () => ({ getRenderableContent: h.getRenderableContent }),
    getPermissionAdapter: async () => ({ getFilesMetadata: h.getFilesMetadata }),
}))
vi.mock('@/lib/files/private-documents', () => ({ loadPrivacyRows: vi.fn(), withdrawClientAccess: vi.fn() }))
vi.mock('@/lib/billing/effective-billing-caps', () => ({ assertWithinDocumentCap: vi.fn() }))
vi.mock('@/lib/doc-id', () => ({ assignDocId: async () => 'RET-9' }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/audit', () => ({ audit: vi.fn(), AUDIT_EVENT: {}, AUDIT_SCOPE: {} }))

import { GET } from './route'

const get = (documentId: string) =>
    GET(
        new NextRequest(`http://localhost/api/projects/p1/memos/${documentId}/content`),
        { params: Promise.resolve({ projectId: 'p1', documentId }) },
    )

beforeEach(() => {
    h.user = { id: 'u1', email: 'alex@firm.com' }
    h.canEdit = true
    h.canViewInternal = true
    h.rows = [
        { id: 'folder-1', engagementId: 'p1', externalId: 'memos-folder', parentId: 'general', isFolder: true, status: 'PROCESSED', connectorId: 'conn-1', settings: { memoFolder: true } },
        { id: MEMO_ID, engagementId: 'p1', externalId: 'memo-file', parentId: 'memos-folder', isFolder: false, status: 'PROCESSED', connectorId: 'conn-1', settings: memoSettings },
        // Another engagement's memo, in its own memos folder.
        { id: 'folder-2', engagementId: 'p2', externalId: 'other-memos-folder', parentId: 'other-general', isFolder: true, status: 'PROCESSED', connectorId: 'conn-1', settings: { memoFolder: true } },
        { id: FOREIGN_ID, engagementId: 'p2', externalId: 'other-memo-file', parentId: 'other-memos-folder', isFolder: false, status: 'PROCESSED', connectorId: 'conn-1', settings: memoSettings },
        // A file that isn't a memo, sitting in the memos folder.
        { id: NOT_A_MEMO_ID, engagementId: 'p1', externalId: 'contract-file', parentId: 'memos-folder', isFolder: false, status: 'PROCESSED', connectorId: 'conn-1', settings: {} },
        // A memo moved out of the memos folder, into the engagement's General folder.
        { id: MOVED_OUT_ID, engagementId: 'p1', externalId: 'moved-file', parentId: 'general', isFolder: false, status: 'PROCESSED', connectorId: 'conn-1', settings: memoSettings },
    ]
    h.getRenderableContent.mockReset().mockResolvedValue({ stream: Buffer.from(TEXT, 'utf-8'), mimeType: 'text/markdown', fileName: '2026-11-12-Call-with-Dana.md' })
    h.getFilesMetadata.mockReset().mockResolvedValue([{ id: 'memo-file', name: '2026-11-12-Call-with-Dana.md', webViewLink: 'https://contoso-my.sharepoint.com/personal/alex/memo.md' }])
})

describe('who', () => {
    it('401 when signed out', async () => {
        h.user = null
        expect((await get(MEMO_ID)).status).toBe(401)
        expect(h.getRenderableContent).not.toHaveBeenCalled()
    })

    it('403 for a Reviewer, and reads nothing', async () => {
        h.canEdit = false
        h.canViewInternal = false
        const res = await get(MEMO_ID)
        expect(res.status).toBe(403)
        expect((await res.json()).error).toBe('Internal memos are for a Lead or a Contributor · Full Access only.')
        expect(h.getRenderableContent).not.toHaveBeenCalled()
        expect(h.getFilesMetadata).not.toHaveBeenCalled()
    })

    it('403 for a Contributor · Limited Access, who can edit but not see what is internal', async () => {
        h.canViewInternal = false
        expect((await get(MEMO_ID)).status).toBe(403)
        expect(h.getRenderableContent).not.toHaveBeenCalled()
    })
})

describe('which documents', () => {
    it('reads a memo of this engagement, with its link in storage, and is never cached', async () => {
        const res = await get(MEMO_ID)
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ data: { text: TEXT, webUrl: 'https://contoso-my.sharepoint.com/personal/alex/memo.md' } })
        expect(res.headers.get('Cache-Control')).toBe('private, no-store')
        expect(h.getRenderableContent).toHaveBeenCalledWith('conn-1', 'memo-file', 'native')
    })

    it('404 for another engagement\'s memo, and reads nothing', async () => {
        const res = await get(FOREIGN_ID)
        expect(res.status).toBe(404)
        expect((await res.json()).error).toMatch(/not found in this engagement/)
        expect(h.getRenderableContent).not.toHaveBeenCalled()
        expect(h.getFilesMetadata).not.toHaveBeenCalled()
    })

    it('404 for a file that isn\'t a memo, even in the memos folder', async () => {
        expect((await get(NOT_A_MEMO_ID)).status).toBe(404)
        expect(h.getRenderableContent).not.toHaveBeenCalled()
    })

    it('404 for a memo moved out of the memos folder, and for an id that isn\'t one', async () => {
        expect((await get(MOVED_OUT_ID)).status).toBe(404)
        expect((await get('not-a-uuid')).status).toBe(404)
        expect(h.getRenderableContent).not.toHaveBeenCalled()
    })

    it('still reads on a completed engagement: reading changes nothing', async () => {
        // blockIfEngagementCompleted refuses everything in this file; the route never asks it.
        expect((await get(MEMO_ID)).status).toBe(200)
    })
})

describe('when storage is in the way', () => {
    it('says why storage wouldn\'t give the memo up', async () => {
        const { ConnectorContentError } = await import('@/lib/connectors/types')
        h.getRenderableContent.mockRejectedValue(new ConnectorContentError('not_found', 'gone'))
        const res = await get(MEMO_ID)
        expect(res.status).toBe(404)
        expect((await res.json()).error).toBe('This is no longer in OneDrive. It may have been moved or deleted there. Refresh the list.')
    })

    it('shows the memo without a link when storage gives none', async () => {
        h.getFilesMetadata.mockRejectedValue(new Error('Graph said no'))
        const res = await get(MEMO_ID)
        expect(res.status).toBe(200)
        expect((await res.json()).data).toEqual({ text: TEXT, webUrl: null })
    })

    it('never passes on a link that isn\'t https', async () => {
        h.getFilesMetadata.mockResolvedValue([{ id: 'memo-file', name: 'x.md', webViewLink: 'javascript:alert(1)' }])
        expect((await (await get(MEMO_ID)).json()).data.webUrl).toBeNull()
    })
})
