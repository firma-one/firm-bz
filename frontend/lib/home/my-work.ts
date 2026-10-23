import 'server-only'

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { engagementDocCommentPath, engagementPath } from '@/lib/navigation/firm-paths'
import { canViewDeliverable, type EngagementRoleSlug } from '@/lib/deliverable-stage-roles'
import type { ActivityStatus } from '@/lib/sharing-settings'
import type { ReminderWithContext } from '@/lib/actions/user-reminders'
import type { HomeFirm } from '@/lib/home/home-firms'
import { isNeedsYouReminder } from '@/lib/home/needs-you-rules'

/**
 * Data for the New UI Home (.claude/plans/ui-ux-overhaul.md, Phase 3), across the firms it is
 * given (.claude/plans/cross-firm-home-inbox.md): the cross-firm Home passes every firm from
 * getHomeFirms, the old per-firm Home passes one.
 *
 * Access rules — every query starts from the caller's own EngagementMember rows in those firms, the
 * same basis as getFirmHierarchy, so a firm admin sees only engagements they belong to (firm-wide
 * views stay on the admin Overview):
 *  - approvals (deliverables in review, intake) only on engagements the caller leads (eng_admin) —
 *    the only role that can act on them. AI summary drafts are not listed: a draft is written,
 *    reviewed and published or discarded in one sitting, never left waiting;
 *  - client comments still waiting for a reply, also only for the lead;
 *  - changes requested on what the caller owns (its assignee, else whoever added it);
 *  - due deliverables assigned to an external (EC/EV) member are shown only at stages their role
 *    may see (deliverable-stage-roles), so a hidden to-do never leaks its name;
 *  - reminders are the caller's own, filtered to those firms.
 * Nothing here is cached across users.
 *
 * "Needs you" is what is waiting on the caller, read from the current state rather than from
 * notifications, so an item leaves once it's dealt with — approved, replied to, moved on — and never
 * because a notification was read (.claude/plans/app-design-refinements.md, section 13). Deadlines are
 * the Agenda's, so due work isn't listed here twice.
 */

export const DUE_SOON_DAYS = 14
const LIST_LIMIT = 20

export type HomeEngagement = {
    id: string
    name: string
    href: string
    firmId: string
    clientName: string
    status: string
    dueDate: string | null
    updatedAt: string
    role: EngagementRoleSlug | null
}

export type NeedsYouItem = {
    id: string
    kind: 'deliverable_review' | 'intake' | 'changes_requested' | 'client_comment' | 'reminder'
    /** The firm it belongs to, for the firm label and filter; null for a reminder without one. */
    firmId: string | null
    title: string
    context: string
    href: string
    actionLabel: string
    at: string | null
    /** A dated reminder that needs you (due today or overdue): its due label, shown in place of `at`. */
    dueLabel?: string | null
    overdue?: boolean
}

export type DueItem = {
    id: string
    kind: 'deliverable' | 'engagement' | 'reminder'
    firmId: string | null
    title: string
    context: string
    href: string
    dueDate: string
    overdue: boolean
    status: string | null
}

export type MyWork = {
    engagements: HomeEngagement[]
    needsYou: NeedsYouItem[]
    dueSoon: DueItem[]
}

const INTERNAL_ROLES = new Set(['eng_admin', 'eng_member'])

function startOfToday(): Date {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
}

