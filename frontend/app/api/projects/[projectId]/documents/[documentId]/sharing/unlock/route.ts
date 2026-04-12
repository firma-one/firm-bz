import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { getFileInfo } from '@/lib/file-utils'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { requireEngagementMember, isEngagementLeadRole } from '@/lib/engagement-access'
import { getVersionLockFromSettings } from '@/lib/document-version-lock'

/**
 * PATCH /api/projects/[projectId]/documents/[documentId]/sharing/unlock
 * Restore Drive roles recorded at lock time (Engagement Lead only).
 */
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, documentId: documentIdParam } = await params

    const member = await requireEngagementMember(projectId, user.id)
    if (!member || !isEngagementLeadRole(member.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const fileInfo = await getFileInfo(projectId, documentIdParam)
    if (!fileInfo)
      return NextResponse.json({ error: 'File not found in this project' }, { status: 404 })

    const compound = {
      engagementId: projectId,
      firmId: fileInfo.organizationId,
      externalId: fileInfo.externalId,
    }

    const existing = await prisma.engagementDocument.findUnique({
      where: { engagementId_firmId_externalId: compound },
    })
    if (!existing)
      return NextResponse.json({ error: 'Share record not found' }, { status: 404 })

    const lock = getVersionLockFromSettings(existing.settings)
    if (!lock) {
      return NextResponse.json({ error: 'Document is not locked' }, { status: 409 })
    }

    let connectorId = existing.connectorId
    if (!connectorId && fileInfo.organizationId) {
      const org = await prisma.firm.findUnique({
        where: { id: fileInfo.organizationId },
        select: { connectorId: true },
      })
      connectorId = org?.connectorId ?? null
    }
    if (!connectorId) {
      return NextResponse.json({ error: 'No active Google Drive connection' }, { status: 500 })
    }

    for (const row of lock.downgraded) {
      const role = row.previousRole as 'reader' | 'writer' | 'commenter' | 'fileOrganizer' | 'organizer'
      if (['writer', 'reader', 'commenter', 'fileOrganizer', 'organizer'].includes(row.previousRole)) {
        await googleDriveConnector.patchFilePermissionRole(
          connectorId,
          fileInfo.externalId,
          row.permissionId,
          role
        )
      }
    }

    await googleDriveConnector.setFileContentReadOnly(connectorId, fileInfo.externalId, false)

    const prevSettings = (existing.settings as Record<string, unknown>) || {}
    const share = (prevSettings.share as Record<string, unknown> | undefined) || {}
    const nextSettings: Record<string, unknown> = {
      ...prevSettings,
      share: { ...share, finalizedAt: null },
    }
    delete nextSettings.versionLock

    await prisma.engagementDocument.update({
      where: { id: existing.id },
      data: { settings: nextSettings as object, updatedAt: new Date() },
    })

    const updated = await prisma.engagementDocument.findUnique({
      where: { engagementId_firmId_externalId: compound },
    })
    return NextResponse.json({ sharing: updated })
  } catch (e) {
    console.error('PATCH sharing/unlock error', e)
    return NextResponse.json({ error: 'Failed to unlock' }, { status: 500 })
  }
}
