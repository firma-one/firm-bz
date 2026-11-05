// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { listUsers } = vi.hoisted(() => ({ listUsers: vi.fn() }))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: () => ({ auth: { admin: { listUsers } } }) }))

import { listMailableAuthUsers } from './auth-users'

const person = (email: string | undefined, extra: Record<string, unknown> = {}) => ({
    id: `id-${email}`,
    email,
    user_metadata: { first_name: 'Pat', last_name: 'Lee' },
    created_at: '2026-10-01T00:00:00Z',
    last_sign_in_at: '2026-11-01T00:00:00Z',
    ...extra,
})

beforeEach(() => listUsers.mockReset())

describe('listMailableAuthUsers', () => {
    it('sorts by address and carries what the page shows', async () => {
        listUsers.mockResolvedValue({ data: { users: [person('z@x.com'), person('a@x.com', { last_sign_in_at: null })] }, error: null })
        const users = await listMailableAuthUsers()
        expect(users.map((u) => u.email)).toEqual(['a@x.com', 'z@x.com'])
        expect(users[0]).toMatchObject({ firstName: 'Pat', lastName: 'Lee', lastSignInAt: null })
    })

    it('leaves out accounts nobody can reach: no address, banned, or Brio’s agents', async () => {
        const future = new Date(Date.now() + 86_400_000).toISOString()
        listUsers.mockResolvedValue({
            data: { users: [person('keep@x.com'), person(undefined), person('banned@x.com', { banned_until: future }), person('brio-1@agents.firma.bz')] },
            error: null,
        })
        expect((await listMailableAuthUsers()).map((u) => u.email)).toEqual(['keep@x.com'])
    })

    it('keeps someone whose ban has ended', async () => {
        const past = new Date(Date.now() - 86_400_000).toISOString()
        listUsers.mockResolvedValue({ data: { users: [person('back@x.com', { banned_until: past })] }, error: null })
        expect((await listMailableAuthUsers()).map((u) => u.email)).toEqual(['back@x.com'])
    })

    it('reads every page, so nobody goes missing from a select all', async () => {
        const fullPage = Array.from({ length: 200 }, (_, i) => person(`p${i}@x.com`))
        listUsers
            .mockResolvedValueOnce({ data: { users: fullPage }, error: null })
            .mockResolvedValueOnce({ data: { users: fullPage.map((u) => ({ ...u, email: `q${u.email}` })) }, error: null })
            .mockResolvedValueOnce({ data: { users: [person('last@x.com')] }, error: null })
        expect(await listMailableAuthUsers()).toHaveLength(401)
        expect(listUsers).toHaveBeenCalledTimes(3)
    })

    it('throws rather than passing a partial list off as the whole audience', async () => {
        listUsers
            .mockResolvedValueOnce({ data: { users: Array.from({ length: 200 }, (_, i) => person(`p${i}@x.com`)) }, error: null })
            .mockResolvedValueOnce({ data: null, error: { message: 'rate limited' } })
        await expect(listMailableAuthUsers()).rejects.toThrow('rate limited')
    })
})
