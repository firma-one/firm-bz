'use client'

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AtSign, CalendarClock, Eye, MessageCircle, Send, Loader2, Check, ChevronDown, Link2, SlidersHorizontal, Smile, Trash2, UserCheck, X } from 'lucide-react'
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
  // Set of messageIds that have at least one active reminder (for dot indicator)
  const [messagesWithReminders, setMessagesWithReminders] = useState<Set<string>>(new Set())

  // @mention state
  type MentionedUser = { userId: string; name: string; avatarUrl?: string | null }
  const [mentionedUsers, setMentionedUsers] = useState<MentionedUser[]>([])
  const [mentionPickerOpen, setMentionPickerOpen] = useState(false)
  const [mentionSearch, setMentionSearch] = useState('')
  const [mentionDateValue, setMentionDateValue] = useState('')
  const [editingMentionId, setEditingMentionId] = useState<string | null>(null)
  const [mentionFocusedIndex, setMentionFocusedIndex] = useState(0)
  const mentionPickerRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)

  // Mentions filter: show only comments where current user is mentioned
  const [mentionsFilterActive, setMentionsFilterActive] = useState(false)
  // messageIds where current user has an active reminder/mention (for filter)
  const [myMentionedMessageIds, setMyMentionedMessageIds] = useState<Set<string>>(new Set())
  // messageIds that have ANY active reminder/mention (blocks delete)
  const [messagesWithAnyMention, setMessagesWithAnyMention] = useState<Set<string>>(new Set())
  // delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
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
    setMentionsFilterActive(false)
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

  // Fetch which comments the current user is mentioned in (for Mentions filter)
  const fetchMyMentions = useCallback(async () => {
    if (!user?.id) return
    try {
      const res = await fetch(`/api/projects/${engagementId}/doc-comments?filter=mentions`)
      if (!res.ok) return
      const data = await res.json()
      const ids = new Set<string>((data.mentions ?? []).map((m: any) => m.messageId as string))
      setMyMentionedMessageIds(ids)
    } catch {
      // non-blocking
    }
  }, [engagementId, user?.id])

  // Build set of messages that have ANY active reminder (blocks delete) + populates reminder icon set
  const refreshMessagesWithAnyMention = useCallback(async (msgs: typeof messages) => {
    if (msgs.length === 0) { setMessagesWithAnyMention(new Set()); setMessagesWithReminders(new Set()); return }
    const results = await Promise.allSettled(
      msgs.map((m) =>
        fetch(`/api/projects/${engagementId}/documents/${documentId}/doc-comments/reminders?messageId=${encodeURIComponent(m.id)}`)
          .then((r) => r.ok ? r.json() : null)
          .then((d) => ({ id: m.id, hasReminder: (d?.reminders?.length ?? 0) > 0 }))
      )
    )
    const withReminder = new Set<string>()
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value?.hasReminder) withReminder.add(r.value.id)
    }
    setMessagesWithAnyMention(withReminder)
    setMessagesWithReminders(withReminder)
  }, [engagementId, documentId])

  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  useEffect(() => {
    fetchMyMentions()
  }, [fetchMyMentions])

  useEffect(() => {
    if (!loading) refreshMessagesWithAnyMention(messages)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, messages.length])

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
    // Strip any trailing '@' that opened the picker but wasn't completed
    const content = newContent.replace(/@\s*$/, '').trim()
    if ((!content && mentionedUsers.length === 0) || submitting) return
    setSubmitting(true)
    try {
      // Prepend @mentions to the message text so they're visible in the thread
      const mentionPrefix = mentionedUsers.map((u) => `@${u.name}`).join(' ')
      const fullContent = mentionPrefix ? `${mentionPrefix} ${content}`.trim() : content
      const res = await fetch(`/api/projects/${engagementId}/documents/${documentId}/doc-comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: fullContent }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to add comment')
      }
      const data = await res.json()
      const newMsg = data.message
      setMessages((prev) => [...prev, newMsg])
      setNewContent('')
      setMentionPickerOpen(false)

      // Create reminders for @mentioned users
      if (mentionedUsers.length > 0) {
        const toMention = [...mentionedUsers]
        const dateVal = mentionDateValue || null
        setMentionedUsers([])
        setMentionDateValue('')
        for (const { userId } of toMention) {
          fetch(`/api/projects/${engagementId}/documents/${documentId}/doc-comments`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageId: newMsg.id, recipientId: userId, dateValue: dateVal }),
          }).catch(() => {})
        }
        // Refresh mention state
        setTimeout(() => { void fetchMyMentions(); void refreshMessagesWithAnyMention([...messages, newMsg]) }, 500)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add comment')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteComment = async (messageId: string) => {
    if (deleting) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/projects/${engagementId}/documents/${documentId}/doc-comments`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-comment', messageId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to delete comment')
      }
      setMessages((prev) => prev.filter((m) => m.id !== messageId))
      setDeleteConfirmId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete comment')
    } finally {
      setDeleting(false)
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
      if (mentionsFilterActive && !myMentionedMessageIds.has(m.id)) return false
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
  }, [messages, mentionsFilterActive, myMentionedMessageIds, commentorEmailsFilter, statusKeysFilter, fromDate, toDate])

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

  // Format a raw auth name (may be username-style like "deepaksshettigar") into a readable display name.
  // If it contains no spaces/separators, fall back to the email local part split by domain.
  const formatDisplayName = (name: string, email: string): string => {
    if (!name || name === email.split('@')[0]) {
      // Try to derive a nice name from the email local part
      const local = email.split('@')[0]
      return local.replace(/[._\-+]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim()
    }
    if (name.includes(' ') || name.includes('.') || name.includes('_')) {
      return name.split(/[\s._-]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').trim()
    }
    return name
  }

  // Render message content with @Name tokens highlighted as pills
  const renderContentWithMentions = (content: string) => {
    // Names are prepended as "@Name1 @Name2 message…" — extract leading @tokens, rest is plain text
    const tokens: { type: 'mention' | 'text'; value: string }[] = []
    let remaining = content
    while (remaining.startsWith('@')) {
      // Greedily consume one @token: stop at the next @ or when we hit lowercase-start words
      const match = remaining.match(/^(@[A-Za-z][^\s]*(?:\s+[A-Z][^\s]*)?)(\s+|$)/)
      if (!match) break
      tokens.push({ type: 'mention', value: match[1] })
      remaining = remaining.slice(match[0].length)
    }
    if (remaining) tokens.push({ type: 'text', value: remaining })
    return tokens.map((t, i) =>
      t.type === 'mention'
        ? <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-primary/10 text-primary leading-none mr-1">{t.value}</span>
        : <span key={i}>{t.value}</span>
    )
  }

  // State for editing reminder on an already-posted message (read-only mentions, editable date)
  const [reminderEditPicker, setReminderEditPicker] = useState<{
    messageId: string
    anchorEl: HTMLElement
    existingDate: string
    mentionedNames: string[] // @Name tokens parsed from message content
  } | null>(null)
  const reminderEditPickerRef = useRef<HTMLDivElement>(null)

  // Close reminder edit picker on outside click
  useEffect(() => {
    if (!reminderEditPicker) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if ((target as Element)?.closest?.('[data-radix-popper-content-wrapper]')) return
      if (reminderEditPickerRef.current && !reminderEditPickerRef.current.contains(target)) {
        setReminderEditPicker(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [reminderEditPicker])

  // Filtered member list for mention picker
  const mentionCandidates = useMemo(() => {
    const q = mentionSearch.trim().toLowerCase()
    const others = firmMembers.filter((m) => m.userId !== user?.id)
    if (!q) return others
    return others.filter((m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
  }, [firmMembers, mentionSearch, user?.id])

  const openMentionPicker = (editUserId?: string) => {
    setMentionSearch('')
    setEditingMentionId(editUserId ?? null)
    setMentionPickerOpen(true)
  }

  const closeMentionPicker = () => {
    setMentionPickerOpen(false)
    setMentionSearch('')
    setMentionDateValue('')
    setEditingMentionId(null)
    textareaRef.current?.focus()
  }

  const toggleMentionUser = (member: { userId: string; name: string; email: string; avatarUrl?: string | null }) => {
    setMentionedUsers((prev) => {
      const already = prev.find((m) => m.userId === member.userId)
      if (already) return prev.filter((m) => m.userId !== member.userId)
      const displayName = formatDisplayName(member.name, member.email)
      return [...prev, { userId: member.userId, name: displayName, avatarUrl: member.avatarUrl }]
    })
  }

  // Close picker on outside click — but not when clicking inside a Radix Popover portal (e.g. DateTimePicker calendar)
  useEffect(() => {
    if (!mentionPickerOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      const insidePortal = (target as Element)?.closest?.('[data-radix-popper-content-wrapper]')
      if (insidePortal) return
      if (
        mentionPickerRef.current && !mentionPickerRef.current.contains(target) &&
        composerRef.current && !composerRef.current.contains(target)
      ) {
        closeMentionPicker()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [mentionPickerOpen])

  // MentionPill: shows avatar + name, hover tooltip with avatar, click to edit
  const MentionPill = ({ u }: { u: { userId: string; name: string; avatarUrl?: string | null } }) => {
    const initials = u.name.replace('@', '').split(/[\s._-]/).filter(Boolean).map((p: string) => p[0]).join('').slice(0, 2).toUpperCase() || '?'
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => openMentionPicker(u.userId)}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer leading-none"
            aria-label={`Edit mention of ${u.name}`}
          >
            <span className="inline-flex h-4 w-4 rounded-full overflow-hidden shrink-0 items-center justify-center text-[9px] font-bold bg-primary/20 text-primary">
              {u.avatarUrl
                ? <img src={u.avatarUrl} alt="" className="h-full w-full object-cover" />
                : initials}
            </span>
            @{u.name}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="z-[9999] p-2 bg-white border border-slate-200 shadow-lg text-xs text-slate-800">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-[11px] font-bold bg-primary/20 text-primary">
              {u.avatarUrl
                ? <img src={u.avatarUrl} alt="" className="h-full w-full object-cover" />
                : initials}
            </div>
            <div>
              <div className="font-semibold">{u.name}</div>
              <div className="text-slate-400 text-[10px]">Click to edit mention</div>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    )
  }

  const Composer = (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1 shrink-0">
      {/* Usage hint above the composer */}
      <div className="flex items-center gap-1.5 px-0.5 pb-0.5">
        <AtSign className="h-3 w-3 text-primary shrink-0" />
        <span className="text-[10px] text-[#45474c]">Type <span className="font-semibold text-primary">@</span> in the box below to mention a team member and optionally set a reminder.</span>
      </div>
      {/* Inline composer: pills + textarea in one visual box */}
      <div ref={composerRef} className="relative">
        <div
          className={cn(
            'flex flex-wrap items-center gap-1 min-h-[64px] rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-slate-300 focus-within:border-slate-300',
            (isSandboxFirm || submitting) && 'opacity-60 cursor-not-allowed'
          )}
          onClick={() => textareaRef.current?.focus()}
        >
          {/* Inline mention pills */}
          {mentionedUsers.map((u) => (
            <MentionPill key={u.userId} u={u} />
          ))}

          {/* Actual textarea — grows to fill remaining space */}
          <textarea
            ref={textareaRef}
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder={mentionedUsers.length === 0 ? 'Add a comment… (type @ to mention)' : ''}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === '@' && !isSandboxFirm && firmMembers.length > 0) {
                // Let '@' type into textarea, then open picker and strip it
                setTimeout(() => {
                  setNewContent((prev) => prev.replace(/@$/, ''))
                  openMentionPicker()
                }, 0)
                return
              }
              if (e.key === 'Backspace' && newContent === '' && mentionedUsers.length > 0) {
                // Remove last mention when backspacing on empty text
                setMentionedUsers((prev) => prev.slice(0, -1))
                e.preventDefault()
                return
              }
              if (e.key === 'Escape' && mentionPickerOpen) {
                closeMentionPicker()
                e.stopPropagation()
                return
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (mentionPickerOpen) { closeMentionPicker(); return }
                void handleSubmit(e as any)
              }
            }}
            className="flex-1 min-w-[80px] bg-transparent outline-none resize-none overflow-hidden placeholder:text-slate-400 disabled:cursor-not-allowed"
            style={{ minHeight: '1.5rem' }}
            disabled={isSandboxFirm || submitting}
          />
        </div>

        {/* Anchored mention picker dropdown */}
        {mentionPickerOpen && mentionCandidates.length > 0 && (
          <div
            ref={mentionPickerRef}
            className="absolute bottom-full left-0 mb-1 w-full max-w-xs bg-white border border-[#e5e7eb] rounded-sm shadow-2xl z-[200] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2.5 bg-primary/5 border-b border-primary/10">
              <AtSign className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-xs font-semibold text-[#1b1b1d]">Mention a team member</span>
            </div>
            {/* Search */}
            <div className="px-3 pt-2.5 pb-2">
              <input
                autoFocus
                value={mentionSearch}
                onChange={(e) => { setMentionSearch(e.target.value); setMentionFocusedIndex(0) }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { closeMentionPicker(); e.stopPropagation(); return }
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setMentionFocusedIndex((i) => Math.min(i + 1, mentionCandidates.length - 1))
                    return
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setMentionFocusedIndex((i) => Math.max(i - 1, 0))
                    return
                  }
                  if (e.key === ' ' || e.key === 'Enter') {
                    const m = mentionCandidates[mentionFocusedIndex]
                    if (m) { e.preventDefault(); toggleMentionUser(m) }
                  }
                }}
                placeholder="Search members…"
                className="w-full text-xs rounded-sm border border-[#e5e7eb] bg-[#f9f9fb] px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 focus:bg-white transition-colors"
              />
            </div>
            {/* Member list */}
            <div className="overflow-y-auto border-t border-[#f0f0f2]" style={{ maxHeight: '180px' }}>
              {mentionCandidates.map((m, idx) => {
                const selected = mentionedUsers.some((u) => u.userId === m.userId)
                const focused = idx === mentionFocusedIndex
                const displayName = formatDisplayName(m.name, m.email)
                const initials = displayName.split(/\s+/).filter(Boolean).map((p: string) => p[0]).join('').slice(0, 2).toUpperCase() || '?'
                return (
                  <button
                    key={m.userId}
                    type="button"
                    ref={(el) => { if (el && focused) el.scrollIntoView({ block: 'nearest' }) }}
                    onClick={() => toggleMentionUser(m)}
                    onMouseEnter={() => setMentionFocusedIndex(idx)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
                      selected ? 'bg-primary/5 hover:bg-primary/10' : focused ? 'bg-[#f4f4f5]' : 'hover:bg-[#f4f4f5]'
                    )}
                  >
                    <span className={cn(
                      'h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                      selected ? 'border-primary bg-primary' : 'border-[#c5c7cc] bg-white'
                    )}>
                      {selected && <Check className="h-3 w-3 text-white" strokeWidth={2.5} />}
                    </span>
                    <div className={cn(
                      'h-7 w-7 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-[11px] font-bold border',
                      selected ? 'border-primary/30' : 'border-[#e5e7eb]'
                    )}>
                      {m.avatarUrl
                        ? <img src={m.avatarUrl} alt="" className="h-full w-full object-cover" />
                        : <div className={cn('h-full w-full flex items-center justify-center font-bold', selected ? 'bg-primary/10 text-primary' : 'bg-primary/5 text-primary/60')}>{initials}</div>
                      }
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={cn('text-xs font-semibold truncate', selected ? 'text-primary' : 'text-[#1b1b1d]')}>{displayName}</div>
                      <div className="text-[10px] truncate text-[#9a9ba0]">{m.email}</div>
                    </div>
                  </button>
                )
              })}
            </div>
            {/* Reminder footer */}
            <div className="px-3 pt-2.5 pb-3 border-t border-[#e5e7eb] bg-[#f9f9fb] flex flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <CalendarClock className={cn('h-3.5 w-3.5 shrink-0', mentionedUsers.length > 0 ? 'text-primary' : 'text-[#c5c7cc]')} />
                <span className={cn('text-[10px] font-semibold uppercase tracking-wide', mentionedUsers.length > 0 ? 'text-[#45474c]' : 'text-[#c5c7cc]')}>
                  Remind on <span className="font-normal normal-case tracking-normal">(optional)</span>
                </span>
              </div>
              <div className={cn(mentionedUsers.length === 0 && 'opacity-40 pointer-events-none select-none')}>
                <DateTimePicker
                  value={mentionDateValue}
                  onChange={setMentionDateValue}
                  placeholder="No date — notify now"
                  defaultTime="09:00"
                  allowFutureDateTimes={true}
                  disabled={mentionedUsers.length === 0}
                />
              </div>
              {mentionedUsers.length === 0 && (
                <p className="text-[10px] text-[#9a9ba0]">Select a member above to enable reminders.</p>
              )}
              <div className="flex justify-end pt-0.5">
                <button
                  type="button"
                  onClick={closeMentionPicker}
                  className="text-xs font-semibold text-white bg-primary hover:bg-primary/90 px-4 py-1.5 rounded-sm transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Send row */}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="blackCta"
          type="submit"
          size="sm"
          className="h-8 px-4 rounded-xl"
          disabled={isSandboxFirm || submitting || (!newContent.trim() && mentionedUsers.length === 0)}
          aria-label="Send comment"
        >
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
          Send
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
    // Update dot indicator: add if any selected, remove if none remain
    const messageId = reminderModal.messageId
    const remainingCount = (existingReminders.size - deselected.length) + selected.length
    setMessagesWithReminders((prev) => {
      const next = new Set(prev)
      remainingCount > 0 ? next.add(messageId) : next.delete(messageId)
      return next
    })
  }

  return (
    <div className="flex flex-col h-full min-h-0 p-4 min-w-0">
      <TooltipProvider>
      <div className="space-y-3 min-w-0">

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

              {myMentionedMessageIds.size > 0 && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600">Mentions</label>
                  <button
                    type="button"
                    onClick={() => setMentionsFilterActive((v) => !v)}
                    className={cn(
                      'h-9 px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 transition-colors',
                      mentionsFilterActive
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    )}
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    Mentions me
                    {mentionsFilterActive && <X className="h-3 w-3 ml-0.5" />}
                  </button>
                </div>
              )}

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
              {myMentionedMessageIds.size > 0 && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600">Mentions</label>
                  <button
                    type="button"
                    onClick={() => setMentionsFilterActive((v) => !v)}
                    className={cn(
                      'h-9 px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 transition-colors',
                      mentionsFilterActive
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    )}
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    Mentions me
                    {mentionsFilterActive && <X className="h-3 w-3 ml-0.5" />}
                  </button>
                </div>
              )}
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
              const isMine = msg.authorUserId === user?.id
              const isLastMsg = messages[messages.length - 1]?.id === msg.id
              const hasMention = messagesWithAnyMention.has(msg.id)
              const mentionedMe = myMentionedMessageIds.has(msg.id)
              // Trash visible only if: my message, last in thread, no active reminders/mentions
              const canDelete = isMine && isLastMsg && !hasMention && !isSandboxFirm
              const isConfirmingDelete = deleteConfirmId === msg.id
              return (
                <div
                  key={msg.id}
                  id={`comment-${msg.id}`}
                  className={cn(
                    'group rounded-sm border bg-white px-4 py-3 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-slate-50/80 transition-colors',
                    focusedCommentId === msg.id ? 'ring-2 ring-slate-300' : '',
                    mentionedMe ? 'border-l-2 border-l-blue-400 border-slate-200 bg-blue-50/20' : 'border-slate-200'
                  )}
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
                        {renderContentWithMentions(msg.content)}
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
                      {messagesWithReminders.has(msg.id) && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="relative shrink-0 h-7 w-7 rounded-md hover:bg-orange-50 transition-colors inline-flex items-center justify-center"
                              style={{ color: '#C4572B' }}
                              aria-label="Edit reminder"
                              onClick={(e) => {
                                const btn = e.currentTarget as HTMLElement
                                const names: string[] = []
                                let rem = msg.content
                                while (rem.startsWith('@')) {
                                  const m = rem.match(/^(@[A-Za-z][^\s]*(?:\s+[A-Z][^\s]*)?)(\s+|$)/)
                                  if (!m) break
                                  names.push(m[1])
                                  rem = rem.slice(m[0].length)
                                }
                                fetch(`/api/projects/${engagementId}/documents/${documentId}/doc-comments/reminders?messageId=${encodeURIComponent(msg.id)}`)
                                  .then((r) => r.ok ? r.json() : null)
                                  .then((data) => {
                                    const firstReminder = (data?.reminders ?? [])[0]
                                    setReminderEditPicker({ messageId: msg.id, anchorEl: btn, existingDate: firstReminder?.dateValue ?? '', mentionedNames: names })
                                  })
                                  .catch(() => setReminderEditPicker({ messageId: msg.id, anchorEl: btn, existingDate: '', mentionedNames: names }))
                              }}
                            >
                              <CalendarClock className="h-4 w-4" />
                              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border border-white" style={{ backgroundColor: '#C4572B' }} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className={LIGHT_TOOLTIP_CLASS}>
                            Edit reminder
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

                      {canDelete && !isConfirmingDelete && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="shrink-0 h-7 w-7 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors inline-flex items-center justify-center opacity-0 group-hover:opacity-100"
                              aria-label="Delete comment"
                              onClick={() => setDeleteConfirmId(msg.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className={LIGHT_TOOLTIP_CLASS}>
                            Delete comment
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {isConfirmingDelete && (
                        <div className="inline-flex items-center gap-1.5 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-2 py-1">
                          <span>Delete?</span>
                          <button
                            type="button"
                            className="font-semibold hover:underline"
                            disabled={deleting}
                            onClick={() => void handleDeleteComment(msg.id)}
                          >
                            {deleting ? 'Deleting…' : 'Yes'}
                          </button>
                          <span className="text-rose-300">·</span>
                          <button
                            type="button"
                            className="hover:underline"
                            onClick={() => setDeleteConfirmId(null)}
                          >
                            No
                          </button>
                        </div>
                      )}
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

    {/* Reminder-edit picker — portalled to body, identical layout to mention picker */}
    {reminderEditPicker && typeof document !== 'undefined' && createPortal(
      <div
        ref={reminderEditPickerRef}
        className="fixed bg-white border border-[#e5e7eb] rounded-sm shadow-2xl flex flex-col overflow-hidden"
        style={{
          zIndex: 999999,
          width: 320,
          ...(() => {
            const rect = reminderEditPicker.anchorEl.getBoundingClientRect()
            return rect.top > window.innerHeight / 2
              ? { bottom: window.innerHeight - rect.top + 8, right: window.innerWidth - rect.right }
              : { top: rect.bottom + 8, right: window.innerWidth - rect.right }
          })()
        }}
      >
        {/* Header — matches mention picker exactly */}
        <div className="flex items-center gap-2 px-3 py-2.5 bg-primary/5 border-b border-primary/10">
          <AtSign className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-xs font-semibold text-[#1b1b1d]">Edit reminder</span>
        </div>
        {/* Disabled search box */}
        <div className="px-3 pt-2.5 pb-2">
          <input
            disabled
            placeholder="Search members…"
            className="w-full text-xs rounded-sm border border-[#e5e7eb] bg-[#f3f4f6] px-2.5 py-1.5 outline-none opacity-50 cursor-not-allowed"
          />
        </div>
        {/* Member list — checked, non-interactive */}
        <div className="overflow-y-auto border-t border-[#f0f0f2]" style={{ maxHeight: 180 }}>
          {reminderEditPicker.mentionedNames.map((name, ni) => {
            const initials = name.replace('@', '').split(/\s+/).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
            return (
              <div key={ni} className="flex items-center gap-2.5 px-3 py-2.5 bg-primary/5 select-none">
                <span className="h-4 w-4 rounded border border-primary bg-primary flex items-center justify-center shrink-0">
                  <Check className="h-3 w-3 text-white" strokeWidth={2.5} />
                </span>
                <div className="h-7 w-7 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-[11px] font-bold border border-primary/30">
                  <div className="h-full w-full flex items-center justify-center bg-primary/10 text-primary">{initials}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold truncate text-primary">{name.replace('@', '')}</div>
                  <div className="text-[10px] text-[#9a9ba0]">Mentioned</div>
                </div>
                <span className="text-[9px] font-semibold text-[#9a9ba0] uppercase tracking-wide shrink-0">Locked</span>
              </div>
            )
          })}
        </div>
        {/* Reminder footer — identical to mention picker footer */}
        <div className="px-3 pt-2.5 pb-3 border-t border-[#e5e7eb] bg-[#f9f9fb] flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#45474c]">
              Remind on <span className="font-normal normal-case tracking-normal">(optional)</span>
            </span>
          </div>
          <DateTimePicker
            value={reminderEditPicker.existingDate}
            onChange={(val) => setReminderEditPicker((prev) => prev ? { ...prev, existingDate: val } : prev)}
            placeholder="No date — notify now"
            defaultTime="09:00"
            allowFutureDateTimes={true}
          />
          <div className="flex justify-end pt-0.5">
            <button type="button"
              onClick={() => {
                const dateVal = reminderEditPicker.existingDate || null
                fetch(`/api/projects/${engagementId}/documents/${documentId}/doc-comments`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ messageId: reminderEditPicker.messageId, dateValue: dateVal }),
                }).catch(() => {})
                setReminderEditPicker(null)
              }}
              className="text-xs font-semibold text-white bg-primary hover:bg-primary/90 px-4 py-1.5 rounded-sm transition-colors">
              Done
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
    </div>
  )
}
