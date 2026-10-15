import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getPrismaWithRls } from '@/lib/prisma'
import { canManageClient, canManageProject } from '@/lib/permission-helpers'
import { getHomeFirms } from '@/lib/home/home-firms'

function daysAgoUtc(days: number) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d
}

/**
 * `?firms=all` — the cross-firm Inbox (.claude/plans/cross-firm-home-inbox.md): the caller's own
 * notifications in every firm they may open right now (getHomeFirms, computed here, never taken
 * from the request) plus platform-wide ones. Without it, the existing single-firm behavior.
 */
function wantsAllFirms(request: NextRequest): boolean {
  return request.nextUrl.searchParams.get('firms') === 'all'
}

/** The caller's notifications across the firms they may open, plus platform-wide ones. */
async function allFirmsWhere(userId: string) {
  const { firms } = await getHomeFirms(userId)
  return { userId, OR: [{ firmId: { in: firms.map((f) => f.id) } }, { scope: 'PLATFORM' }] }
}

const NOTIFICATION_SELECT = {
  id: true,
  createdAt: true,
  firmId: true,
  scope: true,
  type: true,
  priority: true,
  title: true,
  body: true,
  ctaUrl: true,
  metadata: true,
  readAt: true,
  clientId: true,
  engagementId: true,
  documentId: true,
} as const

/**
 * Retention cleanup (best-effort, no cron) over the given rows:
 * - read: 30 days  - unread: 180 days  - hard cap: 1000
 */
async function pruneNotifications(prisma: any, cleanupWhere: Record<string, unknown>) {
  try {
    await prisma.notification.deleteMany({
      where: {
        ...cleanupWhere,
        OR: [
          { readAt: { not: null }, createdAt: { lt: daysAgoUtc(30) } },
          { readAt: null, createdAt: { lt: daysAgoUtc(180) } },
        ],
      },
    })

    const total = await prisma.notification.count({ where: cleanupWhere })
    if (total > 1000) {
      const overflow = total - 1000
      const oldestRead = await prisma.notification.findMany({
        where: { ...cleanupWhere, readAt: { not: null } },
        orderBy: { createdAt: 'asc' },
        take: overflow,
        select: { id: true },
      })
      const ids = oldestRead.map((r: { id: string }) => r.id)
      if (ids.length) {
        await prisma.notification.deleteMany({ where: { id: { in: ids } } })
      }
    }
  } catch {
    // ignore cleanup failures
  }
}

function serialize(notifications: { createdAt: Date; readAt: Date | null }[]) {
  return notifications.map((n) => ({
    ...n,
    createdAt: n.createdAt.toISOString(),
    readAt: n.readAt ? n.readAt.toISOString() : null,
  }))
}

async function isFirmAdmin(prisma: any, firmId: string, userId: string): Promise<boolean> {
  return Boolean(
    await prisma.firmMember.findFirst({
      where: { firmId, userId, role: 'firm_admin' },
      select: { id: true },
    })
  )
}

