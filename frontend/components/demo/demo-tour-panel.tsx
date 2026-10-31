'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ArrowRight, Check, ChevronDown, ChevronRight, History, MapPinned, Pause, Play, Volume2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Brio } from '@/components/ui/brio'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useDemoTour } from '@/lib/demo/demo-tour-context'
import { TOUR_MODES, TOUR_NODES, TOUR_OUTLINE, nextTourNode, tourNode, tourSubtree, type PlacedTourNode, type TourMode, type TourNodeId } from '@/lib/demo/tour-chapters'
import { isNodeSeen, tourSteps, type TourRunStep } from '@/components/demo/demo-tour-steps'
import { TOUR_GLASS_CLASS, TOUR_MODE_LABELS, TOUR_NODE_ICONS, TourNodePlace, TourNodeTitle } from '@/components/demo/demo-tour-labels'
import { useStepProgress } from '@/lib/demo/tour-clock'

/** The panel's distance from the window's bottom-right corner, in both states. */
const EDGE = 16
/** The running panel's width (w-64). */
const RUNNING_WIDTH = 256

const ICON_BUTTON_CLASS =
    'flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-fg-subtle transition-colors hover:bg-black/5 hover:text-fg [&_svg]:h-3.5 [&_svg]:w-3.5'

/**
 * The product tour's one panel (.claude/plans/tour-chapters.md), always in the bottom-right corner
 * and frosted over the page. Before a run it is the start: how the tour plays, Resume, and every
 * chapter and section a click away. During a run it is the outline: where the run is, what's been
 * seen, the mode, and a click to anywhere. After a run it is the ending: what's next, Done, and
 * Sign up or on to the next part. Same corner, same glass, throughout; the outline and the ending
 * are the same aside, so one folds into the other.
 */
export function DemoTourPanel() {
    return (
        <>
            <TourStart />
            <TourCorner />
        </>
    )
}

/**
 * The panel's one check: a filled circle with a white tick, and an empty ring in its place when it's
 * off (with `ring`): a radio's mark for the modes, a seen mark for the chapters.
 */
