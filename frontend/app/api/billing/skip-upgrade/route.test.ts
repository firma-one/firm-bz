import { describe, it, expect, vi, beforeEach } from 'vitest'

/** P2-48: "Skip for now" saves, on the person's default firm (there is no sandbox firm any more). */

const { db } = vi.hoisted(() => ({
    db: {
        membership: { firmId: 'f1', role: 'firm_admin', firm: { settings: { onboarding: { stage: 'x' } } } } as any,
        update: vi.fn(async (_: unknown) => ({})),
    },
}))

vi.mock('@/lib/prisma', () => ({
    prisma: { firmMember: { findFirst: vi.fn(async () => db.membership) }, firm: { update: db.update } },
}))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) } }) }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))

import { POST } from './route'

beforeEach(() => {
    vi.clearAllMocks()
    db.membership = { firmId: 'f1', role: 'firm_admin', firm: { settings: { onboarding: { stage: 'x' } } } }
})

describe('POST /api/billing/skip-upgrade', () => {
    it("saves the skip on the default firm's settings, keeping the rest", async () => {
        const res = await POST()
        expect(res.status).toBe(200)
        const arg = db.update.mock.calls[0][0] as any
        expect(arg.where).toEqual({ id: 'f1' })
        expect(arg.data.settings.onboarding.stage).toBe('x')
        expect(arg.data.settings.onboarding.subscription.paidPlan).toBe('skipped')
    })

    it('refuses someone who is not a firm admin, with words', async () => {
        db.membership = { ...db.membership, role: 'firm_member' }
        const res = await POST()
        expect(res.status).toBe(403)
        expect((await res.json()).error).toMatch(/firm admin/)
    })

    it('says why when the save fails', async () => {
        db.update.mockRejectedValueOnce(new Error('db down'))
        const res = await POST()
        expect(res.status).toBe(500)
        expect((await res.json()).error).toMatch(/Couldn't save/)
    })
})
