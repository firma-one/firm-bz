'use client'

import { useState } from 'react'
import { Briefcase, ChevronDown, ChevronRight, Copy, Download, Filter, Folder, Info, Link2, MoreVertical, PackageCheck, PackagePlus, RefreshCw, ScanEye, Share2, Trash2 } from 'lucide-react'
import { DocumentIcon } from '@/components/ui/document-icon'
import { ProfileBubbleWithPopup } from '@/components/ui/profile-bubble-popup'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import { cn, formatFileSize } from '@/lib/utils'
import { DemoFolder, DemoFile } from '@/lib/demo/static-demo-data'
import { DeliverableStatus } from '@/lib/demo/demo-deliverables'

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

const PREVIEW_OWNER = { name: 'Alex Jordan', email: 'alex@example.com' }

// Matches the real EngagementFileRow grid exactly: checkbox, ID, Name, Quick (x2), Owner, Date modified, Due date, File size.
const GRID_COLS = '24px 72px minmax(0, 1fr) minmax(124px, 10%) 10% 14% 12% 10% 8%'

function TableHeader({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-1 text-[0.8125rem] font-medium text-[#45474c] select-none">
            {label}
        </div>
    )
}

function InertFilterButton({ label }: { label: string }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button disabled variant="outline" size="sm" className="h-8 gap-1.5 text-xs bg-white rounded border-slate-200 text-slate-600 opacity-70 cursor-not-allowed">
                    <Filter className="h-3 w-3 opacity-60" />
                    {label}
                    <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Not available in this demo</TooltipContent>
        </Tooltip>
    )
}

