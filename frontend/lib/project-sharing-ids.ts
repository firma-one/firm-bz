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

async function buildAncestorFolders(
  fileIds: string[],
  connectorId: string,
  googleDriveConnector: DriveConnector
): Promise<string[]> {
  const ancestorFolderIds = new Set<string>()
  for (const fileId of fileIds) {
    let currentId: string | null = fileId
    let depth = 0
    const seen = new Set<string>()
    while (currentId && depth < MAX_ANCESTOR_DEPTH) {
      if (seen.has(currentId)) break
      seen.add(currentId)
      const meta = await googleDriveConnector.getFileMetadata(connectorId, currentId)
      if (!meta?.parents?.length) break
      const parentId = meta.parents[0]
      ancestorFolderIds.add(parentId)
      currentId = parentId
      depth++
    }
  }
  return Array.from(ancestorFolderIds)
}

/**
 * Returns true if folderId is the same as or a descendant of any folder in sharedIds (i.e. "under" a shared folder).
 * Used for lazy descendant loading: when listing this folder, show all children without filtering.
 * Walks up from folderId via getFileMetadata (max MAX_ANCESTOR_DEPTH steps).
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
        // Folder may be inaccessible or deleted; skip and continue
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

export type GetSharedAndAncestorOptions = {
  /** When true, skip buildDescendantIds (lazy descendant loading). Use for list-files API. */
  skipDescendants?: boolean
}

/**
 * Returns shared external ids, ancestor folder ids, and optionally descendant ids for the given project and persona.
 * - personaSlug 'eng_ext_collaborator' => items shared with External Collaborator (and their ancestors; descendants only if !skipDescendants)
 * - personaSlug 'eng_viewer' => items shared with Guest (and their ancestors; descendants only if !skipDescendants)
 * - personaSlug null => union of both (for backward compat / restrictToSharedOnly without persona)
 */
export async function getSharedAndAncestorIdsForPersona(
  projectId: string,
  personaSlug: SharedOnlyPersonaSlug | null,
  options?: GetSharedAndAncestorOptions
): Promise<{ sharedIds: string[]; ancestorIds: string[]; descendantIds: string[] }> {
  const { skipDescendants = false } = options ?? {}
  const allRows = await prisma.engagementDocument.findMany({
    where: { engagementId: projectId },
    select: {
      externalId: true,
      settings: true,
    },
  })

  const settingsRows = allRows.filter((r) => r.externalId) as {
    externalId: string
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

  let ancestorIds: string[] = []
  let descendantIds: string[] = []
  if (sharedIds.length > 0) {
    const project = await prisma.engagement.findFirst({
      where: { id: projectId, isDeleted: false },
      select: {
        client: {
          select: {
            firm: {
              select: {
                connector: {
                  select: { id: true },
                },
              },
            },
          },
        },
      },
    })
    const connectorId = project?.client?.firm?.connector?.id
    if (connectorId) {
      const { googleDriveConnector } = await import('@/lib/google-drive-connector')
      const [ancestors, sharedFolderIds] = await Promise.all([
        buildAncestorFolders(sharedIds, connectorId, googleDriveConnector),
        googleDriveConnector.getFilesMetadata(connectorId, sharedIds).then((metas) =>
          metas.filter((m) => m.mimeType === FOLDER_MIME).map((m) => m.id)
        ),
      ])
      ancestorIds = ancestors
      if (!skipDescendants && sharedFolderIds.length > 0) {
        descendantIds = await buildDescendantIds(sharedFolderIds, connectorId, googleDriveConnector)
      }
    }
  }

  return { sharedIds, ancestorIds, descendantIds }
}

export type SharedIdsForAllPersonas = {
  sharedIdsForEC: string[]
  sharedIdsForGuest: string[]
  sharedIdsUnion: string[]
  ancestorIds: string[]
  descendantIds: string[]
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
      settings: true,
    },
  })

  const settingsRows = allRows.filter((r) => r.externalId) as {
    externalId: string
    settings: unknown
  }[]

  const sharedIdsForEC = settingsRows.filter((r) => isECEnabled(r.settings)).map((r) => r.externalId)
  const sharedIdsForGuest = settingsRows.filter((r) => isGuestEnabled(r.settings)).map((r) => r.externalId)
  const sharedIdsUnion = Array.from(
    new Set([...sharedIdsForEC, ...sharedIdsForGuest])
  )

  let ancestorIds: string[] = []
  let descendantIds: string[] = []
  if (sharedIdsUnion.length > 0) {
    const project = await prisma.engagement.findFirst({
      where: { id: projectId, isDeleted: false },
      select: {
        client: {
          select: {
            firm: {
              select: {
                connector: {
                  select: { id: true },
                },
              },
            },
          },
        },
      },
    })
    const connectorId = project?.client?.firm?.connector?.id
    if (connectorId) {
      const { googleDriveConnector } = await import('@/lib/google-drive-connector')
      const [ancestors, sharedFolderIds] = await Promise.all([
        buildAncestorFolders(sharedIdsUnion, connectorId, googleDriveConnector),
        googleDriveConnector.getFilesMetadata(connectorId, sharedIdsUnion).then((metas) =>
          metas.filter((m) => m.mimeType === FOLDER_MIME).map((m) => m.id)
        ),
      ])
      ancestorIds = ancestors
      // Skip buildDescendantIds: sharing/ids client only needs sharedIds + ancestorIds for badges. Saves cost.
    }
  }

  return {
    sharedIdsForEC,
    sharedIdsForGuest,
    sharedIdsUnion,
    ancestorIds,
    descendantIds,
  }
}
