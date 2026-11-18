import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { prisma } from '@/lib/prisma'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canManageProject } from '@/lib/permission-helpers'
import { blockIfEngagementCompleted } from '@/lib/engagement-access'
import { sendEmail } from '@/lib/email'
import { createEventNotifications, buildAbsoluteUrl } from '@/lib/notify-event'
import { engagementPath } from '@/lib/navigation/firm-paths'
import { emitAuditEvent } from '@/lib/audit/emit'
import { AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit/constants'
import { readInsightsSummary } from '@/lib/ai/engagement-summary'
import { engagementRecipients, readStatusUpdates, withSentUpdate } from '@/lib/ai/status-update'
import { renderEngagementUpdateEmail } from '@/lib/email-templates/status-update'
import { resolveDisplayName } from '@/lib/auth/display-name'
import { ASSISTANT } from '@/lib/ai/assistant'
import { formatFullDate } from '@/lib/utils'
import { logger } from '@/lib/logger'
import {
    MAX_UPDATE_EMAILS,
    MAX_UPDATE_NOTE,
    normalizeEmail,
    reportPdfFileName,
    type UpdateRecipientsInfo,
    type UpdateSendOutcome,
} from '@/lib/updates/update-send'

/**
 * /api/projects/[projectId]/send-update (.claude/plans/publish-and-send-update.md)
 *
 * GET: who the update goes to (everyone on the engagement but the caller) and who got the last one.
 * POST: emails the engagement's PUBLISHED update, whole, to the people chosen and any addresses typed
 * in. The text is read here, never taken from the request, so only what a Lead published goes out.
 * People on the engagement also get it in their Inbox and a link into it; an address that isn't on
 * the engagement gets the email in their mailbox but can't open it in Firma, with Reply-To set to
 * the sender. An optional note goes above
 * it, and the Overview as a PDF can go with it (captured in the browser, as Download PDF does; it is
 * why this is a route and not a server action: the PDF is too big for one).
 *
 * The sender always gets a copy (Deepak, 2026-11-18: "a system email … add myself in the cc field by
 * default, non-removable"). Each person gets an email of their own, so no one sees anyone else's
 * address; the sender's copy says who it went to.
 *
 * Leads only, and not on a completed engagement. Sending calls no model, so it costs no credit.
 */

async function requireLead(projectId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false as const, response: NextResponse.json({ error: 'Sign in again to send updates.' }, { status: 401 }) }
    const ctx = await resolveProjectContext(projectId)
    if (!ctx) return { ok: false as const, response: NextResponse.json({ error: 'This engagement no longer exists.' }, { status: 404 }) }
    if (!(await canManageProject(ctx.firmId, ctx.clientId, ctx.projectId))) {
        return { ok: false as const, response: NextResponse.json({ error: 'Only a Lead can send updates on this engagement.' }, { status: 403 }) }
    }
    return { ok: true as const, user, ctx }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ projectId: string }> }): Promise<NextResponse> {
    try {
        const { projectId } = await params
        const auth = await requireLead(projectId)
        if (!auth.ok) return auth.response
        const [people, engagement] = await Promise.all([
            engagementRecipients(projectId),
            prisma.engagement.findFirst({ where: { id: projectId, isDeleted: false }, select: { settings: true } }),
        ])
        const last = readStatusUpdates((engagement?.settings as Record<string, unknown> | null) ?? {})[0]
        const nameOf = new Map(people.map((p) => [p.userId, p.name]))
        const info: UpdateRecipientsInfo = {
            recipients: people.filter((p) => p.userId !== auth.user.id).map(({ userId, name, role, email }) => ({ userId, name, role, email })),
            lastSent: last
                ? { sentAt: last.sentAt, to: [...last.recipientUserIds.map((id) => nameOf.get(id) ?? 'someone no longer on it'), ...(last.recipientEmails ?? [])] }
                : null,
            cc: auth.user.email
                ? { name: resolveDisplayName(auth.user.user_metadata ?? {}, auth.user.email) || auth.user.email, email: auth.user.email }
                : null,
        }
        return NextResponse.json(info)
    } catch (e) {
        logger.error('send-update GET error', e as Error)
        return NextResponse.json({ error: "Couldn't load who to send it to. Try again." }, { status: 500 })
    }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }): Promise<NextResponse> {
    try {
        const { projectId } = await params
        const auth = await requireLead(projectId)
        if (!auth.ok) return auth.response
        const { user, ctx } = auth
        const completed = await blockIfEngagementCompleted(projectId)
        if (completed) return completed

        const body = await request.json().catch(() => null) as {
            userIds?: unknown; emails?: unknown; note?: unknown; pdfBase64?: unknown
        } | null
        if (!body) return NextResponse.json({ error: "The request wasn't readable. Try again." }, { status: 400 })

        const note = typeof body.note === 'string' ? body.note.trim() : ''
        if (note.length > MAX_UPDATE_NOTE) {
            return NextResponse.json({ error: `Keep the note under ${MAX_UPDATE_NOTE} characters.`, code: 'too_long' }, { status: 400 })
        }

        const engagement = await prisma.engagement.findFirst({
            where: { id: projectId, isDeleted: false },
            select: { name: true, slug: true, client: { select: { slug: true, firm: { select: { name: true, slug: true, group: { select: { slug: true } } } } } } },
        })
        if (!engagement) return NextResponse.json({ error: 'This engagement no longer exists.' }, { status: 404 })
        const fresh = await prisma.engagement.findUnique({ where: { id: projectId }, select: { settings: true } })
        const settings = (fresh?.settings as Record<string, unknown> | null) ?? {}
        const summary = readInsightsSummary(settings)
        if (!summary.text?.trim() || !summary.publishedAt) {
            return NextResponse.json({ error: 'Publish the update before sending it.', code: 'no_summary' }, { status: 409 })
        }

        // Who: people on the engagement by id, and addresses typed in. An address that belongs to
        // someone on the engagement is that person; anyone else's id is refused, not dropped.
        const people = await engagementRecipients(projectId)
        const byId = new Map(people.map((p) => [p.userId, p]))
        const byEmail = new Map(people.map((p) => [p.email.toLowerCase(), p]))
        const ids = new Set<string>(Array.isArray(body.userIds) ? body.userIds.filter((id): id is string => typeof id === 'string') : [])
        if (Array.from(ids).some((id) => !byId.has(id))) {
            return NextResponse.json({ error: 'Choose people who are on this engagement, or add them by email address.', code: 'bad_recipients' }, { status: 400 })
        }
        const typed = Array.isArray(body.emails) ? body.emails.filter((e): e is string => typeof e === 'string') : []
        const emails = new Set<string>()
        for (const raw of typed) {
            const email = normalizeEmail(raw)
            if (!email) return NextResponse.json({ error: `"${raw.slice(0, 80)}" isn't an email address.`, code: 'bad_email' }, { status: 400 })
            const member = byEmail.get(email)
            if (member) ids.add(member.userId)
            else emails.add(email)
        }
        // The sender is in Cc, always: never a second time in To.
        ids.delete(user.id)
        if (user.email) emails.delete(user.email.toLowerCase())
        if (emails.size > MAX_UPDATE_EMAILS) {
            return NextResponse.json({ error: `Add up to ${MAX_UPDATE_EMAILS} email addresses at a time.`, code: 'too_many' }, { status: 400 })
        }
        if (ids.size + emails.size === 0) {
            return NextResponse.json({ error: 'Choose at least one person to send it to.', code: 'no_recipients' }, { status: 400 })
        }

        let pdf: Buffer | null = null
        if (typeof body.pdfBase64 === 'string' && body.pdfBase64) {
            pdf = Buffer.from(body.pdfBase64, 'base64')
            if (pdf.byteLength === 0) return NextResponse.json({ error: "The PDF came through empty. Try again, or send it without one.", code: 'bad_pdf' }, { status: 400 })
            if (pdf.byteLength > 15 * 1024 * 1024) return NextResponse.json({ error: 'The PDF is too large to email. Send it without one.', code: 'pdf_too_large' }, { status: 413 })
        }

        // Without a mail server nothing is sent (sendEmail returns quietly): say so, never a tick.
        if (!process.env.SMTP_HOST) {
            logger.warn('send-update: SMTP_HOST not configured, update not sent', 'SendUpdate', { projectId })
            return NextResponse.json({ error: "Email isn't set up, so the update wasn't sent.", code: 'email_not_configured' }, { status: 503 })
        }

        const firm = engagement.client.firm
        const senderName = resolveDisplayName(user.user_metadata ?? {}, user.email ?? '') || user.email?.split('@')[0] || 'Your Lead'
        let publisherName: string | null = null
        if (summary.publishedByUserId) {
            publisherName = summary.publishedByUserId === user.id
                ? senderName
                : byId.get(summary.publishedByUserId)?.name ?? null
            if (!publisherName) {
                try {
                    const { data } = await createAdminClient().auth.admin.getUserById(summary.publishedByUserId)
                    publisherName = data?.user ? resolveDisplayName(data.user.user_metadata ?? {}, data.user.email ?? '') || null : null
                } catch { /* the byline goes without a name */ }
            }
        }
        const when = formatFullDate(summary.publishedAt)
        const credit = summary.source === 'manual'
            ? (publisherName ? `Edited by ${publisherName}` : 'Edited')
            : (publisherName ? `Written by ${ASSISTANT.name} · reviewed and published by ${publisherName}` : `Written by ${ASSISTANT.name}`)
        const byline = when ? `${credit} · ${when}` : credit

        // Kept first, so a failed email can't leave "last emailed" pointing at an older send while
        // someone did receive this one.
        const sentAt = new Date().toISOString()
        const memberIds = Array.from(ids)
        await prisma.engagement.update({
            where: { id: projectId },
            data: {
                settings: withSentUpdate(settings, {
                    sentAt,
                    sentByUserId: user.id,
                    recipientUserIds: memberIds,
                    recipientEmails: Array.from(emails),
                    note: note || null,
                    withPdf: !!pdf,
                    text: summary.text.trim(),
                }) as object,
            },
        })

        const path = engagementPath(firm.group.slug, firm.slug, engagement.client.slug, engagement.slug)
        const firstSection = summary.text.replace(/^##[^\n]*\n/gm, '').replace(/\s+/g, ' ').trim()
        await createEventNotifications(memberIds.map((userId) => ({
            firmId: ctx.firmId,
            clientId: ctx.clientId,
            engagementId: projectId,
            userId,
            type: 'ENGAGEMENT_STATUS_UPDATE',
            title: `Update from ${firm.name}`,
            body: (note || firstSection).slice(0, 280),
            ctaUrl: path,
            dedupeKey: `status-update:${projectId}:${sentAt}:${userId}`,
        })))

        const ctaUrl = await buildAbsoluteUrl(path, { engagementId: projectId })
        const base = { firmName: firm.name, engagementName: engagement.name, senderName, summary: summary.text.trim(), byline, note }
        const forMembers = renderEngagementUpdateEmail({ ...base, ctaUrl })
        const forAddresses = renderEngagementUpdateEmail({ ...base, ctaUrl: null })
        const attachments = pdf
            ? [{ filename: reportPdfFileName(engagement.name), content: pdf, contentType: 'application/pdf' }]
            : undefined
        const replyTo = user.email ? { headers: { 'Reply-To': user.email } } : undefined

        const targets = [
            ...memberIds.map((id) => ({ to: byId.get(id)!.email, label: byId.get(id)!.name, mail: forMembers, options: undefined })),
            ...Array.from(emails).map((email) => ({ to: email, label: email, mail: forAddresses, options: replyTo })),
        ]
        // The sender's copy: the members' email (with the link), saying who it went to.
        const copy = user.email
            ? renderEngagementUpdateEmail({ ...base, ctaUrl, copyOf: targets.map((t) => t.label) })
            : null
        const [sends, copySend] = await Promise.all([
            Promise.allSettled(targets.map((t) => sendEmail(t.to, t.mail.subject, t.mail.html, attachments, t.options))),
            copy && user.email ? sendEmail(user.email, copy.subject, copy.html, attachments).then((v) => !!v, () => false) : Promise.resolve(false),
        ])
        const reached = (i: number) => sends[i].status === 'fulfilled' && !!(sends[i] as PromiseFulfilledResult<unknown>).value
        const outcome: UpdateSendOutcome = {
            sent: targets.filter((_, i) => reached(i)).length,
            total: targets.length,
            failed: targets.filter((_, i) => !reached(i)).map((t) => t.label),
            copied: copySend,
        }

        await emitAuditEvent({
            firmId: ctx.firmId,
            clientId: ctx.clientId,
            engagementId: projectId,
            scope: AUDIT_SCOPE.ENGAGEMENT,
            eventType: AUDIT_EVENT.ENGAGEMENT_CHANGED,
            actorUserId: user.id,
            metadata: { change: 'status_update_sent', recipientCount: targets.length, emailOnlyCount: emails.size, withPdf: !!pdf },
        }).catch(() => { /* the audit trail is bookkeeping; the update has gone */ })

        if (outcome.sent === 0) {
            return NextResponse.json({ ...outcome, error: `Couldn't reach ${outcome.failed.slice(0, 3).join(', ') || 'anyone'}.`, code: 'not_sent' }, { status: 502 })
        }
        return NextResponse.json(outcome)
    } catch (e) {
        logger.error('send-update POST error', e as Error)
        return NextResponse.json({ error: "Couldn't send the update. Something went wrong on our side. Try again." }, { status: 500 })
    }
}
