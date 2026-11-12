import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/*
 * loadPeople is one auth lookup per user and it runs on every Files listing — every creator in the
 * folder plus every member of the engagement — as well as on comments, support tickets and the
 * doc-comments route. Opening four folders in a row asked for the same dozen people four times.
 */

const getUserById = vi.hoisted(() => vi.fn())

vi.mock('@/utils/supabase/admin', () => ({
    createAdminClient: () => ({ auth: { admin: { getUserById } } }),
}))
vi.mock('@/lib/supabase-user-helpers', () => ({ getAvatarUrlFromSupabaseUser: () => null }))

import { loadPeople, clearPersonCache } from './file-creator'

const user = (id: string) => ({
    data: { user: { id, email: `${id}@firm.test`, user_metadata: { full_name: `Name ${id}` } } },
})

beforeEach(() => {
    clearPersonCache()
    getUserById.mockReset()
    getUserById.mockImplementation(async (id: string) => user(id))
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
    clearPersonCache()
})

describe('loadPeople', () => {
    it('looks a person up once across calls', async () => {
        await loadPeople(['u1', 'u2'])
        await loadPeople(['u1', 'u2'])
        expect(getUserById).toHaveBeenCalledTimes(2)
    })

    it('asks only for the people it does not have yet', async () => {
        await loadPeople(['u1'])
        getUserById.mockClear()
        const people = await loadPeople(['u1', 'u2'])
        expect(getUserById).toHaveBeenCalledTimes(1)
        expect(getUserById).toHaveBeenCalledWith('u2')
        // The cached one is still in the answer, not just the one just fetched.
        expect(people.get('u1')?.name).toBe('Name u1')
        expect(people.get('u2')?.name).toBe('Name u2')
    })

    it('asks again once the minute is up', async () => {
        await loadPeople(['u1'])
        vi.advanceTimersByTime(61_000)
        await loadPeople(['u1'])
        expect(getUserById).toHaveBeenCalledTimes(2)
    })

    it('remembers an id that is not an account, so it is not looked up on every listing', async () => {
        getUserById.mockImplementation(async () => ({ data: { user: null } }))
        const first = await loadPeople(['gone'])
        const second = await loadPeople(['gone'])
        expect(getUserById).toHaveBeenCalledTimes(1)
        expect(first.has('gone')).toBe(false)
        expect(second.has('gone')).toBe(false)
    })

    it('does not remember a lookup that threw — that may be a blip', async () => {
        getUserById.mockRejectedValueOnce(new Error('network'))
        await loadPeople(['u1'])
        const people = await loadPeople(['u1'])
        expect(getUserById).toHaveBeenCalledTimes(2)
        expect(people.get('u1')?.name).toBe('Name u1')
    })

    it('reaches for nothing when given no ids', async () => {
        const people = await loadPeople([])
        expect(people.size).toBe(0)
        expect(getUserById).not.toHaveBeenCalled()
    })
})
