'use client'

import { FolderPlus, type LucideProps } from 'lucide-react'
import { Hint } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/*
 * The one mark for a deliverable: lucide's folder-plus (Deepak, 2026-10-22). Standing alone — a Files
 * row, the breadcrumb, the Board, a menu or pane header, the Inbox, Home, the calendar's event dialog —
 * it is in the primary color. A folder inside a deliverable carries it too, a shade lighter (`inside`);
 * documents keep their file-type icons.
 * Inside something that sets its own color (a calendar chip, a filter pill, a section header) use
 * FolderPlus itself in that color. Demoting is folder-minus. A folder that only contains a deliverable
 * keeps its own mark (SharedFolderIcon).
 */

export function DeliverableIcon({ className, hint = false, inside = false }: { className?: string; hint?: boolean; inside?: boolean }) {
    const label = inside ? 'Inside a deliverable' : 'Deliverable'
    const icon = <FolderPlus role="img" aria-label={label} className={cn('h-4 w-4 shrink-0 text-primary', inside && 'opacity-60', className)} />
    return hint ? (
        <Hint label={label}>
            <span className="inline-flex">{icon}</span>
        </Hint>
    ) : icon
}

/** The same mark for icon maps that render `<Icon className=… />`: folder-plus, always in the primary color. */
export function DeliverableGlyph({ className, ...props }: LucideProps) {
    return <FolderPlus {...props} className={cn(className, 'text-primary')} />
}
