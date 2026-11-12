import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/*
 * One engagement's members, fetched once for everyone who asks.
 *
 * The Files page used to call /api/projects/{id}/members from two components that knew nothing
 * about each other, with the Details pane and the deliverable panel making a third and fourth call
 * when they opened. Each call is one auth lookup per member on the server.
 */

import {
    loadEngagementMembers,
    cachedEngagementMembers,
    forgetEngagementMembers,
} from './engagement-members'

const MEMBERS = [
    { userId: 'u1', email: 'lead@firm.test', name: 'Lead', role: 'eng_admin', avatarUrl: null, isAgent: false },
    { userId: 'u2', email: 'brio@firm.test', name: 'Brio', role: 'eng_member', avatarUrl: null, isAgent: true },
]

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
    forgetEngagementMembers()
    fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ members: MEMBERS }) }))
    vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
    vi.unstubAllGlobals()
    forgetEngagementMembers()
})

describe('loadEngagementMembers', () => {
    it('asks the server once for callers that overlap in time', async () => {
        const [a, b, c] = await Promise.all([
            loadEngagementMembers('e1'),
            loadEngagementMembers('e1'),
            loadEngagementMembers('e1'),
        ])
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(a).toEqual(MEMBERS)
        expect(b).toBe(a)
        expect(c).toBe(a)
    })

    it('answers a later caller from the cache', async () => {
        await loadEngagementMembers('e1')
        await loadEngagementMembers('e1')
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('keeps engagements apart', async () => {
        await Promise.all([loadEngagementMembers('e1'), loadEngagementMembers('e2')])
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('refetches on force, and on being forgotten', async () => {
        await loadEngagementMembers('e1')
        await loadEngagementMembers('e1', { force: true })
        expect(fetchMock).toHaveBeenCalledTimes(2)
        forgetEngagementMembers('e1')
        await loadEngagementMembers('e1')
        expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('throws the server\'s reason, and caches nothing', async () => {
        fetchMock.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: 'Forbidden' }) })
        await expect(loadEngagementMembers('e1')).rejects.toBeTruthy()
        expect(cachedEngagementMembers('e1')).toBeNull()
        // A failure must not poison the slot: the next caller gets to try.
        await loadEngagementMembers('e1')
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('has nothing cached until something has loaded', async () => {
        expect(cachedEngagementMembers('e1')).toBeNull()
        await loadEngagementMembers('e1')
        expect(cachedEngagementMembers('e1')).toEqual(MEMBERS)
    })
})
