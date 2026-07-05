/**
 * Project document sharing: resolve shared external ids and ancestor folder ids per persona.
 * Used by GET /api/projects/[projectId]/sharing/ids and by the list-files API to filter results.
 * When a folder is shared, all descendants up to MAX_DESCENDANT_DEPTH levels are made visible.
 * Caching is not used here so sharing state stays fresh when another user updates shares.
 */

import { prisma } from '@/lib/prisma'

const MAX_ANCESTOR_DEPTH = 15
/** Max depth of descendants to include when a shared item is a folder (inheritance visibility). */
export const MAX_DESCENDANT_DEPTH = 15

const FOLDER_MIME = 'application/vnd.google-apps.folder'

type DriveConnector = {
  getFileMetadata: (c: string, f: string) => Promise<{ parents?: string[] } | null>
  getFilesMetadata: (c: string, fileIds: string[]) => Promise<{ id: string; mimeType?: string }[]>
  listFiles: (c: string, folderId: string, limit: number) => Promise<{ id: string; mimeType?: string }[]>
}

export type SharedOnlyPersonaSlug = 'eng_ext_collaborator' | 'eng_viewer'

/**
 * Build ancestor folder IDs by walking the parentId chain stored in engagement_documents.
 * Drive is authoritative for shared items' immediate parents (one batched getFilesMetadata call)
 * to override stale DB values. Returns both ancestorIds and the parentMap so callers can do
 * further DB-based folder ancestry checks without re-querying.
 */
async function buildAncestorFoldersFromDB(
  sharedIds: string[],
  allRows: { externalId: string; parentId: string | null }[],
  driveFallback?: { connectorId: string; googleDriveConnector: DriveConnector }
): Promise<{ ancestorIds: string[]; parentMap: Map<string, string> }> {
  const parentMap = new Map<string, string>()
  for (const row of allRows) {
    if (row.parentId) parentMap.set(row.externalId, row.parentId)
  }

  // Drive is authoritative for shared items' immediate parents: always fetch to override stale DB values.
  // Batch is O(sharedIds.length) — one HTTP call — so cost is minimal.
  if (driveFallback && sharedIds.length > 0) {
    try {
      const metas = await driveFallback.googleDriveConnector.getFilesMetadata(driveFallback.connectorId, sharedIds)
      for (const m of metas) {
        if (m.id && (m as any).parents?.[0]) parentMap.set(m.id, (m as any).parents[0])
      }
    } catch {
      // non-critical: fall back to DB parentIds already in map
    }
  }

  const ancestorIdsSet = new Set<string>()
  for (const fileId of sharedIds) {
    let currentId: string | null = fileId
    let depth = 0
    const seen = new Set<string>()
    while (currentId && depth < MAX_ANCESTOR_DEPTH) {
      if (seen.has(currentId)) break
      seen.add(currentId)
      const resolvedParent: string | undefined = parentMap.get(currentId)
      if (!resolvedParent) break
      ancestorIdsSet.add(resolvedParent)
      currentId = resolvedParent
      depth++
    }
  }
  return { ancestorIds: Array.from(ancestorIdsSet), parentMap }
}

/**
 * DB-based check: returns true if folderId is the same as or a descendant of any folder in sharedIds.
 * Uses the parentMap built from engagement_documents rows — no Drive API calls.
 * Used by the EC/Guest DB-driven listing path to decide whether to show all children.
 */
export function isFolderUnderSharedFolderDB(
  folderId: string,
  sharedIds: string[],
  parentMap: Map<string, string>
): boolean {
  const sharedSet = new Set(sharedIds)
  if (sharedSet.has(folderId)) return true
  let currentId: string | null = folderId
  const seen = new Set<string>()
  while (currentId) {
    if (seen.has(currentId)) break
    seen.add(currentId)
    const parentId = parentMap.get(currentId)
    if (!parentId) break
    if (sharedSet.has(parentId)) return true
    currentId = parentId
  }
  return false
}

/**
 * Drive-based check (used by non-DB listing paths): returns true if folderId is the same as or a
 * descendant of any folder in sharedIds. Walks up via getFileMetadata (max MAX_ANCESTOR_DEPTH steps).
 */
