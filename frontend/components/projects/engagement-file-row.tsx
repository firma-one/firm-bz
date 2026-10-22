'use client'

import React from 'react'
import {
    Folder,
    Share2,
    Lock,
    FolderLock,
    FolderUp,
    Link2,
    ScanEye,
    MoreVertical,
    CircleChevronLeft,
    Loader2,
    Bookmark,
    FolderPlus,
} from 'lucide-react'
import { DocumentIcon } from '@/components/ui/document-icon'
import { SharedFolderIcon } from '@/components/ui/folder-shared-icon'
import { DeliverableIcon } from '@/components/ui/deliverable-icon'
import { DocumentActionMenu } from '@/components/ui/document-action-menu'
import { ProfileBubbleWithPopup } from '@/components/ui/profile-bubble-popup'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import { DateProperty, StatusProperty } from '@/components/ui/property-cells'
import { getAllowedTransitions, type EngagementRoleSlug } from '@/lib/deliverable-stage-roles'
import { statusOf } from '@/lib/ui/status'
import type { ActivityStatus } from '@/lib/sharing-settings'
import { Checkbox } from '@/components/ui/checkbox'
import { StatusPill } from '@/components/ui/status-pill'
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { formatFileSize } from '@/lib/utils'
import { DriveFile } from '@/lib/types'
import {
    FILE_TABLE_GRID_COLS_CLASS,
    STATUS_COL_CLASS,
    OWNER_COL_CLASS,
    DATE_MODIFIED_COL_CLASS,
    DUE_DATE_COL_CLASS,
    FILE_SIZE_COL_CLASS,
    FILE_TABLE_COL_LINE_CLASS,
} from '@/components/projects/engagement-file-table-grid'

export interface EngagementFileRowProps {
    file: DriveFile
    // Selection
    isSelected: boolean
    selectedFileIdsSize: number
    onToggleSelect: (fileId: string) => void
    // Active pane tracking
    activeCommentDocId: string | null
    activeInfoDocId: string | null
    activeActivityDocId: string | null
    activeVersionDocId: string | null
    activePreviewDocId: string | null
    // Highlight
    highlightedFileId: string | null
    onClearHighlight: () => void
    // Drag & drop
    draggedItem: DriveFile | null
    dragOverFolderId: string | null
    canEdit: boolean
    loading: boolean
    onDragStart: (e: React.DragEvent, item: DriveFile) => void
    onDragEnd: () => void
    onDragOver: (e: React.DragEvent, targetFolder: DriveFile) => void
    onDragLeave: (e: React.DragEvent) => void
    onDrop: (e: React.DragEvent, targetFolder: DriveFile) => void
    // Click handlers
    onItemClick: (file: DriveFile) => void
    // Permissions
    isProjectLead: boolean
    restrictToSharedOnly: boolean
    viewAsPersonaSlug: string | null | undefined
    canManage: boolean
    currentFolderType: 'general' | 'confidential' | 'staging'
    generalFolderId: string | null
    projectId: string
    orgSlug?: string
    // Current session user
    sessionUserEmail?: string
    // Shared IDs
    sharedExternalIds: Set<string>
    ancestorFolderIds: Set<string>
    sharedExternalIdsForEC: Set<string>
    ancestorFolderIdsForEC: Set<string>
    sharedExternalIdsForGuest: Set<string>
    ancestorFolderIdsForGuest: Set<string>
    descendantIds: Set<string>
    descendantIdsForEC: Set<string>
    descendantIdsForGuest: Set<string>
    // Action menu state
    isActionMenuOpen: boolean
    onActionMenuOpenChange: (open: boolean) => void
    // Processing
    processingFileIds: Set<string>
    isRegrantingId: string | null
    // File operation handlers
    onOpenComments: (file: DriveFile) => void
    onOpenRename: (doc: DriveFile) => void
    onDuplicate: (doc: DriveFile) => void
    onOpenCopyMove: (doc: DriveFile, action: 'copy' | 'move') => void
    onOpenCrossEngagement: (doc: DriveFile) => void
    onTrash: (doc: DriveFile) => void
    onPrivacy: (file: DriveFile, makePrivate: boolean) => void
    onShareSaved: () => void
    onMarkAsDeliverable?: (doc: any) => void
    onUntagAsDeliverable?: (doc: any) => void
    onUnlockConfirm: (file: DriveFile) => void
    onOpenDocument: (doc: DriveFile) => void
    onOpenCommentPane: (docId: string) => void
    onOpenInfoPane: (docId: string) => void
    onOpenActivityPane: (docId: string) => void
    onOpenVersionPane: (docId: string) => void
    onOpenPreviewPane: (docId: string) => void
    onAddToast: (toast: { type: string; title: string; message: string }) => void
    /** Connector account email — passed to DocumentActionMenu for Google Drive authuser param. */
    connectorAccountEmail?: string | null
    /** True when the client's connector is OneDrive — passed to DocumentActionMenu to pick the
     *  correct provider icon/URL for "Open folder in Drive UI". */
    isOneDriveClient?: boolean
    /** Bookmark record id if this document is bookmarked by the current user; undefined otherwise. */
    bookmarkId?: string
    /** When true, hides the dynamic badges column (shared/bookmark/intake/lock) to save horizontal space. */
    hideBadges?: boolean
    /** When true, the current folder is an approved deliverable — disable all write operations. */
    isInsideApprovedDeliverable?: boolean
    /** The viewer's engagement role: decides which stages they may move a row to (as on the Board). */
    roleSlug?: EngagementRoleSlug | null
}

