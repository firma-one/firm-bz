'use client'

import { FolderInput, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

/*
 * The Files drop zone (design canvas section 10, "Files: always a place to drop", 2026-10-23). Shared
 * by the Files list and the tour's copy:
 * - FilesDropRow: a quiet last row under the files, so there's always somewhere to drop, with Browse.
 * - FilesDropPill: while files are dragged in, which folder they'll land in.
 * - FilesMovePill: while a row is dragged onto a folder, what's moving and where.
 * - FILES_DROP_ZONE_ACTIVE_CLASS: the list's outline while it is the target (inset, so a scroll box can't clip it).
 */

/** The list while files dragged in will land in the open folder: an inset dashed outline and a faint tint. */
export const FILES_DROP_ZONE_ACTIVE_CLASS = 'rounded-card bg-action/[0.03] outline-dashed outline-2 -outline-offset-2 outline-action/70'

/** A folder row while what's dragged over it (files to upload, or a row to move) will land in that folder. */
export const FILES_DROP_TARGET_ROW_CLASS = 'rounded-control bg-action/[0.08] ring-2 ring-inset ring-action'

/**
 * The last row of the list. `idle`: "Drop files here, or browse". `here`: files are over the list and
 * will land in the open folder. `elsewhere`: they're over a folder row, so this row says where the rest of
 * the list would put them.
 */
export function FilesDropRow({
    state,
    folderName,
    onBrowse,
}: {
    state: 'idle' | 'here' | 'elsewhere'
    folderName?: string
    onBrowse: () => void
}) {
    return (
        <div
            className={cn(
                'mx-1 my-2.5 flex h-11 items-center justify-center gap-1.5 rounded-card border border-dashed text-small transition-colors',
                state === 'here' ? 'border-action bg-action/[0.08] font-medium text-action' : 'border-line-strong text-fg-muted'
            )}
        >
            <Upload className={cn('h-4 w-4', state === 'here' ? 'text-action' : 'text-fg-subtle')} aria-hidden />
            {state === 'here' ? (
                <span>Release to upload here</span>
            ) : state === 'elsewhere' && folderName ? (
                <span>Drop here to upload to {folderName}</span>
            ) : (
                <>
                    <span>Drop files here, or</span>
                    <button
                        type="button"
                        onClick={onBrowse}
                        className="rounded-control text-fg underline decoration-fg-subtle underline-offset-2 hover:decoration-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30"
                    >
                        browse
                    </button>
                </>
            )}
        </div>
    )
}

/**
 * The drag pills' look: centered on the table's 34px header row, so it covers neither the filters
 * above nor the drop row on a short list.
 */
const DRAG_PILL_CLASS =
    'pointer-events-none absolute left-1/2 top-[17px] z-50 flex max-w-[90%] -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-fg px-4 py-2 text-small text-surface shadow-popover animate-in fade-in duration-150'

/** While files are dragged in: how many, and the folder they'll land in. */
export function FilesDropPill({ count, folderName }: { count: number; folderName: string }) {
    return (
        <div role="status" className={DRAG_PILL_CLASS}>
            <Upload className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">
                Upload {count > 0 ? `${count} ${count === 1 ? 'file' : 'files'}` : 'files'} to <span className="font-semibold">{folderName}</span>
            </span>
        </div>
    )
}

/**
 * While a row is dragged onto a folder to move it: what's moving and where, or a nudge to drop it
 * on a folder. It replaces the old dark guide, whose Cancel couldn't be clicked mid-drag — Esc ends a drag.
 */
export function FilesMovePill({ itemName, folderName }: { itemName: string; folderName?: string }) {
    return (
        <div role="status" className={DRAG_PILL_CLASS}>
            <FolderInput className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">
                {folderName ? (
                    <>Move <span className="font-semibold">{itemName}</span> to <span className="font-semibold">{folderName}</span></>
                ) : (
                    <>Drop on a folder to move <span className="font-semibold">{itemName}</span></>
                )}
            </span>
            <span className="shrink-0 opacity-70">· Esc to cancel</span>
        </div>
    )
}
