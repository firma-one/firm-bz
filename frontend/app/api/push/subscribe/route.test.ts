import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, auth } = vi.hoisted(() => ({
    auth: { user: { id: 'u1' } as { id: string } | null },
    prisma: {
        $executeRaw: vi.fn(),
        userPersonalization: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    },
}))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: auth.user } }) } }) }))
vi.mock('@/lib/prisma', () => ({ prisma }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { POST, DELETE } from './route'

const req = (method: string, body: unknown) =>
    new NextRequest('http://localhost/api/push/subscribe', { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
const SUB = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } }

beforeEach(() => {
    vi.clearAllMocks()
    auth.user = { id: 'u1' }
    prisma.userPersonalization.findUnique.mockResolvedValue({ pushSubscriptions: [] })
})

describe('/api/push/subscribe (OT-1, P2-29)', () => {
    it('stores a subscription', async () => {
        const res = await POST(req('POST', SUB))
        expect(res.status).toBe(200)
        expect(prisma.userPersonalization.upsert).toHaveBeenCalled()
    })

    it('answers in words when the session has ended, or the save fails', async () => {
        auth.user = null
        const signedOut = await POST(req('POST', SUB))
        expect(signedOut.status).toBe(401)
        expect((await signedOut.json()).error).toBe('Your session has ended. Sign in again.')

        auth.user = { id: 'u1' }
        prisma.userPersonalization.upsert.mockRejectedValueOnce(new Error('timeout'))
        const failed = await POST(req('POST', SUB))
        expect(failed.status).toBe(500)
        expect((await failed.json()).error).toBe('Something went wrong on our side. Try again.')

        prisma.userPersonalization.findUnique.mockRejectedValueOnce(new Error('timeout'))
        const notRemoved = await DELETE(req('DELETE', { endpoint: SUB.endpoint }))
        expect(notRemoved.status).toBe(500)
    })
})
