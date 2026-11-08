import { describe, it, expect, vi, beforeEach } from 'vitest'

// Locking a version (AP-1): a refusal in storage is answered with its reason, and nothing is recorded,
// so Firma never says "locked" while an editor can still edit. The connector is the document's own,
// else its client's, never the legacy firm one.

const { st, calls } = vi.hoisted(() => ({
    st: { failure: null as Error | null, connector: 'conn' as string | null },
    calls: { locked: [] as string[][], written: [] as any[] },
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) } }),
}))
vi.mock('@/lib/engagement-access', () => ({
    blockIfEngagementCompleted: async () => null,
    requireEngagementMember: async () => ({ role: 'eng_admin' }),
    isEngagementLeadRole: (r: string) => r === 'eng_admin',
}))
vi.mock('@/lib/file-utils', () => ({ getFileInfo: async () => ({ organizationId: 'f', externalId: 'ext-d1' }) }))
vi.mock('@/lib/connectors/resolve-client-connector', () => ({ resolveEngagementConnectorId: async () => st.connector }))
vi.mock('@/lib/files/storage-lock', () => ({
    StorageNotSupportedError: class extends Error {},
    lockFileInStorage: async (...args: string[]) => {
        calls.locked.push(args)
        if (st.failure) throw st.failure
        return [{ permissionId: 'p1', previousRole: 'editor', email: 'ana@client.com' }]
    },
}))
vi.mock('@/lib/audit', () => {
    const chain: any = new Proxy({}, { get: (_t, k) => (k === 'fireAndForget' ? () => {} : () => chain) })
    return { audit: () => chain, AUDIT_EVENT: {}, AUDIT_SCOPE: {} }
})
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagementDocument: {
            findUnique: async () => ({ id: 'd1', clientId: 'c', connectorId: null, fileName: 'Plan.xlsx', settings: {}, isFolder: false }),
            update: async ({ data }: any) => { calls.written.push(data.settings) },
        },
    },
}))

import { PATCH } from './route'
import { StorageFailure } from '@/lib/connectors/storage-failure'

const patch = () => PATCH({} as any, { params: Promise.resolve({ projectId: 'p', documentId: 'd1' }) })

beforeEach(() => {
    st.failure = null
    st.connector = 'conn'
    calls.locked = []
    calls.written = []
})

describe('PATCH finalize', () => {
    it('locks through the engagement connector and records who was downgraded', async () => {
        const res = await patch()
        expect(res.status).toBe(200)
        expect(calls.locked).toEqual([['conn', 'ext-d1']])
        expect(calls.written[0].lock).toMatchObject({ type: 'finalize', downgraded: [{ permissionId: 'p1', previousRole: 'editor', email: 'ana@client.com' }] })
    })

    it("answers storage's refusal and records nothing", async () => {
        st.failure = new StorageFailure('other', "Couldn't lock this in Google Drive. ana@client.com can still edit it · Google Drive refused the change. Try again in a moment.")
        const res = await patch()
        expect(res.status).toBe(502)
        expect(await res.json()).toEqual({ error: "Couldn't lock this in Google Drive. ana@client.com can still edit it · Google Drive refused the change. Try again in a moment.", code: 'other' })
        expect(calls.written).toEqual([])
    })

    it('says when no storage is connected', async () => {
        st.connector = null
        const res = await patch()
        expect(res.status).toBe(409)
        expect((await res.json()).code).toBe('no_connector')
        expect(calls.locked).toEqual([])
    })
})
