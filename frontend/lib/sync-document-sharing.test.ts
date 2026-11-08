import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DocumentSharingPermissionStatus, EngagementRole } from '@prisma/client'
import { syncDocumentSharingUsers } from './sync-document-sharing'

// syncDocumentSharingUsers keeps the sharing rows, and only those: Drive grants and revokes belong to
// the secure-open flow (regrant) and the revoke jobs, so a client gets Drive access file by file.

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockGetPermissionAdapter = vi.fn()
vi.mock('@/lib/connectors/registry', () => ({
  getPermissionAdapter: (...args: unknown[]) => mockGetPermissionAdapter(...args),
}))

const mockFindUnique = vi.fn()
const mockFindMany = vi.fn()
const mockQueryRaw = vi.fn()
const mockUpdateMany = vi.fn()
const mockUpdate = vi.fn()
const mockCreate = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    engagementDocument: { findUnique: (...a: unknown[]) => mockFindUnique(...a) },
    engagementMember: { findMany: (...a: unknown[]) => mockFindMany(...a) },
    engagementDocumentSharingUser: {
      updateMany: (...a: unknown[]) => mockUpdateMany(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
      create: (...a: unknown[]) => mockCreate(...a),
    },
    $queryRaw: (...a: unknown[]) => mockQueryRaw(...a),
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

const shareRow = (id: string, userId: string, status: DocumentSharingPermissionStatus, role: EngagementRole = EngagementRole.eng_ext_collaborator) => ({
  id, userId, connectorPermissionId: null, sharingPermissionStatus: status, member: { role },
})

const CLIENT_ROLES = [EngagementRole.eng_ext_collaborator, EngagementRole.eng_viewer]
const EC_ON = { share: { externalCollaborator: { enabled: true } } }
const EC_OFF = { share: { externalCollaborator: { enabled: false } } }

// ── Tests ──────────────────────────────────────────────────────────────────

describe('syncDocumentSharingUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateMany.mockResolvedValue({ count: 0 })
    mockUpdate.mockResolvedValue({})
    mockCreate.mockResolvedValue({})
    mockFindMany.mockResolvedValue([])
    mockQueryRaw.mockResolvedValue([])
  })

  it('returns early without error when document is not found', async () => {
    mockFindUnique.mockResolvedValue(null)
    await expect(syncDocumentSharingUsers('doc-missing')).resolves.toBeUndefined()
    expect(mockUpdateMany).not.toHaveBeenCalled()
  })

  // ── EC sharing disabled ──────────────────────────────────────────────────

  describe('when externalCollaborator sharing is disabled', () => {
    it("marks clients' GRANTED rows REVOKED", async () => {
      mockFindUnique.mockResolvedValue(makeDoc({ settings: EC_OFF, sharingUsers: [shareRow('su-1', 'u-1', DocumentSharingPermissionStatus.GRANTED)] }))

      await syncDocumentSharingUsers('doc-1')

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: {
          projectDocumentId: 'doc-1',
          sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED,
          member: { role: { in: CLIENT_ROLES } },
        },
        data: { sharingPermissionStatus: DocumentSharingPermissionStatus.REVOKED },
      })
    })

    it('keeps the permission id, so the revoke job can take the Drive permission back', async () => {
      mockFindUnique.mockResolvedValue(makeDoc({ settings: EC_OFF, sharingUsers: [{ ...shareRow('su-1', 'u-1', DocumentSharingPermissionStatus.GRANTED), connectorPermissionId: 'perm-1' }] }))

      await syncDocumentSharingUsers('doc-1')

      expect(mockUpdateMany).toHaveBeenCalledTimes(1)
      expect(mockUpdateMany.mock.calls[0][0].data).not.toHaveProperty('connectorPermissionId')
    })

    it("leaves the firm's own rows alone", async () => {
      mockFindUnique.mockResolvedValue(makeDoc({ settings: EC_OFF, sharingUsers: [shareRow('su-1', 'u-1', DocumentSharingPermissionStatus.GRANTED, EngagementRole.eng_admin)] }))

      await syncDocumentSharingUsers('doc-1')

      expect(mockUpdateMany).not.toHaveBeenCalled()
    })

    it('never touches Drive: revoking there is the revoke job\'s', async () => {
      mockFindUnique.mockResolvedValue(makeDoc({ settings: EC_OFF, sharingUsers: [shareRow('su-1', 'u-1', DocumentSharingPermissionStatus.GRANTED)] }))

      await syncDocumentSharingUsers('doc-1')

      expect(mockGetPermissionAdapter).not.toHaveBeenCalled()
    })
  })

  // ── EC sharing enabled ───────────────────────────────────────────────────

  describe('when externalCollaborator sharing is enabled', () => {
    const member = (userId: string) => ({ userId, role: EngagementRole.eng_ext_collaborator })

    beforeEach(() => {
      mockFindUnique.mockResolvedValue(makeDoc({ settings: EC_ON }))
    })

    it('writes a GRANTED row for each EC member, with no Drive call', async () => {
      mockFindMany.mockResolvedValue([member('u-ec-1')])
      mockQueryRaw.mockResolvedValue([{ id: 'u-ec-1', email: 'ec@external.com' }])

      await syncDocumentSharingUsers('doc-1', 'actor')

      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          projectDocumentId: 'doc-1',
          engagementId: 'eng-1',
          userId: 'u-ec-1',
          sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED,
          createdBy: 'actor',
          updatedBy: 'actor',
        },
      })
      expect(mockGetPermissionAdapter).not.toHaveBeenCalled()
    })

    it.each([
      DocumentSharingPermissionStatus.GRANTED,
      DocumentSharingPermissionStatus.INHERITED,
      DocumentSharingPermissionStatus.PENDING,
    ])('leaves a row that is already %s as it is', async (status) => {
      mockFindUnique.mockResolvedValue(makeDoc({ settings: EC_ON, sharingUsers: [shareRow('su-1', 'u-ec-1', status)] }))
      mockFindMany.mockResolvedValue([member('u-ec-1')])
      mockQueryRaw.mockResolvedValue([{ id: 'u-ec-1', email: 'ec@external.com' }])

      await syncDocumentSharingUsers('doc-1')

      expect(mockCreate).not.toHaveBeenCalled()
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('grants a REVOKED row again', async () => {
      mockFindUnique.mockResolvedValue(makeDoc({ settings: EC_ON, sharingUsers: [shareRow('su-1', 'u-ec-1', DocumentSharingPermissionStatus.REVOKED)] }))
      mockFindMany.mockResolvedValue([member('u-ec-1')])
      mockQueryRaw.mockResolvedValue([{ id: 'u-ec-1', email: 'ec@external.com' }])

      await syncDocumentSharingUsers('doc-1')

      // Its permission id stays: one a revoke couldn't take back still stands, and the next open reuses it.
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'su-1' },
        data: { sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED },
      })
    })

    it('revokes the row of a client no longer in the EC member list', async () => {
      mockFindUnique.mockResolvedValue(makeDoc({
        settings: EC_ON,
        // u-removed is NOT in the current EC members list below
        sharingUsers: [shareRow('su-stale', 'u-removed', DocumentSharingPermissionStatus.GRANTED), shareRow('su-active', 'u-active', DocumentSharingPermissionStatus.GRANTED)],
      }))
      mockFindMany.mockResolvedValue([member('u-active')])
      mockQueryRaw.mockResolvedValue([{ id: 'u-active', email: 'active@firm.com' }])

      await syncDocumentSharingUsers('doc-1')

      expect(mockUpdate).toHaveBeenCalledTimes(1)
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'su-stale' },
        data: { sharingPermissionStatus: DocumentSharingPermissionStatus.REVOKED },
      })
    })

    it('writes nothing when no EC members exist', async () => {
      await syncDocumentSharingUsers('doc-1')

      expect(mockCreate).not.toHaveBeenCalled()
    })
  })
})
