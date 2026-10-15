'use server'

import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'
import { logger } from '@/lib/logger'
import { engagementPath } from '@/lib/navigation/firm-paths'

/**
 * Data for the New UI sidebar (.claude/plans/ui-ux-overhaul.md, Phase 2): the firm's clients and
 * engagements the caller belongs to, plus their favorites in this firm.
 *
 * Visibility mirrors getFirmHierarchy (lib/actions/hierarchy.ts) exactly — the caller needs a
 * FirmMember row; a client is listed when they have a ClientMember row or belong to one of its
 * non-deleted engagements; an engagement is listed only with their own EngagementMember row. It is
 * a separate, lighter query because the sidebar needs names and statuses, not connectors, brands
 * or encrypted fields, and it runs on every firm the user opens.
 */

export type ShellEngagement = {
    id: string
    name: string
    slug: string
    status: string
    dueDate: string | null
    href: string
    /** The caller's own role on this engagement. */
    role: string | null
}

export type ShellClient = {
    id: string
    name: string
    slug: string
    status: string
    engagements: ShellEngagement[]
}

export type ShellFavorite = {
    id: string
    kind: 'project' | 'document'
    label: string
    href: string
    /** Engagement name, shown as secondary text for document favorites. */
    context: string | null
}

export type ShellSidebarData = {
    firm: { id: string; name: string; slug: string; groupSlug: string }
    clients: ShellClient[]
    favorites: ShellFavorite[]
    /** Every engagement membership is EC/EV and the user is not a firm admin — the client-facing view. */
    isExternalOnly: boolean
}

const EXTERNAL_ROLES = new Set(['eng_ext_collaborator', 'eng_viewer'])

export async function getShellSidebarData(firmSlug: string): Promise<ShellSidebarData | null> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return null

        const firm = await prisma.firm.findUnique({
            where: { slug: firmSlug },
            select: { id: true, name: true, slug: true, group: { select: { slug: true } } },
        })
        if (!firm) return null

        const [membership, clients, personalization] = await Promise.all([
            prisma.firmMember.findFirst({
                where: { userId: user.id, firmId: firm.id },
                select: { role: true },
            }),
            prisma.client.findMany({
                where: {
                    firmId: firm.id,
                    OR: [
                        { members: { some: { userId: user.id } } },
                        { engagements: { some: { isDeleted: false, members: { some: { userId: user.id } } } } },
                    ],
                },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    status: true,
                    engagements: {
                        where: { isDeleted: false, members: { some: { userId: user.id } } },
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            status: true,
                            dueDate: true,
                            members: { where: { userId: user.id }, select: { role: true } },
                        },
                        orderBy: { name: 'asc' },
                    },
                },
                orderBy: { name: 'asc' },
            }),
            prisma.userPersonalization.findUnique({
                where: { userId: user.id },
                select: { bookmarks: true },
            }),
        ])
        if (!membership) return null

        const groupSlug = firm.group.slug
        const engagementById = new Map<string, { name: string; href: string }>()
        const roles: string[] = []

        const shellClients: ShellClient[] = clients.map((c) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            status: c.status,
            engagements: c.engagements.map((e) => {
                const href = engagementPath(groupSlug, firm.slug, c.slug, e.slug)
                const role = e.members[0]?.role ?? null
                if (role) roles.push(role)
                engagementById.set(e.id, { name: e.name, href })
                return {
                    id: e.id,
                    name: e.name,
                    slug: e.slug,
                    status: e.status,
                    dueDate: e.dueDate ? e.dueDate.toISOString() : null,
                    href,
                    role,
                }
            }),
        }))

        // Favorites = bookmarks on engagements (and their documents) the caller can still see in
        // this firm. Bookmarks on anything else are dropped here, not shown as dead links.
        const rawBookmarks = Array.isArray(personalization?.bookmarks) ? (personalization!.bookmarks as any[]) : []
        const favorites: ShellFavorite[] = []
        for (const b of rawBookmarks) {
            if (!b || (b.kind !== 'project' && b.kind !== 'document') || typeof b.projectId !== 'string') continue
            const eng = engagementById.get(b.projectId)
            if (!eng) continue
            const isDoc = b.kind === 'document'
            favorites.push({
                id: String(b.id),
                kind: b.kind,
                label: (typeof b.label === 'string' && b.label) || (isDoc ? 'Document' : eng.name),
                // Document bookmarks carry their own deeplink URL (resolved through /api/deeplink,
                // which re-checks access); engagement bookmarks open the engagement.
                href: isDoc && typeof b.url === 'string' && b.url ? b.url : eng.href,
                context: isDoc ? eng.name : null,
            })
        }

        return {
            firm: { id: firm.id, name: firm.name, slug: firm.slug, groupSlug },
            clients: shellClients,
            favorites,
            isExternalOnly: membership.role !== 'firm_admin' && roles.length > 0 && roles.every((r) => EXTERNAL_ROLES.has(r)),
        }
    } catch (e) {
        logger.error('getShellSidebarData failed', e as Error, 'Shell', { firmSlug })
        return null
    }
}
