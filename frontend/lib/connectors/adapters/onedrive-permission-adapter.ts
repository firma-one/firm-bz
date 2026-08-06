/**
 * Microsoft Graph implementation of IConnectorPermissionAdapter (OneDrive/SharePoint).
 * Wraps Graph /invite, /permissions endpoints behind the provider-agnostic interface.
 *
 * Known Graph-vs-Drive capability gaps (documented, not bugs — see
 * .claude/plans/connector-microsoft-impl.md Phase 2):
 * - Graph has no native comment-only role; ConnectorRole 'commenter' maps to 'read'.
 * - Graph's DELETE always goes to the drive/site recycle bin — there is no true hard-delete
 *   via this endpoint, so deleteFile's `permanent` flag has no distinct effect for OneDrive.
 *
 * grantFilePermission's `opts.preventDownload` (item 12, .claude/plans/connector-microsoft-impl.md,
 * 2026-08-06): uses Graph's BETA `createLink` endpoint with `type: 'blocksDownload'` — the only
 * Graph mechanism that blocks a specific user's download of a file. Layering a restrictive link
 * on top of a normal `/invite` grant does NOT work (SharePoint/OneDrive takes the least-restrictive
 * of all grants a user holds), so this replaces the invite grant entirely for that call. Two real,
 * accepted risks: (1) Microsoft's own beta-endpoint policy states "not supported in production";
 * (2) whether download is actually blocked depends on the tenant's SharePoint/OneDrive license and
 * file type (e.g. plain text/video are excluded even when the API call succeeds) — the response is
 * checked for `preventsDownload: true` and a loud warning is logged (falling back to a normal view
 * link, so access itself still works) whenever that can't be confirmed, rather than silently
 * claiming protection that may not be in effect for a given tenant/file.
 */

import { OneDriveConnector } from '@/lib/connectors/onedrive-connector'
import { resolveOneDriveDriveBase } from './onedrive-adapter'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import type { IConnectorPermissionAdapter, EngagementFolderIds, ConnectorRole, ConnectorFileMetadata } from '../types'

const oneDrive = OneDriveConnector.getInstance()
const GRAPH_BETA = 'https://graph.microsoft.com/beta'

/** Swaps a resolved v1.0 drive base URL for its beta equivalent — only createLink's
 * blocksDownload path needs beta; every other call in this file stays on v1.0. */
function toBetaBase(v1Base: string): string {
  return v1Base.replace('https://graph.microsoft.com/v1.0', GRAPH_BETA)
}

/** Maps the provider-agnostic role vocabulary to Graph's native permission roles. */
function toGraphRole(role: ConnectorRole): 'write' | 'read' {
  if (role === 'editor') return 'write'
  return 'read' // viewer and commenter both map to read — Graph has no comment-only role.
}

function fromGraphRole(roles: string[] | undefined): ConnectorRole {
  if (roles?.includes('write') || roles?.includes('owner')) return 'editor'
  return 'viewer'
}

async function auth(connectionId: string): Promise<string> {
  const token = await oneDrive.getAccessToken(connectionId)
  if (!token) throw new Error('Could not get OneDrive access token')
  return token
}

