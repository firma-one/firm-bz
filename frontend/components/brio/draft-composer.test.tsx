import { StrictMode } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, renderHook, act } from '@testing-library/react'
import { DraftComposer } from './draft-composer'
import { useBrioDraft } from './use-brio-draft'

/**
 * A Brio draft starts when its sheet opens and is read into the text box as it streams. The sheets
 * are mounted already open, so React's Strict Mode (on in development) mounts them twice; the draft
 * must still arrive, from one request.
 */

const enc = new TextEncoder()
const line = (o: unknown) => enc.encode(JSON.stringify(o) + '\n')

/** A draft stream the test writes to. */
function controlledStream() {
    let ctrl!: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({ start(c) { ctrl = c } })
    return {
        response: new Response(body, { headers: { 'content-type': 'application/x-ndjson' } }),
        write: (o: unknown) => ctrl.enqueue(line(o)),
        close: () => ctrl.close(),
    }
}

function finishedStream(text: string) {
    const s = controlledStream()
    s.write({ type: 'meta' })
    s.write({ type: 'delta', text })
    s.write({ type: 'done', text })
    s.close()
    return s.response
}

/** A request that never answers, and fails the way fetch does when it is stopped. */
function pendingUntilAborted(init?: RequestInit) {
    return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })
}

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe('DraftComposer', () => {
    it('shows the draft when the sheet is mounted open under Strict Mode, from one request', async () => {
        // Like fetch: answers a moment later, unless it was stopped first.
        const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
            setTimeout(() => { if (!init?.signal?.aborted) resolve(finishedStream('Hi Dana, a quick nudge on QSR-9.')) }, 0)
        }))
        vi.stubGlobal('fetch', fetchMock)

        render(
            <StrictMode>
                <DraftComposer
                    open
                    onOpenChange={() => {}}
                    title="Nudge about QSR-9"
                    recipients={[{ userId: 'u1', name: 'Dana Reyes', role: 'Reviewer' }]}
                    removableRecipients={false}
                    draftUrl="/api/projects/p1/documents/d1/ai-nudge-draft"
                    draftBody={{ recipientUserId: 'u1' }}
                    sendLabel="Send nudge"
                    onSend={async () => ({ ok: true, data: null })}
                />
            </StrictMode>,
        )

        const box = () => screen.getByRole('textbox') as HTMLTextAreaElement
        await waitFor(() => expect(box().value).toBe('Hi Dana, a quick nudge on QSR-9.'), { timeout: 3000 })
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect((screen.getByRole('button', { name: 'Send nudge' }) as HTMLButtonElement).disabled).toBe(false)
    })
})

