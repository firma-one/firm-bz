'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { supabase } from '@/lib/supabase'
import { DocumentDocCommentsPane } from '@/components/projects/document-doc-comments-pane'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useRightPane } from '@/lib/right-pane-context'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import {
  Loader2,
  Folder, MoreVertical,
  Info, MessagesSquare, Settings as SettingsIcon,
  UserPlus, ChevronDown, X, ScanEye, FolderOpen, Check, CircleDot, CalendarClock, UserRound, ListChecks,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DocumentIcon } from '@/components/ui/document-icon'
import { DocumentActionMenu } from '@/components/ui/document-action-menu'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { Button } from '@/components/ui/button'
import { StatusPill } from '@/components/ui/status-pill'
import { FRESH_CHIP_CLASS, useApprovalFeedback } from '@/lib/ui/use-approval-feedback'
import { STAGE_BAR_CLASSES, STATUS, type LaneStage } from '@/lib/ui/status'
import { PropertyList, PropertyRow } from '@/components/ui/property-list'
import { DateProperty, PersonAvatar, PersonProperty, type PersonOption } from '@/components/ui/property-cells'
import type { ActivityStatus } from '@/lib/sharing-settings'
import { getAllowedTransitions, type EngagementRoleSlug } from '@/lib/deliverable-stage-roles'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SharingOptions {
  ecAllowDownload: boolean
  evAllowDownload: boolean
  evPdfOnly: boolean
  evAddWatermark: boolean
}

interface SubtaskRecord {
  id: string
  documentId: string
  externalId?: string | null
  fileName: string
  mimeType?: string | null
  docId: string | null
  dueDate: string | null
  assigneeUserId: string | null
  assigneeName: string | null
  assigneeEmail: string | null
  assigneeAvatarUrl?: string | null
  status?: ActivityStatus | null
  breadcrumb?: string[]
}

interface EngagementMember {
  userId: string
  name: string | null
  email: string | null
  avatarUrl: string | null
  role: string
  /** True for Brio. A member, but not someone work can be assigned to. */
  isAgent?: boolean
}

export interface DeliverableDetailPanelProps {
  documentId: string
  projectId: string
  docId: string | null
  fileName: string
  activityStatus: ActivityStatus
  dueDate?: string | null
  canManage: boolean
  isExternalViewer?: boolean
  isExternalCollaborator?: boolean
  /** Engagement role slug — used to derive allowed lane transitions. */
  roleSlug?: EngagementRoleSlug
  orgSlug?: string
  deeplinkBase?: string
  onStatusChange?: (newStatus: ActivityStatus) => void
  /** Called when a subtask's status changes — lets the board card keep its x/y progress counter in sync. */
  onSubtaskStatusChange?: (totalCount: number, approvedCount: number) => void
  /** Ref the parent can call to push a new status into the panel without remounting it (e.g. after board drag). */
  externalStatusRef?: React.MutableRefObject<((s: ActivityStatus) => void) | null>
  /** Called when "Open" is clicked on a subtask row — triggers the regrant/secure-open flow. */
  onOpenSubtaskDocument?: (subtask: SubtaskRecord) => void
  /** Called when "Preview" is clicked on a subtask row — opens the preview pane. */
  onPreviewSubtaskDocument?: (subtask: SubtaskRecord) => void
  onClose?: () => void
  className?: string
  /** Tab to open on mount — e.g. deep-linking from a comment thread should land on 'comments'. */
  initialTab?: Tab
}

type Tab = 'details' | 'delivery' | 'comments'

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<ActivityStatus, string> = {
  to_do: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  approved: 'Approved',
}

/** Progress bars take the deliverable's stage hue (every deliverable stage is a lane stage). */
const laneStageOf = (status: ActivityStatus) => STATUS.deliverable[status].stage as LaneStage

const FIELD_LABEL = 'block mb-1.5 text-small font-medium text-fg-muted'

/** Inline property chip: plain text until hovered (Notion). */
const CHIP = 'inline-flex h-7 items-center gap-1.5 rounded-control px-1.5 text-small text-fg-muted transition-colors hover:bg-surface-selected hover:text-fg data-[state=open]:bg-surface-selected disabled:cursor-not-allowed disabled:opacity-50'

// ─── Subtask Row ─────────────────────────────────────────────────────────────

