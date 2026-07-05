import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { buildSettingsForDb, parseSettingsFromDb, type ActivityStatus } from '@/lib/sharing-settings'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canManageProject } from '@/lib/permission-helpers'
import { syncDocumentSharingUsers } from '@/lib/sync-document-sharing'
import { STAGE_ROLE_MAP } from '@/lib/deliverable-stage-roles'
import { EngagementRole, DocumentSharingPermissionStatus } from '@prisma/client'

const STAGE_ORDER: Record<ActivityStatus, number> = { to_do: 0, in_progress: 1, in_review: 2, approved: 3 }

/**
 * PUT /api/projects/[projectId]/shares/order
 * Reorder shares across swimlanes (and within). Body: { to_do: shareId[], in_progress: shareId[], in_review: shareId[], approved: shareId[] }
 * RBAC: User must have project:can_manage.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId } = await params
    const ctx = await resolveProjectContext(projectId)
    if (!ctx) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const canManage = await canManageProject(ctx.orgId, ctx.clientId, ctx.projectId)
    if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const toDo = Array.isArray(body.to_do) ? body.to_do : []
    const inProgress = Array.isArray(body.in_progress) ? body.in_progress : []
    const inReview = Array.isArray(body.in_review) ? body.in_review : []
    const approved = Array.isArray(body.approved) ? body.approved : []

    const updates: { shareId: string; status: ActivityStatus; orderIndex: number }[] = []
    toDo.forEach((id: string, i: number) => { updates.push({ shareId: id, status: 'to_do', orderIndex: i }) })
    inProgress.forEach((id: string, i: number) => { updates.push({ shareId: id, status: 'in_progress', orderIndex: i }) })
    inReview.forEach((id: string, i: number) => { updates.push({ shareId: id, status: 'in_review', orderIndex: i }) })
    approved.forEach((id: string, i: number) => { updates.push({ shareId: id, status: 'approved', orderIndex: i }) })

    const now = new Date().toISOString()
    const syncTasks: Array<() => Promise<void>> = []

    for (const u of updates) {
      const share = await prisma.engagementDocument.findFirst({
        where: { id: u.shareId, engagementId: projectId },
      })
      if (!share) continue
      const parsed = parseSettingsFromDb(share.settings)
      if (parsed.share?.finalizedAt) continue

      const oldStatus = parsed.activity?.status as ActivityStatus | undefined
      const isForwardMove = oldStatus ? STAGE_ORDER[u.status] > STAGE_ORDER[oldStatus] : true
      const stageConfig = STAGE_ROLE_MAP[u.status]

      const shareUpdate: Record<string, unknown> = {}
      if (isForwardMove && stageConfig.ecEnabled && !parsed.share?.externalCollaborator?.enabled) {
        shareUpdate.externalCollaborator = { enabled: true }
      }
      if (isForwardMove && stageConfig.evEnabled && !parsed.share?.guest?.enabled) {
        shareUpdate.guest = { enabled: true }
      }

      const settings = buildSettingsForDb(share.settings as Record<string, unknown>, {
        activity: { status: u.status, orderIndex: u.orderIndex, updatedAt: now },
        ...(Object.keys(shareUpdate).length > 0 ? { share: shareUpdate as any } : {}),
      })
      await prisma.engagementDocument.update({
        where: { id: share.id },
        data: { settings, updatedAt: new Date() },
      })

      if (Object.keys(shareUpdate).length > 0) {
        const shareId = share.id
        const externalId = share.externalId
        syncTasks.push(async () => {
          try {
            await syncDocumentSharingUsers(shareId, user.id)

            const newlyEnabledRoles: EngagementRole[] = []
            if (shareUpdate.externalCollaborator) newlyEnabledRoles.push(EngagementRole.eng_ext_collaborator)
            if (shareUpdate.guest) newlyEnabledRoles.push(EngagementRole.eng_viewer)

            if (newlyEnabledRoles.length === 0) return

            const members = await prisma.engagementMember.findMany({
              where: { engagementId: projectId, role: { in: newlyEnabledRoles } },
            })
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
              externalId,
              projectId
            )) as Array<{ id: string }>

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
          } catch (err) {
            console.error('[shares/order] descendant sync error:', err)
          }
        })
      }
    }

    // Fire descendant sync after response (non-blocking)
    if (syncTasks.length > 0) {
      Promise.resolve().then(() => Promise.all(syncTasks.map((t) => t())))
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('PUT shares/order error', e)
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 })
  }
}
