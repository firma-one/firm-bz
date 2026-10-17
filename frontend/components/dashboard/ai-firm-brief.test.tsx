import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'

vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ session: { access_token: 't' } }) }))

import { FirmBriefCard, useFirmBrief } from './ai-firm-brief'

const OLD = { content: '## Where things stand\nOld news.', generatedAt: new Date().toISOString() }

describe('FirmBriefCard while rewriting', () => {
    it('says Brio is reading before the first word, with Stop in place of Rewrite', () => {
        const stop = vi.fn()
        render(<FirmBriefCard brief={OLD} refreshing streamText="" onRewrite={vi.fn()} onStop={stop} />)
        expect(screen.getByText(/is reading your firm’s data/)).toBeTruthy()
        // In the header, and once to screen readers.
        expect(screen.getAllByText(/is writing a new brief/)).toHaveLength(2)
        expect(screen.queryByRole('button', { name: /Rewrite with/ })).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: /Stop/ }))
        expect(stop).toHaveBeenCalled()
    })

    it('draws the sections as they stream in, in place of the old brief', () => {
        render(<FirmBriefCard brief={OLD} refreshing streamText={'## Needs attention\nTwo engagements'} onRewrite={vi.fn()} onStop={vi.fn()} />)
        expect(screen.getByRole('heading', { name: 'Needs attention' })).toBeTruthy()
        expect(screen.getByText(/Two/)).toBeTruthy()
        expect(screen.queryByText('Old news.')).toBeNull()
    })
})

/** The hook behind the card, in the card. */
function Harness() {
    const b = useFirmBrief('f1')
    return <FirmBriefCard brief={b.brief} loading={b.loading} refreshing={b.refreshing} streamText={b.streamText} refreshError={b.refreshError} onRewrite={b.refresh} onStop={b.stop} />
}

/** A streamed rewrite: its NDJSON lines, sent one by one. */
function ndjson(lines: unknown[]) {
    const encoder = new TextEncoder()
    return new ReadableStream<Uint8Array>({
        start(controller) {
            for (const l of lines) controller.enqueue(encoder.encode(JSON.stringify(l) + '\n'))
            controller.close()
        },
    })
}

describe('useFirmBrief', () => {
    let rewrite: () => Response
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => (
            init?.method === 'POST' ? rewrite() : ({ ok: true, json: async () => ({ brief: OLD, configured: true }) } as Response)
        )))
    })
    afterEach(() => vi.unstubAllGlobals())

    it('replaces the brief once the rewrite completes', async () => {
        const NEW = { content: '## Where things stand\nNew news.', generatedAt: new Date().toISOString() }
        rewrite = () => new Response(ndjson([{ type: 'meta' }, { type: 'delta', text: '## Where things stand\nNew ' }, { type: 'delta', text: 'news.' }, { type: 'done', brief: NEW }]))
        render(<Harness />)
        await screen.findByText('Old news.')
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Rewrite with/ })) })
        await waitFor(() => expect(screen.getByText('New news.')).toBeTruthy())
        expect(screen.getByRole('button', { name: /Rewrite with/ })).toBeTruthy()
    })

    it('keeps the old brief, and says so, when the rewrite fails', async () => {
        rewrite = () => new Response(ndjson([{ type: 'meta' }, { type: 'error', message: 'Brief generation failed' }]))
        render(<Harness />)
        await screen.findByText('Old news.')
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Rewrite with/ })) })
        await waitFor(() => expect(screen.getAllByText(/Could not rewrite it/).length).toBeGreaterThan(0))
        expect(screen.getByText('Old news.')).toBeTruthy()
    })
})
