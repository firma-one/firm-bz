'use client'

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { CalendarClock, Eye, MessageCircle, Send, Loader2, Check, ChevronDown, Link2, SlidersHorizontal, Smile } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useRightPane } from '@/lib/right-pane-context'
import { useAuth } from '@/lib/auth-context'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { SandboxInfoBanner } from '@/components/ui/sandbox-info-banner'
import { useOrgSandbox } from '@/lib/use-org-sandbox'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { SetupReminderModal } from '@/components/ui/setup-reminder-modal'

export interface DocumentDocCommentsPaneProps {
  engagementId: string
  documentId: string
  documentName?: string
  documentMimeType?: string
  orgSlug?: string
}

type CommentMessage = {
  id: string
  createdAt: string
  authorUserId: string | null
  authorEmail?: string | null
  content: string
  reactions?: Record<string, { count: number; users: string[] }>
}

type ReactionKey = 'urgent' | 'looking' | 'done' | 'thumbs_up' | 'yes' | 'no' | 'ok' | 'plus_one' | 'celebrate'
const REACTIONS: { key: ReactionKey; label: string; emoji: string; chipClass: string }[] = [
  // Subtle pill styling (avoid heavy borders/fills; rely on soft tint + hover + focus ring)
  { key: 'urgent', label: 'Urgent', emoji: '⚠️', chipClass: 'bg-rose-50/70 text-rose-700 hover:bg-rose-100/80' },
  { key: 'looking', label: 'Looking', emoji: '👀', chipClass: 'bg-amber-50/70 text-amber-800 hover:bg-amber-100/80' },
  { key: 'done', label: 'Done', emoji: '✅', chipClass: 'bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100/80' },
  // Slack-style quick signals
  { key: 'yes', label: 'Yes', emoji: '🇾', chipClass: 'bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100/80' },
  { key: 'no', label: 'No', emoji: '🇳', chipClass: 'bg-rose-50/70 text-rose-700 hover:bg-rose-100/80' },
  { key: 'ok', label: 'OK', emoji: '🆗', chipClass: 'bg-slate-50/70 text-slate-700 hover:bg-slate-100/80' },
  { key: 'plus_one', label: '+1', emoji: '➕', chipClass: 'bg-indigo-50/70 text-indigo-800 hover:bg-indigo-100/80' },
  { key: 'thumbs_up', label: 'Thumbs up', emoji: '👍', chipClass: 'bg-sky-50/70 text-sky-800 hover:bg-sky-100/80' },
  { key: 'celebrate', label: 'Celebrate', emoji: '🎉', chipClass: 'bg-violet-50/70 text-violet-800 hover:bg-violet-100/80' },
]

const LIGHT_TOOLTIP_CLASS =
  'z-[9999] max-w-[320px] p-3 text-xs bg-white text-slate-900 border border-slate-200 shadow-xl break-words'

