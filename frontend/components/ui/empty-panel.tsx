import * as React from "react"
import { cn } from "@/lib/utils"

/** New UI (v2) empty state — quiet, centered, one optional action. */
export interface EmptyPanelProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
    icon?: React.ReactNode
    title: React.ReactNode
    description?: React.ReactNode
    action?: React.ReactNode
    /** Tighter padding for use inside a list group or card. */
    compact?: boolean
}

export function EmptyPanel({ icon, title, description, action, compact = false, className, ...props }: EmptyPanelProps) {
    return (
        <div
            className={cn(
                "flex flex-col items-center justify-center gap-1 text-center",
                compact ? "px-4 py-6" : "px-6 py-14",
                className
            )}
            {...props}
        >
            {icon && <span className="mb-2 flex items-center text-fg-subtle [&_svg]:h-6 [&_svg]:w-6">{icon}</span>}
            <p className="text-ui font-medium text-fg">{title}</p>
            {description && <p className="max-w-sm text-small text-fg-muted">{description}</p>}
            {action && <div className="mt-3">{action}</div>}
        </div>
    )
}
