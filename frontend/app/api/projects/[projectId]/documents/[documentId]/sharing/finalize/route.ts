import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { getFileInfo } from '@/lib/file-utils'
import { lockFileInStorage, StorageNotSupportedError, type DowngradedPermission } from '@/lib/files/storage-lock'
import { requireEngagementMember, isEngagementLeadRole } from '@/lib/engagement-access'
import { isDocumentFinalized } from '@/lib/sharing-settings'
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
      select: { id: true, clientId: true, connectorId: true, fileName: true, settings: true, isFolder: true },
    })
    if (!existing)
      return NextResponse.json({ error: 'Share record not found' }, { status: 404 })

    if (existing.isFolder) {
      return NextResponse.json({ error: 'Version lock applies to files only' }, { status: 400 })
    }

    if (isDocumentFinalized(existing.settings)) {
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
      return NextResponse.json({ error: 'No active storage connection' }, { status: 500 })
    }

    // The file itself: editors become viewers, the content read-only (lib/files/storage-lock.ts,
    // which approving a document uses too).
    let downgraded: DowngradedPermission[]
    try {
      downgraded = await lockFileInStorage(connectorId, fileInfo.externalId)
    } catch (e) {
      if (e instanceof StorageNotSupportedError) return NextResponse.json({ error: e.message }, { status: 500 })
      throw e
    }

    const now = new Date().toISOString()
    const prevSettings = (existing.settings as Record<string, unknown>) || {}
    const share = (prevSettings.share as Record<string, unknown> | undefined) || {}
    const nextSettings: Record<string, unknown> = {
      ...prevSettings,
      // Unified lock model — cleared by /sharing/unlock
      lock: { type: 'finalize', finalizedBy: user.id, finalizedAt: now, downgraded },
      share: { ...share, finalizedAt: now },
    }

    await prisma.engagementDocument.update({
      where: { id: existing.id },
      data: { settings: nextSettings as object, updatedAt: new Date() },
    })

    audit(AUDIT_EVENT.DOCUMENT_FINALIZED)
      .scope(AUDIT_SCOPE.DOCUMENT)
      .firm(fileInfo.organizationId)
      .client(existing.clientId ?? undefined)
      .engagement(projectId)
      .document(existing.id)
      .actor(user.id)
      .meta({ fileName: existing.fileName })
      .fireAndForget()

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('PATCH sharing/finalize error', e)
    return NextResponse.json({ error: 'Failed to finalize' }, { status: 500 })
  }
}
