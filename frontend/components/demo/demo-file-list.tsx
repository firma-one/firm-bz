'use client'

import { useState } from 'react'
import {
    ArrowDownUp,
    Briefcase,
    ChevronRight,
    Clock3,
    Copy,
    Download,
    FileText,
    Flag,
    Folder,
    HardDrive,
    Hash,
    Info,
    Link2,
    MoreVertical,
    PackageCheck,
    PackagePlus,
    RefreshCw,
    ScanEye,
    Share2,
    Trash2,
    Type,
    User,
    UserRound,
} from 'lucide-react'
import { DocumentIcon } from '@/components/ui/document-icon'
import { Checkbox } from '@/components/ui/checkbox'
import { FilterPill } from '@/components/ui/filter-pill'
import { Hint } from '@/components/ui/tooltip'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    DATE_MODIFIED_COL_CLASS,
    DUE_DATE_COL_CLASS,
    FILE_SIZE_COL_CLASS,
    FILE_TABLE_CONTAINER_CLASS,
    FILE_TABLE_GRID_COLS_CLASS,
    OWNER_COL_CLASS,
} from '@/components/projects/engagement-file-table-grid'
import { cn, formatFileSize } from '@/lib/utils'
import { initialsOf } from '@/lib/initials'
import type { DemoFolder, DemoFile } from '@/lib/demo/static-demo-data'
import type { DeliverableStatus } from '@/lib/demo/demo-deliverables'

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

const OWNER = 'Alex Jordan'
const NOT_IN_DEMO = 'Not available in this demo'

function TableHeader({ label, icon }: { label: string; icon: React.ReactNode }) {
    return (
        <span className="flex select-none items-center gap-1.5 text-small text-fg-muted [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:text-fg-subtle">
            {icon}
            {label}
        </span>
    )
}

/** A ghost icon button with the app's hint; inert in the demo. */
function QuickAction({ icon, label }: { icon: React.ReactNode; label: string }) {
    return (
        <Hint label={`${label} (not in this demo)`}>
            <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex h-7 w-7 items-center justify-center rounded-control text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg [&_svg]:h-4 [&_svg]:w-4"
                aria-label={label}
            >
                {icon}
            </button>
        </Hint>
    )
}

function RowActionMenu({ fileName }: { fileName: string }) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    data-demo-tour="document-action-trigger"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-control text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg data-[state=open]:bg-surface-hover data-[state=open]:text-fg"
                    aria-label={`Actions for ${fileName}`}
                >
                    <MoreVertical className="h-4 w-4" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[220px]">
                <DropdownMenuItem disabled className="gap-2"><Download className="h-3.5 w-3.5" /> Download</DropdownMenuItem>
                <DropdownMenuItem disabled className="gap-2"><Share2 className="h-3.5 w-3.5" /> Share</DropdownMenuItem>
                <DropdownMenuItem disabled className="gap-2"><Link2 className="h-3.5 w-3.5" /> Copy link</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled className="gap-2"><Copy className="h-3.5 w-3.5" /> Duplicate</DropdownMenuItem>
                <DropdownMenuItem disabled className="gap-2"><Info className="h-3.5 w-3.5" /> View details</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled className="gap-2 text-danger"><Trash2 className="h-3.5 w-3.5" /> Move to Bin</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

type Entry = { kind: 'folder'; folder: DemoFolder } | { kind: 'file'; file: DemoFile }

/** Static counterpart to engagement-file-row.tsx: the same grid, cells and quick actions. */
function EntryRow({ entry, onOpenFolder, deliverableStatus }: { entry: Entry; onOpenFolder?: () => void; deliverableStatus?: DeliverableStatus }) {
    const isFolder = entry.kind === 'folder'
    const docId = isFolder ? entry.folder.docId : entry.file.docId
    const name = isFolder ? entry.folder.name.replace(/_+/g, ' ').trim() : entry.file.name
    const approved = deliverableStatus === 'approved'

    return (
        <div
            onClick={isFolder ? onOpenFolder : undefined}
            className={`${FILE_TABLE_GRID_COLS_CLASS} ${cn(
                'group relative grid h-9 items-center gap-4 pl-1 pr-2 text-ui transition-colors',
                approved ? 'bg-action/5 hover:bg-action/10' : 'hover:bg-surface-hover',
                isFolder ? 'cursor-pointer' : 'cursor-default',
            )}`}
        >
            <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center" onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={false} className="pointer-events-none h-4 w-4" />
            </div>

            <div className="flex min-w-0 items-center">
                <span className="truncate text-small tabular-nums text-fg-subtle">{docId}</span>
            </div>

            <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
                    {isFolder ? (
                        <Folder className="h-4 w-4 fill-surface-muted text-fg-muted" />
                    ) : (
                        <DocumentIcon mimeType={MIME_BY_TYPE[entry.file.type] ?? 'application/octet-stream'} className="h-4 w-4" />
                    )}
                </span>
                <span className="min-w-0 truncate text-fg">{name}</span>
                {deliverableStatus && (
                    <Hint label={approved ? 'Deliverable — approved' : 'Deliverable'}>
                        <span className={cn('inline-flex shrink-0 items-center', approved ? 'text-action' : 'text-fg-subtle')}>
                            {approved ? <PackageCheck className="h-3.5 w-3.5" /> : <PackagePlus className="h-3.5 w-3.5" />}
                        </span>
                    </Hint>
                )}
            </div>

            <div className="col-span-2 flex items-center justify-end gap-0.5">
                {!isFolder && <QuickAction icon={<ScanEye />} label="Preview" />}
                <QuickAction icon={<Link2 />} label="Copy link" />
                <RowActionMenu fileName={name} />
            </div>

            <div className={`min-w-0 items-center gap-1.5 ${OWNER_COL_CLASS}`}>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[9px] font-medium text-fg-muted">{initialsOf(OWNER)}</span>
                <span className="truncate text-fg-muted">{OWNER}</span>
            </div>

            <div className={`items-center ${DATE_MODIFIED_COL_CLASS}`}>
                {!isFolder ? (
                    <RelativeDateTime date={entry.file.modifiedTime} textClassName="text-ui text-fg-muted" iconClassName="hidden" tooltipSide="top" />
                ) : (
                    <span className="text-fg-subtle">—</span>
                )}
            </div>

            <div className={`items-center ${DUE_DATE_COL_CLASS}`}>
                <span className="text-fg-subtle">—</span>
            </div>

            <div className={`items-center ${FILE_SIZE_COL_CLASS}`}>
                {!isFolder && entry.file.size ? (
                    <span className="tabular-nums text-fg-muted">{formatFileSize(entry.file.size)}</span>
                ) : (
                    <span className="text-fg-subtle">—</span>
                )}
            </div>
        </div>
    )
}

