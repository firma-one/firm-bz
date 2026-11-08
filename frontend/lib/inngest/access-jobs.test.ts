import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The jobs that change storage access with a member's role: a lowered role loses the folders the new one
 * doesn't have, a join or raised role is shared them, and what storage refuses is tried once more, then
 * told to the engagement's Leads. Neither answers "done" for a change that didn't happen.
 */

const { st, folders, grant, notify } = vi.hoisted(() => ({
    st: {
        currentRole: 'eng_member' as string | null,
        shares: [] as any[],
        engagement: { slug: 'eng', name: 'Engagement', connectorRootFolderId: 'root', client: { slug: 'cl', name: 'Client' } } as any,
    },
    folders: { revoke: vi.fn(), setFirm: vi.fn(async () => ({ changed: 0, failed: 0, failures: [] })) },
    grant: vi.fn(),
    notify: vi.fn(async () => 1),
}))

vi.mock('./client', () => ({
    inngest: { createFunction: (config: unknown, handler: unknown) => ({ config, handler }) },
    safeInngestSend: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
vi.mock('@/lib/storage-access-notice', () => ({ notifyLeadsOfStorageAccess: notify }))
vi.mock('@/lib/connectors/trash-undo', () => ({ TRASH_UNDO_WINDOW_SECONDS: 60, wasRestoredFromBin: vi.fn() }))
vi.mock('@/lib/services/search-service', () => ({ SearchService: {} }))
vi.mock('@/lib/connectors/firm-folder-access', () => ({ revokeMemberFolderAccess: folders.revoke, setFirmFolderAccess: folders.setFirm }))
vi.mock('@/lib/connectors/resolve-client-connector', () => ({ resolveEngagementConnectorId: async () => 'client-conn' }))
vi.mock('@/lib/connectors/registry', () => ({
    getPermissionAdapter: async () => ({ revokePermission: vi.fn(async () => true), grantFolderPermission: vi.fn(async () => 'perm') }),
    getMigrationAdapter: vi.fn(),
    getConnectorInstance: vi.fn(),
}))
vi.mock('@/lib/grant-engagement-drive-folder-access', async (original) => ({
    ...(await original<typeof import('@/lib/grant-engagement-drive-folder-access')>()),
    grantEngagementDriveFolderAccess: grant,
}))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagement: { findFirst: async () => st.engagement, findUnique: async () => ({ firmId: 'f1', client: { connectorId: 'client-conn' } }) },
        engagementMember: { findFirst: async () => (st.currentRole ? { role: st.currentRole } : null) },
        engagementDocument: { findMany: async () => [] },
        engagementDocumentSharingUser: { findMany: async () => st.shares, updateMany: async () => ({ count: 1 }) },
        $queryRaw: async () => [{ email: 'sam@firm.test' }],
    },
}))

import { grantPermissionsForNewMember, revokeByMemberPersonaChange } from './functions'
import { storageFailure } from '@/lib/connectors/storage-failure'

const step = () => ({ run: vi.fn(async (_id: string, fn: () => unknown) => fn()), sleep: vi.fn(async () => {}) })
const run = (fn: unknown, data: object, s = step()) => (fn as { handler: (ctx: unknown) => Promise<any> }).handler({ event: { data }, step: s })
const roleChange = (oldPersonaSlug: string, newPersonaSlug: string) => ({ projectId: 'p1', userId: 'u1', oldPersonaSlug, newPersonaSlug })

beforeEach(() => {
    st.shares = []
    st.engagement = { slug: 'eng', name: 'Engagement', connectorRootFolderId: 'root', client: { slug: 'cl', name: 'Client' } }
    folders.revoke.mockReset()
    folders.revoke.mockImplementation(async (_p: string, _m: unknown, names: string[]) => ({ revoked: names, failures: [] }))
    grant.mockReset()
    notify.mockClear()
})

