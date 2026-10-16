'use client'

import React from 'react'
import {
    Folder, Share2, Lock, FolderLock, FolderUp,
    Link2, ScanEye, MoreVertical, CircleChevronLeft, Loader2, Bookmark,
    PackagePlus, PackageCheck
} from 'lucide-react'
import { DocumentIcon } from '@/components/ui/document-icon'
import { SharedFolderIcon } from '@/components/ui/folder-shared-icon'
import { DocumentActionMenu } from '@/components/ui/document-action-menu'
import { ProfileBubbleWithPopup } from '@/components/ui/profile-bubble-popup'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import { DateProperty } from '@/components/ui/property-cells'
import { Checkbox } from '@/components/ui/checkbox'
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
    OWNER_COL_CLASS,
    DATE_MODIFIED_COL_CLASS,
    DUE_DATE_COL_CLASS,
    FILE_SIZE_COL_CLASS,
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
    const canEditDueDate = canManage && !isFolder && !locked && !isIntakeRow
    const isIndexing = !isFolder && !!file.projectDocumentId && file.indexingStatus === 'PROCESSING'

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
                "group grid gap-4 h-9 pl-1 pr-2 transition-colors items-center cursor-default relative text-ui",
                isFolder && selectedFileIdsSize === 0 && "cursor-pointer",
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
            onDoubleClick={() => { if (selectedFileIdsSize === 0) onItemClick(file) }}
            onClick={() => {
                if (selectedFileIdsSize > 0) {
                    // In selection mode: clicking anywhere on row toggles selection
                    onToggleSelect(file.id)
                } else {
                    onItemClick(file)
                }
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

            {/* ID Column */}
            <div className="flex items-center min-w-0">
                {file.docId ? (
                    <span className="text-small text-fg-subtle tabular-nums truncate">
                        {file.docId}
                    </span>
                ) : (
                    <span className="text-[11px] text-[#c0c1c6]">—</span>
                )}
            </div>

            {/* Name Column: icon and name (deeplink = skewed pastel marker on file name only) */}
            <div className="flex items-center gap-3 min-w-0">
                <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                    {isFolder && showBadge ? (
                        <SharedFolderIcon
                            fillLevel={isAncestorShared ? 0.5 : 1}
                            tooltip={isAncestorShared ? 'contains-shared' : 'shared'}
                        />
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
            </div>

            {/* Badges — hidden when hideBadges=true (e.g. medium pane) to prevent icon overflow */}
            <div className={cn("flex items-center justify-end gap-1 pr-2", hideBadges && "invisible")} onClick={(e) => e.stopPropagation()}>
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
                    {(showBadge || isIntakeRow) ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className={`inline-flex items-center shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                    isIntakeRow
                                        ? 'bg-primary/10 text-primary border-primary/30'
                                        : (isFolderApproved || isInsideApprovedDeliverable)
                                            ? 'bg-primary text-white/70 border-primary'
                                            : isAncestorShared
                                                ? 'bg-primary/5 text-primary/50 border-primary/20'
                                                : 'bg-primary/10 text-primary border-primary/30'
                                }`}>
                                    {isIntakeRow
                                        ? <Share2 className="h-3 w-3" />
                                        : (isFolderApproved || isInsideApprovedDeliverable)
                                            ? <PackageCheck className="h-3.5 w-3.5" />
                                            : <PackagePlus className="h-3.5 w-3.5" />
                                    }
                                </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                                {isIntakeRow
                                    ? 'Pending Review'
                                    : (isFolderApproved || isInsideApprovedDeliverable)
                                        ? 'Deliverable — Approved'
                                        : isAncestorShared
                                            ? 'Inside a Deliverable folder'
                                            : 'Tagged as Deliverable'}
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

            {/* Quick icons */}
            <div className="flex items-center justify-end">
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

            {/* Owner Column */}
            <div className={`min-w-0 ${OWNER_COL_CLASS}`}>
                {(() => {
                    const ownerName = file.owners?.[0]?.displayName
                        || file.lastModifyingUser?.displayName
                        || (file.actorEmail ? file.actorEmail.split('@')[0] : null)
                        || null
                    const ownerEmail = file.owners?.[0]?.emailAddress
                        || file.actorEmail
                        || null
                    const ownerPhoto = file.owners?.[0]?.photoLink || null
                    const isMe = ownerEmail && sessionUserEmail
                        && ownerEmail.toLowerCase() === sessionUserEmail.toLowerCase()
                    const ROLE_LABELS: Record<string, string> = {
                        eng_admin: 'Engagement Lead',
                        eng_member: 'Team Member',
                        eng_ext_collaborator: 'External Collaborator',
                        eng_viewer: 'Reviewer',
                    }
                    const personaName = file.ownerRole ? (ROLE_LABELS[file.ownerRole] ?? file.ownerRole) : undefined
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

            {/* Date Modified Column */}
            <div className={DATE_MODIFIED_COL_CLASS}>
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

            {/* Due Date Column — leads edit it in place (Notion-style); everyone else sees the relative date */}
            <div className={DUE_DATE_COL_CLASS} onClick={(e) => { if (canEditDueDate) e.stopPropagation() }}>
                {canEditDueDate ? (
                    <FileDueDateCell
                        projectId={projectId}
                        documentId={(file as { projectDocumentId?: string }).projectDocumentId || file.id}
                        dueDate={file.dueDate ?? null}
                        onSaved={(next) => { file.dueDate = next ?? undefined }}
                        onError={(message) => onAddToast({ type: 'error', title: "Couldn't set due date", message })}
                    />
                ) : (
                    <>
                    {!isFolder && file.dueDate ? (() => {
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
                        <span className="text-[0.8125rem] text-[#45474c]/40">—</span>
                    )}
                    </>
                )}
            </div>

            {/* File Size Column */}
            <div className={`text-left ${FILE_SIZE_COL_CLASS}`}>
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

/** Inline due-date editor for one file — the same endpoint the row menu's "Set Due Date" uses. */
function FileDueDateCell({
    projectId,
    documentId,
    dueDate,
    onSaved,
    onError,
}: {
    projectId: string
    documentId: string
    dueDate: string | null
    onSaved: (next: string | null) => void
    onError: (message: string) => void
}) {
    const [value, setValue] = React.useState<string | null>(dueDate)
    React.useEffect(() => { setValue(dueDate) }, [dueDate])
    return (
        <DateProperty
            value={value}
            placeholder="—"
            highlightOverdue
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
