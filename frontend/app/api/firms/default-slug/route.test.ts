import { describe, it, expect, vi } from 'vitest'

/** P2-54: a failed lookup answers an error, not a 200 "onboarding not complete". */

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) } }),
}))
vi.mock('@/lib/firm-service', () => ({ FirmService: { getDefaultFirm: vi.fn(async () => { throw new Error('db down') }) } }))

import { GET } from './route'

describe('GET /api/firms/default-slug', () => {
    it('answers 500 with words when the lookup fails', async () => {
        const res = await GET()
        expect(res.status).toBe(500)
        expect((await res.json()).error).toMatch(/Couldn't load your workspace/)
    })
})
