import { describe, it, expect, vi, beforeEach } from 'vitest'

// A completed engagement is read-only for the firm in Drive too, and reopening gives write back. Both go
// through the client's connector, only as far as each person had access, and never for the Brio agent.

const { st, adapter } = vi.hoisted(() => ({
    st: {
        engagement: null as null | Record<string, unknown>,
        clientConnector: 'client-conn' as string | null,
        members: [] as { userId: string; role: string }[],
        agents: new Set<string>(),
        shares: [] as any[],
    },
    adapter: {
        getEngagementFolderIds: vi.fn(),
        downgradeFolderUserPermissionToReader: vi.fn(),
        upgradeFolderUserPermissionToEditor: vi.fn(),
        revokeFolderPermissionByEmail: vi.fn(),
        restrictFolderToOwnerOnly: vi.fn(),
        revokePermission: vi.fn(),
    },
}))

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/ai/agent-email', () => ({ withoutAgentIds: async (ids: string[]) => ids.filter((id) => !st.agents.has(id)) }))
vi.mock('@/lib/connectors/registry', () => ({ getPermissionAdapter: async (id: string | null) => (id ? adapter : null) }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagement: {
            findFirst: async () => st.engagement,
            // Read for the connector (resolveEngagementConnectorId) and for the folders (the revokes).
            findUnique: async () => ({
                firmId: 'f1', slug: 'eng', name: 'Engagement', connectorRootFolderId: 'root',
                client: { connectorId: st.clientConnector, slug: 'cl', name: 'Client' },
            }),
        },
        firm: { findUnique: async () => ({ connectorId: st.clientConnector ? 'firm-legacy-conn' : null }) },
        engagementMember: { findMany: async () => st.members },
        engagementDocumentSharingUser: { findMany: async () => st.shares },
        $queryRaw: async () => st.members.map((m) => ({ id: m.userId, email: `${m.userId}@firm.test` })),
    },
}))

import { revokeMemberFolderAccess, setFirmFolderAccess, takeBackEngagementAccess } from './firm-folder-access'
import { storageFailure } from './storage-failure'

const engagement = (status: string, extra: object = {}) => ({
    slug: 'eng', name: 'Engagement', status, connectorRootFolderId: 'root', client: { slug: 'cl', name: 'Client' }, ...extra,
})

beforeEach(() => {
    st.engagement = null
    st.clientConnector = 'client-conn'
    st.members = [{ userId: 'lead', role: 'eng_admin' }, { userId: 'staff', role: 'eng_member' }]
    st.agents = new Set()
    adapter.getEngagementFolderIds.mockReset()
    adapter.getEngagementFolderIds.mockResolvedValue({ generalFolderId: 'general', confidentialFolderId: 'confidential', stagingFolderId: 'staging' })
    adapter.downgradeFolderUserPermissionToReader.mockReset()
    adapter.downgradeFolderUserPermissionToReader.mockResolvedValue(true)
    adapter.upgradeFolderUserPermissionToEditor.mockReset()
    adapter.upgradeFolderUserPermissionToEditor.mockResolvedValue(true)
    adapter.revokeFolderPermissionByEmail.mockReset()
    adapter.revokeFolderPermissionByEmail.mockResolvedValue(undefined)
    adapter.restrictFolderToOwnerOnly.mockReset()
    adapter.restrictFolderToOwnerOnly.mockResolvedValue({ removed: 1, remaining: [] })
    adapter.revokePermission.mockReset()
    adapter.revokePermission.mockResolvedValue(true)
    st.shares = []
})

describe('when an engagement is completed', () => {
    it("drops firm members to read on its folders, through the client's connector", async () => {
        st.engagement = engagement('COMPLETED')
        expect(await setFirmFolderAccess('p', 'read_only')).toEqual({ changed: 4, failed: 0, failures: [] })
        expect(adapter.downgradeFolderUserPermissionToReader.mock.calls).toEqual([
            ['client-conn', 'general', 'lead@firm.test'],
            ['client-conn', 'confidential', 'lead@firm.test'],
            ['client-conn', 'general', 'staff@firm.test'],
            ['client-conn', 'confidential', 'staff@firm.test'],
        ])
    })

    it('does nothing if it was reopened before the job ran', async () => {
        st.engagement = engagement('ACTIVE')
        await setFirmFolderAccess('p', 'read_only')
        expect(adapter.downgradeFolderUserPermissionToReader).not.toHaveBeenCalled()
    })

    it('does nothing for a deleted engagement, or one with no folder', async () => {
        await setFirmFolderAccess('p', 'read_only')
        st.engagement = engagement('COMPLETED', { connectorRootFolderId: null })
        await setFirmFolderAccess('p', 'read_only')
        expect(adapter.downgradeFolderUserPermissionToReader).not.toHaveBeenCalled()
    })

    it('says who Drive refused, and why, and carries on', async () => {
        st.engagement = engagement('COMPLETED')
        const refusal = storageFailure('no_permission', 'Google Drive')
        adapter.downgradeFolderUserPermissionToReader.mockResolvedValueOnce(false)
        adapter.downgradeFolderUserPermissionToReader.mockRejectedValueOnce(refusal)
        const result = await setFirmFolderAccess('p', 'read_only')
        expect(result).toMatchObject({ changed: 2, failed: 2 })
        expect(result.failures).toEqual([
            { userId: 'lead', email: 'lead@firm.test', folder: 'General', folderId: 'general', reason: 'The storage refused the change.' },
            { userId: 'lead', email: 'lead@firm.test', folder: 'Confidential', folderId: 'confidential', reason: refusal.message },
        ])
    })
})

