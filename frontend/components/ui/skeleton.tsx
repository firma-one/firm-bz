import { cn } from "@/lib/utils"

function Skeleton({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            // A soft sweep (the same shimmer as components/ui/shimmer.tsx). The solid color under the
            // gradient only shows if the gradient fails to paint.
            className={cn("bg-[#e5e7eb] dark:bg-[#2a2a2e] rounded-control bg-[linear-gradient(90deg,var(--ui-surface-muted)_0%,var(--ui-surface-muted)_35%,var(--ui-surface-selected)_50%,var(--ui-surface-muted)_65%,var(--ui-surface-muted)_100%)] bg-[length:200%_100%] animate-shimmer motion-reduce:animate-none", className)}
            {...props}
        />
    )
}

export { Skeleton }
