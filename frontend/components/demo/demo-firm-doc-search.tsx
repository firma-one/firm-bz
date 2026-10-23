'use client'

import React, { useMemo, useState } from 'react'
import { ArrowUpRight, Briefcase, Building2, CalendarClock, FileText, Folder, Hash, Search, Sparkles, X, FolderPlus } from 'lucide-react'
import { ClientIcon } from '@/components/ui/client-icon'
import { DropdownMenu, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { FilterMenuLabel, FilterMenuRow, FilterPill } from '@/components/ui/filter-pill'
import { DocumentIcon } from '@/components/ui/document-icon'
import { EmptyPanel } from '@/components/ui/empty-panel'
import { Hint } from '@/components/ui/tooltip'
import { Tag } from '@/components/ui/tag'
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
    zip: 'application/zip',
}

const TYPE_OPTIONS = [
    { label: 'Documents', types: ['doc', 'docx', 'md'] },
    { label: 'Spreadsheets', types: ['sheet', 'xlsx'] },
    { label: 'Presentations', types: ['slide', 'pptx'] },
    { label: 'PDFs', types: ['pdf'] },
]

const TIME_OPTIONS = [
    { label: 'Last 7 days', days: 7 },
    { label: 'Last 30 days', days: 30 },
    { label: 'Last 90 days', days: 90 },
]

interface SearchRow {
    file: DemoFile
    clientName: string
    engagementName: string
    folderName: string
}

function collectFiles(folder: DemoFolder, clientName: string, engagementName: string): SearchRow[] {
    const own = folder.files.map((file) => ({ file, clientName, engagementName, folderName: folder.name.replace(/_+/g, ' ').trim() }))
    return [...own, ...folder.subfolders.flatMap((sub) => collectFiles(sub, clientName, engagementName))]
}

/** The sample query names a strategy, so files with it in the name are a file match; the rest are topical. */
const matchTypeFor = (fileName: string): 'name' | 'semantic' => (fileName.toLowerCase().includes('strategy') ? 'name' : 'semantic')

type Stage = 'client' | 'engagement' | 'deliverable' | 'type' | 'time'
const STAGES: { stage: Stage; label: string; icon: React.ReactNode }[] = [
    { stage: 'client', label: 'Client', icon: <ClientIcon /> },
    { stage: 'engagement', label: 'Engagement', icon: <Briefcase /> },
    { stage: 'deliverable', label: 'Deliverable', icon: <FolderPlus /> },
    { stage: 'type', label: 'Type', icon: <FileText /> },
    { stage: 'time', label: 'Time', icon: <CalendarClock /> },
]

/**
 * Static counterpart to GlobalSearchView (components/search/global-search-view.tsx): the same
 * borderless search field, filter pills with Notion menus, and hairline result rows, over the
 * sample firm's files. Client, Engagement, Type and Time filter for real; Deliverable is shown but
 * not modelled in the sample data.
 */
