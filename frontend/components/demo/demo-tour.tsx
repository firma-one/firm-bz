'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Joyride, EVENTS, STATUS, type EventData, type Controls, type TooltipRenderProps } from 'react-joyride'
import { Pause, Play, Volume2, VolumeX, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Hint } from '@/components/ui/tooltip'
import { useDemoTour } from '@/lib/demo/demo-tour-context'
import { GUIDE_PARAM, autoplayDuration, tourNode, type TourNodeId } from '@/lib/demo/tour-chapters'
import { tourSteps } from '@/components/demo/demo-tour-steps'
import { setStepProgress } from '@/lib/demo/tour-clock'
import { NARRATION_BEAT_MS, narrationClip } from '@/lib/demo/tour-narration'
import { revealTimes, type SpokenWord } from '@/lib/demo/tour-read-along'
import { TOUR_CARD_GLASS_CLASS, TourNodeTitle } from '@/components/demo/demo-tour-labels'
import { cn } from '@/lib/utils'

const JoyrideAny = Joyride as any

/** What the step card needs beyond Joyride's own step: its node, where it sits in it, and its own autoplay time if it has one. */
interface StepCardData {
    node: TourNodeId
    indexInNode: number
    nodeSize: number
    wholeTour: boolean
    duration?: number
}

/**
 * Autoplay's clock for one step: runs while autoplay is on, not paused, not hovered and the page is
 * in view, and moves on once the step's time is up. The time is the step's own, or worked out from
 * how much the card says (autoplayDuration). Starts again on every step, and when the time changes
 * (narration turned on or off). While the card is read aloud, the clock waits for the clip to start
 * and then follows it (`follow`), so a clip that stalls loading isn't cut short; the beat after it
 * runs on time.
 */
