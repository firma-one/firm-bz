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
} from '@dnd-kit/core'
import { Share2, User, Lock, ListTodo, Loader2, CheckCircle, GripVertical, List, FolderOpen, LayoutGrid, Clock, Copy, Check, Search, MessageCircle, Link2, X, RefreshCw, ChevronDown, Filter } from 'lucide-react'
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { SecureAccessModal } from './secure-access-modal'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { supabase } from '@/lib/supabase'
import { useSecureOpenDocument } from '@/lib/use-secure-open-document'
import { logger } from '@/lib/logger'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import { DocumentDocCommentsPane } from '@/components/projects/document-doc-comments-pane'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useProjectPersonaLabels } from '@/lib/hooks/use-project-persona-labels'

type ActivityStatus = 'to_do' | 'in_progress' | 'done'

interface ShareRecord {
  id: string
  projectId: string
  documentId: string
  documentName: string
  documentExternalId: string
  documentMimeType: string | null
  thumbnailLink?: string | null
  webViewLink?: string | null
  slug?: string | null
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
  /** Used internally when grouping into lanes for stable sort order. */
  _orderIndex?: number
}

export type FilesBreadcrumbItem = { id: string; name: string; clickable?: boolean }

interface ProjectSharesTabProps {
  projectId: string
  canManage?: boolean
  /** True for external personas (EC, EV) — hides internal-only UI like Drive Actions. */
  restrictToSharedOnly?: boolean
  /** True only for External Viewer (eng_viewer) — shows Accept Document option. */
  isExternalViewer?: boolean
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
}

const LANES: {
  status: ActivityStatus
  label: string
  icon: React.ReactNode
  /** Gradient for icon pill in header */
  iconGradient: string
}[] = [
    {
      status: 'to_do',
      label: 'To Do',
      icon: <ListTodo className="h-4 w-4 text-white" />,
      iconGradient: 'from-[#ddd6fe] to-[#c4b5fd]',
    },
    {
      status: 'in_progress',
      label: 'In Progress',
      icon: <Loader2 className="h-4 w-4 text-white" />,
      iconGradient: 'from-[#5eead4] to-[#2dd4bf]',
    },
    {
      status: 'done',
      label: 'Done',
      icon: <CheckCircle className="h-4 w-4 text-white" />,
      iconGradient: 'from-[#7dd3fc] to-[#38bdf8]',
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
  children: React.ReactNode
  className?: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={cn(className, isOver && 'ring-1 ring-slate-300/80 ring-inset rounded-2xl')}>
      {children}
    </div>
  )
}

/** Card accent: header gradient (top-left → bottom-right, soft pastel to white) + subtle left edge. Matches workflow-card reference. */
const CARD_ACCENT: Record<ActivityStatus, { border: string; headerBg: string; iconPillBg: string }> = {
  to_do: {
    border: 'border-l-2 border-l-[#eae8ff]',
    headerBg: 'bg-gradient-to-br from-[#f5f3ff] to-white',
    iconPillBg: 'bg-[#ede9fe]/90',
  },
  in_progress: {
    border: 'border-l-2 border-l-[#ccfbf1]',
    headerBg: 'bg-gradient-to-br from-[#ecfdf8] to-white',
    iconPillBg: 'bg-[#ccfbf1]/90',
  },
  done: {
    border: 'border-l-2 border-l-[#e0f2fe]',
    headerBg: 'bg-gradient-to-br from-[#eff6ff] to-white',
    iconPillBg: 'bg-[#e0f2fe]/90',
  },
}

