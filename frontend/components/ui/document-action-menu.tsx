"use client"

import { useState, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { DateProperty } from "@/components/ui/property-cells"
import { DocumentIcon } from "@/components/ui/document-icon"
import { cn, formatFileSize } from "@/lib/utils"
import { DuePickerPanel } from "@/components/ui/due-picker"
import { DeliverableIcon } from "@/components/ui/deliverable-icon"
import { ModifiedStamp } from "@/components/ui/modified-stamp"
import { formatDue, isPastDue, readDue } from "@/lib/ui/due-date"
import { DocumentEditPanelContent, DocumentPreviewPanelContent, getDocumentEditUrl } from "@/components/files/document-edit-sheet"
import { DocumentPreviewPane } from "@/components/files/document-preview-pane"
import { useRightPane } from "@/lib/right-pane-context"
import { openAssetDetailsPane } from "@/components/files/asset-details-pane"
import { useDueDateSave } from "@/components/files/use-due-date-save"
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
  FolderInput,
  CopyPlus,
  Briefcase,
  Trash2,
  Calendar,
  CalendarClock,
  Check,
  BadgeCheck,
  Info,
  X,
  FolderUp,
  MessagesSquare,
  Link2,
  Lock,
  Unlock,
  CheckCircle2,
  XCircle,
  Loader2,
  Flag,
  FolderPlus,
  FolderMinus,
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
import { Hint, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { StatusPill } from "@/components/ui/status-pill"
import { STATUS } from "@/lib/ui/status"
import { useToast } from "@/components/ui/toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useDownloadProgress } from "@/lib/download-progress-context"
import { failureFrom, failureReason } from "@/lib/files/action-failure"
import { SetupReminderModal } from "@/components/ui/setup-reminder-modal"
import { useAuth } from "@/lib/auth-context"

/**
 * Compact rows for this menu and its submenus (which render inside it): 13px text, 26px rows, 14px
 * icons. The base DropdownMenuItem is sized for roomier menus; this one is long, so it runs tighter.
 */
const COMPACT_MENU_CLASS =
  '[&_[role=menuitem]]:py-1 [&_[role=menuitem]]:text-small [&_[role=menuitem]_svg]:h-3.5 [&_[role=menuitem]_svg]:w-3.5'

const VERSION_LOCK_TOOLTIP =
  'Finalize locks the document — all collaborators become view-only. Return to Draft restores each collaborator\'s prior access level based on their role and sharing settings.'

/**
 * What a reminder for several people did, by name: "Reminder set for Ana. Couldn't set it for Raj ·
 * Reminders cannot be assigned to an assistant." (P1-75), in place of "1 operation(s) failed."
 */
export function reminderOutcomeText(
  outcomes: { userId: string; kind: 'set' | 'remove'; error: string | null }[],
  members: { userId: string; name?: string | null; email?: string | null }[],
): string {
  const nameOf = (id: string) => {
    const m = members.find((x) => x.userId === id)
    return m?.name || m?.email || 'someone'
  }
  const names = (list: typeof outcomes) => list.map((o) => nameOf(o.userId)).join(', ')
  const parts: string[] = []
  const set = outcomes.filter((o) => !o.error && o.kind === 'set')
  const removed = outcomes.filter((o) => !o.error && o.kind === 'remove')
  if (set.length) parts.push(`Reminder set for ${names(set)}.`)
  if (removed.length) parts.push(`Removed for ${names(removed)}.`)
  // Grouped by reason, so one cause reads once.
  const byReason = new Map<string, typeof outcomes>()
  for (const o of outcomes) if (o.error) byReason.set(o.error, [...(byReason.get(o.error) ?? []), o])
  for (const [reason, list] of Array.from(byReason.entries())) {
    const setting = list.filter((o) => o.kind === 'set')
    const removing = list.filter((o) => o.kind === 'remove')
    const who = [
      setting.length ? `set it for ${names(setting)}` : '',
      removing.length ? `remove it for ${names(removing)}` : '',
    ].filter(Boolean).join(' or ')
    parts.push(`Couldn't ${who} · ${reason.replace(/\.$/, '')}.`)
  }
  return parts.join(' ')
}

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
  /** Opens Details in place of the menu's own opener — the Files row passes what its cells may edit. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onOpenDetails?: (doc: any) => void
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
  onOpenDetails,
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
  // Controlled, so picking a due date in the Due submenu can close the whole menu.
  const [menuOpen, setMenuOpen] = useState(false)
  const [showUntagConfirm, setShowUntagConfirm] = useState(false)
  const [showTagDeliverableModal, setShowTagDeliverableModal] = useState(false)
  const [tagDeliverableDueDate, setTagDeliverableDueDate] = useState<string>("")
  const [existingBookmarkId, setExistingBookmarkId] = useState<string | null>(null)
  /** Drive id or project document UUID — disables Finalize row while request in flight */
  const [finalizeLockActiveId, setFinalizeLockActiveId] = useState<string | null>(null)
  // Bumped after a due date saves: the value lives on `document`, so this redraws the Due row.
  const [, setDueVersion] = useState(0)
  const [hasCopiedName, setHasCopiedName] = useState(false)
  const [privateInfoOpen, setPrivateInfoOpen] = useState(false)
  const [showReminderModal, setShowReminderModal] = useState(false)
  const [reminderMembers, setReminderMembers] = useState<{ userId: string; email: string; name: string; role: string; avatarUrl?: string | null }[]>([])
  const [existingDocReminders, setExistingDocReminders] = useState<Map<string, { reminderId: string; dateValue: string | null }>>(new Map())
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const { addToast } = useToast()
  const { save: saveDue, dialog: dueDialog } = useDueDateSave()
  const rightPane = useRightPane()
  const { addTask, updateTask } = useDownloadProgress()
  const { user } = useAuth()

  const mime = (document?.mimeType ?? '').toLowerCase()
  const canOpenWithGoogleDoc = mime.includes('document') || mime.includes('vnd.google-apps.document')
  const canOpenWithGoogleSheet = mime.includes('spreadsheet') || mime.includes('vnd.google-apps.spreadsheet')
  const canOpenWithGoogleSlide = mime.includes('presentation') || mime.includes('vnd.google-apps.presentation')

  // Handle copy name
  const handleCopyName = (e: React.MouseEvent, text: string) => {
    e.stopPropagation()
    // "Copied" only once the clipboard took it: a browser can refuse (P2-08).
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(text))
      .then(() => {
        setHasCopiedName(true)
        setTimeout(() => setHasCopiedName(false), 2000)
      })
      .catch(() => addToast({ type: 'error', title: "Couldn't copy", message: 'The browser refused the clipboard. Select the name and copy it instead.' }))
  }

  // Handle due date selection — empty string means clear
  const handleDueDateChange = async (dateTime: string) => {
    try {
      if (!projectId) {
        addToast({ type: 'error', title: 'Unavailable', message: 'Project context is required to set a due date.' })
        return
      }

      // Due dates nest: a change that breaks that asks, with the fixes (lib/files/due-date-rule.ts).
      const result = await saveDue(projectId, documentIdForProjectApis, dateTime || null)
      if (!result.ok) {
        if (result.cancelled) return
        throw new Error(result.error)
      }
      dateTime = result.dueDate ?? ''
      // A fix moved its deliverable or its documents too: the list shows them as they are now.
      if (result.alsoChanged.length > 0 || result.engagementDueDate) onShareSaved?.()

      document.dueDate = dateTime || null
      setDueVersion((v) => v + 1)

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pockett-notifications-updated'))
      }
      // Saved, but its reminders or notices couldn't all follow: say so (P1-62).
      if (result.warning) addToast({ type: 'warning', title: 'Due date set', message: result.warning })
      else addToast({ type: 'success', title: 'Saved', message: dateTime ? 'Due date updated.' : 'Due date cleared.' })
    } catch (error) {
      addToast({
        type: 'error',
        title: "Couldn't set the due date",
        message: failureReason(error),
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
      if (!res.ok) throw await failureFrom(res)
      addToast({ type: 'success', title: 'Version locked', message: 'Others can only view this file until you unlock it.' })
      onShareSaved?.()
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Lock failed',
        message: failureReason(error),
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
      if (!res.ok) throw await failureFrom(res)
      const body = await res.json().catch(() => ({})) as { unlocked?: boolean; warning?: string }
      if (body.unlocked === false) {
        // Storage refused to give someone their edit access back: it stays locked, and says why.
        addToast({ type: 'warning', title: 'Still locked', message: body.warning || 'It stays locked until edit access is back. Try Unlock again.', duration: 12000 })
      } else {
        addToast({ type: 'success', title: 'Unlocked', message: 'Edit access restored. An approved document goes back to To do; its approval stays on record.' })
      }
      onShareSaved?.()
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Unlock failed',
        message: failureReason(error),
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
      if (!res.ok) throw await failureFrom(res)
      addToast({ type: 'success', title: 'Document accepted', message: 'The document has been accepted and is now locked.' })
      onShareSaved?.()
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Accept failed',
        message: failureReason(error),
      })
    } finally {
      finalizeLockInFlightRef.current = false
      setFinalizeLockActiveId(null)
    }
  }, [projectId, isExternalViewer, documentIdForProjectApis, addToast, onShareSaved])

  const getDisplayType = (doc: any) => {
    if (doc.documentType === 'LINK') return "External link"
    const m: string = (doc.mimeType ?? '').toLowerCase()
    if (m.includes('folder')) return "Folder"
    if (m.includes('pdf') || doc.type?.includes('pdf')) return "PDF"
    if (m.includes('presentation') || m.includes('powerpoint')) return "Presentation"
    // Before "document": every OOXML mime type contains it ("officedocument"), so an .xlsx read as a
    // Document. Same order as getFileTypeLabel in lib/utils.
    if (m.includes('spreadsheet') || m.includes('sheet') || m.includes('excel') || m.includes('csv')) return "Spreadsheet"
    if (m.includes('document') || m.includes('word')) return "Document"
    if (m.includes('image')) return "Image"
    if (m.includes('video')) return "Video"
    return "File"
  }

  const handleDownload = async (doc: any) => {
    if (doc.mimeType?.includes('folder')) return

    const filename: string = doc.name
    try {
      const { getSession } = await import('@/lib/supabase')
      const session = await getSession()

      // Nothing at all used to happen without a session (P1-41).
      if (!session) {
        updateTask(addTask(filename), { status: 'error', error: 'Your session has ended. Sign in again, then retry.' })
        return
      }

      const effectiveProjectId = doc.projectId ?? projectId

      if (effectiveProjectId && doc.id) {
        // Shared document: server resolves connector + PDF/original.
        // May involve PDF generation — show progress indicator while waiting.
        const downloadUrl = `/api/projects/${effectiveProjectId}/documents/${encodeURIComponent(doc.id)}/download-share`
        const taskId = addTask(filename)
        try {
          const res = await fetch(downloadUrl)
          if (!res.ok) {
            // The route's reason: "Download not permitted", or the storage's ("…needs renewing").
            updateTask(taskId, { status: 'error', error: (await failureFrom(res)).message })
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
          updateTask(taskId, { status: 'error', error: failureReason(err) })
          console.error('Share download error:', err)
        }
      } else {
        // A download is checked against the document's engagement, and every list that renders this
        // menu passes one. The old firm-wide route (/api/documents/download) carried the sign-in
        // token in the URL and checked only the legacy firm-to-storage link, so it is not called.
        const taskId = addTask(filename)
        updateTask(taskId, { status: 'error', error: 'Download unavailable here' })
      }
    } catch (error) {
      console.error('Download error:', error)
      updateTask(addTask(filename), { status: 'error', error: failureReason(error) })
    }
  }

  const stageKnown = !!deliverableStatus && deliverableStatus in STATUS.deliverable
  // What happens after "Move to trash", in the provider's own terms: Google empties its trash after
  // 30 days; Microsoft's recycle bin keeps items 30 days on personal OneDrive, up to 93 on work accounts.
  const trashRetentionNote = isOneDriveClient
    ? 'Items go to the OneDrive recycle bin, which keeps them for 30 days (up to 93 on work accounts).'
    : 'Items in the Google Drive trash are permanently deleted after 30 days.'
  const modifiedAt = [document.modifiedTime, document.createdTime].find((t) => t && !Number.isNaN(new Date(t).getTime())) as string | undefined
  // The due date shown on its menu item; red when overdue (past due and not yet approved).
  const due = readDue(document.dueDate)
  const dueOverdue = !!due && isPastDue(due) && deliverableStatus !== 'approved' && !isApprovedDeliverable

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={async (open) => {
        setMenuOpen(open)
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
        <Hint label="More actions">
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()} disabled={disabled}>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              aria-label="More actions"
              className="text-fg-muted hover:text-fg hover:bg-surface-hover h-7 w-7 p-0 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {triggerIcon ?? <MoreHorizontal className="h-4 w-4" />}
            </Button>
          </DropdownMenuTrigger>
        </Hint>
        <DropdownMenuContent
          side="bottom"
          align="end"
          avoidCollisions
          collisionPadding={8}
          sideOffset={0}
          className={cn("w-72 p-0 flex flex-col overflow-hidden", COMPACT_MENU_CLASS)}
          style={{ maxHeight: 'var(--radix-dropdown-menu-content-available-height)' }}
          onClick={(e) => e.stopPropagation()}
          onCloseAutoFocus={(e) => e.preventDefault()} // Prevent focus jump causing scroll
        >
          {sandboxPreview && (
            <div className="absolute inset-0 z-10 rounded-[inherit] pointer-events-auto cursor-not-allowed bg-transparent" />
          )}
          {/* What this is, before what you can do with it, in two lines: the name (one line — the hint
              and Copy name have it in full), then its code, stage, type and size, with who changed it
              last and when at the end (in full on hover). */}
          <div className="px-3 py-2 border-b border-line flex-none">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-surface-muted">
                {isDeliverable ? <DeliverableIcon /> : <DocumentIcon mimeType={document.mimeType} className="h-4 w-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <Hint label={document.name} side="bottom">
                    <h3 className="min-w-0 cursor-default select-text truncate text-small font-medium leading-snug text-fg">
                      {document.name}
                    </h3>
                  </Hint>
                  <Hint label={hasCopiedName ? 'Copied' : 'Copy name'}>
                    <button
                      type="button"
                      onClick={(e) => handleCopyName(e, document.name)}
                      aria-label="Copy name"
                      className="shrink-0 rounded-control p-0.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                    >
                      {hasCopiedName ? <Check className="h-3 w-3 text-status-done-icon" /> : <Copy className="h-3 w-3" />}
                    </button>
                  </Hint>
                </div>
                <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-caption text-fg-muted">
                  {document.docId && <span className="shrink-0 font-mono text-caption text-fg-subtle">{document.docId}</span>}
                  {stageKnown && <StatusPill kind="deliverable" status={deliverableStatus!} />}
                  <span className="min-w-0 truncate">
                    {getDisplayType(document)}
                    {!document.mimeType?.includes('folder') && document.size != null && typeof document.size === 'number' && (
                      <> · {formatFileSize(document.size)}</>
                    )}
                  </span>
                  {modifiedAt && (
                    <ModifiedStamp
                      at={modifiedAt}
                      by={document.lastModifyingUser?.displayName}
                      photoLink={document.lastModifyingUser?.photoLink}
                      className="ml-auto pl-1"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="p-1 overflow-y-auto min-h-0">
            {/* Intake pending actions — shown at the top when applicable */}
            {(onApproveIntake || onRejectIntake || onWithdrawIntake) && (
              <>
                {onApproveIntake && (
                  <DropdownMenuItem
                    onSelect={() => onApproveIntake(document)}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-action" />
                    <span>Approve</span>
                  </DropdownMenuItem>
                )}
                {onRejectIntake && (
                  <DropdownMenuItem
                    onSelect={() => onRejectIntake(document)}
                    className="flex cursor-pointer items-center gap-2 text-danger focus:text-danger"
                  >
                    <XCircle className="h-3.5 w-3.5 text-danger" />
                    <span>Reject</span>
                  </DropdownMenuItem>
                )}
                {onWithdrawIntake && (
                  <DropdownMenuItem
                    onSelect={() => onWithdrawIntake(document)}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <X className="h-3.5 w-3.5 text-fg-muted" />
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
                    <CheckCircle2 className="h-3.5 w-3.5 text-action" />
                    <span>Approve folder upload</span>
                  </DropdownMenuItem>
                )}
                {onRejectFolder && (
                  <DropdownMenuItem
                    onSelect={() => onRejectFolder(document)}
                    className="flex cursor-pointer items-center gap-2 text-danger focus:text-danger"
                  >
                    <XCircle className="h-3.5 w-3.5 text-danger" />
                    <span>Reject folder</span>
                  </DropdownMenuItem>
                )}
                {onWithdrawFolder && (
                  <DropdownMenuItem
                    onSelect={() => onWithdrawFolder(document)}
                    className="flex items-center gap-2 px-2 py-1 cursor-pointer text-small text-tag-orange-fg focus:text-tag-orange-fg"
                  >
                    <FolderUp className="h-3.5 w-3.5 text-tag-orange-fg" />
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
                  <Link2 className="h-3.5 w-3.5 text-fg-muted" />
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
                            className="flex items-center gap-2 px-2 py-1 text-small opacity-50 cursor-not-allowed"
                          >
                            <FolderMinus className="h-3.5 w-3.5" />
                            <span>Demote Deliverable to Folder</span>
                          </DropdownMenuItem>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="text-xs max-w-48">An approved deliverable can't be demoted</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : isDeliverable ? (
                    <DropdownMenuItem
                      // Closes the menu: it sits above dialogs, so left open it covers the confirmation.
                      onSelect={() => {
                        if (deliverableStatus && deliverableStatus !== 'to_do') {
                          addToast({ type: 'error', title: 'Cannot demote', message: 'Only a deliverable still at To do can be demoted to a folder.' })
                          return
                        }
                        setShowUntagConfirm(true)
                      }}
                      className="flex items-center gap-2 px-2 py-1 cursor-pointer text-small text-danger focus:text-danger"
                    >
                      <FolderMinus className="h-3.5 w-3.5" />
                      <span>Demote Deliverable to Folder</span>
                    </DropdownMenuItem>
                  ) : isAncestorShared ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DropdownMenuItem
                            aria-disabled="true"
                            onSelect={(e) => e.preventDefault()}
                            className="flex items-center gap-2 px-2 py-1 text-small opacity-50 cursor-not-allowed"
                          >
                            <FolderPlus className="h-3.5 w-3.5 text-fg-subtle" />
                            <span>Promote Folder to Deliverable</span>
                          </DropdownMenuItem>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="text-xs max-w-48">An ancestor folder is already a deliverable</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DropdownMenuItem
                            // Closes the menu: it sits above dialogs, so left open it covers the dialog.
                            onSelect={() => { setTagDeliverableDueDate(""); setShowTagDeliverableModal(true) }}
                            // Green, as Demote is red: the deliverable color, the opposite move.
                            className="flex cursor-pointer items-center gap-2 text-primary focus:text-primary"
                          >
                            <FolderPlus className="h-3.5 w-3.5 text-primary" />
                            <span>Promote Folder to Deliverable</span>
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
                        <div className="flex items-center gap-2 px-2 py-1 text-small text-fg-subtle opacity-50 cursor-not-allowed select-none">
                          <FolderOpen className="h-3.5 w-3.5" />
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
                      <FolderOpen className="h-3.5 w-3.5 text-fg-muted" />
                      <span>Organize</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-max min-w-48 max-w-72">
                      {onRenameDocument && (
                        isApprovedDeliverable ? (
                          <div className="flex items-center gap-2 px-2 py-1 text-small text-fg-subtle opacity-40 cursor-not-allowed select-none">
                            <Edit3 className="h-3.5 w-3.5" /><span>Rename</span>
                          </div>
                        ) : (
                          <DropdownMenuItem onSelect={() => onRenameDocument(document)} className="flex cursor-pointer items-center gap-2">
                            <Edit3 className="h-3.5 w-3.5 text-fg-muted" />
                            <span>Rename</span>
                          </DropdownMenuItem>
                        )
                      )}
                      {onDuplicateDocument && (
                        isApprovedDeliverable ? (
                          <div className="flex items-center gap-2 px-2 py-1 text-small text-fg-subtle opacity-40 cursor-not-allowed select-none">
                            <CopyPlus className="h-3.5 w-3.5" /><span>Duplicate</span>
                          </div>
                        ) : (
                          <DropdownMenuItem onSelect={() => onDuplicateDocument(document)} className="flex cursor-pointer items-center gap-2">
                            <CopyPlus className="h-3.5 w-3.5 text-fg-muted" />
                            <span>Duplicate</span>
                          </DropdownMenuItem>
                        )
                      )}
                      {onCopyDocument && (
                        <DropdownMenuItem onSelect={() => onCopyDocument(document)} className="flex cursor-pointer items-center gap-2">
                          <Copy className="h-3.5 w-3.5 text-fg-muted" />
                          <span>Copy to…</span>
                        </DropdownMenuItem>
                      )}
                      {onMoveDocument && (
                        isApprovedDeliverable ? (
                          <div className="flex items-center gap-2 px-2 py-1 text-small text-fg-subtle opacity-40 cursor-not-allowed select-none">
                            <FolderInput className="h-3.5 w-3.5" /><span>Move to…</span>
                          </div>
                        ) : (
                          <DropdownMenuItem onSelect={() => onMoveDocument(document)} className="flex cursor-pointer items-center gap-2">
                            <FolderInput className="h-3.5 w-3.5 text-fg-muted" />
                            <span>Move to…</span>
                          </DropdownMenuItem>
                        )
                      )}
                      {(canManage && (onMakePrivate || onMakePublic)) && <DropdownMenuSeparator />}
                      {canManage && !document.isPrivate && onMakePrivate && (
                        isApprovedDeliverable ? (
                          <div className="flex items-center gap-2 px-2 py-1 text-small text-fg-subtle opacity-40 cursor-not-allowed select-none">
                            <Lock className="h-3.5 w-3.5" /><span>Make internal only</span>
                          </div>
                        ) : document.isSharedWithExternal ? (
                          <TooltipProvider>
                            <Tooltip open={privateInfoOpen} onOpenChange={setPrivateInfoOpen}>
                              <TooltipTrigger asChild>
                                <div
                                  onClick={(e) => { e.stopPropagation(); setPrivateInfoOpen((v) => !v) }}
                                  className="flex items-center gap-2 px-2 py-1 text-small text-fg-subtle cursor-pointer opacity-50 rounded-control hover:bg-surface-hover"
                                >
                                  <Lock className="h-3.5 w-3.5 text-fg-subtle" />
                                  <span>Make internal only</span>
                                  <Info className="h-3.5 w-3.5 ml-auto text-fg-subtle" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="text-xs max-w-[220px]">
                                A shared document can't be made internal only. Turn off sharing first.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <DropdownMenuItem onClick={() => onMakePrivate(document)} className="flex cursor-pointer items-center gap-2">
                            <Lock className="h-3.5 w-3.5 text-fg-subtle" />
                            <span>Make internal only</span>
                          </DropdownMenuItem>
                        )
                      )}
                      {canManage && document.isPrivate && onMakePublic && (
                        isApprovedDeliverable ? (
                          <div className="flex items-center gap-2 px-2 py-1 text-small text-fg-subtle opacity-40 cursor-not-allowed select-none">
                            <FolderUp className="h-3.5 w-3.5" /><span>Remove internal only</span>
                          </div>
                        ) : (
                          <DropdownMenuItem onClick={() => onMakePublic(document)} className="flex cursor-pointer items-center gap-2">
                            <FolderUp className="h-3.5 w-3.5 text-fg-muted" />
                            <span>Remove internal only</span>
                          </DropdownMenuItem>
                        )
                      )}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                {!isExternalUser && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="flex cursor-pointer items-center gap-2">
                      <ExternalLink className="h-3.5 w-3.5 text-fg-muted" />
                      <span>Drive actions</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-max min-w-48 max-w-72">
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
                  {(onDeleteDocument || isApprovedDeliverable) && (
                  <>
                    <DropdownMenuSeparator />
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          {isApprovedDeliverable ? (
                            <div className="flex items-center gap-2 px-2 py-1 text-small text-fg-subtle opacity-50 cursor-not-allowed select-none">
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>{document.documentType === 'LINK' ? 'Delete' : 'Move to trash'}</span>
                            </div>
                          ) : (
                            <DropdownMenuItem
                              // Closes the menu: it sits above dialogs, so left open it covers the confirmation.
                              onSelect={() => onDeleteDocument!(document)}
                              className="flex cursor-pointer items-center gap-2 text-danger focus:text-danger"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>{document.documentType === 'LINK' ? 'Delete' : 'Move to trash'}</span>
                            </DropdownMenuItem>
                          )}
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[200px]">
                          {isApprovedDeliverable
                            ? <p>Approved deliverables cannot be deleted</p>
                            : document.documentType === 'LINK'
                              ? <p>This link will be permanently deleted.</p>
                              : <p>{trashRetentionNote}</p>
                          }
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </>
                )}
              </>
                )}
              </>
            ) : (
              <>
                {/* Grouped by intent (.claude/plans/app-design-refinements.md): use the file, plan it,
                    the submenus, and the destructive action last. */}
                {isApprovedDeliverable ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2 px-2 py-1 text-small text-fg-subtle opacity-50 cursor-not-allowed select-none">
                          <ExternalLink className="h-3.5 w-3.5" />
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
                    // onSelect, as the menu's other items that open a dialog: the menu starts closing
                    // before the secure-access dialog opens over it.
                    onSelect={() => {
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
                    <ExternalLink className="h-3.5 w-3.5 text-fg-muted" />
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
                  <Link2 className="h-3.5 w-3.5 text-fg-muted" />
                  <span>Copy link</span>
                </DropdownMenuItem>

                {document.documentType !== 'LINK' &&
                 !(document.isGuest && !document.allowDownload) &&
                 !(document.isExternalCollaborator && !document.ecAllowDownload) && (
                  <DropdownMenuItem
                    onClick={() => { handleDownload(document); onDownloadDocument?.(document) }}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <Download className="h-3.5 w-3.5 text-fg-subtle" />
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
                        rightPane.setHeaderIcon(<DocumentIcon mimeType={document.mimeType} className="h-3.5 w-3.5" />)
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
                    <MessagesSquare className="h-3.5 w-3.5 text-fg-muted" />
                    <span>Comment</span>
                  </DropdownMenuItem>
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
                        if (!res.ok) throw await failureFrom(res)
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
                        if (!res.ok) throw await failureFrom(res)
                        const data = await res.json()
                        setExistingBookmarkId(data.bookmark?.id ?? null)
                        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('pockett-bookmarks-updated'))
                        addToast({ type: 'success', title: 'Bookmarked', message: 'Saved to your bookmarks.' })
                      }
                    } catch (e) {
                      addToast({ type: 'error', title: existingBookmarkId ? "Couldn't remove the bookmark" : "Couldn't add the bookmark", message: failureReason(e) })
                    }
                  }}
                  className="flex items-center gap-2 px-2 py-1 text-small data-[disabled]:opacity-50 data-[disabled]:pointer-events-none"
                >
                  <Bookmark className={`h-3.5 w-3.5 ${existingBookmarkId ? 'fill-current text-fg' : 'text-fg-muted'}`} />
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
                        <div className="flex items-center gap-2 px-2 py-1 text-small text-fg-subtle opacity-50 cursor-not-allowed select-none">
                          <Calendar className="h-3.5 w-3.5 text-fg-subtle" />
                          <span>Due</span>
                          <span className={`ml-auto pl-3 text-small tabular-nums ${dueOverdue ? 'text-danger' : 'text-fg-subtle'}`}>{due ? formatDue(due) : 'Not set'}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs max-w-48">
                        Cannot set due date on an approved deliverable
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="flex cursor-pointer items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-fg-muted" />
                      <span className="flex flex-1 items-center">
                        Due
                        <span className={`ml-auto pl-3 text-small tabular-nums ${dueOverdue ? 'text-danger' : 'text-fg-subtle'}`}>{due ? formatDue(due) : 'Not set'}</span>
                      </span>
                    </DropdownMenuSubTrigger>
                    {/* The shared date picker (due-picker.tsx) opens beside the row — no modal. A day saves
                        and closes the menu; adding a time keeps it open until you're done. */}
                    <DropdownMenuSubContent className="w-auto p-0" sideOffset={6}>
                      <DuePickerPanel
                        value={document.dueDate ?? null}
                        allowTime
                        label="Due"
                        onCommit={(next, close) => {
                          void handleDueDateChange(next ?? '')
                          if (close) {
                            setMenuOpen(false)
                            onOpenChange?.(false)
                          }
                        }}
                      />
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                {!mime.includes('folder') && document.documentType !== 'LINK' && isExternalViewer && projectId && (() => {
                  const doc = document as { lock?: { type?: string } | null }
                  const isAlreadyLocked = doc.lock?.type === 'finalize'
                  if (isAlreadyLocked) return (
                    <DropdownMenuItem disabled className="flex items-center gap-2 px-2 py-1 text-small text-fg-subtle opacity-50 cursor-not-allowed data-[disabled]:pointer-events-none">
                      <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
                      <span className="whitespace-nowrap">Accepted</span>
                    </DropdownMenuItem>
                  )
                  return (
                    <DropdownMenuItem
                      disabled={finalizeLockDisabled}
                      onClick={() => void handleAcceptDocument()}
                      className="flex cursor-pointer items-center gap-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                    >
                      <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-action" />
                      <span className="whitespace-nowrap">Accept</span>
                    </DropdownMenuItem>
                  )
                })()}

                <DropdownMenuSeparator />

                {/* Organize (Copy + Move + persona options) */}
                {isApprovedDeliverable && !onCopyDocument ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2 px-2 py-1 text-small text-fg-subtle opacity-50 cursor-not-allowed select-none">
                          <FolderOpen className="h-3.5 w-3.5" />
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
                      <FolderOpen className="h-3.5 w-3.5 text-fg-muted" />
                      <span>Organize</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-max min-w-48 max-w-72">
                      {onRenameDocument && (
                        isApprovedDeliverable ? (
                          <div className="flex items-center gap-2 px-2 py-1 text-small text-fg-subtle opacity-40 cursor-not-allowed select-none">
                            <Edit3 className="h-3.5 w-3.5" /><span>Rename</span>
                          </div>
                        ) : (
                          <DropdownMenuItem
                            onSelect={() => onRenameDocument(document)}
                            className="flex cursor-pointer items-center gap-2"
                          >
                            <Edit3 className="h-3.5 w-3.5 text-fg-muted" />
                            <span>Rename</span>
                          </DropdownMenuItem>
                        )
                      )}
                      {onDuplicateDocument && document.documentType !== 'LINK' && (
                        isApprovedDeliverable ? (
                          <div className="flex items-center gap-2 px-2 py-1 text-small text-fg-subtle opacity-40 cursor-not-allowed select-none">
                            <CopyPlus className="h-3.5 w-3.5" /><span>Duplicate</span>
                          </div>
                        ) : (
                          <DropdownMenuItem
                            onSelect={() => onDuplicateDocument(document)}
                            className="flex cursor-pointer items-center gap-2"
                          >
                            <CopyPlus className="h-3.5 w-3.5 text-fg-muted" />
                            <span>Duplicate</span>
                          </DropdownMenuItem>
                        )
                      )}
                      {onCopyDocument && document.documentType !== 'LINK' && (
                        <DropdownMenuItem
                          onSelect={() => onCopyDocument(document)}
                          className="flex cursor-pointer items-center gap-2"
                        >
                          <Copy className="h-3.5 w-3.5 text-fg-muted" />
                          <span>Copy to…</span>
                        </DropdownMenuItem>
                      )}
                      {onMoveDocument && document.documentType !== 'LINK' && (
                        isApprovedDeliverable ? (
                          <div className="flex items-center gap-2 px-2 py-1 text-small text-fg-subtle opacity-40 cursor-not-allowed select-none">
                            <FolderInput className="h-3.5 w-3.5" /><span>Move to…</span>
                          </div>
                        ) : (
                          <DropdownMenuItem
                            onSelect={() => onMoveDocument(document)}
                            className="flex cursor-pointer items-center gap-2"
                          >
                            <FolderInput className="h-3.5 w-3.5 text-fg-muted" />
                            <span>Move to…</span>
                          </DropdownMenuItem>
                        )
                      )}
                      {onCrossEngagementCopy && document.documentType !== 'LINK' && <DropdownMenuSeparator />}
                      {onCrossEngagementCopy && document.documentType !== 'LINK' && (
                        <DropdownMenuItem
                          onSelect={() => onCrossEngagementCopy(document)}
                          className="flex cursor-pointer items-center gap-2"
                        >
                          <Briefcase className="h-3.5 w-3.5 flex-shrink-0 text-fg-subtle" />
                          <span className="whitespace-nowrap">Copy to another engagement…</span>
                        </DropdownMenuItem>
                      )}
                      {(canManage && (onMakePrivate || onMakePublic)) && <DropdownMenuSeparator />}
                      {canManage && !document.isPrivate && onMakePrivate && (
                        isApprovedDeliverable ? (
                          <div className="flex items-center gap-2 px-2 py-1 text-small text-fg-subtle opacity-40 cursor-not-allowed select-none">
                            <Lock className="h-3.5 w-3.5" /><span>Make internal only</span>
                          </div>
                        ) : document.isSharedWithExternal ? (
                          <TooltipProvider>
                            <Tooltip open={privateInfoOpen} onOpenChange={setPrivateInfoOpen}>
                              <TooltipTrigger asChild>
                                <div
                                  onClick={(e) => { e.stopPropagation(); setPrivateInfoOpen((v) => !v) }}
                                  className="flex items-center gap-2 px-2 py-1 text-small text-fg-subtle cursor-pointer opacity-50 rounded-control hover:bg-surface-hover"
                                >
                                  <Lock className="h-3.5 w-3.5 text-fg-subtle" />
                                  <span>Make internal only</span>
                                  <Info className="h-3.5 w-3.5 ml-auto text-fg-subtle" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="text-xs max-w-[220px]">
                                A shared document can't be made internal only. Turn off sharing first.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => onMakePrivate(document)}
                            className="flex cursor-pointer items-center gap-2"
                          >
                            <Lock className="h-3.5 w-3.5 text-fg-subtle" />
                            <span>Make internal only</span>
                          </DropdownMenuItem>
                        )
                      )}
                      {canManage && document.isPrivate && onMakePublic && (
                        isApprovedDeliverable ? (
                          <div className="flex items-center gap-2 px-2 py-1 text-small text-fg-subtle opacity-40 cursor-not-allowed select-none">
                            <FolderUp className="h-3.5 w-3.5" /><span>Remove internal only</span>
                          </div>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => onMakePublic(document)}
                            className="flex cursor-pointer items-center gap-2"
                          >
                            <FolderUp className="h-3.5 w-3.5 text-fg-muted" />
                            <span>Remove internal only</span>
                          </DropdownMenuItem>
                        )
                      )}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}

                {document.documentType !== 'LINK' && (
                  <DropdownMenuItem
                    onClick={() => {
                      // The Files row opens it with what its cells may edit; elsewhere Info reads only.
                      if (onOpenDetails) { onOpenDetails(document); return }
                      onOpenInfoPane?.(document.id)
                      openAssetDetailsPane(rightPane, {
                        document,
                        projectId: document.projectId ?? projectId,
                        orgSlug,
                        isExternalUser: !!isExternalUser,
                      })
                    }}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <Info className="h-3.5 w-3.5 text-fg-muted" />
                    <span>Details</span>
                  </DropdownMenuItem>
                )}
                {!isExternalUser && document.documentType !== 'LINK' && (
                <>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="flex cursor-pointer items-center gap-2">
                      <ExternalLink className="h-3.5 w-3.5 text-fg-muted" />
                      <span>Drive actions</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-max min-w-48 max-w-72">
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
                        <ExternalLink className="h-3.5 w-3.5 text-fg-subtle" />
                        <span>Open containing folder in Google Drive</span>
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </>
                )}

                {(onDeleteDocument || isApprovedDeliverable) && (
                  <>
                    <DropdownMenuSeparator />
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          {isApprovedDeliverable ? (
                            <div className="flex items-center gap-2 px-2 py-1 text-small text-fg-subtle opacity-50 cursor-not-allowed select-none">
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>{document.documentType === 'LINK' ? 'Delete' : 'Move to trash'}</span>
                            </div>
                          ) : (
                            <DropdownMenuItem
                              // Closes the menu: it sits above dialogs, so left open it covers the confirmation.
                              onSelect={() => onDeleteDocument!(document)}
                              className="flex cursor-pointer items-center gap-2 text-danger focus:text-danger"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>{document.documentType === 'LINK' ? 'Delete' : 'Move to trash'}</span>
                            </DropdownMenuItem>
                          )}
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[200px]">
                          {isApprovedDeliverable
                            ? <p>Approved deliverables cannot be deleted</p>
                            : document.documentType === 'LINK'
                              ? <p>This link will be permanently deleted.</p>
                              : <p>{trashRetentionNote}</p>
                          }
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
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
        icon={<FolderPlus className="h-3.5 w-3.5" />}
        iconVariant="primary"
        title="Promote Folder to Deliverable"
        subtitle={document.name}
        description="This will share the folder externally and add it to the Board."
        extra={
          // A Due property row, as on the engagement header: optional, and the same picker as everywhere.
          <div className="flex items-center gap-2">
            <span className="flex w-24 shrink-0 items-center gap-1.5 text-small text-fg-muted">
              <Flag className="h-3.5 w-3.5 text-fg-subtle" />
              Due
            </span>
            <DateProperty
              value={tagDeliverableDueDate || null}
              onChange={(next) => setTagDeliverableDueDate(next ?? '')}
              placeholder="Not set"
              allowTime
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

      {/* Demote Deliverable to Folder confirmation */}
      <ConfirmDialog
        open={showUntagConfirm}
        onOpenChange={setShowUntagConfirm}
        icon={<FolderMinus className="h-3.5 w-3.5" />}
        iconVariant="red"
        title="Demote Deliverable to Folder"
        subtitle={document.name}
        description="It goes back to being a plain folder and comes off the Board. Limited Access contributors and Reviewers lose their access to it."
        confirmLabel="Demote"
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
          const send = (userId: string, kind: 'set' | 'remove', init: RequestInit) =>
            fetch(`/api/projects/${projectId}/documents/${encodeURIComponent(docId)}/reminder`, init)
              .then(async (res) => { if (!res.ok) throw await failureFrom(res) })
              .then(() => ({ userId, kind, error: null as string | null }), (e) => ({ userId, kind, error: failureReason(e) }))
          const outcomes = await Promise.all([
            ...deselected.map((userId) => send(userId, 'remove', {
              method: 'DELETE', headers: authHeader,
              body: JSON.stringify({ reminderId: existingDocReminders.get(userId)?.reminderId, recipientId: userId }),
            })),
            ...selected.map((recipientId) => send(recipientId, 'set', {
              method: 'POST', headers: authHeader,
              body: JSON.stringify({ recipientId, dateValue }),
            })),
          ])
          const failed = outcomes.filter((o) => o.error)
          if (failed.length > 0) {
            // Who it worked for, who it didn't, and why (P1-75).
            addToast({ type: 'error', title: failed.length === outcomes.length ? "Couldn't set the reminder" : 'Reminder partly set', message: reminderOutcomeText(outcomes, reminderMembers), duration: 12000 })
            throw new Error('partial failure')
          }
          setExistingDocReminders(new Map())
        }}
      />

      {dueDialog}
    </>
  )
}