async function resolveClientAndProjectIds(args: {
  prisma: any
  orgId: string
  clientSlug?: string | null
  projectSlug?: string | null
}): Promise<{ clientId: string | null; projectId: string | null }> {
  const clientSlug = args.clientSlug?.trim() || null
  const projectSlug = args.projectSlug?.trim() || null

  if (!clientSlug) return { clientId: null, projectId: null }

  const client = await args.prisma.client.findUnique({
    where: {
      firmId_slug: {
        firmId: args.orgId,
        slug: clientSlug,
      },
    },
    select: { id: true },
  })
  if (!client) return { clientId: null, projectId: null }

  if (!projectSlug) return { clientId: client.id, projectId: null }

  const project = await args.prisma.engagement.findUnique({
    where: {
      clientId_slug: {
        clientId: client.id,
        slug: projectSlug,
      },
    },
    select: { id: true },
  })

  return { clientId: client.id, projectId: project?.id ?? null }
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization')
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null
  const { data: { session } } = await supabase.auth.getSession()
  const prisma = getPrismaWithRls(bearer ?? session?.access_token)

  if (wantsAllFirms(request)) {
    // Cleanup covers every row the caller has; the list only the firms they may open now.
    await pruneNotifications(prisma, { userId: user.id })
    const where = await allFirmsWhere(user.id)
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50, select: NOTIFICATION_SELECT }),
      prisma.notification.count({ where: { ...where, readAt: null } }),
    ])
    return NextResponse.json({ unreadCount, canBroadcast: false, broadcastScopes: [], notifications: serialize(notifications) })
  }

  const orgId =
    request.nextUrl.searchParams.get('firmId') ||
    (user.app_metadata?.active_firm_id as string | undefined) ||
    null

  if (!orgId) return NextResponse.json({ notifications: [] })

  // Hard cap 1000 per user across firm + platform.
  await pruneNotifications(prisma, { userId: user.id, OR: [{ firmId: orgId }, { scope: 'PLATFORM' }] })

  const { clientId, projectId } = await resolveClientAndProjectIds({
    prisma,
    orgId,
    clientSlug: request.nextUrl.searchParams.get('clientSlug'),
    projectSlug: request.nextUrl.searchParams.get('projectSlug'),
  })

  const orgAdmin = await isFirmAdmin(prisma, orgId, user.id)
  const clientAllowed = clientId ? (orgAdmin || (await canManageClient(orgId, clientId))) : false
  const projectAllowed =
    clientId && projectId ? (orgAdmin || (await canManageProject(orgId, clientId, projectId))) : false

  const broadcastScopes = [
    ...(orgAdmin ? (['org'] as const) : []),
    ...(clientAllowed ? (['client'] as const) : []),
    ...(projectAllowed ? (['project'] as const) : []),
  ]
  const canBroadcast = broadcastScopes.length > 0

  const notificationWhere = {
    userId: user.id,
    OR: [{ firmId: orgId }, { scope: 'PLATFORM' }],
  }

  const notifications = await prisma.notification.findMany({
    where: notificationWhere,
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: NOTIFICATION_SELECT,
  })

  const unreadCount = await prisma.notification.count({
    where: { ...notificationWhere, readAt: null },
  })

  return NextResponse.json({
    unreadCount,
    canBroadcast,
    broadcastScopes,
    notifications: serialize(notifications),
  })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization')
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null
  const { data: { session } } = await supabase.auth.getSession()
  const prisma = getPrismaWithRls(bearer ?? session?.access_token)

  const body = await request.json().catch(() => ({}))
  const markAllRead = Boolean(body?.markAllRead)

  if (markAllRead && wantsAllFirms(request)) {
    await prisma.notification.updateMany({
      where: { ...(await allFirmsWhere(user.id)), readAt: null },
      data: { readAt: new Date() },
    })
    return NextResponse.json({ success: true })
  }

  if (markAllRead) {
    const orgId =
      request.nextUrl.searchParams.get('firmId') ||
      (user.app_metadata?.active_firm_id as string | undefined) ||
      null
    if (!orgId) return NextResponse.json({ success: true })
    await prisma.notification.updateMany({
      where: { firmId: orgId, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    })
    return NextResponse.json({ success: true })
  }

  const ids = Array.isArray(body?.ids) ? (body.ids as string[]) : []
  if (ids.length === 0) return NextResponse.json({ success: true })

  await prisma.notification.updateMany({
    where: { id: { in: ids }, userId: user.id },
    data: { readAt: new Date() },
  })

  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization')
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null
  const { data: { session } } = await supabase.auth.getSession()
  const prisma = getPrismaWithRls(bearer ?? session?.access_token)

  const body = await request.json().catch(() => ({}))
  const ids = Array.isArray(body?.ids) ? (body.ids as string[]) : []

  // Dismissing from the cross-firm Inbox: the caller's own rows, whichever firm they belong to.
  if (wantsAllFirms(request)) {
    if (ids.length > 0) await prisma.notification.deleteMany({ where: { id: { in: ids }, userId: user.id } })
    return NextResponse.json({ success: true })
  }

  const orgId =
    request.nextUrl.searchParams.get('firmId') ||
    (user.app_metadata?.active_firm_id as string | undefined) ||
    null

  if (!orgId) return NextResponse.json({ success: true })

  if (ids.length > 0) {
    await prisma.notification.deleteMany({
      where: { id: { in: ids }, firmId: orgId, userId: user.id },
    })
    return NextResponse.json({ success: true })
  }
  const readOnly = Boolean(body?.readOnly)
  const olderThanDays = typeof body?.olderThanDays === 'number' ? body.olderThanDays : 30

  await prisma.notification.deleteMany({
    where: {
      firmId: orgId,
      userId: user.id,
      ...(readOnly ? { readAt: { not: null } } : {}),
      createdAt: { lt: daysAgoUtc(olderThanDays) },
    },
  })

  return NextResponse.json({ success: true })
}

