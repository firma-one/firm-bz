import { NextRequest, NextResponse } from 'next/server'
import { isAgentUserIdAsync } from '@/lib/ai/agent-email'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canViewProject } from '@/lib/permission-helpers'
import { getProjectDocumentContext } from '@/lib/file-utils'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { requireEngagementMember, externalMemberCanAccessDocument, isExternalEngagementRole, visibleDocumentIdsFor, blockIfEngagementCompleted, getEngagementStatus } from '@/lib/engagement-access'
import { canBeRemindedOfInternalNote, canWriteInternalNote, visibleCommentsWhere } from '@/lib/comments/internal-notes'
import { taggedDocumentsIn } from '@/lib/comments/tagged-documents'
import { markDiscussionRead, reopenDiscussion } from '@/lib/comments/discussions'
import { loadAnchorForCaps, effectiveCommentHistoryDays } from '@/lib/billing/effective-billing-caps'
import { engagementDocCommentPath } from '@/lib/navigation/firm-paths'
import { getFirmReminderConfig } from '@/lib/firm-reminder-config'
import { createEventNotifications, sendEventEmailToUser, buildAbsoluteUrl } from '@/lib/notify-event'
import { renderClientCommentEmail } from '@/lib/email-templates/client-comment'

async function purgeStaleDocComments(firmId: string): Promise<void> {
  try {
    const anchor = await loadAnchorForCaps(firmId)
    if (!anchor) return
    const days = effectiveCommentHistoryDays(anchor)
    if (days === null) return  // unlimited — keep all history

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)

    await prisma.docCommentMessage.deleteMany({
      where: { firmId, createdAt: { lt: cutoff } },
    })
  } catch {
    // Purge failures must never surface to callers
  }
}

// What the comments pane shows when a request fails on our side: plain words, never a raw error.
const LOAD_FAILED = "Couldn't load the comments. Try again."
const POST_FAILED = "Couldn't post your comment on our side. Try again."
/** Read after "Couldn't notify Anna · ", so it doesn't start with "Couldn't" again. */
const REMINDER_NOT_SAVED = "The reminder wasn't saved on our side. Try again."

/**
 * Saves the reminder (or the mention's notice) of a comment for one person. Awaited, and its failure
 * thrown: a write left to run after the response may never finish on Vercel, and the person who
 * posted must be told who wasn't notified (CM-1).
 */
async function remindOfComment(args: {
  recipientId: string
  projectId: string
  firmId: string
  projectDocumentId: string
  messageId: string
  content: string
  dateValue: string | null
}): Promise<void> {
  const { upsertFollowUpReminder } = await import('@/lib/reminders/reminder-service')
  const engDetails = await prisma.engagement.findUnique({
    where: { id: args.projectId },
    select: { slug: true, client: { select: { slug: true, firm: { select: { slug: true, group: { select: { slug: true } } } } } } },
  })
  const groupSlug = engDetails?.client?.firm?.group?.slug ?? ''
  const firmSlug = engDetails?.client?.firm?.slug ?? ''
  const clientSlug = engDetails?.client?.slug ?? ''
  const engSlug = engDetails?.slug ?? ''
  await upsertFollowUpReminder({
    userId: args.recipientId,
    entityKey: 'platform.doc_comments',
    entityValue: args.messageId,
    action: 'Review comment',
    dateKey: null,
    dateValue: args.dateValue,
    entityName: args.content.slice(0, 60),
    firmId: args.firmId,
    ctaUrl: groupSlug && firmSlug && clientSlug && engSlug
      ? engagementDocCommentPath(groupSlug, firmSlug, clientSlug, engSlug, args.projectDocumentId, args.messageId)
      : null,
  })
}

/**
 * GET /api/projects/[projectId]/documents/[documentId]/doc-comments
 * List append-only doc comments for a document. Visible to all personas with project access.
 * Messages are immutable (no UPDATE at DB or API level).
 *
 * ?limit=N — only the latest N comments, oldest first (the Comments page's peek at a thread).
 * Also returns `taggedDocuments`: the documents tagged with "#" that the viewer may access, by doc ID.
 */
