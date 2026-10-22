'use client'

import { FolderPlus, type LucideProps } from 'lucide-react'
import { Hint } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/*
 * The one mark for a deliverable: lucide's folder-plus (Deepak, 2026-10-22). Standing alone — a Files
 * row, the Board, a menu or pane header, the Inbox, Home, the calendar's event dialog — it is in the
 * primary color. Inside something that sets its own color (a calendar chip, a filter pill, a section
 * header) use FolderPlus itself in that color. Untagging is folder-minus. Folders that only sit inside
 * or above a deliverable keep their own marks (SharedFolderIcon).
 */

export function DeliverableIcon({ className, hint = false }: { className?: string; hint?: boolean }) {
    const icon = <FolderPlus role="img" aria-label="Deliverable" className={cn('h-4 w-4 shrink-0 text-primary', className)} />
    return hint ? (
        <Hint label="Deliverable">
            <span className="inline-flex">{icon}</span>
        </Hint>
    ) : icon
}

/** The same mark for icon maps that render `<Icon className=… />`: folder-plus, always in the primary color. */
export function DeliverableGlyph({ className, ...props }: LucideProps) {
    return <FolderPlus {...props} className={cn(className, 'text-primary')} />
}
