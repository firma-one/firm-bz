'use client'

import { useCallback, useEffect, useState } from 'react'
import { Sparkles, X, PanelLeft, PanelRight } from 'lucide-react'
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

    const toggleOpen = useCallback(() => {
        setOpen((wasOpen) => {
            writeStored(openKeyFor(projectId), wasOpen ? '0' : '1')
            return !wasOpen
        })
    }, [projectId])

    const flipSide = useCallback(() => {
        setSide((current) => {
            const next: Side = current === 'right' ? 'left' : 'right'
            writeStored(SIDE_KEY, next)
            return next
        })
    }, [])

    // z-40 keeps the panel under the toast stack (z-100), which is deliberate: a toast confirming
    // something done IN the chat must not render behind it. Success toasts clear themselves in a
    // few seconds; errors persist until dismissed, so they are allowed to cover the panel header
    // rather than the composer.
    const anchor = side === 'right' ? 'right-6' : 'left-6'

    if (!open) {
        return (
            <button
                type="button"
                onClick={toggleOpen}
                className={`fixed bottom-6 ${anchor} z-40 flex items-center gap-2 rounded-full border border-primary/20 bg-white py-2.5 pl-3 pr-4 shadow-lg transition-all hover:shadow-xl hover:border-primary/40`}
                aria-label="Open the engagement assistant"
            >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                    <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                </span>
                {/* Labelled rather than icon-only: a bare sparkle is now ambiguous beside the AI
                    credits indicator in the top bar. */}
                <span className="text-sm font-medium text-gray-900">
                    Ask <Brio className="text-sm text-primary" />
                </span>
            </button>
        )
    }

    return (
        <div
            ref={setPanelEl}
            /* Tall and narrow, not wide. Chat is a vertical medium — messages stack downward and
               the eye tracks a column — and comfortable reading runs out past roughly 75
               characters a line, which a wide panel blows through immediately. The scarce
               resource is how much conversation is visible, so height is what gets spent.

               `max-w-full` is load-bearing: the suggestion chips wrap with no width ceiling of
               their own, and in a fixed element with nothing to push back they stretched the
               panel to their full text width. */
            className={`fixed bottom-6 ${anchor} z-40 flex w-[23rem] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-lg border border-primary/25 bg-white shadow-2xl`}
        >
            {/* The panel's own header carries the title; this strip owns only window controls, so
                the two never compete to name the thing. */}
            <div className="flex items-center justify-end gap-0.5 rounded-t-lg border-b border-primary/10 bg-primary/5 px-2 py-1">
                <button
                    type="button"
                    onClick={flipSide}
                    className="flex h-6 w-6 items-center justify-center rounded text-gray-400 transition-colors hover:bg-white hover:text-gray-700"
                    aria-label={side === 'right' ? 'Move to the left' : 'Move to the right'}
                    title={side === 'right' ? 'Move to the left' : 'Move to the right'}
                >
                    {side === 'right'
                        ? <PanelLeft className="h-3.5 w-3.5" />
                        : <PanelRight className="h-3.5 w-3.5" />}
                </button>
                <button
                    type="button"
                    onClick={toggleOpen}
                    className="flex h-6 w-6 items-center justify-center rounded text-gray-400 transition-colors hover:bg-white hover:text-gray-700"
                    aria-label="Close the assistant"
                    title="Close"
                >
                    <X className="h-3.5 w-3.5" />
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
        </div>
    )
}
