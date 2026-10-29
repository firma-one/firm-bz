'use client'

import React, { useState, useEffect, useCallback } from 'react'
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
  type DragOverEvent,
  type DragStartEvent,
  type DraggableAttributes,
} from '@dnd-kit/core'
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities'
import { Ban, Share2, User, Lock, GripVertical, FolderOpen, Clock, Copy, Check, Search, MessagesSquare, Link2, ScanEye, X, RefreshCw, ChevronDown, ChevronLeft, ChevronRight, Filter, CheckCircle2, Trash2, BookOpenText, CalendarDays, AlertTriangle, CalendarClock } from 'lucide-react'
import { ProfileBubbleWithPopup } from '@/components/ui/profile-bubble-popup'
import { DocumentBreadcrumb } from '@/components/ui/document-breadcrumb'
import { DocumentIcon } from '@/components/ui/document-icon'
import { DeliverableIcon } from '@/components/ui/deliverable-icon'
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
import { Hint, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { StatusIcon } from '@/components/ui/status-icon'
import { StatusPill } from '@/components/ui/status-pill'
import { interactiveCardClass } from '@/components/ui/interactive-card'
import { STAGE_BAR_CLASSES, STAGE_LANE_CLASSES, STATUS, type LaneStage } from '@/lib/ui/status'
import { FRESH_CHIP_CLASS, useApprovalFeedback } from '@/lib/ui/use-approval-feedback'
import { SecureAccessModal } from './secure-access-modal'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { supabase } from '@/lib/supabase'
import { useSecureOpenDocument } from '@/lib/use-secure-open-document'
import { logger } from '@/lib/logger'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import { displayFolderName, splitFolderOrdinal } from '@/lib/display-names'
import { DocumentDocCommentsPane } from '@/components/projects/document-doc-comments-pane'
import { DocumentPreviewPane } from '@/components/files/document-preview-pane'
import { formatDistanceToNow } from 'date-fns'
import { cn, formatFullDate } from '@/lib/utils'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useProjectPersonaLabels } from '@/lib/hooks/use-project-persona-labels'
import { useToast } from '@/components/ui/toast'
import type { EngagementRoleSlug } from '@/lib/deliverable-stage-roles'
import { initialsOf } from '@/lib/initials'

import { BOARD_STAGES, type ActivityStatus, type BoardStage } from '@/lib/sharing-settings'
import type { BlockedReason } from '@/lib/files/blocked'
import { BlockedCountChip } from '@/components/files/blocked-tag'

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
  /** Its documents the firm has marked blocked (the shares route sends them to firm roles only). */
  blockedDocuments?: { documentId: string; docId: string | null; fileName: string; reason: BlockedReason }[]
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

/**
 * Board lanes in the status language (.claude/plans/app-design-refinements.md, section 5): each lane
 * is a StatusPill header over its cards, tinted by its stage. Labels, icons and colors all come from
 * lib/ui/status.ts, so the Board reads the same as every other status in the app.
 */
const LANES: { status: BoardStage; stage: LaneStage; label: string }[] = BOARD_STAGES.map((status) => ({ status, stage: laneStage(status), label: STATUS.deliverable[status].label }))

function laneStage(status: ActivityStatus): LaneStage {
  // Every deliverable stage is a lane stage (asserted in lib/ui/status.test.ts).
  return STATUS.deliverable[status].stage as LaneStage
}

function getInitials(nameOrEmail: string | null | undefined): string {
  // Remove UUIDs if they accidentally leak in
  if (nameOrEmail && nameOrEmail.length > 30 && nameOrEmail.includes('-')) return '?'
  return initialsOf(nameOrEmail)
}

function DroppableLane({
  id,
  children,
  className,
}: {
  id: string
  children: React.ReactNode
  className?: string
}) {
  const { setNodeRef } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={className}>
      {children}
    </div>
  )
}

