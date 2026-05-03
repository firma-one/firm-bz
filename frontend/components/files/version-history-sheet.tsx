"use client"

import { useState, useEffect } from "react"
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { X, Clock, AlertCircle, Download, FileText } from "lucide-react"
import { DriveFile, DriveRevision } from "@/lib/types"
import { formatFileSize, formatSmartDateTime, cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"

interface VersionHistorySheetProps {
    isOpen: boolean
    onClose: () => void
    document: DriveFile
}

export function VersionHistorySheet({
    isOpen,
    onClose,
    document
}: VersionHistorySheetProps) {
    const { session } = useAuth()
    const [activeTab, setActiveTab] = useState<'activity' | 'versions'>('activity')

    // Versions State
    const [revisions, setRevisions] = useState<DriveRevision[]>([])
    const [loadingVersions, setLoadingVersions] = useState(false)
    const [versionsError, setVersionsError] = useState<string | null>(null)

    // Reset when opening
    useEffect(() => {
        if (isOpen && document?.id && document?.connectorId) {
            loadRevisions()
            setActiveTab('activity')
        } else {
            setRevisions([])
            setLoadingVersions(false)
        }
    }, [isOpen, document])

    const loadRevisions = async () => {
        if (!session?.access_token || !document.connectorId) return
        setLoadingVersions(true)
        setVersionsError(null)
        try {
            const response = await fetch(`/api/documents/versions?fileId=${document.id}&connectorId=${document.connectorId}`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            })
            if (response.ok) {
                const data = await response.json()
                setRevisions(data.revisions)
            } else {
                setVersionsError('Failed to load version history')
            }
        } catch (err) {
            setVersionsError('Error loading versions')
        } finally {
            setLoadingVersions(false)
        }
    }

    const getActivityFromRevisions = () => {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        return revisions
            .filter(rev => new Date(rev.modifiedTime) >= thirtyDaysAgo)
            .sort((a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime())
    }

    if (!document) return null

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <SheetContent className="w-full sm:max-w-md p-0 flex flex-col h-full bg-slate-50 border-l border-gray-200 shadow-2xl">
                {/* Header */}
                <div className="bg-white px-6 pt-5 pb-0 flex flex-col border-b border-gray-100 shadow-sm z-20 relative">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3 overflow-hidden">
                            <div className="w-10 h-10 bg-blue-50/80 rounded-xl flex items-center justify-center flex-shrink-0 border border-blue-100">
                                <FileText className="h-5 w-5 text-blue-600" />
                            </div>
                            <div className="min-w-0">
                                <SheetTitle className="text-base font-bold text-gray-900 truncate" title={document.name}>
                                    {document.name}
                                </SheetTitle>
                                <SheetDescription className="text-xs text-gray-500">
                                    Document details & history
                                </SheetDescription>
                            </div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-400 hover:text-gray-700">
                            <X className="h-5 w-5" />
                        </Button>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-6 text-sm font-medium">
                        <button
                            onClick={() => setActiveTab('activity')}
                            className={cn(
                                "pb-3 border-b-2 transition-all px-1",
                                activeTab === 'activity'
                                    ? "border-blue-600 text-blue-600"
                                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200"
                            )}
                        >
                            Activity
                        </button>
                        <button
                            onClick={() => setActiveTab('versions')}
                            className={cn(
                                "pb-3 border-b-2 transition-all px-1",
                                activeTab === 'versions'
                                    ? "border-blue-600 text-blue-600"
                                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200"
                            )}
                        >
                            History <span className="ml-1.5 px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded-full">{revisions.length}</span>
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto bg-slate-50/50 p-0">

                    {/* Activity Tab */}
                    {activeTab === 'activity' && (
                        <div className="p-6">
                            {loadingVersions ? (
                                <div className="space-y-4 animate-pulse">
                                    {[1, 2, 3].map(i => (
                                        <div key={i} className="flex gap-4">
                                            <div className="w-8 h-8 bg-gray-200 rounded-full" />
                                            <div className="flex-1">
                                                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                                                <div className="h-3 bg-gray-200 rounded w-1/4" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : versionsError ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                    <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mb-3">
                                        <AlertCircle className="h-6 w-6 text-red-500" />
                                    </div>
                                    <p className="text-sm font-medium text-gray-900">{versionsError}</p>
                                </div>
                            ) : (() => {
                                const activity = getActivityFromRevisions()
                                return activity.length === 0 ? (
                                    <div className="text-center py-12 text-gray-500 text-sm">
                                        No activity in the last 30 days.
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {activity.map((rev, idx) => {
                                            const displayName = rev.lastModifyingUser?.displayName || 'Unknown'
                                            const initials = displayName.split(' ').map(n => n[0]).join('').slice(0, 2)

                                            return (
                                                <div key={rev.id} className="flex gap-4 group">
                                                    <div className="flex flex-col items-center">
                                                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold border-2 border-white shadow-sm z-10 flex-shrink-0 overflow-hidden">
                                                            {rev.lastModifyingUser?.photoLink ? (
                                                                <img src={rev.lastModifyingUser.photoLink} alt="" className="w-full h-full" />
                                                            ) : (
                                                                initials
                                                            )}
                                                        </div>
                                                        {idx !== activity.length - 1 && (
                                                            <div className="w-px bg-gray-200 flex-grow mt-2 group-hover:bg-gray-300 transition-colors" />
                                                        )}
                                                    </div>
                                                    <div className="pb-6">
                                                        <p className="text-sm text-gray-900">
                                                            <span className="font-medium">{displayName}</span>
                                                            {' '}
                                                            <span className="text-gray-600">edited</span>
                                                            {' '}
                                                            this file
                                                        </p>
                                                        <p className="text-xs text-gray-400 mt-1">
                                                            {formatSmartDateTime(rev.modifiedTime)}
                                                        </p>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )
                            })()}
                        </div>
                    )}

                    {/* Versions Tab */}
                    {activeTab === 'versions' && (
                        <div className="p-6">
                            {/* Reuse existing version list UI logic here */}
                            {loadingVersions ? (
                                <div className="space-y-6 animate-pulse">
                                    {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-lg" />)}
                                </div>
                            ) : versionsError ? (
                                <div className="text-center p-6 text-red-500 text-sm">{versionsError}</div>
                            ) : revisions.length === 0 ? (
                                <div className="text-center text-gray-500 py-10">No version history</div>
                            ) : (
                                <div className="relative ml-2 space-y-0 pb-10">
                                    {revisions.slice().reverse().map((rev, index) => {
                                        const isCurrent = index === 0
                                        const versionNumber = revisions.length - index
                                        return (
                                            <div key={rev.id} className="relative pl-10 pb-8 group last:pb-0">
                                                <div className="absolute left-0 top-[5px] flex flex-col items-center h-full">
                                                    <div className={cn("w-3.5 h-3.5 rounded-full border-2 z-10 bg-white transition-all", isCurrent ? "border-blue-600 scale-110" : "border-gray-300")} />
                                                    {index !== revisions.length - 1 && <div className="w-px bg-gray-200 flex-grow mt-1" />}
                                                </div>
                                                <div className={cn("p-3 rounded-xl border transition-all", isCurrent ? "bg-white border-blue-100 shadow-sm" : "border-transparent hover:bg-white hover:border-gray-100")}>
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className={cn("text-xs font-semibold", isCurrent ? "text-blue-900" : "text-gray-700")}>
                                                            {isCurrent ? 'Current Version' : `Version ${versionNumber}`}
                                                        </span>
                                                        {/* Download Button Logic reused */}
                                                        <Button variant="ghost" size="icon" className="h-6 w-6"
                                                            onClick={(e) => {
                                                                if (!session?.access_token) return
                                                                const url = `/api/documents/download?fileId=${document.id}&connectorId=${document.connectorId}&revisionId=${rev.id}&filename=${encodeURIComponent(rev.originalFilename || document.name)}&token=${session.access_token}`
                                                                const a = window.document.createElement('a'); a.href = url; a.download = rev.originalFilename || document.name; window.document.body.appendChild(a); a.click(); window.document.body.removeChild(a);
                                                            }}
                                                        >
                                                            <Download className="h-3 w-3 text-gray-400 hover:text-blue-600" />
                                                        </Button>
                                                    </div>
                                                    <div className="text-xs text-gray-500">
                                                        {formatSmartDateTime(rev.modifiedTime)} • {formatFileSize(Number(rev.size))}
                                                    </div>
                                                    {rev.lastModifyingUser && (
                                                        <div className="mt-1.5 flex items-center gap-1.5">
                                                            <div className="w-4 h-4 rounded-full bg-gray-200 flex-shrink-0 overflow-hidden">
                                                                {rev.lastModifyingUser.photoLink ?
                                                                    <img src={rev.lastModifyingUser.photoLink} alt="" /> :
                                                                    <div className="w-full h-full flex items-center justify-center text-[8px] font-bold text-gray-500">
                                                                        {rev.lastModifyingUser.displayName?.[0]}
                                                                    </div>
                                                                }
                                                            </div>
                                                            <span className="text-xs text-gray-600">{rev.lastModifyingUser.displayName}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}
