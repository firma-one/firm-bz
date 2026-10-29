import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { BOARD_STAGES, buildSettingsForDb, parseSettingsFromDb, type ActivityStatus } from '@/lib/sharing-settings'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canManageProject } from '@/lib/permission-helpers'

/**
 * PUT /api/projects/[projectId]/shares/order
 * Reorder deliverables within their Board lanes. Body: { to_do: shareId[], in_progress: shareId[], in_review: shareId[], approved: shareId[] }
 *
 * Order only: a deliverable's stage follows its documents (.claude/plans/deliverable-stages-blocked.md,
 * section 2), so one listed in a lane other than its own is left where it is.
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
    const updates: { shareId: string; lane: ActivityStatus; orderIndex: number }[] = []
    for (const lane of BOARD_STAGES) {
      const ids = Array.isArray(body[lane]) ? body[lane] : []
      ids.forEach((id: unknown, i: number) => { if (typeof id === 'string') updates.push({ shareId: id, lane, orderIndex: i }) })
    }

    let skipped = 0
    for (const u of updates) {
      const share = await prisma.engagementDocument.findFirst({
        where: { id: u.shareId, engagementId: projectId },
      })
      if (!share) continue
      const parsed = parseSettingsFromDb(share.settings)
      if (parsed.share?.finalizedAt) continue
      if ((parsed.activity?.status ?? 'to_do') !== u.lane) { skipped++; continue }
      if (parsed.activity?.orderIndex === u.orderIndex) continue

      const settings = buildSettingsForDb(share.settings as Record<string, unknown>, {
        activity: { status: u.lane, orderIndex: u.orderIndex },
      })
      await prisma.engagementDocument.update({
        where: { id: share.id },
        data: { settings, updatedAt: new Date() },
      })
    }

    return NextResponse.json({ ok: true, ...(skipped > 0 ? { skipped } : {}) })
  } catch (e) {
    console.error('PUT shares/order error', e)
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 })
  }
}