function useAutoplay({ index, on, held, waiting = false, duration, follow, read, next }: {
    index: number
    on: boolean
    held: boolean
    waiting?: boolean
    duration?: number
    follow?: () => number | null
    read: () => string
    next: () => void
}) {
    const [elapsed, setElapsed] = useState(0)
    const [total, setTotal] = useState(duration ?? 8000)
    const advanced = useRef(false)
    const followRef = useRef(follow)
    followRef.current = follow

    useLayoutEffect(() => {
        setElapsed(0)
        advanced.current = false
        setTotal(duration ?? autoplayDuration(read()))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [index, duration])

    const running = on && !held && !waiting
    useEffect(() => {
        if (!running) return
        let last = performance.now()
        const timer = setInterval(() => {
            const now = performance.now()
            const at = followRef.current?.()
            if (at != null) setElapsed(at)
            // A hidden page doesn't count: the visitor would come back to a step they never saw.
            else if (!document.hidden) setElapsed((e) => e + (now - last))
            last = now
        }, 100)
        return () => clearInterval(timer)
    }, [running, index])

    useEffect(() => {
        if (!on || advanced.current || elapsed < total) return
        advanced.current = true
        next()
    }, [on, elapsed, total, next])

    const progress = Math.min(1, elapsed / total)
    // Shared with the tour panel, whose ring for the current section fills with it.
    useEffect(() => setStepProgress(on ? progress : 0), [on, progress])
    useEffect(() => () => setStepProgress(0), [])

    return progress
}

type VoiceStatus = 'off' | 'loading' | 'playing' | 'ended' | 'blocked'

/**
 * A step card read aloud: plays the step's clip when the card opens, holds it while the tour is
 * paused or the page is hidden, and stops it when the card goes. `blocked` when the browser won't
 * play it (no click on the page yet, say): the card then runs as if narration were off. `position`
 * is how far the clip has played (ms) while it's playing, for Autoplay's clock to follow; `words`,
 * when each word in the clip is spoken, for the card to reveal its words as they're read.
 */
function useNarration({ index, src, timings, paused }: { index: number; src: string | null; timings: string | null; paused: boolean }) {
    const [status, setStatus] = useState<VoiceStatus>(src ? 'loading' : 'off')
    const [words, setWords] = useState<SpokenWord[] | null>(null)
    const audioRef = useRef<HTMLAudioElement | null>(null)

    // When each word is spoken: small, fetched with the clip; without it the card just isn't revealed.
    useEffect(() => {
        setWords(null)
        if (!timings) return
        const request = new AbortController()
        fetch(timings, { signal: request.signal })
            .then((response) => (response.ok ? response.json() : null))
            .then((data: { words?: SpokenWord[] } | null) => setWords(data?.words ?? null))
            .catch(() => {})
        return () => request.abort()
    }, [timings, index])
    const pausedRef = useRef(paused)
    pausedRef.current = paused

    // Only the browser's autoplay rule counts as refused, and only for this card's clip: a play cut
    // short by a pause (the card moving on mid-start) rejects too, and isn't a refusal.
    const play = (audio: HTMLAudioElement) =>
        audio.play().catch((error: DOMException) => {
            if (error.name === 'NotAllowedError' && audioRef.current === audio) setStatus('blocked')
        })

    useEffect(() => {
        if (!src) {
            setStatus('off')
            return
        }
        const audio = new Audio(src)
        audioRef.current = audio
        setStatus('loading')
        const onPlaying = () => setStatus('playing')
        const onEnded = () => setStatus('ended')
        audio.addEventListener('playing', onPlaying)
        audio.addEventListener('ended', onEnded)
        if (!pausedRef.current && !document.hidden) void play(audio)
        return () => {
            audio.removeEventListener('playing', onPlaying)
            audio.removeEventListener('ended', onEnded)
            audio.pause()
            audioRef.current = null
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [src, index])

    useEffect(() => {
        const audio = audioRef.current
        if (!audio || audio.ended) return
        if (paused) audio.pause()
        else if (!document.hidden) void play(audio)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paused])

    // Not read to an empty room: a hidden page holds the clip, as it holds Autoplay's clock.
    useEffect(() => {
        const onVisibility = () => {
            const audio = audioRef.current
            if (!audio || audio.ended) return
            if (document.hidden) audio.pause()
            else if (!pausedRef.current) void play(audio)
        }
        document.addEventListener('visibilitychange', onVisibility)
        return () => document.removeEventListener('visibilitychange', onVisibility)
    }, [])

    const position = useCallback(() => {
        const audio = audioRef.current
        return audio && status === 'playing' && !audio.ended ? audio.currentTime * 1000 : null
    }, [status])

    return { status, position, words }
}

/** The ::highlight in globals.css that keeps a card's words faint until they're spoken. */
const UNSPOKEN_HIGHLIGHT = 'tour-unspoken'

/**
 * The card's words streaming in with the narration: each stays faint until Brio says it, then
 * comes up, so the card fills in as it's read; still legible ahead, for anyone reading faster.
 * Covers the title and copy (`data-tour-spoken`), skipping what's hidden from screen readers as
 * the narration does. Done with the CSS Custom Highlight API, which colors stretches of text without
 * touching the card's DOM (React's to change); a browser without it shows the card as usual.
 * `heard` is how far the clip has got, in seconds: 0 until it starts, Infinity once it's over.
 */
function useStreamingReveal({ cardRef, index, on, words, heard }: {
    cardRef: React.RefObject<HTMLDivElement | null>
    index: number
    on: boolean
    words: SpokenWord[] | null
    heard: () => number
}) {
    const heardRef = useRef(heard)
    heardRef.current = heard

    useEffect(() => {
        const card = cardRef.current
        if (!on || !words || !card || typeof Highlight === 'undefined' || !CSS.highlights) return
        const ranges: Range[] = []
        const shown: string[] = []
        card.querySelectorAll('[data-tour-spoken]').forEach((root) => {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
                acceptNode: (node) => (node.parentElement?.closest('[aria-hidden="true"]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
            })
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                const text = node.textContent ?? ''
                const word = /\S+/g
                for (let match = word.exec(text); match; match = word.exec(text)) {
                    const range = document.createRange()
                    range.setStart(node, match.index)
                    range.setEnd(node, match.index + match[0].length)
                    ranges.push(range)
                    shown.push(match[0])
                }
            }
        })
        const times = revealTimes(shown, words)
        const unspoken = new Highlight()
        CSS.highlights.set(UNSPOKEN_HIGHLIGHT, unspoken)
        // A tick every 50ms, like Autoplay's clock rather than every frame: a word takes about 300ms
        // to say, and the card keeps up whether or not the browser is painting frames.
        let revealed = -1
        const tick = () => {
            const at = heardRef.current()
            let count = 0
            while (count < times.length && times[count] <= at) count++
            if (count !== revealed) {
                revealed = count
                unspoken.clear()
                for (let i = count; i < ranges.length; i++) unspoken.add(ranges[i])
            }
            if (count === ranges.length) clearInterval(timer)
        }
        const timer = setInterval(tick, 50)
        tick()
        return () => {
            clearInterval(timer)
            CSS.highlights.delete(UNSPOKEN_HIGHLIGHT)
        }
    }, [cardRef, index, on, words])
}

/**
 * The tour's step card, in the app's design system: a popover-style card with the step's place in
 * the outline above its title (Engagements › Files › Details), its copy in muted text, its place in
 * that section and Skip on the left, Back and Next on the right. Joyride portals it to the body,
 * outside the demo shell.
 *
 * In Autoplay it moves on by itself: a bar at its top fills as the step's time runs (only this step's
 * time; where the visitor is in the tour stays in the tour panel). Pause holds it, and so does
 * pointing at the card to read it; held, the bar greys, and a pause says so at the bar's end and
 * offers Play.
 *
 * With narration on (the speaker beside its close button), the card is read aloud in Brio's voice
 * as it opens, its words coming up from faint as they're said. In Autoplay the step then lasts as
 * long as its clip and a beat, and pointing at the card doesn't hold it, since it can't be read
 * along mid-sentence; Pause pauses the voice too.
 *
 * Joyride's button props carry a `title`, which would show the browser's native tooltip; it is
 * dropped in favor of the visible labels.
 */
function TourTooltip({ backProps, closeProps, primaryProps, skipProps, step, index, isLastStep, tooltipProps, controls }: TooltipRenderProps) {
    const { mode, paused, setPaused, narration, setNarration } = useDemoTour()
    const { title: _back, ...back } = backProps
    const { title: _close, ...close } = closeProps
    const { title: _next, ...next } = primaryProps
    const { title: _skip, ...skip } = skipProps
    const card = step.data as StepCardData
    const node = tourNode(card.node)
    const crumbs = [...node.ancestors.map((a) => a.id), node.id]
    // The section's own title already says it when the step's title is the same.
    if (step.title === node.title) crumbs.pop()

    const cardRef = useRef<HTMLDivElement>(null)
    const [hovered, setHovered] = useState(false)
    const autoplay = mode === 'autoplay'
    const advance = useCallback(() => controls.next(), [controls])
    const clip = narrationClip(card)
    const voice = useNarration({
        index,
        src: narration && clip ? clip.src : null,
        timings: narration && clip ? clip.timings : null,
        paused: autoplay && paused,
    })
    // Read aloud: on, with a clip, and not refused by the browser.
    const reading = voice.status === 'loading' || voice.status === 'playing' || voice.status === 'ended'
    useStreamingReveal({
        cardRef,
        index,
        on: reading,
        words: voice.words,
        heard: () => (voice.status === 'ended' ? Infinity : (voice.position() ?? 0) / 1000),
    })
    const held = paused || (hovered && !reading)
    const progress = useAutoplay({
        index,
        on: autoplay,
        held,
        waiting: voice.status === 'loading',
        duration: reading && clip ? clip.seconds * 1000 + NARRATION_BEAT_MS : card.duration,
        follow: voice.position,
        read: () => cardRef.current?.innerText ?? '',
        next: advance,
    })

    return (
        <div
            {...tooltipProps}
            ref={cardRef}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className={cn(TOUR_CARD_GLASS_CLASS, 'relative w-[300px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-card p-4 text-left')}
        >
            {/* Autoplay's clock: this step's time, filling; grey while held, and "Paused" where it stopped.
                The row is the label's height either way, so pausing doesn't move the card's copy. */}
            {autoplay && (
                <div className="mb-2 flex h-3 items-center gap-2">
                    <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-black/[0.06]" role="progressbar" aria-label="Time on this step" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
                        <div className={cn('h-full rounded-full transition-[width,background-color] duration-100 ease-linear', held ? 'bg-black/20' : 'bg-action')} style={{ width: `${progress * 100}%` }} />
                    </div>
                    {paused && <span className="text-caption leading-none text-fg-subtle">Paused</span>}
                </div>
            )}
            <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                    {crumbs.length > 0 && (
                        <p className="mb-0.5 truncate text-caption text-fg-subtle">
                            {crumbs.map((id, i) => <span key={id}>{i > 0 && ' › '}<TourNodeTitle id={id} /></span>)}
                        </p>
                    )}
                    <h3 data-tour-spoken className="text-ui font-semibold text-fg">{step.title as React.ReactNode}</h3>
                </div>
                {clip && (
                    <Hint label={narration ? 'Stop reading aloud' : 'Read aloud'} side="bottom">
                        <button
                            type="button"
                            onClick={() => setNarration(!narration)}
                            aria-label={narration ? 'Stop reading aloud' : 'Read aloud'}
                            aria-pressed={narration}
                            className={cn(
                                '-mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-control transition-colors hover:bg-surface-hover',
                                narration ? 'text-action' : 'text-fg-subtle hover:text-fg',
                            )}
                        >
                            {narration ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                        </button>
                    </Hint>
                )}
                <button
                    {...close}
                    type="button"
                    className="-mr-1.5 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>
            <div data-tour-spoken className="mt-1.5 space-y-2 text-small leading-relaxed text-fg-muted [&_li]:pl-0.5 [&_strong]:font-medium [&_strong]:text-fg [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-4">
                {step.content as React.ReactNode}
            </div>
            <div className="mt-4 flex items-center gap-3">
                {card.nodeSize > 1 && <span className="whitespace-nowrap text-caption tabular-nums text-fg-subtle">{card.indexInNode + 1} of {card.nodeSize}</span>}
                <button {...skip} type="button" className="text-caption text-fg-subtle underline-offset-2 transition-colors hover:text-fg-muted hover:underline">
                    {card.wholeTour ? 'Skip tour' : 'Skip'}
                </button>
                <div className="ml-auto flex items-center gap-1.5">
                    {autoplay && (
                        <Hint label={paused ? 'Play' : 'Pause'} side="bottom">
                            <button
                                type="button"
                                onClick={() => setPaused(!paused)}
                                aria-label={paused ? 'Play' : 'Pause'}
                                className="flex h-7 w-7 items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
                            >
                                {paused ? <Play className="h-3.5 w-3.5 text-action" /> : <Pause className="h-3.5 w-3.5" />}
                            </button>
                        </Hint>
                    )}
                    {index > 0 && <Button {...back} type="button" variant="ghost" size="sm">Back</Button>}
                    <Button {...next} type="button" size="sm">{isLastStep ? 'Finish' : 'Next'}</Button>
                </div>
            </div>
        </div>
    )
}

/** Explore: a short pulse around the part the outline took the visitor to, so they see where it is. */
function flash(target: string) {
    const el = document.querySelector<HTMLElement>(target)
    el?.animate?.(
        [
            { outline: '2px solid hsl(var(--ui-action) / 0)', outlineOffset: '8px' },
            { outline: '2px solid hsl(var(--ui-action) / 0.9)', outlineOffset: '3px' },
            { outline: '2px solid hsl(var(--ui-action) / 0)', outlineOffset: '3px' },
        ],
        { duration: 1400, iterations: 2, easing: 'ease-out' },
    )
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/** The guided tour (.claude/plans/tour-chapters.md): steps through one chapter or section, or every
 * one for the whole tour, driving router navigation across the tour's pages and tabs as it advances,
 * with the step card in the app's design system (TourTooltip). */
export function DemoTour() {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const { mode, run, stepIndex, scope, launch, setStepIndex, setRun, endTour, saveProgress, markNodeDone } = useDemoTour()
    const steps = useMemo(() => tourSteps(scope), [scope])
    const pathnameRef = useRef(pathname)
    const searchParamsRef = useRef(searchParams)
    const retryCountRef = useRef(0)
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    pathnameRef.current = pathname
    searchParamsRef.current = searchParams

    const clearRetry = () => {
        if (retryTimerRef.current) {
            clearTimeout(retryTimerRef.current)
            retryTimerRef.current = null
        }
    }

    const navigateForStep = async (index: number) => {
        const step = steps[index]
        if (!step) return
        const [targetPath, targetQuery] = step.route.split('?')
        const samePath = targetPath === pathnameRef.current
        // A deep link (?guide=) is replaced, so Back doesn't land on it and start the chapter again.
        const go = searchParamsRef.current.has(GUIDE_PARAM) ? router.replace : router.push
        if (!samePath) {
            go(step.route, { scroll: false })
            await sleep(500 + (step.settle ?? 0))
        } else if ((targetQuery ?? '') !== searchParamsRef.current.toString()) {
            go(step.route, { scroll: false })
            await sleep(350 + (step.settle ?? 0))
        }
        // The tour brings the target into view itself, at once and only as far as needed: Joyride's own
        // animated scroll could leave a step waiting with no card, mid-run.
        if (!step.skipScroll) document.querySelector(step.target)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        setStepIndex(index)
    }

    // A run starts (or resumes) on its step's page: navigate there first, then show the step.
    useEffect(() => {
        if (!launch) return
        clearRetry()
        retryCountRef.current = 0
        // Explore shows no step card: it takes the visitor to the part's page and points it out.
        void navigateForStep(stepIndex).then(() => {
            if (mode === 'explore') flash(steps[stepIndex].target)
            else setRun(true)
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [launch])

    const handleJoyrideEvent = (data: EventData, _controls: Controls) => {
        const { status, type, index } = data

        if (type === EVENTS.TARGET_NOT_FOUND) {
            const isLastStep = index >= steps.length - 1
            if (!isLastStep && retryCountRef.current >= 20) {
                // Skipped so the run goes on; lib/demo/tour-chapters.test.ts catches a target that's gone for good.
                if (process.env.NODE_ENV === 'development') console.warn(`Product tour: skipped a step, its target never appeared: ${steps[index]?.target}`)
                clearRetry()
                retryCountRef.current = 0
                void navigateForStep(index + 1)
                return
            }
            retryCountRef.current += 1
            const shouldReNav = retryCountRef.current % 3 === 0
            retryTimerRef.current = setTimeout(async () => {
                if (shouldReNav) await navigateForStep(index)
                setRun(false)
                setTimeout(() => setRun(true), 80)
            }, 700)
            return
        }

        if (type === EVENTS.STEP_BEFORE) {
            clearRetry()
            retryCountRef.current = 0
        }

        if (type === EVENTS.STEP_AFTER) {
            clearRetry()
            const { action } = data as any
            if (action === 'close' || action === 'skip') {
                saveProgress(index)
                setStepIndex(index)
                endTour(false)
                return
            }
            const nextIndex = action === 'prev' ? Math.max(0, index - 1) : index + 1
            // Past a section's last step, forward: that section is done.
            const step = steps[index]
            if (action !== 'prev' && step && step.indexInNode === step.nodeSize - 1) markNodeDone(step.node)
            if (nextIndex >= steps.length) {
                endTour(true)
                return
            }
            saveProgress(nextIndex)
            void navigateForStep(nextIndex)
            return
        }

        if (status === STATUS.FINISHED || type === EVENTS.TOUR_END) {
            endTour(true)
        }
    }

    if (typeof window === 'undefined') return null

    return (
        <JoyrideAny
            // A fresh Joyride per run: a chapter's steps replace the last run's.
            key={launch}
            run={run}
            stepIndex={stepIndex}
            steps={steps.map((s) => ({
                target: s.target,
                title: s.title,
                content: s.content,
                placement: s.placement,
                disableBeacon: s.disableBeacon,
                // navigateForStep scrolls instead.
                skipScroll: true,
                data: { node: s.node, indexInNode: s.indexInNode, nodeSize: s.nodeSize, wholeTour: !scope, duration: s.duration } satisfies StepCardData,
                // The tour must never abort from an accidental click-outside or Escape press — only the
                // tooltip's own close (X) button should end it. disableOverlayClose is a legacy v2 prop with
                // no effect in v3; overlayClickAction/dismissKeyAction are the real per-step gates.
                overlayClickAction: false as const,
                dismissKeyAction: false as const,
                ...(s.disableFlip ? { floatingOptions: { flipOptions: false } } : {}),
            }))}
            continuous
            onEvent={handleJoyrideEvent}
            tooltipComponent={TourTooltip}
            options={{
                arrowColor: '#ffffff',
                overlayColor: 'rgba(15, 15, 15, 0.45)',
                spotlightPadding: 8,
                spotlightRadius: 6,
                zIndex: 10050,
                skipBeacon: true,
                showProgress: false,
                scrollDuration: 400,
                scrollOffset: 40,
            }}
        />
    )
}
