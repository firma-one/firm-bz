'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, GripVertical } from 'lucide-react'
import { EngagementAiChat } from '@/components/projects/engagement-ai-chat'
import { Brio } from '@/components/ui/brio'
import type { EngagementInsightsResponse } from '@/lib/insights/engagement-insights'

/**
 * Floats the engagement assistant over the page instead of occupying a column.
 *
 * The chat led the right rail, which gave it prominence but permanently cost the Action Center
 * half its width whether or not anyone was asking anything. As an overlay it costs nothing when
 * closed, and the launcher keeps it discoverable — the problem that put it at the top of the rail
 * in the first place was being buried below the fold, not being small.
 *
 * ## Scope
 *
 * A wrapper, deliberately. `EngagementAiChat` keeps its own markup, state and thread, so this adds
 * positioning and nothing else — and the conversation still belongs to one mounted panel on one
 * page. Nothing here makes a thread survive navigation, which is a separate problem to solve when
 * the assistant reaches Files and Board.
 *
 * Desktop only. The app is not built for mobile today; this degrades to a narrower panel at small
 * widths rather than pretending to be a mobile sheet.
 */

/** Which corner the panel and launcher occupy. A workspace preference, not a per-engagement one. */
type Side = 'right' | 'left'

const SIDE_KEY = 'fm_ai_chat_side'
/** Panel width, shared between the docked position and the drag clamp. */
const PANEL_WIDTH_REM = 23
/**
 * Inset from the viewport edge when docked, and the clamp margin while dragging.
 *
 * Matches the page's own `px-6` content gutter so the panel's edge lines up with the cards it
 * floats over, rather than sitting a few pixels proud of them.
 */
const GUTTER = 24

/**
 * How far the page's right content edge sits inside the viewport.
 *
 * The page scrolls in an inner container, so that container's scrollbar is inside the content area
 * and eats into the right edge. A panel positioned against the viewport would overhang the cards
 * it floats over by exactly that much.
 *
 * Measured from the live element rather than assumed: scrollbar width differs by platform and is
 * zero for macOS overlay scrollbars, so a hardcoded number would be wrong nearly everywhere.
 */
function rightContentInset(): number {
    if (typeof document === 'undefined') return 0
    const scroller = document.querySelector('.d-app .overflow-y-auto')
    if (!(scroller instanceof HTMLElement)) return 0
    return Math.max(0, scroller.offsetWidth - scroller.clientWidth)
}
/**
 * How far the pointer must travel before a drag flips the dock, as a share of viewport width.
 *
 * A fifth is short enough that the gesture feels responsive from either side, and long enough that
 * a nudge while grabbing the handle does not move the panel by accident.
 */
const SNAP_TRAVEL_FRACTION = 0.2
/** Exit animation duration; must match the `duration-200` on the panel. */
const EXIT_MS = 200
/** Collapsed state is per engagement: whether you are mid-conversation is engagement-specific. */
const openKeyFor = (projectId: string) => `fm_ai_chat_open_${projectId}`

function readStored(key: string): string | null {
    try {
        return window.localStorage.getItem(key)
    } catch {
        // Private browsing and blocked site data both throw. The default is fine.
        return null
    }
}

function writeStored(key: string, value: string): void {
    try {
        window.localStorage.setItem(key, value)
    } catch {
        // Losing a layout preference is not worth surfacing.
    }
}

