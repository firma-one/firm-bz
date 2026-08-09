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

export interface OneDriveListedFile {
  id: string
  name: string
  mimeType?: string
  size?: string
  modifiedTime?: string | null
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

  const res = await fetch(
    `${base}/items/${folderId}/children?$select=id,name,file,folder,size,lastModifiedDateTime,webUrl,createdBy,lastModifiedBy&$top=${limit}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (res.status === 404) return []
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Microsoft Graph API error: ${res.status} - ${err}`)
  }
  const data = await res.json()
  let files: OneDriveListedFile[] = (data.value || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    // Uses Google's folder-mimeType sentinel (not Graph's own vocabulary) so the shared
    // frontend file list/row components — which check for this literal string — render
    // OneDrive folders as navigable folders too.
    mimeType: f.file?.mimeType ?? (f.folder ? 'application/vnd.google-apps.folder' : undefined),
    size: f.size != null ? String(f.size) : undefined,
    modifiedTime: f.lastModifiedDateTime ?? null,
    webViewLink: f.webUrl ?? null,
    owners: f.createdBy?.user ? [{ emailAddress: f.createdBy.user.email, displayName: f.createdBy.user.displayName }] : undefined,
    lastModifyingUser: f.lastModifiedBy?.user ? { emailAddress: f.lastModifiedBy.user.email, displayName: f.lastModifiedBy.user.displayName } : null,
    connectorId: connectionId,
  }))

  // Filter out staging folders (hidden from file listings), same convention as Google's.
  const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
  const settings = (connector?.settings as any) || {}
  const stagingFolderIds = new Set<string>()
  const orgId = connector?.firmId
  const orgSettings = orgId ? (settings.organizations?.[orgId] || {}) : settings
  if (orgSettings.projectFolderSettings) {
    Object.values(orgSettings.projectFolderSettings).forEach((ps: any) => {
      if (ps?.stagingFolderId) stagingFolderIds.add(ps.stagingFolderId)
    })
  }
  files = files.filter((f) => !stagingFolderIds.has(f.id))

  // Apply the same .appignore name-based exclusions Google's listFiles respects
  // (e.g. '.meta') — see lib/ignore-parser.ts.
  const ignoreNames = new Set(ignoreParser.getPatterns())
  if (ignoreNames.size > 0) {
    files = files.filter((f) => !ignoreNames.has(f.name))
  }

  // Folder-tree/role-based visibility filter for non-lead personas — structural rule only,
  // see file header for the documented gap vs Google's additional explicit-permission check.
  const personaName = projectContext?.personaName
  const personaSlug = projectContext?.personaSlug
  const isProjectLeadPersona = personaName === 'project lead' || personaName === 'engagement lead' || personaSlug === 'eng_admin'
  const isTeamMemberPersona = personaName === 'team member' || personaSlug === 'eng_member'

  if (projectContext && (isProjectLeadPersona || isTeamMemberPersona)) {
    const cache = new Map<string, string | null>()
    const isListingUnderGeneral = folderId === projectContext.generalFolderId ||
      (projectContext.generalFolderId ? await isFileUnderFolderCached(connectionId, base, token, folderId, projectContext.generalFolderId, cache) : false)
    const isListingUnderConfidential = folderId === projectContext.confidentialFolderId ||
      (projectContext.confidentialFolderId ? await isFileUnderFolderCached(connectionId, base, token, folderId, projectContext.confidentialFolderId, cache) : false)

    const hasFolderAccess =
      (isProjectLeadPersona && (isListingUnderGeneral || isListingUnderConfidential)) ||
      (isTeamMemberPersona && isListingUnderGeneral)

    if (!hasFolderAccess) {
      files = []
    }
    // When hasFolderAccess is true, all direct children returned above are visible — matches
    // Google's "all files returned are direct children of folderId" grant path.
  }

  return files
}
