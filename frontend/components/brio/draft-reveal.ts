/**
 * How a Brio draft appears on screen: a word at a time at a steady pace, as on the website's Meet
 * Brio mocks (one word every 55 ms), rather than in the bursts the model sends, and never far behind
 * what has arrived. A short draft types at `wordsPerSecond`; a long one speeds up so what is waiting
 * is shown within `maxLagSeconds`.
 */
export const DRAFT_REVEAL = { wordsPerSecond: 18, maxLagSeconds: 2 } as const

/** How long a step waits for a frame before going without one. */
const FRAME_FALLBACK_MS = 50

/** One frame: how many more words to show, given how many are waiting. `carry` keeps the fraction. */
export function revealStep(waiting: number, dtSeconds: number, carry: number): { show: number; carry: number } {
    if (waiting <= 0) return { show: 0, carry: 0 }
    const rate = Math.max(DRAFT_REVEAL.wordsPerSecond, waiting / DRAFT_REVEAL.maxLagSeconds)
    const due = carry + rate * dtSeconds
    const show = Math.min(waiting, Math.floor(due))
    return { show, carry: show === waiting ? 0 : due - show }
}

export interface DraftReveal {
    /** Everything received so far. It is shown a little at a time; what is on screen stays. */
    push(received: string): void
    /** What is on screen. */
    shown(): string
    /** Resolves once everything pushed is on screen; rejects if `signal` aborts first. */
    settle(signal: AbortSignal): Promise<void>
    /** Stops for good: nothing more is shown. */
    cancel(): void
}

/** Whole words only, as Brio types on the website: up to the last space at or before `count`, or all of it once reached. */
export function wholeWords(text: string, count: number): string {
    if (count >= text.length) return text
    let end = Math.max(0, count)
    while (end > 0 && !/\s/.test(text[end])) end--
    return text.slice(0, end)
}

/** Where the next word after `from` ends: past any spaces, then past the word. */
function nextWordEnd(text: string, from: number): number {
    let i = from
    while (i < text.length && /\s/.test(text[i])) i++
    while (i < text.length && !/\s/.test(text[i])) i++
    return i
}

function wordsIn(text: string): number {
    return text.match(/\S+/g)?.length ?? 0
}

function commonPrefix(a: string, b: string): number {
    let i = 0
    while (i < a.length && i < b.length && a[i] === b[i]) i++
    return i
}

/**
 * Types `push`ed text out to `onText` a word at a time, at the pace above. With `instant` (reduced
 * motion), or while the page is hidden, everything pushed is shown at once.
 */
export function createDraftReveal(onText: (shown: string) => void, opts: { instant?: boolean } = {}): DraftReveal {
    const raf: (cb: FrameRequestCallback) => number = typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : () => 0
    const caf: (id: number) => void = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : () => {}

    let target = ''
    let count = 0
    let visible = ''
    let carry = 0
    let last: number | null = null
    let frame: number | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let scheduled = false
    let turn = 0
    let cancelled = false
    let waiters: Array<() => void> = []

    /** Puts whole words up to `count` on screen, when that changes anything. */
    const show = () => {
        const next = wholeWords(target, count)
        if (next === visible) return
        visible = next
        onText(visible)
    }

    const caughtUp = () => {
        const w = waiters
        waiters = []
        w.forEach((resolve) => resolve())
    }

    // The next step runs on the next frame, or after FRAME_FALLBACK_MS if no frame comes: some
    // pages report themselves visible yet run no frames (a covered window, an app's hidden pane).
    // `turn` ties each step to its own scheduling, and `scheduled` says whether one is coming: a
    // frame that runs at once (as in tests) has been and gone before its id comes back.
    const schedule = () => {
        if (scheduled) return
        scheduled = true
        const mine = ++turn
        const run = (now: number, atLeast: number) => {
            if (mine !== turn || !scheduled) return
            scheduled = false
            if (timer !== null) clearTimeout(timer)
            if (frame !== null) caf(frame)
            timer = null
            frame = null
            tick(now, atLeast)
        }
        timer = setTimeout(() => run(performance.now(), FRAME_FALLBACK_MS / 1000), FRAME_FALLBACK_MS)
        const id = raf((now) => run(now, 1 / 120))
        if (mine === turn && scheduled) frame = id
    }

    // `atLeast`: the least time a step stands for, its own interval (a frame, or the fallback's
    // wait), so the pace holds even where the clock it reads stands still (fake timers in tests).
    const tick = (now: number, atLeast: number) => {
        if (cancelled) return
        // Hidden now: no one is watching, so all at once.
        if (pageHidden()) {
            count = target.length
            show()
            last = null
            caughtUp()
            return
        }
        const dt = last === null ? atLeast : Math.max(atLeast, (now - last) / 1000)
        last = now
        const step = revealStep(wordsIn(target.slice(count)), dt, carry)
        carry = step.carry
        for (let i = 0; i < step.show; i++) count = nextWordEnd(target, count)
        // Only spaces left: they come with the last word, so the draft is all on screen.
        if (wordsIn(target.slice(count)) === 0) count = target.length
        show()
        if (count < target.length) schedule()
        else {
            last = null
            caughtUp()
        }
    }

    return {
        push(received) {
            if (cancelled) return
            // Text normally only grows; if it was rewritten, what still matches stays on screen.
            if (!received.startsWith(target.slice(0, count))) count = commonPrefix(received, target.slice(0, count))
            target = received
            if (!target.startsWith(visible)) show()
            // Reduced motion, or a page no one is looking at (where frames don't run): all at once.
            if (opts.instant || pageHidden()) {
                count = target.length
                show()
                caughtUp()
                return
            }
            if (count >= target.length) caughtUp()
            else schedule()
        },
        shown: () => visible,
        settle(signal) {
            if (count >= target.length) return Promise.resolve()
            return new Promise<void>((resolve, reject) => {
                const onAbort = () => reject(new DOMException('aborted', 'AbortError'))
                if (signal.aborted) return onAbort()
                signal.addEventListener('abort', onAbort, { once: true })
                waiters.push(() => {
                    signal.removeEventListener('abort', onAbort)
                    resolve()
                })
            })
        },
        cancel() {
            cancelled = true
            turn++
            if (timer !== null) clearTimeout(timer)
            if (frame !== null) caf(frame)
            timer = null
            frame = null
            scheduled = false
            waiters = []
        },
    }
}

function pageHidden(): boolean {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

/** People who asked for less motion see each piece as it arrives. */
export function prefersReducedMotion(): boolean {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}
