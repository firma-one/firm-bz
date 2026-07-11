'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { DocumentPreviewPanelContent } from '@/components/files/document-edit-sheet'
import { FilePreviewSheet } from '@/components/files/file-preview-sheet'
import { useRightPane } from '@/lib/right-pane-context'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
  type DraggableAttributes,
} from '@dnd-kit/core'
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities'
import { Share2, User, Lock, ListTodo, CheckCircle, Eye, GripVertical, FolderOpen, Clock, Copy, Check, Search, MessagesSquare, Link2, ScanEye, X, RefreshCw, ChevronDown, ChevronLeft, ChevronRight, Filter, CheckCircle2, Trash2, BookOpenText, PenLine, PackagePlus, PackageCheck } from 'lucide-react'
import { ProfileBubbleWithPopup } from '@/components/ui/profile-bubble-popup'
import { DocumentBreadcrumb } from '@/components/ui/document-breadcrumb'
import { DocumentIcon } from '@/components/ui/document-icon'
import { SharedFolderIcon } from '@/components/ui/folder-shared-icon'
import { DocumentActionMenu } from '@/components/ui/document-action-menu'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ShareDetailPanel } from './share-detail-panel'
import { DeliverableDetailPanel } from './deliverable-detail-panel'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { SecureAccessModal } from './secure-access-modal'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { supabase } from '@/lib/supabase'
import { useSecureOpenDocument } from '@/lib/use-secure-open-document'
import { logger } from '@/lib/logger'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import { DocumentDocCommentsPane } from '@/components/projects/document-doc-comments-pane'
import { DocumentBlobPreviewPane } from '@/components/files/document-blob-preview-pane'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { useProjectPersonaLabels } from '@/lib/hooks/use-project-persona-labels'
import { useToast } from '@/components/ui/toast'
import { SandboxBoardPreview } from '@/components/projects/sandbox-board-comments-preview'
import { getAllowedTransitions, type EngagementRoleSlug } from '@/lib/deliverable-stage-roles'

type ActivityStatus = 'to_do' | 'in_progress' | 'in_review' | 'approved'

interface ShareRecord {
  id: string
  projectId: string
  documentId: string
  documentName: string
  documentExternalId: string
  documentMimeType: string | null
  thumbnailLink?: string | null
  webViewLink?: string | null
parentId?: string | null
  parentName?: string | null
  createdBy: string
  createdByEmail?: string | null
  createdByName?: string | null
  createdByAvatarUrl?: string | null
  createdAt: string
  updatedAt: string
  updatedBy?: string | null
  updatedByEmail?: string | null
  updatedByName?: string | null
  updatedByAvatarUrl?: string | null
  settings: {
    externalCollaborator: boolean
    guest: boolean
    guestOptions: { sharePdfOnly?: boolean; allowDownload?: boolean; addWatermark?: boolean; publish?: boolean; sharedPdfDriveId?: string | null }
    ecOptions?: { allowDownload?: boolean }
    publishedVersionId: string | null
    publishedAt: string | null
  }
  activity?: { status: ActivityStatus; updatedAt: string; orderIndex?: number }
  comments?: Array<{ createdAt: string; commentor: string; comment: string }>
  finalizedAt?: string | null
  accessLog: Array<{
    at: string
    by: string
    userId: string | null
    email: string | null
    sessionId: string | null
  }>
  pendingApproval?: boolean
  pendingUploaderId?: string | null
  docId?: string | null
  dueDate?: string | null
  subtaskCount?: number
  approvedSubtaskCount?: number
  /** Used internally when grouping into lanes for stable sort order. */
  _orderIndex?: number
}

export type FilesBreadcrumbItem = { id: string; name: string; clickable?: boolean }

interface EngagementSharesTabProps {
  projectId: string
  canManage?: boolean
  /** True for external personas (EC, EV) — hides internal-only UI like Drive Actions. */
  restrictToSharedOnly?: boolean
  /** True only for External Viewer (eng_viewer) — shows Accept Document option. */
  isExternalViewer?: boolean
  /** The user's engagement role slug — used to derive allowed lane transitions. */
  roleSlug?: EngagementRoleSlug
  connectorRootFolderId?: string
  orgName?: string
  clientName?: string
  projectName?: string
  onOpenInFiles?: (folderId: string, breadcrumbs: FilesBreadcrumbItem[], hash?: string) => void
  /** When set, view mode is driven by URL; changes navigate */
  sharesBasePath?: string
  pathViewMode?: 'list' | 'board' | 'grid'
  /** Base URL for deeplinks (e.g. ".../files"). Used for Copy Link buttons. */
  deeplinkBase?: string
  orgSlug?: string
}

/** Per-lane color theme: header pill, icon, count badge, progress bar, and card accents all derive from this. */
const LANE_THEME: Record<ActivityStatus, {
  headerBg: string
  headerBorder: string
  iconBg: string
  iconColor: string
  labelColor: string
  countBg: string
  countColor: string
  progressColor: string
  cardIconBg: string
  cardIconColor: string
  docIdColor: string
}> = {
  to_do: {
    headerBg: 'bg-[#fdf3e0]',
    headerBorder: 'border-[#f5e2b8]',
    iconBg: 'bg-[#f3b52f]',
    iconColor: 'text-white',
    labelColor: 'text-[#9a6b12]',
    countBg: 'bg-[#f9e6bd]',
    countColor: 'text-[#9a6b12]',
    progressColor: '#f3b52f',
    cardIconBg: 'bg-[#fdf3e0]',
    cardIconColor: 'text-[#c8891a]',
    docIdColor: 'text-[#c8891a]',
  },
  in_progress: {
    headerBg: 'bg-[#e7edff]',
    headerBorder: 'border-[#c9d7ff]',
    iconBg: 'bg-[#3b5bfd]',
    iconColor: 'text-white',
    labelColor: 'text-[#2a3fb0]',
    countBg: 'bg-[#d3ddff]',
    countColor: 'text-[#2a3fb0]',
    progressColor: '#3b5bfd',
    cardIconBg: 'bg-[#e7edff]',
    cardIconColor: 'text-[#3b5bfd]',
    docIdColor: 'text-[#3b5bfd]',
  },
  in_review: {
    headerBg: 'bg-[#f1eaff]',
    headerBorder: 'border-[#ddd0ff]',
    iconBg: 'bg-[#7c3aed]',
    iconColor: 'text-white',
    labelColor: 'text-[#5b21b6]',
    countBg: 'bg-[#e2d4ff]',
    countColor: 'text-[#5b21b6]',
    progressColor: '#7c3aed',
    cardIconBg: 'bg-[#f1eaff]',
    cardIconColor: 'text-[#7c3aed]',
    docIdColor: 'text-[#7c3aed]',
  },
  approved: {
    headerBg: 'bg-[#e2f6ea]',
    headerBorder: 'border-[#bfe9d1]',
    iconBg: 'bg-[#0d9f5f]',
    iconColor: 'text-white',
    labelColor: 'text-[#0d6b41]',
    countBg: 'bg-[#c7ecd8]',
    countColor: 'text-[#0d6b41]',
    progressColor: '#0d9f5f',
    cardIconBg: 'bg-[#e2f6ea]',
    cardIconColor: 'text-[#0d9f5f]',
    docIdColor: 'text-[#0d9f5f]',
  },
}

const LANES: {
  status: ActivityStatus
  label: string
  icon: React.ReactNode
  iconBg: string
}[] = [
    {
      status: 'to_do',
      label: 'To Do',
      icon: <ListTodo className={cn('h-3.5 w-3.5', LANE_THEME.to_do.iconColor)} />,
      iconBg: LANE_THEME.to_do.iconBg,
    },
    {
      status: 'in_progress',
      label: 'In Progress',
      icon: <PenLine className={cn('h-3.5 w-3.5', LANE_THEME.in_progress.iconColor)} />,
      iconBg: LANE_THEME.in_progress.iconBg,
    },
    {
      status: 'in_review',
      label: 'In Review',
      icon: <Eye className={cn('h-3.5 w-3.5', LANE_THEME.in_review.iconColor)} />,
      iconBg: LANE_THEME.in_review.iconBg,
    },
    {
      status: 'approved',
      label: 'Approved',
      icon: <CheckCircle className={cn('h-3.5 w-3.5', LANE_THEME.approved.iconColor)} />,
      iconBg: LANE_THEME.approved.iconBg,
    },
  ]

function getInitials(nameOrEmail: string | null | undefined): string {
  if (!nameOrEmail) return '?'
  // Remove UUIDs if they accidentally leak in
  if (nameOrEmail.length > 30 && nameOrEmail.includes('-')) return '?'

  const clean = nameOrEmail.split('@')[0].replace(/[._-]/g, ' ')
  const parts = clean.split(' ').filter(p => p.length > 0)

  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return parts[0].slice(0, 2).toUpperCase()
}

function DroppableLane({
  id,
  children,
  className,
}: {
  id: string
  children: React.ReactNode | ((isOver: boolean) => React.ReactNode)
  className?: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={cn(className, isOver && 'bg-primary/5 rounded')}>
      {typeof children === 'function' ? children(isOver) : children}
    </div>
  )
}

const CARD_ACCENT: Record<ActivityStatus, { iconPillBg: string }> = {
  to_do: { iconPillBg: LANE_THEME.to_do.cardIconBg },
  in_progress: { iconPillBg: LANE_THEME.in_progress.cardIconBg },
  in_review: { iconPillBg: LANE_THEME.in_review.cardIconBg },
  approved: { iconPillBg: LANE_THEME.approved.cardIconBg },
}