export async function isFolderUnderSharedFolder(
  folderId: string,
  sharedIds: string[],
  connectorId: string,
  googleDriveConnector: DriveConnector
): Promise<boolean> {
  const sharedSet = new Set(sharedIds)
  if (sharedSet.has(folderId)) return true
  let currentId: string | null = folderId
  let depth = 0
  const seen = new Set<string>()
  while (currentId && depth < MAX_ANCESTOR_DEPTH) {
    if (seen.has(currentId)) break
    seen.add(currentId)
    const meta = await googleDriveConnector.getFileMetadata(connectorId, currentId)
    if (!meta?.parents?.length) break
    const parentId = meta.parents[0]
    if (sharedSet.has(parentId)) return true
    currentId = parentId
    depth++
  }
  return false
}

/** Collect all descendant file/folder ids under the given folder ids, up to MAX_DESCENDANT_DEPTH levels. */
async function buildDescendantIds(
  sharedFolderIds: string[],
  connectorId: string,
  googleDriveConnector: DriveConnector
): Promise<string[]> {
  if (sharedFolderIds.length === 0) return []
  const descendantIds = new Set<string>()
  const listLimit = 500
  const visitedFolders = new Set<string>()

  for (const rootId of sharedFolderIds) {
    const queue: { id: string; depth: number }[] = [{ id: rootId, depth: 0 }]
    while (queue.length > 0) {
      const { id: folderId, depth } = queue.shift()!
      if (depth >= MAX_DESCENDANT_DEPTH) continue
      if (visitedFolders.has(folderId)) continue
      visitedFolders.add(folderId)
      try {
        const children = await googleDriveConnector.listFiles(connectorId, folderId, listLimit)
        for (const child of children) {
          descendantIds.add(child.id)
          if (child.mimeType === FOLDER_MIME) {
            queue.push({ id: child.id, depth: depth + 1 })
          }
        }
      } catch (e) {
        console.warn(`[project-sharing-ids] listFiles for folder ${folderId} failed`, e)
      }
    }
  }
  return Array.from(descendantIds)
}

function isECEnabled(settings: unknown): boolean {
  if (!settings || typeof settings !== 'object') return false
  const share = (settings as Record<string, unknown>).share as Record<string, unknown> | undefined
  return (share?.externalCollaborator as { enabled?: boolean } | undefined)?.enabled === true
}

function isGuestEnabled(settings: unknown): boolean {
  if (!settings || typeof settings !== 'object') return false
  const share = (settings as Record<string, unknown>).share as Record<string, unknown> | undefined
  return (share?.guest as { enabled?: boolean } | undefined)?.enabled === true
}

/** True as soon as a folder is tagged as a Deliverable (settings.share.createdAt is set). */
function isDeliverable(settings: unknown): boolean {
  if (!settings || typeof settings !== 'object') return false
  const share = (settings as Record<string, unknown>).share as Record<string, unknown> | undefined
  return !!share?.createdAt
}

export type GetSharedAndAncestorOptions = {
  /** When true, skip buildDescendantIds (lazy descendant loading). Use for list-files API. */
  skipDescendants?: boolean
}

/**
 * Returns shared external ids, ancestor folder ids, optionally descendant ids, and the parentMap
 * for the given project and persona.
 * parentMap is the Drive-authoritative id→parentId map, exposed for DB-based folder checks.
 */
