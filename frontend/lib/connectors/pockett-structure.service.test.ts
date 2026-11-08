import { describe, it, expect, vi } from 'vitest'
import { detectExistingStructure, getOrgFolderName } from './pockett-structure.service'
import { storageFailure } from './storage-failure'
import { METADATA_FOLDER_NAME, type IConnectorStorageAdapter } from './types'

function createMockAdapter(overrides: Partial<IConnectorStorageAdapter> = {}): IConnectorStorageAdapter {
  return {
    listFolderChildren: vi.fn().mockResolvedValue([]),
    readFileContent: vi.fn().mockResolvedValue(null),
    writeFile: vi.fn().mockResolvedValue(undefined),
    createFolder: vi.fn().mockResolvedValue('created-id'),
    findOrCreateFolder: vi.fn().mockResolvedValue('found-id'),
    getFileParent: vi.fn().mockResolvedValue(null),
    fileExists: vi.fn().mockResolvedValue(true),
    getFolderName: vi.fn().mockResolvedValue(null),
    search: vi.fn().mockResolvedValue([]),
    ...overrides
  }
}

describe('pockett-structure.service', () => {
  describe('detectExistingStructure', () => {
    it('returns detected: false when selected folder has no metadata folder', async () => {
      const adapter = createMockAdapter({
        listFolderChildren: vi.fn().mockResolvedValue([{ id: 'f1', name: 'Other' }])
      })
      const result = await detectExistingStructure('conn-1', 'parent-1', adapter)
      expect(result).toEqual({ detected: false })
      expect(adapter.listFolderChildren).toHaveBeenCalledWith('conn-1', 'parent-1')
    })

    it('returns detected: true with importRootFolderId when metadata folder has type=root', async () => {
      const adapter = createMockAdapter({
        listFolderChildren: vi.fn()
          .mockResolvedValueOnce([{ id: 'dot-id', name: METADATA_FOLDER_NAME }])
          .mockResolvedValueOnce([{ id: 'dot-id', name: METADATA_FOLDER_NAME }])
          .mockResolvedValueOnce([{ id: 'meta-id', name: 'meta.json' }]),
        readFileContent: vi.fn().mockResolvedValue(JSON.stringify({ type: 'root', version: 1 }))
      })
      const result = await detectExistingStructure('conn-1', 'parent-1', adapter)
      expect(result).toEqual({ detected: true, importRootFolderId: 'parent-1' })
    })

    it('returns detected: true with importRootFolderId when selected folder is org (type=organization) and getFileParent returns root', async () => {
      const adapter = createMockAdapter({
        listFolderChildren: vi.fn()
          .mockResolvedValueOnce([{ id: 'dot-id', name: METADATA_FOLDER_NAME }])
          .mockResolvedValueOnce([{ id: 'dot-id', name: METADATA_FOLDER_NAME }])
          .mockResolvedValueOnce([{ id: 'meta-id', name: 'meta.json' }]),
        readFileContent: vi.fn().mockResolvedValue(JSON.stringify({ type: 'organization', slug: 'my-org', isDefault: false })),
        getFileParent: vi.fn().mockResolvedValue('root-folder-id')
      })
      const result = await detectExistingStructure('conn-1', 'org-folder-id', adapter)
      expect(result).toEqual({ detected: true, importRootFolderId: 'root-folder-id' })
    })

    it('returns detected: true when a child folder has type=organization (user selected root)', async () => {
      const adapter = createMockAdapter({
        listFolderChildren: vi.fn()
          .mockResolvedValueOnce([
            { id: 'dot-id', name: METADATA_FOLDER_NAME },
            { id: 'org-folder-id', name: 'My Org' }
          ])
          .mockResolvedValueOnce([{ id: 'dot-id', name: METADATA_FOLDER_NAME }])
          .mockResolvedValueOnce([{ id: 'meta-id', name: 'meta.json' }])
          .mockResolvedValueOnce([{ id: 'org-dot', name: METADATA_FOLDER_NAME }])
          .mockResolvedValueOnce([{ id: 'org-meta', name: 'meta.json' }]),
        readFileContent: vi.fn()
          .mockResolvedValueOnce(JSON.stringify({ type: 'other' }))
          .mockResolvedValueOnce(JSON.stringify({ type: 'organization', slug: 'my-org', isDefault: false }))
      })
      const result = await detectExistingStructure('conn-1', 'parent-1', adapter)
      expect(result).toEqual({ detected: true, importRootFolderId: 'parent-1' })
    })

    it('returns detected: false when metadata folder exists but meta.json has no valid type', async () => {
      const adapter = createMockAdapter({
        listFolderChildren: vi.fn()
          .mockResolvedValueOnce([{ id: 'dot-id', name: METADATA_FOLDER_NAME }])
          .mockResolvedValueOnce([{ id: 'meta-id', name: 'meta.json' }])
          .mockResolvedValueOnce([]),
        readFileContent: vi.fn().mockResolvedValue(JSON.stringify({ type: 'client', slug: 'x' }))
      })
      const result = await detectExistingStructure('conn-1', 'parent-1', adapter)
      expect(result).toEqual({ detected: false })
    })
  })
})

describe('readMetaFromFolder (P2-35)', () => {
  it('stops with a StorageFailure when the meta file is there but cannot be read, instead of reading it as "none"', async () => {
    const { readMetaFromFolder } = await import('./pockett-structure.service')
    const { StorageFailure } = await import('./storage-failure')
    const adapter = createMockAdapter({
      listFolderChildren: vi.fn()
        .mockResolvedValueOnce([{ id: 'dot-id', name: METADATA_FOLDER_NAME }])
        .mockResolvedValueOnce([{ id: 'meta-id', name: 'meta.json' }]),
      readFileContent: vi.fn().mockResolvedValue(null),
    })
    await expect(readMetaFromFolder(adapter, 'conn-1', 'folder-1')).rejects.toBeInstanceOf(StorageFailure)
  })

  it('still answers null when there is no meta file at all', async () => {
    const { readMetaFromFolder } = await import('./pockett-structure.service')
    const adapter = createMockAdapter({ listFolderChildren: vi.fn().mockResolvedValue([]) })
    await expect(readMetaFromFolder(adapter, 'conn-1', 'folder-1')).resolves.toBeNull()
  })

  describe('getOrgFolderName', () => {
    it('stops when the storage refuses the listing, rather than guess a name', async () => {
      const refusal = storageFailure('no_permission', 'Google Drive')
      const adapter = createMockAdapter({ listFolderChildren: vi.fn().mockRejectedValue(refusal) })
      await expect(getOrgFolderName(adapter, 'conn-1', 'parent-1', 'Acme', 'acme')).rejects.toBe(refusal)
    })

    it('still answers the name when the listing has no collision', async () => {
      const adapter = createMockAdapter({ listFolderChildren: vi.fn().mockResolvedValue([{ id: 'x', name: 'Other' }]) })
      await expect(getOrgFolderName(adapter, 'conn-1', 'parent-1', 'Acme', 'acme')).resolves.toEqual({ folderName: 'Acme', collision: false })
    })
  })
})
