import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prisma, auth, perms, ctx } = vi.hoisted(() => ({
    prisma: {
        engagementWikiPage: {
            findMany: vi.fn(async (): Promise<any[]> => []),
            findUnique: vi.fn(),
            findFirst: vi.fn(async () => null),
            create: vi.fn(async (args: any) => ({ id: 'new', ...args.data })),
            update: vi.fn(async () => ({})),
            delete: vi.fn(async () => ({})),
            deleteMany: vi.fn(async () => ({})),
        },
        engagement: { findUnique: vi.fn(async () => ({ clientId: 'c1', connectorRootFolderId: 'root' })) },
        connector: { findUnique: vi.fn(async () => ({ type: 'GOOGLE_DRIVE' })) },
    },
    auth: { user: { id: 'u1' } as { id: string } | null },
    perms: { internal: true, edit: true },
    ctx: { value: { firmId: 'firm-real', orgId: 'firm-real', clientId: 'c1', projectId: 'e1' } as any },
}))
vi.mock('@/lib/prisma', () => ({ prisma }))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: auth.user } }) } }) }))
vi.mock('@/lib/resolve-project-context', () => ({ resolveProjectContext: vi.fn(async () => ctx.value) }))
vi.mock('@/lib/permission-helpers', () => ({
    canViewProjectInternalTabs: vi.fn(async () => perms.internal),
    canEditProject: vi.fn(async () => perms.edit),
}))
vi.mock('@/lib/google-drive-connector', () => ({ googleDriveConnector: { ensureFolderPath: vi.fn(async () => 'folder-1'), patchFileProperties: vi.fn() } }))
vi.mock('@/lib/connectors/resolve-client-connector', () => ({ resolveClientConnector: vi.fn(async () => ({ connectorId: 'conn-1' })) }))
vi.mock('@/lib/connectors/registry', () => ({ getContentAdapter: vi.fn(async () => null), getPermissionAdapter: vi.fn(async () => null) }))
vi.mock('@/lib/connectors/adapters/onedrive-file-ops', () => ({ ensureOneDriveFolderPath: vi.fn(), renameOneDriveFile: vi.fn() }))

import { getWikiPages, getWikiPageContent, createWikiPage, updateWikiPage, deleteWikiPage, reorderPages } from './engagement-wiki'

beforeEach(() => {
    vi.clearAllMocks()
    auth.user = { id: 'u1' }
    perms.internal = true
    perms.edit = true
    ctx.value = { firmId: 'firm-real', orgId: 'firm-real', clientId: 'c1', projectId: 'e1' }
    prisma.engagementWikiPage.findUnique.mockResolvedValue({ engagementId: 'e1', driveFileId: null, parentId: null, title: 'T', children: [], engagement: { firm: { connectorId: null } } })
})

describe('engagement wiki actions — Dossier is internal-only', () => {
    it('refuses signed-out callers', async () => {
        auth.user = null
        await expect(getWikiPages('e1')).rejects.toThrow('Unauthorized')
        await expect(updateWikiPage('p1', { title: 'x' })).rejects.toThrow('Unauthorized')
        expect(prisma.engagementWikiPage.update).not.toHaveBeenCalled()
    })

    it('refuses external (EC/EV) members — no internal-tab access — for reads', async () => {
        perms.internal = false
        await expect(getWikiPages('e1')).rejects.toThrow('Unauthorized')
        await expect(getWikiPageContent('p1')).rejects.toThrow('Unauthorized')
        expect(prisma.engagementWikiPage.findMany).not.toHaveBeenCalled()
    })

    it('lets internal members read', async () => {
        await expect(getWikiPages('e1')).resolves.toEqual([])
    })

    it('requires edit rights to change anything', async () => {
        perms.edit = false
        await expect(createWikiPage('e1', 'firm-real', { title: 'S' })).rejects.toThrow('Unauthorized')
        await expect(updateWikiPage('p1', { content: 'x' })).rejects.toThrow('Unauthorized')
        await expect(deleteWikiPage('p1')).rejects.toThrow('Unauthorized')
        expect(prisma.engagementWikiPage.create).not.toHaveBeenCalled()
        expect(prisma.engagementWikiPage.delete).not.toHaveBeenCalled()
    })

    it('checks the page\'s own engagement, not one the caller names', async () => {
        await updateWikiPage('p1', { title: 'Renamed' })
        const { resolveProjectContext } = await import('@/lib/resolve-project-context')
        expect(resolveProjectContext).toHaveBeenCalledWith('e1')
    })

    it('takes the firm from the engagement, ignoring the caller\'s firmId', async () => {
        await createWikiPage('e1', 'firm-forged', { title: 'Section' })
        expect(prisma.engagementWikiPage.create.mock.calls[0][0].data).toMatchObject({ firmId: 'firm-real', createdBy: 'u1' })
    })

    it('refuses a parent section from another engagement', async () => {
        prisma.engagementWikiPage.findUnique.mockResolvedValueOnce({ engagementId: 'e-other' })
        await expect(createWikiPage('e1', 'firm-real', { title: 'Page', parentId: 'sec-other' })).rejects.toThrow('Parent section not found')
    })

    it('reorders only pages that all belong to one editable engagement', async () => {
        prisma.engagementWikiPage.findMany.mockResolvedValueOnce([{ engagementId: 'e1' }, { engagementId: 'e2' }])
        await expect(reorderPages(['p1', 'p2'])).rejects.toThrow('Unauthorized')
        prisma.engagementWikiPage.findMany.mockResolvedValueOnce([{ engagementId: 'e1' }])
        await expect(reorderPages(['p1', 'p-unknown'])).rejects.toThrow('Unauthorized')
        expect(prisma.engagementWikiPage.update).not.toHaveBeenCalled()

        prisma.engagementWikiPage.findMany.mockResolvedValueOnce([{ engagementId: 'e1' }, { engagementId: 'e1' }])
        await reorderPages(['p1', 'p2'])
        expect(prisma.engagementWikiPage.update).toHaveBeenCalledTimes(2)
    })
})
