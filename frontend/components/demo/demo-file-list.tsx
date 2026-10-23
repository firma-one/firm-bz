'use client'

import { useEffect, useRef, useState } from 'react'
import {
    ArrowDownUp,
    Bookmark,
    Briefcase,
    Calendar,
    ChevronRight,
    CircleDot,
    Clock,
    Clock3,
    Copy,
    Download,
    Edit3,
    ExternalLink,
    Eye,
    FileText,
    Flag,
    Folder,
    FolderLock,
    FolderOpen,
    HardDrive,
    Hash,
    Info,
    Link2,
    MessagesSquare,
    MoreVertical,
    FolderInput,
    CopyPlus,
    RefreshCw,
    ScanEye,
    Search,
    Trash2,
    Type,
    User,
    UserRound,
    FolderPlus,
    FolderMinus,
    Upload,
} from 'lucide-react'
import { DocumentIcon } from '@/components/ui/document-icon'
import { Checkbox } from '@/components/ui/checkbox'
import { FilterPill } from '@/components/ui/filter-pill'
import { Hint } from '@/components/ui/tooltip'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import { StatusPill } from '@/components/ui/status-pill'
import { DateProperty, StatusProperty } from '@/components/ui/property-cells'
import { useToast } from '@/components/ui/toast'
import { FILES_DROP_TARGET_ROW_CLASS, FILES_DROP_ZONE_ACTIVE_CLASS, FilesDropPill, FilesDropRow } from '@/components/projects/files-drop-zone'
import { getAllowedTransitions } from '@/lib/deliverable-stage-roles'
import { statusOf } from '@/lib/ui/status'
import { DuePickerPanel } from '@/components/ui/due-picker'
import { DeliverableIcon } from '@/components/ui/deliverable-icon'
import { ModifiedStamp } from '@/components/ui/modified-stamp'
import { formatDue, isPastDue, readDue } from '@/lib/ui/due-date'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    DATE_MODIFIED_COL_CLASS,
    DUE_DATE_COL_CLASS,
    FILE_SIZE_COL_CLASS,
    FILE_TABLE_COL_LINE_CLASS,
    FILE_TABLE_CONTAINER_CLASS,
    FILE_TABLE_GRID_COLS_CLASS,
    OWNER_COL_CLASS,
    STATUS_COL_CLASS,
} from '@/components/projects/engagement-file-table-grid'
import { cn, formatFileSize } from '@/lib/utils'
import { initialsOf } from '@/lib/initials'
import type { DemoFolder, DemoFile } from '@/lib/demo/static-demo-data'
import { DELIVERABLE_ACTORS, type DeliverableStatus } from '@/lib/demo/demo-deliverables'

