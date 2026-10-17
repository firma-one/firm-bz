'use client'

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUpDown, AtSign, BellRing, CalendarClock, Check, Link2, Loader2, MessagesSquare, Send, Smile, Trash2, UserCheck, Users, X } from 'lucide-react'
import { cn, formatDateTimeWithTZ, formatRelativeTime } from '@/lib/utils'
import { useRightPane } from '@/lib/right-pane-context'
import { useAuth } from '@/lib/auth-context'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Hint,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { SetupReminderModal } from '@/components/ui/setup-reminder-modal'
import { FilterMenuLabel, FilterMenuRow, FilterPill, summarizePicks } from '@/components/ui/filter-pill'
import { PersonAvatar } from '@/components/ui/property-cells'
import { ENGAGEMENT_ROLE_LABEL, findMentionQuery, insertMention, mentionedNames, splitMentions } from '@/lib/comments/mentions'

/*
 * Comments on a document or deliverable (.claude/plans/board-pane-comments-redesign.md). Shared
 * by the deliverable pane's Comments tab, the Files comments pane and the document menu.
 *
 * - Mentions: typing "@" opens a menu at the caret that narrows as you type; picking inserts
 *   "@Name " where you were typing. People still mentioned when the comment is sent are notified.
 * - Reminders: the composer's Remind button schedules that notification for everyone mentioned.
 * - The thread: avatar and name (email on hover), relative time, actions on hover; filters and
 *   sorting in one compact row, once a thread is long enough to need them.
 */

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

type Member = { userId: string; email: string; name: string; role: string; avatarUrl?: string | null; isAgent?: boolean }

type ReactionKey = 'urgent' | 'looking' | 'done' | 'thumbs_up' | 'yes' | 'no' | 'ok' | 'plus_one' | 'celebrate'
const REACTIONS: { key: ReactionKey; label: string; emoji: string }[] = [
  { key: 'urgent', label: 'Urgent', emoji: '⚠️' },
  { key: 'looking', label: 'Looking', emoji: '👀' },
  { key: 'done', label: 'Done', emoji: '✅' },
  // Slack-style quick signals
  { key: 'yes', label: 'Yes', emoji: '🇾' },
  { key: 'no', label: 'No', emoji: '🇳' },
  { key: 'ok', label: 'OK', emoji: '🆗' },
  { key: 'plus_one', label: '+1', emoji: '➕' },
  { key: 'thumbs_up', label: 'Thumbs up', emoji: '👍' },
  { key: 'celebrate', label: 'Celebrate', emoji: '🎉' },
]

/** Filters and sorting appear once a thread is longer than this, or when a filter is on. */
const TOOLBAR_AFTER = 3

type DatePreset = 'any' | '7d' | '30d'
const DATE_PRESETS: { value: DatePreset; label: string; days: number | null }[] = [
  { value: 'any', label: 'Any time', days: null },
  { value: '7d', label: 'Last 7 days', days: 7 },
  { value: '30d', label: 'Last 30 days', days: 30 },
]

