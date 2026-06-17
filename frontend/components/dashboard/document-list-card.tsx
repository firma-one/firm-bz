"use client"

import { useState } from "react"
import { ExternalLink, HardDrive, Filter, ChevronDown, Check, X, Zap } from "lucide-react"
import { DocumentIcon } from "@/components/ui/document-icon"
import { DocumentActionMenu } from "@/components/ui/document-action-menu"
import { FilePreviewSheet } from "@/components/files/file-preview-sheet"
import { SecureAccessModal } from "@/components/projects/shares/secure-access-modal"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn, formatRelativeTime, getFileTypeLabel, formatFileSize } from "@/lib/utils"
import { DriveFile } from "@/lib/types"
import { useSecureOpenDocument } from "@/lib/use-secure-open-document"

interface DocumentListCardProps {
    title: string
    icon: React.ReactNode
    files: DriveFile[]
    limit?: number
    onLimitChange?: (limit: number) => void
    headerContent?: React.ReactNode
    className?: string
    enableFilter?: boolean
    showRank?: boolean
    primaryDate?: 'modified' | 'viewed'
    variant?: 'default' | 'flat'
    hideTitle?: boolean
    showActions?: boolean
    isLoading?: boolean
}

export function DocumentListCard({
    title,
    icon,
    files,
    limit,
    onLimitChange,
    headerContent,
    className,
    enableFilter = true,
    showRank = false,
    primaryDate = 'modified',
    variant = 'default',
    hideTitle = false,
    showActions = true,
    isLoading = false
}: DocumentListCardProps) {
    // Get unique types from current files (Derived first for state init)
    const availableTypes = Array.from(new Set(files.map(f => getFileTypeLabel(f.mimeType)))).sort()

    const [filterTypes, setFilterTypes] = useState<string[]>([])
    const [isFilterOpen, setIsFilterOpen] = useState(false)
    const [hasInitialized, setHasInitialized] = useState(false)
    const [previewDoc, setPreviewDoc] = useState<DriveFile | null>(null)

    const {
        handleSecureOpen,
        secureModalOpen,
        secureModalData,
        setSecureModalOpen,
        isRegrantLoading,
        regrantError,
    } = useSecureOpenDocument({ logContext: 'DocumentListCard' })

    // Initialize with All Selected once availableTypes are ready
    if (!hasInitialized && availableTypes.length > 0) {
        setFilterTypes(availableTypes)
        setHasInitialized(true)
    }

    // Filter logic
    const filteredFiles = filterTypes.length > 0
        ? files.filter(f => filterTypes.includes(getFileTypeLabel(f.mimeType)))
        : [] // Empty filter = Show None

    // Toggle logic
    const toggleFilter = (type: string) => {
        setFilterTypes(prev =>
            prev.includes(type)
                ? prev.filter(t => t !== type)
                : [...prev, type]
        )
    }

    const isAllSelected = availableTypes.length > 0 && filterTypes.length === availableTypes.length
    const isNoneSelected = filterTypes.length === 0
    const isIndeterminate = !isAllSelected && !isNoneSelected

    return (
        <div className={cn(
            "bg-white border border-[#e5e7eb] rounded shadow-sm relative",
            variant === 'flat' && "border-none shadow-none bg-transparent rounded-none",
            className
        )}>
            {/* Backdrop for simple dropdown closing */}
            {isFilterOpen && (
                <div className="fixed inset-0 z-10" onClick={() => setIsFilterOpen(false)}></div>
            )}

            {/* Card Header */}
            <div className={cn(
                "px-6 py-4 border-b border-gray-100 bg-[#f3f4f6] rounded-t relative z-20",
                variant === 'flat' && "bg-transparent border-none px-0 py-0 mb-0",
                // If hiding title, we create a 'toolbar' feel
                hideTitle && "flex justify-end pt-0 pb-0 border-b-0"
            )}>
                <div className={cn(
                    "flex items-center justify-between mb-3 w-full",
                    hideTitle && "mb-0 justify-end"
                )}>
                    {!hideTitle ? (
                        <>
                            {variant !== 'flat' ? (
                                <div className="flex items-center gap-2">
                                    {icon}
                                    <h3 className="text-base font-bold text-gray-900 whitespace-nowrap">{title}</h3>
                                </div>
                            ) : (
                                <div>{/* Spacer for flat mode if needed */}</div>
                            )}
                        </>
                    ) : null}

                    <div className="flex items-center gap-2">
                        {/* Dynamic Filter Dropdown */}
                        {enableFilter && (
                            <div className="relative">
                                <button
                                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 border text-xs font-medium rounded-lg transition-colors shadow-sm bg-white border-gray-200 hover:bg-gray-50 text-gray-600"
                                >
                                    <Filter className="h-3 w-3 flex-shrink-0" />
                                    <span>Filter</span>
                                    {!isAllSelected && !isNoneSelected && (
                                        <span className="flex items-center justify-center bg-gray-900 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1">
                                            {filterTypes.length}
                                        </span>
                                    )}
                                    <ChevronDown className={`h-3 w-3 flex-shrink-0 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {/* Dropdown Menu */}
                                {isFilterOpen && (
                                    <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-[#e5e7eb] rounded shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                                        <div className="px-3 py-2 border-b border-gray-100 mb-1 flex items-center justify-between bg-[#f3f4f6]/50 rounded-t">
                                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">File Type</span>
                                            <button
                                                onClick={() => setIsFilterOpen(false)}
                                                className="text-[10px] font-semibold text-white bg-gray-900 hover:bg-gray-800 px-2 py-0.5 rounded transition-colors"
                                            >
                                                Done
                                            </button>
                                        </div>
                                        <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                            <button
                                                onClick={() => {
                                                    if (isAllSelected) {
                                                        setFilterTypes([]) // Unselect All
                                                    } else {
                                                        setFilterTypes(availableTypes) // Select All
                                                    }
                                                }}
                                                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 group"
                                            >
                                                <div className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${isAllSelected || isIndeterminate
                                                    ? 'bg-blue-600 border-blue-600'
                                                    : 'bg-white border-gray-300'
                                                    }`}>
                                                    {isAllSelected && <Check className="h-3 w-3 text-white" />}
                                                    {isIndeterminate && <div className="h-0.5 w-2 bg-white rounded-full" />}
                                                </div>
                                                <span className="font-medium text-gray-900">All Files</span>
                                            </button>
                                            {availableTypes.map(type => {
                                                const isSelected = filterTypes.includes(type)
                                                return (
                                                    <button
                                                        key={type}
                                                        onClick={(e) => {
                                                            e.stopPropagation(); // Prevent closing
                                                            toggleFilter(type);
                                                        }}
                                                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 group transition-colors"
                                                    >
                                                        {/* Checkbox Representation */}
                                                        <div className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected
                                                            ? 'bg-blue-600 border-blue-600'
                                                            : 'bg-white border-gray-300 group-hover:border-blue-400'
                                                            }`}>
                                                            {isSelected && (
                                                                <>
                                                                    <Check className="h-3 w-3 text-white group-hover:hidden" />
                                                                    <X className="h-3 w-3 text-white hidden group-hover:block" />
                                                                </>
                                                            )}
                                                        </div>

                                                        <span className={isSelected ? "font-medium text-gray-900" : ""}>{type}</span>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {onLimitChange && limit && (
                            <div className="relative inline-block">
                                <select
                                    value={limit}
                                    onChange={(e) => onLimitChange(Number(e.target.value))}
                                    className="appearance-none pl-2 pr-7 py-1.5 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-xs font-medium rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-100 transition-all shadow-sm"
                                >
                                    <option value={5}>Show 5</option>
                                    <option value={10}>Show 10</option>
                                    <option value={20}>Show 20</option>
                                    <option value={50}>Show 50</option>
                                </select>
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                                    <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Additional Header Content (e.g. Insights) */}
                {headerContent}
            </div>

            {/* List */}
            <div className={cn(
                "divide-y divide-gray-100 overflow-y-auto custom-scrollbar relative z-0",
                "max-h-[350px]"
            )}>
                {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="px-6 py-3.5 flex items-center gap-4 animate-pulse border-b border-gray-50 last:border-0">
                            <div className="h-10 w-10 bg-gray-100 rounded flex-shrink-0"></div>
                            <div className="flex-1 space-y-2">
                                <div className="h-4 bg-gray-100 rounded w-3/4"></div>
                                <div className="h-3 bg-gray-50 rounded w-1/2"></div>
                            </div>
                            <div className="hidden sm:block h-8 w-16 bg-gray-50 rounded-lg"></div>
                        </div>
                    ))
                ) : (enableFilter && filteredFiles.length === 0) || (!enableFilter && files.length === 0) ? (
                    <div className="px-6 py-12 text-center text-gray-500 text-sm">
                        {files.length === 0 ? 'No documents found.' : `No matching files found.`}
                    </div>
                ) : (
                    (enableFilter ? filteredFiles : files).map((file, index) => (
                        <div
                            key={`${file.id}-${file.lastAction || index}`}
                            onClick={() => setPreviewDoc(file)}
                            className="group relative flex items-center gap-4 px-6 py-3.5 hover:bg-[#f3f4f6]/80 transition-all cursor-pointer"
                        >

                            {/* Rank Badge */}
                            {showRank && (
                                <div className="flex-shrink-0 w-6 text-center">
                                    <span className={cn(
                                        "text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full",
                                        index < 3 ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-500"
                                    )}>
                                        {index + 1}
                                    </span>
                                </div>
                            )}

                            {/* Icon */}
                            <div className="flex-shrink-0">
                                <div className="p-2.5 bg-white border border-gray-100 rounded shadow-sm group-hover:border-gray-200 transition-colors">
                                    <DocumentIcon mimeType={file.mimeType} className="h-6 w-6" />
                                </div>
                            </div>

                            {/* Main Content */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between">
                                    <h4 className="text-sm font-semibold text-gray-900 truncate pr-8 flex items-center gap-2" title={file.name}>
                                        <span className="truncate">{file.name}</span>
                                        {/* Security Badges */}
                                        {file.badges && file.badges.length > 0 && (
                                            <TooltipProvider delayDuration={200}>
                                                {file.badges.map((badge, i) => (
                                                    <Tooltip key={i}>
                                                        <TooltipTrigger asChild>
                                                            <span className={cn(
                                                                "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap cursor-help",
                                                                badge.type === 'risk' ? "bg-rose-50 text-rose-700 border-rose-100" :
                                                                    badge.type === 'stale' ? "bg-orange-50 text-orange-700 border-orange-100" :
                                                                        badge.type === 'sensitive' ? "bg-purple-50 text-purple-700 border-purple-100" :
                                                                            "bg-amber-100 text-amber-800 border-amber-200"
                                                            )}>
                                                                {badge.type === 'risk' ? 'RISK' : badge.type === 'stale' ? 'STALE' : badge.type === 'sensitive' ? 'SENSITIVE' : 'ATTENTION'}
                                                            </span>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>{badge.text}</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                ))}
                                            </TooltipProvider>
                                        )}
                                        {/* Activity Count in Trending */}
                                        {primaryDate === 'viewed' && (file.activityCount || 0) > 0 && (
                                            <>
                                                <span className="text-gray-300 mx-1">•</span>
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap bg-indigo-50 text-indigo-700 border-indigo-100">
                                                    <Zap className="h-2.5 w-2.5" />
                                                    {file.activityCount} {file.activityCount === 1 ? 'action' : 'actions'}
                                                </span>
                                            </>
                                        )}
                                    </h4>

                                    {/* Action Menu */}
                                    {showActions && (
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute right-4 top-1/2 -translate-y-1/2 z-10">
                                            <DocumentActionMenu
                                                document={file}
                                                onOpenDocument={(doc) => {
                                                    const ext = (doc as any).externalId
                                                    const projectId = (doc as any).projectId
                                                    if (projectId && ext) {
                                                        handleSecureOpen({
                                                            documentId: ext,
                                                            fileName: (doc as any).name ?? '',
                                                            mimeType: (doc as any).mimeType,
                                                            externalId: ext,
                                                            firmId: (doc as any).firmId,
                                                            projectId,
                                                        }, (doc as any).id)
                                                    } else {
                                                        const link = (doc as any).webViewLink || `https://drive.google.com/file/d/${ext}/view`
                                                        if (typeof window !== 'undefined') window.open(link, '_blank')
                                                    }
                                                }}
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col gap-0.5 mt-0.5">
                                    {/* Row 1: Subtext (Account Email • Location) */}
                                    <div className="flex items-center text-[11px] text-gray-500 gap-1.5 truncate">
                                        {/* Email or Source */}
                                        <span className="truncate max-w-[150px]" title={file.actorEmail || file.source}>
                                            {file.actorEmail || file.source || 'Unknown User'}
                                        </span>

                                        {/* Separator */}
                                        <span className="text-gray-300">•</span>

                                        {/* Location */}
                                        <span className="flex items-center gap-1 truncate text-gray-400" title={file.parentName || 'My Drive'}>
                                            <HardDrive className="h-3 w-3 flex-shrink-0" />
                                            <span className="truncate">{file.parentName || 'My Drive'}</span>
                                        </span>
                                    </div>

                                    {/* Row 2: Action • Time • Size */}
                                    <div className="flex items-center text-xs text-indigo-600 font-medium gap-1.5 mt-1">
                                        {/* Action Badge */}
                                        <span className={cn(
                                            "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide",
                                            file.lastAction === 'Deleted' ? "bg-red-50 text-red-700" :
                                                file.lastAction === 'Renamed' ? "bg-amber-50 text-amber-700" :
                                                    file.lastAction === 'Edited' ? "bg-blue-50 text-blue-700" :
                                                        file.lastAction === 'Shared' ? "bg-purple-50 text-purple-700" :
                                                            file.lastAction === 'Unshared' ? "bg-gray-100 text-gray-700 border-gray-200" :
                                                                file.lastAction === 'Shared With You' ? "bg-green-50 text-green-700" :
                                                                    file.lastAction === 'Shared By You' ? "bg-indigo-50 text-indigo-700" :
                                                                        "bg-gray-100 text-gray-600"
                                        )}>
                                            {file.lastAction || (primaryDate === 'viewed' ? 'Viewed' : 'Modified')}
                                        </span>

                                        <span className="text-gray-300 mx-1">•</span>

                                        <span className="text-gray-400 font-normal">
                                            {formatRelativeTime(file.activityTimestamp || file.modifiedTime)}
                                        </span>

                                        {/* Size (Hidden for folders/shortcuts or unknown) */}
                                        {file.mimeType !== 'application/vnd.google-apps.folder' &&
                                            file.mimeType !== 'application/vnd.google-apps.shortcut' &&
                                            file.size && (
                                                <>
                                                    <span className="text-gray-300 mx-1">|</span>
                                                    <span className="text-[11px] font-mono font-medium text-gray-600 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-300">
                                                        {Number(file.size) < 1024 ? '0 KB' : formatFileSize(Number(file.size))}
                                                    </span>
                                                </>
                                            )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Footer */}
            <div className="mt-auto px-6 py-3 bg-[#f3f4f6] border-t border-gray-100 flex items-center justify-between rounded-b">
                <div className="text-xs text-gray-400 font-medium">
                    {isLoading ? (
                        <div className="h-3 w-24 bg-gray-200 rounded animate-pulse"></div>
                    ) : (
                        `Showing ${(enableFilter ? filteredFiles : files).length} document(s)`
                    )}
                </div>
                <button className="text-xs font-semibold text-gray-600 hover:text-gray-900 flex items-center gap-1 transition-colors px-2 py-1 rounded hover:bg-gray-100">
                    View All <ExternalLink className="h-3 w-3" />
                </button>
            </div>
            {previewDoc && (
                <FilePreviewSheet
                    isOpen={!!previewDoc}
                    onClose={() => setPreviewDoc(null)}
                    document={previewDoc}
                />
            )}
            <SecureAccessModal
                isOpen={secureModalOpen}
                onClose={() => setSecureModalOpen(false)}
                email={secureModalData.email}
                fileName={secureModalData.fileName}
                mimeType={secureModalData.mimeType}
                externalId={secureModalData.externalId}
                firmId={secureModalData.firmId}
                isLoading={isRegrantLoading}
                error={regrantError}
            />
        </div>
    )
}
