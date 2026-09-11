"use client"

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Trash2, FileText, ShieldCheck, SquarePlus, RefreshCw } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { GooglePickerButton } from './google-picker-button'
import { formatDistanceToNow } from 'date-fns'
import { formatFileSize, cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BrandName } from '@/components/brand/BrandName'

interface GoogleDriveManagerProps {
    connectionId: string
    onImport?: (files: any[]) => void
    /** Compact layout for Connectors: de-emphasize vs workspace folder. */
    variant?: 'default' | 'compact'
}

interface LinkedFile {
    id: string
    name: string
    mimeType: string
    size: string
    linkedAt: string
    status: string
    isGrantRevoked: boolean
}

export function GoogleDriveManager({ connectionId, onImport, variant = 'default' }: GoogleDriveManagerProps) {
    const compact = variant === 'compact'
    const [linkedFiles, setLinkedFiles] = useState<LinkedFile[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [isRevoking, setIsRevoking] = useState<string | null>(null)
    const [isGuideOpen, setIsGuideOpen] = useState(false)
    const [isGrantModalOpen, setIsGrantModalOpen] = useState(false)
    const { addToast } = useToast()

    const fetchLinkedFiles = useCallback(async () => {
        if (!connectionId) return
        setIsLoading(true)
        try {
            const res = await fetch(`/api/connectors/google-drive/linked-files?connectionId=${connectionId}`)
            if (res.ok) {
                const data = await res.json()
                setLinkedFiles(data.files || [])
            }
        } catch (error) {
            console.error(error)
            addToast({ title: 'Error', message: 'Failed to fetch files', type: 'error' })
        } finally {
            setIsLoading(false)
        }
    }, [connectionId, addToast])

    useEffect(() => {
        fetchLinkedFiles()
    }, [fetchLinkedFiles])

    const handleImportSuccess = (files: any[]) => {
        if (onImport) onImport(files)
        fetchLinkedFiles() // Refresh list
        addToast({
            title: 'Access Granted',
            message: `Successfully granted access to ${files.length} file(s).`,
            type: 'success'
        })
    }

    const handleUnlink = async (id: string) => {
        setIsRevoking(id)
        try {
            const res = await fetch('/api/connectors/google-drive/linked-files', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, connectionId })
            })
            if (res.ok) {
                // Remove from list immediately
                setLinkedFiles(prev => prev.filter(f => f.id !== id))
                addToast({ title: 'Access Revoked', message: 'File access revoked successfully.', type: 'success' })
            } else {
                throw new Error('Failed to unlink')
            }
        } catch (error) {
            addToast({ title: 'Error', message: 'Failed to revoke access.', type: 'error' })
        } finally {
            setIsRevoking(null)
        }
    }

    return (
        <div className={cn("space-y-4", compact && "space-y-3")}>


            {/* Header / Toolbar */}
            <div className={cn(
                "bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden",
                compact && "border-gray-200/80 shadow-none"
            )}>
                <div className={cn(
                    "flex flex-col md:flex-row md:items-center justify-between gap-4 p-4",
                    compact && "p-3 gap-3"
                )}>
                    <div>
                        <h3 className={cn(
                            "font-semibold text-gray-900 flex items-center gap-2",
                            compact ? "text-sm" : "text-lg"
                        )}>
                            <ShieldCheck className={cn(compact ? "w-4 h-4" : "w-5 h-5", "text-gray-700")} />
                            {compact ? "Extra file access" : "Authorized Files"}
                        </h3>
                        <p className={cn("text-gray-500 mt-1", compact ? "text-xs" : "text-sm")}>
                            {compact
                                ? "Optional: grant access to specific files beyond your workspace folder."
                                : (
                                    <>
                                        <BrandName className="inline" style={{ color: 'inherit' }} /> can only access the files listed below.
                                    </>
                                  )}
                        </p>
                    </div>

                    <div className={cn("flex items-center gap-3", compact && "gap-2 flex-wrap")}>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsGuideOpen(!isGuideOpen)}
                            className={cn("h-9 gap-2", isGuideOpen ? "text-purple-700 bg-purple-50 hover:text-purple-800 hover:bg-purple-100" : "text-gray-500 hover:text-gray-900")}
                        >
                            <ShieldCheck className={cn("w-4 h-4", isGuideOpen ? "text-purple-600" : "text-gray-500")} />
                            <span className="hidden sm:inline">How to Grant Access</span>
                        </Button>

                        <div className="h-4 w-px bg-gray-200" />

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchLinkedFiles}
                            disabled={isLoading}
                            className="h-9 border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-300 bg-white"
                        >
                            <RefreshCw className={cn("w-3.5 h-3.5 sm:mr-2", isLoading && "animate-spin")} />
                            <span className="hidden sm:inline">Refresh</span>
                        </Button>

                        <Button
                            onClick={() => setIsGrantModalOpen(true)}
                            className={cn(
                                "h-9 transition-all active:scale-[0.98]",
                                compact
                                    ? "bg-gray-100 text-gray-900 hover:bg-gray-200 border border-gray-200"
                                    : "bg-gray-900 hover:bg-gray-800 text-white shadow-sm"
                            )}
                        >
                            <SquarePlus className="w-4 h-4 mr-2" />
                            Grant Access
                        </Button>
                    </div>
                </div>

                {/* Collapsible Guide Content inside Header Card */}
                <div className={cn(
                    "grid transition-all duration-300 ease-in-out",
                    isGuideOpen ? "grid-rows-[1fr] opacity-100 mb-4" : "grid-rows-[0fr] opacity-0"
                )}>
                    <div className="overflow-hidden px-4">
                        <div className="p-4 rounded-lg bg-purple-50/50 border border-purple-100 text-sm text-purple-900/80">
                            <div className="flex gap-3 mb-2">
                                <ShieldCheck className="w-5 h-5 text-purple-600 flex-shrink-0" />
                                <span className="font-semibold text-purple-900">Granting Access Guide</span>
                            </div>
                            <div className="space-y-2 pl-8">
                                <div className="flex gap-2">
                                    <span className="font-bold text-purple-600">1.</span>
                                    <span><span className="font-medium text-purple-900">Security:</span>{' '}
                                        <BrandName className="inline" style={{ color: 'inherit' }} /> only accesses what you select, not your entire Drive.</span>
                                </div>
                                <div className="flex gap-2">
                                    <span className="font-bold text-purple-600">2.</span>
                                    <span><span className="font-medium text-purple-900">Selection:</span> You can pick files or folders.</span>
                                </div>
                                <div className="flex gap-2">
                                    <span className="font-bold text-purple-600">3.</span>
                                    <span><span className="font-medium text-purple-900">Non-Recursive:</span> Selecting a folder does NOT include sub-folders automatically.</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className={cn(
                "bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm",
                compact ? "max-h-[min(280px,50vh)] shadow-none" : "min-h-[300px]"
            )}>
                {/* Search/Filter Bar (Visual only for now) */}
                <div className={cn(
                    "border-b border-gray-100 bg-gray-50/50 flex flex-col gap-4",
                    compact ? "px-3 py-2" : "px-6 py-4"
                )}>
                    <div className="flex items-center justify-between">
                        <div className={cn("flex items-center gap-2 text-gray-500", compact ? "text-xs" : "text-sm")}>
                            <span className="font-medium text-gray-900">{linkedFiles.length}</span> file(s) authorized
                        </div>
                    </div>
                </div>

                {isLoading && linkedFiles.length === 0 ? (
                    <div className={cn("space-y-4", compact ? "p-3" : "p-6")}>
                        {[1, 2, 3].map(i => <Skeleton key={i} className={cn("w-full rounded-xl", compact ? "h-12" : "h-16")} />)}
                    </div>
                ) : linkedFiles.length === 0 ? (
                    <div className={cn(
                        "flex flex-col items-center justify-center text-center",
                        compact ? "py-10 px-4" : "py-24"
                    )}>
                        <div className={cn(
                            "bg-gray-100 rounded-full flex items-center justify-center mb-3",
                            compact ? "w-10 h-10" : "w-16 h-16 mb-4"
                        )}>
                            <ShieldCheck className={cn(compact ? "w-5 h-5" : "w-8 h-8", "text-gray-300")} />
                        </div>
                        <h4 className={cn("text-gray-900 font-medium", compact ? "text-sm" : "text-lg")}>No extra files yet</h4>
                        <p className={cn("text-gray-500 mt-2 max-w-sm", compact ? "text-xs" : "text-sm")}>
                            {compact
                                ? "Use Grant access only if you need specific files outside the workspace folder."
                                : (
                                    <>
                                        Click &quot;Grant Access&quot; to select the Google Drive files you want{' '}
                                        <BrandName className="inline" style={{ color: 'inherit' }} /> to manage.
                                    </>
                                  )}
                        </p>
                        <div className={cn(compact ? "mt-4" : "mt-6")}>
                            <Button onClick={() => setIsGrantModalOpen(true)} variant="outline" size={compact ? "sm" : "default"} className="border-gray-200 text-gray-900 hover:bg-gray-50">
                                Browse Google Drive
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className={cn(
                        "divide-y divide-gray-100 overflow-y-auto custom-scrollbar",
                        compact ? "max-h-[200px]" : "max-h-[360px]"
                    )}>
                        {linkedFiles.map(file => (
                            <div key={file.id} className="group flex items-center justify-between p-4 hover:bg-gray-50/80 transition-colors">
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className="p-2.5 bg-gray-100 rounded-lg text-gray-500 group-hover:bg-white group-hover:shadow-sm transition-all border border-transparent group-hover:border-gray-200">
                                        <FileText className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="text-sm font-semibold text-gray-900 truncate max-w-[300px] md:max-w-[400px]">
                                            {file.name}
                                        </h4>
                                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                            <span className="font-mono bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
                                                {formatFileSize(parseInt(file.size))}
                                            </span>
                                            <span className="text-gray-300">•</span>
                                            <span>
                                                Granted {formatDistanceToNow(new Date(file.linkedAt), { addSuffix: true })}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleUnlink(file.id)}
                                        disabled={isRevoking === file.id}
                                        className="h-9 px-3 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                    >
                                        {isRevoking === file.id ? (
                                            <LoadingSpinner size="sm" />
                                        ) : (
                                            <>
                                                <Trash2 className="w-4 h-4 mr-2" />
                                                Revoke
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            {/* Grant Access Interstitial Modal */}
            <Dialog open={isGrantModalOpen} onOpenChange={setIsGrantModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Grant Access to Files</DialogTitle>
                        <DialogDescription>
                            Please acknowledge the following security measures before proceeding.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-3">
                        <div className="flex gap-3 p-3 bg-blue-50 text-blue-900 rounded-lg text-sm border border-blue-100">
                            <ShieldCheck className="w-5 h-5 flex-shrink-0 text-blue-600 mt-0.5" />
                            <div>
                                <span className="font-bold block text-blue-800 mb-1">Explicit Grant Required</span>
                                <span className="opacity-90">
                                    <BrandName className="inline" style={{ color: 'inherit' }} /> only accesses files you specifically select. Connecting your account does NOT grant full Drive access.
                                </span>
                            </div>
                        </div>
                        <div className="flex gap-3 p-3 bg-gray-50 text-gray-900 rounded-lg text-sm border border-gray-100">
                            <div className="font-bold text-gray-500 w-5 text-center mt-0.5">2</div>
                            <div>
                                <span className="font-bold block text-gray-800 mb-1">Folder Selection</span>
                                <span className="text-gray-600">Select specific folders or files using the Google Picker. You can multi-select items.</span>
                            </div>
                        </div>
                        <div className="flex gap-3 p-3 bg-amber-50 text-amber-900 rounded-lg text-sm border border-amber-100">
                            <div className="font-bold text-amber-600 w-5 text-center mt-0.5">3</div>
                            <div>
                                <span className="font-bold block text-amber-800 mb-1">Non-Recursive Limitation</span>
                                <span className="text-amber-800/90">Selecting a folder does <span className="font-bold underline decoration-amber-300">NOT</span> automatically include sub-folders. You must select sub-folders individually.</span>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="ghost" onClick={() => setIsGrantModalOpen(false)}>Cancel</Button>
                        <GooglePickerButton
                            connectionId={connectionId}
                            onImport={(files) => {
                                handleImportSuccess(files)
                                setIsGrantModalOpen(false)
                            }}
                            triggerLabel="I Understand, Proceed"
                            showSuccessToast={false}
                        >
                            <Button className="bg-gray-900 text-white hover:bg-gray-800 w-full sm:w-auto" onClick={() => setIsGrantModalOpen(false)}>
                                I Understand, Proceed
                            </Button>
                        </GooglePickerButton>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
