/**
 * OneDrive/SharePoint equivalent of GoogleDriveConnector.listFiles(), used by
 * app/api/connectors/google-drive/linked-files/route.ts's 'list' action for internal
 * (non-EC/EV) personas. Mirrors Google's return shape and folder-tree/role-based visibility
 * rule, with two documented gaps vs Google — see .claude/plans/connector-microsoft-impl.md's
 * "OPEN — Google-only feature gaps" note (2026-08-05):
 *   1. No activity/security badges (risk/stale/sensitive) — Graph has no equivalent API.
 *   2. No explicit per-file Graph-permission-grant check for files shared outside the normal
 *      General/Confidential folder tree — only the structural folder-tree/role rule is ported.
 */

import { prisma } from '@/lib/prisma'
import { OneDriveConnector } from '@/lib/connectors/onedrive-connector'
import { resolveOneDriveDriveBase } from './onedrive-adapter'
import { ignoreParser } from '@/lib/ignore-parser'
import { CONNECTOR_CACHE_TTL_MS, createShortLivedCache } from '../short-lived-cache'

export interface OneDriveListedFile {
  id: string
  name: string
  mimeType?: string
  size?: string
  modifiedTime?: string | null
  /** When the file was created in the drive: the Details pane's Created. */
  createdTime?: string
  webViewLink?: string | null
  owners?: { emailAddress?: string; displayName?: string }[]
  lastModifyingUser?: { emailAddress?: string; displayName?: string } | null
  parents?: string[]
  connectorId: string
}

const oneDrive = OneDriveConnector.getInstance()

async function auth(connectionId: string): Promise<string> {
  const token = await oneDrive.getAccessToken(connectionId)
  if (!token) throw new Error('Could not get OneDrive access token')
  return token
}

