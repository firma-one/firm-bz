"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import { DocumentIcon } from "@/components/ui/document-icon"
import { formatFileSize, formatSmartDateTime } from "@/lib/utils"
import { DocumentEditPanelContent, DocumentPreviewPanelContent, getDocumentEditUrl } from "@/components/files/document-edit-sheet"
import { useRightPane } from "@/lib/right-pane-context"
import { VersionHistorySheet } from "@/components/files/version-history-sheet"
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

const VERSION_LOCK_TOOLTIP =
  'Lock finalizes the current version in Google Drive (collaborators become view-only on this file). Unlock restores edit access for Engagement Lead actions.'

interface DocumentActionMenuProps {
  document: any
  onOpenDocument?: (doc: any) => void
  onDownloadDocument?: (doc: any) => void
  onShareDocument?: (doc: any) => void
  onBookmarkDocument?: (doc: any) => void
  onRenameDocument?: (doc: any) => void
  onDuplicateDocument?: (doc: any) => void
  onCopyDocument?: (doc: any) => void
  onMoveDocument?: (doc: any) => void
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
  /** Move document tree to Confidential (only when currentFolderType === 'general'). */
  onRestrictToConfidential?: (doc: any) => void
  /** Move document tree to General (only when currentFolderType === 'confidential'). */
  onRestoreToGeneral?: (doc: any) => void
  /** Move document tree to General (only when currentFolderType === 'staging'). */
  onPromoteToGeneral?: (doc: any) => void
  /** Called when the action menu opens or closes (e.g. to highlight the row/card). */
  onOpenChange?: (open: boolean) => void
  /** Optional custom icon for the trigger (e.g. MoreVertical for compact layouts). */
  triggerIcon?: React.ReactNode
  /** Optional: notify parent when comment pane is opened (e.g. to highlight row). */
  onOpenCommentPane?: (documentId: string) => void
  /** Engagement Lead only: Lock / Unlock version (files). Prefer explicit over showShareModal. */
  isEngagementLead?: boolean
}

