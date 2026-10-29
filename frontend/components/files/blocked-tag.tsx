'use client'

import { Ban } from 'lucide-react'
import { Hint } from '@/components/ui/tooltip'
import { BLOCKED_REASON_LABEL, type BlockedFlag } from '@/lib/files/blocked'
import { cn } from '@/lib/utils'

/** The red tag that says a document is blocked; what it waits on, and why, on hover. */
export function BlockedTag({ blocked, className }: { blocked: BlockedFlag; className?: string }) {
    const label = BLOCKED_REASON_LABEL[blocked.reason]
    return (
        <Hint label={blocked.note ? `${label} · ${blocked.note}` : label}>
            <span
                className={cn('inline-flex h-5 shrink-0 items-center gap-1 rounded-control bg-tag-red-bg px-1.5 text-caption font-medium text-tag-red-fg', className)}
                aria-label={`Blocked: ${label}`}
            >
                <Ban className="h-3 w-3" aria-hidden />
                Blocked
            </span>
        </Hint>
    )
}

/** A deliverable's "n blocked" chip: its blocked documents, listed on hover. */
export function BlockedCountChip({
    documents,
    className,
}: {
    documents: { documentId: string; docId: string | null; fileName: string; reason: BlockedFlag['reason'] }[]
    className?: string
}) {
    if (documents.length === 0) return null
    return (
        <Hint
            label={
                <span className="block space-y-0.5">
                    {documents.map((d) => (
                        <span key={d.documentId} className="block">
                            {d.docId ? `${d.docId} · ` : ''}{d.fileName} — {BLOCKED_REASON_LABEL[d.reason]}
                        </span>
                    ))}
                </span>
            }
        >
            <span
                className={cn('inline-flex h-5 shrink-0 items-center gap-1 rounded-control bg-tag-red-bg px-1.5 text-caption font-medium tabular-nums text-tag-red-fg', className)}
                aria-label={`${documents.length} blocked`}
            >
                <Ban className="h-3 w-3" aria-hidden />
                {documents.length} blocked
            </span>
        </Hint>
    )
}