function SubtaskRow({
  subtask,
  projectId,
  onStatusChange,
  onRemoveSubtask,
  onAssigneeChange,
  onOpenDocument,
  onPreviewDocument,
  disabled = false,
  deeplinkBase,
  showExtras = false,
  isMedium = false,
  isExpanded,
  onToggleExpand,
  isDeliverableApproved = false,
  members = [],
}: {
  subtask: SubtaskRecord
  projectId: string
  onStatusChange: (id: string, newStatus: ActivityStatus) => void
  onRemoveSubtask?: (id: string) => void
  onAssigneeChange?: (id: string, userId: string | null, name: string | null, email: string | null, avatarUrl: string | null) => void
  onOpenDocument?: (subtask: SubtaskRecord) => void
  onPreviewDocument?: (subtask: SubtaskRecord) => void
  disabled?: boolean
  deeplinkBase?: string
  showExtras?: boolean
  isMedium?: boolean
  isExpanded?: boolean
  onToggleExpand?: () => void
  isDeliverableApproved?: boolean
  members?: EngagementMember[]
}) {
  const [saving, setSaving] = useState(false)
  const { addToast } = useToast()
  const approvalFeedback = useApprovalFeedback()
  const [subtaskDueDate, setSubtaskDueDate] = useState(subtask.dueDate ?? '')
  const [savingSubtaskDue, setSavingSubtaskDue] = useState(false)
  const [savingAssignee, setSavingAssignee] = useState(false)
  const status = (subtask.status ?? 'to_do') as ActivityStatus

  const expanded = isExpanded ?? false
  // Rows 2+3 visible when expanded
  const showDetails = showExtras && expanded

  const handleSubtaskDueDateChange = useCallback(async (iso: string) => {
    setSubtaskDueDate(iso)
    const val = iso ? iso.slice(0, 10) : ''
    setSavingSubtaskDue(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      await fetch(`/api/projects/${projectId}/documents/${subtask.documentId}/due-date`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dueDate: val || null }),
      })
    } finally {
      setSavingSubtaskDue(false)
    }
  }, [projectId, subtask.documentId])

  const handleAssigneeSelect = useCallback(async (member: EngagementMember | null) => {
    const userId = member?.userId ?? null
    onAssigneeChange?.(subtask.id, userId, member?.name ?? null, member?.email ?? null, member?.avatarUrl ?? null)
    setSavingAssignee(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      await fetch(`/api/projects/${projectId}/documents/${subtask.documentId}/assignee`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeUserId: userId }),
      })
    } finally {
      setSavingAssignee(false)
    }
  }, [projectId, subtask.id, subtask.documentId, onAssigneeChange])

  const handleStatusChange = useCallback(async (newStatus: string) => {
    const s = newStatus as ActivityStatus
    const previous = status
    onStatusChange(subtask.id, s)
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const res = await fetch(`/api/projects/${projectId}/documents/${subtask.documentId}/sharing/activity`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ status: s }),
      })
      if (!res.ok) {
        // The change was shown optimistically; put it back and say so instead of failing silently.
        onStatusChange(subtask.id, previous)
        addToast({ type: 'error', title: 'Failed to update status', message: 'Please try again.' })
        return
      }
      // Approving a document gets the same feedback as approving a deliverable (none before).
      if (s === 'approved') approvalFeedback.confirm({ id: subtask.id, name: subtask.fileName })
    } finally {
      setSaving(false)
    }
  }, [subtask.id, subtask.documentId, subtask.fileName, projectId, status, onStatusChange, addToast, approvalFeedback])

  const handleTrash = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      await fetch(`/api/projects/${projectId}/documents/${subtask.documentId}/trash`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      onRemoveSubtask?.(subtask.id)
    } catch { /* ignore */ }
  }, [subtask.id, subtask.documentId, projectId, onRemoveSubtask])

  const fileUrl = deeplinkBase && subtask.documentId
    ? `${deeplinkBase}#doc-file:${subtask.documentId}`
    : null

  // Shape a document object compatible with DocumentActionMenu.
  // Do NOT set webViewLink to the internal deeplink — DocumentPreviewPanelContent uses
  // webViewLink as the iframe src, which would load the app page instead of the document.
  // externalId lets getDocumentPreviewUrl build the correct Google Drive/preview URL.
  const docForMenu = {
    id: subtask.documentId,
    projectId,
    projectDocumentId: subtask.documentId,
    externalId: subtask.externalId ?? undefined,
    name: subtask.fileName,
    mimeType: subtask.mimeType ?? 'application/octet-stream',
    webViewLink: '',
    webContentLink: '',
  }

  return (
    <div className="group px-4 py-1 transition-colors hover:bg-surface-hover">
      <div className="flex min-h-8 items-center gap-2">
        <DocumentIcon mimeType={subtask.mimeType ?? undefined} className="h-3.5 w-3.5 shrink-0" size={14} />
        {subtask.docId && (
          <span className="shrink-0 text-small tabular-nums text-fg-subtle">{subtask.docId}</span>
        )}
        {showExtras && (
          <span className="min-w-0 flex-1 truncate text-ui text-fg">{subtask.fileName}</span>
        )}
        {!showExtras && <span className="flex-1 min-w-0" />}
        {/* Expand toggle */}
        {showExtras && (
          <button
            type="button"
            onClick={onToggleExpand}
            className="shrink-0 rounded-control p-1 text-fg-subtle transition-colors hover:bg-surface-selected hover:text-fg"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', expanded && 'rotate-180')} />
          </button>
        )}
        <TooltipProvider delayDuration={300}>
          {/* Preview button */}
          {onPreviewDocument && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onPreviewDocument(subtask)}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-fg-subtle transition-colors hover:bg-surface-selected hover:text-fg"
                  aria-label="Preview"
                >
                  <ScanEye className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">Preview</TooltipContent>
            </Tooltip>
          )}
          {/* Open in Files button */}
          {fileUrl && (
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-fg-subtle transition-colors hover:bg-surface-selected hover:text-fg"
                  aria-label="Open in Files"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                </a>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">Open in Files</TooltipContent>
            </Tooltip>
          )}
          {/* Stage badge */}
          <StatusPill kind="deliverable" status={status} className={cn('shrink-0', approvalFeedback.isFresh(subtask.id) && FRESH_CHIP_CLASS)} />
        </TooltipProvider>
        <div className="shrink-0">
          <DocumentActionMenu
            document={docForMenu}
            projectId={projectId}
            deeplinkBase={deeplinkBase}
            triggerIcon={<MoreVertical className="h-3.5 w-3.5" />}
            isEngagementLead={true}
            canManage={false}
            showShareModal={false}
            onOpenDocument={onOpenDocument ? () => onOpenDocument(subtask) : undefined}
            onDeleteDocument={(!isDeliverableApproved && onRemoveSubtask) ? () => void handleTrash() : undefined}
          />
        </div>
      </div>

      {showExtras && (
        <div className={cn('grid transition-[grid-template-rows] duration-300 ease-in-out', showDetails ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden">
        <>
          {/* Row 2 — breadcrumb */}
          <div className="flex min-w-0 items-center gap-1 overflow-hidden pl-6">
            {subtask.breadcrumb && subtask.breadcrumb.length > 0 && (
              <>
                <Folder className="h-3 w-3 shrink-0 fill-surface-muted text-fg-subtle" aria-hidden />
                {subtask.breadcrumb.map((segment, i) => (
                  <span key={i} className="flex items-center gap-1 min-w-0">
                    {i > 0 && <span className="shrink-0 text-small text-fg-subtle">/</span>}
                    <span className={cn('shrink-0 text-small text-fg-muted', i === subtask.breadcrumb!.length - 1 && 'min-w-0 truncate')}>
                      {segment}
                    </span>
                  </span>
                ))}
              </>
            )}
          </div>

          {/* Row 3 — Status · Assignee · Due Date (uniform w-40) */}
          <div className="flex flex-wrap items-center gap-0.5 pb-1 pl-5">
            {/* Status */}
            <div className="flex">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={saving || disabled}
                    aria-label="Document status"
                    className={cn(CHIP, disabled && 'pointer-events-none')}
                  >
                    <StatusPill kind="deliverable" status={status} className={cn(approvalFeedback.isFresh(subtask.id) && FRESH_CHIP_CLASS)} />
                    {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  {(Object.keys(STAGE_LABELS) as ActivityStatus[]).map((s, i) => {
                    const currentIdx = (Object.keys(STAGE_LABELS) as ActivityStatus[]).indexOf(status)
                    const isDisabled = Math.abs(i - currentIdx) > 1
                    return (
                      <DropdownMenuItem
                        key={s}
                        onClick={() => !isDisabled && handleStatusChange(s)}
                        disabled={isDisabled}
                        className={cn('flex cursor-pointer items-center gap-2', isDisabled && 'cursor-not-allowed opacity-40')}
                      >
                        <StatusPill kind="deliverable" status={s} />
                        {s === status && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-fg-muted" />}
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Assignee */}
            <div className="flex">
              <div className="flex items-center">
              <TooltipProvider delayDuration={400}>
                <Tooltip>
                  <DropdownMenu>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          disabled={isDeliverableApproved}
                          aria-label="Assignee"
                          className={cn(CHIP, 'max-w-[160px]', isDeliverableApproved && 'pointer-events-none opacity-50')}
                        >
                          {savingAssignee ? (
                            <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                          ) : subtask.assigneeUserId ? (
                            <>
                              <PersonAvatar person={{ name: subtask.assigneeName ?? '?', avatarUrl: subtask.assigneeAvatarUrl }} size={18} />
                              <span className="truncate text-fg">{subtask.assigneeName ?? 'Assigned'}</span>
                            </>
                          ) : (
                            <>
                              <UserPlus className="h-3.5 w-3.5 shrink-0" />
                              <span>Assign</span>
                            </>
                          )}
                        </button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <DropdownMenuContent align="start" className="w-52">
                      {/* Agents are excluded: Brio is a member and belongs in the Members list,
                          but assigning it a subtask would park the work with something that will
                          never pick it up. */}
                      {members.filter((m) => !m.isAgent).map((m) => (
                        <DropdownMenuItem
                          key={m.userId}
                          onClick={() => handleAssigneeSelect(m)}
                          className="flex cursor-pointer items-center gap-2"
                        >
                          <TooltipProvider delayDuration={400}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="shrink-0"><PersonAvatar person={{ name: m.name ?? m.email ?? '?', avatarUrl: m.avatarUrl ?? null }} size={20} /></span>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="text-xs">
                                {m.name ?? m.userId}
                                {m.email && <span className="block text-[10px] text-muted-foreground">{m.email}</span>}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <span className="truncate">{m.name ?? m.email ?? m.userId}</span>
                          {m.userId === subtask.assigneeUserId && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-fg-muted" />}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {subtask.assigneeUserId && subtask.assigneeName && (
                    <TooltipContent side="top" className="text-xs">
                      {subtask.assigneeName}
                      {subtask.assigneeEmail && <span className="block text-[10px] text-muted-foreground">{subtask.assigneeEmail}</span>}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
              {subtask.assigneeUserId && !isDeliverableApproved && (
                <button
                  type="button"
                  onClick={() => handleAssigneeSelect(null)}
                  aria-label="Unassign"
                  className="inline-flex h-7 w-6 shrink-0 items-center justify-center rounded-control text-fg-subtle transition-colors hover:bg-surface-selected hover:text-fg"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>{/* end assignee border-div */}
            </div>{/* end assignee flex-col wrapper */}

            {/* Due Date */}
            <div className="flex items-center gap-1">
              <DateTimePicker
                value={subtaskDueDate}
                onChange={(iso) => handleSubtaskDueDateChange(iso)}
                placeholder="Due date"
                disabled={isDeliverableApproved}
                className="h-7 w-auto border-transparent bg-transparent px-1.5 text-small shadow-none hover:bg-surface-selected"
              />
              {savingSubtaskDue && <Loader2 className="h-3 w-3 animate-spin text-fg-subtle" />}
            </div>
          </div>{/* end row-3 flex */}
        </>
        </div>
        </div>
      )}
    </div>
  )
}

// ─── Toggle row (Delivery Settings) ──────────────────────────────────────────

function ToggleRow({
  label,
  checked,
  onCheckedChange,
  indent = false,
  disabled = false,
}: {
  label: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
  indent?: boolean
  disabled?: boolean
}) {
  return (
    <div className={cn('flex items-center justify-between py-2', indent && 'pl-4')}>
      <span className="text-ui text-fg">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  )
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

export function DeliverableDetailPanel({
  documentId,
  projectId,
  docId,
  fileName,
  activityStatus,
  dueDate,
  canManage,
  isExternalViewer = false,
  isExternalCollaborator = false,
  roleSlug,
  orgSlug,
  deeplinkBase,
  onStatusChange,
  onSubtaskStatusChange,
  externalStatusRef,
  onOpenSubtaskDocument,
  onPreviewSubtaskDocument,
  className,
  initialTab,
}: DeliverableDetailPanelProps) {
  const { addToast } = useToast()
  const approvalFeedback = useApprovalFeedback()
  const { paneSize } = useRightPane()
  const showExtras = paneSize !== 'small'
  const [activeTab, setActiveTab] = useState<Tab>(initialTab ?? 'details')

  const [status, setStatus] = useState<ActivityStatus>(activityStatus)
  const [deliverableDueDate, setDeliverableDueDate] = useState<string>(dueDate ?? '')
  const [savingDueDate, setSavingDueDate] = useState(false)
  const [description, setDescription] = useState('')
  const [savingDesc, setSavingDesc] = useState(false)
  const descTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [sharingOptions, setSharingOptions] = useState<SharingOptions>({
    ecAllowDownload: false,
    evAllowDownload: false,
    evPdfOnly: true,
    evAddWatermark: false,
  })
  // Register setter so the parent can push status updates (e.g. board drag) without remounting
  useEffect(() => {
    if (externalStatusRef) externalStatusRef.current = setStatus
    return () => { if (externalStatusRef) externalStatusRef.current = null }
  }, [externalStatusRef])

  const [subtasks, setSubtasks] = useState<SubtaskRecord[]>([])
  const subtasksLoadedRef = useRef(false)

  // Notify parent of progress changes after subtasks state settles — must be outside render.
  useEffect(() => {
    if (!subtasksLoadedRef.current) return
    onSubtaskStatusChange?.(subtasks.length, subtasks.filter((t) => t.status === 'approved').length)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtasks])

  const [expandedSubtaskId, setExpandedSubtaskId] = useState<string | null>(null)
  const [loadingSubtasks, setLoadingSubtasks] = useState(false)
  const [savingOptions, setSavingOptions] = useState(false)
  const [movingStatus, setMovingStatus] = useState(false)
  const [members, setMembers] = useState<EngagementMember[]>([])
  /** The deliverable's owner, shown as Lead (its assigneeUserId, like its documents'). */
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null)
  /** How many comments the deliverable has, for the Comments tab. */
  const [commentCount, setCommentCount] = useState<number | null>(null)


  const loadDetails = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      setLoadingSubtasks(true)

      // Determine which documents this persona can see based on sharing rows.
      // EC sees files shared at in_progress+; EV sees files shared at in_review+.
      // Internal users (EL/admin) always see all files.
      const persona = isExternalViewer ? 'ev' : isExternalCollaborator ? 'ec' : 'all'

      const [sharingRes, subRes, membersRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/documents/${documentId}/sharing`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
        fetch(`/api/projects/${projectId}/documents/${documentId}/subtasks?persona=${persona}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
        fetch(`/api/projects/${projectId}/members`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
      ])

      if (sharingRes.ok) {
        const data = await sharingRes.json()
        const s = data.sharing?.settings?.share ?? {}
        setSharingOptions({
          ecAllowDownload: s.externalCollaborator?.options?.allowDownload ?? false,
          evAllowDownload: s.guest?.options?.allowDownload ?? false,
          evPdfOnly: s.guest?.options?.sharePdfOnly ?? true,
          evAddWatermark: s.guest?.options?.addWatermark ?? false,
        })
        setDescription((data.sharing?.settings as Record<string, unknown>)?.description as string ?? '')
      }

      if (subRes.ok) {
        const subData = await subRes.json()
        const loaded: SubtaskRecord[] = subData.subtasks ?? []
        setOwnerUserId(subData.deliverable?.ownerUserId ?? null)
        subtasksLoadedRef.current = true
        setSubtasks(loaded)
        // Auto-expand first item in large pane
        if (paneSize === 'large' && loaded.length > 0) {
          setExpandedSubtaskId(loaded[0].id)
        }
      }

      if (membersRes.ok) {
        const membersData = await membersRes.json()
        setMembers(membersData.members ?? [])
      }
    } catch {
      // non-critical
    } finally {
      setLoadingSubtasks(false)
    }
  }, [documentId, projectId, isExternalViewer, isExternalCollaborator])

  useEffect(() => { loadDetails() }, [loadDetails])

  // The Comments tab's count. Refreshed when leaving the tab, so a comment just posted counts.
  useEffect(() => {
    if (activeTab === 'comments') return
    let cancelled = false
    fetch(`/api/projects/${projectId}/documents/${documentId}/doc-comments`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setCommentCount((d.messages ?? []).length) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [projectId, documentId, activeTab])

  const changeOwner = useCallback(async (next: PersonOption | null) => {
    const previous = ownerUserId
    setOwnerUserId(next?.id ?? null)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    const res = await fetch(`/api/projects/${projectId}/documents/${documentId}/assignee`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigneeUserId: next?.id ?? null }),
    }).catch(() => null)
    if (!res?.ok) setOwnerUserId(previous)
  }, [ownerUserId, projectId, documentId])

  // Auto-save delivery settings on toggle change
  const saveOptions = useCallback(async (opts: SharingOptions) => {
    setSavingOptions(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      await fetch(`/api/projects/${projectId}/documents/${documentId}/sharing`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ecOptions: { allowDownload: opts.ecAllowDownload },
          guestOptions: {
            allowDownload: opts.evAllowDownload,
            sharePdfOnly: opts.evPdfOnly,
            addWatermark: opts.evAddWatermark,
          },
        }),
      })
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to save delivery settings.' })
    } finally {
      setSavingOptions(false)
    }
  }, [projectId, documentId, addToast])

  const handleToggle = (key: keyof SharingOptions, value: boolean) => {
    const next = { ...sharingOptions, [key]: value }
    setSharingOptions(next)
    saveOptions(next)
  }

  const handleDueDateChange = async (val: string, targetDocumentId: string, onUpdate?: (iso: string | null) => void) => {
    setSavingDueDate(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      await fetch(`/api/projects/${projectId}/documents/${targetDocumentId}/due-date`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dueDate: val || null }),
      })
      onUpdate?.(val || null)
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to save due date.' })
    } finally {
      setSavingDueDate(false)
    }
  }

  const handleDescChange = (val: string) => {
    setDescription(val)
    if (descTimerRef.current) clearTimeout(descTimerRef.current)
    descTimerRef.current = setTimeout(async () => {
      setSavingDesc(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return
        await fetch(`/api/projects/${projectId}/documents/${documentId}/sharing`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: val }),
        })
      } catch {
        addToast({ type: 'error', title: 'Error', message: 'Failed to save description.' })
      } finally {
        setSavingDesc(false)
      }
    }, 800)
  }

  const handleMoveToNext = async (next: ActivityStatus) => {
    if (next === status) return
    if (next === 'approved' && subtasks.length > 0) {
      const unapproved = subtasks.filter((s) => s.status !== 'approved').length
      if (unapproved > 0) {
        addToast({
          type: 'error',
          title: 'Cannot approve yet',
          message: `${unapproved} document${unapproved > 1 ? 's' : ''} still need to be approved before this deliverable can be approved.`,
          duration: 5000,
        } as any)
        return
      }
    }
    setMovingStatus(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const res = await fetch(`/api/projects/${projectId}/documents/${documentId}/sharing/activity`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        addToast({ type: 'error', title: 'Failed to update stage', message: err.error ?? 'Please try again.' })
        return
      }
      setStatus(next)
      onStatusChange?.(next)
      // Approval gets its own feedback: "Approved · {name}" and the pill fading in green.
      if (next === 'approved') approvalFeedback.confirm({ id: documentId, name: fileName })
      else addToast({ type: 'success', title: 'Stage updated', message: `Moved to ${STAGE_LABELS[next]}.` })
    } finally {
      setMovingStatus(false)
    }
  }

  const isApproved = status === 'approved'
  const overdueDays = (() => {
    if (!deliverableDueDate) return 0
    const due = new Date(deliverableDueDate); due.setHours(0, 0, 0, 0)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return Math.max(0, Math.round((today.getTime() - due.getTime()) / 86400000))
  })()
  const approvedSubtasks = subtasks.filter((t) => t.status === 'approved').length
  const peopleOptions: PersonOption[] = members
    .filter((m) => !m.isAgent && (m.role === 'eng_admin' || m.role === 'eng_member'))
    .map((m) => ({ id: m.userId, name: m.name ?? m.email ?? 'Member', email: m.email, avatarUrl: m.avatarUrl }))
  const ownerOption = (() => {
    if (!ownerUserId) return null
    const m = members.find((x) => x.userId === ownerUserId)
    return m ? { id: m.userId, name: m.name ?? m.email ?? 'Member', email: m.email, avatarUrl: m.avatarUrl } : null
  })()
  const showEC = true
  const showEV = true

  // Derive allowed transitions from the role — same rules used by the API route.
  const allowedTransitions = roleSlug ? getAllowedTransitions(roleSlug, status) : []

  const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'details', label: 'Details', icon: Info },
    { id: 'comments', label: 'Comments', icon: MessagesSquare },
      ...(canManage ? [{ id: 'delivery' as Tab, label: 'Settings', icon: SettingsIcon }] : []),
  ]

  return (
    <div className={cn('flex flex-col h-full overflow-hidden bg-surface', className)}>

      {/* Properties (Linear issue peek): status and due date as label → value rows */}
      <div className="shrink-0 px-4 py-2">
       <PropertyList>
        <PropertyRow label="Status" icon={<CircleDot />}>
        {canManage && status !== 'approved' ? (
          <Select value={status} onValueChange={(v) => handleMoveToNext(v as ActivityStatus)} disabled={movingStatus}>
            {/* The pill is the control: no separate chevron after it (hover shows it is one). */}
            <SelectTrigger aria-label="Deliverable status" className="h-7 w-auto gap-1.5 border-transparent bg-transparent px-1.5 shadow-none hover:bg-surface-hover focus:ring-0 data-[state=open]:bg-surface-hover [&>svg:last-of-type]:hidden">
              {/* In a div: SelectTrigger clamps its direct <span> children (`[&>span]:line-clamp-1`),
                  which breaks the pill's flex row — label pushed up, status dot gone. */}
              <div className="flex items-center">
                <StatusPill kind="deliverable" status={status} />
              </div>
              {movingStatus && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-fg-subtle" />}
            </SelectTrigger>
            <SelectContent className="min-w-[200px]">
              {(['to_do', 'in_progress', 'in_review', 'approved'] as ActivityStatus[]).map((s, i) => {
                const currentIdx = ['to_do', 'in_progress', 'in_review', 'approved'].indexOf(status)
                const unapprovedCount = subtasks.filter((t) => t.status !== 'approved').length
                const approvalBlocked = s === 'approved' && subtasks.length > 0 && unapprovedCount > 0
                const isDisabled = Math.abs(i - currentIdx) > 1 || approvalBlocked
                return (
                  <SelectItem
                    key={s}
                    value={s}
                    disabled={isDisabled}
                    endAdornment={approvalBlocked ? (
                      <span className="whitespace-nowrap text-caption text-fg-subtle">
                        {unapprovedCount} of {subtasks.length} pending
                      </span>
                    ) : undefined}
                  >
                    <span className={cn('flex items-center', isDisabled && !approvalBlocked && 'opacity-40')}>
                      <StatusPill kind="deliverable" status={s} />
                    </span>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        ) : (
          <>
            <span className="inline-flex h-7 items-center px-1.5">
              <StatusPill kind="deliverable" status={status} className={cn(approvalFeedback.isFresh(documentId) && FRESH_CHIP_CLASS)} />
            </span>
            {/* Single-option action button for restricted roles (EC, EV, EM) */}
            {allowedTransitions.length === 1 && (() => {
              const target = allowedTransitions[0]
              const isForward = ['to_do', 'in_progress', 'in_review', 'approved'].indexOf(target) >
                                ['to_do', 'in_progress', 'in_review', 'approved'].indexOf(status)
              const label = isForward ? 'Submit for review' : 'Request changes'
              return (
                <Button
                  type="button"
                  size="sm"
                  variant={isForward ? 'default' : 'outline'}
                  onClick={() => handleMoveToNext(target)}
                  disabled={movingStatus}
                  className="ml-1"
                >
                  {movingStatus && <Loader2 className="h-3 w-3 shrink-0 animate-spin" />}
                  {label}
                </Button>
              )
            })()}
          </>
        )}
          {savingOptions && <Loader2 className="ml-1 h-3 w-3 animate-spin text-fg-subtle" />}
        </PropertyRow>
        <PropertyRow label="Due" icon={<CalendarClock />}>
          {/* The route stores a date, not a time — so a date picker, not the date-time one. */}
          <DateProperty
            value={deliverableDueDate || null}
            placeholder="Empty"
            disabled={isApproved}
            highlightOverdue={!isApproved}
            onChange={async (day) => {
              setDeliverableDueDate(day ?? '')
              await handleDueDateChange(day ?? '', documentId)
            }}
          />
          {/* Why the date is red: how late it is. */}
          {!isApproved && overdueDays > 0 && (
            <span className="text-small text-danger">· {overdueDays} day{overdueDays === 1 ? '' : 's'} overdue</span>
          )}
          {savingDueDate && <Loader2 className="h-3 w-3 animate-spin text-fg-subtle" />}
        </PropertyRow>
        <PropertyRow label="Lead" icon={<UserRound />}>
          <PersonProperty
            value={ownerOption}
            people={peopleOptions}
            onChange={changeOwner}
            disabled={!canManage}
            placeholder="No lead"
          />
        </PropertyRow>
        <PropertyRow label="Progress" icon={<ListChecks />}>
          {subtasks.length > 0 ? (
            <span className="inline-flex h-7 items-center gap-2 px-1.5">
              <span className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-muted">
                <span className={cn('block h-full rounded-full', STAGE_BAR_CLASSES[laneStageOf(status)])} style={{ width: `${Math.round((approvedSubtasks / subtasks.length) * 100)}%` }} />
              </span>
              <span className="text-small tabular-nums text-fg-muted">{approvedSubtasks} of {subtasks.length} documents approved</span>
            </span>
          ) : (
            <span className="inline-flex h-7 items-center px-1.5 text-small text-fg-subtle">{loadingSubtasks ? 'Loading…' : 'No documents yet'}</span>
          )}
        </PropertyRow>
       </PropertyList>
      </div>

      {/* Tab bar */}
      <div className="flex shrink-0 gap-4 border-b border-line px-4">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              '-mb-px inline-flex h-9 items-center gap-1.5 border-b-2 text-small transition-colors',
              activeTab === tab.id
                ? 'border-fg text-fg'
                : 'border-transparent text-fg-muted hover:text-fg'
            )}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
            {tab.id === 'comments' && commentCount ? <span className="tabular-nums text-fg-subtle">{commentCount}</span> : null}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto">

        {/* ── DETAILS TAB ── */}
        {activeTab === 'details' && (
          <div className="divide-y divide-line">

            {/* Description — editable for EL, read-only for others (hidden when empty for non-EL) */}
            {(canManage || description) && (
              <div className="px-4 py-4">
                <label className={cn(FIELD_LABEL, 'flex items-center gap-1.5')}>
                  Description
                  {savingDesc && <Loader2 className="h-2.5 w-2.5 animate-spin text-fg-subtle" />}
                </label>
                {canManage ? (
                  <Textarea
                    value={description}
                    onChange={(e) => handleDescChange(e.target.value)}
                    placeholder="Add a description…"
                    disabled={isApproved}
                    className="-mx-2 min-h-[72px] w-[calc(100%+1rem)] resize-none border-transparent bg-transparent px-2 py-1.5 text-ui shadow-none hover:bg-surface-hover focus-visible:bg-surface disabled:hover:bg-transparent"
                  />
                ) : (
                  <p className="whitespace-pre-wrap text-ui leading-relaxed text-fg">{description}</p>
                )}
              </div>
            )}

            {/* Files / Subtasks */}
            <div className="px-4 py-4">
              {(() => {
                const approvedCount = subtasks.filter((s) => s.status === 'approved').length
                const total = subtasks.length
                const pct = total > 0 ? Math.round((approvedCount / total) * 100) : 0
                return (
                  <div className="flex items-center gap-3 mb-3">
                    <label className={cn(FIELD_LABEL, 'mb-0 shrink-0')}>
                      Documents{total > 0 ? ` · ${total}` : ''}
                    </label>
                    {total > 0 && (
                      <>
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-muted">
                          <div
                            className={cn('h-full rounded-full transition-all duration-ui-slow ease-ui-out', STAGE_BAR_CLASSES[laneStageOf(status)])}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-caption tabular-nums text-fg-subtle">
                          {approvedCount}/{total}
                        </span>
                      </>
                    )}
                  </div>
                )
              })()}
              {loadingSubtasks ? (
                <div className="flex items-center gap-1.5 py-2 text-small text-fg-subtle">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                </div>
              ) : subtasks.length === 0 ? (
                <p className="py-1 text-small text-fg-subtle">No files in this deliverable yet.</p>
              ) : (
                <div className="-mx-4 mt-1 divide-y divide-line border-y border-line">
                  {subtasks.map((s) => (
                    <SubtaskRow
                      key={s.id}
                      subtask={s}
                      projectId={projectId}
                      disabled={isApproved}
                      deeplinkBase={deeplinkBase}
                      showExtras={showExtras}
                      isMedium={paneSize === 'medium'}
                      isExpanded={expandedSubtaskId === s.id}
                      onToggleExpand={() => setExpandedSubtaskId((prev) => prev === s.id ? null : s.id)}
                      isDeliverableApproved={isApproved}
                      members={members}
                      onOpenDocument={onOpenSubtaskDocument}
                      onPreviewDocument={onPreviewSubtaskDocument}
                      onStatusChange={(id, newStatus) => setSubtasks((prev) => prev.map((t) => t.id === id ? { ...t, status: newStatus } : t))}
                      onRemoveSubtask={(id) => setSubtasks((prev) => prev.filter((t) => t.id !== id))}
                      onAssigneeChange={(id, userId, name, email, avatarUrl) =>
                        setSubtasks((prev) => prev.map((t) => t.id === id ? { ...t, assigneeUserId: userId, assigneeName: name, assigneeEmail: email, assigneeAvatarUrl: avatarUrl } : t))
                      }
                    />
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ── DELIVERY SETTINGS TAB ── */}
        {activeTab === 'delivery' && canManage && (
          <div className="divide-y divide-line">

            <div className="px-4 py-3">
              <p className="text-small text-fg-muted">
                These settings apply to individual office-format files shared within this deliverable — Documents, Spreadsheets, Presentations, and Images.
              </p>
            </div>

            {showEC && (
              <div className="px-4 py-4">
                <label className={FIELD_LABEL}>External contributors</label>
                <ToggleRow
                  label="Allow download"
                  checked={sharingOptions.ecAllowDownload}
                  onCheckedChange={(v) => handleToggle('ecAllowDownload', v)}
                  disabled={isApproved}
                />
              </div>
            )}

            {showEV && (
              <div className="px-4 py-4">
                <label className={FIELD_LABEL}>Reviewers</label>
                <ToggleRow
                  label="Allow download"
                  checked={sharingOptions.evAllowDownload}
                  onCheckedChange={(v) => handleToggle('evAllowDownload', v)}
                  disabled={isApproved}
                />
                <ToggleRow
                  label="PDF only"
                  checked={sharingOptions.evPdfOnly}
                  onCheckedChange={(v) => handleToggle('evPdfOnly', v)}
                  disabled={isApproved}
                />
                {sharingOptions.evPdfOnly && (
                  <ToggleRow
                    label="Apply watermark"
                    checked={sharingOptions.evAddWatermark}
                    onCheckedChange={(v) => handleToggle('evAddWatermark', v)}
                    disabled={isApproved}
                    indent
                  />
                )}
              </div>
            )}


          </div>
        )}

        {/* ── COMMENTS TAB ── */}
        {activeTab === 'comments' && (
          <DocumentDocCommentsPane
            engagementId={projectId}
            documentId={documentId}
            documentName={fileName}
            orgSlug={orgSlug}
          />
        )}

      </div>
    </div>
  )
}
