import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { canAccessSupportTicket } from '@/lib/support-ticket-auth'
import { isFirmaAuthor, isMemberOfFirm } from '@/lib/support/enrich-requests'
import { splitDescription } from '@/lib/support/ticket-view'
import { buildAbsoluteUrl, createEventNotifications, sendEventEmailToUser } from '@/lib/notify-event'
import { renderSupportReplyEmail } from '@/lib/email-templates/support-reply'
import { logger } from '@/lib/logger'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ ticketNumber: string }> }
) {
  const params = await context.params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { content } = await request.json()
    if (!content?.trim()) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 })
    }

    const ticket = await (prisma as any).customerRequest.findUnique({
      where: { ticketNumber: params.ticketNumber },
      select: { id: true, comments: true, userId: true, firmId: true, description: true },
    })
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    if (!(await canAccessSupportTicket(user, ticket))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const newComment = {
      id: crypto.randomUUID(),
      content: content.trim(),
      createdAt: new Date().toISOString(),
      createdBy: user.id,
      authorEmail: user.email ?? '',
      authorName: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
    }

    const existing = Array.isArray(ticket.comments) ? ticket.comments : []
    const updated = [...existing, newComment]

    await (prisma as any).customerRequest.update({
      where: { ticketNumber: params.ticketNumber },
      data: { comments: updated },
    })

    // The Firma team answered: tell whoever raised it, by email and in their Inbox's Updates.
    const fromFirma = isFirmaAuthor(user.email, await isMemberOfFirm(user.id, ticket.firmId))
    if (fromFirma && ticket.userId && ticket.userId !== user.id) {
      await notifyRequester({
        ticketNumber: params.ticketNumber,
        requesterId: ticket.userId,
        firmId: ticket.firmId,
        title: splitDescription(String(ticket.description ?? '')).title,
        reply: newComment.content,
      }).catch((e) => logger.error('Support reply notification failed', e as Error, 'Support', { ticketNumber: params.ticketNumber }))
    }

    return NextResponse.json({ comment: { ...newComment, fromFirma }, comments: updated })
  } catch (error) {
    console.error('Failed to add comment:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add comment' },
      { status: 500 }
    )
  }
}

/** Email and an Inbox update for the person who raised a request, linking to it on their Support page. */
async function notifyRequester(p: { ticketNumber: string; requesterId: string; firmId: string | null; title: string; reply: string }) {
  const firm = p.firmId ? await prisma.firm.findUnique({ where: { id: p.firmId }, select: { slug: true } }) : null
  const relativeUrl = firm ? `/d/support?firmSlug=${encodeURIComponent(firm.slug)}&ticket=${encodeURIComponent(p.ticketNumber)}` : null
  const preview = p.reply.length > 200 ? `${p.reply.slice(0, 199)}…` : p.reply
  await Promise.all([
    sendEventEmailToUser(p.requesterId, () =>
      renderSupportReplyEmail({ ticketNumber: p.ticketNumber, title: p.title, replyPreview: preview, ctaUrl: buildAbsoluteUrl(relativeUrl) })
    ),
    p.firmId
      ? createEventNotifications([{
          firmId: p.firmId,
          userId: p.requesterId,
          type: 'SUPPORT_REPLY',
          title: `Firma replied: ${p.title}`,
          body: preview,
          ctaUrl: relativeUrl,
          metadata: { ticketNumber: p.ticketNumber },
          dedupeKey: `support:${p.ticketNumber}:reply:${Date.now()}`,
        }])
      : Promise.resolve(),
  ])
}
