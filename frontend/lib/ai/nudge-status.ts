import 'server-only'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { clientSideRecipients } from './status-update'
import type { NudgeStatus } from './nudge-draft'

/**
 * What became of the nudges on an engagement's deliverables (.claude/plans/brio-features-round-2.md,
 * §3.7), for Waiting on Reviewers.
 *
 * A nudge is any comment on the deliverable that reminds one of its Reviewers or Limited Access
 * contributors, so one sent before this was written counts too. They responded when they commented
 * on the deliverable after it, or ticked its reminder off in their Inbox (doc_comment_reminder_done).
 */

/** The reminded person on a comment, from the `settings` the comments route writes. */
function remindedUserId(settings: unknown): string | null {
    const reminder = (settings as { reminder?: { recipientId?: unknown } } | null)?.reminder
    return typeof reminder?.recipientId === 'string' ? reminder.recipientId : null
}

/**
 * The last nudge on each of `deliverableIds` and what came of it. Reads this engagement's comments
 * only, so an id from elsewhere finds nothing. Deliverables never nudged are left out.
 */
export async function loadNudgeStatuses(engagementId: string, deliverableIds: string[]): Promise<NudgeStatus[]> {
    if (deliverableIds.length === 0) return []
    const recipients = await clientSideRecipients(engagementId)
    const names = new Map(recipients.map((r) => [r.userId, r.name]))
    if (names.size === 0) return []

    const messages = await prisma.docCommentMessage.findMany({
        where: { engagementId, projectDocumentId: { in: deliverableIds }, isInternal: false },
        select: { id: true, projectDocumentId: true, authorUserId: true, createdAt: true, settings: true },
        orderBy: { createdAt: 'asc' },
    })

    const last = new Map<string, { messageId: string; at: Date; recipientId: string }>()
    for (const m of messages) {
        const recipientId = remindedUserId(m.settings)
        if (recipientId && names.has(recipientId)) last.set(m.projectDocumentId, { messageId: m.id, at: m.createdAt, recipientId })
    }
    if (last.size === 0) return []

    const done = new Map<string, Date>()
    try {
        const rows = await prisma.docCommentReminderDone.findMany({
            where: { engagementId, messageId: { in: Array.from(last.values(), (n) => n.messageId) } },
            select: { messageId: true, userId: true, doneAt: true },
        })
        for (const r of rows) done.set(`${r.messageId}:${r.userId}`, r.doneAt)
    } catch (error) {
        // Before its migration is applied the table isn't there; the nudges still show.
        logger.warn('Nudge status: could not read reminders ticked off', error as Error)
    }

    return Array.from(last.entries(), ([deliverableId, n]) => {
        const reply = messages.find((m) => m.projectDocumentId === deliverableId && m.authorUserId === n.recipientId && m.createdAt > n.at)
        const doneAt = done.get(`${n.messageId}:${n.recipientId}`)
        return {
            deliverableId,
            nudgedAt: n.at.toISOString(),
            recipientId: n.recipientId,
            recipientName: names.get(n.recipientId) ?? 'Reviewer',
            repliedAt: reply ? reply.createdAt.toISOString() : null,
            doneAt: doneAt && doneAt > n.at ? doneAt.toISOString() : null,
        }
    })
}

/**
 * Records that `userId` ticked off their reminder of comment `messageId`. The caller is that
 * person's own session (lib/actions/user-reminders.ts); a reminder of something other than a
 * comment, or a comment since deleted, records nothing.
 */
export async function recordCommentReminderDone(userId: string, messageId: string): Promise<void> {
    const message = await prisma.docCommentMessage.findUnique({ where: { id: messageId }, select: { engagementId: true } })
    if (!message) return
    await prisma.docCommentReminderDone.upsert({
        where: { messageId_userId: { messageId, userId } },
        create: { messageId, userId, engagementId: message.engagementId },
        update: {},
    })
}
