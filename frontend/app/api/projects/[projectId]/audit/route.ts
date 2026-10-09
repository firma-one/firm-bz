import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canViewProject } from '@/lib/permission-helpers'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { Prisma } from '@prisma/client'
import { isValidAuditEventType } from '@/lib/audit-event-types'

/**
 * GET /api/projects/[projectId]/audit
 * List project-scoped platform audit events (append-only, immutable). Visible to all personas with project access.
 * Query: limit (default 50), cursor, documentId, eventType, fromDate (ISO), toDate (ISO).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { createClient } = await import('@/utils/supabase/server')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId } = await params
    const ctx = await resolveProjectContext(projectId)
    if (!ctx) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const canView = await canViewProject(ctx.orgId, ctx.clientId, ctx.projectId)
    if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)))
    const cursor = searchParams.get('cursor') ?? undefined
    const documentId = searchParams.get('documentId') ?? undefined
    const eventTypes = searchParams.getAll('eventType').filter(Boolean)
    const fromDate = searchParams.get('fromDate') ?? undefined
    const toDate = searchParams.get('toDate') ?? undefined
    const clientKeyword = searchParams.get('clientKeyword')?.trim() ?? undefined
    const projectKeyword = searchParams.get('projectKeyword')?.trim() ?? undefined

    const where: Prisma.PlatformAuditEventWhereInput = {
      engagementId: projectId,
      scope: { in: ['ENGAGEMENT', 'DOCUMENT'] },
    }
    if (documentId) where.projectDocumentId = documentId
    const validEventTypes = eventTypes.filter(isValidAuditEventType)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whereAny = where as any
    if (validEventTypes.length === 1) whereAny.eventType = validEventTypes[0]
    if (validEventTypes.length > 1) whereAny.eventType = { in: validEventTypes }
    if (clientKeyword) where.client = { is: { name: { contains: clientKeyword, mode: 'insensitive' } } }
    if (projectKeyword) where.engagement = { is: { name: { contains: projectKeyword, mode: 'insensitive' } } }
    if (fromDate || toDate) {
      where.eventAt = {}
      if (fromDate) where.eventAt.gte = new Date(fromDate)
      if (toDate) {
        const endOfDay = new Date(toDate)
        endOfDay.setUTCDate(endOfDay.getUTCDate() + 1)
        endOfDay.setUTCHours(0, 0, 0, 0)
        where.eventAt.lt = endOfDay
      }
    }

    const events = await prisma.platformAuditEvent.findMany({
      where,
      orderBy: { eventAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        eventType: true,
        eventAt: true,
        actorUserId: true,
        projectDocumentId: true,
        metadata: true,
        client: { select: { name: true } },
        engagement: { select: { name: true } },
      },
    })

    const hasMore = events.length > limit
    const items = hasMore ? events.slice(0, limit) : events
    const nextCursor = hasMore ? items[items.length - 1]?.id : null

    const uniqueActorIds = Array.from(new Set(items.map((e) => e.actorUserId).filter(Boolean))) as string[]
    const actorEmailMap: Record<string, string> = {}
    const actorNameMap: Record<string, string> = {}
    if (uniqueActorIds.length > 0) {
      const supabaseAdmin = createSupabaseAdmin(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      await Promise.all(
        uniqueActorIds.map(async (actorId) => {
          try {
            const { data: { user: u } } = await supabaseAdmin.auth.admin.getUserById(actorId)
            actorEmailMap[actorId] = u?.email ?? ''
            actorNameMap[actorId] = (u?.user_metadata?.full_name as string | undefined) ?? (u?.user_metadata?.name as string | undefined) ?? u?.email ?? ''
          } catch {
            actorEmailMap[actorId] = ''
            actorNameMap[actorId] = ''
          }
        })
      )
    }

    const eventsWithEmail = items.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      eventAt: e.eventAt.toISOString(),
      actorUserId: e.actorUserId,
      actorEmail: e.actorUserId ? (actorEmailMap[e.actorUserId] ?? null) : null,
      actorName: e.actorUserId ? (actorNameMap[e.actorUserId] ?? null) : null,
      projectDocumentId: e.projectDocumentId,
      metadata: e.metadata,
      clientName: e.client?.name ?? null,
      projectName: e.engagement?.name ?? null,
    }))

    return NextResponse.json({
      events: eventsWithEmail,
      nextCursor,
    })
  } catch (e) {
    console.error('GET project audit error', e)
    return NextResponse.json({ error: 'Failed to load audit' }, { status: 500 })
  }
}
