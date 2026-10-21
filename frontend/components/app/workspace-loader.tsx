import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { LoadingSpinner } from '@/components/ui/loading-spinner'

/**
 * The one loading screen between sign-in and the first page (.claude/plans/app-design-refinements.md):
 * the auth check (AuthGuard), `/d` resolving where to land (LandingBlockerModal) and the arrival
 * overlay on the firm page (LandingArrivalOverlay) all draw this, so the three moments read as one.
 *
 * Notion's language: the white canvas, a small gray arc and one muted line. No card, no shadow.
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

/** The arc and its line; the screen announces the line, so the arc stays out of the tree. */
export function WorkspaceLoaderMessage({ message }: { message: string }) {
    return (
        <>
            <span aria-hidden className="text-fg-subtle">
                <LoadingSpinner size="md" />
            </span>
            <p className="text-ui text-fg-muted">{message}</p>
        </>
    )
}