export function createOneDrivePermissionAdapter(): IConnectorPermissionAdapter {
  return {
    async grantFolderPermission(connectionId, folderId, email, role) {
      return grantItemPermission(connectionId, folderId, email, role)
    },

    async revokePermission(connectionId, fileId, permissionId) {
      const [token, base] = await Promise.all([auth(connectionId), resolveOneDriveDriveBase(connectionId)])
      const res = await fetch(`${base}/items/${fileId}/permissions/${permissionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      return res.ok || res.status === 404
    },

    async downgradeFolderUserPermissionToReader(connectionId, folderId, email) {
      const [token, base] = await Promise.all([auth(connectionId), resolveOneDriveDriveBase(connectionId)])
      const listRes = await fetch(`${base}/items/${folderId}/permissions`, { headers: { Authorization: `Bearer ${token}` } })
      if (!listRes.ok) return false
      const data = await listRes.json()
      const perm = (data.value || []).find(
        (p: { grantedToV2?: { user?: { email?: string } } }) =>
          p.grantedToV2?.user?.email?.toLowerCase() === email.toLowerCase()
      )
      if (!perm) return false
      const patchRes = await fetch(`${base}/items/${folderId}/permissions/${perm.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: ['read'] }),
      })
      return patchRes.ok
    },

    async getEngagementFolderIds(connectionId, engagementSlug, _opts): Promise<EngagementFolderIds> {
      // pockett-structure.service's ensureAppFolderStructure (provider-agnostic, already used
      // for OneDrive folder provisioning — see onedrive/route.ts update-root-folder and
      // onedrive/sites/route.ts) always writes engagement subfolder ids into
      // connector.settings.organizations[firmId].projectFolderSettings[slug]. The interface
      // doesn't carry firmId through opts (unlike GoogleDriveConnector's own wider signature),
      // so resolve it from Connector.firmId directly — reliable here since OneDrive connectors
      // are always firm-scoped by the time folders exist. No Drive-listing fallback-discovery
      // is needed (unlike Google's version): OneDrive folders are only ever created via
      // ensureAppFolderStructure, so settings are always the source of truth.
      const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
      if (!connector) return { generalFolderId: null, confidentialFolderId: null, stagingFolderId: null }
      const settings = (connector.settings as Record<string, unknown>) || {}
      const orgId = connector.firmId
      const orgSettings = orgId
        ? ((settings.organizations as Record<string, any>)?.[orgId] || {})
        : settings
      const ps = (orgSettings as any).projectFolderSettings?.[engagementSlug] || {}
      return {
        generalFolderId: ps.generalFolderId ?? null,
        confidentialFolderId: ps.confidentialFolderId ?? null,
        stagingFolderId: ps.stagingFolderId ?? null,
      }
    },

    async trashFile(connectionId, fileId) {
      const [token, base] = await Promise.all([auth(connectionId), resolveOneDriveDriveBase(connectionId)])
      // Graph DELETE moves the item to the drive's recycle bin — no explicit "trashed" flag to set.
      const res = await fetch(`${base}/items/${fileId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      // 404 means the item is already gone — treat as success (idempotent). Any other non-2xx is a real failure.
      if (!res.ok && res.status !== 404) {
        const body = await res.text().catch(() => '')
        if (res.status === 423) {
          throw new Error('This item is locked — it (or a file inside it) is currently open/checked out elsewhere. Close it and try again.')
        }
        throw new Error(`OneDrive trash failed (${res.status}): ${body}`)
      }
    },

    async listFiles(connectionId, folderId, pageSize) {
      const [token, base] = await Promise.all([auth(connectionId), resolveOneDriveDriveBase(connectionId)])
      const top = pageSize ? `&$top=${pageSize}` : ''
      const res = await fetch(`${base}/items/${folderId}/children?$select=id,name,file,folder${top}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return []
      const data = await res.json()
      // mimeType uses Google's folder-mimeType sentinel so provider-agnostic callers that sniff
      // it (e.g. recursive folder walks) keep working — Graph's `file` facet is absent on folders.
      return (data.value || []).map((f: { id: string; name: string; file?: { mimeType?: string }; folder?: unknown }) => ({
        id: f.id,
        name: f.name,
        mimeType: f.file?.mimeType ?? (f.folder ? 'application/vnd.google-apps.folder' : undefined),
      }))
    },

    async getFileMetadata(connectionId, fileId): Promise<ConnectorFileMetadata | null> {
      const [token, base] = await Promise.all([auth(connectionId), resolveOneDriveDriveBase(connectionId)])
      const res = await fetch(`${base}/items/${fileId}?$select=id,name,file,folder,parentReference`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return null
      const data = await res.json()
      return {
        id: data.id,
        name: data.name,
        parents: data.parentReference?.id ? [data.parentReference.id] : undefined,
        // Uses Google's folder-mimeType sentinel so provider-agnostic callers that sniff it
        // (e.g. cross-engagement copy's isFolder check) keep working — Graph's `file` facet
        // is absent on folders.
        mimeType: data.file?.mimeType ?? (data.folder ? 'application/vnd.google-apps.folder' : undefined),
        driveId: data.parentReference?.driveId ?? null,
      }
    },

    async grantFilePermission(connectionId, fileId, email, role, opts) {
      return grantItemPermission(connectionId, fileId, email, role, opts)
    },

    async listFilePermissions(connectionId, fileId) {
      const [token, base] = await Promise.all([auth(connectionId), resolveOneDriveDriveBase(connectionId)])
      const res = await fetch(`${base}/items/${fileId}/permissions`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return []
      const data = await res.json()
      return (data.value || []).map((p: {
        id: string
        roles?: string[]
        // Direct /invite grants populate grantedToV2 (singular); link-type grants (e.g. our
        // createLink(blocksDownload) path — see file header) populate grantedToIdentitiesV2
        // (plural) instead — check both so download-blocked link permissions are still
        // matchable by email (e.g. regrant's duplicate-grant fallback lookup).
        grantedToV2?: { user?: { email?: string } }
        grantedToIdentitiesV2?: Array<{ user?: { email?: string } }>
      }) => ({
        id: p.id,
        email: p.grantedToV2?.user?.email ?? p.grantedToIdentitiesV2?.[0]?.user?.email ?? null,
        role: fromGraphRole(p.roles),
      }))
    },

    async deleteFile(connectionId, fileId, _opts) {
      const [token, base] = await Promise.all([auth(connectionId), resolveOneDriveDriveBase(connectionId)])
      // Graph has no true hard-delete via this endpoint (always recycle-bins) — see file header.
      const res = await fetch(`${base}/items/${fileId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok && res.status !== 404) {
        const err = await res.text()
        throw new Error(`Failed to delete file ${fileId}: ${res.status} - ${err}`)
      }
    },

    async patchFilePermissionRole(connectionId, fileId, permissionId, role) {
      const [token, base] = await Promise.all([auth(connectionId), resolveOneDriveDriveBase(connectionId)])
      const res = await fetch(`${base}/items/${fileId}/permissions/${permissionId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: [toGraphRole(role)] }),
      })
      return res.ok
    },

    // Graph has no persistent, caller-independent content-lock facet analogous to Drive's
    // contentRestrictions — checkout/checkin is a different, user-tied editing lock. Documented no-op.
    async setFileContentReadOnly(_connectionId, _fileId, _readOnly) {
      return false
    },

    async searchFiles(connectionId, query, options) {
      const [token, base] = await Promise.all([auth(connectionId), resolveOneDriveDriveBase(connectionId)])
      const limit = options?.limit ?? 100
      const select = '$select=id,name,file,folder,size,lastModifiedDateTime,webUrl,parentReference'
      const encodedQuery = encodeURIComponent(query.replace(/'/g, "''"))

      const scopes = options?.parentFolderIds && options.parentFolderIds.length > 0
        ? options.parentFolderIds
        : [null]

      const resultsPerScope = await Promise.all(scopes.map(async (folderId) => {
        const url = folderId
          ? `${base}/items/${folderId}/search(q='${encodedQuery}')?${select}&$top=${limit}`
          : `${base}/root/search(q='${encodedQuery}')?${select}&$top=${limit}`
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) return []
        const data = await res.json()
        return (data.value || []) as Array<{
          id: string; name: string; file?: { mimeType?: string }; folder?: unknown
          size?: number; lastModifiedDateTime?: string; webUrl?: string
          parentReference?: { id?: string; driveId?: string }
        }>
      }))

      const dedup = new Map<string, ReturnType<typeof mapSearchItem>>()
      for (const items of resultsPerScope) {
        for (const item of items) {
          if (!dedup.has(item.id)) dedup.set(item.id, mapSearchItem(item))
        }
      }
      return Array.from(dedup.values()).slice(0, limit)
    },

    async getFilesMetadata(connectionId, fileIds) {
      if (fileIds.length === 0) return []
      const [token, base] = await Promise.all([auth(connectionId), resolveOneDriveDriveBase(connectionId)])
      const results = await Promise.all(fileIds.map(async (id) => {
        try {
          const res = await fetch(`${base}/items/${id}?$select=id,name,file,folder,size,lastModifiedDateTime,webUrl,parentReference`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (!res.ok) return null
          const f = await res.json()
          return mapSearchItem(f)
        } catch {
          return null
        }
      }))
      return results.filter((f): f is NonNullable<typeof f> => f !== null)
    },

    async getDuplicateFiles(connectionId, limit = 20) {
      const [token, base] = await Promise.all([auth(connectionId), resolveOneDriveDriveBase(connectionId)])
      const res = await fetch(
        `${base}/recent?$select=id,name,file,folder,size,lastModifiedDateTime,webUrl,parentReference`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) return []
      const data = await res.json()
      const files = ((data.value || []) as Array<{
        id: string; name: string; file?: { hashes?: { quickXorHash?: string }; mimeType?: string }; folder?: unknown
        size?: number; lastModifiedDateTime?: string; webUrl?: string
      }>).filter((f) => !f.folder && f.name !== '.meta' && f.name !== 'meta.json')

      const groups = new Map<string, Array<{ id: string; name: string; size: number; mimeType?: string; modifiedTime?: string; webViewLink?: string }>>()
      for (const f of files) {
        const signature = f.file?.hashes?.quickXorHash || (f.size != null ? `${f.name}_${f.size}` : null)
        if (!signature) continue
        if (!groups.has(signature)) groups.set(signature, [])
        groups.get(signature)!.push({
          id: f.id,
          name: f.name,
          size: f.size ?? 0,
          mimeType: f.file?.mimeType,
          modifiedTime: f.lastModifiedDateTime,
          webViewLink: f.webUrl,
        })
      }

      const result: Array<{ signature: string; files: typeof groups extends Map<string, infer V> ? V : never; count: number; representativeFile: any; totalSize: number }> = []
      groups.forEach((groupFiles, signature) => {
        if (groupFiles.length > 1) {
          result.push({
            signature,
            files: groupFiles,
            count: groupFiles.length,
            representativeFile: groupFiles[0],
            totalSize: groupFiles.reduce((acc, f) => acc + f.size, 0),
          })
        }
      })
      return result.sort((a, b) => b.totalSize - a.totalSize).slice(0, limit)
    },

    // Narrower staleness signal than Google's (modification-only — Graph has no per-user
    // last-viewed facet to also consider access recency). See interface doc-comment.
    async getStaleFiles(connectionId, limit = 50) {
      const [token, base] = await Promise.all([auth(connectionId), resolveOneDriveDriveBase(connectionId)])
      const res = await fetch(
        `${base}/recent?$select=id,name,file,folder,size,lastModifiedDateTime,webUrl,parentReference`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) return []
      const data = await res.json()
      const sixMonthsAgo = new Date()
      sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180)

      const files = ((data.value || []) as Array<{
        id: string; name: string; file?: { mimeType?: string }; folder?: unknown
        size?: number; lastModifiedDateTime?: string; webUrl?: string
        parentReference?: { id?: string; driveId?: string }
      }>).filter((f) => !f.folder && f.lastModifiedDateTime && new Date(f.lastModifiedDateTime) < sixMonthsAgo)

      return files
        .sort((a, b) => new Date(a.lastModifiedDateTime!).getTime() - new Date(b.lastModifiedDateTime!).getTime())
        .slice(0, limit)
        .map(mapSearchItem)
    },

    // Documented no-op: Graph's PATCH /permissions/{id} supports only the `roles` property —
    // expirationDateTime cannot be updated in place after the permission is created.
    async updatePermissionExpiry(_connectionId, _fileId, _permissionId, _expirationTime) {
      return false
    },
  }
}