describe('lowering a role takes back the folders the new role does not have', () => {
    it('Lead to Contributor · Full Access loses Confidential and Staging', async () => {
        st.currentRole = 'eng_member'
        await run(revokeByMemberPersonaChange, roleChange('eng_admin', 'eng_member'))
        expect(folders.revoke).toHaveBeenCalledWith('p1', { userId: 'u1', email: 'sam@firm.test' }, ['Confidential', 'Staging'])
    })

    it.each(['eng_ext_collaborator', 'eng_viewer'])('Lead to %s loses every folder grant, and the per-file permissions', async (role) => {
        st.currentRole = role
        st.shares = [{ id: 's1', connectorPermissionId: 'perm-1', document: { externalId: 'ext-1', connectorId: null } }]
        const result = await run(revokeByMemberPersonaChange, roleChange('eng_admin', role))
        expect(folders.revoke).toHaveBeenCalledWith('p1', expect.anything(), ['General', 'Confidential', 'Staging'])
        expect(result.results.revoked).toBe(1)
    })

    it('Contributor · Full Access to Reviewer loses General', async () => {
        st.currentRole = 'eng_viewer'
        await run(revokeByMemberPersonaChange, roleChange('eng_member', 'eng_viewer'))
        expect(folders.revoke).toHaveBeenCalledWith('p1', expect.anything(), ['General'])
    })

    it('raising a role takes nothing away', async () => {
        st.currentRole = 'eng_admin'
        const result = await run(revokeByMemberPersonaChange, roleChange('eng_member', 'eng_admin'))
        expect(folders.revoke).not.toHaveBeenCalled()
        expect(result.message).toBe('No revocation needed')
    })

    it('goes by the role they hold now: changed back meanwhile, nothing is taken', async () => {
        st.currentRole = 'eng_admin'
        await run(revokeByMemberPersonaChange, roleChange('eng_admin', 'eng_member'))
        expect(folders.revoke).not.toHaveBeenCalled()
    })

    it("tries a refused folder again after a wait, then tells the Leads which folder and why", async () => {
        st.currentRole = 'eng_member'
        const refusal = storageFailure('no_permission', 'Google Drive')
        folders.revoke.mockResolvedValue({ revoked: [], failures: [{ userId: 'u1', email: 'sam@firm.test', folder: 'Confidential', folderId: 'conf', reason: refusal.message }] })
        const s = step()
        await run(revokeByMemberPersonaChange, roleChange('eng_admin', 'eng_member'), s)
        expect(s.sleep).toHaveBeenCalled()
        expect(folders.revoke).toHaveBeenCalledTimes(2)
        expect(folders.revoke.mock.calls[1][2]).toEqual(['Confidential'])
        expect(notify).toHaveBeenCalledWith('p1', [{ kind: 'folder_revoke', userId: 'u1', itemName: 'Confidential', itemType: 'folder', reason: refusal.message, key: 'conf' }])
    })
})

describe('the grant job for a new or raised member', () => {
    const joined = { projectId: 'p1', userId: 'u1', email: 'sam@firm.test', personaSlug: 'eng_admin' }

    it('answers granted only when every folder was shared', async () => {
        grant.mockResolvedValue({ granted: ['General', 'Confidential', 'Staging'], failed: [] })
        const result = await run(grantPermissionsForNewMember, joined)
        expect(result.folderGrant).toMatchObject({ granted: true, folders: ['General', 'Confidential', 'Staging'] })
        expect(notify).not.toHaveBeenCalled()
    })

    it('retries what storage refused, and is done when the retry shares it', async () => {
        grant
            .mockResolvedValueOnce({ granted: ['General'], failed: [{ folder: 'Confidential', folderId: 'conf', reason: 'busy' }] })
            .mockResolvedValueOnce({ granted: ['Confidential'], failed: [] })
        const result = await run(grantPermissionsForNewMember, joined)
        expect(grant.mock.calls[1][0].only).toEqual(['Confidential'])
        expect(result.folderGrant).toMatchObject({ granted: true, folders: ['General', 'Confidential'] })
        expect(notify).not.toHaveBeenCalled()
    })

    it("never answers granted: true when it wasn't, and tells the Leads what, who and why", async () => {
        const refusal = storageFailure('no_permission', 'Google Drive')
        grant.mockResolvedValue({ granted: ['General'], failed: [{ folder: 'Staging', folderId: 'stag', reason: refusal.message }] })
        const result = await run(grantPermissionsForNewMember, joined)
        expect(result.folderGrant.granted).toBe(false)
        expect(notify).toHaveBeenCalledTimes(1)
        expect(notify).toHaveBeenCalledWith('p1', [{ kind: 'grant', userId: 'u1', itemName: 'Staging', itemType: 'folder', reason: refusal.message, key: 'stag' }])
    })

    it('says why nothing was shared when the engagement has no folder', async () => {
        st.engagement = { ...st.engagement, connectorRootFolderId: null }
        const result = await run(grantPermissionsForNewMember, joined)
        expect(grant).not.toHaveBeenCalled()
        expect(result.folderGrant).toMatchObject({ granted: false, reason: 'no_connector_root' })
    })
})
