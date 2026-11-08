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
vi.mock('@/lib/engagement-access', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/engagement-access')>()),
    assertEngagementNotCompleted: async () => {},
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
const adapters = vi.hoisted(() => ({
    content: null as null | { getRenderableContent: ReturnType<typeof vi.fn>; overwriteFileContent: ReturnType<typeof vi.fn>; createFile: ReturnType<typeof vi.fn> },
    permission: null as null | { trashFile: ReturnType<typeof vi.fn> },
}))
vi.mock('@/lib/connectors/registry', () => ({
    getContentAdapter: vi.fn(async () => adapters.content),
    getPermissionAdapter: vi.fn(async () => adapters.permission),
}))
vi.mock('@/lib/connectors/adapters/onedrive-file-ops', () => ({ ensureOneDriveFolderPath: vi.fn(), renameOneDriveFile: vi.fn() }))

import { getWikiPages, getWikiPageContent, createWikiPage, updateWikiPage, deleteWikiPage, reorderPages } from './engagement-wiki'

beforeEach(() => {
    vi.clearAllMocks()
    auth.user = { id: 'u1' }
    perms.internal = true
    perms.edit = true
    ctx.value = { firmId: 'firm-real', orgId: 'firm-real', clientId: 'c1', projectId: 'e1' }
    adapters.content = null
    adapters.permission = null
    prisma.engagementWikiPage.findUnique.mockResolvedValue({ engagementId: 'e1', driveFileId: null, parentId: null, title: 'T', children: [], engagement: { firm: { connectorId: null } } })
})

const refused = (code: string) => expect.objectContaining({ ok: false, code })

describe('engagement wiki actions — Dossier is internal-only', () => {
    it('refuses signed-out callers', async () => {
        auth.user = null
        expect(await getWikiPages('e1')).toEqual(refused('unauthorized'))
        expect(await updateWikiPage('p1', { title: 'x' })).toEqual(refused('unauthorized'))
        expect(prisma.engagementWikiPage.update).not.toHaveBeenCalled()
    })

    it('refuses external (EC/EV) members — no internal-tab access — for reads', async () => {
        perms.internal = false
        expect(await getWikiPages('e1')).toEqual(refused('forbidden'))
        expect(await getWikiPageContent('p1')).toEqual(refused('forbidden'))
        expect(prisma.engagementWikiPage.findMany).not.toHaveBeenCalled()
    })

    it('lets internal members read', async () => {
        expect(await getWikiPages('e1')).toEqual({ ok: true, data: [] })
    })

    it('requires edit rights to change anything', async () => {
        perms.edit = false
        expect(await createWikiPage('e1', 'firm-real', { title: 'S' })).toEqual(refused('forbidden'))
        expect(await updateWikiPage('p1', { content: 'x' })).toEqual(refused('forbidden'))
        expect(await deleteWikiPage('p1')).toEqual(refused('forbidden'))
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
        expect(await createWikiPage('e1', 'firm-real', { title: 'Page', parentId: 'sec-other' })).toEqual(refused('not_found'))
    })

    it('reorders only pages that all belong to one editable engagement', async () => {
        prisma.engagementWikiPage.findMany.mockResolvedValueOnce([{ engagementId: 'e1' }, { engagementId: 'e2' }])
        expect(await reorderPages(['p1', 'p2'])).toEqual(refused('forbidden'))
        prisma.engagementWikiPage.findMany.mockResolvedValueOnce([{ engagementId: 'e1' }])
        expect(await reorderPages(['p1', 'p-unknown'])).toEqual(refused('forbidden'))
        expect(prisma.engagementWikiPage.update).not.toHaveBeenCalled()

        prisma.engagementWikiPage.findMany.mockResolvedValueOnce([{ engagementId: 'e1' }, { engagementId: 'e1' }])
        await reorderPages(['p1', 'p2'])
        expect(prisma.engagementWikiPage.update).toHaveBeenCalledTimes(2)
    })
})

describe("the Dossier reads and writes through the engagement's connector (DO-1)", () => {
    const page = { engagementId: 'e1', driveFileId: 'file-1', parentId: 'sec-1', title: 'Notes', children: [] }

    function contentAdapter() {
        adapters.content = {
            getRenderableContent: vi.fn(async () => ({ stream: Buffer.from('# Real page', 'utf-8') })),
            overwriteFileContent: vi.fn(async () => undefined),
            createFile: vi.fn(async () => ({ id: 'file-new' })),
        }
        return adapters.content
    }

    it('reads a page with its client\'s connector, even when the firm has no legacy connectorId', async () => {
        prisma.engagementWikiPage.findUnique.mockResolvedValue({ ...page, engagement: { firm: { connectorId: null } } })
        const content = contentAdapter()
        expect(await getWikiPageContent('p1')).toEqual({ ok: true, data: '# Real page' })
        expect(content.getRenderableContent).toHaveBeenCalledWith('conn-1', 'file-1', 'native')
    })

    it('writes a save to storage with the same connector', async () => {
        prisma.engagementWikiPage.findUnique.mockResolvedValue(page)
        const content = contentAdapter()
        expect(await updateWikiPage('p1', { content: 'new words' })).toMatchObject({ ok: true })
        expect(content.overwriteFileContent).toHaveBeenCalledWith('conn-1', 'file-1', Buffer.from('new words', 'utf-8'), 'text/plain')
    })

    it('says a save failed, rather than "Saved", when storage refuses the write', async () => {
        prisma.engagementWikiPage.findUnique.mockResolvedValue(page)
        const { storageFailure } = await import('@/lib/connectors/storage-failure')
        contentAdapter().overwriteFileContent.mockRejectedValueOnce(storageFailure('locked', 'Google Drive'))
        const result = await updateWikiPage('p1', { content: 'new words' })
        expect(result).toMatchObject({ ok: false, code: 'locked' })
        expect(prisma.engagementWikiPage.update).not.toHaveBeenCalled()
    })

    it('says a save failed when the client has no storage, instead of writing nothing', async () => {
        prisma.engagementWikiPage.findUnique.mockResolvedValue(page)
        const { resolveClientConnector } = await import('@/lib/connectors/resolve-client-connector')
        vi.mocked(resolveClientConnector).mockResolvedValueOnce({ connectorId: null } as never)
        expect(await updateWikiPage('p1', { content: 'x' })).toEqual(refused('no_connector'))
    })
})

describe('a Dossier load that fails is a failure, never an empty page (DO-2)', () => {
    it('answers the reason when storage refuses the read', async () => {
        prisma.engagementWikiPage.findUnique.mockResolvedValue({ engagementId: 'e1', driveFileId: 'file-1', parentId: 'sec-1', title: 'Notes' })
        const { storageFailure } = await import('@/lib/connectors/storage-failure')
        adapters.content = {
            getRenderableContent: vi.fn(async () => { throw storageFailure('reconnect', 'Google Drive') }),
            overwriteFileContent: vi.fn(),
            createFile: vi.fn(),
        }
        const result = await getWikiPageContent('p1')
        expect(result.ok).toBe(false)
        expect(result).not.toEqual({ ok: true, data: '' })
    })

    it('answers the reason when the connector can\'t be read from', async () => {
        prisma.engagementWikiPage.findUnique.mockResolvedValue({ engagementId: 'e1', driveFileId: 'file-1', parentId: 'sec-1', title: 'Notes' })
        expect(await getWikiPageContent('p1')).toEqual(refused('no_adapter'))
    })

    it('a page with no file yet is genuinely empty', async () => {
        prisma.engagementWikiPage.findUnique.mockResolvedValue({ engagementId: 'e1', driveFileId: null, parentId: 'sec-1', title: 'New Page' })
        expect(await getWikiPageContent('p1')).toEqual({ ok: true, data: '' })
    })
})

describe('rename and delete say what storage kept (P2-61)', () => {
    it('renames in Firma and warns when storage refuses the rename', async () => {
        prisma.engagementWikiPage.findUnique.mockResolvedValue({ engagementId: 'e1', driveFileId: 'file-1', parentId: 'sec-1', title: 'Old' })
        const { googleDriveConnector } = await import('@/lib/google-drive-connector')
        vi.mocked(googleDriveConnector.patchFileProperties).mockRejectedValueOnce(new Error('403'))
        const result = await updateWikiPage('p1', { title: 'New' })
        expect(result).toMatchObject({ ok: true, warning: 'Renamed here, but not in Google Drive.' })
        expect(prisma.engagementWikiPage.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ title: 'New' }) }))
    })

    it('deletes here and warns when storage keeps the file', async () => {
        prisma.engagementWikiPage.findUnique
            .mockResolvedValueOnce({ engagementId: 'e1' })
            .mockResolvedValueOnce({ parentId: 'sec-1', driveFileId: 'file-1', children: [] })
        adapters.permission = { trashFile: vi.fn(async () => { throw new Error('locked') }) }
        const result = await deleteWikiPage('p1')
        expect(result).toEqual({ ok: true, data: undefined, warning: 'Deleted here, but the file is still in Google Drive.' })
        expect(prisma.engagementWikiPage.delete).toHaveBeenCalledWith({ where: { id: 'p1' } })
    })

    it('deletes quietly when storage trashed the file', async () => {
        prisma.engagementWikiPage.findUnique
            .mockResolvedValueOnce({ engagementId: 'e1' })
            .mockResolvedValueOnce({ parentId: 'sec-1', driveFileId: 'file-1', children: [] })
        adapters.permission = { trashFile: vi.fn(async () => undefined) }
        expect(await deleteWikiPage('p1')).toEqual({ ok: true, data: undefined })
    })
})
