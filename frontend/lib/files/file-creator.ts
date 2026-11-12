import type { FileCreator } from '@/lib/types'

/*
 * Who added a file, for the Files "Created by" column (Deepak, 2026-10-22).
 *
 * Anything added through the app — an upload, a new folder or doc, a link, an approved intake — goes
 * through the connector's Drive account, so Drive names that account as the owner of all of it. The
 * app records the member who actually added it (engagement_documents.createdBy); that comes first.
 * A file added straight in Drive has no such member, and there its Drive owner is who added it —
 * shown by their member name and photo when they're on the engagement. Never the last modifier:
 * that is someone's edit, not who added the file.
 */

export interface Person {
    email: string
    name: string
    avatarUrl: string | null
}

interface DriveOwner {
    displayName?: string | null
    emailAddress?: string | null
    photoLink?: string | null
}

export function creatorOf(
    createdBy: string | null | undefined,
    driveOwner: DriveOwner | null | undefined,
    people: Map<string, Person>,
    memberByEmail: Map<string, Person>,
): FileCreator | null {
    const added = createdBy ? people.get(createdBy) : undefined
    if (added) return { displayName: added.name, emailAddress: added.email, photoLink: added.avatarUrl, viaDrive: false }

    const email = driveOwner?.emailAddress?.trim() || null
    const name = driveOwner?.displayName?.trim() || null
    if (!email && !name) return null
    const member = email ? memberByEmail.get(email.toLowerCase()) : undefined
    return {
        displayName: member?.name ?? name ?? email!.split('@')[0],
        emailAddress: email,
        photoLink: member?.avatarUrl ?? driveOwner?.photoLink ?? null,
        viaDrive: true,
    }
}

/** Who a document is assigned to (settings.assigneeUserId), for the Files Assignee column and its filter. */
export function assigneeOf(settings: unknown, people: Map<string, Person>) {
    const id = (settings as { assigneeUserId?: unknown } | null)?.assigneeUserId
    if (typeof id !== 'string') return { assigneeUserId: null, assignee: null }
    const person = people.get(id)
    return {
        assigneeUserId: id,
        assignee: person ? { id, name: person.name, email: person.email, avatarUrl: person.avatarUrl } : null,
    }
}

/*
 * Who we already know, per running instance.
 *
 * loadPeople is one auth lookup per user, and it runs on every Files listing — for every creator in
 * the folder plus every member of the engagement — as well as on comments, support tickets and the
 * doc-comments route. Opening four folders in a row asked the auth service for the same dozen people
 * four times. A name or an avatar comes from the user's identity provider and effectively never
 * changes mid-session, so these are held briefly and shared across requests.
 *
 * A minute: long enough that a burst of navigation costs one lookup per person, short enough that a
 * changed profile photo appears without anyone wondering why it hasn't.
 *
 * A user we could not resolve is remembered as a miss for the same minute, so an id that is not an
 * account (a deleted user, a stale createdBy) doesn't mean a failed lookup on every listing.
 */
const PERSON_TTL_MS = 60_000
const personCache = new Map<string, { at: number; person: Person | null }>()

/** App profiles — email, name, photo — for these users, as the Members list shows them. */
export async function loadPeople(userIds: string[]): Promise<Map<string, Person>> {
    const people = new Map<string, Person>()
    const ids = Array.from(new Set(userIds.filter(Boolean)))
    if (ids.length === 0) return people

    const now = Date.now()
    const unknown: string[] = []
    for (const uid of ids) {
        const hit = personCache.get(uid)
        if (hit && now - hit.at < PERSON_TTL_MS) {
            if (hit.person) people.set(uid, hit.person)
        } else {
            unknown.push(uid)
        }
    }
    if (unknown.length === 0) return people

    const { createAdminClient } = await import('@/utils/supabase/admin')
    const { getAvatarUrlFromSupabaseUser } = await import('@/lib/supabase-user-helpers')
    const admin = createAdminClient()
    await Promise.all(unknown.map(async (uid) => {
        try {
            const { data: { user: u } } = await admin.auth.admin.getUserById(uid)
            if (!u?.email) {
                personCache.set(uid, { at: Date.now(), person: null })
                return
            }
            const meta = (u.user_metadata ?? {}) as Record<string, unknown>
            const name = (typeof meta.full_name === 'string' && meta.full_name.trim())
                || (typeof meta.name === 'string' && meta.name.trim())
                || u.email.split('@')[0]
            const person: Person = { email: u.email, name, avatarUrl: getAvatarUrlFromSupabaseUser(u) }
            personCache.set(uid, { at: Date.now(), person })
            people.set(uid, person)
        } catch {
            // An unknown user: the file falls back to its Drive owner. Not cached as a miss — a
            // lookup that threw may be a blip, and a tombstone would outlast it by a minute.
        }
    }))
    return people
}

/** Drops what loadPeople remembers. Tests only, so one case cannot leak people into the next. */
export function clearPersonCache(): void {
    personCache.clear()
}

/** The same people by lowercased email — to recognize a Drive owner who is on the engagement. */
export function byEmail(people: Map<string, Person>): Map<string, Person> {
    return new Map(Array.from(people.values()).map((p) => [p.email.toLowerCase(), p]))
}
