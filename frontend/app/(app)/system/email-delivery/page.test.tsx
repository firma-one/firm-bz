import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const { addToast } = vi.hoisted(() => ({ addToast: vi.fn() }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast }) }))

import EmailDeliveryPage from './page'
import { EMAIL_DELIVERY_BATCH_SIZE } from '@/lib/system/email-recipients'

const TEMPLATE = {
    id: 'news-1',
    name: 'News one',
    description: 'The first news',
    createdAt: '2026-11-05',
    subject: 'Big news',
    preheader: 'Read all about it',
}

const user = (email: string, firstName: string | null = null) => ({
    id: `id-${email}`, email, firstName, lastName: null, createdAt: '2026-10-01T00:00:00Z', lastSignInAt: null,
})

type Payload = { templates: unknown[]; users: unknown[]; email: { configured: boolean; from: string } }
let payload: Payload
/** What each POST answers, given its recipients. */
let sendResponse: (recipients: string[]) => Response | Promise<Response>
let posts: { templateId: string; recipients: string[] }[]

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const allOk = (recipients: string[]) => json({ results: recipients.map((email) => ({ email, ok: true })) })

beforeEach(() => {
    addToast.mockReset()
    posts = []
    sendResponse = allOk
    payload = {
        templates: [TEMPLATE],
        users: [user('pat@x.com', 'Pat'), user('sam@x.com', 'Sam'), user('lee@y.com')],
        email: { configured: true, from: '"firma" <info@firmaone.com>' },
    }
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/preview')) return json({ html: '<html><head><title>x</title></head><body>The email</body></html>' })
        if (init?.method === 'POST') {
            const body = JSON.parse(String(init.body))
            posts.push(body)
            return sendResponse(body.recipients)
        }
        return json(payload)
    }))
})

afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
})

async function open() {
    render(<EmailDeliveryPage />)
    await screen.findByText('News one')
    await screen.findByTitle('Email preview')
}

const sendButton = () => screen.getByRole('button', { name: /send/i })
const checkboxFor = (name: string) => screen.getByRole('checkbox', { name: new RegExp(name) })

describe('opening the page', () => {
    it('selects the newest template and previews it in a frame that cannot run scripts', async () => {
        await open()
        expect((screen.getByRole('radio', { name: /News one/ }) as HTMLInputElement).checked).toBe(true)
        expect(screen.getByText('Big news')).toBeTruthy()
        expect(screen.getByText('Read all about it')).toBeTruthy()

        const frame = await screen.findByTitle('Email preview')
        expect(frame.getAttribute('sandbox')).not.toContain('allow-scripts')
        expect(frame.getAttribute('srcdoc')).toContain('The email')
        expect(frame.getAttribute('srcdoc')).toContain('<base target="_blank" />')
    })

    it('starts with nobody selected, so nothing can go out by accident', async () => {
        await open()
        expect(sendButton().textContent).toContain('Choose recipients')
        expect((sendButton() as HTMLButtonElement).disabled).toBe(true)
    })

    it('blocks sending when SMTP is not configured, and says why', async () => {
        payload.email.configured = false
        await open()
        fireEvent.click(checkboxFor('Pat'))
        expect(screen.getByText(/SMTP isn.t configured/)).toBeTruthy()
        expect((sendButton() as HTMLButtonElement).disabled).toBe(true)
    })

    it('shows the reason when the page can’t load', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Could not list users: rate limited' }, 500)))
        render(<EmailDeliveryPage />)
        expect(await screen.findByText(/rate limited/)).toBeTruthy()
    })
})

describe('choosing recipients', () => {
    it('counts users and additional emails once each, and the button says how many', async () => {
        await open()
        fireEvent.click(checkboxFor('Pat'))
        fireEvent.change(screen.getByLabelText(/Additional emails/), { target: { value: 'new@z.com, PAT@x.com' } })
        expect(sendButton().textContent).toContain('Send to 2 recipients')
    })

    it('selects only the matches when a search is active', async () => {
        await open()
        fireEvent.change(screen.getByLabelText('Search users'), { target: { value: 'x.com' } })
        fireEvent.click(checkboxFor('Select all 2 matching'))
        expect(sendButton().textContent).toContain('Send to 2 recipients')
        fireEvent.change(screen.getByLabelText('Search users'), { target: { value: '' } })
        expect((checkboxFor('lee@y.com') as HTMLInputElement).checked).toBe(false)
    })

    it('refuses to send while an additional email is invalid', async () => {
        await open()
        fireEvent.click(checkboxFor('Pat'))
        fireEvent.change(screen.getByLabelText(/Additional emails/), { target: { value: 'typo@nowhere' } })
        expect(screen.getByText(/Not valid: typo@nowhere/)).toBeTruthy()
        expect((sendButton() as HTMLButtonElement).disabled).toBe(true)
    })
})

