/**
 * Connector registry: resolve connector instance by type, list connections for a firm (all types), get storage adapter by connection.
 * Enables API/UI to work with multiple connector types (Google Drive, OneDrive, etc.) without hardcoding.
 * To add a new provider: implement IConnectorInstance + IConnectorStorageAdapter, register in getConnectorInstanceByType and getStorageAdapter.
 * Document permission regrant (e.g. open/edit) is provider-specific and can be added as an optional interface extension later.
 */

import { ConnectorType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { IConnectorStorageAdapter, IConnectorPermissionAdapter, IConnectorMigrationAdapter, IConnectorContentAdapter } from './types'
import { createGoogleDriveAdapter } from './adapters/google-drive-adapter'
import { createGoogleDrivePermissionAdapter } from './adapters/google-drive-permission-adapter'
import { createGoogleDriveContentAdapter } from './adapters/google-drive-content-adapter'
import { createOneDriveAdapter } from './adapters/onedrive-adapter'
import { GoogleDriveConnector } from '@/lib/google-drive-connector'
import { getOneDriveConnectorInstance } from './onedrive-connector'

/** Unified connection DTO for API/UI (any provider). */
export interface ConnectorConnection {
  id: string
  type: ConnectorType
  email: string
  name: string
  connectedAt: string
  status: string
  lastSyncAt?: string
}

/** Full connector interface: OAuth, list files, permissions, etc. Registry returns this by type. */
export interface IConnectorInstance {
  getConnections(organizationId: string): Promise<ConnectorConnection[]>
  disconnectConnection(connectionId: string): Promise<void>
  removeConnection(connectionId: string): Promise<void>
  getAccessToken(connectionId: string): Promise<string | null>
}

const instances: Partial<Record<ConnectorType, IConnectorInstance>> = {}

function getConnectorInstanceByType(type: ConnectorType): IConnectorInstance {
  if (type === ConnectorType.GOOGLE_DRIVE) {
    if (!instances.GOOGLE_DRIVE) {
      instances.GOOGLE_DRIVE = GoogleDriveConnector.getInstance() as unknown as IConnectorInstance
    }
    return instances.GOOGLE_DRIVE
  }
  if (type === ConnectorType.ONEDRIVE) {
    if (!instances.ONEDRIVE) {
      instances.ONEDRIVE = getOneDriveConnectorInstance()
    }
    return instances.ONEDRIVE
  }
  throw new Error(`Unsupported connector type: ${type}`)
}

/**
 * Get the full connector instance for a given type (for OAuth, listFiles, permissions, etc.).
 */
export function getConnectorInstance(type: ConnectorType): IConnectorInstance {
  return getConnectorInstanceByType(type)
}

const CONNECTOR_SELECT = {
  id: true,
  type: true,
  name: true,
  externalAccountId: true,
  settings: true,
  createdAt: true,
  status: true,
  lastSyncAt: true,
} as const

function mapConnectorToConnection(c: {
  id: string
  type: ConnectorType
  name: string | null
  externalAccountId: string
  settings: unknown
  createdAt: Date
  status: string
  lastSyncAt: Date | null
}): ConnectorConnection {
  const settings = (c.settings || {}) as { accountEmail?: string }
  const stored = settings.accountEmail?.trim()
  const email =
    stored && stored.includes('@')
      ? stored
      : c.externalAccountId.includes('@')
        ? c.externalAccountId
        : ''
  return {
    id: c.id,
    type: c.type,
    email,
    name: c.name ?? '',
    connectedAt: c.createdAt.toISOString().split('T')[0],
    status: c.status,
    lastSyncAt: c.lastSyncAt?.toISOString(),
  }
}

/**
 * List all connections for an organization (all connector types).
 * Unions the legacy connectorId FK relation and the new firmId-linked connectors
 * to ensure both old and new OAuth flows surface in the UI.
 */
export async function getConnections(organizationId: string): Promise<ConnectorConnection[]> {
  const org = await prisma.firm.findUnique({
    where: { id: organizationId },
    include: {
      connector: { select: CONNECTOR_SELECT },
      connectors: { select: CONNECTOR_SELECT },
    },
  })

  if (!org) return []

  // Union legacy + new model, dedupe by id (a connector may appear in both if firmId was back-filled)
  const seen = new Set<string>()
  const all = [...(org.connectors ?? []), ...(org.connector ? [org.connector] : [])]
  const deduped = all.filter((c) => {
    if (seen.has(c.id)) return false
    seen.add(c.id)
    return true
  })

  return deduped.map(mapConnectorToConnection)
}

/**
 * List all connections for a client (all connector types).
 */
export async function getClientConnections(clientId: string): Promise<ConnectorConnection[]> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { connector: { select: CONNECTOR_SELECT } },
  })
  if (!client?.connector) return []
  return [mapConnectorToConnection(client.connector)]
}

/**
 * Get the storage adapter for a connection (by connector id). Used by pockett-structure and callers that need folder/file ops.
 */
