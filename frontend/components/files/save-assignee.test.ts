import { describe, it, expect, vi, afterEach } from 'vitest'

// saveAssignee never throws (P1-65): every caller reads `ok`, so a dropped request answers its reason.

vi.mock('@/lib/supabase', () => ({ getSession: async () => ({ access_token: 't' }) }))

import { saveAssignee } from './save-assignee'

afterEach(() => vi.unstubAllGlobals())

describe('saveAssignee', () => {
    it('answers ok when saved', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
        expect(await saveAssignee('p', 'd', 'u1')).toEqual({ ok: true })
    })

    it("answers the route's words", async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: "That person isn't a member of this engagement any more. Refresh to see who is." }) })))
        expect(await saveAssignee('p', 'd', 'u1')).toEqual({ ok: false, error: "That person isn't a member of this engagement any more. Refresh to see who is." })
    })

    it('answers the status when the route said nothing', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
        expect(await saveAssignee('p', 'd', null)).toEqual({ ok: false, error: 'The server answered 500. Try again.' })
    })

    it('answers that it never got there, instead of throwing', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
        expect(await saveAssignee('p', 'd', null)).toEqual({ ok: false, error: "Couldn't reach firma. Check your connection and try again." })
    })
})
