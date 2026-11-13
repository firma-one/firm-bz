import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * The firm chat panel: an answer's engagement names become in-app links from the server's line, a
 * broken stream keeps what arrived and says it was cut off in Brio's words, and a refusal shows the
 * route's own words.
 */

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ session: { access_token: 't' } }) }))

import { FirmAiChat, FIRM_CHAT_CAPTION } from './firm-ai-chat'
import { FOLLOWUP_MARKER } from '@/lib/ai/engagement-chat'
import { formatFirmSourcesLine } from '@/lib/ai/firm-chat'

const encoder = new TextEncoder()

/** A response whose body sends `chunks`, then ends cleanly or fails like a stream the route errored. */
function streamed(chunks: string[], fail = false) {
    const queue = [...chunks]
    return new Response(new ReadableStream<Uint8Array>({
        pull(controller) {
            const next = queue.shift()
            if (next !== undefined) controller.enqueue(encoder.encode(next))
            else if (fail) controller.error(new TypeError('network error'))
            else controller.close()
        },
    }))
}

function ask(question: string) {
    fireEvent.change(screen.getByPlaceholderText('Ask about engagements, clients or deadlines'), { target: { value: question } })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
}

const renderPanel = () => render(<FirmAiChat firmId="f1" groupSlug="g" firmSlug="acme" />)

beforeEach(() => push.mockClear())
afterEach(() => vi.unstubAllGlobals())

describe('FirmAiChat', () => {
    it('carries the mock’s caption', () => {
        renderPanel()
        expect(screen.getByText(FIRM_CHAT_CAPTION)).toBeTruthy()
        expect(FIRM_CHAT_CAPTION).toBe('Firm admins only. Brio reports what the data shows. Decisions stay with you. 1 credit per answer.')
    })

    it('links the engagements the server resolved, opens them in place, and offers the follow-ups', async () => {
        const fetchMock = vi.fn(async () => streamed([
            '"Q4 Growth Strategy" is late; "Made Up" is not a real one.',
            `\n${FOLLOWUP_MARKER}\nWhich of these have client threads waiting?`,
            formatFirmSourcesLine({ engagements: [{ name: 'Q4 Growth Strategy', clientSlug: 'northwind', slug: 'q4-growth' }], drewOn: 12 }),
        ]))
        vi.stubGlobal('fetch', fetchMock)
        renderPanel()
        ask('Which engagements are slipping?')

        const link = await screen.findByRole('link', { name: '"Q4 Growth Strategy"' })
        expect(link.getAttribute('href')).toBe('/d/g/f/acme/c/northwind/e/q4-growth/analytics')
        expect(screen.queryByRole('link', { name: /Made Up/ })).toBeNull()
        expect(screen.getByText('Drew on 12 engagements')).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Which of these have client threads waiting?' })).toBeTruthy()

        fireEvent.click(link)
        expect(push).toHaveBeenCalledWith('/d/g/f/acme/c/northwind/e/q4-growth/analytics')

        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
        expect(url).toBe('/api/firms/f1/ai-chat')
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer t')
    // The first Markdown render is slow on a busy machine; the default 5s has run out under load.
    }, 15_000)

    it('keeps a partial answer and marks it cut off, without the browser’s words', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => streamed(['Three engagements are '], true)))
        renderPanel()
        ask('Which engagements are slipping?')

        expect(await screen.findByText("Cut off · Brio couldn't finish this answer. Try again.")).toBeTruthy()
        expect(screen.getByText(/Three engagements are/)).toBeTruthy()
        expect(screen.queryByText(/network error/i)).toBeNull()
    })

    it('shows the route’s own words when it refuses, such as the credit limit', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(
            JSON.stringify({ error: "You have used this month's 500 AI credits." }),
            { status: 429 },
        )))
        renderPanel()
        ask('Which engagements are slipping?')
        expect(await screen.findByText("You have used this month's 500 AI credits.")).toBeTruthy()
    })

    it('says Brio couldn’t be reached when the request never left', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
        renderPanel()
        ask('Which engagements are slipping?')
        await waitFor(() => expect(screen.getByText("Couldn't reach Brio. Check your connection and try again.")).toBeTruthy())
    })

    it('answers plainly off-topic questions itself, without a request', async () => {
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)
        renderPanel()
        ask('Write a python script to parse CSV files')
        expect(await screen.findByText(/I can only answer questions about this firm/)).toBeTruthy()
        expect(fetchMock).not.toHaveBeenCalled()
    })
})
