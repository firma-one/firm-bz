import { logger } from '@/lib/logger'
import { resolveNames } from '@/lib/auth/display-name'

/**
 * Keeps the four name keys in `user_metadata` from drifting apart across sign-ins.
 *
 * GoTrue merges an OAuth provider's `identity_data` into `user_metadata` on *every* sign-in, and
 * Microsoft and Google send `full_name` / `name` but never `first_name` / `last_name`. Left alone
 * that pulls the two halves of the same identity apart: the profile form keeps showing what the
 * user typed while every other surface shows what the provider last sent.
 *
 * Run once per sign-in, this closes both directions:
 *
 *   - the user has typed a name   -> mirror it back over whatever the provider just wrote
 *   - the user has not            -> seed the split pair from the provider's name
 *
 * The second case is what spares an invited user from being rendered as their email local part
 * until they happen to find the profile form.
 *
 * Best-effort by design: a failure here must never cost someone their sign-in, so the caller gets
 * a resolved promise either way and the reason is logged.
 */

type MinimalUser = { id: string; user_metadata?: Record<string, unknown> | null }

type MetadataWriter = {
    auth: {
        updateUser: (attributes: { data: Record<string, unknown> }) => Promise<{ error: { message: string } | null }>
    }
}

/**
 * Works out the metadata patch a sign-in needs, or null when the keys already agree.
 *
 * Split from the write so the precedence is testable without a Supabase client.
 */
export function planNameReconciliation(
    meta: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
    const m = meta ?? {}
    const resolved = resolveNames(m)

    if (resolved.source === 'user' || resolved.source === 'invite') {
        // Authored name wins. Re-assert it over the mirrored keys if the provider moved them.
        const fullName = resolved.displayName
        const currentFull = typeof m.full_name === 'string' ? m.full_name.trim() : ''
        const currentName = typeof m.name === 'string' ? m.name.trim() : ''
        if (!fullName || (currentFull === fullName && currentName === fullName)) return null
        return { full_name: fullName, name: fullName }
    }

    if (resolved.source === 'provider') {
        // Only the provider has a name — adopt it as the split pair so every surface agrees.
        return {
            first_name: resolved.firstName ?? '',
            last_name: resolved.lastName ?? '',
            name_source: 'provider',
        }
    }

    // 'derived' / 'none': nothing authored to store. Rendering falls back to the email, and
    // `needsName` stays true so we keep prompting and keep accepting a later provider name.
    return null
}

export async function reconcileUserNames(user: MinimalUser, client: MetadataWriter): Promise<void> {
    const existing = (user.user_metadata ?? {}) as Record<string, unknown>
    const patch = planNameReconciliation(existing)
    if (!patch) return

    try {
        const { error } = await client.auth.updateUser({ data: { ...existing, ...patch } })
        if (error) {
            logger.warn('[auth] Failed to reconcile name metadata on signin (best-effort)', {
                userId: user.id,
                message: error.message,
            })
        }
    } catch (e) {
        logger.warn('[auth] Failed to reconcile name metadata on signin (best-effort)', {
            userId: user.id,
            message: e instanceof Error ? e.message : String(e),
        })
    }
}
