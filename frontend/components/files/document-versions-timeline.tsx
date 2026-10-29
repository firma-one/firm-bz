"use client"

import { AlertCircle, Clock, Download } from "lucide-react"
import type { DriveFile, DriveRevision } from "@/lib/types"
import { cn, formatFileSize, formatFullDate } from "@/lib/utils"
import { Hint } from "@/components/ui/tooltip"
import { versionName, type ApprovalRecord } from "@/lib/files/approvals"
import { Tag } from "@/components/ui/tag"
import { RelativeDateTime } from "@/components/ui/relative-date-time"
import { useDownloadProgress } from "@/lib/download-progress-context"
import { useDocumentVersions } from "@/components/files/use-document-versions"

/**
 * The Details pane's Versions tab: a compact timeline, newest first — each version under the
 * storage's own name for it, who saved it, when, its size and how much it changed from the one before.
 *
 * Named as the storage names it, never numbered here (2026-10-29): OneDrive's "Version 2.0", and on
 * Google Drive, which names none, the time it was saved, as Drive's own version list shows. A number
 * counted from the list would shift as the storage drops old versions, and stop matching the storage.
 */

export interface VersionRow {
    id: string
    /** The storage's own label (OneDrive's "2.0"); null where it has none (Google Drive). */
    label: string | null
    current: boolean
    at: string
    who: string | null
    size: number | null
    /** Bytes added (+) or removed (−) since the version before; null for the first or when unknown. */
    delta: number | null
    fileName?: string
}

function sizeOf(rev: DriveRevision): number | null {
    const n = Number(rev.size)
    return rev.size != null && rev.size !== '' && Number.isFinite(n) ? n : null
}

/** The provider's versions (oldest first) as timeline rows, newest first. */
export function versionRows(revisions: DriveRevision[]): VersionRow[] {
    return revisions
        .map((rev, i) => {
            const size = sizeOf(rev)
            const previous = i > 0 ? sizeOf(revisions[i - 1]) : null
            return {
                id: rev.id,
                label: rev.label ?? null,
                current: i === revisions.length - 1,
                at: rev.modifiedTime,
                who: rev.lastModifyingUser?.displayName ?? null,
                size,
                delta: size !== null && previous !== null ? size - previous : null,
                fileName: rev.originalFilename,
            }
        })
        .reverse()
}

/** What a version is called: "Version 2.0" on OneDrive; on Google Drive, the time it was saved (lib/files/approvals.ts). */
export function versionTitle(row: Pick<VersionRow, 'label' | 'at'>): string {
    return versionName(row)
}

/** "+4.7 KB" / "−1.2 KB"; nothing when the size didn't change. */
export function formatDelta(delta: number | null): string | null {
    if (delta === null || delta === 0) return null
    return `${delta > 0 ? '+' : '−'}${formatFileSize(Math.abs(delta))}`
}

export function DocumentVersionsTimeline({ document, projectId, approvals = [] }: {
    document: DriveFile
    projectId: string
    /** The document's approvals: a version approved is tagged so, a reopened one "Previously approved". */
    approvals?: ApprovalRecord[]
}) {
    const { addTask, updateTask } = useDownloadProgress()
    const { revisions, loading, error, unsupported } = useDocumentVersions(document?.id, projectId)
    const rows = versionRows(revisions)

    // Through the engagement's download route, which checks membership. The current version is the
    // file itself: Graph serves only earlier versions that way, and Drive's head revision is the same bytes.
    const download = async (row: VersionRow) => {
        const filename = row.fileName || document.name
        const taskId = addTask(filename)
        try {
            const res = await fetch(
                `/api/projects/${projectId}/documents/${encodeURIComponent(document.id)}/download-share${row.current ? '' : `?revisionId=${encodeURIComponent(row.id)}`}`
            )
            if (!res.ok) {
                updateTask(taskId, { status: 'error', error: res.status === 403 ? 'Download not permitted' : 'Download failed' })
                return
            }
            const blobUrl = URL.createObjectURL(await res.blob())
            updateTask(taskId, { status: 'complete' })
            const a = window.document.createElement('a')
            a.href = blobUrl
            a.download = filename
            window.document.body.appendChild(a)
            a.click()
            window.document.body.removeChild(a)
            setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
        } catch {
            updateTask(taskId, { status: 'error', error: 'Download failed' })
        }
    }

    if (loading) {
        return (
            <div className="space-y-4 pl-5">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse space-y-1.5">
                        <div className="h-3 w-1/3 rounded bg-surface-muted" />
                        <div className="h-2.5 w-2/3 rounded bg-surface-muted" />
                    </div>
                ))}
            </div>
        )
    }

    if (error || rows.length === 0) {
        const Icon = error ? AlertCircle : Clock
        return (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <Icon className="h-5 w-5 text-fg-subtle" />
                <p className="text-xs text-fg-muted">
                    {error ? 'Failed to load version history'
                        : unsupported ? "Version history isn't available for this storage yet."
                        : 'No versions yet.'}
                </p>
            </div>
        )
    }

    return (
        <ol className="ml-1.5 border-l border-line">
            {rows.map((row) => {
                const delta = formatDelta(row.delta)
                const title = versionTitle(row)
                // The latest approval of this version, if any: standing, or reopened since.
                const approval = [...approvals].reverse().find((a) => a.version.id === row.id)
                return (
                    <li key={row.id} className="group relative pb-4 pl-5 last:pb-0">
                        <span
                            aria-hidden
                            className={cn(
                                'absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full border',
                                row.current ? 'border-action bg-action' : 'border-line bg-surface',
                            )}
                        />
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-medium tabular-nums text-fg">{title}</span>
                            {row.current && <Tag color="green">Current</Tag>}
                            {approval && (
                                <Hint label={`${approval.unlockedAt ? 'Approved, reopened since' : 'Approved'} · ${formatFullDate(approval.approvedAt)}`}>
                                    <span className="inline-flex">
                                        <Tag color={approval.unlockedAt ? 'gray' : 'green'}>{approval.unlockedAt ? 'Previously approved' : 'Approved'}</Tag>
                                    </span>
                                </Hint>
                            )}
                            {/* How long ago, beside a name; a Google version's name is already its time */}
                            <span className="ml-auto">
                                {row.label && <RelativeDateTime date={row.at} textClassName="text-caption text-fg-subtle" tooltipSide="left" />}
                            </span>
                            <button
                                type="button"
                                aria-label={`Download ${title}`}
                                onClick={() => download(row)}
                                className="rounded-control p-1 text-fg-subtle opacity-0 transition-opacity hover:bg-surface-hover hover:text-fg focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                            >
                                <Download className="h-3.5 w-3.5" />
                            </button>
                        </div>
                        <p className="mt-0.5 truncate text-caption text-fg-muted">
                            {[row.who, row.size !== null ? formatFileSize(row.size) : null].filter(Boolean).join(' · ')}
                            {delta && <span className={cn('ml-1.5 tabular-nums', row.delta! > 0 ? 'text-fg-muted' : 'text-fg-subtle')}>{delta}</span>}
                        </p>
                    </li>
                )
            })}
        </ol>
    )
}
