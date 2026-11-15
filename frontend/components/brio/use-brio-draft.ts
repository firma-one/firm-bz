'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AI_TIMEOUT_MS } from '@/lib/ai/fetch-timeout'
import { BRIO_DRAFT_FAILED, BRIO_TOO_SLOW, BRIO_UNREACHABLE_RETRY } from '@/lib/ai/brio-failure'
import { createDraftReveal, prefersReducedMotion, type DraftReveal } from './draft-reveal'

/** One line of a draft stream (lib/ai/stream-draft.ts). */
export type DraftEvent =
    | { type: 'meta' }
    | { type: 'delta'; text: string }
    | { type: 'done'; text: string }
    | { type: 'error'; message: string }

export type DraftStatus = 'idle' | 'streaming' | 'done' | 'error'

/**
 * Reads a Brio draft as it is written, into editable text.
 *
 * The draft types out at a steady pace (components/brio/draft-reveal.ts) rather than in the bursts
 * the model sends, and stays `streaming` until it is all on screen, so Send waits for it. People
 * who asked for less motion see each piece as it arrives.
 *
 * The text is the user's from the first keystroke: `setText` edits it, and a draft is never sent
 * from here. Stopping keeps what is on screen. A failure keeps all that arrived and says why, in
 * Brio's words: the route's own (a credit limit, a refusal), "couldn't reach" when the request never
 * left, or "took too long" when Brio went quiet longer than a stream is allowed.
 *
 * `play` types out a draft that is already written (the /tour's canned ones) the same way.
 *
 * `failure` is the surface's fallback sentence; BRIO_DRAFT_FAILED when omitted.
 */
export function useBrioDraft(failure: string = BRIO_DRAFT_FAILED) {
    const [text, setText] = useState('')
    const [status, setStatus] = useState<DraftStatus>('idle')
    const [error, setError] = useState<string | null>(null)
    const ctrlRef = useRef<AbortController | null>(null)

    // A draft in flight stops when the surface closes, so it is not left writing into nothing.
    useEffect(() => () => ctrlRef.current?.abort('stopped'), [])

    const stop = useCallback(() => {
        ctrlRef.current?.abort('stopped')
    }, [])

    const reset = useCallback(() => {
        ctrlRef.current?.abort('stopped')
        setText('')
        setStatus('idle')
        setError(null)
    }, [])

    /** A new draft replaces any in flight; its reveal writes only while it is the current one. */
    const begin = useCallback(() => {
        ctrlRef.current?.abort('stopped')
        const ctrl = new AbortController()
        ctrlRef.current = ctrl
        setText('')
        setError(null)
        setStatus('streaming')
        const reveal = createDraftReveal((shown) => { if (!ctrl.signal.aborted) setText(shown) }, { instant: prefersReducedMotion() })
        return { ctrl, reveal }
    }, [])

    /** Stopped on purpose: what is on screen stays, as an ordinary editable draft. */
    const keepShown = useCallback((reveal: DraftReveal): string | null => {
        const shown = reveal.shown()
        setText(shown)
        setStatus(shown ? 'done' : 'idle')
        return shown || null
    }, [])

    const start = useCallback(async (url: string, body?: unknown): Promise<string | null> => {
        const { ctrl, reveal } = begin()

        // Gives up when Brio goes quiet for too long: reset on every piece of text, so a draft
        // still being written is never cut off.
        let idle: ReturnType<typeof setTimeout> | undefined
        const arm = () => {
            clearTimeout(idle)
            idle = setTimeout(() => ctrl.abort('timeout'), AI_TIMEOUT_MS.stream)
        }
        arm()

        let answered = false
        let received = ''
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body ?? {}),
                signal: ctrl.signal,
            })
            answered = true
            if (!res.ok || !res.body) {
                const detail = await res.json().catch(() => null)
                throw new Error(detail?.error ?? failure)
            }
            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''
            let finalText: string | null = null
            while (finalText === null) {
                const { value, done } = await reader.read()
                if (done) break
                arm()
                buffer += decoder.decode(value, { stream: true })
                let nl: number
                while ((nl = buffer.indexOf('\n')) >= 0) {
                    const raw = buffer.slice(0, nl).trim()
                    buffer = buffer.slice(nl + 1)
                    if (!raw) continue
                    const event = JSON.parse(raw) as DraftEvent
                    if (event.type === 'delta') {
                        received += event.text
                        reveal.push(received)
                    } else if (event.type === 'done') {
                        finalText = event.text
                        // The final text is what arrived, trimmed; if it ever differs, it wins.
                        if (received.trim() !== finalText) {
                            received = finalText
                            reveal.push(received)
                        }
                    } else if (event.type === 'error') {
                        throw new Error(event.message || failure)
                    }
                }
            }
            if (finalText === null) throw new Error(failure)
            // Brio has finished; the draft is done once it is all on screen.
            clearTimeout(idle)
            await reveal.settle(ctrl.signal)
            setText(finalText)
            setStatus('done')
            return finalText
        } catch (e) {
            // Replaced by a newer start (Rewrite, or a sheet reopened): that one owns the text and
            // status now, so this one leaves them alone.
            if (ctrlRef.current !== ctrl) return null
            if (ctrl.signal.aborted && ctrl.signal.reason === 'stopped') return keepShown(reveal)
            const reason = ctrl.signal.reason === 'timeout'
                ? BRIO_TOO_SLOW
                : !answered && e instanceof TypeError
                    ? BRIO_UNREACHABLE_RETRY
                    // Only words thrown above (the route's); a parse error's own text isn't for a reader.
                    : e instanceof Error && e.name === 'Error' && e.message ? e.message : failure
            setText(received)
            setError(reason)
            setStatus('error')
            return null
        } finally {
            clearTimeout(idle)
            reveal.cancel()
            if (ctrlRef.current === ctrl) ctrlRef.current = null
        }
    }, [begin, keepShown, failure])

    const play = useCallback(async (full: string): Promise<string | null> => {
        const { ctrl, reveal } = begin()
        reveal.push(full)
        try {
            await reveal.settle(ctrl.signal)
            setText(full)
            setStatus('done')
            return full
        } catch {
            if (ctrlRef.current !== ctrl) return null
            return keepShown(reveal)
        } finally {
            reveal.cancel()
            if (ctrlRef.current === ctrl) ctrlRef.current = null
        }
    }, [begin, keepShown])

    return { text, setText, status, error, start, play, stop, reset }
}
