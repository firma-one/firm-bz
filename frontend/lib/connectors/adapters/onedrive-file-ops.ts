/**
 * OneDrive/SharePoint file-management operations (move, rename, copy, recursive copy,
 * ensure-folder-path) used by app/api/connectors/google-drive/linked-files/route.ts.
 * Mirrors GoogleDriveConnector's moveFile/renameFile/copyFile/recursiveCopy/ensureFolderPath
 * method contracts so the route's call sites branch cleanly by provider.
 *
 * Key protocol difference from Drive: Graph's copy (POST /items/{id}/copy) is asynchronous
 * (202 Accepted + Location header to poll) and — unlike Drive, which only copies a single
 * file/folder shallowly — natively copies an entire folder tree server-side. recursiveCopy
 * here is therefore a thin wrapper around one Graph copy call, not a manual walk.
 */

import { logger } from '@/lib/logger'
import { OneDriveConnector } from '@/lib/connectors/onedrive-connector'
import { storageFailure, storageFailureFromResponse } from '@/lib/connectors/storage-failure'
import { resolveOneDriveDriveBase } from './onedrive-adapter'

const oneDrive = OneDriveConnector.getInstance()

const COPY_POLL_MS = 1000

async function auth(connectionId: string): Promise<string> {
  const token = await oneDrive.getAccessToken(connectionId)
  if (!token) throw new Error('Could not get OneDrive access token')
  return token
}

/** The token and drive to call OneDrive with. Not getting them means the connection needs renewing. */
async function connect(connectionId: string): Promise<{ token: string; base: string }> {
  try {
    const [token, base] = await Promise.all([auth(connectionId), resolveOneDriveDriveBase(connectionId)])
    return { token, base }
  } catch (error) {
    logger.error('Failed to get a OneDrive connection', error as Error)
    throw storageFailure('reconnect', 'OneDrive')
  }
}

async function call(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (error) {
    logger.error('Failed to reach OneDrive', error as Error)
    throw storageFailure('unreachable', 'OneDrive')
  }
}

/** Throws a StorageFailure saying why, when OneDrive refuses, as do the others here. */
export async function moveOneDriveFile(connectionId: string, fileId: string, newParentId: string): Promise<{ id: string }> {
  const { token, base } = await connect(connectionId)
  const res = await call(`${base}/items/${fileId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ parentReference: { id: newParentId } }),
  })
  if (!res.ok) throw await storageFailureFromResponse(res, 'OneDrive', 'move a file')
  const data = await res.json()
  return { id: data.id }
}

export async function renameOneDriveFile(connectionId: string, fileId: string, newName: string): Promise<{ id: string; name: string }> {
  const trimmed = newName.trim()
  if (!trimmed) throw storageFailure('invalid_name', 'OneDrive')
  const { token, base } = await connect(connectionId)
  const res = await call(`${base}/items/${fileId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: trimmed }),
  })
  if (!res.ok) throw await storageFailureFromResponse(res, 'OneDrive', 'rename a file')
  const data = await res.json()
  return { id: data.id, name: data.name }
}

/**
 * Copy a file or folder (recursively, for folders — native Graph behavior). Polls the
 * monitor URL Graph returns until the async copy completes, then resolves the new item's id
 * by name-matching in the destination folder (Graph's copy monitor doesn't reliably return
 * the new item id in all API versions, so this mirrors the safest documented pattern).
 */
export async function copyOneDriveFile(
  connectionId: string,
  fileId: string,
  parentId: string,
  name?: string
): Promise<{ id: string }> {
  const { token, base } = await connect(connectionId)
  const body: { parentReference: { id: string }; name?: string } = { parentReference: { id: parentId } }
  if (name) body.name = name

  const res = await call(`${base}/items/${fileId}/copy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.status !== 202) throw await storageFailureFromResponse(res, 'OneDrive', 'copy a file')
  const monitorUrl = res.headers.get('Location')
  if (!monitorUrl) throw storageFailure('other', 'OneDrive', 'it gave no way to follow the copy')

  // Poll the copy-progress monitor (unauthenticated, no bearer token needed — same
  // pre-authorized-URL convention as the upload session and resumable-upload URLs).
  const maxAttempts = 30
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const statusRes = await call(monitorUrl)
    if (statusRes.ok) {
      const status = await statusRes.json()
      if (status.status === 'completed') {
        const resourceId: string | undefined = status.resourceId
        if (resourceId) return { id: resourceId }
        break // fall through to name-match lookup below
      }
      if (status.status === 'failed') {
        const said = status.error?.message as string | undefined
        logger.error('OneDrive async copy failed', new Error(said || 'copy failed'))
        throw storageFailure('other', 'OneDrive', said || 'the copy failed partway')
      }
    }
    await new Promise((r) => setTimeout(r, COPY_POLL_MS))
  }

  // Fallback: resolve by name in the destination folder (copy completed but resourceId
  // wasn't in the final status payload).
  const destName = name ?? (await getFileName(connectionId, fileId).catch(() => null)) ?? undefined
  if (!destName) throw storageFailure('timed_out', 'OneDrive')
  const listRes = await call(`${base}/items/${parentId}/children?$select=id,name`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!listRes.ok) throw storageFailure('timed_out', 'OneDrive')
  const listData = await listRes.json()
  const match = (listData.value || []).find((f: { name: string }) => f.name === destName)
  if (!match) throw storageFailure('timed_out', 'OneDrive')
  return { id: match.id }
}

async function getFileName(connectionId: string, fileId: string): Promise<string | null> {
  const [token, base] = await Promise.all([auth(connectionId), resolveOneDriveDriveBase(connectionId)])
  const res = await fetch(`${base}/items/${fileId}?$select=name`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return null
  return (await res.json()).name ?? null
}

/**
 * Recursive copy for cross-engagement folder copy. Graph's copy is natively recursive for
 * folders, so this is a single API call rather than a manual walk (unlike Drive's
 * recursiveCopy, which must walk children itself). Returns a single-item array describing
 * the copied root (folder or file) — callers only use the count/ids for indexing, and Graph
 * doesn't enumerate the full copied tree in its response, so nested items are not individually
 * indexed here (documented gap vs Google's per-item indexing — see plan doc's OPEN gaps list).
 */
export async function recursiveCopyOneDrive(
  connectionId: string,
  fileId: string,
  targetParentId: string
): Promise<{ id: string; name: string }[]> {
  const name = await getFileName(connectionId, fileId).catch(() => null)
  const result = await copyOneDriveFile(connectionId, fileId, targetParentId, name ?? undefined)
  return [{ id: result.id, name: name ?? 'Copied item' }]
}

/** Find or create a path of folders under a parent. Returns the deepest folder's id, or null on failure. */
export async function ensureOneDriveFolderPath(connectionId: string, parentId: string, folderNames: string[]): Promise<string | null> {
  if (!folderNames.length) return parentId
  try {
    const { createOneDriveAdapter } = await import('./onedrive-adapter')
    const adapter = createOneDriveAdapter(async (id) => auth(id))
    let currentParentId = parentId
    for (const name of folderNames) {
      if (!name.trim()) continue
      currentParentId = await adapter.findOrCreateFolder(connectionId, currentParentId, name.trim())
    }
    return currentParentId
  } catch (error) {
    logger.error('Failed to ensure OneDrive folder path', error as Error)
    return null
  }
}