function DraggableCard({
  id,
  share,
  laneStatus,
  formatDate,
  getDocumentForMenu,
  showActions,
  canManage,
  justApproved,
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
  /** Just moved into Approved by this user: its status icon fades in (useApprovalFeedback). */
  justApproved?: boolean
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
  // Dragged only to reorder its lane, which is the firm's to arrange (a deliverable's stage follows its documents).
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, disabled: !canManage })
  const { setNodeRef: setDropRef } = useDroppable({ id })

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
      // While it's dragged, the card's old spot stays behind at 35% (the lifted copy is the DragOverlay).
      animate={{ opacity: isDragging ? 0.35 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{
        scale: { type: 'spring', stiffness: 400, damping: 30 },
        opacity: { duration: 0.18, ease: 'easeOut' },
      }}
      className={cn(
        interactiveCardClass(),
        'relative overflow-hidden select-none',
        isDetailOpen && 'ring-1 ring-fg-subtle',
        isBlocked && 'opacity-60 blur-[1.5px] saturate-50',
        isSaving && 'pointer-events-none'
      )}
    >
      {isSaving && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/60 backdrop-blur-[1px] rounded">
          <LoadingSpinner size="sm" className="text-fg-subtle" />
        </div>
      )}
      <ShareCardContent
        share={share}
        laneStatus={laneStatus}
        justApproved={justApproved}
        formatDate={formatDate}
        getDocumentForMenu={getDocumentForMenu}
        showActions={showActions}
        canManage={canManage}
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
  laneStatus,
  justApproved,
  formatDate,
  getDocumentForMenu,
  showActions,
  canManage,
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
  laneStatus?: ActivityStatus
  justApproved?: boolean
  formatDate: (s: string) => string
  getDocumentForMenu: (s: ShareRecord) => { id: string; name: string; mimeType?: string; externalId: string }
  showActions: boolean
  canManage: boolean
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
  const status = (laneStatus ?? share.activity?.status ?? 'to_do') as ActivityStatus
  const { stage, label: statusLabel } = STATUS.deliverable[status]
  // The status language: the stage's icon before the code (or the title), named for screen readers.
  const statusIcon = (
    <StatusIcon stage={stage} size={13} label={statusLabel} className={cn(justApproved && FRESH_CHIP_CLASS)} />
  )
  // Overdue is a red date, not a status. Same rule as the Overdue filter and the insights
  // dashboard: past its due date and not yet approved.
  const isOverdue = !!share.dueDate && !isFinalized && new Date(share.dueDate).getTime() < Date.now()

  return (
    <>
      <div className={cn('border-b border-line', isPending && 'opacity-80')}>
        <div
          className="flex items-center gap-2 px-3 pt-2.5 pb-2 group/drag"
          {...(dragListeners ?? {})}
          {...(dragAttributes ?? {})}
        >
          {dragListeners && (
            <GripVertical className="-ml-1 h-4 w-4 shrink-0 text-fg-subtle cursor-grab active:cursor-grabbing transition-colors" />
          )}
          <div className="min-w-0 flex-1" onClick={onClickTitle}>
            {/* Row 1: status and the deliverable's code */}
            {share.docId && (
              <div className="flex items-center gap-1.5 mb-0.5">
                {statusIcon}
                <span className="font-mono text-[11px] text-fg-subtle">{share.docId}</span>
                {isFinalized && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Lock className="h-3 w-3 shrink-0 text-fg-subtle" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">Approved & Locked</TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}
            {/* Row 2: the title */}
            <div className="flex cursor-pointer items-center gap-1.5 truncate text-ui font-medium text-fg">
              {!share.docId && statusIcon}
              {!isFolder && <DocumentIcon mimeType={share.documentMimeType ?? undefined} className="h-3.5 w-3.5 shrink-0" />}
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* "01__Market & …" reads as "01 Market & …": the firm's ordering number muted. */}
                  <span className="truncate">
                    {(() => {
                      const { ordinal, title } = splitFolderOrdinal(share.documentName)
                      return <>{ordinal && <span className="mr-1 tabular-nums text-fg-subtle">{ordinal}</span>}{title}</>
                    })()}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-64 break-words">{share.documentName}</TooltipContent>
              </Tooltip>
              {!share.docId && isFinalized && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Lock className="h-3 w-3 shrink-0 text-fg-subtle" />
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
                    className="p-1 rounded hover:bg-line text-fg-subtle hover:text-fg-muted transition-colors shrink-0"
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
        <div className="px-3 py-3 border-b border-line space-y-2" onClick={(e) => e.stopPropagation()}>
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
      <div className={cn('px-3 pb-3 pt-2 space-y-1.5', isPending && 'opacity-60')}>
        {/* Datetime + quick links */}
        <div className="flex items-center justify-between">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn('inline-flex items-center gap-1 text-small', isOverdue ? 'text-danger' : share.dueDate ? 'text-fg-muted' : 'text-fg-subtle')}>
                  <CalendarDays className={cn('h-3.5 w-3.5', isOverdue ? 'text-danger' : 'text-fg-subtle')} />
                  {share.dueDate ? formatFullDate(share.dueDate) : 'No due date'}
                </span>
              </TooltipTrigger>
              <TooltipContent variant="light" side="top">{isOverdue ? 'Overdue' : 'Due'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="p-1 rounded hover:bg-surface-hover text-fg-subtle hover:text-fg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
                          className="p-1 rounded hover:bg-surface-hover text-fg-subtle hover:text-fg-muted transition-colors"
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
                          className="p-1 rounded hover:bg-surface-hover text-fg-subtle hover:text-fg-muted transition-colors"
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
          <span className="w-16 shrink-0 whitespace-nowrap text-caption text-fg-muted">Updated by</span>
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
          const blocked = share.blockedDocuments ?? []
          if (total === 0 && blocked.length === 0) return null
          const pct = total > 0 ? Math.round((approved / total) * 100) : 0
          return (
            <div className="flex items-center gap-2 pt-0.5">
              {/* Documents the firm marked blocked, named on hover */}
              <BlockedCountChip documents={blocked} />
              {total > 0 && (
                <>
                  <div className="flex-1 h-1 rounded-full bg-surface-muted overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all duration-ui-slow ease-ui-out', STAGE_BAR_CLASSES[stage as LaneStage])} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="shrink-0 text-caption tabular-nums text-fg-subtle">{approved}/{total}</span>
                </>
              )}
            </div>
          )
        })()}
      </div>
    </>
  )
}

