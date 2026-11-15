'use client'

import { FolderLock, Lock, Folder } from 'lucide-react'
import { Hint } from '@/components/ui/tooltip'

/**
 * The mark on what's internal only (stored as a `private` lock): Limited Access contributors and Reviewers
 * can't see it, Leads and Full Access contributors still do. Whoever may change it can click it to remove
 * the mark; to anyone else it only says so. Shared by the Files row and /tour's copy of it.
 *
 * A folder wears it as its own icon instead (InternalOnlyFolderIcon), so its row has one lock, not two;
 * removing it is in the ⋮ menu (Organize › Remove internal only).
 */
export function PrivateMark({ onMakePublic }: { onMakePublic?: () => void }) {
    return (
        <Hint label={`Internal only. Hidden from Limited Access contributors and Reviewers.${onMakePublic ? ' Click to remove.' : ''}`}>
            {onMakePublic ? (
                <button
                    type="button"
                    aria-label="Internal only. Click to remove"
                    onClick={(e) => {
                        e.stopPropagation()
                        onMakePublic()
                    }}
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
                >
                    <Lock className="h-3.5 w-3.5" aria-hidden />
                </button>
            ) : (
                <span role="img" aria-label="Internal only" className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-fg-muted">
                    <Lock className="h-3.5 w-3.5" aria-hidden />
                </span>
            )}
        </Hint>
    )
}

/** An internal only folder's icon (lucide folder-lock), in place of its folder icon, at the folder icon's size and color. */
export function InternalOnlyFolderIcon() {
    return (
        <Hint label="Internal only. Hidden from Limited Access contributors and Reviewers.">
            <span role="img" aria-label="Internal only folder" className="inline-flex shrink-0">
                <FolderLock className="h-4 w-4 fill-surface-muted text-fg-muted" aria-hidden />
            </span>
        </Hint>
    )
}

/**
 * A plain folder's icon in the Files table: one outside any deliverable, which only the firm sees.
 * Not a lock (that marks the exception, a folder made Internal only inside a deliverable); the hint
 * says it, in the badge's words.
 */
export function InternalFolderIcon() {
    return (
        <Hint label="Internal only">
            <span role="img" aria-label="Internal folder" className="inline-flex shrink-0">
                <Folder className="h-4 w-4 fill-surface-muted text-fg-muted" aria-hidden />
            </span>
        </Hint>
    )
}
