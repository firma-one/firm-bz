import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getPrismaWithRls } from '@/lib/prisma'
import { canManageClient, canManageProject } from '@/lib/permission-helpers'

const MAX_CHARS = 1000

type BroadcastScope = 'org' | 'client' | 'project'

async function isOrgAdmin(prisma: any, orgId: string, userId: string): Promise<boolean> {
  return Boolean(
    await prisma.firmMember.findFirst({
      where: { firmId: orgId, userId, role: 'firm_admin' },
      select: { id: true },
    })
  )
}

async function resolveClientAndProjectIds(args: {
  prisma: any
  orgId: string
  clientId?: string | null
  projectId?: string | null
  clientSlug?: string | null
  projectSlug?: string | null
}): Promise<{ clientId: string | null; projectId: string | null }> {
  const directClientId = args.clientId?.trim() || null
  const directProjectId = args.projectId?.trim() || null
  if (directClientId) {
    // Ids from the body must sit inside the firm being broadcast from — otherwise a firm admin of
    // their own throwaway firm could message another tenant's client or engagement members.
    // (.claude/plans/access-gates.md, P0 #8)
    const client = await args.prisma.client.findFirst({ where: { id: directClientId, firmId: args.orgId }, select: { id: true } })
    if (!client) return { clientId: null, projectId: null }
    if (!directProjectId) return { clientId: client.id, projectId: null }
    const engagement = await args.prisma.engagement.findFirst({ where: { id: directProjectId, clientId: client.id }, select: { id: true } })
    return { clientId: client.id, projectId: engagement ? directProjectId : null }
  }

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

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization')
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null
  const { data: { session } } = await supabase.auth.getSession()
  const prisma = getPrismaWithRls(bearer ?? session?.access_token)

  const orgId =
    request.nextUrl.searchParams.get('firmId') ||
    (user.app_metadata?.active_firm_id as string | undefined) ||
    null
  if (!orgId) return NextResponse.json({ error: 'Missing firmId' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const messageRaw = typeof body?.message === 'string' ? body.message : ''
  const titleRaw = typeof body?.title === 'string' ? body.title : ''
  const scopeRaw = typeof body?.scope === 'string' ? body.scope : 'org'
  const scope: BroadcastScope = scopeRaw === 'client' || scopeRaw === 'project' ? scopeRaw : 'org'
  const message = messageRaw.trim()
  const title = titleRaw.trim() || 'Broadcast'

  if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  if (message.length > MAX_CHARS) return NextResponse.json({ error: `Message must be <= ${MAX_CHARS} characters` }, { status: 400 })

  const orgAdmin = await isOrgAdmin(prisma, orgId, user.id)

  const { clientId, projectId } = await resolveClientAndProjectIds({
    prisma,
    orgId,
    clientId: typeof body?.clientId === 'string' ? body.clientId : null,
    projectId: typeof body?.projectId === 'string' ? body.projectId : null,
    clientSlug: typeof body?.clientSlug === 'string' ? body.clientSlug : request.nextUrl.searchParams.get('clientSlug'),
    projectSlug: typeof body?.projectSlug === 'string' ? body.projectSlug : request.nextUrl.searchParams.get('projectSlug'),
  })

  if (scope === 'org') {
    if (!orgAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (scope === 'client') {
    if (!clientId) return NextResponse.json({ error: 'Missing client context' }, { status: 400 })
    const allowed = orgAdmin || (await canManageClient(orgId, clientId))
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (scope === 'project') {
    if (!clientId || !projectId) return NextResponse.json({ error: 'Missing project context' }, { status: 400 })
    const allowed = orgAdmin || (await canManageProject(orgId, clientId, projectId))
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const recipientIds = new Set<string>()
  if (scope === 'org') {
    const orgRecipients = await prisma.firmMember.findMany({
      where: { firmId: orgId, membershipType: 'internal' },
      select: { userId: true },
    })
    orgRecipients.forEach((m) => recipientIds.add(m.userId))
  } else if (scope === 'client') {
    const [orgAdmins, clientMembers] = await Promise.all([
      prisma.firmMember.findMany({
        where: { firmId: orgId, role: 'firm_admin', membershipType: 'internal' },
        select: { userId: true },
      }),
      prisma.clientMember.findMany({
        where: { clientId: clientId! },
        select: { userId: true },
      }),
    ])
    orgAdmins.forEach((m) => recipientIds.add(m.userId))
    clientMembers.forEach((m) => recipientIds.add(m.userId))
  } else {
    const [orgAdmins, projectMembers] = await Promise.all([
      prisma.firmMember.findMany({
        where: { firmId: orgId, role: 'firm_admin', membershipType: 'internal' },
        select: { userId: true },
      }),
      prisma.engagementMember.findMany({
        where: { engagementId: projectId! },
        select: { userId: true },
      }),
    ])
    orgAdmins.forEach((m) => recipientIds.add(m.userId))
    projectMembers.forEach((m) => recipientIds.add(m.userId))
  }

  const recipients = Array.from(recipientIds)

  if (recipients.length === 0) return NextResponse.json({ success: true, created: 0 })

  const now = new Date()
  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      firmId: orgId,
      clientId: scope === 'client' || scope === 'project' ? clientId : null,
        engagementId: scope === 'project' ? projectId : null,
      documentId: null,
      userId,
      type: 'BROADCAST',
      priority: 'CRITICAL',
      title,
      body: message,
      ctaUrl: null,
      metadata: { broadcast: true, scope } as any,
      channels: { inApp: true } as any,
      dedupeKey: null,
      readAt: null,
      deliveredAt: now,
      emailSentAt: null,
    })),
    skipDuplicates: false,
  })

  return NextResponse.json({ success: true, created: recipients.length })
}

