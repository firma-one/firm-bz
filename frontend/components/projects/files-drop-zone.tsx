'use client'

import { Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

/*
 * The Files drop zone (design canvas section 10, "Files: always a place to drop", 2026-10-23). Shared
 * by the Files list and the tour's copy:
 * - FilesDropRow: a quiet last row under the files, so there's always somewhere to drop, with Browse.
 * - FilesDropPill: while files are dragged in, which folder they'll land in.
 * - setRowDragImage: a compact drag image for a row being moved onto a folder.
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

const SVG_ATTRS = 'width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-fg-muted" aria-hidden="true"'
/** lucide's File and Folder glyphs, as markup: the drag image is plain DOM, drawn before React could render it. */
const FILE_GLYPH = `<svg ${SVG_ATTRS}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`
const FOLDER_GLYPH = `<svg ${SVG_ATTRS}><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>`

/**
 * The drag image for a row being moved onto a folder: its icon and name on a small card, in place of
 * the browser's translucent copy of the whole row, which slid over the folder rows it passed (and
 * their "Move here" tag). The folder row's outline and tag say where it lands, so there's no pill.
 */
export function setRowDragImage(e: React.DragEvent, name: string, isFolder: boolean) {
    if (typeof document === 'undefined' || typeof e.dataTransfer?.setDragImage !== 'function') return
    const card = document.createElement('div')
    card.className = 'fixed -left-[9999px] top-0 flex max-w-[260px] items-center gap-1.5 rounded-control bg-surface px-2 py-1 text-small text-fg shadow-popover'
    card.innerHTML = isFolder ? FOLDER_GLYPH : FILE_GLYPH
    const label = document.createElement('span')
    label.className = 'truncate'
    label.textContent = name
    card.appendChild(label)
    document.body.appendChild(card)
    e.dataTransfer.setDragImage(card, 12, 14)
    // The browser takes its snapshot during dragstart; the card can go right after.
    setTimeout(() => card.remove(), 0)
}
