import { NextRequest, NextResponse } from 'next/server'
import { blockIfEngagementCompleted } from '@/lib/engagement-access'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { privateExternalIds } from '@/lib/engagement-sharing-ids'
import { ACTIVITY_STAGES, documentStage, isOnBoard, parseSettingsFromDb, type ActivityStatus } from '@/lib/sharing-settings'
import { getFileInfo } from '@/lib/file-utils'
import { getProjectPersona } from '@/lib/permission-helpers'
import { getAllowedTransitions, type EngagementRoleSlug } from '@/lib/deliverable-stage-roles'
import { applyStageChange, currentStageOf, StageAccessError, type StageMoveContext } from '@/lib/files/apply-stage-change'
import {
  STAGE_ROW_SELECT,
  applyDerivedMove,
  confirmationOf,
  deliverableDocuments,
  derivedMove,
  needsConfirmation,
  type DerivedMove,
  type StageRowWithParent,
} from '@/lib/files/deliverable-stage'
import { deliverableOf } from '@/lib/files/deliverable-of'
import { withoutFirmOnlySettings } from '@/lib/files/blocked'
import { ApprovalStorageError, archiveApprovedVersion, recordApproval, undoApprovalInStorage, type ApprovalInStorage } from '@/lib/files/approval-archive'
import { approvalVersionName } from '@/lib/files/approvals'
import { resolveEngagementConnectorId } from '@/lib/connectors/resolve-client-connector'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'
import { BRAND_NAME } from '@/config/brand'

const isExternalRole = (role: string) => role === 'eng_ext_collaborator' || role === 'eng_viewer'

const warningOf = (warnings: string[]) => (warnings.length > 0 ? { warning: warnings.join(' ') } : {})

/**
 * The deliverable follows its documents. When it can't (clients couldn't be given what its move opens,
 * P1-58), the documents' move stands and this says the deliverable stayed; null when it followed.
 */
async function follow(move: DerivedMove | null, ctx: StageMoveContext): Promise<string | null> {
  if (!move) return null
  try {
    await applyDerivedMove(move, ctx)
    return null
  } catch (e) {
    if (!(e instanceof StageAccessError)) throw e
    return `Moved, but ${move.deliverable.fileName} stayed where it was · clients couldn't be given access to its documents. Move a document again to retry.`
  }
}

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
 * A file outside any deliverable has a stage for the firm's own tracking: only the firm moves it, and
 * moving it never shares it with clients (applyStageChange's `internalOnly`). Nor does moving a private
 * document, which clients can neither see nor move.
 *
 * Approving a document locks it, copies the approved version into the engagement's Archive folder
 * and records it (.claude/plans/document-approval-record.md); if storage can't be reached, the
 * approval is refused (502, `approval_storage`) and nothing changes. When storage did its part but
 * Firma couldn't record it (P1-55), the stage is put back and storage undone, or, when that can't be
 * done either, the answer says the file is approved in storage only (`approval_not_recorded`).
 * What storage refused that doesn't undo an approval comes back as `warning`.
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
    const completed = await blockIfEngagementCompleted(projectId)
    if (completed) return completed
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
      const privateIds = await privateExternalIds(projectId)
      const documents = (await deliverableDocuments(projectId, existing.externalId))
        .filter((d) => !privateIds.has(d.externalId))
        .filter((d) => isOnBoard(documentStage(d.settings)) && !parseSettingsFromDb(d.settings).share?.finalizedAt)
        .filter((d) => getAllowedTransitions(role, documentStage(d.settings)).includes(status))
      if (documents.length === 0)
        return NextResponse.json({ error: 'This move is not permitted for your role.' }, { status: 403 })

      const changes = new Map(documents.map((d) => [d.id, status] as const))
      const move = await derivedMove(projectId, existing, changes)
      if (needsConfirmation(move) && !confirmed)
        return NextResponse.json({ needsConfirmation: confirmationOf(move) }, { status: 409 })

      for (const doc of documents) await applyStageChange(doc, status, moveCtx)
      const stayed = await follow(move, moveCtx)
      return NextResponse.json({
        moved: documents.length,
        deliverable: { id: existing.id, status: move && !stayed ? move.to : currentStageOf(existing) },
        ...(stayed ? { warning: stayed } : {}),
      })
    }

    // ── A document ──
    const deliverableRef = await deliverableOf(projectId, existing.parentId)
    const deliverable: StageRowWithParent | null = deliverableRef
      ? await prisma.engagementDocument.findUnique({ where: { id: deliverableRef.id }, select: STAGE_ROW_SELECT })
      : null
    // An approved deliverable is locked, its documents with it.
    if (deliverable && parseSettingsFromDb(deliverable.settings).share?.finalizedAt)
      return NextResponse.json({ error: 'The deliverable is approved and its documents can no longer move.' }, { status: 403 })
    if (!deliverable && isExternalRole(role))
      return NextResponse.json({ error: 'This move is not permitted for your role.' }, { status: 403 })
    const isPrivate = !!deliverable && (await privateExternalIds(projectId)).has(existing.externalId)
    if (isPrivate && isExternalRole(role))
      return NextResponse.json({ error: 'This move is not permitted for your role.' }, { status: 403 })

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
    /** Where the approval was made in storage, to undo it if Firma can't record it. */
    let approvedIn: { connectorId: string; externalId: string } | null = null
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
        approvedIn = { connectorId, externalId: doc.externalId }
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
    let stageMoved = false
    try {
      await applyStageChange(existing, status, moveCtx, { orderIndex, auditMeta: approvalMeta, internalOnly: !deliverable || isPrivate })
      stageMoved = true
      // Once more on a failure: a dropped connection shouldn't cost a second archive copy.
      if (approval) await recordApproval(existing.id, approval).catch(() => recordApproval(existing.id, approval!))
    } catch (e) {
      if (!approval || !approvedIn) throw e
      console.error('[approval] approved in storage, but not recorded:', e)
      // The stage goes back first: Approved with no record has no lock to unlock it by.
      const stageBack = !stageMoved || await prisma.engagementDocument
        .update({ where: { id: existing.id }, data: { settings: existing.settings as object, updatedAt: new Date() } })
        .then(() => true, () => false)
      const undone = stageBack && await undoApprovalInStorage(approvedIn.connectorId, approvedIn.externalId, approval)
      return NextResponse.json({
        error: undone
          ? `Couldn't approve this. ${BRAND_NAME} couldn't save the approval, so its lock and archive copy were undone in storage. Try again.`
          : `Approved in storage, but ${BRAND_NAME} couldn't record it. The file is locked and its approved version was copied to the Archive folder. Try again in a moment.`,
        code: 'approval_not_recorded',
      }, { status: 500 })
    }
    if (approval) {
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
    const stayed = await follow(move, moveCtx)

    const updated = await prisma.engagementDocument.findUnique({ where: { id: existing.id } })
    return NextResponse.json({
      sharing: updated && isExternalRole(role) ? { ...updated, settings: withoutFirmOnlySettings(updated.settings) } : updated,
      deliverable: deliverable ? { id: deliverable.id, status: move && !stayed ? move.to : currentStageOf(deliverable) } : null,
      ...(warningOf([...(approval?.warnings ?? []), ...(stayed ? [stayed] : [])])),
    })
  } catch (e) {
    if (e instanceof StageAccessError) return NextResponse.json({ error: e.message, code: 'stage_access' }, { status: 500 })
    console.error('PATCH sharing/activity error', e)
    return NextResponse.json({ error: "Couldn't change the stage. Something went wrong on our side. Try again." }, { status: 500 })
  }
}
