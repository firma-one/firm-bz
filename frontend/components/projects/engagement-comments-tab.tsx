'use client'

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { AtSign, Search, ArrowUpRight, MessagesSquare, Reply, CheckCircle2, RotateCcw } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn, formatFullDate } from '@/lib/utils'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import { PersonAvatar } from '@/components/ui/property-cells'
import { DeliverableIcon } from '@/components/ui/deliverable-icon'
import { DocumentIcon } from '@/components/ui/document-icon'
import { Hint, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useToast } from '@/components/ui/toast'
import { LoadFailed } from '@/components/ui/load-failed'
import { failureFrom, failureReason } from '@/lib/files/action-failure'
import { useRightPane } from '@/lib/right-pane-context'
import { useAuth } from '@/lib/auth-context'
import { CommentText, type CommentPerson } from '@/components/comments/comment-text'
import { DocumentDocCommentsPane, type TaggableDocument } from '@/components/projects/document-doc-comments-pane'
import { ENGAGEMENT_ROLE_LABEL, formatDisplayName } from '@/lib/comments/mentions'
import { canWriteInternalNote } from '@/lib/comments/internal-notes'
import type { TaggedDocument } from '@/lib/comments/tagged-documents'
import { statusOf } from '@/lib/ui/status'
import { DiscussionsSubTabs, useDiscussionsUrlState } from '@/components/projects/discussions-switch'
import { EngagementMemosTab, useEngagementMemos } from '@/components/projects/engagement-memos'

/*
 * The engagement's Discussions page (.claude/plans/board-pane-comments-redesign.md): one row per
 * document with comments — its discussion — showing the latest comment, who wrote it, and whether
 * it's unread. Clicking a row opens the whole discussion, with its composer, in the right pane, where
 * it can be resolved; "Show N earlier" peeks at the last five in place. Views: All (open), Awaiting
 * reply (a client or external collaborator spoke last), Mentions (yours), Resolved.
 *
 * Leads and Full Access contributors get Threads | Memos | RAID above it (discussions-switch.tsx,
 * .claude/plans/brio-features-round-2.md §8): Threads is this page, Memos the engagement's internal
 * memos (engagement-memos.tsx), RAID the log when one is passed in. Everyone else gets this page alone.
 */

const FOLDER_MIME = 'application/vnd.google-apps.folder'

/** How many of a thread's latest comments an opened row shows. */
export const PEEK = 5

export type DocRow = {
  projectDocumentId: string
  documentName: string
  docId: string | null
  /** What the discussion is on: a deliverable shows its folder-plus mark, a file its type icon. */
  kind?: 'deliverable' | 'folder' | 'file'
  mimeType?: string | null
  /** The deliverable a document is in, shown after its name; none for a deliverable itself. */
  deliverable?: { id?: string; docId: string | null; name: string } | null
  count: number
  latest: {
    createdAt: string
    preview: string
    authorUserId: string | null
    authorName: string | null
    authorEmail: string | null
    authorIsExternal?: boolean
    /** The firm's internal note; a client's list never includes one (lib/comments/internal-notes.ts). */
    isInternal?: boolean
  } | null
  /** Resolved discussions leave All and Awaiting reply, for the Resolved view. */
  resolved?: { at: string; byName: string | null } | null
  /** A comment by someone else since the viewer last opened it. */
  unread?: boolean
}

export type CommentsView = 'all' | 'awaiting' | 'mentions' | 'resolved'

/** A discussion's title in its pane: "QSR-9 · Market report", as the thread names its document. */
export function discussionTitle(row: Pick<DocRow, 'docId' | 'documentName'>): string {
  return row.docId ? `${row.docId} · ${row.documentName}` : row.documentName
}

/**
 * The line under a discussion's title: its deliverable's stage and due date ("In review · due Nov 21,
 * 2026"), naming the deliverable when the discussion is on one of its documents.
 */
export function discussionSubtitle(
  kind: DocRow['kind'],
  deliverable: { docId?: string | null; status?: string | null; dueDate?: string | null } | null | undefined,
): string {
  if (!deliverable) return ''
  return [
    kind !== 'deliverable' && deliverable.docId ? `Deliverable ${deliverable.docId}` : null,
    deliverable.status ? statusOf('deliverable', deliverable.status).label : null,
    deliverable.dueDate ? `due ${formatFullDate(deliverable.dueDate)}` : null,
  ].filter(Boolean).join(' · ')
}

/** The role shown beside a client-side author's name (Reviewer, Limited Access); none for the firm's own. */
export function clientRoleLabel(role: string | null | undefined): string | null {
  return role && !canWriteInternalNote(role) ? ENGAGEMENT_ROLE_LABEL[role] ?? null : null
}

/**
 * The page's views — All, Awaiting reply, Mentions, Resolved — as small toggles like the Inbox's,
 * with search on the same row: it looks a discussion up by ID (its document's or its deliverable's)
 * or by a member who wrote or was mentioned in it. Shared with the tour's copy.
 */