/** Format a raw auth name (may be username-style like "deepaksshettigar") into a readable display name. */
function formatDisplayName(name: string, email: string): string {
  if (!name || name === email.split('@')[0]) {
    const local = email.split('@')[0]
    return local.replace(/[._\-+]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim()
  }
  if (name.includes(' ') || name.includes('.') || name.includes('_')) {
    return name.split(/[\s._-]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').trim()
  }
  return name
}

/** 9:00 AM local, `days` from today — the reminder presets. */
function nineAm(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}
function nextMondayNineAm(): string {
  const d = new Date()
  const add = ((8 - d.getDay()) % 7) || 7
  return nineAm(add)
}
const shortDateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/**
 * Where the caret sits inside a textarea, in px from its top-left — measured with a mirror div
 * styled like the textarea, so the mention menu can open right where "@" was typed.
 */
function caretOffset(el: HTMLTextAreaElement, position: number): { left: number; top: number } {
  const style = window.getComputedStyle(el)
  const mirror = document.createElement('div')
  const props = ['boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textTransform'] as const
  for (const p of props) mirror.style[p] = style[p]
  mirror.style.position = 'absolute'
  mirror.style.visibility = 'hidden'
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.overflowWrap = 'break-word'
  mirror.textContent = el.value.slice(0, position)
  const marker = document.createElement('span')
  marker.textContent = '​'
  mirror.appendChild(marker)
  document.body.appendChild(mirror)
  const offset = { left: marker.offsetLeft, top: marker.offsetTop - el.scrollTop }
  document.body.removeChild(mirror)
  return offset
}

export function DocumentDocCommentsPane({ engagementId, documentId, documentName, documentMimeType }: DocumentDocCommentsPaneProps) {
  const rightPane = useRightPane()
  const { user } = useAuth()
  const myEmail = user?.email ?? ''
  const [messages, setMessages] = useState<CommentMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newContent, setNewContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [firmMembers, setFirmMembers] = useState<Member[]>([])
  const [reminderModal, setReminderModal] = useState<{ messageId: string; content: string } | null>(null)
  // Map of userId → { reminderId, dateValue } for already-set reminders on this comment
  const [existingReminders, setExistingReminders] = useState<Map<string, { reminderId: string; dateValue: string | null }>>(new Map())
  // messageId → when its reminder is due, for comments with a dated reminder (they show a bell).
  // A mention alone notifies at once and is stored as a reminder with no date: no bell for that.
  const [reminderDates, setReminderDates] = useState<Map<string, string>>(new Map())

  // ── Mentions and reminders in the composer ─────────────────────────────────
  type MentionedUser = { userId: string; name: string; avatarUrl?: string | null }
  /** Everyone picked from the menu while writing; only those still in the text are notified. */
  const [mentionedUsers, setMentionedUsers] = useState<MentionedUser[]>([])
  /** The "@query" being typed at the caret, and where the menu opens. */
  const [mentionQuery, setMentionQuery] = useState<{ start: number; query: string; left: number } | null>(null)
  /** An "@" whose menu was closed with Escape: it stays closed until the caret leaves it. */
  const dismissedAtRef = useRef<number | null>(null)
  const [menuIndex, setMenuIndex] = useState(0)
  /** When to remind the people mentioned; empty = notify them as soon as it is sent. */
  const [remindAt, setRemindAt] = useState('')
  const [remindOpen, setRemindOpen] = useState(false)
  const composerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── Thread filters and view ────────────────────────────────────────────────
  const [mentionsFilterActive, setMentionsFilterActive] = useState(false)
  // messageIds where current user has an active reminder/mention (for filter)
  const [myMentionedMessageIds, setMyMentionedMessageIds] = useState<Set<string>>(new Set())
  // messageIds that have ANY active reminder/mention (blocks delete)
  const [messagesWithAnyMention, setMessagesWithAnyMention] = useState<Set<string>>(new Set())
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const topSentinelRef = useRef<HTMLDivElement>(null)
  const bottomSentinelRef = useRef<HTMLDivElement>(null)

  const [statusKeysFilter, setStatusKeysFilter] = useState<ReactionKey[]>([])
  const [commentorEmailsFilter, setCommentorEmailsFilter] = useState<string[]>([])
  const [datePreset, setDatePreset] = useState<DatePreset>('any')
  const filtersActive = statusKeysFilter.length > 0 || commentorEmailsFilter.length > 0 || datePreset !== 'any' || mentionsFilterActive

  // View: user preference (global, stored in localStorage)
  const COMMENTS_PREFS_KEY = 'fm_comments_view_prefs_v1'
  const [sortOrder, setSortOrder] = useState<'latestLast' | 'latestFirst'>('latestLast')
  const [hideOlderMessages, setHideOlderMessages] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(COMMENTS_PREFS_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as { sortOrder?: 'latestLast' | 'latestFirst'; hideOlderMessages?: boolean }
      if (parsed.sortOrder === 'latestLast' || parsed.sortOrder === 'latestFirst') setSortOrder(parsed.sortOrder)
      if (typeof parsed.hideOlderMessages === 'boolean') setHideOlderMessages(parsed.hideOlderMessages)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(COMMENTS_PREFS_KEY, JSON.stringify({ sortOrder, hideOlderMessages }))
    } catch {
      // ignore
    }
  }, [sortOrder, hideOlderMessages])

  // Engagement members: who can be mentioned, and the names and faces in the thread.
  useEffect(() => {
    fetch(`/api/projects/${engagementId}/members`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        const members: Member[] = (data?.members ?? [])
          .filter((m: any) => m.userId && m.email)
          .map((m: any) => ({ userId: m.userId, email: m.email, name: m.name ?? m.email.split('@')[0], role: m.role ?? '', avatarUrl: m.avatarUrl ?? null, isAgent: !!m.isAgent }))
        setFirmMembers(members)
      })
      .catch(() => {})
  }, [engagementId])

  const memberById = useMemo(() => new Map(firmMembers.map((m) => [m.userId, m])), [firmMembers])
  const memberByEmail = useMemo(() => new Map(firmMembers.map((m) => [m.email.toLowerCase(), m])), [firmMembers])
  const displayNameOf = useCallback((m: Member) => formatDisplayName(m.name, m.email), [])
  /** Every name a mention can be written with, for finding mentions in comments. */
  const knownNames = useMemo(() => firmMembers.flatMap((m) => [displayNameOf(m), m.name]).filter(Boolean), [firmMembers, displayNameOf])

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

  // Which comments the current user is mentioned in (for the Mentions me filter)
  const fetchMyMentions = useCallback(async () => {
    if (!user?.id) return
    try {
      const res = await fetch(`/api/projects/${engagementId}/doc-comments?filter=mentions`)
      if (!res.ok) return
      const data = await res.json()
      setMyMentionedMessageIds(new Set<string>((data.mentions ?? []).map((m: any) => m.messageId as string)))
    } catch {
      // non-blocking
    }
  }, [engagementId, user?.id])

  // Every mention is a reminder record (no date = notified at once). Comments with any record
  // cannot be deleted; only those with a date show the bell.
  const refreshMessagesWithAnyMention = useCallback(async (msgs: CommentMessage[]) => {
    if (msgs.length === 0) { setMessagesWithAnyMention(new Set()); setReminderDates(new Map()); return }
    const results = await Promise.allSettled(
      msgs.map((m) =>
        fetch(`/api/projects/${engagementId}/documents/${documentId}/doc-comments/reminders?messageId=${encodeURIComponent(m.id)}`)
          .then((r) => r.ok ? r.json() : null)
          .then((d) => ({ id: m.id, reminders: (d?.reminders ?? []) as { dateValue: string | null }[] }))
      )
    )
    const withMention = new Set<string>()
    const dates = new Map<string, string>()
    for (const r of results) {
      if (r.status !== 'fulfilled' || r.value.reminders.length === 0) continue
      withMention.add(r.value.id)
      const due = r.value.reminders.map((x) => x.dateValue).filter((d): d is string => Boolean(d)).sort()[0]
      if (due) dates.set(r.value.id, due)
    }
    setMessagesWithAnyMention(withMention)
    setReminderDates(dates)
  }, [engagementId, documentId])

  useEffect(() => { fetchMessages() }, [fetchMessages])
  useEffect(() => { fetchMyMentions() }, [fetchMyMentions])
  useEffect(() => {
    if (!loading) refreshMessagesWithAnyMention(messages)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, messages.length])

  // Keyboard friendly: focus composer on open
  useEffect(() => { textareaRef.current?.focus() }, [engagementId, documentId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') rightPane.clearPane()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [rightPane])

  // ── Composer ───────────────────────────────────────────────────────────────

  /** People picked from the menu who are still mentioned in the text. */
  const currentMentions = useMemo(
    () => mentionedUsers.filter((u) => mentionedNames(newContent, [u.name]).length > 0),
    [mentionedUsers, newContent],
  )

  // Grows with the text, up to about eight lines; then it scrolls.
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 192)}px`
  }, [newContent])

  /** Opens, narrows or closes the mention menu from where the caret is. */
  const syncMentionQuery = useCallback((value: string, caret: number) => {
    const q = findMentionQuery(value, caret)
    if (!q || firmMembers.length === 0) {
      dismissedAtRef.current = null
      setMentionQuery(null)
      return
    }
    if (dismissedAtRef.current === q.start) { setMentionQuery(null); return }
    const el = textareaRef.current
    const left = el ? caretOffset(el, q.start).left : 0
    setMentionQuery((prev) => {
      if (!prev || prev.query !== q.query || prev.start !== q.start) setMenuIndex(0)
      return { ...q, left }
    })
  }, [firmMembers.length])

  const mentionCandidates = useMemo(() => {
    if (!mentionQuery) return []
    const q = mentionQuery.query.toLowerCase()
    const people = firmMembers.filter((m) => m.userId !== user?.id && !m.isAgent)
    const rank = (m: Member) => {
      const name = displayNameOf(m).toLowerCase()
      if (!q) return 0
      if (name.startsWith(q)) return 0
      if (name.split(/\s+/).some((w) => w.startsWith(q))) return 1
      if (name.includes(q) || m.email.toLowerCase().startsWith(q)) return 2
      return -1
    }
    return people
      .map((m) => ({ m, r: rank(m) }))
      .filter((x) => x.r >= 0)
      .sort((a, b) => a.r - b.r || displayNameOf(a.m).localeCompare(displayNameOf(b.m)))
      .slice(0, 8)
      .map((x) => x.m)
  }, [mentionQuery, firmMembers, user?.id, displayNameOf])

  const pickMention = (member: Member) => {
    const el = textareaRef.current
    if (!mentionQuery || !el) return
    const name = displayNameOf(member)
    const caret = el.selectionStart ?? newContent.length
    const next = insertMention(newContent, mentionQuery.start, caret, name)
    setNewContent(next.text)
    setMentionedUsers((prev) => prev.some((u) => u.userId === member.userId) ? prev : [...prev, { userId: member.userId, name, avatarUrl: member.avatarUrl }])
    setMentionQuery(null)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(next.caret, next.caret)
    })
  }

  /** The @ button: types an "@" at the caret, which opens the menu. */
  const startMention = () => {
    const el = textareaRef.current
    if (!el) return
    const caret = el.selectionStart ?? newContent.length
    const needsSpace = caret > 0 && !/\s/.test(newContent[caret - 1])
    const insert = `${needsSpace ? ' ' : ''}@`
    const value = newContent.slice(0, caret) + insert + newContent.slice(caret)
    setNewContent(value)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(caret + insert.length, caret + insert.length)
      syncMentionQuery(value, caret + insert.length)
    })
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const content = newContent.trim()
    if (!content || submitting) return
    const recipients = currentMentions
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
      const newMsg = data.message
      setMessages((prev) => [...prev, newMsg])
      setNewContent('')
      setMentionQuery(null)

      // Notify everyone still mentioned: now, or on the reminder date.
      if (recipients.length > 0) {
        const dateVal = remindAt || null
        for (const { userId } of recipients) {
          fetch(`/api/projects/${engagementId}/documents/${documentId}/doc-comments`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageId: newMsg.id, recipientId: userId, dateValue: dateVal }),
          }).catch(() => {})
        }
        // Known here, so set at once: the server writes reminders after it replies, and a refetch
        // could miss them.
        setMessagesWithAnyMention((prev) => new Set(prev).add(newMsg.id))
        if (dateVal) setReminderDates((prev) => new Map(prev).set(newMsg.id, dateVal))
        setTimeout(() => { void fetchMyMentions() }, 500)
      }
      setMentionedUsers([])
      setRemindAt('')
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

  // ── Thread ─────────────────────────────────────────────────────────────────

  const distinctCommentors = useMemo(() => {
    const set = new Set<string>()
    for (const m of messages) if (m.authorEmail) set.add(m.authorEmail)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [messages])

  const authorMember = useCallback((msg: CommentMessage): Member | undefined =>
    (msg.authorUserId ? memberById.get(msg.authorUserId) : undefined)
      ?? (msg.authorEmail ? memberByEmail.get(msg.authorEmail.toLowerCase()) : undefined), [memberById, memberByEmail])
  const authorName = useCallback((msg: CommentMessage) => {
    const member = authorMember(msg)
    if (member) return displayNameOf(member)
    return msg.authorEmail ? formatDisplayName('', msg.authorEmail) : 'Unknown'
  }, [authorMember, displayNameOf])
  const authorAvatar = (msg: CommentMessage) => authorMember(msg)?.avatarUrl ?? null

  const filteredMessages = useMemo(() => {
    const preset = DATE_PRESETS.find((p) => p.value === datePreset)
    const since = preset?.days ? Date.now() - preset.days * 86400000 : null
    return messages.filter((m) => {
      if (mentionsFilterActive && !myMentionedMessageIds.has(m.id)) return false
      if (commentorEmailsFilter.length > 0 && (!m.authorEmail || !commentorEmailsFilter.includes(m.authorEmail))) return false
      if (statusKeysFilter.length > 0 && !statusKeysFilter.some((k) => (m.reactions?.[k]?.count ?? 0) > 0)) return false
      if (since !== null && new Date(m.createdAt).getTime() < since) return false
      return true
    })
  }, [messages, mentionsFilterActive, myMentionedMessageIds, commentorEmailsFilter, statusKeysFilter, datePreset])

  const displayMessages = useMemo(() => (sortOrder === 'latestFirst' ? [...filteredMessages].reverse() : filteredMessages), [filteredMessages, sortOrder])

  const latestCommentId = useMemo(() => {
    if (filteredMessages.length === 0) return null
    let latest = filteredMessages[0]
    for (const m of filteredMessages) if (new Date(m.createdAt).getTime() > new Date(latest.createdAt).getTime()) latest = m
    return latest.id
  }, [filteredMessages])

  const visibleMessages = useMemo(() => {
    if (!hideOlderMessages) return displayMessages
    if (!latestCommentId) return []
    return displayMessages.filter((m) => m.id === latestCommentId)
  }, [displayMessages, hideOlderMessages, latestCommentId])

  const [focusedCommentId, setFocusedCommentId] = useState<string | null>(null)

  // Deep link: #doc-comment:<documentId>:<commentId> scrolls to and highlights that comment.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const h = window.location.hash.replace(/^#/, '')
    if (!h.startsWith('doc-comment:')) return
    const [, docId, commentId] = h.split(':')
    if (!docId || !commentId || docId !== documentId) return
    setFocusedCommentId(commentId)
    let tries = 0
    const tryScroll = () => {
      const el = document.getElementById(`comment-${commentId}`)
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return true }
      return false
    }
    const interval = tryScroll() ? null : window.setInterval(() => {
      tries += 1
      if ((tryScroll() || tries >= 20) && interval !== null) window.clearInterval(interval)
    }, 120)
    const clear = window.setTimeout(() => setFocusedCommentId(null), 4000)
    return () => {
      if (interval !== null) window.clearInterval(interval)
      window.clearTimeout(clear)
    }
  }, [documentId, messages.length])

  // Newest first shows the top of the list; oldest first, the bottom.
  useEffect(() => {
    if (loading) return
    if (sortOrder === 'latestFirst') topSentinelRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' })
    else bottomSentinelRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
  }, [loading, sortOrder, visibleMessages.length])

  /** A comment's text with its mentions drawn as pills (name and email on hover). */
  const renderContentWithMentions = (content: string) =>
    splitMentions(content, knownNames).map((t, i) => {
      if (t.type !== 'mention') return <span key={i}>{t.value}</span>
      const name = t.value.replace(/^@/, '')
      const member = firmMembers.find((m) => displayNameOf(m) === name || m.name === name)
      const pill = <span className="rounded-[4px] bg-action/10 px-1 py-px font-medium text-action">{t.value}</span>
      if (!member) return <span key={i}>{pill}</span>
      return (
        <Tooltip key={i}>
          <TooltipTrigger asChild>{pill}</TooltipTrigger>
          <TooltipContent side="top" className="z-[9999] border border-line bg-surface p-2 text-xs text-fg shadow-popover">
            <div className="flex items-center gap-2">
              <PersonAvatar person={{ name: displayNameOf(member), avatarUrl: member.avatarUrl }} size={28} />
              <div>
                <div className="font-semibold">{displayNameOf(member)}</div>
                <div className="text-caption text-fg-subtle">{member.email}</div>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      )
    })

  // Setting or changing a posted comment's reminder date (from its bell, or "Remind" on hover).
  const [reminderEditPicker, setReminderEditPicker] = useState<{
    messageId: string
    anchorEl: HTMLElement
    existingDate: string
    /** The date it had when opened: '' for a mention with no reminder yet. */
    savedDate: string
    mentionedNames: string[]
    recipientIds: string[]
    saving?: boolean
    error?: string
  } | null>(null)
  const reminderEditPickerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!reminderEditPicker) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if ((target as Element)?.closest?.('[data-radix-popper-content-wrapper]')) return
      if (reminderEditPickerRef.current && !reminderEditPickerRef.current.contains(target)) setReminderEditPicker(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [reminderEditPicker])

  const updateReactionOptimistic = useCallback(
    (messageId: string, emojiKey: ReactionKey, action: 'add' | 'remove') => {
      if (!myEmail) return
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m
          const current = m.reactions ?? {}
          const users = current[emojiKey]?.users ?? []
          const nextUsers = action === 'add' ? (users.includes(myEmail) ? users : [...users, myEmail]) : users.filter((e) => e !== myEmail)
          return { ...m, reactions: { ...current, [emojiKey]: { count: nextUsers.length, users: nextUsers } } }
        })
      )
    },
    [myEmail]
  )

  const toggleReaction = useCallback(
    async (messageId: string, emojiKey: ReactionKey, action: 'add' | 'remove') => {
      updateReactionOptimistic(messageId, emojiKey, action)
      const res = await fetch(`/api/projects/${engagementId}/documents/${documentId}/doc-comments/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, emojiKey, action }),
      })
      if (!res.ok) updateReactionOptimistic(messageId, emojiKey, action === 'add' ? 'remove' : 'add')
    },
    [engagementId, documentId, updateReactionOptimistic]
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
    void refreshMessagesWithAnyMention(messages)
  }

  const openReminderEdit = (msg: CommentMessage, btn: HTMLElement) => {
    const names = splitMentions(msg.content, knownNames).filter((t) => t.type === 'mention').map((t) => t.value)
    // The people to remind are the ones the comment notified; failing that, its mentions by name.
    const byName = firmMembers
      .filter((m) => !m.isAgent && names.some((n) => n.replace(/^@/, '') === displayNameOf(m) || n.replace(/^@/, '') === m.name))
      .map((m) => m.userId)
    const savedDate = reminderDates.get(msg.id) ?? ''
    const open = (recipientIds: string[]) =>
      setReminderEditPicker({ messageId: msg.id, anchorEl: btn, existingDate: savedDate, savedDate, mentionedNames: names, recipientIds })
    fetch(`/api/projects/${engagementId}/documents/${documentId}/doc-comments/reminders?messageId=${encodeURIComponent(msg.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const ids = ((data?.reminders ?? []) as { userId: string }[]).map((r) => r.userId)
        open(ids.length > 0 ? ids : byName)
      })
      .catch(() => open(byName))
  }

  /** Saves the reminder date for everyone the comment mentions; null clears it. */
  const saveReminderDate = async (dateValue: string | null) => {
    const picker = reminderEditPicker
    if (!picker) return
    setReminderEditPicker({ ...picker, saving: true, error: undefined })
    const results = await Promise.allSettled(picker.recipientIds.map((recipientId) =>
      fetch(`/api/projects/${engagementId}/documents/${documentId}/doc-comments`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: picker.messageId, recipientId, dateValue }),
      }).then((res) => { if (!res.ok) throw new Error('Failed') })
    ))
    if (picker.recipientIds.length === 0 || results.some((r) => r.status === 'rejected')) {
      setReminderEditPicker((prev) => (prev ? { ...prev, saving: false, error: 'Couldn’t save the reminder. Try again.' } : prev))
      return
    }
    setReminderDates((prev) => {
      const next = new Map(prev)
      if (dateValue) next.set(picker.messageId, dateValue)
      else next.delete(picker.messageId)
      return next
    })
    setReminderEditPicker(null)
  }

  // ── Pieces ─────────────────────────────────────────────────────────────────

  const toolbar = (messages.length > TOOLBAR_AFTER || filtersActive) && (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line pb-2">
      <span className="mr-auto text-small tabular-nums text-fg-muted">
        {filtersActive ? `${filteredMessages.length} of ${messages.length}` : messages.length} comment{messages.length === 1 ? '' : 's'}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <FilterPill icon={<Users />} label="People" value={commentorEmailsFilter.length ? summarizePicks(commentorEmailsFilter.map((e) => formatDisplayName(memberByEmail.get(e.toLowerCase())?.name ?? '', e))) : undefined} onClear={() => setCommentorEmailsFilter([])} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[240px] p-1">
          <FilterMenuLabel>Commented by</FilterMenuLabel>
          {distinctCommentors.map((email) => (
            <FilterMenuRow key={email} multi selected={commentorEmailsFilter.includes(email)} onSelect={() => setCommentorEmailsFilter((l) => (l.includes(email) ? l.filter((x) => x !== email) : [...l, email]))}>
              {formatDisplayName(memberByEmail.get(email.toLowerCase())?.name ?? '', email)}
            </FilterMenuRow>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <FilterPill icon={<Smile />} label="Reaction" value={statusKeysFilter.length ? summarizePicks(statusKeysFilter.map((k) => REACTIONS.find((r) => r.key === k)?.label ?? k)) : undefined} onClear={() => setStatusKeysFilter([])} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[200px] p-1">
          <FilterMenuLabel>Has reaction</FilterMenuLabel>
          {REACTIONS.map((r) => (
            <FilterMenuRow key={r.key} multi selected={statusKeysFilter.includes(r.key)} onSelect={() => setStatusKeysFilter((l) => (l.includes(r.key) ? l.filter((x) => x !== r.key) : [...l, r.key]))}>
              <span className="mr-1">{r.emoji}</span>{r.label}
            </FilterMenuRow>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <FilterPill icon={<CalendarClock />} label="Date" value={datePreset !== 'any' ? DATE_PRESETS.find((p) => p.value === datePreset)?.label : undefined} onClear={() => setDatePreset('any')} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[180px] p-1">
          <FilterMenuLabel>Posted</FilterMenuLabel>
          {DATE_PRESETS.map((p) => (
            <FilterMenuRow key={p.value} selected={datePreset === p.value} onSelect={() => setDatePreset(p.value)}>{p.label}</FilterMenuRow>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {myMentionedMessageIds.size > 0 && (
        <FilterPill icon={<UserCheck />} label="Mentions me" value={mentionsFilterActive ? 'On' : undefined} onClick={() => setMentionsFilterActive((v) => !v)} onClear={() => setMentionsFilterActive(false)} />
      )}
      <DropdownMenu>
        <Hint label="Sort">
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Sort comments" className="flex h-7 w-7 items-center justify-center rounded-control text-fg-subtle hover:bg-surface-hover hover:text-fg-muted">
              <ArrowUpDown className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
        </Hint>
        <DropdownMenuContent align="end" className="w-[200px] p-1">
          <FilterMenuLabel>Order</FilterMenuLabel>
          <FilterMenuRow selected={sortOrder === 'latestLast'} onSelect={() => setSortOrder('latestLast')}>Oldest first</FilterMenuRow>
          <FilterMenuRow selected={sortOrder === 'latestFirst'} onSelect={() => setSortOrder('latestFirst')}>Newest first</FilterMenuRow>
          <DropdownMenuSeparator className="mx-0 my-1" />
          <FilterMenuRow multi selected={hideOlderMessages} onSelect={() => setHideOlderMessages((v) => !v)}>Only the latest</FilterMenuRow>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )

  const remindNames = currentMentions.map((u) => u.name.split(/\s+/)[0])

  // The text box and the chip layer behind it share this box exactly (padding, type, wrapping,
  // scrollbar gutter), so each chip sits under its name.
  const COMPOSER_TEXT = 'max-h-48 w-full overflow-y-auto whitespace-pre-wrap break-words px-3 pb-1 pt-2.5 text-ui leading-relaxed [scrollbar-gutter:stable]'
  const backdropRef = useRef<HTMLDivElement>(null)
  /** The composer's text with the mentions of people who will be notified marked, for the chips. */
  const backdropSegments = useMemo(
    () => splitMentions(newContent, currentMentions.map((u) => u.name)),
    [newContent, currentMentions],
  )
  const Composer = (
    <form onSubmit={handleSubmit} className="flex shrink-0 flex-col gap-1.5">
      {/* The reminder, as a chip, before it is sent. */}
      {remindAt && currentMentions.length > 0 && (
        <div className="flex">
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-control bg-tag-orange-bg py-0.5 pl-2 pr-1 text-caption text-tag-orange-fg">
            <BellRing className="h-3 w-3 shrink-0" />
            <span className="truncate">Remind {remindNames.join(', ')} · {shortDateTime(remindAt)}</span>
            <button type="button" onClick={() => setRemindAt('')} aria-label="Remove reminder" className="rounded-[4px] p-0.5 hover:bg-tag-orange-fg/10">
              <X className="h-3 w-3" />
            </button>
          </span>
        </div>
      )}
      <div
        ref={composerRef}
        className={cn(
          'relative rounded-control border border-line-strong bg-surface focus-within:border-action/60 focus-within:ring-2 focus-within:ring-action/20',
          submitting && 'opacity-60',
        )}
      >
        {/* Chips behind the mentioned names (react-mentions' approach): this layer mirrors the text
            box's text, transparent, and only the mention backgrounds show through the text box. */}
        <div ref={backdropRef} aria-hidden className={cn(COMPOSER_TEXT, 'pointer-events-none absolute inset-x-0 top-0 overflow-hidden text-transparent')}>
          {backdropSegments.map((t, i) => t.type === 'mention'
            ? <mark key={i} className="-mx-0.5 rounded-[4px] bg-action/15 px-0.5 text-transparent [box-decoration-break:clone]">{t.value}</mark>
            : <span key={i}>{t.value}</span>)}
          {/* A trailing new line needs a character to take up its line, as it does in the text box. */}
          {newContent.endsWith('\n') && '\u200b'}
        </div>
        <textarea
          ref={textareaRef}
          value={newContent}
          rows={1}
          onScroll={(e) => { if (backdropRef.current) backdropRef.current.scrollTop = e.currentTarget.scrollTop }}
          disabled={submitting}
          placeholder="Leave a comment…"
          aria-label="Comment"
          onChange={(e) => {
            setNewContent(e.target.value)
            syncMentionQuery(e.target.value, e.target.selectionStart ?? e.target.value.length)
          }}
          onClick={(e) => syncMentionQuery(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
          onKeyUp={(e) => {
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) syncMentionQuery(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)
          }}
          onBlur={() => window.setTimeout(() => setMentionQuery(null), 120)}
          onKeyDown={(e) => {
            const menuOpen = !!mentionQuery
            if (menuOpen && mentionCandidates.length > 0) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setMenuIndex((i) => (i + 1) % mentionCandidates.length); return }
              if (e.key === 'ArrowUp') { e.preventDefault(); setMenuIndex((i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length); return }
              if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || e.key === 'Tab') {
                e.preventDefault()
                pickMention(mentionCandidates[Math.min(menuIndex, mentionCandidates.length - 1)])
                return
              }
            }
            if (menuOpen && e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              dismissedAtRef.current = mentionQuery!.start
              setMentionQuery(null)
              return
            }
            // ⌘↵ / Ctrl↵ sends; Enter alone is a new line.
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void handleSubmit()
            }
          }}
          className={cn(COMPOSER_TEXT, 'relative block resize-none bg-transparent text-fg outline-none placeholder:text-fg-subtle disabled:cursor-not-allowed')}
        />
        <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
          <Hint label="Mention someone (@)">
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={startMention} aria-label="Mention someone" className="flex h-7 w-7 items-center justify-center rounded-control text-fg-subtle hover:bg-surface-hover hover:text-fg-muted">
              <AtSign className="h-3.5 w-3.5" />
            </button>
          </Hint>
          <Popover open={remindOpen} onOpenChange={setRemindOpen}>
            <Hint label={currentMentions.length > 0 ? 'Remind the people you mention' : 'Mention someone to set a reminder'}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  disabled={currentMentions.length === 0}
                  aria-label="Remind"
                  className={cn('inline-flex h-7 items-center gap-1 rounded-control px-1.5 text-small hover:bg-surface-hover disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent', remindAt ? 'text-tag-orange-fg' : 'text-fg-subtle hover:text-fg-muted')}
                >
                  <BellRing className="h-3.5 w-3.5" />
                  <span>Remind…</span>
                </button>
              </PopoverTrigger>
            </Hint>
            <PopoverContent align="start" side="top" className="w-64 p-1.5">
              <p className="px-1.5 pb-1 pt-0.5 text-caption text-fg-subtle">Remind {remindNames.join(', ') || 'them'}</p>
              {[
                { label: 'Tomorrow, 9:00 AM', value: () => nineAm(1) },
                { label: 'In 3 days, 9:00 AM', value: () => nineAm(3) },
                { label: 'Next Monday, 9:00 AM', value: nextMondayNineAm },
              ].map((p) => (
                <button key={p.label} type="button" onClick={() => { setRemindAt(p.value()); setRemindOpen(false) }} className="flex h-8 w-full items-center rounded-control px-2 text-left text-small text-fg hover:bg-surface-hover">
                  {p.label}
                </button>
              ))}
              <div className="mt-1 border-t border-line px-0.5 pt-1.5">
                <DateTimePicker value={remindAt} onChange={(v) => setRemindAt(v)} placeholder="Pick a date and time" defaultTime="09:00" allowPastDateTimes={false} />
              </div>
              {remindAt && (
                <button type="button" onClick={() => { setRemindAt(''); setRemindOpen(false) }} className="mt-1 flex h-8 w-full items-center gap-2 rounded-control px-2 text-small text-fg-muted hover:bg-surface-hover">
                  <X className="h-3.5 w-3.5" /> No reminder — notify now
                </button>
              )}
            </PopoverContent>
          </Popover>
          <span className="ml-auto hidden pr-1.5 text-caption text-fg-subtle sm:inline">⌘↵ to send</span>
          <button
            type="submit"
            disabled={submitting || !newContent.trim()}
            aria-label="Send comment"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-action text-action-fg transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* The mention menu: just above the composer, where "@" was typed. */}
        {mentionQuery && (
          <div
            role="listbox"
            aria-label="Mention someone"
            className="absolute bottom-full z-[200] mb-1.5 w-64 overflow-hidden rounded-card border border-line bg-surface p-1 shadow-popover"
            style={{ left: Math.max(0, Math.min(mentionQuery.left, (composerRef.current?.clientWidth ?? 260) - 260)) }}
          >
            {mentionCandidates.length === 0 ? (
              <p className="px-2 py-1.5 text-small text-fg-subtle">No one matches “{mentionQuery.query}”</p>
            ) : mentionCandidates.map((m, idx) => (
              <button
                key={m.userId}
                type="button"
                role="option"
                aria-selected={idx === menuIndex}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setMenuIndex(idx)}
                onClick={() => pickMention(m)}
                className={cn('flex h-9 w-full items-center gap-2 rounded-control px-2 text-left', idx === menuIndex && 'bg-surface-hover')}
              >
                <PersonAvatar person={{ name: displayNameOf(m), avatarUrl: m.avatarUrl }} size={22} />
                <span className="min-w-0 flex-1 truncate text-small text-fg">{displayNameOf(m)}</span>
                {ENGAGEMENT_ROLE_LABEL[m.role] && <span className="shrink-0 text-caption text-fg-subtle">{ENGAGEMENT_ROLE_LABEL[m.role]}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </form>
  )

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3 p-4">
      <TooltipProvider>
        {error && <div className="shrink-0 rounded-card bg-tag-red-bg px-3 py-2 text-small text-tag-red-fg">{error}</div>}
        {toolbar}

        {sortOrder === 'latestFirst' ? Composer : null}

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div ref={topSentinelRef} />
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-small text-fg-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading comments…
            </div>
          ) : visibleMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-small text-fg-muted">
              <MessagesSquare className="h-6 w-6 text-fg-subtle" />
              {messages.length === 0 ? 'No comments yet. Start the conversation below.' : 'No comments match these filters.'}
            </div>
          ) : (
            <div className="flex flex-col">
              {visibleMessages.map((msg) => {
                const isMine = msg.authorUserId === user?.id
                const isLastMsg = messages[messages.length - 1]?.id === msg.id
                const hasMention = messagesWithAnyMention.has(msg.id)
                const mentionedMe = myMentionedMessageIds.has(msg.id)
                // Delete only if: my message, last in the thread, no active reminders/mentions.
                const canDelete = isMine && isLastMsg && !hasMention
                const isConfirmingDelete = deleteConfirmId === msg.id
                const name = authorName(msg)
                const reacted = REACTIONS.filter((r) => (msg.reactions?.[r.key]?.count ?? 0) > 0)
                return (
                  <div
                    key={msg.id}
                    id={`comment-${msg.id}`}
                    className={cn(
                      'group relative flex gap-2.5 rounded-control px-2 py-2.5 transition-colors hover:bg-surface-hover',
                      focusedCommentId === msg.id && 'bg-surface-selected',
                      mentionedMe && 'shadow-[inset_2px_0_0_hsl(var(--ui-action))]',
                    )}
                  >
                    <div className="pt-0.5"><PersonAvatar person={{ name, avatarUrl: authorAvatar(msg) }} size={24} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 pr-24">
                        <Hint label={msg.authorEmail ?? name}>
                          <span className="truncate text-small font-medium text-fg">{name}</span>
                        </Hint>
                        <Hint label={formatDateTimeWithTZ(msg.createdAt)}>
                          <span className="shrink-0 cursor-default text-caption text-fg-subtle">{formatRelativeTime(msg.createdAt)}</span>
                        </Hint>
                        {/* The reminder is state, not an action: it stays visible. */}
                        {reminderDates.has(msg.id) && (() => {
                          const due = reminderDates.get(msg.id)!
                          const when = `${new Date(due) > new Date() ? 'Reminder' : 'Reminded'} ${shortDateTime(due)}`
                          // Only the comment's author changes its reminder; others see when it is.
                          return isMine ? (
                            <Hint label={`${when} — click to change`}>
                              <button type="button" aria-label="Edit reminder" onClick={(e) => openReminderEdit(msg, e.currentTarget)} className="inline-flex h-5 w-5 shrink-0 items-center justify-center self-center rounded-[4px] text-tag-orange-fg hover:bg-tag-orange-bg">
                                <BellRing className="h-3 w-3" />
                              </button>
                            </Hint>
                          ) : (
                            <Hint label={when}>
                              <span aria-label={when} className="inline-flex h-5 w-5 shrink-0 items-center justify-center self-center text-tag-orange-fg">
                                <BellRing className="h-3 w-3" />
                              </span>
                            </Hint>
                          )
                        })()}
                      </div>
                      <p className="mt-0.5 max-w-[700px] whitespace-pre-wrap break-words text-ui leading-[1.6] text-fg">
                        {renderContentWithMentions(msg.content)}
                      </p>
                      {reacted.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          {reacted.map((r) => {
                            const users = msg.reactions?.[r.key]?.users ?? []
                            const reactedByMe = Boolean(myEmail && users.includes(myEmail))
                            return (
                              <Tooltip key={r.key}>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => void toggleReaction(msg.id, r.key, reactedByMe ? 'remove' : 'add')}
                                    className={cn('inline-flex h-6 items-center gap-1 rounded-full border px-2 text-caption tabular-nums transition-colors', reactedByMe ? 'border-action/30 bg-action/10 text-action' : 'border-line bg-surface text-fg-muted hover:bg-surface-hover')}
                                  >
                                    <span className="leading-none">{r.emoji}</span>{users.length}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="z-[9999] max-w-[240px] border border-line bg-surface p-2 text-caption text-fg-muted shadow-popover">
                                  <div className="mb-1 font-medium text-fg">{r.label}</div>
                                  <ul className="max-h-[140px] space-y-0.5 overflow-y-auto">
                                    {users.map((email) => <li key={email} className="truncate">{formatDisplayName(memberByEmail.get(email.toLowerCase())?.name ?? '', email)}</li>)}
                                  </ul>
                                </TooltipContent>
                              </Tooltip>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Actions on hover (or keyboard focus), top-right. */}
                    <div className={cn(
                      'absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-control border border-line bg-surface p-0.5 shadow-sm transition-opacity',
                      isConfirmingDelete ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 group-hover:opacity-100',
                    )}>
                      {isConfirmingDelete ? (
                        <span className="inline-flex items-center gap-1.5 px-1.5 text-caption text-danger">
                          Delete?
                          <button type="button" className="font-semibold hover:underline" disabled={deleting} onClick={() => void handleDeleteComment(msg.id)}>
                            {deleting ? 'Deleting…' : 'Yes'}
                          </button>
                          <span className="text-fg-subtle">·</span>
                          <button type="button" className="hover:underline" onClick={() => setDeleteConfirmId(null)}>No</button>
                        </span>
                      ) : (
                        <>
                          <DropdownMenu>
                            <Hint label="React">
                              <DropdownMenuTrigger asChild>
                                <button type="button" aria-label="Add reaction" className="flex h-6 w-6 items-center justify-center rounded-[4px] text-fg-subtle hover:bg-surface-hover hover:text-fg-muted">
                                  <Smile className="h-3.5 w-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                            </Hint>
                            <DropdownMenuContent align="end" className="w-[156px] p-1.5">
                              <div className="grid grid-cols-3 gap-1">
                                {REACTIONS.map((r) => {
                                  const reactedByMe = Boolean(myEmail && (msg.reactions?.[r.key]?.users ?? []).includes(myEmail))
                                  return (
                                    <Hint key={r.key} label={r.label}>
                                      <button
                                        type="button"
                                        onClick={() => void toggleReaction(msg.id, r.key, reactedByMe ? 'remove' : 'add')}
                                        className={cn('flex h-9 w-9 items-center justify-center rounded-control text-lg leading-none hover:bg-surface-hover', reactedByMe && 'bg-action/10 ring-1 ring-inset ring-action/30')}
                                      >
                                        {r.emoji}
                                      </button>
                                    </Hint>
                                  )
                                })}
                              </div>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          {isMine && hasMention && !reminderDates.has(msg.id) && (
                            <Hint label="Remind the people mentioned">
                              <button type="button" aria-label="Set reminder" onClick={(e) => openReminderEdit(msg, e.currentTarget)} className="flex h-6 w-6 items-center justify-center rounded-[4px] text-fg-subtle hover:bg-surface-hover hover:text-fg-muted">
                                <BellRing className="h-3.5 w-3.5" />
                              </button>
                            </Hint>
                          )}
                          <Hint label="Copy link">
                            <button
                              type="button"
                              aria-label="Copy link to comment"
                              onClick={() => {
                                const base = typeof window !== 'undefined' ? window.location.href.replace(/#.*$/, '') : ''
                                if (base) void navigator.clipboard.writeText(`${base}#doc-comment:${documentId}:${msg.id}`)
                              }}
                              className="flex h-6 w-6 items-center justify-center rounded-[4px] text-fg-subtle hover:bg-surface-hover hover:text-fg-muted"
                            >
                              <Link2 className="h-3.5 w-3.5" />
                            </button>
                          </Hint>
                          {canDelete && (
                            <Hint label="Delete">
                              <button type="button" aria-label="Delete comment" onClick={() => setDeleteConfirmId(msg.id)} className="flex h-6 w-6 items-center justify-center rounded-[4px] text-fg-subtle hover:bg-tag-red-bg hover:text-danger">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </Hint>
                          )}
                        </>
                      )}
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

      {/* Changing a posted comment's reminder date, from its bell. */}
      {reminderEditPicker && typeof document !== 'undefined' && createPortal(
        <div
          ref={reminderEditPickerRef}
          className="fixed flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-popover"
          style={{
            zIndex: 999999,
            width: 280,
            ...(() => {
              const rect = reminderEditPicker.anchorEl.getBoundingClientRect()
              // Centered under the button, but never past either edge of the window: the hover
              // bell sits at the pane's right edge.
              const left = Math.min(Math.max(8, rect.left + rect.width / 2 - 140), window.innerWidth - 280 - 8)
              return rect.top > window.innerHeight / 2
                ? { bottom: window.innerHeight - rect.top + 8, left }
                : { top: rect.bottom + 8, left }
            })(),
          }}
        >
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <BellRing className="h-3.5 w-3.5 text-tag-orange-fg" />
            <span className="flex-1 text-small font-medium text-fg">Reminder</span>
            <button type="button" aria-label="Close" onClick={() => setReminderEditPicker(null)} className="rounded-[4px] p-0.5 text-fg-subtle hover:bg-surface-hover hover:text-fg-muted">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex flex-col gap-2 px-3 py-2.5">
            {reminderEditPicker.mentionedNames.length > 0 && (
              <p className="text-caption text-fg-muted">For {reminderEditPicker.mentionedNames.map((n) => n.replace(/^@/, '')).join(', ')}</p>
            )}
            <DateTimePicker
              value={reminderEditPicker.existingDate}
              onChange={(val) => setReminderEditPicker((prev) => (prev ? { ...prev, existingDate: val } : prev))}
              placeholder="Pick a date and time"
              defaultTime="09:00"
              allowPastDateTimes={false}
            />
            {reminderEditPicker.error && <p className="text-caption text-danger">{reminderEditPicker.error}</p>}
            <div className="flex items-center justify-end gap-1.5">
              {reminderEditPicker.savedDate && (
                <button
                  type="button"
                  disabled={reminderEditPicker.saving}
                  onClick={() => void saveReminderDate(null)}
                  className="mr-auto inline-flex h-7 items-center rounded-control px-2 text-small text-fg-muted hover:bg-surface-hover hover:text-fg disabled:opacity-40"
                >
                  Remove reminder
                </button>
              )}
              <button
                type="button"
                disabled={reminderEditPicker.saving || !reminderEditPicker.existingDate || reminderEditPicker.existingDate === reminderEditPicker.savedDate}
                onClick={() => void saveReminderDate(reminderEditPicker.existingDate)}
                className="inline-flex h-7 items-center gap-1 rounded-control bg-action px-2.5 text-small font-medium text-action-fg hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                {reminderEditPicker.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
