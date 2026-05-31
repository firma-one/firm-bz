import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Trash2, Check, AlertTriangle, Filter, X, SquareX, ChevronDown, HardDrive, Archive, Folder, ChevronRight, Minus } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { formatDistanceToNow } from 'date-fns'
import { DocumentIcon } from '@/components/ui/document-icon'
import { cn, formatFileSize, getFileTypeLabel } from '@/lib/utils'
import { DocumentActionMenu } from '@/components/ui/document-action-menu'
import { SecureAccessModal } from '@/components/projects/shares/secure-access-modal'
import { useSecureOpenDocument } from '@/lib/use-secure-open-document'
import { DeleteConfirmationDialog } from './delete-confirmation-dialog'

interface ReviewFile {
    id: string
    name: string
    size?: number
    modifiedTime?: string
    iconLink?: string
    mimeType?: string
    reason?: string
    owner?: string
    location?: string
    parentName?: string
    badges?: Array<{ type: 'risk' | 'attention' | 'stale' | 'sensitive', text: string }>
    activityTimestamp?: string
    actorEmail?: string
    source?: string
}

interface FileReviewModalProps {
    isOpen: boolean
    onClose: () => void
    title: string
    description: string
    files: ReviewFile[]
    onConfirm: (selectedIds: string[]) => Promise<void>
    confirmLabel?: string
    isLoading?: boolean
}

