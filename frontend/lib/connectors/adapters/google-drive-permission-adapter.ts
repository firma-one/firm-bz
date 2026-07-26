/**
 * Google Drive implementation of IConnectorPermissionAdapter.
 * Wraps GoogleDriveConnector methods behind the provider-agnostic interface so
 * Inngest functions and other callers never import the GDrive connector directly.
 */

import type { IConnectorPermissionAdapter, EngagementFolderIds, ConnectorRole } from '../types'
import { GoogleDriveConnector } from '@/lib/google-drive-connector'

/** Maps the provider-agnostic role vocabulary to Google Drive's native permission roles. */
function toDriveRole(role: ConnectorRole): 'writer' | 'reader' | 'commenter' {
  if (role === 'editor') return 'writer'
  if (role === 'viewer') return 'reader'
  return 'commenter'
}

function fromDriveRole(role: string): ConnectorRole {
  if (role === 'writer' || role === 'fileOrganizer' || role === 'organizer') return 'editor'
  if (role === 'commenter') return 'commenter'
  return 'viewer'
}

export function createGoogleDrivePermissionAdapter(): IConnectorPermissionAdapter {
  const g = GoogleDriveConnector.getInstance()
  return {
    grantFolderPermission: (id, folderId, email, role) =>
      g.grantFolderPermission(id, folderId, email, toDriveRole(role)),

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

    grantFilePermission: (id, fileId, email, role, opts) =>
      g.grantFilePermission(id, fileId, email, toDriveRole(role), opts?.message, {
        rm: 'minimal',
        ui: '2',
        sendNotificationEmail: opts?.notify === false ? 'false' : 'true',
      }),

    listFilePermissions: async (id, fileId) => {
      const perms = await g.listFilePermissions(id, fileId)
      return perms
        .filter((p) => !p.deleted)
        .map((p) => ({ id: p.id, email: p.emailAddress ?? null, role: fromDriveRole(p.role) }))
    },

    deleteFile: async (id, fileId, opts) => {
      if (opts?.permanent) {
        await g.permanentlyDeleteFile(id, fileId)
      } else {
        await g.trashFile(id, fileId)
      }
    },
  }
}
