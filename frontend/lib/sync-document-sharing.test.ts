import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DocumentSharingPermissionStatus } from '@prisma/client'
import { syncDocumentSharingUsers } from './sync-document-sharing'

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockGrantFolderPermission = vi.fn().mockResolvedValue('perm-new')
const mockRevokePermission = vi.fn().mockResolvedValue(true)

vi.mock('@/lib/connectors/registry', () => ({
  getPermissionAdapter: vi.fn().mockResolvedValue({
    grantFolderPermission: (...args: unknown[]) => mockGrantFolderPermission(...args),
    revokePermission: (...args: unknown[]) => mockRevokePermission(...args),
  }),
}))

const mockFindUnique = vi.fn()
const mockFindMany = vi.fn()
const mockQueryRawUnsafe = vi.fn()
const mockUpdateMany = vi.fn()
const mockUpdate = vi.fn()
const mockCreate = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    engagementDocument: { findUnique: (...a: unknown[]) => mockFindUnique(...a) },
    firm: { findUnique: (...a: unknown[]) => mockFindUnique(...a) },
    engagementMember: { findMany: (...a: unknown[]) => mockFindMany(...a) },
    engagementDocumentSharingUser: {
      updateMany: (...a: unknown[]) => mockUpdateMany(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
      create: (...a: unknown[]) => mockCreate(...a),
    },
    $queryRawUnsafe: (...a: unknown[]) => mockQueryRawUnsafe(...a),
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}))

// ── Helpers ────────────────────────────────────────────────────────────────

function makeDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    engagementId: 'eng-1',
    externalId: 'drive-file-1',
    firmId: 'firm-1',
    connectorId: 'conn-1',
    fileName: 'Report.docx',
    settings: {},
    sharingUsers: [],
    ...overrides,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('syncDocumentSharingUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateMany.mockResolvedValue({ count: 0 })
    mockUpdate.mockResolvedValue({})
    mockCreate.mockResolvedValue({})
    mockFindMany.mockResolvedValue([])
    mockQueryRawUnsafe.mockResolvedValue([])
  })

  it('returns early without error when document is not found', async () => {
    mockFindUnique.mockResolvedValue(null)
    await expect(syncDocumentSharingUsers('doc-missing')).resolves.toBeUndefined()
  })

  it('returns early without error when no connectorId can be resolved', async () => {
    mockFindUnique
      .mockResolvedValueOnce(makeDoc({ connectorId: null, firmId: 'firm-1' }))
      .mockResolvedValueOnce({ connectorId: null }) // firm lookup
    await syncDocumentSharingUsers('doc-1')
    expect(mockGrantFolderPermission).not.toHaveBeenCalled()
  })

  // ── EC sharing disabled ──────────────────────────────────────────────────

  describe('when externalCollaborator sharing is disabled', () => {
    it('revokes outstanding permissions and marks them REVOKED in DB', async () => {
      const sharingUsers = [
        { id: 'su-1', userId: 'u-1', connectorPermissionId: 'perm-old', sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED },
      ]
      mockFindUnique.mockResolvedValue(makeDoc({ settings: { share: { externalCollaborator: { enabled: false } } }, sharingUsers }))

      await syncDocumentSharingUsers('doc-1')

      expect(mockRevokePermission).toHaveBeenCalledWith('conn-1', 'drive-file-1', 'perm-old')
      expect(mockUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { projectDocumentId: 'doc-1' },
        data: expect.objectContaining({
          sharingPermissionStatus: DocumentSharingPermissionStatus.REVOKED,
          connectorPermissionId: null,
        }),
      }))
    })

    it('skips revoke for sharing users with no connectorPermissionId', async () => {
      const sharingUsers = [
        { id: 'su-1', userId: 'u-1', connectorPermissionId: null, sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED },
      ]
      mockFindUnique.mockResolvedValue(makeDoc({ settings: { share: { externalCollaborator: { enabled: false } } }, sharingUsers }))

      await syncDocumentSharingUsers('doc-1')

      expect(mockRevokePermission).not.toHaveBeenCalled()
      expect(mockUpdateMany).toHaveBeenCalled() // DB still cleared
    })

    it('uses registry adapter, not googleDriveConnector directly', async () => {
      const { getPermissionAdapter } = await import('@/lib/connectors/registry')
      const sharingUsers = [
        { id: 'su-1', userId: 'u-1', connectorPermissionId: 'perm-old', sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED },
      ]
      mockFindUnique.mockResolvedValue(makeDoc({ settings: { share: { externalCollaborator: { enabled: false } } }, sharingUsers }))

      await syncDocumentSharingUsers('doc-1')

      expect(getPermissionAdapter).toHaveBeenCalledWith('conn-1')
    })
  })

  // ── EC sharing enabled ───────────────────────────────────────────────────

  describe('when externalCollaborator sharing is enabled', () => {
    beforeEach(() => {
      mockFindUnique.mockResolvedValue(makeDoc({
        settings: { share: { externalCollaborator: { enabled: true } } },
        sharingUsers: [],
      }))
    })

    it('grants permission to EC members and records connectorPermissionId', async () => {
      mockFindMany.mockResolvedValue([{ userId: 'u-ec-1', role: 'eng_ext_collaborator' }])
      mockQueryRawUnsafe.mockResolvedValue([{ id: 'u-ec-1', email: 'ec@external.com' }])

      await syncDocumentSharingUsers('doc-1')

      expect(mockGrantFolderPermission).toHaveBeenCalledWith('conn-1', 'drive-file-1', 'ec@external.com', 'writer')
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          connectorPermissionId: 'perm-new',
          sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED,
          email: 'ec@external.com',
        }),
      }))
    })

    it('skips users already with GRANTED status', async () => {
      const existingShare = {
        id: 'su-1', userId: 'u-ec-1',
        sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED,
        connectorPermissionId: 'perm-existing',
      }
      mockFindUnique.mockResolvedValue(makeDoc({
        settings: { share: { externalCollaborator: { enabled: true } } },
        sharingUsers: [existingShare],
      }))
      mockFindMany.mockResolvedValue([{ userId: 'u-ec-1', role: 'eng_ext_collaborator' }])
      mockQueryRawUnsafe.mockResolvedValue([{ id: 'u-ec-1', email: 'ec@external.com' }])

      await syncDocumentSharingUsers('doc-1')

      expect(mockGrantFolderPermission).not.toHaveBeenCalled()
    })

    it('revokes permission for users no longer in the EC member list', async () => {
      const staleShare = {
        id: 'su-stale', userId: 'u-removed',
        sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED,
        connectorPermissionId: 'perm-stale',
      }
      const activeShare = {
        id: 'su-active', userId: 'u-active',
        sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED,
        connectorPermissionId: 'perm-active',
      }
      mockFindUnique.mockResolvedValue(makeDoc({
        settings: { share: { externalCollaborator: { enabled: true } } },
        // staleShare's userId is NOT in the current EC members list below
        sharingUsers: [staleShare, activeShare],
      }))
      // Only u-active remains as EC member — u-removed has been removed
      mockFindMany.mockResolvedValue([{ userId: 'u-active', role: 'eng_ext_collaborator' }])
      mockQueryRawUnsafe.mockResolvedValue([{ id: 'u-active', email: 'active@firm.com' }])

      await syncDocumentSharingUsers('doc-1')

      expect(mockRevokePermission).toHaveBeenCalledWith('conn-1', 'drive-file-1', 'perm-stale')
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'su-stale' },
        data: expect.objectContaining({
          sharingPermissionStatus: DocumentSharingPermissionStatus.REVOKED,
          connectorPermissionId: null,
        }),
      }))
    })

    it('returns early without granting when no EC members exist', async () => {
      mockFindMany.mockResolvedValue([])

      await syncDocumentSharingUsers('doc-1')

      expect(mockGrantFolderPermission).not.toHaveBeenCalled()
    })
  })
})