export function DocumentActionMenu({
  document,
  onOpenDocument,
  onDownloadDocument,
  onShareDocument,
  onBookmarkDocument,
  onRenameDocument,
  onDuplicateDocument,
  onCopyDocument,
  onMoveDocument,
  onVersionHistory,
  onDeleteDocument,
  showShareModal = false,
  projectId,
  onShareSaved,
  canManage = false,
  currentFolderType,
  onRestrictToConfidential,
  onRestoreToGeneral,
  onPromoteToGeneral,
  onOpenChange,
  triggerIcon,
  onOpenCommentPane,
  isEngagementLead,
}: DocumentActionMenuProps) {
  const [showDueDatePicker, setShowDueDatePicker] = useState(false)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [showShareModalOpen, setShowShareModalOpen] = useState(false)
  /** Drive id or project document UUID — disables Finalize row while request in flight */
  const [finalizeLockActiveId, setFinalizeLockActiveId] = useState<string | null>(null)
  const [showFileInfo, setShowFileInfo] = useState(false)
  const [selectedDueDate, setSelectedDueDate] = useState<string>("")
  const [hasCopiedName, setHasCopiedName] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { addToast } = useToast()
  const rightPane = useRightPane()

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

      const downloadUrl = `/api/documents/download?fileId=${doc.id}&connectorId=${doc.connectorId}&filename=${encodeURIComponent(doc.name)}&token=${session.access_token}`

      const a = window.document.createElement('a')
      a.href = downloadUrl
      a.download = doc.name
      window.document.body.appendChild(a)
      a.click()
      window.document.body.removeChild(a)
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
                    {!showShareModal && (
                      <DropdownMenuItem
                        onClick={async () => {
                          const link = document.webViewLink || `https://drive.google.com/drive/folders/${document.id}`
                          await navigator.clipboard.writeText(link)
                          addToast({ type: 'success', title: 'Link copied', message: 'Folder link copied to clipboard' })
                          onShareDocument?.(document)
                        }}
                        className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
                      >
                        <Share2 className="h-4 w-4 text-purple-600" />
                        <span>Share</span>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={async () => {
                        const link = document.webViewLink || `https://drive.google.com/drive/folders/${document.id}`
                        await navigator.clipboard.writeText(link)
                        addToast({ type: 'success', title: 'Link copied', message: 'Folder link copied to clipboard' })
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
                      {(canManage && (onRestrictToConfidential || onRestoreToGeneral || onPromoteToGeneral)) && <DropdownMenuSeparator />}
                      {canManage && currentFolderType === 'general' && onRestrictToConfidential && (
                        <DropdownMenuItem onClick={() => onRestrictToConfidential(document)} className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs">
                          <FolderLock className="h-4 w-4 text-[#B91C1C]" />
                          <span className="whitespace-nowrap">Move to <strong>Confidential</strong></span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <span className="inline-flex text-gray-400 hover:text-gray-600 shrink-0">
                                  <Info className="h-3.5 w-3.5" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="bg-slate-50 text-slate-800 border-slate-200 max-w-[220px]">
                                Confidential is only accessible to Project Leads, Client Partners & Org Owners.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </DropdownMenuItem>
                      )}
                      {canManage && currentFolderType === 'confidential' && onRestoreToGeneral && (
                        <DropdownMenuItem onClick={() => onRestoreToGeneral(document)} className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs">
                          <FolderUp className="h-4 w-4 text-green-600" />
                          <span className="whitespace-nowrap">Release to <strong>General</strong></span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <span className="inline-flex text-gray-400 hover:text-gray-600 shrink-0">
                                  <Info className="h-3.5 w-3.5" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="bg-slate-50 text-slate-800 border-slate-200 max-w-[220px]">
                                General is visible to all project members.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </DropdownMenuItem>
                      )}
                      {canManage && currentFolderType === 'staging' && onPromoteToGeneral && (
                        <DropdownMenuItem onClick={() => onPromoteToGeneral(document)} className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs">
                          <FolderUp className="h-4 w-4 text-amber-600" />
                          <span className="whitespace-nowrap">Promote to <strong>General</strong></span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <span className="inline-flex text-gray-400 hover:text-gray-600 shrink-0">
                                  <Info className="h-3.5 w-3.5" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="bg-slate-50 text-slate-800 border-slate-200 max-w-[220px]">
                                Promote from Staging to General to make the file visible to all project members.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                <DropdownMenuSeparator />
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

                <DropdownMenuItem
                  onClick={() => { handleDownload(document); onDownloadDocument?.(document) }}
                  className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
                >
                  <Download className="h-4 w-4 text-blue-600" />
                  <span>Download</span>
                </DropdownMenuItem>

                {!mime.includes('folder') && leadForVersionLock && projectId && (
                  <>
                    {(document as { versionLocked?: boolean }).versionLocked ? (
                      <DropdownMenuItem
                        disabled={finalizeLockDisabled}
                        onClick={() => void handleUnlockVersion()}
                        className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                      >
                        <Unlock className="h-4 w-4 text-emerald-700 shrink-0" />
                        <span>Unlock version</span>
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
                        <span className="whitespace-nowrap">Lock version</span>
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
                    {!showShareModal && (
                      <DropdownMenuItem
                        onClick={async () => {
                          if (document.webViewLink) {
                            navigator.clipboard.writeText(document.webViewLink)
                            addToast({ type: 'success', title: 'Link Copied', message: 'Document link copied to clipboard' })
                          } else {
                            addToast({ type: 'error', title: 'Share Unavailable', message: 'No link available' })
                          }
                          onShareDocument?.(document)
                        }}
                        className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
                      >
                        <Share2 className="h-4 w-4 text-purple-600" />
                        <span>Share</span>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={async () => {
                        const link = document.webViewLink || getDocumentEditUrl(document)
                        await navigator.clipboard.writeText(link)
                        addToast({ type: 'success', title: 'Link copied', message: 'Document link copied to clipboard' })
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
                        rightPane.setHeaderIcon(<MessageCircle className="h-4 w-4" />)
                        rightPane.setHeaderSubtitle('Append-only. Visible to all project members.')
                        rightPane.setContent(
                          <DocumentDocCommentsPane
                            projectId={projectId}
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
                      {(canManage && (onRestrictToConfidential || onRestoreToGeneral || onPromoteToGeneral)) && <DropdownMenuSeparator />}
                      {canManage && currentFolderType === 'general' && onRestrictToConfidential && (
                        <DropdownMenuItem
                          onClick={() => onRestrictToConfidential(document)}
                          className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
                        >
                          <FolderLock className="h-4 w-4 text-[#B91C1C]" />
                          <span className="whitespace-nowrap">Move to <strong>Confidential</strong></span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <span className="inline-flex text-gray-400 hover:text-gray-600 shrink-0">
                                  <Info className="h-3.5 w-3.5" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="bg-slate-50 text-slate-800 border-slate-200 max-w-[220px]">
                                Confidential is only accessible to Project Leads, Client Partners & Org Owners.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </DropdownMenuItem>
                      )}
                      {canManage && currentFolderType === 'confidential' && onRestoreToGeneral && (
                        <DropdownMenuItem
                          onClick={() => onRestoreToGeneral(document)}
                          className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
                        >
                          <FolderUp className="h-4 w-4 text-green-600" />
                          <span className="whitespace-nowrap">Release to <strong>General</strong></span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <span className="inline-flex text-gray-400 hover:text-gray-600 shrink-0">
                                  <Info className="h-3.5 w-3.5" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="bg-slate-50 text-slate-800 border-slate-200 max-w-[220px]">
                                General is visible to all project members.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </DropdownMenuItem>
                      )}
                      {canManage && currentFolderType === 'staging' && onPromoteToGeneral && (
                        <DropdownMenuItem
                          onClick={() => onPromoteToGeneral(document)}
                          className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
                        >
                          <FolderUp className="h-4 w-4 text-amber-600" />
                          <span className="whitespace-nowrap">Promote to <strong>General</strong></span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <span className="inline-flex text-gray-400 hover:text-gray-600 shrink-0">
                                  <Info className="h-3.5 w-3.5" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="bg-slate-50 text-slate-800 border-slate-200 max-w-[220px]">
                                Promote from Staging to General to make the file visible to all project members.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
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
                      onClick={() => setShowFileInfo(true)}
                      className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
                    >
                      <Info className="h-4 w-4 text-gray-600" />
                      <span>File information</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => { setShowVersionHistory(true); onVersionHistory?.(document) }}
                      className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
                    >
                      <Clock className="h-4 w-4 text-gray-600" />
                      <span>Version history</span>
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

                <DropdownMenuSeparator />

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
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <VersionHistorySheet
        isOpen={showVersionHistory}
        onClose={() => setShowVersionHistory(false)}
        document={document}
      />

      <Dialog open={showFileInfo} onOpenChange={setShowFileInfo}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>File information</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Name</span>
              <span className="font-medium truncate max-w-[240px]" title={document.name}>{document.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Type</span>
              <span>{getDisplayType(document)}</span>
            </div>
            {(document.mimeType ?? '').trim() !== '' && (
              <div className="flex justify-between">
                <span className="text-gray-500">Mime type</span>
                <span className="font-mono text-xs truncate max-w-[240px]" title={document.mimeType ?? ''}>{document.mimeType}</span>
              </div>
            )}
            {document.size != null && typeof document.size === 'number' && (
              <div className="flex justify-between">
                <span className="text-gray-500">Size</span>
                <span>{formatFileSize(document.size)} ({document.size.toLocaleString()} B)</span>
              </div>
            )}
            {document.modifiedTime && !Number.isNaN(new Date(document.modifiedTime).getTime()) && (
              <div className="flex justify-between">
                <span className="text-gray-500">Modified</span>
                <span>{formatSmartDateTime(document.modifiedTime)}</span>
              </div>
            )}
            {document.createdTime && !Number.isNaN(new Date(document.createdTime).getTime()) && (
              <div className="flex justify-between">
                <span className="text-gray-500">Created</span>
                <span>{formatSmartDateTime(document.createdTime)}</span>
              </div>
            )}
            {(document.owners?.[0]?.displayName || document.lastModifyingUser?.displayName) && (
              <div className="flex justify-between">
                <span className="text-gray-500">Owner</span>
                <span>{document.owners?.[0]?.displayName || document.lastModifyingUser?.displayName || '—'}</span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

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