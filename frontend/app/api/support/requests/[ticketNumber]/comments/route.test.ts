import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { who, db, notify } = vi.hoisted(() => ({
    who: { user: { id: 'staff', email: 'staff@firma.bz', user_metadata: { full_name: 'Firma Staff' } } as any },
    db: { ticket: null as any, memberOfFirm: false, firmAdmin: false },
    notify: { email: vi.fn(async () => {}), inbox: vi.fn(async () => {}) },
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: who.user } }) } }),
}))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        customerRequest: { findUnique: vi.fn(async () => db.ticket), update: vi.fn(async () => ({})) },
        firmMember: {
            findFirst: vi.fn(async ({ where }: any) => (where.role === 'firm_admin' ? (db.firmAdmin ? { id: 'a' } : null) : db.memberOfFirm ? { id: 'm' } : null)),
        },
        firm: { findUnique: vi.fn(async () => ({ slug: 'acme' })) },
    },
}))
vi.mock('@/lib/notify-event', () => ({
    buildAbsoluteUrl: (p: string | null) => (p ? `https://app.example${p}` : null),
    sendEventEmailToUser: notify.email,
    createEventNotifications: notify.inbox,
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
vi.mock('@/lib/files/file-creator', () => ({ loadPeople: vi.fn(async () => new Map()) }))

import { POST } from './route'

const post = (content: string) =>
    POST(new Request('http://x/api/support/requests/TKT-1/comments', { method: 'POST', body: JSON.stringify({ content }) }) as any, { params: Promise.resolve({ ticketNumber: 'TKT-1' }) })

beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('SYSTEM_ADMIN_EMAILS', 'staff@firma.bz')
    who.user = { id: 'staff', email: 'staff@firma.bz', user_metadata: { full_name: 'Firma Staff' } }
    db.ticket = { id: 't', comments: [], userId: 'raiser', firmId: 'f1', description: 'Upload fails\nmore' }
    db.memberOfFirm = false
    db.firmAdmin = false
})
afterEach(() => vi.unstubAllEnvs())

describe('POST /api/support/requests/[ticketNumber]/comments', () => {
    it('lets the Firma team reply to any firm’s request, and tells whoever raised it', async () => {
        const res = await post('We can reproduce it.')
        expect(res.status).toBe(200)
        expect((await res.json()).comment.fromFirma).toBe(true)
        expect(notify.email).toHaveBeenCalledWith('raiser', expect.any(Function))
        const [rows] = notify.inbox.mock.calls[0] as unknown as [any[]]
        expect(rows[0]).toMatchObject({ userId: 'raiser', type: 'SUPPORT_REPLY', title: 'Firma replied: Upload fails', ctaUrl: '/d/support?firmSlug=acme&ticket=TKT-1' })
    })

    it('treats a team member who is in the request’s firm as the firm, and tells no one', async () => {
        db.memberOfFirm = true
        db.firmAdmin = true
        const res = await post('Adding a screenshot.')
        expect((await res.json()).comment.fromFirma).toBe(false)
        expect(notify.email).not.toHaveBeenCalled()
        expect(notify.inbox).not.toHaveBeenCalled()
    })

    it('keeps out someone who is neither the requester, a firm admin, nor on the team', async () => {
        who.user = { id: 'x', email: 'x@else.com', user_metadata: {} }
        expect((await post('hi')).status).toBe(403)
    })
})
