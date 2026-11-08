'use client'

import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Download, Maximize2, Minimize2, Trash2, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/*
 * The Files list's two corner panels for selection actions: Download as ZIP and Move to trash. Each
 * row says what happened to it in words, a ZIP short of files says so, and a failure is drawn with
 * its reason, never as "complete" (FI-5, FI-6, P1-44). Moved here from engagement-file-list.tsx.
 */

/** A ZIP being made, made (whole, or short of something), or refused. */
export type DownloadQueueItem = {
    id: string
    name: string
    status: 'preparing' | 'done' | 'partial' | 'error'
    /** Why it failed. */
    error?: string
    /** What the ZIP is short of, when it is. */
    note?: string
}

/** One selected item on its way to the trash. */
export type TrashQueueItem = {
    id: string
    name: string
    connectorId: string
    /** A link: deleted through its document, since it has no item in storage. */
    isLink?: boolean
    documentId?: string
    status: 'pending' | 'done' | 'error'
    error?: string
}

/** The download panel's header: never "complete" over a failure or a short ZIP. */
export function downloadPanelTitle(queue: DownloadQueueItem[]): string {
    if (queue.some((i) => i.status === 'preparing')) return 'Preparing download…'
    const failed = queue.filter((i) => i.status === 'error').length
    const short = queue.filter((i) => i.status === 'partial').length
    if (queue.length === 1) {
        if (failed) return 'Download failed'
        if (short) return 'Downloaded, with files left out'
        return 'Download complete'
    }
    if (failed) return `${queue.length - failed} of ${queue.length} downloaded · ${failed} failed`
    if (short) return `Downloads complete · ${short} with files left out`
    return 'Downloads complete'
}

/** The trash panel's header: how many went, out of how many. */
export function trashPanelTitle(queue: TrashQueueItem[]): string {
    const done = queue.filter((i) => i.status === 'done').length
    if (queue.some((i) => i.status === 'pending')) return `Moving to trash… ${done}/${queue.length}`
    if (done === queue.length) return queue.length === 1 ? 'Moved to trash' : `Moved ${done} to trash`
    if (done === 0) return queue.length === 1 ? "Couldn't move it to trash" : `Couldn't move ${queue.length} to trash`
    return `Moved ${done} of ${queue.length} to trash`
}

function Spinner() {
    return (
        <svg className="animate-spin h-3.5 w-3.5 text-fg-subtle flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
    )
}

/** A row's name, and under it the reason it failed or what it's short of, in full on hover. */
function RowText({ name, error, note }: { name: string; error?: string; note?: string }) {
    return (
        <div className="min-w-0 flex-1">
            <p className="text-[11px] text-fg-muted truncate" title={name}>{name}</p>
            {error && <p className="text-[10px] text-red-600 line-clamp-3" title={error}>{error}</p>}
            {!error && note && <p className="text-[10px] text-amber-700 line-clamp-3" title={note}>{note}</p>}
        </div>
    )
}

export function DownloadQueuePanel({ queue, open, onToggle, onClose, bottom }: {
    queue: DownloadQueueItem[]
    open: boolean
    onToggle: () => void
    onClose: () => void
    bottom: string
}) {
    if (queue.length === 0 || typeof document === 'undefined' || !document.body) return null
    const failed = queue.some((i) => i.status === 'error')
    return createPortal(
        <div
            role="region"
            aria-label="Downloads"
            className={cn(
                'fixed right-4 bg-white rounded-lg shadow-xl border border-line z-[101] flex flex-col transition-all duration-300 w-[360px]',
                open ? 'h-auto max-h-[300px]' : 'h-10'
            )}
            style={{ bottom }}
        >
            <div className="flex items-center justify-between px-3 py-2 bg-surface-muted border-b border-line text-fg rounded-t-lg cursor-pointer" onClick={onToggle}>
                <span className={cn('text-[11px] font-medium', failed && 'text-red-600')}>{downloadPanelTitle(queue)}</span>
                <div className="flex items-center gap-2 text-fg-muted">
                    {open ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                    <button type="button" aria-label="Close downloads" onClick={(e) => { e.stopPropagation(); onClose() }} className="hover:bg-surface-hover rounded p-0.5 transition-colors">
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
            {open && (
                <div className="flex-1 overflow-y-auto p-0">
                    {queue.map((item) => (
                        <div key={item.id} className="flex items-start gap-2 px-3 py-2 border-b border-line last:border-0">
                            <Download className="mt-px h-3.5 w-3.5 flex-shrink-0 text-fg-subtle" />
                            <RowText name={item.name} error={item.status === 'error' ? (item.error || 'Download failed') : undefined} note={item.note} />
                            {item.status === 'preparing' && <Spinner />}
                            {item.status === 'done' && <CheckCircle2 className="h-3.5 w-3.5 text-fg flex-shrink-0" aria-label="Downloaded" />}
                            {item.status === 'partial' && <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" aria-label="Files left out" />}
                            {item.status === 'error' && <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" aria-label="Failed" />}
                        </div>
                    ))}
                </div>
            )}
        </div>,
        document.body
    )
}

export function TrashQueuePanel({ queue, open, onToggle, onClose, bottom }: {
    queue: TrashQueueItem[]
    open: boolean
    onToggle: () => void
    onClose: () => void
    bottom: string
}) {
    if (queue.length === 0 || typeof document === 'undefined' || !document.body) return null
    return createPortal(
        <div
            role="region"
            aria-label="Move to trash"
            className={cn(
                'fixed right-4 bg-white rounded-lg shadow-xl border border-line z-[102] flex flex-col transition-all duration-300 w-[360px]',
                open ? 'h-auto max-h-[300px]' : 'h-10'
            )}
            style={{ bottom }}
        >
            <div className="flex items-center justify-between px-3 py-2 bg-red-50 border-b border-red-100 text-fg rounded-t-lg cursor-pointer" onClick={onToggle}>
                <span className="text-[11px] font-medium">{trashPanelTitle(queue)}</span>
                <div className="flex items-center gap-2 text-fg-muted">
                    {open ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                    <button type="button" aria-label="Close" onClick={(e) => { e.stopPropagation(); onClose() }} className="hover:bg-red-100 rounded p-0.5 transition-colors">
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
            {open && (
                <div className="flex-1 overflow-y-auto p-0">
                    {queue.map((item) => (
                        <div key={item.id} className="flex items-start gap-2 px-3 py-2 border-b border-line last:border-0">
                            <Trash2 className="mt-px h-3.5 w-3.5 flex-shrink-0 text-fg-subtle" />
                            {/* The reason in words on the row, not only in a hover title. */}
                            <RowText name={item.name} error={item.status === 'error' ? (item.error || "Couldn't move it to trash.") : undefined} />
                            {item.status === 'pending' && <Spinner />}
                            {item.status === 'done' && <CheckCircle2 className="h-3.5 w-3.5 text-fg flex-shrink-0" aria-label="Moved to trash" />}
                            {item.status === 'error' && <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" aria-label="Failed" />}
                        </div>
                    ))}
                </div>
            )}
        </div>,
        document.body
    )
}
