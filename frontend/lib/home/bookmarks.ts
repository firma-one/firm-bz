import 'server-only'

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { engagementDocFilePath, engagementPath } from '@/lib/navigation/firm-paths'
import type { HomeFirm } from '@/lib/home/home-firms'

/**
 * The caller's bookmarks for the cross-firm Home (.claude/plans/cross-firm-home-inbox.md): those on
 * engagements (and their documents) the caller still belongs to, in the firms given. Anything else
 * — removed from the engagement, engagement deleted, another firm, link-only bookmarks — is dropped
 * here, not shown as a dead link. Mirrors the sidebar's old Favorites rule (getShellSidebarData).
 */

export type HomeBookmark = {
    id: string
    kind: 'project' | 'document'
    label: string
    href: string
    /** Where it lives: the engagement for a document, the client for an engagement. */
    context: string
    firmId: string
}

type RawBookmark = { id?: unknown; kind?: unknown; label?: unknown; url?: unknown; projectId?: unknown; documentId?: unknown }

export async function getHomeBookmarks(userId: string, firms: HomeFirm[]): Promise<HomeBookmark[]> {
    if (firms.length === 0) return []
    try {
        const row = await prisma.userPersonalization.findUnique({ where: { userId }, select: { bookmarks: true } })
        const raw = (Array.isArray(row?.bookmarks) ? row!.bookmarks : []) as RawBookmark[]
        const wanted = raw.filter(
            (b): b is RawBookmark & { kind: 'project' | 'document'; projectId: string } =>
                !!b && (b.kind === 'project' || b.kind === 'document') && typeof b.projectId === 'string'
        )
        if (wanted.length === 0) return []

        const firmById = new Map(firms.map((f) => [f.id, f]))
        const engagements = await prisma.engagement.findMany({
            where: {
                id: { in: Array.from(new Set(wanted.map((b) => b.projectId))) },
                isDeleted: false,
                client: { firmId: { in: Array.from(firmById.keys()) } },
                members: { some: { userId } },
            },
            select: { id: true, name: true, slug: true, client: { select: { name: true, slug: true, firmId: true } } },
        })
        const engagementById = new Map(engagements.map((e) => [e.id, e]))

        const out: HomeBookmark[] = []
        for (const b of wanted) {
            const e = engagementById.get(b.projectId)
            const firm = e && firmById.get(e.client.firmId)
            if (!e || !firm) continue
            const engagementHref = engagementPath(firm.groupSlug, firm.slug, e.client.slug, e.slug)
            const isDoc = b.kind === 'document'
            // A document bookmark opens its saved URL when it has one, else the document itself
            // (bookmarks with ids are stored without a URL, see /api/bookmarks); the page re-checks
            // access. Engagement bookmarks open the engagement.
            const docHref =
                (typeof b.url === 'string' && b.url) ||
                (typeof b.documentId === 'string' && b.documentId
                    ? engagementDocFilePath(firm.groupSlug, firm.slug, e.client.slug, e.slug, b.documentId)
                    : engagementHref)
            out.push({
                id: String(b.id),
                kind: b.kind,
                label: (typeof b.label === 'string' && b.label) || (isDoc ? 'Document' : e.name),
                href: isDoc ? docHref : engagementHref,
                context: isDoc ? e.name : e.client.name,
                firmId: firm.id,
            })
        }
        return out
    } catch (e) {
        logger.error('getHomeBookmarks failed', e as Error, 'Home', { userId })
        return []
    }
}
