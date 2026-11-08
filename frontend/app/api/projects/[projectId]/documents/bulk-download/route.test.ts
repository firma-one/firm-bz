import { describe, it, expect, vi, beforeEach } from 'vitest'

// Download as ZIP: only what's in this engagement, and for a Limited Access contributor or Reviewer
// only what download-share would give them one at a time. A partial ZIP says what it's short of
// (FI-5's headers, the cap among them); nothing to give is an error.

const { st } = vi.hoisted(() => ({
    st: {
        role: 'eng_admin' as string,
        rows: [] as any[],
        visible: null as Set<string> | null,
        inTree: new Set<string>(),
        scopeRefused: new Set<string>(),
        files: {} as Record<string, { name: string; mimeType?: string; children?: string[] }>,
        unreadable: new Set<string>(),
    },
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) } }),
}))
vi.mock('@/lib/engagement-access', () => ({
    requireEngagementMember: async () => ({ role: st.role }),
    isExternalEngagementRole: (r: string) => r === 'eng_ext_collaborator' || r === 'eng_viewer',
    visibleDocumentIdsFor: async () => st.visible,
}))
vi.mock('@/lib/connectors/resolve-client-connector', () => ({ resolveEngagementConnectorId: async () => 'conn' }))
vi.mock('@/lib/connectors/engagement-file-scope', async () => {
    const { storageFailure } = await import('@/lib/connectors/storage-failure')
    return {
        isFileInEngagementTree: async (_e: string, _c: string, id: string) => {
            if (st.scopeRefused.has(id)) throw storageFailure('busy', 'Google Drive')
            return st.inTree.has(id)
        },
    }
})
vi.mock('@/lib/connectors/registry', () => ({
    getPermissionAdapter: async () => ({
        getFileMetadata: async (_c: string, id: string) => {
            const f = st.files[id]
            return f ? { id, name: f.name, mimeType: f.children ? 'application/vnd.google-apps.folder' : (f.mimeType ?? 'application/pdf') } : null
        },
        listFiles: async (_c: string, id: string) => (st.files[id]?.children ?? []).map((c) => ({ id: c })),
    }),
    getContentAdapter: async () => ({
        getRenderableContent: async (_c: string, id: string) => {
            if (st.unreadable.has(id)) throw new Error('500')
            return { stream: Buffer.from(`content of ${id}`) }
        },
    }),
}))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagement: { findUnique: async () => ({ firmId: 'f', name: 'Acme Audit', clientId: 'c' }) },
        engagementDocument: { findMany: async () => st.rows },
    },
}))

import { POST } from './route'

const download = (externalIds: string[]) =>
    POST({ json: async () => ({ externalIds }) } as any, { params: Promise.resolve({ projectId: 'p' }) })
const notIncluded = (res: Response) => JSON.parse(decodeURIComponent(res.headers.get('X-Bulk-Download-Not-Included') ?? '[]'))
const row = (externalId: string, settings: object = {}, parentId: string | null = 'D') => ({ externalId, parentId, fileName: st.files[externalId]?.name ?? externalId, settings })
const downloadable = (role: 'guest' | 'externalCollaborator', extra: object = {}) => ({ share: { [role]: { enabled: true, options: { allowDownload: true, ...extra } } } })

beforeEach(() => {
    st.role = 'eng_admin'
    st.visible = null
    st.inTree = new Set()
    st.scopeRefused = new Set()
    st.unreadable = new Set()
    st.files = {
        D: { name: 'Deliverable', children: ['a', 'b', 'c', 'secret'] },
        a: { name: 'Plan.pdf' },
        b: { name: 'Budget.xlsx' },
        c: { name: 'Notes.docx' },
        secret: { name: 'Internal.docx' },
        other: { name: 'Other client.pdf' },
    }
    st.rows = [row('D', {}, null), row('a'), row('b'), row('c'), row('secret', { lock: { type: 'private' } })]
})

