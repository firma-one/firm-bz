import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/** The deletion request says why it failed, and a failed check is a failure, not "no open request". */

const { findFirst, submitErrorTicket, sendEmail } = vi.hoisted(() => ({
    findFirst: vi.fn(),
    submitErrorTicket: vi.fn(),
    sendEmail: vi.fn(async () => {}),
}))
vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'pat@acme.test' } } }) } }),
}))
vi.mock('@/lib/prisma', () => ({ prisma: { customerRequest: { findFirst } } }))
vi.mock('@/app/actions/submit-ticket', () => ({ submitErrorTicket }))
vi.mock('@/lib/email', () => ({ sendEmail }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))

import { GET, POST } from './route'

beforeEach(() => {
    findFirst.mockReset()
    submitErrorTicket.mockReset()
    sendEmail.mockClear()
})

describe('/api/account/deletion-request', () => {
    it('GET: a failed read answers a failure, not { open: null }', async () => {
        findFirst.mockRejectedValue(new Error('db down'))
        const res = await GET()
        expect(res.status).toBe(500)
        expect((await res.json()).error).toBe("Couldn't check for an earlier request.")
    })

    it('POST: a request the action couldn’t save says so, in plain words', async () => {
        findFirst.mockResolvedValue(null)
        submitErrorTicket.mockResolvedValue({ success: false, message: 'Failed to submit ticket' })
        const res = await POST(new NextRequest('http://localhost/api/account/deletion-request', { method: 'POST' }))
        expect(res.status).toBe(500)
        expect((await res.json()).error).toBe("It wasn't saved on our side, so nothing was requested. Try again, or email support@firmaone.com.")
        expect(sendEmail).not.toHaveBeenCalled()
    })

    it('POST: the team is emailed before the answer, and a mail failure doesn’t fail the request', async () => {
        findFirst.mockResolvedValue(null)
        submitErrorTicket.mockResolvedValue({ success: true, message: 'ok', ticketNumber: 'TKT-7' })
        sendEmail.mockRejectedValueOnce(new Error('SMTP down') as never)
        const res = await POST(new NextRequest('http://localhost/api/account/deletion-request', { method: 'POST' }))
        expect(res.status).toBe(200)
        expect((await res.json()).data.ticketNumber).toBe('TKT-7')
        expect(sendEmail).toHaveBeenCalledTimes(1)
    })
})