const STATUS_PILL_CLASS: Record<ActivityStatus, string> = {
  not_started: 'bg-transparent text-fg-subtle',
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
  const initials = getInitials(updatedBy ?? displayEmail)

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
          <div className="flex h-8 w-8 shrink-0 cursor-default items-center justify-center overflow-hidden rounded-full bg-surface-muted">
            {updatedByAvatarUrl ? (
              <img src={updatedByAvatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-[10px] font-medium text-fg-muted">{initials}</span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-surface-subtle border border-line text-fg-muted text-xs p-3 max-w-[280px] shadow-md">
          <div className="space-y-2">
            {displayEmail && (
              <div className="flex items-center gap-2">
                <span className="truncate max-w-[200px]">{displayEmail}</span>
                <button type="button" onClick={handleCopy} className="shrink-0 p-1 rounded hover:bg-surface-hover text-fg-muted hover:text-fg-muted" title="Copy email">
                  {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
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
          <div className="h-8 w-8 rounded-lg border border-slate-200/80 bg-surface-subtle flex items-center justify-center shrink-0 cursor-default">
            <Clock className="h-4 w-4 text-fg-muted" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-surface-subtle border border-line text-fg-muted text-xs p-3 shadow-md">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
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
    <div className="overflow-hidden flex flex-col">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-line pl-3 pr-2 py-2.5 shrink-0 z-10">
        <div className="grid gap-4 items-center" style={{ gridTemplateColumns: COL_TEMPLATE }}>
          <span className="text-[11px] font-semibold text-fg-muted uppercase tracking-wider">Name</span>
          <span className="text-[11px] font-semibold text-fg-muted uppercase tracking-wider">Shared with</span>
          <span className="text-[11px] font-semibold text-fg-muted uppercase tracking-wider">Shared by</span>
          <span className="text-[11px] font-semibold text-fg-muted uppercase tracking-wider">Modified</span>
          <span className="text-[11px] font-semibold text-fg-muted uppercase tracking-wider text-right">Actions</span>
        </div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-line">
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
                'hover:bg-surface-hover',
                isPending && 'opacity-70 border-dashed',
                actionMenuOpenShareId === share.id && 'bg-surface-muted'
              )}
              style={{ gridTemplateColumns: COL_TEMPLATE }}
            >
              {/* Name column */}
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                  {isFolder ? (
                    <DeliverableIcon />
                  ) : (
                    <DocumentIcon mimeType={share.documentMimeType ?? undefined} className="h-4 w-4" />
                  )}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span
                    className="text-[0.8125rem] font-medium truncate text-fg hover:text-primary cursor-pointer transition-colors"
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
                            <div className="h-5 px-1.5 rounded bg-surface-muted text-fg-muted flex items-center justify-center text-[9px] font-semibold shrink-0 cursor-default">EV</div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">{viewerLabel}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {!ec && !guest && <span className="text-[11px] text-fg-subtle">—</span>}
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
                  textClassName="text-xs text-fg-muted"
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
                        className="h-7 w-7 rounded-md inline-flex items-center justify-center text-fg-subtle hover:text-fg-muted hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
                          className="h-7 w-7 rounded-md inline-flex items-center justify-center text-fg-subtle hover:text-fg-muted hover:bg-surface-hover transition-colors"
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
                          className="h-7 w-7 rounded-md inline-flex items-center justify-center text-fg-subtle hover:text-fg-muted hover:bg-surface-hover transition-colors"
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
                          className="h-7 w-7 rounded-md inline-flex items-center justify-center text-fg-subtle hover:text-fg-muted hover:bg-surface-hover transition-colors"
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
                          className="h-7 w-7 rounded-md inline-flex items-center justify-center text-fg-subtle hover:text-fg-muted hover:bg-surface-hover transition-colors"
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
        'group relative bg-surface rounded-card border border-line hover:border-line-strong transition-colors overflow-hidden flex flex-col w-[260px]',
        isPending ? 'border-dashed border-amber-200 opacity-70' : 'border-line'
      )}
    >
      {/* Thumbnail / Large Icon Area */}
      <div
        className={cn(
          "aspect-[16/10] bg-surface-subtle border-b border-line overflow-hidden relative group/thumb",
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
              <DeliverableIcon className="h-24 w-24 opacity-40" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/8 to-transparent" />
          </div>
        ) : (
          <div className="w-full h-full bg-surface-subtle flex items-center justify-center relative group-hover:bg-primary/10/40 transition-colors duration-700">
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
            <div className="bg-white/80 backdrop-blur-md px-2 py-0.5 rounded border border-[#e5e7eb]/80 shadow-sm text-[9px] font-semibold text-fg-muted tracking-wider uppercase">
              {share.documentMimeType?.split('.').pop()?.split('/').pop()?.replace('vnd.google-apps.', '')}
            </div>
          </div>
        )}
      </div>

      {/* Title area */}
      <div className="bg-surface-subtle px-4 pt-3 pb-2.5 border-b border-line">
        <div className="flex items-start gap-2.5">
          <DocumentIcon mimeType={share.documentMimeType ?? undefined} className="w-7 h-7 shrink-0 mt-0.5" />
          <div className="flex flex-col min-w-0 flex-1">
            <h3
              className={cn("font-semibold text-fg text-[13px] leading-tight truncate transition-colors", !isPending && "cursor-pointer hover:text-primary")}
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
              textClassName="text-xs text-fg-muted"
              iconClassName="text-fg-subtle hover:text-fg-muted"
              tooltipSide="top"
            />
          </div>
          <div className="flex items-center gap-0.5">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="p-1.5 rounded-lg hover:bg-surface-hover text-fg-muted hover:text-fg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
                      className="p-1.5 rounded-lg hover:bg-surface-hover text-fg-muted hover:text-fg-muted transition-colors"
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
                      className="p-1.5 rounded-lg hover:bg-surface-hover text-fg-muted hover:text-fg-muted transition-colors"
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
                      className="p-1.5 rounded-lg hover:bg-surface-hover text-fg-muted hover:text-fg-muted transition-colors"
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
                      className="p-1.5 rounded-lg hover:bg-surface-hover text-fg-muted hover:text-fg-muted transition-colors"
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
          <div className="mt-3 pt-3 -mx-4 px-4 border-t border-line space-y-2 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
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
              <span className="text-[10px] text-fg-subtle w-14 shrink-0 whitespace-nowrap">Uploaded by</span>
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
        <div className="mt-3 pt-3 -mx-4 px-4 border-t border-line space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-fg-subtle w-14 shrink-0 whitespace-nowrap">Shared by</span>
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
              <span className="text-[10px] text-fg-subtle w-14 shrink-0 whitespace-nowrap">Shared with</span>
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
                        <div className="h-6 w-6 rounded-lg bg-surface-muted text-fg-muted flex items-center justify-center text-[9px] font-semibold shrink-0 cursor-default">EV</div>
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
  const [dropZoneReady, setDropZoneReady] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterOverdue, setFilterOverdue] = useState(false)
  /** Only the deliverables with a blocked document. */
  const [filterBlocked, setFilterBlocked] = useState(false)
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
  const approvalFeedback = useApprovalFeedback()
  const reduceMotion = useReducedMotion()
  /** The lane under the dragged card, when the user may drop there (section 5: the drop target). */
  const [dropLane, setDropLane] = useState<ActivityStatus | null>(null)

  const {
    handleSecureOpen,
    secureModalOpen,
    secureModalMode,
    secureModalData,
    setSecureModalOpen,
    isRegrantingId,
    isRegrantLoading,
    regrantError,
    requestNewAccessLink,
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
    onSuccess?: () => void,
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
      onSuccess?.()
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
        addToast({ type: 'error', title: 'Demote failed', message: 'Could not demote the deliverable to a folder. Please try again.' })
        return
      }
      setShares((prev) => prev.filter((s) => s.documentId !== doc.id))
      if (openDeliverableId === doc.id) setOpenDeliverableId(null)
      addToast({ type: 'success', title: 'Demoted to folder', message: 'It is a plain folder again and off the Board.' })
    } catch (e) {
      logger.error('Untag as deliverable error', e instanceof Error ? e : new Error(String(e)), 'ProjectShares', { documentId: doc.id })
      addToast({ type: 'error', title: 'Demote failed', message: 'Could not demote the deliverable to a folder. Please try again.' })
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
      // These used to finish silently on the Board (the Files view already confirms them; the
      // titles match it). Approving gets the approval feedback: the toast, and the card's status
      // icon fading in.
      const share = shares.find((s) => s.documentId === documentId)
      const name = share?.documentName
      const folder = action.endsWith('-folder')
      if (action === 'approve' || action === 'approve-folder') {
        approvalFeedback.confirm({ id: share?.id ?? documentId, name, title: folder ? 'Folder approved' : 'File approved' })
      } else if (action === 'reject' || action === 'reject-folder') {
        addToast({ type: 'success', title: folder ? 'Folder rejected' : 'File rejected', message: name })
      } else if (action === 'withdraw' || action === 'withdraw-folder') {
        addToast({ type: 'success', title: folder ? 'Folder withdrawn' : 'Upload withdrawn', message: name })
      }
    } finally {
      setIntakeActionInProgress(null)
    }
  }, [projectId, refreshData, intakeActionInProgress, shares, addToast, approvalFeedback])

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
    (share: ShareRecord, initialTab?: 'details' | 'delivery' | 'comments') => {
      setOpenDeliverableId(share.id)
      const hashSuffix = initialTab === 'comments' ? ':comments' : ''
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#doc-file:${share.documentId}${hashSuffix}`)
      rightPane.setTitle(share.docId ?? share.documentName)
      rightPane.setHeaderSubtitle(displayFolderName(share.documentName))
      rightPane.setHeaderIcon(<DeliverableIcon />)
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
          initialTab={initialTab}
          onOpenSubtaskDocument={(subtask) => {
            void handleSecureOpen({
              documentId: subtask.documentId,
              externalId: subtask.externalId ?? subtask.documentId,
              fileName: subtask.fileName,
              mimeType: subtask.mimeType ?? undefined,
              projectId,
            }, subtask.documentId)
          }}
          onPreviewSubtaskDocument={(subtask) => {
            rightPane.setTitle(subtask.fileName)
            rightPane.setHeaderSubtitle('')
            rightPane.setHeaderIcon(<ScanEye className="h-4 w-4" />)
            rightPane.setContent(
              <DocumentPreviewPane
                document={{ id: subtask.documentId, name: subtask.fileName }}
                projectId={projectId}
              />
            )
          }}
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
    [rightPane, projectId, canManage, isExternalViewer, orgSlug, roleSlug, restrictToSharedOnly, handleSecureOpen]
  )

  // Capture the hash at mount so re-renders don't lose it before shares load
  const initialHashRef = React.useRef(typeof window !== 'undefined' ? window.location.hash : '')
  const deeplinkHandledRef = React.useRef(false)

  // Deeplink: #doc-file:<projectDocumentId>[:comments] → open that deliverable's detail
  // panel, landing on the Comments tab when the optional suffix is present.
  useEffect(() => {
    if (isLoading || shares.length === 0 || deeplinkHandledRef.current) return
    const match = initialHashRef.current.match(/^#doc-file:([^:]+)(:comments)?$/)
    if (!match) return
    const [, docId, commentsSuffix] = match
    const share = shares.find((s) => s.documentId === docId)
    if (share) {
      deeplinkHandledRef.current = true
      handleOpenDeliverableDetail(share, commentsSuffix ? 'comments' : undefined)
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
        // Approved work is finished, so a past due date no longer makes it overdue. Without this
        // the board over-reports and disagrees with the insights dashboard, which defines overdue
        // as `dueDate < now AND stage !== 'approved'` (engagement-insights.ts).
        const stage = s.activity?.status ?? 'to_do'
        if (stage === 'approved' || (stage as string) === 'done') return false
      }
      if (filterBlocked && !(s.blockedDocuments?.length)) return false
      return true
    })
  }, [shares, searchQuery, filterOverdue, filterBlocked])

  /**
   * Signals the columns cannot show. Each is already visible on the insights dashboard, but the
   * board is where this work is actually managed — "three deliverables have sat in review for two
   * weeks" is the most board-relevant fact in the system and was the one place it could not be seen.
   *
   * Computed from `shares`, which is already loaded, rather than fetching insights: this tab issues
   * no insights request today, and these three counts do not need one. Deliberately NOT filtered by
   * the search box — a stat that changes as you type is a search result, not a health signal.
   */
  const boardStats = React.useMemo(() => {
    const DAY_MS = 24 * 60 * 60 * 1000
    const now = Date.now()
    let stalledInReview = 0
    let missingDueDate = 0
    let overdue = 0
    let tracked = 0
    let blocked = 0

    shares.forEach((s) => {
      if (restrictToSharedOnly && !s.activity?.status) return
      const stage = s.activity?.status ?? 'to_do'
      const isApproved = stage === 'approved' || (stage as string) === 'done'
      tracked += 1
      if (s.blockedDocuments?.length) blocked += 1

      if (stage === 'in_review' && s.activity?.updatedAt) {
        if (now - new Date(s.activity.updatedAt).getTime() > 14 * DAY_MS) stalledInReview += 1
      }
      // Approved work needs no due date and cannot be overdue, so it is excluded from both —
      // matching the insights definition rather than the board's older filter.
      if (!isApproved) {
        if (!s.dueDate) missingDueDate += 1
        else if (new Date(s.dueDate).getTime() < now) overdue += 1
      }
    })

    return { stalledInReview, missingDueDate, overdue, tracked, blocked }
  }, [shares, restrictToSharedOnly])

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
    requestAnimationFrame(() => setDropZoneReady(true))
  }

  /** The lane a drop over `overId` (a lane, or a card in one) lands in. */
  const laneOf = (overId: string): BoardStage | null => {
    if ((BOARD_STAGES as readonly string[]).includes(overId)) return overId as BoardStage
    const overShare = shares.find((s) => s.id === overId)
    return overShare ? ((overShare.activity?.status ?? 'to_do') as BoardStage) : null
  }

  // No lane is a drop target: a deliverable's stage follows its documents
  // (.claude/plans/deliverable-stages-blocked.md), so a card is only dragged to reorder its own lane.
  const handleDragOver = (_event: DragOverEvent) => {
    setDropLane(null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    setDropZoneReady(false)
    setDropLane(null)
    if (!over) return
    const shareId = active.id as string
    const overId = String(over.id)
    // Dropped back on its own (faded) spot: nothing moves.
    if (overId === shareId) return

    const share = shares.find((s) => s.id === shareId)
    const currentLane = (share?.activity?.status ?? 'to_do') as BoardStage

    const targetLane = laneOf(overId)
    if (!targetLane) return
    // Only its own lane: a deliverable moves on when its documents do.
    if (targetLane !== currentLane) {
      addToast({ type: 'info', title: 'Moves with its documents', message: "A deliverable's stage follows its documents. Change theirs in its pane." })
      return
    }
    if (!canManage) return
    // Within a lane a card lands before the card it's dropped on.
    let insertIndex = laneOrder[targetLane].length
    if (overId !== targetLane) {
      const idx = laneOrder[targetLane].indexOf(overId)
      if (idx >= 0) insertIndex = idx
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

    // Optimistic update — the new order, at once
    const allFinal = [...finalToDo, ...finalInProgress, ...finalInReview, ...finalDone]
    setShares((prev) =>
      allFinal.map((id, idx) => {
        const s = prev.find((x) => x.id === id)!
        const lane =
          finalToDo.includes(id) ? 'to_do' :
          finalInProgress.includes(id) ? 'in_progress' :
          finalInReview.includes(id) ? 'in_review' : 'approved'
        return {
          ...s,
          activity: { ...(s.activity ?? { updatedAt: new Date().toISOString() }), status: lane as BoardStage, orderIndex: idx },
          _orderIndex: idx,
        }
      })
    )

    setSavingId(shareId)
    const rollback = () => setShares(previousShares)
    const onComplete = () => setSavingId(null)
    saveOrder(finalToDo, finalInProgress, finalInReview, finalDone, rollback, onComplete)
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
        <DocumentPreviewPane
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
            className={cn("h-8 gap-1.5 text-xs rounded border-line text-fg-muted hover:bg-surface-hover hover:text-fg transition-colors", filterOverdue ? "bg-red-50 border-red-300 text-red-700 ring-1 ring-red-200 hover:bg-red-50 hover:text-red-700" : "bg-white")}
          >
            <Clock className="h-3 w-3 opacity-60" />
            Overdue
            {boardStats.overdue > 0 && (
              <span className={cn(
                'ml-0.5 rounded-sm px-1 py-px text-[10px] font-semibold tabular-nums',
                filterOverdue ? 'bg-red-200/70 text-red-900' : 'bg-surface-muted text-fg-muted',
              )}>
                {boardStats.overdue}
              </span>
            )}
          </Button>

          {/* Blocked toggle: deliverables with a document the firm marked blocked. Shown while
              there are some, or while it's on (so it can be turned off). */}
          {(boardStats.blocked > 0 || filterBlocked) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilterBlocked((v) => !v)}
              aria-pressed={filterBlocked}
              className={cn("h-8 gap-1.5 text-xs rounded border-line text-fg-muted hover:bg-surface-hover hover:text-fg transition-colors", filterBlocked ? "bg-red-50 border-red-300 text-red-700 ring-1 ring-red-200 hover:bg-red-50 hover:text-red-700" : "bg-white")}
            >
              <Ban className="h-3 w-3 opacity-60" />
              Blocked
              <span className={cn(
                'ml-0.5 rounded-sm px-1 py-px text-[10px] font-semibold tabular-nums',
                filterBlocked ? 'bg-red-200/70 text-red-900' : 'bg-surface-muted text-fg-muted',
              )}>
                {boardStats.blocked}
              </span>
            </Button>
          )}

          {/* Signals the columns cannot show. Rendered only when non-zero: a row of zeros is
              noise, and the absence of a warning is itself the information. */}
          {boardStats.stalledInReview > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded border border-amber-200 bg-amber-50 text-xs text-amber-900">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  <span className="font-semibold tabular-nums">{boardStats.stalledInReview}</span>
                  stalled in review
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                In review for more than 14 days without a status change
              </TooltipContent>
            </Tooltip>
          )}

          {boardStats.missingDueDate > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded border border-line bg-white text-xs text-fg-muted">
                  <CalendarClock className="h-3 w-3 shrink-0 opacity-60" />
                  <span className="font-semibold tabular-nums">{boardStats.missingDueDate}</span>
                  no due date
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Unfinished deliverables with no due date set — they can never show as overdue
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Right: refresh + search */}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={refreshData}
            className="h-8 w-8 flex items-center justify-center rounded-md text-fg-subtle hover:text-fg-muted hover:bg-surface-hover transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Quick search ..."
              className="pl-9 pr-8 h-8 text-sm border-line w-56 rounded"
            />
            {searchQuery.trim().length > 0 && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Fills the space the page gives it. A viewport-based min-height (100vh - 220px) assumed the
          old header; under the New UI header, properties row and tabs it overflowed by a few pixels,
          and the page showed a full-height scrollbar beside the detail pane. */}
      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
        <div className={cn('flex-1 min-w-0 overflow-auto', viewMode === 'grid' && 'py-1')}>
          {isLoading ? (
            <div className="flex items-center justify-center min-h-[200px]">
              <LoadingSpinner size="md" className="min-h-0" />
            </div>
          ) : filteredShares.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-fg-muted bg-white/60 rounded-2xl border border-slate-200/60 mx-2">
              <Share2 className="h-11 w-11 mb-3 text-fg-subtle" />
              <p className="text-sm font-medium text-fg-muted">
                {searchQuery.trim().length > 0 || filterOverdue ? 'No matches' : 'No deliverables yet'}
              </p>
              <p className="text-xs mt-1 text-fg-subtle">
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
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDragCancel={() => { setActiveId(null); setDropZoneReady(false); setDropLane(null) }}
              >
                <div className="subtle-scrollbar overflow-x-auto min-h-[360px] pb-1">
                <div
                  // At rest each lane is sized to its cards; while dragging every lane stretches to the
                  // board's full height, so the whole column is a drop zone (section 5).
                  className={cn('grid gap-3 min-h-[360px]', activeId ? 'items-stretch' : 'items-start')}
                  style={{ gridTemplateColumns: approvedCollapsed ? 'minmax(240px, 1fr) minmax(240px, 1fr) minmax(240px, 1fr) 36px' : 'repeat(4, minmax(240px, 1fr))' }}
                >
                  {LANES.map((lane) => {
                    const laneCount = byLane[lane.status].length
                    const laneClasses = STAGE_LANE_CLASSES[lane.stage]
                    const isTarget = dropLane === lane.status

                    if (lane.status === 'approved' && approvedCollapsed) {
                      return (
                        <Hint key={lane.status} label={`${laneCount} approved · expand`} side="left">
                          <motion.button
                            type="button"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className={cn('flex flex-col items-center gap-2 rounded-lg py-3 select-none', laneClasses.rest)}
                            onClick={() => setApprovedCollapsed(false)}
                            aria-label={`Expand Approved (${laneCount})`}
                          >
                            <StatusIcon stage={lane.stage} size={14} />
                            <span className="text-caption tabular-nums text-fg-muted">{laneCount}</span>
                            <span
                              className="flex-1 whitespace-nowrap text-caption text-fg-muted"
                              style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}
                            >
                              {lane.label}
                            </span>
                            <ChevronRight className="h-3 w-3 text-fg-subtle" />
                          </motion.button>
                        </Hint>
                      )
                    }

                    const cards = byLane[lane.status]
                    return (
                      <motion.div key={lane.status} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-w-0 flex-col">
                        <DroppableLane
                          id={lane.status}
                          className={cn(
                            'flex flex-1 flex-col gap-2 rounded-lg p-2 transition-colors duration-ui-base ease-ui-out',
                            isTarget
                              ? cn(laneClasses.target, 'outline-dashed outline-[1.5px] outline-offset-[-1.5px]')
                              : laneClasses.rest
                          )}
                        >
                          {/* Lane header: the stage's pill and the count */}
                          <div className="flex h-7 items-center gap-2 px-1">
                            <StatusPill kind="deliverable" status={lane.status} />
                            <span className="text-small tabular-nums text-fg-subtle">{laneCount}</span>
                            {lane.status === 'approved' && (
                              <Hint label="Collapse Approved">
                                <button
                                  type="button"
                                  onClick={() => setApprovedCollapsed(true)}
                                  aria-label="Collapse Approved"
                                  className="ml-auto rounded-control p-0.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg-muted"
                                >
                                  <ChevronLeft className="h-3.5 w-3.5" />
                                </button>
                              </Hint>
                            )}
                          </div>
                          <AnimatePresence mode="popLayout">
                            {cards.map((share) => (
                              <DraggableCard
                                key={share.id}
                                id={share.id}
                                share={share}
                                laneStatus={lane.status}
                                formatDate={formatDate}
                                getDocumentForMenu={getDocumentForMenu}
                                showActions
                                canManage={canManage}
                                justApproved={approvalFeedback.isFresh(share.id)}
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
                          {/* The landing slot: where the dragged card will go. */}
                          {isTarget && dropZoneReady && (
                            <div
                              className={cn(
                                'flex h-[104px] shrink-0 items-center justify-center rounded-card border-[1.5px] border-dashed bg-white/65 text-small font-medium',
                                laneClasses.slot
                              )}
                            >
                              Move to {lane.label}
                            </div>
                          )}
                          {!activeId && cards.length === 0 && (
                            <p className="px-1 pb-1 text-small text-fg-subtle">No deliverables</p>
                          )}
                        </DroppableLane>
                      </motion.div>
                    )
                  })}
                </div>
                </div>

                <DragOverlay dropAnimation={reduceMotion ? null : { duration: 200, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
                  {activeId ? (() => {
                    const share = shares.find((s) => s.id === activeId)
                    if (!share) return null
                    const status = (share.activity?.status ?? 'to_do') as ActivityStatus
                    return (
                      // The lifted card: a deeper card shadow and a slight tilt (level under reduced motion).
                      <div className={cn(interactiveCardClass({ lifted: true }), 'w-[280px] overflow-hidden')} style={{ cursor: 'grabbing' }}>
                        <ShareCardContent
                          share={share}
                          laneStatus={status}
                          formatDate={formatDate}
                          getDocumentForMenu={getDocumentForMenu}
                          showActions={false}
                          canManage={false}
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
        documentUrl={secureModalData.documentUrl}
        mode={secureModalMode}
        isLoading={isRegrantLoading}
        error={regrantError}
        onRequestNewLink={requestNewAccessLink}
      />

    </div>
  )
}
