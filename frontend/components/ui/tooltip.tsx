"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cnV2 } from "@/lib/utils"

const TooltipProvider = ({ delayDuration = 0, ...props }: React.ComponentProps<typeof TooltipPrimitive.Provider>) => (
    <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />
)

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const tooltipVariants = {
    light:
        "border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-900 shadow-md v2:rounded-card v2:border-0 v2:px-2.5 v2:text-small v2:text-fg v2:shadow-popover",
    dark: "border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-50 shadow-md v2:rounded-control v2:border-0 v2:bg-fg v2:px-2 v2:py-1 v2:text-small v2:text-white v2:shadow-popover",
} as const

export type TooltipVariant = keyof typeof tooltipVariants

export type TooltipContentProps = React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & {
    /** Default `light` for readability on light UIs. Use `dark` only on dark surfaces. */
    variant?: TooltipVariant
}

const TooltipContent = React.forwardRef<
    React.ElementRef<typeof TooltipPrimitive.Content>,
    TooltipContentProps
>(({ className, sideOffset = 4, variant = "light", ...props }, ref) => (
    <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
            ref={ref}
            sideOffset={sideOffset}
            className={cnV2(
                [
                    "z-[140] max-w-xs overflow-hidden rounded-md border animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
                    tooltipVariants[variant],
                ],
                className
            )}
            {...props}
        />
    </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