describe('when an engagement is reopened', () => {
    it('gives a lead write on General and Confidential, and a member on General only', async () => {
        st.engagement = engagement('ACTIVE')
        expect(await setFirmFolderAccess('p', 'restore')).toEqual({ changed: 3, failed: 0, failures: [] })
        expect(adapter.upgradeFolderUserPermissionToEditor.mock.calls).toEqual([
            ['client-conn', 'general', 'lead@firm.test'],
            ['client-conn', 'confidential', 'lead@firm.test'],
            ['client-conn', 'general', 'staff@firm.test'],
        ])
    })

    it.each(['ACTIVE', 'PAUSED', 'PLANNED'])('restores from %s, any status but Completed', async (status) => {
        st.engagement = engagement(status)
        await setFirmFolderAccess('p', 'restore')
        expect(adapter.upgradeFolderUserPermissionToEditor).toHaveBeenCalled()
    })

    it('does nothing if it was completed again before the job ran', async () => {
        st.engagement = engagement('COMPLETED')
        await setFirmFolderAccess('p', 'restore')
        expect(adapter.upgradeFolderUserPermissionToEditor).not.toHaveBeenCalled()
    })

    it('never shares a folder with the Brio agent', async () => {
        st.engagement = engagement('ACTIVE')
        st.members = [{ userId: 'staff', role: 'eng_member' }, { userId: 'brio', role: 'eng_member' }]
        st.agents = new Set(['brio'])
        await setFirmFolderAccess('p', 'restore')
        expect(adapter.upgradeFolderUserPermissionToEditor.mock.calls).toEqual([['client-conn', 'general', 'staff@firm.test']])
    })
})

describe('taking back a member\'s folder access', () => {
    const member = { userId: 'lead', email: 'lead@firm.test' }

    it('revokes their grant on General, Confidential and Staging, never the engagement root', async () => {
        const result = await revokeMemberFolderAccess('p', member)
        expect(adapter.revokeFolderPermissionByEmail.mock.calls).toEqual([
            ['client-conn', 'general', 'lead@firm.test'],
            ['client-conn', 'confidential', 'lead@firm.test'],
            ['client-conn', 'staging', 'lead@firm.test'],
        ])
        expect(adapter.revokeFolderPermissionByEmail).not.toHaveBeenCalledWith('client-conn', 'root', expect.anything())
        expect(result).toEqual({ revoked: ['General', 'Confidential', 'Staging'], failures: [] })
    })

    it('takes back only the folders it is asked to, for a lowered role', async () => {
        await revokeMemberFolderAccess('p', member, ['Confidential', 'Staging'])
        expect(adapter.revokeFolderPermissionByEmail.mock.calls.map((c) => c[1])).toEqual(['confidential', 'staging'])
    })

    it('says which folder storage refused, and why', async () => {
        const refusal = storageFailure('reconnect', 'OneDrive')
        adapter.revokeFolderPermissionByEmail.mockRejectedValueOnce(refusal)
        const result = await revokeMemberFolderAccess('p', member)
        expect(result.revoked).toEqual(['Confidential', 'Staging'])
        expect(result.failures).toEqual([{ ...member, folder: 'General', folderId: 'general', reason: refusal.message }])
    })

    it('counts folders it cannot reach for want of a connector as still shared', async () => {
        st.clientConnector = null
        const result = await revokeMemberFolderAccess('p', member, ['General'])
        expect(adapter.revokeFolderPermissionByEmail).not.toHaveBeenCalled()
        expect(result.failures[0]).toMatchObject({ folder: 'General', reason: expect.stringContaining('No storage is connected') })
    })
})

describe("taking back an engagement's access before it's deleted", () => {
    const share = (id: string, fileName: string) => ({ id, connectorPermissionId: `perm-${id}`, document: { externalId: `ext-${id}`, connectorId: null, fileName } })

    it('revokes every permission a row holds, and restricts its folders and root to their owner', async () => {
        st.shares = [share('s1', 'Budget.xlsx')]
        const left = await takeBackEngagementAccess('p')
        expect(adapter.revokePermission).toHaveBeenCalledWith('client-conn', 'ext-s1', 'perm-s1')
        expect(adapter.restrictFolderToOwnerOnly.mock.calls.map((c) => c[1])).toEqual(['general', 'confidential', 'staging', 'root'])
        expect(left).toEqual({ files: [], folderAccess: [], foldersUnchecked: false, reason: undefined })
    })

    it('tries a refused revoke twice, then names the file still shared and why', async () => {
        const refusal = storageFailure('busy', 'Google Drive')
        adapter.revokePermission.mockRejectedValue(refusal)
        st.shares = [share('s1', 'Budget.xlsx')]
        const left = await takeBackEngagementAccess('p')
        expect(adapter.revokePermission).toHaveBeenCalledTimes(2)
        expect(left.files).toEqual(['Budget.xlsx'])
        expect(left.reason).toBe(refusal.message)
    })

    it('names who still has access to its folders when storage keeps them', async () => {
        adapter.restrictFolderToOwnerOnly.mockResolvedValueOnce({ removed: 0, remaining: ['ana@client.test'], reason: 'Google Drive refused the change.' })
        const left = await takeBackEngagementAccess('p')
        expect(left.folderAccess).toEqual(['ana@client.test'])
        expect(left.reason).toBe('Google Drive refused the change.')
    })

    it("says so when storage won't even list a folder's permissions", async () => {
        adapter.restrictFolderToOwnerOnly.mockRejectedValueOnce(storageFailure('unreachable', 'OneDrive'))
        const left = await takeBackEngagementAccess('p')
        expect(left.foldersUnchecked).toBe(true)
        expect(left.reason).toBe("Couldn't reach OneDrive. Try again in a moment.")
    })
})
