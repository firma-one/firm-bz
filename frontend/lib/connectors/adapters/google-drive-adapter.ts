/**
 * Google Drive implementation of the connector storage adapter.
 * Used by the Pockett structure service for folder structure and meta.json operations.
 */

import { METADATA_FOLDER_NAME, type IConnectorStorageAdapter } from '../types'

const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const DRIVE_OPTS = 'supportsAllDrives=true&includeItemsFromAllDrives=true'

export type GetAccessToken = (connectionId: string) => Promise<string>
type DriveFolderRow = { id: string; createdTime?: string }

function buildFolderQuery(parentFolderId: string, name: string): string {
  return `mimeType = '${DRIVE_FOLDER_MIME}' and name = '${name.replace(/'/g, "\\'")}' and trashed = false and '${parentFolderId}' in parents`
}

function pickCanonicalFolderId(folders: DriveFolderRow[]): string | null {
  if (!folders.length) return null
  const sorted = [...folders].sort((a, b) => {
    const aTime = a.createdTime ?? ''
    const bTime = b.createdTime ?? ''
    if (aTime === bTime) return a.id.localeCompare(b.id)
    return aTime.localeCompare(bTime)
  })
  return sorted[0]?.id ?? null
}

async function searchFoldersByName(token: string, parentFolderId: string, name: string): Promise<DriveFolderRow[]> {
  const q = buildFolderQuery(parentFolderId, name)
  const res = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,createdTime)&orderBy=createdTime asc&${DRIVE_OPTS}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) return []
  const data = await res.json()
  return (data.files || []).map((f: DriveFolderRow) => ({ id: f.id, createdTime: f.createdTime }))
}

