import 'server-only'

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

/**
 * Server-side recents (platform.user_recent_visits) — the New UI's "Continue where you left off"
 * and last-visited-firm landing (.claude/plans/ui-ux-overhaul.md, Phase 3).
 *
 * Rows are written by recordVisit (lib/actions/recents.ts) only for entities the caller could see
 * at the time. Visibility can change afterwards (removed from an engagement, engagement deleted),
 * so every read here re-checks it against current memberships and drops what fails.
 */

export const MAX_RECENTS_PER_USER = 50

const ENGAGEMENT_TABS = new Set(['files', 'shares', 'comments', 'members', 'analytics', 'sources', 'audit', 'settings', 'wiki'])

export type ParsedAppPath = {
    groupSlug: string
    firmSlug: string
    clientSlug: string | null
    engagementSlug: string | null
    /** First segment after /e/{slug}, when it is an engagement tab (`board` counts as `shares`). */
    engagementTab: string | null
}

/** Parses an in-app path (with optional query/hash). Null for anything outside /d/{g}/f/{f}. */
export function parseAppPath(path: string): ParsedAppPath | null {
    const seg = path.split(/[?#]/)[0].split('/').filter(Boolean)
    // d / {group} / f / {firm} [/ c / {client} [/ e / {engagement} [/ {tab} …]]]
    if (seg[0] !== 'd' || seg[2] !== 'f' || !seg[1] || !seg[3]) return null
    const hasClient = seg[4] === 'c' && Boolean(seg[5])
    const hasEngagement = hasClient && seg[6] === 'e' && Boolean(seg[7])
    if (seg.length > 4 && !hasClient) {
        // Firm-level sub-pages (/audit, /connectors) still belong to the firm.
        return { groupSlug: seg[1], firmSlug: seg[3], clientSlug: null, engagementSlug: null, engagementTab: null }
    }
    const sub = hasEngagement ? seg[8] : undefined
    const tab = sub === 'board' ? 'shares' : sub && ENGAGEMENT_TABS.has(sub) ? sub : null
    return {
        groupSlug: seg[1],
        firmSlug: seg[3],
        clientSlug: hasClient ? seg[5] : null,
        engagementSlug: hasEngagement ? seg[7] : null,
        engagementTab: tab,
    }
}

export type RecentVisit = {
    id: string
    entityType: 'firm' | 'client' | 'engagement' | 'document'
    entityId: string
    /** Exactly where the user was — tab, query and hash included. */
    path: string
    title: string
    /** Client name for engagement rows. */
    context: string | null
    visitedAt: string
}

/**
 * The caller's recent visits in one firm, newest first, limited to what they can still see —
 * engagements they still belong to (not deleted) and clients they still reach (the
 * getFirmHierarchy rule), and only while they remain a member of the firm.
 */
export async function getRecentVisits(userId: string, firmId: string, limit = 8): Promise<RecentVisit[]> {
    try {
        const [rows, firmMember] = await Promise.all([
            prisma.userRecentVisit.findMany({
                where: { userId, firmId },
                orderBy: { visitedAt: 'desc' },
                take: Math.min(limit * 3, MAX_RECENTS_PER_USER),
            }),
            prisma.firmMember.findFirst({ where: { userId, firmId }, select: { id: true } }),
        ])
        if (!firmMember || rows.length === 0) return []

        const engagementIds = rows.filter((r) => r.entityType === 'engagement').map((r) => r.entityId)
        const clientIds = rows.filter((r) => r.entityType === 'client').map((r) => r.entityId)

        const [engagements, clients] = await Promise.all([
            engagementIds.length
                ? prisma.engagement.findMany({
                      where: { id: { in: engagementIds }, isDeleted: false, members: { some: { userId } } },
                      select: { id: true, name: true, client: { select: { name: true } } },
                  })
                : [],
            clientIds.length
                ? prisma.client.findMany({
                      where: {
                          id: { in: clientIds },
                          firmId,
                          OR: [
                              { members: { some: { userId } } },
                              { engagements: { some: { isDeleted: false, members: { some: { userId } } } } },
                          ],
                      },
                      select: { id: true, name: true },
                  })
                : [],
        ])
        const engagementById = new Map(engagements.map((e) => [e.id, e]))
        const clientById = new Map(clients.map((c) => [c.id, c]))

        const out: RecentVisit[] = []
        for (const r of rows) {
            if (out.length >= limit) break
            let title: string | null = null
            let context: string | null = null
            if (r.entityType === 'engagement') {
                const e = engagementById.get(r.entityId)
                if (!e) continue
                title = e.name
                context = e.client.name
            } else if (r.entityType === 'client') {
                const c = clientById.get(r.entityId)
                if (!c) continue
                title = c.name
            } else {
                // Firm-level rows (Home, calendar, doc search) feed the landing resolver, not
                // "Continue": resuming onto Home from Home would be a no-op.
                continue
            }
            out.push({
                id: r.id,
                entityType: r.entityType,
                entityId: r.entityId,
                path: r.path,
                title,
                context,
                visitedAt: r.visitedAt.toISOString(),
            })
        }
        return out
    } catch (e) {
        // Also covers the window before the user_recent_visits migration is applied.
        logger.error('getRecentVisits failed', e as Error, 'Recents', { userId, firmId })
        return []
    }
}

/** Of the given firms, the one the user most recently did anything in. */
export async function getLastVisitedFirmId(userId: string, firmIds: string[]): Promise<string | null> {
    if (firmIds.length === 0) return null
    try {
        const row = await prisma.userRecentVisit.findFirst({
            where: { userId, firmId: { in: firmIds } },
            orderBy: { visitedAt: 'desc' },
            select: { firmId: true },
        })
        return row?.firmId ?? null
    } catch (e) {
        logger.error('getLastVisitedFirmId failed', e as Error, 'Recents', { userId })
        return null
    }
}

/** The engagement tab the user was last on, if they have visited it before. */
export async function getLastEngagementTab(userId: string, engagementId: string): Promise<string | null> {
    try {
        const row = await prisma.userRecentVisit.findUnique({
            where: { userId_entityType_entityId: { userId, entityType: 'engagement', entityId: engagementId } },
            select: { path: true },
        })
        return row ? (parseAppPath(row.path)?.engagementTab ?? null) : null
    } catch (e) {
        logger.error('getLastEngagementTab failed', e as Error, 'Recents', { userId, engagementId })
        return null
    }
}
