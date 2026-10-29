import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { ACTIVITY_STAGES, documentStage, isOnBoard, parseSettingsFromDb, type ActivityStatus } from '@/lib/sharing-settings'
import { getFileInfo } from '@/lib/file-utils'
import { getProjectPersona } from '@/lib/permission-helpers'
import { getAllowedTransitions, type EngagementRoleSlug } from '@/lib/deliverable-stage-roles'
import { applyStageChange, currentStageOf, type StageMoveContext } from '@/lib/files/apply-stage-change'
import {
  STAGE_ROW_SELECT,
  applyDerivedMove,
  confirmationOf,
  deliverableDocuments,
  derivedMove,
  needsConfirmation,
  type StageRowWithParent,
} from '@/lib/files/deliverable-stage'
import { deliverableOf } from '@/lib/files/deliverable-of'
import { withoutFirmOnlySettings } from '@/lib/files/blocked'
import { ApprovalStorageError, archiveApprovedVersion, recordApproval, type ApprovalInStorage } from '@/lib/files/approval-archive'
import { approvalVersionName } from '@/lib/files/approvals'
import { resolveEngagementConnectorId } from '@/lib/connectors/resolve-client-connector'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'

const isExternalRole = (role: string) => role === 'eng_ext_collaborator' || role === 'eng_viewer'

