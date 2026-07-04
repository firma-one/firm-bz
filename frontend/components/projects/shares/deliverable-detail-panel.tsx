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
  ExternalLink, Folder, MoreHorizontal,
} from 'lucide-react'
import { DocumentIcon } from '@/components/ui/document-icon'
import { DocumentActionMenu } from '@/components/ui/document-action-menu'
import type { ActivityStatus } from '@/lib/sharing-settings'

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
  status?: ActivityStatus | null
  breadcrumb?: string[]
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
  disabled = false,
  deeplinkBase,
  showExtras = false,
  isDeliverableApproved = false,
}: {
  subtask: SubtaskRecord
  projectId: string
  onStatusChange: (id: string, newStatus: ActivityStatus) => void
  onRemoveSubtask?: (id: string) => void
  disabled?: boolean
  deeplinkBase?: string
  showExtras?: boolean
  isDeliverableApproved?: boolean
}) {
  const [saving, setSaving] = useState(false)
  const status = (subtask.status ?? 'to_do') as ActivityStatus

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
        <span className="flex-1 min-w-0 truncate text-xs text-[#1b1b1d]">{subtask.fileName}</span>
        {subtask.docId && (
          <span className="font-mono text-[10px] text-[#9a9ba0] shrink-0">{subtask.docId}</span>
        )}
        <span className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <DocumentActionMenu
            document={docForMenu}
            projectId={projectId}
            deeplinkBase={deeplinkBase}
            triggerIcon={<MoreHorizontal className="h-3.5 w-3.5" />}
            isEngagementLead={true}
            canManage={false}
            showShareModal={false}
            onDeleteDocument={(!isDeliverableApproved && onRemoveSubtask) ? () => void handleTrash() : undefined}
          />
        </span>
        <Select value={status} onValueChange={handleStatusChange} disabled={saving || disabled}>
          <SelectTrigger
            className={cn(
              'h-6 border-0 shadow-none px-2 py-0 text-[10px] font-bold rounded-[2px] font-mono uppercase tracking-widest w-auto min-w-0 flex flex-row items-center gap-1.5',
              STAGE_COLOR[status],
            )}
          >
            {STAGE_ICON_SMALL[status]}
            {STAGE_LABELS[status]}
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(STAGE_LABELS) as ActivityStatus[]).map((s, i) => {
              const currentIdx = (Object.keys(STAGE_LABELS) as ActivityStatus[]).indexOf(status)
              const isDisabled = Math.abs(i - currentIdx) > 1
              return (
                <SelectItem key={s} value={s} className="text-xs" disabled={isDisabled}>
                  <span className={cn('flex items-center gap-1.5', isDisabled && 'opacity-40')}>
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
      </div>

      {showExtras && (
        <div className="flex items-center gap-3 mt-0.5 pl-6">
          {subtask.breadcrumb && subtask.breadcrumb.length > 0 && (
            <div className="flex items-center gap-1 min-w-0 overflow-hidden">
              <Folder className="h-2.5 w-2.5 shrink-0 stroke-slate-400 stroke-[1.5] fill-slate-200" aria-hidden />
              {subtask.breadcrumb.map((segment, i) => (
                <span key={i} className="flex items-center gap-1 min-w-0">
                  {i > 0 && <span className="text-[#c8c9cc] text-[10px] shrink-0">/</span>}
                  <span className={cn('text-[10px] text-slate-500 shrink-0', i === subtask.breadcrumb!.length - 1 && 'truncate min-w-0')}>
                    {segment}
                  </span>
                </span>
              ))}
            </div>
          )}
          {fileUrl && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary/50 hover:text-primary transition-colors"
                  >
                    <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                  </a>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Open in Files</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
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
  canManage,
  orgSlug,
  deeplinkBase,
  onStatusChange,
  className,
}: DeliverableDetailPanelProps) {
  const { addToast } = useToast()
  void useRightPane() // keep context subscription for future pane-aware features
  const showExtras = true // panel only opens at medium+ from the board
  const [activeTab, setActiveTab] = useState<Tab>('details')

  const [status, setStatus] = useState<ActivityStatus>(activityStatus)
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
  const [loadingSubtasks, setLoadingSubtasks] = useState(false)
  const [savingOptions, setSavingOptions] = useState(false)
  const [movingStatus, setMovingStatus] = useState(false)


  const loadDetails = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      setLoadingSubtasks(true)

      const [sharingRes, subRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/documents/${documentId}/sharing`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
        fetch(`/api/projects/${projectId}/documents/${documentId}/subtasks`, {
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
        setSubtasks(subData.subtasks ?? [])
      }
    } catch {
      // non-critical
    } finally {
      setLoadingSubtasks(false)
    }
  }, [documentId, projectId])

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
    } finally {
      setMovingStatus(false)
    }
  }

  const isApproved = status === 'approved'
  const showEC = true
  const showEV = true

  const TABS: { id: Tab; label: string }[] = [
    { id: 'details', label: 'Details' },
    { id: 'comments', label: 'Comments' },
      ...(canManage ? [{ id: 'delivery' as Tab, label: 'Settings' }] : []),
  ]

  return (
    <div className={cn('flex flex-col h-full overflow-hidden bg-white', className)}>

      {/* Stage badge row */}
      <div className="px-4 py-2.5 border-b border-[#e5e7eb] flex items-center gap-2">
        {docId && (
          <span className="font-mono text-[10px] font-semibold text-[#9a9ba0] bg-[#f3f4f6] px-1.5 py-0.5 rounded">
            {docId}
          </span>
        )}
        {canManage && status !== 'approved' ? (
          <Select value={status} onValueChange={(v) => handleMoveToNext(v as ActivityStatus)} disabled={movingStatus}>
            <SelectTrigger className={cn('h-6 border-0 shadow-none px-2 py-0 text-[11px] font-semibold w-auto gap-1.5 rounded', STAGE_COLOR[status])}>
              {movingStatus ? <Loader2 className="h-3 w-3 animate-spin" /> : STAGE_ICON[status]}
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
          <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full', STAGE_COLOR[status])}>
            {STAGE_ICON[status]}
            {STAGE_LABELS[status]}
          </span>
        )}
        {savingOptions && <Loader2 className="h-3 w-3 animate-spin text-[#9a9ba0] ml-auto" />}
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-[#e5e7eb] shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.id
                ? 'border-primary text-[#1b1b1d] font-semibold'
                : 'border-transparent text-[#9a9ba0] hover:text-[#45474c]'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto">

        {/* ── DETAILS TAB ── */}
        {activeTab === 'details' && (
          <div className="divide-y divide-[#e5e7eb]">

            {/* Description */}
            {canManage && (
              <div className="px-4 py-4">
                <label className={cn(FIELD_LABEL, 'flex items-center gap-1.5')}>
                  Description
                  {savingDesc && <Loader2 className="h-2.5 w-2.5 animate-spin text-[#9a9ba0]" />}
                </label>
                <Textarea
                  value={description}
                  onChange={(e) => handleDescChange(e.target.value)}
                  placeholder="Add a description…"
                  disabled={isApproved}
                  className="text-xs min-h-[80px] resize-none border-[#e5e7eb] focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                />
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
                            className="h-full rounded-full bg-green-500 transition-all duration-300"
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
                <div className="divide-y divide-[#e5e7eb] -mx-4 border-t border-[#e5e7eb] mt-2">
                  {subtasks.map((s) => (
                    <SubtaskRow
                      key={s.id}
                      subtask={s}
                      projectId={projectId}
                      disabled={isApproved}
                      deeplinkBase={deeplinkBase}
                      showExtras={showExtras}
                      isDeliverableApproved={isApproved}
                      onStatusChange={(id, newStatus) => setSubtasks((prev) => prev.map((t) => t.id === id ? { ...t, status: newStatus } : t))}
                      onRemoveSubtask={(id) => setSubtasks((prev) => prev.filter((t) => t.id !== id))}
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
