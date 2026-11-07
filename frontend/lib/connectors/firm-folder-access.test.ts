import { describe, it, expect, vi, beforeEach } from 'vitest'

// A completed engagement is read-only for the firm in Drive too, and reopening gives write back. Both go
// through the client's connector, only as far as each person had access, and never for the Brio agent.

const { st, adapter } = vi.hoisted(() => ({
    st: {
        engagement: null as null | Record<string, unknown>,
        clientConnector: 'client-conn' as string | null,
        members: [] as { userId: string; role: string }[],
        agents: new Set<string>(),
    },
    adapter: {
        getEngagementFolderIds: vi.fn(),
        downgradeFolderUserPermissionToReader: vi.fn(),
        upgradeFolderUserPermissionToEditor: vi.fn(),
    },
}))

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/ai/agent-email', () => ({ withoutAgentIds: async (ids: string[]) => ids.filter((id) => !st.agents.has(id)) }))
vi.mock('@/lib/connectors/registry', () => ({ getPermissionAdapter: async () => adapter }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagement: {
            findFirst: async () => st.engagement,
            findUnique: async () => ({ firmId: 'f1', client: { connectorId: st.clientConnector } }),
        },
        firm: { findUnique: async () => ({ connectorId: 'firm-legacy-conn' }) },
        engagementMember: { findMany: async () => st.members },
        $queryRaw: async () => st.members.map((m) => ({ id: m.userId, email: `${m.userId}@firm.test` })),
    },
}))

import { setFirmFolderAccess } from './firm-folder-access'

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
})

describe('when an engagement is completed', () => {
    it("drops firm members to read on its folders, through the client's connector", async () => {
        st.engagement = engagement('COMPLETED')
        expect(await setFirmFolderAccess('p', 'read_only')).toEqual({ changed: 4, failed: 0 })
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

    it('counts what Drive refused, and carries on', async () => {
        st.engagement = engagement('COMPLETED')
        adapter.downgradeFolderUserPermissionToReader.mockResolvedValueOnce(false)
        adapter.downgradeFolderUserPermissionToReader.mockRejectedValueOnce(new Error('Drive down'))
        expect(await setFirmFolderAccess('p', 'read_only')).toEqual({ changed: 2, failed: 2 })
    })
})

describe('when an engagement is reopened', () => {
    it('gives a lead write on General and Confidential, and a member on General only', async () => {
        st.engagement = engagement('ACTIVE')
        expect(await setFirmFolderAccess('p', 'restore')).toEqual({ changed: 3, failed: 0 })
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
