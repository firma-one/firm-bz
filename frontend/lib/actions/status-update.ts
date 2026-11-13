'use server'

import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canManageProject } from '@/lib/permission-helpers'
import { getEngagementStatus } from '@/lib/engagement-access'
import { asResult, userFacing, type ActionResult } from '@/lib/actions/action-result'
import { createEventNotifications, sendEventEmailToUser, buildAbsoluteUrl } from '@/lib/notify-event'
import { renderStatusUpdateEmail } from '@/lib/email-templates/status-update'
import { engagementPath } from '@/lib/navigation/firm-paths'
import { emitAuditEvent } from '@/lib/audit/emit'
import { AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit/constants'
import {
    clientSideRecipients,
    loadStatusUpdateInputs,
    withSentUpdate,
    readStatusUpdates,
    type ChangeLine,
} from '@/lib/ai/status-update'

/**
 * The client status update (.claude/plans/brio-features-round-2.md, §3.1): what the composer shows,
 * and sending what the Lead wrote. Brio's draft comes from POST /api/projects/[id]/ai-status-update;
 * nothing here calls a model.
 *
 * Identity comes from the session, never an argument; every action checks the caller's rights on
 * the engagement's own firm and client (resolveProjectContext), never on ids the caller passes.
 */

/** Square-bracketed spots a draft leaves for the Lead, like "[Add next steps]". */
const PLACEHOLDER = /\[[^\]\n]{1,80}\]/

const MAX_TEXT = 5000

async function requireLead(engagementId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw userFacing('Sign in again to send updates.', 'unauthorized')
    const ctx = await resolveProjectContext(engagementId)
    if (!ctx) throw userFacing('This engagement no longer exists.', 'not_found')
    if (!(await canManageProject(ctx.firmId, ctx.clientId, ctx.projectId))) {
        throw userFacing('Only a Lead can send updates on this engagement.', 'forbidden')
    }
    return { user, ctx }
}

export interface StatusUpdateComposer {
    changes: ChangeLine[]
    since: string
    sinceIsLastUpdate: boolean
    hasSummary: boolean
    recipients: Array<{ userId: string; name: string; role: string }>
}

/** What the composer shows: recipients and "Since your last update". */
export async function getStatusUpdateComposer(engagementId: string): Promise<ActionResult<StatusUpdateComposer>> {
    return asResult('getStatusUpdateComposer', async () => {
        const { ctx } = await requireLead(engagementId)
        const inputs = await loadStatusUpdateInputs(engagementId, ctx.firmId)
        if (!inputs) throw userFacing('This engagement no longer exists.', 'not_found')
        return {
            changes: inputs.changes,
            since: inputs.since,
            sinceIsLastUpdate: inputs.sinceIsLastUpdate,
            hasSummary: inputs.summary !== null,
            recipients: inputs.recipients,
        }
    })
}

/**
 * Sends the Lead's update: an email and an Inbox notification to each chosen recipient, kept on the
 * engagement as the new "last update". Recipients must be the engagement's Reviewers or Limited
 * Access contributors; anyone else in the list is refused rather than silently dropped.
 */
