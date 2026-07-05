import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canViewProjectSettings, canViewProject } from '@/lib/permission-helpers'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, documentId } = await params
    const ctx = await resolveProjectContext(projectId)
    if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const canView = await canViewProject(ctx.orgId, ctx.clientId, ctx.projectId)
    if (!canView) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const canManage = await canViewProjectSettings(ctx.orgId, ctx.clientId, ctx.projectId)
    if (!canManage) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const assigneeUserId = (body?.assigneeUserId as string | null) ?? null

    // Validate assignee is an engagement member (if setting one)
    if (assigneeUserId) {
      const member = await prisma.engagementMember.findFirst({
        where: { engagementId: projectId, userId: assigneeUserId },
        select: { userId: true },
      })
      if (!member) return NextResponse.json({ error: 'Assignee is not a member of this engagement' }, { status: 400 })
    }

    const doc = await prisma.engagementDocument.findFirst({
      where: { id: documentId, engagementId: projectId },
      select: { id: true, settings: true },
    })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const existing = (doc.settings as Record<string, unknown>) ?? {}
    const updated = { ...existing, assigneeUserId: assigneeUserId ?? undefined }
    if (!assigneeUserId) delete updated.assigneeUserId

    await prisma.engagementDocument.update({
      where: { id: doc.id },
      data: { settings: updated },
    })

    return NextResponse.json({ success: true, assigneeUserId })
  } catch (e) {
    console.error('assignee PATCH error', e)
    return NextResponse.json({ error: 'Failed to update assignee' }, { status: 500 })
  }
}
