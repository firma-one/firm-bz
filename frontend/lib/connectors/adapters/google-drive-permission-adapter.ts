/**
 * Google Drive implementation of IConnectorPermissionAdapter.
 * Wraps GoogleDriveConnector methods behind the provider-agnostic interface so
 * Inngest functions and other callers never import the GDrive connector directly.
 */

import type { IConnectorPermissionAdapter, EngagementFolderIds } from '../types'
import { GoogleDriveConnector } from '@/lib/google-drive-connector'

export function createGoogleDrivePermissionAdapter(): IConnectorPermissionAdapter {
  const g = GoogleDriveConnector.getInstance()
  return {
    grantFolderPermission: (id, folderId, email, role) =>
      g.grantFolderPermission(id, folderId, email, role),

    revokePermission: (id, fileId, permId) =>
      g.revokePermission(id, fileId, permId),

    downgradeFolderUserPermissionToReader: (id, folderId, email) =>
      g.downgradeFolderUserPermissionToReader(id, folderId, email),

    getEngagementFolderIds: async (id, slug, opts): Promise<EngagementFolderIds> => {
      const result = await g.getProjectFolderIds(id, slug, opts)
      return {
        generalFolderId: result.generalFolderId ?? null,
        confidentialFolderId: result.confidentialFolderId ?? null,
        stagingFolderId: result.stagingFolderId ?? null,
      }
    },

    trashFile: async (id, fileId) => { await g.trashFile(id, fileId) },

    listFiles: (id, folderId, pageSize) =>
      g.listFiles(id, folderId, pageSize),

    getFileMetadata: (id, fileId) =>
      g.getFileMetadata(id, fileId),
  }
}
