'use client'

import React from 'react'
import {
    Folder, Share2, Inbox, CheckCircle2, Trash2, Lock, FolderLock, FolderUp,
    MessageCircle, Link2, MoreVertical, CircleChevronLeft, Loader2, Bookmark
} from 'lucide-react'
import { DocumentIcon } from '@/components/ui/document-icon'
import { SharedFolderIcon } from '@/components/ui/folder-shared-icon'
import { DocumentActionMenu } from '@/components/ui/document-action-menu'
import { ProfileBubbleWithPopup } from '@/components/ui/profile-bubble-popup'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import { Checkbox } from '@/components/ui/checkbox'
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { formatFileSize } from '@/lib/utils'
import { DriveFile } from '@/lib/types'

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
    firmId?: string
    // Current session user
    sessionUserId?: string
    sessionUserEmail?: string
    // Shared IDs
    sharedExternalIds: Set<string>
    ancestorFolderIds: Set<string>
    sharedExternalIdsForEC: Set<string>
    ancestorFolderIdsForEC: Set<string>
    sharedExternalIdsForGuest: Set<string>
    ancestorFolderIdsForGuest: Set<string>
    // Action menu state
    isActionMenuOpen: boolean
    onActionMenuOpenChange: (open: boolean) => void
    // Processing
    processingFileIds: Set<string>
    isRegrantingId: string | null
    // Intake
    intakeActionInProgress: string | null
    expandedIntakeBadgeId: string | null
    onSetExpandedIntakeBadgeId: (id: string | null) => void
    // File operation handlers
    onOpenComments: (file: DriveFile) => void
    onOpenRename: (doc: DriveFile) => void
    onDuplicate: (doc: DriveFile) => void
    onOpenCopyMove: (doc: DriveFile, action: 'copy' | 'move') => void
    onOpenCrossEngagement: (doc: DriveFile) => void
    onTrash: (doc: DriveFile) => void
    onPrivacy: (file: DriveFile, makePrivate: boolean) => void
    onShareSaved: () => void
    onUnshareConfirm: (file: DriveFile) => void
    onUnlockConfirm: (file: DriveFile) => void
    onIntakeAction: (file: DriveFile, action: 'approve' | 'reject' | 'withdraw') => void
    onFolderIntakeAction: (file: DriveFile, action: 'approve-folder' | 'reject-folder' | 'withdraw-folder') => void
    onOpenDocument: (doc: DriveFile) => void
    onOpenCommentPane: (docId: string) => void
    onOpenInfoPane: (docId: string) => void
    onOpenActivityPane: (docId: string) => void
    onOpenVersionPane: (docId: string) => void
    onAddToast: (toast: { type: string; title: string; message: string }) => void
    /** Connector account email — passed to DocumentActionMenu for Google Drive authuser param. */
    connectorAccountEmail?: string | null
    /** Bookmark record id if this document is bookmarked by the current user; undefined otherwise. */
    bookmarkId?: string
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
    firmId,
    sessionUserId,
    sessionUserEmail,
    sharedExternalIds,
    ancestorFolderIds,
    sharedExternalIdsForEC,
    ancestorFolderIdsForEC,
    sharedExternalIdsForGuest,
    ancestorFolderIdsForGuest,
    isActionMenuOpen,
    onActionMenuOpenChange,
    processingFileIds,
    isRegrantingId,
    intakeActionInProgress,
    expandedIntakeBadgeId,
    onSetExpandedIntakeBadgeId,
    onOpenComments,
    onOpenRename,
    onDuplicate,
    onOpenCopyMove,
    onOpenCrossEngagement,
    onTrash,
    onPrivacy,
    onShareSaved,
    onUnshareConfirm,
    onUnlockConfirm,
    onIntakeAction,
    onFolderIntakeAction,
    onOpenDocument,
    onOpenCommentPane,
    onOpenInfoPane,
    onOpenActivityPane,
    onOpenVersionPane,
    onAddToast,
    connectorAccountEmail,
    bookmarkId,
}: EngagementFileRowProps) {
    const isDeeplinkHighlight = file.id === highlightedFileId
    const isFolder = (file.mimeType ?? (file as { type?: string }).type) === 'application/vnd.google-apps.folder'
    const intakeLock = file.lock?.type === 'intake' ? file.lock : null
    const isIntakeRow = !!intakeLock
    const isOwnIntake = intakeLock?.uploadedBy === sessionUserId
    // isEC/isGuest: covers both genuine EC/EV users (restrictToSharedOnly=true) and admin view-as impersonation
    const isEC = restrictToSharedOnly ? canEdit : viewAsPersonaSlug === 'eng_ext_collaborator'
    const isGuest = restrictToSharedOnly ? !canEdit : viewAsPersonaSlug === 'eng_viewer'
    const showBadge = isGuest
        ? (sharedExternalIdsForGuest.has(file.id) || ancestorFolderIdsForGuest.has(file.id))
        : isEC
            ? (sharedExternalIdsForEC.has(file.id) || ancestorFolderIdsForEC.has(file.id))
            : (sharedExternalIds.has(file.id) || ancestorFolderIds.has(file.id))
    const directShared = isGuest ? sharedExternalIdsForGuest.has(file.id) : isEC ? sharedExternalIdsForEC.has(file.id) : sharedExternalIds.has(file.id)

    const locked = file.lock?.type === 'finalize'
    const canMutateFile = canEdit && !locked && !isIntakeRow
    const canOrganizeTree = canManage && !locked && !isIntakeRow
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
            style={{ gridTemplateColumns: 'minmax(0, 1fr) 10% 10% 14% 12% 10% 8%' }}
            className={cn(
                "group grid gap-4 h-10 pl-3 pr-2 transition-all items-center cursor-default relative text-[0.8125rem]",
                isFolder && selectedFileIdsSize === 0 && "cursor-pointer",
                (isIntakeRow || file.lock?.type === 'finalize' || (file.isPrivate && !isFolder)) ? "hover:bg-[#f9f9fb] opacity-60" : "hover:bg-[#f9f9fb]",
                !isIntakeRow && isSelected && "bg-blue-50 hover:bg-blue-50",
                !isIntakeRow && isActionMenuOpen && "bg-[#f3f4f6]",
                !isIntakeRow && (file.id === activeCommentDocId || file.id === activeInfoDocId || file.id === activeActivityDocId || file.id === activeVersionDocId) && "bg-[#f3f4f6]",
                draggedItem?.id === file.id && "opacity-40 grayscale",
                dragOverFolderId === file.id && "bg-[#e5e7eb] ring-2 ring-inset ring-[#e5e7eb] z-[1]"
            )}
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
            {/* Name Column: icon and name (deeplink = skewed pastel marker on file name only) */}
            <div className="flex items-center gap-3 min-w-0">
                {/* OneDrive-style: checkbox on hover or in selection mode; icon otherwise */}
                <div
                    className="flex-shrink-0 w-4 h-4 flex items-center justify-center relative"
                    onClick={(e) => {
                        e.stopPropagation()
                        onToggleSelect(file.id)
                    }}
                >
                    {/* Checkbox: show when row hovered (group-hover) or selection active */}
                    <div className={cn(
                        "absolute inset-0 flex items-center justify-center",
                        selectedFileIdsSize > 0 ? "flex" : "hidden group-hover:flex"
                    )}>
                        <Checkbox
                            checked={isSelected}
                            className="h-4 w-4 pointer-events-none"
                        />
                    </div>
                    {/* Icon: hidden when hovered/selected */}
                    <div className={cn(
                        "absolute inset-0 flex items-center justify-center",
                        selectedFileIdsSize > 0 ? "hidden" : "flex group-hover:hidden"
                    )}>
                        {isFolder && showBadge ? (
                            <SharedFolderIcon
                                fillLevel={directShared ? 1 : 0.5}
                                tooltip={directShared ? 'shared' : 'contains-shared'}
                            />
                        ) : isFolder ? (
                            <Folder className="h-4 w-4 fill-primary/20 text-primary flex-shrink-0" />
                        ) : (
                            <DocumentIcon mimeType={file.mimeType} className="h-4 w-4" />
                        )}
                    </div>
                </div>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                    <Tooltip>
                        <TooltipTrigger asChild>
                                <div className="flex min-w-0 w-full flex-col">
                                {isDeeplinkHighlight ? (
                                    <div className="flex w-full min-w-0 items-center gap-3">
                                        <mark
                                            className={cn(
                                                "file-deeplink-highlight block w-max max-w-[calc(100%-2rem)] min-w-0 text-[0.8125rem] font-medium text-left",
                                                isFolder
                                                    ? "text-[#1b1b1d] hover:text-[#45474c] cursor-pointer"
                                                    : "text-[#45474c]"
                                            )}
                                        >
                                            <span className="block min-w-0 break-words">
                                                {file.name}
                                            </span>
                                        </mark>
                                        <CircleChevronLeft
                                            className="h-3.5 w-3.5 shrink-0 text-black animate-deeplink-icon-pulse"
                                            aria-hidden
                                            strokeWidth={2}
                                        />
                                    </div>
                                ) : (file.id === activeCommentDocId || file.id === activeInfoDocId || file.id === activeActivityDocId || file.id === activeVersionDocId) && !isFolder ? (
                                    <div className="flex w-full min-w-0 items-center gap-3">
                                        <span
                                            className={cn(
                                                "text-[0.8125rem] font-medium truncate min-w-0 flex-1",
                                                "text-[#45474c]"
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
                                            "text-[0.8125rem] font-medium truncate",
                                            isFolder
                                                ? "text-[#1b1b1d] hover:text-[#45474c] cursor-pointer"
                                                : "text-[#45474c]"
                                        )}
                                    >
                                        {file.name}
                                    </span>
                                )}
                            </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[320px] p-3 text-xs bg-white text-slate-900 border border-slate-200 shadow-xl break-all">
                            {file.name}
                        </TooltipContent>
                    </Tooltip>
                </div>
            </div>

            {/* Badges */}
            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
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
                    {showBadge ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                {isProjectLead && directShared ? (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); onUnshareConfirm(file) }}
                                        className={`inline-flex items-center shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium border bg-primary/10 text-primary border-primary/30 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors`}
                                    >
                                        <Share2 className="h-3 w-3" />
                                    </button>
                                ) : (
                                    <span className={`inline-flex items-center shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                        isFolder && !directShared
                                            ? 'bg-primary/5 text-primary/50 border-primary/20'
                                            : 'bg-primary/10 text-primary border-primary/30'
                                    }`}>
                                        <Share2 className="h-3 w-3" />
                                    </span>
                                )}
                            </TooltipTrigger>
                            <TooltipContent side="top">
                                {isProjectLead && directShared
                                    ? 'Shared externally — click to revoke'
                                    : isFolder && !directShared
                                        ? 'Contains shared items'
                                        : 'Shared externally'}
                            </TooltipContent>
                        </Tooltip>
                    ) : null}
                    {isIntakeRow ? (
                        <span className="inline-flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); onSetExpandedIntakeBadgeId(expandedIntakeBadgeId === file.id ? null : file.id) }}
                                        className="rounded p-0 leading-none text-amber-700 hover:text-amber-900"
                                    >
                                        <Inbox className="h-3 w-3" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">Pending Review</TooltipContent>
                            </Tooltip>
                            {expandedIntakeBadgeId === file.id && (<>
                                {isProjectLead && (<>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <button
                                                type="button"
                                                disabled={intakeActionInProgress === file.id}
                                                onClick={(e) => { e.stopPropagation(); isFolder ? onFolderIntakeAction(file, 'approve-folder') : onIntakeAction(file, 'approve') }}
                                                className="rounded-full text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 p-0.5"
                                            >
                                                <CheckCircle2 className="h-3 w-3" />
                                            </button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="text-xs">{isFolder ? 'Approve folder' : 'Approve'}</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <button
                                                type="button"
                                                disabled={intakeActionInProgress === file.id}
                                                onClick={(e) => { e.stopPropagation(); isFolder ? onFolderIntakeAction(file, 'reject-folder') : onIntakeAction(file, 'reject') }}
                                                className="rounded-full text-red-500 hover:text-red-600 hover:bg-red-100 disabled:opacity-40 p-0.5"
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="text-xs">{isFolder ? 'Reject folder' : 'Reject'}</TooltipContent>
                                    </Tooltip>
                                </>)}
                                {(isEC || isGuest) && isOwnIntake && (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <button
                                                type="button"
                                                disabled={intakeActionInProgress === file.id}
                                                onClick={(e) => { e.stopPropagation(); isFolder ? onFolderIntakeAction(file, 'withdraw-folder') : onIntakeAction(file, 'withdraw') }}
                                                className="rounded-full text-amber-500 hover:text-red-600 hover:bg-red-100 disabled:opacity-40 p-0.5"
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="text-xs">{isFolder ? 'Withdraw folder' : 'Withdraw upload'}</TooltipContent>
                                    </Tooltip>
                                )}
                            </>)}
                        </span>
                    ) : null}
                    {file.lock?.type === 'finalize' && !isFolder ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                {isProjectLead ? (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); onUnlockConfirm(file) }}
                                        className="inline-flex items-center shrink-0 px-1.5 py-0.5 rounded text-[10px] font-normal bg-slate-50 text-slate-400 border border-slate-200 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200 transition-colors"
                                    >
                                        <Lock className="h-3 w-3" />
                                    </button>
                                ) : (
                                    <span className="inline-flex items-center shrink-0 px-1.5 py-0.5 rounded text-[10px] font-normal bg-slate-50 text-slate-400 border border-slate-200">
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
                    {!isFolder && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    className={cn(
                                        'h-7 w-7 rounded-md inline-flex items-center justify-center disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-500',
                                        file.id === activeCommentDocId
                                            ? 'text-slate-700 bg-slate-100'
                                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                                    )}
                                    aria-label="Open comments"
                                    aria-pressed={file.id === activeCommentDocId}
                                    onClick={() => onOpenComments(file)}
                                >
                                    <MessageCircle className="h-4 w-4" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">Comments</TooltipContent>
                        </Tooltip>
                    )}

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                type="button"
                                className={cn(
                                    'h-7 w-7 rounded-md inline-flex items-center justify-center disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-500',
                                    file.id === highlightedFileId
                                        ? 'text-slate-700 bg-slate-100'
                                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                                )}
                                aria-label="Copy link"
                                aria-pressed={file.id === highlightedFileId}
                                disabled={!file.projectDocumentId}
                                onClick={async () => {
                                    if (!file.projectDocumentId) return
                                    const base = typeof window !== 'undefined' ? window.location.href.replace(/#.*$/, '') : ''
                                    const url = base ? `${base}#doc-file:${file.projectDocumentId}` : ''
                                    if (!url) return
                                    await navigator.clipboard.writeText(url)
                                    onAddToast({ type: 'success', title: 'Link copied', message: 'Document link copied to clipboard.' })
                                }}
                            >
                                <Link2 className="h-4 w-4" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                            {file.projectDocumentId ? 'Copy link' : 'Unavailable until indexed'}
                        </TooltipContent>
                    </Tooltip>

                    {isIndexing && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="h-7 w-7 inline-flex items-center justify-center text-slate-400">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">Indexing in progress</TooltipContent>
                        </Tooltip>
                    )}

                    <DocumentActionMenu
                        document={file}
                        triggerIcon={<MoreVertical className="h-4 w-4" />}
                        deeplinkBase={typeof window !== 'undefined' ? window.location.href.replace(/#.*$/, '') : ''}
                        showShareModal={isProjectLead && !isIntakeRow}
                        isEngagementLead={isProjectLead}
                        isExternalUser={isEC || isGuest}
                        isExternalViewer={isGuest}
                        projectId={projectId}
                        orgSlug={orgSlug}
                        onShareSaved={onShareSaved}
                        canManage={canOrganizeTree}
                        currentFolderType={currentFolderType}
                        onOpenCommentPane={(docId) => onOpenCommentPane(docId)}
                        onOpenInfoPane={(docId) => onOpenInfoPane(docId)}
                        onOpenActivityPane={(docId) => onOpenActivityPane(docId)}
                        onOpenVersionPane={(docId) => onOpenVersionPane(docId)}
                        onRenameDocument={canMutateFile ? (doc) => onOpenRename(doc as DriveFile) : undefined}
                        onDuplicateDocument={canMutateFile ? (doc) => onDuplicate(doc as DriveFile) : undefined}
                        onCopyDocument={generalFolderId && canMutateFile ? (doc) => onOpenCopyMove(doc as DriveFile, 'copy') : undefined}
                        onMoveDocument={generalFolderId && canMutateFile ? (doc) => onOpenCopyMove(doc as DriveFile, 'move') : undefined}
                        onCrossEngagementCopy={isProjectLead && canMutateFile ? (doc) => onOpenCrossEngagement(doc as DriveFile) : undefined}
                        onDeleteDocument={canMutateFile ? (doc) => onTrash(doc as DriveFile) : undefined}
                        onMakePrivate={canOrganizeTree && !file.isPrivate ? () => onPrivacy(file, true) : undefined}
                        onMakePublic={canOrganizeTree && file.isPrivate ? () => onPrivacy(file, false) : undefined}
                        onOpenChange={(open) => onActionMenuOpenChange(open)}
                        onApproveFolder={isProjectLead && isFolder && isIntakeRow ? () => onFolderIntakeAction(file, 'approve-folder') : undefined}
                        onRejectFolder={isProjectLead && isFolder && isIntakeRow ? () => onFolderIntakeAction(file, 'reject-folder') : undefined}
                        onWithdrawFolder={(isEC || isGuest) && isFolder && isOwnIntake ? () => onFolderIntakeAction(file, 'withdraw-folder') : undefined}
                        onOpenDocument={(doc) => {
                            const d = doc as DriveFile
                            onOpenDocument(d)
                        }}
                        connectorAccountEmail={connectorAccountEmail}
                    />
                </div>
            </div>

            {/* Owner Column */}
            <div className="min-w-0">
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
                        eng_viewer: 'Viewer (External)',
                    }
                    const personaName = file.ownerRole ? (ROLE_LABELS[file.ownerRole] ?? file.ownerRole) : undefined
                    if (!ownerName) return (
                        <span className="text-[0.8125rem] text-[#45474c]">—</span>
                    )
                    return (
                        <div className="flex items-center gap-1.5 min-w-0">
                            <ProfileBubbleWithPopup
                                name={ownerName}
                                email={ownerEmail || ''}
                                avatarUrl={ownerPhoto || null}
                                personaName={personaName}
                            />
                            <span className="text-[0.8125rem] text-[#45474c] truncate">
                                {isMe ? 'me' : ownerName}
                            </span>
                        </div>
                    )
                })()}
            </div>

            {/* Date Modified Column */}
            <div>
                {file.modifiedTime ? (
                    <RelativeDateTime
                        date={file.modifiedTime}
                        textClassName="text-[0.8125rem] text-[#45474c]"
                        iconClassName="text-[#e5e7eb] hover:text-[#45474c]"
                        tooltipSide="top"
                    />
                ) : (
                    <span className="text-[0.8125rem] text-[#45474c]">—</span>
                )}
            </div>

            {/* Due Date Column */}
            <div>
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

                    const colorClass = isOverdue || isUrgent ? 'text-red-500' : 'text-[#45474c]'
                    const iconColor = isOverdue || isUrgent ? 'text-red-300 hover:text-red-500' : 'text-[#e5e7eb] hover:text-[#45474c]'

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
            </div>

            {/* File Size Column */}
            <div className="text-left">
                {isFolder ? (
                    <span className="text-[0.8125rem] text-[#45474c]/40">—</span>
                ) : file.size ? (
                    <span className="text-[0.8125rem] text-[#45474c] font-mono">
                        {formatFileSize(Number(file.size))}
                    </span>
                ) : (
                    <span className="text-[0.8125rem] text-[#45474c]/40">—</span>
                )}
            </div>

            {(processingFileIds.has(file.id) || isRegrantingId === file.id) && (
                <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
                    <div className="h-[2px] w-full bg-indigo-100 overflow-hidden">
                        <div className="h-full bg-indigo-500 animate-indeterminate-progress" />
                    </div>
                </div>
            )}
        </div>
    )
}
