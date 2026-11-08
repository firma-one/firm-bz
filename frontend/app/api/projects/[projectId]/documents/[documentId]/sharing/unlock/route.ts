import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { getFileInfo } from '@/lib/file-utils'
import { StorageNotSupportedError, unlockFileInStorage, type DowngradedPermission } from '@/lib/files/storage-lock'
import { resolveEngagementConnectorId } from '@/lib/connectors/resolve-client-connector'
import { StorageFailure } from '@/lib/connectors/storage-failure'
import { approvalsOf, approvalVersionName, currentApproval } from '@/lib/files/approvals'
import { applyStageChange } from '@/lib/files/apply-stage-change'
import { STAGE_ROW_SELECT, applyDerivedMove, derivedMove } from '@/lib/files/deliverable-stage'
import { deliverableOf } from '@/lib/files/deliverable-of'
import { requireEngagementMember, isEngagementLeadRole, blockIfEngagementCompleted } from '@/lib/engagement-access'
import { documentStage, getLock } from '@/lib/sharing-settings'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'

/**
 * PATCH /api/projects/[projectId]/documents/[documentId]/sharing/unlock
 * Restore Drive roles recorded at lock time (Engagement Lead only). An approved document goes back
 * to To do with its approval kept and marked reopened (.claude/plans/document-approval-record.md).
 *
 * The lock record is the only list of who was downgraded (AP-2). When storage won't give someone
 * their role back, or Google keeps the file read-only, the record keeps what's left and the document
 * stays locked, answered `{ ok: true, unlocked: false, warning }`; Unlock again retries what's left.
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

    const completed = await blockIfEngagementCompleted(projectId)
    if (completed) return completed

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
      select: { id: true, clientId: true, connectorId: true, fileName: true, settings: true },
    })
    if (!existing)
      return NextResponse.json({ error: 'Share record not found' }, { status: 404 })

    const lockData = getLock(existing.settings)
    if (!lockData) {
      return NextResponse.json({ error: 'Document is not locked' }, { status: 409 })
    }

    // The connector the document is on (its own, else its client's), as the regrant route resolves it.
    const connectorId = await resolveEngagementConnectorId(projectId, existing.connectorId)
    if (!connectorId) {
      return NextResponse.json({
        error: "No storage is connected to this engagement, so edit access can't be given back. Reconnect the storage, then try again.",
        code: 'no_connector',
      }, { status: 409 })
    }

    // The file itself: the roles recorded at lock time come back, the content is editable again.
    const outcome = await unlockFileInStorage(connectorId, fileInfo.externalId, (lockData.downgraded ?? []) as DowngradedPermission[])

    const prevSettings = (existing.settings as Record<string, unknown>) || {}
    if (outcome.problem) {
      // What's left stays on record, so Unlock again can finish it; the document stays locked till then.
      const storedLock = (prevSettings.lock as Record<string, unknown> | undefined) ?? {}
      await prisma.engagementDocument.update({
        where: { id: existing.id },
        data: { settings: { ...prevSettings, lock: { ...storedLock, downgraded: outcome.notRestored } } as object, updatedAt: new Date() },
      })
      return NextResponse.json({
        ok: true,
        unlocked: false,
        warning: `${outcome.problem} It stays locked until then. Try Unlock again.`,
        notRestored: outcome.notRestored.map((r) => r.email ?? null),
      })
    }

    const share = (prevSettings.share as Record<string, unknown> | undefined) || {}
    // The approval that stood is reopened, not removed: the decision record keeps it, with when
    // and by whom it was reopened (.claude/plans/document-approval-record.md, section 4).
    const reopened = currentApproval(existing.settings)
    const now = new Date().toISOString()
    const nextSettings: Record<string, unknown> = {
      ...prevSettings,
      share: { ...share, finalizedAt: null },
      ...(reopened ? {
        approvals: approvalsOf(existing.settings).map((r) => (r.id === reopened.id ? { ...r, unlockedAt: now, unlockedBy: user.id } : r)),
      } : {}),
    }
    delete nextSettings.lock

    await prisma.engagementDocument.update({
      where: { id: existing.id },
      data: { settings: nextSettings as object, updatedAt: new Date() },
    })

    // An approved document goes back to To do for the next phase (Deepak, 2026-10-29), and its
    // deliverable follows. Unlock is its own action, so the move skips the one-step rule; a
    // backward move takes no client access away. A document only finalized (no approval) keeps
    // its stage.
    if (documentStage(existing.settings) === 'approved') {
      const row = await prisma.engagementDocument.findUnique({ where: { id: existing.id }, select: STAGE_ROW_SELECT })
      if (row) {
        const moveCtx = { projectId, firmId: fileInfo.organizationId, clientId: existing.clientId ?? null, actorUserId: user.id }
        const deliverableRef = await deliverableOf(projectId, row.parentId)
        const deliverable = deliverableRef
          ? await prisma.engagementDocument.findUnique({ where: { id: deliverableRef.id }, select: STAGE_ROW_SELECT })
          : null
        const move = deliverable ? await derivedMove(projectId, deliverable, new Map([[row.id, 'to_do' as const]])) : null
        await applyStageChange(row, 'to_do', moveCtx, { auditMeta: { reopened: true, ...(reopened ? { approvalId: reopened.id, versionName: approvalVersionName(reopened) } : {}) } })
        if (move) await applyDerivedMove(move, moveCtx)
      }
    }

    audit(AUDIT_EVENT.DOCUMENT_UNLOCKED)
      .scope(AUDIT_SCOPE.DOCUMENT)
      .firm(fileInfo.organizationId)
      .client(existing.clientId ?? undefined)
      .engagement(projectId)
      .document(existing.id)
      .actor(user.id)
      .meta({ fileName: existing.fileName, ...(reopened ? { approvalId: reopened.id, versionName: approvalVersionName(reopened) } : {}) })
      .fireAndForget()

    return NextResponse.json({ ok: true, unlocked: true })
  } catch (e) {
    if (e instanceof StorageNotSupportedError) return NextResponse.json({ error: e.message, code: 'unsupported' }, { status: 502 })
    if (e instanceof StorageFailure) return NextResponse.json({ error: `Couldn't unlock this · ${e.message}`, code: e.reason }, { status: e.status })
    console.error('PATCH sharing/unlock error', e)
    return NextResponse.json({ error: "Couldn't unlock this. Something went wrong on our side. Try again." }, { status: 500 })
  }
}
