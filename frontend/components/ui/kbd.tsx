import * as React from "react"
import { cn } from "@/lib/utils"

/** New UI (v2) keyboard hint — `⌘K`, `G` `H`. One key per Kbd. */
export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
    return (
        <kbd
            className={cn(
                "inline-flex h-5 min-w-5 items-center justify-center rounded-control border border-line bg-surface-subtle px-1 text-caption font-medium text-fg-muted",
                className
            )}
            {...props}
        />
    )
}
