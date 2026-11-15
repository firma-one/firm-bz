import { StrictMode } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, renderHook, act } from '@testing-library/react'
import { BrioTypedText, useTypedText } from './brio-typing'

/**
 * How Brio writes everywhere: what arrives while it writes is typed out a word at a time, what was
 * already there shows at once, and a surface waits for the last word before its finished rendering.
 */

/** Frames run by hand; the fallback timer only steps in when no frame comes, so it is held still. */
function manualFrames() {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let queue: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => queue.push(cb))
    vi.stubGlobal('cancelAnimationFrame', () => {})
    let t = 0
    const step = () => act(() => {
        const run = queue
        queue = []
        run.forEach((cb) => cb((t += 16)))
    })
    return {
        step,
        /** Runs frames until none are asked for, then lets the finish land. */
        async finish() {
            for (let i = 0; i < 500 && queue.length; i++) await step()
            await act(async () => {})
        },
    }
}

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

const ANSWER = 'Two deliverables are late: the pricing deck and the brief.'

describe('useTypedText', () => {
    it('types what arrives while Brio writes, and keeps typing after it finishes until the last word', async () => {
        const f = manualFrames()
        const { result, rerender } = renderHook(({ text, live }) => useTypedText(text, live), {
            initialProps: { text: '', live: true },
        })
        expect(result.current).toEqual({ shown: '', typing: true })

        rerender({ text: ANSWER, live: true })
        for (let i = 0; i < 8; i++) await f.step()
        expect(result.current.shown.length).toBeGreaterThan(0)
        expect(ANSWER.startsWith(result.current.shown)).toBe(true)

        // Brio has finished; the screen hasn't.
        rerender({ text: ANSWER, live: false })
        expect(result.current.typing).toBe(true)
        expect(result.current.shown.length).toBeLessThan(ANSWER.length)

        await f.finish()
        expect(result.current).toEqual({ shown: ANSWER, typing: false })
    })

    it('shows what was already there at once: a restored chat, a cached brief, an edit', () => {
        manualFrames()
        const { result, rerender } = renderHook(({ text }) => useTypedText(text, false), { initialProps: { text: ANSWER } })
        expect(result.current).toEqual({ shown: ANSWER, typing: false })
        rerender({ text: `${ANSWER} Edited.` })
        expect(result.current).toEqual({ shown: `${ANSWER} Edited.`, typing: false })
    })

    it('shows what arrived at once when stopped', async () => {
        const f = manualFrames()
        const { result, rerender } = renderHook(({ text, live, stopped }) => useTypedText(text, live, { finishNow: stopped }), {
            initialProps: { text: ANSWER, live: true, stopped: false },
        })
        await f.step()
        rerender({ text: ANSWER, live: false, stopped: true })
        expect(result.current).toEqual({ shown: ANSWER, typing: false })
    })

    it('types out what arrived when a surface clears its stream as Brio finishes', async () => {
        const f = manualFrames()
        const { result, rerender } = renderHook(({ text, live }) => useTypedText(text, live), {
            initialProps: { text: ANSWER, live: true },
        })
        await f.step()
        rerender({ text: '', live: false })
        expect(result.current.typing).toBe(true)
        await f.finish()
        expect(result.current).toEqual({ shown: ANSWER, typing: false })
    })

    it('types a whole new text in once with typeIn, and leaves the same text as it is', async () => {
        const f = manualFrames()
        const { result, rerender } = renderHook(({ text }) => useTypedText(text, false, { typeIn: true }), {
            initialProps: { text: ANSWER },
        })
        expect(result.current).toEqual({ shown: '', typing: true })
        await f.finish()
        expect(result.current).toEqual({ shown: ANSWER, typing: false })

        rerender({ text: ANSWER })
        expect(result.current).toEqual({ shown: ANSWER, typing: false })

        rerender({ text: 'A new brief.' })
        await f.step()
        expect(result.current.typing).toBe(true)
        await f.finish()
        expect(result.current).toEqual({ shown: 'A new brief.', typing: false })
    })

    it('still types under Strict Mode, which mounts twice', async () => {
        const f = manualFrames()
        const { result } = renderHook(() => useTypedText(ANSWER, false, { typeIn: true }), { wrapper: StrictMode })
        await f.finish()
        expect(result.current).toEqual({ shown: ANSWER, typing: false })
    })
})

describe('BrioTypedText', () => {
    it('shows the dots before the first word, then the words and the caret', () => {
        const { container, rerender } = render(<BrioTypedText shown="" />)
        expect(container.querySelector('.fm-think-dots')).not.toBeNull()
        rerender(<BrioTypedText shown="Two deliverables" />)
        expect(container.textContent).toBe('Two deliverables')
        expect(container.querySelector('.fm-type-caret')).not.toBeNull()
    })
})