/**
 * PATCH /api/projects/[projectId]/documents/[documentId]/sharing/activity
 * Move a document to another stage (not_started | to_do | in_progress | in_review | approved). Its
 * deliverable then follows (.claude/plans/deliverable-stages-blocked.md, section 2): nobody sets a
 * deliverable's stage, it is worked out from its documents' stages, with the side effects a manual
 * move had (client access on forward moves, Approved finalizes).
 *
 * A move that would show the deliverable to clients for the first time, or approve it, answers 409
 * with `needsConfirmation` until it is resent with `confirm: true`.
 *
 * On a deliverable itself, only a client's one action is taken, on its documents: an external
 * collaborator submits its In progress documents for review, a viewer sends its In review ones back.
 *
 * Approving a document locks it, copies the approved version into the engagement's Archive folder
 * and records it (.claude/plans/document-approval-record.md); if storage can't be reached, the
 * approval is refused (502, `approval_storage`) and nothing changes.
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
    const { resolveProjectContext } = await import('@/lib/resolve-project-context')
    const ctx = await resolveProjectContext(projectId)
    if (!ctx) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const fileInfo = await getFileInfo(projectId, documentIdParam)
    if (!fileInfo)
      return NextResponse.json({ error: 'File not found in this project' }, { status: 404 })

    const body = await request.json().catch(() => ({}))
    const status: ActivityStatus | undefined = ACTIVITY_STAGES.includes(body.status) ? (body.status as ActivityStatus) : undefined
    if (!status)
      return NextResponse.json({ error: 'Invalid or missing status' }, { status: 400 })
    const orderIndex = typeof body.orderIndex === 'number' && body.orderIndex >= 0 ? body.orderIndex : undefined
    const confirmed = body.confirm === true

    const existing = await prisma.engagementDocument.findUnique({
      where: {
        engagementId_firmId_externalId: {
          engagementId: projectId,
          firmId: fileInfo.organizationId,
          externalId: fileInfo.externalId,
        },
      },
      select: STAGE_ROW_SELECT,
    })
    if (!existing)
      return NextResponse.json({ error: 'Share record not found' }, { status: 404 })

    const parsed = parseSettingsFromDb(existing.settings)
    if (parsed.share?.finalizedAt)
      return NextResponse.json({ error: 'Share is finalized and cannot be updated' }, { status: 403 })

    const role = (await getProjectPersona(ctx.firmId, ctx.clientId, ctx.projectId)) as EngagementRoleSlug
    const moveCtx: StageMoveContext = { projectId, firmId: ctx.firmId, clientId: ctx.clientId ?? null, actorUserId: user.id }
    const isDeliverable = existing.isFolder && !!parsed.share?.createdAt

    // ── The deliverable itself: its stage is never set; a client's action moves its documents ──
    if (isDeliverable) {
      if (!isExternalRole(role)) {
        return NextResponse.json(
          { error: "A deliverable's stage follows its documents. Move its documents instead.", code: 'derived_stage' },
          { status: 400 },
        )
      }
      const documents = (await deliverableDocuments(projectId, existing.externalId))
        .filter((d) => isOnBoard(documentStage(d.settings)) && !parseSettingsFromDb(d.settings).share?.finalizedAt)
        .filter((d) => getAllowedTransitions(role, documentStage(d.settings)).includes(status))
      if (documents.length === 0)
        return NextResponse.json({ error: 'This move is not permitted for your role.' }, { status: 403 })

      const changes = new Map(documents.map((d) => [d.id, status] as const))
      const move = await derivedMove(projectId, existing, changes)
      if (needsConfirmation(move) && !confirmed)
        return NextResponse.json({ needsConfirmation: confirmationOf(move) }, { status: 409 })

      for (const doc of documents) await applyStageChange(doc, status, moveCtx)
      if (move) await applyDerivedMove(move, moveCtx)
      return NextResponse.json({ moved: documents.length, deliverable: { id: existing.id, status: move?.to ?? currentStageOf(existing) } })
    }

    // ── A document ──
    const deliverableRef = await deliverableOf(projectId, existing.parentId)
    const deliverable: StageRowWithParent | null = deliverableRef
      ? await prisma.engagementDocument.findUnique({ where: { id: deliverableRef.id }, select: STAGE_ROW_SELECT })
      : null
    // An approved deliverable is locked, its documents with it.
    if (deliverable && parseSettingsFromDb(deliverable.settings).share?.finalizedAt)
      return NextResponse.json({ error: 'The deliverable is approved and its documents can no longer move.' }, { status: 403 })

    // Gate on allowed transitions — single source of truth from deliverable-stage-roles.ts:
    //   EL  (eng_admin):            any ±1 move, including approve
    //   EM  (eng_member):           any ±1 move except approve
    //   EC  (eng_ext_collaborator): in_progress → in_review only (submit for review)
    //   EV  (eng_viewer):           in_review → in_progress only (request changes / push back)
    const currentStatus = documentStage(existing.settings)
    const allowed = getAllowedTransitions(role, currentStatus)
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: 'This move is not permitted for your role.' }, { status: 403 })
    }

    const move = deliverable ? await derivedMove(projectId, deliverable, new Map([[existing.id, status]])) : null
    if (needsConfirmation(move) && !confirmed)
      return NextResponse.json({ needsConfirmation: confirmationOf(move) }, { status: 409 })

    // Approving: lock it, archive the approved version, record it, or refuse with what to do.
    let approval: ApprovalInStorage | null = null
    if (status === 'approved') {
      const [doc, engagement] = await Promise.all([
        prisma.engagementDocument.findUnique({ where: { id: existing.id }, select: { externalId: true, fileName: true, settings: true, connectorId: true } }),
        prisma.engagement.findUnique({ where: { id: projectId }, select: { slug: true, firmId: true } }),
      ])
      const connectorId = doc && engagement ? await resolveEngagementConnectorId(projectId, doc.connectorId) : null
      if (!doc || !engagement || !connectorId)
        return NextResponse.json({ error: 'No storage is connected to archive the approved version. Reconnect the storage and try again.', code: 'approval_storage' }, { status: 502 })
      try {
        approval = await archiveApprovedVersion({
          connectorId,
          engagement,
          document: { externalId: doc.externalId, fileName: doc.fileName, settings: doc.settings },
          deliverableName: deliverable?.fileName ?? null,
          actorUserId: user.id,
        })
      } catch (e) {
        if (e instanceof ApprovalStorageError) {
          console.error('[approval] refused:', e.cause ?? e)
          return NextResponse.json({ error: e.message, code: 'approval_storage' }, { status: 502 })
        }
        throw e
      }
    }

    const approvalMeta = approval
      ? { approvalId: approval.record.id, versionId: approval.record.version.id, versionName: approvalVersionName(approval.record), archivedName: approval.record.archived.name }
      : undefined
    await applyStageChange(existing, status, moveCtx, { orderIndex, auditMeta: approvalMeta })
    if (approval) {
      await recordApproval(existing.id, approval)
      if (approval.lock) {
        audit(AUDIT_EVENT.DOCUMENT_FINALIZED)
          .scope(AUDIT_SCOPE.DOCUMENT)
          .firm(ctx.firmId)
          .client(ctx.clientId)
          .engagement(projectId)
          .document(existing.id)
          .actor(user.id)
          .meta({ fileName: existing.fileName, ...approvalMeta })
          .fireAndForget()
      }
    }
    if (move) await applyDerivedMove(move, moveCtx)

    const updated = await prisma.engagementDocument.findUnique({ where: { id: existing.id } })
    return NextResponse.json({
      sharing: updated && isExternalRole(role) ? { ...updated, settings: withoutFirmOnlySettings(updated.settings) } : updated,
      deliverable: deliverable ? { id: deliverable.id, status: move?.to ?? currentStageOf(deliverable) } : null,
    })
  } catch (e) {
    console.error('PATCH sharing/activity error', e)
    return NextResponse.json({ error: 'Failed to update activity' }, { status: 500 })
  }
}