function mapSearchItem(item: {
  id: string; name: string; file?: { mimeType?: string }; folder?: unknown
  size?: number; lastModifiedDateTime?: string; webUrl?: string
  parentReference?: { id?: string; driveId?: string }
}) {
  return {
    id: item.id,
    name: item.name,
    mimeType: item.file?.mimeType ?? (item.folder ? 'application/vnd.google-apps.folder' : undefined),
    size: item.size != null ? String(item.size) : undefined,
    modifiedTime: item.lastModifiedDateTime,
    webViewLink: item.webUrl,
    parents: item.parentReference?.id ? [item.parentReference.id] : undefined,
    driveId: item.parentReference?.driveId ?? null,
  }
}

async function grantItemPermission(
  connectionId: string,
  itemId: string,
  email: string,
  role: ConnectorRole,
  opts?: { notify?: boolean; message?: string; preventDownload?: boolean }
): Promise<string | null> {
  const [token, base] = await Promise.all([auth(connectionId), resolveOneDriveDriveBase(connectionId)])

  if (opts?.preventDownload) {
    return grantDownloadBlockedLink(connectionId, itemId, email, token, toBetaBase(base))
  }

  const res = await fetch(`${base}/items/${itemId}/invite`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipients: [{ email }],
      roles: [toGraphRole(role)],
      sendInvitation: opts?.notify !== false,
      message: opts?.message,
      requireSignIn: true,
    }),
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.value?.[0]?.id ?? null
}

