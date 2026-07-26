/**
 * Connector storage adapter: abstraction for cloud storage (Google Drive, Dropbox, OneDrive).
 * Pockett folder structure and onboarding logic use this interface only.
 */

export const METADATA_FILE_NAME = 'meta.json'
export const METADATA_FOLDER_NAME = '.meta'

// Backward-compatible aliases for older imports.
export const POCKETT_META_FILE = METADATA_FILE_NAME
export const METADATA_DOT_FOLDER = METADATA_FOLDER_NAME
export const POCKETT_DOT_FOLDER = METADATA_FOLDER_NAME

export type PockettMetaType = 'root' | 'organization' | 'client' | 'project' | 'document'

export interface PockettMetaBase {
  type: PockettMetaType
}

export interface PockettMetaRoot extends PockettMetaBase {
  type: 'root'
  version?: number
}

export interface PockettMetaOrganization extends PockettMetaBase {
  type: 'organization'
  slug: string
  isDefault: boolean
  originalName?: string  // Original organization name (for audit trail when collision detected)
  folderName?: string    // Actual folder name used (may differ from originalName if collision)
  collision?: boolean    // Whether name collision was detected
  sandboxOnly?: boolean  // Whether this is a sandbox organization (should be hidden from import)
}

export interface PockettMetaClient extends PockettMetaBase {
  type: 'client'
  slug: string
}

export interface PockettMetaProject extends PockettMetaBase {
  type: 'project'
  slug: string
}

export interface PockettMetaDocument extends PockettMetaBase {
  type: 'document'
  folderType: 'general' | 'confidential' | 'staging'
}

export type PockettMeta =
  | PockettMetaRoot
  | PockettMetaOrganization
  | PockettMetaClient
  | PockettMetaProject
  | PockettMetaDocument

/**
 * Operations needed to migrate a workspace root folder from one location to another.
 * Separate from IConnectorStorageAdapter and IConnectorPermissionAdapter — migration is
 * a one-shot admin operation, not a per-request concern. Only implemented for providers
 * that support server-side file moves (Google Drive, OneDrive). Implement as a no-op
 * or throw for providers that don't support it.
 */
export interface IConnectorMigrationAdapter {
  /** List the IDs of all direct children (one level deep) of a folder. */
  listTopLevelChildren(connectionId: string, parentFolderId: string): Promise<string[]>
  /** List direct children with both id and name for progress tracking. */
  listTopLevelChildrenWithNames(connectionId: string, parentFolderId: string): Promise<{ id: string; name: string }[]>
  /**
   * Resolve the breadcrumb path for a folder (e.g. ["My Drive", "firma", "workspace_abc"]).
   * Walks up the parent chain from the folder to the drive root.
   * Returns at most maxDepth+1 segments to avoid unbounded Drive API calls.
   */
  getFolderBreadcrumb(connectionId: string, folderId: string): Promise<string[]>
  /**
   * Move a batch of items from oldParentFolderId to newParentFolderId.
   * Returns failures for partial-failure tracking — does not throw on individual item errors.
   */
  moveBatch(
    connectionId: string,
    fileIds: string[],
    oldParentFolderId: string,
    newParentFolderId: string
  ): Promise<{ failures: { id: string; error: string }[] }>
  /**
   * Inspect the new root folder and persist PERSONAL vs SHARED on the connector record.
   * Called once after all moves complete.
   */
  persistWorkspaceRootLocation(connectionId: string, rootFolderId: string): Promise<void>
}

/** Minimal file/folder metadata returned by connectors. Superset of all providers' common fields. */
export interface ConnectorFileMetadata {
  id: string
  name: string
  /** Parent folder IDs (first element is the immediate parent). May be absent for root items. */
  parents?: string[]
  mimeType?: string
  /** Provider-specific: Google Drive shared drive id. Indicates SHARED location when non-null. */
  driveId?: string | null
}

/** Folder IDs for a project's engagement subfolders, provider-agnostic. */
export interface EngagementFolderIds {
  generalFolderId: string | null
  confidentialFolderId: string | null
  stagingFolderId: string | null
}

/**
 * Provider-agnostic sharing role. Maps to each provider's native role vocabulary
 * inside its adapter implementation (e.g. Google Drive: viewer→reader, editor→writer).
 */
export type ConnectorRole = 'viewer' | 'editor' | 'commenter'

/**
 * Permission operations for connectors that support per-file sharing.
 * Google Drive implements all methods; providers that lack native sharing may return no-ops.
 */
export interface IConnectorPermissionAdapter {
  /** Grant access to a folder for an email address. Returns the permission ID or null. */
  grantFolderPermission(connectionId: string, folderId: string, email: string, role: ConnectorRole): Promise<string | null>
  /** Revoke a permission by its permission ID. */
  revokePermission(connectionId: string, fileId: string, permissionId: string): Promise<boolean>
  /** Downgrade an existing user permission on a folder to viewer. Returns true if the permission was changed. */
  downgradeFolderUserPermissionToReader(connectionId: string, folderId: string, email: string): Promise<boolean>
  /** Get the engagement folder structure (general, confidential, staging) for a project. */
  getEngagementFolderIds(connectionId: string, engagementSlug: string, opts: { projectName?: string; clientSlug?: string; clientName?: string; projectFolderId?: string }): Promise<EngagementFolderIds>
  /** Move a file to trash (soft delete). */
  trashFile(connectionId: string, fileId: string): Promise<void>
  /** List files in a folder. Returns array of file metadata objects. */
  listFiles(connectionId: string, folderId: string, pageSize?: number): Promise<Array<{ id: string; name: string; mimeType?: string }>>
  /** Get metadata for a single file/folder. Returns null if not found. */
  getFileMetadata(connectionId: string, fileId: string): Promise<ConnectorFileMetadata | null>
  /** Grant access to a single file (not its folder) for an email address. Returns the permission ID or null. */
  grantFilePermission(connectionId: string, fileId: string, email: string, role: ConnectorRole, opts?: { notify?: boolean; message?: string }): Promise<string | null>
  /** List permissions currently set on a single file. */
  listFilePermissions(connectionId: string, fileId: string): Promise<Array<{ id: string; email: string | null; role: ConnectorRole }>>
  /** Delete a file. permanent:true bypasses trash (irreversible); omitted/false trashes it (same as trashFile). */
  deleteFile(connectionId: string, fileId: string, opts?: { permanent?: boolean }): Promise<void>
}

