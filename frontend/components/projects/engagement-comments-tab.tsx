'use client'

import React, { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { AtSign, Search, ArrowRight, MessagesSquare, Reply } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import { PersonAvatar } from '@/components/ui/property-cells'
import { DeliverableIcon } from '@/components/ui/deliverable-icon'
import { DocumentIcon } from '@/components/ui/document-icon'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CommentText, type CommentPerson } from '@/components/comments/comment-text'
import { formatDisplayName } from '@/lib/comments/mentions'
import type { TaggedDocument } from '@/lib/comments/tagged-documents'

/*
 * The engagement's Comments page: one row per document with comments, showing its latest comment
 * and who wrote it. "Show N earlier" opens the row in place to the thread's last five comments,
 * oldest first, loaded when first opened; the whole thread, and replying, stay in the deliverable.
 */

const FOLDER_MIME = 'application/vnd.google-apps.folder'

/** How many of a thread's latest comments an opened row shows. */
export const PEEK = 5

export type DocRow = {
  projectDocumentId: string
  documentName: string
  docId: string | null
  /** What the thread is on: a deliverable shows its folder-plus mark, a file its type icon. */
  kind?: 'deliverable' | 'folder' | 'file'
  mimeType?: string | null
  /** The deliverable a document is in, shown after its name; none for a deliverable itself. */
  deliverable?: { docId: string | null; name: string } | null
  count: number
  latest: {
    createdAt: string
    preview: string
    authorUserId: string | null
    authorName: string | null
    authorEmail: string | null
    authorIsExternal?: boolean
  } | null
  /** When a search matched an older comment than the latest: that comment, shown in the row instead. */
  match?: {
    createdAt: string
    preview: string
    authorUserId: string | null
    authorName: string | null
    authorEmail: string | null
  } | null
}

export type CommentsView = 'all' | 'awaiting' | 'mentions'

/**
 * The page's views — All, Awaiting reply (a client or external collaborator spoke last), Mentions —
 * as small toggles like the Inbox's, with search on the same row. Shared with the tour's copy.
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
      {counts[id] ? <span className="tabular-nums text-fg-subtle">{counts[id]}</span> : null}
    </button>
  )
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-0.5">
        {toggle('all', <MessagesSquare className="h-3.5 w-3.5" />, 'All')}
        {toggle('awaiting', <Reply className="h-3.5 w-3.5" />, 'Awaiting reply')}
        {toggle('mentions', <AtSign className="h-3.5 w-3.5" />, 'Mentions')}
      </div>
      <div className="relative w-52">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-muted" />
        <Input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search comments…"
          aria-label="Search comments, documents and deliverables"
          className="pl-8"
        />
      </div>
    </div>
  )
}

type MentionRow = {
  messageId: string
  createdAt: string
  preview: string
  projectDocumentId: string
  documentName: string
}

export type ThreadMessage = { id: string; createdAt: string; authorUserId: string | null; authorEmail: string | null; authorName?: string | null; content: string }
export type Thread = { status: 'loading' | 'error' | 'ready'; messages: ThreadMessage[] }
type Member = { userId: string; email: string; name: string; avatarUrl: string | null }

/** How a comment's text is drawn: mentions as pills, document tags as chips. */
export type TextKit = {
  names: string[]
  personFor: (name: string) => CommentPerson | undefined
  docFor: (docId: string) => TaggedDocument | undefined
}

