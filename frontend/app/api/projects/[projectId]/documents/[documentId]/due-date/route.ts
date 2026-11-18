import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canViewProjectSettings, canViewProject } from '@/lib/permission-helpers'
import { createAdminClient } from '@/utils/supabase/admin'
import { sendEmail } from '@/lib/email'
import { renderReminderEmail } from '@/lib/email-templates/reminder'
import { safeInngestSend } from '@/lib/inngest/client'
import { parseSettingsFromDb } from '@/lib/sharing-settings'
import { isExternalEngagementRole, blockIfEngagementCompleted } from '@/lib/engagement-access'
import { privateExternalIds } from '@/lib/engagement-sharing-ids'
import { formatFullDate } from '@/lib/utils'
import { documentLink } from '@/lib/notification-links'
import { planDueDate } from '@/lib/files/due-date-check'
import { DUE_FIXES, type DueFix } from '@/lib/files/due-date-rule'
import { updateEngagement } from '@/lib/actions/project'

const DOC_SELECT = { id: true, externalId: true, parentId: true, docId: true, fileName: true, dueDate: true, isFolder: true, settings: true, firmId: true, clientId: true, engagementId: true } as const

/**
 * PATCH /api/projects/[projectId]/documents/[documentId]/due-date
 * Set or clear a document's or deliverable's due date. Body: { dueDate: string | null, fixes?: DueFix[] }.
 *
 * Due dates nest (.claude/plans/due-date-rule.md): a document no later than its deliverable, a
 * deliverable no later than its engagement. A change that would break that answers 409
 * `needsResolution` with the conflict; the client resends with the fix chosen in `fixes`, whose
 * other date changes are made here too, with the same notifications and reminders.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Your session has ended. Sign in again.' }, { status: 401 })

    const { projectId, documentId } = await params
    const ctx = await resolveProjectContext(projectId)
    if (!ctx) return NextResponse.json({ error: 'This engagement was not found, or you no longer have access.' }, { status: 404 })

    // Independent checks, asked together; answered in the same order as before.
    const [canView, canManage, completed] = await Promise.all([
      canViewProject(ctx.orgId, ctx.clientId, ctx.projectId),
      canViewProjectSettings(ctx.orgId, ctx.clientId, ctx.projectId),
      blockIfEngagementCompleted(projectId),
    ])
    if (!canView) return NextResponse.json({ error: 'This engagement was not found, or you no longer have access.' }, { status: 404 })
    if (!canManage) return NextResponse.json({ error: 'Only a Lead can change due dates.' }, { status: 403 })
    if (completed) return completed

    const body = await request.json().catch(() => ({}))
    const dueDateRaw = body?.dueDate as string | null | undefined
    const dueDate = dueDateRaw ? new Date(dueDateRaw) : null
    const fixes: DueFix[] = Array.isArray(body?.fixes) ? body.fixes.filter((f: unknown) => DUE_FIXES.includes(f as DueFix)) : []

    const doc = await prisma.engagementDocument.findFirst({
      where: { id: documentId, engagementId: projectId },
      select: DOC_SELECT,
    })
    if (!doc) return NextResponse.json({ error: 'This file is no longer in this engagement. Refresh to see it as it is.' }, { status: 404 })

    const plan = await planDueDate(projectId, doc, dueDate, fixes)
    if (plan.conflict) return NextResponse.json({ needsResolution: plan.conflict }, { status: 409 })

    // Every row whose date changes: this one, then the others the chosen fix moves (its deliverable, or its documents).
    const rows: { row: DueRow; next: Date | null }[] = [{ row: doc, next: dueDate }]
    for (const change of plan.documents) {
      const row = await prisma.engagementDocument.findFirst({ where: { id: change.id, engagementId: projectId }, select: DOC_SELECT })
      if (row) rows.push({ row, next: change.due })
    }

    // The engagement first: a deliverable moved past it would otherwise be refused by its own rule.
    let engagementBefore: { dueDate: Date | null } | null = null
    if (plan.engagementDue) {
      const eng = await prisma.engagement.findUnique({
        where: { id: projectId },
        select: { dueDate: true, client: { select: { slug: true, firm: { select: { slug: true } } } } },
      })
      engagementBefore = { dueDate: eng?.dueDate ?? null }
      const moved = await updateEngagement(projectId, { dueDate: plan.engagementDue.toISOString() }, eng?.client?.firm?.slug ?? '', eng?.client?.slug ?? '')
      if (!moved.ok) {
        const status = moved.code === 'forbidden' ? 403 : moved.code === 'not_found' ? 404 : moved.code === 'internal' ? 500 : 409
        return NextResponse.json({ error: moved.error, code: moved.code }, { status })
      }
    }

    // The dates themselves together (P1-62): all of them move, or none do.
    try {
      await prisma.$transaction(rows.map(({ row, next }) => prisma.engagementDocument.update({ where: { id: row.id }, data: { dueDate: next } })))
    } catch (e) {
      console.error('due-date PATCH: dates not saved', e)
      if (!engagementBefore || !plan.engagementDue) {
        return NextResponse.json({ error: "Couldn't set the due date. Something went wrong on our side, and nothing changed. Try again." }, { status: 500 })
      }
      // The engagement already moved: put it back, or say that it moved.
      const putBack = await prisma.engagement
        .update({ where: { id: projectId }, data: { dueDate: engagementBefore.dueDate } })
        .then(() => true, () => false)
      return NextResponse.json({
        error: putBack
          ? "Couldn't set the due date. Something went wrong on our side, and nothing changed. Try again."
          : `Couldn't set the due date. The engagement's due date moved to ${formatFullDate(plan.engagementDue)}, but ${doc.fileName} didn't. Try again.`,
        ...(putBack ? {} : { engagementDueDate: plan.engagementDue.toISOString() }),
      }, { status: 500 })
    }

    // What follows a saved date: notices and reminders. The dates stand either way; what didn't follow is said.
    // What every row's follow-up needs, read once and together.
    const [members, privateIds, eng] = await Promise.all([
      prisma.engagementMember.findMany({
        where: { engagementId: projectId },
        select: { userId: true, role: true },
      }),
      privateExternalIds(projectId),
      prisma.engagement.findUnique({
        where: { id: projectId },
        select: { slug: true, client: { select: { slug: true, firm: { select: { slug: true, group: { select: { slug: true } } } } } } },
      }),
    ])
    const memberUserIds = members.map((m) => m.userId)
    // A private file's date is the firm's own: its notice names the file, so no client gets one.
    const firmUserIds = members.filter((m) => !isExternalEngagementRole(m.role)).map((m) => m.userId)
    const linkTo = {
      groupSlug: eng?.client?.firm?.group?.slug ?? '',
      firmSlug: eng?.client?.firm?.slug ?? '',
      clientSlug: eng?.client?.slug ?? '',
      engagementSlug: eng?.slug ?? '',
    }
    // Emails go after the answer: they can take seconds each, and a failed one was never reported.
    const emails: Array<() => Promise<void>> = []
    const followed = await Promise.all(rows.map(({ row, next }) =>
      followDueDate(row, next, {
        projectId,
        clientId: ctx.clientId,
        actorUserId: user.id,
        memberUserIds: privateIds.has(row.externalId) ? firmUserIds : memberUserIds,
        linkTo,
        queueEmail: (send) => emails.push(send),
      }).catch((e) => { console.error('due-date PATCH: follow-up failed', row.id, e); return false })
    ))
    const notFollowed = rows.filter((_, i) => !followed[i]).map(({ row }) => row.fileName)
    if (emails.length > 0) {
      after(async () => {
        await Promise.all(emails.map((send) => send().catch((e) => console.error('due-date PATCH: email failed', e))))
      })
    }

    return NextResponse.json({
      success: true,
      dueDate: dueDate ? dueDate.toISOString() : null,
      ...(plan.documents.length > 0 ? { alsoChanged: plan.documents.map((d) => ({ id: d.id, dueDate: d.due.toISOString() })) } : {}),
      ...(plan.engagementDue ? { engagementDueDate: plan.engagementDue.toISOString() } : {}),
      ...(notFollowed.length > 0
        ? { warning: `Due date saved, but its reminders and notices for ${notFollowed.join(', ')} couldn't all be updated. Set the date again to retry.` }
        : {}),
    })
  } catch (e) {
    console.error('due-date PATCH error', e)
    return NextResponse.json({ error: "Couldn't set the due date. Something went wrong on our side. Try again." }, { status: 500 })
  }
}

type DueRow = {
  id: string
  externalId: string
  fileName: string
  dueDate: Date | null
  isFolder: boolean
  settings: unknown
  firmId: string
  clientId: string | null
}

/** An Inngest send that answers in time: a slow one counts as not sent, so the reply isn't held up. */
const REMINDER_SEND_TIMEOUT_MS = 5_000
function sendInTime(name: string, data: Record<string, unknown>): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    safeInngestSend(name, data),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => {
        console.error(`due-date PATCH: Inngest '${name}' took over ${REMINDER_SEND_TIMEOUT_MS}ms`)
        resolve(false)
      }, REMINDER_SEND_TIMEOUT_MS)
    }),
  ]).finally(() => clearTimeout(timer))
}

