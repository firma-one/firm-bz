import { describe, it, expect, vi, beforeEach } from 'vitest'

// A completed engagement is read only for everyone in Drive too, on the files themselves. The permissions
// are lowered in place and given back on reopening, through the connector each was granted on.

const { st, adapter, findMany } = vi.hoisted(() => ({
    st: {
        engagement: null as null | { status: string },
        shares: [] as any[],
        connectorType: 'GOOGLE_DRIVE',
    },
    adapter: { patchFilePermissionRole: vi.fn() },
    findMany: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/connectors/registry', () => ({
    getPermissionAdapter: async (connectorId: string) => (connectorId === 'broken' ? null : adapter),
}))
vi.mock('@/lib/connectors/resolve-client-connector', () => ({
    resolveEngagementConnectorId: async (_projectId: string, documentConnectorId: string | null) => documentConnectorId ?? 'client-conn',
}))
vi.mock('@/lib/engagement-access', () => ({
    isExternalEngagementRole: (role: string) => role === 'eng_ext_collaborator' || role === 'eng_viewer',
}))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagement: { findFirst: async () => st.engagement },
        engagementDocumentSharingUser: { findMany },
        connector: { findUnique: async () => ({ type: st.connectorType }) },
    },
}))

import { setMemberFileAccess } from './member-file-access'
import { storageFailure } from './storage-failure'

const share = (id: string, role: string, document: object = {}) => ({
    userId: `user-${id}`,
    connectorPermissionId: `perm-${id}`,
    member: { role },
    document: { id: `doc-${id}`, fileName: `File ${id}.docx`, externalId: `ext-${id}`, connectorId: null, settings: {}, ...document },
})

beforeEach(() => {
    st.engagement = { status: 'COMPLETED' }
    st.connectorType = 'GOOGLE_DRIVE'
    st.shares = [share('a', 'eng_ext_collaborator'), share('b', 'eng_member')]
    findMany.mockReset()
    findMany.mockImplementation(async () => st.shares)
    adapter.patchFilePermissionRole.mockReset()
    adapter.patchFilePermissionRole.mockResolvedValue(true)
})

describe('when an engagement is completed', () => {
    it("drops every role's standing permission to view, Limited Access included", async () => {
        expect(await setMemberFileAccess('p', 'read_only')).toEqual({ changed: 2, failed: 0, failures: [] })
        expect(adapter.patchFilePermissionRole.mock.calls).toEqual([
            ['client-conn', 'ext-a', 'perm-a', 'viewer'],
            ['client-conn', 'ext-b', 'perm-b', 'viewer'],
        ])
    })

    it('only touches permissions that stand, and leaves Reviewers out', async () => {
        await setMemberFileAccess('p', 'read_only')
        expect(findMany.mock.calls[0][0].where).toEqual({
            engagementId: 'p',
            connectorPermissionId: { not: null },
            sharingPermissionStatus: { in: ['GRANTED', 'INHERITED'] },
            member: { role: { not: 'eng_viewer' } },
        })
    })

    it('goes through the connector the document was granted on', async () => {
        st.shares = [share('a', 'eng_member', { connectorId: 'doc-conn' })]
        await setMemberFileAccess('p', 'read_only')
        expect(adapter.patchFilePermissionRole).toHaveBeenCalledWith('doc-conn', 'ext-a', 'perm-a', 'viewer')
    })

    it('leaves a Limited Access contributor on OneDrive, whose grant is already view only', async () => {
        st.connectorType = 'ONEDRIVE'
        expect(await setMemberFileAccess('p', 'read_only')).toEqual({ changed: 1, failed: 0, failures: [] })
        expect(adapter.patchFilePermissionRole.mock.calls).toEqual([['client-conn', 'ext-b', 'perm-b', 'viewer']])
    })

    it('does nothing if it was reopened before the job ran, or the engagement is gone', async () => {
        st.engagement = { status: 'ACTIVE' }
        await setMemberFileAccess('p', 'read_only')
        st.engagement = null
        await setMemberFileAccess('p', 'read_only')
        expect(adapter.patchFilePermissionRole).not.toHaveBeenCalled()
    })

    it('says which file Drive refused, and why, and carries on', async () => {
        adapter.patchFilePermissionRole.mockResolvedValueOnce(false)
        expect(await setMemberFileAccess('p', 'read_only')).toEqual({
            changed: 1,
            failed: 1,
            failures: [{ userId: 'user-a', documentId: 'doc-a', fileName: 'File a.docx', permissionId: 'perm-a', reason: 'The storage refused the change.' }],
        })
        const refusal = storageFailure('locked', 'Google Drive')
        adapter.patchFilePermissionRole.mockRejectedValueOnce(refusal)
        const second = await setMemberFileAccess('p', 'read_only')
        expect(second).toMatchObject({ changed: 1, failed: 1 })
        expect(second.failures[0].reason).toBe(refusal.message)
    })

    it('counts a permission with no connector left to change it through as failed', async () => {
        st.shares = [share('a', 'eng_member', { connectorId: 'broken' })]
        const result = await setMemberFileAccess('p', 'read_only')
        expect(result).toMatchObject({ changed: 0, failed: 1 })
        expect(result.failures[0].reason).toContain('No storage is connected')
    })
})

describe('when an engagement is reopened', () => {
    beforeEach(() => { st.engagement = { status: 'ACTIVE' } })

    it('gives edit back', async () => {
        expect(await setMemberFileAccess('p', 'restore')).toEqual({ changed: 2, failed: 0, failures: [] })
        expect(adapter.patchFilePermissionRole.mock.calls).toEqual([
            ['client-conn', 'ext-a', 'perm-a', 'editor'],
            ['client-conn', 'ext-b', 'perm-b', 'editor'],
        ])
    })

    it('leaves a finalized document read only', async () => {
        st.shares = [share('a', 'eng_member', { settings: { lock: { type: 'finalize' } } }), share('b', 'eng_member')]
        expect(await setMemberFileAccess('p', 'restore')).toEqual({ changed: 1, failed: 0, failures: [] })
        expect(adapter.patchFilePermissionRole.mock.calls).toEqual([['client-conn', 'ext-b', 'perm-b', 'editor']])
    })

    it('never gives a Limited Access contributor on OneDrive more than the view-only link', async () => {
        st.connectorType = 'ONEDRIVE'
        st.shares = [share('a', 'eng_ext_collaborator')]
        await setMemberFileAccess('p', 'restore')
        expect(adapter.patchFilePermissionRole).not.toHaveBeenCalled()
    })

    it('does nothing if it was completed again before the job ran', async () => {
        st.engagement = { status: 'COMPLETED' }
        await setMemberFileAccess('p', 'restore')
        expect(adapter.patchFilePermissionRole).not.toHaveBeenCalled()
    })
})