export async function GET(
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

    const visible = await visibleDocumentIdsFor(projectId, member.role)
    if (visible && !visible.has(docCtx.externalId)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const limitParam = Number(request.nextUrl.searchParams.get('limit'))
    const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 50) : null
    const latest = await prisma.docCommentMessage.findMany({
      where: {
        projectDocumentId: docCtx.id,
        engagementId: projectId,
        // A client never sees the firm's internal notes (lib/comments/internal-notes.ts).
        ...visibleCommentsWhere(member.role),
      },
      orderBy: { createdAt: limit ? 'desc' : 'asc' },
      ...(limit ? { take: limit } : {}),
      select: {
        id: true,
        createdAt: true,
        authorUserId: true,
        content: true,
        reactions: true,
        isInternal: true,
      },
    })
    const messages = limit ? latest.reverse() : latest

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

    const taggedDocuments = await taggedDocumentsIn(projectId, messages.map((m) => m.content), visible)

    return NextResponse.json({ messages: enriched, taggedDocuments, readOnly: (await getEngagementStatus(projectId)) === 'COMPLETED' })
  } catch (e) {
    const err = e instanceof Error ? e : new Error(typeof e === 'string' ? e : 'Unknown error')
    console.error('GET doc-comments error', { message: err.message, stack: err.stack })
    return NextResponse.json({ error: LOAD_FAILED }, { status: 500 })
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

    const completed = await blockIfEngagementCompleted(projectId)
    if (completed) return completed

    const docCtx = await getProjectDocumentContext(projectId, documentIdParam)
    if (!docCtx) return NextResponse.json({ error: 'Document not found in this project' }, { status: 404 })

    const canDoc = await externalMemberCanAccessDocument(projectId, member.role, docCtx.externalId)
    if (!canDoc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await request.json().catch(() => ({}))
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    if (!content) return NextResponse.json({ error: 'content is required' }, { status: 400 })

    const isReminder = body.isReminder === true
    const recipientId = typeof body.recipientId === 'string' ? body.recipientId : null
    const isInternal = body.internal === true
    if (isInternal && !canWriteInternalNote(member.role)) {
      return NextResponse.json({ error: 'Only Leads and Full Access contributors can write internal notes' }, { status: 403 })
    }
    if (isInternal && isReminder && recipientId) {
      const recipient = await prisma.engagementMember.findFirst({ where: { engagementId: projectId, userId: recipientId }, select: { role: true } })
      if (!canBeRemindedOfInternalNote(recipient?.role)) {
        return NextResponse.json({ error: 'An internal note can only remind Leads and Full Access contributors' }, { status: 400 })
      }
    }

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
        isInternal,
        createdBy: user.id,
        updatedBy: user.id,
      },
      select: {
        id: true,
        createdAt: true,
        authorUserId: true,
        content: true,
        reactions: true,
        isInternal: true,
        settings: true,
      },
    })

    // Fire-and-forget rolling purge — do not await, never block the caller
    void purgeStaleDocComments(ctx.orgId)

    // A new reply reopens a resolved discussion, and the author has read it. An internal note doesn't
    // reopen it: the client would see it come back with nothing new to read (lib/comments/internal-notes.ts).
    try {
      await Promise.all([
        ...(isInternal ? [] : [reopenDiscussion(docCtx.id)]),
        markDiscussionRead(user.id, docCtx.id, projectId),
      ])
    } catch (e) {
      console.error('doc-comments: discussion state not updated', { message: e instanceof Error ? e.message : String(e) })
    }

    // Event notification — new comment from an external client (EC/EV), gated per-firm
    if (isExternalEngagementRole(member.role)) {
      Promise.resolve().then(async () => {
        try {
          const config = await getFirmReminderConfig(ctx.orgId)
          const eventCfg = config.events.externalClientComment
          if (!eventCfg.inApp && !eventCfg.email) return

          const staff = await prisma.engagementMember.findMany({
            where: { engagementId: projectId, role: { in: ['eng_admin', 'eng_member'] } },
            select: { userId: true },
          })
          if (staff.length === 0) return

          const engDetails = await prisma.engagement.findUnique({
            where: { id: projectId },
            select: { name: true, slug: true, client: { select: { slug: true, firm: { select: { slug: true, group: { select: { slug: true } } } } } } },
          })
          const groupSlug = engDetails?.client?.firm?.group?.slug ?? ''
          const firmSlug = engDetails?.client?.firm?.slug ?? ''
          const clientSlug = engDetails?.client?.slug ?? ''
          const engSlug = engDetails?.slug ?? ''
          const relativeUrl = groupSlug && firmSlug && clientSlug && engSlug
            ? engagementDocCommentPath(groupSlug, firmSlug, clientSlug, engSlug, docCtx.id, message.id)
            : null
          const ctaUrl = await buildAbsoluteUrl(relativeUrl, { engagementId: projectId })
          const commenterName = user.email ?? 'A client'
          const commentPreview = content.slice(0, 140)

          if (eventCfg.inApp) {
            await createEventNotifications(staff.map((m) => ({
              firmId: ctx.orgId,
              clientId: docCtx.clientId,
              engagementId: projectId,
              documentId: docCtx.id,
              userId: m.userId,
              type: 'EXTERNAL_CLIENT_COMMENT',
              title: `New comment from ${commenterName}`,
              body: commentPreview,
              ctaUrl: relativeUrl,
              metadata: { commentId: message.id, commenterName },
              dedupeKey: `comment:${message.id}:notify`,
            })))
          }
          if (eventCfg.email) {
            await Promise.all(staff.map((m) => sendEventEmailToUser(m.userId, () =>
              renderClientCommentEmail({
                commenterName,
                engagementName: engDetails?.name ?? '',
                commentPreview,
                ctaUrl,
              })
            )))
          }
        } catch (e) {
          console.error('[doc-comments] event notification error:', e)
        }
      })
    }

    // The tagged recipient's reminder. The comment stands either way; who wasn't notified is said.
    let notNotified: string[] = []
    if (isReminder && recipientId) {
      try {
        await remindOfComment({ recipientId, projectId, firmId: ctx.orgId, projectDocumentId: docCtx.id, messageId: message.id, content, dateValue: null })
      } catch (e) {
        console.error('doc-comments: reminder not saved', { messageId: message.id, message: e instanceof Error ? e.message : String(e) })
        notNotified = [recipientId]
      }
    }

    return NextResponse.json({
      message: {
        ...message,
        settings: undefined,
        createdAt: message.createdAt.toISOString(),
        authorEmail: user.email ?? null,
      },
      ...(notNotified.length > 0 ? { notNotified, warning: "Comment posted, but the person you reminded wasn't notified. Try again from the comment." } : {}),
    })
  } catch (e) {
    console.error('POST doc-comments error', e)
    return NextResponse.json({ error: POST_FAILED }, { status: 500 })
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

    const completed = await blockIfEngagementCompleted(projectId)
    if (completed) return completed

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
    // See the reminder route: Brio is a member of every engagement but will never read one, so
    // membership alone is not enough to be a valid recipient.
    if (await isAgentUserIdAsync(recipientId)) {
      return NextResponse.json({ error: 'Reminders cannot be assigned to an assistant' }, { status: 400 })
    }

    // Verify the message belongs to this document and project
    const message = await prisma.docCommentMessage.findFirst({
      where: {
        id: messageId,
        projectDocumentId: docCtx.id,
        engagementId: projectId,
        ...visibleCommentsWhere(member.role),
      },
      select: { id: true, content: true, isInternal: true },
    })
    if (!message) return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
    if (message.isInternal && !canBeRemindedOfInternalNote(recipientMember.role)) {
      return NextResponse.json({ error: 'An internal note can only remind Leads and Full Access contributors' }, { status: 400 })
    }

    // Awaited and checked: the answer says whether this person will be notified (CM-1).
    await remindOfComment({ recipientId, projectId, firmId: ctx.orgId, projectDocumentId: docCtx.id, messageId: message.id, content: message.content, dateValue })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('PATCH doc-comments error', e)
    return NextResponse.json({ error: REMINDER_NOT_SAVED }, { status: 500 })
  }
}

