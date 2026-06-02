'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarClock, Copy, Check, Loader2, Square, SquareCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { DocumentIcon } from '@/components/ui/document-icon'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/** Formal display names from platform.personas seed data */
const ROLE_DISPLAY: Record<string, string> = {
  eng_admin: 'Engagement Lead',
  eng_member: 'Contributor (Internal)',
  eng_ext_collaborator: 'Contributor (External)',
  eng_viewer: 'Viewer (External)',
  firm_admin: 'Firm Administrator',
  firm_member: 'Firm Member',
}

export type ReminderMember = {
  userId: string
  email: string
  name: string
  role: string
  avatarUrl?: string | null
}

export type ExistingReminder = {
  reminderId: string
  dateValue: string | null
}

interface SetupReminderModalProps {
  /** Whether to render the modal */
  open: boolean
  onClose: () => void

  /** The entity being reminded about (shown as a doc icon + name, or a text preview) */
  entityName?: string
  entityMimeType?: string
  /** Short preview text shown below the entity name (e.g. comment content) */
  contentPreview?: string

  /** The current logged-in user — shown as the first row as "Remind Me" */
  currentUser?: { userId: string; name?: string | null; email?: string | null; avatarUrl?: string | null; role?: string | null }

  /** Other selectable members (caller should NOT include currentUser here) */
  members: ReminderMember[]

  /** Members that already have a reminder set: userId → { reminderId, dateValue } */
  existingReminders?: Map<string, ExistingReminder>

  /** Multi-select (default) or single-select */
  multiSelect?: boolean

  /** Called when the user confirms. Receives selected userIds, deselected userIds (had existing), and the chosen date. */
  onSubmit: (params: {
    selected: string[]
    deselected: string[]
    dateValue: string | null
  }) => Promise<void>

  /** Hint text below the date picker */
  hint?: string
}

const TOOLTIP_CLASS = 'z-[999999] max-w-[220px] p-3 text-xs bg-white text-slate-900 border border-slate-200 shadow-xl break-words'

/** Circular avatar with photo or initials fallback */
function MemberAvatar({ name, avatarUrl, selected }: { name: string; avatarUrl?: string | null; selected: boolean }) {
  const [imgError, setImgError] = useState(false)
  const initials = name.replace('@', '').split(/[\s._-]/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase() || '?'
  return (
    <div className="shrink-0 h-8 w-8 rounded-full overflow-hidden flex items-center justify-center text-[11px] font-semibold border border-slate-200">
      {avatarUrl && !imgError ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" onError={() => setImgError(true)} />
      ) : (
        <div className={cn('h-full w-full flex items-center justify-center', selected ? 'bg-primary/20 text-primary' : 'bg-slate-100 text-slate-600')}>
          {initials}
        </div>
      )}
    </div>
  )
}