export async function getMyWork(params: {
    userId: string
    /** The firms to cover; callers pass only firms the user may open (getHomeFirms). */
    firms: HomeFirm[]
    /** The caller's reminders (getUserReminders); filtered to these firms here. */
    reminders: ReminderWithContext[]
}): Promise<MyWork> {
    const { userId, firms } = params
    const empty: MyWork = { engagements: [], needsYou: [], dueSoon: [] }
    if (firms.length === 0) return empty
    const firmById = new Map(firms.map((f) => [f.id, f]))
    const firmIds = new Set(firmById.keys())

    try {
        const rows = await prisma.engagement.findMany({
            where: { isDeleted: false, client: { firmId: { in: Array.from(firmIds) } }, members: { some: { userId } } },
            select: {
                id: true,
                name: true,
                slug: true,
                status: true,
                dueDate: true,
                updatedAt: true,
                client: { select: { name: true, slug: true, firmId: true } },
                members: { where: { userId }, select: { role: true } },
            },
            orderBy: { updatedAt: 'desc' },
        })
        if (rows.length === 0) return { ...empty, ...remindersOnly(params.reminders, firmIds) }

        // Each engagement's links use its own firm's path.
        const pathOf = (e: (typeof rows)[number], opts?: Parameters<typeof engagementPath>[4]) => {
            const firm = firmById.get(e.client.firmId)!
            return engagementPath(firm.groupSlug, firm.slug, e.client.slug, e.slug, opts)
        }

        const engagements: HomeEngagement[] = rows.map((e) => ({
            id: e.id,
            name: e.name,
            href: pathOf(e),
            firmId: e.client.firmId,
            clientName: e.client.name,
            status: e.status,
            dueDate: e.dueDate ? e.dueDate.toISOString() : null,
            updatedAt: e.updatedAt.toISOString(),
            role: (e.members[0]?.role ?? null) as EngagementRoleSlug | null,
        }))
        const byId = new Map(engagements.map((e) => [e.id, e]))
        const contextOf = (id: string) => {
            const e = byId.get(id)
            return e ? `${e.clientName} · ${e.name}` : ''
        }
        const firmOf = (id: string) => byId.get(id)?.firmId ?? null
        const sharesBoard = (id: string) => pathOf(rows.find((r) => r.id === id)!, { tab: 'shares', subpath: 'board' })

        const allIds = engagements.map((e) => e.id)
        const leadIds = engagements.filter((e) => e.role === 'eng_admin').map((e) => e.id)
        const dueCutoff = new Date(Date.now() + DUE_SOON_DAYS * 86_400_000)
        const today = startOfToday()

        const [inReview, intake, assigned, changesRequested, clientComments] = await Promise.all([
            // Deliverables (explicitly shared folders — the shares API's definition) awaiting the lead's approval.
            leadIds.length
                ? prisma.$queryRaw<{ id: string; engagementId: string; fileName: string; updatedAt: Date }[]>`
                      SELECT ed.id, ed."engagementId", ed."fileName", ed."updatedAt"
                      FROM platform.engagement_documents ed
                      WHERE ed."engagementId" = ANY(${leadIds}::uuid[])
                        AND ed."isFolder" = true
                        AND ed.settings->'activity'->>'status' = 'in_review'
                        AND (
                          (ed.settings->'share'->>'createdAt') IS NOT NULL
                          OR EXISTS (
                            SELECT 1 FROM platform.engagement_document_sharing_users su
                            WHERE su."projectDocumentId" = ed.id AND su."sharingPermissionStatus" IN ('GRANTED', 'PENDING')
                          )
                        )
                      ORDER BY ed."updatedAt" DESC
                      LIMIT ${LIST_LIMIT}`
                : [],
            // Client uploads waiting for the lead to approve (a PENDING sharing row on the intake folder).
            leadIds.length
                ? prisma.$queryRaw<{ id: string; engagementId: string; fileName: string; createdAt: Date }[]>`
                      SELECT DISTINCT ed.id, ed."engagementId", ed."fileName", ed."createdAt"
                      FROM platform.engagement_documents ed
                      JOIN platform.engagement_document_sharing_users su
                        ON su."projectDocumentId" = ed.id AND su."sharingPermissionStatus" = 'PENDING'
                      WHERE ed."engagementId" = ANY(${leadIds}::uuid[])
                        AND ed."isFolder" = true
                      ORDER BY ed."createdAt" DESC
                      LIMIT ${LIST_LIMIT}`
                : [],
            // Deliverables assigned to the caller that are due soon or overdue and not yet approved.
            prisma.$queryRaw<{ id: string; engagementId: string; fileName: string; dueDate: Date; status: string | null }[]>`
                SELECT ed.id, ed."engagementId", ed."fileName", ed."dueDate", ed.settings->'activity'->>'status' AS status
                FROM platform.engagement_documents ed
                WHERE ed."engagementId" = ANY(${allIds}::uuid[])
                  AND ed.settings->>'assigneeUserId' = ${userId}
                  AND ed."dueDate" IS NOT NULL
                  AND ed."dueDate" <= ${dueCutoff}
                  AND COALESCE(ed.settings->'activity'->>'status', 'to_do') NOT IN ('approved', 'done')
                ORDER BY ed."dueDate" ASC
                LIMIT ${LIST_LIMIT}`,
            // Sent back for changes, and still in progress: what the caller owns (its assignee, else
            // whoever added it) whose latest stage change was In review → In progress by someone else.
            prisma.$queryRaw<{ id: string; engagementId: string; fileName: string; eventAt: Date }[]>`
                SELECT ed.id, ed."engagementId", ed."fileName", last."eventAt"
                FROM platform.engagement_documents ed
                JOIN LATERAL (
                    SELECT e."eventAt", e."actorUserId", e.metadata
                    FROM platform.platform_audit_events e
                    WHERE e."projectDocumentId" = ed.id AND e."eventType" = 'DOCUMENT_STATUS_CHANGED'
                    ORDER BY e."eventAt" DESC
                    LIMIT 1
                ) last ON true
                WHERE ed."engagementId" = ANY(${allIds}::uuid[])
                  AND COALESCE(ed.settings->>'assigneeUserId', ed."createdBy"::text) = ${userId}
                  AND ed.settings->'activity'->>'status' = 'in_progress'
                  AND last.metadata->>'oldStatus' = 'in_review'
                  AND last.metadata->>'newStatus' = 'in_progress'
                  AND last."actorUserId" IS DISTINCT FROM ${userId}::uuid
                ORDER BY last."eventAt" DESC
                LIMIT ${LIST_LIMIT}`,
            // Client comments no one on the team has answered: documents whose latest comment is an
            // external member's (EC/EV), on engagements the caller leads. A team reply clears it.
            leadIds.length
                ? prisma.$queryRaw<{ id: string; engagementId: string; projectDocumentId: string; fileName: string; createdAt: Date }[]>`
                      SELECT latest.id, latest."engagementId", latest."projectDocumentId", latest."fileName", latest."createdAt"
                      FROM (
                          SELECT DISTINCT ON (m."projectDocumentId")
                              m.id, m."engagementId", m."projectDocumentId", ed."fileName", m."createdAt", em.role
                          FROM platform.doc_comment_messages m
                          JOIN platform.engagement_documents ed ON ed.id = m."projectDocumentId"
                          LEFT JOIN platform.engagement_members em
                            ON em."engagementId" = m."engagementId" AND em."userId" = m."authorUserId"
                          WHERE m."engagementId" = ANY(${leadIds}::uuid[])
                          ORDER BY m."projectDocumentId", m."createdAt" DESC
                      ) latest
                      WHERE latest.role IN ('eng_ext_collaborator', 'eng_viewer')
                      ORDER BY latest."createdAt" DESC
                      LIMIT ${LIST_LIMIT}`
                : [],
        ])

        const needsYou: NeedsYouItem[] = [
            ...inReview.map((d) => ({
                id: `review:${d.id}`,
                kind: 'deliverable_review' as const,
                firmId: firmOf(d.engagementId),
                title: d.fileName,
                context: contextOf(d.engagementId),
                href: sharesBoard(d.engagementId),
                actionLabel: 'Review',
                at: d.updatedAt.toISOString(),
            })),
            ...intake.map((d) => ({
                id: `intake:${d.id}`,
                kind: 'intake' as const,
                firmId: firmOf(d.engagementId),
                title: d.fileName,
                context: contextOf(d.engagementId),
                href: sharesBoard(d.engagementId),
                actionLabel: 'Approve upload',
                at: d.createdAt.toISOString(),
            })),
            ...clientComments.map((c) => {
                const e = rows.find((r) => r.id === c.engagementId)!
                const firm = firmById.get(e.client.firmId)!
                return {
                    id: `comment:${c.projectDocumentId}`,
                    kind: 'client_comment' as const,
                    firmId: firmOf(c.engagementId),
                    title: c.fileName,
                    context: contextOf(c.engagementId),
                    href: engagementDocCommentPath(firm.groupSlug, firm.slug, e.client.slug, e.slug, c.projectDocumentId, c.id),
                    actionLabel: 'Reply',
                    at: c.createdAt.toISOString(),
                }
            }),
            ...changesRequested
                // As with due work: an external member sees only the stages their role may see.
                .filter((d) => {
                    const role = byId.get(d.engagementId)?.role ?? null
                    return !!role && (INTERNAL_ROLES.has(role) || canViewDeliverable(role, 'in_progress'))
                })
                .map((d) => ({
                    id: `changes:${d.id}`,
                    kind: 'changes_requested' as const,
                    firmId: firmOf(d.engagementId),
                    title: d.fileName,
                    context: contextOf(d.engagementId),
                    href: sharesBoard(d.engagementId),
                    actionLabel: 'See changes',
                    at: d.eventAt.toISOString(),
                })),
        ]

        const dueSoon: DueItem[] = []
        for (const d of assigned) {
            const role = byId.get(d.engagementId)?.role ?? null
            const status = (d.status === 'done' ? 'approved' : d.status ?? 'to_do') as ActivityStatus
            if (!role) continue
            if (!INTERNAL_ROLES.has(role) && !canViewDeliverable(role, status)) continue
            dueSoon.push({
                id: `deliverable:${d.id}`,
                kind: 'deliverable',
                firmId: firmOf(d.engagementId),
                title: d.fileName,
                context: contextOf(d.engagementId),
                href: sharesBoard(d.engagementId),
                dueDate: d.dueDate.toISOString(),
                overdue: d.dueDate < today,
                status,
            })
        }
        for (const e of rows) {
            if (!e.dueDate || e.status === 'COMPLETED' || e.members[0]?.role !== 'eng_admin' || e.dueDate > dueCutoff) continue
            dueSoon.push({
                id: `engagement:${e.id}`,
                kind: 'engagement',
                firmId: e.client.firmId,
                title: e.name,
                context: e.client.name,
                href: byId.get(e.id)!.href,
                dueDate: e.dueDate.toISOString(),
                overdue: e.dueDate < today,
                status: e.status,
            })
        }

        const fromReminders = remindersOnly(params.reminders, firmIds)
        return {
            engagements,
            needsYou: [...needsYou, ...fromReminders.needsYou],
            dueSoon: [...dueSoon, ...fromReminders.dueSoon].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
        }
    } catch (e) {
        logger.error('getMyWork failed', e as Error, 'Home', { userId, firmIds: Array.from(firmIds) })
        return empty
    }
}

