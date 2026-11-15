import { describe, it, expect, vi, afterEach } from 'vitest'
import { DRAFT_REVEAL, createDraftReveal, revealStep, wholeWords } from './draft-reveal'

/** Frames run by hand: `frame(ms)` runs everything waiting on the next one at that time. */
function manualFrames() {
    // The fallback timer only steps in when no frame comes; here frames always come, by hand.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let queue: Array<{ id: number; cb: FrameRequestCallback }> = []
    let next = 1
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        queue.push({ id: next, cb })
        return next++
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { queue = queue.filter((f) => f.id !== id) })
    return {
        frame(ms: number) {
            const run = queue
            queue = []
            run.forEach((f) => f.cb(ms))
        },
        pending: () => queue.length,
    }
}

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe('revealStep', () => {
    it('types a short draft at the steady pace, keeping the fraction for the next frame', () => {
        // 18 words a second at 60 frames a second: 0.3 a frame, so a word every fourth frame.
        let carry = 0
        const shown: number[] = []
        for (let i = 0; i < 8; i++) {
            const step = revealStep(10, 1 / 60, carry)
            carry = step.carry
            shown.push(step.show)
        }
        expect(shown).toEqual([0, 0, 0, 1, 0, 0, 1, 0])
        // A whole second shows the pace's worth.
        expect(revealStep(30, 1, 0).show).toBe(DRAFT_REVEAL.wordsPerSecond)
    })

    it('speeds up so a long wait is never more than the lag allowed', () => {
        const waiting = 100
        const perSecond = revealStep(waiting, 1, 0).show
        expect(perSecond).toBe(waiting / DRAFT_REVEAL.maxLagSeconds)
        expect(perSecond).toBeGreaterThan(DRAFT_REVEAL.wordsPerSecond)
    })

    it('never shows more than is waiting, and nothing when nothing is', () => {
        expect(revealStep(3, 1, 0)).toEqual({ show: 3, carry: 0 })
        expect(revealStep(0, 1, 0.5)).toEqual({ show: 0, carry: 0 })
    })
})

describe('wholeWords', () => {
    it('stops at the last space, never part-way through a word, and gives all of it once reached', () => {
        expect(wholeWords('Hi Dana, a quick', 5)).toBe('Hi')
        expect(wholeWords('Hi Dana, a quick', 8)).toBe('Hi Dana,')
        expect(wholeWords('Hi Dana,\n\nThanks', 11)).toBe('Hi Dana,\n')
        expect(wholeWords('Hi', 1)).toBe('')
        expect(wholeWords('Hi Dana', 7)).toBe('Hi Dana')
    })
})

describe('createDraftReveal', () => {
    it('shows pushed text a word at a time until it is all on screen, then settles', async () => {
        const f = manualFrames()
        const seen: string[] = []
        const r = createDraftReveal((s) => seen.push(s))
        const text = 'Hi Dana, a quick nudge on QSR-9.'
        r.push(text)
        const settled = r.settle(new AbortController().signal)

        let t = 0
        for (let i = 0; i < 8; i++) f.frame((t += 16))
        expect(r.shown().length).toBeGreaterThan(0)
        expect(r.shown().length).toBeLessThan(text.length)
        while (f.pending()) f.frame((t += 16))
        await settled
        expect(r.shown()).toBe(text)
        // Every step is the start of the text, a whole word longer than the last.
        seen.forEach((s, i) => {
            expect(text.startsWith(s)).toBe(true)
            expect(s === text || text[s.length] === ' ').toBe(true)
            if (i) expect(s.length).toBeGreaterThan(seen[i - 1].length)
        })
        expect(seen).toEqual(['Hi', 'Hi Dana,', 'Hi Dana, a', 'Hi Dana, a quick', 'Hi Dana, a quick nudge', 'Hi Dana, a quick nudge on', text])
    })

    it('keeps typing on a timer when no frames come', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
        vi.stubGlobal('requestAnimationFrame', () => 1)
        vi.stubGlobal('cancelAnimationFrame', () => {})
        const r = createDraftReveal(() => {})
        const text = 'Typed with no frames at all.'
        r.push(text)
        vi.advanceTimersByTime(300)
        expect(r.shown().length).toBeGreaterThan(0)
        expect(r.shown().length).toBeLessThan(text.length)
        vi.advanceTimersByTime(2000)
        expect(r.shown()).toBe(text)
    })

    it('shows everything at once for reduced motion', async () => {
        manualFrames()
        const seen: string[] = []
        const r = createDraftReveal((s) => seen.push(s), { instant: true })
        r.push('Hi')
        r.push('Hi Dana')
        await r.settle(new AbortController().signal)
        expect(seen).toEqual(['Hi', 'Hi Dana'])
    })

    it('shows everything at once on a hidden page, where frames would not run', async () => {
        const f = manualFrames()
        const seen: string[] = []
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
        try {
            const r = createDraftReveal((s) => seen.push(s))
            r.push('Written while you were away.')
            await r.settle(new AbortController().signal)
            expect(seen).toEqual(['Written while you were away.'])
            expect(f.pending()).toBe(0)
        } finally {
            delete (document as unknown as Record<string, unknown>).visibilityState
        }
        expect(document.visibilityState).toBe('visible')
    })

    it('stops waiting when the draft is stopped, and shows nothing more once cancelled', async () => {
        const f = manualFrames()
        const seen: string[] = []
        const r = createDraftReveal((s) => seen.push(s))
        r.push('A longer draft than one frame shows')
        const ctrl = new AbortController()
        const settled = r.settle(ctrl.signal)
        f.frame(0)
        ctrl.abort('stopped')
        await expect(settled).rejects.toThrow()
        r.cancel()
        const before = seen.length
        f.frame(16)
        expect(seen.length).toBe(before)
    })

    it('keeps what still matches when the text is rewritten', () => {
        const f = manualFrames()
        const r = createDraftReveal(() => {})
        r.push('Hello there')
        let t = 0
        while (f.pending()) f.frame((t += 16))
        r.push('Hello world')
        expect(r.shown()).toBe('Hello')
    })
})

describe('word pacing', () => {
    it('gives a long word the same time as a short one', () => {
        const f = manualFrames()
        const r = createDraftReveal(() => {})
        r.push('See 02__GTM_Strategy_&_Messaging_Playbook and the brief.')
        let t = 0
        // A word every 55 ms or so: 4 frames for "See", about 4 more for the file name.
        const framesTo = (words: string) => {
            let n = 0
            while (r.shown() !== words && n < 100) { f.frame((t += 16)); n++ }
            return n
        }
        const first = framesTo('See')
        const long = framesTo('See 02__GTM_Strategy_&_Messaging_Playbook')
        expect(Math.abs(long - first)).toBeLessThanOrEqual(1)
    })
})

describe('trailing spaces', () => {
    it('counts text ending in a space as all on screen', async () => {
        const f = manualFrames()
        const r = createDraftReveal(() => {})
        r.push('Thanks, Dana. ')
        const settled = r.settle(new AbortController().signal)
        let t = 0
        for (let i = 0; i < 40 && f.pending(); i++) f.frame((t += 16))
        await settled
        expect(r.shown()).toBe('Thanks, Dana. ')
        expect(f.pending()).toBe(0)
    })
})
