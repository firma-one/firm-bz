import 'server-only'
import { createAdminClient } from '@/utils/supabase/admin'
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

/** Supabase caps `listUsers` per page; 200 is its practical maximum. */
const AUTH_PAGE_SIZE = 200
/** Bound the auth sweep so a large tenant cannot hang the page. */
const MAX_AUTH_PAGES = 20

type AuthLite = { id: string; email: string | null; firstName: string | null; lastName: string | null }

/**
 * Names are read from `user_metadata`, which is not uniform.
 *
 * Email/password signups write `first_name` / `last_name`. Google OAuth writes only `full_name` and
 * `name`, so splitting the full name is the only way to show anything for those accounts. Last name
 * takes the remainder, so "Mary Jane Watson" keeps "Jane Watson" together rather than dropping it.
 */
function namesFrom(meta: Record<string, unknown>): { firstName: string | null; lastName: string | null } {
    const first = typeof meta.first_name === 'string' ? meta.first_name.trim() : ''
    const last = typeof meta.last_name === 'string' ? meta.last_name.trim() : ''
    if (first || last) return { firstName: first || null, lastName: last || null }

    const full = typeof meta.full_name === 'string' ? meta.full_name.trim()
        : typeof meta.name === 'string' ? meta.name.trim() : ''
    if (!full) return { firstName: null, lastName: null }

    const parts = full.split(/\s+/)
    if (parts.length === 1) return { firstName: parts[0], lastName: null }
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

/**
 * Loads the auth records for the given user ids.
 *
 * `listUsers` is swept rather than calling `getUserById` per row: a directory of N groups would
 * otherwise cost N round-trips, and the sweep is bounded and reused for every row on the page.
 */
async function loadAuthUsers(userIds: Set<string>): Promise<Map<string, AuthLite>> {
    const out = new Map<string, AuthLite>()
    if (userIds.size === 0) return out

    const admin = createAdminClient()
    for (let page = 1; page <= MAX_AUTH_PAGES; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: AUTH_PAGE_SIZE })
        if (error) break
        const users = data?.users ?? []
        for (const u of users) {
            if (!userIds.has(u.id)) continue
            const meta = (u.user_metadata ?? {}) as Record<string, unknown>
            out.set(u.id, { id: u.id, email: u.email ?? null, ...namesFrom(meta) })
        }
        // Stop early once every id is resolved, or when the page was not full (last page).
        if (out.size === userIds.size || users.length < AUTH_PAGE_SIZE) break
    }
    return out
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
