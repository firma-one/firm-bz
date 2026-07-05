import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { buildSettingsForDb, parseSettingsFromDb, type ActivityStatus } from '@/lib/sharing-settings'
import { syncDocumentSharingUsers } from '@/lib/sync-document-sharing'
import { EngagementRole, DocumentSharingPermissionStatus } from '@prisma/client'
import { getFileInfo } from '@/lib/file-utils'
import { getProjectPersona } from '@/lib/permission-helpers'
import { STAGE_ROLE_MAP, getAllowedTransitions, type EngagementRoleSlug } from '@/lib/deliverable-stage-roles'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'

const VALID_STATUSES: ActivityStatus[] = ['to_do', 'in_progress', 'in_review', 'approved']
const STAGE_ORDER: Record<ActivityStatus, number> = { to_do: 0, in_progress: 1, in_review: 2, approved: 3 }

/**
 * PATCH /api/projects/[projectId]/documents/[documentId]/sharing/activity
 * Update activity status (to_do | in_progress | in_review | approved). Lane transitions control EC/EV access.
 * RBAC: User must have project:can_view_internal to update activity.
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
    const status: ActivityStatus | undefined = VALID_STATUSES.includes(body.status) ? (body.status as ActivityStatus) : undefined
    if (!status)
      return NextResponse.json({ error: 'Invalid or missing status' }, { status: 400 })
    const orderIndex = typeof body.orderIndex === 'number' && body.orderIndex >= 0 ? body.orderIndex : undefined

    const existing = await prisma.engagementDocument.findUnique({
      where: {
        engagementId_firmId_externalId: {
          engagementId: projectId,
          firmId: fileInfo.organizationId,
          externalId: fileInfo.externalId,
        },
      },
    })
    if (!existing)
      return NextResponse.json({ error: 'Share record not found' }, { status: 404 })

    const parsed = parseSettingsFromDb(existing.settings)
    if (parsed.share?.finalizedAt)
      return NextResponse.json({ error: 'Share is finalized and cannot be updated' }, { status: 403 })

    const role = await getProjectPersona(ctx.firmId, ctx.clientId, ctx.projectId)
    const currentStatus = (parsed.activity?.status ?? 'to_do') as ActivityStatus

    // Gate on allowed transitions — single source of truth from deliverable-stage-roles.ts:
    //   EL  (eng_admin):            any ±1 move, including approve
    //   EM  (eng_member):           any ±1 move except approve
    //   EC  (eng_ext_collaborator): in_progress → in_review only (submit for review)
    //   EV  (eng_viewer):           in_review → in_progress only (request changes / push back)
    const allowed = getAllowedTransitions(role as EngagementRoleSlug, currentStatus)
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: 'This move is not permitted for your role.' }, { status: 403 })
    }

    const oldStatus = parsed.activity?.status
    const stageConfig = STAGE_ROLE_MAP[status]
    const now = new Date().toISOString()
    const isForwardMove = oldStatus ? STAGE_ORDER[status] > STAGE_ORDER[oldStatus] : true

    // Only update EC/EV enabled flags on forward moves — once granted, access is never
    // revoked by a backward lane move. Use "Untag as Deliverable" to fully revoke.
    const shareUpdate: Record<string, unknown> = {}
    if (isForwardMove && stageConfig.ecEnabled && !parsed.share?.externalCollaborator?.enabled) {
      shareUpdate.externalCollaborator = { enabled: true }
    }
    if (isForwardMove && stageConfig.evEnabled && !parsed.share?.guest?.enabled) {
      shareUpdate.guest = { enabled: true }
    }
    // Set finalizedAt when moving to approved
    const finalizedAt = status === 'approved' ? now : (status !== oldStatus ? null : undefined)

    const settings = buildSettingsForDb(existing.settings as Record<string, unknown>, {
      activity: { status, updatedAt: now, orderIndex },
      ...(Object.keys(shareUpdate).length > 0 ? { share: shareUpdate as any } : {}),
      ...(finalizedAt !== undefined ? { finalizedAt } : {}),
    })

    await prisma.engagementDocument.update({
      where: { id: existing.id },
      data: { settings, updatedAt: new Date() },
    })

    // Sync EC/EV sharing rows for the folder and all descendants on forward moves
    if (Object.keys(shareUpdate).length > 0) {
      Promise.resolve().then(async () => {
        try {
          // Folder itself — syncDocumentSharingUsers reads the folder's own settings correctly
          await syncDocumentSharingUsers(existing.id, user.id)

          // Descendants have empty settings so syncDocumentSharingUsers would no-op on them.
          // Instead, directly insert rows for the newly-enabled roles based on the folder's flags.
          const newlyEnabledRoles: EngagementRole[] = []
          if (shareUpdate.externalCollaborator) newlyEnabledRoles.push(EngagementRole.eng_ext_collaborator)
          if (shareUpdate.guest) newlyEnabledRoles.push(EngagementRole.eng_viewer)

          console.log('[activity] shareUpdate:', JSON.stringify(shareUpdate))
          console.log('[activity] newlyEnabledRoles:', newlyEnabledRoles)

          if (newlyEnabledRoles.length === 0) return

          const members = await prisma.engagementMember.findMany({
            where: { engagementId: projectId, role: { in: newlyEnabledRoles } },
          })
          console.log('[activity] members found:', members.length, members.map(m => ({ userId: m.userId, role: m.role })))
          if (members.length === 0) return

          const descendants = (await (prisma as any).$queryRawUnsafe(
            `WITH RECURSIVE descendants AS (
               SELECT id, "externalId" FROM platform.engagement_documents
               WHERE "parentId" = $1 AND "engagementId" = $2::uuid
               UNION ALL
               SELECT ed.id, ed."externalId" FROM platform.engagement_documents ed
               INNER JOIN descendants d ON ed."parentId" = d."externalId"
               WHERE ed."engagementId" = $2::uuid
             )
             SELECT id FROM descendants`,
            existing.externalId,
            projectId
          )) as Array<{ id: string }>

          console.log('[activity] descendants found:', descendants.length, 'for externalId:', existing.externalId)

          for (const child of descendants) {
            for (const member of members) {
              await prisma.engagementDocumentSharingUser.upsert({
                where: { projectDocumentId_userId: { projectDocumentId: child.id, userId: member.userId } },
                update: { sharingPermissionStatus: DocumentSharingPermissionStatus.INHERITED, updatedBy: user.id },
                create: {
                  projectDocumentId: child.id,
                  engagementId: projectId,
                  userId: member.userId,
                  sharingPermissionStatus: DocumentSharingPermissionStatus.INHERITED,
                  createdBy: user.id,
                  updatedBy: user.id,
                },
              })
            }
          }
          console.log('[activity] descendant upserts complete')
        } catch (err) {
          console.error('[activity] descendant sync error:', err)
        }
      })
    }

    audit(AUDIT_EVENT.DOCUMENT_STATUS_CHANGED)
      .scope(AUDIT_SCOPE.DOCUMENT)
      .firm(fileInfo.organizationId)
      .client(ctx.clientId)
      .engagement(projectId)
      .document(existing.id)
      .actor(user.id)
      .meta({ fileName: existing.fileName, oldStatus: oldStatus ?? null, newStatus: status })
      .fireAndForget()

    const updated = await prisma.engagementDocument.findUnique({
      where: {
        engagementId_firmId_externalId: {
          engagementId: projectId,
          firmId: fileInfo.organizationId,
          externalId: fileInfo.externalId,
        },
      },
    })
    return NextResponse.json({ sharing: updated })
  } catch (e) {
    console.error('PATCH sharing/activity error', e)
    return NextResponse.json({ error: 'Failed to update activity' }, { status: 500 })
  }
}
