"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

const TooltipProvider = ({ delayDuration = 0, ...props }: React.ComponentProps<typeof TooltipPrimitive.Provider>) => (
    <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />
)

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const tooltipVariants = {
    light:
        "bg-white py-1.5 rounded-card border-0 px-2.5 text-small text-fg shadow-popover",
    dark: "rounded-control border-0 bg-fg px-2 py-1 text-small text-white shadow-popover",
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
            className={cn(
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

/**
 * A one-line hint on any element: the app's replacement for a native `title` tooltip, which
 * looks and times differently in every browser. The child must accept a ref (an element or a
 * forwardRef component).
 */
function Hint({
    label,
    children,
    side = "top",
}: {
    label: React.ReactNode
    children: React.ReactElement
    side?: TooltipContentProps["side"]
}) {
    return (
        <TooltipProvider delayDuration={300}>
            <Tooltip>
                <TooltipTrigger asChild>{children}</TooltipTrigger>
                <TooltipContent side={side}>{label}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, Hint }
