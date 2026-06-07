import { describe, it, expect, vi } from 'vitest'
import { createGoogleDrivePermissionAdapter } from './google-drive-permission-adapter'
import type { IConnectorPermissionAdapter } from '../types'

// Stub the GDrive connector singleton — tests must not hit the DB or Drive API
vi.mock('@/lib/google-drive-connector', () => ({
  GoogleDriveConnector: {
    getInstance: () => mockGDrive,
  },
  googleDriveConnector: {},
}))

const mockGDrive = {
  grantFolderPermission: vi.fn().mockResolvedValue('perm-id-1'),
  revokePermission: vi.fn().mockResolvedValue(true),
  downgradeFolderUserPermissionToReader: vi.fn().mockResolvedValue(true),
  getProjectFolderIds: vi.fn().mockResolvedValue({
    generalFolderId: 'gen-1',
    confidentialFolderId: 'conf-1',
    stagingFolderId: 'stag-1',
  }),
  trashFile: vi.fn().mockResolvedValue(undefined),
  listFiles: vi.fn().mockResolvedValue([{ id: 'f1', name: 'Doc.docx', mimeType: 'application/vnd.google-apps.document' }]),
  getFileMetadata: vi.fn().mockResolvedValue({ id: 'f1', name: 'Doc.docx', parents: ['parent-1'], driveId: null }),
}

describe('createGoogleDrivePermissionAdapter', () => {
  it('returns an object satisfying IConnectorPermissionAdapter', () => {
    const adapter: IConnectorPermissionAdapter = createGoogleDrivePermissionAdapter()
    expect(typeof adapter.grantFolderPermission).toBe('function')
    expect(typeof adapter.revokePermission).toBe('function')
    expect(typeof adapter.downgradeFolderUserPermissionToReader).toBe('function')
    expect(typeof adapter.getEngagementFolderIds).toBe('function')
    expect(typeof adapter.trashFile).toBe('function')
    expect(typeof adapter.listFiles).toBe('function')
    expect(typeof adapter.getFileMetadata).toBe('function')
  })

  it('grantFolderPermission delegates to GDrive and returns permission id', async () => {
    const adapter = createGoogleDrivePermissionAdapter()
    const permId = await adapter.grantFolderPermission('conn-1', 'folder-1', 'alice@firm.com', 'writer')
    expect(permId).toBe('perm-id-1')
    expect(mockGDrive.grantFolderPermission).toHaveBeenCalledWith('conn-1', 'folder-1', 'alice@firm.com', 'writer')
  })

  it('revokePermission delegates to GDrive', async () => {
    const adapter = createGoogleDrivePermissionAdapter()
    const ok = await adapter.revokePermission('conn-1', 'file-1', 'perm-id-1')
    expect(ok).toBe(true)
    expect(mockGDrive.revokePermission).toHaveBeenCalledWith('conn-1', 'file-1', 'perm-id-1')
  })

  it('downgradeFolderUserPermissionToReader delegates to GDrive', async () => {
    const adapter = createGoogleDrivePermissionAdapter()
    const changed = await adapter.downgradeFolderUserPermissionToReader('conn-1', 'folder-1', 'bob@firm.com')
    expect(changed).toBe(true)
    expect(mockGDrive.downgradeFolderUserPermissionToReader).toHaveBeenCalledWith('conn-1', 'folder-1', 'bob@firm.com')
  })

  it('getEngagementFolderIds maps getProjectFolderIds and normalises to EngagementFolderIds', async () => {
    const adapter = createGoogleDrivePermissionAdapter()
    const ids = await adapter.getEngagementFolderIds('conn-1', 'eng-slug', {
      projectName: 'Project A',
      clientSlug: 'acme',
      clientName: 'Acme Corp',
      projectFolderId: 'proj-root',
    })
    expect(ids).toEqual({
      generalFolderId: 'gen-1',
      confidentialFolderId: 'conf-1',
      stagingFolderId: 'stag-1',
    })
    expect(mockGDrive.getProjectFolderIds).toHaveBeenCalledWith(
      'conn-1',
      'eng-slug',
      { projectName: 'Project A', clientSlug: 'acme', clientName: 'Acme Corp', projectFolderId: 'proj-root' }
    )
  })

  it('getEngagementFolderIds normalises undefined sub-folder ids to null', async () => {
    mockGDrive.getProjectFolderIds.mockResolvedValueOnce({
      generalFolderId: 'gen-1',
      confidentialFolderId: undefined,
      stagingFolderId: undefined,
    })
    const adapter = createGoogleDrivePermissionAdapter()
    const ids = await adapter.getEngagementFolderIds('conn-1', 'eng-slug', {})
    expect(ids.confidentialFolderId).toBeNull()
    expect(ids.stagingFolderId).toBeNull()
  })

  it('trashFile returns void regardless of underlying GDrive return value', async () => {
    const adapter = createGoogleDrivePermissionAdapter()
    const result = await adapter.trashFile('conn-1', 'file-1')
    expect(result).toBeUndefined()
    expect(mockGDrive.trashFile).toHaveBeenCalledWith('conn-1', 'file-1')
  })

  it('listFiles delegates to GDrive and returns file list', async () => {
    const adapter = createGoogleDrivePermissionAdapter()
    const files = await adapter.listFiles('conn-1', 'folder-1', 100)
    expect(files).toHaveLength(1)
    expect(files[0].id).toBe('f1')
    expect(mockGDrive.listFiles).toHaveBeenCalledWith('conn-1', 'folder-1', 100)
  })

  it('getFileMetadata returns ConnectorFileMetadata shape with typed fields', async () => {
    const adapter = createGoogleDrivePermissionAdapter()
    const meta = await adapter.getFileMetadata('conn-1', 'f1')
    expect(meta).not.toBeNull()
    expect(meta!.id).toBe('f1')
    expect(meta!.name).toBe('Doc.docx')
    expect(meta!.parents).toEqual(['parent-1'])
    expect(meta!.driveId).toBeNull()
  })

  it('getFileMetadata returns null when file does not exist', async () => {
    mockGDrive.getFileMetadata.mockResolvedValueOnce(null)
    const adapter = createGoogleDrivePermissionAdapter()
    const meta = await adapter.getFileMetadata('conn-1', 'missing')
    expect(meta).toBeNull()
  })
})
