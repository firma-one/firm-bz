import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * P2-66: the public contact and waitlist forms. A refused captcha keeps its own words (its throw sat
 * inside a try whose catch rewrote it to "Failed to verify captcha."), and a failure on our side says
 * how to reach us instead of "Server configuration error." or "Database error occurred."
 */

const prismaMock = vi.hoisted(() => ({
    contactSubmission: { count: vi.fn(), create: vi.fn() },
    waitlist: { count: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
}))

vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': '1.2.3.4' }) }))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(async () => undefined) }))
vi.mock('@/lib/email-templates/waitlist', () => ({ waitlistConfirmationEmail: vi.fn(() => ({})), referrerNotificationEmail: vi.fn(() => ({})) }))

import { submitContactForm } from './submit-contact'
import { submitWaitlistForm } from './submit-waitlist'
import { CONTACT_EMAIL } from '@/components/marketing/v2/config'

const contactForm = () => {
    const f = new FormData()
    f.append('email', 'ana@acme.com')
    f.append('message', 'Hello')
    return f
}
const waitlistForm = () => {
    const f = new FormData()
    f.append('email', 'ana@acme.com')
    return f
}
const captcha = (success: boolean) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success }), { status: 200 })))

beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    process.env.TURNSTILE_SECRET_KEY = 'secret'
    prismaMock.contactSubmission.count.mockResolvedValue(0)
    prismaMock.contactSubmission.create.mockResolvedValue({})
    prismaMock.waitlist.count.mockResolvedValue(0)
})
afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('contact form', () => {
    it('keeps the words of a refused captcha', async () => {
        captcha(false)
        const result = await submitContactForm(contactForm(), 'token')
        expect(result).toEqual({ success: false, error: 'Captcha validation failed. Please try again.' })
    })

    it("says the captcha couldn't be checked when Cloudflare can't be reached", async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
        const result = await submitContactForm(contactForm(), 'token')
        expect(result.error).toBe("We couldn't check the captcha. Please try again.")
    })

    it('says how to reach us when the captcha secret is missing', async () => {
        delete process.env.TURNSTILE_SECRET_KEY
        const result = await submitContactForm(contactForm(), 'token')
        expect(result.error).toBe(`We couldn't send this. Please email us at ${CONTACT_EMAIL}.`)
    })

    it('says how to reach us when the message cannot be saved', async () => {
        captcha(true)
        prismaMock.contactSubmission.create.mockRejectedValue(new Error('db down'))
        const result = await submitContactForm(contactForm(), 'token')
        expect(result.error).toBe(`We couldn't send this. Please email us at ${CONTACT_EMAIL}.`)
    })

    it('saves the message when all is well', async () => {
        captcha(true)
        await expect(submitContactForm(contactForm(), 'token')).resolves.toEqual({ success: true, data: 'Feedback received!' })
    })
})

describe('waitlist form', () => {
    it('keeps the words of a refused captcha', async () => {
        captcha(false)
        const result = await submitWaitlistForm(waitlistForm(), 'token', 'campaign')
        expect(result).toEqual({ success: false, error: 'Captcha validation failed. Please try again.' })
    })

    it('says how to reach us when the captcha secret is missing', async () => {
        delete process.env.TURNSTILE_SECRET_KEY
        const result = await submitWaitlistForm(waitlistForm(), 'token', 'campaign')
        expect(result.error).toBe(`We couldn't send this. Please email us at ${CONTACT_EMAIL}.`)
    })
})