function DraggableCard({
  id,
  share,
  laneStatus,
  formatDate,
  getDocumentForMenu,
  showActions,
  onFinalize,
  finalizingId,
  canManage,
  isDoneLane,
  onShareSaved,
  handleSecureOpen,
  isRegrantingId,
  onOpenComments,
  extCollaboratorLabel,
  viewerLabel,
  onParentFolderClick,
  isExternalPersona,
  isExternalViewer,
  deeplinkBase,
}: {
  id: string
  share: ShareRecord
  laneStatus: ActivityStatus
  formatDate: (s: string) => string
  getDocumentForMenu: (s: ShareRecord) => { id: string; name: string; mimeType?: string; externalId: string }
  showActions: boolean
  onFinalize?: () => void
  finalizingId: string | null
  canManage: boolean
  isDoneLane: boolean
  onShareSaved?: () => void
  handleSecureOpen: (share: ShareRecord) => void
  isRegrantingId: string | null
  onOpenComments?: (share: ShareRecord) => void
  extCollaboratorLabel: string
  viewerLabel: string
  onParentFolderClick?: (parentId: string, parentName: string) => void
  isExternalPersona?: boolean
  isExternalViewer?: boolean
  deeplinkBase?: string
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id })
  const accent = CARD_ACCENT[laneStatus]

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

  return (
    <motion.div
      ref={(node) => { setNodeRef(node); setDropRef(node) }}
      layout
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      whileHover={!isDragging ? { y: -3, boxShadow: '0 8px 20px -4px rgba(0,0,0,0.1)' } : undefined}
      className={cn(
        'rounded-2xl overflow-hidden select-none border border-slate-200/80 transition-shadow duration-200',
        accent.border,
        'bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.06)]',
        isDragging && 'opacity-60 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.12)] z-10 scale-[1.02]',
        isOver && !isDragging && 'ring-1 ring-slate-300/70 ring-inset'
      )}
    >
      <div className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-50/70 border-b border-slate-100/80" {...listeners} {...attributes}>
        <GripVertical className="h-4 w-4 text-slate-400 cursor-grab active:cursor-grabbing" />
      </div>
      <ShareCardContent
        share={share}
        laneHeaderBg={accent.headerBg}
        iconPillBg={accent.iconPillBg}
        formatDate={formatDate}
        getDocumentForMenu={getDocumentForMenu}
        showActions={showActions}
        onFinalize={onFinalize}
        finalizingId={finalizingId}
        canManage={canManage}
        isDoneLane={isDoneLane}
        onShareSaved={onShareSaved}
        handleSecureOpen={handleSecureOpen}
        isRegrantingId={isRegrantingId}
        onClickTitle={() => handleSecureOpen(share)}
        onOpenComments={onOpenComments}
        extCollaboratorLabel={extCollaboratorLabel}
        viewerLabel={viewerLabel}
        onParentFolderClick={onParentFolderClick}
        isExternalPersona={isExternalPersona}
        isExternalViewer={isExternalViewer}
        deeplinkBase={deeplinkBase}
      />
    </motion.div>
  )
}


