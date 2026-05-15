import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { requireEngagementMember, isExternalEngagementRole, isEngagementLeadRole } from '@/lib/engagement-access'
import { getFileInfo } from '@/lib/file-utils'
import { getLock } from '@/lib/sharing-settings'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { safeInngestSend } from '@/lib/inngest/client'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'

/**
 * PATCH /api/projects/[projectId]/documents/[documentId]/intake
 * Body: { action: 'approve' | 'reject' | 'withdraw' }
 *
 * approve  — EL only: clears settings.lock, file becomes a normal document
 * reject   — EL only: deletes DB record + trashes Drive file
 * withdraw — EC/EV only (own uploads): deletes DB record + trashes Drive file
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, documentId: documentIdParam } = await params

    let body: { action?: string } = {}
    try { body = await request.json() } catch { /* empty body ok */ }
    const { action } = body

    if (action !== 'approve' && action !== 'reject' && action !== 'withdraw') {
      return NextResponse.json({ error: 'action must be approve | reject | withdraw' }, { status: 400 })
    }

    const member = await requireEngagementMember(projectId, user.id)
    if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isExternal = isExternalEngagementRole(member.role)
    const isLead = isEngagementLeadRole(member.role)

    if (action === 'approve' || action === 'reject') {
      if (!isLead) return NextResponse.json({ error: 'Only Engagement Lead can approve or reject' }, { status: 403 })
    }
    if (action === 'withdraw') {
      if (!isExternal) return NextResponse.json({ error: 'Only EC/EV can withdraw their own uploads' }, { status: 403 })
    }

    const fileInfo = await getFileInfo(projectId, documentIdParam)
    if (!fileInfo) return NextResponse.json({ error: 'File not found' }, { status: 404 })

    const doc = await prisma.engagementDocument.findFirst({
      where: { engagementId: projectId, externalId: fileInfo.externalId },
      select: { id: true, settings: true, fileName: true, firmId: true, connectorId: true },
    })
    if (!doc) return NextResponse.json({ error: 'Document record not found' }, { status: 404 })

    const lock = getLock(doc.settings)
    if (!lock || lock.type !== 'intake') {
      return NextResponse.json({ error: 'Document is not pending intake' }, { status: 409 })
    }

    if (action === 'withdraw' && lock.uploadedBy !== user.id) {
      return NextResponse.json({ error: 'You can only withdraw your own uploads' }, { status: 403 })
    }

    const dedupeKey = `intake-pending:${projectId}:${fileInfo.externalId}`

    if (action === 'approve') {
      // Clear lock — file becomes a normal document
      const prevSettings = (doc.settings as Record<string, unknown>) || {}
      const { lock: _removed, ...restSettings } = prevSettings as any
      await prisma.engagementDocument.update({
        where: { id: doc.id },
        data: { settings: restSettings as object, updatedAt: new Date() },
      })

      // Delete intake notification
      await (prisma as any).notification.deleteMany({ where: { dedupeKey } })

      audit(AUDIT_EVENT.DOCUMENT_CHANGED)
        .scope(AUDIT_SCOPE.DOCUMENT)
        .firm(doc.firmId)
        .engagement(projectId)
        .document(doc.id)
        .actor(user.id)
        .meta({ action: 'intake-approved', fileName: doc.fileName })
        .fireAndForget()

      return NextResponse.json({ ok: true, action: 'approved' })
    }

    // reject or withdraw — delete DB record + trash Drive file
    await prisma.engagementDocument.delete({ where: { id: doc.id } })
    await (prisma as any).notification.deleteMany({ where: { dedupeKey } })

    // Trash the Drive file (fire-and-forget; don't block the response)
    const connectorId = doc.connectorId ?? (await prisma.firm.findUnique({
      where: { id: doc.firmId },
      select: { connectorId: true },
    }))?.connectorId
    if (connectorId) {
      googleDriveConnector.trashFile(connectorId, fileInfo.externalId).catch(() => {})
    }

    // Remove from search index
    await safeInngestSend('file.delete.requested', {
      organizationId: doc.firmId,
      externalId: fileInfo.externalId,
    })

    audit(AUDIT_EVENT.DOCUMENT_DELETED)
      .scope(AUDIT_SCOPE.DOCUMENT)
      .firm(doc.firmId)
      .engagement(projectId)
      .document(doc.id)
      .actor(user.id)
      .meta({ action, fileName: doc.fileName })
      .fireAndForget()

    return NextResponse.json({ ok: true, action })
  } catch (e) {
    console.error('intake PATCH error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