function RowActionMenu({ fileName }: { fileName: string }) {
    const [open, setOpen] = useState(false)
    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    data-demo-tour="document-action-trigger"
                    className={cn(
                        'h-7 w-7 rounded-md inline-flex items-center justify-center',
                        open ? 'text-slate-700 bg-slate-100' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                    )}
                    aria-label={`Actions for ${fileName}`}
                >
                    <MoreVertical className="h-4 w-4" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[220px] py-1 text-xs rounded">
                <DropdownMenuItem disabled className="text-xs py-1.5 gap-2"><Download className="h-3.5 w-3.5" /> Download</DropdownMenuItem>
                <DropdownMenuItem disabled className="text-xs py-1.5 gap-2"><Share2 className="h-3.5 w-3.5" /> Share</DropdownMenuItem>
                <DropdownMenuItem disabled className="text-xs py-1.5 gap-2"><Link2 className="h-3.5 w-3.5" /> Copy link</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled className="text-xs py-1.5 gap-2"><Copy className="h-3.5 w-3.5" /> Duplicate</DropdownMenuItem>
                <DropdownMenuItem disabled className="text-xs py-1.5 gap-2"><Info className="h-3.5 w-3.5" /> View details</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled className="text-xs py-1.5 gap-2 text-red-500"><Trash2 className="h-3.5 w-3.5" /> Move to Bin</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

type Entry = { kind: 'folder'; folder: DemoFolder } | { kind: 'file'; file: DemoFile }

/** Static counterpart to engagement-file-row.tsx — single unified row for both folders and files, matching the real component: checkbox, ID, name, quick icons (Preview file-only, Copy link + ⋮ menu always), Owner, Date modified, Due date, File size all present for both kinds. */
function EntryRow({ entry, onOpenFolder, deliverableStatus }: { entry: Entry; onOpenFolder?: () => void; deliverableStatus?: DeliverableStatus }) {
    const isFolder = entry.kind === 'folder'
    const docId = isFolder ? entry.folder.docId : entry.file.docId
    const name = isFolder ? entry.folder.name.replace(/_+/g, ' ').trim() : entry.file.name
    const modifiedTime = isFolder ? undefined : entry.file.modifiedTime
    const size = isFolder ? undefined : entry.file.size
    const isApproved = deliverableStatus === 'approved'

    return (
        <div
            onClick={isFolder ? onOpenFolder : undefined}
            style={{ gridTemplateColumns: GRID_COLS }}
            className={cn(
                'group grid gap-4 h-10 pl-3 pr-2 items-center text-[0.8125rem] hover:bg-[#f9f9fb]',
                isFolder ? 'cursor-pointer' : 'cursor-default'
            )}
        >
            <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={false} className="h-4 w-4 pointer-events-none opacity-0 group-hover:opacity-100" />
            </div>

            <div className="flex items-center min-w-0">
                <span className="text-[11px] font-bold font-mono text-primary tracking-wide truncate">{docId}</span>
            </div>

            <div className="flex items-center gap-3 min-w-0">
                {isFolder ? (
                    <Folder className="h-4 w-4 fill-primary/20 text-primary flex-shrink-0" />
                ) : (
                    <DocumentIcon mimeType={MIME_BY_TYPE[entry.file.type] ?? 'application/octet-stream'} className="h-4 w-4 flex-shrink-0" />
                )}
                <span className={cn('text-[0.8125rem] font-medium truncate', isFolder ? 'text-[#1b1b1d]' : 'text-[#45474c]')}>{name}</span>
                {deliverableStatus && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className={cn(
                                'inline-flex items-center shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium border',
                                isApproved ? 'bg-primary text-white/70 border-primary' : 'bg-primary/10 text-primary border-primary/30'
                            )}>
                                {isApproved ? <PackageCheck className="h-3.5 w-3.5" /> : <PackagePlus className="h-3.5 w-3.5" />}
                            </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                            {isApproved ? 'Deliverable — Approved' : 'Promoted as Deliverable'}
                        </TooltipContent>
                    </Tooltip>
                )}
            </div>

            <div />

            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                {!isFolder && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button type="button" className="h-7 w-7 rounded-md inline-flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100" aria-label="Preview">
                                <ScanEye className="h-4 w-4" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">Preview (not available in this demo)</TooltipContent>
                    </Tooltip>
                )}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button type="button" className="h-7 w-7 rounded-md inline-flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100" aria-label="Copy link">
                            <Link2 className="h-4 w-4" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">Copy link (not available in this demo)</TooltipContent>
                </Tooltip>
                <RowActionMenu fileName={name} />
            </div>

            <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                    <ProfileBubbleWithPopup name={PREVIEW_OWNER.name} email={PREVIEW_OWNER.email} avatarUrl={null} />
                    <span className="text-[0.8125rem] text-[#45474c] truncate">{PREVIEW_OWNER.name}</span>
                </div>
            </div>

            <div>
                {modifiedTime ? (
                    <RelativeDateTime
                        date={modifiedTime}
                        textClassName="text-[0.8125rem] text-[#45474c]"
                        iconClassName="text-[#e5e7eb] hover:text-[#45474c]"
                        tooltipSide="top"
                    />
                ) : (
                    <span className="text-[0.8125rem] text-[#45474c]">—</span>
                )}
            </div>

            <div><span className="text-[0.8125rem] text-[#45474c]/40">—</span></div>

            <div className="text-left">
                {size ? (
                    <span className="text-[0.8125rem] text-[#45474c] font-mono">{formatFileSize(size)}</span>
                ) : (
                    <span className="text-[0.8125rem] text-[#45474c]/40">—</span>
                )}
            </div>
        </div>
    )
}