export async function getSharedAndAncestorIdsForPersona(
  projectId: string,
  personaSlug: SharedOnlyPersonaSlug | null,
  options?: GetSharedAndAncestorOptions
): Promise<{ sharedIds: string[]; ancestorIds: string[]; descendantIds: string[]; parentMap: Map<string, string> }> {
  const { skipDescendants = false } = options ?? {}
  const allRows = await prisma.engagementDocument.findMany({
    where: { engagementId: projectId },
    select: {
      externalId: true,
      parentId: true,
      isFolder: true,
      settings: true,
    },
  })

  const settingsRows = allRows.filter((r) => r.externalId) as {
    externalId: string
    parentId: string | null
    isFolder: boolean
    settings: unknown
  }[]

  let sharedIds: string[]
  if (personaSlug === 'eng_ext_collaborator') {
    sharedIds = settingsRows.filter((r) => isECEnabled(r.settings)).map((r) => r.externalId)
  } else if (personaSlug === 'eng_viewer') {
    sharedIds = settingsRows.filter((r) => isGuestEnabled(r.settings)).map((r) => r.externalId)
  } else {
    sharedIds = Array.from(
      new Set([
        ...settingsRows.filter((r) => isECEnabled(r.settings)).map((r) => r.externalId),
        ...settingsRows.filter((r) => isGuestEnabled(r.settings)).map((r) => r.externalId),
      ])
    )
  }

  const sharedFolderIds = settingsRows
    .filter((r) => sharedIds.includes(r.externalId) && r.isFolder)
    .map((r) => r.externalId)
  const needsConnector = sharedIds.length > 0 || (!skipDescendants && sharedFolderIds.length > 0)

  let connectorId: string | undefined
  let googleDriveConnector: DriveConnector | undefined
  if (needsConnector) {
    const project = await prisma.engagement.findFirst({
      where: { id: projectId, isDeleted: false },
      select: {
        client: {
          select: {
            firm: {
              select: { connector: { select: { id: true } } },
            },
          },
        },
      },
    })
    connectorId = project?.client?.firm?.connector?.id
    if (connectorId) {
      ;({ googleDriveConnector } = await import('@/lib/google-drive-connector'))
    }
  }

  const driveFallback = connectorId && googleDriveConnector
    ? { connectorId, googleDriveConnector }
    : undefined

  const { ancestorIds, parentMap } = sharedIds.length > 0
    ? await buildAncestorFoldersFromDB(sharedIds, settingsRows, driveFallback)
    : { ancestorIds: [], parentMap: new Map<string, string>() }

  let descendantIds: string[] = []
  if (!skipDescendants && sharedFolderIds.length > 0 && connectorId && googleDriveConnector) {
    descendantIds = await buildDescendantIds(sharedFolderIds, connectorId, googleDriveConnector)
  }

  return { sharedIds, ancestorIds, descendantIds, parentMap }
}

/**
 * Count of non-folder files accessible to the given persona for a project.
 * Pure DB computation: one query + in-memory traversal via parentMap. No Drive API calls.
 * Counts directly shared files plus all non-folder descendants of shared folders.
 */
export async function getAccessibleFileCountForPersona(
  projectId: string,
  personaSlug: SharedOnlyPersonaSlug
): Promise<number> {
  const allRows = await prisma.engagementDocument.findMany({
    where: { engagementId: projectId },
    select: { externalId: true, parentId: true, isFolder: true, settings: true },
  })

  const rows = allRows.filter((r) => r.externalId) as {
    externalId: string
    parentId: string | null
    isFolder: boolean
    settings: unknown
  }[]

  const isEnabled = personaSlug === 'eng_ext_collaborator' ? isECEnabled : isGuestEnabled
  const sharedIdSet = new Set(rows.filter((r) => isEnabled(r.settings)).map((r) => r.externalId))

  // Build children map for forward traversal
  const childrenMap = new Map<string, { externalId: string; isFolder: boolean }[]>()
  for (const row of rows) {
    if (!row.parentId) continue
    if (!childrenMap.has(row.parentId)) childrenMap.set(row.parentId, [])
    childrenMap.get(row.parentId)!.push({ externalId: row.externalId, isFolder: row.isFolder })
  }

  let count = 0

  // Directly shared non-folder items
  for (const row of rows) {
    if (sharedIdSet.has(row.externalId) && !row.isFolder) count++
  }

  // Descendants of shared folders (BFS via childrenMap)
  const visited = new Set<string>()
  const queue = rows
    .filter((r) => sharedIdSet.has(r.externalId) && r.isFolder)
    .map((r) => r.externalId)

  while (queue.length > 0) {
    const folderId = queue.shift()!
    if (visited.has(folderId)) continue
    visited.add(folderId)
    for (const child of childrenMap.get(folderId) ?? []) {
      if (!child.isFolder) {
        count++
      } else {
        queue.push(child.externalId)
      }
    }
  }

  return count
}