export function CommentsToolbar({
  view,
  onView,
  counts,
  query,
  onQuery,
}: {
  view: CommentsView
  onView: (view: CommentsView) => void
  counts: Record<CommentsView, number | null>
  query: string
  onQuery: (query: string) => void
}) {
  const toggle = (id: CommentsView, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => onView(id)}
      aria-pressed={view === id}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-small transition-colors',
        view === id
          ? 'bg-surface-selected text-fg'
          : 'text-fg-muted hover:bg-surface-hover hover:text-fg'
      )}
    >
      {icon}
      {label}
      {/* What's awaiting a reply is state, in the waiting color; other counts stay quiet. */}
      {counts[id] ? <span className={cn('tabular-nums', id === 'awaiting' ? 'font-medium text-status-waiting-fg' : 'text-fg-subtle')}>{counts[id]}</span> : null}
    </button>
  )
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-0.5">
        {toggle('all', <MessagesSquare className="h-3.5 w-3.5" />, 'All')}
        {toggle('awaiting', <Reply className="h-3.5 w-3.5" />, 'Awaiting reply')}
        {toggle('mentions', <AtSign className="h-3.5 w-3.5" />, 'Mentions')}
        {toggle('resolved', <CheckCircle2 className="h-3.5 w-3.5" />, 'Resolved')}
      </div>
      <div className="relative w-60">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-muted" />
        <Input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="ID or member name"
          aria-label="Find discussions by ID or member name"
          className="pl-8"
        />
      </div>
    </div>
  )
}

/**
 * The list after a reload, in the order it was: rows stay where they were, so the one open in the pane
 * doesn't jump when it's read or replied to; rows new to the list go on top, gone ones drop out.
 */
export function keepOrder(prev: DocRow[], next: DocRow[]): DocRow[] {
  const byId = new Map(next.map((r) => [r.projectDocumentId, r]))
  const had = new Set(prev.map((r) => r.projectDocumentId))
  return [...next.filter((r) => !had.has(r.projectDocumentId)), ...prev.flatMap((r) => byId.get(r.projectDocumentId) ?? [])]
}

/** The rows a view shows: open discussions for All and Awaiting reply, resolved ones for Resolved. */
export function rowsInView(rows: DocRow[], view: CommentsView): DocRow[] {
  if (view === 'resolved') return rows.filter((r) => r.resolved)
  const open = rows.filter((r) => !r.resolved)
  return view === 'awaiting' ? open.filter((r) => r.latest?.authorIsExternal) : open
}

/** An empty view's message. */
export function EmptyDiscussions({ view, query }: { view: CommentsView; query: string }) {
  const [icon, title, body] = query.trim()
    ? [<Search key="i" />, `No discussions for “${query.trim()}”`, 'Search finds a discussion by its ID or its deliverable’s, or by a member who wrote or was mentioned in it.']
    : view === 'awaiting'
      ? [<Reply key="i" />, 'Nothing awaiting a reply', 'Discussions where a Limited Access contributor or Reviewer spoke last show up here.']
      : view === 'resolved'
        ? [<CheckCircle2 key="i" />, 'Nothing resolved yet', 'Resolve a discussion from its pane once it’s settled; a new comment reopens it.']
        : [<MessagesSquare key="i" />, 'No discussions yet', 'Comment on any deliverable or document, and its discussion shows up here.']
  return (
    <div className="py-12 text-center">
      <span className="mx-auto mb-2.5 flex h-7 w-7 items-center justify-center text-line [&>svg]:h-7 [&>svg]:w-7">{icon}</span>
      <div className="text-sm font-medium text-fg">{title}</div>
      <div className="text-xs text-fg-muted mt-1">{body}</div>
    </div>
  )
}

type MentionRow = {
  messageId: string
  createdAt: string
  preview: string
  projectDocumentId: string
  documentName: string
  docId?: string | null
  authorUserId?: string | null
}

export type ThreadMessage = { id: string; createdAt: string; authorUserId: string | null; authorEmail: string | null; authorName?: string | null; content: string; isInternal?: boolean }
export type Thread = { status: 'loading' | 'error' | 'ready'; messages: ThreadMessage[]; /** Why it didn't load. */ reason?: string }
type Member = { userId: string; email: string; name: string; avatarUrl: string | null; role: string }

/** How a comment's text is drawn: mentions as pills, document tags as chips. */
export type TextKit = {
  names: string[]
  personFor: (name: string) => CommentPerson | undefined
  docFor: (docId: string) => TaggedDocument | undefined
}

