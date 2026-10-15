"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import { DocumentIcon } from "@/components/ui/document-icon"
import { UserAvatarWithTooltip } from "@/components/ui/user-avatar-with-tooltip"
import { formatFileSize, formatSmartDateTime } from "@/lib/utils"
import { DocumentEditPanelContent, DocumentPreviewPanelContent, getDocumentEditUrl } from "@/components/files/document-edit-sheet"
import { DocumentPreviewPane } from "@/components/files/document-preview-pane"
import { useRightPane } from "@/lib/right-pane-context"
import { DocumentActivityPane } from "@/components/files/document-activity-pane"
import { DocumentHistoryPane } from "@/components/files/document-history-pane"
import { DocumentDocCommentsPane } from "@/components/projects/document-doc-comments-pane"
import { GoogleDriveIcon } from "@/components/ui/google-drive-icon"
import { OneDriveIcon } from "@/components/ui/onedrive-icon"
import {
  FileText,
  FolderOpen,
  MoreHorizontal,
  Download,
  ExternalLink,
  Bookmark,
  Edit3,
  Copy,
  Move,
  Clock,
  Trash2,
  Calendar,
  CalendarClock,
  Check,
  BadgeCheck,
  Info,
  Eye,
  X,
  XSquare,
  FolderLock,
  FolderUp,
  MessagesSquare,
  Link2,
  Lock,
  Unlock,
  ChevronRight,
  Folder,
  CheckCircle2,
  XCircle,
  Building2,
  Loader2,
  PackageMinus,
  Package,
} from "lucide-react"
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useToast } from "@/components/ui/toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useDownloadProgress } from "@/lib/download-progress-context"
import { SetupReminderModal } from "@/components/ui/setup-reminder-modal"
import { useAuth } from "@/lib/auth-context"

const VERSION_LOCK_TOOLTIP =
  'Finalize locks the document — all collaborators become view-only. Return to Draft restores each collaborator\'s prior access level based on their role and sharing settings.'

interface DocumentActionMenuProps {
  document: any
  /** Intake pending: EL can approve (clears lock, file becomes normal). */
  onApproveIntake?: (doc: any) => void
  /** Intake pending: EL can reject (deletes record + trashes Drive file). */
  onRejectIntake?: (doc: any) => void
  /** Intake pending: EC/EV can withdraw their own upload. */
  onWithdrawIntake?: (doc: any) => void
  /** EL only: approve all intake files in a folder at once */
  onApproveFolder?: (doc: any) => void
  /** EL only: reject all intake files in a folder at once */
  onRejectFolder?: (doc: any) => void
  /** EC/EV only: withdraw all their uploaded files in a folder at once */
  onWithdrawFolder?: (doc: any) => void
  onOpenDocument?: (doc: any) => void
  onDownloadDocument?: (doc: any) => void
  onShareDocument?: (doc: any) => void
  onBookmarkDocument?: (doc: any) => void
  onRenameDocument?: (doc: any) => void
  onDuplicateDocument?: (doc: any) => void
  onCopyDocument?: (doc: any) => void
  onMoveDocument?: (doc: any) => void
  /** Copy to a different engagement (EL only). Opens cross-engagement picker. */
  onCrossEngagementCopy?: (doc: any) => void
  onVersionHistory?: (doc: any) => void
  onDeleteDocument?: (doc: any) => void
  /** When set, Share opens the custom share modal instead of OS share. Only show Share item when true (Project Lead). */
  showShareModal?: boolean
  /** When true, the Share item is shown but disabled — an ancestor folder is already shared. */
  isAncestorShared?: boolean
  /** Required when showShareModal is true; project UUID for saving share settings. */
  projectId?: string
  orgSlug?: string
  /** Called after share settings are saved (e.g. to refresh shared badges). */
  onShareSaved?: () => void
  /** Called when user confirms "Promote as Deliverable" — caller handles API + refresh. dueDate is an optional ISO string. */
  onMarkAsDeliverable?: (doc: any, dueDate?: string) => void
  /** Called when user confirms "Untag as Deliverable" — caller handles revoke API + refresh. */
  onUntagAsDeliverable?: (doc: any) => void
  /** True when this folder is already a Deliverable (shows Untag instead of Tag). */
  isDeliverable?: boolean
  /** True when this folder is an Approved deliverable — hides Untag, disables Tag with lock tooltip. */
  isApprovedDeliverable?: boolean
  /** Current activity status of the deliverable — untag is only allowed when 'to_do'. */
  deliverableStatus?: string
  /** Project Lead / Client Partner / Org Owner: show persona move-tree options and allow Organize. */
  canManage?: boolean
  /** Current root folder type for persona options (Restrict / Restore / Promote). */
  currentFolderType?: 'general' | 'confidential' | 'staging'
  /** Mark document as Private (hidden from EC/EV users). EL only. */
  onMakePrivate?: (doc: any) => void
  /** Make document visible to all members again. EL only. */
  onMakePublic?: (doc: any) => void
  /** Called when the action menu opens or closes (e.g. to highlight the row/card). */
  onOpenChange?: (open: boolean) => void
  /** Optional custom icon for the trigger (e.g. MoreVertical for compact layouts). */
  triggerIcon?: React.ReactNode
  /** Optional: notify parent when comment pane is opened (e.g. to highlight row). */
  onOpenCommentPane?: (documentId: string) => void
  /** Optional: notify parent when info pane is opened (e.g. to highlight row). */
  onOpenInfoPane?: (documentId: string) => void
  /** Optional: notify parent when activity pane is opened (e.g. to highlight row). */
  onOpenActivityPane?: (documentId: string) => void
  /** Optional: notify parent when version pane is opened (e.g. to highlight row). */
  onOpenVersionPane?: (documentId: string) => void
  /** Engagement Lead only: Lock / Unlock version (files). Prefer explicit over showShareModal. */
  isEngagementLead?: boolean
  /** External user (EC or EV): hides Drive Actions and separator for all external users. */
  isExternalUser?: boolean
  /** External Viewer (EV only): shows Accept Document option. */
  isExternalViewer?: boolean
  /** Base URL for deeplink (e.g. ".../files"). Appended with #doc-file:{projectDocumentId}. Falls back to Drive URL if absent. */
  deeplinkBase?: string
  /** When true, renders the trigger button but blocks opening the menu (e.g. pending intake rows). */
  disabled?: boolean
  /** When true, renders the menu visually but blocks all item clicks (sandbox preview mode). */
  sandboxPreview?: boolean
  /** Connector account email — appended as ?authuser= to Google Drive folder URLs. */
  connectorAccountEmail?: string | null
  /** True when the client's connector is OneDrive — picks the correct provider icon for
   *  "Open folder in Drive UI". */
  isOneDriveClient?: boolean
}

