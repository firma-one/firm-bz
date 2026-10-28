"use client"

import { Clock, AlertCircle, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DriveFile, DriveRevision } from "@/lib/types"
import { formatFileSize } from "@/lib/utils"
import { useDownloadProgress } from "@/lib/download-progress-context"
import { RelativeDateTime } from "@/components/ui/relative-date-time"
import { UserAvatarWithTooltip } from "@/components/ui/user-avatar-with-tooltip"
import { useDocumentVersions } from "@/components/files/use-document-versions"

interface DocumentHistoryPaneProps {
    document: DriveFile
    /** The engagement the document belongs to. Without it there is nothing to load. */
    projectId?: string
    /** Inside the Details pane, which names the file once above its tabs. */
    hideName?: boolean
}

export function DocumentHistoryPane({ document, projectId, hideName }: DocumentHistoryPaneProps) {
    const { addTask, updateTask } = useDownloadProgress()
    const versions = useDocumentVersions(document?.id, projectId)
    const { revisions, loading, unsupported } = versions
    const error = versions.error && 'Failed to load version history'

    // Through the engagement's own download route, which checks membership and takes the storage
    // connection from the document. The sign-in cookie authenticates it, so no token rides in the URL.
    // The current version is the file itself: Graph serves earlier versions only, and Drive's head
    // revision is the same bytes, so it downloads as the file does.
    const downloadVersion = async (rev: DriveRevision, isCurrent: boolean) => {
        if (!projectId) return
        const filename = rev.originalFilename || document.name
        const taskId = addTask(filename)
        try {
            const res = await fetch(
                `/api/projects/${projectId}/documents/${encodeURIComponent(document.id)}/download-share${isCurrent ? '' : `?revisionId=${encodeURIComponent(rev.id)}`}`
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

    return (
        <div className="flex flex-col h-full min-h-0 p-4 min-w-0">
            {!hideName && (
                <div className="inline-flex max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-surface-subtle px-3 py-2 mb-4">
                    <span className="truncate text-xs font-medium text-slate-700" title={document.name}>
                        {document.name}
                    </span>
                </div>
            )}

            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 animate-pulse">
                            <div className="space-y-2">
                                <div className="h-3 bg-slate-100 rounded w-1/3" />
                                <div className="h-2.5 bg-slate-100 rounded w-2/3" />
                                <div className="h-2 bg-slate-100 rounded w-1/2" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : error ? (
                <div className="flex flex-col items-center justify-center flex-1 text-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                        <AlertCircle className="h-5 w-5 text-slate-400" />
                    </div>
                    <p className="text-xs text-slate-500">{error}</p>
                </div>
            ) : revisions.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 text-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                        <Clock className="h-5 w-5 text-slate-400" />
                    </div>
                    <p className="text-xs text-slate-500">
                        {unsupported ? "Version history isn't available for this storage yet." : 'No version history available.'}
                    </p>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pr-2">
                    {revisions.slice().reverse().map((rev, idx) => {
                        const isCurrent = idx === 0
                        const versionNumber = revisions.length - idx
                        const displayName = rev.lastModifyingUser?.displayName || 'Unknown'
                        return (
                            <div
                                key={rev.id}
                                className={`rounded-2xl border px-4 py-3 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors ${
                                    isCurrent
                                        ? 'border-slate-200 bg-white'
                                        : 'border-slate-200 bg-white hover:bg-slate-50/80'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <span className={`text-xs font-semibold ${isCurrent ? 'text-fg' : 'text-slate-700'}`}>
                                        {isCurrent ? 'Current Version' : `Version ${versionNumber}`}
                                    </span>
                                    {projectId && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 text-slate-400 hover:text-slate-600"
                                            aria-label="Download this version"
                                            onClick={() => downloadVersion(rev, isCurrent)}
                                        >
                                            <Download className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 mb-2">
                                    <RelativeDateTime
                                        date={rev.modifiedTime}
                                        textClassName="text-xs text-slate-500"
                                        iconClassName="text-slate-300 hover:text-slate-500"
                                        tooltipSide="top"
                                    />
                                    <span className="text-xs text-slate-400">•</span>
                                    <span className="text-xs text-slate-500">{formatFileSize(Number(rev.size))}</span>
                                </div>
                                {rev.lastModifyingUser && (
                                    <div className="flex items-center gap-2">
                                        <UserAvatarWithTooltip
                                            displayName={displayName}
                                            photoLink={rev.lastModifyingUser.photoLink}
                                            email={undefined}
                                            avatarSize="md"
                                            showEmail={false}
                                            showRole={false}
                                        />
                                        <span className="text-xs text-slate-600">{displayName}</span>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
