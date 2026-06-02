import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canViewProject } from '@/lib/permission-helpers'
import { getProjectDocumentContext } from '@/lib/file-utils'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { requireEngagementMember, externalMemberCanAccessDocument } from '@/lib/engagement-access'

/**
 * GET /api/projects/[projectId]/documents/[documentId]/doc-comments
 * List append-only doc comments for a document. Visible to all personas with project access.
 * Messages are immutable (no UPDATE at DB or API level).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, documentId: documentIdParam } = await params
    const ctx = await resolveProjectContext(projectId)
    if (!ctx) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const canView = await canViewProject(ctx.orgId, ctx.clientId, ctx.projectId)
    if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const member = await requireEngagementMember(projectId, user.id)
    if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const docCtx = await getProjectDocumentContext(projectId, documentIdParam)
    if (!docCtx) return NextResponse.json({ error: 'Document not found in this project' }, { status: 404 })

    const canDoc = await externalMemberCanAccessDocument(projectId, member.role, docCtx.externalId)
    if (!canDoc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const messages = await prisma.docCommentMessage.findMany({
      where: {
        projectDocumentId: docCtx.id,
        engagementId: projectId,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        createdAt: true,
        authorUserId: true,
        content: true,
        reactions: true,
      },
    })

    const uniqueUserIds = Array.from(
      new Set(
        messages
          .flatMap((m) => {
            const reactions = (m.reactions ?? {}) as Record<string, unknown>
            const reactionIds = Object.values(reactions).flatMap((v) => (Array.isArray(v) ? v : []))
            return [m.authorUserId, ...reactionIds]
          })
          .filter(Boolean)
      )
    ) as string[]

    const emailByUserId: Record<string, string> = {}
    if (uniqueUserIds.length > 0) {
      const supabaseAdmin = createSupabaseAdmin(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      await Promise.all(
        uniqueUserIds.map(async (uid) => {
          try {
            const { data: { user: u } } = await supabaseAdmin.auth.admin.getUserById(uid)
            emailByUserId[uid] = u?.email ?? ''
          } catch {
            emailByUserId[uid] = ''
          }
        })
      )
    }

    const enriched = messages.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
      authorEmail: m.authorUserId ? (emailByUserId[m.authorUserId] ?? null) : null,
      reactions: Object.fromEntries(
        Object.entries(((m.reactions ?? {}) as Record<string, unknown>)).map(([k, v]) => {
          const ids = Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === 'string') : []
          const emails = ids.map((id) => emailByUserId[id]).filter(Boolean)
          return [k, { count: emails.length, users: emails }]
        })
      ),
    }))

    return NextResponse.json({ messages: enriched })
  } catch (e) {
    const err = e instanceof Error ? e : new Error(typeof e === 'string' ? e : 'Unknown error')
    console.error('GET doc-comments error', { message: err.message, stack: err.stack })
    const isDev = process.env.NODE_ENV === 'development'
    return NextResponse.json(
      { error: isDev ? err.message : 'Failed to load comments' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/projects/[projectId]/documents/[documentId]/doc-comments
 * Append a new comment. Caller must have project view access. Messages are immutable after create.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, documentId: documentIdParam } = await params
    const ctx = await resolveProjectContext(projectId)
    if (!ctx) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const canView = await canViewProject(ctx.orgId, ctx.clientId, ctx.projectId)
    if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const member = await requireEngagementMember(projectId, user.id)
    if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const docCtx = await getProjectDocumentContext(projectId, documentIdParam)
    if (!docCtx) return NextResponse.json({ error: 'Document not found in this project' }, { status: 404 })

    const canDoc = await externalMemberCanAccessDocument(projectId, member.role, docCtx.externalId)
    if (!canDoc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await request.json().catch(() => ({}))
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    if (!content) return NextResponse.json({ error: 'content is required' }, { status: 400 })

    const isReminder = body.isReminder === true
    const recipientId = typeof body.recipientId === 'string' ? body.recipientId : null

    const settings = isReminder && recipientId
      ? { reminder: { recipientId } }
      : {}

    const message = await prisma.docCommentMessage.create({
      data: {
        firmId: ctx.orgId,
        clientId: docCtx.clientId,
        engagementId: projectId,
        projectDocumentId: docCtx.id,
        authorUserId: user.id,
        content,
        settings,
        createdBy: user.id,
        updatedBy: user.id,
      },
      select: {
        id: true,
        createdAt: true,
        authorUserId: true,
        content: true,
        reactions: true,
        settings: true,
      },
    })

    // Create reminder for tagged recipient
    if (isReminder && recipientId) {
      try {
        const { upsertFollowUpReminder } = await import('@/lib/actions/user-reminders')
        const engDetails = await prisma.engagement.findUnique({
          where: { id: projectId },
          select: { slug: true, client: { select: { slug: true, firm: { select: { slug: true } } } } },
        })
        const firmSlug = engDetails?.client?.firm?.slug ?? ''
        const clientSlug = engDetails?.client?.slug ?? ''
        const engSlug = engDetails?.slug ?? ''

        upsertFollowUpReminder({
          userId: recipientId,
          entityKey: 'platform.doc_comments',
          entityValue: message.id,
          action: 'Review comment',
          dateKey: null,
          dateValue: null,
          entityName: content.slice(0, 60),
          firmId: ctx.orgId,
          ctaUrl: firmSlug && clientSlug && engSlug
            ? `/d/f/${firmSlug}/c/${clientSlug}/e/${engSlug}/files#doc-comment:${docCtx.id}:${message.id}`
            : null,
        }).catch(() => {})
      } catch {
        // Never break comment creation if reminder fails
      }
    }

    return NextResponse.json({
      message: {
        ...message,
        settings: undefined,
        createdAt: message.createdAt.toISOString(),
        authorEmail: user.email ?? null,
      },
    })
  } catch (e) {
    console.error('POST doc-comments error', e)
    return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 })
  }
}

/**
 * PATCH /api/projects/[projectId]/documents/[documentId]/doc-comments
 * Set a reminder on an existing comment message.
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
    const ctx = await resolveProjectContext(projectId)
    if (!ctx) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const canView = await canViewProject(ctx.orgId, ctx.clientId, ctx.projectId)
    if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const member = await requireEngagementMember(projectId, user.id)
    if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const docCtx = await getProjectDocumentContext(projectId, documentIdParam)
    if (!docCtx) return NextResponse.json({ error: 'Document not found in this project' }, { status: 404 })

    const body = await request.json().catch(() => ({}))
    const messageId = typeof body.messageId === 'string' ? body.messageId : null
    const recipientId = typeof body.recipientId === 'string' ? body.recipientId : null
    const dateValue = typeof body.dateValue === 'string' ? body.dateValue : null

    if (!messageId) return NextResponse.json({ error: 'messageId is required' }, { status: 400 })
    if (!recipientId) return NextResponse.json({ error: 'recipientId is required' }, { status: 400 })

    // Verify recipient is an actual engagement member
    const recipientMember = await prisma.engagementMember.findFirst({
      where: { engagementId: projectId, userId: recipientId },
    })
    if (!recipientMember) return NextResponse.json({ error: 'Recipient is not a member of this engagement' }, { status: 400 })

    // Verify the message belongs to this document and project
    const message = await prisma.docCommentMessage.findFirst({
      where: {
        id: messageId,
        projectDocumentId: docCtx.id,
        engagementId: projectId,
      },
      select: { id: true, content: true },
    })
    if (!message) return NextResponse.json({ error: 'Comment not found' }, { status: 404 })

    try {
      const { upsertFollowUpReminder } = await import('@/lib/actions/user-reminders')
      const engDetails = await prisma.engagement.findUnique({
        where: { id: projectId },
        select: { slug: true, client: { select: { slug: true, firm: { select: { slug: true } } } } },
      })
      const firmSlug = engDetails?.client?.firm?.slug ?? ''
      const clientSlug = engDetails?.client?.slug ?? ''
      const engSlug = engDetails?.slug ?? ''

      upsertFollowUpReminder({
        userId: recipientId,
        entityKey: 'platform.doc_comments',
        entityValue: message.id,
        action: 'Review comment',
        dateKey: null,
        dateValue: dateValue,
        entityName: message.content.slice(0, 60),
        firmId: ctx.orgId,
        ctaUrl: firmSlug && clientSlug && engSlug
          ? `/d/f/${firmSlug}/c/${clientSlug}/e/${engSlug}/files#doc-comment:${docCtx.id}:${message.id}`
          : null,
      }).catch(() => {})
    } catch {
      // Never break if reminder fails
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('PATCH doc-comments error', e)
    return NextResponse.json({ error: 'Failed to set reminder' }, { status: 500 })
  }
}

/**
 * DELETE /api/projects/[projectId]/documents/[documentId]/doc-comments
 * Remove a reminder for a specific recipient on a comment.
 * Body: { messageId: string; reminderId: string; recipientId: string }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, documentId: documentIdParam } = await params
    const ctx = await resolveProjectContext(projectId)
    if (!ctx) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const canView = await canViewProject(ctx.orgId, ctx.clientId, ctx.projectId)
    if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const reminderId = typeof body.reminderId === 'string' ? body.reminderId : null
    const recipientId = typeof body.recipientId === 'string' ? body.recipientId : null
    if (!reminderId || !recipientId) return NextResponse.json({ error: 'reminderId and recipientId are required' }, { status: 400 })

    // Verify recipient is an engagement member
    const member = await requireEngagementMember(projectId, recipientId)
    if (!member) return NextResponse.json({ error: 'Recipient is not a member' }, { status: 400 })

    // Remove the reminder from the recipient's personalization store
    const p = await prisma.userPersonalization.findUnique({
      where: { userId: recipientId },
      select: { reminders: true },
    })
    if (p) {
      const items = Array.isArray(p.reminders) ? (p.reminders as any[]) : []
      const item = items.find((r) => r.id === reminderId)
      if (item) {
        const { safeInngestSend } = await import('@/lib/inngest/client')
        await safeInngestSend('reminder.email.cancelled', { reminderId })
        await safeInngestSend('reminder.recurring.cancelled', { reminderId })
        await prisma.userPersonalization.update({
          where: { userId: recipientId },
          data: { reminders: items.filter((r) => r.id !== reminderId) as any },
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('DELETE doc-comments reminder error', e)
    return NextResponse.json({ error: 'Failed to remove reminder' }, { status: 500 })
  }
}