export async function sendStatusUpdate(
    engagementId: string,
    text: string,
    recipientUserIds: string[],
): Promise<ActionResult<{ sentAt: string; recipientCount: number }>> {
    return asResult('sendStatusUpdate', async () => {
        const { user, ctx } = await requireLead(engagementId)
        if ((await getEngagementStatus(engagementId)) === 'COMPLETED') {
            throw userFacing('This engagement is completed, so updates can no longer be sent.', 'completed')
        }

        const body = (typeof text === 'string' ? text : '').trim()
        if (!body) throw userFacing('Write the update before sending it.', 'empty')
        if (body.length > MAX_TEXT) throw userFacing(`Keep the update under ${MAX_TEXT} characters.`, 'too_long')
        if (PLACEHOLDER.test(body)) {
            throw userFacing('Fill in or remove the [bracketed] spots before sending.', 'placeholders')
        }

        const ids = Array.from(new Set(Array.isArray(recipientUserIds) ? recipientUserIds.filter((id) => typeof id === 'string') : []))
        if (ids.length === 0) throw userFacing('Choose at least one person to send the update to.', 'no_recipients')

        const members = await prisma.engagementMember.findMany({
            where: { engagementId, userId: { in: ids }, role: { in: ['eng_viewer', 'eng_ext_collaborator'] } },
            select: { userId: true },
        })
        if (members.length !== ids.length) {
            throw userFacing('Updates go to Reviewers and Limited Access contributors on this engagement only.', 'bad_recipients')
        }

        const engagement = await prisma.engagement.findFirst({
            where: { id: engagementId, isDeleted: false },
            select: {
                name: true,
                slug: true,
                client: { select: { id: true, slug: true, firm: { select: { name: true, slug: true, group: { select: { slug: true } } } } } },
            },
        })
        if (!engagement) throw userFacing('This engagement no longer exists.', 'not_found')

        const firm = engagement.client.firm
        const path = engagementPath(firm.group.slug, firm.slug, engagement.client.slug, engagement.slug)
        const senderName = (user.user_metadata?.full_name as string | undefined) ?? user.email?.split('@')[0] ?? 'Your Lead'
        const sentAt = new Date().toISOString()

        // Saved first, so a failed email can't leave "last update" pointing at an older one while
        // the client did receive this one. Settings read fresh, right before the write.
        const fresh = await prisma.engagement.findUnique({ where: { id: engagementId }, select: { settings: true } })
        const settings = (fresh?.settings as Record<string, unknown> | null) ?? {}
        await prisma.engagement.update({
            where: { id: engagementId },
            data: {
                settings: withSentUpdate(settings, {
                    sentAt,
                    sentByUserId: user.id,
                    recipientUserIds: ids,
                    text: body,
                }) as object,
            },
        })

        await createEventNotifications(ids.map((userId) => ({
            firmId: ctx.firmId,
            clientId: ctx.clientId,
            engagementId,
            userId,
            type: 'ENGAGEMENT_STATUS_UPDATE',
            title: `Update from ${firm.name}`,
            body: body.replace(/\s+/g, ' ').slice(0, 280),
            ctaUrl: path,
            dedupeKey: `status-update:${engagementId}:${sentAt}:${userId}`,
        })))
        const ctaUrl = await buildAbsoluteUrl(path, { engagementId })
        await Promise.all(ids.map((userId) => sendEventEmailToUser(userId, () => renderStatusUpdateEmail({
            firmName: firm.name,
            engagementName: engagement.name,
            senderName,
            text: body,
            ctaUrl,
        }))))

        await emitAuditEvent({
            firmId: ctx.firmId,
            clientId: ctx.clientId,
            engagementId,
            scope: AUDIT_SCOPE.ENGAGEMENT,
            eventType: AUDIT_EVENT.ENGAGEMENT_CHANGED,
            actorUserId: user.id,
            metadata: { change: 'status_update_sent', recipientCount: ids.length },
        }).catch(() => { /* the audit trail is bookkeeping; the update has gone */ })

        return { sentAt, recipientCount: ids.length }
    })
}

/** Who a nudge can go to: the engagement's Reviewers, then Limited Access contributors. Leads only. */
export async function getNudgeRecipients(
    engagementId: string,
): Promise<ActionResult<Array<{ userId: string; name: string; role: string }>>> {
    return asResult('getNudgeRecipients', async () => {
        await requireLead(engagementId)
        return clientSideRecipients(engagementId)
    })
}

/** When the last update went out, for the summary card's "Last update to the client" line. */
export async function getLastStatusUpdate(engagementId: string): Promise<ActionResult<{ sentAt: string } | null>> {
    return asResult('getLastStatusUpdate', async () => {
        await requireLead(engagementId)
        const e = await prisma.engagement.findUnique({ where: { id: engagementId }, select: { settings: true } })
        const last = readStatusUpdates((e?.settings as Record<string, unknown> | null) ?? {})[0]
        return last ? { sentAt: last.sentAt } : null
    })
}
