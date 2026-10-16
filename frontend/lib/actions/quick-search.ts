'use server'

import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'
import { logger } from '@/lib/logger'
import { clientPath, engagementDocFilePath, engagementPath } from '@/lib/navigation/firm-paths'
import { computeGlobalSearchAccessScope } from '@/lib/services/global-search-access'
import { getRecentVisits, type RecentVisit } from '@/lib/recents'

/**
 * Entity search for the New UI ⌘K menu (.claude/plans/ui-ux-overhaul.md, Phase 5).
 *
 * Access — no new rules:
 *  - engagements: the caller's own EngagementMember rows (not deleted), in firms they belong to,
 *    across all of their firms;
 *  - clients: the getFirmHierarchy rule (ClientMember, or a member of one of its live engagements);
 *  - files: current firm only, scoped exactly like the existing Doc Search
 *    (computeGlobalSearchAccessScope + the grant check SearchService applies for EC/EV), and with
 *    the same exclusions (private-locked and intake-locked documents).
 */

export type QuickResult = {
    id: string
    kind: 'engagement' | 'client' | 'file'
    title: string
    context: string
    href: string
}

const MAX_QUERY = 100

async function currentUserId(): Promise<string | null> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id ?? null
}

export async function quickSearch(query: string, firmSlug: string | null): Promise<QuickResult[]> {
    try {
        const q = typeof query === 'string' ? query.trim().slice(0, MAX_QUERY) : ''
        if (!q) return []
        const userId = await currentUserId()
        if (!userId) return []

        const contains = { contains: q, mode: 'insensitive' as const }
        const inMyFirms = { members: { some: { userId } } }

        const [engagements, clients, currentFirm] = await Promise.all([
            prisma.engagement.findMany({
                where: { isDeleted: false, name: contains, members: { some: { userId } }, client: { firm: inMyFirms } },
                select: {
                    id: true, name: true, slug: true,
                    client: { select: { name: true, slug: true, firm: { select: { id: true, name: true, slug: true, group: { select: { slug: true } } } } } },
                },
                orderBy: { updatedAt: 'desc' },
                take: 8,
            }),
            prisma.client.findMany({
                where: {
                    name: contains,
                    firm: inMyFirms,
                    OR: [
                        { members: { some: { userId } } },
                        { engagements: { some: { isDeleted: false, members: { some: { userId } } } } },
                    ],
                },
                select: { id: true, name: true, slug: true, firm: { select: { id: true, name: true, slug: true, group: { select: { slug: true } } } } },
                orderBy: { name: 'asc' },
                take: 6,
            }),
            firmSlug ? prisma.firm.findUnique({ where: { slug: firmSlug }, select: { id: true, slug: true, group: { select: { slug: true } } } }) : null,
        ])

        const results: QuickResult[] = []
        const otherFirm = (id: string, name: string) => (currentFirm && currentFirm.id !== id ? ` · ${name}` : '')

        for (const e of engagements) {
            const f = e.client.firm
            results.push({
                id: `engagement:${e.id}`,
                kind: 'engagement',
                title: e.name,
                context: `${e.client.name}${otherFirm(f.id, f.name)}`,
                href: engagementPath(f.group.slug, f.slug, e.client.slug, e.slug),
            })
        }
        for (const c of clients) {
            results.push({
                id: `client:${c.id}`,
                kind: 'client',
                title: c.name,
                context: `Client${otherFirm(c.firm.id, c.firm.name)}`,
                href: clientPath(c.firm.group.slug, c.firm.slug, c.slug),
            })
        }

        if (currentFirm && q.length >= 2) {
            results.push(...(await searchFiles(userId, currentFirm.id, currentFirm.group.slug, currentFirm.slug, q)))
        }
        return results
    } catch (e) {
        logger.error('quickSearch failed', e as Error, 'QuickSearch')
        return []
    }
}

async function searchFiles(userId: string, firmId: string, groupSlug: string, firmSlug: string, q: string): Promise<QuickResult[]> {
    const member = await prisma.firmMember.findFirst({ where: { userId, firmId }, select: { id: true } })
    if (!member) return []

    const scope = await computeGlobalSearchAccessScope(userId, firmId)
    if (!scope.isFirmAdmin && scope.fullAccessEngagementIds.length === 0 && scope.grantGatedEngagementIds.length === 0) return []

    // Wildcards in the user's text are matched literally.
    const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
    const full = scope.fullAccessEngagementIds
    const gated = scope.grantGatedEngagementIds

    const rows = await prisma.$queryRaw<{ id: string; fileName: string; isFolder: boolean; engagementSlug: string; engagementName: string; clientSlug: string }[]>`
        SELECT d.id, d."fileName", d."isFolder", e.slug AS "engagementSlug", e.name AS "engagementName", c.slug AS "clientSlug"
        FROM platform.engagement_documents d
        JOIN platform.engagements e ON e.id = d."engagementId" AND e."isDeleted" = false
        JOIN platform.clients c ON c.id = d."clientId"
        WHERE d."firmId" = ${firmId}::uuid
          AND d."fileName" ILIKE ${pattern}
          AND (d.settings->>'locked') IS DISTINCT FROM 'private'
          AND (d.settings->'lock'->>'type') IS NULL
          AND (
            ${scope.isFirmAdmin}
            OR d."engagementId" = ANY(${full}::uuid[])
            OR (
              d."engagementId" = ANY(${gated}::uuid[])
              AND EXISTS (
                SELECT 1 FROM platform.engagement_document_sharing_users sh
                WHERE sh."projectDocumentId" = d.id
                  AND sh."userId" = ${userId}::uuid
                  AND sh."sharingPermissionStatus" IN ('GRANTED', 'INHERITED')
              )
            )
          )
        ORDER BY d."updatedAt" DESC
        LIMIT 8`

    return rows.map((r) => ({
        id: `file:${r.id}`,
        kind: 'file' as const,
        title: r.fileName,
        context: r.engagementName,
        href: engagementDocFilePath(groupSlug, firmSlug, r.clientSlug, r.engagementSlug, r.id),
    }))
}

/** Recents for the empty ⌘K menu — the same access-checked list Home uses. */
export async function getCommandRecents(firmSlug: string | null): Promise<RecentVisit[]> {
    try {
        if (!firmSlug) return []
        const userId = await currentUserId()
        if (!userId) return []
        const firm = await prisma.firm.findUnique({ where: { slug: firmSlug }, select: { id: true } })
        if (!firm) return []
        return await getRecentVisits(userId, firm.id, 6)
    } catch (e) {
        logger.error('getCommandRecents failed', e as Error, 'QuickSearch')
        return []
    }
}