export function EngagementCommentsTab({
  projectId,
  boardUrl,
}: {
  projectId: string
  orgSlug?: string
  boardUrl?: string
}) {
  const [activeTab, setActiveTab] = useState<CommentsView>('all')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<DocRow[]>([])
  const [error, setError] = useState<string | null>(null)

  // Mentions tab state
  const [mentionsLoading, setMentionsLoading] = useState(true)
  const [mentionRows, setMentionRows] = useState<MentionRow[]>([])
  const [mentionsError, setMentionsError] = useState<string | null>(null)

  // Opened rows, and the threads loaded for them (kept while the list reloads)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [threads, setThreads] = useState<Record<string, Thread>>({})
  /** Documents tagged in what's on screen, by doc ID, for drawing tags as chips. */
  const [taggedDocs, setTaggedDocs] = useState<Record<string, TaggedDocument>>({})
  const addTagged = useCallback((docs: Record<string, TaggedDocument> | undefined) => {
    if (docs && Object.keys(docs).length > 0) setTaggedDocs((prev) => ({ ...prev, ...docs }))
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const qs = new URLSearchParams(query.trim() ? { q: query.trim() } : {})
        const res = await fetch(`/api/projects/${projectId}/doc-comments?${qs.toString()}`)
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error ?? 'Failed to load comments')
        }
        const data = await res.json()
        if (!cancelled) {
          setRows(data.documents ?? [])
          addTagged(data.taggedDocuments)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load comments')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [projectId, query, addTagged])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setMentionsLoading(true)
      setMentionsError(null)
      try {
        const res = await fetch(`/api/projects/${projectId}/doc-comments?filter=mentions`)
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error ?? 'Failed to load mentions')
        }
        const data = await res.json()
        if (!cancelled) {
          setMentionRows(data.mentions ?? [])
          addTagged(data.taggedDocuments)
        }
      } catch (e) {
        if (!cancelled) setMentionsError(e instanceof Error ? e.message : 'Failed to load mentions')
      } finally {
        if (!cancelled) setMentionsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [projectId, addTagged])

  // Engagement members: the names mentions are written with, and the names and faces of authors.
  const [members, setMembers] = useState<Member[]>([])
  useEffect(() => {
    fetch(`/api/projects/${projectId}/members`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setMembers((data?.members ?? [])
          .filter((m: any) => m.userId && m.email)
          .map((m: any) => ({ userId: m.userId, email: m.email, name: m.name ?? m.email.split('@')[0], avatarUrl: m.avatarUrl ?? null })))
      })
      .catch(() => {})
  }, [projectId])

  const memberById = useMemo(() => new Map(members.map((m) => [m.userId, m])), [members])
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
      if (!res.ok) throw new Error()
      const data = await res.json()
      addTagged(data.taggedDocuments)
      setThreads((prev) => ({ ...prev, [projectDocumentId]: { status: 'ready', messages: data.messages ?? [] } }))
    } catch {
      setThreads((prev) => ({ ...prev, [projectDocumentId]: { status: 'error', messages: [] } }))
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

  const searching = query.trim().length > 0
  /** Threads where a client or external collaborator spoke last: the firm owes a reply. */
  const awaiting = useMemo(() => rows.filter((r) => r.latest?.authorIsExternal), [rows])
  const shownRows = activeTab === 'awaiting' ? awaiting : rows
  // Mentions are few, so the search box narrows them here, by what was said or the document.
  const shownMentions = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? mentionRows.filter((m) => m.preview.toLowerCase().includes(q) || m.documentName.toLowerCase().includes(q)) : mentionRows
  }, [mentionRows, query])
  const empty = !loading && !error && shownRows.length === 0
  const mentionsEmpty = !mentionsLoading && !mentionsError && shownMentions.length === 0

  const goToDeliverable = (projectDocumentId: string) => {
    if (boardUrl) {
      window.location.href = `${boardUrl}#doc-file:${projectDocumentId}:comments`
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <CommentsToolbar
        view={activeTab}
        onView={setActiveTab}
        counts={{
          all: loading ? null : rows.length,
          awaiting: loading ? null : awaiting.length,
          mentions: mentionsLoading ? null : shownMentions.length,
        }}
        query={query}
        onQuery={setQuery}
      />

      {activeTab !== 'mentions' && (
          <div className="overflow-hidden border-t border-line">
            {error ? (
              <div className="p-6 text-sm text-rose-700 bg-rose-50 border-b border-rose-100">{error}</div>
            ) : loading ? (
              <div className="p-6 text-sm text-fg-muted">Loading comments…</div>
            ) : empty ? (
              <div className="py-12 text-center">
                {activeTab === 'awaiting' && !searching ? (
                  <>
                    <Reply className="h-7 w-7 text-line mx-auto mb-2.5" />
                    <div className="text-sm font-medium text-fg">Nothing awaiting a reply</div>
                    <div className="text-xs text-fg-muted mt-1">Threads where a client or external collaborator spoke last show up here.</div>
                  </>
                ) : searching ? (
                  <>
                    <Search className="h-7 w-7 text-line mx-auto mb-2.5" />
                    <div className="text-sm font-medium text-fg">No comments match “{query.trim()}”</div>
                    <div className="text-xs text-fg-muted mt-1">Search looks in what was said, and in document and deliverable names and IDs.</div>
                  </>
                ) : (
                  <>
                    <MessagesSquare className="h-7 w-7 text-line mx-auto mb-2.5" />
                    <div className="text-sm font-medium text-fg">No comments yet</div>
                    <div className="text-xs text-fg-muted mt-1">Add a comment from any document, then it will show up here.</div>
                  </>
                )}
              </div>
            ) : (
              <div className="divide-y divide-line">
                {shownRows.map((r) => {
                  const shown = r.match ?? r.latest
                  return (
                    <ThreadRow
                      key={r.projectDocumentId}
                      row={r}
                      author={shown ? authorOf(shown.authorUserId, shown.authorName, shown.authorEmail) : null}
                      open={expanded.has(r.projectDocumentId)}
                      thread={threads[r.projectDocumentId]}
                      text={text}
                      authorOf={authorOf}
                      onToggle={() => toggle(r.projectDocumentId)}
                      onRetry={() => loadThread(r.projectDocumentId)}
                      onOpenThread={() => goToDeliverable(r.projectDocumentId)}
                    />
                  )
                })}
              </div>
            )}
          </div>
      )}

      {activeTab === 'mentions' && (
        <div className="overflow-hidden border-t border-line">
          {mentionsError ? (
            <div className="p-6 text-sm text-rose-700 bg-rose-50 border-b border-rose-100">{mentionsError}</div>
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
                          className="h-7 w-7 rounded flex items-center justify-center text-fg-subtle hover:text-primary hover:translate-x-0.5 transition-all"
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">Go to Deliverable</TooltipContent>
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

/**
 * A document's thread: its latest comment and who wrote it, opening in place to the last few
 * comments. Clicking the row, or its arrow, opens the whole thread in the deliverable. The tour's
 * Comments page draws the same rows over sample threads.
 */
export function ThreadRow({
  row: r,
  author,
  open,
  thread,
  text,
  authorOf,
  onToggle,
  onRetry,
  onOpenThread,
}: {
  row: DocRow
  author: CommentPerson | null
  open: boolean
  thread: Thread | undefined
  text: TextKit
  authorOf: (userId: string | null, name: string | null, email: string | null) => CommentPerson | null
  onToggle: () => void
  onRetry: () => void
  onOpenThread: () => void
}) {
  const listId = useId()
  /** The comment the closed row shows: the one a search matched, else the latest. */
  const preview = r.match ?? r.latest
  const earlier = Math.min(r.count, PEEK) - 1
  const shown = thread?.status === 'ready' ? thread.messages : []
  const older = r.count - shown.length
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    fn()
  }

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 hover:bg-surface-hover transition-colors cursor-pointer group"
      onClick={onOpenThread}
    >
      <div className="mt-0.5 shrink-0 flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
        <MessagesSquare className="h-3.5 w-3.5 text-primary" />
      </div>
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
          <span className="text-sm font-semibold text-fg truncate">{r.documentName}</span>
          {r.deliverable && (
            <span className="flex min-w-0 shrink items-center gap-1 text-xs text-fg-subtle" title={`In ${r.deliverable.name}`}>
              <span className="shrink-0">in</span>
              <DeliverableIcon className="h-3 w-3" />
              {r.deliverable.docId && <span className="shrink-0 font-mono text-[11px] font-semibold tracking-wide text-fg-muted">{r.deliverable.docId}</span>}
              <span className="truncate">{r.deliverable.name}</span>
            </span>
          )}
          <span className="shrink-0 inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary tabular-nums leading-none">
            {r.count}
          </span>
          {r.latest?.authorIsExternal && (
              <span
                  className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-amber-50 border border-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 leading-none"
                  title="Last message is from an external contributor — awaiting your reply."
              >
                  <Reply className="h-2.5 w-2.5" />
                  Awaiting reply
              </span>
          )}
        </div>

        {!open && preview ? (
          <>
            <div className="mt-0.5 text-xs text-fg-muted line-clamp-1">
              <span className="text-[9px] font-bold uppercase tracking-wide text-fg-subtle mr-1.5">{r.match ? 'Match' : 'Latest'}</span>
              <CommentText content={preview.preview} {...text} />
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-fg-subtle">
              {author && <span className="font-medium text-fg-muted">{author.name}</span>}
              {author && <span aria-hidden>·</span>}
              <RelativeDateTime date={preview.createdAt} iconClassName="hidden" />
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
          // Reading here doesn't open the deliverable: the text can be selected, and chips hovered.
          <div id={listId} className="mt-2 cursor-default" onClick={(e) => e.stopPropagation()}>
            {thread?.status === 'error' ? (
              <div className="text-xs text-fg-muted">
                Couldn’t load these comments.{' '}
                <button type="button" onClick={onRetry} className="font-medium text-fg hover:underline">Try again</button>
              </div>
            ) : thread?.status !== 'ready' ? (
              <div className="text-xs text-fg-subtle">Loading comments…</div>
            ) : (
              <>
                {older > 0 && (
                  <button type="button" onClick={onOpenThread} className="mb-2 text-[10px] text-fg-subtle hover:text-fg hover:underline">
                    {older} older {older === 1 ? 'comment' : 'comments'} · Open thread
                  </button>
                )}
                <ol className="flex flex-col gap-3">
                  {shown.map((m, i) => {
                    const who = authorOf(m.authorUserId, m.authorName ?? null, m.authorEmail)
                    return (
                      <li key={m.id} className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-2">
                        <PersonAvatar person={{ name: who?.name ?? '?', avatarUrl: who?.avatarUrl ?? null }} size={20} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="font-medium text-fg">{who?.name ?? 'Unknown'}</span>
                            <RelativeDateTime date={m.createdAt} iconClassName="hidden" className="text-[10px] text-fg-subtle" />
                            {i === shown.length - 1 && (
                              <span className="text-[9px] font-bold uppercase tracking-wide text-fg-subtle">Latest</span>
                            )}
                          </div>
                          <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap break-words text-xs leading-relaxed text-fg">
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
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Open thread"
            onClick={stop(onOpenThread)}
            className="shrink-0 rounded-control text-fg-subtle group-hover:text-primary group-hover:translate-x-0.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">Go to Deliverable</TooltipContent>
      </Tooltip>
    </div>
  )
}
