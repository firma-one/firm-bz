import 'server-only'

/**
 * Brio's identity as an engagement member.
 *
 * ## Why a reserved id rather than a real auth account
 *
 * Agent-performed file operations must be attributable. A `viaAgent` flag buried in audit metadata
 * is not: the Audit tab renders events by actor, so a renamed file would read as the approving
 * Engagement Lead's work with the flag easy for any consumer to ignore. Making Brio a member makes
 * the attribution structural — Audit, Members and `createdBy` all show it without knowing anything
 * about this feature.
 *
 * It is NOT a Supabase auth user. A real account would resolve for free through
 * `supabaseAdmin.auth.admin.getUserById`, but it would also be a credential-bearing row per firm,
 * with a password reset path, that exists forever. Brio is deliberately visible in the Members
 * list, so people will try to interact with it — and the safest thing to hand them is something
 * that cannot be signed into at all.
 *
 * The cost of that choice is this module: `getUserById` returns null for these ids, so every
 * identity lookup has to resolve them here first. That is why the resolution is centralised rather
 * than special-cased at each of the ~15 call sites — a site that forgets would render a blank
 * actor, and the next new site would forget by default.
 */

/**
 * The reserved namespace for agent member ids.
 *
 * Deliberately a recognisable constant prefix rather than a random uuid: anyone reading a database
 * row or an audit export can tell at a glance that this is not a person. The suffix identifies the
 * firm, so a firm's agent activity stays within that firm's data for retention and deletion.
 */
const AGENT_UUID_PREFIX = '0b100000-0000-4000-8000-'

/** Agent kinds. Only one today; the shape allows a second without reworking callers. */
export type AgentKind = 'pmo'

/**
 * Derives the stable member id for a firm's agent.
 *
 * Built from the firm's own uuid so it is deterministic — no stored mapping to keep in sync, and
 * the same firm always yields the same agent id across environments.
 */
export function agentUserId(firmId: string): string {
    // Last 12 hex digits of the firm id, which is already uniformly distributed.
    const tail = firmId.replace(/-/g, '').slice(-12)
    return `${AGENT_UUID_PREFIX}${tail}`
}

/** True when the id belongs to an agent rather than a person. */
export function isAgentUserId(userId: string | null | undefined): boolean {
    return typeof userId === 'string' && userId.startsWith(AGENT_UUID_PREFIX)
}

/** The display identity for an agent member, shaped like a resolved auth user. */
export interface AgentIdentity {
    id: string
    email: string | null
    firstName: string
    lastName: string
    fullName: string
    isAgent: true
}

/**
 * Resolves an agent id to its display identity, or null when the id is a person's.
 *
 * Returns no email: there is no inbox behind it, and showing one would invite someone to write to
 * it or try a password reset against an account that does not exist.
 */
export function resolveAgentIdentity(userId: string | null | undefined): AgentIdentity | null {
    if (!isAgentUserId(userId)) return null
    return {
        id: userId as string,
        email: null,
        firstName: 'Brio',
        lastName: 'PMO',
        fullName: 'Brio PMO',
        isAgent: true,
    }
}
