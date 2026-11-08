import { describe, it, expect, vi, beforeEach } from 'vitest'

// A client's acceptance locks the document the way Finalize does (AP-1): a refusal in storage is
// answered with its reason, and the document isn't recorded as accepted.

const { st, calls } = vi.hoisted(() => ({
    st: { failure: null as Error | null },
    calls: { written: [] as any[], notified: 0 },
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'ana' } } }) } }),
}))
vi.mock('@/lib/engagement-access', () => ({
    blockIfEngagementCompleted: async () => null,
    requireEngagementMember: async () => ({ role: 'eng_viewer' }),
    externalMemberCanAccessDocument: async () => true,
}))
vi.mock('@/lib/file-utils', () => ({ getFileInfo: async () => ({ organizationId: 'f', externalId: 'ext-d1' }) }))
vi.mock('@/lib/connectors/resolve-client-connector', () => ({ resolveEngagementConnectorId: async () => 'conn' }))
vi.mock('@/lib/files/storage-lock', () => ({
    StorageNotSupportedError: class extends Error {},
    lockFileInStorage: async () => {
        if (st.failure) throw st.failure
        return []
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
        engagementMember: { findMany: async () => [] },
        notification: { createMany: async () => { calls.notified++ } },
    },
}))

import { PATCH } from './route'
import { StorageFailure } from '@/lib/connectors/storage-failure'

const patch = () => PATCH({} as any, { params: Promise.resolve({ projectId: 'p', documentId: 'd1' }) })

beforeEach(() => {
    st.failure = null
    calls.written = []
    calls.notified = 0
})

describe('PATCH accept', () => {
    it('locks it and records the acceptance', async () => {
        expect((await patch()).status).toBe(200)
        expect(calls.written[0].lock).toMatchObject({ type: 'finalize', acceptedBy: 'ana' })
    })

    it("answers storage's refusal, and isn't recorded as accepted", async () => {
        st.failure = new StorageFailure('other', "Couldn't lock this in Google Drive. ben@client.com can still edit it · Google Drive refused the change. Try again in a moment.")
        const res = await patch()
        expect(res.status).toBe(502)
        expect((await res.json()).error).toBe("Couldn't accept this. It couldn't be locked in Google Drive. ben@client.com can still edit it · Google Drive refused the change. Try again in a moment.")
        expect(calls.written).toEqual([])
    })
})
