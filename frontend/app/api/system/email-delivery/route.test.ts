// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { auth, admins, mail, users, embed } = vi.hoisted(() => ({
    auth: { user: null as { id: string } | null },
    admins: new Set<string>(),
    mail: {
        sendEmail: vi.fn(),
        isEmailConfigured: vi.fn(),
        emailFromAddress: vi.fn(() => '"firma" <info@firmaone.com>'),
    },
    users: { listMailableAuthUsers: vi.fn() },
    embed: { failure: null as Error | null },
}))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: auth.user } }) } }) }))
vi.mock('@/lib/system/user-data-map', () => ({ isSysAdminUser: async (id: string) => admins.has(id) }))
vi.mock('@/lib/email', () => mail)
vi.mock('@/lib/system/auth-users', () => users)
vi.mock('@/lib/email-templates/campaigns/embed', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/email-templates/campaigns/embed')>()
    return {
        embedCampaignImages: async (html: string) => {
            if (embed.failure) throw embed.failure
            return actual.embedCampaignImages(html)
        },
    }
})
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { GET, POST } from './route'
import { GET as preview } from './preview/route'
import { CAMPAIGN_TEMPLATES } from '@/lib/email-templates/campaigns'
import { EMAIL_DELIVERY_BATCH_SIZE } from '@/lib/system/email-recipients'

const TEMPLATE = CAMPAIGN_TEMPLATES[0]

const post = (body: unknown) => POST(new Request('http://localhost/api/system/email-delivery', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
}))

const signInAsAdmin = () => {
    auth.user = { id: 'root' }
    admins.add('root')
}

beforeEach(() => {
    auth.user = null
    admins.clear()
    embed.failure = null
    mail.sendEmail.mockReset().mockResolvedValue({ messageId: 'm' })
    mail.isEmailConfigured.mockReset().mockReturnValue(true)
    users.listMailableAuthUsers.mockReset().mockResolvedValue([{ id: 'u1', email: 'pat@x.com' }])
})

describe('who can use it', () => {
    it('refuses the signed-out and non-admins everywhere, sending and revealing nothing', async () => {
        const previewUrl = new NextRequest(`http://localhost/api/system/email-delivery/preview?templateId=${TEMPLATE.id}`)
        const body = { templateId: TEMPLATE.id, recipients: ['pat@x.com'] }

        expect((await GET()).status).toBe(401)
        expect((await post(body)).status).toBe(401)
        expect((await preview(previewUrl)).status).toBe(401)

        auth.user = { id: 'pat' }
        expect((await GET()).status).toBe(403)
        expect((await post(body)).status).toBe(403)
        expect((await preview(previewUrl)).status).toBe(403)

        expect(mail.sendEmail).not.toHaveBeenCalled()
        expect(users.listMailableAuthUsers).not.toHaveBeenCalled()
    })
})

describe('GET: what the page opens with', () => {
    it('lists templates without their markup, the users, and whether SMTP is ready', async () => {
        signInAsAdmin()
        const body = await (await GET()).json()
        expect(body.templates[0]).toMatchObject({ id: TEMPLATE.id, subject: TEMPLATE.subject })
        expect(body.templates[0].render).toBeUndefined()
        expect(body.users).toEqual([{ id: 'u1', email: 'pat@x.com' }])
        expect(body.email).toEqual({ configured: true, from: '"firma" <info@firmaone.com>' })
    })

    it('says so when the users can’t be listed', async () => {
        signInAsAdmin()
        users.listMailableAuthUsers.mockRejectedValue(new Error('Could not list users: rate limited'))
        const res = await GET()
        expect(res.status).toBe(500)
        expect((await res.json()).error).toContain('rate limited')
    })
})

