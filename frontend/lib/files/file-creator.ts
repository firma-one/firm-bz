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

/** App profiles — email, name, photo — for these users, as the Members list shows them. */
export async function loadPeople(userIds: string[]): Promise<Map<string, Person>> {
    const people = new Map<string, Person>()
    const ids = Array.from(new Set(userIds.filter(Boolean)))
    if (ids.length === 0) return people
    const { createAdminClient } = await import('@/utils/supabase/admin')
    const { getAvatarUrlFromSupabaseUser } = await import('@/lib/supabase-user-helpers')
    const admin = createAdminClient()
    await Promise.all(ids.map(async (uid) => {
        try {
            const { data: { user: u } } = await admin.auth.admin.getUserById(uid)
            if (!u?.email) return
            const meta = (u.user_metadata ?? {}) as Record<string, unknown>
            const name = (typeof meta.full_name === 'string' && meta.full_name.trim())
                || (typeof meta.name === 'string' && meta.name.trim())
                || u.email.split('@')[0]
            people.set(uid, { email: u.email, name, avatarUrl: getAvatarUrlFromSupabaseUser(u) })
        } catch {
            // An unknown user: the file falls back to its Drive owner
        }
    }))
    return people
}

/** The same people by lowercased email — to recognize a Drive owner who is on the engagement. */
export function byEmail(people: Map<string, Person>): Map<string, Person> {
    return new Map(Array.from(people.values()).map((p) => [p.email.toLowerCase(), p]))
}
