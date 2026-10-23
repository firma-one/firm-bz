"use client"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/**
 * One property in an entity header's properties row (engagement, client): the value inline, its
 * name as a tooltip — Linear's issue-header pattern. Needs a TooltipProvider above it.
 */
export function HeaderProp({ label, icon, className, children }: { label: string; icon?: React.ReactNode; className?: string; children: React.ReactNode }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span className={cn("inline-flex items-center text-fg-subtle", className)}>
                    {icon && <span className="pl-1.5">{icon}</span>}
                    {children}
                </span>
            </TooltipTrigger>
            <TooltipContent variant="dark" side="bottom">{label}</TooltipContent>
        </Tooltip>
    )
}
