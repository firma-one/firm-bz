'use client'

import { failureFrom } from '@/lib/files/action-failure'

/**
 * One engagement's members, fetched once for everyone who asks.
 *
 * `/api/projects/{id}/members` is one auth lookup per member on the server, and the Files page used
 * to call it from two components that knew nothing about each other — the engagement header, for the
 * lead and the people stack, and the file list, for who a lead may assign from the Assignee column —
 * with the Details pane and the deliverable panel making a third and fourth call when they open. The
 * header kept a cache of its own that nobody else could read.
 *
 * So the list is cached here, by engagement, and concurrent askers share one request rather than
 * racing. The window is short: membership changes while someone is looking at the page, and a
 * picker offering someone who was just removed is worse than a second fetch.
 */
export type EngagementMember = {
    userId: string
    email: string
    name: string
    role: string
    avatarUrl: string | null
    isAgent: boolean
}

const TTL_MS = 30_000
const cache = new Map<string, { at: number; members: EngagementMember[] }>()
const inFlight = new Map<string, Promise<EngagementMember[]>>()

/** What's already known, for seeding initial state without waiting. Null when nothing is cached. */
export function cachedEngagementMembers(projectId: string): EngagementMember[] | null {
    const hit = cache.get(projectId)
    if (!hit) return null
    return Date.now() - hit.at < TTL_MS ? hit.members : null
}

/**
 * The engagement's members. Throws the server's own reason when the list didn't load, so a caller
 * can say why rather than showing an empty engagement.
 */
export function loadEngagementMembers(
    projectId: string,
    opts?: { force?: boolean },
): Promise<EngagementMember[]> {
    if (!opts?.force) {
        const hit = cachedEngagementMembers(projectId)
        if (hit) return Promise.resolve(hit)
        const pending = inFlight.get(projectId)
        if (pending) return pending
    }

    const request = fetch(`/api/projects/${projectId}/members`, { credentials: 'include' })
        .then(async (res) => {
            if (!res.ok) throw await failureFrom(res)
            const body = await res.json() as { members?: EngagementMember[] }
            const members = body.members ?? []
            cache.set(projectId, { at: Date.now(), members })
            return members
        })
        .finally(() => {
            // Only clear our own entry: a forced refetch that started later owns the slot now.
            if (inFlight.get(projectId) === request) inFlight.delete(projectId)
        })

    inFlight.set(projectId, request)
    return request
}

/** Forget one engagement's members, or all of them — after a membership change. */
export function forgetEngagementMembers(projectId?: string): void {
    if (projectId) {
        cache.delete(projectId)
        inFlight.delete(projectId)
        return
    }
    cache.clear()
    inFlight.clear()
}
