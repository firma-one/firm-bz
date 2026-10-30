'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Check, ChevronDown, ChevronRight, History, MapPinned, Pause, Play, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useDemoTour } from '@/lib/demo/demo-tour-context'
import { TOUR_MODES, TOUR_NODES, TOUR_OUTLINE, tourNode, tourSubtree, type PlacedTourNode, type TourMode, type TourNodeId } from '@/lib/demo/tour-chapters'
import { isNodeSeen, tourSteps } from '@/components/demo/demo-tour-steps'
import { TOUR_GLASS_CLASS, TOUR_MODE_LABELS, TOUR_NODE_ICONS, TourNodePlace, TourNodeTitle } from '@/components/demo/demo-tour-labels'

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
 * seen, the mode, and a click to anywhere. Same corner, same rows, same marks in both.
 */
export function DemoTourPanel() {
    return (
        <>
            <TourStart />
            <TourRunning />
        </>
    )
}

/**
 * The panel's one check: a filled circle with a white tick. As a radio's mark (the modes) an empty
 * ring stands in when it's off; as a seen mark (the chapters) nothing does.
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
    // Seen, or a play mark on hover: a row starts that part.
    const mark = (id: TourNodeId) => isNodeSeen(id, completedNodes)
        ? <RoundCheck on small label="Seen" />
        : <Play className="h-3 w-3 shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover/row:opacity-100" aria-hidden />

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
    const { mode, setMode, showIntroModal, closeIntroModal, startTour, resumeTour, resumable } = useDemoTour()
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
 * the tab order; `data-collapse` lets the panel measure itself open or folded, mid-fold too.
 */
function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
    return (
        <div
            data-collapse
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
 * During a run (or while exploring): the outline, frosted, in the bottom-right corner above the
 * tour's dimmed overlay and below the step card. It lists the chapters, opens the current one to its
 * sections (and the current section to its own), marks where the run is and what's been seen, and
 * goes anywhere on a click: within the run, or as a new run of that part.
 *
 * It keeps to its corner. When the current step's target would sit under it, it folds to its
 * one-line head in place, and opens again on a step that leaves room. A target in the very corner
 * (Ask Brio) moves the folded head just past it along the bottom edge, where the step card, which
 * opens above the target, doesn't land; or just above it, when there's no room beside it. Hidden below 1024px, where the step card's
 * "Engagements › Files" says where the visitor is.
 */
function TourRunning() {
    const { mode, active, run, scope, stepIndex, completedNodes, jumpToStep, startNode, endTour, saveProgress } = useDemoTour()
    const exploring = mode === 'explore'
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

    /** How tall the panel stands open and folded, worked out from what's on screen, mid-fold or not. */
    const heights = () => {
        const pane = paneRef.current
        if (!pane) return { open: 360, folded: 60 }
        const regions = Array.from(pane.querySelectorAll<HTMLElement>('[data-collapse]'))
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

    if (!active) return null

    // Chapters always; a chapter's sections while the run is in it; a section's own while the run is in that section.
    const shown = TOUR_NODES.filter((n) => n.depth === 0 || trail.has(n.ancestors[n.ancestors.length - 1].id))

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
            aria-label="Product tour outline"
            // Above the tour's overlay (Joyride's zIndex, 10050), below its step card (10150).
            className={cn(TOUR_GLASS_CLASS, 'fixed z-[10051] hidden w-64 flex-col overflow-hidden rounded-card text-fg transition-[right,bottom] duration-300 ease-out animate-in fade-in slide-in-from-bottom-2 motion-reduce:transition-none lg:flex')}
            style={{ right: EDGE + nudge.right, bottom: EDGE + nudge.bottom }}
        >
            <PanelHead
                title={<p className="truncate text-ui font-semibold text-fg">Product tour</p>}
                caption={
                    folded && currentNode
                        ? <TourNodePlace id={currentNode.id} />
                        : exploring
                            ? <>Exploring · {scope ? <TourNodeTitle id={scope} /> : 'the whole tour'}</>
                            : <>{stepIndex + 1} of {steps.length} · {scope ? <TourNodeTitle id={scope} /> : 'The whole tour'}</>
                }
            >
                <button type="button" onClick={toggleFold} className={ICON_BUTTON_CLASS} aria-label={folded ? 'Show the outline' : 'Fold the outline'} aria-expanded={!folded}>
                    <ChevronDown className={cn('transition-transform duration-300 ease-out', folded && 'rotate-180')} />
                </button>
                <button type="button" onClick={close} className={ICON_BUTTON_CLASS} aria-label="Close the tour; resume it from the map icon">
                    <X />
                </button>
            </PanelHead>

            <Collapse open={!folded}>
                <ModeRow />
            </Collapse>

            <div className={cn('h-0.5 shrink-0 bg-black/[0.06]', exploring && 'invisible')}>
                <div className="h-full bg-action transition-[width] duration-300" style={{ width: `${((stepIndex + 1) / Math.max(steps.length, 1)) * 100}%` }} />
            </div>

            <Collapse open={!folded}>
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
                                        <RoundCheck on={isNodeSeen(node.id, completedNodes)} small label="Seen" className="mt-[0.2em]" />
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                </nav>
            </Collapse>
        </aside>
    )
}
