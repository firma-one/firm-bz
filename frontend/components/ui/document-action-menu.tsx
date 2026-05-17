"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import { DocumentIcon } from "@/components/ui/document-icon"
import { UserAvatarWithTooltip } from "@/components/ui/user-avatar-with-tooltip"
import { formatFileSize, formatSmartDateTime } from "@/lib/utils"
import { DocumentEditPanelContent, DocumentPreviewPanelContent, getDocumentEditUrl } from "@/components/files/document-edit-sheet"
import { useRightPane } from "@/lib/right-pane-context"
import { DocumentActivityPane } from "@/components/files/document-activity-pane"
import { DocumentHistoryPane } from "@/components/files/document-history-pane"
import { DocumentShareModal } from "@/components/files/document-share-modal"
import { DocumentDocCommentsPane } from "@/components/projects/document-doc-comments-pane"
import {
  FileText,
  FolderOpen,
  MoreHorizontal,
  Download,
  ExternalLink,
  Share2,
  Bookmark,
  Edit3,
  Copy,
  Move,
  Clock,
  Trash2,
  Calendar,
  Check,
  BadgeCheck,
  Info,
  Eye,
  X,
  FolderLock,
  FolderUp,
  MessageSquare,
  MessageCircle,
  Link2,
  Lock,
  Unlock,
  ChevronRight,
  Folder,
  CheckCircle2,
  XCircle,
  Building2,
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
import { useDownloadProgress } from "@/lib/download-progress-context"

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
  /** Required when showShareModal is true; project UUID for saving share settings. */
  projectId?: string
  /** Called after share settings are saved (e.g. to refresh shared badges). */
  onShareSaved?: () => void
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
  projectId,
  onShareSaved,
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
}: DocumentActionMenuProps) {
  const [showDueDatePicker, setShowDueDatePicker] = useState(false)
  const [showShareModalOpen, setShowShareModalOpen] = useState(false)
  /** Drive id or project document UUID — disables Finalize row while request in flight */
  const [finalizeLockActiveId, setFinalizeLockActiveId] = useState<string | null>(null)
  const [selectedDueDate, setSelectedDueDate] = useState<string>("")
  const [hasCopiedName, setHasCopiedName] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [privateInfoOpen, setPrivateInfoOpen] = useState(false)
  const { addToast } = useToast()
  const rightPane = useRightPane()
  const { addTask, updateTask } = useDownloadProgress()

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

  // Handle due date selection
  const handleDueDateChange = async (dateTime: string) => {
    if (!dateTime) return

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

      const res = await fetch(`/api/projects/${projectId}/documents/${encodeURIComponent(document.id)}/due-date`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ dueDate: dateTime }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Failed to update due date')
      }

      document.dueDate = dateTime
      setSelectedDueDate(dateTime)
      setShowDueDatePicker(false)

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pockett-notifications-updated'))
      }
      addToast({ type: 'success', title: 'Saved', message: 'Due date updated.' })
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

      if (doc.projectId && doc.id) {
        // Shared document: server resolves connector + PDF/original.
        // May involve PDF generation — show progress indicator while waiting.
        const downloadUrl = `/api/projects/${doc.projectId}/documents/${encodeURIComponent(doc.id)}/download-share`
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
      <DropdownMenu onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-600 hover:text-gray-800 hover:bg-gray-50 h-8 w-8 p-0"
            title="More actions"
          >
            {triggerIcon ?? <MoreHorizontal className="h-4 w-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-80 p-0"
          onClick={(e) => e.stopPropagation()}
          onCloseAutoFocus={(e) => e.preventDefault()} // Prevent focus jump causing scroll
        >
          {/* Header Section */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
                <DocumentIcon mimeType={document.mimeType} className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0 pr-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <h3 className="text-sm font-medium text-gray-900 truncate select-text cursor-default max-w-[180px]">
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
                    className="text-gray-400 hover:text-gray-600 p-0.5 rounded transition-colors flex-shrink-0"
                    title="Copy name"
                  >
                    {hasCopiedName ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  {getDisplayType(document)}
                  {!document.mimeType?.includes('folder') && document.size != null && typeof document.size === 'number' && (
                    <> • {formatFileSize(document.size)}</>
                  )}
                </p>
                <div className="mt-1.5 space-y-0.5 border-t border-gray-50 pt-1.5">
                  {document.createdTime && !Number.isNaN(new Date(document.createdTime).getTime()) && (
                    <p className="text-[10px] text-gray-400">
                      <span className="font-medium text-gray-500">Created:</span> {document.owners?.[0]?.displayName || 'Unknown'} | {formatSmartDateTime(document.createdTime)}
                    </p>
                  )}
                  {(document.modifiedTime || document.createdTime) && (
                    <p className="text-[10px] text-gray-400">
                      <span className="font-medium text-gray-500">Modified:</span> {document.lastModifyingUser?.displayName || 'Unknown'} | {document.modifiedTime && !Number.isNaN(new Date(document.modifiedTime).getTime()) ? formatSmartDateTime(document.modifiedTime) : document.createdTime && !Number.isNaN(new Date(document.createdTime).getTime()) ? formatSmartDateTime(document.createdTime) : '—'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="p-2">
            {/* Intake pending actions — shown at the top when applicable */}
            {(onApproveIntake || onRejectIntake || onWithdrawIntake) && (
              <>
                {onApproveIntake && (
                  <DropdownMenuItem
                    onSelect={() => onApproveIntake(document)}
                    className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs text-emerald-700 focus:text-emerald-700 focus:bg-emerald-50"
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>Approve</span>
                  </DropdownMenuItem>
                )}
                {onRejectIntake && (
                  <DropdownMenuItem
                    onSelect={() => onRejectIntake(document)}
                    className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs text-red-600 focus:text-red-600 focus:bg-red-50"
                  >
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span>Reject</span>
                  </DropdownMenuItem>
                )}
                {onWithdrawIntake && (
                  <DropdownMenuItem
                    onSelect={() => onWithdrawIntake(document)}
                    className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
                  >
                    <X className="h-4 w-4 text-slate-500" />
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
                    className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs text-emerald-700 focus:text-emerald-700 focus:bg-emerald-50"
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>Approve folder upload</span>
                  </DropdownMenuItem>
                )}
                {onRejectFolder && (
                  <DropdownMenuItem
                    onSelect={() => onRejectFolder(document)}
                    className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs text-red-600 focus:text-red-600 focus:bg-red-50"
                  >
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span>Reject folder</span>
                  </DropdownMenuItem>
                )}
                {onWithdrawFolder && (
                  <DropdownMenuItem
                    onSelect={() => onWithdrawFolder(document)}
                    className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs text-orange-700 focus:text-orange-700 focus:bg-orange-50"
                  >
                    <FolderUp className="h-4 w-4 text-orange-600" />
                    <span>Withdraw folder</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
              </>
            )}
            {document.mimeType?.includes('folder') ? (
              <>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs">
                    <Share2 className="h-4 w-4 text-purple-600" />
                    <span>Share</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-56">
                    {showShareModal && projectId && (
                      <DropdownMenuItem
                        onClick={() => setShowShareModalOpen(true)}
                        className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
                      >
                        <Share2 className="h-4 w-4 text-purple-600" />
                        <span>Share</span>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={async () => {
                        const docId = (document as any).projectDocumentId
                        if (!deeplinkBase || !docId) {
                          addToast({ type: 'error', title: 'Link unavailable', message: 'This item has not been indexed yet.' })
                          return
                        }
                        await navigator.clipboard.writeText(`${deeplinkBase}#doc-file:${docId}`)
                        addToast({ type: 'success', title: 'Link copied', message: 'Link copied to clipboard' })
                      }}
                      className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
                    >
                      <Link2 className="h-4 w-4 text-gray-600" />
                      <span>Copy link</span>
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                {(onCopyDocument || onMoveDocument || onRenameDocument || onDuplicateDocument || canManage) && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs">
                      <FolderOpen className="h-4 w-4 text-gray-600" />
                      <span>Organise</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-56">
                      {onRenameDocument && (
                        <DropdownMenuItem onSelect={() => onRenameDocument(document)} className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs">
                          <Edit3 className="h-4 w-4 text-gray-600" />
                          <span>Rename</span>
                        </DropdownMenuItem>
                      )}
                      {onDuplicateDocument && (
                        <DropdownMenuItem onSelect={() => onDuplicateDocument(document)} className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs">
                          <Copy className="h-4 w-4 text-gray-600" />
                          <span>Duplicate</span>
                        </DropdownMenuItem>
                      )}
                      {onCopyDocument && (
                        <DropdownMenuItem onSelect={() => onCopyDocument(document)} className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs">
                          <Copy className="h-4 w-4 text-gray-600" />
                          <span>Copy</span>
                        </DropdownMenuItem>
                      )}
                      {onMoveDocument && (
                        <DropdownMenuItem onSelect={() => onMoveDocument(document)} className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs">
                          <Move className="h-4 w-4 text-gray-600" />
                          <span>Move</span>
                        </DropdownMenuItem>
                      )}
                      {(canManage && (onMakePrivate || onMakePublic)) && <DropdownMenuSeparator />}
                      {canManage && !document.isPrivate && onMakePrivate && (
                        document.isSharedWithExternal ? (
                          <TooltipProvider>
                            <Tooltip open={privateInfoOpen} onOpenChange={setPrivateInfoOpen}>
                              <TooltipTrigger asChild>
                                <div
                                  onClick={(e) => { e.stopPropagation(); setPrivateInfoOpen((v) => !v) }}
                                  className="flex items-center space-x-3 px-3 py-2 text-xs text-muted-foreground cursor-pointer opacity-50 hover:bg-accent rounded-sm"
                                >
                                  <FolderLock className="h-4 w-4 text-orange-500" />
                                  <span>Make Private</span>
                                  <Info className="h-3.5 w-3.5 ml-auto text-slate-400" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="text-xs max-w-[220px]">
                                A shared document cannot be made Private. Turn off sharing first.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <DropdownMenuItem onClick={() => onMakePrivate(document)} className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs">
                            <FolderLock className="h-4 w-4 text-orange-500" />
                            <span>Make Private</span>
                          </DropdownMenuItem>
                        )
                      )}
                      {canManage && document.isPrivate && onMakePublic && (
                        <DropdownMenuItem onClick={() => onMakePublic(document)} className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs">
                          <FolderUp className="h-4 w-4 text-slate-500" />
                          <span>Make Public</span>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                {(!isExternalUser || onDeleteDocument) && <DropdownMenuSeparator />}
                {onDeleteDocument && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuItem
                          onSelect={(e) => { e.preventDefault(); onDeleteDocument(document); }}
                          className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span>Move to Bin</span>
                        </DropdownMenuItem>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-[200px]">
                        <p>Items in Bin are permanently deleted after 30 days (Google Drive).</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {!isExternalUser && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs">
                      <ExternalLink className="h-4 w-4 text-gray-600" />
                      <span>Drive Actions</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-56">
                      <DropdownMenuItem
                        onClick={() => {
                          const googleDriveUrl = `https://drive.google.com/drive/folders/${document.id}`
                          if (typeof window !== 'undefined') window.open(googleDriveUrl, '_blank')
                        }}
                        className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
                      >
                        <ExternalLink className="h-4 w-4 text-blue-600" />
                        <span>Open in Google Drive</span>
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </>
                )}
              </>
            ) : (
              <>
                <DropdownMenuItem
                  onClick={() => {
                    if (onOpenDocument) {
                      onOpenDocument(document)
                    } else if (rightPane.hasRightPane) {
                      rightPane.setTitle(document.name || 'Preview')
                      rightPane.setContent(<DocumentPreviewPanelContent document={document} />)
                    }
                  }}
                  className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
                >
                  <Eye className="h-4 w-4 text-gray-600" />
                  <span>Open</span>
                </DropdownMenuItem>

                {!(document.isGuest && !document.allowDownload) &&
                 !(document.isExternalCollaborator && !document.ecAllowDownload) && (
                  <DropdownMenuItem
                    onClick={() => { handleDownload(document); onDownloadDocument?.(document) }}
                    className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
                  >
                    <Download className="h-4 w-4 text-blue-600" />
                    <span>Download</span>
                  </DropdownMenuItem>
                )}

                {/* Share (submenu: Share + Copy link) */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs">
                    <Share2 className="h-4 w-4 text-purple-600" />
                    <span>Share</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-56">
                    {showShareModal && projectId && (
                      <DropdownMenuItem
                        onClick={() => setShowShareModalOpen(true)}
                        className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
                      >
                        <Share2 className="h-4 w-4 text-purple-600" />
                        <span>Share</span>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={async () => {
                        const docId = (document as any).projectDocumentId
                        if (!deeplinkBase || !docId) {
                          addToast({ type: 'error', title: 'Link unavailable', message: 'This item has not been indexed yet.' })
                          return
                        }
                        await navigator.clipboard.writeText(`${deeplinkBase}#doc-file:${docId}`)
                        addToast({ type: 'success', title: 'Link copied', message: 'Link copied to clipboard' })
                      }}
                      className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
                    >
                      <Link2 className="h-4 w-4 text-gray-600" />
                      <span>Copy link</span>
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                {/* Comments (doc only, project context) */}
                {projectId && (
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
                          />
                        )
                        rightPane.setExpanded?.(false)
                      }
                    }}
                    className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
                  >
                    <MessageCircle className="h-4 w-4 text-gray-600" />
                    <span>Comment</span>
                  </DropdownMenuItem>
                )}

                {/* Organize (Copy + Move + persona options) */}
                {(onCopyDocument || onMoveDocument || onRenameDocument || onDuplicateDocument || canManage) && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs">
                      <FolderOpen className="h-4 w-4 text-gray-600" />
                      <span>Organise</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-56">
                      {onRenameDocument && (
                        <DropdownMenuItem
                          onSelect={() => onRenameDocument(document)}
                          className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
                        >
                          <Edit3 className="h-4 w-4 text-gray-600" />
                          <span>Rename</span>
                        </DropdownMenuItem>
                      )}
                      {onDuplicateDocument && (
                        <DropdownMenuItem
                          onSelect={() => onDuplicateDocument(document)}
                          className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
                        >
                          <Copy className="h-4 w-4 text-gray-600" />
                          <span>Duplicate</span>
                        </DropdownMenuItem>
                      )}
                      {onCopyDocument && (
                        <DropdownMenuItem
                          onSelect={() => onCopyDocument(document)}
                          className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
                        >
                          <Copy className="h-4 w-4 text-gray-600" />
                          <span>Copy</span>
                        </DropdownMenuItem>
                      )}
                      {onMoveDocument && (
                        <DropdownMenuItem
                          onSelect={() => onMoveDocument(document)}
                          className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
                        >
                          <Move className="h-4 w-4 text-gray-600" />
                          <span>Move</span>
                        </DropdownMenuItem>
                      )}
                      {onCrossEngagementCopy && <DropdownMenuSeparator />}
                      {onCrossEngagementCopy && (
                        <DropdownMenuItem
                          onSelect={() => onCrossEngagementCopy(document)}
                          className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
                        >
                          <Building2 className="h-4 w-4 flex-shrink-0 text-blue-600" />
                          <span className="whitespace-nowrap">Copy to another engagement…</span>
                        </DropdownMenuItem>
                      )}
                      {(canManage && (onMakePrivate || onMakePublic)) && <DropdownMenuSeparator />}
                      {canManage && !document.isPrivate && onMakePrivate && (
                        document.isSharedWithExternal ? (
                          <TooltipProvider>
                            <Tooltip open={privateInfoOpen} onOpenChange={setPrivateInfoOpen}>
                              <TooltipTrigger asChild>
                                <div
                                  onClick={(e) => { e.stopPropagation(); setPrivateInfoOpen((v) => !v) }}
                                  className="flex items-center space-x-3 px-3 py-2 text-xs text-muted-foreground cursor-pointer opacity-50 hover:bg-accent rounded-sm"
                                >
                                  <FolderLock className="h-4 w-4 text-orange-500" />
                                  <span>Make Private</span>
                                  <Info className="h-3.5 w-3.5 ml-auto text-slate-400" />
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
                            className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
                          >
                            <FolderLock className="h-4 w-4 text-orange-500" />
                            <span>Make Private</span>
                          </DropdownMenuItem>
                        )
                      )}
                      {canManage && document.isPrivate && onMakePublic && (
                        <DropdownMenuItem
                          onClick={() => onMakePublic(document)}
                          className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
                        >
                          <FolderUp className="h-4 w-4 text-slate-500" />
                          <span>Make Public</span>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs">
                    <Info className="h-4 w-4 text-gray-600" />
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
                              <div className="flex items-center gap-1 text-[11px] text-slate-400 mb-2">
                                <Folder className="h-3 w-3" />
                                <span>{document.parentName}</span>
                                <ChevronRight className="h-3 w-3" />
                                <span className="text-slate-600 font-medium truncate max-w-[180px]">{document.name}</span>
                              </div>
                            )}
                            <div className="inline-flex max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 mb-4">
                              <span className="truncate text-xs font-medium text-slate-700" title={document.name}>{document.name}</span>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 space-y-3">
                              <div className="flex justify-between items-center">
                                <span className="text-xs text-slate-500">File type</span>
                                <span className="text-xs">{getDisplayType(document)}</span>
                              </div>
                              {(document.mimeType ?? '').trim() !== '' && (
                                <div className="flex justify-between items-center">
                                  <span className="text-xs text-slate-500">Mime type</span>
                                  <span className="font-mono text-[10px] truncate max-w-[240px] text-right" title={document.mimeType ?? ''}>{document.mimeType}</span>
                                </div>
                              )}
                              {document.size != null && typeof document.size === 'number' && (
                                <div className="flex justify-between items-center">
                                  <span className="text-xs text-slate-500">Size</span>
                                  <span className="text-xs">{formatFileSize(document.size)}</span>
                                </div>
                              )}
                              {document.modifiedTime && !Number.isNaN(new Date(document.modifiedTime).getTime()) && (
                                <div className="flex justify-between items-center">
                                  <span className="text-xs text-slate-500">Modified</span>
                                  <span className="text-xs">{formatSmartDateTime(document.modifiedTime)}</span>
                                </div>
                              )}
                              {document.createdTime && !Number.isNaN(new Date(document.createdTime).getTime()) && (
                                <div className="flex justify-between items-center">
                                  <span className="text-xs text-slate-500">Created</span>
                                  <span className="text-xs">{formatSmartDateTime(document.createdTime)}</span>
                                </div>
                              )}
                              {(document.owners?.[0]?.displayName || document.lastModifyingUser?.displayName) && (
                                <div className="flex justify-between items-center">
                                  <span className="text-xs text-slate-500">Owner</span>
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
                      className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
                    >
                      <Info className="h-4 w-4 text-gray-600" />
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
                      className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
                    >
                      <Clock className="h-4 w-4 text-gray-600" />
                      <span>Activity Stream</span>
                    </DropdownMenuItem>
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
                      className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
                    >
                      <Clock className="h-4 w-4 text-gray-600" />
                      <span>Version History</span>
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={async () => {
                    if (onBookmarkDocument) {
                      onBookmarkDocument(document)
                      return
                    }
                    try {
                      // Prefer in-app deep link targeting (resolved at click-time from projectId + projectDocumentId).
                      // Fallback url is optional (e.g. external link bookmarks).
                      const projectDocumentId = (document as any)?.projectDocumentId as string | undefined
                      const { getSession } = await import('@/lib/supabase')
                      const session = await getSession()
                      if (!session?.access_token) {
                        addToast({ type: 'error', title: 'Unauthorized', message: 'Please sign in again.' })
                        return
                      }
                      if (!projectId || !projectDocumentId) {
                        addToast({ type: 'error', title: 'Unavailable', message: 'This file is not indexed yet, so it cannot be bookmarked.' })
                        return
                      }
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
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('pockett-bookmarks-updated'))
                      }
                      addToast({ type: 'success', title: 'Bookmarked', message: 'Saved to your bookmarks.' })
                    } catch (e) {
                      addToast({ type: 'error', title: 'Failed', message: e instanceof Error ? e.message : 'Failed to bookmark.' })
                    }
                  }}
                  className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
                >
                  <Bookmark className="h-4 w-4 text-gray-600" />
                  <span>Bookmark</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setShowDueDatePicker(true)}
                  className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
                >
                  <Calendar className="h-4 w-4 text-orange-600" />
                  <span>Set Due Date</span>
                </DropdownMenuItem>
                {!mime.includes('folder') && leadForVersionLock && projectId && (
                  <>
                    {(document as { lock?: { type?: string } | null }).lock?.type === 'finalize' ? (
                      <DropdownMenuItem
                        disabled={finalizeLockDisabled}
                        onClick={() => void handleUnlockVersion()}
                        className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                      >
                        <Unlock className="h-4 w-4 text-emerald-700 shrink-0" />
                        <span>Return to Draft</span>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild onClick={(ev) => ev.stopPropagation()}>
                              <span className="inline-flex text-gray-400 hover:text-gray-600 shrink-0">
                                <Info className="h-3.5 w-3.5" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="bg-slate-50 text-slate-800 border-slate-200 max-w-[260px]">
                              {VERSION_LOCK_TOOLTIP}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        disabled={finalizeLockDisabled}
                        onClick={() => void handleFinalizeAndLock()}
                        className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs text-amber-800 focus:bg-amber-50 focus:text-amber-900 data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                      >
                        <Lock className="h-4 w-4 text-amber-700 shrink-0" />
                        <span className="whitespace-nowrap">Finalize</span>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild onClick={(ev) => ev.stopPropagation()}>
                              <span className="inline-flex text-gray-400 hover:text-gray-600 shrink-0">
                                <Info className="h-3.5 w-3.5" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="bg-slate-50 text-slate-800 border-slate-200 max-w-[260px]">
                              {VERSION_LOCK_TOOLTIP}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </DropdownMenuItem>
                    )}
                  </>
                )}
                {!mime.includes('folder') && isExternalViewer && projectId && (() => {
                  const doc = document as { lock?: { type?: string } | null }
                  const isAlreadyLocked = doc.lock?.type === 'finalize'
                  if (isAlreadyLocked) return (
                    <DropdownMenuItem disabled className="flex items-center space-x-3 px-3 py-2 text-xs text-muted-foreground opacity-50 cursor-not-allowed data-[disabled]:pointer-events-none">
                      <BadgeCheck className="h-4 w-4 shrink-0" />
                      <span className="whitespace-nowrap">Accepted</span>
                    </DropdownMenuItem>
                  )
                  return (
                    <DropdownMenuItem
                      disabled={finalizeLockDisabled}
                      onClick={() => void handleAcceptDocument()}
                      className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs text-emerald-800 focus:bg-emerald-50 focus:text-emerald-900 data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                    >
                      <BadgeCheck className="h-4 w-4 text-emerald-700 shrink-0" />
                      <span className="whitespace-nowrap">Accept</span>
                    </DropdownMenuItem>
                  )
                })()}

                {(!isExternalUser || onDeleteDocument) && <DropdownMenuSeparator />}

                {onDeleteDocument && (

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuItem
                          onSelect={(e) => { e.preventDefault(); onDeleteDocument(document); }}
                          className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span>Move to Bin</span>
                        </DropdownMenuItem>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-[200px]">
                        <p>Items in Bin are permanently deleted after 30 days (Google Drive).</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {!isExternalUser && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs">
                      <ExternalLink className="h-4 w-4 text-gray-600" />
                      <span>Drive Actions</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-56">
                      <DropdownMenuItem
                        onClick={() => {
                          const parentId = document.parents?.[0]
                          const url = parentId
                            ? `https://drive.google.com/drive/folders/${parentId}`
                            : `https://drive.google.com/drive/my-drive`
                          window.open(url, '_blank')
                        }}
                        className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
                      >
                        <ExternalLink className="h-4 w-4 text-blue-600" />
                        <span>Open containing Folder in Google Drive</span>
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </>
                )}
              </>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>


      {showShareModal && projectId && (
        <DocumentShareModal
          open={showShareModalOpen}
          onOpenChange={setShowShareModalOpen}
          document={{
            id: document.id,
            name: document.name ?? document.title ?? 'Document',
            mimeType: document.mimeType,
          }}
          projectId={projectId}
          onSaved={onShareSaved}
        />
      )}

      {/* Still using Portal for Date Picker as it is a complex modal. Could use Dialog too but sticking to scope. */}
      {showDueDatePicker && mounted && typeof window !== 'undefined' && window.document?.body && createPortal(
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[999999]"
          onClick={() => setShowDueDatePicker(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 modal-content z-[1000000]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                    <Calendar className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-900">
                      Set Due Date
                    </h3>
                    <p className="text-xs text-gray-500">
                      {document.name}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDueDatePicker(false)}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-4">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select due date and time
                </label>
                <DateTimePicker
                  value={selectedDueDate}
                  onChange={handleDueDateChange}
                  placeholder="Choose date and time"
                  className="w-full"
                />
              </div>

              <div className="flex items-center justify-end space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDueDatePicker(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>,
        window.document.body
      )}
    </>
  )
}