function ShareCardContent({
  share,
  laneHeaderBg,
  iconPillBg,
  formatDate,
  getDocumentForMenu,
  showActions,
  onFinalize,
  finalizingId,
  canManage,
  isDoneLane,
  onShareSaved,
  onClickTitle,
  handleSecureOpen,
  isRegrantingId,
  onOpenComments,
  extCollaboratorLabel,
  viewerLabel,
  onParentFolderClick,
  isExternalPersona,
  isExternalViewer,
  deeplinkBase,
}: {
  share: ShareRecord
  laneHeaderBg: string
  iconPillBg: string
  formatDate: (s: string) => string
  getDocumentForMenu: (s: ShareRecord) => { id: string; name: string; mimeType?: string; externalId: string }
  showActions: boolean
  onFinalize?: () => void
  finalizingId: string | null
  canManage: boolean
  isDoneLane: boolean
  onShareSaved?: () => void
  onClickTitle?: () => void
  handleSecureOpen: (share: ShareRecord) => void
  isRegrantingId: string | null
  onOpenComments?: (share: ShareRecord) => void
  extCollaboratorLabel: string
  viewerLabel: string
  onParentFolderClick?: (parentId: string, parentName: string) => void
  isExternalPersona?: boolean
  isExternalViewer?: boolean
  deeplinkBase?: string
}) {
  const latestComment = share.comments?.[0]
  const isFinalized = !!share.finalizedAt
  const [linkCopied, setLinkCopied] = useState(false)

  return (
    <>
      <div className={cn('transition-colors duration-200', laneHeaderBg)}>
        <div className="flex items-center gap-3 px-3 pt-3 pb-2">
          <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.06)]', iconPillBg)}>
            {share.documentMimeType?.includes('folder') ? (
              <SharedFolderIcon fillLevel={1} tooltip="shared" />
            ) : (
              <DocumentIcon mimeType={share.documentMimeType ?? undefined} className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="text-sm font-semibold text-slate-800 truncate cursor-pointer hover:text-[#069668] transition-colors"
              title={share.documentName}
              onClick={onClickTitle}
            >
              {share.documentName}
            </div>
            <DocumentBreadcrumb
              parentName={share.parentName}
              parentId={share.parentId}
              onFolderClick={onParentFolderClick}
            />
          </div>
        </div>
      </div>
      <div className="px-3 pb-3 pt-2 bg-white space-y-1.5">
        {/* Datetime + quick links */}
        <div className="flex items-center justify-between">
          <RelativeDateTime
            date={share.updatedAt}
            textClassName="text-[11px] text-slate-400"
            iconClassName="text-slate-300 hover:text-slate-500"
            tooltipSide="top"
          />
          <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!deeplinkBase || !share.documentId) return
                      navigator.clipboard.writeText(`${deeplinkBase}#doc-file:${share.documentId}`)
                      setLinkCopied(true)
                      setTimeout(() => setLinkCopied(false), 1500)
                    }}
                    disabled={!deeplinkBase || !share.documentId}
                  >
                    {linkCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Link2 className="h-3.5 w-3.5" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">{deeplinkBase && share.documentId ? 'Copy link' : 'No link available'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                    onClick={(e) => { e.stopPropagation(); onOpenComments?.(share) }}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Comments</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <DocumentActionMenu
              document={getDocumentForMenu(share)}
              showShareModal={canManage}
              projectId={share.projectId}
              onShareSaved={onShareSaved}
              onOpenDocument={() => handleSecureOpen(share)}
              isExternalUser={isExternalPersona}
              isExternalViewer={isExternalViewer}
            />
            {isRegrantingId === share.id && <LoadingSpinner size="sm" className="min-h-0 ml-0.5" />}
          </div>
        </div>
        {/* Shared by */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-400 w-14 shrink-0 whitespace-nowrap">Shared by</span>
          <TooltipProvider>
            <ProfileBubbleWithPopup
              name={share.createdByName || share.createdByEmail || 'Team Member'}
              email={share.createdByEmail || ''}
              avatarUrl={share.createdByAvatarUrl}
              size="default"
            />
          </TooltipProvider>
        </div>
        {/* Shared with */}
        {(share.settings?.externalCollaborator || share.settings?.guest) && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-400 w-14 shrink-0 whitespace-nowrap">Shared with</span>
            <div className="flex items-center gap-1">
              {share.settings?.externalCollaborator && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="h-5 w-5 rounded-lg bg-[#ecfdf5] text-[#065f46] flex items-center justify-center text-[9px] font-semibold shrink-0 cursor-default">EC</div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">{extCollaboratorLabel}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {share.settings?.guest && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="h-5 w-5 rounded-lg bg-[#f3f4f6] text-[#45474c] flex items-center justify-center text-[9px] font-semibold shrink-0 cursor-default">EV</div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">{viewerLabel}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        )}
      </div>
      {showActions && (canManage && isDoneLane && !isFinalized || isFinalized) && (
        <div className="px-3 pb-3 pt-1 flex items-center gap-2 border-t border-slate-100/80 bg-white" onClick={(e) => e.stopPropagation()}>
          {canManage && isDoneLane && !isFinalized && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 text-amber-700 border-amber-200 hover:bg-amber-50"
              disabled={!!finalizingId}
              onClick={(e) => { e.stopPropagation(); onFinalize?.() }}
            >
              {finalizingId ? '…' : <><Lock className="h-3 w-3 mr-1" /> Finalize</>}
            </Button>
          )}
          {isFinalized && (
            <span className="text-[11px] text-slate-500 flex items-center gap-1">
              <Lock className="h-3 w-3" /> Finalized
            </span>
          )}
        </div>
      )}
    </>
  )
}

const STATUS_LABELS: Record<ActivityStatus, string> = {
  to_do: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
}

const STATUS_PILL_CLASS: Record<ActivityStatus, string> = {
  to_do: 'bg-[#ede9fe]/90 text-[#5b21b6]',
  in_progress: 'bg-[#ccfbf1]/90 text-[#0f766e]',
  done: 'bg-[#e0f2fe]/90 text-[#0369a1]',
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
  onParentFolderClick,
  isExternalPersona,
  isExternalViewer,
  deeplinkBase,
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
  onParentFolderClick?: (parentId: string, parentName: string) => void
  isExternalPersona?: boolean
  isExternalViewer?: boolean
  deeplinkBase?: string
}) {
  const [actionMenuOpenShareId, setActionMenuOpenShareId] = useState<string | null>(null)
  return (
    <div className="grid grid-cols-2 gap-4">
      {shares.map((share) => {
        const ec = share.settings?.externalCollaborator ?? false
        const guest = share.settings?.guest ?? false
        return (
          <div
            key={share.id}
            className={cn(
              'bg-white rounded-xl border border-slate-200 border-l-2 border-l-[#eae8ff] shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] overflow-hidden transition-all duration-300',
              'hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-4px_rgba(0,0,0,0.1)]',
              actionMenuOpenShareId === share.id && 'bg-slate-50'
            )}
          >
            {/* Gradient header: icon + title + actions */}
            <div className={cn('px-5 pt-4 pb-3 bg-gradient-to-br from-[#f5f3ff] to-white', actionMenuOpenShareId === share.id && 'from-[#ede9fe]')}>
              <div className="flex items-center gap-2 w-full">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/80 border border-slate-200/60">
                  {share.documentMimeType?.includes('folder') ? (
                    <SharedFolderIcon fillLevel={1} tooltip="shared" />
                  ) : (
                    <DocumentIcon mimeType={share.documentMimeType ?? undefined} size={18} />
                  )}
                </div>
                <h3 className="font-semibold text-slate-900 truncate flex-1 min-w-0" title={share.documentName}>
                  {share.documentName}
                </h3>
                <div className="flex items-center gap-1 shrink-0 ml-auto">
                    <RelativeDateTime
                      date={share.updatedAt}
                      iconOnly
                      iconClassName="text-slate-400 hover:text-slate-600"
                      tooltipSide="top"
                    />
                    <button
                      type="button"
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                      onClick={(e) => { e.stopPropagation(); onOpenComments?.(share) }}
                      title="Comments"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (!deeplinkBase || !share.documentId) return
                        navigator.clipboard.writeText(`${deeplinkBase}#doc-file:${share.documentId}`)
                      }}
                      title={deeplinkBase && share.documentId ? 'Copy link' : 'No link available'}
                      disabled={!deeplinkBase || !share.documentId}
                    >
                      <Link2 className="h-4 w-4" />
                    </button>
                    {share.documentMimeType?.includes('folder') && onOpenInFilesForFolder && (
                      <button
                        type="button"
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                        onClick={() => onOpenInFilesForFolder(share)}
                        title="Open in Files"
                      >
                        <FolderOpen className="h-4 w-4" />
                      </button>
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
                    />
                    {isRegrantingId === share.id && (
                      <LoadingSpinner size="sm" className="min-h-0 ml-1" />
                    )}
                  </div>
              </div>
              <DocumentBreadcrumb
                parentName={share.parentName}
                parentId={share.parentId}
                onFolderClick={onParentFolderClick}
              />
            </div>
            {/* White content: shared-by / shared-with */}
            <div className="px-5 pb-4 pt-3 bg-white">
              {(() => {
                const isModified = new Date(share.updatedAt).getTime() > new Date(share.createdAt).getTime()
                const samePerson = share.updatedBy && share.updatedBy === share.createdBy
                const showCreatorProfile = !isModified || (isModified && !samePerson)
                const showModifierProfile = isModified && share.updatedBy && !samePerson
                const showModifiedAtOnly = isModified && !share.updatedBy
                return (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400 shrink-0">Shared by</span>
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
                      {showModifiedAtOnly && <ModifiedAtOnlyBubble updatedAt={share.updatedAt} formatDate={formatDate} />}
                    </div>
                    {(ec || guest) && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-400 shrink-0">Shared with</span>
                        {ec && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="h-6 w-6 rounded-lg bg-[#ecfdf5] text-[#065f46] flex items-center justify-center text-[9px] font-semibold shrink-0 cursor-default">EC</div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="bg-slate-50 border border-slate-200 text-slate-700 text-xs p-2 shadow-md">{extCollaboratorLabel}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {guest && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="h-6 w-6 rounded-lg bg-[#f3f4f6] text-[#45474c] flex items-center justify-center text-[9px] font-semibold shrink-0 cursor-default">EV</div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="bg-slate-50 border border-slate-200 text-slate-700 text-xs p-2 shadow-md">{viewerLabel}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
        )
      })}
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
  onParentFolderClick,
  isExternalPersona,
  isExternalViewer,
  deeplinkBase,
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
  onParentFolderClick?: (parentId: string, parentName: string) => void
  isExternalPersona?: boolean
  isExternalViewer?: boolean
  deeplinkBase?: string
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 py-2">
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
          onParentFolderClick={onParentFolderClick}
          isExternalPersona={isExternalPersona}
          isExternalViewer={isExternalViewer}
          deeplinkBase={deeplinkBase}
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
  onParentFolderClick,
  isExternalPersona,
  isExternalViewer,
  deeplinkBase,
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
  onParentFolderClick?: (parentId: string, parentName: string) => void
  isExternalPersona?: boolean
  isExternalViewer?: boolean
  deeplinkBase?: string
}) {
  const isFolder = share.documentMimeType?.includes('folder')
  const [linkCopied, setLinkCopied] = useState(false)

  const handleOpenPreview = () => handleSecureOpen(share)

  // Proxy URL — avoids Google CDN 429 by routing through our backend with OAuth token
  const proxyThumbnailUrl = share.thumbnailLink
    ? `/api/proxy/thumbnail/${encodeURIComponent(share.documentExternalId)}?firmId=${encodeURIComponent((share as any).organizationId ?? '')}&size=400`
    : null

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2, boxShadow: '0 8px 24px -4px rgba(0,0,0,0.10)' }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="group relative bg-white rounded border border-[#e5e7eb] shadow-sm overflow-hidden flex flex-col h-full"
    >
      {/* Thumbnail / Large Icon Area */}
      <div
        className={cn(
          "aspect-[16/10] bg-slate-50 border-b border-slate-100 cursor-pointer overflow-hidden relative group/thumb",
          !proxyThumbnailUrl && "flex items-center justify-center"
        )}
        onClick={handleOpenPreview}
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
          <div className="w-full h-full bg-[#ecfdf5] flex items-center justify-center relative group-hover:bg-[#d1fae5] transition-colors duration-500">
            <div className="transform group-hover:scale-110 transition-transform duration-700 ease-out">
              <SharedFolderIcon fillLevel={1} tooltip="shared" className="h-24 w-24 opacity-40" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-tr from-[#069668]/8 to-transparent" />
          </div>
        ) : (
          <div className="w-full h-full bg-slate-50 flex items-center justify-center relative group-hover:bg-[#ecfdf5]/40 transition-colors duration-700">
            {/* Subtle Background Pattern/Gradient */}
            <div
              className="absolute inset-0 opacity-[0.03] pointer-events-none"
              style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #4285F4 1px, transparent 0)', backgroundSize: '24px 24px' }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-white/50 to-transparent pointer-events-none" />

            {/* Parsing / Scanning Animation */}
            <div className="absolute inset-0 opacity-10 pointer-events-none overflow-hidden">
              <motion.div
                initial={{ top: '-10%' }}
                animate={{ top: '110%' }}
                transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                className="absolute left-0 right-0 h-0.5 bg-[#069668]/40 blur-[1px] z-10"
              />
            </div>

            <div className="transform group-hover:scale-110 group-hover:rotate-1 transition-all duration-700 ease-out flex items-center justify-center z-10 drop-shadow-sm">
              <DocumentIcon mimeType={share.documentMimeType ?? undefined} size={80} />
            </div>

            <div className="absolute bottom-4 left-0 right-0 flex justify-center opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-1 group-hover:translate-y-0 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] bg-white/40 backdrop-blur-md px-3 py-1 rounded-full border border-white/30 shadow-sm leading-none">
                Syncing Metadata...
              </span>
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
        <div className="flex items-start gap-2">
          <DocumentIcon mimeType={share.documentMimeType ?? undefined} className="w-5 h-5 shrink-0 mt-0.5" />
          <h3
            className="font-semibold text-[#1b1b1d] text-[13px] leading-tight truncate cursor-pointer hover:text-[#069668] transition-colors flex-1 min-w-0"
            title={share.documentName}
            onClick={handleOpenPreview}
          >
            {share.documentName}
          </h3>
        </div>
        <DocumentBreadcrumb
          parentName={share.parentName}
          parentId={share.parentId}
          onFolderClick={onParentFolderClick}
        />
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
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!deeplinkBase || !share.documentId) return
                      navigator.clipboard.writeText(`${deeplinkBase}#doc-file:${share.documentId}`)
                      setLinkCopied(true)
                      setTimeout(() => setLinkCopied(false), 1500)
                    }}
                    disabled={!deeplinkBase || !share.documentId}
                  >
                    {linkCopied ? <Check className="h-4 w-4 text-emerald-600" /> : <Link2 className="h-4 w-4" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">{deeplinkBase && share.documentId ? 'Copy link' : 'No link available'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {!isFolder && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                      onClick={(e) => { e.stopPropagation(); onOpenComments?.(share) }}
                    >
                      <MessageCircle className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">Comments</TooltipContent>
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
            />
            {isRegrantingId === share.id && (
              <LoadingSpinner size="sm" className="min-h-0 ml-1" />
            )}
          </div>
        </div>

        {/* Shared by / Shared with rows */}
        <div className="mt-3 pt-3 -mx-4 px-4 border-t border-[#e5e7eb] space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 w-14 shrink-0 whitespace-nowrap">Shared by</span>
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
              <span className="text-[10px] text-slate-400 w-14 shrink-0 whitespace-nowrap">Shared with</span>
              <div className="flex items-center gap-1">
                {share.settings.externalCollaborator && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="h-6 w-6 rounded-lg bg-[#ecfdf5] text-[#065f46] flex items-center justify-center text-[9px] font-semibold shrink-0 cursor-default">EC</div>
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
      </div>

    </motion.div>
  )
}

type SharesViewMode = 'grid' | 'list' | 'board'

export function ProjectSharesTab({
  projectId,
  canManage = false,
  restrictToSharedOnly = false,
  isExternalViewer = false,
  connectorRootFolderId,
  orgName,
  clientName,
  projectName,
  onOpenInFiles,
  sharesBasePath,
  pathViewMode,
  deeplinkBase,
}: ProjectSharesTabProps) {
  const router = useRouter()
  const rightPane = useRightPane()
  const [shares, setShares] = useState<ShareRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [finalizingId, setFinalizingId] = useState<string | null>(null)
  const [detailShareId, setDetailShareId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterShared, setFilterShared] = useState<'all' | 'by_me' | 'by_others' | 'with_collaborator' | 'with_viewer'>('all')
  const [filterSharedOpen, setFilterSharedOpen] = useState(false)
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)

  const {
    handleSecureOpen,
    secureModalOpen,
    secureModalData,
    setSecureModalOpen,
    isRegrantingId,
  } = useSecureOpenDocument({
    projectId,
    logContext: 'ProjectShares',
    onRegrantFailed: (doc) => {
      const link = doc.webViewLink || (doc.externalId ? `https://drive.google.com/file/d/${doc.externalId}/view` : null)
      if (link && typeof window !== 'undefined') window.open(link, '_blank')
    },
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
    })
  }, [refreshData])

  const saveOrder = useCallback(async (toDo: string[], inProgress: string[], done: string[]) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      await fetch(`/api/projects/${projectId}/shares/order`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_do: toDo, in_progress: inProgress, done }),
      })
      await refreshData()
    } catch (e) {
      logger.error('Failed to save order', e instanceof Error ? e : new Error(String(e)), 'ProjectShares', {})
    }
  }, [projectId, refreshData])

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

  const handleSecureOpenShare = useCallback(
    (share: ShareRecord) => {
      if (share.documentMimeType?.includes('folder')) {
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
    [handleSecureOpen, handleOpenInFilesForFolder]
  )

  const byLane = React.useMemo(() => {
    const toDo: ShareRecord[] = []
    const inProgress: ShareRecord[] = []
    const done: ShareRecord[] = []
    shares.forEach((s) => {
      const status = s.activity?.status ?? 'to_do'
      const orderIndex = s.activity?.orderIndex ?? 0
      const rec = { ...s, _orderIndex: orderIndex }
      if (status === 'in_progress') inProgress.push(rec)
      else if (status === 'done') done.push(rec)
      else toDo.push(rec)
    })
    toDo.sort((a, b) => (a._orderIndex ?? 0) - (b._orderIndex ?? 0))
    inProgress.sort((a, b) => (a._orderIndex ?? 0) - (b._orderIndex ?? 0))
    done.sort((a, b) => (a._orderIndex ?? 0) - (b._orderIndex ?? 0))
    return { to_do: toDo, in_progress: inProgress, done }
  }, [shares])

  const laneOrder = React.useMemo(() => ({
    to_do: byLane.to_do.map((s) => s.id),
    in_progress: byLane.in_progress.map((s) => s.id),
    done: byLane.done.map((s) => s.id),
  }), [byLane])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } })
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
    if (['to_do', 'in_progress', 'done'].includes(overId)) {
      targetLane = overId as ActivityStatus
      insertIndex = laneOrder[targetLane].length
    } else {
      const overShare = shares.find((s) => s.id === overId)
      if (!overShare) return
      targetLane = (overShare.activity?.status ?? 'to_do') as ActivityStatus
      insertIndex = laneOrder[targetLane].indexOf(overId)
      if (insertIndex < 0) insertIndex = laneOrder[targetLane].length
    }
    const currentLane = laneOrder.to_do.includes(shareId) ? 'to_do' : laneOrder.in_progress.includes(shareId) ? 'in_progress' : 'done'
    const newToDo = laneOrder.to_do.filter((id) => id !== shareId)
    const newInProgress = laneOrder.in_progress.filter((id) => id !== shareId)
    const newDone = laneOrder.done.filter((id) => id !== shareId)
    const insertAt = (arr: string[], id: string, idx: number) => {
      const out = arr.slice()
      out.splice(idx, 0, id)
      return out
    }
    if (targetLane === 'to_do') saveOrder(insertAt(newToDo, shareId, insertIndex), newInProgress, newDone)
    else if (targetLane === 'in_progress') saveOrder(newToDo, insertAt(newInProgress, shareId, insertIndex), newDone)
    else saveOrder(newToDo, newInProgress, insertAt(newDone, shareId, insertIndex))
  }

  const detailShare = detailShareId ? shares.find((s) => s.id === detailShareId) : null
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const filteredShares = shares.filter((s) => {
    if (normalizedQuery.length > 0) {
      const hay = [s.documentName, s.createdByEmail, s.updatedByEmail, s.createdBy, s.updatedBy]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!hay.includes(normalizedQuery)) return false
    }
    if (filterShared === 'by_me') return !!currentUserEmail && s.createdByEmail === currentUserEmail
    if (filterShared === 'by_others') return !currentUserEmail || s.createdByEmail !== currentUserEmail
    if (filterShared === 'with_collaborator') return !!s.settings.externalCollaborator
    if (filterShared === 'with_viewer') return !!s.settings.guest
    return true
  })

  const handleOpenComments = useCallback(
    (share: ShareRecord) => {
      rightPane.setTitle('Comments')
      rightPane.setHeaderSubtitle(share.documentName)
      rightPane.setHeaderIcon(<MessageCircle className="h-4 w-4" />)
      rightPane.setContent(
        <DocumentDocCommentsPane
          engagementId={share.projectId}
          documentId={share.documentId}
          documentName={share.documentName}
        />
      )
    },
    [rightPane]
  )

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200/60 bg-white shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Share2 className="h-5 w-5 text-slate-500" />
            Shared Documents
            {!isLoading && filteredShares.length > 0 && (
              <span className="text-xs font-medium text-slate-500 bg-slate-100/80 px-2 py-0.5 rounded-lg">
                {filteredShares.length}
              </span>
            )}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {viewMode === 'board'
              ? 'Drag cards between lanes to update status. Engagement Lead can finalize from Done.'
              : 'Browse shared documents. Use the actions menu on each row to view, edit, or share.'}
          </p>
        </div>

        <div className="mt-4 flex items-center gap-2 border-b border-slate-200">
          <nav className="flex items-center gap-1 -mb-px" aria-label="View mode">
          <button
            type="button"
            onClick={() => { if (sharesBasePath) router.push(`${sharesBasePath}/grid`) }}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px',
              viewMode === 'grid'
                ? 'bg-slate-100 text-slate-900 border-slate-900'
                : 'text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-700'
            )}
          >
            <LayoutGrid className="h-4 w-4" />
            Grid
          </button>
          <button
            type="button"
            onClick={() => { if (sharesBasePath) router.push(`${sharesBasePath}/list`) }}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px',
              viewMode === 'list'
                ? 'bg-slate-100 text-slate-900 border-slate-900'
                : 'text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-700'
            )}
          >
            <List className="h-4 w-4" />
            Compact
          </button>
          <button
            type="button"
            onClick={() => { if (sharesBasePath) router.push(`${sharesBasePath}/board`) }}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px',
              viewMode === 'board'
                ? 'bg-slate-100 text-slate-900 border-slate-900'
                : 'text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-700'
            )}
          >
            <ListTodo className="h-4 w-4" />
            Board
          </button>
          </nav>
          <div className="ml-auto pb-1 flex items-center gap-2">
            <DropdownMenu open={filterSharedOpen} onOpenChange={setFilterSharedOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-8 gap-1.5 text-xs bg-white rounded-[2px] border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors", filterShared !== 'all' && "border-slate-400 ring-1 ring-slate-300")}>
                  <Filter className="h-3 w-3 opacity-60" />
                  Shared
                  {filterShared !== 'all' && <span className="ml-0.5 bg-slate-200 text-slate-800 px-1.5 rounded-full text-[10px] font-medium">1</span>}
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[220px] py-1 text-xs rounded-[2px]">
                <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-100">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400 p-0 font-medium">Shared</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => setFilterSharedOpen(false)} className="text-xs rounded-[2px] bg-slate-900 text-white hover:bg-slate-800 hover:text-white focus:bg-slate-800 focus:text-white p-1.5 px-2 cursor-pointer">
                    Done
                  </DropdownMenuItem>
                </div>
                <DropdownMenuCheckboxItem checked={filterShared === 'all'} onCheckedChange={() => setFilterShared('all')} onSelect={(e) => e.preventDefault()} className="text-xs py-1.5 pl-8">
                  All
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem checked={filterShared === 'by_me'} onCheckedChange={() => setFilterShared(filterShared === 'by_me' ? 'all' : 'by_me')} onSelect={(e) => e.preventDefault()} className="text-xs py-1.5 pl-8">
                  Shared by me
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={filterShared === 'by_others'} onCheckedChange={() => setFilterShared(filterShared === 'by_others' ? 'all' : 'by_others')} onSelect={(e) => e.preventDefault()} className="text-xs py-1.5 pl-8">
                  Shared by others
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={filterShared === 'with_collaborator'} onCheckedChange={() => setFilterShared(filterShared === 'with_collaborator' ? 'all' : 'with_collaborator')} onSelect={(e) => e.preventDefault()} className="text-xs py-1.5 pl-8">
                  Shared with Collaborator (External)
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={filterShared === 'with_viewer'} onCheckedChange={() => setFilterShared(filterShared === 'with_viewer' ? 'all' : 'with_viewer')} onSelect={(e) => e.preventDefault()} className="text-xs py-1.5 pl-8">
                  Shared with Viewer (External)
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
                className="pl-9 pr-8 h-8 text-sm border-slate-200 w-56"
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
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden gap-4">
        <div className="flex-1 min-w-0 overflow-auto p-4 bg-white">
          {isLoading ? (
            <div className="flex items-center justify-center min-h-[200px]">
              <LoadingSpinner size="md" className="min-h-0" />
            </div>
          ) : filteredShares.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-white/60 rounded-2xl border border-slate-200/60 mx-2">
              <Share2 className="h-11 w-11 mb-3 text-slate-300" />
              <p className="text-sm font-medium text-slate-600">
                {searchQuery.trim().length > 0 || filterShared !== 'all' ? 'No matches' : 'No shared documents yet'}
              </p>
              <p className="text-xs mt-1 text-slate-400">
                {searchQuery.trim().length > 0 || filterShared !== 'all'
                  ? 'Try adjusting your search or filter.'
                  : 'Share documents from the Files tab to see them here'}
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
              onParentFolderClick={onOpenInFiles ? handleOpenParentFolder : undefined}
              isExternalPersona={restrictToSharedOnly}
              isExternalViewer={isExternalViewer}
              deeplinkBase={deeplinkBase}
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
              onParentFolderClick={onOpenInFiles ? handleOpenParentFolder : undefined}
              isExternalPersona={restrictToSharedOnly}
              isExternalViewer={isExternalViewer}
              deeplinkBase={deeplinkBase}
            />
          ) : (
            <>
              <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <div className="grid grid-cols-3 gap-4 min-h-[360px]">
                  {LANES.map((lane) => (
                    <motion.div
                      key={lane.status}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col rounded-2xl overflow-hidden border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                    >
                      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-200/50 bg-white/60">
                        <div className={cn('rounded-lg bg-gradient-to-br p-1.5', lane.iconGradient)}>
                          {lane.icon}
                        </div>
                        <span className="text-sm font-semibold text-slate-700">{lane.label}</span>
                        <span className="text-xs text-slate-500">({byLane[lane.status].length})</span>
                      </div>
                      <DroppableLane id={lane.status} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[120px]">
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
                              onFinalize={() => handleFinalize(share.id, share.documentId)}
                              finalizingId={finalizingId}
                              canManage={canManage}
                              isDoneLane={lane.status === 'done'}
                              onShareSaved={refreshData}
                              handleSecureOpen={handleSecureOpenShare}
                              isRegrantingId={isRegrantingId}
                              onOpenComments={handleOpenComments}
                              extCollaboratorLabel={projExtCollaborator}
                              viewerLabel={projViewer}
                              onParentFolderClick={onOpenInFiles ? handleOpenParentFolder : undefined}
                              isExternalPersona={restrictToSharedOnly}
                              isExternalViewer={isExternalViewer}
                              deeplinkBase={deeplinkBase}
                            />
                          ))}
                        </AnimatePresence>
                      </DroppableLane>
                    </motion.div>
                  ))}
                </div>

                <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
                  {activeId ? (() => {
                    const share = shares.find((s) => s.id === activeId)
                    if (!share) return null
                    const status = (share.activity?.status ?? 'to_do') as ActivityStatus
                    const accent = CARD_ACCENT[status]
                    return (
                      <motion.div
                        layoutId={activeId}
                        className={cn(
                          'rounded-2xl overflow-hidden w-[280px] border border-slate-200/80 bg-white',
                          accent.border,
                          'shadow-[0_8px_24px_-8px_rgba(0,0,0,0.15)]'
                        )}
                        style={{ cursor: 'grabbing' }}
                      >
                        <div className="h-2 bg-slate-100/80" />
                        <ShareCardContent
                          share={share}
                          laneHeaderBg={accent.headerBg}
                          iconPillBg={accent.iconPillBg}
                          formatDate={formatDate}
                          getDocumentForMenu={getDocumentForMenu}
                          showActions={false}
                          finalizingId={null}
                          canManage={false}
                          isDoneLane={false}
                          handleSecureOpen={handleSecureOpenShare}
                          isRegrantingId={isRegrantingId}
                          onOpenComments={handleOpenComments}
                          extCollaboratorLabel={projExtCollaborator}
                          viewerLabel={projViewer}
                          onParentFolderClick={onOpenInFiles ? handleOpenParentFolder : undefined}
                        />
                      </motion.div>
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
      />
    </div>
  )
}