/**
 * Thrown by IConnectorContentAdapter methods for known failure modes so callers can map
 * them to specific HTTP responses without inspecting provider-specific error shapes.
 * - not_found: the file doesn't exist or was deleted
 * - forbidden: the connected account lacks access to the file
 * - unsupported: the file's type/state cannot be rendered (e.g. no export path available)
 */
export class ConnectorContentError extends Error {
  constructor(
    public readonly code: 'not_found' | 'forbidden' | 'unsupported',
    message: string,
    public readonly mimeType?: string
  ) {
    super(message)
    this.name = 'ConnectorContentError'
  }
}

/**
 * File-content lifecycle operations: create/overwrite bytes, resumable uploads, and
 * rendering a file as native bytes or a PDF export. Separate from IConnectorStorageAdapter
 * (which is folder-structure-oriented) and IConnectorPermissionAdapter (sharing-oriented).
 * Provider-specific format-conversion quirks (e.g. Google Docs export, Drive shortcut/stub
 * resolution) are hidden inside each adapter's implementation, not exposed on this interface.
 */
export interface IConnectorContentAdapter {
  /** Create a new file with binary content in a folder. Returns the created file's id. */
  createFile(connectionId: string, folderId: string, fileName: string, content: Buffer, mimeType: string): Promise<{ id: string }>
  /** Overwrite an existing file's content in place. */
  overwriteFileContent(connectionId: string, fileId: string, content: Buffer, mimeType: string): Promise<void>
  /** Begin a resumable/chunked upload session for large files. Returns an upload URL to PUT bytes to. */
  createUploadSession(connectionId: string, folderId: string, fileName: string, mimeType: string, opts?: { fileId?: string }): Promise<{ uploadUrl: string }>
  /**
   * Get renderable content for a file: either its native bytes (with provider export-format
   * conversion applied where applicable, e.g. Google Docs -> docx) or a PDF export.
   * Resolves provider-specific indirection (e.g. Drive shortcuts, .gdoc/.gsheet stubs)
   * internally — callers never see those details. Throws ConnectorContentError for
   * not_found/forbidden/unsupported so callers can map to specific HTTP responses.
   */
  getRenderableContent(connectionId: string, fileId: string, format: 'native' | 'pdf'): Promise<{ stream: ReadableStream | Buffer; mimeType: string; fileName: string; size?: string }>
  /**
   * Get the best available representation of a file for inline browser preview: raw bytes
   * for types the browser can render natively (PDF, images), PDF-converted bytes otherwise
   * (Office/Workspace docs). Distinct from getRenderableContent(format) — this method decides
   * the format itself rather than the caller dictating it, since "best for inline viewing" is
   * a different question than "give me exactly this format." Throws ConnectorContentError with
   * code 'unsupported' (plus mimeType) when no inline-viewable representation exists.
   */
  getPreviewableContent(connectionId: string, fileId: string): Promise<{ stream: ReadableStream | Buffer; mimeType: string; fileName: string }>
  /**
   * Toggle copy/download restriction on a file, if the provider supports it.
   * Resolves silently as a no-op for providers without an equivalent concept.
   */
  setCopyRestricted(connectionId: string, fileId: string, restricted: boolean): Promise<void>
}

/**
 * Storage-agnostic operations required for Pockett folder structure (detect, setup, import, ensure).
 * Each connector (Google Drive, Dropbox, OneDrive) implements this.
 */
export interface IConnectorStorageAdapter {
  listFolderChildren(connectionId: string, folderId: string): Promise<Array<{ id: string; name: string; appProperties?: Record<string, string> }>>
  readFileContent(connectionId: string, fileId: string): Promise<string | null>
  writeFile(connectionId: string, parentFolderId: string, fileName: string, content: string, mimeType?: string): Promise<void>
  /** Optional: upload binary content (e.g. images). Falls back to writeFile with string if not implemented. */
  writeFileBinary?(connectionId: string, parentFolderId: string, fileName: string, buffer: Buffer, mimeType: string): Promise<void>
  createFolder(connectionId: string, parentFolderId: string, name: string): Promise<string>
  findOrCreateFolder(connectionId: string, parentFolderId: string, name: string): Promise<string>
  getFileParent(connectionId: string, fileId: string): Promise<string | null>
  getFolderName(connectionId: string, folderId: string): Promise<string | null>
  fileExists(connectionId: string, fileId: string): Promise<boolean>
  search(connectionId: string, query: string): Promise<Array<{ id: string; name: string }>>

  /** Optional: restrict folder to owner-only (e.g. Drive permissions). No-op if not supported. */
  restrictFolderToOwnerOnly?(connectionId: string, folderId: string): Promise<void>
}
