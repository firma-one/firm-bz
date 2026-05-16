"use client"

import { useState, useEffect } from "react"
import { Clock, AlertCircle, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DriveFile, DriveRevision } from "@/lib/types"
import { formatFileSize } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import { RelativeDateTime } from "@/components/ui/relative-date-time"
import { UserAvatarWithTooltip } from "@/components/ui/user-avatar-with-tooltip"

interface DocumentHistoryPaneProps {
    document: DriveFile
}

export function DocumentHistoryPane({ document }: DocumentHistoryPaneProps) {
    const { session } = useAuth()
    const [revisions, setRevisions] = useState<DriveRevision[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        load()
    }, [document?.id, session?.access_token])

    const load = async () => {
        if (!session?.access_token || !document?.connectorId) {
            setLoading(false)
            return
        }
        setLoading(true)
        setError(null)
        try {
            const res = await fetch(
                `/api/documents/versions?fileId=${document.id}&connectorId=${document.connectorId}`,
                { headers: { Authorization: `Bearer ${session.access_token}` } }
            )
            if (res.ok) {
                const data = await res.json()
                setRevisions(data.revisions || [])
            } else {
                setError('Failed to load version history')
            }
        } catch {
            setError('Error loading versions')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex flex-col h-full min-h-0 p-4 min-w-0">
            <div className="inline-flex max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 mb-4">
                <span className="truncate text-xs font-medium text-slate-700" title={document.name}>
                    {document.name}
                </span>
            </div>

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
                    <p className="text-xs text-slate-500">No version history available.</p>
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
                                    <span className={`text-xs font-semibold ${isCurrent ? 'text-slate-900' : 'text-slate-700'}`}>
                                        {isCurrent ? 'Current Version' : `Version ${versionNumber}`}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-slate-400 hover:text-slate-600"
                                        onClick={() => {
                                            if (!session?.access_token) return
                                            const url = `/api/documents/download?fileId=${document.id}&connectorId=${document.connectorId}&revisionId=${rev.id}&filename=${encodeURIComponent(rev.originalFilename || document.name)}&token=${session.access_token}`
                                            const a = window.document.createElement('a')
                                            a.href = url
                                            a.download = rev.originalFilename || document.name
                                            window.document.body.appendChild(a)
                                            a.click()
                                            window.document.body.removeChild(a)
                                        }}
                                    >
                                        <Download className="h-4 w-4" />
                                    </Button>
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
