import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/modal'
import { FileText, Check } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { formatDistanceToNow } from 'date-fns'
import { DriveFile } from '@/lib/types'

interface DuplicateGroup {
    signature: string
    files: DriveFile[]
    count: number
    totalSize: number
    representativeFile?: DriveFile
}

interface DuplicateReviewModalProps {
    isOpen: boolean
    onClose: () => void
    groups: DuplicateGroup[]
    onTrash: (fileIds: string[]) => Promise<void>
    token?: string
}

export function DuplicateReviewModal({
    isOpen,
    onClose,
    groups,
    onTrash,
    token,
}: DuplicateReviewModalProps) {
    const [processingGroups, setProcessingGroups] = useState<Set<string>>(new Set())
    const [localGroups, setLocalGroups] = useState<DuplicateGroup[]>([])
    const [folderNames, setFolderNames] = useState<Record<string, string>>({})

    useEffect(() => {
        if (isOpen) {
            setLocalGroups(groups)
        }
    }, [isOpen, groups])

    useEffect(() => {
        if (!isOpen || localGroups.length === 0 || !token) return
        const uniqueIds = Array.from(new Set(
            localGroups.flatMap(g => g.files.flatMap(f => f.parents?.[0] ? [f.parents[0]] : []))
        ))
        if (uniqueIds.length === 0) return
        fetch('/api/drive-action', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'folder_names', folderIds: uniqueIds })
        }).then(r => r.json()).then(d => { if (d.names) setFolderNames(d.names) }).catch(() => {})
    }, [isOpen, localGroups, token])

    const handleSmartMerge = async (groupIndex: number, keep: 'oldest' | 'newest') => {
        const group = localGroups[groupIndex]
        if (!group) return

        const signature = group.signature
        setProcessingGroups(prev => new Set(prev).add(signature))

        try {
            // Sort files by modifiedTime
            const sorted = [...group.files].sort((a, b) => {
                const t1 = new Date(a.modifiedTime || 0).getTime()
                const t2 = new Date(b.modifiedTime || 0).getTime()
                return t1 - t2
            })

            // Determine which to keep
            const toKeep = keep === 'oldest' ? sorted[0] : sorted[sorted.length - 1]
            const toTrash = sorted.filter(f => f.id !== toKeep.id)

            if (toTrash.length > 0) {
                await onTrash(toTrash.map(f => f.id))
                // Remove group from local list
                setLocalGroups(prev => prev.filter(g => g.signature !== signature))
            }
        } catch (error) {
            console.error(error)
        } finally {
            setProcessingGroups(prev => {
                const newSet = new Set(prev)
                newSet.delete(signature)
                return newSet
            })
        }
    }

    const formatSize = (bytes?: number) => {
        if (!bytes) return '-'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Duplicate File Review">
            <div className="flex flex-col gap-4">
                <p className="text-gray-600">
                    We found <strong>{localGroups.length}</strong> groups of potential duplicates.
                    Review and choose which version to keep.
                </p>

                <div className="max-h-[60vh] overflow-y-auto space-y-4 pr-2">
                    {localGroups.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-8 text-gray-500 bg-gray-50 rounded-lg">
                            <Check className="h-10 w-10 text-green-500 mb-2" />
                            <span className="text-sm font-medium">All duplicates resolved!</span>
                        </div>
                    ) : (
                        localGroups.map((group, idx) => (
                            <div key={`${group.signature}-${idx}`} className="border border-gray-200 rounded-lg overflow-hidden bg-white hover:border-blue-200 transition-colors">
                                <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 bg-white rounded border border-gray-200 shadow-sm">
                                            {group.representativeFile?.iconLink ? (
                                                <img src={group.representativeFile.iconLink} alt="" className="w-4 h-4" />
                                            ) : (
                                                <FileText className="w-4 h-4 text-gray-400" />
                                            )}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-semibold text-gray-900 truncate max-w-[200px] sm:max-w-xs" title={group.representativeFile?.name}>
                                                {group.representativeFile?.name || 'Unknown File'}
                                            </span>
                                            <span className="text-xs text-gray-500">
                                                {group.count} copies • Total {formatSize(group.totalSize)}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {processingGroups.has(group.signature) ? (
                                            <div className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded text-xs font-medium flex items-center gap-1.5">
                                                <LoadingSpinner size="sm" />
                                                Processing...
                                            </div>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => handleSmartMerge(idx, 'oldest')}
                                                    className="px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded text-xs font-medium transition-colors shadow-sm"
                                                >
                                                    Keep Oldest
                                                </button>
                                                <button
                                                    onClick={() => handleSmartMerge(idx, 'newest')}
                                                    className="px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded text-xs font-medium transition-colors shadow-sm"
                                                >
                                                    Keep Newest
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="divide-y divide-gray-100">
                                    {group.files.map((file) => (
                                        <div key={file.id} className="px-4 py-2 flex items-center justify-between text-xs hover:bg-gray-50">
                                            <div className="flex flex-col gap-0.5 text-gray-600">
                                                <div className="flex items-center gap-2">
                                                    <span>{formatSize(typeof file.size === 'number' ? file.size : parseInt(file.size || '0'))}</span>
                                                    <span className="text-gray-300">|</span>
                                                    <span>Modified {file.modifiedTime && formatDistanceToNow(new Date(file.modifiedTime), { addSuffix: true })}</span>
                                                </div>
                                                {file.parents?.[0] && (
                                                    <a
                                                        href={file.webViewLink}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-gray-400 hover:text-gray-700 flex items-center gap-1"
                                                    >
                                                        <span>{folderNames[file.parents[0]] ?? '…'}</span>
                                                        <span className="text-gray-300">/</span>
                                                        <span>{file.name}</span>
                                                    </a>
                                                )}
                                            </div>
                                            <a
                                                href={file.webViewLink}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:underline shrink-0"
                                            >
                                                View
                                            </a>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="flex justify-end border-t border-gray-100 pt-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        Success
                    </button>
                </div>
            </div>
        </Modal>
    )
}
