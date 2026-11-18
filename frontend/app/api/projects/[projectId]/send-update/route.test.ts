import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Emailing the published update (.claude/plans/publish-and-send-update.md): a Lead only, the
 * published text only (never one from the request), to people on the engagement and to addresses
 * typed in. Email, notifications and the database are mocked.
 */

const st = vi.hoisted(() => ({
    lead: true,
    completed: false,
    summary: { text: '## Summary\nOn track.\n\n## Risks\nQSR-9 is late.', publishedAt: '2026-11-17T10:00:00Z', publishedByUserId: 'lead', source: 'ai' } as Record<string, unknown>,
    statusUpdates: [] as unknown[],
}))
const { update, notify, sendEmail } = vi.hoisted(() => ({
    update: vi.fn(async () => ({})),
    notify: vi.fn(async () => {}),
    sendEmail: vi.fn(async () => ({ messageId: 'm1' })),
}))

const PEOPLE = [
    { userId: 'dana', name: 'Dana Whitfield', role: 'Reviewer', email: 'dana@client.com' },
    { userId: 'sam', name: 'Sam Patel', role: 'Contributor · Full Access', email: 'sam@firm.co' },
    { userId: 'lead', name: 'Priya Shah', role: 'Lead', email: 'priya@firm.co' },
]

vi.mock('server-only', () => ({}))
vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'lead', email: 'priya@firm.co', user_metadata: { full_name: 'Priya Shah' } } } }) } }),
}))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: () => ({ auth: { admin: { getUserById: async () => ({ data: { user: null } }) } } }) }))
vi.mock('@/lib/resolve-project-context', () => ({ resolveProjectContext: async () => ({ firmId: 'f1', clientId: 'c1', projectId: 'p1' }) }))
vi.mock('@/lib/permission-helpers', () => ({ canManageProject: async () => st.lead }))
vi.mock('@/lib/engagement-access', () => ({
    blockIfEngagementCompleted: async () => (st.completed ? NextResponse.json({ error: "This engagement is completed, so it's read only." }, { status: 403 }) : null),
}))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagement: {
            findFirst: async () => ({
                name: 'Q4 Positioning', slug: 'q4', settings: { insightsSummary: st.summary, statusUpdates: st.statusUpdates },
                client: { slug: 'acme', firm: { name: 'Halden Advisory', slug: 'halden', group: { slug: 'g' } } },
            }),
            findUnique: async () => ({ settings: { insightsSummary: st.summary, statusUpdates: st.statusUpdates } }),
            update,
        },
    },
}))
vi.mock('@/lib/email', () => ({ sendEmail }))
vi.mock('@/lib/notify-event', () => ({ createEventNotifications: notify, buildAbsoluteUrl: async (p: string) => `https://app.example${p}` }))
vi.mock('@/lib/audit/emit', () => ({ emitAuditEvent: async () => {} }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/ai/engagement-summary', () => ({
    readInsightsSummary: (s: Record<string, unknown>) => ({ text: null, publishedAt: null, publishedByUserId: null, source: null, ...(s?.insightsSummary as object) }),
}))
vi.mock('@/lib/ai/status-update', async () => {
    const actual = await vi.importActual<typeof import('@/lib/ai/status-update')>('@/lib/ai/status-update')
    return { ...actual, engagementRecipients: async () => PEOPLE }
})
vi.mock('@/lib/insights/engagement-insights', () => ({ computeEngagementInsights: vi.fn() }))

import { GET, POST } from './route'

const params = { params: Promise.resolve({ projectId: 'p1' }) }
const post = (body: unknown) => POST(new NextRequest('http://localhost/api/projects/p1/send-update', { method: 'POST', body: JSON.stringify(body) }), params)

beforeEach(() => {
    st.lead = true
    st.completed = false
    st.summary = { text: '## Summary\nOn track.\n\n## Risks\nQSR-9 is late.', publishedAt: '2026-11-17T10:00:00Z', publishedByUserId: 'lead', source: 'ai' }
    st.statusUpdates = []
    update.mockClear(); notify.mockClear(); sendEmail.mockClear()
    process.env.SMTP_HOST = 'smtp.test'
})

describe('GET: who it goes to', () => {
    it('lists everyone on the engagement but the sender, and who got the last one', async () => {
        st.statusUpdates = [{ sentAt: '2026-10-21T09:00:00Z', sentByUserId: 'lead', recipientUserIds: ['dana'], recipientEmails: ['jo@acme.com'], text: 'x' }]
        const res = await GET(new NextRequest('http://localhost/api/projects/p1/send-update'), params)
        const json = await res.json()
        expect(json.recipients.map((r: { userId: string }) => r.userId)).toEqual(['dana', 'sam'])
        expect(json.recipients[0]).toEqual({ userId: 'dana', name: 'Dana Whitfield', role: 'Reviewer', email: 'dana@client.com' })
        expect(json.lastSent).toEqual({ sentAt: '2026-10-21T09:00:00Z', to: ['Dana Whitfield', 'jo@acme.com'] })
        // The sender, always copied.
        expect(json.cc).toEqual({ name: 'Priya Shah', email: 'priya@firm.co' })
    })

    it('is for Leads only', async () => {
        st.lead = false
        expect((await GET(new NextRequest('http://localhost/x'), params)).status).toBe(403)
    })
})

