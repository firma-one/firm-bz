import 'server-only'
import { createAdminClient } from '@/utils/supabase/admin'
import { resolveNames } from '@/lib/auth/display-name'

/**
 * Resolving Supabase auth identities in bulk for system-admin pages.
 *
 * Identity lives in Supabase auth, not Postgres: our tables store a `userId` and nothing else, so
 * any admin page that needs to show who someone is has to cross that boundary. Shared because both
 * the firm-group directory and the AI efficacy dashboard need the same lookup.
 */

/** Supabase caps `listUsers` per page; 200 is its practical maximum. */
const AUTH_PAGE_SIZE = 200
/** Bound the auth sweep so a large tenant cannot hang the page. */
const MAX_AUTH_PAGES = 20

export type AuthLite = {
    id: string
    email: string | null
    firstName: string | null
    lastName: string | null
}

/**
 * Names are read from `user_metadata`, which is not uniform — see `lib/auth/display-name` for the
 * precedence and why it exists. Kept as a named export because admin pages want the pair apart,
 * and deliberately passes no email: an admin directory should show a blank cell for someone who
 * has not supplied a name rather than a guess made from their address.
 */
export function namesFrom(meta: Record<string, unknown>): { firstName: string | null; lastName: string | null } {
    const { firstName, lastName } = resolveNames(meta)
    return { firstName, lastName }
}

/**
 * Loads the auth records for the given user ids.
 *
 * `listUsers` is swept rather than calling `getUserById` per row: N rows would otherwise cost N
 * round-trips, and one bounded sweep serves every row on the page.
 */
export async function loadAuthUsers(userIds: Set<string>): Promise<Map<string, AuthLite>> {
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

/** A display name for an auth record, falling back to the email local part, then the raw id. */
export function displayName(auth: AuthLite | null | undefined, userId?: string | null): string {
    const name = [auth?.firstName, auth?.lastName].filter(Boolean).join(' ').trim()
    if (name) return name
    if (auth?.email) return auth.email.split('@')[0]
    return userId ? `${userId.slice(0, 8)}…` : 'Unknown'
}
