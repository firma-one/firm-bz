'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Briefcase, CalendarClock, FileText, Folder, Package, Search, Sparkles, Users, X } from 'lucide-react'
import { DocumentIcon } from '@/components/ui/document-icon'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { DemoFirm, DemoFile, DemoFolder } from '@/lib/demo/static-demo-data'

const MIME_BY_TYPE: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    md: 'text/markdown',
    sheet: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    slide: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    zip: 'application/zip',
}

const DOC_TYPE_OPTIONS = [
    { label: 'Documents', types: ['doc', 'docx', 'md'] },
    { label: 'Spreadsheets', types: ['sheet', 'xlsx'] },
    { label: 'Presentations', types: ['slide', 'pptx'] },
    { label: 'PDFs', types: ['pdf'] },
    { label: 'Images', types: ['jpg', 'jpeg', 'png'] },
    { label: 'Archives', types: ['zip'] },
]

const DATE_RANGE_OPTIONS = [
    { label: 'Last 7 days', days: 7 },
    { label: 'Last 30 days', days: 30 },
    { label: 'Last 90 days', days: 90 },
    { label: 'Last 6 months', days: 180 },
    { label: 'Last 12 months', days: 365 },
]

/** Only the first option per stage is wired to actually filter results — the rest render in the
 * picker for visual richness but stay disabled, since result accuracy is not the point of the demo. */
const SELECTABLE_OPTION_COUNT = 1

interface SearchRow {
    file: DemoFile
    clientName: string
    engagementName: string
    folderName: string
}

function collectFiles(folder: DemoFolder, clientName: string, engagementName: string): SearchRow[] {
    const own = folder.files.map((file) => ({ file, clientName, engagementName, folderName: folder.name }))
    const nested = folder.subfolders.flatMap((sub) => collectFiles(sub, clientName, engagementName))
    return [...own, ...nested]
}

const LITERAL_QUERY_TERMS = ['strategy']
function matchTypeFor(fileName: string): 'name' | 'semantic' {
    const lower = fileName.toLowerCase()
    return LITERAL_QUERY_TERMS.some((term) => lower.includes(term)) ? 'name' : 'semantic'
}

// 5 stages in the real app's fixed order — Deliverable is permanently gated/disabled here (no deliverable-level
// data modeled separately from files in the demo fixture), matching the real hierarchy-gating pattern exactly.
type FilterStage = 'client' | 'engagement' | 'deliverable' | 'type' | 'dateRange'
interface FilterState {
    client: string | null
    engagement: string | null
    type: string | null
    dateRange: string | null
}

const STAGE_ORDER: FilterStage[] = ['client', 'engagement', 'deliverable', 'type', 'dateRange']
const STAGE_ICON: Record<FilterStage, React.ElementType> = {
    client: Users,
    engagement: Briefcase,
    deliverable: Package,
    type: FileText,
    dateRange: CalendarClock,
}
const STAGE_LABEL: Record<FilterStage, string> = {
    client: 'Client',
    engagement: 'Engagement',
    deliverable: 'Deliverable',
    type: 'Type',
    dateRange: 'Time',
}

