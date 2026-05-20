import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { buildSettingsForDb, parseSettingsFromDb, type ActivityStatus } from '@/lib/sharing-settings'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canManageProject } from '@/lib/permission-helpers'

/**
 * PUT /api/projects/[projectId]/shares/order
 * Reorder shares across swimlanes (and within). Body: { to_do: shareId[], in_progress: shareId[], in_review: shareId[], done: shareId[] }
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
    const done = Array.isArray(body.done) ? body.done : []

    const updates: { shareId: string; status: ActivityStatus; orderIndex: number }[] = []
    toDo.forEach((id: string, i: number) => { updates.push({ shareId: id, status: 'to_do', orderIndex: i }) })
    inProgress.forEach((id: string, i: number) => { updates.push({ shareId: id, status: 'in_progress', orderIndex: i }) })
    inReview.forEach((id: string, i: number) => { updates.push({ shareId: id, status: 'in_review', orderIndex: i }) })
    done.forEach((id: string, i: number) => { updates.push({ shareId: id, status: 'done', orderIndex: i }) })

    const now = new Date().toISOString()
    for (const u of updates) {
      const share = await prisma.engagementDocument.findFirst({
        where: { id: u.shareId, engagementId: projectId },
      })
      if (!share) continue
      const parsed = parseSettingsFromDb(share.settings)
      if (parsed.share?.finalizedAt) continue
      const settings = buildSettingsForDb(share.settings as Record<string, unknown>, {
        activity: { status: u.status, orderIndex: u.orderIndex, updatedAt: now },
      })
      await prisma.engagementDocument.update({
        where: { id: share.id },
        data: { settings, updatedAt: new Date() },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('PUT shares/order error', e)
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 })
  }
}