export async function getStorageAdapter(connectionId: string): Promise<IConnectorStorageAdapter> {
  const connector = await prisma.connector.findUnique({
    where: { id: connectionId }
  })
  if (!connector) throw new Error('Connection not found')
  if (connector.type === ConnectorType.GOOGLE_DRIVE) {
    const g = GoogleDriveConnector.getInstance()
    return createGoogleDriveAdapter(async (id) => {
      const token = await g.getAccessToken(id)
      if (!token) throw new Error('Could not get access token')
      return token
    })
  }
  if (connector.type === ConnectorType.ONEDRIVE) {
    const one = getOneDriveConnectorInstance()
    return createOneDriveAdapter(async (id) => {
      const token = await one.getAccessToken(id)
      if (!token) throw new Error('Could not get access token')
      return token
    })
  }
  throw new Error(`No storage adapter for connector type: ${connector.type}`)
}

/**
 * Disconnect or remove a connection using the appropriate connector instance.
 */
export async function disconnectConnection(connectionId: string): Promise<void> {
  const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
  if (!connector) throw new Error('Connection not found')
  const instance = getConnectorInstance(connector.type)
  await instance.disconnectConnection(connectionId)
}

/**
 * @deprecated Do not call this directly — it bypasses all FK cleanup.
 * Use `removeConnector` from `lib/actions/connectors` instead.
 */
export async function removeConnection(_connectionId: string): Promise<void> {
  throw new Error(
    '[removeConnection] Bypassed — use removeConnector() from lib/actions/connectors for all connector removal.'
  )
}

/**
 * Get the permission adapter for a connection (by connector id).
 * Returns null when the connector type has no permission adapter (e.g. OneDrive — not yet
 * implemented). Callers must skip gracefully rather than assume an adapter is always present.
 * Throws only when the connection record itself is missing (data integrity error).
 */
export async function getPermissionAdapter(connectionId: string): Promise<IConnectorPermissionAdapter | null> {
  const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
  if (!connector) throw new Error('Connection not found')
  if (connector.type === ConnectorType.GOOGLE_DRIVE) {
    return createGoogleDrivePermissionAdapter()
  }
  return null
}

/**
 * Get the content adapter for a connection (by connector id).
 * Covers file-content lifecycle: create/overwrite bytes, resumable uploads, and rendering
 * a file as native bytes or a PDF export. Returns null when the connector type has no
 * content adapter (e.g. OneDrive — not yet implemented). Callers must skip gracefully.
 */
export async function getContentAdapter(connectionId: string): Promise<IConnectorContentAdapter | null> {
  const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
  if (!connector) throw new Error('Connection not found')
  if (connector.type === ConnectorType.GOOGLE_DRIVE) {
    return createGoogleDriveContentAdapter()
  }
  return null
}

/**
 * Get the migration adapter for a connection (by connector id).
 * Provides provider-agnostic access to workspace root migration ops:
 * listing top-level children, moving file batches, and persisting the new root location.
 * estimate-migration is intentionally NOT on this interface — it is Drive-query-specific
 * and stays behind a connector-type guard in the API route.
 */
export async function getMigrationAdapter(connectionId: string): Promise<IConnectorMigrationAdapter> {
  const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
  if (!connector) throw new Error('Connection not found')
  if (connector.type === ConnectorType.GOOGLE_DRIVE) {
    const g = GoogleDriveConnector.getInstance()
    return {
      listTopLevelChildren: (id, parentFolderId) => g.listTopLevelChildren(id, parentFolderId),
      listTopLevelChildrenWithNames: (id, parentFolderId) => g.listTopLevelChildrenWithNames(id, parentFolderId),
      getFolderBreadcrumb: (id, folderId) => g.getFolderBreadcrumb(id, folderId),
      moveBatch: async (id, fileIds, oldParent, newParent) => {
        const result = await g.moveBatch(id, fileIds, oldParent, newParent)
        return { failures: result.failures }
      },
      persistWorkspaceRootLocation: (id, rootFolderId) => g.persistWorkspaceRootLocation(id, rootFolderId),
    }
  }
  throw new Error(`No migration adapter for connector type: ${connector.type}`)
}

/** Connector display metadata for UI (label, icon key, enabled state). */
export interface ConnectorMeta {
  label: string
  iconKey: string
  enabled: boolean
}

/** Return display metadata for a connector type. Used to render tab list data-driven. */
export function getConnectorMeta(type: ConnectorType): ConnectorMeta {
  switch (type) {
    case ConnectorType.GOOGLE_DRIVE:
      return { label: 'Google Drive', iconKey: 'google-drive', enabled: true }
    case ConnectorType.ONEDRIVE:
      return { label: 'OneDrive', iconKey: 'onedrive', enabled: false }
    case ConnectorType.DROPBOX:
      return { label: 'Dropbox', iconKey: 'dropbox', enabled: false }
    case ConnectorType.BOX:
      return { label: 'Box', iconKey: 'box', enabled: false }
    default:
      return { label: String(type), iconKey: String(type).toLowerCase(), enabled: false }
  }
}
