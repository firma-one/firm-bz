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

/**
 * Panel height in px, resizable by dragging the top edge.
 *
 * A fixed height keeps the window from shifting under you as messages arrive, which is right for a
 * conversation but wrong for the occasional answer that is MUCH larger than the rest — a review
 * with a summary table and a proposal list has no business being read through a 32rem keyhole.
 * Auto-growing on content would reintroduce the jumping; letting the user set the height once does
 * not, and they keep it.
 *
 * Height, not width: the panel is deliberately narrow for line length (see the panel comment), so
 * widening it would make reading worse. Height is the axis where more is simply more.
 */
const DEFAULT_HEIGHT_PX = 512
/**
 * Panel WIDTH in px, resizable by dragging the panel's inner edge.
 *
 * The default is the floor, as with height: narrower than this and the suggestion chips wrap to one
 * per line and the composer stops holding a sentence. Widening is for content the default cannot
 * show well — a four-column table in a 23rem column is unreadable whatever the prose does.
 *
 * Capped rather than unbounded: past about half a wide screen the panel stops being a panel and
 * starts covering the file list it is commenting on.
 */
const MIN_WIDTH_PX = PANEL_WIDTH_REM * 16
const MAX_WIDTH_PX = 900
const WIDTH_KEY = 'fm_ai_chat_width'
/**
 * The floor is the DEFAULT: the panel grows, never shrinks.
 *
 * A shorter panel is not a smaller version of this one, it is a worse one — the thread, the
 * suggestion row and the composer all have to fit, and below the default the conversation is
 * reduced to a couple of visible lines while the chrome stays the same size. Resizing exists for
 * the answer that is too big for the default, which is a one-way need.
 */
