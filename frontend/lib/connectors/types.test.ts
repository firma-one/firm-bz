import { describe, it, expect } from 'vitest'
import {
  METADATA_FILE_NAME,
  METADATA_FOLDER_NAME,
  POCKETT_META_FILE,
  METADATA_DOT_FOLDER,
  POCKETT_DOT_FOLDER,
  type PockettMetaRoot,
  type PockettMetaOrganization,
  type IConnectorStorageAdapter,
  type IConnectorPermissionAdapter,
  type IConnectorMigrationAdapter,
  type ConnectorFileMetadata,
  type EngagementFolderIds,
} from './types'

describe('connector types', () => {
  // -------------------------------------------------------------------------
  // Constants
  // -------------------------------------------------------------------------
  it('exports meta constants', () => {
    expect(METADATA_FILE_NAME).toBe('meta.json')
    expect(METADATA_FOLDER_NAME).toBe('.meta')
    expect(POCKETT_META_FILE).toBe('meta.json')
    expect(METADATA_DOT_FOLDER).toBe('.meta')
    expect(POCKETT_DOT_FOLDER).toBe('.meta')
  })

  // -------------------------------------------------------------------------
  // PockettMeta shapes
  // -------------------------------------------------------------------------
  it('PockettMetaRoot has type root', () => {
    const meta: PockettMetaRoot = { type: 'root', version: 1 }
    expect(meta.type).toBe('root')
  })

  it('PockettMetaOrganization has type organization and slug', () => {
    const meta: PockettMetaOrganization = { type: 'organization', slug: 'acme', isDefault: true }
    expect(meta.type).toBe('organization')
    expect(meta.slug).toBe('acme')
  })

  // -------------------------------------------------------------------------
  // IConnectorStorageAdapter — existing contract
  // -------------------------------------------------------------------------
  it('IConnectorStorageAdapter can be implemented with required methods only', () => {
    const adapter: IConnectorStorageAdapter = {
      listFolderChildren: async () => [],
      readFileContent: async () => null,
      writeFile: async () => {},
      createFolder: async () => 'id',
      findOrCreateFolder: async () => 'id',
      getFileParent: async () => null,
      fileExists: async () => false,
      getFolderName: async () => null,
      search: async () => [],
    }
    expect(adapter.listFolderChildren).toBeDefined()
    expect(adapter.fileExists).toBeDefined()
  })

  // -------------------------------------------------------------------------
  // ConnectorFileMetadata — returned by IConnectorPermissionAdapter.getFileMetadata
  // -------------------------------------------------------------------------
  it('ConnectorFileMetadata requires id and name only', () => {
    const meta: ConnectorFileMetadata = { id: 'file-1', name: 'Report.docx' }
    expect(meta.id).toBe('file-1')
    expect(meta.name).toBe('Report.docx')
    expect(meta.parents).toBeUndefined()
    expect(meta.driveId).toBeUndefined()
  })

  it('ConnectorFileMetadata accepts driveId as string or null (shared drive indicator)', () => {
    const shared: ConnectorFileMetadata = { id: 'f', name: 'f', driveId: 'drive-abc' }
    const personal: ConnectorFileMetadata = { id: 'f', name: 'f', driveId: null }
    expect(shared.driveId).toBe('drive-abc')
    expect(personal.driveId).toBeNull()
  })

  // -------------------------------------------------------------------------
  // EngagementFolderIds — all three slots required, null allowed
  // -------------------------------------------------------------------------
  it('EngagementFolderIds accepts null for optional sub-folders', () => {
    const ids: EngagementFolderIds = {
      generalFolderId: 'gen-1',
      confidentialFolderId: null,
      stagingFolderId: null,
    }
    expect(ids.generalFolderId).toBe('gen-1')
    expect(ids.confidentialFolderId).toBeNull()
  })

  // -------------------------------------------------------------------------
  // IConnectorPermissionAdapter — OneDrive stub must satisfy this shape
  // -------------------------------------------------------------------------
  it('IConnectorPermissionAdapter can be implemented by any provider', () => {
    const adapter: IConnectorPermissionAdapter = {
      grantFolderPermission: async () => null,
      revokePermission: async () => false,
      downgradeFolderUserPermissionToReader: async () => false,
      getEngagementFolderIds: async () => ({
        generalFolderId: null,
        confidentialFolderId: null,
        stagingFolderId: null,
      }),
      trashFile: async () => {},
      listFiles: async () => [],
      getFileMetadata: async () => null,
    }
    expect(typeof adapter.grantFolderPermission).toBe('function')
    expect(typeof adapter.revokePermission).toBe('function')
    expect(typeof adapter.getEngagementFolderIds).toBe('function')
    expect(typeof adapter.trashFile).toBe('function')
    expect(typeof adapter.getFileMetadata).toBe('function')
  })

  it('IConnectorPermissionAdapter.grantFolderPermission returns string permissionId or null', async () => {
    const adapter: IConnectorPermissionAdapter = {
      grantFolderPermission: async (_id, _folderId, _email, _role) => 'perm-xyz',
      revokePermission: async () => true,
      downgradeFolderUserPermissionToReader: async () => true,
      getEngagementFolderIds: async () => ({ generalFolderId: 'g', confidentialFolderId: 'c', stagingFolderId: 's' }),
      trashFile: async () => {},
      listFiles: async () => [],
      getFileMetadata: async () => null,
    }
    const permId = await adapter.grantFolderPermission('conn', 'folder', 'user@example.com', 'reader')
    expect(permId).toBe('perm-xyz')
  })

  // -------------------------------------------------------------------------
  // IConnectorMigrationAdapter — OneDrive implementation must satisfy this shape
  // -------------------------------------------------------------------------
  it('IConnectorMigrationAdapter can be implemented by any provider', () => {
    const adapter: IConnectorMigrationAdapter = {
      listTopLevelChildren: async () => [],
      listTopLevelChildrenWithNames: async () => [],
      getFolderBreadcrumb: async () => [],
      moveBatch: async () => ({ failures: [] }),
      persistWorkspaceRootLocation: async () => {},
    }
    expect(typeof adapter.listTopLevelChildren).toBe('function')
    expect(typeof adapter.moveBatch).toBe('function')
    expect(typeof adapter.persistWorkspaceRootLocation).toBe('function')
  })

  it('IConnectorMigrationAdapter.moveBatch returns only failures (not moved list)', async () => {
    const adapter: IConnectorMigrationAdapter = {
      listTopLevelChildren: async () => ['f1', 'f2'],
      listTopLevelChildrenWithNames: async () => [],
      getFolderBreadcrumb: async () => [],
      moveBatch: async (_id, fileIds, _old, _new) => ({
        failures: fileIds.slice(1).map(id => ({ id, error: 'permission denied' })),
      }),
      persistWorkspaceRootLocation: async () => {},
    }
    const result = await adapter.moveBatch('conn', ['f1', 'f2'], 'old', 'new')
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].id).toBe('f2')
    // Interface contract: no 'moved' field exposed
    expect((result as any).moved).toBeUndefined()
  })

  it('IConnectorMigrationAdapter.moveBatch returns empty failures on full success', async () => {
    const adapter: IConnectorMigrationAdapter = {
      listTopLevelChildren: async () => [],
      listTopLevelChildrenWithNames: async () => [],
      getFolderBreadcrumb: async () => [],
      moveBatch: async () => ({ failures: [] }),
      persistWorkspaceRootLocation: async () => {},
    }
    const result = await adapter.moveBatch('conn', ['f1', 'f2'], 'old', 'new')
    expect(result.failures).toHaveLength(0)
  })
})
