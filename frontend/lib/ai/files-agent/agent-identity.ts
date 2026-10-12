import 'server-only'
import { randomBytes } from 'crypto'
import { createAdminClient } from '@/utils/supabase/admin'
import { logger } from '@/lib/logger'
import { AGENT_EMAIL_DOMAIN, isAgentEmail } from '@/lib/ai/agent-email'

/**
 * Brio's identity as a member of a firm.
 *
 * ## What it is
 *
 * A chief of staff to the firm admin: it acts on the admin's authority, across the firm, and is a
 * known member rather than a hidden tool. One `firm_admin` row per firm is the real grant —
 * `checkProjectPermission` falls back to firm-level personas, so it reaches every client and
 * engagement without a row in each, which is what firm-level agentic work will need.
 *
 * ## Why a real auth account
 *
 * The first design used a reserved uuid with no auth record, on the reasoning that an account
 * which cannot be signed into is safer than one that can. An audit of what actually reads
 * membership killed that: roughly forty call sites assume a member is a person with an email, and
 * they do not merely resolve a name — they count members, populate assignee pickers, build
 * notification recipient lists and compute role distributions. A synthetic id breaks each one
 * differently, every new call site breaks by default, and a guard that is forgotten fails
 * silently.
 *
 * A real account keeps the invariant true instead of excepting it: Brio is a member with an email,
 * so those sites simply work.
 *
 * The cost is a credential-bearing row, and three things hold it shut:
 *
 * 1. The email is on a domain with no inbox, so a password reset cannot be received.
 * 2. The password is random, never stored, and never shown.
 * 3. `banned_until` is set far in the future, so Supabase refuses sign-in outright rather than
 *    relying on password strength alone.
 *
 * `isAgentUserId` remains the marker for the places that should still treat Brio differently —
 * notification recipients, assignee pickers — but it is now an opt-in exclusion rather than a
 * correctness requirement.
 */


/** Marks an auth account as an agent, readable from `user_metadata`. */
export const AGENT_METADATA_KEY = 'firma_agent'

export { isAgentEmail }

/**
 * How the agent is named wherever a person appears: the Audit tab, member lists, avatars.
 *
 * "Executive Assistant" rather than a product name, because every place this renders is a place
 * that otherwise names a colleague, and the question a reader is asking there is what ROLE acted,
 * not which feature. Chief of staff to the firm admin, which is also how its permissions are
 * modelled.
 */
export const AGENT_DISPLAY_NAME = 'Brio — Executive Assistant, PMO'

/** The address for a firm's agent. Stable, derived, and not routable. */
export function agentEmail(firmId: string): string {
    return `brio+${firmId}@${AGENT_EMAIL_DOMAIN}`
}


/**
 * Ids known to belong to agents, for the synchronous check below.
 *
 * A cache, not a source of truth: it is empty after a cold start and populated as agent accounts
 * are resolved. {@link isAgentUser} is the reliable check and takes the record itself.
 */
const knownAgentIds = new Set<string>()

/** Registers an id as an agent's, so {@link isAgentUserId} recognizes it. */
export function rememberAgentId(userId: string): void {
    knownAgentIds.add(userId)
}

/**
 * True when a resolved auth record belongs to an agent.
 *
 * The reliable check, because it reads the record rather than a process-local cache. Prefer it
 * anywhere the user has already been loaded.
 */
export function isAgentUser(user: { email?: string | null; user_metadata?: Record<string, unknown> | null } | null | undefined): boolean {
    if (!user) return false
    if (user.user_metadata?.[AGENT_METADATA_KEY] === true) return true
    return isAgentEmail(user.email)
}

/**
 * True when a user id is known to belong to an agent.
 *
 * Synchronous, so it suits recipient lists and pickers where a lookup per member would be the
 * wrong trade — but it answers from a cache that is empty until the process has resolved that
 * firm's agent. A false negative costs a notification row nobody reads, which is why the paths
 * that use it are the ones where that is the whole downside.
 *
 * Where a wrong answer would be user-visible, resolve the record and use {@link isAgentUser}.
 */
export function isAgentUserId(userId: string | null | undefined): boolean {
    return typeof userId === 'string' && knownAgentIds.has(userId)
}

