import { describe, it, expect, vi, beforeEach } from 'vitest'

// Reject and withdraw (decision 6, AP-3): the file goes to the storage's trash first, and its record
// only after. Refused, the record stays and the answer says why; no connector is a refusal too.

const { st, calls } = vi.hoisted(() => ({
    st: { role: 'eng_admin' as string, connector: 'conn' as string | null, trashFailure: null as Error | null },
    calls: { trashed: [] as string[], deleted: [] as string[] },
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'ana' } } }) } }),
}))
vi.mock('@/lib/engagement-access', () => ({
    blockIfEngagementCompleted: async () => null,
    requireEngagementMember: async () => ({ role: st.role }),
    isExternalEngagementRole: (r: string) => r === 'eng_ext_collaborator' || r === 'eng_viewer',
    isEngagementLeadRole: (r: string) => r === 'eng_admin',
}))
vi.mock('@/lib/file-utils', () => ({ getFileInfo: async () => ({ organizationId: 'f', externalId: 'ext-up' }) }))
vi.mock('@/lib/connectors/resolve-client-connector', () => ({ resolveEngagementConnectorId: async () => st.connector }))
vi.mock('@/lib/connectors/registry', () => ({
    getPermissionAdapter: async () => ({
        trashFile: async (_c: string, id: string) => {
            if (st.trashFailure) throw st.trashFailure
            calls.trashed.push(id)
        },
    }),
}))
vi.mock('@/lib/inngest/client', () => ({ safeInngestSend: async () => true }))
vi.mock('@/lib/audit', () => {
    const chain: any = new Proxy({}, { get: (_t, k) => (k === 'fireAndForget' ? () => {} : () => chain) })
    return { audit: () => chain, AUDIT_EVENT: {}, AUDIT_SCOPE: {} }
})
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagementDocument: {
            findFirst: async ({ where }: any) => (where.externalId === 'ext-up' || where.id === 'up'
                ? { id: 'up', externalId: 'ext-up', fileName: 'Budget.xlsx', firmId: 'f', connectorId: null, clientId: 'c', settings: {}, sharingUsers: [{ id: 'su', userId: 'ana' }] }
                : null),
            findMany: async () => [],
            delete: async ({ where }: any) => { calls.deleted.push(where.id) },
            deleteMany: async ({ where }: any) => { calls.deleted.push(where.id) },
        },
        engagementMember: { findMany: async () => [] },
        userPersonalization: { findUnique: async () => null },
        notification: { deleteMany: async () => ({}) },
    },
}))

import { PATCH } from './route'
import { storageFailure } from '@/lib/connectors/storage-failure'

const act = (action: string, documentId = 'ext-up') =>
    PATCH({ json: async () => ({ action }) } as any, { params: Promise.resolve({ projectId: 'p', documentId }) })

beforeEach(() => {
    st.role = 'eng_admin'
    st.connector = 'conn'
    st.trashFailure = null
    calls.trashed = []
    calls.deleted = []
})

describe('rejecting an upload', () => {
    it('trashes it in storage, then removes its record', async () => {
        const res = await act('reject')
        expect(res.status).toBe(200)
        expect(calls.trashed).toEqual(['ext-up'])
        expect(calls.deleted).toEqual(['up'])
    })

    it('keeps the record when storage refuses, and says why', async () => {
        st.trashFailure = storageFailure('locked', 'OneDrive')
        const res = await act('reject')
        expect(res.status).toBe(409)
        expect(await res.json()).toEqual({
            error: 'Couldn\'t reject "Budget.xlsx" · OneDrive has this locked, usually because a file is open in Word, Excel or another app. Close it everywhere, then try again. It can take a minute to unlock.',
            code: 'locked',
        })
        expect(calls.deleted).toEqual([])
    })

    it('removes the record of a file already gone from storage', async () => {
        st.trashFailure = storageFailure('not_found', 'Google Drive')
        expect((await act('reject')).status).toBe(200)
        expect(calls.deleted).toEqual(['up'])
    })

    it('refuses when no storage is connected, never skipping the trash', async () => {
        st.connector = null
        const res = await act('reject')
        expect(res.status).toBe(409)
        expect((await res.json()).code).toBe('no_connector')
        expect(calls.deleted).toEqual([])
    })

    it('keeps the record on an unexpected failure too', async () => {
        st.trashFailure = new Error('socket hang up')
        const res = await act('reject')
        expect(res.status).toBe(502)
        expect(calls.deleted).toEqual([])
    })
})

describe('withdrawing an upload', () => {
    it('keeps it when storage refuses, in the uploader\'s words', async () => {
        st.role = 'eng_ext_collaborator'
        st.trashFailure = storageFailure('reconnect', 'Google Drive')
        const res = await act('withdraw')
        expect((await res.json()).error).toBe('Couldn\'t withdraw "Budget.xlsx" · The connection to Google Drive needs renewing. Reconnect the storage, then try again.')
        expect(calls.deleted).toEqual([])
    })
})

describe('rejecting an uploaded folder', () => {
    it('keeps every record when storage refuses the folder', async () => {
        st.trashFailure = storageFailure('locked', 'OneDrive')
        const res = await act('reject-folder')
        expect(res.status).toBe(409)
        expect(calls.deleted).toEqual([])
    })

    it('trashes the folder, then removes its records', async () => {
        const res = await act('reject-folder')
        expect(res.status).toBe(200)
        expect(calls.trashed).toEqual(['ext-up'])
        expect(calls.deleted).toEqual(['up'])
    })
})