/** Static counterpart to engagement-file-list.tsx + engagement-file-row.tsx — same breadcrumb, filter/sort bar, item-count bar, 9-column sticky table header (with docId), and 3-icon quick actions per row (Preview/Copy link/⋮ menu), all inert. Top-level folders carry the same Deliverable badge shown on the Board tab. */
export function DemoFileList({ folders, deliverableStatusByFolderId }: { folders: DemoFolder[]; deliverableStatusByFolderId?: Record<string, DeliverableStatus> }) {
    const [path, setPath] = useState<DemoFolder[]>([])

    const currentFolders = path.length === 0 ? folders : path[path.length - 1].subfolders
    const currentFiles = path.length === 0 ? [] : path[path.length - 1].files

    const itemCount = currentFolders.length + currentFiles.length

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Top Bar: Breadcrumbs */}
            <div className="px-0 pt-1 pb-2 flex items-center gap-2.5 shrink-0">
                <div className="flex items-center text-xs font-medium text-slate-700 min-w-0 overflow-x-auto whitespace-nowrap custom-scrollbar">
                    <button
                        type="button"
                        onClick={() => setPath([])}
                        className={cn(
                            'flex items-center hover:bg-slate-100 px-1.5 py-1 rounded transition-colors',
                            path.length === 0 ? 'text-slate-900 bg-slate-50' : 'hover:text-slate-900'
                        )}
                        title="Files root"
                    >
                        <Briefcase className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                    </button>
                    {path.map((folder, i) => (
                        <div key={folder.id} className="flex items-center flex-shrink-0">
                            <ChevronRight className="h-3.5 w-3.5 mx-1 text-slate-400 flex-shrink-0" />
                            <button
                                type="button"
                                onClick={() => setPath(path.slice(0, i + 1))}
                                className={cn(
                                    'flex items-center min-w-0 hover:bg-slate-100 px-2 py-1 rounded transition-colors max-w-[180px]',
                                    i === path.length - 1 ? 'text-slate-900 bg-slate-50' : 'hover:text-slate-900'
                                )}
                                title={folder.name.replace(/_+/g, ' ').trim()}
                            >
                                <Folder className="h-3.5 w-3.5 mr-1.5 text-slate-400 flex-shrink-0" />
                                <span className="truncate min-w-0">{folder.name.replace(/_+/g, ' ').trim()}</span>
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Toolbar: Filters + right-side actions */}
            <div className="flex items-center justify-between gap-4 pb-2 shrink-0">
                <div className="flex items-center gap-2">
                    <InertFilterButton label="Type" />
                    <InertFilterButton label="People" />
                    <InertFilterButton label="Modified" />
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button disabled variant="outline" size="sm" className="h-8 gap-1.5 text-xs bg-white rounded border-slate-200 text-slate-600 opacity-70 cursor-not-allowed">
                                Sort
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">Not available in this demo</TooltipContent>
                    </Tooltip>
                </div>
                <div className="flex items-center gap-2">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button disabled variant="outline" size="sm" className="h-9 w-9 p-0 rounded-full border-slate-200 text-slate-400 opacity-70 cursor-not-allowed">
                                <Download className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">Select files to download</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button disabled variant="outline" size="sm" className="h-9 w-9 p-0 rounded-full border-slate-200 text-slate-400 opacity-70 cursor-not-allowed">
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">Select files to move to Bin</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button disabled variant="outline" size="sm" className="h-9 w-9 p-0 rounded-full border-slate-200 text-slate-400 opacity-70 cursor-not-allowed">
                                <RefreshCw className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">Not available in this demo</TooltipContent>
                    </Tooltip>
                </div>
            </div>

            {/* Content card — header, item count, and rows all live inside this bordered card, matching engagement-file-list.tsx exactly */}
            <div className="flex-1 overflow-hidden flex flex-col relative bg-white rounded border border-[#e5e7eb]">
                {/* Item count */}
                {itemCount > 0 && (
                    <div className="px-4 py-1.5 border-b border-[#f0f0f2] bg-[#fafafa]">
                        <span className="text-[10px] font-medium text-[#9a9ba0]">
                            Showing {itemCount} {itemCount === 1 ? 'item' : 'items'}
                        </span>
                    </div>
                )}

                {/* Fixed Table Header */}
                <div className="sticky top-0 bg-white border-b border-[#e5e7eb] pl-3 pr-2 py-2.5 shrink-0 z-10">
                    <div className="grid gap-4 items-center" style={{ gridTemplateColumns: GRID_COLS }}>
                        <div />
                        <div className="flex items-center"><TableHeader label="ID" /></div>
                        <div className="flex items-center"><TableHeader label="Name" /></div>
                        <div className="col-span-2 flex items-center justify-center"><TableHeader label="Quick" /></div>
                        <div className="flex items-center"><TableHeader label="Owner" /></div>
                        <div className="flex items-center"><TableHeader label="Date modified" /></div>
                        <div className="flex items-center"><TableHeader label="Due date" /></div>
                        <div className="flex items-center"><TableHeader label="File size" /></div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-[#e5e7eb]">
                    {currentFolders.map((folder) => (
                        <EntryRow
                            key={folder.id}
                            entry={{ kind: 'folder', folder }}
                            onOpenFolder={() => setPath([...path, folder])}
                            deliverableStatus={deliverableStatusByFolderId?.[folder.id]}
                        />
                    ))}
                    {currentFiles.map((file) => (
                        <EntryRow key={file.id} entry={{ kind: 'file', file }} />
                    ))}
                    {itemCount === 0 && (
                        <div className="flex flex-col items-center justify-center h-64 text-center px-3">
                            <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                                <Folder className="h-8 w-8 text-slate-300" />
                            </div>
                            <h3 className="text-sm font-medium text-slate-900 mb-1">Folder is empty</h3>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