/** Static counterpart to global-search-view.tsx — same single bordered composer with a fixed 5-pill filter row (Deliverable permanently gated) + search input below, same picker panel with footer legend, matching the real look/feel exactly. Mouse-only: click a pill to open its picker, click an option or click outside to close. Result accuracy is illustrative only. */
export function DemoFirmDocSearch({ firm }: { firm: DemoFirm }) {
    const [filters, setFilters] = useState<FilterState>({ client: null, engagement: null, type: null, dateRange: null })
    const [pickerStage, setPickerStage] = useState<Exclude<FilterStage, 'deliverable'> | null>(null)
    const [pickerPosition, setPickerPosition] = useState<{ top: number; left: number; width: number } | null>(null)
    const composerRef = useRef<HTMLDivElement>(null)
    const pickerRef = useRef<HTMLDivElement>(null)

    // Recompute the portaled picker's position from the composer's live viewport rect whenever it
    // opens, keeping it directly under the composer regardless of scroll/resize — matches the real
    // global-search-view.tsx positioning exactly (fixed + portal, not absolute inside a small wrapper).
    useEffect(() => {
        if (!pickerStage) { setPickerPosition(null); return }
        const updatePosition = () => {
            const rect = composerRef.current?.getBoundingClientRect()
            if (rect) setPickerPosition({ top: rect.bottom + 4, left: rect.left, width: rect.width })
        }
        updatePosition()
        window.addEventListener('scroll', updatePosition, true)
        window.addEventListener('resize', updatePosition)
        return () => {
            window.removeEventListener('scroll', updatePosition, true)
            window.removeEventListener('resize', updatePosition)
        }
    }, [pickerStage])

    // Mouse-only: close the picker on any click outside both the composer and the (portaled) picker panel.
    useEffect(() => {
        if (!pickerStage) return
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node
            if (composerRef.current?.contains(target)) return
            if (pickerRef.current?.contains(target)) return
            setPickerStage(null)
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [pickerStage])

    const allRows = useMemo(() => firm.clients.flatMap((client) =>
        client.engagements.flatMap((engagement) =>
            engagement.folders.flatMap((folder) => collectFiles(folder, client.name, engagement.name))
        )
    ), [firm])

    const clientOptions = useMemo(() => Array.from(new Set(allRows.map((r) => r.clientName))).sort(), [allRows])
    const engagementOptions = useMemo(() => {
        const scoped = filters.client ? allRows.filter((r) => r.clientName === filters.client) : allRows
        return Array.from(new Set(scoped.map((r) => r.engagementName))).sort()
    }, [allRows, filters.client])

    const now = Date.now()
    const rows = useMemo(() => {
        return allRows.filter((row) => {
            if (filters.client && row.clientName !== filters.client) return false
            if (filters.engagement && row.engagementName !== filters.engagement) return false
            if (filters.type) {
                const opt = DOC_TYPE_OPTIONS.find((o) => o.label === filters.type)
                if (opt && !opt.types.includes(row.file.type)) return false
            }
            if (filters.dateRange) {
                const opt = DATE_RANGE_OPTIONS.find((o) => o.label === filters.dateRange)
                if (opt) {
                    const ageMs = now - new Date(row.file.modifiedTime).getTime()
                    if (ageMs > opt.days * 86400000) return false
                }
            }
            return true
        })
    }, [allRows, filters, now])

    const setFilter = (stage: Exclude<FilterStage, 'deliverable'>, value: string) => {
        setFilters((prev) => {
            const next = { ...prev, [stage]: value }
            if (stage === 'client') {
                const stillValid = allRows.some((r) => r.clientName === value && r.engagementName === prev.engagement)
                if (!stillValid) next.engagement = null
            }
            return next
        })
    }
    const removeFilter = (stage: Exclude<FilterStage, 'deliverable'>) => {
        setFilters((prev) => ({ ...prev, [stage]: null }))
    }

    const optionsForStage = (stage: Exclude<FilterStage, 'deliverable'>): string[] => {
        if (stage === 'client') return clientOptions
        if (stage === 'engagement') return engagementOptions
        if (stage === 'type') return DOC_TYPE_OPTIONS.map((o) => o.label)
        return DATE_RANGE_OPTIONS.map((o) => o.label)
    }

    // Client/engagement lists are naturally short and fully wired; Type/Time show extra options for
    // visual richness but only the first SELECTABLE_OPTION_COUNT entries are actually clickable.
    const isOptionSelectable = (stage: Exclude<FilterStage, 'deliverable'>, index: number): boolean => {
        if (stage === 'client' || stage === 'engagement') return true
        return index < SELECTABLE_OPTION_COUNT
    }

    const togglePicker = (stage: Exclude<FilterStage, 'deliverable'>) => {
        setPickerStage((prev) => (prev === stage ? null : stage))
    }

    const pickerOptions = pickerStage
        ? optionsForStage(pickerStage).map((label, index) => ({ label, selectable: isOptionSelectable(pickerStage, index) }))
        : []

    return (
        <TooltipProvider>
            <div className="flex h-full min-h-0 bg-white rounded border border-[#e5e7eb]">
                <div className="flex flex-col flex-1 min-w-0 min-h-0 p-6">
                    <div>
                        <h1 className="font-headline text-2xl font-semibold tracking-tight text-[#1b1b1d]">Document Search</h1>
                        <p className="text-sm text-[#45474c] mt-1">
                            Search documents across every client and engagement you have access to.
                        </p>
                        <p className="text-xs text-[#45474c] mt-1">
                            Click a filter pill below to narrow results by client, engagement, doc-type, or time.
                        </p>
                    </div>

                    <div className="relative mt-4">
                        <div ref={composerRef} className="rounded-md border border-[#e5e7eb] bg-white shadow-sm overflow-hidden transition-all focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/5">
                            {/* Filter pill row — fixed slots in canonical order, always visible */}
                            <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2.5 pb-1.5 border-b border-[#e5e7eb]">
                                {STAGE_ORDER.map((stage) => {
                                    const Icon = STAGE_ICON[stage]
                                    const isGated = stage === 'deliverable' || (stage === 'engagement' && !filters.client)
                                    const value = stage === 'deliverable' ? null : filters[stage as Exclude<FilterStage, 'deliverable'>]

                                    if (value) {
                                        return (
                                            <span
                                                key={stage}
                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border shrink-0 font-mono bg-primary/10 text-primary border-primary/20"
                                            >
                                                <Icon className="h-3 w-3" />
                                                {value}
                                                <button
                                                    type="button"
                                                    onClick={() => removeFilter(stage as Exclude<FilterStage, 'deliverable'>)}
                                                    aria-label={`Remove ${STAGE_LABEL[stage]} filter`}
                                                    className="ml-0.5 -mr-0.5 rounded hover:bg-primary/20"
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </span>
                                        )
                                    }

                                    return (
                                        <Tooltip key={stage}>
                                            <TooltipTrigger asChild>
                                                <button
                                                    type="button"
                                                    disabled={isGated}
                                                    onClick={() => stage !== 'deliverable' && togglePicker(stage)}
                                                    aria-label={`Filter by ${STAGE_LABEL[stage]}`}
                                                    className={cn(
                                                        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border shrink-0 transition-colors focus:outline-none font-mono',
                                                        isGated
                                                            ? 'border-[#e5e7eb] text-[#c0c1c6] cursor-not-allowed opacity-50'
                                                            : 'border-[#e5e7eb] text-[#45474c] bg-[#f9f9fb] hover:border-primary/40 hover:text-primary hover:bg-primary/10'
                                                    )}
                                                >
                                                    <Icon className="h-3 w-3" />
                                                    {STAGE_LABEL[stage]}
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent side="bottom">
                                                {stage === 'deliverable'
                                                    ? 'Not available in this demo'
                                                    : isGated
                                                        ? 'Select Client first'
                                                        : `Filter by ${STAGE_LABEL[stage]}`}
                                            </TooltipContent>
                                        </Tooltip>
                                    )
                                })}
                            </div>

                            <div className="flex">
                                <div className="flex flex-col justify-center py-3 pl-4 pr-2 shrink-0">
                                    <Search className="h-4 w-4 text-primary" />
                                </div>
                                <div className="flex-1 min-w-0 flex items-center px-1 py-2.5">
                                    <input
                                        type="text"
                                        readOnly
                                        value="go-to-market strategy and positioning materials"
                                        placeholder="Search by filename or topic, e.g. SEO strategy documents"
                                        className="flex-1 min-w-[10rem] py-1 px-1 border-0 bg-transparent text-sm font-medium text-[#1b1b1d] shadow-none focus:outline-none focus:ring-0 cursor-text"
                                        aria-label="Document search"
                                    />
                                </div>
                                <div className="flex flex-col justify-center py-2 pl-1.5 pr-3 shrink-0">
                                    <span className="p-1 rounded-full text-[#c0c1c6]">
                                        <X className="h-4 w-4" />
                                    </span>
                                </div>
                            </div>
                        </div>

                        {pickerStage && pickerPosition && createPortal(
                            <div
                                ref={pickerRef}
                                style={{ position: 'fixed', top: pickerPosition.top, left: pickerPosition.left, width: pickerPosition.width, maxWidth: 320 }}
                                className="z-50 rounded-md border border-[#e5e7eb] bg-white shadow-lg py-1"
                            >
                                <div className="px-2.5 py-1.5 border-b border-[#e5e7eb] flex items-center justify-between gap-2">
                                    <span className="text-xs font-medium text-[#45474c]">Filter by {STAGE_LABEL[pickerStage]}</span>
                                    <button
                                        type="button"
                                        onClick={() => setPickerStage(null)}
                                        aria-label="Close"
                                        className="rounded p-0.5 text-[#9a9ba0] hover:bg-[#f9f9fb] hover:text-[#45474c]"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                                <div className="max-h-56 overflow-y-auto">
                                    {pickerOptions.map((o) => (
                                        <Tooltip key={o.label}>
                                            <TooltipTrigger asChild>
                                                <button
                                                    type="button"
                                                    disabled={!o.selectable}
                                                    onClick={() => {
                                                        if (!o.selectable) return
                                                        setFilter(pickerStage, o.label)
                                                        setPickerStage(null)
                                                    }}
                                                    className={cn(
                                                        'w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-2',
                                                        !o.selectable
                                                            ? 'text-[#c0c1c6] cursor-not-allowed'
                                                            : 'hover:bg-primary/10 hover:text-primary'
                                                    )}
                                                >
                                                    {o.label}
                                                </button>
                                            </TooltipTrigger>
                                            {!o.selectable && (
                                                <TooltipContent side="right" className="text-xs">Not available in this demo</TooltipContent>
                                            )}
                                        </Tooltip>
                                    ))}
                                </div>
                            </div>,
                            document.body
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar mt-4">
                        <div className="flex items-center justify-end gap-2 mb-4">
                            <span className="text-[10px] font-mono text-[#45474c] shrink-0">
                                {rows.length} {rows.length === 1 ? 'Result' : 'Results'} found
                            </span>
                        </div>

                        <div className="space-y-3">
                            {rows.map((row) => {
                                const matchType = matchTypeFor(row.file.name)
                                return (
                                    <div
                                        key={row.file.id}
                                        className="group w-full text-left bg-white border border-[#e5e7eb] p-4 rounded flex gap-4"
                                    >
                                        <div className="w-12 h-12 flex items-center justify-center rounded border border-[#e5e7eb] bg-[#f9f9fb] shrink-0">
                                            <DocumentIcon mimeType={MIME_BY_TYPE[row.file.type] ?? 'application/octet-stream'} size={24} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-sm text-[#1b1b1d] min-w-0">
                                                <span className="font-medium truncate">{row.file.name}</span>
                                            </h3>
                                            <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 mt-1">
                                                <span className="inline-flex items-center gap-1 text-[10px] text-[#45474c] font-mono">
                                                    <Users className="h-2.5 w-2.5 shrink-0" />
                                                    {row.clientName}
                                                </span>
                                                <span className="text-[#d1d5db]">•</span>
                                                <span className="inline-flex items-center gap-1 text-[10px] text-[#45474c] font-mono">
                                                    <Briefcase className="h-2.5 w-2.5 shrink-0" />
                                                    {row.engagementName}
                                                </span>
                                                <span className="text-[#d1d5db]">•</span>
                                                <span className="inline-flex items-center gap-1 text-[10px] text-[#45474c] font-mono">
                                                    <Folder className="h-2.5 w-2.5 shrink-0" />
                                                    {row.folderName}
                                                </span>
                                            </div>
                                            <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-widest bg-primary/10 text-primary">
                                                {matchType === 'semantic' ? <Sparkles className="h-2.5 w-2.5" /> : <Package className="h-2.5 w-2.5" />}
                                                {matchType === 'semantic' ? 'Semantic Match' : 'File Match'}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                            {rows.length === 0 && (
                                <div className="py-8 text-center">
                                    <p className="text-sm text-[#45474c]">No results match these filters.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </TooltipProvider>
    )
}
