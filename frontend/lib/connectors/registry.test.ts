import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConnectorType } from '@prisma/client'
import {
  getConnectorInstance,
  getPermissionAdapter,
  getMigrationAdapter,
  getConnectorMeta,
  getStorageAdapter,
} from './registry'

const mockFindUnique = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    connector: { findUnique: (...args: unknown[]) => mockFindUnique(...args) },
    firm: { findUnique: vi.fn() },
  },
}))

// Stub the heavy GDrive connector so tests don't need a real token/DB
vi.mock('@/lib/google-drive-connector', () => ({
  GoogleDriveConnector: {
    getInstance: () => ({
      getConnections: vi.fn(),
      disconnectConnection: vi.fn(),
      removeConnection: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue('tok'),
      grantFolderPermission: vi.fn().mockResolvedValue('perm-id'),
      revokePermission: vi.fn().mockResolvedValue(true),
      downgradeFolderUserPermissionToReader: vi.fn().mockResolvedValue(true),
      getProjectFolderIds: vi.fn().mockResolvedValue({ generalFolderId: 'g', confidentialFolderId: 'c', stagingFolderId: 's' }),
      trashFile: vi.fn().mockResolvedValue(undefined),
      listFiles: vi.fn().mockResolvedValue([]),
      getFileMetadata: vi.fn().mockResolvedValue(null),
      listTopLevelChildren: vi.fn().mockResolvedValue([]),
      moveBatch: vi.fn().mockResolvedValue({ moved: [], failures: [] }),
      persistWorkspaceRootLocation: vi.fn().mockResolvedValue(undefined),
    }),
  },
  googleDriveConnector: {},
}))

vi.mock('./onedrive-connector', () => ({
  getOneDriveConnectorInstance: () => ({
    getConnections: vi.fn(),
    disconnectConnection: vi.fn(),
    removeConnection: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue(null),
  }),
}))

vi.mock('./adapters/onedrive-adapter', () => ({
  createOneDriveAdapter: vi.fn(() => ({})),
}))

