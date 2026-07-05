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
  CheckCircle, PenLine, Eye, ListTodo, Loader2,
  ExternalLink, Folder, MoreVertical,
  Info, MessagesSquare, Settings as SettingsIcon,
  UserPlus, ChevronDown, X,
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
  onClose?: () => void
  className?: string
}

type Tab = 'details' | 'delivery' | 'comments'

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<ActivityStatus, string> = {
  to_do: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  approved: 'Approved',
}

const STAGE_ICON: Record<ActivityStatus, React.ReactNode> = {
  to_do: <ListTodo className="h-3.5 w-3.5" />,
  in_progress: <PenLine className="h-3.5 w-3.5" />,
  in_review: <Eye className="h-3.5 w-3.5" />,
  approved: <CheckCircle className="h-3.5 w-3.5" />,
}

const STAGE_COLOR: Record<ActivityStatus, string> = {
  to_do: 'bg-[#f3f4f6] text-[#45474c]',
  in_progress: 'bg-[#eff2ff] text-[#5A78FF]',
  in_review: 'bg-[#fff7ed] text-[#c2410c]',
  approved: 'bg-primary/10 text-primary',
}


const FIELD_LABEL = 'font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c] block mb-1.5'

const STAGE_ICON_SMALL: Record<ActivityStatus, React.ReactNode> = {
  to_do: <ListTodo className="h-3 w-3" />,
  in_progress: <PenLine className="h-3 w-3" />,
  in_review: <Eye className="h-3 w-3" />,
  approved: <CheckCircle className="h-3 w-3" />,
}

// ─── Subtask Row ─────────────────────────────────────────────────────────────