export function EngagementFileRow({
    file,
    isSelected,
    selectedFileIdsSize,
    onToggleSelect,
    activeCommentDocId,
    activeInfoDocId,
    activeActivityDocId,
    activeVersionDocId,
    activePreviewDocId,
    highlightedFileId,
    onClearHighlight,
    draggedItem,
    dragOverFolderId,
    canEdit,
    loading,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
    onItemClick,
    isProjectLead,
    restrictToSharedOnly,
    viewAsPersonaSlug,
    canManage,
    currentFolderType,
    generalFolderId,
    projectId,
    orgSlug,
    sessionUserEmail,
    sharedExternalIds,
    ancestorFolderIds,
    sharedExternalIdsForEC,
    ancestorFolderIdsForEC,
    sharedExternalIdsForGuest,
    ancestorFolderIdsForGuest,
    descendantIds,
    descendantIdsForEC,
    descendantIdsForGuest,
    isActionMenuOpen,
    onActionMenuOpenChange,
    processingFileIds,
    isRegrantingId,
    onOpenComments,
    onOpenRename,
    onDuplicate,
    onOpenCopyMove,
    onOpenCrossEngagement,
    onTrash,
    onPrivacy,
    onShareSaved,
    onMarkAsDeliverable,
    onUntagAsDeliverable,
    onUnlockConfirm,
    onOpenDocument,
    onOpenCommentPane,
    onOpenInfoPane,
    onOpenActivityPane,
    onOpenVersionPane,
    onOpenPreviewPane,
    onAddToast,
    connectorAccountEmail,
    isOneDriveClient = false,
    bookmarkId,
    hideBadges = false,
    isInsideApprovedDeliverable = false,
    roleSlug = null,
}: EngagementFileRowProps) {
    const isDeeplinkHighlight = file.id === highlightedFileId
    const isFolder = (file.mimeType ?? (file as { type?: string }).type) === 'application/vnd.google-apps.folder'
    const isIntakeRow = !!file.isPendingApproval
    // isEC/isGuest: covers both genuine EC/EV users (restrictToSharedOnly=true) and admin view-as impersonation
    const isEC = restrictToSharedOnly ? canEdit : viewAsPersonaSlug === 'eng_ext_collaborator'
    const isGuest = restrictToSharedOnly ? !canEdit : viewAsPersonaSlug === 'eng_viewer'
    const showBadge = isGuest
        ? (sharedExternalIdsForGuest.has(file.id) || ancestorFolderIdsForGuest.has(file.id) || descendantIdsForGuest.has(file.id))
        : isEC
            ? (sharedExternalIdsForEC.has(file.id) || ancestorFolderIdsForEC.has(file.id) || descendantIdsForEC.has(file.id))
            : (sharedExternalIds.has(file.id) || ancestorFolderIds.has(file.id) || descendantIds.has(file.id))
    const directShared = isGuest ? sharedExternalIdsForGuest.has(file.id) : isEC ? sharedExternalIdsForEC.has(file.id) : sharedExternalIds.has(file.id)
    // True when a file/folder is visible only because an ancestor folder is shared — not directly shared itself
    const isAncestorShared = !directShared && (isGuest ? descendantIdsForGuest.has(file.id) : isEC ? descendantIdsForEC.has(file.id) : descendantIds.has(file.id))

    const locked = file.lock?.type === 'finalize'
    const isFolderApproved = isFolder && file.isDeliverable && (file as any).deliverableStatus === 'approved'
    const canMutateFile = canEdit && !locked && !isIntakeRow && !isInsideApprovedDeliverable && !isFolderApproved
    const canOrganizeTree = canManage && !locked && !isIntakeRow && !isFolderApproved && !isInsideApprovedDeliverable
    // A deliverable folder's due date is the deliverable's (the Board's); other folders have none.
    const canEditDueDate = canManage && (!isFolder || !!file.isDeliverable) && !isFolderApproved && !locked && !isIntakeRow
    // The Status column shows a deliverable's stage; the row's deliverable badge steps aside while it's visible.
    const hasStatus = !!file.isDeliverable && !!file.deliverableStatus
    // Tracked work: a deliverable, and the documents inside one. An empty Status or Due reads "Not set" there.
    // The folders inside a deliverable only organize it, so they have no Status or Due: a dash, as other rows.
    const isInsideDeliverable = isInsideApprovedDeliverable
        || (isGuest ? descendantIdsForGuest : isEC ? descendantIdsForEC : descendantIds).has(file.id)
    const isTracked = !!file.isDeliverable || (!isFolder && isInsideDeliverable)
    const emptyTrackedValue = isTracked ? 'Not set' : '—'
    // A row's own stage: the deliverable's, or a document's inside one.
    const statusValue = file.activityStatus ?? (file.isDeliverable ? file.deliverableStatus : null) ?? null
    // Changeable in place on tracked rows, until the deliverable is approved; the role decides which moves.
    const canEditStatus = isTracked && !!roleSlug && !!file.projectDocumentId && !isIntakeRow && !isFolderApproved && !isInsideApprovedDeliverable
    const isIndexing = !isFolder && !!file.projectDocumentId && file.indexingStatus === 'PROCESSING'
    // Row tools appear on hover or keyboard focus, and stay while the row is in use.
    const toolsPinned = isActionMenuOpen || isSelected || isIndexing || file.id === activePreviewDocId || file.id === highlightedFileId

    async function handleRemoveBookmark(e: React.MouseEvent) {
        e.stopPropagation()
        try {
            await fetch('/api/bookmarks', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: bookmarkId }),
            })
            window.dispatchEvent(new CustomEvent('pockett-bookmarks-updated'))
        } catch {
            onAddToast({ type: 'error', title: 'Error', message: 'Failed to remove bookmark.' })
        }
    }

    // A folder opens from its ID and Name cells only. In selection mode the click toggles the row instead.
    const opensFolder = isFolder && selectedFileIdsSize === 0
    const openFromCell = () => {
        if (opensFolder) onItemClick(file)
    }

    return (
        <div
            key={file.id}
            id={`file-row-${file.id}`}
            data-file-id={file.id}
            draggable={canEdit && !loading}
            onDragStart={(e) => onDragStart(e, file)}
            onDragEnd={onDragEnd}
            onDragOver={(e) => onDragOver(e, file)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, file)}
            className={`${FILE_TABLE_GRID_COLS_CLASS} ${cn(
                "group grid gap-4 h-[34px] overflow-hidden pl-1 pr-2 transition-colors items-center cursor-default relative text-ui",
                (isFolderApproved || isInsideApprovedDeliverable) && "bg-primary/5 hover:bg-primary/10",
                (isIntakeRow || file.lock?.type === 'finalize' || (file.isPrivate && !isFolder)) ? "hover:bg-surface-hover opacity-60" : !(isFolderApproved || isInsideApprovedDeliverable) && "hover:bg-surface-hover",
                !isIntakeRow && isSelected && "bg-surface-selected hover:bg-surface-selected",
                !isIntakeRow && isActionMenuOpen && "bg-surface-muted",
                !isIntakeRow && (file.id === activeCommentDocId || file.id === activeInfoDocId || file.id === activeActivityDocId || file.id === activeVersionDocId || file.id === activePreviewDocId) && "bg-surface-muted",
                draggedItem?.id === file.id && "opacity-40 grayscale",
                dragOverFolderId === file.id && "bg-line ring-2 ring-inset ring-line z-[1]"
            )}`}
            onMouseEnter={() => {
                if (isDeeplinkHighlight) onClearHighlight()
            }}
            onClick={() => {
                // In selection mode: clicking anywhere on row toggles selection
                if (selectedFileIdsSize > 0) onToggleSelect(file.id)
            }}
        >
            {/* Checkbox Column */}
            <div
                className="flex-shrink-0 w-4 h-4 flex items-center justify-center"
                onClick={(e) => {
                    e.stopPropagation()
                    onToggleSelect(file.id)
                }}
            >
                <Checkbox
                    checked={isSelected}
                    className="h-4 w-4 pointer-events-none"
                />
            </div>

            {/* ID Column — with the Name, the only cells that open a folder: the others hold values,
                some of them editable, so a click there shouldn't navigate */}
            <div className={cn("flex items-center min-w-0", opensFolder && "cursor-pointer")} onClick={openFromCell}>
                {file.docId ? (
                    <span className="text-small text-fg-muted tabular-nums truncate">
                        {file.docId}
                    </span>
                ) : (
                    <span className="text-small text-fg-subtle">—</span>
                )}
            </div>

            {/* Name Column: icon and name (deeplink = skewed pastel marker on file name only), then the row's badges
                and tools. It spans the Name, badge and tool tracks, so the name runs on into whatever space they leave. */}
            <div className={cn("col-span-3 flex items-center gap-3 min-w-0", opensFolder && "cursor-pointer", FILE_TABLE_COL_LINE_CLASS)} onClick={openFromCell}>
                <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                    {/* A deliverable folder and the folders inside one wear folder-plus (inside ones a shade lighter);
                        documents keep their file-type icons; a folder that only contains a deliverable keeps the
                        shared-folder mark */}
                    {isFolder && file.isDeliverable ? (
                        <DeliverableIcon hint />
                    ) : isFolder && (isAncestorShared || isInsideApprovedDeliverable) ? (
                        <DeliverableIcon hint inside />
                    ) : isFolder && showBadge ? (
                        <SharedFolderIcon fillLevel={1} tooltip="Contains a deliverable" />
                    ) : isFolder ? (
                        <Folder className="h-4 w-4 fill-surface-muted text-fg-muted flex-shrink-0" />
                    ) : (
                        <DocumentIcon mimeType={file.mimeType} className="h-4 w-4" />
                    )}
                </div>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                    <Tooltip>
                        <TooltipTrigger asChild>
                                <div className="flex min-w-0 w-full flex-col">
                                {isDeeplinkHighlight ? (
                                    <div className="flex w-full min-w-0 items-center gap-3">
                                        <mark
                                            className={cn(
                                                "file-deeplink-highlight block max-w-full min-w-0 text-ui text-left",
                                                isFolder ? "text-fg hover:underline cursor-pointer" : "text-fg"
                                            )}
                                        >
                                            <span className="block min-w-0 truncate">
                                                {file.name}
                                            </span>
                                        </mark>
                                        <CircleChevronLeft
                                            className="h-3.5 w-3.5 shrink-0 text-black animate-deeplink-icon-pulse"
                                            aria-hidden
                                            strokeWidth={2}
                                        />
                                    </div>
                                ) : (file.id === activeCommentDocId || file.id === activeInfoDocId || file.id === activeActivityDocId || file.id === activeVersionDocId || file.id === activePreviewDocId) && !isFolder ? (
                                    <div className="flex w-full min-w-0 items-center gap-3">
                                        <span
                                            className={cn(
                                                "text-ui truncate min-w-0 flex-1",
                                                "text-fg-muted"
                                            )}
                                        >
                                            {file.name}
                                        </span>
                                        <CircleChevronLeft
                                            className="h-3.5 w-3.5 shrink-0 text-black animate-deeplink-icon-pulse"
                                            aria-label="Sidebar open for this file"
                                            strokeWidth={2}
                                        />
                                    </div>
                                ) : (
                                    <span
                                        className={cn(
                                            "text-ui truncate",
                                            isFolder ? "text-fg hover:underline cursor-pointer" : "text-fg"
                                        )}
                                    >
                                        {file.name}
                                    </span>
                                )}
                            </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[320px] p-3 text-xs bg-white text-fg border border-line shadow-xl break-all">
                            {file.name}
                        </TooltipContent>
                    </Tooltip>
                </div>

                {/* Badges — hidden when hideBadges=true (e.g. medium pane) to prevent icon overflow */}
                <div className={cn("flex shrink-0 items-center justify-end gap-1", hideBadges && "hidden")} onClick={(e) => e.stopPropagation()}>
                        {bookmarkId && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        type="button"
                                        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-primary hover:bg-red-50 hover:text-red-500 transition-colors"
                                        aria-label="Remove bookmark"
                                        onClick={handleRemoveBookmark}
                                    >
                                        <Bookmark className="h-4 w-4 fill-current" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">Bookmarked — click to remove</TooltipContent>
                            </Tooltip>
                        )}
                        {/* Only a deliverable itself (until the Status column says it) and a pending upload carry this
                            badge; rows inside a deliverable already show it in their icon and the breadcrumb */}
                        {(isIntakeRow || directShared) ? (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className={`${hasStatus && !isIntakeRow ? '@[49rem]/file-table:hidden ' : ''}inline-flex items-center shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                        isIntakeRow
                                            ? 'bg-primary/10 text-primary border-primary/30'
                                            : (isFolderApproved || isInsideApprovedDeliverable)
                                                ? 'bg-primary text-white/70 border-primary'
                                                : isAncestorShared
                                                    ? 'bg-primary/5 text-primary/50 border-primary/20'
                                                    : 'bg-primary/10 text-primary border-primary/30'
                                    }`}>
                                        {/* Approved or not, a deliverable's mark is folder-plus; the badge's fill says approved */}
                                        {isIntakeRow ? <Share2 className="h-3 w-3" /> : <FolderPlus className="h-3.5 w-3.5" />}
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                    {isIntakeRow
                                        ? 'Pending Review'
                                        : (isFolderApproved || isInsideApprovedDeliverable)
                                            ? 'Deliverable — Approved'
                                            : isAncestorShared
                                                ? 'Inside a Deliverable folder'
                                                : 'Deliverable'}
                                </TooltipContent>
                            </Tooltip>
                        ) : null}
                        {file.lock?.type === 'finalize' && !isFolder ? (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    {isProjectLead ? (
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); onUnlockConfirm(file) }}
                                            className="inline-flex items-center shrink-0 px-1.5 py-0.5 rounded text-[10px] font-normal bg-surface-subtle text-fg-subtle border border-line hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200 transition-colors"
                                        >
                                            <Lock className="h-3 w-3" />
                                        </button>
                                    ) : (
                                        <span className="inline-flex items-center shrink-0 px-1.5 py-0.5 rounded text-[10px] font-normal bg-surface-subtle text-fg-subtle border border-line">
                                            <Lock className="h-3 w-3" />
                                        </span>
                                    )}
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                    {isProjectLead
                                        ? 'Document Finalized — read-only. Click to Return to Draft'
                                        : 'Document Finalized — read-only. Engagement Lead can Return to Draft'}
                                </TooltipContent>
                            </Tooltip>
                        ) : null}
                        {file.isPrivate && !isFolder ? (
                            <span className="inline-flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-50 text-orange-700 border border-orange-200">
                                <FolderLock className="h-3 w-3" />
                                Private
                                {(canManage && file.lock?.type !== 'finalize') && (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); onPrivacy(file, false) }}
                                                className="ml-0.5 rounded-full text-orange-500 hover:text-orange-700 hover:bg-orange-100 p-0.5"
                                            >
                                                <FolderUp className="h-3 w-3" />
                                            </button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="text-xs">Make Public</TooltipContent>
                                    </Tooltip>
                                )}
                            </span>
                        ) : null}
                </div>

                {/* Quick icons: on hover or focus (always on touch screens), and while the row is in use. At rest they
                    take no width, so the name can use it. */}
                <div className={cn(
                    "flex shrink-0 items-center justify-end transition-opacity duration-ui-fast",
                    !toolsPinned && "max-w-0 overflow-hidden opacity-0 focus-within:max-w-none focus-within:opacity-100 group-hover:max-w-none group-hover:opacity-100 [@media(hover:none)]:max-w-none [@media(hover:none)]:opacity-100"
                )}>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>

                        {!isFolder && file.documentType !== 'LINK' && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        type="button"
                                        className={cn(
                                            'h-7 w-7 rounded-md inline-flex items-center justify-center disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg-muted',
                                            file.id === activePreviewDocId
                                                ? 'text-fg-muted bg-surface-muted'
                                                : 'text-fg-muted hover:text-fg-muted hover:bg-surface-hover'
                                        )}
                                        aria-label="Preview"
                                        aria-pressed={file.id === activePreviewDocId}
                                        disabled={isIntakeRow}
                                        onClick={() => onOpenPreviewPane(file.id)}
                                    >
                                        <ScanEye className="h-4 w-4" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">Preview</TooltipContent>
                            </Tooltip>
                        )}

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    className={cn(
                                        'h-7 w-7 rounded-md inline-flex items-center justify-center disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg-muted',
                                        file.id === highlightedFileId
                                            ? 'text-fg-muted bg-surface-muted'
                                            : 'text-fg-muted hover:text-fg-muted hover:bg-surface-hover'
                                    )}
                                    aria-label="Copy link"
                                    aria-pressed={file.id === highlightedFileId}
                                    disabled={isIntakeRow}
                                    onClick={() => {
                                        const docId = file.projectDocumentId || file.id
                                        const base = typeof window !== 'undefined' ? window.location.href.replace(/#.*$/, '') : ''
                                        const url = base ? `${base}#doc-file:${docId}` : ''
                                        if (!url) return
                                        navigator.clipboard.writeText(url).then(() => {
                                            onAddToast({ type: 'success', title: 'Link copied', message: 'Document link copied to clipboard.' })
                                        }).catch(() => {
                                            const ta = document.createElement('textarea')
                                            ta.value = url
                                            document.body.appendChild(ta)
                                            ta.select()
                                            document.execCommand('copy')
                                            document.body.removeChild(ta)
                                            onAddToast({ type: 'success', title: 'Link copied', message: 'Document link copied to clipboard.' })
                                        })
                                    }}
                                >
                                    <Link2 className="h-4 w-4" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">Copy link</TooltipContent>
                        </Tooltip>

                        {isIndexing && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="h-7 w-7 inline-flex items-center justify-center text-fg-subtle">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">Indexing in progress</TooltipContent>
                            </Tooltip>
                        )}

                        <DocumentActionMenu
                            document={file}
                            disabled={isIntakeRow}
                            triggerIcon={<MoreVertical className="h-4 w-4" />}
                            deeplinkBase={typeof window !== 'undefined' ? window.location.href.replace(/#.*$/, '') : ''}
                            showShareModal={isProjectLead && !isIntakeRow}
                            isAncestorShared={isAncestorShared}
                            isDeliverable={isFolder && !!file.isDeliverable}
                            isApprovedDeliverable={isFolderApproved || isInsideApprovedDeliverable}
                            deliverableStatus={(file as any).deliverableStatus ?? undefined}
                            isEngagementLead={isProjectLead}
                            isExternalUser={isEC || isGuest}
                            isExternalViewer={isGuest}
                            projectId={projectId}
                            orgSlug={orgSlug}
                            onShareSaved={onShareSaved}
                            onMarkAsDeliverable={onMarkAsDeliverable}
                            onUntagAsDeliverable={(isInsideApprovedDeliverable || isFolderApproved) ? undefined : onUntagAsDeliverable}
                            canManage={canOrganizeTree}
                            currentFolderType={currentFolderType}
                            onOpenCommentPane={(docId) => onOpenCommentPane(docId)}
                            onOpenInfoPane={(docId) => onOpenInfoPane(docId)}
                            onOpenActivityPane={(docId) => onOpenActivityPane(docId)}
                            onOpenVersionPane={(docId) => onOpenVersionPane(docId)}
                            onRenameDocument={canEdit && !locked && !isIntakeRow ? (doc) => onOpenRename(doc as DriveFile) : undefined}
                            onDuplicateDocument={canEdit && !locked && !isIntakeRow ? (doc) => onDuplicate(doc as DriveFile) : undefined}
                            onCopyDocument={generalFolderId && canEdit && !locked && !isIntakeRow ? (doc) => onOpenCopyMove(doc as DriveFile, 'copy') : undefined}
                            onMoveDocument={generalFolderId && canEdit && !locked && !isIntakeRow ? (doc) => onOpenCopyMove(doc as DriveFile, 'move') : undefined}
                            onCrossEngagementCopy={isProjectLead && canMutateFile ? (doc) => onOpenCrossEngagement(doc as DriveFile) : undefined}
                            onDeleteDocument={canMutateFile ? (doc) => onTrash(doc as DriveFile) : undefined}
                            onMakePrivate={canManage && !locked && !isIntakeRow && !file.isPrivate ? () => onPrivacy(file, true) : undefined}
                            onMakePublic={canManage && !locked && !isIntakeRow && file.isPrivate ? () => onPrivacy(file, false) : undefined}
                            onOpenChange={(open) => onActionMenuOpenChange(open)}
                            onOpenDocument={(doc) => {
                                const d = doc as DriveFile
                                onOpenDocument(d)
                            }}
                            connectorAccountEmail={connectorAccountEmail}
                            isOneDriveClient={isOneDriveClient}
                        />
                    </div>
                </div>
            </div>

            {/* Status Column: the stage of a deliverable or a document inside one, the same pill as on the Board.
                It changes in place, to the stages the viewer's role may move it to (lib/deliverable-stage-roles.ts). */}
            <div className={cn('min-w-0 items-center', STATUS_COL_CLASS, FILE_TABLE_COL_LINE_CLASS)} onClick={(e) => { if (canEditStatus) e.stopPropagation() }}>
                <FileStatusCell
                    projectId={projectId}
                    documentId={file.projectDocumentId ?? file.id}
                    fileName={file.name}
                    isFolder={isFolder}
                    status={isFolder && !file.isDeliverable ? null : statusValue}
                    roleSlug={canEditStatus ? roleSlug : null}
                    emptyLabel={emptyTrackedValue}
                    emptyClassName={isTracked ? 'text-fg-subtle' : 'text-[#45474c]/40'}
                    onSaved={(next) => {
                        file.activityStatus = next
                        if (file.isDeliverable) file.deliverableStatus = next
                        onShareSaved()
                    }}
                    onAddToast={onAddToast}
                />
            </div>

            {/* Due Column — leads edit it in place (Notion-style); everyone else sees the relative date.
                Files and deliverable folders both have one. */}
            <div className={cn('min-w-0 whitespace-nowrap', DUE_DATE_COL_CLASS, FILE_TABLE_COL_LINE_CLASS)} onClick={(e) => { if (canEditDueDate) e.stopPropagation() }}>
                {canEditDueDate ? (
                    <FileDueDateCell
                        projectId={projectId}
                        documentId={(file as { projectDocumentId?: string }).projectDocumentId || file.id}
                        dueDate={file.dueDate ?? null}
                        placeholder={emptyTrackedValue}
                        onSaved={(next) => { file.dueDate = next ?? undefined }}
                        onError={(message) => onAddToast({ type: 'error', title: "Couldn't set due date", message })}
                    />
                ) : (
                    <>
                    {/* Folders other than deliverables have no Due, whatever an older value says */}
                    {file.dueDate && (!isFolder || file.isDeliverable) ? (() => {
                        const due = new Date(file.dueDate)
                        const now = Date.now()
                        const diffMs = due.getTime() - now
                        const diffDays = diffMs / 86400000
                        const isUrgent = diffDays >= 0 && diffDays <= 7
                        const isOverdue = diffDays < 0

                        let relativeLabel: string
                        if (isOverdue) {
                            const days = Math.floor(-diffDays)
                            relativeLabel = days === 0 ? 'today' : days === 1 ? '1d overdue' : `${days}d overdue`
                        } else {
                            const days = Math.floor(diffDays)
                            relativeLabel = days === 0 ? 'today' : days === 1 ? 'in 1d' : `in ${days}d`
                        }

                        const colorClass = isOverdue || isUrgent ? 'text-red-500' : 'text-fg-muted'
                        const iconColor = isOverdue || isUrgent ? 'text-red-300 hover:text-red-500' : 'text-line hover:text-fg-muted'

                        return (
                            <RelativeDateTime
                                date={file.dueDate}
                                displayFormat="short"
                                textClassName={`text-[0.8125rem] ${colorClass}`}
                                iconClassName={iconColor}
                                tooltipSide="top"
                                tooltipPrefix="Due on:"
                                overrideDisplayText={relativeLabel}
                            />
                        )
                    })() : (
                        <span className={cn('text-[0.8125rem]', isTracked ? 'text-fg-subtle' : 'text-[#45474c]/40')}>{emptyTrackedValue}</span>
                    )}
                    </>
                )}
            </div>

            {/* Created by: who added it — the member who added it in the app, not the connector account
                Drive names as the owner of everything the app adds; for a file added straight in Drive,
                its Drive owner (lib/files/file-creator.ts) */}
            <div className={cn('min-w-0', OWNER_COL_CLASS, FILE_TABLE_COL_LINE_CLASS)}>
                {(() => {
                    const ownerName = file.creator?.displayName || null
                    const ownerEmail = file.creator?.emailAddress || null
                    const ownerPhoto = file.creator?.photoLink || null
                    const isMe = ownerEmail && sessionUserEmail
                        && ownerEmail.toLowerCase() === sessionUserEmail.toLowerCase()
                    const ROLE_LABELS: Record<string, string> = {
                        eng_admin: 'Engagement Lead',
                        eng_member: 'Team Member',
                        eng_ext_collaborator: 'External Collaborator',
                        eng_viewer: 'Reviewer',
                    }
                    const roleLabel = file.ownerRole ? (ROLE_LABELS[file.ownerRole] ?? file.ownerRole) : undefined
                    const personaName = file.creator?.viaDrive
                        ? (roleLabel ? `${roleLabel} · added in Drive` : 'Added in Drive')
                        : roleLabel
                    if (!ownerName) return (
                        <span className="text-[0.8125rem] text-fg-muted">—</span>
                    )
                    return (
                        <div className="flex items-center gap-1.5 min-w-0">
                            <ProfileBubbleWithPopup
                                name={ownerName}
                                email={ownerEmail || ''}
                                avatarUrl={ownerPhoto || null}
                                personaName={personaName}
                            />
                            <span className="text-[0.8125rem] text-fg-muted truncate">
                                {isMe ? 'me' : ownerName}
                            </span>
                        </div>
                    )
                })()}
            </div>

            {/* Date Modified Column. Rows are a fixed 34px, so a date must never wrap onto a second line:
                the row clips it, and the second line would be cut in half. */}
            <div className={cn('min-w-0 whitespace-nowrap', DATE_MODIFIED_COL_CLASS, FILE_TABLE_COL_LINE_CLASS)}>
                {file.modifiedTime ? (
                    <RelativeDateTime
                        date={file.modifiedTime}
                        textClassName="text-[0.8125rem] text-fg-muted"
                        iconClassName="text-line hover:text-fg-muted"
                        tooltipSide="top"
                    />
                ) : (
                    <span className="text-[0.8125rem] text-fg-muted">—</span>
                )}
            </div>

            {/* File Size Column */}
            <div className={cn('text-left', FILE_SIZE_COL_CLASS, FILE_TABLE_COL_LINE_CLASS)}>
                {isFolder ? (
                    <span className="text-[0.8125rem] text-[#45474c]/40">—</span>
                ) : file.size ? (
                    <span className="text-[0.8125rem] text-fg-muted font-mono">
                        {formatFileSize(Number(file.size))}
                    </span>
                ) : (
                    <span className="text-[0.8125rem] text-[#45474c]/40">—</span>
                )}
            </div>

            {(processingFileIds.has(file.id) || isRegrantingId === file.id) && (
                <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
                    <div className="h-[2px] w-full bg-primary/20 overflow-hidden">
                        <div className="h-full bg-primary animate-indeterminate-progress" />
                    </div>
                </div>
            )}
        </div>
    )
}

