'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { createDraftReveal, prefersReducedMotion, type DraftReveal } from './draft-reveal'

/**
 * How Brio writes, everywhere it writes (chat answers, briefs, summaries, drafts), as on the
 * website's Meet Brio mocks: three green dots until the first word, then whole words at a steady
 * pace (components/brio/draft-reveal.ts) with a thin green caret after the last. Styles are
 * `.fm-think-dots` and `.fm-type-caret` in app/globals.css.
 */

/** The thin Brio-green caret after the last word while Brio writes. */
export function TypingCaret({ className }: { className?: string }) {
    return <span aria-hidden className={cn('fm-type-caret', className)} />
}

/** Three Brio-green dots while the first words are on their way. */
export function ThinkingDots({ className }: { className?: string }) {
    return (
        <span aria-hidden className={cn('fm-think-dots', className)}>
            <span />
            <span />
            <span />
        </span>
    )
}

/**
 * `text` as it should appear while Brio writes it: typed out a word at a time.
 *
 * `live` says Brio is still writing. Text that arrives while live is typed; text that was already
 * there (a restored chat, a cached brief) shows at once, as does a change made after Brio finished
 * (an edit). `typing` stays true until the last word is on screen, after `live` ends, so a surface
 * waits for it before swapping in its finished rendering.
 *
 * Options:
 * - `finishNow`: stopped by the reader (or cut off): what arrived shows at once rather than typing on.
 * - `typeIn`: for writing that arrives whole (Home's brief): a new text is typed out from the start,
 *   as if streamed. The same text again is left as it is.
 */
export function useTypedText(
    text: string,
    live: boolean,
    opts: { finishNow?: boolean; typeIn?: boolean } = {},
): { shown: string; typing: boolean } {
    const finishNow = opts.finishNow ?? false
    const typeIn = opts.typeIn ?? false
    const typesAtOnce = live || (typeIn && !!text)
    const [shown, setShown] = useState(() => (typesAtOnce ? '' : text))
    const [typing, setTyping] = useState(typesAtOnce)
    const revealRef = useRef<DraftReveal | null>(null)
    // The text last seen, so `typeIn` types each new text once.
    const seenRef = useRef<string | null>(null)
    // What is being typed, kept when a surface clears its streamed text as Brio finishes.
    const targetRef = useRef('')

    useEffect(() => {
        const begin = () => {
            revealRef.current = createDraftReveal(setShown, { instant: prefersReducedMotion() })
            targetRef.current = ''
            setShown('')
            setTyping(true)
        }
        // Brio started writing, or a new text arrived whole to be typed in: type from here.
        if (!revealRef.current && (live || (typeIn && !!text && text !== seenRef.current))) begin()
        seenRef.current = text
        const reveal = revealRef.current
        if (!reveal) {
            setShown(text)
            return
        }
        // Some surfaces clear their streamed text the moment Brio finishes (and show the finished
        // piece instead): what arrived is still typed out to its end first.
        const target = !live && text === '' ? targetRef.current : text
        targetRef.current = target
        reveal.push(target)
        if (live) return
        if (finishNow) {
            reveal.cancel()
            revealRef.current = null
            setShown(target)
            setTyping(false)
            return
        }
        // Brio has finished: done once the last word is on screen.
        const ctrl = new AbortController()
        reveal.settle(ctrl.signal).then(() => {
            reveal.cancel()
            if (revealRef.current === reveal) revealRef.current = null
            setShown(target)
            setTyping(false)
        }, () => {})
        return () => ctrl.abort()
    }, [text, live, finishNow, typeIn])

    // Gone (or remounted by Strict Mode): stop typing; a remount starts again from the top.
    useEffect(() => () => {
        revealRef.current?.cancel()
        revealRef.current = null
        seenRef.current = null
    }, [])

    return { shown, typing }
}

/**
 * Brio's words while it writes: dots before the first, then the words so far and the caret. Plain
 * text; a surface with its own finished rendering (Markdown, sections) shows that once `typing` is
 * false.
 */
export function BrioTypedText({ shown, className }: { shown: string; className?: string }) {
    if (!shown) return <ThinkingDots className={className} />
    return (
        <span className={className}>
            {shown}
            <TypingCaret />
        </span>
    )
}