describe('sending', () => {
    it('sends with one click, and nobody is left selected to be mailed twice', async () => {
        await open()
        fireEvent.click(checkboxFor('Pat'))
        fireEvent.click(checkboxFor('Sam'))
        fireEvent.click(sendButton())

        await screen.findByText('Sent to 2 recipients.')
        expect(posts).toEqual([{ templateId: 'news-1', recipients: ['pat@x.com', 'sam@x.com'] }])
        expect(sendButton().textContent).toContain('Choose recipients')
        expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }))
    })

    it('splits a long list into batches and sends to everyone exactly once', async () => {
        payload.users = Array.from({ length: EMAIL_DELIVERY_BATCH_SIZE * 2 + 3 }, (_, i) => user(`p${i}@x.com`))
        await open()
        fireEvent.click(checkboxFor('Select all 23'))
        fireEvent.click(sendButton())

        await screen.findByText('Sent to 23 recipients.')
        expect(posts.map((p) => p.recipients.length)).toEqual([EMAIL_DELIVERY_BATCH_SIZE, EMAIL_DELIVERY_BATCH_SIZE, 3])
        expect(new Set(posts.flatMap((p) => p.recipients)).size).toBe(23)
    })

    it('keeps only the failures selected, so a second click retries just them', async () => {
        await open()
        fireEvent.change(screen.getByLabelText(/Additional emails/), { target: { value: 'bounce@z.com, fine@z.com' } })
        fireEvent.click(checkboxFor('Pat'))
        fireEvent.click(checkboxFor('Sam'))
        sendResponse = (recipients) => json({
            results: recipients.map((email) => (email === 'sam@x.com' || email === 'bounce@z.com'
                ? { email, ok: false, error: '550 mailbox unavailable' }
                : { email, ok: true })),
        })
        fireEvent.click(sendButton())

        await screen.findByText('Sent to 2 recipients.')
        expect(screen.getByText(/sam@x.com · 550 mailbox unavailable/)).toBeTruthy()
        expect((checkboxFor('Pat') as HTMLInputElement).checked).toBe(false)
        expect((checkboxFor('Sam') as HTMLInputElement).checked).toBe(true)
        expect((screen.getByLabelText(/Additional emails/) as HTMLTextAreaElement).value).toBe('bounce@z.com')

        sendResponse = allOk
        fireEvent.click(sendButton())
        await screen.findByText('Sent to 2 recipients.')
        expect(posts[1].recipients.sort()).toEqual(['bounce@z.com', 'sam@x.com'])
    })

    it('carries on after a refused batch and reports whom it missed', async () => {
        payload.users = Array.from({ length: EMAIL_DELIVERY_BATCH_SIZE + 1 }, (_, i) => user(`p${i}@x.com`))
        await open()
        fireEvent.click(checkboxFor('Select all 11'))
        let call = 0
        sendResponse = (recipients) => (call++ === 0 ? json({ error: 'SMTP is not configured' }, 503) : allOk(recipients))
        fireEvent.click(sendButton())

        await screen.findByText('Sent to 1 recipient.')
        expect(screen.getByText(/Not sent to 10/)).toBeTruthy()
        expect(screen.getAllByText(/SMTP is not configured/).length).toBe(10)
    })

    it('never calls a dropped connection sent, and says the outcome is unknown', async () => {
        await open()
        fireEvent.click(checkboxFor('Pat'))
        sendResponse = () => { throw new TypeError('Failed to fetch') }
        fireEvent.click(sendButton())

        await waitFor(() => expect(screen.getByText(/may or may not have gone out/)).toBeTruthy())
        expect((checkboxFor('Pat') as HTMLInputElement).checked).toBe(true)
        expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }))
    })
})