describe('connector registry', () => {
  beforeEach(() => {
    mockFindUnique.mockReset()
  })

  // -------------------------------------------------------------------------
  // getConnectorInstance
  // -------------------------------------------------------------------------
  describe('getConnectorInstance', () => {
    it('returns an instance for GOOGLE_DRIVE with required methods', () => {
      const instance = getConnectorInstance(ConnectorType.GOOGLE_DRIVE)
      expect(instance).toBeDefined()
      expect(typeof instance.getConnections).toBe('function')
      expect(typeof instance.disconnectConnection).toBe('function')
      expect(typeof instance.removeConnection).toBe('function')
      expect(typeof instance.getAccessToken).toBe('function')
    })

    it('returns the same singleton for GOOGLE_DRIVE on multiple calls', () => {
      const a = getConnectorInstance(ConnectorType.GOOGLE_DRIVE)
      const b = getConnectorInstance(ConnectorType.GOOGLE_DRIVE)
      expect(a).toBe(b)
    })

    it('throws for unsupported connector type', () => {
      expect(() => getConnectorInstance('DROPBOX' as ConnectorType)).toThrow('Unsupported connector type')
    })
  })

  // -------------------------------------------------------------------------
  // getConnectorMeta
  // -------------------------------------------------------------------------
  describe('getConnectorMeta', () => {
    it('returns enabled=true and correct label for GOOGLE_DRIVE', () => {
      const meta = getConnectorMeta(ConnectorType.GOOGLE_DRIVE)
      expect(meta.label).toBe('Google Drive')
      expect(meta.iconKey).toBe('google-drive')
      expect(meta.enabled).toBe(true)
    })

    it('returns enabled=false for ONEDRIVE (not yet live)', () => {
      const meta = getConnectorMeta(ConnectorType.ONEDRIVE)
      expect(meta.label).toBe('OneDrive')
      expect(meta.enabled).toBe(false)
    })

    it('returns enabled=false for DROPBOX', () => {
      expect(getConnectorMeta(ConnectorType.DROPBOX).enabled).toBe(false)
    })

    it('returns enabled=false for BOX', () => {
      expect(getConnectorMeta(ConnectorType.BOX).enabled).toBe(false)
    })

    it('handles unknown types gracefully without throwing', () => {
      const meta = getConnectorMeta('UNKNOWN_PROVIDER' as ConnectorType)
      expect(meta.enabled).toBe(false)
      expect(meta.label).toBe('UNKNOWN_PROVIDER')
    })
  })

  // -------------------------------------------------------------------------
  // getPermissionAdapter — dispatches by connector type
  // -------------------------------------------------------------------------
  describe('getPermissionAdapter', () => {
    it('returns adapter with all IConnectorPermissionAdapter methods for GOOGLE_DRIVE', async () => {
      mockFindUnique.mockResolvedValue({ id: 'conn-1', type: ConnectorType.GOOGLE_DRIVE })
      const adapter = await getPermissionAdapter('conn-1')
      expect(typeof adapter.grantFolderPermission).toBe('function')
      expect(typeof adapter.revokePermission).toBe('function')
      expect(typeof adapter.downgradeFolderUserPermissionToReader).toBe('function')
      expect(typeof adapter.getEngagementFolderIds).toBe('function')
      expect(typeof adapter.trashFile).toBe('function')
      expect(typeof adapter.listFiles).toBe('function')
      expect(typeof adapter.getFileMetadata).toBe('function')
    })

    it('throws when connector is not found', async () => {
      mockFindUnique.mockResolvedValue(null)
      await expect(getPermissionAdapter('missing')).rejects.toThrow('Connection not found')
    })

    it('throws for connector types without a permission adapter', async () => {
      mockFindUnique.mockResolvedValue({ id: 'conn-2', type: ConnectorType.DROPBOX })
      await expect(getPermissionAdapter('conn-2')).rejects.toThrow('No permission adapter')
    })

    it('getEngagementFolderIds normalises undefined fields to null', async () => {
      mockFindUnique.mockResolvedValue({ id: 'conn-1', type: ConnectorType.GOOGLE_DRIVE })
      const adapter = await getPermissionAdapter('conn-1')
      const ids = await adapter.getEngagementFolderIds('conn-1', 'eng-slug', {})
      expect(ids).toEqual({
        generalFolderId: 'g',
        confidentialFolderId: 'c',
        stagingFolderId: 's',
      })
    })

    it('trashFile returns void (does not surface boolean from GDrive)', async () => {
      mockFindUnique.mockResolvedValue({ id: 'conn-1', type: ConnectorType.GOOGLE_DRIVE })
      const adapter = await getPermissionAdapter('conn-1')
      const result = await adapter.trashFile('conn-1', 'file-id')
      expect(result).toBeUndefined()
    })

    // Contract test: adding ONEDRIVE here when Phase 2 ships will catch missing registration
    it('throws for ONEDRIVE until Phase 2 is wired up', async () => {
      mockFindUnique.mockResolvedValue({ id: 'conn-3', type: ConnectorType.ONEDRIVE })
      await expect(getPermissionAdapter('conn-3')).rejects.toThrow('No permission adapter')
    })
  })

  // -------------------------------------------------------------------------
  // getMigrationAdapter — dispatches by connector type
  // -------------------------------------------------------------------------
  describe('getMigrationAdapter', () => {
    it('returns adapter with all IConnectorMigrationAdapter methods for GOOGLE_DRIVE', async () => {
      mockFindUnique.mockResolvedValue({ id: 'conn-1', type: ConnectorType.GOOGLE_DRIVE })
      const adapter = await getMigrationAdapter('conn-1')
      expect(typeof adapter.listTopLevelChildren).toBe('function')
      expect(typeof adapter.moveBatch).toBe('function')
      expect(typeof adapter.persistWorkspaceRootLocation).toBe('function')
    })

    it('throws when connector is not found', async () => {
      mockFindUnique.mockResolvedValue(null)
      await expect(getMigrationAdapter('missing')).rejects.toThrow('Connection not found')
    })

    it('throws for connector types without a migration adapter', async () => {
      mockFindUnique.mockResolvedValue({ id: 'conn-2', type: ConnectorType.DROPBOX })
      await expect(getMigrationAdapter('conn-2')).rejects.toThrow('No migration adapter')
    })

    it('moveBatch strips moved[] and only returns failures', async () => {
      mockFindUnique.mockResolvedValue({ id: 'conn-1', type: ConnectorType.GOOGLE_DRIVE })
      const adapter = await getMigrationAdapter('conn-1')
      const result = await adapter.moveBatch('conn-1', ['f1'], 'old', 'new')
      // Result must only have failures, not moved — that's the interface contract
      expect(result).toHaveProperty('failures')
      expect(Array.isArray(result.failures)).toBe(true)
      expect(result).not.toHaveProperty('moved')
    })

    // Contract test: adding ONEDRIVE here when Phase 2 ships will catch missing registration
    it('throws for ONEDRIVE until Phase 2 migration adapter is wired up', async () => {
      mockFindUnique.mockResolvedValue({ id: 'conn-3', type: ConnectorType.ONEDRIVE })
      await expect(getMigrationAdapter('conn-3')).rejects.toThrow('No migration adapter')
    })
  })

  // -------------------------------------------------------------------------
  // getStorageAdapter — existing behaviour, guarded against regression
  // -------------------------------------------------------------------------
  describe('getStorageAdapter', () => {
    it('throws when connector is not found', async () => {
      mockFindUnique.mockResolvedValue(null)
      await expect(getStorageAdapter('missing')).rejects.toThrow('Connection not found')
    })

    it('throws for connector types without a storage adapter', async () => {
      mockFindUnique.mockResolvedValue({ id: 'conn-2', type: ConnectorType.DROPBOX })
      await expect(getStorageAdapter('conn-2')).rejects.toThrow('No storage adapter')
    })

    it('returns a storage adapter for GOOGLE_DRIVE', async () => {
      mockFindUnique.mockResolvedValue({ id: 'conn-1', type: ConnectorType.GOOGLE_DRIVE })
      const adapter = await getStorageAdapter('conn-1')
      expect(typeof adapter.listFolderChildren).toBe('function')
      expect(typeof adapter.createFolder).toBe('function')
    })
  })
})
