'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AI_TIMEOUT_MS } from '@/lib/ai/fetch-timeout'
import { BRIO_DRAFT_FAILED, BRIO_TOO_SLOW, BRIO_UNREACHABLE_RETRY } from '@/lib/ai/brio-failure'

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
 * The text is the user's from the first keystroke: `setText` edits it, and a draft is never sent
 * from here. Stopping keeps what was written so far. A failure keeps it too and says why, in Brio's
 * words: the route's own (a credit limit, a refusal), "couldn't reach" when the request never left,
 * or "took too long" when Brio went quiet longer than a stream is allowed.
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

    const start = useCallback(async (url: string, body?: unknown): Promise<string | null> => {
        ctrlRef.current?.abort('stopped')
        const ctrl = new AbortController()
        ctrlRef.current = ctrl
        setText('')
        setError(null)
        setStatus('streaming')

        // Gives up when Brio goes quiet for too long: reset on every piece of text, so a draft
        // still being written is never cut off.
        let idle: ReturnType<typeof setTimeout> | undefined
        const arm = () => {
            clearTimeout(idle)
            idle = setTimeout(() => ctrl.abort('timeout'), AI_TIMEOUT_MS.stream)
        }
        arm()

        let answered = false
        let written = ''
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
            let finished = false
            while (!finished) {
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
                        written += event.text
                        setText(written)
                    } else if (event.type === 'done') {
                        written = event.text
                        setText(written)
                        finished = true
                    } else if (event.type === 'error') {
                        throw new Error(event.message || failure)
                    }
                }
            }
            if (!finished) throw new Error(failure)
            setStatus('done')
            return written
        } catch (e) {
            if (ctrl.signal.aborted && ctrl.signal.reason === 'stopped') {
                // Stopped on purpose: what was written stays, as an ordinary editable draft.
                setStatus(written ? 'done' : 'idle')
                return written || null
            }
            const reason = ctrl.signal.reason === 'timeout'
                ? BRIO_TOO_SLOW
                : !answered && e instanceof TypeError
                    ? BRIO_UNREACHABLE_RETRY
                    // Only words thrown above (the route's); a parse error's own text isn't for a reader.
                    : e instanceof Error && e.name === 'Error' && e.message ? e.message : failure
            setError(reason)
            setStatus('error')
            return null
        } finally {
            clearTimeout(idle)
            if (ctrlRef.current === ctrl) ctrlRef.current = null
        }
    }, [failure])

    return { text, setText, status, error, start, stop, reset }
}