describe('POST: sending the published update', () => {
    it('emails the whole published update, with Inbox and a link for members, and keeps the send', async () => {
        const res = await post({ userIds: ['dana', 'sam'], emails: ['Jordan.Lee@AcmeRobotics.com'], note: 'Ahead of Friday.' })
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ sent: 3, total: 3, failed: [], copied: true })

        const calls = sendEmail.mock.calls as unknown as Array<[string, string, string, unknown, { headers?: Record<string, string> } | undefined]>
        expect(calls.map((c) => c[0])).toEqual(['dana@client.com', 'sam@firm.co', 'jordan.lee@acmerobotics.com', 'priya@firm.co'])
        // The sender's copy says who it went to.
        expect(calls[3][2]).toContain('Your copy. Sent to Dana Whitfield, Sam Patel and jordan.lee@acmerobotics.com.')
        expect(calls[0][2]).not.toContain('Your copy')
        const [, subject, memberHtml] = calls[0]
        expect(subject).toBe('Update from Halden Advisory · Q4 Positioning')
        expect(memberHtml).toContain('On track.')
        expect(memberHtml).toContain('QSR-9 is late.')
        expect(memberHtml).toContain('Ahead of Friday.')
        expect(memberHtml).toContain('Written by Brio · reviewed and published by Priya Shah')
        expect(memberHtml).toContain('Open the engagement')
        // An address that isn't on the engagement: no link into it, and replies go to the sender.
        expect(calls[2][2]).not.toContain('Open the engagement')
        expect(calls[2][4]).toEqual({ headers: { 'Reply-To': 'priya@firm.co' } })

        expect((notify.mock.calls[0] as unknown as [Array<{ userId: string }>])[0].map((n) => n.userId)).toEqual(['dana', 'sam'])
        const saved = (update.mock.calls[0] as unknown as [{ data: { settings: { statusUpdates: Array<Record<string, unknown>> } } }])[0].data.settings
        expect(saved.statusUpdates[0]).toMatchObject({
            recipientUserIds: ['dana', 'sam'],
            recipientEmails: ['jordan.lee@acmerobotics.com'],
            note: 'Ahead of Friday.',
            text: st.summary.text,
            withPdf: false,
        })
    })

    it('never sends text from the request, only what was published', async () => {
        await post({ userIds: ['dana'], text: 'Something else entirely' })
        expect((sendEmail.mock.calls[0] as unknown as string[])[2]).not.toContain('Something else entirely')
    })

    it('never sends the sender a second email as a recipient: they get their copy', async () => {
        await post({ userIds: ['dana', 'lead'], emails: ['Priya@Firm.co'] })
        expect((sendEmail.mock.calls as unknown as string[][]).map((c) => c[0])).toEqual(['dana@client.com', 'priya@firm.co'])
    })

    it('treats a typed address that belongs to someone on the engagement as that person', async () => {
        await post({ userIds: [], emails: ['dana@client.com'] })
        const saved = (update.mock.calls[0] as unknown as [{ data: { settings: { statusUpdates: Array<Record<string, unknown>> } } }])[0].data.settings
        expect(saved.statusUpdates[0]).toMatchObject({ recipientUserIds: ['dana'], recipientEmails: [] })
    })

    it('attaches the Overview as a PDF when one comes with it', async () => {
        await post({ userIds: ['dana'], pdfBase64: Buffer.from('%PDF-1.4').toString('base64') })
        const attachments = (sendEmail.mock.calls[0] as unknown as [string, string, string, Array<{ filename: string; contentType: string }>])[3]
        expect(attachments).toEqual([expect.objectContaining({ filename: 'Q4_Positioning_Overview.pdf', contentType: 'application/pdf' })])
    })

    it.each([
        [{ userIds: ['someone-else'] }, 'bad_recipients'],
        [{ userIds: [], emails: ['not-an-address'] }, 'bad_email'],
        [{ userIds: [], emails: [] }, 'no_recipients'],
        [{ userIds: ['dana'], note: 'x'.repeat(2001) }, 'too_long'],
    ])('refuses %j in words (%s), and sends nothing', async (body, code) => {
        const res = await post(body)
        expect(res.status).toBe(400)
        expect((await res.json()).code).toBe(code)
        expect(sendEmail).not.toHaveBeenCalled()
        expect(update).not.toHaveBeenCalled()
    })

    it('needs a published update', async () => {
        st.summary = { text: null, publishedAt: null }
        const res = await post({ userIds: ['dana'] })
        expect(res.status).toBe(409)
        expect((await res.json()).error).toBe('Publish the update before sending it.')
    })

    it('is for Leads only, and not on a completed engagement', async () => {
        st.lead = false
        expect((await post({ userIds: ['dana'] })).status).toBe(403)
        st.lead = true
        st.completed = true
        expect((await post({ userIds: ['dana'] })).status).toBe(403)
        expect(sendEmail).not.toHaveBeenCalled()
    })

    it('says who it could not reach', async () => {
        sendEmail.mockRejectedValueOnce(new Error('bounced'))
        const res = await post({ userIds: ['dana', 'sam'] })
        expect(await res.json()).toEqual({ sent: 1, total: 2, failed: ['Dana Whitfield'], copied: true })
    })
})
