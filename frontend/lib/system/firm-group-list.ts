import 'server-only'
import { loadAuthUsers, type AuthLite } from './auth-users'
import { prisma } from '@/lib/prisma'

/**
 * Directory of firm groups for the system-admin tools.
 *
 * Exists so an admin can BROWSE rather than having to already know a user's email address. The
 * user-data-map page was lookup-first, which only works when you can name the account you want —
 * fine while there is one, useless for triage.
 *
 * Group admin identity comes from Supabase auth, not Postgres: `platform.group_members` stores a
 * `userId`, and the email, first and last name live in that user's auth record. So this joins the
 * two sources, which is why it is paginated rather than a plain Prisma query.
 */

export type FirmGroupListRow = {
    groupId: string
    name: string
    slug: string
    firmCount: number
    /** Plan from the active subscription, when there is one. */
    plan: string | null
    createdAt: string
    admin: {
        userId: string
        email: string | null
        firstName: string | null
        lastName: string | null
    } | null
}

export type FirmGroupListResult = {
    rows: FirmGroupListRow[]
    total: number
    /** True when the result was narrowed by a search term. */
    filtered: boolean
}

/**
 * Lists firm groups with their group admin, newest first.
 *
 * `search` matches the group name, slug, or the admin's email / name. Email matching is why this
 * cannot be a pure database query — the email lives in Supabase auth — so group rows are loaded
 * first, enriched, then filtered in memory. That is acceptable at the scale this tool serves and
 * keeps one search box over both sources; if the group count ever grows past a few hundred, the
 * right fix is to denormalise the admin email onto the group, not to paginate this.
 */
export async function listFirmGroups(search?: string): Promise<FirmGroupListResult> {
    const groups = await prisma.group.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            name: true,
            slug: true,
            createdAt: true,
            _count: { select: { firms: true } },
            members: {
                where: { role: 'GROUP_ADMIN' },
                orderBy: { createdAt: 'asc' },
                take: 1,
                select: { userId: true },
            },
            subscriptions: {
                where: { active: true, deletedAt: null },
                orderBy: { updatedAt: 'desc' },
                take: 1,
                select: { plan: true },
            },
        },
    })

    const adminIds = new Set(groups.flatMap((g) => g.members.map((m) => m.userId)))
    const authById = await loadAuthUsers(adminIds)

    const rows: FirmGroupListRow[] = groups.map((g) => {
        const adminId = g.members[0]?.userId ?? null
        const auth = adminId ? authById.get(adminId) ?? null : null
        return {
            groupId: g.id,
            name: g.name,
            slug: g.slug,
            firmCount: g._count.firms,
            plan: g.subscriptions[0]?.plan ?? null,
            createdAt: g.createdAt.toISOString(),
            admin: adminId
                ? {
                      userId: adminId,
                      email: auth?.email ?? null,
                      firstName: auth?.firstName ?? null,
                      lastName: auth?.lastName ?? null,
                  }
                : null,
        }
    })

    const term = search?.trim().toLowerCase() ?? ''
    if (!term) return { rows, total: rows.length, filtered: false }

    const matched = rows.filter((r) =>
        r.name.toLowerCase().includes(term)
        || r.slug.toLowerCase().includes(term)
        || (r.admin?.email ?? '').toLowerCase().includes(term)
        || `${r.admin?.firstName ?? ''} ${r.admin?.lastName ?? ''}`.toLowerCase().includes(term),
    )
    return { rows: matched, total: matched.length, filtered: true }
}