export const MIME_BY_TYPE: Record<string, string> = {
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
/** Who added each file, as the app's Created by column shows it: one of the team, the same on every visit. */
const creatorOf = (id: string) => DELIVERABLE_ACTORS[Array.from(id).reduce((n, c) => n + c.charCodeAt(0), 0) % DELIVERABLE_ACTORS.length]
const NOT_IN_DEMO = 'Not available in this demo'
const STAGES: DeliverableStatus[] = ['to_do', 'in_progress', 'in_review', 'approved']

/** Every file inside a folder, at any depth. */
function filesIn(folder: DemoFolder): DemoFile[] {
    return [...folder.files, ...folder.subfolders.flatMap(filesIn)]
}

/** The toolbar's quiet icons, as engagement-file-list.tsx draws them: 28px, no border, a 14px glyph. */
const TOOLBAR_ICON_CLASS =
    'inline-flex h-7 w-7 items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg [&_svg]:h-3.5 [&_svg]:w-3.5'

/** A bulk action in the selection bar, as engagement-file-list.tsx draws it. */
const SELECTION_ACTION_CLASS =
    'inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-control px-2 text-small text-fg transition-colors hover:bg-surface-hover'

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

/** As document-action-menu.tsx's COMPACT_MENU_CLASS: 13px text, 26px rows, 14px icons, submenus included. */
const COMPACT_MENU_CLASS =
    '[&_[role=menuitem]]:py-1 [&_[role=menuitem]]:text-small [&_[role=menuitem]_svg]:h-3.5 [&_[role=menuitem]_svg]:w-3.5'

const TYPE_LABEL: Record<string, string> = {
    pdf: 'PDF', doc: 'Document', docx: 'Document', md: 'Document', sheet: 'Spreadsheet', xlsx: 'Spreadsheet',
    slide: 'Presentation', pptx: 'Presentation', jpg: 'Image', jpeg: 'Image', png: 'Image', zip: 'Archive',
}

/** A menu row that does nothing in the demo; the menu stays open so the whole menu can be read. */
function DemoMenuItem({ icon, children, danger = false, accent = false }: { icon: React.ReactNode; children: React.ReactNode; danger?: boolean; accent?: boolean }) {
    return (
        <DropdownMenuItem onSelect={(e) => e.preventDefault()} className={cn('flex cursor-pointer items-center gap-2', danger && 'text-danger focus:text-danger', accent && 'text-primary focus:text-primary')}>
            <span className={cn('flex shrink-0', danger ? 'text-danger' : accent ? 'text-primary' : 'text-fg-muted')}>{icon}</span>
            {children}
        </DropdownMenuItem>
    )
}

function DemoSubmenu({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
    return (
        <DropdownMenuSub>
            <DropdownMenuSubTrigger className="flex cursor-pointer items-center gap-2">
                <span className="flex shrink-0 text-fg-muted">{icon}</span>
                <span>{label}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-max min-w-48 max-w-72">{children}</DropdownMenuSubContent>
        </DropdownMenuSub>
    )
}

/**
 * Static counterpart to document-action-menu.tsx, which can't run here (it needs a signed-in session):
 * the same compact header and the same items, grouped the same way, for a file or a folder. Every
 * action is inert.
 */
function RowActionMenu({ entry, name, docId, deliverableStatus, dueDate, onSetDue }: {
    entry: Entry
    name: string
    docId?: string | null
    deliverableStatus?: DeliverableStatus
    dueDate?: string | null
    /** Due is the one action that works on the tour: it sets the row's Due cell. */
    onSetDue: (next: string | null) => void
}) {
    const [open, setOpen] = useState(false)
    const isFolder = entry.kind === 'folder'
    const due = readDue(dueDate)
    const type = isFolder ? 'Folder' : TYPE_LABEL[entry.file.type] ?? 'File'
    const size = isFolder ? undefined : entry.file.size
    const modified = isFolder ? undefined : entry.file.modifiedTime
    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <Hint label="More actions">
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        data-demo-tour="document-action-trigger"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-control text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg data-[state=open]:bg-surface-hover data-[state=open]:text-fg"
                        aria-label={`Actions for ${name}`}
                    >
                        <MoreVertical className="h-4 w-4" />
                    </button>
                </DropdownMenuTrigger>
            </Hint>
            <DropdownMenuContent align="end" sideOffset={0} className={cn('flex w-72 flex-col overflow-hidden p-0', COMPACT_MENU_CLASS)} onClick={(e) => e.stopPropagation()}>
                <div className="flex-none border-b border-line px-3 py-2">
                    {/* As in the app: two lines — the name on one, then code, stage, type, size and who/when */}
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-surface-muted">
                            {isFolder
                                ? deliverableStatus ? <DeliverableIcon /> : <Folder className="h-4 w-4 fill-surface-muted text-fg-muted" />
                                : <DocumentIcon mimeType={MIME_BY_TYPE[entry.file.type] ?? 'application/octet-stream'} className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1">
                                <Hint label={name} side="bottom">
                                    <h3 className="min-w-0 cursor-default truncate text-small font-medium leading-snug text-fg">{name}</h3>
                                </Hint>
                                <Hint label={NOT_IN_DEMO}>
                                    <button type="button" aria-label="Copy name" className="shrink-0 rounded-control p-0.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg">
                                        <Copy className="h-3 w-3" />
                                    </button>
                                </Hint>
                            </div>
                            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-caption text-fg-muted">
                                {docId && <span className="shrink-0 font-mono text-caption text-fg-subtle">{docId}</span>}
                                {deliverableStatus && <StatusPill kind="deliverable" status={deliverableStatus} />}
                                <span className="min-w-0 truncate">{type}{size ? <> · {formatFileSize(size)}</> : null}</span>
                                {modified && <ModifiedStamp at={modified} by={OWNER} className="ml-auto pl-1" />}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="min-h-0 overflow-y-auto p-1">
                    {isFolder ? (
                        <>
                            <DemoMenuItem icon={<Link2 />}>Copy link</DemoMenuItem>
                            {deliverableStatus
                                ? <DemoMenuItem icon={<FolderMinus />} danger>Demote Deliverable to Folder</DemoMenuItem>
                                : <DemoMenuItem icon={<FolderPlus />} accent>Promote Folder to Deliverable</DemoMenuItem>}
                            <DemoSubmenu icon={<FolderOpen />} label="Organize">
                                <DemoMenuItem icon={<Edit3 />}>Rename</DemoMenuItem>
                                <DemoMenuItem icon={<FolderInput />}>Move to…</DemoMenuItem>
                                <DropdownMenuSeparator />
                                <DemoMenuItem icon={<FolderLock />}>Make private</DemoMenuItem>
                            </DemoSubmenu>
                            <DropdownMenuSeparator />
                            <DemoSubmenu icon={<ExternalLink />} label="Drive actions">
                                <DemoMenuItem icon={<ExternalLink />}>Open folder in Drive UI</DemoMenuItem>
                            </DemoSubmenu>
                        </>
                    ) : (
                        <>
                            <DemoMenuItem icon={<Eye />}>Open</DemoMenuItem>
                            <DemoMenuItem icon={<Link2 />}>Copy link</DemoMenuItem>
                            <DemoMenuItem icon={<Download />}>Download</DemoMenuItem>
                            <DemoMenuItem icon={<MessagesSquare />}>Comment</DemoMenuItem>
                            <DropdownMenuSeparator />
                            <DemoMenuItem icon={<Bookmark />}>Bookmark</DemoMenuItem>
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger className="flex cursor-pointer items-center gap-2">
                                    <span className="flex shrink-0 text-fg-muted"><Calendar /></span>
                                    <span className="flex flex-1 items-center">
                                        Due
                                        <span className={cn('ml-auto pl-3 tabular-nums', due && isPastDue(due) ? 'text-danger' : 'text-fg-subtle')}>{due ? formatDue(due) : 'Not set'}</span>
                                    </span>
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent className="w-auto p-0" sideOffset={6}>
                                    <DuePickerPanel
                                        value={dueDate ?? null}
                                        allowTime
                                        label="Due"
                                        onCommit={(next, close) => {
                                            onSetDue(next)
                                            if (close) setOpen(false)
                                        }}
                                    />
                                </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            <DropdownMenuSeparator />
                            <DemoSubmenu icon={<FolderOpen />} label="Organize">
                                <DemoMenuItem icon={<Edit3 />}>Rename</DemoMenuItem>
                                <DemoMenuItem icon={<CopyPlus />}>Duplicate</DemoMenuItem>
                                <DemoMenuItem icon={<Copy />}>Copy to…</DemoMenuItem>
                                <DemoMenuItem icon={<FolderInput />}>Move to…</DemoMenuItem>
                                <DropdownMenuSeparator />
                                <DemoMenuItem icon={<Briefcase />}>Copy to another engagement…</DemoMenuItem>
                                <DropdownMenuSeparator />
                                <DemoMenuItem icon={<FolderLock />}>Make private</DemoMenuItem>
                            </DemoSubmenu>
                            <DemoSubmenu icon={<Info />} label="Details">
                                <DemoMenuItem icon={<Info />}>File information</DemoMenuItem>
                                <DemoMenuItem icon={<Clock />}>Activity stream</DemoMenuItem>
                                <DemoMenuItem icon={<Clock />}>Version history</DemoMenuItem>
                            </DemoSubmenu>
                            <DemoSubmenu icon={<ExternalLink />} label="Drive actions">
                                <DemoMenuItem icon={<ExternalLink />}>Open containing folder in Google Drive</DemoMenuItem>
                            </DemoSubmenu>
                        </>
                    )}
                    <DropdownMenuSeparator />
                    <DemoMenuItem icon={<Trash2 />} danger>Move to trash</DemoMenuItem>
                    <p className="px-2 pb-1 pt-1.5 text-caption text-fg-subtle">Due works here; the other actions aren&apos;t available in this demo.</p>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

type Entry = { kind: 'folder'; folder: DemoFolder } | { kind: 'file'; file: DemoFile }

const entryId = (entry: Entry) => (entry.kind === 'folder' ? entry.folder.id : entry.file.id)

/** Static counterpart to engagement-file-row.tsx: the same grid, cells and quick actions. */
function EntryRow({
    entry,
    onOpenFolder,
    deliverableStatus,
    dueDate,
    tracked,
    inside = false,
    pinTools = false,
    selected,
    onToggleSelect,
    onSetDue,
    status,
    statusEditable,
    onSetStatus,
    uploadTarget = false,
    onFileDragOver,
    onFileDrop,
}: {
    entry: Entry
    onOpenFolder?: () => void
    deliverableStatus?: DeliverableStatus
    dueDate?: string | null
    /** A deliverable, or a document inside one: an empty Status or Due reads "Not set", not a dash. */
    tracked: boolean
    /** Inside a deliverable: a folder here wears the lighter folder-plus, though it has no Status or Due. */
    inside?: boolean
    /** The first row keeps its tools showing: the guided tour points at its ⋯, which would otherwise wait for a hover. */
    pinTools?: boolean
    selected: boolean
    onToggleSelect: () => void
    onSetDue: (next: string | null) => void
    /** The row's own stage: the deliverable's, or a document's inside one. */
    status: DeliverableStatus | null
    /** As in the app: changeable on tracked rows until their deliverable is approved. */
    statusEditable: boolean
    onSetStatus: (next: DeliverableStatus) => void
    /** Files from the computer dragged over this folder row would land in it (the drop zone, as in the app). */
    uploadTarget?: boolean
    onFileDragOver?: (e: React.DragEvent) => void
    onFileDrop?: (e: React.DragEvent) => void
}) {
    const isFolder = entry.kind === 'folder'
    const docId = isFolder ? entry.folder.docId : entry.file.docId
    const creator = creatorOf(entryId(entry))
    const name = isFolder ? entry.folder.name.replace(/_+/g, ' ').trim() : entry.file.name
    const approved = deliverableStatus === 'approved'
    const empty = <span className="text-small text-fg-subtle">{tracked ? 'Not set' : '—'}</span>

    return (
        <div
            onDragOver={onFileDragOver}
            onDrop={onFileDrop}
            className={`${FILE_TABLE_GRID_COLS_CLASS} ${cn(
                'group relative grid h-[34px] cursor-default items-center gap-4 overflow-hidden pl-1 pr-2 text-ui transition-colors',
                selected ? 'bg-surface-selected' : approved ? 'bg-action/5 hover:bg-action/10' : 'hover:bg-surface-hover',
                uploadTarget && `${FILES_DROP_TARGET_ROW_CLASS} z-[1]`,
            )}`}
        >
            {uploadTarget && (
                <span className="pointer-events-none absolute right-3 top-1/2 z-10 inline-flex -translate-y-1/2 items-center gap-1 rounded-full bg-action px-2 py-0.5 text-caption text-action-fg">
                    <Upload className="h-3 w-3" aria-hidden />
                    Drop here
                </span>
            )}
            <div
                className="flex h-4 w-4 flex-shrink-0 cursor-pointer items-center justify-center"
                onClick={(e) => {
                    e.stopPropagation()
                    onToggleSelect()
                }}
            >
                <Checkbox checked={selected} className="pointer-events-none h-4 w-4" />
            </div>

            {/* As in the app: a folder opens from its ID and Name cells only, not from the value cells */}
            <div className={cn('flex min-w-0 items-center', isFolder && 'cursor-pointer')} onClick={isFolder ? onOpenFolder : undefined}>
                <span className="truncate text-small tabular-nums text-fg-muted">{docId}</span>
            </div>

            {/* Name spans the badge and tool tracks, as in the app: the name runs on into the space the tools leave */}
            <div className={cn('col-span-3 flex min-w-0 items-center gap-3', isFolder && 'cursor-pointer', FILE_TABLE_COL_LINE_CLASS)} onClick={isFolder ? onOpenFolder : undefined}>
                <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
                    {/* As in the app: deliverable folders and the folders inside one wear folder-plus; documents keep their type icons */}
                    {isFolder ? (
                        deliverableStatus ? <DeliverableIcon hint /> : inside ? <DeliverableIcon hint inside /> : <Folder className="h-4 w-4 fill-surface-muted text-fg-muted" />
                    ) : (
                        <DocumentIcon mimeType={MIME_BY_TYPE[entry.file.type] ?? 'application/octet-stream'} className="h-4 w-4" />
                    )}
                </span>
                <span className={cn('min-w-0 flex-1 truncate text-fg', isFolder && 'hover:underline')}>{name}</span>
                {/* The deliverable marker steps aside once the Status column has room to say it. */}
                {deliverableStatus && (
                    <Hint label={approved ? 'Deliverable — approved' : 'Deliverable'}>
                        <span className={cn('inline-flex shrink-0 items-center @[49rem]/file-table:hidden', approved ? 'text-action' : 'text-fg-subtle')}>
                            <FolderPlus className="h-3.5 w-3.5" />
                        </span>
                    </Hint>
                )}

                {/* Row tools on hover or focus (always on touch screens), and while the row is in use; at rest they take no width */}
                <div
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                        'flex shrink-0 items-center justify-end gap-0.5 transition-opacity duration-ui-fast',
                        !selected && !pinTools && 'max-w-0 overflow-hidden opacity-0 focus-within:max-w-none focus-within:opacity-100 group-hover:max-w-none group-hover:opacity-100 has-[[data-state=open]]:max-w-none has-[[data-state=open]]:opacity-100 [@media(hover:none)]:max-w-none [@media(hover:none)]:opacity-100',
                    )}
                >
                    {!isFolder && <QuickAction icon={<ScanEye />} label="Preview" />}
                    <QuickAction icon={<Link2 />} label="Copy link" />
                    <RowActionMenu entry={entry} name={name} docId={docId} deliverableStatus={deliverableStatus} dueDate={dueDate} onSetDue={onSetDue} />
                </div>
            </div>

            <div className={`min-w-0 items-center ${STATUS_COL_CLASS} ${FILE_TABLE_COL_LINE_CLASS}`}>
                {statusEditable ? (
                    <StatusProperty
                        kind="deliverable"
                        value={status}
                        placeholder={tracked ? 'Not set' : '—'}
                        // The tour's visitor is the engagement lead, so the lead's moves (as on the tour's Board).
                        options={STAGES.filter((s) => s === status || getAllowedTransitions('eng_admin', status ?? 'to_do').includes(s))}
                        onChange={(next) => onSetStatus(next as DeliverableStatus)}
                    />
                ) : status ? <StatusPill kind="deliverable" status={status} /> : empty}
            </div>

            <div className={`items-center ${DUE_DATE_COL_CLASS} ${FILE_TABLE_COL_LINE_CLASS}`}>
                {/* As in the app: files and deliverable folders take a Due; other folders have none */}
                {!isFolder || deliverableStatus ? (
                    <DateProperty value={dueDate ?? null} onChange={onSetDue} placeholder={tracked ? 'Not set' : '—'} highlightOverdue allowTime={!isFolder} compact chip />
                ) : empty}
            </div>

            <div className={`min-w-0 items-center gap-1.5 ${OWNER_COL_CLASS} ${FILE_TABLE_COL_LINE_CLASS}`}>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[9px] font-medium text-fg-muted">{initialsOf(creator)}</span>
                <span className="truncate text-fg-muted">{creator}</span>
            </div>

            <div className={`items-center ${DATE_MODIFIED_COL_CLASS} ${FILE_TABLE_COL_LINE_CLASS}`}>
                {!isFolder ? (
                    <RelativeDateTime date={entry.file.modifiedTime} textClassName="text-ui text-fg-muted" iconClassName="hidden" tooltipSide="top" />
                ) : (
                    <span className="text-fg-subtle">—</span>
                )}
            </div>

            <div className={`items-center ${FILE_SIZE_COL_CLASS} ${FILE_TABLE_COL_LINE_CLASS}`}>
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
 * Static counterpart to engagement-file-list.tsx + engagement-file-row.tsx: the same two-row toolbar
 * (breadcrumb and count, filter pills, quiet icons), selection bar and table (shared grid, collapsing
 * columns, Status and Due). Folder navigation, selection and the Deliverables toggle work; the other
 * filters and every action are inert. Top-level deliverable folders carry the Board's status and due date.
 */
export function DemoFileList({
    folders,
    deliverableStatusByFolderId,
    deliverableDueByFolderId,
}: {
    folders: DemoFolder[]
    deliverableStatusByFolderId?: Record<string, DeliverableStatus>
    deliverableDueByFolderId?: Record<string, string | null>
}) {
    const [path, setPath] = useState<DemoFolder[]>([])
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [deliverablesOnly, setDeliverablesOnly] = useState(false)
    // Due dates and stages set on the tour, by row: the edits the demo keeps (until the page reloads).
    const [dueOverrides, setDueOverrides] = useState<Record<string, string | null>>({})
    const [statusOverrides, setStatusOverrides] = useState<Record<string, DeliverableStatus>>({})
    const { addToast } = useToast()
    // The drop zone, as in the app (components/projects/files-drop-zone.tsx): files dropped on the list, or
    // on a folder row, or picked with Browse, are added on screen only; the tour uploads nothing.
    const [added, setAdded] = useState<Record<string, DemoFile[]>>({})
    const [drag, setDrag] = useState<{ count: number; target: DemoFolder | null } | null>(null)
    const browseRef = useRef<HTMLInputElement>(null)
    const addedCount = useRef(0)
    const statusFor = (entry: Entry): DeliverableStatus | null => {
        const id = entryId(entry)
        return statusOverrides[id] ?? (entry.kind === 'folder' ? deliverableStatusByFolderId?.[id] ?? null : null)
    }
    const deliverableApproved = path.length > 0 && (statusOverrides[path[0].id] ?? deliverableStatusByFolderId?.[path[0].id]) === 'approved'
    // As in the app (and the Board): a deliverable isn't approved while a document inside it isn't.
    const setStatus = (entry: Entry, next: DeliverableStatus) => {
        if (next === 'approved' && entry.kind === 'folder') {
            const unapproved = filesIn(entry.folder).filter((f) => statusOverrides[f.id] !== 'approved').length
            if (unapproved > 0) {
                addToast({ type: 'error', title: 'Cannot approve yet', message: `${unapproved} document${unapproved > 1 ? 's' : ''} still need to be approved before this deliverable can be approved.` })
                return
            }
        }
        setStatusOverrides((prev) => ({ ...prev, [entryId(entry)]: next }))
        const name = entry.kind === 'folder' ? entry.folder.name.replace(/_+/g, ' ').trim() : entry.file.name
        addToast({ type: 'success', title: next === 'approved' ? 'Approved' : 'Stage updated', message: `${name} · ${statusOf('deliverable', next).label}` })
    }

    const here = path.length > 0 ? path[path.length - 1] : null
    const allFolders = path.length === 0 ? folders : path[path.length - 1].subfolders
    const allFiles = here ? [...here.files, ...(added[here.id] ?? [])] : []
    // As in the app: no uploads at the engagement's top level, or into an approved deliverable.
    const canUpload = !!here && !deliverableApproved
    const isApproved = (folder: DemoFolder) => (statusOverrides[folder.id] ?? deliverableStatusByFolderId?.[folder.id]) === 'approved'
    const shownName = (folder: DemoFolder) => folder.name.replace(/_+/g, ' ').trim()
    const addFiles = (list: FileList, into: DemoFolder) => {
        const prefix = into.docId.split('-')[0]
        const made: DemoFile[] = Array.from(list).map((file) => {
            addedCount.current += 1
            return {
                id: `tour-upload-${addedCount.current}`,
                docId: `${prefix}-${900 + addedCount.current}`,
                name: file.name,
                type: file.name.split('.').pop()?.toLowerCase() ?? '',
                modifiedTime: new Date().toISOString(),
                size: file.size,
            }
        })
        if (made.length === 0) return
        setAdded((prev) => ({ ...prev, [into.id]: [...(prev[into.id] ?? []), ...made] }))
        addToast({ type: 'success', title: 'Added on screen', message: `${made.length} file${made.length > 1 ? 's' : ''} added to ${shownName(into)}. The tour doesn't upload anything.` })
    }
    const isFileDrag = (e: React.DragEvent) => e.dataTransfer.types.includes('Files')
    const onListDragOver = (e: React.DragEvent) => {
        if (!canUpload || !isFileDrag(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setDrag({ count: e.dataTransfer.items.length, target: null })
    }
    const onRowDragOver = (e: React.DragEvent, entry: Entry) => {
        if (!canUpload || !isFileDrag(e)) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'copy'
        setDrag({ count: e.dataTransfer.items.length, target: entry.kind === 'folder' && !isApproved(entry.folder) ? entry.folder : null })
    }
    const onDropFiles = (e: React.DragEvent, target: DemoFolder | null) => {
        if (!isFileDrag(e)) return
        e.preventDefault()
        e.stopPropagation()
        setDrag(null)
        if (canUpload && here) addFiles(e.dataTransfer.files, target ?? here)
    }
    // Deliverables: the deliverable folders at the top, and everything inside one.
    const insideDeliverable = path.length > 0 && !!deliverableStatusByFolderId?.[path[0].id]
    const currentFolders = !deliverablesOnly || insideDeliverable
        ? allFolders
        : path.length === 0 ? allFolders.filter((f) => deliverableStatusByFolderId?.[f.id]) : []
    const currentFiles = !deliverablesOnly || insideDeliverable ? allFiles : []
    const itemCount = currentFolders.length + currentFiles.length
    const totalCount = allFolders.length + allFiles.length
    const entries: Entry[] = [
        ...currentFolders.map((folder) => ({ kind: 'folder' as const, folder })),
        ...currentFiles.map((file) => ({ kind: 'file' as const, file })),
    ]
    const allSelected = entries.length > 0 && entries.every((e) => selected.has(entryId(e)))

    const toggle = (id: string) =>
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    // How many are here, on the crumb for here, as in the app; "2 of 5" while a filter narrows them
    const countChip = totalCount > 0 ? (
        <span
            className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-surface px-1 text-[11px] font-medium leading-none tabular-nums text-fg-muted shadow-[inset_0_0_0_1px_var(--ui-line)]"
            aria-label={itemCount === totalCount ? `${totalCount} items` : `${itemCount} of ${totalCount} items`}
        >
            {itemCount === totalCount ? totalCount : `${itemCount} of ${totalCount}`}
        </span>
    ) : null
    const openFolder = (next: DemoFolder[]) => {
        setSelected(new Set())
        setPath(next)
    }

    // Esc clears a selection, as in the app.
    useEffect(() => {
        if (selected.size === 0) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || e.defaultPrevented) return
            if (document.querySelector('[role="dialog"], [role="menu"]')) return
            setSelected(new Set())
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [selected.size])

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            {/* Two rows: where you are and how many, then the filters with the quiet icons at the end; the selection bar takes the second row while selecting */}
            <div className="flex shrink-0 flex-col gap-2 pb-2">
                <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-fg-muted">
                    <div className="flex min-w-0 items-center">
                        <button
                            type="button"
                            onClick={() => openFolder([])}
                            className={cn('flex items-center gap-1.5 rounded-control px-1.5 py-1 transition-colors hover:bg-surface-hover', path.length === 0 ? 'bg-surface-subtle text-fg' : 'text-fg-muted')}
                            aria-label="Files root"
                        >
                            <Briefcase className="h-3.5 w-3.5 text-fg-subtle" />
                            {path.length === 0 && countChip}
                        </button>
                        {path.map((folder, i) => (
                            <div key={folder.id} className="flex min-w-0 items-center">
                                <ChevronRight className="mx-0.5 h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                                <button
                                    type="button"
                                    onClick={() => openFolder(path.slice(0, i + 1))}
                                    className={cn(
                                        'flex min-w-0 items-center gap-1.5 rounded-control px-1.5 py-1 transition-colors hover:bg-surface-hover',
                                        i === path.length - 1 ? 'max-w-[220px] bg-surface-subtle text-fg' : 'max-w-[200px] text-fg-muted',
                                    )}
                                >
                                    {/* As in the app: a deliverable crumb, or one inside a deliverable, wears folder-plus */}
                                    {insideDeliverable
                                        ? <DeliverableIcon inside={i > 0} className="h-3.5 w-3.5" />
                                        : <Folder className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />}
                                    <span className="truncate">{folder.name.replace(/_+/g, ' ').trim()}</span>
                                    {i === path.length - 1 && countChip}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {selected.size > 0 ? (
                    <div role="toolbar" aria-label={`${selected.size} selected`} className="flex h-8 min-w-0 items-center gap-0.5">
                        <span className="mr-1.5 whitespace-nowrap text-small font-medium tabular-nums text-fg">{selected.size} selected</span>
                        <span aria-hidden className="mr-1 h-4 w-px bg-line-strong" />
                        <Hint label={NOT_IN_DEMO}>
                            <button type="button" className={SELECTION_ACTION_CLASS}>
                                <Download className="h-3.5 w-3.5 text-fg-muted" />
                                Download
                            </button>
                        </Hint>
                        <Hint label={NOT_IN_DEMO}>
                            <button type="button" className={cn(SELECTION_ACTION_CLASS, 'text-danger hover:text-danger')}>
                                <Trash2 className="h-3.5 w-3.5" />
                                Move to trash
                            </button>
                        </Hint>
                        <span className="flex-1" />
                        <button type="button" onClick={() => setSelected(new Set())} className={cn(SELECTION_ACTION_CLASS, 'text-fg-muted')}>
                            Clear
                            <kbd className="rounded-control border border-line px-1 font-sans text-caption text-fg-subtle">Esc</kbd>
                        </button>
                    </div>
                ) : (
                    <div className="flex min-h-8 items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <FilterPill
                                icon={<FolderPlus />}
                                label="Deliverables"
                                pressed={deliverablesOnly}
                                onClick={() => {
                                    setSelected(new Set())
                                    setDeliverablesOnly((v) => !v)
                                }}
                            />
                            <Hint label="Filters aren't available in this demo" side="bottom">
                                <div className="flex items-center gap-1.5">
                                    <FilterPill icon={<FileText />} label="Type" />
                                    <FilterPill icon={<User />} label="People" />
                                    <FilterPill icon={<Clock3 />} label="Modified" />
                                    <FilterPill icon={<ArrowDownUp />} label="Sort" />
                                </div>
                            </Hint>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                            <Hint label={NOT_IN_DEMO} side="bottom">
                                <button type="button" aria-label="Search engagement files" className={TOOLBAR_ICON_CLASS}><Search /></button>
                            </Hint>
                            <Hint label={NOT_IN_DEMO} side="bottom">
                                <button type="button" aria-label="Refresh list" className={TOOLBAR_ICON_CLASS}><RefreshCw /></button>
                            </Hint>
                        </div>
                    </div>
                )}
            </div>

            <div className={`relative flex min-h-0 flex-1 flex-col ${FILE_TABLE_CONTAINER_CLASS}`}>
                {drag && here && <FilesDropPill count={drag.count} folderName={shownName(drag.target ?? here)} />}
                <div className="sticky top-0 z-10 flex h-[34px] shrink-0 flex-col justify-center overflow-hidden border-y border-line bg-surface pl-1 pr-2">
                    <div className={`grid items-center gap-4 ${FILE_TABLE_GRID_COLS_CLASS}`}>
                        <div
                            className="flex h-4 w-4 cursor-pointer items-center justify-center"
                            onClick={() => setSelected(allSelected ? new Set() : new Set(entries.map(entryId)))}
                        >
                            <Checkbox checked={allSelected} className="pointer-events-none h-4 w-4" />
                        </div>
                        <div className="flex items-center"><TableHeader label="ID" icon={<Hash />} /></div>
                        <div className={`col-span-3 flex items-center ${FILE_TABLE_COL_LINE_CLASS}`}><TableHeader label="Name" icon={<Type />} /></div>
                        <div className={`items-center ${STATUS_COL_CLASS} ${FILE_TABLE_COL_LINE_CLASS}`}><TableHeader label="Status" icon={<CircleDot />} /></div>
                        <div className={`items-center ${DUE_DATE_COL_CLASS} ${FILE_TABLE_COL_LINE_CLASS}`}><TableHeader label="Due" icon={<Flag />} /></div>
                        <div className={`items-center ${OWNER_COL_CLASS} ${FILE_TABLE_COL_LINE_CLASS}`}><TableHeader label="Created by" icon={<UserRound />} /></div>
                        <div className={`items-center ${DATE_MODIFIED_COL_CLASS} ${FILE_TABLE_COL_LINE_CLASS}`}><TableHeader label="Modified" icon={<Clock3 />} /></div>
                        <div className={`items-center ${FILE_SIZE_COL_CLASS} ${FILE_TABLE_COL_LINE_CLASS}`}><TableHeader label="Size" icon={<HardDrive />} /></div>
                    </div>
                </div>

                <div
                    onDragOver={onListDragOver}
                    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(null) }}
                    onDrop={(e) => onDropFiles(e, null)}
                    className={cn('flex-1 overflow-y-auto', drag && !drag.target && FILES_DROP_ZONE_ACTIVE_CLASS)}
                >
                    <div className="divide-y divide-line [&>.group:last-child]:border-b [&>.group:last-child]:border-line">
                    {entries.map((entry, index) => {
                        const id = entryId(entry)
                        return (
                            <EntryRow
                                key={id}
                                entry={entry}
                                onOpenFolder={entry.kind === 'folder' ? () => openFolder([...path, entry.folder]) : undefined}
                                deliverableStatus={entry.kind === 'folder' ? (statusOverrides[id] ?? deliverableStatusByFolderId?.[id]) : undefined}
                                status={statusFor(entry)}
                                // As in the app: the deliverable and its documents have a Status; the folders inside it only organize it
                                statusEditable={(entry.kind === 'file' && insideDeliverable && !deliverableApproved) || (entry.kind === 'folder' && !!deliverableStatusByFolderId?.[id] && statusFor(entry) !== 'approved')}
                                onSetStatus={(next) => setStatus(entry, next)}
                                dueDate={id in dueOverrides ? dueOverrides[id] : entry.kind === 'folder' ? deliverableDueByFolderId?.[id] : null}
                                onSetDue={(next) => setDueOverrides((prev) => ({ ...prev, [id]: next }))}
                                tracked={(entry.kind === 'file' && insideDeliverable) || (entry.kind === 'folder' && !!deliverableStatusByFolderId?.[id])}
                                inside={insideDeliverable}
                                pinTools={index === 0}
                                selected={selected.has(id)}
                                onToggleSelect={() => toggle(id)}
                                uploadTarget={!!drag?.target && drag.target.id === id}
                                onFileDragOver={(e) => onRowDragOver(e, entry)}
                                onFileDrop={(e) => onDropFiles(e, entry.kind === 'folder' && !isApproved(entry.folder) ? entry.folder : null)}
                            />
                        )
                    })}
                    {itemCount === 0 && (
                        <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
                            <Folder className="h-6 w-6 text-fg-subtle" />
                            <p className="text-small text-fg-muted">{deliverablesOnly && totalCount > 0 ? 'No deliverables in this folder' : 'This folder is empty'}</p>
                        </div>
                    )}
                    </div>
                    {canUpload && here && itemCount > 0 && (
                        <FilesDropRow
                            state={!drag ? 'idle' : drag.target ? 'elsewhere' : 'here'}
                            folderName={shownName(here)}
                            onBrowse={() => browseRef.current?.click()}
                        />
                    )}
                    <input
                        ref={browseRef}
                        type="file"
                        multiple
                        hidden
                        onChange={(e) => {
                            if (e.target.files && here) addFiles(e.target.files, here)
                            e.target.value = ''
                        }}
                    />
                </div>
            </div>
        </div>
    )
}
