/**
 * Google Drive implementation of IConnectorPermissionAdapter.
 * Wraps GoogleDriveConnector methods behind the provider-agnostic interface so
 * Inngest functions and other callers never import the GDrive connector directly.
 */

import type { IConnectorPermissionAdapter, EngagementFolderIds, ConnectorRole, TrashState } from '../types'
import { GoogleDriveConnector } from '@/lib/google-drive-connector'
import { storageFailure, storageFailureFromResponse } from '@/lib/connectors/storage-failure'

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

/**
 * Where a trashed file stands, read with its status: getFileMetadata answers null both for a file deleted
 * for good and for a Drive that couldn't be reached, and the cleanup after the Undo window must never
 * take the second for the first.
 */
async function trashStateOf(g: GoogleDriveConnector, connectorId: string, fileId: string): Promise<TrashState> {
  const token = await g.getAccessToken(connectorId).catch(() => null)
  if (!token) throw storageFailure('reconnect', 'Google Drive')
  let res: Response
  try {
    res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,trashed&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    throw storageFailure('unreachable', 'Google Drive')
  }
  if (res.status === 404) return 'gone'
  if (!res.ok) throw await storageFailureFromResponse(res, 'Google Drive', 'check a file in the trash')
  const data = await res.json() as { trashed?: boolean }
  return data.trashed === true ? 'trashed' : 'restored'
}

export function createGoogleDrivePermissionAdapter(): IConnectorPermissionAdapter {
  const g = GoogleDriveConnector.getInstance()
  return {
    grantFolderPermission: (id, folderId, email, role, opts) =>
      g.grantFolderPermission(id, folderId, email, toDriveRole(role), opts),

    revokePermission: (id, fileId, permId) =>
      g.revokePermission(id, fileId, permId),

    revokeFolderPermissionByEmail: (id, folderId, email) =>
      g.revokeFolderPermissionByEmail(id, folderId, email),

    restrictFolderToOwnerOnly: (id, folderId) =>
      g.restrictFolderToOwnerOnly(id, folderId),

    getTrashState: (id, fileId) => trashStateOf(g, id, fileId),

    downgradeFolderUserPermissionToReader: (id, folderId, email) =>
      g.downgradeFolderUserPermissionToReader(id, folderId, email),

    upgradeFolderUserPermissionToEditor: (id, folderId, email) =>
      g.restoreFolderUserPermissionToWriter(id, folderId, email),

    getEngagementFolderIds: async (id, slug, opts): Promise<EngagementFolderIds> => {
      const result = await g.getProjectFolderIds(id, slug, opts)
      return {
        generalFolderId: result.generalFolderId ?? null,
        confidentialFolderId: result.confidentialFolderId ?? null,
        stagingFolderId: result.stagingFolderId ?? null,
      }
    },

    trashFile: (id, fileId) => g.trashFileWithReason(id, fileId),

    restoreFile: async (id, fileId) => {
      const ok = await g.untrashFile(id, fileId)
      if (!ok) throw new Error(`Failed to restore Google Drive file ${fileId}`)
    },

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

    // Throws a StorageFailure when Drive won't list them (the connector's method does).
    listFilePermissions: async (id, fileId) => {
      const perms = await g.listFilePermissions(id, fileId)
      return perms
        .filter((p) => !p.deleted)
        .map((p) => ({ id: p.id, email: p.emailAddress ?? null, role: fromDriveRole(p.role) }))
    },

    getFilePermission: async (id, fileId, permissionId) => {
      const p = await g.getFilePermission(id, fileId, permissionId)
      if (!p || p.deleted) return null
      return { id: p.id, email: p.emailAddress ?? null, role: fromDriveRole(p.role) }
    },

    deleteFile: async (id, fileId, opts) => {
      if (opts?.permanent) {
        await g.permanentlyDeleteFile(id, fileId)
      } else {
        await g.trashFileWithReason(id, fileId)
      }
    },

    patchFilePermissionRole: (id, fileId, permissionId, role) =>
      g.patchFilePermissionRole(id, fileId, permissionId, toDriveRole(role)),

    setFileContentReadOnly: (id, fileId, readOnly) =>
      g.setFileContentReadOnly(id, fileId, readOnly),

    searchFiles: async (id, query, options) => {
      const files = await g.searchFiles(id, query, options)
      return files.map((f) => ({ ...f, size: f.size != null ? String(f.size) : undefined }))
    },

    getFilesMetadata: async (id, fileIds) => {
      const files = await g.getFilesMetadata(id, fileIds)
      return files.map((f) => ({ ...f, size: f.size != null ? String(f.size) : undefined }))
    },

    getDuplicateFiles: (id, limit) =>
      g.getDuplicateFiles(id, limit),

    getStaleFiles: async (id, limit) => {
      const files = await g.getStaleFiles(id, limit)
      return files.map((f: any) => ({ ...f, size: f.size != null ? String(f.size) : undefined }))
    },

    updatePermissionExpiry: (id, fileId, permissionId, expirationTime) =>
      g.updatePermissionExpiry(id, fileId, permissionId, expirationTime),
  }
}
