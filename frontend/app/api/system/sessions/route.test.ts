// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { auth, sessions, admins } = vi.hoisted(() => ({
    auth: { user: null as { id: string } | null },
    sessions: { endAllSessions: vi.fn(), endUserSessions: vi.fn() },
    admins: new Set<string>(),
}))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: auth.user } }) } }) }))
vi.mock('@/lib/system/user-data-map', () => ({ isSysAdminUser: async (id: string) => admins.has(id) }))
vi.mock('@/lib/auth/sessions', () => sessions)

import { DELETE as signOutEveryone } from './route'
import { DELETE as signOutMyDevices } from '../../account/sessions/route'

beforeEach(() => {
    auth.user = null
    admins.clear()
    sessions.endAllSessions.mockReset().mockResolvedValue(7)
    sessions.endUserSessions.mockReset().mockResolvedValue(2)
})

describe('DELETE /api/system/sessions — Sign out everyone', () => {
    it('refuses the signed-out and non-admins, ending nothing', async () => {
        expect((await signOutEveryone()).status).toBe(401)
        auth.user = { id: 'pat' }
        expect((await signOutEveryone()).status).toBe(403)
        expect(sessions.endAllSessions).not.toHaveBeenCalled()
    })

    it("ends everyone's sessions but the admin's and reports the count", async () => {
        auth.user = { id: 'root' }
        admins.add('root')
        const res = await signOutEveryone()
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ended: 7 })
        expect(sessions.endAllSessions).toHaveBeenCalledWith({ exceptUserId: 'root' })
    })

    it('a database refusal comes back as an error with its reason', async () => {
        auth.user = { id: 'root' }
        admins.add('root')
        sessions.endAllSessions.mockRejectedValue(new Error('permission denied for table sessions'))
        const res = await signOutEveryone()
        expect(res.status).toBe(500)
        expect((await res.json()).error).toContain('permission denied')
    })
})

describe('DELETE /api/account/sessions — Sign out of all devices', () => {
    it('needs a sign-in', async () => {
        expect((await signOutMyDevices()).status).toBe(401)
        expect(sessions.endUserSessions).not.toHaveBeenCalled()
    })

    it("ends only the caller's own sessions", async () => {
        auth.user = { id: 'pat' }
        const res = await signOutMyDevices()
        expect(res.status).toBe(200)
        expect(sessions.endUserSessions).toHaveBeenCalledWith('pat')
        expect(sessions.endAllSessions).not.toHaveBeenCalled()
    })
})
