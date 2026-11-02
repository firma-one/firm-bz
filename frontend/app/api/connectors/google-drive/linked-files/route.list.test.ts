import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// The Files listing (linked-files POST `list`): scoped to one engagement the caller may view, on that
// engagement's own connector, and a OneDrive connector's tokens never reach Google. Every
// dependency is stubbed: nothing reaches a database, Supabase or a drive.

const { state, drive, oneDrive, permission } = vi.hoisted(() => ({
    state: {
        user: { id: 'u1', email: 'u1@firm.test' } as { id: string; email: string } | null,
        engagement: null as any,
        canView: true,
        guestRows: [] as any[],
    },
    drive: { listFiles: vi.fn(async () => []), getFileMetadata: vi.fn(async () => null) },
    oneDrive: { listOneDriveFiles: vi.fn(async () => []), getOneDriveItemActivity: vi.fn(async () => ({ owners: null, lastModifyingUser: null, modifiedTime: '2026-11-01T00:00:00Z' })) },
    permission: { checkProjectPermissionForUser: vi.fn(async () => state.canView) },
}))

vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagement: { findFirst: vi.fn(async () => state.engagement) },
        engagementMember: { findMany: vi.fn(async () => []) },
        engagementDocument: {
            findMany: vi.fn(async (args: any) => (args?.where?.sharingUsers?.some?.sharingPermissionStatus === 'PENDING' ? [] : state.guestRows)),
            updateMany: vi.fn(async () => ({})),
        },
    },
}))
vi.mock('@/lib/google-drive-connector', () => ({ googleDriveConnector: drive, GoogleDriveAuthError: class extends Error {} }))
vi.mock('@/lib/connectors/adapters/onedrive-list-files', () => oneDrive)
vi.mock('@/lib/permission-helpers', () => ({ ...permission, canAccessRbacAdmin: vi.fn(async () => false) }))
vi.mock('@/lib/connectors/registry', () => ({
    getPermissionAdapter: vi.fn(async () => ({ getEngagementFolderIds: async () => ({ generalFolderId: 'G', confidentialFolderId: 'C', stagingFolderId: null }) })),
    getStorageAdapter: vi.fn(),
    getContentAdapter: vi.fn(),
}))
vi.mock('@/lib/connectors/connector-access', () => ({ getManageableConnector: vi.fn(), getRequestUser: vi.fn(async () => state.user) }))
vi.mock('@/lib/view-as-server', () => ({ getViewAsPersonaFromCookie: vi.fn(async () => null) }))
vi.mock('@/lib/engagement-sharing-ids', () => ({
    getSharedAndAncestorIdsForPersona: vi.fn(async () => ({ sharedIds: ['D'], ancestorIds: [], parentMap: new Map() })),
    isFolderUnderSharedFolderDB: vi.fn(() => false),
}))
vi.mock('@/lib/files/file-creator', () => ({ loadPeople: vi.fn(async () => new Map()), byEmail: () => new Map(), creatorOf: () => null }))
vi.mock('@/lib/doc-id', () => ({ assignDocId: vi.fn() }))
vi.mock('@/lib/inngest/client', () => ({ safeInngestSend: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
vi.mock('@/lib/audit', () => ({ audit: vi.fn(), AUDIT_EVENT: {}, AUDIT_SCOPE: {} }))
vi.mock('@/lib/engagement-access', () => ({ blockIfEngagementFileMutationForbidden: vi.fn() }))
vi.mock('@/lib/connectors/resolve-client-connector', () => ({ resolveEngagementConnector: vi.fn() }))
vi.mock('@/lib/services/indexing-interceptor', () => ({ IndexingInterceptor: {} }))
vi.mock('@/lib/sharing-settings', () => ({ getLock: () => null, isDocumentPrivate: () => false, buildSettingsForDb: vi.fn() }))
vi.mock('@/lib/files/blocked', () => ({ blockedOf: () => null }))
vi.mock('@/lib/files/description', () => ({ descriptionOf: () => null }))
vi.mock('@/lib/files/native-description', () => ({ reconcileNativeDescriptions: vi.fn() }))
vi.mock('@/lib/services/search-service', () => ({ SearchService: {} }))
vi.mock('@/lib/billing/effective-billing-caps', () => ({ assertWithinDocumentCap: vi.fn() }))
vi.mock('@/lib/connectors/adapters/onedrive-file-ops', () => ({}))
vi.mock('@/lib/auth/display-name', () => ({ resolveDisplayName: () => 'Name' }))

import { POST } from './route'

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

    it('still uses Google for a Google Drive engagement', async () => {
        state.engagement = engagementOn('GOOGLE_DRIVE', 'eng_viewer')
        state.guestRows = [{ id: 'd1', externalId: 'D1', fileName: 'a.pdf', isFolder: false, metadata: {}, settings: {}, createdBy: null }]
        await list({ projectId: 'e1' })
        expect(drive.getFileMetadata).toHaveBeenCalledWith('conn1', 'D1')
        expect(oneDrive.getOneDriveItemActivity).not.toHaveBeenCalled()
    })
})