function MultiSelectFilter({
    label,
    options,
    selected,
    onChange
}: {
    label: string,
    options: string[],
    selected: Set<string>,
    onChange: (value: Set<string>) => void
}) {
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const toggleOption = (option: string) => {
        const newSelected = new Set(selected)
        if (newSelected.has(option)) {
            newSelected.delete(option)
        } else {
            newSelected.add(option)
        }
        onChange(newSelected)
    }

    return (
        <div className="relative" ref={containerRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors",
                    selected.size > 0
                        ? "bg-gray-900 text-white border-gray-900 hover:bg-gray-800"
                        : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-gray-300"
                )}
            >
                {label}
                {selected.size > 0 && (
                    <span className="flex items-center justify-center bg-white text-gray-900 text-[10px] rounded-full min-w-[16px] h-4 px-1 ml-1 font-bold">
                        {selected.size}
                    </span>
                )}
                <ChevronDown className={cn("w-3 h-3", selected.size > 0 ? "text-gray-400" : "text-gray-400")} />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-[100]">
                    <div className="max-h-60 overflow-y-auto custom-scrollbar">
                        {options.map(option => {
                            const isSelected = selected.has(option)
                            return (
                                <button
                                    key={option}
                                    onClick={() => toggleOption(option)}
                                    className="flex items-center w-full px-3 py-2 text-xs text-left hover:bg-gray-50 transition-colors"
                                >
                                    <div className={cn(
                                        "w-4 h-4 rounded border mr-2 flex items-center justify-center transition-colors flex-shrink-0",
                                        isSelected ? "bg-gray-900 border-gray-900" : "border-gray-300 bg-white"
                                    )}>
                                        {isSelected && <Check className="w-3 h-3 text-white" />}
                                    </div>
                                    <span className={cn("truncate", isSelected ? "text-gray-900 font-medium" : "text-gray-600")}>
                                        {option}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}



export function FileReviewModal({
    isOpen,
    onClose,
    title,
    description,
    files,
    onConfirm,
    confirmLabel = 'Delete Selected',
    isLoading = false
}: FileReviewModalProps) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

    const {
        handleSecureOpen,
        secureModalOpen,
        secureModalData,
        setSecureModalOpen,
    } = useSecureOpenDocument({ logContext: 'FileReviewModal' })

    // Filters
    const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set())
    const [selectedSizes, setSelectedSizes] = useState<Set<string>>(new Set())

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setSelectedIds(new Set())
            setShowDeleteConfirm(false)

            // Pre-select all filters by default
            const types = new Set(files.map(f => getFileTypeLabel(f.mimeType || 'unknown')))
            setSelectedTypes(types)

            setSelectedSizes(new Set(['Small (<1MB)', 'Medium (1-10MB)', 'Large (10MB-1GB)', 'X-Large (>1GB)']))
        }
    }, [isOpen, files])

    // Filter Logic
    const availableTypes = useMemo(() => {
        const types = new Set(files.map(f => getFileTypeLabel(f.mimeType || 'unknown')))
        return Array.from(types).sort()
    }, [files])

    // Update selected types when files change if filtering logic implies consistency
    useEffect(() => {
        if (files.length > 0 && selectedTypes.size === 0) {
            const types = new Set(files.map(f => getFileTypeLabel(f.mimeType || 'unknown')))
            setSelectedTypes(types)
        }
    }, [files])

    const sizeOptions = ['Small (<1MB)', 'Medium (1-10MB)', 'Large (10MB-1GB)', 'X-Large (>1GB)']

    const filteredFiles = useMemo(() => {
        const result = files.filter(f => {
            // Type Filter
            if (selectedTypes.size > 0 && !selectedTypes.has(getFileTypeLabel(f.mimeType || 'unknown'))) {
                return false
            }
            // Size Filter
            if (selectedSizes.size > 0) {
                const size = f.size || 0
                const MB = 1024 * 1024
                const GB = 1024 * MB

                const matchesSize = Array.from(selectedSizes).some(selectedSize => {
                    if (selectedSize === 'Small (<1MB)') return size < 1 * MB
                    if (selectedSize === 'Medium (1-10MB)') return size >= 1 * MB && size < 10 * MB
                    if (selectedSize === 'Large (10MB-1GB)') return size >= 10 * MB && size < 1 * GB
                    if (selectedSize === 'X-Large (>1GB)') return size >= 1 * GB
                    return false
                })

                if (!matchesSize) return false
            }

            return true
        })
        return result
    }, [files, selectedTypes, selectedSizes])

    // Selection Logic
    const toggleSelectAll = () => {
        if (selectedIds.size === filteredFiles.length && filteredFiles.length > 0) {
            setSelectedIds(new Set())
        } else {
            setSelectedIds(new Set(filteredFiles.map(f => f.id)))
        }
    }

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds)
        if (newSet.has(id)) {
            newSet.delete(id)
        } else {
            newSet.add(id)
        }
        setSelectedIds(newSet)
    }

    // Action Logic
    const handleActionClick = () => {
        if (selectedIds.size === 0) return
        setShowDeleteConfirm(true)
    }

    const handleConfirmDelete = async () => {
        setShowDeleteConfirm(false)
        setIsSubmitting(true)
        try {
            await onConfirm(Array.from(selectedIds))
            onClose()
        } catch (error) {
            console.error(error)
        } finally {
            setIsSubmitting(false)
        }
    }

    const totalSelectedSize = useMemo(() => {
        return files.filter(f => selectedIds.has(f.id)).reduce((acc, f) => acc + (f.size || 0), 0)
    }, [files, selectedIds])

    // Calculate total potential savings (sum of all displayed files)
    const totalPotentialSavings = useMemo(() => {
        return files.reduce((acc, f) => acc + (f.size || 0), 0)
    }, [files])

    const filteredFilesCount = filteredFiles.length

    // Grouping Logic by Age
    const groupedFiles = useMemo(() => {
        const groups: Record<string, ReviewFile[]> = {
            '5+ Years': [],
            '2 - 5 Years': [],
            '1 - 2 Years': [],
            '6 Months - 1 Year': []
        }

        filteredFiles.forEach(file => {
            const dateStr = file.activityTimestamp || file.modifiedTime
            if (!dateStr) return

            const date = new Date(dateStr)
            const now = new Date()
            const timeDiff = now.getTime() - date.getTime()
            const dayDiff = timeDiff / (1000 * 3600 * 24)

            if (dayDiff >= 1825) {
                groups['5+ Years'].push(file)
            } else if (dayDiff >= 730) {
                groups['2 - 5 Years'].push(file)
            } else if (dayDiff >= 365) {
                groups['1 - 2 Years'].push(file)
            } else if (dayDiff >= 180) {
                groups['6 Months - 1 Year'].push(file)
            }
        })

        // Filter out empty groups
        return Object.entries(groups).filter(([_, files]) => files.length > 0)
    }, [filteredFiles])

    // State for expanded groups (default all open)
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

    useEffect(() => {
        if (groupedFiles.length > 0) {
            const initial: Record<string, boolean> = {}
            groupedFiles.forEach(([title]) => {
                initial[title] = true // Default open
            })
            setExpandedGroups(initial)
        }
    }, [groupedFiles.length])

    const toggleGroup = (title: string) => {
        setExpandedGroups(prev => ({
            ...prev,
            [title]: !prev[title]
        }))
    }

    // Toggle all files in a specific group
    const toggleGroupSelection = (groupFiles: ReviewFile[]) => {
        const groupIds = groupFiles.map(f => f.id)
        const allSelected = groupIds.every(id => selectedIds.has(id))

        const newSet = new Set(selectedIds)
        if (allSelected) {
            // Deselect all
            groupIds.forEach(id => newSet.delete(id))
        } else {
            // Select all
            groupIds.forEach(id => newSet.add(id))
        }
        setSelectedIds(newSet)
    }

    // Collapsible Header Component with Selection
    const GroupHeader = ({ title, count, size, isExpanded, onToggle, groupFiles }: { title: string, count: number, size: number, isExpanded: boolean, onToggle: () => void, groupFiles: ReviewFile[] }) => {
        const groupIds = groupFiles.map(f => f.id)
        const allSelected = groupIds.every(id => selectedIds.has(id))
        const someSelected = !allSelected && groupIds.some(id => selectedIds.has(id))

        return (
            <div className="flex items-center w-full px-1 py-3 hover:bg-gray-50 rounded-lg group transition-colors select-none">
                {/* Group Checkbox */}
                <div onClick={(e) => e.stopPropagation()} className="pl-1 pr-3 flex items-center">
                    <div
                        onClick={() => toggleGroupSelection(groupFiles)}
                        className={cn(
                            "w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer",
                            allSelected
                                ? "bg-gray-900 border-gray-900"
                                : someSelected
                                    ? "bg-gray-900 border-gray-900"
                                    : "border-gray-300 hover:border-gray-500 bg-white"
                        )}
                    >
                        {allSelected && <Check className="w-3 h-3 text-white" />}
                        {someSelected && <Minus className="w-3 h-3 text-white" />}
                    </div>
                </div>

                <div
                    onClick={onToggle}
                    className="flex-1 flex items-center cursor-pointer"
                >
                    <div className={`p-1 rounded-md mr-3 transition-colors ${isExpanded ? 'bg-gray-100 text-gray-700' : 'text-gray-400 group-hover:text-gray-600'}`}>
                        <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                            {title}
                            <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                {count} items
                            </span>
                        </h3>
                    </div>
                    <div className="text-xs font-medium text-gray-500">
                        {formatFileSize(size)}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <SheetContent side="right" className="!w-[95vw] !max-w-[95vw] p-0 border-l border-gray-200 shadow-2xl flex flex-col h-full bg-slate-50 [&>button]:hidden">
                <SheetTitle className="sr-only">{title}</SheetTitle>

                {/* 1. HERO HEADER */}
                <div className="relative flex-shrink-0 bg-gradient-to-b from-orange-50/80 to-white pt-8 pb-6 px-8 border-b border-gray-100/50 z-20">
                    <button
                        onClick={onClose}
                        className="absolute top-6 right-6 p-2 rounded-full text-gray-400 hover:text-gray-900 hover:bg-gray-100/50 transition-colors"
                    >
                        <SquareX className="h-5 w-5" />
                    </button>

                    <div className="space-y-4">
                        <div>
                            <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/60 border border-orange-100 text-[11px] font-semibold text-orange-700 uppercase tracking-wide shadow-sm backdrop-blur-sm mb-3">
                                <Archive className="w-3 h-3" />
                                {title}
                            </span>

                            {/* Hero Metric */}
                            <div className="flex items-baseline gap-1">
                                <h2 className="text-4xl font-bold text-gray-900 tracking-tight">
                                    {formatFileSize(totalPotentialSavings).split(' ')[0]}
                                </h2>
                                <span className="text-xl font-medium text-gray-500">
                                    {formatFileSize(totalPotentialSavings).split(' ')[1]} Reclaimable
                                </span>
                            </div>
                            <p className="text-sm text-gray-500 mt-1 max-w-[90%] leading-relaxed">
                                {description}
                            </p>
                        </div>

                        {/* Visual Distribution Bar (Mockup for now, could be real data later) */}
                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden flex">
                            <div className="h-full bg-orange-400 w-[60%]" />
                            <div className="h-full bg-orange-300 w-[25%]" />
                            <div className="h-full bg-orange-200 w-[15%]" />
                        </div>

                        {/* Summary Stats */}
                        <div className="flex items-center gap-6 text-xs font-medium text-gray-500">
                            <span className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                                {filteredFiles.length} files found
                            </span>
                            <span className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                                {groupedFiles.length} time periods
                            </span>
                        </div>
                    </div>
                </div>

                {/* 2. MAIN CONTENT AREA */}
                <div className="flex flex-col flex-1 overflow-hidden relative">

                    {/* Sticky Filter Bar */}
                    <div className="px-8 py-4 bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-10 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <MultiSelectFilter
                                label="File Type"
                                options={availableTypes}
                                selected={selectedTypes}
                                onChange={setSelectedTypes}
                            />
                            <MultiSelectFilter
                                label="Size"
                                options={sizeOptions}
                                selected={selectedSizes}
                                onChange={setSelectedSizes}
                            />
                            {(selectedTypes.size > 0 || selectedSizes.size > 0) && (
                                <button
                                    onClick={() => { setSelectedTypes(new Set()); setSelectedSizes(new Set()); }}
                                    className="ml-2 text-xs text-gray-400 hover:text-gray-900 transition-colors flex items-center gap-1"
                                >
                                    <X className="w-3 h-3" />
                                    Reset
                                </button>
                            )}
                        </div>

                        {/* Select All Toggle */}
                        <label className="flex items-center gap-2 cursor-pointer group select-none">
                            <span className="text-xs font-medium text-gray-500 group-hover:text-gray-900 transition-colors">Select All</span>
                            <div
                                className={cn(
                                    "w-5 h-5 rounded-md border flex items-center justify-center transition-all",
                                    filteredFiles.length > 0 && selectedIds.size === filteredFiles.length
                                        ? "bg-gray-900 border-gray-900"
                                        : "border-gray-300 bg-white group-hover:border-gray-400"
                                )}
                            >
                                {filteredFiles.length > 0 && selectedIds.size === filteredFiles.length && <Check className="w-3.5 h-3.5 text-white" />}
                            </div>
                            <input
                                type="checkbox"
                                className="hidden"
                                checked={filteredFiles.length > 0 && selectedIds.size === filteredFiles.length}
                                onChange={toggleSelectAll}
                                disabled={isLoading || isSubmitting || filteredFiles.length === 0}
                            />
                        </label>
                    </div>

                    {/* Scrollable File List */}
                    <div className="flex-1 overflow-y-auto px-8 pb-32 pt-6 custom-scrollbar space-y-8">
                        {isLoading ? (
                            <div className="flex flex-col gap-4">
                                {[1, 2, 3, 4, 5].map((i) => (
                                    <div key={i} className="h-20 bg-white rounded-xl border border-gray-100 animate-pulse" />
                                ))}
                            </div>
                        ) : filteredFiles.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-center">
                                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                                    <Filter className="w-6 h-6 text-gray-300" />
                                </div>
                                <h3 className="text-gray-900 font-medium">No files match your filters</h3>
                                <p className="text-gray-500 text-sm mt-1">Try resetting the filters to see more results.</p>
                            </div>
                        ) : (
                            groupedFiles.map(([groupTitle, groupFiles]) => {
                                const totalSize = groupFiles.reduce((acc, f) => acc + (f.size || 0), 0)
                                const isExpanded = expandedGroups[groupTitle]

                                return (
                                    <div key={groupTitle} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                                        {/* Group Header */}
                                        <GroupHeader
                                            title={groupTitle}
                                            count={groupFiles.length}
                                            size={totalSize}
                                            isExpanded={isExpanded}
                                            onToggle={() => toggleGroup(groupTitle)}
                                            groupFiles={groupFiles}
                                        />

                                        {/* File Cards */}
                                        {isExpanded && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-2 pl-4">
                                                {groupFiles.map(file => {
                                                    const isSelected = selectedIds.has(file.id)
                                                    return (
                                                        <div
                                                            key={file.id}
                                                            onClick={() => toggleSelection(file.id)}
                                                            className={cn(
                                                                "group relative flex items-center p-3 rounded-xl border transition-all duration-200 cursor-pointer hover:shadow-md",
                                                                isSelected
                                                                    ? "bg-gray-50 border-gray-900 shadow-sm ring-1 ring-gray-900"
                                                                    : "bg-white border-gray-200 hover:border-gray-300"
                                                            )}
                                                        >
                                                            {/* Checkbox (Moved to Left) */}
                                                            <div className="pl-1 pr-3 flex-shrink-0">
                                                                <div className={cn(
                                                                    "w-5 h-5 rounded-full border flex items-center justify-center transition-all",
                                                                    isSelected
                                                                        ? "bg-gray-900 border-gray-900 text-white"
                                                                        : "border-gray-200 bg-white group-hover:border-gray-400"
                                                                )}>
                                                                    {isSelected && <Check className="w-3 h-3" />}
                                                                </div>
                                                            </div>

                                                            {/* File Icon */}
                                                            <div className="pr-4">
                                                                <div className="p-2.5 bg-gray-50 border border-gray-100/50 rounded-xl shadow-sm">
                                                                    <DocumentIcon mimeType={file.mimeType || 'unknown'} className="w-5 h-5" />
                                                                </div>
                                                            </div>

                                                            {/* Main Content */}
                                                            <div className="flex-1 min-w-0 py-1">
                                                                {/* Row 1: File Name */}
                                                                <h4 className={cn(
                                                                    "text-sm font-semibold text-gray-900 truncate mb-1.5",
                                                                    isSelected ? "text-gray-900" : "text-gray-900"
                                                                )}>
                                                                    {file.name}
                                                                </h4>

                                                                {/* Row 2: Owner | Location | Tags | Time | Size */}
                                                                <div className="flex items-center flex-wrap gap-2 text-[11px] text-gray-500">
                                                                    {/* Owner Email */}
                                                                    <span className="truncate text-gray-600 font-medium">
                                                                        {file.actorEmail || file.owner || 'Unknown'}
                                                                    </span>

                                                                    <span className="text-gray-200">|</span>

                                                                    {/* Location with Icon */}
                                                                    <span className="truncate flex items-center gap-1">
                                                                        <HardDrive className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                                                        <span>{file.parentName || 'My Drive'}</span>
                                                                    </span>

                                                                    {/* Badges/Tags */}
                                                                    {file.badges && file.badges.length > 0 && (
                                                                        <>
                                                                            <span className="text-gray-200">|</span>
                                                                            {file.badges.map((badge, idx) => {
                                                                                const badgeStyles = {
                                                                                    stale: { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
                                                                                    risk: { bg: '#FEE2E2', text: '#991B1B', border: '#FECACA' },
                                                                                    attention: { bg: '#DBEAFE', text: '#1E40AF', border: '#BFDBFE' },
                                                                                    sensitive: { bg: '#F3E8FF', text: '#6B21A8', border: '#E9D5FF' }
                                                                                }
                                                                                const style = badgeStyles[badge.type] || badgeStyles.attention
                                                                                // Match main dashboard terminology - show type in uppercase
                                                                                const badgeText = badge.type === 'risk' ? 'RISK' :
                                                                                    badge.type === 'stale' ? 'STALE' :
                                                                                        badge.type === 'sensitive' ? 'SENSITIVE' :
                                                                                            'ATTENTION'
                                                                                return (
                                                                                    <span
                                                                                        key={idx}
                                                                                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border whitespace-nowrap"
                                                                                        style={{
                                                                                            backgroundColor: style.bg,
                                                                                            color: style.text,
                                                                                            borderColor: style.border
                                                                                        }}
                                                                                    >
                                                                                        {badgeText}
                                                                                    </span>
                                                                                )
                                                                            })}
                                                                        </>
                                                                    )}

                                                                    <span className="text-gray-200">|</span>

                                                                    {/* Time */}
                                                                    <span>
                                                                        {file.modifiedTime ? formatDistanceToNow(new Date(file.modifiedTime), { addSuffix: true }) : 'Unknown date'}
                                                                    </span>

                                                                    <span className="text-gray-200">|</span>

                                                                    {/* File Size */}
                                                                    <span className="text-gray-600 font-mono font-medium px-1.5 py-0.5 rounded border border-gray-300 bg-gray-50">
                                                                        {formatFileSize(file.size || 0)}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {/* Action Menu (Absolute positioned) */}
                                                            <div
                                                                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-30 bg-white shadow-sm rounded-lg border border-gray-100"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <DocumentActionMenu
                                                                    document={file as any}
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
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )
                            })
                        )}
                    </div>

                    {/* 3. FLOAT GLASS ACTION BAR */}
                    {selectedIds.size > 0 && (
                        <div className="absolute bottom-8 left-8 right-8 z-50 animate-in slide-in-from-bottom-4 duration-300">
                            <div className="bg-gray-900/90 backdrop-blur-md text-white px-6 py-4 rounded-2xl shadow-2xl border border-white/10 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                                        <Trash2 className="w-4 h-4 text-white" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-semibold text-white">
                                            Delete {selectedIds.size} {selectedIds.size === 1 ? 'file' : 'files'}
                                        </span>
                                        <span className="text-xs text-gray-300">
                                            Reclaim {formatFileSize(totalSelectedSize)} of space
                                        </span>
                                    </div>
                                </div>

                                <button
                                    onClick={handleActionClick}
                                    className="bg-white text-gray-900 px-5 py-2 rounded-xl text-sm font-bold hover:bg-gray-100 transition-colors shadow-lg active:scale-95 transform duration-100"
                                >
                                    Confirm
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Dialog for Confirmation */}
                <DeleteConfirmationDialog
                    isOpen={showDeleteConfirm}
                    onClose={() => setShowDeleteConfirm(false)}
                    onConfirm={handleConfirmDelete}
                    count={selectedIds.size}
                    totalSize={totalSelectedSize}
                />
                <SecureAccessModal
                    isOpen={secureModalOpen}
                    onClose={() => setSecureModalOpen(false)}
                    email={secureModalData.email}
                    fileName={secureModalData.fileName}
                    mimeType={secureModalData.mimeType}
                    externalId={secureModalData.externalId}
                    firmId={secureModalData.firmId}
                />
            </SheetContent>
        </Sheet >
    )
}