/**
 * Grants access via a `blocksDownload` sharing link scoped to one user (Graph beta) instead
 * of a normal `/invite` permission — see file header for why this can't be layered on top of
 * an invite grant instead. Falls back to a normal (non-download-blocked) `view` link, with a
 * loud warning, if the beta call fails outright or the response doesn't confirm
 * `preventsDownload: true` (tenant license / file-type gaps can silently not honor it).
 */
async function grantDownloadBlockedLink(
  connectionId: string,
  itemId: string,
  email: string,
  token: string,
  betaBase: string
): Promise<string | null> {
  const createLink = async (type: 'blocksDownload' | 'view') => fetch(`${betaBase}/items/${itemId}/createLink`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type,
      scope: 'users',
      recipients: [{ email }],
      sendNotification: true,
    }),
  })

  try {
    const res = await createLink('blocksDownload')
    if (res.ok) {
      const data = await res.json()
      const preventsDownload = data.link?.preventsDownload === true
      if (!preventsDownload) {
        logger.warn(
          '[onedrive-permission-adapter] createLink(blocksDownload) succeeded but response did not confirm preventsDownload — this tenant/file may not actually be download-blocked. Granting access anyway (unblocked).',
          { connectionId, itemId, email }
        )
      }
      return data.id ?? null
    }
    const body = await res.text().catch(() => '')
    logger.warn(
      '[onedrive-permission-adapter] createLink(blocksDownload) failed (beta endpoint — may be unsupported for this tenant/file type) — falling back to a normal view link with download unblocked.',
      { connectionId, itemId, email, status: res.status, body }
    )
  } catch (e) {
    logger.warn(
      '[onedrive-permission-adapter] createLink(blocksDownload) threw — falling back to a normal view link with download unblocked.',
      { connectionId, itemId, email, error: e instanceof Error ? e.message : String(e) }
    )
  }

  // Fallback: grant access via a normal view-only link so the user isn't locked out entirely,
  // even though download-blocking couldn't be confirmed.
  const fallbackRes = await createLink('view')
  if (!fallbackRes.ok) return null
  const fallbackData = await fallbackRes.json()
  return fallbackData.id ?? null
}