export type SharedIdsForAllPersonas = {
  sharedIdsForEC: string[]
  sharedIdsForGuest: string[]
  sharedIdsUnion: string[]
  ancestorIds: string[]
  descendantIds: string[]
  descendantIdsForEC: string[]
  descendantIdsForGuest: string[]
}

/**
 * DB-only BFS: collect all descendant externalIds under the given shared folder externalIds.
 * Uses the childrenMap built from engagement_documents rows — no Drive API calls.
 */
function buildDescendantIdsFromDB(
  sharedFolderExternalIds: string[],
  childrenMap: Map<string, { externalId: string; isFolder: boolean }[]>
): string[] {
  if (sharedFolderExternalIds.length === 0) return []
  const result = new Set<string>()
  const visited = new Set<string>()
  const queue = [...sharedFolderExternalIds]
  while (queue.length > 0) {
    const folderId = queue.shift()!
    if (visited.has(folderId)) continue
    visited.add(folderId)
    for (const child of childrenMap.get(folderId) ?? []) {
      result.add(child.externalId)
      if (child.isFolder) queue.push(child.externalId)
    }
  }
  return Array.from(result)
}

/**
 * One Prisma query and one set of Drive calls (ancestor + descendant for union).
 * Use this for GET /api/projects/[projectId]/sharing/ids to avoid 3x getSharedAndAncestorIdsForPersona.
 */
export async function getSharedAndAncestorIdsForAllPersonas(
  projectId: string
): Promise<SharedIdsForAllPersonas> {
  const allRows = await prisma.engagementDocument.findMany({
    where: { engagementId: projectId },
    select: {
      externalId: true,
      parentId: true,
      isFolder: true,
      settings: true,
    },
  })

  const settingsRows = allRows.filter((r) => r.externalId) as {
    externalId: string
    parentId: string | null
    isFolder: boolean
    settings: unknown
  }[]

  const sharedIdsForEC = settingsRows.filter((r) => isECEnabled(r.settings)).map((r) => r.externalId)
  const sharedIdsForGuest = settingsRows.filter((r) => isGuestEnabled(r.settings)).map((r) => r.externalId)
  // Union uses isDeliverable (share.createdAt) so the icon appears as soon as a folder is tagged,
  // regardless of which stage (EC/Guest) is currently enabled.
  const sharedIdsUnion = settingsRows.filter((r) => isDeliverable(r.settings)).map((r) => r.externalId)

  const { ancestorIds } = sharedIdsUnion.length > 0
    ? await buildAncestorFoldersFromDB(sharedIdsUnion, settingsRows)
    : { ancestorIds: [] }

  // Build children map once — used for all three descendant sets
  const childrenMap = new Map<string, { externalId: string; isFolder: boolean }[]>()
  for (const row of settingsRows) {
    if (!row.parentId) continue
    if (!childrenMap.has(row.parentId)) childrenMap.set(row.parentId, [])
    childrenMap.get(row.parentId)!.push({ externalId: row.externalId, isFolder: row.isFolder })
  }

  const sharedSetEC = new Set(sharedIdsForEC)
  const sharedSetGuest = new Set(sharedIdsForGuest)
  const sharedSetUnion = new Set(sharedIdsUnion)

  const sharedFolderIdsForEC = settingsRows.filter((r) => sharedSetEC.has(r.externalId) && r.isFolder).map((r) => r.externalId)
  const sharedFolderIdsForGuest = settingsRows.filter((r) => sharedSetGuest.has(r.externalId) && r.isFolder).map((r) => r.externalId)
  const sharedFolderIdsUnion = settingsRows.filter((r) => sharedSetUnion.has(r.externalId) && r.isFolder).map((r) => r.externalId)

  const descendantIdsForEC = buildDescendantIdsFromDB(sharedFolderIdsForEC, childrenMap)
  const descendantIdsForGuest = buildDescendantIdsFromDB(sharedFolderIdsForGuest, childrenMap)
  const descendantIds = buildDescendantIdsFromDB(sharedFolderIdsUnion, childrenMap)

  return { sharedIdsForEC, sharedIdsForGuest, sharedIdsUnion, ancestorIds, descendantIds, descendantIdsForEC, descendantIdsForGuest }
}
