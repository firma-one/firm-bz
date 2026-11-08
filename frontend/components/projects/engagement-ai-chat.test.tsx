import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * Brio chat's failure words in the panel: a stream that breaks off keeps what arrived and marks it
 * cut off, in Brio's words, not the browser's "network error"; a refusal shows the route's words.
 */

vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }))

import { EngagementAiChat } from './engagement-ai-chat'

/**
 * A response whose body sends `chunks`, then fails the way a stream the route errored does. The
 * failure comes on the read after the chunks, as it does over the wire: erroring at once would
 * discard what was queued.
 */
function brokenStream(chunks: string[]) {
    const encoder = new TextEncoder()
    const queue = [...chunks]
    return new Response(new ReadableStream<Uint8Array>({
        pull(controller) {
            const next = queue.shift()
            if (next !== undefined) controller.enqueue(encoder.encode(next))
            else controller.error(new TypeError('network error'))
        },
    }))
}

function ask(question: string) {
    const box = screen.getByPlaceholderText(/Ask Brio about this engagement/)
    fireEvent.change(box, { target: { value: question } })
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }))
}

beforeEach(() => {
    window.localStorage.clear()
    Element.prototype.scrollTo = vi.fn() as never
})
afterEach(() => vi.unstubAllGlobals())

describe('EngagementAiChat failures', () => {
    it('keeps a partial answer and marks it cut off, without the browser’s words', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => brokenStream(['Three deliverables are '])))
        render(<EngagementAiChat projectId="p1" />)
        ask('Which deliverables are late?')

        expect(await screen.findByText("Cut off · Brio couldn't finish this answer. Try again.")).toBeTruthy()
        expect(screen.getByText(/Three deliverables are/)).toBeTruthy()
        expect(screen.queryByText(/network error/i)).toBeNull()
    })

    it('a stream that breaks before any text says Brio couldn’t finish', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => brokenStream([])))
        render(<EngagementAiChat projectId="p1" />)
        ask('Which deliverables are late?')

        expect(await screen.findByText("Brio couldn't finish this answer. Try again.")).toBeTruthy()
        expect(screen.queryByText(/network error/i)).toBeNull()
    })

    it('shows the route’s own words when it refuses, such as the credit limit', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(
            JSON.stringify({ error: "You have used this month's 500 AI credits. They refill on Dec 1. Upgrade your plan for more." }),
            { status: 429 },
        )))
        render(<EngagementAiChat projectId="p1" />)
        ask('Which deliverables are late?')

        expect(await screen.findByText(/You have used this month's 500 AI credits/)).toBeTruthy()
    })

    it('says Brio couldn’t be reached when the request never left', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
        render(<EngagementAiChat projectId="p1" />)
        ask('Which deliverables are late?')

        await waitFor(() => expect(screen.getByText("Couldn't reach Brio. Check your connection and try again.")).toBeTruthy())
    })
})