export interface EngagementCommentsTabProps {
  projectId: string
  orgSlug?: string
  boardUrl?: string
  /** The engagement is completed: discussions read, and can't be resolved or reopened. */
  readOnly?: boolean
  /**
   * Threads | Memos | RAID at the top (discussions-switch.tsx): a Lead or a Contributor · Full Access
   * only (hasInternalDiscussions). Without it the page is Threads alone, as it always was: no switch, no
   * counts, and nothing of Memos or RAID in the page.
   */
  internalSubTabs?: boolean
  /** The engagement's path, for opening a memo in Files when storage gives no link. */
  engagementBase?: string
  /**
   * The RAID log's body, shown under the switch once RAID is chosen. Absent: no RAID option. It may put
   * its own controls on the switch's row with DiscussionsBarPortal.
   */
  renderRaid?: () => React.ReactNode
  /** RAID's number on the switch. */
  raidCount?: number
}

export function EngagementCommentsTab({
  internalSubTabs = false,
  engagementBase,
  renderRaid,
  raidCount,
  ...threads
}: EngagementCommentsTabProps) {
  if (!internalSubTabs) return <EngagementThreads {...threads} />
  return <InternalDiscussions {...threads} engagementBase={engagementBase} renderRaid={renderRaid} raidCount={raidCount} />
}

/** Discussions for a Lead or a Contributor · Full Access: the switch, Threads, Memos, and RAID when there is one. */
function InternalDiscussions({
  projectId,
  orgSlug,
  boardUrl,
  readOnly = false,
  engagementBase,
  renderRaid,
  raidCount,
}: Omit<EngagementCommentsTabProps, 'internalSubTabs'>) {
  const { subTab, setSubTab, memoId, setMemoId } = useDiscussionsUrlState(!!renderRaid)
  const [threadsCount, setThreadsCount] = useState<number | null>(null)
  const memos = useEngagementMemos(projectId)

  return (
    <>
      <DiscussionsSubTabs
        value={subTab}
        onChange={setSubTab}
        counts={{ threads: threadsCount, memos: memos.memos?.length ?? null, raid: raidCount ?? null }}
        threads={
          <EngagementThreads
            projectId={projectId}
            orgSlug={orgSlug}
            boardUrl={boardUrl}
            readOnly={readOnly}
            active={subTab === 'threads'}
            onOpenCount={setThreadsCount}
          />
        }
        memos={
          <EngagementMemosTab
            projectId={projectId}
            memos={memos}
            engagementBase={engagementBase}
            readOnly={readOnly}
            selectedId={memoId}
            onSelect={setMemoId}
          />
        }
        raid={renderRaid ?? null}
      />
      {memos.dueDialog}
    </>
  )
}

