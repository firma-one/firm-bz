import type { EngagementRole } from '@prisma/client'
import { googleDriveConnector } from '@/lib/google-drive-connector'
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
 * Grants Google Drive folder access for an engagement member (General for all; Confidential + Staging for leads).
 * Idempotent: ignores failures when permission already exists.
 */
export async function grantEngagementDriveFolderAccess(params: GrantParams): Promise<void> {
  const { connectorId, engagementSlug, email, role, projectName, clientSlug, clientName, projectFolderId } = params
  if (!email?.trim()) return

  const folderIds = await googleDriveConnector.getProjectFolderIds(connectorId, engagementSlug, {
    projectName,
    clientSlug,
    clientName,
    projectFolderId: projectFolderId ?? undefined,
  })

  const generalRole: 'writer' | 'reader' = role === 'eng_viewer' ? 'reader' : 'writer'

  const grant = async (folderId: string | null | undefined, r: 'writer' | 'reader' | 'commenter') => {
    if (!folderId) return
    try {
      await googleDriveConnector.grantFolderPermission(connectorId, folderId, email, r)
    } catch (e) {
      logger.warn('grantFolderPermission skipped or failed', {
        folderId,
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }

  await grant(folderIds.generalFolderId, generalRole)

  if (role === 'eng_admin') {
    await grant(folderIds.confidentialFolderId, 'writer')
    await grant(folderIds.stagingFolderId, 'writer')
  }
}
