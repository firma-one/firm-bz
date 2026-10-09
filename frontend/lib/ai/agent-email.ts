/**
 * The marker that identifies an agent account, with no dependencies.
 *
 * Deliberately separate from `files-agent/agent-identity.ts`: that module is `server-only` and
 * pulls in the Supabase admin client, which cannot be imported into the Prisma client extension
 * without a cycle. This is the one fact the data layer needs, and it is a string comparison.
 */

/**
 * The domain agent accounts live on.
 *
 * A subdomain with no mail exchanger: an address nobody can receive at is what makes the password
 * reset path unusable. Overridable so a self-hosted deployment can point it at its own
 * non-routable domain — it must match wherever accounts are provisioned.
 */
export const AGENT_EMAIL_DOMAIN = process.env.AI_AGENT_EMAIL_DOMAIN ?? 'agents.firma.bz'

/** True when an email belongs to an agent account. */
export function isAgentEmail(email: string | null | undefined): boolean {
    return typeof email === 'string' && email.endsWith(`@${AGENT_EMAIL_DOMAIN}`)
}

/**
 * True when a user id belongs to an agent account.
 *
 * Queries `auth.users` rather than consulting a cache, so it is correct for any id regardless of
 * what this process has seen. Use it where a wrong answer would be user-visible or would write a
 * row; the synchronous `isAgentUserId` is for hot paths where a lookup per member is too costly.
 */
export async function isAgentUserIdAsync(userId: string | null | undefined): Promise<boolean> {
    if (!userId) return false
    try {
        const { prisma } = await import('@/lib/prisma')
        const rows = await prisma.$queryRawUnsafe<Array<{ ok: boolean }>>(
            `SELECT (email LIKE $2) AS ok FROM auth.users WHERE id = $1::uuid`,
            userId,
            `%@${AGENT_EMAIL_DOMAIN}`,
        )
        return rows[0]?.ok === true
    } catch {
        // Treated as a person on failure: skipping a real user's reminder is worse than writing
        // one an agent will not read.
        return false
    }
}

/**
 * Filters agent ids out of a list of user ids.
 *
 * One query for the whole list rather than one per id, and reliable rather than cache-backed —
 * for the paths that WRITE rows keyed on a user, where a cold cache would mean junk rows rather
 * than merely a missed notification.
 */
export async function withoutAgentIds(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return userIds
    try {
        const { prisma } = await import('@/lib/prisma')
        const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id::text FROM auth.users WHERE id = ANY($1::uuid[]) AND email LIKE $2`,
            userIds,
            `%@${AGENT_EMAIL_DOMAIN}`,
        )
        const agents = new Set(rows.map((r) => r.id))
        return userIds.filter((id) => !agents.has(id))
    } catch {
        // Treated as people on failure: a stray row is recoverable, excluding a real member from
        // a grant they are entitled to is not.
        return userIds
    }
}