/**
 * The caller's own reminders in these firms: review requests, undated ones (Reconnect Drive, say) and
 * dated ones due today or overdue — waiting on them now → Needs you; dated ones due later → Due soon,
 * which the Agenda shows (isNeedsYouReminder).
 */
function remindersOnly(reminders: ReminderWithContext[], firmIds: Set<string>): Pick<MyWork, 'needsYou' | 'dueSoon'> {
    const needsYou: NeedsYouItem[] = []
    const dueSoon: DueItem[] = []
    for (const r of reminders) {
        if (r.hiddenAt || !r.firmId || !firmIds.has(r.firmId)) continue
        if (isNeedsYouReminder(r)) {
            needsYou.push({
                id: `reminder:${r.id}`,
                kind: 'reminder',
                firmId: r.firmId,
                title: r.entityName,
                context: r.action,
                href: r.ctaUrl ?? '#',
                actionLabel: 'Open',
                at: r.dateValue,
                dueLabel: r.dateValue ? r.label : null,
                overdue: r.delta !== null && r.delta < 0,
            })
        } else if (r.dateValue && r.delta !== null && r.delta <= DUE_SOON_DAYS) {
            dueSoon.push({
                id: `reminder:${r.id}`,
                kind: 'reminder',
                firmId: r.firmId,
                title: r.entityName,
                context: r.action,
                href: r.ctaUrl ?? '#',
                dueDate: new Date(r.dateValue).toISOString(),
                overdue: r.delta < 0,
                status: null,
            })
        }
    }
    return { needsYou, dueSoon }
}
