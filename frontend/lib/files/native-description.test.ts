import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The storage's own description field (lib/files/native-description.ts): Google Drive always,
// OneDrive on personal drives only; Firma's copy stays.

const { st, sql } = vi.hoisted(() => ({
    st: { type: 'GOOGLE_DRIVE' as string, driveType: 'personal' as string },
    sql: [] as { query: string; args: unknown[] }[],
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        connector: { findUnique: async () => ({ type: st.type }) },
        $executeRawUnsafe: async (query: string, ...args: unknown[]) => { sql.push({ query, args }); return 1 },
    },
}))
vi.mock('@/lib/google-drive-connector', () => ({ googleDriveConnector: { getAccessToken: async () => 'g-token' } }))
vi.mock('@/lib/connectors/onedrive-connector', () => ({ OneDriveConnector: { getInstance: () => ({ getAccessToken: async () => 'o-token' }) } }))
vi.mock('@/lib/connectors/adapters/onedrive-adapter', () => ({ resolveOneDriveDriveBase: async () => 'https://graph/v1.0/me/drive' }))

let calls: { url: string; method: string; body: any }[] = []
let writeOk = true

beforeEach(() => {
    st.type = 'GOOGLE_DRIVE'
    st.driveType = 'personal'
    sql.length = 0
    calls = []
    writeOk = true
    vi.resetModules()
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : null })
        if (url.endsWith('?$select=driveType')) return { ok: true, json: async () => ({ driveType: st.driveType }) } as Response
        return { ok: writeOk, status: writeOk ? 200 : 403, text: async () => '', json: async () => ({}) } as Response
    }))
})
afterEach(() => vi.unstubAllGlobals())

const load = () => import('./native-description')

describe('writeNativeDescription', () => {
    it("writes Google Drive's description field", async () => {
        const { writeNativeDescription } = await load()
        expect(await writeNativeDescription('conn', 'file 1', 'Fee schedule')).toBe(true)
        expect(calls).toEqual([{ url: 'https://www.googleapis.com/drive/v3/files/file%201?supportsAllDrives=true&fields=id', method: 'PATCH', body: { description: 'Fee schedule' } }])
    })

    it("writes a personal OneDrive's description field", async () => {
        st.type = 'ONEDRIVE'
        const { writeNativeDescription } = await load()
        expect(await writeNativeDescription('conn', 'item1', 'Fee schedule')).toBe(true)
        expect(calls.at(-1)).toEqual({ url: 'https://graph/v1.0/me/drive/items/item1', method: 'PATCH', body: { description: 'Fee schedule' } })
    })

    it('leaves OneDrive for Business and SharePoint alone: they have no such field', async () => {
        st.type = 'ONEDRIVE'
        st.driveType = 'business'
        const { writeNativeDescription } = await load()
        expect(await writeNativeDescription('conn', 'item1', 'Fee schedule')).toBe(false)
        expect(calls.filter((c) => c.method === 'PATCH')).toEqual([])
    })

    it('reports a refused write without throwing', async () => {
        writeOk = false
        const { writeNativeDescription } = await load()
        expect(await writeNativeDescription('conn', 'file1', 'x')).toBe(false)
    })
})

describe('reconcileNativeDescriptions', () => {
    it("takes a description written in Drive into Firma, and rebuilds the vector", async () => {
        const { reconcileNativeDescriptions } = await load()
        const changed: string[] = []
        await reconcileNativeDescriptions('conn', [{ id: 'd1', externalId: 'f1', firma: 'Old', native: 'New from Drive' }], async (id) => { changed.push(id) })
        expect(sql[0].args).toEqual(['New from Drive', 'd1'])
        expect(changed).toEqual(['d1'])
    })

    it("writes Firma's to Drive when Drive has none, and doesn't retry one Drive refused", async () => {
        const { reconcileNativeDescriptions } = await load()
        writeOk = false
        const rows = [{ id: 'd1', externalId: 'f1', firma: 'From Firma', native: null }]
        await reconcileNativeDescriptions('conn', rows, async () => {})
        await reconcileNativeDescriptions('conn', rows, async () => {})
        expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1)
        expect(sql).toEqual([])
    })
})
