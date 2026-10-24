/**
 * One place that answers "what is this person called?".
 *
 * Identity lives in Supabase `user_metadata`, which holds four name keys written by different
 * paths: signup and the profile form write `first_name` / `last_name` (and mirror them into
 * `full_name` / `name`), while an OAuth sign-in has GoTrue merge the provider's `identity_data`
 * on *every* sign-in — and Microsoft and Google supply `full_name` / `name` but never the split
 * pair. Reading one pair in one place and the other pair somewhere else is what made the Profile
 * page show "Deepak Shettigar" above fields reading "Deepak / Firmaone".
 *
 * So: what a person typed outranks what a login provider happened to send, and every caller walks
 * the same ladder.
 *
 *   1. `first_name` / `last_name`  — typed by the user, or seeded from the invite
 *   2. `full_name` / `name`        — supplied by the OAuth provider
 *   3. the email local part        — humanized, a guess, never stored
 *
 * Rung 3 is the steady state for invited users: invites carry no name of their own until the
 * inviter supplies one, and an invitee may use the app for weeks before finding the profile form.
 * A guess must stay *recognizably* a guess — persisting it would make "never set" indistinguishable
 * from "set", and we would lose both the signal to backfill from the provider on the next sign-in
 * and the signal to nudge. Callers read `authored` rather than re-deriving that from the string.
 */

/** Where the resolved name came from, strongest first. */
export type NameSource = 'user' | 'invite' | 'provider' | 'derived' | 'none'

/** Sources that represent a real name someone supplied, as opposed to one we inferred. */
const AUTHORED_SOURCES: readonly NameSource[] = ['user', 'invite', 'provider']

export type ResolvedNames = {
    firstName: string | null
    lastName: string | null
    /** The two above, joined — or '' when nothing at all is known. */
    displayName: string
    /** False when the name was inferred from the email and should not be trusted or stored. */
    authored: boolean
    source: NameSource
}

type Meta = Record<string, unknown> | null | undefined

function str(value: unknown): string {
    return typeof value === 'string' ? value.trim() : ''
}

/**
 * Turns an email local part into something presentable: `deepak.s.shettigar` -> `Deepak S
 * Shettigar`. Plus-addressing is dropped, separators become spaces, and a trailing run of digits
 * is trimmed off a token that starts with letters (`smith123` -> `Smith`) since those are almost
 * always disambiguators rather than part of a name.
 *
 * This is a guess and is only ever rendered — see the module note.
 */
export function humanizeEmailLocalPart(localPart: string): string {
    const withoutTag = localPart.split('+')[0]
    return withoutTag
        .split(/[._\-]+/)
        .map((token) => token.replace(/^([a-zA-Z]+)\d+$/, '$1'))
        .filter(Boolean)
        .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
        .join(' ')
        .trim()
}

/** Splits a full name so the surname keeps its remainder: "Mary Jane Watson" -> "Mary" + "Jane Watson". */
function splitFullName(full: string): { firstName: string; lastName: string | null } {
    const parts = full.split(/\s+/)
    if (parts.length === 1) return { firstName: parts[0], lastName: null }
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

/**
 * Resolves a person's name from their Supabase `user_metadata`, falling back to their email.
 *
 * `email` is optional so callers that genuinely have no address (a deleted user referenced by an
 * audit row) still get a well-formed result rather than having to special-case one.
 */
export function resolveNames(meta: Meta, email?: string | null): ResolvedNames {
    const m = meta ?? {}

    const first = str(m.first_name)
    const last = str(m.last_name)
    if (first || last) {
        const stored = str(m.name_source)
        // An explicit pair is the user's own unless it was seeded from an invite.
        const source: NameSource = stored === 'invite' ? 'invite' : 'user'
        return {
            firstName: first || null,
            lastName: last || null,
            displayName: [first, last].filter(Boolean).join(' '),
            authored: true,
            source,
        }
    }

    const full = str(m.full_name) || str(m.name)
    if (full) {
        const { firstName, lastName } = splitFullName(full)
        return { firstName, lastName, displayName: full, authored: true, source: 'provider' }
    }

    const localPart = str(email).split('@')[0]
    if (localPart) {
        const humanized = humanizeEmailLocalPart(localPart)
        if (humanized) {
            const { firstName, lastName } = splitFullName(humanized)
            return {
                firstName,
                lastName,
                displayName: humanized,
                authored: false,
                source: 'derived',
            }
        }
    }

    return { firstName: null, lastName: null, displayName: '', authored: false, source: 'none' }
}

/**
 * The single string to render for a person. Prefer this over reading `full_name` directly;
 * `resolveNames` is there when first and last are needed apart (form fields, initials).
 */
export function resolveDisplayName(meta: Meta, email?: string | null): string {
    return resolveNames(meta, email).displayName
}

/**
 * True when nobody has supplied this person's name and we are rendering a guess — the condition
 * for backfilling from an OAuth provider, and for prompting them to fill it in.
 */
export function needsName(meta: Meta): boolean {
    return !AUTHORED_SOURCES.includes(resolveNames(meta).source)
}
