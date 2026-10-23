/**
 * The name an inviter supplies on an invitation, and how it reaches the invitee's account.
 *
 * An invite used to carry an email and nothing else, so an invited user had no name of their own
 * until they found the profile form — which can be weeks, since nothing in the app asks them to.
 * A firm inviting a client contact almost always knows who that person is, so letting the inviter
 * say so is the one point where the name can be right from the very first render.
 *
 * This is weaker than a name the person typed themselves: it is stamped `name_source: 'invite'`,
 * and `lib/auth/display-name` keeps a later profile edit above it.
 */

export type InviteeName = {
    firstName?: string | null
    lastName?: string | null
}

/** Mirrors the profile form's cap, so an invite cannot store a name the owner could not re-save. */
const MAX_NAME_LEN = 80

export type NormalizedInviteeName = { firstName: string | null; lastName: string | null }

/**
 * Trims and bounds the pair, returning null when the inviter supplied nothing usable — the common
 * case, since the fields are optional.
 */
export function normalizeInviteeName(name?: InviteeName | null): NormalizedInviteeName | null {
    const first = (name?.firstName ?? '').trim().slice(0, MAX_NAME_LEN)
    const last = (name?.lastName ?? '').trim().slice(0, MAX_NAME_LEN)
    if (!first && !last) return null
    return { firstName: first || null, lastName: last || null }
}

/**
 * The `user_metadata` patch that seeds an invited name onto a Supabase account.
 *
 * Writes all four name keys the way signup and the profile form do, so no surface is left reading
 * a stale `full_name`, and marks the provenance so a later profile edit outranks it.
 */
export function inviteeNameMetadata(name?: InviteeName | null): Record<string, unknown> | null {
    const normalized = normalizeInviteeName(name)
    if (!normalized) return null

    const fullName = [normalized.firstName, normalized.lastName].filter(Boolean).join(' ')
    return {
        first_name: normalized.firstName ?? '',
        last_name: normalized.lastName ?? '',
        full_name: fullName,
        name: fullName,
        name_source: 'invite',
    }
}
