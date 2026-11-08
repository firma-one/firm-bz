import type { EngagementRole } from '@prisma/client'
import { getPermissionAdapter } from '@/lib/connectors/registry'
import type { EngagementFolderIds } from '@/lib/connectors/types'
import { StorageFailure } from '@/lib/connectors/storage-failure'
import { logger } from '@/lib/logger'

type GrantParams = {
  connectorId: string
  engagementSlug: string
  email: string
  role: EngagementRole
  projectName?: string
  clientSlug?: string
  clientName?: string
  projectFolderId?: string | null
  /** Only these folders, as a retry of the ones that failed asks. All the role's folders when left out. */
  only?: EngagementFolderName[]
}

/** The engagement folders a member's role is shared, as people name them. */
export type EngagementFolderName = 'General' | 'Confidential' | 'Staging'

export interface FolderGrantOutcome {
  /** The folders now shared with them. */
  granted: EngagementFolderName[]
  /** The folders storage wouldn't share, and why, in words for people. */
  failed: Array<{ folder: EngagementFolderName; folderId: string; reason: string }>
  /** Why nothing was tried, when nothing was: no email, a client role, no storage connected. */
  skipped?: string
}

/** The folders each role is shared, in Firma's own terms. Clients are shared nothing by folder. */
export function engagementFoldersFor(role: EngagementRole | string | null | undefined): EngagementFolderName[] {
  if (role === 'eng_admin') return ['General', 'Confidential', 'Staging']
  if (role === 'eng_member') return ['General']
  return []
}

export function folderIdOf(folders: EngagementFolderIds, name: EngagementFolderName): string | null {
  if (name === 'General') return folders.generalFolderId
  if (name === 'Confidential') return folders.confidentialFolderId
  return folders.stagingFolderId
}

/**
 * Grants connector folder access for internal engagement members only.
 * - eng_admin:  General (writer) + Confidential (writer) + Staging (writer)
 * - eng_member: General (writer)
 *
 * EV (eng_viewer) and EC (eng_ext_collaborator) are intentionally excluded —
 * they receive Drive access only through per-file/per-folder sharing (regrant flow),
 * never through folder-level inheritance.
 *
 * Answers what was shared and what storage refused, with why, so the job can retry and then tell the
 * engagement's Leads. A folder already shared with them counts as shared (Drive and Graph accept the grant
 * again).
 */
export async function grantEngagementDriveFolderAccess(params: GrantParams): Promise<FolderGrantOutcome> {
  const { connectorId, engagementSlug, email, role, projectName, clientSlug, clientName, projectFolderId, only } = params
  const outcome: FolderGrantOutcome = { granted: [], failed: [] }
  if (!email?.trim()) return { ...outcome, skipped: 'no_email' }

  // EV/EC get per-file permissions only — never folder-level
  const wanted = engagementFoldersFor(role).filter((name) => !only || only.includes(name))
  if (wanted.length === 0) return { ...outcome, skipped: 'no_folder_access' }

  const adapter = await getPermissionAdapter(connectorId)
  if (!adapter) return { ...outcome, skipped: 'no_connector' }

  const folderIds = await adapter.getEngagementFolderIds(connectorId, engagementSlug, {
    projectName,
    clientSlug,
    clientName,
    projectFolderId: projectFolderId ?? undefined,
  })

  for (const name of wanted) {
    const folderId = folderIdOf(folderIds, name)
    if (!folderId) continue
    try {
      // Suppress the provider's own sharing-notification email — invitees are already
      // notified by Firma's invite/added-to-engagement emails.
      await adapter.grantFolderPermission(connectorId, folderId, email, 'editor', { notify: false })
      outcome.granted.push(name)
    } catch (e) {
      const reason = e instanceof StorageFailure ? e.message : "Couldn't reach the storage."
      logger.warn('grantFolderPermission failed', { folderId, folder: name, reason })
      outcome.failed.push({ folder: name, folderId, reason })
    }
  }
  return outcome
}