export function DemoFirmDocSearch({ firm }: { firm: DemoFirm }) {
    const [filters, setFilters] = useState<Partial<Record<Stage, string>>>({})

    const allRows = useMemo(() => firm.clients.flatMap((client) =>
        client.engagements.flatMap((engagement) =>
            engagement.folders.flatMap((folder) => collectFiles(folder, client.name, engagement.name)),
        ),
    ), [firm])

    const optionsFor = (stage: Stage): string[] => {
        if (stage === 'client') return Array.from(new Set(allRows.map((r) => r.clientName))).sort()
        if (stage === 'engagement') {
            const scoped = filters.client ? allRows.filter((r) => r.clientName === filters.client) : allRows
            return Array.from(new Set(scoped.map((r) => r.engagementName))).sort()
        }
        if (stage === 'type') return TYPE_OPTIONS.map((o) => o.label)
        if (stage === 'time') return TIME_OPTIONS.map((o) => o.label)
        return []
    }

    const rows = useMemo(() => {
        const now = Date.now()
        return allRows.filter((row) => {
            if (filters.client && row.clientName !== filters.client) return false
            if (filters.engagement && row.engagementName !== filters.engagement) return false
            if (filters.type) {
                const opt = TYPE_OPTIONS.find((o) => o.label === filters.type)
                if (opt && !opt.types.includes(row.file.type)) return false
            }
            if (filters.time) {
                const opt = TIME_OPTIONS.find((o) => o.label === filters.time)
                if (opt && now - new Date(row.file.modifiedTime).getTime() > opt.days * 86400000) return false
            }
            return true
        })
    }, [allRows, filters])

    const set = (stage: Stage, value: string | undefined) =>
        setFilters((prev) => {
            const next = { ...prev, [stage]: value }
            // A new client may not have the chosen engagement.
            if (stage === 'client' && value && prev.engagement && !allRows.some((r) => r.clientName === value && r.engagementName === prev.engagement)) {
                delete next.engagement
            }
            return next
        })

    const disabledReason = (stage: Stage): string | null =>
        stage === 'deliverable' ? 'Not available in this demo' : stage === 'engagement' && !filters.client ? 'Pick a client first' : null

    return (
        <div className="flex min-h-0 flex-col">
            <div className="flex items-center gap-2.5 border-b border-line pb-2">
                <Search className="h-[18px] w-[18px] shrink-0 text-fg-subtle" />
                <input
                    type="text"
                    readOnly
                    value="go-to-market strategy and positioning materials"
                    className="min-w-[10rem] flex-1 border-0 bg-transparent py-1.5 text-body text-fg shadow-none focus:outline-none"
                    aria-label="Document search"
                />
                <button
                    type="button"
                    onClick={() => setFilters({})}
                    disabled={Object.values(filters).every((v) => !v)}
                    className="rounded-full p-1 text-fg-muted hover:bg-surface-hover disabled:text-fg-subtle disabled:hover:bg-transparent"
                    aria-label="Clear filters"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pt-3">
                {STAGES.map(({ stage, label, icon }) => {
                    const reason = disabledReason(stage)
                    const value = filters[stage]
                    const pill = (
                        <DropdownMenu key={stage}>
                            <DropdownMenuTrigger asChild>
                                <FilterPill disabled={Boolean(reason)} icon={icon} label={label} value={value} onClear={() => set(stage, undefined)} />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-[240px] p-1">
                                <FilterMenuLabel>{label}</FilterMenuLabel>
                                <FilterMenuRow selected={!value} onSelect={() => set(stage, undefined)}>Any {label.toLowerCase()}</FilterMenuRow>
                                <DropdownMenuSeparator className="mx-0 my-1" />
                                {optionsFor(stage).map((o) => (
                                    <FilterMenuRow key={o} selected={value === o} onSelect={() => set(stage, o)}>{o}</FilterMenuRow>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )
                    // A disabled pill gets no pointer events, so its reason sits on a wrapper.
                    return reason ? (
                        <Hint key={stage} label={reason} side="bottom"><span className="inline-flex">{pill}</span></Hint>
                    ) : pill
                })}
            </div>

            <div className="mt-6">
                <div className="mb-2 flex items-center justify-between gap-4 text-small text-fg-muted">
                    <span>Results for <span className="font-medium text-fg">go-to-market strategy and positioning materials</span></span>
                    <span className="shrink-0 tabular-nums text-fg-subtle">{rows.length} {rows.length === 1 ? 'result' : 'results'}</span>
                </div>

                {rows.length > 0 ? (
                    <div className="flex flex-col divide-y divide-line border-y border-line">
                        {rows.map((row) => {
                            const matchType = matchTypeFor(row.file.name)
                            const crumbs = [
                                { icon: Building2, label: row.clientName },
                                { icon: Briefcase, label: row.engagementName },
                                { icon: Folder, label: row.folderName },
                            ]
                            return (
                                <div key={row.file.id} className="group flex w-full gap-3 px-2 py-3 text-left transition-colors hover:bg-surface-hover">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-surface-muted">
                                        <DocumentIcon mimeType={MIME_BY_TYPE[row.file.type] ?? 'application/octet-stream'} size={20} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h3 className="flex min-w-0 items-center gap-1.5 text-ui text-fg">
                                            <span className="shrink-0 rounded-control bg-surface-muted px-1.5 py-0.5 font-mono text-caption text-fg-muted">{row.file.docId}</span>
                                            <span className="truncate font-medium">{row.file.name}</span>
                                        </h3>
                                        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                            {crumbs.map((part, i) => {
                                                const PartIcon = part.icon
                                                return (
                                                    <React.Fragment key={i}>
                                                        {i > 0 && <span className="text-fg-subtle">/</span>}
                                                        <span className="inline-flex items-center gap-1 text-caption text-fg-subtle">
                                                            <PartIcon className="h-2.5 w-2.5 shrink-0" />
                                                            {part.label}
                                                        </span>
                                                    </React.Fragment>
                                                )
                                            })}
                                        </div>
                                        <div className="mt-1.5">
                                            <Tag color={matchType === 'semantic' ? 'purple' : 'gray'} icon={matchType === 'semantic' ? <Sparkles /> : <Hash />}>
                                                {matchType === 'semantic' ? 'Semantic match' : 'File match'}
                                            </Tag>
                                        </div>
                                    </div>
                                    <ArrowUpRight className={cn('h-4 w-4 shrink-0 self-end text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100')} />
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <EmptyPanel compact icon={<Search />} title="No results match these filters" />
                )}
            </div>
        </div>
    )
}