/**
 * What follows a row's saved due date: stale notices retracted, new ones sent, reminders rescheduled,
 * the reminders and the notices side by side. Answers false when a reminder couldn't be cancelled or
 * scheduled; throws when a notice write fails. A soon-due document's emails are queued, to go after
 * the answer.
 */
async function followDueDate(
  doc: DueRow,
  dueDate: Date | null,
  ctx: {
    projectId: string
    clientId: string
    actorUserId: string
    memberUserIds: string[]
    linkTo: { groupSlug: string; firmSlug: string; clientSlug: string; engagementSlug: string }
    queueEmail: (send: () => Promise<void>) => void
  },
): Promise<boolean> {
  const { projectId, actorUserId, memberUserIds, linkTo } = ctx

  const isDeliverableFolder = doc.isFolder && (() => {
    try { return !!(parseSettingsFromDb(doc.settings as any).share?.createdAt) } catch { return false }
  })()

  // Where the notification and the deliverable's reminders link to: its card on the Board, or
  // the document in Files.
  const docUrl = linkTo.groupSlug && linkTo.firmSlug && linkTo.clientSlug && linkTo.engagementSlug
    ? documentLink(linkTo, { id: doc.id, deliverable: isDeliverableFolder })
    : null

  // Reminders: any scheduled one cancelled, then a deliverable's 24h + 1h ones scheduled again.
  const reminders = (async () => {
    let ok = await sendInTime('deliverable.due_date.cancelled', { documentId: doc.id })
    if (dueDate && isDeliverableFolder) {
      ok = (await sendInTime('deliverable.due_date.set', {
        documentId: doc.id,
        documentName: doc.fileName,
        dueDate: dueDate.toISOString(),
        memberUserIds,
        firmId: doc.firmId,
        clientId: doc.clientId ?? ctx.clientId,
        engagementId: projectId,
        boardUrl: docUrl,
      })) && ok
    }
    return ok
  })()

  // Notices: a changed or cleared date retracts the delivered "due on X" / "due tomorrow" items,
  // then every member but whoever set it is told of the new one. The title says which it is.
  const notices = (async () => {
    const prevDue = doc.dueDate ? doc.dueDate.toISOString() : null
    const nextDue = dueDate ? dueDate.toISOString() : null
    if (prevDue !== nextDue) {
      await (prisma as any).notification.updateMany({
        where: {
          documentId: doc.id,
          type: { in: ['DOCUMENT_DUE_DATE_SET', 'DELIVERABLE_DUE_REMINDER'] },
          dismissedAt: null,
        },
        data: { dismissedAt: new Date() },
      })
    }
    if (!dueDate) return
    const kind = isDeliverableFolder ? 'Deliverable' : 'Document'
    const rows = memberUserIds.filter((userId) => userId !== actorUserId).map((userId) => ({
      firmId: doc.firmId,
      clientId: doc.clientId ?? ctx.clientId,
      engagementId: projectId,
      documentId: doc.id,
      userId,
      type: 'DOCUMENT_DUE_DATE_SET',
      title: `${kind} due date updated`,
      body: `${doc.fileName} is due on ${formatFullDate(dueDate)}`,
      ctaUrl: docUrl,
      metadata: { dueDate: dueDate.toISOString(), kind: kind.toLowerCase() },
      channels: { inApp: true, email: false },
      dedupeKey: `doc:${doc.id}:due:${dueDate.toISOString().slice(0, 10)}`,
    }))
    if (rows.length) {
      await (prisma as any).notification.createMany({ data: rows, skipDuplicates: true })
    }
  })()

  // Both run to the end; a notice write that failed is thrown once the reminders have been asked.
  const [remindersFollowed, noticesDone] = await Promise.allSettled([reminders, notices])
  if (noticesDone.status === 'rejected') throw noticesDone.reason
  const followed = remindersFollowed.status === 'fulfilled' && remindersFollowed.value

  // A document (not a deliverable) due within a day: every member is emailed, after the answer.
  if (dueDate && !isDeliverableFolder && (dueDate.getTime() - Date.now()) / (1000 * 60 * 60) <= 24) {
    ctx.queueEmail(async () => {
      const admin = createAdminClient()
      await Promise.all(memberUserIds.map(async (userId) => {
        try {
          const { data } = await admin.auth.admin.getUserById(userId)
          const email = data?.user?.email
          if (!email) return
          const { subject, html } = renderReminderEmail({
            entityName: `${doc.fileName} is due on ${formatFullDate(dueDate)}.`,
            action: 'Document due soon',
            kind: 'created',
          })
          await sendEmail(email, subject, html)
        } catch { /* ignore */ }
      }))
    })
  }
  return followed
}