function RoundCheck({ on, ring = false, small = false, label, className }: { on: boolean; ring?: boolean; small?: boolean; label?: string; className?: string }) {
    if (!on && !ring) return null
    return (
        <span
            className={cn(
                'flex shrink-0 items-center justify-center rounded-full border transition-colors',
                small ? 'h-3.5 w-3.5' : 'h-4 w-4',
                on ? 'border-action bg-action text-action-fg' : 'border-line-strong bg-white',
                className,
            )}
            {...(label && on ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
        >
            {on && <Check className={small ? 'h-2 w-2' : 'h-2.5 w-2.5'} strokeWidth={3} />}
        </span>
    )
}

/** Of a chapter's or section's steps, how many have been seen: every step of each section seen to its
 * end, and of the section the run is in, those before the current step (and the current one with `orCurrent`). */
function seenSteps(id: TourNodeId, completed: TourNodeId[], current?: TourRunStep, orCurrent = false) {
    const steps = tourSteps(id)
    const done = steps.filter((s) => (s.node === current?.node ? s.indexInNode < current.indexInNode + (orCurrent ? 1 : 0) : completed.includes(s.node))).length
    return { done, total: steps.length }
}

/**
 * Between the dashed ring and the round check: a ring that fills with the share of a part's steps seen.
 * With `playing` (Autoplay) the current step adds its clock, so the ring fills as the step's time runs
 * and stops when it's held; past the part's last step the check takes over.
 */
function ProgressRing({ done, total, playing = false, className }: { done: number; total: number; playing?: boolean; className?: string }) {
    const clock = useStepProgress()
    const fraction = Math.min(1, (done + (playing ? clock : 0)) / Math.max(total, 1))
    const r = 5.75
    const length = 2 * Math.PI * r
    return (
        <svg viewBox="0 0 14 14" className={cn('h-3.5 w-3.5 shrink-0 -rotate-90', className)} aria-hidden>
            <circle cx="7" cy="7" r={r} fill="white" strokeWidth="1.5" className="stroke-action/25" />
            {fraction > 0 && (
                <circle
                    cx="7"
                    cy="7"
                    r={r}
                    fill="none"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray={length}
                    strokeDashoffset={length * (1 - fraction)}
                    className={cn('stroke-action transition-[stroke-dashoffset] ease-linear motion-reduce:transition-none', playing ? 'duration-100' : 'duration-300')}
                />
            )}
        </svg>
    )
}

/** A part's ring away from where the run is: a check when it's been seen, partly filled when some of
 * it has, else a dashed ring, not started. The same in the start and the outline. */
function SeenMark({ id, completed, className }: { id: TourNodeId; completed: TourNodeId[]; className?: string }) {
    if (isNodeSeen(id, completed)) return <RoundCheck on small label="Seen" className={className} />
    const { done, total } = seenSteps(id, completed)
    return done > 0 ? <ProgressRing done={done} total={total} className={className} /> : <PendingRing className={className} />
}

/** Not started: a dashed ring, the size of the progress ring and the check, so a row's mark doesn't
 * shift as it goes from one to the next. Solid empty rings stay the radios' (the modes). */
function PendingRing({ className }: { className?: string }) {
    const r = 5.75
    // Ten dashes, ten gaps, evenly round the ring.
    const dash = (2 * Math.PI * r) / 20
    return (
        <svg viewBox="0 0 14 14" className={cn('h-3.5 w-3.5 shrink-0 -rotate-90', className)} aria-hidden>
            <circle cx="7" cy="7" r={r} fill="none" strokeWidth="1.5" strokeDasharray={`${dash} ${dash}`} className="stroke-fg-subtle" />
        </svg>
    )
}

/** The three modes as radio cards: each says what happens; the chosen one tinted and bordered, with a
 * round check where the others show an empty ring. */
function ModeCards({ value, onChange }: { value: TourMode; onChange: (mode: TourMode) => void }) {
    return (
        <div role="radiogroup" aria-label="How the tour plays" className="grid grid-cols-3 gap-1.5">
            {TOUR_MODES.map((mode) => {
                const selected = value === mode
                return (
                    <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onChange(mode)}
                        className={cn(
                            'relative flex min-w-0 flex-col items-start gap-1 rounded-control border px-2.5 pb-2 pt-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-action/30',
                            selected ? 'border-action bg-action/10' : 'border-line bg-white/60 hover:border-line-strong',
                        )}
                    >
                        <RoundCheck on={selected} ring className="absolute right-2 top-2" />
                        <span className={cn('flex [&_svg]:h-4 [&_svg]:w-4', selected ? 'text-action' : 'text-fg-muted')} aria-hidden>{TOUR_MODE_LABELS[mode].icon}</span>
                        <span className={cn('text-small font-medium', selected ? 'text-action' : 'text-fg')}>{TOUR_MODE_LABELS[mode].label}</span>
                        <span className="text-caption leading-snug text-fg-muted">{TOUR_MODE_LABELS[mode].short}</span>
                    </button>
                )
            })}
        </div>
    )
}

/** The chapters, each a click from playing; a chevron opens a chapter's sections, each a click from playing too. */
function ChapterTree({ open, onToggle }: { open: Set<TourNodeId>; onToggle: (id: TourNodeId) => void }) {
    const { completedNodes, startNode } = useDemoTour()
    // Seen; else how much of it has been, a ring that gives way to a play mark on hover: a row starts that part.
    const mark = (id: TourNodeId) => {
        if (isNodeSeen(id, completedNodes)) return <SeenMark id={id} completed={completedNodes} />
        return (
            <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                <span className="flex transition-opacity group-hover/row:opacity-0">
                    <SeenMark id={id} completed={completedNodes} />
                </span>
                <Play className="absolute h-3 w-3 text-fg-subtle opacity-0 transition-opacity group-hover/row:opacity-100" aria-hidden />
            </span>
        )
    }

    return (
        <ul className="flex flex-col gap-px">
            {TOUR_OUTLINE.map((chapter) => {
                const sections = chapter.children ?? []
                const expanded = open.has(chapter.id)
                return (
                    <li key={chapter.id}>
                        <div className="flex items-center rounded-control hover:bg-black/[0.04]">
                            <button
                                type="button"
                                onClick={() => startNode(chapter.id)}
                                className="group/row flex min-h-8 min-w-0 flex-1 items-center gap-2.5 py-1 pl-2 pr-1.5 text-left text-ui text-fg outline-none focus-visible:underline"
                            >
                                <span className="flex shrink-0 text-fg-muted [&_svg]:h-4 [&_svg]:w-4" aria-hidden>{TOUR_NODE_ICONS[chapter.id]}</span>
                                <span className="min-w-0 flex-1 truncate"><TourNodeTitle id={chapter.id} /></span>
                                {mark(chapter.id)}
                            </button>
                            {sections.length > 0 ? (
                                <button
                                    type="button"
                                    onClick={() => onToggle(chapter.id)}
                                    aria-expanded={expanded}
                                    aria-label={`${expanded ? 'Hide' : 'Show'} the parts of ${chapter.title}`}
                                    className={cn(ICON_BUTTON_CLASS, 'mr-1 h-7 w-7')}
                                >
                                    {expanded ? <ChevronDown /> : <ChevronRight />}
                                </button>
                            ) : (
                                <span className="mr-1 w-7 shrink-0" aria-hidden />
                            )}
                        </div>
                        {expanded && (
                            <ul className="mb-1 flex flex-col gap-px">
                                {sections.map((section) => (
                                    <li key={section.id}>
                                        <button
                                            type="button"
                                            onClick={() => startNode(section.id)}
                                            className="group/row flex min-h-7 w-full min-w-0 items-center gap-2.5 rounded-control py-1 pl-8 pr-9 text-left text-small text-fg-muted outline-none transition-colors hover:bg-black/[0.04] hover:text-fg focus-visible:underline"
                                        >
                                            <span className="flex shrink-0 text-fg-subtle [&_svg]:h-3.5 [&_svg]:w-3.5" aria-hidden>{TOUR_NODE_ICONS[section.id]}</span>
                                            <span className="min-w-0 flex-1 truncate"><TourNodeTitle id={section.id} /></span>
                                            {mark(section.id)}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </li>
                )
            })}
        </ul>
    )
}

/** The panel's head, in both states: the tour's mark and name, a line under it, and its buttons. */
function PanelHead({ title, caption, children }: { title: ReactNode; caption?: ReactNode; children?: ReactNode }) {
    return (
        <div className="flex shrink-0 items-start gap-2 px-3.5 pb-2 pt-3">
            <MapPinned className="mt-0.5 h-4 w-4 shrink-0 text-action" aria-hidden />
            <div className="min-w-0 flex-1">
                {title}
                {caption && <p className="truncate text-caption text-fg-subtle">{caption}</p>}
            </div>
            {children}
        </div>
    )
}

/**
 * Before a run: how the tour plays, Resume when a run was left partway, and the chapters. A dialog,
 * so focus stays in it and Escape closes it, with the page behind softly blurred until the visitor
 * picks something.
 */
function TourStart() {
    const { mode, setMode, narration, setNarration, showIntroModal, closeIntroModal, startTour, resumeTour, resumable } = useDemoTour()
    const [neverShowAgain, setNeverShowAgain] = useState(false)
    const hasProgress = resumable !== null && resumable.step > 0
    // Where the visitor stopped, and the chapter it's in, which starts open.
    const stoppedAt = hasProgress ? tourSteps(resumable.scope)[resumable.step]?.node ?? null : null
    const [open, setOpen] = useState<Set<TourNodeId>>(new Set())
    useEffect(() => {
        if (!showIntroModal) return
        const chapter = stoppedAt ? tourNode(stoppedAt).ancestors[0]?.id ?? stoppedAt : null
        setOpen(new Set(chapter ? [chapter] : []))
    }, [showIntroModal, stoppedAt])
    const toggle = (id: TourNodeId) => setOpen((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
    })

    const skip = () => closeIntroModal(neverShowAgain)
    const wholeTour = mode === 'autoplay' ? 'Play the whole tour' : mode === 'explore' ? 'Start exploring' : 'Take the whole tour'

    return (
        <DialogPrimitive.Root open={showIntroModal} onOpenChange={(next) => { if (!next) skip() }}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-[120] bg-black/10 backdrop-blur-[3px] data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
                <DialogPrimitive.Content
                    className={cn(
                        TOUR_GLASS_CLASS,
                        'fixed bottom-4 right-4 z-[121] flex max-h-[calc(100vh-2rem)] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-card text-fg outline-none',
                        'data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-2',
                    )}
                >
                    <PanelHead title={<DialogPrimitive.Title className="text-ui font-semibold text-fg">Product tour</DialogPrimitive.Title>}>
                        <DialogPrimitive.Close className={ICON_BUTTON_CLASS} aria-label="Close">
                            <X />
                        </DialogPrimitive.Close>
                    </PanelHead>

                    <div className="shrink-0 px-3.5">
                        <DialogPrimitive.Description className="text-small leading-relaxed text-fg-muted">
                            Everything here is sample data. How would you like to see it?
                        </DialogPrimitive.Description>
                        <div className="mt-2.5">
                            <ModeCards value={mode} onChange={setMode} />
                        </div>
                        {/* Off until turned on; Explore has no step cards to read */}
                        {mode !== 'explore' && (
                            <label className="mt-2.5 flex w-fit cursor-pointer select-none items-center gap-2 text-small text-fg-muted">
                                <Switch checked={narration} onCheckedChange={setNarration} />
                                <Volume2 className={cn('h-3.5 w-3.5 shrink-0', narration ? 'text-action' : 'text-fg-subtle')} aria-hidden />
                                <span>Read aloud by <Brio /></span>
                            </label>
                        )}
                        {stoppedAt && (
                            <button
                                type="button"
                                onClick={resumeTour}
                                className="mt-2.5 flex w-full min-w-0 items-center gap-2 rounded-control bg-black/[0.04] px-2.5 py-2 text-left text-small transition-colors hover:bg-black/[0.07]"
                            >
                                <History className="h-3.5 w-3.5 shrink-0 text-fg-muted" aria-hidden />
                                <span className="min-w-0 flex-1 truncate text-fg-muted">You stopped at <span className="text-fg"><TourNodePlace id={stoppedAt} /></span></span>
                                <span className="shrink-0 font-medium text-action">Resume</span>
                            </button>
                        )}
                    </div>

                    <nav aria-label="Chapters" className="subtle-scrollbar mt-2 min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
                        <ChapterTree open={open} onToggle={toggle} />
                    </nav>

                    <div className="flex shrink-0 items-center gap-2 border-t border-black/[0.06] px-3.5 py-2.5">
                        {!hasProgress && (
                            <label className="flex min-w-0 cursor-pointer select-none items-center gap-2 text-caption text-fg-muted">
                                <Checkbox checked={neverShowAgain} onCheckedChange={(v) => setNeverShowAgain(v === true)} />
                                <span className="truncate">Don&apos;t show again</span>
                            </label>
                        )}
                        <div className="ml-auto flex shrink-0 items-center gap-1.5">
                            <Button variant="ghost" size="sm" onClick={skip}>Skip</Button>
                            <Button size="sm" onClick={startTour}>
                                {mode === 'autoplay' && <Play className="h-3.5 w-3.5" />}
                                {wholeTour}
                            </Button>
                        </div>
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    )
}

/** The current mode as a pill that opens the three to switch, mid-run; Pause beside it in Autoplay. */
function ModeRow() {
    const { mode, setMode, paused, setPaused } = useDemoTour()
    return (
        <div className="flex shrink-0 items-center gap-1 px-3.5 pb-2">
            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        className="inline-flex h-6 items-center gap-1 rounded-full bg-action/10 pl-2 pr-1.5 text-caption font-medium text-action outline-none transition-colors hover:bg-action/15 focus-visible:ring-2 focus-visible:ring-action/30 [&_svg]:h-3 [&_svg]:w-3"
                        aria-label={`Mode: ${TOUR_MODE_LABELS[mode].label}. Change`}
                    >
                        {TOUR_MODE_LABELS[mode].icon}
                        {TOUR_MODE_LABELS[mode].label}
                        <ChevronDown />
                    </button>
                </DropdownMenuTrigger>
                {/* Above the tour's overlay and this panel */}
                <DropdownMenuContent side="top" align="start" className="z-[10060] w-60">
                    {TOUR_MODES.map((m) => (
                        <DropdownMenuItem key={m} onSelect={() => setMode(m)} className="items-start gap-2.5 py-2">
                            <span className="mt-0.5 flex text-fg-muted [&_svg]:h-4 [&_svg]:w-4" aria-hidden>{TOUR_MODE_LABELS[m].icon}</span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-small font-medium text-fg">{TOUR_MODE_LABELS[m].label}</span>
                                <span className="block text-caption text-fg-muted">{TOUR_MODE_LABELS[m].short}</span>
                            </span>
                            <RoundCheck on={m === mode} ring label="Current" className="mt-0.5" />
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
            {mode === 'autoplay' && (
                <button type="button" onClick={() => setPaused(!paused)} aria-label={paused ? 'Play' : 'Pause'} className={cn(ICON_BUTTON_CLASS, 'ml-auto')}>
                    {paused ? <Play /> : <Pause />}
                </button>
            )}
        </div>
    )
}

/**
 * Folds its content away by height, smoothly: a grid row easing between the content's own height
 * and none, with a fade, so there's no fixed height to guess. Folded content stays mounted, out of
 * the tab order. `name` marks the region (`data-collapse`), so the panel can measure its outline open
 * or folded, mid-fold too.
 */
function Collapse({ open, name, children }: { open: boolean; name?: string; children: ReactNode }) {
    return (
        <div
            data-collapse={name ?? ''}
            className={cn(
                'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
                open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
            )}
        >
            <div className="min-h-0 overflow-hidden" inert={!open}>{children}</div>
        </div>
    )
}

/**
 * The panel during a run and after it: one aside in the bottom-right corner, frosted, above the
 * tour's dimmed overlay (Joyride's zIndex, 10050) and below its step card (10150). At the end of a
 * run the outline folds away and the ending opens in its place, and Next folds the ending back into
 * the next run's outline: the panel changes in place, never one panel giving way to another.
 *
 * During a run (or while exploring) it is the outline. It lists the chapters, opens the current one
 * to its sections (and the current section to its own), marks where the run is and what's been seen,
 * and goes anywhere on a click: within the run, or as a new run of that part.
 *
 * It keeps to its corner. When the current step's target would sit under it, it folds to its
 * one-line head in place, and opens again on a step that leaves room. A target in the very corner
 * (Ask Brio) moves the folded head just past it along the bottom edge, where the step card, which
 * opens above the target, doesn't land; or just above it, when there's no room beside it. The
 * outline is hidden below 1024px, where the step card's "Engagements › Files" says where the visitor is.
 *
 * After a run the page is left undimmed to explore. The whole tour ends on "That's the tour": Replay
 * (back to the start), Done, Sign up. A chapter or section ends on "That's Files": All chapters,
 * Done, and on to what follows in the outline.
 */
function TourCorner() {
    const {
        mode, active, run, scope, stepIndex, completedNodes, showOutroModal, finishedNode,
        jumpToStep, startNode, endTour, closeNodeEnd, restartTour, replayTour, saveProgress,
    } = useDemoTour()
    const ending = !active && (showOutroModal || finishedNode !== null)
    // What the ending is about, kept while it folds away on Next, so its copy doesn't change mid-fold.
    const [endedNode, setEndedNode] = useState<TourNodeId | null>(null)
    if (ending && endedNode !== finishedNode) setEndedNode(finishedNode)
    const finished = endedNode ? tourNode(endedNode) : null
    const next = endedNode ? nextTourNode(endedNode) : null
    const done = () => (finishedNode ? closeNodeEnd() : endTour(false))
    const primaryRef = useRef<HTMLElement>(null)

    const exploring = mode === 'explore'
    // In Autoplay the current step counts as its time runs; otherwise once it's on screen.
    const playing = mode === 'autoplay'
    // The run's scope and step outlast it, so the outline folds away still showing where it ended.
    const steps = useMemo(() => tourSteps(scope), [scope])
    const current = steps[stepIndex]
    const currentNode = current ? tourNode(current.node) : null
    // The current node and the ones it sits in: open in the outline and marked as the way there.
    const trail = useMemo(() => new Set<TourNodeId>(currentNode ? [...currentNode.ancestors.map((a) => a.id), currentNode.id] : []), [currentNode])
    const [userFolded, setUserFolded] = useState(false)
    const [autoFolded, setAutoFolded] = useState(false)
    const folded = userFolded || autoFolded
    const paneRef = useRef<HTMLElement>(null)
    const navRef = useRef<HTMLElement>(null)
    const activeRef = useRef<HTMLButtonElement>(null)
    // How far the folded head moves from its corner, to clear a target in the corner itself.
    const [nudge, setNudge] = useState({ right: 0, bottom: 0 })

    /** How tall the panel stands with its outline open and folded, worked out from what's on screen, mid-fold or not. */
    const heights = () => {
        const pane = paneRef.current
        if (!pane) return { open: 360, folded: 60 }
        const regions = Array.from(pane.querySelectorAll<HTMLElement>('[data-collapse="outline"]'))
        const showing = regions.reduce((n, r) => n + r.offsetHeight, 0)
        const whole = regions.reduce((n, r) => n + (r.firstElementChild as HTMLElement).scrollHeight, 0)
        const foldedHeight = pane.offsetHeight - showing
        return { open: foldedHeight + whole, folded: foldedHeight }
    }

    // The current part in view in the outline, scrolling the outline's own list and nothing else.
    useEffect(() => {
        const nav = navRef.current
        const row = activeRef.current
        if (!nav || !row || folded) return
        const n = nav.getBoundingClientRect()
        const r = row.getBoundingClientRect()
        if (r.top < n.top) nav.scrollTop -= n.top - r.top
        else if (r.bottom > n.bottom) nav.scrollTop += r.bottom - n.bottom
    }, [current?.node, folded])

    // Out of the way of the step without moving: once its target has settled, fold if it would sit under the open panel.
    useEffect(() => {
        if (!(run || exploring) || !current) return
        const timer = setTimeout(() => {
            const target = document.querySelector(current.target)?.getBoundingClientRect()
            if (!target) return
            const { open, folded: foldedHeight } = heights()
            const inColumn = target.right > window.innerWidth - EDGE - RUNNING_WIDTH
            const fold = inColumn && target.bottom > window.innerHeight - EDGE - open
            const underHead = fold && target.bottom > window.innerHeight - EDGE - foldedHeight
            setAutoFolded(fold)
            if (!underHead) setNudge({ right: 0, bottom: 0 })
            else if (target.left - 8 - RUNNING_WIDTH >= EDGE) setNudge({ right: window.innerWidth - EDGE - target.left + 8, bottom: 0 })
            else setNudge({ right: 0, bottom: window.innerHeight - EDGE - target.top + 8 })
        }, (current.settle ?? 0) + 500)
        return () => clearTimeout(timer)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [run, exploring, current])

    // The ending's next move is a keypress away, and Escape is Done, as the modal it replaced had it.
    // Focus waits a beat: the run's teardown (Joyride, a menu the tour held open) hands focus back first.
    useEffect(() => {
        if (!ending) return
        const focus = setTimeout(() => primaryRef.current?.focus({ preventScroll: true }), 120)
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !e.defaultPrevented) done()
        }
        window.addEventListener('keydown', onKey)
        return () => {
            clearTimeout(focus)
            window.removeEventListener('keydown', onKey)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ending, finishedNode])

    if (!active && !ending) return null

    // Chapters always; a chapter's sections while the run is in it; a section's own while the run is in that section.
    const shown = TOUR_NODES.filter((n) => n.depth === 0 || trail.has(n.ancestors[n.ancestors.length - 1].id))
    const outlineOpen = !ending && !folded

    const go = (node: PlacedTourNode) => {
        const ids = new Set(tourSubtree(node.id).map((n) => n.id))
        const i = steps.findIndex((s) => ids.has(s.node))
        if (i >= 0) {
            saveProgress(i)
            jumpToStep(i)
        } else {
            startNode(node.id)
        }
    }

    const close = () => {
        saveProgress(stepIndex)
        endTour(false)
    }

    const toggleFold = () => {
        if (folded) {
            setUserFolded(false)
            setAutoFolded(false)
            setNudge({ right: 0, bottom: 0 })
        } else {
            setUserFolded(true)
        }
    }

    return (
        <aside
            ref={paneRef}
            aria-label={ending ? 'Product tour' : 'Product tour outline'}
            className={cn(
                TOUR_GLASS_CLASS,
                'fixed z-[10051] flex-col overflow-hidden rounded-card text-fg transition-[right,bottom,width] duration-300 ease-out animate-in fade-in slide-in-from-bottom-2 motion-reduce:transition-none',
                ending ? 'flex w-72 max-w-[calc(100vw-2rem)]' : 'hidden w-64 lg:flex',
            )}
            style={{ right: EDGE + (ending ? 0 : nudge.right), bottom: EDGE + (ending ? 0 : nudge.bottom) }}
        >
            {/* The head's words fade across when the outline turns into the ending, and back */}
            <PanelHead
                title={
                    <p key={ending ? 'ending' : 'outline'} className="truncate text-ui font-semibold text-fg animate-in fade-in duration-300">
                        {ending ? <>That&apos;s {finished ? <TourNodeTitle id={finished.id} /> : 'the tour'}</> : 'Product tour'}
                    </p>
                }
                caption={
                    <span key={ending ? 'ending' : 'outline'} className="animate-in fade-in duration-300">
                        {ending
                            ? finished && finished.ancestors.length > 0 ? <>Product tour · <TourNodePlace id={finished.ancestors[finished.ancestors.length - 1].id} /></> : 'Product tour'
                            : folded && currentNode
                                ? <TourNodePlace id={currentNode.id} />
                                : exploring
                                    ? <>Exploring · {scope ? <TourNodeTitle id={scope} /> : 'the whole tour'}</>
                                    : <>{stepIndex + 1} of {steps.length} · {scope ? <TourNodeTitle id={scope} /> : 'The whole tour'}</>}
                    </span>
                }
            >
                {!ending && (
                    <>
                        <button type="button" onClick={toggleFold} className={ICON_BUTTON_CLASS} aria-label={folded ? 'Show the outline' : 'Fold the outline'} aria-expanded={!folded}>
                            <ChevronDown className={cn('transition-transform duration-300 ease-out', folded && 'rotate-180')} />
                        </button>
                        <button type="button" onClick={close} className={ICON_BUTTON_CLASS} aria-label="Close the tour; resume it from the map icon">
                            <X />
                        </button>
                    </>
                )}
            </PanelHead>

            <Collapse name="outline" open={outlineOpen}>
                <ModeRow />
            </Collapse>

            <Collapse open={!ending}>
                <div className={cn('h-0.5 bg-black/[0.06]', exploring && 'invisible')}>
                    <div className="h-full bg-action transition-[width] duration-300" style={{ width: `${((stepIndex + 1) / Math.max(steps.length, 1)) * 100}%` }} />
                </div>
            </Collapse>

            <Collapse name="outline" open={outlineOpen}>
                <nav ref={navRef} className="subtle-scrollbar max-h-[min(24rem,calc(100vh-12rem))] overflow-y-auto p-1.5">
                    <ul className="flex flex-col gap-px">
                        {shown.map((node) => {
                            const here = node.id === current?.node
                            return (
                                <li key={node.id}>
                                    <button
                                        ref={here ? activeRef : undefined}
                                        type="button"
                                        onClick={() => go(node)}
                                        aria-current={here ? 'step' : undefined}
                                        className={cn(
                                            'flex min-h-7 w-full min-w-0 items-start gap-2 rounded-control py-1 pr-2 text-left leading-snug transition-colors hover:bg-black/[0.04]',
                                            node.depth === 0 ? 'pl-2 text-ui' : 'text-small',
                                            node.depth === 1 && 'pl-6',
                                            node.depth === 2 && 'pl-10',
                                            here ? 'bg-action/10 font-medium text-fg' : trail.has(node.id) ? 'font-medium text-fg' : 'text-fg-muted',
                                        )}
                                    >
                                        {/* The page's icon, in the accent where the run is */}
                                        <span className={cn('mt-[0.2em] flex h-3.5 w-3.5 shrink-0 items-center [&_svg]:h-3.5 [&_svg]:w-3.5', here ? 'text-action' : 'text-fg-subtle')} aria-hidden>
                                            {TOUR_NODE_ICONS[node.id]}
                                        </span>
                                        <span className="min-w-0 flex-1"><TourNodeTitle id={node.id} /></span>
                                        {/* Where the run is, a ring filling as it goes; elsewhere, and once it's over, seen or not */}
                                        {active && current && trail.has(node.id) ? (
                                            <ProgressRing {...seenSteps(node.id, completedNodes, current, !playing)} playing={playing} className="mt-[0.2em]" />
                                        ) : (
                                            <SeenMark id={node.id} completed={completedNodes} className="mt-[0.2em]" />
                                        )}
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                </nav>
            </Collapse>

            <Collapse open={ending}>
                <p className="px-3.5 text-small leading-relaxed text-fg-muted">
                    {finished
                        ? next
                            ? <>Up next: <span className="text-fg"><TourNodePlace id={next.id} /></span>.</>
                            : 'That was the last part of the tour. The sample data is yours to explore; nothing here is saved.'
                        : 'The sample data is yours to explore; nothing here is saved. Replay any time from the map icon at the top.'}
                </p>
                <div className="mt-3 flex items-center gap-1.5 border-t border-black/[0.06] px-3.5 py-2.5">
                    {/* All chapters keeps the checks, to show what's left; Replay clears them for a fresh pass */}
                    <Button variant="ghost" size="sm" onClick={finished ? restartTour : replayTour} className="shrink-0">
                        {finished ? 'All chapters' : <><Play className="h-3.5 w-3.5" />Replay</>}
                    </Button>
                    <div className="ml-auto flex min-w-0 items-center gap-1.5">
                        <Button variant="outline" size="sm" onClick={done} className="shrink-0">Done</Button>
                        {finished ? (
                            next && (
                                // "Up next: Engagements › Board" above says where; the button stays short enough not to truncate.
                                <Button ref={primaryRef as React.Ref<HTMLButtonElement>} size="sm" className="shrink-0" onClick={() => startNode(next.id)} aria-label={`Next: ${next.title}`}>
                                    Next
                                    <ArrowRight className="h-3.5 w-3.5" />
                                </Button>
                            )
                        ) : (
                            <Link
                                ref={primaryRef as React.Ref<HTMLAnchorElement>}
                                href="/signup"
                                target="_blank"
                                rel="noopener noreferrer"
                                className={buttonVariants({ size: 'sm', className: 'shrink-0' })}
                            >
                                Sign up
                            </Link>
                        )}
                    </div>
                </div>
            </Collapse>
        </aside>
    )
}