/** Email display with copy-to-clipboard icon */
function EmailRow({ email }: { email: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <span className="flex items-center gap-1 text-[11px] text-slate-400 min-w-0">
      <span className="truncate">{email}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(email); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
        className="shrink-0 p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
      >
        {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
      </button>
    </span>
  )
}

export function SetupReminderModal({
  open,
  onClose,
  entityName,
  entityMimeType,
  contentPreview,
  currentUser,
  members,
  existingReminders = new Map(),
  multiSelect = true,
  onSubmit,
  hint,
}: SetupReminderModalProps) {
  const [mounted, setMounted] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [dateValue, setDateValue] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  // Pre-populate when modal opens
  useEffect(() => {
    if (!open) return
    setSelectedIds(new Set(existingReminders.keys()))
    const firstDate = Array.from(existingReminders.values())[0]?.dateValue
    setDateValue(firstDate ?? new Date().toISOString())
    setSuccess(false)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMember = (userId: string) => {
    if (multiSelect) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.has(userId) ? next.delete(userId) : next.add(userId)
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        // Toggle off if already selected; otherwise select exclusively
        if (next.has(userId)) {
          next.delete(userId)
        } else {
          next.clear()
          next.add(userId)
          // Pre-fill date from existing if available
          const existing = existingReminders.get(userId)
          if (existing?.dateValue) setDateValue(existing.dateValue)
        }
        return next
      })
    }
  }

  const handleClose = () => {
    setSelectedIds(new Set())
    setDateValue('')
    setSuccess(false)
    onClose()
  }

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const deselected = Array.from(existingReminders.keys()).filter((id) => !selectedIds.has(id))
      await onSubmit({
        selected: Array.from(selectedIds),
        deselected,
        dateValue: dateValue || null,
      })
      setSuccess(true)
      await new Promise((r) => setTimeout(r, 1200))
      handleClose()
    } finally {
      setSubmitting(false)
    }
  }

  const hasChanges =
    selectedIds.size > 0 ||
    Array.from(existingReminders.keys()).some((id) => !selectedIds.has(id))

  if (!open || !mounted || typeof window === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40"
      onClick={handleClose}
      onKeyDown={(e) => { if (e.key === 'Escape') handleClose() }}
      tabIndex={-1}
    >
      <div
        className="bg-white rounded-[2px] shadow-2xl border border-slate-200 w-full max-w-sm mx-4 p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 shrink-0" style={{ color: '#C4572B' }} />
          <h2 className="text-sm font-semibold text-slate-900">Setup Reminder</h2>
        </div>

        {/* Entity name */}
        {entityName && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 min-w-0">
                  <DocumentIcon mimeType={entityMimeType} className="h-4 w-4 shrink-0" />
                  <span className="truncate text-xs font-medium text-slate-700">{entityName}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className={TOOLTIP_CLASS}>{entityName}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Content preview (e.g. comment text) */}
        {contentPreview && (
          <p className="text-xs text-slate-500 bg-slate-50 rounded-[2px] border border-slate-100 px-3 py-2 leading-relaxed break-words">
            {contentPreview.length > 80 ? contentPreview.slice(0, 80) + '…' : contentPreview}
          </p>
        )}

        {success ? (
          <div className="flex items-center gap-2 bg-primary/10 text-primary text-sm font-medium px-3 py-2 rounded-[2px]">
            <CalendarClock className="h-4 w-4 shrink-0" />
            Reminder set
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-700">
                {multiSelect ? 'Assignees' : 'Assignee'}
              </label>

              {!currentUser && members.length === 0 ? (
                <p className="text-xs text-slate-400">No members to assign to.</p>
              ) : (
                <div className="flex flex-col gap-1 overflow-y-auto border border-slate-200 rounded-[2px] p-1" style={{ maxHeight: '180px' }}>
                  {/* "Remind Me" row — always first if currentUser provided */}
                  {currentUser && (() => {
                    const selected = selectedIds.has(currentUser.userId)
                    const wasExisting = existingReminders.has(currentUser.userId)
                    const willRemove = wasExisting && !selected
                    const initials = (currentUser.name || currentUser.email || '?').slice(0, 2).toUpperCase()
                    return (
                      <button
                        key={currentUser.userId}
                        type="button"
                        onClick={() => toggleMember(currentUser.userId)}
                        className={cn(
                          'flex items-center gap-2.5 px-2.5 py-2 rounded-[2px] text-left transition-colors w-full',
                          willRemove
                            ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-200 line-through opacity-60'
                            : selected
                              ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                              : 'hover:bg-slate-50 text-slate-800'
                        )}
                      >
                        <MemberAvatar name={currentUser.name || currentUser.email || 'Me'} avatarUrl={currentUser.avatarUrl} selected={selected} />

                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-sm font-semibold truncate">Me</span>
                          {currentUser.email && <EmailRow email={currentUser.email} />}
                          {currentUser.role && <span className="text-[11px] text-slate-400 truncate">{ROLE_DISPLAY[currentUser.role] ?? currentUser.role}</span>}
                        </div>

                        <div className="shrink-0 flex items-center gap-1">
                          {wasExisting && !willRemove && <CalendarClock className="h-3 w-3 text-primary opacity-60" />}
                          {selected ? <SquareCheck className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-slate-300" />}
                        </div>
                      </button>
                    )
                  })()}

                  {/* Divider between self and others */}
                  {currentUser && members.length > 0 && (
                    <div className="border-t border-slate-100 my-0.5" />
                  )}

                  {members.map((m) => {
                    const selected = selectedIds.has(m.userId)
                    const wasExisting = existingReminders.has(m.userId)
                    const willRemove = wasExisting && !selected
                    const roleLabel = m.role ? (ROLE_DISPLAY[m.role] ?? m.role) : undefined
                    return (
                      <button
                        key={m.userId}
                        type="button"
                        onClick={() => toggleMember(m.userId)}
                        className={cn(
                          'flex items-center gap-2.5 px-2.5 py-2 rounded-[2px] text-left transition-colors w-full',
                          willRemove
                            ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-200 line-through opacity-60'
                            : selected
                              ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                              : 'hover:bg-slate-50 text-slate-800'
                        )}
                      >
                        <MemberAvatar name={m.name || m.email || '?'} avatarUrl={m.avatarUrl} selected={selected} />

                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-sm font-medium truncate">{m.name || m.email}</span>
                          {m.email && <EmailRow email={m.email} />}
                          {roleLabel && <span className="text-[11px] text-slate-400 truncate">{roleLabel}</span>}
                        </div>

                        <div className="shrink-0 flex items-center gap-1">
                          {wasExisting && !willRemove && <CalendarClock className="h-3 w-3 text-primary opacity-60" />}
                          {selected ? <SquareCheck className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-slate-300" />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              <div className="flex flex-col gap-1 mt-1">
                <label className="text-xs font-medium text-slate-700">Remind on</label>
                <DateTimePicker
                  value={dateValue}
                  onChange={setDateValue}
                  placeholder="Today"
                  defaultTime="09:00"
                  allowFutureDateTimes={true}
                />
              </div>

              {hint && (
                <p className="text-[11px] text-slate-400 leading-relaxed">{hint}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" className="rounded-[2px]" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                variant="blackCta"
                size="sm"
                className="rounded-[2px]"
                disabled={submitting || !hasChanges || members.length === 0}
                onClick={() => void handleSubmit()}
              >
                {submitting
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  : <CalendarClock className="h-3.5 w-3.5 mr-1" />}
                Setup
              </Button>
            </div>
          </>
        )}
      </div>
    </div>,
    window.document.body
  )
}
