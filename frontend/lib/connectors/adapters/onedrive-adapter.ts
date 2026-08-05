/**
 * Microsoft Graph implementation of IConnectorStorageAdapter (OneDrive/SharePoint).
 * Used by the Pockett structure service for folder structure and meta.json operations.
 *
 * Base drive endpoint is resolved per-connection: /me/drive for Personal (OneDrive), or
 * /sites/{siteId}/drive for Shared (SharePoint) — siteId comes from
 * Connector.workspaceRootSharedStorageId, mirroring how the Google adapter's caller resolves
 * shared-drive vs personal scope via the connection record.
 */

import { prisma } from '@/lib/prisma'
import { WorkspaceRootLocation, type Connector } from '@prisma/client'
import type { IConnectorStorageAdapter } from '../types'

const GRAPH_API = 'https://graph.microsoft.com/v1.0'

export type GetAccessToken = (connectionId: string) => Promise<string>

async function resolveDriveBase(connectionId: string): Promise<string> {
  const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
  if (!connector) throw new Error('Connection not found')
  if (connector.workspaceRootLocation === WorkspaceRootLocation.SHARED && connector.workspaceRootSharedStorageId) {
    return `${GRAPH_API}/sites/${connector.workspaceRootSharedStorageId}/drive`
  }
  return `${GRAPH_API}/me/drive`
}

async function graphFetch(token: string, url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body && !(init.body instanceof ArrayBuffer) && !(init.body instanceof Uint8Array)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...init?.headers,
    },
  })
}

export function createOneDriveAdapter(getAccessToken: GetAccessToken): IConnectorStorageAdapter {
  async function auth(connectionId: string) {
    return getAccessToken(connectionId)
  }

  return {
    async listFolderChildren(connectionId, folderId) {
      const [token, base] = await Promise.all([auth(connectionId), resolveDriveBase(connectionId)])
      const res = await graphFetch(token, `${base}/items/${folderId}/children?$select=id,name`)
      if (!res.ok) return []
      const data = await res.json()
      return (data.value || []).map((f: { id: string; name: string }) => ({ id: f.id, name: f.name }))
    },

    async readFileContent(connectionId, fileId) {
      const [token, base] = await Promise.all([auth(connectionId), resolveDriveBase(connectionId)])
      const res = await graphFetch(token, `${base}/items/${fileId}/content`)
      if (!res.ok) return null
      return res.text()
    },

    async writeFile(connectionId, parentFolderId, fileName, content, mimeType) {
      const [token, base] = await Promise.all([auth(connectionId), resolveDriveBase(connectionId)])
      const res = await graphFetch(
        token,
        `${base}/items/${parentFolderId}:/${encodeURIComponent(fileName)}:/content`,
        { method: 'PUT', headers: { 'Content-Type': mimeType || 'application/json' }, body: content }
      )
      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Failed to write ${fileName}: ${res.status} - ${err}`)
      }
    },

    async writeFileBinary(connectionId, parentFolderId, fileName, buffer, mimeType) {
      const [token, base] = await Promise.all([auth(connectionId), resolveDriveBase(connectionId)])
      const res = await graphFetch(
        token,
        `${base}/items/${parentFolderId}:/${encodeURIComponent(fileName)}:/content`,
        { method: 'PUT', headers: { 'Content-Type': mimeType }, body: new Uint8Array(buffer) }
      )
      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Failed to write ${fileName}: ${res.status} - ${err}`)
      }
    },

    async createFolder(connectionId, parentFolderId, name) {
      const [token, base] = await Promise.all([auth(connectionId), resolveDriveBase(connectionId)])
      const res = await graphFetch(token, `${base}/items/${parentFolderId}/children`, {
        method: 'POST',
        body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' }),
      })
      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Failed to create folder ${name}: ${res.status} - ${err}`)
      }
      const data = await res.json()
      return data.id
    },

    async findOrCreateFolder(connectionId, parentFolderId, name) {
      const [token, base] = await Promise.all([auth(connectionId), resolveDriveBase(connectionId)])
      const listRes = await graphFetch(token, `${base}/items/${parentFolderId}/children?$select=id,name,folder`)
      if (listRes.ok) {
        const data = await listRes.json()
        const existing = (data.value || []).find((f: { name: string; folder?: unknown }) => f.name === name && f.folder)
        if (existing) return existing.id
      }
      const createRes = await graphFetch(token, `${base}/items/${parentFolderId}/children`, {
        method: 'POST',
        body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
      })
      if (!createRes.ok) {
        // Conflict (already exists, race) — re-list and return the winner.
        const retryList = await graphFetch(token, `${base}/items/${parentFolderId}/children?$select=id,name,folder`)
        if (retryList.ok) {
          const data = await retryList.json()
          const existing = (data.value || []).find((f: { name: string; folder?: unknown }) => f.name === name && f.folder)
          if (existing) return existing.id
        }
        const err = await createRes.text()
        throw new Error(`Failed to create folder ${name}: ${createRes.status} - ${err}`)
      }
      const created = await createRes.json()
      return created.id
    },

    async getFileParent(connectionId, fileId) {
      const [token, base] = await Promise.all([auth(connectionId), resolveDriveBase(connectionId)])
      const res = await graphFetch(token, `${base}/items/${fileId}?$select=parentReference`)
      if (!res.ok) return null
      const data = await res.json()
      return data.parentReference?.id ?? null
    },

    async getFolderName(connectionId, folderId) {
      const [token, base] = await Promise.all([auth(connectionId), resolveDriveBase(connectionId)])
      const res = await graphFetch(token, `${base}/items/${folderId}?$select=name`)
      if (!res.ok) return null
      const data = await res.json()
      return data.name ?? null
    },

    async fileExists(connectionId, fileId) {
      const [token, base] = await Promise.all([auth(connectionId), resolveDriveBase(connectionId)])
      const res = await graphFetch(token, `${base}/items/${fileId}?$select=id`)
      return res.status === 200
    },

    async search(connectionId, query) {
      const [token, base] = await Promise.all([auth(connectionId), resolveDriveBase(connectionId)])
      const res = await graphFetch(token, `${base}/root/search(q='${encodeURIComponent(query)}')?$select=id,name`)
      if (!res.ok) return []
      const data = await res.json()
      return (data.value || []).map((f: { id: string; name: string }) => ({ id: f.id, name: f.name }))
    },
  }
}

/** Exposed for the permission/content adapters and registry so they resolve the same base without duplicating the lookup. */
export async function resolveOneDriveDriveBase(connectionId: string): Promise<string> {
  return resolveDriveBase(connectionId)
}

export function isSharedSiteConnector(connector: Pick<Connector, 'workspaceRootLocation' | 'workspaceRootSharedStorageId'>): boolean {
  return connector.workspaceRootLocation === WorkspaceRootLocation.SHARED && !!connector.workspaceRootSharedStorageId
}
