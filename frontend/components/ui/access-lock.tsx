"use client"

import { Lock } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * Marks a tab or menu item that only some people see, and says who on hover. Used beside the
 * engagement's internal tabs and the sidebar's admin-only items, so the two read the same way.
 * Carries its own TooltipProvider: the sidebar renders outside the layout's provider.
 */
export function AccessLock({
    label,
    side = "bottom",
    className,
}: {
    /** Who can see the item, e.g. "Firm admins only". */
    label: string
    side?: "top" | "right" | "bottom" | "left"
    className?: string
}) {
    return (
        <TooltipProvider delayDuration={300}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span role="img" aria-label={label} className={cn("inline-flex shrink-0 text-fg-subtle", className)}>
                        <Lock className="h-3 w-3" aria-hidden />
                    </span>
                </TooltipTrigger>
                <TooltipContent side={side} className="max-w-[240px]">
                    {label}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
