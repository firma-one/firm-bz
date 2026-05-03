"use client"

import { useState, useEffect } from "react"
import { Clock, AlertCircle } from "lucide-react"
import { DriveFile, DriveRevision } from "@/lib/types"
import { useAuth } from "@/lib/auth-context"
import { RelativeDateTime } from "@/components/ui/relative-date-time"
import { UserAvatarWithTooltip } from "@/components/ui/user-avatar-with-tooltip"

interface DocumentActivityPaneProps {
    document: DriveFile
}

export function DocumentActivityPane({ document }: DocumentActivityPaneProps) {
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
                setError('Failed to load activity')
            }
        } catch {
            setError('Error loading activity')
        } finally {
            setLoading(false)
        }
    }

    const activity = (() => {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        return revisions
            .filter(rev => new Date(rev.modifiedTime) >= thirtyDaysAgo)
            .sort((a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime())
    })()

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
                            <div className="flex gap-3 items-start">
                                <div className="w-7 h-7 rounded-full bg-slate-100 flex-shrink-0" />
                                <div className="flex-1 space-y-2 min-w-0">
                                    <div className="h-3 bg-slate-100 rounded w-2/3" />
                                    <div className="h-2.5 bg-slate-100 rounded w-1/3" />
                                </div>
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
            ) : activity.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 text-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                        <Clock className="h-5 w-5 text-slate-400" />
                    </div>
                    <p className="text-xs text-slate-500">No activity in the last 30 days.</p>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pr-2">
                    {activity.map((rev) => {
                        const displayName = rev.lastModifyingUser?.displayName || 'Unknown'
                        const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
                        return (
                            <div
                                key={rev.id}
                                className="group rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-slate-50/80 transition-colors"
                            >
                                <div className="flex items-start gap-2.5">
                                    <UserAvatarWithTooltip
                                        displayName={displayName}
                                        photoLink={rev.lastModifyingUser?.photoLink}
                                        email={undefined}
                                        avatarSize="lg"
                                        showEmail={false}
                                        showRole={false}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-slate-900 text-xs leading-snug">
                                            <span className="font-medium">{displayName}</span>
                                            {' '}
                                            <span className="text-slate-500">edited this file</span>
                                        </p>
                                        <div className="mt-1">
                                            <RelativeDateTime
                                                date={rev.modifiedTime}
                                                textClassName="text-xs text-slate-500"
                                                iconClassName="text-slate-300 hover:text-slate-500"
                                                tooltipSide="top"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
