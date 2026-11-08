import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Emailing the health report answers what the sends really did (OT-3): "Sent to 3 of 5. Couldn't
 * reach Ana, Raj.", nothing sent is an error, and a missing mail setup is an error, never a tick.
 */

const { st, sendEmail } = vi.hoisted(() => ({
    st: {
        members: [] as { userId: string }[],
        users: {} as Record<string, { email: string; user_metadata?: Record<string, unknown> } | null>,
    },
    sendEmail: vi.fn(),
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }),
}))
vi.mock('@/utils/supabase/admin', () => ({
    createAdminClient: () => ({
        auth: { admin: { getUserById: async (id: string) => {
            if (st.users[id] === undefined) throw new Error('lookup failed')
            return { data: { user: st.users[id] } }
        } } },
    }),
}))
vi.mock('@/lib/resolve-project-context', () => ({ resolveProjectContext: async () => ({ orgId: 'f1', clientId: 'c1', projectId: 'p1' }) }))
vi.mock('@/lib/permission-helpers', () => ({ canViewProjectSettings: async () => true }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/email', () => ({ sendEmail }))
vi.mock('@/lib/email-templates/base', () => ({
    renderEmail: () => '<html>', ctaButton: () => '', detailCard: () => '', emailFootnote: () => '', emailHeading: () => '', escHtml: (s: string) => s,
}))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagement: { findUnique: async () => ({ name: 'Audit' }) },
        engagementMember: { findMany: async () => st.members },
    },
}))

import { POST } from './route'

const post = () => POST(
    new NextRequest('http://localhost/api/projects/p1/insights/share-report', { method: 'POST', body: JSON.stringify({ pdfBase64: 'JVBERi0=' }) }),
    { params: Promise.resolve({ projectId: 'p1' }) },
)

const person = (email: string, full_name: string) => ({ email, user_metadata: { full_name } })

const savedSmtp = process.env.SMTP_HOST
beforeEach(() => {
    process.env.SMTP_HOST = 'smtp.test'
    sendEmail.mockReset()
    st.members = [{ userId: 'a' }, { userId: 'b' }, { userId: 'c' }, { userId: 'd' }, { userId: 'e' }]
    st.users = {
        a: person('ana@x.com', 'Ana Silva'), b: person('raj@x.com', 'Raj Patel'), c: person('lee@x.com', 'Lee Wong'),
        d: person('kim@x.com', 'Kim Park'), e: person('sam@x.com', 'Sam Ode'),
    }
})
afterEach(() => { process.env.SMTP_HOST = savedSmtp })

describe('share-report POST', () => {
    it('answers how many were reached and who was not, from the real send results', async () => {
        sendEmail.mockImplementation(async (to: string) => {
            if (to === 'ana@x.com' || to === 'raj@x.com') throw new Error('550 mailbox unavailable')
            return { messageId: 'm' }
        })
        const res = await post()
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ sent: 3, total: 5, failed: ['Ana Silva', 'Raj Patel'] })
    })

    it('counts a member whose address could not be read as not reached', async () => {
        sendEmail.mockResolvedValue({ messageId: 'm' })
        delete (st.users as Record<string, unknown>).e
        const res = await post()
        expect(await res.json()).toEqual({ sent: 4, total: 5, failed: [] })
    })

    it('is an error when nothing was sent, naming who it could not reach', async () => {
        st.members = [{ userId: 'a' }, { userId: 'b' }]
        sendEmail.mockRejectedValue(new Error('connection refused'))
        const res = await post()
        expect(res.status).toBe(502)
        const body = await res.json()
        expect(body.error).toBe("Couldn't reach Ana Silva and Raj Patel.")
        expect(body.sent).toBe(0)
    })

    it('is an error, not a tick, when email is not set up', async () => {
        delete process.env.SMTP_HOST
        const res = await post()
        expect(res.status).toBe(503)
        expect((await res.json()).error).toBe("Email isn't set up, so the report wasn't sent.")
        expect(sendEmail).not.toHaveBeenCalled()
    })

    it('treats a send that returned nothing as not sent', async () => {
        st.members = [{ userId: 'a' }]
        sendEmail.mockResolvedValue(undefined)
        const res = await post()
        expect(res.status).toBe(502)
    })

    it('says there is no one to send it to on an engagement with no members', async () => {
        st.members = []
        const res = await post()
        expect(res.status).toBe(400)
        expect((await res.json()).code).toBe('no_recipients')
    })
})
