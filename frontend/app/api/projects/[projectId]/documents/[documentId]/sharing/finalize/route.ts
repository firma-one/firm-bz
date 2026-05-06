import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { getFileInfo } from '@/lib/file-utils'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { requireEngagementMember, isEngagementLeadRole } from '@/lib/engagement-access'
import { getVersionLockFromSettings, type VersionLockDowngrade } from '@/lib/document-version-lock'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'

/**
 * PATCH /api/projects/[projectId]/documents/[documentId]/sharing/finalize
 * Lock document version (Engagement Lead only): Drive read-only for collaborators + optional content restriction.
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

    if (existing.isFolder) {
      return NextResponse.json({ error: 'Version lock applies to files only' }, { status: 400 })
    }

    if (getVersionLockFromSettings(existing.settings)) {
      return NextResponse.json({ error: 'Document is already locked' }, { status: 409 })
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

    const downgraded: VersionLockDowngrade[] = []
    const perms = await googleDriveConnector.listFilePermissions(connectorId, fileInfo.externalId)
    const elevRoles = new Set(['writer', 'fileOrganizer', 'organizer', 'commenter'])

    for (const p of perms) {
      if (!p.id || p.deleted) continue
      if (p.type !== 'user' || !p.emailAddress) continue
      if (p.role === 'owner') continue
      if (!elevRoles.has(p.role)) continue

      const prev = p.role
      const ok = await googleDriveConnector.patchFilePermissionRole(
        connectorId,
        fileInfo.externalId,
        p.id,
        'reader'
      )
      if (ok) downgraded.push({ permissionId: p.id, previousRole: prev })
    }

    await googleDriveConnector.setFileContentReadOnly(connectorId, fileInfo.externalId, true)

    const now = new Date().toISOString()
    const prevSettings = (existing.settings as Record<string, unknown>) || {}
    const share = (prevSettings.share as Record<string, unknown> | undefined) || {}
    const nextSettings: Record<string, unknown> = {
      ...prevSettings,
      share: { ...share, finalizedAt: now },
      versionLock: {
        lockedAt: now,
        downgraded,
      },
    }

    await prisma.engagementDocument.update({
      where: { id: existing.id },
      data: { settings: nextSettings as object, updatedAt: new Date() },
    })

    const updated = await prisma.engagementDocument.findUnique({
      where: { engagementId_firmId_externalId: compound },
    })

    audit(AUDIT_EVENT.DOCUMENT_FINALIZED)
      .scope(AUDIT_SCOPE.DOCUMENT)
      .firm(fileInfo.organizationId)
      .engagement(projectId)
      .document(existing.id)
      .actor(user.id)
      .meta({ fileName: existing.fileName })
      .fireAndForget()

    return NextResponse.json({ sharing: updated })
  } catch (e) {
    console.error('PATCH sharing/finalize error', e)
    return NextResponse.json({ error: 'Failed to finalize' }, { status: 500 })
  }
}