const MIN_HEIGHT_PX = DEFAULT_HEIGHT_PX
/** Leaves room for the top bar, so the panel cannot be dragged up behind it. */
const HEIGHT_VIEWPORT_MARGIN = 96
const HEIGHT_KEY = 'fm_ai_chat_height'

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
    // Collapsed everywhere. The assistant is never the reason a page was opened, so it starts as a
    // launcher and waits to be asked for; a panel that opens itself covers the content the user
    // actually came for.
    defaultOpen = false,
    title,
    aboveThread,
    suggestionsOverride,
    suggestionActions,
    placeholder,
    emptyStateNote,
    capabilityNote,
}: {
    projectId: string
    data?: EngagementInsightsResponse | null
    engagementName?: string | null
    clientName?: string | null
    /**
     * Distinguishes one page's launcher from another's when the panel appears on more than one.
     * Without it, two "Ask Brio" pills would be indistinguishable in a screenshot or a support
     * conversation.
     */
    title?: string
    /** Agent output rendered inside the thread — see EngagementAiChat. */
    aboveThread?: React.ReactNode
    /** Starting prompts for the host page, replacing the engagement-derived set. */
    suggestionsOverride?: string[]
    /** An action chip for the suggestion row — see EngagementAiChat. */
    suggestionActions?: React.ReactNode
    /** Composer prompt text — see EngagementAiChat. */
    placeholder?: string
    /** Replaces the default empty-state line where it is not accurate. */
    emptyStateNote?: React.ReactNode
    /** One line in the header saying what this panel can do here — see EngagementAiChat. */
    capabilityNote?: React.ReactNode
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
    // should stay flush with the cards either way. `viewportWidth` excludes any window scrollbar,
    // which is the frame the docked position must be computed in.
    const [rightInset, setRightInset] = useState(0)
    const [viewportWidth, setViewportWidth] = useState(0)
    useEffect(() => {
        const measure = () => {
            setRightInset(rightContentInset())
            setViewportWidth(document.documentElement.clientWidth)
        }
        measure()
        window.addEventListener('resize', measure)
        return () => window.removeEventListener('resize', measure)
    }, [])

    const [width, setWidth] = useState(MIN_WIDTH_PX)
    useEffect(() => {
        const stored = Number(readStored(WIDTH_KEY))
        if (Number.isFinite(stored) && stored >= MIN_WIDTH_PX) setWidth(Math.min(stored, MAX_WIDTH_PX))
    }, [])

    const [resizingWidth, setResizingWidth] = useState(false)

    /**
     * Panel width in pixels, for the docked-position arithmetic.
     *
     * The LIVE width, not the constant: a right-docked panel is positioned by `left`, so a stale
     * width here would leave it hanging off the gutter the moment it was resized — the same class
     * of bug as computing the dock from 100vw.
     */
    const panelPx = width

    /**
     * Panel height, user-set by dragging the top edge and remembered across engagements.
     *
     * Read on mount rather than in the initializer: this component renders on the server, where
     * localStorage does not exist, and reading it during the first client render would mismatch
     * the server's markup.
     */
    const [height, setHeight] = useState(DEFAULT_HEIGHT_PX)
    useEffect(() => {
        const stored = Number(readStored(HEIGHT_KEY))
        if (Number.isFinite(stored) && stored >= MIN_HEIGHT_PX) setHeight(stored)
    }, [])

    /** Live height during a resize drag; null when idle. */
    const [resizing, setResizing] = useState(false)

    const startResizeWidth = useCallback((event: React.PointerEvent<HTMLElement>) => {
        event.preventDefault()
        const handle = event.currentTarget
        handle.setPointerCapture(event.pointerId)
        setResizingWidth(true)

        // The panel is anchored at its DOCKED edge, so the free edge is the inner one: dragging it
        // toward the middle of the screen grows the panel. Which direction that is depends on the
        // dock, hence the sign flip — on the right the inner edge is the left one, so width
        // increases as clientX decreases.
        const startX = event.clientX
        const startWidth = handle.closest('[data-ai-chat-panel]')?.getBoundingClientRect().width
            ?? MIN_WIDTH_PX
        const sign = side === 'right' ? -1 : 1

        const clampWidth = (value: number) => Math.max(
            MIN_WIDTH_PX,
            Math.min(value, MAX_WIDTH_PX, document.documentElement.clientWidth - GUTTER * 2),
        )

        const onMove = (e: PointerEvent) =>
            setWidth(clampWidth(startWidth + sign * (e.clientX - startX)))
        const onUp = (e: PointerEvent) => {
            const final = clampWidth(startWidth + sign * (e.clientX - startX))
            setWidth(final)
            writeStored(WIDTH_KEY, String(Math.round(final)))
            setResizingWidth(false)
            handle.removeEventListener('pointermove', onMove)
            handle.removeEventListener('pointerup', onUp)
        }
        handle.addEventListener('pointermove', onMove)
        handle.addEventListener('pointerup', onUp)
    }, [side])

    const startResize = useCallback((event: React.PointerEvent<HTMLElement>) => {
        event.preventDefault()
        const handle = event.currentTarget
        handle.setPointerCapture(event.pointerId)
        setResizing(true)

        // The panel is anchored at the BOTTOM, so dragging the top edge upward must grow it:
        // height increases as clientY decreases, which is why this subtracts rather than adds.
        const startY = event.clientY
        const startHeight = handle.closest('[data-ai-chat-panel]')?.getBoundingClientRect().height
            ?? DEFAULT_HEIGHT_PX

        // Max applied LAST, so on a viewport shorter than the default the floor still wins and the
        // panel is never clamped to something smaller than it renders at. `max-h` on the element
        // keeps it inside the window in that case.
        const clampHeight = (value: number) => Math.max(
            MIN_HEIGHT_PX,
            Math.min(value, window.innerHeight - HEIGHT_VIEWPORT_MARGIN),
        )

        const onMove = (e: PointerEvent) => setHeight(clampHeight(startHeight - (e.clientY - startY)))
        const onUp = (e: PointerEvent) => {
            const final = clampHeight(startHeight - (e.clientY - startY))
            setHeight(final)
            writeStored(HEIGHT_KEY, String(Math.round(final)))
            setResizing(false)
            handle.removeEventListener('pointermove', onMove)
            handle.removeEventListener('pointerup', onUp)
        }
        handle.addEventListener('pointermove', onMove)
        handle.addEventListener('pointerup', onUp)
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

        // Same frame as the docked position above: clientWidth excludes the window scrollbar, so a
        // dragged panel and a docked one land on the same pixel.
        const clamp = (x: number) =>
            Math.max(GUTTER, Math.min(
                x,
                document.documentElement.clientWidth - panelWidth - GUTTER - rightContentInset(),
            ))

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
                /* No `height` here. The panel's user-set height belongs to the PANEL; applying it
                   to the launcher stretched the pill into a tall rounded column the full height of
                   the open panel. The launcher is sized by its own padding and content. */
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
                    {title ? <span className="ml-1 text-gray-400">· {title}</span> : null}
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
                height: `${height}px`,
                // Width is a style, not a class: Tailwind extracts class names statically, so an
                // interpolated `w-[...]` would never be generated.
                width: `${width}px`,
                transformOrigin: side === 'right' ? 'bottom right' : 'bottom left',
                // Always positioned by `left`, which is what lets the dock change animate: swapping
                // to `right` would mean the browser had no single property to interpolate and the
                // panel would teleport again.
                //
                // The docked offset is derived from documentElement.clientWidth rather than 100vw.
                // 100vw INCLUDES the scrollbar, so a right-docked panel computed from it sat a
                // scrollbar's width too far right — visible as the gutter changing after a drag,
                // because the dragged position was clamped against the true content width.
                left: dragging
                    ? `${dragLeft}px`
                    : side === 'right'
                        ? `${Math.max(GUTTER, viewportWidth - panelPx - GUTTER - rightInset)}px`
                        : `${GUTTER}px`,
            }}
            /* The transition is suppressed while dragging so the panel tracks the pointer exactly;
               it animates only on release, which is what makes the snap read as magnetic. */
            /* A DEFINITE height, not one derived from content. Without it anything inside could
               grow the panel — opening the ten-entry history stretched it up the page — and a
               floating window that resizes itself as you use it is unsettling to work in. Fixed
               box, scrolling contents.

               The height is now the USER'S, set by dragging the top edge and remembered, because a
               single fixed value cannot serve both a two-line answer and a file review carrying a
               summary table and a proposal list. The window still never resizes itself.

               Width is a literal class, not interpolated: Tailwind extracts class names
               statically, so an interpolated `w-[...]` would never be generated. PANEL_WIDTH_REM
               must be kept in step with it. */
            className={`fixed bottom-6 z-40 flex max-h-[calc(100vh-6rem)] ${resizing || resizingWidth ? 'select-none' : ''} max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-lg border border-primary/25 bg-white shadow-2xl duration-200 ${
                closing
                    // pointer-events-none so a fast click cannot land on a control in a panel that
                    // is on its way out.
                    ? 'animate-out fade-out zoom-out-95 fill-mode-forwards pointer-events-none'
                    : 'animate-in fade-in zoom-in-95'
            } ${
                dragging ? 'cursor-grabbing select-none' : 'transition-[left] duration-200 ease-out'
            }`}
        >
            {/* Resize grip along the INNER vertical edge — left when docked right, right when
                docked left. The docked edge is pinned to the gutter, so the inner one is the only
                edge that can move; putting the handle on the outer edge would look draggable and
                do nothing. */}
            <div
                onPointerDown={startResizeWidth}
                role="separator"
                aria-orientation="vertical"
                aria-label="Drag to resize the assistant"
                title="Drag to resize"
                className={`absolute inset-y-0 z-10 w-1.5 cursor-ew-resize touch-none transition-colors ${
                    side === 'right' ? 'left-0' : 'right-0'
                } ${resizingWidth ? 'bg-primary/40' : 'hover:bg-primary/25'}`}
            />

            {/* Resize grip along the TOP edge, because the panel is anchored at the bottom: the top
                edge is the one that can move. Four pixels tall with no visible weight until
                hovered — a window chrome affordance should be findable by the cursor rather than
                occupy the layout.

                `touch-none` stops a touch drag from scrolling the page underneath instead of
                resizing, which is what pointer capture alone does not prevent. */}
            <div
                onPointerDown={startResize}
                role="separator"
                aria-orientation="horizontal"
                aria-label="Drag to resize the assistant"
                title="Drag to resize"
                // `n-resize`, not `ns-resize`: the panel only grows upward from its default, and a
                // two-headed cursor would promise a direction that does nothing.
                className={`absolute inset-x-0 top-0 z-10 h-1.5 cursor-n-resize touch-none transition-colors ${
                    resizing ? 'bg-primary/40' : 'hover:bg-primary/25'
                }`}
            />

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
                suggestionsOverride={suggestionsOverride}
                suggestionActions={suggestionActions}
                aboveThread={aboveThread}
                placeholder={placeholder}
                emptyStateNote={emptyStateNote}
                capabilityNote={capabilityNote}
            />
        </div>,
        document.body,
    )
}