function DraggableCard({
  id,
  share,
  laneStatus,
  formatDate,
  getDocumentForMenu,
  showActions,
  canManage,
  isApprovedLane,
  onShareSaved,
  handleSecureOpen,
  isRegrantingId,
  onOpenComments,
  onOpenPreview,
  extCollaboratorLabel,
  viewerLabel,
  onParentFolderClick,
  onOpenInFilesForFolder,
  onOpenDetail,
  isDetailOpen,
  isPaneOpen,
  isExternalPersona,
  isExternalViewer,
  deeplinkBase,
  generalFolderId,
  currentUserId,
  onIntakeAction,
  intakeActionInProgress,
  isSaving,
  onUntagAsDeliverable,
}: {
  id: string
  share: ShareRecord
  laneStatus: ActivityStatus
  formatDate: (s: string) => string
  getDocumentForMenu: (s: ShareRecord) => { id: string; name: string; mimeType?: string; externalId: string }
  showActions: boolean
  canManage: boolean
  isApprovedLane: boolean
  onShareSaved?: () => void
  handleSecureOpen: (share: ShareRecord) => void
  isRegrantingId: string | null
  onOpenComments?: (share: ShareRecord) => void
  onOpenPreview?: (share: ShareRecord) => void
  extCollaboratorLabel: string
  viewerLabel: string
  onParentFolderClick?: (parentId: string, parentName: string) => void
  onOpenInFilesForFolder?: (share: ShareRecord) => void
  onOpenDetail?: (share: ShareRecord) => void
  /** True when this card's detail panel is open in the right pane */
  isDetailOpen?: boolean
  /** True when any deliverable's detail pane is open */
  isPaneOpen?: boolean
  isExternalPersona?: boolean
  isExternalViewer?: boolean
  deeplinkBase?: string
  generalFolderId?: string | null
  currentUserId?: string | null
  onIntakeAction?: (documentId: string, action: string) => void
  intakeActionInProgress?: string | null
  /** True when this specific card's order save is in-flight */
  isSaving?: boolean
  onUntagAsDeliverable?: (doc: { id: string }) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id })
  const { iconPillBg } = CARD_ACCENT[laneStatus]

  const previewDoc = {
    id: share.documentId,
    externalId: share.documentExternalId,
    name: share.documentName,
    mimeType: share.documentMimeType ?? undefined,
    size: (share as any).metadata?.size ?? null,
    modifiedTime: share.updatedAt,
    projectId: share.projectId,
    isGuest: share.settings?.guest ?? false,
  }

  // When any pane is open, only the open card stays interactive; others are muted
  const isBlocked = isPaneOpen && !isDetailOpen

  return (
    <motion.div
      ref={(node) => { setNodeRef(node); setDropRef(node) }}
      layout
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: isDragging ? 0 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{
        scale: { type: 'spring', stiffness: 400, damping: 30 },
        opacity: { duration: isDragging ? 0.28 : 0.18, ease: 'easeOut' },
      }}
      whileHover={!isDragging && !isSaving ? { y: -2, boxShadow: '0 4px 12px -2px rgba(0,0,0,0.08)' } : undefined}
      className={cn(
        'relative rounded overflow-hidden select-none border transition-all duration-200',
        isDragging ? 'shadow-none bg-transparent' : (isApprovedLane ? 'bg-[#0d9f5f]/5 shadow-sm' : 'bg-white shadow-sm'),
        isDetailOpen && 'shadow-md',
        isDragging ? 'border-transparent' : (isApprovedLane ? 'border-[#0d9f5f]/10' : 'border-[#e5e7eb]'),
        isBlocked && 'opacity-60 blur-[1.5px] saturate-50',
        isOver && !isDragging && 'ring-1 ring-primary/30 ring-inset',
        isSaving && 'pointer-events-none'
      )}
    >
      {isSaving && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/60 backdrop-blur-[1px] rounded">
          <LoadingSpinner className="h-4 w-4 text-primary" />
        </div>
      )}
      <ShareCardContent
        share={share}
        iconPillBg={iconPillBg}
        laneStatus={laneStatus}
        formatDate={formatDate}
        getDocumentForMenu={getDocumentForMenu}
        showActions={showActions}
        canManage={canManage}
        isApprovedLane={isApprovedLane}
        onShareSaved={onShareSaved}
        handleSecureOpen={handleSecureOpen}
        isRegrantingId={isRegrantingId}
        onClickTitle={() => handleSecureOpen(share)}
        onOpenComments={onOpenComments}
        onOpenPreview={onOpenPreview}
        extCollaboratorLabel={extCollaboratorLabel}
        viewerLabel={viewerLabel}
        onParentFolderClick={onParentFolderClick}
        onOpenInFilesForFolder={onOpenInFilesForFolder}
        onOpenDetail={isDetailOpen ? undefined : onOpenDetail}
        isExternalPersona={isExternalPersona}
        isExternalViewer={isExternalViewer}
        deeplinkBase={deeplinkBase}
        generalFolderId={generalFolderId}
        currentUserId={currentUserId}
        onIntakeAction={onIntakeAction}
        intakeActionInProgress={intakeActionInProgress}
        dragListeners={!isBlocked ? listeners : undefined}
        dragAttributes={!isBlocked ? attributes : undefined}
        onUntagAsDeliverable={onUntagAsDeliverable}
      />
    </motion.div>
  )
}