const STAGES: ActivityStatus[] = ['to_do', 'in_progress', 'in_review', 'approved']

/**
 * The Status cell. Read-only unless the viewer may move this row; then a picker offering only the
 * stages their role allows from here (getAllowedTransitions, as the Board and the server use). A
 * deliverable can't be approved while a document inside it isn't — the Board's rule, checked first.
 */
function FileStatusCell({
    projectId,
    documentId,
    fileName,
    isFolder,
    status,
    roleSlug,
    emptyLabel,
    emptyClassName,
    onSaved,
    onAddToast,
}: {
    projectId: string
    documentId: string
    fileName: string
    isFolder: boolean
    status: ActivityStatus | null
    /** null when the row can't be changed here. */
    roleSlug: EngagementRoleSlug | null
    emptyLabel: string
    emptyClassName: string
    onSaved: (next: ActivityStatus) => void
    onAddToast: (toast: { type: string; title: string; message: string }) => void
}) {
    const [value, setValue] = React.useState<ActivityStatus | null>(status)
    React.useEffect(() => { setValue(status) }, [status])
    // A document with no stage yet is at "to do" as far as the rules go.
    const allowed = roleSlug ? getAllowedTransitions(roleSlug, value ?? 'to_do') : []
    if (allowed.length === 0) {
        return value
            ? <StatusPill kind="deliverable" status={value} />
            : <span className={cn('text-[0.8125rem]', emptyClassName)}>{emptyLabel}</span>
    }
    return (
        <StatusProperty
            kind="deliverable"
            value={value}
            placeholder={emptyLabel}
            options={STAGES.filter((s) => s === value || allowed.includes(s))}
            onChange={async (next) => {
                const stage = next as ActivityStatus
                const { getSession } = await import('@/lib/supabase')
                const session = await getSession()
                const headers = { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) }
                if (stage === 'approved' && isFolder) {
                    const res = await fetch(`/api/projects/${projectId}/documents/${encodeURIComponent(documentId)}/subtasks`, { headers })
                    const data = await res.json().catch(() => ({}))
                    const unapproved = ((data.subtasks ?? []) as { status: string | null }[]).filter((t) => t.status !== 'approved').length
                    if (!res.ok || unapproved > 0) {
                        onAddToast({
                            type: 'error',
                            title: 'Cannot approve yet',
                            message: res.ok
                                ? `${unapproved} document${unapproved > 1 ? 's' : ''} still need to be approved before this deliverable can be approved.`
                                : 'Could not check the documents inside it. Please try again.',
                        })
                        return
                    }
                }
                const res = await fetch(`/api/projects/${projectId}/documents/${encodeURIComponent(documentId)}/sharing/activity`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({ status: stage }),
                })
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}))
                    onAddToast({ type: 'error', title: "Couldn't change the stage", message: err.error ?? 'Please try again.' })
                    return
                }
                setValue(stage)
                onSaved(stage)
                onAddToast({
                    type: 'success',
                    title: stage === 'approved' ? 'Approved' : 'Stage updated',
                    message: `${fileName} · ${statusOf('deliverable', stage).label}`,
                })
                window.dispatchEvent(new CustomEvent('pockett-notifications-updated'))
            }}
        />
    )
}

/** Inline Due editor for one file or deliverable folder — the same endpoint the row menu's "Due" uses. */
function FileDueDateCell({
    projectId,
    documentId,
    dueDate,
    placeholder,
    onSaved,
    onError,
}: {
    projectId: string
    documentId: string
    dueDate: string | null
    /** What an empty cell reads: "Not set" for a deliverable or what's inside one, otherwise a dash. */
    placeholder: string
    onSaved: (next: string | null) => void
    onError: (message: string) => void
}) {
    const [value, setValue] = React.useState<string | null>(dueDate)
    React.useEffect(() => { setValue(dueDate) }, [dueDate])
    return (
        <DateProperty
            value={value}
            placeholder={placeholder}
            highlightOverdue
            allowTime
            compact
            onChange={async (next) => {
                const { getSession } = await import('@/lib/supabase')
                const session = await getSession()
                const res = await fetch(`/api/projects/${projectId}/documents/${encodeURIComponent(documentId)}/due-date`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
                    body: JSON.stringify({ dueDate: next }),
                })
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}))
                    onError(err.error ?? 'Failed to update due date')
                    return
                }
                setValue(next)
                onSaved(next)
                window.dispatchEvent(new CustomEvent('pockett-notifications-updated'))
            }}
        />
    )
}