export function DocumentDocCommentsPane({ engagementId, documentId, documentName, documentMimeType, orgSlug }: DocumentDocCommentsPaneProps) {
  const rightPane = useRightPane()
  const { user } = useAuth()
  const firmSandbox = useOrgSandbox()
  const isSandboxFirm = Boolean(firmSandbox?.sandboxOnly)
  const myEmail = user?.email ?? ''
  const isExpanded = rightPane.isExpanded
  const [messages, setMessages] = useState<CommentMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newContent, setNewContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [firmMembers, setFirmMembers] = useState<{ userId: string; email: string; name: string; role: string; avatarUrl?: string | null }[]>([])
  const [reminderModal, setReminderModal] = useState<{ messageId: string; content: string } | null>(null)
  // Map of userId → { reminderId, dateValue } for already-set reminders on this comment
  const [existingReminders, setExistingReminders] = useState<Map<string, { reminderId: string; dateValue: string | null }>>(new Map())
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const topSentinelRef = useRef<HTMLDivElement>(null)
  const bottomSentinelRef = useRef<HTMLDivElement>(null)

  // Filters: multi-select dropdowns (Audit-style)
  const [statusKeysFilter, setStatusKeysFilter] = useState<ReactionKey[]>([])
  const [statusSearch, setStatusSearch] = useState('')
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)

  const [commentorEmailsFilter, setCommentorEmailsFilter] = useState<string[]>([])
  const [commentorSearch, setCommentorSearch] = useState('')
  const [commentorMenuOpen, setCommentorMenuOpen] = useState(false)

  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const toggleId = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id]

  const clearFilters = useCallback(() => {
    setStatusKeysFilter([])
    setCommentorEmailsFilter([])
    setFromDate('')
    setToDate('')
  }, [])

  const [filtersOpen, setFiltersOpen] = useState<boolean>(isExpanded)
  useEffect(() => {
    // Spec: collapsed by default in MIN; expanded by default in MAX
    setFiltersOpen(isExpanded)
  }, [isExpanded])

  const [viewControlsOpen, setViewControlsOpen] = useState<boolean>(isExpanded)
  useEffect(() => {
    // Match Filters behavior
    setViewControlsOpen(isExpanded)
  }, [isExpanded])

  // View: user preference (global, stored in localStorage)
  const COMMENTS_PREFS_KEY = 'fm_comments_view_prefs_v1'
  const [sortOrder, setSortOrder] = useState<'latestLast' | 'latestFirst'>('latestLast')
  const [hideOlderMessages, setHideOlderMessages] = useState(false)

  // Load persisted prefs once (global, not per-document)
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(COMMENTS_PREFS_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as { sortOrder?: 'latestLast' | 'latestFirst'; hideOlderMessages?: boolean }
      if (parsed.sortOrder === 'latestLast' || parsed.sortOrder === 'latestFirst') {
        setSortOrder(parsed.sortOrder)
      }
      if (typeof parsed.hideOlderMessages === 'boolean') {
        setHideOlderMessages(parsed.hideOlderMessages)
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist prefs whenever they change
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(
        COMMENTS_PREFS_KEY,
        JSON.stringify({ sortOrder, hideOlderMessages })
      )
    } catch {
      // ignore
    }
  }, [sortOrder, hideOlderMessages])

  // Fetch internal engagement members for reminder recipient dropdown
  useEffect(() => {
    fetch(`/api/projects/${engagementId}/members`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        const members: { userId: string; email: string; name: string; role: string }[] = (data?.members ?? [])
          .filter((m: any) => m.userId && m.email)
          .map((m: any) => ({ userId: m.userId, email: m.email, name: m.name ?? m.email.split('@')[0], role: m.role ?? '', avatarUrl: m.avatarUrl ?? null }))
        setFirmMembers(members)
      })
      .catch(() => {})
  }, [engagementId])

  const fetchMessages = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${engagementId}/documents/${documentId}/doc-comments`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to load comments')
      }
      const data = await res.json()
      setMessages(data.messages ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load comments')
    } finally {
      setLoading(false)
    }
  }, [engagementId, documentId])

  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])


  useEffect(() => {
    // Keyboard friendly: focus composer on open
    textareaRef.current?.focus()
  }, [engagementId, documentId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        rightPane.clearPane()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [rightPane])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSandboxFirm) return
    const content = newContent.trim()
    if (!content || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/projects/${engagementId}/documents/${documentId}/doc-comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to add comment')
      }
      const data = await res.json()
      setMessages((prev) => [...prev, data.message])
      setNewContent('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add comment')
    } finally {
      setSubmitting(false)
    }
  }

  const distinctCommentors = useMemo(() => {
    const set = new Set<string>()
    for (const m of messages) {
      if (m.authorEmail) set.add(m.authorEmail)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [messages])

  const filteredStatusOptions = useMemo(() => {
    const q = statusSearch.trim().toLowerCase()
    if (!q) return REACTIONS
    return REACTIONS.filter((r) => r.label.toLowerCase().includes(q))
  }, [statusSearch])

  const filteredCommentors = useMemo(() => {
    const q = commentorSearch.trim().toLowerCase()
    if (!q) return distinctCommentors
    return distinctCommentors.filter((e) => e.toLowerCase().includes(q))
  }, [distinctCommentors, commentorSearch])

  const selectedStatusLabel = useMemo(() => {
    if (statusKeysFilter.length === 0) return 'All statuses'
    if (statusKeysFilter.length === 1) return REACTIONS.find((r) => r.key === statusKeysFilter[0])?.label ?? '1 status'
    return `${statusKeysFilter.length} statuses`
  }, [statusKeysFilter])

  const selectedCommentorLabel = useMemo(() => {
    if (commentorEmailsFilter.length === 0) return 'All'
    if (commentorEmailsFilter.length === 1) return commentorEmailsFilter[0]
    return `${commentorEmailsFilter.length} people`
  }, [commentorEmailsFilter])

  const filteredMessages = useMemo(() => {
    return messages.filter((m) => {
      if (commentorEmailsFilter.length > 0 && (!m.authorEmail || !commentorEmailsFilter.includes(m.authorEmail))) return false
      if (statusKeysFilter.length > 0) {
        const anyMatch = statusKeysFilter.some((k) => (m.reactions?.[k]?.count ?? 0) > 0)
        if (!anyMatch) return false
      }
      if (fromDate) {
        const d = new Date(m.createdAt)
        const from = new Date(fromDate)
        from.setHours(0, 0, 0, 0)
        if (d < from) return false
      }
      if (toDate) {
        const d = new Date(m.createdAt)
        const to = new Date(toDate)
        to.setHours(23, 59, 59, 999)
        if (d > to) return false
      }
      return true
    })
  }, [messages, commentorEmailsFilter, statusKeysFilter, fromDate, toDate])

  const displayMessages = useMemo(() => {
    if (sortOrder === 'latestFirst') return [...filteredMessages].reverse()
    return filteredMessages
  }, [filteredMessages, sortOrder])

  const latestCommentId = useMemo(() => {
    if (filteredMessages.length === 0) return null
    // Latest = greatest createdAt. Messages are not guaranteed sorted.
    let latest = filteredMessages[0]
    for (let i = 1; i < filteredMessages.length; i++) {
      const m = filteredMessages[i]
      if (new Date(m.createdAt).getTime() > new Date(latest.createdAt).getTime()) latest = m
    }
    return latest.id
  }, [filteredMessages])

  const visibleMessages = useMemo(() => {
    if (!hideOlderMessages) return displayMessages
    if (!latestCommentId) return []
    return displayMessages.filter((m) => m.id === latestCommentId)
  }, [displayMessages, hideOlderMessages, latestCommentId])

  const [focusedCommentId, setFocusedCommentId] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const h = window.location.hash.replace(/^#/, '')
    if (!h.startsWith('doc-comment:')) return
    const parts = h.split(':')
    const docId = parts[1]
    const commentId = parts[2]
    if (!docId || !commentId) return
    if (docId !== documentId) return

    setFocusedCommentId(commentId)
    let tries = 0
    const maxTries = 20
    const tryScroll = () => {
      const el = document.getElementById(`comment-${commentId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return true
      }
      return false
    }
    // Try immediately (in case it's already rendered), else retry briefly as messages render.
    if (!tryScroll()) {
      const interval = window.setInterval(() => {
        tries += 1
        if (tryScroll() || tries >= maxTries) window.clearInterval(interval)
      }, 120)
      // clear interval on cleanup too
      const clear = window.setTimeout(() => setFocusedCommentId(null), 4000)
      return () => {
        window.clearInterval(interval)
        window.clearTimeout(clear)
      }
    }
    const clear = window.setTimeout(() => setFocusedCommentId(null), 4000)
    return () => {
      window.clearTimeout(clear)
    }
  }, [documentId, messages.length])

  // If filters change, keep "latest-only" mode consistent.
  // (No-op: visibleMessages recomputes from latestCommentId.)

  // Keep scroll position consistent with sort direction:
  // - Newest first: show the top of the list (latest items near top)
  // - Oldest first: show the bottom of the list (latest items near bottom)
  useEffect(() => {
    if (loading) return
    const behavior: ScrollBehavior = 'auto'
    if (sortOrder === 'latestFirst') {
      topSentinelRef.current?.scrollIntoView({ behavior, block: 'start' })
    } else {
      bottomSentinelRef.current?.scrollIntoView({ behavior, block: 'end' })
    }
  }, [loading, sortOrder, visibleMessages.length])

  const Composer = (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 shrink-0">
      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Add a comment…"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void handleSubmit(e as any)
            }
          }}
          className="flex-1 min-w-0 rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300 resize-none disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSandboxFirm || submitting}
        />
        <Button
          variant="blackCta"
          type="submit"
          size="icon"
          className="shrink-0 h-10 w-10 rounded-xl"
          disabled={isSandboxFirm || submitting || !newContent.trim()}
          aria-label="Send comment"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </form>
  )

  const updateReactionOptimistic = useCallback(
    (messageId: string, emojiKey: ReactionKey, action: 'add' | 'remove') => {
      if (!myEmail) return
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m
          const current = m.reactions ?? {}
          const users = current[emojiKey]?.users ?? []
          const nextUsers =
            action === 'add'
              ? users.includes(myEmail) ? users : [...users, myEmail]
              : users.filter((e) => e !== myEmail)
          return {
            ...m,
            reactions: {
              ...current,
              [emojiKey]: { count: nextUsers.length, users: nextUsers },
            },
          }
        })
      )
    },
    [myEmail]
  )

  const toggleReaction = useCallback(
    async (messageId: string, emojiKey: ReactionKey, action: 'add' | 'remove') => {
      if (isSandboxFirm) return
      updateReactionOptimistic(messageId, emojiKey, action)
      const res = await fetch(`/api/projects/${engagementId}/documents/${documentId}/doc-comments/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, emojiKey, action }),
      })
      if (!res.ok) {
        // best-effort revert
        updateReactionOptimistic(messageId, emojiKey, action === 'add' ? 'remove' : 'add')
      }
    },
    [engagementId, documentId, updateReactionOptimistic, isSandboxFirm]
  )

  const handleReminderSubmit = async ({ selected, deselected, dateValue }: { selected: string[]; deselected: string[]; dateValue: string | null }) => {
    if (!reminderModal) return
    const ops: Promise<void>[] = [
      ...deselected.map((recipientId) => {
        const existing = existingReminders.get(recipientId)
        return fetch(`/api/projects/${engagementId}/documents/${documentId}/doc-comments`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: reminderModal.messageId, reminderId: existing?.reminderId, recipientId }),
        }).then(async (res) => { if (!res.ok) throw new Error('Failed to remove reminder') })
      }),
      ...selected.map((recipientId) =>
        fetch(`/api/projects/${engagementId}/documents/${documentId}/doc-comments`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: reminderModal.messageId, recipientId, dateValue }),
        }).then(async (res) => {
          if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? 'Failed') }
        })
      ),
    ]
    const results = await Promise.allSettled(ops)
    const failed = results.filter((r) => r.status === 'rejected')
    if (failed.length > 0) throw new Error(`${failed.length} operation(s) failed`)
  }

  return (
    <div className="flex flex-col h-full min-h-0 p-4 min-w-0">
      <TooltipProvider>
      <div className="space-y-3 min-w-0">
        {documentName ? (
          <div className="inline-flex max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="truncate text-xs font-medium text-slate-700" title={documentName}>
              {documentName}
            </span>
          </div>
        ) : null}

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {isSandboxFirm && <SandboxInfoBanner />}

        {/* Filters (collapsible) */}
        <div className="rounded-sm border border-slate-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <button
            type="button"
            className="w-full px-3 py-2 flex items-center justify-between gap-2"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
              <SlidersHorizontal className="h-4 w-4 text-slate-500" />
              Filters
            </span>
            <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
          </button>

          {filtersOpen ? (
            <div className="px-3 pb-3">
              {!isExpanded ? (
                <div className="grid grid-cols-1 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">Status</label>
                <DropdownMenu open={statusMenuOpen} onOpenChange={setStatusMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-800 flex items-center justify-between gap-2"
                    >
                      <span className="truncate">{selectedStatusLabel}</span>
                      <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[280px] max-w-[calc(100vw-2rem)] p-0">
                    <div className="px-2 py-2 flex items-center gap-2 border-b border-slate-100">
                      <input
                        value={statusSearch}
                        onChange={(e) => setStatusSearch(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        placeholder="Search status…"
                        className="flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                      />
                      <Button
                        variant="blackCta"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault()
                          setStatusMenuOpen(false)
                        }}
                      >
                        Done
                      </Button>
                    </div>
                    <button
                      type="button"
                      className="w-full px-2 py-1.5 text-sm flex items-center gap-2 hover:bg-slate-50"
                      onClick={(e) => {
                        e.preventDefault()
                        setStatusKeysFilter([])
                      }}
                    >
                      <span className="h-4 w-4 rounded border border-slate-300 bg-white flex items-center justify-center">
                        <Check className={`h-3 w-3 ${statusKeysFilter.length === 0 ? 'text-slate-800' : 'text-slate-300'}`} strokeWidth={2.5} />
                      </span>
                      All statuses
                    </button>
                    {filteredStatusOptions.map((r) => {
                      const checked = statusKeysFilter.includes(r.key)
                      return (
                        <button
                          key={r.key}
                          type="button"
                          className="w-full px-2 py-1.5 text-sm flex items-center gap-2 hover:bg-slate-50"
                          onClick={(e) => {
                            e.preventDefault()
                            setStatusKeysFilter(toggleId(statusKeysFilter as unknown as string[], r.key) as ReactionKey[])
                          }}
                        >
                          <span className="h-4 w-4 rounded border border-slate-300 bg-white flex items-center justify-center">
                            <Check className={`h-3 w-3 ${checked ? 'text-slate-800' : 'text-slate-300'}`} strokeWidth={2.5} />
                          </span>
                          <span className="truncate">{r.label}</span>
                        </button>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">Commentor</label>
                <DropdownMenu open={commentorMenuOpen} onOpenChange={setCommentorMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-800 flex items-center justify-between gap-2"
                    >
                      <span className="truncate">{selectedCommentorLabel}</span>
                      <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[280px] max-w-[calc(100vw-2rem)] p-0">
                    <div className="px-2 py-2 flex items-center gap-2 border-b border-slate-100">
                      <input
                        value={commentorSearch}
                        onChange={(e) => setCommentorSearch(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        placeholder="Search people…"
                        className="flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                      />
                      <Button
                        variant="blackCta"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault()
                          setCommentorMenuOpen(false)
                        }}
                      >
                        Done
                      </Button>
                    </div>
                    <button
                      type="button"
                      className="w-full px-2 py-1.5 text-sm flex items-center gap-2 hover:bg-slate-50"
                      onClick={(e) => {
                        e.preventDefault()
                        setCommentorEmailsFilter([])
                      }}
                    >
                      <span className="h-4 w-4 rounded border border-slate-300 bg-white flex items-center justify-center">
                        <Check className={`h-3 w-3 ${commentorEmailsFilter.length === 0 ? 'text-slate-800' : 'text-slate-300'}`} strokeWidth={2.5} />
                      </span>
                      All
                    </button>
                    {filteredCommentors.map((email) => {
                      const checked = commentorEmailsFilter.includes(email)
                      return (
                        <button
                          key={email}
                          type="button"
                          className="w-full px-2 py-1.5 text-sm flex items-center gap-2 hover:bg-slate-50"
                          onClick={(e) => {
                            e.preventDefault()
                            setCommentorEmailsFilter(toggleId(commentorEmailsFilter, email))
                          }}
                        >
                          <span className="h-4 w-4 rounded border border-slate-300 bg-white flex items-center justify-center">
                            <Check className={`h-3 w-3 ${checked ? 'text-slate-800' : 'text-slate-300'}`} strokeWidth={2.5} />
                          </span>
                          <span className="truncate">{email}</span>
                        </button>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600">From</label>
                  <DateTimePicker
                    value={fromDate}
                    onChange={(iso) => {
                      setFromDate(iso)
                      if (toDate && iso && new Date(iso) > new Date(toDate)) setToDate(iso)
                    }}
                    placeholder="From date"
                    defaultTime="00:00"
                    allowFutureDateTimes={false}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600">To</label>
                  <DateTimePicker
                    value={toDate}
                    onChange={(iso) => {
                      if (fromDate && iso && new Date(iso) < new Date(fromDate)) return
                      setToDate(iso)
                    }}
                    placeholder="To date"
                    defaultTime="23:59"
                    allowFutureDateTimes={false}
                  />
                </div>
              </div>

              <div className="flex gap-2 items-center">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-xl"
                  onClick={clearFilters}
                  aria-label="Clear filters"
                >
                  Clear
                </Button>
              </div>
            </div>
              ) : (
                <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">Status</label>
                <DropdownMenu open={statusMenuOpen} onOpenChange={setStatusMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-800 min-w-[170px] flex items-center justify-between gap-2"
                    >
                      <span className="truncate">{selectedStatusLabel}</span>
                      <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[280px] max-w-[calc(100vw-2rem)] p-0">
                    <div className="px-2 py-2 flex items-center gap-2 border-b border-slate-100">
                      <input
                        value={statusSearch}
                        onChange={(e) => setStatusSearch(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        placeholder="Search status…"
                        className="flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                      />
                      <Button
                        variant="blackCta"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault()
                          setStatusMenuOpen(false)
                        }}
                      >
                        Done
                      </Button>
                    </div>
                    <button
                      type="button"
                      className="w-full px-2 py-1.5 text-sm flex items-center gap-2 hover:bg-slate-50"
                      onClick={(e) => {
                        e.preventDefault()
                        setStatusKeysFilter([])
                      }}
                    >
                      <span className="h-4 w-4 rounded border border-slate-300 bg-white flex items-center justify-center">
                        <Check className={`h-3 w-3 ${statusKeysFilter.length === 0 ? 'text-slate-800' : 'text-slate-300'}`} strokeWidth={2.5} />
                      </span>
                      All statuses
                    </button>
                    {filteredStatusOptions.map((r) => {
                      const checked = statusKeysFilter.includes(r.key)
                      return (
                        <button
                          key={r.key}
                          type="button"
                          className="w-full px-2 py-1.5 text-sm flex items-center gap-2 hover:bg-slate-50"
                          onClick={(e) => {
                            e.preventDefault()
                            setStatusKeysFilter(toggleId(statusKeysFilter as unknown as string[], r.key) as ReactionKey[])
                          }}
                        >
                          <span className="h-4 w-4 rounded border border-slate-300 bg-white flex items-center justify-center">
                            <Check className={`h-3 w-3 ${checked ? 'text-slate-800' : 'text-slate-300'}`} strokeWidth={2.5} />
                          </span>
                          <span className="truncate">{r.label}</span>
                        </button>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">Commentor</label>
                <DropdownMenu open={commentorMenuOpen} onOpenChange={setCommentorMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-800 min-w-[220px] flex items-center justify-between gap-2"
                    >
                      <span className="truncate">{selectedCommentorLabel}</span>
                      <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[280px] max-w-[calc(100vw-2rem)] p-0">
                    <div className="px-2 py-2 flex items-center gap-2 border-b border-slate-100">
                      <input
                        value={commentorSearch}
                        onChange={(e) => setCommentorSearch(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        placeholder="Search people…"
                        className="flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                      />
                      <Button
                        variant="blackCta"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault()
                          setCommentorMenuOpen(false)
                        }}
                      >
                        Done
                      </Button>
                    </div>
                    <button
                      type="button"
                      className="w-full px-2 py-1.5 text-sm flex items-center gap-2 hover:bg-slate-50"
                      onClick={(e) => {
                        e.preventDefault()
                        setCommentorEmailsFilter([])
                      }}
                    >
                      <span className="h-4 w-4 rounded border border-slate-300 bg-white flex items-center justify-center">
                        <Check className={`h-3 w-3 ${commentorEmailsFilter.length === 0 ? 'text-slate-800' : 'text-slate-300'}`} strokeWidth={2.5} />
                      </span>
                      All
                    </button>
                    {filteredCommentors.map((email) => {
                      const checked = commentorEmailsFilter.includes(email)
                      return (
                        <button
                          key={email}
                          type="button"
                          className="w-full px-2 py-1.5 text-sm flex items-center gap-2 hover:bg-slate-50"
                          onClick={(e) => {
                            e.preventDefault()
                            setCommentorEmailsFilter(toggleId(commentorEmailsFilter, email))
                          }}
                        >
                          <span className="h-4 w-4 rounded border border-slate-300 bg-white flex items-center justify-center">
                            <Check className={`h-3 w-3 ${checked ? 'text-slate-800' : 'text-slate-300'}`} strokeWidth={2.5} />
                          </span>
                          <span className="truncate">{email}</span>
                        </button>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">From</label>
                <DateTimePicker
                  value={fromDate}
                  onChange={(iso) => {
                    setFromDate(iso)
                    if (toDate && iso && new Date(iso) > new Date(toDate)) setToDate(iso)
                  }}
                  placeholder="From date"
                  defaultTime="00:00"
                  allowFutureDateTimes={false}
                  className="min-w-[140px]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">To</label>
                <DateTimePicker
                  value={toDate}
                  onChange={(iso) => {
                    if (fromDate && iso && new Date(iso) < new Date(fromDate)) return
                    setToDate(iso)
                  }}
                  placeholder="To date"
                  defaultTime="23:59"
                  allowFutureDateTimes={false}
                  className="min-w-[140px]"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-xl"
                onClick={clearFilters}
                aria-label="Clear filters"
              >
                Clear
              </Button>
            </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* View controls (collapsible, Filters-style) */}
      <div className="mt-2 rounded-sm border border-slate-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <button
          type="button"
          className="w-full px-3 py-2 flex items-center justify-between gap-2"
          onClick={() => setViewControlsOpen((v) => !v)}
        >
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
            <Eye className="h-4 w-4 text-slate-500" />
            View
          </span>
          <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${viewControlsOpen ? 'rotate-180' : ''}`} />
        </button>

        {viewControlsOpen ? (
          <div className="px-3 pb-3">
            {!isExpanded ? (
              <div className="grid grid-cols-1 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600">Order</label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-800 flex items-center justify-between gap-2"
                        aria-label="Change comment sort order"
                      >
                        <span className="truncate">{sortOrder === 'latestLast' ? 'Oldest first' : 'Newest first'}</span>
                        <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-[220px] p-1">
                      <button
                        type="button"
                        className={`w-full px-2 py-1.5 text-xs flex items-center justify-between gap-2 rounded-md hover:bg-slate-50 ${sortOrder === 'latestLast' ? 'bg-slate-50' : ''}`}
                        onClick={(e) => {
                          e.preventDefault()
                          setSortOrder('latestLast')
                        }}
                      >
                        <span>Oldest first</span>
                        {sortOrder === 'latestLast' ? <Check className="h-4 w-4 text-slate-700" /> : null}
                      </button>
                      <button
                        type="button"
                        className={`w-full px-2 py-1.5 text-xs flex items-center justify-between gap-2 rounded-md hover:bg-slate-50 ${sortOrder === 'latestFirst' ? 'bg-slate-50' : ''}`}
                        onClick={(e) => {
                          e.preventDefault()
                          setSortOrder('latestFirst')
                        }}
                      >
                        <span>Newest first</span>
                        {sortOrder === 'latestFirst' ? <Check className="h-4 w-4 text-slate-700" /> : null}
                      </button>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex gap-2 items-center">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-xl"
                    onClick={() => setHideOlderMessages((v) => !v)}
                    aria-label={hideOlderMessages ? 'Show all messages' : 'Hide older messages'}
                  >
                    {hideOlderMessages ? 'Show all messages' : 'Hide older messages'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600">Order</label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-800 min-w-[170px] flex items-center justify-between gap-2"
                        aria-label="Change comment sort order"
                      >
                        <span className="truncate">{sortOrder === 'latestLast' ? 'Oldest first' : 'Newest first'}</span>
                        <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-[220px] p-1">
                      <button
                        type="button"
                        className={`w-full px-2 py-1.5 text-xs flex items-center justify-between gap-2 rounded-md hover:bg-slate-50 ${sortOrder === 'latestLast' ? 'bg-slate-50' : ''}`}
                        onClick={(e) => {
                          e.preventDefault()
                          setSortOrder('latestLast')
                        }}
                      >
                        <span>Oldest first</span>
                        {sortOrder === 'latestLast' ? <Check className="h-4 w-4 text-slate-700" /> : null}
                      </button>
                      <button
                        type="button"
                        className={`w-full px-2 py-1.5 text-xs flex items-center justify-between gap-2 rounded-md hover:bg-slate-50 ${sortOrder === 'latestFirst' ? 'bg-slate-50' : ''}`}
                        onClick={(e) => {
                          e.preventDefault()
                          setSortOrder('latestFirst')
                        }}
                      >
                        <span>Newest first</span>
                        {sortOrder === 'latestFirst' ? <Check className="h-4 w-4 text-slate-700" /> : null}
                      </button>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex gap-2 items-center">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-xl"
                    onClick={() => setHideOlderMessages((v) => !v)}
                    aria-label={hideOlderMessages ? 'Show all messages' : 'Hide older messages'}
                  >
                    {hideOlderMessages ? 'Show all messages' : 'Hide older messages'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {sortOrder === 'latestFirst' ? (
        <div className="mt-4 shrink-0">
          {Composer}
        </div>
      ) : null}

      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 space-y-3 mb-4 mt-4">
        <div ref={topSentinelRef} />
        {loading ? (
          <div className="flex items-center justify-center py-8 text-gray-500">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading comments…
          </div>
        ) : visibleMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-500">
            <MessageCircle className="h-10 w-10 text-gray-300 mb-2" />
            <p className="text-sm">No comments match the current filters.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleMessages.map((msg) => {
              const isLatest = latestCommentId === msg.id
              return (
                <div
                  key={msg.id}
                  id={`comment-${msg.id}`}
                  className={`group rounded-sm border border-slate-200 bg-white px-4 py-3 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-slate-50/80 transition-colors ${focusedCommentId === msg.id ? 'ring-2 ring-slate-300' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-slate-600">{msg.authorEmail ?? 'Unknown'}</span>
                        <RelativeDateTime
                          date={msg.createdAt}
                          textClassName="text-xs text-slate-400"
                          iconClassName="text-slate-300 hover:text-slate-500"
                          tooltipSide="top"
                        />
                        {isLatest ? (
                          <span className="ml-1 font-mono text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                            Latest
                          </span>
                        ) : null}
                      </div>

                      <p className="text-slate-900 whitespace-pre-wrap break-words leading-[1.6] max-w-[700px] mb-3">
                        {msg.content}
                      </p>
                    </div>

                    <span className="h-7 w-7" aria-hidden="true" />
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="relative flex-1 min-w-0">
                      <div className="flex items-center gap-1 flex-wrap pr-6">
                        {/* Reaction picker trigger (left-aligned) */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className={cn("shrink-0 h-7 w-7 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100/80 transition-colors inline-flex items-center justify-center", isSandboxFirm && "opacity-60 cursor-not-allowed pointer-events-none")}
                              aria-label="Add reaction"
                              onClick={(e) => e.stopPropagation()}
                              disabled={isSandboxFirm}
                            >
                              <Smile className="h-4 w-4 text-yellow-600" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="w-[186px] p-2">
                            <div className="grid grid-cols-3 gap-1">
                              {REACTIONS.map((r) => {
                                const users = msg.reactions?.[r.key]?.users ?? []
                                const reactedByMe = Boolean(myEmail && users.includes(myEmail))
                                return (
                                  <Tooltip key={`picker-${r.key}`}>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        className={cn(
                                          'h-10 w-10 rounded-xl inline-flex items-center justify-center transition-colors text-slate-700',
                                          'hover:bg-slate-100/80',
                                          reactedByMe && 'bg-slate-100/60',
                                          isSandboxFirm && 'opacity-60 cursor-not-allowed pointer-events-none'
                                        )}
                                        onClick={(e) => {
                                          e.preventDefault()
                                          e.stopPropagation()
                                          void toggleReaction(msg.id, r.key, reactedByMe ? 'remove' : 'add')
                                        }}
                                        disabled={isSandboxFirm}
                                      >
                                        <span className="text-lg leading-none">{r.emoji}</span>
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className={LIGHT_TOOLTIP_CLASS}>
                                      {r.label}
                                    </TooltipContent>
                                  </Tooltip>
                                )
                              })}
                            </div>
                          </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Reaction chips (wrap; only show reactions with >= 1 user; no count, hover = email list) */}
                        {REACTIONS.filter((r) => (msg.reactions?.[r.key]?.count ?? 0) > 0).map((r) => {
                          const users = msg.reactions?.[r.key]?.users ?? []
                          const reactedByMe = Boolean(myEmail && users.includes(myEmail))
                          return (
                            <Tooltip key={r.key}>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className={cn("shrink-0 h-7 px-2 rounded-full inline-flex items-center justify-center text-sm leading-none transition-colors hover:bg-slate-100/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-1", isSandboxFirm && "opacity-60 cursor-not-allowed pointer-events-none")}
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    void toggleReaction(msg.id, r.key, reactedByMe ? 'remove' : 'add')
                                  }}
                                  disabled={isSandboxFirm}
                                >
                                  <span className="leading-none">{r.emoji}</span>
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="z-[9999] max-w-[240px] p-2 text-[11px] bg-white text-slate-700 border border-slate-200 shadow-lg">
                                <div className="font-medium text-slate-800 mb-1">{r.label}</div>
                                <ul className="space-y-0.5 max-h-[140px] overflow-y-auto">
                                  {users.map((email) => (
                                    <li key={email} className="truncate">
                                      {email}
                                    </li>
                                  ))}
                                </ul>
                              </TooltipContent>
                            </Tooltip>
                          )
                        })}
                      </div>

                      {/* No fade mask needed for wrapped layout */}
                    </div>

                    <div className="flex items-center gap-1">
                      {firmMembers.length > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="shrink-0 h-7 w-7 rounded-md hover:bg-orange-50 transition-colors inline-flex items-center justify-center"
                              style={{ color: '#C4572B' }}
                              aria-label="Assign reminder"
                              onClick={() => {
                                setReminderModal({ messageId: msg.id, content: msg.content })
                                // Fetch existing reminders — component pre-populates selection from this map
                                fetch(`/api/projects/${engagementId}/documents/${documentId}/doc-comments/reminders?messageId=${encodeURIComponent(msg.id)}`)
                                  .then((r) => r.ok ? r.json() : null)
                                  .then((data) => {
                                    const map = new Map<string, { reminderId: string; dateValue: string | null }>()
                                    ;(data?.reminders ?? []).forEach((r: any) => map.set(r.userId, { reminderId: r.reminderId, dateValue: r.dateValue }))
                                    setExistingReminders(map)
                                  })
                                  .catch(() => setExistingReminders(new Map()))
                              }}
                            >
                              <CalendarClock className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className={LIGHT_TOOLTIP_CLASS}>
                            Setup Reminder
                          </TooltipContent>
                        </Tooltip>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="shrink-0 h-7 w-7 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100/80 transition-colors inline-flex items-center justify-center"
                            aria-label="Copy link to comment"
                            onClick={() => {
                              const base = typeof window !== 'undefined' ? window.location.href.replace(/#.*$/, '') : ''
                              const url = base ? `${base}#doc-comment:${documentId}:${msg.id}` : ''
                              if (url) void navigator.clipboard.writeText(url)
                            }}
                          >
                            <Link2 className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className={LIGHT_TOOLTIP_CLASS}>
                          Copy link
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <div ref={bottomSentinelRef} />
      </div>

      {sortOrder === 'latestLast' ? Composer : null}

      <SetupReminderModal
        open={reminderModal !== null}
        onClose={() => {
          setReminderModal(null)
          setExistingReminders(new Map())
        }}
        entityName={documentName}
        entityMimeType={documentMimeType}
        contentPreview={reminderModal?.content}
        currentUser={user ? { userId: user.id, name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null, email: user.email ?? null, avatarUrl: user.user_metadata?.avatar_url ?? null, role: firmMembers.find((m) => m.userId === user.id)?.role ?? null } : undefined}
        members={firmMembers.filter((m) => m.userId !== user?.id)}
        existingReminders={existingReminders}
        multiSelect={true}
        hint="A reminder with a link to this comment will appear in the assignee's reminders on the selected date."
        onSubmit={handleReminderSubmit}
      />
    </TooltipProvider>
    </div>
  )
}