/** Folder-hierarchy walk (bounded depth, cached) — same shape as Google's isFileUnderFolderCached. */
async function isFileUnderFolderCached(
  connectionId: string,
  base: string,
  token: string,
  fileId: string,
  parentFolderId: string,
  cache: Map<string, string | null>,
  visited: Set<string> = new Set(),
  depth = 0
): Promise<boolean> {
  if (fileId === parentFolderId) return true
  if (visited.has(fileId) || depth > 25) return false
  visited.add(fileId)

  let parentId = cache.get(fileId)
  if (parentId === undefined) {
    const res = await fetch(`${base}/items/${fileId}?$select=parentReference`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    parentId = res.ok ? ((await res.json()).parentReference?.id as string | undefined) ?? null : null
    cache.set(fileId, parentId)
  }
  if (!parentId) return false
  if (parentId === parentFolderId) return true
  return isFileUnderFolderCached(connectionId, base, token, parentId, parentFolderId, cache, visited, depth + 1)
}

/**
 * Full drive paths ("/drives/x/root:/A/B") of an engagement's General/Confidential roots, reused for
 * a minute. Only those roots are cached: a browsed folder's path is always read fresh, so a folder
 * moved out of General never keeps General's access.
 */
const rootPathCache = createShortLivedCache<string>(CONNECTOR_CACHE_TTL_MS)

async function getItemPath(base: string, token: string, itemId: string, cacheIt = false): Promise<string | null> {
  const key = `${base}|${itemId}`
  const cached = cacheIt ? rootPathCache.get(key) : undefined
  if (cached) return cached
  const res = await fetch(`${base}/items/${itemId}?$select=name,parentReference`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  const parentPath = data.parentReference?.path as string | undefined
  if (!parentPath || !data.name) return null
  const path = `${parentPath}/${data.name}`
  if (cacheIt) rootPathCache.set(key, path)
  return path
}

/**
 * Whether `folderId` is `ancestorId` or inside it: one path comparison when Graph gives both paths,
 * else the parent-by-parent walk.
 */
async function isFolderUnder(
  connectionId: string,
  base: string,
  token: string,
  folderId: string,
  ancestorId: string,
  folderPath: string | null,
  walkCache: Map<string, string | null>
): Promise<boolean> {
  if (folderId === ancestorId) return true
  const ancestorPath = folderPath ? await getItemPath(base, token, ancestorId, true) : null
  if (folderPath && ancestorPath) return folderPath.startsWith(`${ancestorPath}/`)
  return isFileUnderFolderCached(connectionId, base, token, folderId, ancestorId, walkCache)
}

/** Owner, last editor and modified time of one item, in listOneDriveFiles' shape. */
export async function getOneDriveItemActivity(connectionId: string, itemId: string): Promise<{
  owners: OneDriveListedFile['owners'] | null
  lastModifyingUser: OneDriveListedFile['lastModifyingUser']
  modifiedTime: string | null
} | null> {
  const [token, base] = await Promise.all([auth(connectionId), resolveOneDriveDriveBase(connectionId)])
  const res = await fetch(`${base}/items/${itemId}?$select=createdBy,lastModifiedBy,lastModifiedDateTime`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const f = await res.json()
  return {
    owners: f.createdBy?.user ? [{ emailAddress: f.createdBy.user.email, displayName: f.createdBy.user.displayName }] : null,
    lastModifyingUser: f.lastModifiedBy?.user ? { emailAddress: f.lastModifiedBy.user.email, displayName: f.lastModifiedBy.user.displayName } : null,
    modifiedTime: f.lastModifiedDateTime ?? null,
  }
}

export async function listOneDriveFiles(
  connectionId: string,
  folderId: string,
  limit: number = 100,
  projectContext?: {
    projectId: string
    generalFolderId: string | null
    confidentialFolderId: string | null
    personaName: string | null
    personaSlug?: string | null
  } | null
): Promise<OneDriveListedFile[]> {
  const [token, base] = await Promise.all([auth(connectionId), resolveOneDriveDriveBase(connectionId)])

  // Folder-tree/role-based visibility for engagement personas — structural rule only, see the file
  // header for the documented gap vs Google's additional explicit-permission check. Runs alongside
  // the listing; a member never needs the Confidential check, a lead only when not under General.
  const personaName = projectContext?.personaName
  const personaSlug = projectContext?.personaSlug
  const isProjectLeadPersona = personaName === 'project lead' || personaName === 'engagement lead' || personaSlug === 'eng_admin'
  const isTeamMemberPersona = personaName === 'team member' || personaSlug === 'eng_member'
  const checkFolderAccess = async (): Promise<boolean> => {
    if (!projectContext || !(isProjectLeadPersona || isTeamMemberPersona)) return true
    const { generalFolderId, confidentialFolderId } = projectContext
    const knownRoot = folderId === generalFolderId || folderId === confidentialFolderId
    const folderPath = knownRoot ? null : await getItemPath(base, token, folderId)
    const walkCache = new Map<string, string | null>()
    const underGeneral = generalFolderId
      ? await isFolderUnder(connectionId, base, token, folderId, generalFolderId, folderPath, walkCache)
      : false
    if (underGeneral) return true
    if (!isProjectLeadPersona || !confidentialFolderId) return false
    return isFolderUnder(connectionId, base, token, folderId, confidentialFolderId, folderPath, walkCache)
  }

  const listChildren = async (): Promise<any[] | null> => {
    const items: any[] = []
    let url: string | undefined =
      `${base}/items/${folderId}/children?$select=id,name,file,folder,size,createdDateTime,lastModifiedDateTime,webUrl,createdBy,lastModifiedBy&$top=${limit}`
    while (url && items.length < limit) {
      const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (res.status === 404) return null
      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Microsoft Graph API error: ${res.status} - ${err}`)
      }
      const page = await res.json()
      items.push(...(page.value || []))
      url = page['@odata.nextLink']
    }
    return items.slice(0, limit)
  }

  const [children, hasFolderAccess, connector] = await Promise.all([
    listChildren(),
    checkFolderAccess(),
    prisma.connector.findUnique({ where: { id: connectionId }, select: { firmId: true, settings: true } }),
  ])
  if (!children || !hasFolderAccess) return []

  let files: OneDriveListedFile[] = children.map((f: any) => ({
    id: f.id,
    name: f.name,
    // Uses Google's folder-mimeType sentinel (not Graph's own vocabulary) so the shared
    // frontend file list/row components — which check for this literal string — render
    // OneDrive folders as navigable folders too.
    mimeType: f.file?.mimeType ?? (f.folder ? 'application/vnd.google-apps.folder' : undefined),
    size: f.size != null ? String(f.size) : undefined,
    modifiedTime: f.lastModifiedDateTime ?? null,
    createdTime: f.createdDateTime ?? undefined,
    webViewLink: f.webUrl ?? null,
    owners: f.createdBy?.user ? [{ emailAddress: f.createdBy.user.email, displayName: f.createdBy.user.displayName }] : undefined,
    lastModifyingUser: f.lastModifiedBy?.user ? { emailAddress: f.lastModifiedBy.user.email, displayName: f.lastModifiedBy.user.displayName } : null,
    connectorId: connectionId,
  }))

  // Filter out staging folders (hidden from file listings), same convention as Google's, and the
  // Archive folders: approved copies are never listed (.claude/plans/document-approval-record.md).
  const settings = (connector?.settings as any) || {}
  const stagingFolderIds = new Set<string>()
  const orgId = connector?.firmId
  const orgSettings = orgId ? (settings.organizations?.[orgId] || {}) : settings
  if (orgSettings.projectFolderSettings) {
    Object.values(orgSettings.projectFolderSettings).forEach((ps: any) => {
      if (ps?.stagingFolderId) stagingFolderIds.add(ps.stagingFolderId)
      if (ps?.archiveFolderId) stagingFolderIds.add(ps.archiveFolderId)
    })
  }
  files = files.filter((f) => !stagingFolderIds.has(f.id))

  // Apply the same .appignore name-based exclusions Google's listFiles respects
  // (e.g. '.meta') — see lib/ignore-parser.ts.
  const ignoreNames = new Set(ignoreParser.getPatterns())
  if (ignoreNames.size > 0) {
    files = files.filter((f) => !ignoreNames.has(f.name))
  }

  return files
}