function ShareCardContent({
  share,
  iconPillBg,
  laneStatus,
  formatDate,
  getDocumentForMenu,
  showActions,
  canManage,
  isApprovedLane,
  onShareSaved,
  onClickTitle,
  handleSecureOpen,
  isRegrantingId,
  onOpenComments,
  onOpenPreview,
  extCollaboratorLabel,
  viewerLabel,
  onParentFolderClick,
  onOpenInFilesForFolder,
  onOpenDetail,
  isExternalPersona,
  isExternalViewer,
  deeplinkBase,
  generalFolderId,
  currentUserId,
  onIntakeAction,
  intakeActionInProgress,
  dragListeners,
  dragAttributes,
  onUntagAsDeliverable,
}: {
  share: ShareRecord
  iconPillBg: string
  laneStatus?: ActivityStatus
  formatDate: (s: string) => string
  getDocumentForMenu: (s: ShareRecord) => { id: string; name: string; mimeType?: string; externalId: string }
  showActions: boolean
  canManage: boolean
  isApprovedLane: boolean
  onShareSaved?: () => void
  onClickTitle?: () => void
  handleSecureOpen: (share: ShareRecord) => void
  isRegrantingId: string | null
  onOpenComments?: (share: ShareRecord) => void
  onOpenPreview?: (share: ShareRecord) => void
  extCollaboratorLabel: string
  viewerLabel: string
  onParentFolderClick?: (parentId: string, parentName: string) => void
  onOpenInFilesForFolder?: (share: ShareRecord) => void
  onOpenDetail?: (share: ShareRecord) => void
  isExternalPersona?: boolean
  isExternalViewer?: boolean
  deeplinkBase?: string
  generalFolderId?: string | null
  currentUserId?: string | null
  onIntakeAction?: (documentId: string, action: string) => void
  intakeActionInProgress?: string | null
  dragListeners?: SyntheticListenerMap
  dragAttributes?: DraggableAttributes
  onUntagAsDeliverable?: (doc: { id: string }) => void
}) {
  const isFinalized = share.activity?.status === 'approved'
  const [linkCopied, setLinkCopied] = useState(false)
  const isPending = !!share.pendingApproval
  const isOwnPending = isPending && !!currentUserId && share.pendingUploaderId === currentUserId
  const isFolder = share.documentMimeType?.includes('folder')
  const intakeApproveAction = isFolder ? 'approve-folder' : 'approve'
  const intakeRejectAction = isFolder ? 'reject-folder' : 'reject'
  const intakeWithdrawAction = isFolder ? 'withdraw-folder' : 'withdraw'
  const laneTheme = laneStatus ? LANE_THEME[laneStatus] : undefined
  const cardIconColor = laneTheme?.cardIconColor ?? 'text-primary'
  const docIdColor = laneTheme?.docIdColor ?? 'text-primary'

  return (
    <>
      <div className={cn('border-b', isApprovedLane ? 'bg-[#0d9f5f]/[0.06] border-[#0d9f5f]/10' : 'bg-[#fdfdfe] border-[#f1f1f3]', isPending && 'opacity-80')}>
        <div
          className="flex items-center gap-2.5 px-3 pt-2.5 pb-2 group/drag"
          {...(dragListeners ?? {})}
          {...(dragAttributes ?? {})}
        >
          {dragListeners && (
            <GripVertical className="h-4 w-4 shrink-0 text-slate-300 group-hover/drag:text-slate-400 cursor-grab active:cursor-grabbing transition-colors" />
          )}
          <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded', iconPillBg)}>
            {share.documentMimeType?.includes('folder') ? (
              isFinalized
                ? <PackageCheck className={cn('h-4 w-4', cardIconColor)} />
                : <PackagePlus className={cn('h-4 w-4', cardIconColor)} />
            ) : (
              <DocumentIcon mimeType={share.documentMimeType ?? undefined} className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0 flex-1" onClick={onClickTitle}>
            {/* Row 1: DOC ID (primary) */}
            {share.docId && (
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className={cn('text-[11px] font-bold font-mono tracking-wide', docIdColor)}>{share.docId}</span>
                {isFinalized && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Lock className="h-3 w-3 shrink-0 text-[#9a9ba0]" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">Approved & Locked</TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}
            {/* Row 2: filename */}
            <div
              className={cn(
                'truncate cursor-pointer transition-colors flex items-center gap-1.5',
                share.docId
                  ? 'text-[11px] font-medium text-[#5b5d64] hover:text-[#1b1b1d]'
                  : 'text-[13px] font-semibold text-[#1b1b1d] hover:text-primary'
              )}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="truncate">{share.documentName}</span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-64 break-words">{share.documentName}</TooltipContent>
              </Tooltip>
              {!share.docId && isFinalized && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Lock className="h-3 w-3 shrink-0 text-[#9a9ba0]" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">Approved & Locked</TooltipContent>
                </Tooltip>
              )}
            </div>
            {isPending ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary border border-primary/30">
                    <Share2 className="h-2.5 w-2.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">Pending Review</TooltipContent>
              </Tooltip>
            ) : (
              <DocumentBreadcrumb
                parentName={share.parentName ?? (generalFolderId ? 'General' : null)}
                parentId={share.parentId ?? generalFolderId ?? null}
                onFolderClick={onParentFolderClick}
              />
            )}
          </div>
          {onOpenDetail && !isPending && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="p-1 rounded hover:bg-[#e5e7eb] text-[#9a9ba0] hover:text-[#45474c] transition-colors shrink-0"
                    onClick={(e) => { e.stopPropagation(); onOpenDetail(share) }}
                  >
                    <BookOpenText className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">View details</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
      {/* Intake actions — shown instead of normal content when pending */}
      {isPending && (
        <div className="px-3 py-3 bg-white border-b border-[#e5e7eb] space-y-2" onClick={(e) => e.stopPropagation()}>
          {canManage && !isExternalPersona && (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={intakeActionInProgress === share.documentId}
                onClick={() => onIntakeAction?.(share.documentId, intakeApproveAction)}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Approve
              </button>
              <button
                type="button"
                disabled={intakeActionInProgress === share.documentId}
                onClick={() => onIntakeAction?.(share.documentId, intakeRejectAction)}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded bg-[#fef2f2] text-[#991b1b] hover:bg-[#fee2e2] disabled:opacity-50 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" /> Reject
              </button>
            </div>
          )}
          {isExternalPersona && isOwnPending && (
            <button
              type="button"
              disabled={intakeActionInProgress === share.documentId}
              onClick={() => onIntakeAction?.(share.documentId, intakeWithdrawAction)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded bg-[#fef2f2] text-[#991b1b] hover:bg-[#fee2e2] disabled:opacity-50 transition-colors"
            >
              <X className="h-3.5 w-3.5" /> Withdraw Request
            </button>
          )}
        </div>
      )}
      <div className={cn('px-3 pb-3 pt-2 bg-white space-y-1.5', isPending && 'opacity-60')}>
        {/* Datetime + quick links */}
        <div className="flex items-center justify-between">
          <RelativeDateTime
            date={share.updatedAt}
            textClassName="text-[11px] text-[#6b6d75]"
            iconClassName="text-[#9a9ba0] hover:text-[#45474c]"
            tooltipSide="top"
          />
          <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="p-1 rounded hover:bg-[#f3f4f6] text-[#9a9ba0] hover:text-[#45474c] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (isPending || !deeplinkBase || !share.documentId) return
                      navigator.clipboard.writeText(`${deeplinkBase}#doc-file:${share.documentId}`)
                      setLinkCopied(true)
                      setTimeout(() => setLinkCopied(false), 1500)
                    }}
                    disabled={isPending || !deeplinkBase || !share.documentId}
                  >
                    {linkCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Link2 className="h-3.5 w-3.5" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">{deeplinkBase && share.documentId ? 'Copy link' : 'No link available'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {!isPending && (
              <>
                {isFolder && onOpenInFilesForFolder && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-[#f3f4f6] text-[#9a9ba0] hover:text-[#45474c] transition-colors"
                          onClick={(e) => { e.stopPropagation(); onOpenInFilesForFolder(share) }}
                        >
                          <FolderOpen className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">Open in Files</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {!share.documentMimeType?.includes('folder') && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-[#f3f4f6] text-[#9a9ba0] hover:text-[#45474c] transition-colors"
                          onClick={(e) => { e.stopPropagation(); onOpenPreview?.(share) }}
                        >
                          <ScanEye className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">Preview</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </>
            )}
            <DocumentActionMenu
              document={getDocumentForMenu(share)}
              showShareModal={canManage}
              projectId={share.projectId}
              onShareSaved={onShareSaved}
              onOpenDocument={() => handleSecureOpen(share)}
              isExternalUser={isExternalPersona}
              isExternalViewer={isExternalViewer}
              disabled={isPending}
              isDeliverable={true}
              isApprovedDeliverable={isFinalized}
              deliverableStatus={share.activity?.status ?? 'to_do'}
              onUntagAsDeliverable={onUntagAsDeliverable}
            />
            {isRegrantingId === share.id && <LoadingSpinner size="sm" className="min-h-0 ml-0.5" />}
          </div>
        </div>
        {/* Updated by */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-[#6b6d75] w-14 shrink-0 whitespace-nowrap">Updated by</span>
          <TooltipProvider>
            <ProfileBubbleWithPopup
              name={(share.updatedByName || share.updatedByEmail) ?? (share.createdByName || share.createdByEmail || 'Team Member')}
              email={(share.updatedByEmail ?? share.createdByEmail) || ''}
              avatarUrl={share.updatedByAvatarUrl ?? share.createdByAvatarUrl}
              size="default"
            />
          </TooltipProvider>
        </div>
        {(() => {
          const total = share.subtaskCount ?? 0
          const approved = share.approvedSubtaskCount ?? 0
          if (total === 0) return null
          const pct = Math.round((approved / total) * 100)
          return (
            <div className="flex items-center gap-2 pt-0.5">
              <div className="flex-1 h-1 rounded-full bg-[#e5e7eb] overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[9px] font-semibold text-[#6b6d75] tabular-nums shrink-0">{approved}/{total}</span>
            </div>
          )
        })()}
      </div>
    </>
  )
}

const STATUS_LABELS: Record<ActivityStatus, string> = {
  to_do: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  approved: 'Approved',
}

const STATUS_PILL_CLASS: Record<ActivityStatus, string> = {
  to_do: 'bg-[#ede9fe]/90 text-[#5b21b6]',
  in_progress: 'bg-[#eff2ff]/90 text-[#5A78FF]',
  in_review: 'bg-[#fff7ed]/90 text-[#c2410c]',
  approved: 'bg-primary/10/90 text-primary',
}


function ModifierBubble({
  updatedBy,
  updatedByEmail,
  updatedByAvatarUrl,
  updatedAt,
  formatDate,
}: {
  updatedBy: string
  updatedByEmail: string | null | undefined
  updatedByAvatarUrl: string | null | undefined
  updatedAt: string
  formatDate: (s: string) => string
}) {
  const [copied, setCopied] = useState(false)
  const displayEmail = updatedByEmail ?? null
  const initials = displayEmail ? displayEmail.slice(0, 2).toUpperCase() : getInitials(updatedBy)

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (displayEmail) {
      navigator.clipboard.writeText(displayEmail)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="h-8 w-8 rounded-lg border border-slate-200/80 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0 cursor-default">
            {updatedByAvatarUrl ? (
              <img src={updatedByAvatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-[10px] font-medium text-slate-600">{initials}</span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-slate-50 border border-slate-200 text-slate-700 text-xs p-3 max-w-[280px] shadow-md">
          <div className="space-y-2">
            {displayEmail && (
              <div className="flex items-center gap-2">
                <span className="truncate max-w-[200px]">{displayEmail}</span>
                <button type="button" onClick={handleCopy} className="shrink-0 p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700" title="Copy email">
                  {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>Modified at {formatDate(updatedAt)}</span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function ModifiedAtOnlyBubble({ updatedAt, formatDate }: { updatedAt: string; formatDate: (s: string) => string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="h-8 w-8 rounded-lg border border-slate-200/80 bg-slate-50 flex items-center justify-center shrink-0 cursor-default">
            <Clock className="h-4 w-4 text-slate-500" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-slate-50 border border-slate-200 text-slate-700 text-xs p-3 shadow-md">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>Modified at {formatDate(updatedAt)}</span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function SharesListView({
  shares,
  formatDate,
  getDocumentForMenu,
  canManage,
  onShareSaved,
  onOpenInFilesForFolder,
  handleSecureOpen,
  isRegrantingId,
  extCollaboratorLabel,
  viewerLabel,
  onOpenComments,
  onOpenPreview,
  onParentFolderClick,
  isExternalPersona,
  isExternalViewer,
  deeplinkBase,
  generalFolderId,
  currentUserId,
  onIntakeAction,
  intakeActionInProgress,
  onUntagAsDeliverable,
}: {
  shares: ShareRecord[]
  formatDate: (s: string) => string
  getDocumentForMenu: (s: ShareRecord) => { id: string; name: string; mimeType?: string; externalId: string }
  canManage: boolean
  onShareSaved: () => void
  onOpenInFilesForFolder?: (share: ShareRecord) => void
  handleSecureOpen: (share: ShareRecord) => void
  isRegrantingId: string | null
  extCollaboratorLabel: string
  viewerLabel: string
  onOpenComments?: (share: ShareRecord) => void
  onOpenPreview?: (share: ShareRecord) => void
  onParentFolderClick?: (parentId: string, parentName: string) => void
  isExternalPersona?: boolean
  isExternalViewer?: boolean
  deeplinkBase?: string
  generalFolderId?: string | null
  currentUserId?: string | null
  onIntakeAction?: (documentId: string, action: string) => void
  intakeActionInProgress?: string | null
  onUntagAsDeliverable?: (doc: { id: string }) => void
}) {
  const [actionMenuOpenShareId, setActionMenuOpenShareId] = useState<string | null>(null)
  const [linkCopiedId, setLinkCopiedId] = useState<string | null>(null)

  const COL_TEMPLATE = 'minmax(0,1fr) 120px 160px 120px 88px'

  return (
    <div className="m-4 bg-white rounded border border-[#e5e7eb] overflow-hidden flex flex-col">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-[#e5e7eb] pl-3 pr-2 py-2.5 shrink-0 z-10">
        <div className="grid gap-4 items-center" style={{ gridTemplateColumns: COL_TEMPLATE }}>
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Name</span>
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Shared with</span>
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Shared by</span>
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Modified</span>
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</span>
        </div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-[#e5e7eb]">
        {shares.map((share) => {
          const ec = share.settings?.externalCollaborator ?? false
          const guest = share.settings?.guest ?? false
          const isFolder = share.documentMimeType?.includes('folder')
          const isModified = new Date(share.updatedAt).getTime() > new Date(share.createdAt).getTime()
          const samePerson = share.updatedBy && share.updatedBy === share.createdBy
          const showCreatorProfile = !isModified || (isModified && !samePerson)
          const showModifierProfile = isModified && share.updatedBy && !samePerson
          const isPending = !!share.pendingApproval
          const isOwnPending = isPending && !!currentUserId && share.pendingUploaderId === currentUserId
          const intakeApproveAction = isFolder ? 'approve-folder' : 'approve'
          const intakeRejectAction = isFolder ? 'reject-folder' : 'reject'
          const intakeWithdrawAction = isFolder ? 'withdraw-folder' : 'withdraw'

          return (
            <div
              key={share.id}
              className={cn(
                'group grid gap-4 pl-3 pr-2 py-2 items-center cursor-default transition-colors text-[0.8125rem]',
                'hover:bg-[#f9f9fb]',
                isPending && 'opacity-70 border-dashed',
                actionMenuOpenShareId === share.id && 'bg-[#f3f4f6]'
              )}
              style={{ gridTemplateColumns: COL_TEMPLATE }}
            >
              {/* Name column */}
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                  {isFolder ? (
                    <SharedFolderIcon fillLevel={1} size={16} />
                  ) : (
                    <DocumentIcon mimeType={share.documentMimeType ?? undefined} className="h-4 w-4" />
                  )}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span
                    className="text-[0.8125rem] font-medium truncate text-[#1b1b1d] hover:text-primary cursor-pointer transition-colors"
                    title={share.documentName}
                    onClick={() => handleSecureOpen(share)}
                  >
                    {share.documentName}
                  </span>
                  {isPending ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center w-fit shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary border border-primary/30">
                            <Share2 className="h-2.5 w-2.5" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">Pending Review</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <DocumentBreadcrumb
                      parentName={share.parentName ?? (generalFolderId ? 'General' : null)}
                      parentId={share.parentId ?? generalFolderId ?? null}
                      onFolderClick={onParentFolderClick}
                    />
                  )}
                </div>
              </div>

              {/* Shared with column — intake action buttons when pending */}
              <div className="flex items-center gap-1">
                {isPending ? (
                  canManage && !isExternalPersona ? (
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        disabled={intakeActionInProgress === share.documentId}
                        onClick={() => onIntakeAction?.(share.documentId, intakeApproveAction)}
                        className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        <CheckCircle2 className="h-3 w-3" /> Approve
                      </button>
                      <button
                        type="button"
                        disabled={intakeActionInProgress === share.documentId}
                        onClick={() => onIntakeAction?.(share.documentId, intakeRejectAction)}
                        className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-[#fef2f2] text-[#991b1b] hover:bg-[#fee2e2] disabled:opacity-50 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" /> Reject
                      </button>
                    </div>
                  ) : isOwnPending ? (
                    <button
                      type="button"
                      disabled={intakeActionInProgress === share.documentId}
                      onClick={(e) => { e.stopPropagation(); onIntakeAction?.(share.documentId, intakeWithdrawAction) }}
                      className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-[#fef2f2] text-[#991b1b] hover:bg-[#fee2e2] disabled:opacity-50 transition-colors"
                    >
                      <X className="h-3 w-3" /> Withdraw Request
                    </button>
                  ) : null
                ) : (
                  <>
                    {ec && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="h-5 px-1.5 rounded bg-primary/10 text-primary flex items-center justify-center text-[9px] font-semibold shrink-0 cursor-default">EC</div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">{extCollaboratorLabel}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {guest && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="h-5 px-1.5 rounded bg-[#f3f4f6] text-[#45474c] flex items-center justify-center text-[9px] font-semibold shrink-0 cursor-default">EV</div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">{viewerLabel}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {!ec && !guest && <span className="text-[11px] text-slate-300">—</span>}
                  </>
                )}
              </div>

              {/* Shared by column */}
              <div className="flex items-center gap-1.5 min-w-0">
                {(showCreatorProfile || (!showCreatorProfile && samePerson && isModified)) && (
                  <TooltipProvider>
                    <ProfileBubbleWithPopup
                      name={share.createdByName || share.createdByEmail || 'Team Member'}
                      email={share.createdByEmail || ''}
                      avatarUrl={share.createdByAvatarUrl}
                      size="default"
                    />
                  </TooltipProvider>
                )}
                {showModifierProfile && share.updatedBy && (
                  <ModifierBubble
                    updatedBy={share.updatedBy}
                    updatedByEmail={share.updatedByEmail}
                    updatedByAvatarUrl={share.updatedByAvatarUrl}
                    updatedAt={share.updatedAt}
                    formatDate={formatDate}
                  />
                )}
              </div>

              {/* Modified column */}
              <div className="flex items-center">
                <RelativeDateTime
                  date={share.updatedAt}
                  textClassName="text-xs text-slate-500"
                  iconClassName="hidden"
                  tooltipSide="top"
                />
              </div>

              {/* Actions column */}
              <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="h-7 w-7 rounded-md inline-flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (isPending || !deeplinkBase || !share.documentId) return
                          navigator.clipboard.writeText(`${deeplinkBase}#doc-file:${share.documentId}`)
                          setLinkCopiedId(share.id)
                          setTimeout(() => setLinkCopiedId(null), 1500)
                        }}
                        disabled={isPending || !deeplinkBase || !share.documentId}
                      >
                        {linkCopiedId === share.id ? <Check className="h-4 w-4 text-primary" /> : <Link2 className="h-4 w-4" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">{deeplinkBase && share.documentId ? 'Copy link' : 'No link'}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {!isPending && !isFolder && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="h-7 w-7 rounded-md inline-flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                          onClick={(e) => { e.stopPropagation(); onOpenComments?.(share) }}
                        >
                          <MessagesSquare className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">Comments</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {!isPending && !isFolder && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="h-7 w-7 rounded-md inline-flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                          onClick={(e) => { e.stopPropagation(); onOpenPreview?.(share) }}
                        >
                          <ScanEye className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">Preview</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {isFolder && onOpenInFilesForFolder && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="h-7 w-7 rounded-md inline-flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                          onClick={(e) => { e.stopPropagation(); onOpenInFilesForFolder(share) }}
                        >
                          <FolderOpen className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">Open in Files</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {!isPending && !isFolder && onParentFolderClick && (share.parentId ?? generalFolderId) && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="h-7 w-7 rounded-md inline-flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                          onClick={(e) => { e.stopPropagation(); onParentFolderClick(share.parentId ?? generalFolderId!, share.parentName ?? 'General') }}
                        >
                          <FolderOpen className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">Go to folder</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                <DocumentActionMenu
                  document={getDocumentForMenu(share)}
                  showShareModal={canManage}
                  projectId={share.projectId}
                  onShareSaved={onShareSaved}
                  onOpenChange={(open) => setActionMenuOpenShareId(open ? share.id : null)}
                  onOpenDocument={() => handleSecureOpen(share)}
                  isExternalUser={isExternalPersona}
                  isExternalViewer={isExternalViewer}
                  disabled={isPending}
                  isDeliverable={true}
                  deliverableStatus={share.activity?.status ?? 'to_do'}
                  onUntagAsDeliverable={onUntagAsDeliverable}
                />
                {isRegrantingId === share.id && <LoadingSpinner size="sm" className="min-h-0 ml-0.5" />}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SharesGridView({
  shares,
  formatDate,
  getDocumentForMenu,
  canManage,
  onShareSaved,
  onOpenInFilesForFolder,
  handleSecureOpen,
  isRegrantingId,
  extCollaboratorLabel,
  viewerLabel,
  onOpenComments,
  onOpenPreview,
  onParentFolderClick,
  isExternalPersona,
  isExternalViewer,
  deeplinkBase,
  generalFolderId,
  currentUserId,
  onIntakeAction,
  intakeActionInProgress,
  onUntagAsDeliverable,
}: {
  shares: ShareRecord[]
  formatDate: (s: string) => string
  getDocumentForMenu: (s: ShareRecord) => { id: string; name: string; mimeType?: string; externalId: string }
  canManage: boolean
  onShareSaved: () => void
  onOpenInFilesForFolder?: (share: ShareRecord) => void
  handleSecureOpen: (share: ShareRecord) => void
  isRegrantingId: string | null
  extCollaboratorLabel: string
  viewerLabel: string
  onOpenComments?: (share: ShareRecord) => void
  onOpenPreview?: (share: ShareRecord) => void
  onParentFolderClick?: (parentId: string, parentName: string) => void
  isExternalPersona?: boolean
  isExternalViewer?: boolean
  deeplinkBase?: string
  generalFolderId?: string | null
  currentUserId?: string | null
  onIntakeAction?: (documentId: string, action: string) => void
  intakeActionInProgress?: string | null
  onUntagAsDeliverable?: (doc: { id: string }) => void
}) {
  return (
    <div className="flex flex-wrap gap-4 py-2">
      {shares.map((share) => (
        <ShareCard
          key={share.id}
          share={share}
          formatDate={formatDate}
          getDocumentForMenu={getDocumentForMenu}
          canManage={canManage}
          onShareSaved={onShareSaved}
          onOpenInFilesForFolder={onOpenInFilesForFolder}
          handleSecureOpen={handleSecureOpen}
          isRegrantingId={isRegrantingId}
          extCollaboratorLabel={extCollaboratorLabel}
          viewerLabel={viewerLabel}
          onOpenComments={onOpenComments}
          onOpenPreview={onOpenPreview}
          onParentFolderClick={onParentFolderClick}
          isExternalPersona={isExternalPersona}
          isExternalViewer={isExternalViewer}
          deeplinkBase={deeplinkBase}
          generalFolderId={generalFolderId}
          currentUserId={currentUserId}
          onIntakeAction={onIntakeAction}
          intakeActionInProgress={intakeActionInProgress}
          onUntagAsDeliverable={onUntagAsDeliverable}
        />
      ))}
    </div>
  )
}

function ShareCard({
  share,
  formatDate,
  getDocumentForMenu,
  canManage,
  onShareSaved,
  onOpenInFilesForFolder,
  handleSecureOpen,
  isRegrantingId,
  extCollaboratorLabel,
  viewerLabel,
  onOpenComments,
  onOpenPreview,
  onParentFolderClick,
  isExternalPersona,
  isExternalViewer,
  deeplinkBase,
  generalFolderId,
  currentUserId,
  onIntakeAction,
  intakeActionInProgress,
  onUntagAsDeliverable,
}: {
  share: ShareRecord
  formatDate: (s: string) => string
  getDocumentForMenu: (s: ShareRecord) => { id: string; name: string; mimeType?: string; externalId: string }
  canManage: boolean
  onShareSaved: () => void
  onOpenInFilesForFolder?: (share: ShareRecord) => void
  handleSecureOpen: (share: ShareRecord) => void
  isRegrantingId: string | null
  extCollaboratorLabel: string
  viewerLabel: string
  onOpenComments?: (share: ShareRecord) => void
  onOpenPreview?: (share: ShareRecord) => void
  onParentFolderClick?: (parentId: string, parentName: string) => void
  isExternalPersona?: boolean
  isExternalViewer?: boolean
  deeplinkBase?: string
  generalFolderId?: string | null
  currentUserId?: string | null
  onIntakeAction?: (documentId: string, action: string) => void
  intakeActionInProgress?: string | null
  onUntagAsDeliverable?: (doc: { id: string }) => void
}) {
  const isFolder = share.documentMimeType?.includes('folder')
  const [linkCopied, setLinkCopied] = useState(false)
  const isPending = !!share.pendingApproval
  const isOwnPending = isPending && !!currentUserId && share.pendingUploaderId === currentUserId
  const intakeApproveAction = isFolder ? 'approve-folder' : 'approve'
  const intakeRejectAction = isFolder ? 'reject-folder' : 'reject'
  const intakeWithdrawAction = isFolder ? 'withdraw-folder' : 'withdraw'

  const handleOpenSecure = () => handleSecureOpen(share)

  // Proxy URL — avoids Google CDN 429 by routing through our backend with OAuth token
  const proxyThumbnailUrl = share.thumbnailLink
    ? `/api/proxy/thumbnail/${encodeURIComponent(share.documentExternalId)}?firmId=${encodeURIComponent((share as any).organizationId ?? '')}&size=400`
    : null

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={isPending ? {} : { y: -2, boxShadow: '0 8px 24px -4px rgba(0,0,0,0.10)' }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className={cn(
        'group relative bg-white rounded border shadow-sm overflow-hidden flex flex-col w-[260px]',
        isPending ? 'border-dashed border-amber-200 opacity-70' : 'border-[#e5e7eb]'
      )}
    >
      {/* Thumbnail / Large Icon Area */}
      <div
        className={cn(
          "aspect-[16/10] bg-slate-50 border-b border-slate-100 overflow-hidden relative group/thumb",
          !isPending && "cursor-pointer",
          !proxyThumbnailUrl && "flex items-center justify-center"
        )}
        onClick={isPending ? undefined : handleOpenSecure}
        >

        {proxyThumbnailUrl ? (
          <div className="w-full h-full relative">
            <img
              src={proxyThumbnailUrl}
              alt={share.documentName}
              className="absolute inset-0 w-full h-full object-cover opacity-100 group-hover:scale-110 transition-transform duration-1000 ease-out"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity duration-500" />
          </div>
        ) : isFolder ? (
          <div className="w-full h-full bg-primary/10 flex items-center justify-center relative group-hover:bg-primary/20 transition-colors duration-500">
            <div className="transform group-hover:scale-110 transition-transform duration-700 ease-out">
              <SharedFolderIcon fillLevel={1} tooltip="shared" size={96} className="opacity-40" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/8 to-transparent" />
          </div>
        ) : (
          <div className="w-full h-full bg-slate-50 flex items-center justify-center relative group-hover:bg-primary/10/40 transition-colors duration-700">
            {/* Subtle Background Pattern/Gradient */}
            <div
              className="absolute inset-0 opacity-[0.03] pointer-events-none"
              style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #4285F4 1px, transparent 0)', backgroundSize: '24px 24px' }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-white/50 to-transparent pointer-events-none" />

            <div className="transform group-hover:scale-110 group-hover:rotate-1 transition-all duration-700 ease-out flex items-center justify-center z-10 drop-shadow-sm">
              <DocumentIcon mimeType={share.documentMimeType ?? undefined} size={80} />
            </div>
          </div>
        )}

        {/* Overlay Badge for MimeType */}
        {!isFolder && (
          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all duration-300 scale-90 group-hover:scale-100">
            <div className="bg-white/80 backdrop-blur-md px-2 py-0.5 rounded border border-[#e5e7eb]/80 shadow-sm text-[9px] font-semibold text-[#45474c] tracking-wider uppercase">
              {share.documentMimeType?.split('.').pop()?.split('/').pop()?.replace('vnd.google-apps.', '')}
            </div>
          </div>
        )}
      </div>

      {/* Title area */}
      <div className="bg-[#f9f9fb] px-4 pt-3 pb-2.5 border-b border-[#e5e7eb]">
        <div className="flex items-start gap-2.5">
          <DocumentIcon mimeType={share.documentMimeType ?? undefined} className="w-7 h-7 shrink-0 mt-0.5" />
          <div className="flex flex-col min-w-0 flex-1">
            <h3
              className={cn("font-semibold text-[#1b1b1d] text-[13px] leading-tight truncate transition-colors", !isPending && "cursor-pointer hover:text-primary")}
              title={share.documentName}
              onClick={isPending ? undefined : handleOpenSecure}
            >
              {share.documentName}
            </h3>
            <DocumentBreadcrumb
              parentName={share.parentName ?? (generalFolderId ? 'General' : null)}
              parentId={share.parentId ?? generalFolderId ?? null}
              onFolderClick={onParentFolderClick}
            />
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="px-4 pb-4 flex flex-col flex-1 bg-white relative">
        {/* DateTime + quick links row */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1.5">
            <RelativeDateTime
              date={share.createdAt}
              textClassName="text-xs text-slate-500"
              iconClassName="text-slate-300 hover:text-slate-500"
              tooltipSide="top"
            />
          </div>
          <div className="flex items-center gap-0.5">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (isPending || !deeplinkBase || !share.documentId) return
                      navigator.clipboard.writeText(`${deeplinkBase}#doc-file:${share.documentId}`)
                      setLinkCopied(true)
                      setTimeout(() => setLinkCopied(false), 1500)
                    }}
                    disabled={isPending || !deeplinkBase || !share.documentId}
                  >
                    {linkCopied ? <Check className="h-4 w-4 text-emerald-600" /> : <Link2 className="h-4 w-4" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">{deeplinkBase && share.documentId ? 'Copy link' : 'No link available'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {!isPending && !isFolder && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                      onClick={(e) => { e.stopPropagation(); onOpenComments?.(share) }}
                    >
                      <MessagesSquare className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">Comments</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {!isPending && !isFolder && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                      onClick={(e) => { e.stopPropagation(); onOpenPreview?.(share) }}
                    >
                      <ScanEye className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">Preview</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {isFolder && onOpenInFilesForFolder && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                      onClick={(e) => { e.stopPropagation(); onOpenInFilesForFolder(share) }}
                    >
                      <FolderOpen className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">Open in Files</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {!isPending && !isFolder && onParentFolderClick && (share.parentId ?? generalFolderId) && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                      onClick={(e) => { e.stopPropagation(); onParentFolderClick(share.parentId ?? generalFolderId!, share.parentName ?? 'General') }}
                    >
                      <FolderOpen className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">Go to folder</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <DocumentActionMenu
              document={getDocumentForMenu(share)}
              showShareModal={canManage}
              projectId={share.projectId}
              onShareSaved={onShareSaved}
              onOpenDocument={() => handleSecureOpen(share)}
              isExternalUser={isExternalPersona}
              isExternalViewer={isExternalViewer}
              disabled={isPending}
              isDeliverable={true}
              deliverableStatus={share.activity?.status ?? 'to_do'}
              onUntagAsDeliverable={onUntagAsDeliverable}
            />
            {isRegrantingId === share.id && (
              <LoadingSpinner size="sm" className="min-h-0 ml-1" />
            )}
          </div>
        </div>

        {/* Intake action buttons (pending state) */}
        {isPending && (
          <div className="mt-3 pt-3 -mx-4 px-4 border-t border-[#e5e7eb] space-y-2 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
            {canManage && !isExternalPersona && (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={intakeActionInProgress === share.documentId}
                  onClick={() => onIntakeAction?.(share.documentId, intakeApproveAction)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                </button>
                <button
                  type="button"
                  disabled={intakeActionInProgress === share.documentId}
                  onClick={() => onIntakeAction?.(share.documentId, intakeRejectAction)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded bg-[#fef2f2] text-[#991b1b] hover:bg-[#fee2e2] disabled:opacity-50 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Reject
                </button>
              </div>
            )}
            {isExternalPersona && isOwnPending && (
              <button
                type="button"
                disabled={intakeActionInProgress === share.documentId}
                onClick={() => onIntakeAction?.(share.documentId, intakeWithdrawAction)}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded bg-[#fef2f2] text-[#991b1b] hover:bg-[#fee2e2] disabled:opacity-50 transition-colors"
              >
                <X className="h-3.5 w-3.5" /> Withdraw Request
              </button>
            )}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#9a9ba0] w-14 shrink-0 whitespace-nowrap">Uploaded by</span>
              <TooltipProvider>
                <ProfileBubbleWithPopup
                  name={share.createdByName || share.createdByEmail || 'Team Member'}
                  email={share.createdByEmail || ''}
                  avatarUrl={share.createdByAvatarUrl}
                  size="default"
                />
              </TooltipProvider>
            </div>
          </div>
        )}

        {/* Shared by / Shared with rows (non-pending state) */}
        {!isPending && (
        <div className="mt-3 pt-3 -mx-4 px-4 border-t border-[#e5e7eb] space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#9a9ba0] w-14 shrink-0 whitespace-nowrap">Shared by</span>
            <TooltipProvider>
              <ProfileBubbleWithPopup
                name={share.createdByName || share.createdByEmail || 'Team Member'}
                email={share.createdByEmail || ''}
                avatarUrl={share.createdByAvatarUrl}
                size="default"
              />
            </TooltipProvider>
          </div>
          {(share.settings.externalCollaborator || share.settings.guest) && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#9a9ba0] w-14 shrink-0 whitespace-nowrap">Shared with</span>
              <div className="flex items-center gap-1">
                {share.settings.externalCollaborator && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="h-6 w-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-[9px] font-semibold shrink-0 cursor-default">EC</div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">{extCollaboratorLabel}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {share.settings.guest && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="h-6 w-6 rounded-lg bg-[#f3f4f6] text-[#45474c] flex items-center justify-center text-[9px] font-semibold shrink-0 cursor-default">EV</div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">{viewerLabel}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          )}
        </div>
        )}
      </div>

    </motion.div>
  )
}

type SharesViewMode = 'grid' | 'list' | 'board'

export function EngagementSharesTab({
  projectId,
  canManage = false,
  restrictToSharedOnly = false,
  isExternalViewer = false,
  roleSlug,
  connectorRootFolderId,
  orgName,
  clientName,
  projectName,
  onOpenInFiles,
  pathViewMode,
  deeplinkBase,
  orgSlug,
}: EngagementSharesTabProps) {
  const rightPane = useRightPane()
  const [shares, setShares] = useState<ShareRecord[]>([])
  const [generalFolderId, setGeneralFolderId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [finalizingId, setFinalizingId] = useState<string | null>(null)
  const [detailShareId, setDetailShareId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterOverdue, setFilterOverdue] = useState(false)
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [intakeActionInProgress, setIntakeActionInProgress] = useState<string | null>(null)
  const [openDeliverableId, setOpenDeliverableId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [approvedCollapsed, setApprovedCollapsed] = useState(false)
  // Stable ref — panel registers its setStatus here so drag-drop can update it without remounting
  const panelStatusSetterRef = React.useRef<((s: ActivityStatus) => void) | null>(null)

  // Clear highlight and hash when the right pane is closed externally (e.g. X button or tab switch)
  useEffect(() => {
    if (!rightPane.content) {
      setOpenDeliverableId(null)
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }, [rightPane.content])

  const { addToast } = useToast()

  const {
    handleSecureOpen,
    secureModalOpen,
    secureModalData,
    setSecureModalOpen,
    isRegrantingId,
    isRegrantLoading,
    regrantError,
  } = useSecureOpenDocument({
    projectId,
    logContext: 'ProjectShares',
  })

  const viewMode = (pathViewMode ?? 'grid') as SharesViewMode
  const { projExtCollaborator, projViewer } = useProjectPersonaLabels()

  const refreshData = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setIsLoading(false)
        return
      }
      const response = await fetch(`/api/projects/${projectId}/shares`, {
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      })
      if (!response.ok) throw new Error('Failed to fetch shares')
      const data = await response.json()
      setShares(data.shares || [])
      setGeneralFolderId(data.generalFolderId ?? null)
    } catch (error) {
      logger.error('Failed to fetch shares data', error instanceof Error ? error : new Error(String(error)), 'ProjectShares', { projectId })
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    refreshData()
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUserEmail(session?.user?.email ?? null)
      setCurrentUserId(session?.user?.id ?? null)
    })
  }, [refreshData])

  const saveOrder = useCallback(async (
    toDo: string[], inProgress: string[], inReview: string[], approved: string[],
    rollback: () => void,
    onComplete: () => void,
  ) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const res = await fetch(`/api/projects/${projectId}/shares/order`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_do: toDo, in_progress: inProgress, in_review: inReview, approved }),
      })
      if (!res.ok) throw new Error(`Order save failed: ${res.status}`)
    } catch (e) {
      logger.error('Failed to save order', e instanceof Error ? e : new Error(String(e)), 'ProjectShares', {})
      rollback()
      addToast({ type: 'error', title: 'Move failed', message: 'Could not save the new position. The board has been restored.' })
    } finally {
      onComplete()
    }
  }, [projectId, addToast])

  const handleFinalize = async (shareId: string, documentId: string) => {
    setFinalizingId(shareId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const res = await fetch(
        `/api/projects/${projectId}/documents/${encodeURIComponent(documentId)}/sharing/finalize`,
        { method: 'PATCH', headers: { Authorization: `Bearer ${session.access_token}` } }
      )
      if (!res.ok) throw new Error('Failed to finalize')
      await refreshData()
      setDetailShareId(null)
    } catch (e) {
      logger.error('Failed to finalize share', e instanceof Error ? e : new Error(String(e)), 'ProjectShares', { shareId })
    } finally {
      setFinalizingId(null)
    }
  }

  const handleUntagAsDeliverable = useCallback(async (doc: { id: string }) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const res = await fetch(
        `/api/projects/${projectId}/documents/${encodeURIComponent(doc.id)}/sharing`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ untagAsDeliverable: true }),
        }
      )
      if (!res.ok) {
        logger.error('Untag as deliverable failed', new Error(`${res.status}`), 'ProjectShares', { documentId: doc.id })
        addToast({ type: 'error', title: 'Untag failed', message: 'Could not remove the deliverable tag. Please try again.' })
        return
      }
      setShares((prev) => prev.filter((s) => s.documentId !== doc.id))
      if (openDeliverableId === doc.id) setOpenDeliverableId(null)
      addToast({ type: 'success', title: 'Deliverable removed', message: 'The document has been untagged as a deliverable.' })
    } catch (e) {
      logger.error('Untag as deliverable error', e instanceof Error ? e : new Error(String(e)), 'ProjectShares', { documentId: doc.id })
      addToast({ type: 'error', title: 'Untag failed', message: 'Could not remove the deliverable tag. Please try again.' })
    }
  }, [projectId, addToast, openDeliverableId])

  const handleIntakeAction = useCallback(async (documentId: string, action: string) => {
    if (intakeActionInProgress) return
    setIntakeActionInProgress(documentId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/projects/${projectId}/documents/${encodeURIComponent(documentId)}/intake`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const errText = await res.text()
        logger.error('Intake action failed', new Error(errText), 'SharesTab', { documentId, action })
        addToast({ type: 'error', title: 'Action failed', message: 'Could not complete the intake action. Please try again.' })
        return
      }
      await refreshData()
    } finally {
      setIntakeActionInProgress(null)
    }
  }, [projectId, refreshData, intakeActionInProgress])

  const formatDate = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true })
    } catch {
      return dateString
    }
  }

  const getPersonaDisplayName = (by: string) => {
    if (by === 'external_collaborator') return projExtCollaborator
    if (by === 'guest') return projViewer
    return by
  }

  const getDocumentForMenu = (share: ShareRecord) => ({
    id: share.documentId,
    projectDocumentId: share.documentId,
    name: share.documentName,
    mimeType: share.documentMimeType ?? undefined,
    externalId: share.documentExternalId,
    modifiedTime: share.updatedAt,
    createdTime: share.createdAt,
    projectId: share.projectId,
    isGuest: share.settings?.guest ?? false,
    webViewLink: share.webViewLink,
    sharePdfOnly: share.settings?.guestOptions?.sharePdfOnly ?? false,
    sharedPdfDriveId: share.settings?.guestOptions?.sharedPdfDriveId ?? null,
    allowDownload: share.settings?.guestOptions?.allowDownload ?? false,
    isExternalCollaborator: share.settings?.externalCollaborator ?? false,
    ecAllowDownload: share.settings?.ecOptions?.allowDownload ?? false,
    lastModifyingUser: (share.updatedByName || share.updatedByEmail || share.createdByName || share.createdByEmail)
      ? { displayName: share.updatedByName || share.updatedByEmail || share.createdByName || share.createdByEmail }
      : undefined,
  })

  const handleOpenInFilesForFolder = useCallback(
    (share: ShareRecord) => {
      if (!onOpenInFiles || !share.documentMimeType?.includes('folder')) return
      // Navigate to the folder's PARENT and highlight the folder itself so the user sees it in context.
      // Fall back to navigating into the folder if parent info is unavailable.
      const targetId = share.parentId ?? share.documentExternalId
      const targetName = share.parentName ?? share.documentName
      const breadcrumbs: FilesBreadcrumbItem[] = [
        { id: 'org', name: orgName ?? 'Organization', clickable: false },
        { id: 'client', name: clientName ?? 'Client', clickable: false },
        { id: connectorRootFolderId ?? 'project', name: projectName ?? 'Project', clickable: false },
        { id: targetId, name: targetName, clickable: true },
      ]
      onOpenInFiles(targetId, breadcrumbs, `doc-file:${share.documentId}`)
    },
    [onOpenInFiles, orgName, clientName, projectName, connectorRootFolderId]
  )

  const handleOpenParentFolder = useCallback(
    (parentId: string, parentName: string) => {
      if (!onOpenInFiles) return
      const breadcrumbs: FilesBreadcrumbItem[] = [
        { id: 'org', name: orgName ?? 'Organization', clickable: false },
        { id: 'client', name: clientName ?? 'Client', clickable: false },
        { id: connectorRootFolderId ?? 'project', name: projectName ?? 'Project', clickable: false },
        { id: parentId, name: parentName, clickable: true },
      ]
      onOpenInFiles(parentId, breadcrumbs)
    },
    [onOpenInFiles, orgName, clientName, projectName, connectorRootFolderId]
  )

  const handleOpenDeliverableDetail = useCallback(
    (share: ShareRecord) => {
      setOpenDeliverableId(share.id)
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#doc-file:${share.documentId}`)
      rightPane.setTitle(share.docId ?? share.documentName)
      rightPane.setHeaderSubtitle(share.documentName)
      rightPane.setHeaderIcon(<PackagePlus className="h-4 w-4" />)
      rightPane.setIconTooltip('Deliverable')
      rightPane.setPaneSize('medium')
      rightPane.setContent(
        <DeliverableDetailPanel
          documentId={share.documentId}
          projectId={projectId}
          docId={share.docId ?? null}
          fileName={share.documentName}
          activityStatus={share.activity?.status ?? 'to_do'}
          dueDate={share.dueDate ?? null}
          canManage={canManage ?? false}
          isExternalViewer={isExternalViewer}
          isExternalCollaborator={restrictToSharedOnly && !isExternalViewer}
          roleSlug={roleSlug}
          orgSlug={orgSlug}
          deeplinkBase={deeplinkBase}
          onStatusChange={(newStatus) => {
            setShares((prev) =>
              prev.map((s) =>
                s.id === share.id
                  ? { ...s, activity: { ...(s.activity ?? { updatedAt: new Date().toISOString() }), status: newStatus } }
                  : s
              )
            )
          }}
          onSubtaskStatusChange={(total, approved) => {
            setShares((prev) =>
              prev.map((s) =>
                s.id === share.id
                  ? { ...s, subtaskCount: total, approvedSubtaskCount: approved }
                  : s
              )
            )
          }}
          externalStatusRef={panelStatusSetterRef}
          onClose={() => { setOpenDeliverableId(null); rightPane.clearPane(); window.history.replaceState(null, '', window.location.pathname + window.location.search) }}
        />
      )
    },
    [rightPane, projectId, canManage, isExternalViewer, orgSlug, roleSlug, restrictToSharedOnly]
  )

  // Capture the hash at mount so re-renders don't lose it before shares load
  const initialHashRef = React.useRef(typeof window !== 'undefined' ? window.location.hash : '')
  const deeplinkHandledRef = React.useRef(false)

  // Deeplink: #doc-file:<projectDocumentId> → open that deliverable's detail panel
  useEffect(() => {
    if (isLoading || shares.length === 0 || deeplinkHandledRef.current) return
    const match = initialHashRef.current.match(/^#doc-file:([^:]+)$/)
    if (!match) return
    const docId = match[1]
    const share = shares.find((s) => s.documentId === docId)
    if (share) {
      deeplinkHandledRef.current = true
      handleOpenDeliverableDetail(share)
    }
  }, [isLoading, shares, handleOpenDeliverableDetail])

  const handleSecureOpenShare = useCallback(
    (share: ShareRecord) => {
      if (share.documentMimeType?.includes('folder')) {
        if (share.activity) {
          handleOpenDeliverableDetail(share)
          return
        }
        handleOpenInFilesForFolder(share)
        return
      }
      handleSecureOpen(
        {
          documentId: share.documentId,
          fileName: share.documentName,
          mimeType: share.documentMimeType ?? undefined,
          externalId: share.documentExternalId,
          firmId: (share as any).firmId,
        },
        share.id
      )
    },
    [handleSecureOpen, handleOpenInFilesForFolder, handleOpenDeliverableDetail]
  )

  // Computed early so byLane (board) and list/grid views share the same filtered result
  const filteredShares = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return shares.filter((s) => {
      if (q.length > 0) {
        const hay = [s.documentName, s.docId, s.createdByEmail, s.updatedByEmail, s.createdBy, s.updatedBy]
          .filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (filterOverdue) {
        if (!s.dueDate) return false
        if (new Date(s.dueDate).getTime() >= Date.now()) return false
      }
      return true
    })
  }, [shares, searchQuery, filterOverdue])

  const byLane = React.useMemo(() => {
    const toDo: ShareRecord[] = []
    const inProgress: ShareRecord[] = []
    const inReview: ShareRecord[] = []
    const done: ShareRecord[] = []
    // Use filteredShares so search/type/date filters apply on board view too
    filteredShares.forEach((s) => {
      // Board visibility for EC/EV: any deliverable that has been given an activity status
      // (i.e. has entered the board workflow) is visible, regardless of current lane.
      // canViewDeliverable controls which lanes sharing rows are written to, not board visibility.
      if (restrictToSharedOnly && !s.activity?.status) return
      const status = s.activity?.status ?? 'to_do'
      const orderIndex = s.activity?.orderIndex ?? 0
      const rec = { ...s, _orderIndex: orderIndex }
      if (status === 'in_progress') inProgress.push(rec)
      else if (status === 'in_review') inReview.push(rec)
      else if (status === 'approved' || (status as string) === 'done') done.push(rec)
      else toDo.push(rec)
    })
    toDo.sort((a, b) => (a._orderIndex ?? 0) - (b._orderIndex ?? 0))
    inProgress.sort((a, b) => (a._orderIndex ?? 0) - (b._orderIndex ?? 0))
    inReview.sort((a, b) => (a._orderIndex ?? 0) - (b._orderIndex ?? 0))
    done.sort((a, b) => (a._orderIndex ?? 0) - (b._orderIndex ?? 0))
    return { to_do: toDo, in_progress: inProgress, in_review: inReview, approved: done }
  }, [filteredShares, restrictToSharedOnly])

  const laneOrder = React.useMemo(() => ({
    to_do: byLane.to_do.map((s) => s.id),
    in_progress: byLane.in_progress.map((s) => s.id),
    in_review: byLane.in_review.map((s) => s.id),
    approved: byLane.approved.map((s) => s.id),
  }), [byLane])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: savingId ? { distance: Infinity } : { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: savingId ? { delay: 9999999, tolerance: 0 } : { delay: 150, tolerance: 8 } })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (!over) return
    const shareId = active.id as string
    const overId = String(over.id)
    let targetLane: ActivityStatus
    let insertIndex: number
    if (['to_do', 'in_progress', 'in_review', 'approved'].includes(overId)) {
      targetLane = overId as ActivityStatus
      insertIndex = laneOrder[targetLane].length
    } else {
      const overShare = shares.find((s) => s.id === overId)
      if (!overShare) return
      targetLane = (overShare.activity?.status ?? 'to_do') as ActivityStatus
      insertIndex = laneOrder[targetLane].indexOf(overId)
      if (insertIndex < 0) insertIndex = laneOrder[targetLane].length
    }

    const share = shares.find((s) => s.id === shareId)
    const currentLane = (share?.activity?.status ?? 'to_do') as ActivityStatus

    // Check allowed transitions — single source of truth from deliverable-stage-roles.ts
    const allowed = roleSlug ? getAllowedTransitions(roleSlug, currentLane) : []
    if (targetLane === currentLane) {
      // Same-lane reorder is always allowed if the user can see the lane
    } else if (!allowed.includes(targetLane)) {
      if (currentLane === 'approved') {
        addToast({ type: 'error', title: 'Cannot move back', message: 'Approved deliverables cannot be moved.' })
      } else {
        addToast({ type: 'error', title: 'Move not allowed', message: 'You cannot move this deliverable to that stage.' })
      }
      return
    }

    if (targetLane === 'approved') {
      const total = share?.subtaskCount ?? 0
      const approved = share?.approvedSubtaskCount ?? 0
      if (total > 0 && approved < total) {
        const unapproved = total - approved
        addToast({
          type: 'error',
          title: 'Cannot approve yet',
          message: `${unapproved} document${unapproved > 1 ? 's' : ''} still need to be approved before this deliverable can be approved.`,
        })
        return
      }
    }
    const newToDo = laneOrder.to_do.filter((id) => id !== shareId)
    const newInProgress = laneOrder.in_progress.filter((id) => id !== shareId)
    const newInReview = laneOrder.in_review.filter((id) => id !== shareId)
    const newDone = laneOrder.approved.filter((id) => id !== shareId)
    const insertAt = (arr: string[], id: string, idx: number) => {
      const out = arr.slice()
      out.splice(idx, 0, id)
      return out
    }
    const finalToDo = targetLane === 'to_do' ? insertAt(newToDo, shareId, insertIndex) : newToDo
    const finalInProgress = targetLane === 'in_progress' ? insertAt(newInProgress, shareId, insertIndex) : newInProgress
    const finalInReview = targetLane === 'in_review' ? insertAt(newInReview, shareId, insertIndex) : newInReview
    const finalDone = targetLane === 'approved' ? insertAt(newDone, shareId, insertIndex) : newDone

    // Snapshot for rollback
    const previousShares = shares

    // Optimistic update — reorder and update status immediately
    const allFinal = [...finalToDo, ...finalInProgress, ...finalInReview, ...finalDone]
    let updatedShare: ShareRecord | null = null
    setShares((prev) =>
      allFinal.map((id, idx) => {
        const s = prev.find((x) => x.id === id)!
        const lane =
          finalToDo.includes(id) ? 'to_do' :
          finalInProgress.includes(id) ? 'in_progress' :
          finalInReview.includes(id) ? 'in_review' : 'approved'
        const updated = {
          ...s,
          activity: { ...(s.activity ?? { updatedAt: new Date().toISOString() }), status: lane as ActivityStatus, orderIndex: idx },
          _orderIndex: idx,
        }
        if (id === shareId) updatedShare = updated
        return updated
      })
    )

    // If the dragged card is currently open in the detail panel, push the new status directly
    if (shareId === openDeliverableId && targetLane !== currentLane) {
      panelStatusSetterRef.current?.(targetLane)
    }

    setSavingId(shareId)
    const rollback = () => setShares(previousShares)
    const onComplete = () => setSavingId(null)

    if (canManage) {
      // EL: full reorder via shares/order (handles orderIndex + EC/EV flag updates)
      saveOrder(finalToDo, finalInProgress, finalInReview, finalDone, rollback, onComplete)
    } else {
      // EM / EC / EV: single-deliverable status change via sharing/activity
      const documentId = share?.documentId
      if (!documentId) { rollback(); onComplete(); return }
      ;(async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (!session?.access_token) throw new Error('No session')
          const res = await fetch(`/api/projects/${projectId}/documents/${encodeURIComponent(documentId)}/sharing/activity`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: targetLane }),
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err.error ?? `Status ${res.status}`)
          }
          addToast({ type: 'success', title: 'Stage updated', message: `Moved to ${STATUS_LABELS[targetLane]}.` })
        } catch (e) {
          logger.error('Failed to update deliverable status', e instanceof Error ? e : new Error(String(e)), 'ProjectShares', {})
          rollback()
          addToast({ type: 'error', title: 'Move failed', message: 'Could not update status. The board has been restored.' })
        } finally {
          onComplete()
        }
      })()
    }
  }

  const detailShare = detailShareId ? shares.find((s) => s.id === detailShareId) : null

  const handleOpenComments = useCallback(
    (share: ShareRecord) => {
      rightPane.setTitle('Comments')
      rightPane.setHeaderSubtitle(share.documentName)
      rightPane.setHeaderIcon(<MessagesSquare className="h-4 w-4" />)
      rightPane.setContent(
        <DocumentDocCommentsPane
          engagementId={share.projectId}
          documentId={share.documentId}
          documentName={share.documentName}
          documentMimeType={share.documentMimeType ?? undefined}
          orgSlug={orgSlug}
        />
      )
    },
    [rightPane]
  )

  const handleOpenPreview = useCallback(
    (share: ShareRecord) => {
      rightPane.setTitle(share.documentName || 'Preview')
      rightPane.setHeaderSubtitle('')
      rightPane.setHeaderIcon(<ScanEye className="h-4 w-4" />)
      rightPane.setContent(
        <DocumentBlobPreviewPane
          document={{ id: share.documentId, name: share.documentName }}
          projectId={share.projectId}
        />
      )
    },
    [rightPane]
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar: on background, outside the card */}
      <div className="shrink-0 pt-1 pb-2.5 flex items-center gap-2">
        {/* Left: filters */}
        <div className="flex items-center gap-2">
          {/* Overdue toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFilterOverdue((v) => !v)}
            className={cn("h-8 gap-1.5 text-xs rounded border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors", filterOverdue ? "bg-red-50 border-red-300 text-red-700 ring-1 ring-red-200 hover:bg-red-50 hover:text-red-700" : "bg-white")}
          >
            <Clock className="h-3 w-3 opacity-60" />
            Overdue
          </Button>


        </div>

        {/* Right: refresh + search */}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={refreshData}
            className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Quick search ..."
              className="pl-9 pr-8 h-8 text-sm border-slate-200 w-56 rounded"
            />
            {searchQuery.trim().length > 0 && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className={cn('flex flex-1 overflow-hidden gap-4 rounded', viewMode === 'board' ? 'bg-white min-h-[calc(100vh-220px)]' : 'min-h-0 bg-white border border-[#e5e7eb]')}>
        <div className={cn('flex-1 min-w-0 overflow-auto rounded', viewMode === 'list' ? 'bg-white' : viewMode === 'board' ? 'bg-white p-4' : 'bg-white p-4')}>
          {isLoading ? (
            <div className="flex items-center justify-center min-h-[200px]">
              <LoadingSpinner size="md" className="min-h-0" />
            </div>
          ) : filteredShares.length === 0 && viewMode === 'board' && !connectorRootFolderId ? (
            <SandboxBoardPreview projectName={projectName} />
          ) : filteredShares.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-white/60 rounded-2xl border border-slate-200/60 mx-2">
              <Share2 className="h-11 w-11 mb-3 text-slate-300" />
              <p className="text-sm font-medium text-slate-600">
                {searchQuery.trim().length > 0 || filterOverdue ? 'No matches' : 'No deliverables yet'}
              </p>
              <p className="text-xs mt-1 text-slate-400">
                {searchQuery.trim().length > 0 || filterOverdue
                  ? 'Try adjusting your search or filter.'
                  : 'Mark a folder as a Deliverable from the Files tab to see it here'}
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            <SharesGridView
              shares={filteredShares}
              formatDate={formatDate}
              getDocumentForMenu={getDocumentForMenu}
              canManage={canManage}
              onShareSaved={refreshData}
              onOpenInFilesForFolder={onOpenInFiles ? handleOpenInFilesForFolder : undefined}
              handleSecureOpen={handleSecureOpenShare}
              isRegrantingId={isRegrantingId}
              extCollaboratorLabel={projExtCollaborator}
              viewerLabel={projViewer}
              onOpenComments={handleOpenComments}
              onOpenPreview={handleOpenPreview}
              onParentFolderClick={onOpenInFiles ? handleOpenParentFolder : undefined}
              isExternalPersona={restrictToSharedOnly}
              isExternalViewer={isExternalViewer}
              deeplinkBase={deeplinkBase}
              generalFolderId={generalFolderId}
              currentUserId={currentUserId}
              onIntakeAction={handleIntakeAction}
              intakeActionInProgress={intakeActionInProgress}
              onUntagAsDeliverable={handleUntagAsDeliverable}
            />
          ) : viewMode === 'list' ? (
            <SharesListView
              shares={filteredShares}
              formatDate={formatDate}
              getDocumentForMenu={getDocumentForMenu}
              canManage={canManage}
              onShareSaved={refreshData}
              onOpenInFilesForFolder={onOpenInFiles ? handleOpenInFilesForFolder : undefined}
              handleSecureOpen={handleSecureOpenShare}
              isRegrantingId={isRegrantingId}
              extCollaboratorLabel={projExtCollaborator}
              viewerLabel={projViewer}
              onOpenComments={handleOpenComments}
              onOpenPreview={handleOpenPreview}
              onParentFolderClick={onOpenInFiles ? handleOpenParentFolder : undefined}
              isExternalPersona={restrictToSharedOnly}
              isExternalViewer={isExternalViewer}
              deeplinkBase={deeplinkBase}
              generalFolderId={generalFolderId}
              currentUserId={currentUserId}
              onIntakeAction={handleIntakeAction}
              intakeActionInProgress={intakeActionInProgress}
              onUntagAsDeliverable={handleUntagAsDeliverable}
            />
          ) : (
            <>
              <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <div
                  className="grid gap-4 min-h-[360px] items-start"
                  style={{ gridTemplateColumns: approvedCollapsed ? 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) 36px' : 'repeat(4, minmax(0, 1fr))' }}
                >
                  {LANES.map((lane) => {
                    const laneCount = byLane[lane.status].length
                    const totalCount = filteredShares.length
                    const lanePct = totalCount > 0 ? (laneCount / totalCount) * 100 : 0
                    const theme = LANE_THEME[lane.status]

                    if (lane.status === 'approved' && approvedCollapsed) {
                      return (
                        <motion.div
                          key={lane.status}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className={cn('flex flex-col items-center rounded border overflow-hidden cursor-pointer select-none py-3 gap-2', theme.headerBg, theme.headerBorder)}
                          onClick={() => setApprovedCollapsed(false)}
                          title={`${laneCount} Approved — click to expand`}
                        >
                          <div className={cn('rounded p-1', lane.iconBg)}>
                            {lane.icon}
                          </div>
                          <span className={cn('text-[10px] font-bold tabular-nums', theme.labelColor)}>{laneCount}</span>
                          <div className="flex-1 flex items-center justify-center">
                            <span
                              className={cn('text-[10px] font-semibold whitespace-nowrap opacity-80', theme.labelColor)}
                              style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}
                            >
                              Approved
                            </span>
                          </div>
                          <ChevronRight className={cn('h-3 w-3 opacity-60', theme.labelColor)} />
                        </motion.div>
                      )
                    }

                    return (
                      <motion.div
                        key={lane.status}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col"
                      >
                        {/* Swimlane header: its own card, separate from the body */}
                        <div className={cn('flex flex-col rounded border overflow-hidden shrink-0', theme.headerBg, theme.headerBorder)}>
                          <div className="flex items-center gap-2 px-3 py-2.5">
                            <div className={cn('rounded p-1', lane.iconBg)}>
                              {lane.icon}
                            </div>
                            <span className={cn('text-xs font-semibold', theme.labelColor)}>{lane.label}</span>
                            <span className={cn('text-[11px] ml-0.5 tabular-nums px-1.5 py-0.5 rounded font-medium', theme.countBg, theme.countColor)}>
                              {totalCount > 0 ? `${laneCount}/${totalCount}` : laneCount}
                            </span>
                            {lane.status === 'approved' && (
                              <button
                                onClick={() => setApprovedCollapsed(true)}
                                className={cn('ml-auto transition-colors shrink-0 opacity-60 hover:opacity-100', theme.labelColor)}
                                title="Collapse Approved column"
                              >
                                <ChevronLeft className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                          {/* Mini progress bar */}
                          <div className="h-1 bg-black/5 shrink-0">
                            <div
                              className="h-full transition-all duration-300"
                              style={{ width: `${lanePct}%`, backgroundColor: theme.progressColor }}
                            />
                          </div>
                        </div>
                        {/* Swimlane body: gray container sized to its contents, not the tallest column */}
                        <DroppableLane id={lane.status} className="flex flex-col mt-2 rounded bg-[#f9f9fb] p-3 gap-2.5">
                          {(isOver) => (
                            <>
                              <AnimatePresence mode="popLayout">
                                {byLane[lane.status].map((share) => (
                                  <DraggableCard
                                    key={share.id}
                                    id={share.id}
                                    share={share}
                                    laneStatus={lane.status}
                                    formatDate={formatDate}
                                    getDocumentForMenu={getDocumentForMenu}
                                    showActions
                                    canManage={canManage}
                                    isApprovedLane={lane.status === 'approved'}
                                    onShareSaved={refreshData}
                                    handleSecureOpen={handleSecureOpenShare}
                                    isRegrantingId={isRegrantingId}
                                    onOpenComments={handleOpenComments}
                                    onOpenPreview={handleOpenPreview}
                                    extCollaboratorLabel={projExtCollaborator}
                                    viewerLabel={projViewer}
                                    onParentFolderClick={onOpenInFiles ? handleOpenParentFolder : undefined}
                                    onOpenInFilesForFolder={onOpenInFiles ? handleOpenInFilesForFolder : undefined}
                                    onOpenDetail={handleOpenDeliverableDetail}
                                    isDetailOpen={share.id === openDeliverableId}
                                    isPaneOpen={!!openDeliverableId}
                                    isExternalPersona={restrictToSharedOnly}
                                    isExternalViewer={isExternalViewer}
                                    deeplinkBase={deeplinkBase}
                                    generalFolderId={generalFolderId}
                                    currentUserId={currentUserId}
                                    onIntakeAction={handleIntakeAction}
                                    intakeActionInProgress={intakeActionInProgress}
                                    isSaving={savingId === share.id}
                                    onUntagAsDeliverable={handleUntagAsDeliverable}
                                  />
                                ))}
                              </AnimatePresence>
                              {laneCount === 0 && (
                                <div
                                  className={cn(
                                    'h-[164px] rounded border border-dashed flex items-center justify-center text-[11px] font-medium transition-colors',
                                    isOver
                                      ? 'border-primary/40 text-primary bg-primary/5'
                                      : 'border-[#d8d9dd] text-[#b4b5ba]'
                                  )}
                                >
                                  Drop here
                                </div>
                              )}
                            </>
                          )}
                        </DroppableLane>
                      </motion.div>
                    )
                  })}
                </div>

                <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
                  {activeId ? (() => {
                    const share = shares.find((s) => s.id === activeId)
                    if (!share) return null
                    const status = (share.activity?.status ?? 'to_do') as ActivityStatus
                    const accent = CARD_ACCENT[status]
                    return (
                      <div
                        className="rounded overflow-hidden w-[280px] border border-[#e5e7eb] bg-white shadow-xl scale-[1.03]"
                        style={{ cursor: 'grabbing' }}
                      >
                        <ShareCardContent
                          share={share}
                          iconPillBg={CARD_ACCENT[status].iconPillBg}
                          laneStatus={status}
                          formatDate={formatDate}
                          getDocumentForMenu={getDocumentForMenu}
                          showActions={false}
                          canManage={false}
                          isApprovedLane={false}
                          handleSecureOpen={handleSecureOpenShare}
                          isRegrantingId={isRegrantingId}
                          onOpenComments={handleOpenComments}
                          onOpenPreview={handleOpenPreview}
                          extCollaboratorLabel={projExtCollaborator}
                          viewerLabel={projViewer}
                          onParentFolderClick={onOpenInFiles ? handleOpenParentFolder : undefined}
                          generalFolderId={generalFolderId}
                        />
                      </div>
                    )
                  })() : null}
                </DragOverlay>
              </DndContext>
            </>
          )}
        </div>
      </div>

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