async function deleteFolderIfExists(token: string, folderId: string): Promise<void> {
  const res = await fetch(`${DRIVE_API}/files/${folderId}?${DRIVE_OPTS}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok && res.status !== 404) {
    const err = await res.text()
    throw new Error(`Failed to delete duplicate folder ${folderId}: ${res.status} - ${err}`)
  }
}

export function createGoogleDriveAdapter(getAccessToken: GetAccessToken): IConnectorStorageAdapter {
  async function auth(connectionId: string) {
    return getAccessToken(connectionId)
  }

  return {
    async listFolderChildren(connectionId: string, folderId: string): Promise<Array<{ id: string; name: string; mimeType?: string }>> {
      const token = await auth(connectionId)
      const q = `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`
      const res = await fetch(
        `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)&${DRIVE_OPTS}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) return []
      const data = await res.json()
      return (data.files || []).map((f: { id: string; name: string; mimeType?: string }) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType
      }))
    },

    async readFileContent(connectionId: string, fileId: string): Promise<string | null> {
      const token = await auth(connectionId)
      const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media&${DRIVE_OPTS}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) return null
      return res.text()
    },

    async writeFile(connectionId: string, parentFolderId: string, fileName: string, content: string, mimeType?: string): Promise<void> {
      const token = await auth(connectionId)
      const children = await listFolderChildrenInternal(token, parentFolderId)
      const existing = children.find((f) => f.name === fileName)
      const contentType = mimeType || 'application/json'
      if (existing) {
        const patchRes = await fetch(
          `${DRIVE_UPLOAD}/files/${existing.id}?uploadType=media&${DRIVE_OPTS}`,
          {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
            body: content
          }
        )
        if (!patchRes.ok) {
          const err = await patchRes.text()
          throw new Error(`Failed to update ${fileName}: ${patchRes.status} - ${err}`)
        }
        return
      }
      const boundary = '-------pockett-meta-314159'
      const delimiter = `\r\n--${boundary}\r\n`
      const metadataPart = JSON.stringify({
        name: fileName,
        mimeType: contentType,
        parents: [parentFolderId]
      })
      const multipartBody =
        `${delimiter}Content-Type: application/json\r\n\r\n${metadataPart}` +
        `${delimiter}Content-Type: ${contentType}\r\n\r\n${content}\r\n--${boundary}--`
      const createRes = await fetch(`${DRIVE_UPLOAD}/files?uploadType=multipart&${DRIVE_OPTS}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: multipartBody
      })
      if (!createRes.ok) {
        const err = await createRes.text()
        throw new Error(`Failed to create ${fileName}: ${createRes.status} - ${err}`)
      }
    },

    async writeFileBinary(connectionId: string, parentFolderId: string, fileName: string, buffer: Buffer, mimeType: string): Promise<void> {
      const token = await auth(connectionId)
      const children = await listFolderChildrenInternal(token, parentFolderId)
      const existing = children.find((f) => f.name === fileName)
      if (existing) {
        const patchRes = await fetch(
          `${DRIVE_UPLOAD}/files/${existing.id}?uploadType=media&${DRIVE_OPTS}`,
          {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': mimeType },
            body: new Uint8Array(buffer)
          }
        )
        if (!patchRes.ok) {
          const err = await patchRes.text()
          throw new Error(`Failed to update ${fileName}: ${patchRes.status} - ${err}`)
        }
        return
      }
      const boundary = '-------pockett-meta-314159'
      const delimiter = `\r\n--${boundary}\r\n`
      const metadataPart = JSON.stringify({
        name: fileName,
        mimeType,
        parents: [parentFolderId]
      })
      const part1 = `${delimiter}Content-Type: application/json\r\n\r\n${metadataPart}${delimiter}Content-Type: ${mimeType}\r\n\r\n`
      const body = Buffer.concat([
        Buffer.from(part1, 'utf8'),
        buffer,
        Buffer.from(`\r\n--${boundary}--`, 'utf8')
      ])
      const createRes = await fetch(`${DRIVE_UPLOAD}/files?uploadType=multipart&${DRIVE_OPTS}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: new Uint8Array(body)
      })
      if (!createRes.ok) {
        const err = await createRes.text()
        throw new Error(`Failed to create ${fileName}: ${createRes.status} - ${err}`)
      }
    },

    async createFolder(connectionId: string, parentFolderId: string, name: string): Promise<string> {
      const token = await auth(connectionId)
      const res = await fetch(`${DRIVE_API}/files?${DRIVE_OPTS}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          mimeType: DRIVE_FOLDER_MIME,
          parents: [parentFolderId]
        })
      })
      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Failed to create folder ${name}: ${res.status} - ${err}`)
      }
      const data = await res.json()
      return data.id
    },

    async findOrCreateFolder(connectionId: string, parentFolderId: string, name: string): Promise<string> {
      const token = await auth(connectionId)
      const existingFolders = await searchFoldersByName(token, parentFolderId, name)
      const canonicalExistingId = pickCanonicalFolderId(existingFolders)
      if (canonicalExistingId) {
        if (name === METADATA_FOLDER_NAME && existingFolders.length > 1) {
          await Promise.all(
            existingFolders
              .map((f) => f.id)
              .filter((id) => id !== canonicalExistingId)
              .map((id) => deleteFolderIfExists(token, id))
          )
        }
        return canonicalExistingId
      }
      const createRes = await fetch(`${DRIVE_API}/files?${DRIVE_OPTS}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          mimeType: DRIVE_FOLDER_MIME,
          parents: [parentFolderId]
        })
      })
      if (!createRes.ok) {
        const err = await createRes.text()
        throw new Error(`Failed to create folder ${name}: ${createRes.status} - ${err}`)
      }
      const created = await createRes.json() as { id?: string }
      const foldersAfterCreate = await searchFoldersByName(token, parentFolderId, name)
      const canonicalAfterCreateId = pickCanonicalFolderId(foldersAfterCreate)

      // Race-safe behavior: if two callers create the same folder concurrently, keep one canonical folder.
      if (name === METADATA_FOLDER_NAME && foldersAfterCreate.length > 1 && canonicalAfterCreateId) {
        await Promise.all(
          foldersAfterCreate
            .map((f) => f.id)
            .filter((id) => id !== canonicalAfterCreateId)
            .map((id) => deleteFolderIfExists(token, id))
        )
      }

      if (canonicalAfterCreateId) return canonicalAfterCreateId
      if (created.id) return created.id
      throw new Error(`Failed to resolve folder id for ${name}`)
    },

    async getFileParent(connectionId: string, fileId: string): Promise<string | null> {
      const token = await auth(connectionId)
      const res = await fetch(`${DRIVE_API}/files/${fileId}?fields=parents&${DRIVE_OPTS}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) return null
      const data = await res.json()
      const parents = data.parents
      return Array.isArray(parents) && parents.length > 0 ? parents[0] : null
    },

    async getFolderName(connectionId: string, folderId: string): Promise<string | null> {
      const token = await auth(connectionId)
      const res = await fetch(`${DRIVE_API}/files/${folderId}?fields=name&${DRIVE_OPTS}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) return null
      const data = await res.json()
      return data.name || null
    },

    async fileExists(connectionId: string, fileId: string): Promise<boolean> {
      const token = await auth(connectionId)
      const res = await fetch(`${DRIVE_API}/files/${fileId}?fields=id&${DRIVE_OPTS}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      return res.status === 200
    },

    async restrictFolderToOwnerOnly(connectionId: string, folderId: string): Promise<void> {
      const token = await auth(connectionId)
      const listRes = await fetch(
        `${DRIVE_API}/files/${folderId}/permissions?fields=permissions(id,role,type,emailAddress)&${DRIVE_OPTS}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!listRes.ok) return
      const listData = await listRes.json()
      const permissions = listData.permissions || []
      const toRemove = permissions.filter((p: { role: string }) => p.role !== 'owner')
      await Promise.all(
        toRemove.map((p: { id: string }) =>
          fetch(`${DRIVE_API}/files/${folderId}/permissions/${p.id}?${DRIVE_OPTS}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          })
        )
      )
    },

    async search(connectionId: string, query: string): Promise<Array<{ id: string; name: string }>> {
      const token = await auth(connectionId)
      const res = await fetch(
        `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name)&${DRIVE_OPTS}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) return []
      const data = await res.json()
      return (data.files || []).map((f: { id: string; name: string }) => ({ id: f.id, name: f.name }))
    }
  }
}

async function listFolderChildrenInternal(
  token: string,
  folderId: string
): Promise<Array<{ id: string; name: string; mimeType?: string }>> {
  const q = `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`
  const res = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)&${DRIVE_OPTS}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) return []
  const data = await res.json()
  return (data.files || []).map((f: { id: string; name: string; mimeType?: string }) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType
  }))
}