export function DocumentActionMenu({
  document,
  onApproveIntake,
  onRejectIntake,
  onWithdrawIntake,
  onApproveFolder,
  onRejectFolder,
  onWithdrawFolder,
  onOpenDocument,
  onDownloadDocument,
  onShareDocument,
  onBookmarkDocument,
  onRenameDocument,
  onDuplicateDocument,
  onCopyDocument,
  onMoveDocument,
  onCrossEngagementCopy,
  onVersionHistory,
  onDeleteDocument,
  showShareModal = false,
  isAncestorShared = false,
  projectId,
  onShareSaved,
  onMarkAsDeliverable,
  onUntagAsDeliverable,
  isDeliverable = false,
  isApprovedDeliverable = false,
  deliverableStatus,
  canManage = false,
  currentFolderType,
  onMakePrivate,
  onMakePublic,
  onOpenChange,
  triggerIcon,
  onOpenCommentPane,
  onOpenInfoPane,
  onOpenActivityPane,
  onOpenVersionPane,
  isEngagementLead,
  isExternalUser,
  isExternalViewer,
  deeplinkBase,
  orgSlug,
  disabled = false,
  sandboxPreview = false,
  connectorAccountEmail,
  isOneDriveClient = false,
}: DocumentActionMenuProps) {
  const [showDueDatePicker, setShowDueDatePicker] = useState(false)
  const [showUntagConfirm, setShowUntagConfirm] = useState(false)
  const [showTagDeliverableModal, setShowTagDeliverableModal] = useState(false)
  const [tagDeliverableDueDate, setTagDeliverableDueDate] = useState<string>("")
  const [existingBookmarkId, setExistingBookmarkId] = useState<string | null>(null)
  /** Drive id or project document UUID — disables Finalize row while request in flight */
  const [finalizeLockActiveId, setFinalizeLockActiveId] = useState<string | null>(null)
  const [selectedDueDate, setSelectedDueDate] = useState<string>("")
  const [hasCopiedName, setHasCopiedName] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [privateInfoOpen, setPrivateInfoOpen] = useState(false)
  const [showReminderModal, setShowReminderModal] = useState(false)
  const [reminderMembers, setReminderMembers] = useState<{ userId: string; email: string; name: string; role: string; avatarUrl?: string | null }[]>([])
  const [existingDocReminders, setExistingDocReminders] = useState<Map<string, { reminderId: string; dateValue: string | null }>>(new Map())
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const { addToast } = useToast()
  const rightPane = useRightPane()
  const { addTask, updateTask } = useDownloadProgress()
  const { user } = useAuth()

  const mime = (document?.mimeType ?? '').toLowerCase()
  const canOpenWithGoogleDoc = mime.includes('document') || mime.includes('vnd.google-apps.document')
  const canOpenWithGoogleSheet = mime.includes('spreadsheet') || mime.includes('vnd.google-apps.spreadsheet')
  const canOpenWithGoogleSlide = mime.includes('presentation') || mime.includes('vnd.google-apps.presentation')

  // Ensure we're on the client side
  useEffect(() => {
    setMounted(true)
  }, [])

  // Handle copy name
  const handleCopyName = (e: React.MouseEvent, text: string) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text)
    setHasCopiedName(true)
    setTimeout(() => setHasCopiedName(false), 2000)
  }

  // Handle due date selection — empty string means clear
  const handleDueDateChange = async (dateTime: string) => {
    try {
      if (!projectId) {
        addToast({ type: 'error', title: 'Unavailable', message: 'Project context is required to set a due date.' })
        return
      }

      const { getSession } = await import('@/lib/supabase')
      const session = await getSession()
      if (!session?.access_token) {
        addToast({ type: 'error', title: 'Unauthorized', message: 'Please sign in again.' })
        return
      }

      const res = await fetch(`/api/projects/${projectId}/documents/${encodeURIComponent(documentIdForProjectApis)}/due-date`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ dueDate: dateTime || null }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Failed to update due date')
      }

      document.dueDate = dateTime || null
      setSelectedDueDate(dateTime)
      setShowDueDatePicker(false)

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pockett-notifications-updated'))
      }
      addToast({ type: 'success', title: 'Saved', message: dateTime ? 'Due date updated.' : 'Due date cleared.' })
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Failed',
        message: error instanceof Error ? error.message : 'Failed to update due date.',
      })
    }
  }

  const documentIdForProjectApis =
    (document as { projectDocumentId?: string })?.projectDocumentId || document?.id
  const finalizeLockInFlightRef = useRef(false)
  const finalizeLockDisabled =
    !!finalizeLockActiveId && finalizeLockActiveId === documentIdForProjectApis

  const leadForVersionLock = isEngagementLead ?? showShareModal

  const handleFinalizeAndLock = useCallback(async () => {
    if (!projectId || !leadForVersionLock) return
    const docId = documentIdForProjectApis
    if (!docId) {
      addToast({
        type: 'error',
        title: 'Unavailable',
        message: 'Document must be indexed before you can finalize.',
      })
      return
    }
    if (finalizeLockInFlightRef.current) return
    finalizeLockInFlightRef.current = true
    setFinalizeLockActiveId(docId)
    try {
      const { getSession } = await import('@/lib/supabase')
      const session = await getSession()
      if (!session?.access_token) {
        addToast({ type: 'error', title: 'Unauthorized', message: 'Please sign in again.' })
        return
      }
      const res = await fetch(
        `/api/projects/${projectId}/documents/${encodeURIComponent(docId)}/sharing/finalize`,
        { method: 'PATCH', headers: { Authorization: `Bearer ${session.access_token}` } }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(typeof err?.error === 'string' ? err.error : 'Failed to finalize')
      }
      addToast({ type: 'success', title: 'Version locked', message: 'Collaborators can view this file only until you unlock.' })
      onShareSaved?.()
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Lock failed',
        message: error instanceof Error ? error.message : 'Could not lock document version.',
      })
    } finally {
      finalizeLockInFlightRef.current = false
      setFinalizeLockActiveId(null)
    }
  }, [projectId, leadForVersionLock, documentIdForProjectApis, addToast, onShareSaved])

  const handleUnlockVersion = useCallback(async () => {
    if (!projectId || !leadForVersionLock) return
    const docId = documentIdForProjectApis
    if (!docId) return
    if (finalizeLockInFlightRef.current) return
    finalizeLockInFlightRef.current = true
    setFinalizeLockActiveId(docId)
    try {
      const { getSession } = await import('@/lib/supabase')
      const session = await getSession()
      if (!session?.access_token) {
        addToast({ type: 'error', title: 'Unauthorized', message: 'Please sign in again.' })
        return
      }
      const res = await fetch(
        `/api/projects/${projectId}/documents/${encodeURIComponent(docId)}/sharing/unlock`,
        { method: 'PATCH', headers: { Authorization: `Bearer ${session.access_token}` } }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(typeof err?.error === 'string' ? err.error : 'Failed to unlock')
      }
      addToast({ type: 'success', title: 'Unlocked', message: 'Edit access restored where supported by Google Drive.' })
      onShareSaved?.()
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Unlock failed',
        message: error instanceof Error ? error.message : 'Could not unlock document.',
      })
    } finally {
      finalizeLockInFlightRef.current = false
      setFinalizeLockActiveId(null)
    }
  }, [projectId, leadForVersionLock, documentIdForProjectApis, addToast, onShareSaved])

  const handleAcceptDocument = useCallback(async () => {
    if (!projectId || !isExternalViewer) return
    const docId = documentIdForProjectApis
    if (!docId) {
      addToast({ type: 'error', title: 'Unavailable', message: 'Document must be indexed before it can be accepted.' })
      return
    }
    if (finalizeLockInFlightRef.current) return
    finalizeLockInFlightRef.current = true
    setFinalizeLockActiveId(docId)
    try {
      const { getSession } = await import('@/lib/supabase')
      const session = await getSession()
      if (!session?.access_token) {
        addToast({ type: 'error', title: 'Unauthorized', message: 'Please sign in again.' })
        return
      }
      const res = await fetch(
        `/api/projects/${projectId}/documents/${encodeURIComponent(docId)}/sharing/accept`,
        { method: 'PATCH', headers: { Authorization: `Bearer ${session.access_token}` } }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(typeof err?.error === 'string' ? err.error : 'Failed to accept')
      }
      addToast({ type: 'success', title: 'Document accepted', message: 'The document has been accepted and is now locked.' })
      onShareSaved?.()
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Accept failed',
        message: error instanceof Error ? error.message : 'Could not accept document.',
      })
    } finally {
      finalizeLockInFlightRef.current = false
      setFinalizeLockActiveId(null)
    }
  }, [projectId, isExternalViewer, documentIdForProjectApis, addToast, onShareSaved])

  const getDisplayType = (doc: any) => {
    if (doc.documentType === 'LINK') return "External URL"
    if (doc.mimeType?.includes('folder')) return "Folder"
    if (doc.mimeType?.includes('document')) return "Document"
    if (doc.mimeType?.includes('spreadsheet')) return "Spreadsheet"
    if (doc.mimeType?.includes('presentation')) return "Presentation"
    if (doc.type?.includes('pdf')) return "PDF"
    return "File"
  }

  const handleDownload = async (doc: any) => {
    if (doc.mimeType?.includes('folder')) return

    try {
      const { getSession } = await import('@/lib/supabase')
      const session = await getSession()

      if (!session) {
        console.error('No session found for download')
        return
      }

      const filename: string = doc.name
      const effectiveProjectId = doc.projectId ?? projectId

      if (effectiveProjectId && doc.id) {
        // Shared document: server resolves connector + PDF/original.
        // May involve PDF generation — show progress indicator while waiting.
        const downloadUrl = `/api/projects/${effectiveProjectId}/documents/${encodeURIComponent(doc.id)}/download-share`
        const taskId = addTask(filename)
        try {
          const res = await fetch(downloadUrl)
          if (!res.ok) {
            updateTask(taskId, { status: 'error', error: res.status === 403 ? 'Download not permitted' : 'Download failed' })
            return
          }
          const blob = await res.blob()
          updateTask(taskId, { status: 'complete' })
          const blobUrl = URL.createObjectURL(blob)
          const a = window.document.createElement('a')
          a.href = blobUrl
          a.download = filename
          window.document.body.appendChild(a)
          a.click()
          window.document.body.removeChild(a)
          setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
        } catch (err) {
          updateTask(taskId, { status: 'error', error: 'Download failed' })
          console.error('Share download error:', err)
        }
      } else {
        // Files tab: generic download with explicit connector + Drive file ID (anchor, no progress needed)
        const fileId = doc.externalId || doc.id
        const downloadUrl = `/api/documents/download?fileId=${fileId}&connectorId=${doc.connectorId}&filename=${encodeURIComponent(filename)}&token=${session.access_token}`
        const a = window.document.createElement('a')
        a.href = downloadUrl
        a.download = filename
        window.document.body.appendChild(a)
        a.click()
        window.document.body.removeChild(a)
      }
    } catch (error) {
      console.error('Download error:', error)
    }
  }

  return (
    <>
      <DropdownMenu onOpenChange={async (open) => {
        onOpenChange?.(open)
        if (open) {
          const projectDocumentId = (document as any)?.projectDocumentId as string | undefined
          if (projectDocumentId) {
            try {
              const { getSession } = await import('@/lib/supabase')
              const session = await getSession()
              if (session?.access_token) {
                const res = await fetch('/api/bookmarks', { headers: { Authorization: `Bearer ${session.access_token}` } })
                if (res.ok) {
                  const data = await res.json()
                  const match = (data.bookmarks ?? []).find((b: any) => b.kind === 'document' && b.documentId === projectDocumentId)
                  setExistingBookmarkId(match?.id ?? null)
                }
              }
            } catch { /* non-critical */ }
          }
        }
      }}>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()} disabled={disabled}>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            data-demo-tour="document-action-trigger"
            className="text-fg-muted hover:text-fg hover:bg-surface-hover h-8 w-8 p-0 disabled:opacity-30 disabled:cursor-not-allowed"
            title="More actions"
          >
            {triggerIcon ?? <MoreHorizontal className="h-4 w-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="bottom"
          align="end"
          avoidCollisions
          collisionPadding={8}
          sideOffset={0}
          className="w-80 p-0 flex flex-col overflow-hidden"
          style={{ maxHeight: 'var(--radix-dropdown-menu-content-available-height)' }}
          onClick={(e) => e.stopPropagation()}
          onCloseAutoFocus={(e) => e.preventDefault()} // Prevent focus jump causing scroll
        >
          {sandboxPreview && (
            <div className="absolute inset-0 z-10 rounded-[inherit] pointer-events-auto cursor-not-allowed bg-transparent" />
          )}
          <div className="px-3 py-2.5 border-b border-line flex-none">
            <div className="flex items-center space-x-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-surface-muted">
                <DocumentIcon mimeType={document.mimeType} className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0 pr-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <h3 className="max-w-[180px] cursor-default select-text truncate text-ui font-medium text-fg">
                          {document.name}
                        </h3>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" align="start" className="max-w-[300px] break-words">
                        <p>{document.name}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <button
                    onClick={(e) => handleCopyName(e, document.name)}
                    className="shrink-0 rounded-control p-0.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                    title="Copy name"
                  >
                    {hasCopiedName ? <Check className="h-3 w-3 text-action" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
                <p className="text-small text-fg-muted">
                  {getDisplayType(document)}
                  {!document.mimeType?.includes('folder') && document.size != null && typeof document.size === 'number' && (
                    <> • {formatFileSize(document.size)}</>
                  )}
                </p>
                {(document.modifiedTime || document.createdTime) && (
                  <p className="text-caption text-fg-subtle mt-0.5">
                    {document.lastModifyingUser?.displayName || 'Unknown'} · {document.modifiedTime && !Number.isNaN(new Date(document.modifiedTime).getTime()) ? formatSmartDateTime(document.modifiedTime) : document.createdTime && !Number.isNaN(new Date(document.createdTime).getTime()) ? formatSmartDateTime(document.createdTime) : '—'}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="p-2 overflow-y-auto min-h-0">
            {/* Intake pending actions — shown at the top when applicable */}
            {(onApproveIntake || onRejectIntake || onWithdrawIntake) && (
              <>
                {onApproveIntake && (
                  <DropdownMenuItem
                    onSelect={() => onApproveIntake(document)}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <CheckCircle2 className="h-4 w-4 text-action" />
                    <span>Approve</span>
                  </DropdownMenuItem>
                )}
                {onRejectIntake && (
                  <DropdownMenuItem
                    onSelect={() => onRejectIntake(document)}
                    className="flex cursor-pointer items-center gap-2 text-danger focus:text-danger"
                  >
                    <XCircle className="h-4 w-4 text-danger" />
                    <span>Reject</span>
                  </DropdownMenuItem>
                )}
                {onWithdrawIntake && (
                  <DropdownMenuItem
                    onSelect={() => onWithdrawIntake(document)}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <X className="h-4 w-4 text-fg-muted" />
                    <span>Withdraw upload</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
              </>
            )}
            {(onApproveFolder || onRejectFolder || onWithdrawFolder) && (
              <>
                {onApproveFolder && (
                  <DropdownMenuItem
                    onSelect={() => onApproveFolder(document)}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <CheckCircle2 className="h-4 w-4 text-action" />
                    <span>Approve folder upload</span>
                  </DropdownMenuItem>
                )}
                {onRejectFolder && (
                  <DropdownMenuItem
                    onSelect={() => onRejectFolder(document)}
                    className="flex cursor-pointer items-center gap-2 text-danger focus:text-danger"
                  >
                    <XCircle className="h-4 w-4 text-danger" />
                    <span>Reject folder</span>
                  </DropdownMenuItem>
                )}
                {onWithdrawFolder && (
                  <DropdownMenuItem
                    onSelect={() => onWithdrawFolder(document)}
                    className="flex items-center gap-2 px-2 py-1.5 cursor-pointer text-ui text-tag-orange-fg focus:text-tag-orange-fg"
                  >
                    <FolderUp className="h-4 w-4 text-tag-orange-fg" />
                    <span>Withdraw folder</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
              </>
            )}
            {document.mimeType?.includes('folder') ? (
              <>
                <DropdownMenuItem
                  onClick={() => {
                    const docId = (document as any).projectDocumentId || document.id
                    if (!deeplinkBase) return
                    navigator.clipboard.writeText(`${deeplinkBase}#doc-file:${docId}`)
                      .then(() => addToast({ type: 'success', title: 'Link copied', message: 'Link copied to clipboard' }))
                      .catch(() => addToast({ type: 'error', title: 'Copy failed', message: 'Could not copy link.' }))
                  }}
                  className="flex cursor-pointer items-center gap-2"
                >
                  <Link2 className="h-4 w-4 text-fg-muted" />
                  <span>Copy link</span>
                </DropdownMenuItem>
                {showShareModal && projectId && (
                  isApprovedDeliverable ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DropdownMenuItem
                            aria-disabled="true"
                            onSelect={(e) => e.preventDefault()}
                            className="flex items-center gap-2 px-2 py-1.5 text-ui opacity-50 cursor-not-allowed"
                          >
                            <XCircle className="h-4 w-4" />
                            <span>Untag as Deliverable</span>
                          </DropdownMenuItem>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="text-xs max-w-48">Approved deliverables cannot be untagged</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : isDeliverable ? (
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault()
                        if (deliverableStatus && deliverableStatus !== 'to_do') {
                          addToast({ type: 'error', title: 'Cannot untag', message: 'Only deliverables with a To Do status can be untagged.' })
                          return
                        }
                        setShowUntagConfirm(true)
                      }}
                      className="flex items-center gap-2 px-2 py-1.5 cursor-pointer text-ui text-danger focus:text-danger"
                    >
                      <XCircle className="h-4 w-4" />
                      <span>Untag as Deliverable</span>
                    </DropdownMenuItem>
                  ) : isAncestorShared ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DropdownMenuItem
                            aria-disabled="true"
                            onSelect={(e) => e.preventDefault()}
                            className="flex items-center gap-2 px-2 py-1.5 text-ui opacity-50 cursor-not-allowed"
                          >
                            <Package className="h-4 w-4 text-fg-subtle" />
                            <span>Promote as Deliverable</span>
                          </DropdownMenuItem>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="text-xs max-w-48">An ancestor folder is already a Deliverable</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DropdownMenuItem
                            onSelect={(e) => { e.preventDefault(); setTagDeliverableDueDate(""); setShowTagDeliverableModal(true) }}
                            className="flex cursor-pointer items-center gap-2"
                          >
                            <Package className="h-4 w-4 text-fg-subtle" />
                            <span>Promote as Deliverable</span>
                          </DropdownMenuItem>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="text-xs max-w-48">Deliverables will be shared externally</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )
                )}
                {isApprovedDeliverable && !onCopyDocument ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2 px-2 py-1.5 text-ui text-fg-subtle opacity-50 cursor-not-allowed select-none">
                          <FolderOpen className="h-4 w-4" />
                          <span>Organize</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs max-w-48">
                        Approved deliverables cannot be reorganized
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (onCopyDocument || onMoveDocument || onRenameDocument || onDuplicateDocument || canManage) && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="flex cursor-pointer items-center gap-2">
                      <FolderOpen className="h-4 w-4 text-fg-muted" />
                      <span>Organize</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-56">
                      {onRenameDocument && (
                        isApprovedDeliverable ? (
                          <div className="flex items-center gap-2 px-2 py-1.5 text-ui text-fg-subtle opacity-40 cursor-not-allowed select-none">
                            <Edit3 className="h-4 w-4" /><span>Rename</span>
                          </div>
                        ) : (
                          <DropdownMenuItem onSelect={() => onRenameDocument(document)} className="flex cursor-pointer items-center gap-2">
                            <Edit3 className="h-4 w-4 text-fg-muted" />
                            <span>Rename</span>
                          </DropdownMenuItem>
                        )
                      )}
                      {onDuplicateDocument && (
                        isApprovedDeliverable ? (
                          <div className="flex items-center gap-2 px-2 py-1.5 text-ui text-fg-subtle opacity-40 cursor-not-allowed select-none">
                            <Copy className="h-4 w-4" /><span>Duplicate</span>
                          </div>
                        ) : (
                          <DropdownMenuItem onSelect={() => onDuplicateDocument(document)} className="flex cursor-pointer items-center gap-2">
                            <Copy className="h-4 w-4 text-fg-muted" />
                            <span>Duplicate</span>
                          </DropdownMenuItem>
                        )
                      )}
                      {onCopyDocument && (
                        <DropdownMenuItem onSelect={() => onCopyDocument(document)} className="flex cursor-pointer items-center gap-2">
                          <Copy className="h-4 w-4 text-fg-muted" />
                          <span>Copy</span>
                        </DropdownMenuItem>
                      )}
                      {onMoveDocument && (
                        isApprovedDeliverable ? (
                          <div className="flex items-center gap-2 px-2 py-1.5 text-ui text-fg-subtle opacity-40 cursor-not-allowed select-none">
                            <Move className="h-4 w-4" /><span>Move</span>
                          </div>
                        ) : (
                          <DropdownMenuItem onSelect={() => onMoveDocument(document)} className="flex cursor-pointer items-center gap-2">
                            <Move className="h-4 w-4 text-fg-muted" />
                            <span>Move</span>
                          </DropdownMenuItem>
                        )
                      )}
                      {(canManage && (onMakePrivate || onMakePublic)) && <DropdownMenuSeparator />}
                      {canManage && !document.isPrivate && onMakePrivate && (
                        isApprovedDeliverable ? (
                          <div className="flex items-center gap-2 px-2 py-1.5 text-ui text-fg-subtle opacity-40 cursor-not-allowed select-none">
                            <FolderLock className="h-4 w-4" /><span>Make Private</span>
                          </div>
                        ) : document.isSharedWithExternal ? (
                          <TooltipProvider>
                            <Tooltip open={privateInfoOpen} onOpenChange={setPrivateInfoOpen}>
                              <TooltipTrigger asChild>
                                <div
                                  onClick={(e) => { e.stopPropagation(); setPrivateInfoOpen((v) => !v) }}
                                  className="flex items-center gap-2 px-2 py-1.5 text-ui text-fg-subtle cursor-pointer opacity-50 rounded-control hover:bg-surface-hover"
                                >
                                  <FolderLock className="h-4 w-4 text-fg-subtle" />
                                  <span>Make Private</span>
                                  <Info className="h-3.5 w-3.5 ml-auto text-fg-subtle" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="text-xs max-w-[220px]">
                                A shared document cannot be made Private. Turn off sharing first.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <DropdownMenuItem onClick={() => onMakePrivate(document)} className="flex cursor-pointer items-center gap-2">
                            <FolderLock className="h-4 w-4 text-fg-subtle" />
                            <span>Make Private</span>
                          </DropdownMenuItem>
                        )
                      )}
                      {canManage && document.isPrivate && onMakePublic && (
                        isApprovedDeliverable ? (
                          <div className="flex items-center gap-2 px-2 py-1.5 text-ui text-fg-subtle opacity-40 cursor-not-allowed select-none">
                            <FolderUp className="h-4 w-4" /><span>Make Public</span>
                          </div>
                        ) : (
                          <DropdownMenuItem onClick={() => onMakePublic(document)} className="flex cursor-pointer items-center gap-2">
                            <FolderUp className="h-4 w-4 text-fg-muted" />
                            <span>Make Public</span>
                          </DropdownMenuItem>
                        )
                      )}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                {(onDeleteDocument || isApprovedDeliverable) && (
                  <>
                    <DropdownMenuSeparator />
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          {isApprovedDeliverable ? (
                            <div className="flex items-center gap-2 px-2 py-1.5 text-ui text-fg-subtle opacity-50 cursor-not-allowed select-none">
                              <Trash2 className="h-4 w-4" />
                              <span>{document.documentType === 'LINK' ? 'Delete' : 'Move to Bin'}</span>
                            </div>
                          ) : (
                            <DropdownMenuItem
                              onSelect={(e) => { e.preventDefault(); onDeleteDocument!(document); }}
                              className="flex cursor-pointer items-center gap-2 text-danger focus:text-danger"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span>{document.documentType === 'LINK' ? 'Delete' : 'Move to Bin'}</span>
                            </DropdownMenuItem>
                          )}
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[200px]">
                          {isApprovedDeliverable
                            ? <p>Approved deliverables cannot be deleted</p>
                            : document.documentType === 'LINK'
                              ? <p>This link will be permanently deleted.</p>
                              : <p>Items in Bin are permanently deleted after 30 days (Google Drive).</p>
                          }
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </>
                )}
                {!isExternalUser && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="flex cursor-pointer items-center gap-2">
                      <ExternalLink className="h-4 w-4 text-fg-muted" />
                      <span>Drive Actions</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-56">
                      <DropdownMenuItem
                        onClick={() => {
                          // webViewLink is the provider-correct URL (Google's Drive UI link or
                          // Graph's driveItem.webUrl for OneDrive/SharePoint), already populated
                          // on the file listing (onedrive-list-files.ts / google-drive listing).
                          // Falls back to the old hardcoded Google URL only if it's ever missing.
                          const driveUrl = document.webViewLink || `https://drive.google.com/drive/folders/${document.id}`
                          if (typeof window !== 'undefined') window.open(driveUrl, '_blank')
                        }}
                        className="flex cursor-pointer items-center gap-2"
                      >
                        {isOneDriveClient ? (
                          <OneDriveIcon size={16} />
                        ) : (
                          <GoogleDriveIcon size={16} />
                        )}
                        <span>Open folder in Drive UI</span>
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </>
                )}
              </>
            ) : (
              <>
                {document.documentType !== 'LINK' && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="flex cursor-pointer items-center gap-2">
                    <Info className="h-4 w-4 text-fg-muted" />
                    <span>Info</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-56">
                    <DropdownMenuItem
                      onClick={() => {
                        onOpenInfoPane?.(document.id)
                        rightPane.setTitle('File information')
                        rightPane.setHeaderIcon(<DocumentIcon mimeType={document.mimeType} className="h-4 w-4" />)
                        rightPane.setHeaderSubtitle('')
                        rightPane.setHeaderActions(null)
                        rightPane.setContent(
                          <div className="flex flex-col h-full min-h-0 p-4 min-w-0">
                            {document.parentName && (
                              <div className="flex items-center gap-1 text-caption text-fg-subtle mb-2">
                                <Folder className="h-3 w-3" />
                                <span>{document.parentName}</span>
                                <ChevronRight className="h-3 w-3" />
                                <span className="text-fg-muted font-medium truncate max-w-[180px]">{document.name}</span>
                              </div>
                            )}
                            <div className="mb-4 inline-flex max-w-full items-center gap-2 rounded-card border border-line bg-surface-subtle px-3 py-2">
                              <span className="truncate text-xs font-medium text-fg-muted" title={document.name}>{document.name}</span>
                            </div>
                            <div className="space-y-3 rounded-card border border-line bg-surface px-3 py-3">
                              <div className="flex justify-between items-center">
                                <span className="text-xs text-fg-muted">File type</span>
                                <span className="text-xs">{getDisplayType(document)}</span>
                              </div>
                              {(document.mimeType ?? '').trim() !== '' && (
                                <div className="flex justify-between items-center">
                                  <span className="text-xs text-fg-muted">Mime type</span>
                                  <span className="font-mono text-caption truncate max-w-[240px] text-right" title={document.mimeType ?? ''}>{document.mimeType}</span>
                                </div>
                              )}
                              {document.size != null && typeof document.size === 'number' && (
                                <div className="flex justify-between items-center">
                                  <span className="text-xs text-fg-muted">Size</span>
                                  <span className="text-xs">{formatFileSize(document.size)}</span>
                                </div>
                              )}
                              {document.modifiedTime && !Number.isNaN(new Date(document.modifiedTime).getTime()) && (
                                <div className="flex justify-between items-center">
                                  <span className="text-xs text-fg-muted">Modified</span>
                                  <span className="text-xs">{formatSmartDateTime(document.modifiedTime)}</span>
                                </div>
                              )}
                              {document.createdTime && !Number.isNaN(new Date(document.createdTime).getTime()) && (
                                <div className="flex justify-between items-center">
                                  <span className="text-xs text-fg-muted">Created</span>
                                  <span className="text-xs">{formatSmartDateTime(document.createdTime)}</span>
                                </div>
                              )}
                              {(document.owners?.[0]?.displayName || document.lastModifyingUser?.displayName) && (
                                <div className="flex justify-between items-center">
                                  <span className="text-xs text-fg-muted">Owner</span>
                                  {document.owners?.[0] ? (
                                    <UserAvatarWithTooltip
                                      displayName={document.owners[0].displayName}
                                      photoLink={document.owners[0].photoLink}
                                      email={document.owners[0].emailAddress}
                                      avatarSize="md"
                                      showEmail={true}
                                      showRole={false}
                                    />
                                  ) : (
                                    <span className="text-xs">{document.lastModifyingUser?.displayName || '—'}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                        rightPane.setExpanded?.(false)
                      }}
                      className="flex cursor-pointer items-center gap-2"
                    >
                      <Info className="h-4 w-4 text-fg-muted" />
                      <span>File information</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        onOpenActivityPane?.(document.id)
                        rightPane.setTitle('Activity Stream')
                        rightPane.setHeaderIcon(<DocumentIcon mimeType={document.mimeType} className="h-4 w-4" />)
                        rightPane.setHeaderSubtitle('Last 30 days')
                        rightPane.setHeaderActions(null)
                        rightPane.setContent(<DocumentActivityPane document={document} />)
                        rightPane.setExpanded?.(false)
                      }}
                      className="flex cursor-pointer items-center gap-2"
                    >
                      <Clock className="h-4 w-4 text-fg-muted" />
                      <span>Activity Stream</span>
                    </DropdownMenuItem>
                    {document.documentType !== 'LINK' && (
                    <DropdownMenuItem
                      onClick={() => {
                        onOpenVersionPane?.(document.id)
                        rightPane.setTitle('Version History')
                        rightPane.setHeaderIcon(<DocumentIcon mimeType={document.mimeType} className="h-4 w-4" />)
                        rightPane.setHeaderSubtitle('Full history')
                        rightPane.setHeaderActions(null)
                        rightPane.setContent(<DocumentHistoryPane document={document} />)
                        rightPane.setExpanded?.(false)
                        onVersionHistory?.(document)
                      }}
                      className="flex cursor-pointer items-center gap-2"
                    >
                      <Clock className="h-4 w-4 text-fg-muted" />
                      <span>Version History</span>
                    </DropdownMenuItem>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                )}

                <DropdownMenuSeparator />

                {isApprovedDeliverable ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2 px-2 py-1.5 text-ui text-fg-subtle opacity-50 cursor-not-allowed select-none">
                          <Eye className="h-4 w-4" />
                          <span>Open</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs max-w-48">
                        Use the preview panel to view this document
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <DropdownMenuItem
                    onClick={() => {
                      if (document.documentType === 'LINK' && document.externalUrl) {
                        window.open(document.externalUrl, '_blank', 'noopener,noreferrer')
                        return
                      }
                      if (onOpenDocument) {
                        onOpenDocument(document)
                      } else if (rightPane.hasRightPane) {
                        rightPane.setTitle(document.name || 'Preview')
                        rightPane.setContent(<DocumentPreviewPanelContent document={document} />)
                      }
                    }}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <Eye className="h-4 w-4 text-fg-muted" />
                    <span>Open</span>
                  </DropdownMenuItem>
                )}

                <DropdownMenuItem
                  onClick={() => {
                    const docId = (document as any).projectDocumentId || document.id
                    if (!deeplinkBase) return
                    navigator.clipboard.writeText(`${deeplinkBase}#doc-file:${docId}`)
                      .then(() => addToast({ type: 'success', title: 'Link copied', message: 'Link copied to clipboard' }))
                      .catch(() => addToast({ type: 'error', title: 'Copy failed', message: 'Could not copy link.' }))
                  }}
                  className="flex cursor-pointer items-center gap-2"
                >
                  <Link2 className="h-4 w-4 text-fg-muted" />
                  <span>Copy link</span>
                </DropdownMenuItem>

                {document.documentType !== 'LINK' &&
                 !(document.isGuest && !document.allowDownload) &&
                 !(document.isExternalCollaborator && !document.ecAllowDownload) && (
                  <DropdownMenuItem
                    onClick={() => { handleDownload(document); onDownloadDocument?.(document) }}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <Download className="h-4 w-4 text-fg-subtle" />
                    <span>Download</span>
                  </DropdownMenuItem>
                )}

                {/* Comments (folders only — files have Comments inside the deliverable detail pane) */}
                {projectId && document.mimeType?.includes('folder') && (
                  <DropdownMenuItem
                    onClick={() => {
                      if (rightPane.hasRightPane) {
                        onOpenCommentPane?.(document.id)
                        const docIdForComments = (document as any)?.projectDocumentId || document.id
                        rightPane.setTitle('Comments')
                        rightPane.setHeaderActions(null)
                        rightPane.setHeaderIcon(<DocumentIcon mimeType={document.mimeType} className="h-4 w-4" />)
                        rightPane.setHeaderSubtitle('Append-only. Visible to all project members.')
                        rightPane.setContent(
                          <DocumentDocCommentsPane
                            engagementId={projectId}
                            documentId={docIdForComments}
                            documentName={document.name}
                            documentMimeType={document.mimeType}
                            orgSlug={orgSlug}
                          />
                        )
                        rightPane.setExpanded?.(false)
                      }
                    }}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <MessagesSquare className="h-4 w-4 text-fg-muted" />
                    <span>Comment</span>
                  </DropdownMenuItem>
                )}

                {/* Organize (Copy + Move + persona options) */}
                {isApprovedDeliverable && !onCopyDocument ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2 px-2 py-1.5 text-ui text-fg-subtle opacity-50 cursor-not-allowed select-none">
                          <FolderOpen className="h-4 w-4" />
                          <span>Organize</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs max-w-48">
                        Approved deliverables cannot be reorganized
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (onCopyDocument || onMoveDocument || onRenameDocument || onDuplicateDocument || canManage) && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="flex cursor-pointer items-center gap-2">
                      <FolderOpen className="h-4 w-4 text-fg-muted" />
                      <span>Organize</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-56">
                      {onRenameDocument && (
                        isApprovedDeliverable ? (
                          <div className="flex items-center gap-2 px-2 py-1.5 text-ui text-fg-subtle opacity-40 cursor-not-allowed select-none">
                            <Edit3 className="h-4 w-4" /><span>Rename</span>
                          </div>
                        ) : (
                          <DropdownMenuItem
                            onSelect={() => onRenameDocument(document)}
                            className="flex cursor-pointer items-center gap-2"
                          >
                            <Edit3 className="h-4 w-4 text-fg-muted" />
                            <span>Rename</span>
                          </DropdownMenuItem>
                        )
                      )}
                      {onDuplicateDocument && document.documentType !== 'LINK' && (
                        isApprovedDeliverable ? (
                          <div className="flex items-center gap-2 px-2 py-1.5 text-ui text-fg-subtle opacity-40 cursor-not-allowed select-none">
                            <Copy className="h-4 w-4" /><span>Duplicate</span>
                          </div>
                        ) : (
                          <DropdownMenuItem
                            onSelect={() => onDuplicateDocument(document)}
                            className="flex cursor-pointer items-center gap-2"
                          >
                            <Copy className="h-4 w-4 text-fg-muted" />
                            <span>Duplicate</span>
                          </DropdownMenuItem>
                        )
                      )}
                      {onCopyDocument && document.documentType !== 'LINK' && (
                        <DropdownMenuItem
                          onSelect={() => onCopyDocument(document)}
                          className="flex cursor-pointer items-center gap-2"
                        >
                          <Copy className="h-4 w-4 text-fg-muted" />
                          <span>Copy</span>
                        </DropdownMenuItem>
                      )}
                      {onMoveDocument && document.documentType !== 'LINK' && (
                        isApprovedDeliverable ? (
                          <div className="flex items-center gap-2 px-2 py-1.5 text-ui text-fg-subtle opacity-40 cursor-not-allowed select-none">
                            <Move className="h-4 w-4" /><span>Move</span>
                          </div>
                        ) : (
                          <DropdownMenuItem
                            onSelect={() => onMoveDocument(document)}
                            className="flex cursor-pointer items-center gap-2"
                          >
                            <Move className="h-4 w-4 text-fg-muted" />
                            <span>Move</span>
                          </DropdownMenuItem>
                        )
                      )}
                      {onCrossEngagementCopy && document.documentType !== 'LINK' && <DropdownMenuSeparator />}
                      {onCrossEngagementCopy && document.documentType !== 'LINK' && (
                        <DropdownMenuItem
                          onSelect={() => onCrossEngagementCopy(document)}
                          className="flex cursor-pointer items-center gap-2"
                        >
                          <Building2 className="h-4 w-4 flex-shrink-0 text-fg-subtle" />
                          <span className="whitespace-nowrap">Copy to another engagement…</span>
                        </DropdownMenuItem>
                      )}
                      {(canManage && (onMakePrivate || onMakePublic)) && <DropdownMenuSeparator />}
                      {canManage && !document.isPrivate && onMakePrivate && (
                        isApprovedDeliverable ? (
                          <div className="flex items-center gap-2 px-2 py-1.5 text-ui text-fg-subtle opacity-40 cursor-not-allowed select-none">
                            <FolderLock className="h-4 w-4" /><span>Make Private</span>
                          </div>
                        ) : document.isSharedWithExternal ? (
                          <TooltipProvider>
                            <Tooltip open={privateInfoOpen} onOpenChange={setPrivateInfoOpen}>
                              <TooltipTrigger asChild>
                                <div
                                  onClick={(e) => { e.stopPropagation(); setPrivateInfoOpen((v) => !v) }}
                                  className="flex items-center gap-2 px-2 py-1.5 text-ui text-fg-subtle cursor-pointer opacity-50 rounded-control hover:bg-surface-hover"
                                >
                                  <FolderLock className="h-4 w-4 text-fg-subtle" />
                                  <span>Make Private</span>
                                  <Info className="h-3.5 w-3.5 ml-auto text-fg-subtle" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="text-xs max-w-[220px]">
                                A shared document cannot be made Private. Turn off sharing first.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => onMakePrivate(document)}
                            className="flex cursor-pointer items-center gap-2"
                          >
                            <FolderLock className="h-4 w-4 text-fg-subtle" />
                            <span>Make Private</span>
                          </DropdownMenuItem>
                        )
                      )}
                      {canManage && document.isPrivate && onMakePublic && (
                        isApprovedDeliverable ? (
                          <div className="flex items-center gap-2 px-2 py-1.5 text-ui text-fg-subtle opacity-40 cursor-not-allowed select-none">
                            <FolderUp className="h-4 w-4" /><span>Make Public</span>
                          </div>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => onMakePublic(document)}
                            className="flex cursor-pointer items-center gap-2"
                          >
                            <FolderUp className="h-4 w-4 text-fg-muted" />
                            <span>Make Public</span>
                          </DropdownMenuItem>
                        )
                      )}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}

                <DropdownMenuSeparator />

                <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                <DropdownMenuItem
                  onClick={async () => {
                    if (onBookmarkDocument) {
                      onBookmarkDocument(document)
                      return
                    }
                    try {
                      const projectDocumentId = (document as any)?.projectDocumentId || document.id
                      const { getSession } = await import('@/lib/supabase')
                      const session = await getSession()
                      if (!session?.access_token) {
                        addToast({ type: 'error', title: 'Unauthorized', message: 'Please sign in again.' })
                        return
                      }
                      if (!projectId) {
                        addToast({ type: 'error', title: 'Unavailable', message: 'No project context for this bookmark.' })
                        return
                      }
                      if (existingBookmarkId) {
                        // Remove
                        const res = await fetch('/api/bookmarks', {
                          method: 'DELETE',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                          body: JSON.stringify({ id: existingBookmarkId }),
                        })
                        if (!res.ok) throw new Error('Failed to remove bookmark')
                        setExistingBookmarkId(null)
                        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('pockett-bookmarks-updated'))
                        addToast({ type: 'success', title: 'Removed', message: 'Bookmark removed.' })
                      } else {
                        // Add
                        const res = await fetch('/api/bookmarks', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                          body: JSON.stringify({
                            bookmark: {
                              kind: 'document',
                              label: document.name ?? 'Document',
                              url: undefined,
                              projectId: projectId,
                              documentId: projectDocumentId,
                            },
                          }),
                        })
                        if (!res.ok) {
                          const err = await res.json().catch(() => ({}))
                          throw new Error(err.error ?? 'Failed to bookmark')
                        }
                        const data = await res.json()
                        setExistingBookmarkId(data.bookmark?.id ?? null)
                        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('pockett-bookmarks-updated'))
                        addToast({ type: 'success', title: 'Bookmarked', message: 'Saved to your bookmarks.' })
                      }
                    } catch (e) {
                      addToast({ type: 'error', title: 'Failed', message: e instanceof Error ? e.message : 'Failed to update bookmark.' })
                    }
                  }}
                  className="flex items-center gap-2 px-2 py-1.5 text-ui data-[disabled]:opacity-50 data-[disabled]:pointer-events-none"
                >
                  <Bookmark className={`h-4 w-4 ${existingBookmarkId ? 'fill-current text-action' : 'text-fg-muted'}`} />
                  <span>{existingBookmarkId ? 'Remove bookmark' : 'Bookmark'}</span>
                </DropdownMenuItem>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs">
                    {existingBookmarkId ? 'Remove bookmark' : 'Bookmark'}
                  </TooltipContent>
                </Tooltip>
                </TooltipProvider>
                {isApprovedDeliverable ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2 px-2 py-1.5 text-ui text-fg-subtle opacity-50 cursor-not-allowed select-none">
                          <Calendar className="h-4 w-4 text-fg-subtle" />
                          <span>Set Due Date</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs max-w-48">
                        Cannot set due date on an approved deliverable
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <DropdownMenuItem
                    onClick={() => setShowDueDatePicker(true)}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <Calendar className="h-4 w-4 text-fg-subtle" />
                    <span>Set Due Date</span>
                  </DropdownMenuItem>
                )}
                {!mime.includes('folder') && document.documentType !== 'LINK' && isExternalViewer && projectId && (() => {
                  const doc = document as { lock?: { type?: string } | null }
                  const isAlreadyLocked = doc.lock?.type === 'finalize'
                  if (isAlreadyLocked) return (
                    <DropdownMenuItem disabled className="flex items-center gap-2 px-2 py-1.5 text-ui text-fg-subtle opacity-50 cursor-not-allowed data-[disabled]:pointer-events-none">
                      <BadgeCheck className="h-4 w-4 shrink-0" />
                      <span className="whitespace-nowrap">Accepted</span>
                    </DropdownMenuItem>
                  )
                  return (
                    <DropdownMenuItem
                      disabled={finalizeLockDisabled}
                      onClick={() => void handleAcceptDocument()}
                      className="flex cursor-pointer items-center gap-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                    >
                      <BadgeCheck className="h-4 w-4 shrink-0 text-action" />
                      <span className="whitespace-nowrap">Accept</span>
                    </DropdownMenuItem>
                  )
                })()}

                {(onDeleteDocument || isApprovedDeliverable) && (
                  <>
                    <DropdownMenuSeparator />
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          {isApprovedDeliverable ? (
                            <div className="flex items-center gap-2 px-2 py-1.5 text-ui text-fg-subtle opacity-50 cursor-not-allowed select-none">
                              <Trash2 className="h-4 w-4" />
                              <span>{document.documentType === 'LINK' ? 'Delete' : 'Move to Bin'}</span>
                            </div>
                          ) : (
                            <DropdownMenuItem
                              onSelect={(e) => { e.preventDefault(); onDeleteDocument!(document); }}
                              className="flex cursor-pointer items-center gap-2 text-danger focus:text-danger"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span>{document.documentType === 'LINK' ? 'Delete' : 'Move to Bin'}</span>
                            </DropdownMenuItem>
                          )}
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[200px]">
                          {isApprovedDeliverable
                            ? <p>Approved deliverables cannot be deleted</p>
                            : document.documentType === 'LINK'
                              ? <p>This link will be permanently deleted.</p>
                              : <p>Items in Bin are permanently deleted after 30 days (Google Drive).</p>
                          }
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </>
                )}
                {!isExternalUser && document.documentType !== 'LINK' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="flex cursor-pointer items-center gap-2">
                      <ExternalLink className="h-4 w-4 text-fg-muted" />
                      <span>Drive Actions</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-56">
                      <DropdownMenuItem
                        onClick={() => {
                          const parentId = document.parents?.[0]
                          const authParam = connectorAccountEmail ? `?authuser=${encodeURIComponent(connectorAccountEmail)}` : ''
                          const url = parentId
                            ? `https://drive.google.com/drive/folders/${parentId}${authParam}`
                            : `https://drive.google.com/drive/my-drive${authParam}`
                          window.open(url, '_blank')
                        }}
                        className="flex cursor-pointer items-center gap-2"
                      >
                        <ExternalLink className="h-4 w-4 text-fg-subtle" />
                        <span>Open containing Folder in Google Drive</span>
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </>
                )}
              </>
            )}
          </div>
          {sandboxPreview && (
            <div className="px-3 py-2 border-t border-line bg-surface-subtle">
              <p className="text-caption text-fg-subtle leading-snug">Actions are unavailable in sandbox preview.</p>
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>



      {/* Promote as Deliverable — optional due date before confirming */}
      <ConfirmDialog
        open={showTagDeliverableModal}
        onOpenChange={setShowTagDeliverableModal}
        icon={<Package className="h-3.5 w-3.5" />}
        iconVariant="primary"
        title="Promote as Deliverable"
        subtitle={document.name}
        description="This will share the folder externally and add it to the Board."
        extra={
          <div>
            <label className="mb-2 block text-small font-medium text-fg-muted">
              Due date (optional)
            </label>
            <DateTimePicker
              value={tagDeliverableDueDate}
              onChange={setTagDeliverableDueDate}
              placeholder="Choose date and time"
              className="w-full"
            />
          </div>
        }
        confirmLabel="Promote"
        confirmVariant="primary"
        onCancel={() => setShowTagDeliverableModal(false)}
        onConfirm={() => {
          setShowTagDeliverableModal(false)
          onMarkAsDeliverable?.(document, tagDeliverableDueDate || undefined)
        }}
      />

      {/* Untag as Deliverable confirmation */}
      <ConfirmDialog
        open={showUntagConfirm}
        onOpenChange={setShowUntagConfirm}
        icon={<PackageMinus className="h-3.5 w-3.5" />}
        iconVariant="red"
        title="Untag as Deliverable"
        subtitle="This action will revoke all external access."
        description={<>This will remove the deliverable tag from <span className="font-semibold text-fg">{document.name}</span> and revoke all sharing access for external collaborators and viewers.</>}
        confirmLabel="Untag"
        confirmVariant="red"
        onCancel={() => setShowUntagConfirm(false)}
        onConfirm={() => {
          setShowUntagConfirm(false)
          onUntagAsDeliverable?.(document)
        }}
      />

      {/* Setup Reminder modal */}
      <SetupReminderModal
        open={showReminderModal}
        onClose={() => { setShowReminderModal(false); setExistingDocReminders(new Map()); setCurrentUserRole(null) }}
        entityName={document.name}
        entityMimeType={document.mimeType}
        currentUser={user ? { userId: user.id, name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null, email: user.email ?? null, avatarUrl: user.user_metadata?.avatar_url ?? null, role: currentUserRole } : undefined}
        members={reminderMembers}
        existingReminders={existingDocReminders}
        multiSelect={false}
        hint="A reminder with a link to this document will appear in the assignee's reminders on the selected date."
        onSubmit={async ({ selected, deselected, dateValue }) => {
          if (!projectId) return
          const { getSession } = await import('@/lib/supabase')
          const session = await getSession()
          if (!session?.access_token) {
            addToast({ type: 'error', title: 'Session expired', message: 'Please refresh and try again.' })
            throw new Error('No session')
          }
          const docId = (document as any).projectDocumentId || document.id
          const authHeader = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }
          const ops: Promise<void>[] = [
            ...deselected.map((userId) => {
              const existing = existingDocReminders.get(userId)
              return fetch(`/api/projects/${projectId}/documents/${encodeURIComponent(docId)}/reminder`, {
                method: 'DELETE', headers: authHeader,
                body: JSON.stringify({ reminderId: existing?.reminderId, recipientId: userId }),
              }).then(async (res) => { if (!res.ok) throw new Error('Failed to remove') })
            }),
            ...selected.map((recipientId) =>
              fetch(`/api/projects/${projectId}/documents/${encodeURIComponent(docId)}/reminder`, {
                method: 'POST', headers: authHeader,
                body: JSON.stringify({ recipientId, dateValue }),
              }).then(async (res) => {
                if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? 'Failed') }
              })
            ),
          ]
          const results = await Promise.allSettled(ops)
          const failed = results.filter((r) => r.status === 'rejected')
          if (failed.length > 0) {
            addToast({ type: 'error', title: 'Partial failure', message: `${failed.length} operation(s) failed.` })
            throw new Error('partial failure')
          }
          setExistingDocReminders(new Map())
        }}
      />

      {/* Still using Portal for Date Picker as it is a complex modal. Could use Dialog too but sticking to scope. */}
      {showDueDatePicker && mounted && typeof window !== 'undefined' && window.document?.body && createPortal(
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[999999]"
          onClick={() => setShowDueDatePicker(false)}
        >
          <div
            className="modal-content z-[1000000] mx-4 w-full max-w-md rounded-dialog bg-surface shadow-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-line">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-control bg-tag-orange-bg text-tag-orange-fg">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-fg">
                      Set Due Date
                    </h3>
                    <p className="text-xs text-fg-muted">
                      {document.name}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDueDatePicker(false)}
                  className="text-fg-subtle hover:text-fg-muted p-1 rounded hover:bg-surface-hover transition-colors"
                >
                  <XSquare className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-4">
              <div className="mb-2">
                <label className="block text-sm font-medium text-fg-muted mb-2">
                  Select due date and time
                </label>
                <DateTimePicker
                  value={selectedDueDate}
                  onChange={handleDueDateChange}
                  placeholder="Choose date and time"
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </div>,
        window.document.body
      )}
    </>
  )
}