describe('bulk download, for the firm', () => {
    it("leaves out what isn't in this engagement", async () => {
        const res = await download(['a', 'other'])
        expect(res.status).toBe(200)
        expect(res.headers.get('X-Bulk-Download-Included')).toBe('1')
        expect(res.headers.get('X-Bulk-Download-Withheld')).toBe('1')
        expect(notIncluded(res)).toEqual([{ name: 'An item', reason: "isn't in this engagement" }])
    })

    // P2-37: the storage refusing the scope check isn't "not in this engagement".
    it("counts an item whose scope check storage refused as unreadable, not as outside the engagement", async () => {
        st.scopeRefused = new Set(['other'])
        const res = await download(['a', 'other'])
        expect(res.status).toBe(200)
        expect(res.headers.get('X-Bulk-Download-Skipped')).toBe('1')
        expect(res.headers.get('X-Bulk-Download-Withheld')).toBe('0')
        expect(notIncluded(res)).toEqual([{ name: 'An item', reason: "couldn't be read from storage" }])
    })

    it('takes a file inside its folder tree that was never indexed', async () => {
        st.inTree = new Set(['other'])
        const res = await download(['other'])
        expect(res.headers.get('X-Bulk-Download-Included')).toBe('1')
    })

    it('says when the selection was capped at the limit', async () => {
        st.files.D.children = Array.from({ length: 101 }, (_, i) => `f${i}`)
        for (let i = 0; i < 101; i++) st.files[`f${i}`] = { name: `f${i}.pdf` }
        const res = await download(['D'])
        expect(res.headers.get('X-Bulk-Download-Included')).toBe('100')
        expect(res.headers.get('X-Bulk-Download-Capped')).toBe('true')
        expect(res.headers.get('X-Bulk-Download-Limit')).toBe('100')
    })

    it('names what could not be downloaded', async () => {
        st.unreadable = new Set(['b'])
        const res = await download(['a', 'b'])
        expect(res.headers.get('X-Bulk-Download-Failed')).toBe('1')
        expect(res.headers.get('X-Bulk-Download-Capped')).toBe('false')
        expect(notIncluded(res)).toEqual([{ name: 'Budget.xlsx', reason: "couldn't be downloaded from storage" }])
    })

    it('is an error when nothing could be downloaded, never an empty ZIP', async () => {
        st.unreadable = new Set(['a'])
        const res = await download(['a'])
        expect(res.status).toBe(502)
        expect((await res.json()).error).toBe("None of these files could be downloaded. Not included: Plan.pdf (couldn't be downloaded from storage).")
    })
})

describe('bulk download, for a Reviewer', () => {
    beforeEach(() => {
        st.role = 'eng_viewer'
        st.visible = new Set(['D', 'a', 'b', 'c', 'secret'])
        st.rows = [
            row('D', {}, null),
            row('a', downloadable('guest')),
            row('b', { share: { guest: { enabled: true, options: { allowDownload: false } } } }),
            row('c', downloadable('guest', { sharePdfOnly: true })),
            row('secret', { lock: { type: 'private' }, ...downloadable('guest') }),
        ]
    })

    it("gives only what download-share would, and never names what's internal only", async () => {
        const res = await download(['D'])
        expect(res.status).toBe(200)
        expect(res.headers.get('X-Bulk-Download-Included')).toBe('1')
        expect(res.headers.get('X-Bulk-Download-Withheld')).toBe('3')
        expect(notIncluded(res)).toEqual([
            { name: 'Budget.xlsx', reason: "isn't available to download" },
            { name: 'Notes.docx', reason: 'is shared as a PDF only, so download it on its own' },
        ])
    })

    it("never reaches a file by its id that isn't shared with them", async () => {
        st.visible = new Set(['D'])
        const res = await download(['a', 'other'])
        expect(res.status).toBe(403)
        const body = await res.json()
        expect(body.code).toBe('not_permitted')
        expect(body.notIncluded).toEqual([])
    })
})

describe('bulk download, for a Limited Access contributor', () => {
    it('applies their own allowDownload', async () => {
        st.role = 'eng_ext_collaborator'
        st.visible = new Set(['a', 'b'])
        st.rows = [row('a', downloadable('externalCollaborator')), row('b', downloadable('guest'))]
        const res = await download(['a', 'b'])
        expect(res.headers.get('X-Bulk-Download-Included')).toBe('1')
        expect(notIncluded(res)).toEqual([{ name: 'Budget.xlsx', reason: "isn't available to download" }])
    })
})
