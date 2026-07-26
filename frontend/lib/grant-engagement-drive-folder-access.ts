import type { EngagementRole } from '@prisma/client'
import { getPermissionAdapter } from '@/lib/connectors/registry'
import type { ConnectorRole } from '@/lib/connectors/types'
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
 * Idempotent: ignores failures when permission already exists.
 */
export async function grantEngagementDriveFolderAccess(params: GrantParams): Promise<void> {
  const { connectorId, engagementSlug, email, role, projectName, clientSlug, clientName, projectFolderId } = params
  if (!email?.trim()) return

  // EV/EC get per-file permissions only — never folder-level
  if (role === 'eng_viewer' || role === 'eng_ext_collaborator') return

  const adapter = await getPermissionAdapter(connectorId)
  if (!adapter) return

  const folderIds = await adapter.getEngagementFolderIds(connectorId, engagementSlug, {
    projectName,
    clientSlug,
    clientName,
    projectFolderId: projectFolderId ?? undefined,
  })

  const grant = async (folderId: string | null | undefined, r: ConnectorRole) => {
    if (!folderId) return
    try {
      await adapter.grantFolderPermission(connectorId, folderId, email, r)
    } catch (e) {
      logger.warn('grantFolderPermission skipped or failed', {
        folderId,
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }

  await grant(folderIds.generalFolderId, 'editor')

  if (role === 'eng_admin') {
    await grant(folderIds.confidentialFolderId, 'editor')
    await grant(folderIds.stagingFolderId, 'editor')
  }
}