/**
 * Finds or creates the agent account for a firm, returning its user id.
 *
 * Idempotent: an existing account is looked up by its derived address rather than recreated, so
 * this is safe to call on every firm creation and from the backfill.
 *
 * Returns null rather than throwing when provisioning fails — a firm must still be creatable when
 * the agent cannot be set up, and the feature degrades to unavailable rather than blocking signup.
 */
export async function ensureFirmAgentUser(firmId: string): Promise<string | null> {
    const email = agentEmail(firmId)
    const admin = createAdminClient()

    try {
        const existing = await findAgentByEmail(email)
        if (existing) {
            rememberAgentId(existing)
            // Accounts provisioned before a rename keep the name they were created with, and this
            // name is what renders in the Audit tab and member lists. Reconciled here rather than
            // in a migration so it converges without one, on whatever the current constant says.
            await reconcileAgentName(existing)
            return existing
        }

        const { data, error } = await admin.auth.admin.createUser({
            email,
            // Never stored and never shown. Sign-in is blocked by the ban below regardless, but a
            // guessable password should not be the thing standing between an attacker and a
            // firm_admin session if that ban is ever lifted by mistake.
            password: randomBytes(48).toString('base64url'),
            // Confirmed so the account is never routed into an email verification flow it cannot
            // complete — there is no inbox to receive the message.
            email_confirm: true,
            user_metadata: {
                full_name: AGENT_DISPLAY_NAME,
                [AGENT_METADATA_KEY]: true,
            },
        })

        if (error || !data?.user) {
            logger.error('Failed to provision firm agent account',
                new Error(error?.message ?? 'no user returned'), 'Agent', { firmId })
            return null
        }

        // Banned far out rather than for a fixed window: Supabase refuses sign-in for a banned
        // user outright, which is a stronger guarantee than password strength and survives a
        // future auth change that might otherwise open a path in.
        const { error: banError } = await admin.auth.admin.updateUserById(
            data.user.id, { ban_duration: '876000h' },
        )
        if (banError) {
            // The account exists and is now signable with a password nobody holds. That is still
            // weaker than intended, so it is deleted rather than left in place — a firm without
            // an agent is a missing feature, an unbanned one is a standing firm_admin credential.
            logger.error('Failed to ban firm agent account; removing it',
                new Error(banError.message), 'Agent', { firmId })
            await admin.auth.admin.deleteUser(data.user.id).catch(() => {})
            return null
        }

        rememberAgentId(data.user.id)
        return data.user.id
    } catch (error) {
        logger.error('Failed to provision firm agent account', error as Error, 'Agent', { firmId })
        return null
    }
}

/** Looks up an existing agent account id by its derived address. */
async function findAgentByEmail(email: string): Promise<string | null> {
    const { findAuthUserIdByEmail } = await import('@/lib/actions/auth-user-lookup')
    return findAuthUserIdByEmail(email)
}

/**
 * Brings an existing agent account's name in line with {@link AGENT_DISPLAY_NAME}.
 *
 * The displayed name is NOT this constant — it is `auth.users.user_metadata.full_name`, which every
 * member list, avatar and audit row resolves from (see `lib/actions/members.ts`). The constant only
 * seeds that field at provisioning, so changing it renames nothing that already exists.
 *
 * Reconciling on resolve rather than in a migration means the name converges wherever the agent is
 * actually used, needs no backfill run, and stays correct through any later rename.
 *
 * Writes only on a mismatch: this sits on the path of every agent operation, and an unconditional
 * update would mean an auth write per file change for no gain. Failure is logged and swallowed —
 * a stale display name must never fail the operation the agent was asked to perform.
 */
async function reconcileAgentName(userId: string): Promise<void> {
    try {
        const admin = createAdminClient()
        const { data } = await admin.auth.admin.getUserById(userId)
        const current = data?.user?.user_metadata?.full_name
        if (current === AGENT_DISPLAY_NAME) return

        await admin.auth.admin.updateUserById(userId, {
            // Merged, not replaced: `user_metadata` also carries the agent marker, and a bare
            // `{ full_name }` would drop it and with it every `isAgentUser` check.
            user_metadata: {
                ...(data?.user?.user_metadata ?? {}),
                full_name: AGENT_DISPLAY_NAME,
                [AGENT_METADATA_KEY]: true,
            },
        })
    } catch (error) {
        logger.warn(`[agent] could not reconcile display name: ${(error as Error).message}`)
    }
}
