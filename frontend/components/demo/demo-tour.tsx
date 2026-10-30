'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Joyride, EVENTS, STATUS, type EventData, type Controls, type TooltipRenderProps } from 'react-joyride'
import { Pause, Play, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Hint } from '@/components/ui/tooltip'
import { useDemoTour } from '@/lib/demo/demo-tour-context'
import { GUIDE_PARAM, autoplayDuration, tourNode, type TourNodeId } from '@/lib/demo/tour-chapters'
import { tourSteps } from '@/components/demo/demo-tour-steps'
import { setStepProgress } from '@/lib/demo/tour-clock'
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
 * how much the card says (autoplayDuration). Starts again on every step.
 */
function useAutoplay({ index, on, held, duration, read, next }: { index: number; on: boolean; held: boolean; duration?: number; read: () => string; next: () => void }) {
    const [elapsed, setElapsed] = useState(0)
    const [total, setTotal] = useState(duration ?? 8000)
    const advanced = useRef(false)

    useLayoutEffect(() => {
        setElapsed(0)
        advanced.current = false
        setTotal(duration ?? autoplayDuration(read()))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [index])

    const running = on && !held
    useEffect(() => {
        if (!running) return
        let last = performance.now()
        const timer = setInterval(() => {
            const now = performance.now()
            // A hidden page doesn't count: the visitor would come back to a step they never saw.
            if (!document.hidden) setElapsed((e) => e + (now - last))
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
 * Joyride's button props carry a `title`, which would show the browser's native tooltip; it is
 * dropped in favor of the visible labels.
 */
function TourTooltip({ backProps, closeProps, primaryProps, skipProps, step, index, isLastStep, tooltipProps, controls }: TooltipRenderProps) {
    const { mode, paused, setPaused } = useDemoTour()
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
    const held = paused || hovered
    const progress = useAutoplay({
        index,
        on: autoplay,
        held,
        duration: card.duration,
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
                    <h3 className="text-ui font-semibold text-fg">{step.title as React.ReactNode}</h3>
                </div>
                <button
                    {...close}
                    type="button"
                    className="-mr-1.5 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>
            <div className="mt-1.5 space-y-2 text-small leading-relaxed text-fg-muted [&_li]:pl-0.5 [&_strong]:font-medium [&_strong]:text-fg [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-4">
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