/**
 * Static counterpart to engagement-file-list.tsx + engagement-file-row.tsx: the same breadcrumb,
 * filter pills, item count and table (shared grid, collapsing columns), all inert except folder
 * navigation. Top-level deliverable folders carry the marker the Board tab also shows.
 */
export function DemoFileList({ folders, deliverableStatusByFolderId }: { folders: DemoFolder[]; deliverableStatusByFolderId?: Record<string, DeliverableStatus> }) {
    const [path, setPath] = useState<DemoFolder[]>([])

    const currentFolders = path.length === 0 ? folders : path[path.length - 1].subfolders
    const currentFiles = path.length === 0 ? [] : path[path.length - 1].files
    const itemCount = currentFolders.length + currentFiles.length

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            {/* Breadcrumb */}
            <div className="flex shrink-0 items-center pb-2 text-ui">
                <button
                    type="button"
                    onClick={() => setPath([])}
                    className={cn('flex items-center rounded-control px-1.5 py-1 transition-colors hover:bg-surface-hover', path.length === 0 ? 'text-fg' : 'text-fg-muted')}
                    aria-label="Files root"
                >
                    <Briefcase className="h-3.5 w-3.5 text-fg-subtle" />
                </button>
                {path.map((folder, i) => (
                    <div key={folder.id} className="flex min-w-0 items-center">
                        <ChevronRight className="mx-0.5 h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                        <button
                            type="button"
                            onClick={() => setPath(path.slice(0, i + 1))}
                            className={cn(
                                'flex min-w-0 max-w-[200px] items-center gap-1.5 rounded-control px-1.5 py-1 transition-colors hover:bg-surface-hover',
                                i === path.length - 1 ? 'font-medium text-fg' : 'text-fg-muted',
                            )}
                        >
                            <Folder className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                            <span className="truncate">{folder.name.replace(/_+/g, ' ').trim()}</span>
                        </button>
                    </div>
                ))}
            </div>

            {/* Toolbar */}
            <div className="flex shrink-0 items-center justify-between gap-4 pb-3">
                <Hint label="Filters aren't available in this demo" side="bottom">
                    <div className="flex items-center gap-1.5">
                        <FilterPill icon={<FileText />} label="Type" />
                        <FilterPill icon={<User />} label="People" />
                        <FilterPill icon={<Clock3 />} label="Modified" />
                        <FilterPill icon={<ArrowDownUp />} label="Sort" />
                    </div>
                </Hint>
                <div className="flex items-center gap-0.5">
                    <QuickAction icon={<Download />} label="Download selected" />
                    <QuickAction icon={<Trash2 />} label="Move selected to Bin" />
                    <QuickAction icon={<RefreshCw />} label="Refresh" />
                </div>
            </div>

            <div className={`flex min-h-0 flex-1 flex-col ${FILE_TABLE_CONTAINER_CLASS}`}>
                {itemCount > 0 && (
                    <div className="px-1 pb-1.5">
                        <span className="text-caption tabular-nums text-fg-subtle">{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
                    </div>
                )}

                <div className="sticky top-0 z-10 flex h-8 shrink-0 flex-col justify-center border-b border-line bg-surface pl-1 pr-2">
                    <div className={`grid items-center gap-4 ${FILE_TABLE_GRID_COLS_CLASS}`}>
                        <div className="flex h-4 w-4 items-center justify-center"><Checkbox checked={false} className="pointer-events-none h-4 w-4" /></div>
                        <div className="flex items-center"><TableHeader label="ID" icon={<Hash />} /></div>
                        <div className="flex items-center"><TableHeader label="Name" icon={<Type />} /></div>
                        <div className="col-span-2" aria-hidden />
                        <div className={`items-center ${OWNER_COL_CLASS}`}><TableHeader label="Owner" icon={<UserRound />} /></div>
                        <div className={`items-center ${DATE_MODIFIED_COL_CLASS}`}><TableHeader label="Modified" icon={<Clock3 />} /></div>
                        <div className={`items-center ${DUE_DATE_COL_CLASS}`}><TableHeader label="Due" icon={<Flag />} /></div>
                        <div className={`items-center ${FILE_SIZE_COL_CLASS}`}><TableHeader label="Size" icon={<HardDrive />} /></div>
                    </div>
                </div>

                <div className="flex-1 divide-y divide-line overflow-y-auto">
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
                        <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
                            <Folder className="h-6 w-6 text-fg-subtle" />
                            <p className="text-small text-fg-muted">This folder is empty</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
