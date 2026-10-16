import * as React from "react"
import { cn } from "@/lib/utils"

/*
 * Skeleton placeholders with a soft sweep — how Linear and Notion load lists and tables, instead
 * of a spinner in an empty box. Shaped like the content that is coming, so nothing jumps when it
 * arrives. Still under prefers-reduced-motion.
 */

const SHIMMER =
    "bg-[linear-gradient(90deg,var(--ui-surface-muted)_0%,var(--ui-surface-muted)_35%,var(--ui-surface-selected)_50%,var(--ui-surface-muted)_65%,var(--ui-surface-muted)_100%)] bg-[length:200%_100%] animate-shimmer motion-reduce:animate-none"

/** One placeholder bar. Give it a width (class or style); height defaults to a text line. */
export function ShimmerBar({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
    return <span aria-hidden className={cn("block h-2.5 rounded-full", SHIMMER, className)} {...props} />
}

/** A square placeholder for an icon or avatar. */
export function ShimmerBlock({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
    return <span aria-hidden className={cn("block h-4 w-4 shrink-0 rounded-control", SHIMMER, className)} {...props} />
}

/** Screen-reader announcement to pair with a visual skeleton. */
export function LoadingAnnouncement({ label = "Loading" }: { label?: string }) {
    return (
        <span role="status" className="sr-only">
            {label}
        </span>
    )
}