describe('POST: sending', () => {
    beforeEach(signInAsAdmin)

    it('sends each recipient their own copy, with links to the live site and its images inside', async () => {
        const res = await post({ templateId: TEMPLATE.id, recipients: ['pat@x.com', 'sam@x.com'] })
        expect(res.status).toBe(200)
        expect((await res.json()).results).toEqual([{ email: 'pat@x.com', ok: true }, { email: 'sam@x.com', ok: true }])

        expect(mail.sendEmail).toHaveBeenCalledTimes(2)
        const [to, subject, html, attachments, options] = mail.sendEmail.mock.calls[0]
        expect(to).toBe('pat@x.com')
        expect(subject).toBe(TEMPLATE.subject)
        expect(html).toContain('https://firma.bz/')
        expect(html).not.toContain('localhost')
        expect(html).not.toMatch(/src="https?:/)
        expect(html).toContain('src="cid:')
        expect(attachments.length).toBeGreaterThan(0)
        expect(attachments.every((a: { cid?: string }) => a.cid && html.includes(`cid:${a.cid}`))).toBe(true)
        expect(options.headers['List-Unsubscribe']).toMatch(/^<mailto:.+>$/)
    })

    it('reports each outcome: one failure doesn’t fail the batch', async () => {
        mail.sendEmail.mockImplementation(async (to: string) => {
            if (to === 'bad@x.com') throw new Error('550 mailbox unavailable')
            return { messageId: 'm' }
        })
        const res = await post({ templateId: TEMPLATE.id, recipients: ['pat@x.com', 'bad@x.com'] })
        expect(res.status).toBe(200)
        expect((await res.json()).results).toEqual([
            { email: 'pat@x.com', ok: true },
            { email: 'bad@x.com', ok: false, error: '550 mailbox unavailable' },
        ])
    })

    it('sends one copy when an address appears twice', async () => {
        await post({ templateId: TEMPLATE.id, recipients: ['Pat@x.com', 'pat@x.com'] })
        expect(mail.sendEmail).toHaveBeenCalledTimes(1)
    })

    it('sends nothing if an image can’t be prepared, rather than a message with a hole in it', async () => {
        embed.failure = new Error('Could not load the email image /email/x.png')
        const res = await post({ templateId: TEMPLATE.id, recipients: ['pat@x.com'] })
        expect(res.status).toBe(500)
        expect((await res.json()).error).toContain('/email/x.png')
        expect(mail.sendEmail).not.toHaveBeenCalled()
    })

    it('never claims success when SMTP is unset', async () => {
        mail.isEmailConfigured.mockReturnValue(false)
        const res = await post({ templateId: TEMPLATE.id, recipients: ['pat@x.com'] })
        expect(res.status).toBe(503)
        expect(mail.sendEmail).not.toHaveBeenCalled()
    })

    it('refuses an unknown template', async () => {
        const res = await post({ templateId: 'no-such-template', recipients: ['pat@x.com'] })
        expect(res.status).toBe(404)
        expect(mail.sendEmail).not.toHaveBeenCalled()
    })

    it('sends to nobody if any address in the batch is invalid', async () => {
        const res = await post({ templateId: TEMPLATE.id, recipients: ['pat@x.com', 'not-an-address'] })
        expect(res.status).toBe(400)
        expect((await res.json()).error).toContain('not-an-address')
        expect(mail.sendEmail).not.toHaveBeenCalled()
    })

    it('refuses a malformed body, an empty list, and a batch over the limit', async () => {
        const tooMany = Array.from({ length: EMAIL_DELIVERY_BATCH_SIZE + 1 }, (_, i) => `p${i}@x.com`)
        expect((await post('not json')).status).toBe(400)
        expect((await post({ templateId: TEMPLATE.id, recipients: [] })).status).toBe(400)
        expect((await post({ templateId: TEMPLATE.id, recipients: tooMany })).status).toBe(400)
        expect(mail.sendEmail).not.toHaveBeenCalled()
    })
})

describe('GET preview', () => {
    beforeEach(signInAsAdmin)

    it('renders against this server, so new images show before they are deployed', async () => {
        const res = await preview(new NextRequest(`http://localhost:3001/api/system/email-delivery/preview?templateId=${TEMPLATE.id}`))
        expect(res.status).toBe(200)
        expect((await res.json()).html).toContain('http://localhost:3001/email/')
    })

    it('refuses an unknown template', async () => {
        const res = await preview(new NextRequest('http://localhost/api/system/email-delivery/preview?templateId=nope'))
        expect(res.status).toBe(404)
    })
})
