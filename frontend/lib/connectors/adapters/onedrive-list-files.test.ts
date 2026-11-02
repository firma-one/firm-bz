import { describe, it, expect, vi, beforeEach } from 'vitest'

// The OneDrive Files listing's access rule: members see General only, leads General or Confidential,
// decided by drive path (one Graph read) or, when Graph gives no path, the parent-by-parent walk.
// Token, drive base and the connector row are stubbed and fetch is mocked: nothing reaches a drive.

const BASE = 'https://graph.example/v1.0/me/drive'

vi.mock('@/lib/connectors/onedrive-connector', () => ({
    OneDriveConnector: { getInstance: () => ({ getAccessToken: async () => 'token-abc' }) },
}))
vi.mock('./onedrive-adapter', () => ({ resolveOneDriveDriveBase: async () => BASE }))
vi.mock('@/lib/prisma', () => ({ prisma: { connector: { findUnique: async () => ({ firmId: 'firm1', settings: {} }) } } }))
vi.mock('@/lib/ignore-parser', () => ({ ignoreParser: { getPatterns: () => [] } }))

import { listOneDriveFiles } from './onedrive-list-files'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// Engagement root E, with General (G), a folder inside it (S), Confidential (C), a folder inside that
// (X), and a sibling whose name only starts like General's (GX).
const tree: Record<string, { name: string; parentId: string | null; parentPath: string | null }> = {
    E: { name: 'Eng', parentId: 'ROOT', parentPath: '/drive/root:' },
    G: { name: 'General', parentId: 'E', parentPath: '/drive/root:/Eng' },
    S: { name: 'Sub', parentId: 'G', parentPath: '/drive/root:/Eng/General' },
    C: { name: 'Confidential', parentId: 'E', parentPath: '/drive/root:/Eng' },
    X: { name: 'Secret', parentId: 'C', parentPath: '/drive/root:/Eng/Confidential' },
    GX: { name: 'General-old', parentId: 'E', parentPath: '/drive/root:/Eng' },
    ROOT: { name: 'root', parentId: null, parentPath: null },
}

let withPaths = true
const fetchMock = vi.fn(async (url: string) => {
    const children = url.match(/\/items\/([^/?]+)\/children/)
    if (children) return json({ value: [{ id: 'f1', name: 'a.pdf', file: { mimeType: 'application/pdf' } }] })
    const item = url.match(/\/items\/([^/?]+)\?/)
    const node = item ? tree[item[1]] : undefined
    if (!node) return json({}, 404)
    return json({
        name: node.name,
        parentReference: node.parentId ? { id: node.parentId, ...(withPaths && node.parentPath ? { path: node.parentPath } : {}) } : undefined,
    })
})

beforeEach(() => {
    withPaths = true
    fetchMock.mockClear()
    vi.stubGlobal('fetch', fetchMock)
})

const ctx = (role: string | null) => ({ projectId: 'p1', generalFolderId: 'G', confidentialFolderId: 'C', personaName: role, personaSlug: role })
const list = (folderId: string, role: string | null) => listOneDriveFiles('conn1', folderId, 100, ctx(role)).then((f) => f.map((x) => x.id))

describe.each([true, false])('listOneDriveFiles access (Graph returns paths: %s)', (paths) => {
    beforeEach(() => { withPaths = paths })

    it('a member sees General and folders inside it', async () => {
        expect(await list('G', 'eng_member')).toEqual(['f1'])
        expect(await list('S', 'eng_member')).toEqual(['f1'])
    })

    it('a member never sees Confidential or anything inside it', async () => {
        expect(await list('C', 'eng_member')).toEqual([])
        expect(await list('X', 'eng_member')).toEqual([])
    })

    it('a lead sees General and Confidential, inside both', async () => {
        expect(await list('S', 'eng_admin')).toEqual(['f1'])
        expect(await list('X', 'eng_admin')).toEqual(['f1'])
    })

    it('a folder outside both roots is hidden, even one named like General', async () => {
        expect(await list('GX', 'eng_member')).toEqual([])
        expect(await list('GX', 'eng_admin')).toEqual([])
        expect(await list('E', 'eng_admin')).toEqual([])
    })
})

describe('listOneDriveFiles', () => {
    it('checks a member against General only, with no walk to the drive root', async () => {
        await list('S', 'eng_member')
        const itemReads = fetchMock.mock.calls.map(([u]) => u as string).filter((u) => !u.includes('/children'))
        // The folder itself, plus General's path unless an earlier test cached it.
        expect(itemReads.length).toBeLessThanOrEqual(2)
        expect(itemReads.some((u) => u.includes('/items/C?'))).toBe(false)
    })

    it('follows Graph paging up to the limit', async () => {
        fetchMock.mockImplementationOnce(async () => json({ value: [{ id: 'a', name: 'a' }], '@odata.nextLink': `${BASE}/page2` }))
        fetchMock.mockImplementationOnce(async () => json({ value: [{ id: 'b', name: 'b' }, { id: 'c', name: 'c' }] }))
        const files = await listOneDriveFiles('conn1', 'Z', 2, null)
        expect(files.map((f) => f.id)).toEqual(['a', 'b'])
    })

    it('a missing folder lists nothing', async () => {
        fetchMock.mockImplementationOnce(async () => json({}, 404))
        expect(await listOneDriveFiles('conn1', 'nope', 100, null)).toEqual([])
    })
})