export function FloatingAiChat({
    projectId,
    data,
    engagementName,
    clientName,
    defaultOpen = false,
}: {
    projectId: string
    data?: EngagementInsightsResponse | null
    engagementName?: string | null
    clientName?: string | null
    /**
     * Whether the panel starts open before the user has expressed a preference. Overview passes
     * true — the assistant leads that page today and collapsing it by default would re-bury it.
     * Files and Board will pass false, where it is secondary.
     */
    defaultOpen?: boolean
}) {
    const [side, setSide] = useState<Side>('right')
    const [open, setOpen] = useState(defaultOpen)

    // Read after mount rather than lazily in useState: localStorage is unavailable during SSR, and
    // seeding from it would make the server and client markup disagree.
    useEffect(() => {
        const storedSide = readStored(SIDE_KEY)
        if (storedSide === 'left' || storedSide === 'right') setSide(storedSide)

        const storedOpen = readStored(openKeyFor(projectId))
        if (storedOpen !== null) setOpen(storedOpen === '1')
    }, [projectId])

    /**
     * Publishes the panel's footprint so the shared upload/download progress panels can sit above
     * it rather than on top of it. They are portalled into the body from the /d layout and know
     * nothing about this component, so a CSS variable on the document is the least invasive
     * channel — no context provider threaded through an unrelated layout.
     *
     * Only the right side matters: those panels are anchored bottom-right, so a left-docked chat
     * does not collide with them at all.
     */
    const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null)

    useEffect(() => {
        const root = document.documentElement
        const clear = () => root.style.setProperty('--ai-chat-corner-offset', '0px')

        if (!open || side !== 'right' || !panelEl) {
            clear()
            return () => root.style.removeProperty('--ai-chat-corner-offset')
        }

        // Measured rather than assumed: the panel grows with the conversation, and a fixed offset
        // would either leave a gap or let a long thread run underneath the progress panel.
        const publish = () => {
            root.style.setProperty('--ai-chat-corner-offset', `${panelEl.offsetHeight + 12}px`)
        }
        publish()

        const observer = new ResizeObserver(publish)
        observer.observe(panelEl)
        return () => {
            observer.disconnect()
            root.style.removeProperty('--ai-chat-corner-offset')
        }
    }, [open, side, panelEl])

    /**
     * True while the panel is playing its exit animation but has not unmounted yet.
     *
     * `animate-in` only runs on enter; on close React removed the panel immediately, so it blinked
     * out while the launcher faded in. Holding it mounted for the duration of the animation gives
     * the collapse the same motion as the expand.
     */
    const [closing, setClosing] = useState(false)

    const toggleOpen = useCallback(() => {
        setOpen((wasOpen) => {
            writeStored(openKeyFor(projectId), wasOpen ? '0' : '1')
            if (wasOpen) {
                // Keep it on screen until the exit finishes, then let the launcher take over.
                setClosing(true)
                window.setTimeout(() => setClosing(false), EXIT_MS)
            }
            return !wasOpen
        })
    }, [projectId])

    /**
     * Drag the panel to the other side, snapping to whichever half it is released in.
     *
     * A drag handle rather than a left/right toggle button, which stated a direction the user had
     * to translate into a result — "does PanelLeft mean it IS left, or SENDS it left?". Dragging
     * says what will happen by doing it, the way the Next.js devtools widget works.
     *
     * The panel does not follow the cursor freely: there are two valid positions, so it tracks
     * horizontally while held and lands in the nearer corner, which keeps the layout predictable
     * and avoids a panel parked somewhere it overlaps the Action Center.
     */
    // Holds the side the pointer is currently over, not a pixel position: the panel snaps to a
    // corner rather than following the cursor freely, so only which half matters. Null when not
    // dragging. Resolved in the event handler so `window` is never read during render.
    // createPortal needs document, which does not exist during the server render.
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])

    // Re-measured on resize: a scrollbar appears and disappears as content changes, and the panel
    // should stay flush with the cards either way.
    const [rightInset, setRightInset] = useState(0)
    useEffect(() => {
        const measure = () => setRightInset(rightContentInset())
        measure()
        window.addEventListener('resize', measure)
        return () => window.removeEventListener('resize', measure)
    }, [])

    /**
     * The panel's left offset in pixels while a drag is in progress, null when idle.
     *
     * The panel follows the cursor rather than jumping corners the moment the midpoint is crossed —
     * that made it vanish from under the user's hand. It stays beneath the pointer the whole way
     * and snaps to the nearer corner on release, the way the Next.js devtools widget behaves.
     */
    const [dragLeft, setDragLeft] = useState<number | null>(null)

    const startDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
        event.preventDefault()

        // Capture on the handle itself. Without it the pointer stream stops the moment the cursor
        // leaves the button — which it does immediately, since the gesture is a drag across the
        // window — so a drag from the left dock could never reach the right half and the panel
        // appeared stuck on one side.
        const handle = event.currentTarget
        handle.setPointerCapture(event.pointerId)

        // Travel, not absolute position. Deciding by the midpoint meant a drag that began at the
        // left dock had to cross half the screen before it would commit — a long way to pull for a
        // two-position control. A fifth of the viewport in either direction is a clear enough
        // intent to flip, and anything shorter settles back where it started.
        const startX = event.clientX
        const sideAfterDrag = (x: number): Side => {
            const travelled = x - startX
            if (Math.abs(travelled) < window.innerWidth * SNAP_TRAVEL_FRACTION) return side
            return travelled > 0 ? 'right' : 'left'
        }

        // Where the pointer sits within the panel, so it does not jump to align its edge with the
        // cursor on the first move.
        const rect = handle.closest('[data-ai-chat-panel]')?.getBoundingClientRect()
        const grabOffset = rect ? event.clientX - rect.left : 0
        const panelWidth = rect?.width ?? 0

        const clamp = (x: number) =>
            Math.max(GUTTER, Math.min(x, window.innerWidth - panelWidth - GUTTER - rightContentInset()))

        const onMove = (e: PointerEvent) => setDragLeft(clamp(e.clientX - grabOffset))
        const onUp = (e: PointerEvent) => {
            handle.removeEventListener('pointermove', onMove)
            handle.removeEventListener('pointerup', onUp)
            handle.removeEventListener('pointercancel', onUp)
            if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId)
            // Released: drop the pixel position so the panel animates into its docked corner.
            setDragLeft(null)
            const next = sideAfterDrag(e.clientX)
            setSide((current) => {
                if (current !== next) writeStored(SIDE_KEY, next)
                return next
            })
        }

        // Bound to the capturing element, not the window: with capture set, every subsequent
        // pointer event for this gesture is retargeted here regardless of what is underneath.
        handle.addEventListener('pointermove', onMove)
        handle.addEventListener('pointerup', onUp)
        handle.addEventListener('pointercancel', onUp)
    }, [side])

    const dragging = dragLeft !== null

    // z-40 keeps the panel under the toast stack (z-100), which is deliberate: a toast confirming
    // something done IN the chat must not render behind it. Success toasts clear themselves in a
    // few seconds; errors persist until dismissed, so they are allowed to cover the panel header
    // rather than the composer.
    //
    // Left-docking deliberately overlays the app sidebar rather than being inset past it. The
    // sidebar is z-20, so floating chrome sits above it the way the debug trigger already does,
    // and insetting would waste 256px of the screen to avoid a collision that does not exist.

    // Portalled to the body, like the upload and download panels. The layout's body row is
    // `overflow-hidden`, and that clips a fixed descendant at the content area's edge — which is
    // why the left-docked panel appeared sliced by the sidebar. It was never a z-index problem:
    // the sidebar is z-20 and this is z-40, so once the panel escapes that container it paints
    // over the sidebar correctly.
    if (!mounted) return null

    // While closing, the panel is still rendered (playing its exit) and the launcher is withheld,
    // so the two never overlap in the same corner.
    if (!open && !closing) {
        return createPortal(
            <button
                type="button"
                onClick={toggleOpen}
                /* Grows out of, and shrinks back into, the corner it is docked in, so opening
                   reads as the launcher becoming the panel rather than one thing being swapped
                   for another. */
                style={{
                    transformOrigin: side === 'right' ? 'bottom right' : 'bottom left',
                    ...(side === 'right' ? { right: `${GUTTER + rightInset}px` } : { left: `${GUTTER}px` }),
                }}
                className={`fixed bottom-6 z-40 flex animate-in fade-in zoom-in-95 items-center gap-2 rounded-full border border-primary/20 bg-white py-2.5 pl-3 pr-4 shadow-lg duration-200 transition-shadow hover:shadow-xl hover:border-primary/40`}
                aria-label="Open the engagement assistant"
            >
                {/* Labelled rather than icon-only: a bare sparkle is now ambiguous beside the AI
                    credits indicator in the top bar. The Brio mark is the only glyph — a second
                    sparkle beside it reads as two things rather than one brand. */}
                <span className="text-sm font-medium text-gray-900">
                    Ask <Brio className="text-sm text-primary" />
                </span>
            </button>,
            document.body,
        )
    }

    return createPortal(
        <div
            ref={setPanelEl}
            /* Tall and narrow, not wide. Chat is a vertical medium — messages stack downward and
               the eye tracks a column — and comfortable reading runs out past roughly 75
               characters a line, which a wide panel blows through immediately. The scarce
               resource is how much conversation is visible, so height is what gets spent.

               `max-w-full` is load-bearing: the suggestion chips wrap with no width ceiling of
               their own, and in a fixed element with nothing to push back they stretched the
               panel to their full text width. */
            /* Positioned from the LEFT in both docks rather than swapping left-6 for right-6.
               Swapping changes which property places the element, and the browser has nothing to
               interpolate between them, so the panel teleported instead of sliding. One animatable
               property means one transition. */
            data-ai-chat-panel
            style={{
                transformOrigin: side === 'right' ? 'bottom right' : 'bottom left',
                left: dragging
                    ? `${dragLeft}px`
                    : side === 'right'
                        ? `calc(100vw - ${PANEL_WIDTH_REM}rem - ${GUTTER + rightInset}px)`
                        : `${GUTTER}px`,
            }}
            /* The transition is suppressed while dragging so the panel tracks the pointer exactly;
               it animates only on release, which is what makes the snap read as magnetic. */
            /* A DEFINITE height, not one derived from content. Without it anything inside could
               grow the panel — opening the ten-entry history stretched it up the page — and a
               floating window that resizes itself as you use it is unsettling to work in. Fixed
               box, scrolling contents.

               Width is a literal class, not interpolated: Tailwind extracts class names
               statically, so an interpolated `w-[...]` would never be generated. PANEL_WIDTH_REM
               must be kept in step with it. */
            className={`fixed bottom-6 z-40 flex h-[32rem] max-h-[calc(100vh-6rem)] w-[23rem] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-lg border border-primary/25 bg-white shadow-2xl duration-200 ${
                closing
                    // pointer-events-none so a fast click cannot land on a control in a panel that
                    // is on its way out.
                    ? 'animate-out fade-out zoom-out-95 fill-mode-forwards pointer-events-none'
                    : 'animate-in fade-in zoom-in-95'
            } ${
                dragging ? 'cursor-grabbing select-none' : 'transition-[left] duration-200 ease-out'
            }`}
        >
            {/* The panel's own header carries the title; this strip owns only window controls, so
                the two never compete to name the thing. */}
            <div className="flex items-center gap-0.5 rounded-t-lg border-b border-primary/10 bg-primary/5 px-1.5 py-1">
                {/* Leading, and a wide target: a drag handle is grabbed rather than clicked, so it
                    needs an area the hand can find without aiming. Dragging anywhere along the
                    header bar would be more generous still, but that would swallow the collapse
                    button's own pointer events. */}
                <button
                    type="button"
                    onPointerDown={startDrag}
                    className={`flex h-7 flex-1 cursor-grab items-center gap-1 rounded px-1.5 text-gray-400 transition-colors hover:bg-white/70 hover:text-gray-600 active:cursor-grabbing ${
                        dragging ? 'bg-white/70 text-gray-600' : ''
                    }`}
                    aria-label="Drag to move the assistant to the other side"
                    title="Drag to move"
                >
                    <GripVertical className="h-4 w-4 shrink-0" />
                    <span className="text-[10px] uppercase tracking-wider">Drag</span>
                </button>
                {/* Collapse, not close: the conversation is kept and the panel returns to its
                    launcher. An X claims the thread is being discarded, which would make people
                    hesitate to put it away. */}
                <button
                    type="button"
                    onClick={toggleOpen}
                    className="flex h-6 w-6 items-center justify-center rounded text-gray-400 transition-colors hover:bg-white hover:text-gray-700"
                    aria-label="Collapse the assistant"
                    title="Collapse"
                >
                    <ChevronDown className="h-4 w-4" />
                </button>
            </div>

            {/* Kept mounted while open so the thread, ratings and suggestions survive a dock flip. */}
            <EngagementAiChat
                projectId={projectId}
                data={data}
                engagementName={engagementName}
                clientName={clientName}
                chrome="floating"
            />
        </div>,
        document.body,
    )
}
