'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronUp, MapPinned, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Hint } from '@/components/ui/tooltip'
import { useDemoTour } from '@/lib/demo/demo-tour-context'
import { TOUR_NODES, tourNode, tourSubtree, type PlacedTourNode, type TourNodeId } from '@/lib/demo/tour-chapters'
import { isNodeSeen, tourSteps } from '@/components/demo/demo-tour-steps'
import { TOUR_NODE_ICONS, TourModeSwitch, TourNodePlace, TourNodeTitle } from '@/components/demo/demo-tour-labels'

const EDGE = 16

/**
 * The guided tour's outline (.claude/plans/tour-chapters.md): a pane that floats in a bottom corner
 * while a run is on, above the tour's dimmed overlay. It lists the chapters, opens the current one
 * to its sections (and the current section to its own), each with the icon of its page in the app,
 * marks where the run is and what's been seen, and goes anywhere on a click: within the run, or as
 * a new run of that part. Its mode switch changes how the tour plays, mid-run too; in Explore it is
 * the tour, a map that takes the visitor to each part's page.
 *
 * It floats rather than docks so the pages keep their width (the Files table drops columns as it
 * narrows), and moves to the other corner when the current step's target would sit under it. It
 * folds down to one line. Hidden below 1024px, where the step card's "Engagements › Files" says
 * where the visitor is.
 */
export function DemoTourOutline() {
    const { mode, setMode, active, run, scope, stepIndex, completedNodes, jumpToStep, startNode, endTour, saveProgress } = useDemoTour()
    const exploring = mode === 'explore'
    const steps = useMemo(() => tourSteps(scope), [scope])
    const current = steps[stepIndex]
    const currentNode = current ? tourNode(current.node) : null
    // The current node and the ones it sits in: open in the outline and marked as the way there.
    const trail = useMemo(() => new Set<TourNodeId>(currentNode ? [...currentNode.ancestors.map((a) => a.id), currentNode.id] : []), [currentNode])
    const [folded, setFolded] = useState(false)
    const [side, setSide] = useState<'left' | 'right'>('left')
    const paneRef = useRef<HTMLElement>(null)
    const activeRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        activeRef.current?.scrollIntoView({ block: 'nearest' })
    }, [current?.node, folded])

    // Out of the way of the step: once its target has settled, the corner it doesn't cover.
    useEffect(() => {
        if (!(run || exploring) || !current) return
        const timer = setTimeout(() => {
            const target = document.querySelector(current.target)?.getBoundingClientRect()
            const pane = paneRef.current?.getBoundingClientRect()
            if (!target || !pane) return
            const top = window.innerHeight - EDGE - pane.height
            const under = (left: number) => target.left < left + pane.width && target.right > left && target.bottom > top
            // The left corner unless the target is under it and not under the right one.
            setSide(under(EDGE) && !under(window.innerWidth - EDGE - pane.width) ? 'right' : 'left')
        }, (current.settle ?? 0) + 500)
        return () => clearTimeout(timer)
    }, [run, exploring, current, folded])

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

    return (
        <aside
            ref={paneRef}
            aria-label="Guided tour outline"
            // Above the tour's overlay (Joyride's zIndex, 10050), so the outline stays lit and clickable.
            className={cn(
                'fixed bottom-4 z-[10051] hidden w-64 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-popover animate-in fade-in slide-in-from-bottom-2 duration-200 lg:flex',
                side === 'left' ? 'left-4' : 'right-4',
            )}
        >
            <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-2.5">
                <MapPinned className="h-4 w-4 shrink-0 text-action" />
                <div className="min-w-0 flex-1">
                    <p className="truncate text-ui font-medium text-fg">Guided tour</p>
                    <p className="truncate text-caption text-fg-subtle">
                        {folded && currentNode
                            ? <TourNodePlace id={currentNode.id} />
                            : exploring
                                ? <>Exploring · {scope ? <TourNodeTitle id={scope} /> : 'the whole tour'}</>
                                : <>{stepIndex + 1} of {steps.length} · {scope ? <TourNodeTitle id={scope} /> : 'The whole tour'}</>}
                    </p>
                </div>
                <Hint label={folded ? 'Show the outline' : 'Fold the outline'} side="top">
                    <button
                        type="button"
                        onClick={() => setFolded((f) => !f)}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                        aria-label={folded ? 'Show the outline' : 'Fold the outline'}
                        aria-expanded={!folded}
                    >
                        {folded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                </Hint>
                <Hint label="Close the tour; resume it from the map icon" side="top">
                    <button
                        type="button"
                        onClick={close}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                        aria-label="Close the tour"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </Hint>
            </div>

            {!folded && <TourModeSwitch value={mode} onChange={setMode} compact className="mx-3 mb-2.5" />}

            <div className={cn('h-0.5 shrink-0 bg-surface-muted', exploring && 'invisible')}>
                <div className="h-full bg-action transition-[width] duration-300" style={{ width: `${((stepIndex + 1) / Math.max(steps.length, 1)) * 100}%` }} />
            </div>

            {!folded && (
                <nav className="subtle-scrollbar max-h-[min(26rem,calc(100vh-10rem))] overflow-y-auto p-1.5">
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
                                            'flex min-h-7 w-full min-w-0 items-start gap-2 rounded-control py-1 pr-2 text-left leading-snug transition-colors hover:bg-surface-hover',
                                            node.depth === 0 ? 'pl-2 text-ui' : 'text-small',
                                            node.depth === 1 && 'pl-6',
                                            node.depth === 2 && 'pl-10',
                                            here ? 'bg-surface-selected font-medium text-fg' : trail.has(node.id) ? 'font-medium text-fg' : 'text-fg-muted',
                                        )}
                                    >
                                        {/* The page's icon, in the accent where the run is */}
                                        <span className={cn('mt-[0.2em] flex h-3.5 w-3.5 shrink-0 items-center [&_svg]:h-3.5 [&_svg]:w-3.5', here ? 'text-action' : 'text-fg-subtle')} aria-hidden>
                                            {TOUR_NODE_ICONS[node.id]}
                                        </span>
                                        <span className="min-w-0 flex-1"><TourNodeTitle id={node.id} /></span>
                                        {isNodeSeen(node.id, completedNodes) && <Check className="mt-[0.2em] h-3.5 w-3.5 shrink-0 text-action" aria-label="Seen" />}
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                </nav>
            )}
        </aside>
    )
}