/** Today's Discussions page: the views, search, the rows, and the open thread in the right pane. */
function EngagementThreads({
  projectId,
  boardUrl,
  readOnly = false,
  active = true,
  onOpenCount,
}: {
  projectId: string
  orgSlug?: string
  boardUrl?: string
  readOnly?: boolean
  /** Shown: false while another sub-tab is, when a thread open in the right pane is closed. */
  active?: boolean
  /** The open discussions, unsearched, for the switch's count; null while loading. */
  onOpenCount?: (count: number | null) => void
}) {
  const rightPane = useRightPane()
  const { user } = useAuth()
  const { addToast } = useToast()
  const [activeTab, setActiveTab] = useState<CommentsView>('all')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<DocRow[]>([])
  const [error, setError] = useState<string | null>(null)
  /** Bumped to reload the list: after a comment is posted in the pane, or a discussion is resolved. */
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])
  /** The discussion open in the right pane. */
  const [openId, setOpenId] = useState<string | null>(null)

  // Mentions tab state
  const [mentionsLoading, setMentionsLoading] = useState(true)
  const [mentionRows, setMentionRows] = useState<MentionRow[]>([])
  const [mentionsError, setMentionsError] = useState<string | null>(null)
  const [mentionsAttempt, setMentionsAttempt] = useState(0)

  // Opened rows, and the threads loaded for them (kept while the list reloads)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [threads, setThreads] = useState<Record<string, Thread>>({})
  /** Documents tagged in what's on screen, by doc ID, for drawing tags as chips. */
  const [taggedDocs, setTaggedDocs] = useState<Record<string, TaggedDocument>>({})
  const addTagged = useCallback((docs: Record<string, TaggedDocument> | undefined) => {
    if (docs && Object.keys(docs).length > 0) setTaggedDocs((prev) => ({ ...prev, ...docs }))
  }, [])

  /** What the last load was for: a reload of the same search keeps the rows' order (keepOrder). */
  const lastLoad = useRef<{ query: string; reloadKey: number } | null>(null)
  useEffect(() => {
    let cancelled = false
    const isReload = lastLoad.current?.query === query && lastLoad.current.reloadKey !== reloadKey
    lastLoad.current = { query, reloadKey }
    const load = async () => {
      // A reload keeps what's on screen while it fetches.
      if (!isReload) setLoading(true)
      setError(null)
      try {
        const qs = new URLSearchParams(query.trim() ? { q: query.trim() } : {})
        const res = await fetch(`/api/projects/${projectId}/doc-comments?${qs.toString()}`)
        if (!res.ok) throw await failureFrom(res)
        const data = await res.json()
        if (!cancelled) {
          const next: DocRow[] = data.documents ?? []
          setRows((prev) => (isReload ? keepOrder(prev, next) : next))
          addTagged(data.taggedDocuments)
        }
      } catch (e) {
        if (!cancelled) setError(failureReason(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [projectId, query, addTagged, reloadKey])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setMentionsLoading(true)
      setMentionsError(null)
      try {
        const res = await fetch(`/api/projects/${projectId}/doc-comments?filter=mentions`)
        if (!res.ok) throw await failureFrom(res)
        const data = await res.json()
        if (!cancelled) {
          setMentionRows(data.mentions ?? [])
          addTagged(data.taggedDocuments)
        }
      } catch (e) {
        if (!cancelled) setMentionsError(failureReason(e))
      } finally {
        if (!cancelled) setMentionsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [projectId, addTagged, mentionsAttempt])

  // Engagement members: the names mentions are written with, the names and faces of authors, and
  // the viewer's own role (which of a deliverable's documents they may tag).
  const [members, setMembers] = useState<Member[]>([])
  /** They didn't load: names show as the server knew them, and the page says why (P2-21). */
  const [membersFailed, setMembersFailed] = useState<string | null>(null)
  const loadMembers = useCallback(async () => {
    setMembersFailed(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/members`)
      if (!res.ok) throw await failureFrom(res)
      const data = await res.json()
      setMembers((data?.members ?? [])
        .filter((m: any) => m.userId && m.email)
        .map((m: any) => ({ userId: m.userId, email: m.email, name: m.name ?? m.email.split('@')[0], avatarUrl: m.avatarUrl ?? null, role: m.role ?? '' })))
    } catch (e) {
      // The route's own words are this sentence; a dropped connection adds its own.
      setMembersFailed(e instanceof TypeError ? failureReason(e) : '')
    }
  }, [projectId])
  useEffect(() => { void loadMembers() }, [loadMembers])

  const memberById = useMemo(() => new Map(members.map((m) => [m.userId, m])), [members])
  const myRole = user?.id ? memberById.get(user.id)?.role ?? null : null
  const text = useMemo<TextKit>(() => {
    const known = members.map((m) => ({ ...m, display: formatDisplayName(m.name, m.email) }))
    return {
      names: known.flatMap((m) => [m.display, m.name]).filter(Boolean),
      personFor: (name) => {
        const m = known.find((k) => k.display === name || k.name === name)
        return m ? { name: m.display, email: m.email, avatarUrl: m.avatarUrl } : undefined
      },
      docFor: (docId) => taggedDocs[docId],
    }
  }, [members, taggedDocs])

  /** Who wrote a comment: their member name and face, else the name or email the server knew them by. */
  const authorOf = useCallback((userId: string | null, name: string | null, email: string | null): CommentPerson | null => {
    const m = userId ? memberById.get(userId) : undefined
    if (m) return { name: formatDisplayName(m.name, m.email), email: m.email, avatarUrl: m.avatarUrl }
    if (email) return { name: formatDisplayName(name ?? '', email), email, avatarUrl: null }
    return name ? { name, avatarUrl: null } : null
  }, [memberById])

  const loadThread = async (projectDocumentId: string) => {
    setThreads((prev) => ({ ...prev, [projectDocumentId]: { status: 'loading', messages: prev[projectDocumentId]?.messages ?? [] } }))
    try {
      const res = await fetch(`/api/projects/${projectId}/documents/${projectDocumentId}/doc-comments?limit=${PEEK}`)
      if (!res.ok) throw await failureFrom(res)
      const data = await res.json()
      addTagged(data.taggedDocuments)
      setThreads((prev) => ({ ...prev, [projectDocumentId]: { status: 'ready', messages: data.messages ?? [] } }))
    } catch (e) {
      setThreads((prev) => ({ ...prev, [projectDocumentId]: { status: 'error', messages: [], reason: failureReason(e) } }))
    }
  }

  const toggle = (projectDocumentId: string) => {
    const opening = !expanded.has(projectDocumentId)
    setExpanded((prev) => {
      const next = new Set(prev)
      if (opening) next.add(projectDocumentId)
      else next.delete(projectDocumentId)
      return next
    })
    if (opening && threads[projectDocumentId]?.status !== 'ready') loadThread(projectDocumentId)
  }

  const goToDeliverable = useCallback((projectDocumentId: string) => {
    if (boardUrl) {
      window.location.href = `${boardUrl}#doc-file:${projectDocumentId}:comments`
    }
  }, [boardUrl])

  /** Resolves an open discussion, or reopens a resolved one; the row moves views at once. */
  const toggleResolved = useCallback(async (r: DocRow) => {
    const resolving = !r.resolved
    // The server's reason, or that the request never got there (P1-74).
    try {
      const res = await fetch(`/api/projects/${projectId}/documents/${r.projectDocumentId}/doc-comments/resolve`, { method: resolving ? 'POST' : 'DELETE' })
      if (!res.ok) throw await failureFrom(res)
    } catch (e) {
      addToast({ type: 'error', title: resolving ? 'Couldn’t resolve this discussion' : 'Couldn’t reopen this discussion', message: failureReason(e) })
      return
    }
    const me = user?.id ? memberById.get(user.id) : undefined
    setRows((prev) => prev.map((x) => x.projectDocumentId === r.projectDocumentId
      ? { ...x, resolved: resolving ? { at: new Date().toISOString(), byName: me ? formatDisplayName(me.name, me.email) : null } : null }
      : x))
    addToast({ type: 'success', title: resolving ? 'Discussion resolved' : 'Discussion reopened' })
    reload()
  }, [projectId, addToast, user?.id, memberById, reload])

  /** Opens a discussion in the right pane: the whole thread, its composer, and Resolve. */
  const openDiscussion = (r: DocRow) => {
    if (!rightPane.hasRightPane) {
      goToDeliverable(r.projectDocumentId)
      return
    }
    setOpenId(r.projectDocumentId)
    // Opening it reads it; the pane tells the server.
    setRows((prev) => prev.map((x) => (x.projectDocumentId === r.projectDocumentId ? { ...x, unread: false } : x)))
    rightPane.setBeforeClose(null)
    // Named as the thread names its document; the deliverable's stage and due date follow once loaded.
    rightPane.setTitle(discussionTitle(r))
    rightPane.setHeaderIcon(r.kind === 'deliverable'
      ? <DeliverableIcon className="h-4 w-4" />
      : <DocumentIcon mimeType={r.kind === 'folder' ? FOLDER_MIME : r.mimeType ?? undefined} className="h-4 w-4" />)
    rightPane.setHeaderSubtitle('')
    rightPane.setContent(
      <DiscussionPane
        key={r.projectDocumentId}
        projectId={projectId}
        row={r}
        persona={myRole === 'eng_viewer' ? 'ev' : myRole === 'eng_ext_collaborator' ? 'ec' : 'all'}
        onChange={reload}
      />
    )
  }

  /** A comment author's role, for naming the client side's people in an opened row. */
  const roleOf = useCallback((userId: string | null) => (userId ? memberById.get(userId)?.role ?? null : null), [memberById])

  // The pane's header follows the open discussion's state (resolved or not) as the list refreshes.
  const openRow = openId ? rows.find((x) => x.projectDocumentId === openId) : undefined
  const openResolved = !!openRow?.resolved
  useEffect(() => {
    if (!openRow) return
    rightPane.setHeaderActions(
      <DiscussionActions
        resolved={openResolved}
        onToggleResolved={readOnly ? undefined : () => toggleResolved(openRow)}
        onOpenInDeliverable={boardUrl ? () => goToDeliverable(openRow.projectDocumentId) : undefined}
      />
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, openResolved, toggleResolved, goToDeliverable, boardUrl, readOnly])

  // The pane closed (or shows something else): no row is open.
  const paneOpen = !!rightPane.content
  useEffect(() => {
    if (!paneOpen) setOpenId(null)
  }, [paneOpen])

  // Another sub-tab is shown (Memos, RAID): the thread open beside this list closes with it.
  useEffect(() => {
    if (!active && openId) rightPane.clearPane()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // The switch's count: open discussions, as the tab row counts them. A search narrows the rows, so
  // the count stays at what it was before it.
  useEffect(() => {
    if (!onOpenCount || query.trim()) return
    onOpenCount(loading || error ? null : rowsInView(rows, 'all').length)
  }, [onOpenCount, query, loading, error, rows])

  const shownRows = useMemo(() => rowsInView(rows, activeTab), [rows, activeTab])
  // Mentions are few, so search narrows them here, the same way: by ID (a leading "#" ignored), or by who wrote them.
  const shownMentions = useMemo(() => {
    const q = query.trim().replace(/^#/, '').toLowerCase()
    if (!q) return mentionRows
    return mentionRows.filter((m) => {
      const author = authorOf(m.authorUserId ?? null, null, null)
      return !!m.docId?.toLowerCase().includes(q) || !!author?.name.toLowerCase().includes(q)
    })
  }, [mentionRows, query, authorOf])
  const empty = !loading && !error && shownRows.length === 0
  const mentionsEmpty = !mentionsLoading && !mentionsError && shownMentions.length === 0

  return (
    <div className="flex flex-col gap-3">
      <CommentsToolbar
        view={activeTab}
        onView={setActiveTab}
        counts={{
          all: loading ? null : rowsInView(rows, 'all').length,
          awaiting: loading ? null : rowsInView(rows, 'awaiting').length,
          mentions: mentionsLoading ? null : shownMentions.length,
          resolved: loading ? null : rowsInView(rows, 'resolved').length,
        }}
        query={query}
        onQuery={setQuery}
      />

      {membersFailed !== null && (
        <p role="alert" className="text-small text-fg-muted">
          Couldn&apos;t load the people on this engagement, so some names may show as emails.{membersFailed ? ` ${membersFailed}` : ''}{' '}
          <button type="button" onClick={() => void loadMembers()} className="font-medium text-fg hover:underline">Try again</button>
        </p>
      )}

      {activeTab !== 'mentions' && (
          <div className="overflow-hidden border-t border-line">
            {error ? (
              <LoadFailed what="the discussions" reason={error} onRetry={() => { setLoading(true); reload() }} />
            ) : loading ? (
              <div className="p-6 text-sm text-fg-muted">Loading discussions…</div>
            ) : empty ? (
              <EmptyDiscussions view={activeTab} query={query} />
            ) : (
              <div className="divide-y divide-line">
                {shownRows.map((r) => (
                  <ThreadRow
                    key={r.projectDocumentId}
                    row={r}
                    author={r.latest ? authorOf(r.latest.authorUserId, r.latest.authorName, r.latest.authorEmail) : null}
                    selected={openId === r.projectDocumentId}
                    open={expanded.has(r.projectDocumentId)}
                    thread={threads[r.projectDocumentId]}
                    text={text}
                    authorOf={authorOf}
                    roleOf={roleOf}
                    onToggle={() => toggle(r.projectDocumentId)}
                    onRetry={() => loadThread(r.projectDocumentId)}
                    onOpen={() => openDiscussion(r)}
                    onOpenInDeliverable={boardUrl ? () => goToDeliverable(r.projectDocumentId) : undefined}
                  />
                ))}
              </div>
            )}
          </div>
      )}

      {activeTab === 'mentions' && (
        <div className="overflow-hidden border-t border-line">
          {mentionsError ? (
            <LoadFailed what="your mentions" reason={mentionsError} onRetry={() => setMentionsAttempt((n) => n + 1)} />
          ) : mentionsLoading ? (
            <div className="p-6 text-sm text-fg-muted">Loading mentions…</div>
          ) : mentionsEmpty ? (
            <div className="py-12 text-center">
              <AtSign className="h-7 w-7 text-line mx-auto mb-2.5" />
              <div className="text-sm font-medium text-fg">No mentions yet</div>
              <div className="text-xs text-fg-muted mt-1">Comments that @mention you will appear here.</div>
            </div>
          ) : (
            <div className="divide-y divide-line">
              {shownMentions.map((r) => (
                <div key={r.messageId} className="flex items-center gap-2 px-4 py-3 hover:bg-surface-hover transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-primary truncate flex items-center gap-1">
                      <AtSign className="h-3 w-3 shrink-0" />
                      {r.documentName}
                    </div>
                    <div className="mt-0.5 text-xs text-fg-muted line-clamp-2"><CommentText content={r.preview} {...text} /></div>
                    <div className="mt-1 text-[10px] text-fg-subtle">
                      <RelativeDateTime date={r.createdAt} />
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => goToDeliverable(r.projectDocumentId)}
                          aria-label="Open in deliverable"
                          className="h-7 w-7 rounded-control flex items-center justify-center text-fg-subtle hover:bg-surface-hover hover:text-fg transition-colors"
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">Open in deliverable</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** The pane header's actions for an open discussion: Resolve (or Reopen), and Open in deliverable. */
export function DiscussionActions({
  resolved,
  onToggleResolved,
  onOpenInDeliverable,
}: {
  resolved: boolean
  onToggleResolved?: () => void | Promise<void>
  onOpenInDeliverable?: () => void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <>
      {onToggleResolved && (
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await onToggleResolved()
          } finally {
            setBusy(false)
          }
        }}
        className="inline-flex h-7 items-center gap-1.5 rounded-control px-2 text-small text-fg-muted hover:bg-surface-hover hover:text-fg disabled:opacity-60"
      >
        {resolved ? <RotateCcw className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
        {resolved ? 'Reopen' : 'Resolve'}
      </button>
      )}
      {onOpenInDeliverable && (
        <Hint label="Open in deliverable" side="bottom">
          <button
            type="button"
            aria-label="Open in deliverable"
            onClick={onOpenInDeliverable}
            className="flex h-7 w-7 items-center justify-center rounded-control text-fg-muted hover:bg-surface-hover hover:text-fg"
          >
            <ArrowUpRight className="h-4 w-4" />
          </button>
        </Hint>
      )}
    </>
  )
}

/**
 * A discussion in the right pane: the deliverable comments pane (thread, composer, @ and #), given
 * the documents "#" may tag — the deliverable's, or the documents of the deliverable a file is in,
 * as far as this viewer may see them.
 */
function DiscussionPane({
  projectId,
  row,
  persona,
  onChange,
}: {
  projectId: string
  row: DocRow
  persona: 'ev' | 'ec' | 'all'
  onChange: () => void
}) {
  const deliverableId = row.kind === 'deliverable' ? row.projectDocumentId : row.deliverable?.id
  const [taggable, setTaggable] = useState<TaggableDocument[] | undefined>(undefined)
  const { setHeaderSubtitle } = useRightPane()
  useEffect(() => {
    if (!deliverableId) return
    let cancelled = false
    fetch(`/api/projects/${projectId}/documents/${deliverableId}/subtasks?persona=${persona}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        setTaggable((data.subtasks ?? []).map((t: any) => ({
          documentId: t.documentId, docId: t.docId ?? null, fileName: t.fileName, mimeType: t.mimeType ?? null, breadcrumb: t.breadcrumb,
        })))
        // The deliverable's stage and due date under the title; a nicety, so a failed load just leaves it out.
        setHeaderSubtitle(discussionSubtitle(row.kind, data.deliverable))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [projectId, deliverableId, persona, row.kind, setHeaderSubtitle])

  return (
    <DocumentDocCommentsPane
      engagementId={projectId}
      documentId={row.projectDocumentId}
      documentName={row.documentName}
      documentMimeType={row.mimeType ?? undefined}
      taggableDocuments={taggable}
      onChange={onChange}
      // As the row stood when opened: a resolved discussion awaits no reply, so Brio offers no draft.
      resolved={!!row.resolved}
    />
  )
}

/** The neutral tag on an internal note, as the discussion pane draws it. */
function InternalTag() {
  return (
    <span
      title="Only Leads and Full Access contributors see this"
      className="inline-flex h-4 shrink-0 items-center rounded-[4px] bg-tag-gray-bg px-1 text-[10px] font-semibold leading-none text-tag-gray-fg"
    >
      Internal
    </span>
  )
}

/**
 * A document's discussion: who spoke last (their face, a dot when it's unread), its latest comment,
 * and a peek at the last few comments in place. Clicking the row opens the whole discussion; the
 * arrow opens it in its deliverable. The tour's Discussions page draws the same rows.
 */
export function ThreadRow({
  row: r,
  author,
  selected = false,
  open,
  thread,
  text,
  authorOf,
  roleOf,
  onToggle,
  onRetry,
  onOpen,
  onOpenInDeliverable,
}: {
  row: DocRow
  author: CommentPerson | null
  selected?: boolean
  open: boolean
  thread: Thread | undefined
  text: TextKit
  authorOf: (userId: string | null, name: string | null, email: string | null) => CommentPerson | null
  /** A comment author's engagement role: the client side's people are named with theirs. */
  roleOf?: (userId: string | null, name: string | null) => string | null
  onToggle: () => void
  onRetry: () => void
  onOpen: () => void
  onOpenInDeliverable?: () => void
}) {
  const listId = useId()
  const preview = r.latest
  const earlier = Math.min(r.count, PEEK) - 1
  const shown = thread?.status === 'ready' ? thread.messages : []
  const older = r.count - shown.length
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    fn()
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 transition-colors cursor-pointer group',
        selected ? 'bg-surface-selected' : 'hover:bg-surface-hover'
      )}
      onClick={onOpen}
    >
      {/* Who spoke last; a dot while there's something new since you last opened it. */}
      <span className="relative mt-0.5 shrink-0">
        <PersonAvatar person={{ name: author?.name ?? '?', avatarUrl: author?.avatarUrl ?? null }} size={28} />
        {r.unread && (
          <span aria-label="Unread" className="absolute -left-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-action" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex shrink-0 items-center gap-1">
            {r.kind === 'deliverable' ? (
              <DeliverableIcon className="h-3.5 w-3.5" />
            ) : r.kind ? (
              <DocumentIcon mimeType={r.kind === 'folder' ? FOLDER_MIME : r.mimeType ?? undefined} className="h-3.5 w-3.5 shrink-0" />
            ) : null}
            {r.docId && (
              <span className="text-[11px] font-bold font-mono text-primary tracking-wide">{r.docId}</span>
            )}
          </span>
          <span className={cn('text-sm text-fg truncate', r.unread ? 'font-semibold' : 'font-medium')}>{r.documentName}</span>
          {r.deliverable && (
            <span className="flex min-w-0 shrink items-center gap-1 text-xs text-fg-subtle" title={`In ${r.deliverable.name}`}>
              <span className="shrink-0">in</span>
              <DeliverableIcon className="h-3 w-3" />
              {r.deliverable.docId && <span className="shrink-0 font-mono text-[11px] font-semibold tracking-wide text-fg-muted">{r.deliverable.docId}</span>}
              <span className="truncate">{r.deliverable.name}</span>
            </span>
          )}
          <span className="inline-flex shrink-0 items-center gap-0.5 text-xs tabular-nums text-fg-subtle" title={`${r.count} ${r.count === 1 ? 'comment' : 'comments'}`}>
            <MessagesSquare className="h-3 w-3" />
            {r.count}
          </span>
          {r.resolved ? (
            <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-medium text-fg-subtle leading-none">
              <CheckCircle2 className="h-3 w-3" />
              Resolved
            </span>
          ) : r.latest?.authorIsExternal ? (
            // State, in the status language's waiting color (lib/ui/status.ts).
            <span
              className="shrink-0 inline-flex h-[18px] items-center gap-1 rounded-control bg-status-waiting-bg pl-1 pr-1.5 text-[11px] font-medium leading-none text-status-waiting-fg"
              title="Last message is from a Limited Access contributor or Reviewer · awaiting your reply."
            >
              <Reply className="h-3 w-3 text-status-waiting-icon" />
              Awaiting reply
            </span>
          ) : null}
        </div>

        {!open && preview ? (
          <>
            <div className={cn('mt-0.5 text-xs line-clamp-1', r.unread ? 'text-fg' : 'text-fg-muted')}>
              <CommentText content={preview.preview} {...text} />
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-fg-subtle">
              {author && <span className="font-medium text-fg-muted">{author.name}</span>}
              {author && <span aria-hidden>·</span>}
              <RelativeDateTime date={preview.createdAt} iconClassName="hidden" />
              {r.latest?.isInternal && <InternalTag />}
              {r.resolved && (
                <>
                  <span aria-hidden>·</span>
                  <span>Resolved{r.resolved.byName ? ` by ${r.resolved.byName}` : ''}</span>
                </>
              )}
              {earlier > 0 && (
                <>
                  <span aria-hidden>·</span>
                  <button
                    type="button"
                    aria-expanded={false}
                    aria-controls={listId}
                    onClick={stop(onToggle)}
                    className="rounded-control font-medium text-fg-muted hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30"
                  >
                    Show {earlier} earlier
                  </button>
                </>
              )}
            </div>
          </>
        ) : null}

        {open && (
          // Reading here doesn't open the discussion: the text can be selected, and chips hovered.
          <div id={listId} className="mt-2 cursor-default" onClick={(e) => e.stopPropagation()}>
            {thread?.status === 'error' ? (
              <div role="alert" className="text-xs text-fg-muted">
                Couldn’t load these comments{thread.reason ? ` · ${thread.reason}` : '.'}{' '}
                <button type="button" onClick={onRetry} className="font-medium text-fg hover:underline">Try again</button>
              </div>
            ) : thread?.status !== 'ready' ? (
              <div className="text-xs text-fg-subtle">Loading comments…</div>
            ) : (
              <>
                {older > 0 && (
                  <button type="button" onClick={onOpen} className="mb-2 text-[10px] text-fg-subtle hover:text-fg hover:underline">
                    {older} older {older === 1 ? 'comment' : 'comments'} · Open discussion
                  </button>
                )}
                <ol className="flex flex-col gap-3">
                  {shown.map((m, i) => {
                    const who = authorOf(m.authorUserId, m.authorName ?? null, m.authorEmail)
                    const role = clientRoleLabel(roleOf?.(m.authorUserId, m.authorName ?? null))
                    return (
                      <li key={m.id} className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-2">
                        <PersonAvatar person={{ name: who?.name ?? '?', avatarUrl: who?.avatarUrl ?? null }} size={20} />
                        {/* An internal note as the pane draws it: a dashed box, tagged, muted. */}
                        <div className={cn('min-w-0', m.isInternal && 'rounded-control border border-dashed border-line-strong bg-surface-subtle px-2 py-1.5')}>
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="font-medium text-fg">{who?.name ?? 'Unknown'}</span>
                            {m.isInternal && <InternalTag />}
                            {role && <span className="text-[10px] text-fg-subtle">· {role}</span>}
                            <span aria-hidden className="text-[10px] text-fg-subtle">·</span>
                            <RelativeDateTime date={m.createdAt} iconClassName="hidden" className="text-[10px] text-fg-subtle" />
                            {i === shown.length - 1 && (
                              <span className="text-[10px] text-fg-subtle">· Latest</span>
                            )}
                          </div>
                          <p className={cn('mt-0.5 line-clamp-3 whitespace-pre-wrap break-words text-xs leading-relaxed', m.isInternal ? 'text-fg-muted' : 'text-fg')}>
                            <CommentText content={m.content} {...text} />
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </>
            )}
            <button
              type="button"
              aria-expanded
              aria-controls={listId}
              onClick={onToggle}
              className="mt-2 rounded-control text-[10px] font-medium text-fg-muted hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30"
            >
              Hide
            </button>
          </div>
        )}
      </div>
      {onOpenInDeliverable && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Open in deliverable"
              onClick={stop(onOpenInDeliverable)}
              className="shrink-0 flex h-6 w-6 items-center justify-center rounded-control text-fg-subtle opacity-0 group-hover:opacity-100 hover:bg-surface-hover hover:text-fg focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30 transition-opacity"
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Open in deliverable</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
