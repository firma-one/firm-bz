import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The one loading screen between sign-in and the first page (.claude/plans/app-design-refinements.md):
 * the auth check (AuthGuard), `/d` resolving where to land (LandingBlockerModal) and the arrival
 * overlay on Home or a new user's firm (LandingArrival) all draw this, so the three moments read as one.
 *
 * Notion's language: the white canvas, the status mark below and one muted line. No card, no shadow.
 * Fully opaque on purpose: the app shell mounts and loads behind it, and any transparency lets
 * that tree's own loading states bleed through and read as this screen flickering.
 */
export function WorkspaceLoaderScreen({
    children,
    closing = false,
    className,
}: {
    children: ReactNode
    /** Fades the screen out before the caller unmounts it. */
    closing?: boolean
    className?: string
}) {
    return (
        <div
            role="status"
            aria-live="polite"
            className={cn(
                'fixed inset-0 z-[200] flex items-center justify-center bg-surface transition-opacity duration-ui-slow ease-ui-out',
                closing ? 'opacity-0' : 'animate-in fade-in duration-ui-base',
                className
            )}
        >
            <div className="flex min-h-24 flex-col items-center justify-center gap-3 px-4 text-center">{children}</div>
        </div>
    )
}

export function WorkspaceLoader({ message = 'Loading your workspace' }: { message?: string }) {
    return (
        <WorkspaceLoaderScreen>
            <WorkspaceLoaderMessage message={message} />
        </WorkspaceLoaderScreen>
    )
}

/** The mark and its line; the screen announces the line, so the mark stays out of the tree. */
export function WorkspaceLoaderMessage({ message }: { message: string }) {
    return (
        <>
            <WorkspaceLoaderMark />
            <p className="text-ui text-fg-muted">{message}</p>
        </>
    )
}

/*
 * The loader's mark, from the status language rather than a generic spinner: while loading, the
 * Underway ring fills and empties like a stage icon moving along, turning slowly; on arrival it
 * becomes the Done check, which pops in and draws its tick. So the loader ends where "done" looks
 * like everywhere else in the app. Still under reduced motion: a three-quarter fill, the tick drawn.
 * The CSS is inline, like the toast's tick, so the mark works wherever it renders (server loaders too).
 */
const MARK_CSS = `
@keyframes wl-fill { 0% { stroke-dashoffset: 18.85 } 50% { stroke-dashoffset: 0 } 100% { stroke-dashoffset: -18.85 } }
@keyframes wl-turn { to { transform: rotate(360deg) } }
@keyframes wl-pop { 0% { transform: scale(.55); opacity: 0 } 70% { transform: scale(1.06); opacity: 1 } 100% { transform: scale(1); opacity: 1 } }
@keyframes wl-tick { to { stroke-dashoffset: 0 } }
.wl-turn { transform-box: fill-box; transform-origin: center; animation: wl-turn 2.8s linear infinite }
.wl-fill { animation: wl-fill 1.6s cubic-bezier(.65,0,.35,1) infinite }
.wl-pop { transform-box: fill-box; transform-origin: center; animation: wl-pop .38s cubic-bezier(.2,.8,.2,1) both }
.wl-tick { stroke-dasharray: 13; stroke-dashoffset: 13; animation: wl-tick .28s cubic-bezier(.65,0,.35,1) .18s forwards }
@media (prefers-reduced-motion: reduce) {
  .wl-turn, .wl-fill, .wl-pop { animation: none }
  .wl-fill { stroke-dashoffset: 4.7 }
  .wl-tick { animation: none; stroke-dashoffset: 0 }
}
`

export function WorkspaceLoaderMark({ state = 'loading', size = 28 }: { state?: 'loading' | 'done'; size?: number }) {
    return (
        <span aria-hidden className={cn('inline-flex', state === 'done' ? 'text-status-done-icon' : 'text-status-underway-icon')}>
            <style>{MARK_CSS}</style>
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                {state === 'loading' ? (
                    <g className="wl-turn">
                        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                        {/* A pie: a circle stroked as wide as its diameter, its dash grown and shrunk. */}
                        <circle className="wl-fill" cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="6" strokeDasharray="18.85" transform="rotate(-90 12 12)" />
                    </g>
                ) : (
                    <g className="wl-pop">
                        <circle cx="12" cy="12" r="10.5" fill="currentColor" />
                        <path className="wl-tick" d="M7.6 12.4l3 3 5.8-6.2" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </g>
                )}
            </svg>
        </span>
    )
}

