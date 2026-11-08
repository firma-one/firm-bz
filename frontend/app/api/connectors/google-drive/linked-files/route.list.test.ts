import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// The Files listing (linked-files POST `list`): scoped to one engagement the caller may view, on that
// engagement's own connector, and a OneDrive connector's tokens never reach Google. Every
// dependency is stubbed: nothing reaches a database, Supabase or a drive.

const { state, drive, oneDrive, permission, adapter } = vi.hoisted(() => ({
    state: {
        user: { id: 'u1', email: 'u1@firm.test' } as { id: string; email: string } | null,
        engagement: null as any,
        canView: true,
        guestRows: [] as any[],
    },
    drive: {
        listFiles: vi.fn(async () => []),
        getFileMetadata: vi.fn(async () => null),
        renameFile: vi.fn(),
        copyFile: vi.fn(),
        moveFile: vi.fn(),
        trashFileWithReason: vi.fn(),
        getAccessToken: vi.fn(),
        recursiveCopy: vi.fn(),
        getProjectFolderIds: vi.fn(async () => ({ generalFolderId: 'G', confidentialFolderId: 'C', stagingFolderId: null })),
    },
    oneDrive: {
        renameOneDriveFile: vi.fn(),
        copyOneDriveFile: vi.fn(),
        moveOneDriveFile: vi.fn(),
        recursiveCopyOneDrive: vi.fn(),
        ensureOneDriveFolderPath: vi.fn(),
        listOneDriveFiles: vi.fn(async () => []),
        getOneDriveItemActivity: vi.fn(async () => ({ owners: null, lastModifyingUser: null, modifiedTime: '2026-11-01T00:00:00Z' })),
    },
    adapter: {
        getEngagementFolderIds: async () => ({ generalFolderId: 'G', confidentialFolderId: 'C', stagingFolderId: null }),
        getFileMetadata: vi.fn(async () => ({ name: 'Plan.docx', parents: ['P'] })),
        deleteFile: vi.fn(),
    },
    permission: { checkProjectPermissionForUser: vi.fn(async () => state.canView) },
}))

vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagement: { findFirst: vi.fn(async () => state.engagement) },
        engagementMember: { findMany: vi.fn(async () => []) },
        engagementDocument: {
            findMany: vi.fn(async (args: any) => (args?.where?.sharingUsers?.some?.sharingPermissionStatus === 'PENDING' ? [] : state.guestRows)),
            updateMany: vi.fn(async () => ({})),
            findFirst: vi.fn(async () => null),
        },
    },
}))
vi.mock('@/lib/google-drive-connector', () => ({ googleDriveConnector: drive, GoogleDriveAuthError: class extends Error {} }))
vi.mock('@/lib/connectors/adapters/onedrive-list-files', () => oneDrive)
vi.mock('@/lib/permission-helpers', () => ({ ...permission, canAccessRbacAdmin: vi.fn(async () => false), canManageProject: vi.fn(async () => true) }))
vi.mock('@/lib/connectors/registry', () => ({
    getPermissionAdapter: vi.fn(async () => adapter),
    getStorageAdapter: vi.fn(),
    getContentAdapter: vi.fn(),
}))
vi.mock('@/lib/connectors/connector-access', () => ({ getManageableConnector: vi.fn(), getRequestUser: vi.fn(async () => state.user) }))
vi.mock('@/lib/view-as-server', () => ({ getViewAsPersonaFromCookie: vi.fn(async () => null) }))
vi.mock('@/lib/engagement-sharing-ids', () => ({
    getSharedAndAncestorIdsForPersona: vi.fn(async () => ({ sharedIds: ['D'], ancestorIds: [], parentMap: new Map(), privateIds: new Set<string>() })),
    isFolderUnderSharedFolderDB: vi.fn(() => false),
}))
vi.mock('@/lib/files/file-creator', () => ({ loadPeople: vi.fn(async () => new Map()), byEmail: () => new Map(), creatorOf: () => null, assigneeOf: () => ({ assigneeUserId: null, assignee: null }) }))
vi.mock('@/lib/doc-id', () => ({ assignDocId: vi.fn() }))
vi.mock('@/lib/inngest/client', () => ({ safeInngestSend: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
vi.mock('@/lib/audit', () => ({
    // A builder: audit().firm(...).engagement(...)...; every step hands back the same builder.
    audit: () => {
        const builder: any = new Proxy(() => {}, { get: (_t, k) => (k === 'then' ? undefined : () => builder) })
        return builder
    },
    AUDIT_EVENT: new Proxy({}, { get: (_t, k) => k }),
    AUDIT_SCOPE: new Proxy({}, { get: (_t, k) => k }),
}))
vi.mock('@/lib/engagement-access', () => ({ blockIfEngagementFileMutationForbidden: vi.fn() }))
vi.mock('@/lib/connectors/resolve-client-connector', () => ({ resolveEngagementConnector: vi.fn() }))
vi.mock('@/lib/services/indexing-interceptor', () => ({ IndexingInterceptor: { indexBatch: vi.fn() } }))
vi.mock('@/lib/sharing-settings', () => ({ getLock: () => null, isDocumentPrivate: () => false, buildSettingsForDb: vi.fn() }))
vi.mock('@/lib/files/blocked', () => ({ blockedOf: () => null }))
vi.mock('@/lib/files/description', () => ({ descriptionOf: () => null }))
vi.mock('@/lib/files/native-description', () => ({ reconcileNativeDescriptions: vi.fn() }))
vi.mock('@/lib/services/search-service', () => ({ SearchService: {} }))
vi.mock('@/lib/billing/effective-billing-caps', () => ({ assertWithinDocumentCap: vi.fn() }))
vi.mock('@/lib/connectors/adapters/onedrive-file-ops', () => ({
    renameOneDriveFile: oneDrive.renameOneDriveFile,
    copyOneDriveFile: oneDrive.copyOneDriveFile,
    moveOneDriveFile: oneDrive.moveOneDriveFile,
    recursiveCopyOneDrive: oneDrive.recursiveCopyOneDrive,
    ensureOneDriveFolderPath: oneDrive.ensureOneDriveFolderPath,
}))
vi.mock('@/lib/auth/display-name', () => ({ resolveDisplayName: () => 'Name' }))

import { POST } from './route'
import { storageFailure } from '@/lib/connectors/storage-failure'
import { safeInngestSend } from '@/lib/inngest/client'

const list = (body: Record<string, unknown>) => POST(new NextRequest(new URL('/api/connectors/google-drive/linked-files', 'http://localhost'), {
    method: 'POST',
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'list', folderId: 'F', ...body }),
}))

const engagementOn = (type: 'GOOGLE_DRIVE' | 'ONEDRIVE', role: string | null) => ({
    id: 'e1', slug: 'eng', name: 'Eng', clientId: 'c1', firmId: 'f1', connectorRootFolderId: 'R',
    client: { slug: 'cli', name: 'Client', connector: { id: 'conn1', type, accessToken: '' } },
    members: role ? [{ role }] : [],
})

beforeEach(() => {
    vi.clearAllMocks()
    state.user = { id: 'u1', email: 'u1@firm.test' }
    state.engagement = engagementOn('ONEDRIVE', 'eng_member')
    state.canView = true
    state.guestRows = []
})

describe('linked-files list — access', () => {
    it('refuses a list with no engagement, and never falls back to another connector', async () => {
        expect((await list({})).status).toBe(400)
        expect(oneDrive.listOneDriveFiles).not.toHaveBeenCalled()
        expect(drive.listFiles).not.toHaveBeenCalled()
    })

    it('answers not found for an engagement the caller may not view, without touching the drive', async () => {
        state.canView = false
        expect((await list({ projectId: 'e1' })).status).toBe(404)
        expect(permission.checkProjectPermissionForUser).toHaveBeenCalledWith('u1', 'f1', 'c1', 'e1', 'project', 'can_view')
        expect(oneDrive.listOneDriveFiles).not.toHaveBeenCalled()
    })

    it('answers not found for a missing engagement', async () => {
        state.engagement = null
        expect((await list({ projectId: 'nope' })).status).toBe(404)
        expect(oneDrive.listOneDriveFiles).not.toHaveBeenCalled()
    })

    it('lists a viewable engagement on its own connector, with the caller\'s engagement role', async () => {
        expect((await list({ projectId: 'e1' })).status).toBe(200)
        expect(oneDrive.listOneDriveFiles).toHaveBeenCalledWith('conn1', 'F', 100, expect.objectContaining({ projectId: 'e1', personaSlug: 'eng_member', generalFolderId: 'G', confidentialFolderId: 'C' }))
    })

    it('refuses signed out', async () => {
        state.user = null
        expect((await list({ projectId: 'e1' })).status).toBe(401)
    })
})

describe('linked-files list — a folder that is gone or refused', () => {
    it('says the folder is no longer available, rather than listing it as empty', async () => {
        const { folderGoneFailure } = await import('@/lib/connectors/folder-gone')
        oneDrive.listOneDriveFiles.mockRejectedValueOnce(folderGoneFailure('OneDrive'))
        const res = await list({ projectId: 'e1' })
        expect(res.status).toBe(404)
        expect(await res.json()).toEqual({
            error: 'This folder is no longer available in OneDrive. It may have been moved or deleted there.',
            code: 'not_found',
        })
    })

    it('asks Google for that answer too, and passes on its refusal words', async () => {
        state.engagement = engagementOn('GOOGLE_DRIVE', 'eng_admin')
        drive.listFiles.mockRejectedValueOnce(storageFailure('busy', 'Google Drive'))
        const res = await list({ projectId: 'e1' })
        expect(drive.listFiles).toHaveBeenCalledWith('conn1', 'F', 100, 'u1@firm.test', expect.anything(), { missingFolder: 'throw' })
        expect(res.status).toBe(503)
        expect((await res.json()).code).toBe('busy')
    })
})

describe('linked-files list — guests on OneDrive', () => {
    it('fills a row\'s missing details from Graph, never from Google', async () => {
        state.engagement = engagementOn('ONEDRIVE', 'eng_viewer')
        state.guestRows = [{ id: 'd1', externalId: 'D1', fileName: 'a.pdf', isFolder: false, metadata: {}, settings: {}, createdBy: null }]
        const res = await list({ projectId: 'e1' })
        expect(res.status).toBe(200)
        expect(oneDrive.getOneDriveItemActivity).toHaveBeenCalledWith('conn1', 'D1')
        expect(drive.getFileMetadata).not.toHaveBeenCalled()
        expect((await res.json()).files[0].modifiedTime).toBe('2026-11-01T00:00:00Z')
    })

    it("leaves out what's private to the firm", async () => {
        const { getSharedAndAncestorIdsForPersona } = await import('@/lib/engagement-sharing-ids')
        vi.mocked(getSharedAndAncestorIdsForPersona).mockResolvedValueOnce({ sharedIds: ['D'], ancestorIds: [], descendantIds: [], parentMap: new Map(), privateIds: new Set(['D2']) })
        state.engagement = engagementOn('ONEDRIVE', 'eng_viewer')
        state.guestRows = [
            { id: 'd1', externalId: 'D1', fileName: 'a.pdf', isFolder: false, metadata: {}, settings: {}, createdBy: null },
            { id: 'd2', externalId: 'D2', fileName: 'secret.pdf', isFolder: false, metadata: {}, settings: {}, createdBy: null },
        ]
        const res = await list({ projectId: 'e1' })
        expect((await res.json()).files.map((f: { name: string }) => f.name)).toEqual(['a.pdf'])
    })

    it('still uses Google for a Google Drive engagement', async () => {
        state.engagement = engagementOn('GOOGLE_DRIVE', 'eng_viewer')
        state.guestRows = [{ id: 'd1', externalId: 'D1', fileName: 'a.pdf', isFolder: false, metadata: {}, settings: {}, createdBy: null }]
        await list({ projectId: 'e1' })
        expect(drive.getFileMetadata).toHaveBeenCalledWith('conn1', 'D1')
        expect(oneDrive.getOneDriveItemActivity).not.toHaveBeenCalled()
    })
})

describe('linked-files rename', () => {
    const rename = () => list({ action: 'rename', projectId: 'e1', fileId: 'F1', name: 'New.docx' })
    const connectedTo = async (type: string) => {
        const { resolveEngagementConnector } = await import('@/lib/connectors/resolve-client-connector')
        vi.mocked(resolveEngagementConnector).mockResolvedValueOnce({ id: 'conn1', type } as never)
    }

    it('says why when OneDrive refuses, so the toast can', async () => {
        await connectedTo('ONEDRIVE')
        oneDrive.renameOneDriveFile.mockRejectedValueOnce(storageFailure('locked', 'OneDrive'))
        const res = await rename()
        expect(res.status).toBe(409)
        expect(await res.json()).toEqual({
            error: 'OneDrive has this locked, usually because a file is open in Word, Excel or another app. Close it everywhere, then try again. It can take a minute to unlock.',
            code: 'locked',
        })
    })

    it('says why when Google Drive refuses', async () => {
        await connectedTo('GOOGLE_DRIVE')
        drive.renameFile.mockRejectedValueOnce(storageFailure('no_permission', 'Google Drive'))
        const res = await rename()
        expect(res.status).toBe(403)
        expect((await res.json()).code).toBe('no_permission')
    })
})

describe('linked-files duplicate, copy and move', () => {
    const act = (action: string, extra: Record<string, unknown>) => list({ action, projectId: 'e1', fileId: 'F1', ...extra })
    const connectedTo = async (type: string) => {
        const { resolveEngagementConnector } = await import('@/lib/connectors/resolve-client-connector')
        vi.mocked(resolveEngagementConnector).mockResolvedValueOnce({ id: 'conn1', type } as never)
    }
    const ACTIONS: [string, Record<string, unknown>, 'copy' | 'move'][] = [
        ['duplicate', {}, 'copy'],
        ['copy', { destinationFolderId: 'D' }, 'copy'],
        ['move', { destinationFolderId: 'D' }, 'move'],
        ['move-tree', { targetRoot: 'general' }, 'move'],
        ['cross-engagement-copy', { targetEngagementId: 'e2' }, 'copy'],
        ['cross-engagement-move', { targetEngagementId: 'e2' }, 'move'],
    ]

    describe.each([
        ['ONEDRIVE', 'OneDrive', { copy: oneDrive.copyOneDriveFile, move: oneDrive.moveOneDriveFile }],
        ['GOOGLE_DRIVE', 'Google Drive', { copy: drive.copyFile, move: drive.moveFile }],
    ] as const)('on %s', (type, provider, calls) => {
        it.each(ACTIONS)('%s answers why when the storage refuses, and indexes nothing', async (action, extra, kind) => {
            await connectedTo(type)
            if (action.startsWith('cross-engagement') && type === 'GOOGLE_DRIVE') drive.getFileMetadata.mockResolvedValueOnce({ name: 'Plan.docx' } as never)
            const failure = storageFailure('locked', provider)
            calls[kind].mockRejectedValueOnce(failure)
            const res = await act(action, extra)
            expect(res.status).toBe(failure.status)
            expect(await res.json()).toEqual({ error: failure.message, code: 'locked' })
            expect(safeInngestSend).not.toHaveBeenCalled()
        })

        it.each(ACTIONS)('%s still works when the storage agrees', async (action, extra, kind) => {
            await connectedTo(type)
            // Another engagement's copy is named from the item's own details.
            if (action.startsWith('cross-engagement') && type === 'GOOGLE_DRIVE') drive.getFileMetadata.mockResolvedValueOnce({ name: 'Plan.docx' } as never)
            calls[kind].mockResolvedValueOnce({ id: 'NEW' })
            const res = await act(action, extra)
            expect(res.status).toBe(200)
            expect((await res.json()).success).toBe(true)
        })
    })

    describe('copying a folder to another engagement', () => {
        const FOLDER = { name: 'Reports', mimeType: 'application/vnd.google-apps.folder' }
        const copyFolder = () => act('cross-engagement-copy', { targetEngagementId: 'e2' })

        it('asks to reconnect when Google gives no token, rather than "failed to copy folder"', async () => {
            await connectedTo('GOOGLE_DRIVE')
            drive.getFileMetadata.mockResolvedValueOnce(FOLDER as never)
            drive.getAccessToken.mockResolvedValueOnce(null)
            const res = await copyFolder()
            expect(res.status).toBe(502)
            expect((await res.json()).code).toBe('reconnect')
            expect(drive.recursiveCopy).not.toHaveBeenCalled()
        })

        it('says so when nothing in the folder could be copied, naming what and why', async () => {
            await connectedTo('GOOGLE_DRIVE')
            drive.getFileMetadata.mockResolvedValueOnce(FOLDER as never)
            drive.getAccessToken.mockResolvedValueOnce('token')
            drive.recursiveCopy.mockResolvedValueOnce({
                copied: [{ id: 'NF', name: 'Reports', originalId: 'F1', isFolder: true }],
                failed: [{ name: 'Budget.xlsx', reason: 'Google Drive has this locked.' }],
                filesTotal: 1, filesCopied: 0,
            })
            const res = await copyFolder()
            expect(res.status).toBe(502)
            expect(await res.json()).toMatchObject({
                error: 'Nothing in Reports was copied. Budget.xlsx · Google Drive has this locked.',
                code: 'nothing_copied',
                filesTotal: 1,
            })
        })

        it('keeps what copied and answers X of Y with what was not copied', async () => {
            await connectedTo('GOOGLE_DRIVE')
            drive.getFileMetadata.mockResolvedValueOnce(FOLDER as never)
            drive.getAccessToken.mockResolvedValueOnce('token')
            drive.recursiveCopy.mockResolvedValueOnce({
                copied: [{ id: 'NF', name: 'Reports', originalId: 'F1', isFolder: true }, { id: 'N2', name: 'Q3.pdf', originalId: 'x', isFolder: false }],
                failed: [{ name: 'Budget.xlsx', reason: 'Google Drive has this locked.' }],
                filesTotal: 2, filesCopied: 1,
            })
            const res = await copyFolder()
            expect(res.status).toBe(200)
            expect(await res.json()).toMatchObject({ success: true, filesCopied: 1, filesTotal: 2, failed: [{ name: 'Budget.xlsx' }] })
        })

        it("stops with the reason when the item's details can't be read, rather than naming the copy by its id", async () => {
            await connectedTo('GOOGLE_DRIVE')
            drive.getFileMetadata.mockResolvedValueOnce(null)
            const res = await copyFolder()
            expect(res.status).toBe(502)
            expect((await res.json()).error).toContain("wouldn't show this item's details")
            expect(drive.copyFile).not.toHaveBeenCalled()
        })

        it("answers OneDrive's reason", async () => {
            await connectedTo('ONEDRIVE')
            adapter.getFileMetadata.mockResolvedValueOnce(FOLDER as never)
            oneDrive.recursiveCopyOneDrive.mockRejectedValueOnce(storageFailure('no_permission', 'OneDrive'))
            const res = await copyFolder()
            expect(res.status).toBe(403)
            expect((await res.json()).code).toBe('no_permission')
        })
    })

    describe('replacing a file of the same name', () => {
        const replace = () => act('copy', { destinationFolderId: 'D', keepBoth: false })

        it("gives Google Drive's reason and copies nothing when the old file can't go", async () => {
            await connectedTo('GOOGLE_DRIVE')
            drive.getFileMetadata.mockResolvedValueOnce({ name: 'Plan.docx' } as never)
            drive.listFiles.mockResolvedValueOnce([{ id: 'S', name: 'Plan.docx' }] as never)
            drive.trashFileWithReason.mockRejectedValueOnce(storageFailure('no_permission', 'Google Drive'))
            const res = await replace()
            expect(res.status).toBe(403)
            expect((await res.json()).code).toBe('no_permission')
            expect(drive.copyFile).not.toHaveBeenCalled()
        })

        it("gives OneDrive's reason and copies nothing when the old file can't go", async () => {
            await connectedTo('ONEDRIVE')
            oneDrive.listOneDriveFiles.mockResolvedValueOnce([{ id: 'S', name: 'Plan.docx' }] as never)
            adapter.deleteFile.mockRejectedValueOnce(storageFailure('locked', 'OneDrive'))
            const res = await replace()
            expect(res.status).toBe(409)
            expect((await res.json()).code).toBe('locked')
            expect(oneDrive.copyOneDriveFile).not.toHaveBeenCalled()
        })
    })
})
