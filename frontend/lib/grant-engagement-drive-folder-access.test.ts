import { describe, it, expect, vi, beforeEach } from 'vitest'
import { grantEngagementDriveFolderAccess } from './grant-engagement-drive-folder-access'

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockGrantFolderPermission = vi.fn().mockResolvedValue('perm-1')
const mockGetEngagementFolderIds = vi.fn().mockResolvedValue({
  generalFolderId: 'gen-1',
  confidentialFolderId: 'conf-1',
  stagingFolderId: 'stag-1',
})

vi.mock('@/lib/connectors/registry', () => ({
  getPermissionAdapter: vi.fn().mockResolvedValue({
    grantFolderPermission: (...args: unknown[]) => mockGrantFolderPermission(...args),
    getEngagementFolderIds: (...args: unknown[]) => mockGetEngagementFolderIds(...args),
  }),
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}))

// ── Tests ──────────────────────────────────────────────────────────────────

describe('grantEngagementDriveFolderAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGrantFolderPermission.mockResolvedValue('perm-1')
    mockGetEngagementFolderIds.mockResolvedValue({
      generalFolderId: 'gen-1',
      confidentialFolderId: 'conf-1',
      stagingFolderId: 'stag-1',
    })
  })

  it('returns early without error when email is empty', async () => {
    await grantEngagementDriveFolderAccess({
      connectorId: 'conn-1', engagementSlug: 'eng', email: '', role: 'eng_member',
    })
    expect(mockGetEngagementFolderIds).not.toHaveBeenCalled()
  })

  it('returns early without error when email is whitespace only', async () => {
    await grantEngagementDriveFolderAccess({
      connectorId: 'conn-1', engagementSlug: 'eng', email: '   ', role: 'eng_member',
    })
    expect(mockGetEngagementFolderIds).not.toHaveBeenCalled()
  })

  it('uses registry getPermissionAdapter — never calls googleDriveConnector directly', async () => {
    const { getPermissionAdapter } = await import('@/lib/connectors/registry')
    await grantEngagementDriveFolderAccess({
      connectorId: 'conn-1', engagementSlug: 'eng-slug', email: 'user@firm.com', role: 'eng_member',
    })
    expect(getPermissionAdapter).toHaveBeenCalledWith('conn-1')
  })

  // ── Role: eng_member ──────────────────────────────────────────────────────

  describe('eng_member role', () => {
    it('grants editor access to generalFolder only', async () => {
      await grantEngagementDriveFolderAccess({
        connectorId: 'conn-1', engagementSlug: 'eng', email: 'member@firm.com', role: 'eng_member',
      })
      expect(mockGrantFolderPermission).toHaveBeenCalledTimes(1)
      expect(mockGrantFolderPermission).toHaveBeenCalledWith('conn-1', 'gen-1', 'member@firm.com', 'editor', { notify: false })
    })
  })

  // ── Clients: per-file access only, so nothing private can reach them through a folder ──

  describe.each(['eng_viewer', 'eng_ext_collaborator'] as const)('%s role', (role) => {
    it('gets no folder access', async () => {
      await grantEngagementDriveFolderAccess({
        connectorId: 'conn-1', engagementSlug: 'eng', email: 'client@example.com', role,
      })
      expect(mockGrantFolderPermission).not.toHaveBeenCalled()
    })
  })

  // ── Role: eng_admin ───────────────────────────────────────────────────────

  describe('eng_admin role', () => {
    it('grants editor access to all three folders', async () => {
      await grantEngagementDriveFolderAccess({
        connectorId: 'conn-1', engagementSlug: 'eng', email: 'admin@firm.com', role: 'eng_admin',
      })
      expect(mockGrantFolderPermission).toHaveBeenCalledTimes(3)
      expect(mockGrantFolderPermission).toHaveBeenCalledWith('conn-1', 'gen-1', 'admin@firm.com', 'editor', { notify: false })
      expect(mockGrantFolderPermission).toHaveBeenCalledWith('conn-1', 'conf-1', 'admin@firm.com', 'editor', { notify: false })
      expect(mockGrantFolderPermission).toHaveBeenCalledWith('conn-1', 'stag-1', 'admin@firm.com', 'editor', { notify: false })
    })

    it('skips null folder ids gracefully', async () => {
      mockGetEngagementFolderIds.mockResolvedValueOnce({
        generalFolderId: 'gen-1',
        confidentialFolderId: null,
        stagingFolderId: null,
      })
      await grantEngagementDriveFolderAccess({
        connectorId: 'conn-1', engagementSlug: 'eng', email: 'admin@firm.com', role: 'eng_admin',
      })
      expect(mockGrantFolderPermission).toHaveBeenCalledTimes(1)
      expect(mockGrantFolderPermission).toHaveBeenCalledWith('conn-1', 'gen-1', 'admin@firm.com', 'editor', { notify: false })
    })
  })

  // ── Error resilience ──────────────────────────────────────────────────────

  it('does not throw when grantFolderPermission rejects (already-exists idempotency)', async () => {
    mockGrantFolderPermission.mockRejectedValue(new Error('already has permission'))
    await expect(
      grantEngagementDriveFolderAccess({
        connectorId: 'conn-1', engagementSlug: 'eng', email: 'user@firm.com', role: 'eng_member',
      })
    ).resolves.toBeUndefined()
  })

  // ── Adapter contract: passes correct opts to getEngagementFolderIds ───────

  it('forwards all optional context fields to getEngagementFolderIds', async () => {
    await grantEngagementDriveFolderAccess({
      connectorId: 'conn-1',
      engagementSlug: 'proj-slug',
      email: 'user@firm.com',
      role: 'eng_member',
      projectName: 'Audit 2024',
      clientSlug: 'acme',
      clientName: 'Acme Corp',
      projectFolderId: 'proj-root',
    })
    expect(mockGetEngagementFolderIds).toHaveBeenCalledWith(
      'conn-1',
      'proj-slug',
      { projectName: 'Audit 2024', clientSlug: 'acme', clientName: 'Acme Corp', projectFolderId: 'proj-root' }
    )
  })
})
