import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * The card you open or drag (.claude/plans/app-design-refinements.md, section 4): Notion's card
 * shadow, whose 1px ring stands in for the border, a warm hover and the focus ring. Page sections
 * stay flat; only things you can pick up or open get depth.
 *
 * `interactiveCardClass` is for cards that render as a button or a link (WorkspaceCard, ClientList,
 * ContinueSection, FirmList); `InteractiveCard` is the div shell, e.g. for the Board's DraggableCard.
 */
export function interactiveCardClass({ lifted = false }: { lifted?: boolean } = {}) {
    return cn(
        'rounded-card bg-surface text-left',
        'transition-[box-shadow,transform] duration-ui-fast ease-ui-out',
        // Hover: a firmer ring and lift (shadow-card-hover) over a near-white fill. The old 6% gray tint
        // matched the gray inside a card (avatar bubbles, an empty progress track), which then vanished.
        // A solid fill, so the card stays opaque on a tinted Board lane.
        'hover:bg-surface-sidebar',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30',
        'disabled:cursor-not-allowed disabled:opacity-60',
        // Lifted: under the pointer while dragging, tilted 2.5° (level for reduced motion).
        lifted ? 'shadow-card-drag rotate-[2.5deg] motion-reduce:rotate-0' : 'shadow-card hover:shadow-card-hover'
    )
}

export const InteractiveCard = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & { lifted?: boolean }
>(function InteractiveCard({ lifted, className, ...props }, ref) {
    return <div ref={ref} className={cn(interactiveCardClass({ lifted }), className)} {...props} />
})