describe('DraftComposer while Brio writes', () => {
    it('shows thinking dots before the first words, then the words with a caret, then the editable draft', async () => {
        const s = controlledStream()
        vi.stubGlobal('fetch', vi.fn(async () => s.response))
        const { baseElement } = render(
            <DraftComposer
                open
                onOpenChange={() => {}}
                title="Nudge about QSR-9"
                recipients={[{ userId: 'u1', name: 'Dana Reyes', role: 'Reviewer' }]}
                draftUrl="/draft"
                sendLabel="Send nudge"
                onSend={async () => ({ ok: true, data: null })}
            />,
        )
        await waitFor(() => expect(baseElement.querySelector('.fm-think-dots')).not.toBeNull())
        expect(screen.getByRole('button', { name: /Stop/ })).toBeTruthy()

        await act(async () => { s.write({ type: 'delta', text: 'Hi Dana, a quick nudge.' }) })
        await waitFor(() => expect(baseElement.querySelector('.fm-type-caret')).not.toBeNull())
        expect(baseElement.querySelector('.fm-think-dots')).toBeNull()

        await act(async () => { s.write({ type: 'done', text: 'Hi Dana, a quick nudge.' }); s.close() })
        await waitFor(() => expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Hi Dana, a quick nudge.'), { timeout: 3000 })
        await waitFor(() => expect(baseElement.querySelector('.fm-type-caret')).toBeNull())
        expect((screen.getByRole('button', { name: 'Send nudge' }) as HTMLButtonElement).disabled).toBe(false)
    })
})

describe('DraftComposer mentions', () => {
    it('draws a tagged member as the comment box draws a mention, while typing and after', async () => {
        const { baseElement } = render(
            <DraftComposer
                open
                onOpenChange={() => {}}
                title="Nudge about QSR-9"
                recipients={[{ userId: 'u1', name: 'Dana Whitfield', role: 'Reviewer' }]}
                draftUrl="/draft"
                sendLabel="Send nudge"
                onSend={async () => ({ ok: true, data: null })}
                staticDraft={'Hi @Dana Whitfield,\n\nA quick check-in.'}
                mentionNames={['Dana Whitfield']}
            />,
        )
        const box = () => screen.getByRole('textbox') as HTMLTextAreaElement
        await waitFor(() => expect(box().value).toBe('Hi @Dana Whitfield,\n\nA quick check-in.'), { timeout: 3000 })
        const marks = Array.from(baseElement.querySelectorAll('mark')).map((m) => m.textContent)
        expect(marks).toEqual(['@Dana Whitfield'])
    })
})

describe('useBrioDraft', () => {
    it('leaves the text and status to a newer draft when an older one is replaced', async () => {
        const second = controlledStream()
        const fetchMock = vi.fn()
            .mockImplementationOnce((_url: string, init?: RequestInit) => pendingUntilAborted(init))
            .mockImplementationOnce(async () => second.response)
        vi.stubGlobal('fetch', fetchMock)

        const { result } = renderHook(() => useBrioDraft())
        let first!: Promise<string | null>
        act(() => { first = result.current.start('/draft') })
        let latest!: Promise<string | null>
        act(() => { latest = result.current.start('/draft') })

        // The first request has failed by now; the second is still being written.
        await act(async () => { await first })
        expect(result.current.status).toBe('streaming')

        await act(async () => {
            second.write({ type: 'delta', text: 'Second draft' })
            second.write({ type: 'done', text: 'Second draft' })
            second.close()
            await latest
        })
        expect(result.current.status).toBe('done')
        expect(result.current.text).toBe('Second draft')
        expect(result.current.error).toBeNull()
    })
})

describe('useBrioDraft pacing', () => {
    /** Frames run by hand, so the typing can be watched step by step. */
    function manualFrames() {
        // The fallback timer only steps in when no frame comes; here frames always come, by hand.
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
        let queue: FrameRequestCallback[] = []
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => queue.push(cb))
        vi.stubGlobal('cancelAnimationFrame', () => {})
        let t = 0
        return {
            step: () => act(() => { const run = queue; queue = []; run.forEach((cb) => cb((t += 16))) }),
            pending: () => queue.length,
        }
    }

    it('types the draft out and stays streaming until it is all on screen', async () => {
        const f = manualFrames()
        const text = 'Hi Dana, just checking in on QSR-9 before Friday.'
        const s = controlledStream()
        vi.stubGlobal('fetch', vi.fn(async () => s.response))
        const { result } = renderHook(() => useBrioDraft())

        let done!: Promise<string | null>
        await act(async () => {
            done = result.current.start('/draft')
            s.write({ type: 'delta', text })
            s.write({ type: 'done', text })
            s.close()
        })
        // Brio has finished; the screen hasn't, so Send still waits.
        for (let i = 0; i < 8; i++) await f.step()
        expect(result.current.status).toBe('streaming')
        expect(result.current.text.length).toBeGreaterThan(0)
        expect(result.current.text.length).toBeLessThan(text.length)
        expect(text.startsWith(result.current.text)).toBe(true)

        while (f.pending()) await f.step()
        await act(async () => { await done })
        expect(result.current.text).toBe(text)
        expect(result.current.status).toBe('done')
    })

    it('keeps what is on screen when stopped part-way', async () => {
        const f = manualFrames()
        const { result } = renderHook(() => useBrioDraft())
        let played!: Promise<string | null>
        act(() => { played = result.current.play('A canned draft for the tour, typed like a real one.') })
        for (let i = 0; i < 8; i++) await f.step()
        const onScreen = result.current.text
        expect(onScreen.length).toBeGreaterThan(0)
        await act(async () => {
            result.current.stop()
            await played
        })
        expect(result.current.text).toBe(onScreen)
        expect(result.current.status).toBe('done')
    })
})