function SubtaskRow({
  subtask,
  projectId,
  onStatusChange,
  onRemoveSubtask,
  onAssigneeChange,
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
    onStatusChange(subtask.id, s)
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      await fetch(`/api/projects/${projectId}/documents/${subtask.documentId}/sharing/activity`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ status: s }),
      })
    } finally {
      setSaving(false)
    }
  }, [subtask.id, subtask.documentId, projectId, onStatusChange])

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

  // Shape a document object compatible with DocumentActionMenu
  const docForMenu = {
    id: subtask.documentId,
    projectDocumentId: subtask.documentId,
    name: subtask.fileName,
    mimeType: subtask.mimeType ?? 'application/octet-stream',
    webViewLink: fileUrl ?? '',
    webContentLink: fileUrl ?? '',
  }

  return (
    <div className="group py-2 px-3 rounded hover:bg-[#f9f9fb] transition-colors">
      <div className="flex items-center gap-2.5">
        <DocumentIcon mimeType={subtask.mimeType ?? undefined} className="h-3.5 w-3.5 shrink-0" size={14} />
        {subtask.docId && (
          <span className="font-mono text-xs font-bold text-[#45474c] shrink-0">{subtask.docId}</span>
        )}
        {showExtras && (
          <span className="flex-1 min-w-0 truncate text-xs text-[#1b1b1d]">{subtask.fileName}</span>
        )}
        {!showExtras && <span className="flex-1 min-w-0" />}
        {/* Expand toggle — available in both medium and large */}
        {showExtras && (
          <button
            type="button"
            onClick={onToggleExpand}
            className="shrink-0 text-[#9a9ba0] hover:text-[#45474c] transition-colors p-0.5"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            <ChevronDown className={cn('h-3 w-3 transition-transform duration-300 ease-in-out', expanded && 'rotate-180')} />
          </button>
        )}
        <div className="shrink-0">
          <DocumentActionMenu
            document={docForMenu}
            projectId={projectId}
            deeplinkBase={deeplinkBase}
            triggerIcon={<MoreVertical className="h-3.5 w-3.5" />}
            isEngagementLead={true}
            canManage={false}
            showShareModal={false}
            onDeleteDocument={(!isDeliverableApproved && onRemoveSubtask) ? () => void handleTrash() : undefined}
          />
        </div>
      </div>

      {showExtras && (
        <div className={cn('grid transition-[grid-template-rows] duration-300 ease-in-out', showDetails ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden">
        <>
          {/* Row 2 — breadcrumb */}
          <div className="flex items-center gap-1 mt-0.5 pl-6 min-w-0 overflow-hidden">
            {subtask.breadcrumb && subtask.breadcrumb.length > 0 && (
              <>
                <Folder className="h-2.5 w-2.5 shrink-0 stroke-slate-400 stroke-[1.5] fill-slate-200" aria-hidden />
                {subtask.breadcrumb.map((segment, i) => (
                  <span key={i} className="flex items-center gap-1 min-w-0">
                    {i > 0 && <span className="text-[#c8c9cc] text-xs shrink-0">/</span>}
                    <span className={cn('text-xs text-slate-500 shrink-0', i === subtask.breadcrumb!.length - 1 && 'truncate min-w-0')}>
                      {segment}
                    </span>
                  </span>
                ))}
              </>
            )}
            {fileUrl && (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href={fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary/50 hover:text-primary transition-colors ml-1"
                    >
                      <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">Open in Files</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          {/* Row 3 — Status · Assignee · Due Date (uniform w-40) */}
          <div className="flex items-end gap-2 mt-1.5 pl-6">
            {/* Status */}
            <div className="flex flex-col gap-1">
              <span className={FIELD_LABEL}>Status</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={saving || disabled}
                    className="w-40 flex items-center gap-1.5 h-9 px-2 rounded border border-[#e5e7eb] bg-white text-[10px] font-bold font-mono uppercase tracking-widest text-[#45474c] hover:bg-[#f9f9fb] transition-colors data-[state=open]:bg-[#f9f9fb] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className={cn('flex items-center justify-center h-4 w-4 rounded shrink-0', STAGE_COLOR[status])}>
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : STAGE_ICON_SMALL[status]}
                    </span>
                    <span className="flex-1 text-left">{STAGE_LABELS[status]}</span>
                    <ChevronDown className="h-2.5 w-2.5 shrink-0 ml-auto" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48 text-xs">
                  {(Object.keys(STAGE_LABELS) as ActivityStatus[]).map((s, i) => {
                    const currentIdx = (Object.keys(STAGE_LABELS) as ActivityStatus[]).indexOf(status)
                    const isDisabled = Math.abs(i - currentIdx) > 1
                    return (
                      <DropdownMenuItem
                        key={s}
                        onClick={() => !isDisabled && handleStatusChange(s)}
                        disabled={isDisabled}
                        className={cn(
                          'flex items-center gap-2 text-xs cursor-pointer',
                          s === status && 'bg-primary/5',
                          isDisabled && 'opacity-40 cursor-not-allowed',
                        )}
                      >
                        <span className={cn('flex items-center justify-center h-5 w-5 rounded shrink-0', STAGE_COLOR[s])}>
                          {STAGE_ICON_SMALL[s]}
                        </span>
                        <span className="flex-1">{STAGE_LABELS[s]}</span>
                        {s === status && <CheckCircle className="h-3 w-3 ml-auto shrink-0 text-primary" />}
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Assignee */}
            <div className="flex flex-col gap-1">
              <span className={FIELD_LABEL}>Assignee</span>
              <div className="flex items-center w-40 rounded border border-[#e5e7eb] bg-white overflow-hidden">
              <TooltipProvider delayDuration={400}>
                <Tooltip>
                  <DropdownMenu>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          disabled={isDeliverableApproved}
                          className={cn(
                            'flex-1 min-w-0 flex items-center gap-1.5 h-9 px-2 text-[10px] transition-colors bg-white text-[#45474c] hover:bg-[#f9f9fb]',
                            isDeliverableApproved && 'opacity-50 cursor-not-allowed'
                          )}
                        >
                          {savingAssignee ? (
                            <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                          ) : subtask.assigneeUserId ? (
                            <>
                              <span className="h-5 w-5 rounded bg-primary/20 text-primary flex items-center justify-center text-[8px] font-bold shrink-0">
                                {subtask.assigneeName
                                  ? subtask.assigneeName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
                                  : '?'}
                              </span>
                              <span className="font-bold font-mono uppercase tracking-widest truncate flex-1 text-left">{subtask.assigneeName?.split(' ')[0] ?? 'ASSIGNED'}</span>
                            </>
                          ) : (
                            <>
                              <UserPlus className="h-3 w-3 shrink-0" />
                              <span className="font-bold font-mono uppercase tracking-widest flex-1 text-left">Assign</span>
                              <ChevronDown className="h-2.5 w-2.5 shrink-0 ml-auto" />
                            </>
                          )}
                        </button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <DropdownMenuContent align="start" className="w-52 text-xs">
                      {members.map((m) => (
                        <DropdownMenuItem
                          key={m.userId}
                          onClick={() => handleAssigneeSelect(m)}
                          className={cn('flex items-center gap-2 text-xs cursor-pointer', m.userId === subtask.assigneeUserId && 'bg-primary/5')}
                        >
                          <TooltipProvider delayDuration={400}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="h-5 w-5 rounded bg-primary/10 text-primary flex items-center justify-center text-[9px] font-bold shrink-0">
                                  {(m.name ?? m.email ?? '?').slice(0, 2).toUpperCase()}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="text-xs">
                                {m.name ?? m.userId}
                                {m.email && <span className="block text-[10px] text-muted-foreground">{m.email}</span>}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <span className="truncate">{m.name ?? m.email ?? m.userId}</span>
                          {m.userId === subtask.assigneeUserId && <CheckCircle className="h-3 w-3 ml-auto shrink-0 text-primary" />}
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
                  className="shrink-0 h-9 px-1.5 text-[#9a9ba0] hover:text-[#45474c] hover:bg-[#f9f9fb] transition-colors border-l border-[#e5e7eb]"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>{/* end assignee border-div */}
            </div>{/* end assignee flex-col wrapper */}

            {/* Due Date */}
            <div className="flex flex-col gap-1">
              <span className={FIELD_LABEL}>Due Date</span>
              <div className="flex items-center gap-1">
                {savingSubtaskDue && <Loader2 className="h-2.5 w-2.5 animate-spin text-[#9a9ba0]" />}
                <div className="w-40">
                  <DateTimePicker
                    value={subtaskDueDate}
                    onChange={(iso) => handleSubtaskDueDateChange(iso)}
                    placeholder="SET DUE DATE"
                    disabled={isDeliverableApproved}
                  />
                </div>
              </div>
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
      <span className="text-xs text-[#45474c]">{label}</span>
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
  className,
}: DeliverableDetailPanelProps) {
  const { addToast } = useToast()
  const { paneSize } = useRightPane()
  const showExtras = paneSize !== 'small'
  const [activeTab, setActiveTab] = useState<Tab>('details')

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
  const [subtasks, setSubtasks] = useState<SubtaskRecord[]>([])
  const [expandedSubtaskId, setExpandedSubtaskId] = useState<string | null>(null)
  const [loadingSubtasks, setLoadingSubtasks] = useState(false)
  const [savingOptions, setSavingOptions] = useState(false)
  const [movingStatus, setMovingStatus] = useState(false)
  const [members, setMembers] = useState<EngagementMember[]>([])


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
      addToast({ type: 'success', title: 'Stage updated', message: `Moved to ${STAGE_LABELS[next]}.` })
    } finally {
      setMovingStatus(false)
    }
  }

  const isApproved = status === 'approved'
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
    <div className={cn('flex flex-col h-full overflow-hidden bg-white', className)}>

      {/* Stage badge row */}
      <div className="px-4 py-2.5 border-b border-[#e5e7eb] flex items-center gap-2">
        {canManage && status !== 'approved' ? (
          <Select value={status} onValueChange={(v) => handleMoveToNext(v as ActivityStatus)} disabled={movingStatus}>
            <SelectTrigger className="h-9 border border-[#e5e7eb] bg-white shadow-none px-2 py-0 text-[10px] font-bold font-mono uppercase tracking-widest w-40 gap-1.5 rounded text-[#45474c] flex flex-row items-center focus:ring-0 focus:ring-offset-0 data-[state=open]:bg-[#f9f9fb]">
              {movingStatus ? (
                <Loader2 className="h-3 w-3 animate-spin shrink-0" />
              ) : (
                <span className={cn('flex items-center justify-center h-4 w-4 rounded shrink-0', STAGE_COLOR[status])}>
                  {STAGE_ICON_SMALL[status]}
                </span>
              )}
              {STAGE_LABELS[status]}
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
                    className="text-xs"
                    disabled={isDisabled}
                    endAdornment={approvalBlocked ? (
                      <span className="text-[9px] font-medium text-[#9a9ba0] whitespace-nowrap">
                        {unapprovedCount} of {subtasks.length} pending
                      </span>
                    ) : undefined}
                  >
                    <span className={cn('flex items-center gap-1.5', isDisabled && !approvalBlocked && 'opacity-40')}>
                      <span className={cn('flex items-center justify-center h-5 w-5 rounded shrink-0', STAGE_COLOR[s])}>
                        {STAGE_ICON_SMALL[s]}
                      </span>
                      {STAGE_LABELS[s]}
                    </span>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5 h-9 px-2 rounded border border-[#e5e7eb] bg-white text-[10px] font-bold font-mono uppercase tracking-widest text-[#45474c]">
              <span className={cn('flex items-center justify-center h-4 w-4 rounded shrink-0', STAGE_COLOR[status])}>
                {STAGE_ICON_SMALL[status]}
              </span>
              {STAGE_LABELS[status]}
            </span>
            {/* Single-option action button for restricted roles (EC, EV, EM) */}
            {allowedTransitions.length === 1 && (() => {
              const target = allowedTransitions[0]
              const isForward = ['to_do', 'in_progress', 'in_review', 'approved'].indexOf(target) >
                                ['to_do', 'in_progress', 'in_review', 'approved'].indexOf(status)
              const label = isForward ? 'Submit for Review' : 'Request Changes'
              const cls = isForward
                ? 'border-[#a5b4fc] bg-[#eef2ff] text-[#3730a3] hover:bg-[#e0e7ff]'
                : 'border-[#fca5a5] bg-[#fff1f2] text-[#b91c1c] hover:bg-[#fee2e2]'
              return (
                <button
                  type="button"
                  onClick={() => handleMoveToNext(target)}
                  disabled={movingStatus}
                  className={cn('inline-flex items-center gap-1.5 h-7 px-2.5 rounded border text-[10px] font-bold font-mono uppercase tracking-widest disabled:opacity-50 transition-colors', cls)}
                >
                  {movingStatus && <Loader2 className="h-3 w-3 animate-spin shrink-0" />}
                  {label}
                </button>
              )
            })()}
          </>
        )}
        <div className="flex items-center gap-2">
          {savingDueDate && <Loader2 className="h-3 w-3 animate-spin text-[#9a9ba0]" />}
          <div className="w-40">
            <DateTimePicker
              value={deliverableDueDate}
              onChange={(iso) => {
                setDeliverableDueDate(iso)
                handleDueDateChange(iso ? iso.slice(0, 10) : '', documentId)
              }}
              placeholder="SET DUE DATE"
              disabled={isApproved}
            />
          </div>
        </div>
        {savingOptions && <Loader2 className="h-3 w-3 animate-spin text-[#9a9ba0]" />}
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-[#e5e7eb] shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'inline-flex items-center px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-all',
              activeTab === tab.id
                ? 'border-primary text-[#1b1b1d] font-bold opacity-100'
                : 'border-transparent text-[#45474c] opacity-60 hover:text-[#1b1b1d] hover:opacity-100'
            )}
          >
            <tab.icon className="w-3.5 h-3.5 mr-1.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto">

        {/* ── DETAILS TAB ── */}
        {activeTab === 'details' && (
          <div className="divide-y divide-[#e5e7eb]">

            {/* Description — editable for EL, read-only for others (hidden when empty for non-EL) */}
            {(canManage || description) && (
              <div className="px-4 py-4">
                <label className={cn(FIELD_LABEL, 'flex items-center gap-1.5')}>
                  Description
                  {savingDesc && <Loader2 className="h-2.5 w-2.5 animate-spin text-[#9a9ba0]" />}
                </label>
                {canManage ? (
                  <Textarea
                    value={description}
                    onChange={(e) => handleDescChange(e.target.value)}
                    placeholder="Add a description…"
                    disabled={isApproved}
                    className="text-xs min-h-[80px] resize-none border-[#e5e7eb] focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                ) : (
                  <p className="text-xs text-[#45474c] whitespace-pre-wrap leading-relaxed">{description}</p>
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
                        <div className="flex-1 h-1.5 rounded-full bg-[#e5e7eb] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-semibold text-[#9a9ba0] shrink-0 tabular-nums">
                          {approvedCount}/{total}
                        </span>
                      </>
                    )}
                  </div>
                )
              })()}
              {loadingSubtasks ? (
                <div className="flex items-center gap-1.5 text-xs text-[#9a9ba0] py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                </div>
              ) : subtasks.length === 0 ? (
                <p className="text-xs text-[#9a9ba0] py-1">No files in this deliverable yet</p>
              ) : (
                <div className="divide-y divide-[#e5e7eb] -mx-4 border-t border-b border-[#e5e7eb] mt-2">
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
          <div className="divide-y divide-[#e5e7eb]">

            <div className="px-4 py-3 bg-[#f9fafb]">
              <p className="text-[11px] text-[#9a9ba0] leading-relaxed">
                These settings apply to individual office-format files shared within this deliverable — Documents, Spreadsheets, Presentations, and Images.
              </p>
            </div>

            {showEC && (
              <div className="px-4 py-4">
                <label className={FIELD_LABEL}>Contributor (External)</label>
                <ToggleRow
                  label="Allow Download"
                  checked={sharingOptions.ecAllowDownload}
                  onCheckedChange={(v) => handleToggle('ecAllowDownload', v)}
                  disabled={isApproved}
                />
              </div>
            )}

            {showEV && (
              <div className="px-4 py-4">
                <label className={FIELD_LABEL}>Reviewer</label>
                <ToggleRow
                  label="Allow Download"
                  checked={sharingOptions.evAllowDownload}
                  onCheckedChange={(v) => handleToggle('evAllowDownload', v)}
                  disabled={isApproved}
                />
                <ToggleRow
                  label="PDF Only"
                  checked={sharingOptions.evPdfOnly}
                  onCheckedChange={(v) => handleToggle('evPdfOnly', v)}
                  disabled={isApproved}
                />
                {sharingOptions.evPdfOnly && (
                  <ToggleRow
                    label="Apply Watermark"
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