/**
 * DELETE /api/projects/[projectId]/documents/[documentId]/doc-comments
 *
 * Two actions (discriminated by body.action):
 *
 * action = 'delete-comment' (default when messageId present without reminderId)
 *   Hard-delete a comment authored by the current user, provided no subsequent
 *   message exists on the same document (race-condition safety net only — the
 *   UI already prevents reaching this in normal flow).
 *   Body: { messageId: string }
 *
 * action = 'remove-reminder' (legacy, used by handleReminderSubmit in the UI)
 *   Remove a reminder for a specific recipient on a comment.
 *   Body: { reminderId: string; recipientId: string }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  // What a failure on our side says, by what was asked: deleting a comment, or removing a reminder.
  let failure = "Couldn't do that on our side. Try again."
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, documentId: documentIdParam } = await params
    const ctx = await resolveProjectContext(projectId)
    if (!ctx) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const canView = await canViewProject(ctx.orgId, ctx.clientId, ctx.projectId)
    if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const completed = await blockIfEngagementCompleted(projectId)
    if (completed) return completed

    const body = await request.json().catch(() => ({}))

    // ── Hard-delete a comment ──────────────────────────────────────────────
    if (body.action === 'delete-comment' || (body.messageId && !body.reminderId)) {
      failure = "Couldn't delete the comment on our side. Try again."
      const messageId = typeof body.messageId === 'string' ? body.messageId : null
      if (!messageId) return NextResponse.json({ error: 'messageId is required' }, { status: 400 })

      const docCtx = await getProjectDocumentContext(projectId, documentIdParam)
      if (!docCtx) return NextResponse.json({ error: 'Document not found in this project' }, { status: 404 })

      const message = await prisma.docCommentMessage.findFirst({
        where: { id: messageId, projectDocumentId: docCtx.id, engagementId: projectId },
        select: { id: true, authorUserId: true, createdAt: true },
      })
      if (!message) return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
      if (message.authorUserId !== user.id) return NextResponse.json({ error: 'You can only delete your own comments' }, { status: 403 })

      // Server-side race condition guard: reject if any newer message exists on this document
      const hasFollowUp = await prisma.docCommentMessage.findFirst({
        where: {
          projectDocumentId: docCtx.id,
          engagementId: projectId,
          createdAt: { gt: message.createdAt },
        },
        select: { id: true },
      })
      if (hasFollowUp) return NextResponse.json({ error: 'Cannot delete a comment that has follow-up replies' }, { status: 409 })

      // Block deletion if any user has an active reminder/mention on this comment
      const anyMention = await prisma.userPersonalization.findFirst({
        where: { reminders: { array_contains: [{ entityKey: 'platform.doc_comments', entityValue: messageId }] } as any },
        select: { userId: true },
      })
      if (anyMention) return NextResponse.json({ error: 'Cannot delete a comment that has active mentions or reminders' }, { status: 409 })

      // Cancel any reminders associated with this comment
      try {
        const personalization = await prisma.userPersonalization.findMany({
          where: { reminders: { path: ['$[*].entityValue'], string_contains: messageId } as any },
          select: { userId: true, reminders: true },
        })
        const { safeInngestSend } = await import('@/lib/inngest/client')
        for (const p of personalization) {
          const items = Array.isArray(p.reminders) ? (p.reminders as any[]) : []
          const matching = items.filter((r) => r.entityValue === messageId)
          for (const r of matching) {
            await safeInngestSend('reminder.email.cancelled', { reminderId: r.id }).catch(() => {})
            await safeInngestSend('reminder.recurring.cancelled', { reminderId: r.id }).catch(() => {})
          }
          if (matching.length > 0) {
            await prisma.userPersonalization.update({
              where: { userId: p.userId },
              data: { reminders: items.filter((r) => r.entityValue !== messageId) as any },
            }).catch(() => {})
          }
        }
      } catch {
        // Never block deletion if reminder cleanup fails
      }

      await prisma.docCommentMessage.delete({ where: { id: messageId } })
      return NextResponse.json({ success: true })
    }

    // ── Remove a reminder from a comment ──────────────────────────────────
    failure = "Couldn't remove the reminder on our side. Try again."
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
    console.error('DELETE doc-comments error', e)
    return NextResponse.json({ error: failure }, { status: 500 })
  }
}
