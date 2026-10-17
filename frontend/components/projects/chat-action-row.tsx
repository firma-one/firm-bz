'use client'

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { CornerDownRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A page action offered in the Brio panel's suggestion lists — "Review folder organization", "Set up
 * folder organization" on Files — laid out like the "Ask next" rows around it: the same muted
 * corner-down-right icon in the same slot, so the icons line up. Only the label wears the accent
 * green, as a chip, since the action does something rather than asks something. No sparkle:
 * everything in this panel is AI.
 */
export const ChatActionRow = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
    busy?: boolean
    children: ReactNode
}>(function ChatActionRow({ busy = false, className, children, ...props }, ref) {
    return (
        <button
            ref={ref}
            type="button"
            className={cn(
                'group/action inline-flex max-w-full items-start gap-2 rounded-control px-2 py-1 text-left text-small font-medium disabled:opacity-60',
                className,
            )}
            {...props}
        >
            <span className="mt-0.5 flex h-5 w-4 shrink-0 items-center justify-center text-fg-subtle [&_svg]:h-3.5 [&_svg]:w-3.5" aria-hidden>
                {busy ? <Loader2 className="animate-spin" /> : <CornerDownRight />}
            </span>
            <span className="min-w-0 rounded-control bg-action px-2 py-0.5 leading-5 text-action-fg transition-colors group-hover/action:bg-action-hover group-disabled/action:bg-action">
                {children}
            </span>
        </button>
    )
})
