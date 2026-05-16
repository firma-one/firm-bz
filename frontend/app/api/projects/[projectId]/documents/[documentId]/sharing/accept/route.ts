import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { getFileInfo } from '@/lib/file-utils'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { requireEngagementMember, externalMemberCanAccessDocument } from '@/lib/engagement-access'
import { isDocumentFinalized } from '@/lib/sharing-settings'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'

const EXTERNAL_ROLES = new Set(['eng_ext_collaborator', 'eng_viewer'])

/**
 * PATCH /api/projects/[projectId]/documents/[documentId]/sharing/accept
 * Client acceptance: EC or EV marks the document as accepted, which locks it (version-finalized).
 * Uses the same settings.lock = { type: 'finalize' } model as the EL finalize route.
 * Engagement Lead can still unlock it afterwards via /sharing/unlock.
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
    if (!member || !EXTERNAL_ROLES.has(member.role)) {
      return NextResponse.json({ error: 'Forbidden: only external members can accept documents' }, { status: 403 })
    }

    const fileInfo = await getFileInfo(projectId, documentIdParam)
    if (!fileInfo)
      return NextResponse.json({ error: 'File not found in this project' }, { status: 404 })

    const canAccess = await externalMemberCanAccessDocument(projectId, member.role, fileInfo.externalId)
    if (!canAccess)
      return NextResponse.json({ error: 'Access denied to this document' }, { status: 403 })

    const compound = {
      engagementId: projectId,
      firmId: fileInfo.organizationId,
      externalId: fileInfo.externalId,
    }

    const existing = await prisma.engagementDocument.findUnique({
      where: { engagementId_firmId_externalId: compound },
    })
    if (!existing)
      return NextResponse.json({ error: 'Document record not found' }, { status: 404 })

    if (existing.isFolder)
      return NextResponse.json({ error: 'Acceptance applies to files only' }, { status: 400 })

    if (isDocumentFinalized(existing.settings))
      return NextResponse.json({ error: 'Document is already finalized' }, { status: 409 })

    let connectorId = existing.connectorId
    if (!connectorId && fileInfo.organizationId) {
      const org = await prisma.firm.findUnique({
        where: { id: fileInfo.organizationId },
        select: { connectorId: true },
      })
      connectorId = org?.connectorId ?? null
    }
    if (!connectorId)
      return NextResponse.json({ error: 'No active Google Drive connection' }, { status: 500 })

    // Downgrade elevated Drive permissions to reader (same as finalize route)
    const downgraded: Array<{ permissionId: string; previousRole: string }> = []
    const perms = await googleDriveConnector.listFilePermissions(connectorId, fileInfo.externalId)
    const elevRoles = new Set(['writer', 'fileOrganizer', 'organizer', 'commenter'])

    for (const p of perms) {
      if (!p.id || p.deleted) continue
      if (p.type !== 'user' || !p.emailAddress) continue
      if (p.role === 'owner') continue
      if (!elevRoles.has(p.role)) continue

      const ok = await googleDriveConnector.patchFilePermissionRole(
        connectorId,
        fileInfo.externalId,
        p.id,
        'reader'
      )
      if (ok) downgraded.push({ permissionId: p.id, previousRole: p.role })
    }

    await googleDriveConnector.setFileContentReadOnly(connectorId, fileInfo.externalId, true)

    const now = new Date().toISOString()
    const prevSettings = (existing.settings as Record<string, unknown>) || {}
    const share = (prevSettings.share as Record<string, unknown> | undefined) || {}
    const nextSettings: Record<string, unknown> = {
      ...prevSettings,
      // Unified lock model — same as finalize route; unlocked via /sharing/unlock
      lock: { type: 'finalize', finalizedBy: user.id, finalizedAt: now, acceptedBy: user.id, acceptedAt: now, downgraded },
      share: { ...share, finalizedAt: now, acceptedAt: now, acceptedBy: user.id },
    }

    await prisma.engagementDocument.update({
      where: { id: existing.id },
      data: { settings: nextSettings as object, updatedAt: new Date() },
    })

    // Notify all engagement leads
    try {
      const leads = await prisma.engagementMember.findMany({
        where: { engagementId: projectId, role: 'eng_admin' },
        select: { userId: true },
      })
      if (leads.length) {
        const rows = leads.map((l) => ({
          organizationId: fileInfo.organizationId,
          clientId: existing.clientId,
          projectId,
          documentId: existing.id,
          userId: l.userId,
          type: 'DOCUMENT_ACCEPTED_BY_CLIENT',
          priority: 'INFO',
          title: 'Document accepted by client',
          body: `"${existing.fileName}" has been accepted and locked.`,
          ctaUrl: null,
          metadata: { fileName: existing.fileName, acceptedBy: user.id },
          channels: { inApp: true, email: false },
          dedupeKey: `doc:${existing.id}:accepted`,
        }))
        await (prisma as any).notification.createMany({ data: rows, skipDuplicates: true })
      }
    } catch {
      // non-critical
    }

    audit(AUDIT_EVENT.DOCUMENT_FINALIZED)
      .scope(AUDIT_SCOPE.DOCUMENT)
      .firm(fileInfo.organizationId)
      .engagement(projectId)
      .document(existing.id)
      .actor(user.id)
      .meta({ fileName: existing.fileName, acceptedByClient: true })
      .fireAndForget()

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('PATCH sharing/accept error', e)
    return NextResponse.json({ error: 'Failed to accept document' }, { status: 500 })
  }
}
