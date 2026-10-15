import { cn } from "@/lib/utils"

interface LoadingSpinnerProps {
    className?: string
    message?: string
    size?: "sm" | "md" | "lg" | "xl"
    showDots?: boolean // Kept for compatibility; the dots are gone
}

/*
 * A small arc with a fading tail (a conic gradient masked to a ring) — the quiet indicator current
 * products use, replacing the large ring with a pulsing dot. It inherits the surrounding text color.
 * For lists and tables, prefer a skeleton shaped like the content (components/ui/shimmer.tsx).
 */
const SIZES = {
    sm: { box: "h-4 w-4", ring: "2px" },
    md: { box: "h-5 w-5", ring: "2px" },
    lg: { box: "h-7 w-7", ring: "2.5px" },
    xl: { box: "h-9 w-9", ring: "3px" },
} as const

export function LoadingSpinner({ className, message, size = "lg" }: LoadingSpinnerProps) {
    const s = SIZES[size]
    const arc = (
        <span
            aria-hidden
            className={cn(
                "block shrink-0 animate-spin rounded-full [animation-duration:700ms] motion-reduce:[animation-duration:2s]",
                "[background:conic-gradient(from_90deg,transparent_0deg,currentColor_330deg,currentColor_360deg)]",
                s.box,
            )}
            style={{
                WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${s.ring}), #000 calc(100% - ${s.ring}))`,
                mask: `radial-gradient(farthest-side, transparent calc(100% - ${s.ring}), #000 calc(100% - ${s.ring}))`,
            }}
        />
    )

    if (!message) {
        return (
            <span role="status" aria-label="Loading" className={cn("inline-flex items-center justify-center", className)}>
                {arc}
            </span>
        )
    }

    // Full-page variant: the arc above a short message.
    return (
        <div role="status" className={cn("flex min-h-[50vh] flex-col items-center justify-center gap-3 p-4", className)}>
            {arc}
            <div className="flex flex-col items-center gap-0.5 text-center">
                <p className="text-ui font-medium text-fg">{message}</p>
                <p className="text-small text-fg-muted">This will only take a moment</p>
            </div>
        </div>
    )
}
