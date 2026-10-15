import 'server-only'

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { engagementPath } from '@/lib/navigation/firm-paths'
import { canViewDeliverable, type EngagementRoleSlug } from '@/lib/deliverable-stage-roles'
import type { ActivityStatus } from '@/lib/sharing-settings'
import type { ReminderWithContext } from '@/lib/actions/user-reminders'

/**
 * Data for the New UI Firm Home (.claude/plans/ui-ux-overhaul.md, Phase 3).
 *
 * Access rules — every query starts from the caller's own EngagementMember rows in this firm, the
 * same basis as getFirmHierarchy, so a firm admin sees only engagements they belong to (firm-wide
 * views stay on the admin Overview):
 *  - approvals (deliverables in review, intake, AI summary drafts) only on engagements the caller
 *    leads (eng_admin) — the only role that can act on them;
 *  - due deliverables assigned to an external (EC/EV) member are shown only at stages their role
 *    may see (deliverable-stage-roles), so a hidden to-do never leaks its name;
 *  - reminders are the caller's own, filtered to this firm.
 * Nothing here is cached across users.
 */

export const DUE_SOON_DAYS = 14
const LIST_LIMIT = 20

export type HomeEngagement = {
    id: string
    name: string
    href: string
    clientName: string
    status: string
    dueDate: string | null
    updatedAt: string
    role: EngagementRoleSlug | null
}

export type NeedsYouItem = {
    id: string
    kind: 'deliverable_review' | 'intake' | 'ai_summary' | 'reminder'
    title: string
    context: string
    href: string
    actionLabel: string
    at: string | null
}

export type DueItem = {
    id: string
    kind: 'deliverable' | 'engagement' | 'reminder'
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

function isReviewReminder(r: ReminderWithContext): boolean {
    // "Review comment" (@mention), "Review document", "Review shared document", `Review: "<file>"` (intake).
    return r.action.startsWith('Review')
}

function startOfToday(): Date {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
}

export async function getMyWork(params: {
    userId: string
    firmId: string
    groupSlug: string
    firmSlug: string
    /** The caller's reminders (getUserReminders); filtered to this firm here. */
    reminders: ReminderWithContext[]
}): Promise<MyWork> {
    const { userId, firmId, groupSlug, firmSlug } = params
    const empty: MyWork = { engagements: [], needsYou: [], dueSoon: [] }

    try {
        const rows = await prisma.engagement.findMany({
            where: { isDeleted: false, client: { firmId }, members: { some: { userId } } },
            select: {
                id: true,
                name: true,
                slug: true,
                status: true,
                dueDate: true,
                updatedAt: true,
                client: { select: { name: true, slug: true } },
                members: { where: { userId }, select: { role: true } },
            },
            orderBy: { updatedAt: 'desc' },
        })
        if (rows.length === 0) return { ...empty, ...remindersOnly(params.reminders, firmId) }

        const engagements: HomeEngagement[] = rows.map((e) => ({
            id: e.id,
            name: e.name,
            href: engagementPath(groupSlug, firmSlug, e.client.slug, e.slug),
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
        const sharesBoard = (id: string) => {
            const row = rows.find((r) => r.id === id)!
            return engagementPath(groupSlug, firmSlug, row.client.slug, row.slug, { tab: 'shares', subpath: 'board' })
        }

        const allIds = engagements.map((e) => e.id)
        const leadIds = engagements.filter((e) => e.role === 'eng_admin').map((e) => e.id)
        const dueCutoff = new Date(Date.now() + DUE_SOON_DAYS * 86_400_000)
        const today = startOfToday()

        const [inReview, intake, aiDrafts, assigned] = await Promise.all([
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
            // AI engagement summaries generated but not yet reviewed (lead approves before clients see them).
            leadIds.length
                ? prisma.engagement.findMany({
                      where: { id: { in: leadIds }, settings: { path: ['insightsSummary', 'draft', 'status'], equals: 'pending_review' } },
                      select: { id: true },
                  })
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
        ])

        const needsYou: NeedsYouItem[] = [
            ...inReview.map((d) => ({
                id: `review:${d.id}`,
                kind: 'deliverable_review' as const,
                title: d.fileName,
                context: contextOf(d.engagementId),
                href: sharesBoard(d.engagementId),
                actionLabel: 'Review',
                at: d.updatedAt.toISOString(),
            })),
            ...intake.map((d) => ({
                id: `intake:${d.id}`,
                kind: 'intake' as const,
                title: d.fileName,
                context: contextOf(d.engagementId),
                href: sharesBoard(d.engagementId),
                actionLabel: 'Approve upload',
                at: d.createdAt.toISOString(),
            })),
            ...aiDrafts.map((e) => ({
                id: `ai:${e.id}`,
                kind: 'ai_summary' as const,
                title: 'AI summary ready for review',
                context: contextOf(e.id),
                href: `${byId.get(e.id)!.href}/analytics`,
                actionLabel: 'Review',
                at: null,
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
                title: e.name,
                context: e.client.name,
                href: byId.get(e.id)!.href,
                dueDate: e.dueDate.toISOString(),
                overdue: e.dueDate < today,
                status: e.status,
            })
        }

        const fromReminders = remindersOnly(params.reminders, firmId)
        return {
            engagements,
            needsYou: [...needsYou, ...fromReminders.needsYou],
            dueSoon: [...dueSoon, ...fromReminders.dueSoon].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
        }
    } catch (e) {
        logger.error('getMyWork failed', e as Error, 'Home', { userId, firmId })
        return empty
    }
}

/** The caller's own reminders in this firm: review requests → Needs you; dated ones → Due soon. */
function remindersOnly(reminders: ReminderWithContext[], firmId: string): Pick<MyWork, 'needsYou' | 'dueSoon'> {
    const needsYou: NeedsYouItem[] = []
    const dueSoon: DueItem[] = []
    for (const r of reminders) {
        if (r.hiddenAt || r.firmId !== firmId) continue
        if (isReviewReminder(r)) {
            needsYou.push({
                id: `reminder:${r.id}`,
                kind: 'reminder',
                title: r.entityName,
                context: r.action,
                href: r.ctaUrl ?? '#',
                actionLabel: 'Open',
                at: r.dateValue,
            })
        } else if (r.dateValue && r.delta !== null && r.delta <= DUE_SOON_DAYS) {
            dueSoon.push({
                id: `reminder:${r.id}`,
                kind: 'reminder',
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
