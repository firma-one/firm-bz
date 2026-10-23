'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AtSign } from 'lucide-react'
import { DemoEngagement, DemoFolder } from '@/lib/demo/static-demo-data'
import { DELIVERABLE_ACTORS, getDemoDeliverables } from '@/lib/demo/demo-deliverables'
import { MIME_BY_TYPE } from '@/components/demo/demo-file-list'
import { DemoDeliverableComments, type DemoComment } from '@/components/demo/demo-deliverable-comments'
import { DeliverableIcon } from '@/components/ui/deliverable-icon'
import { DocumentIcon } from '@/components/ui/document-icon'
import { mentionedNames } from '@/lib/comments/mentions'
import { useRightPane } from '@/lib/right-pane-context'
import {
    CommentsToolbar, DiscussionActions, EmptyDiscussions, PEEK, ThreadRow, rowsInView,
    type CommentsView, type DocRow, type TextKit, type ThreadMessage,
} from '@/components/projects/engagement-comments-tab'

/** A sample conversation; a thread of n comments is its first n, so each row ends somewhere else. */
const CONVERSATION: { author: string; text: (other: string) => string }[] = [
    { author: 'Sam Rivera', text: () => 'First pass is in. The structure follows the brief; the numbers still need a check.' },
    { author: 'Alex Jordan', text: () => '@Sam Rivera can we lead with the recommendation? The board will only read the first page.' },
    { author: 'Jordan Lee', text: () => 'Moved the summary up and trimmed the appendix.' },
    { author: 'Taylor Kim', text: () => 'A few figures look outdated. Should these reflect the latest quarter?' },
    { author: 'Sam Rivera', text: (other) => `Updated them from #${other}, which has the Q3 actuals.` },
    { author: 'Alex Jordan', text: () => '@Taylor Kim can you confirm the figures before this goes to review?' },
    { author: 'Taylor Kim', text: (other) => `Confirmed, they match #${other}. Ready for review from our side.` },
]
const THREAD_LENGTHS = [7, 3, 2, 1]
/** The client's collaborator on the tour's team: a thread they spoke last in awaits a reply. */
const EXTERNAL = new Set(['Taylor Kim'])
/** Which sample discussions start unread (by position): the newest client word, and one teammate's. */
const START_UNREAD = new Set([0, 2])
const ME = 'Demo User'

/**
 * Static counterpart to engagement-comments-tab.tsx (the Discussions page): the same toolbar and
 * thread rows (the app's own ThreadRow), on two of the engagement's deliverables and a document in
 * each, over sample comments with a mention and a document tag. A row opens its discussion in the
 * right pane with the tour's composer, where it can be resolved; opening it clears its unread dot.
 * Everything changes only on screen. Mentions shows its real empty state.
 */
export function DemoEngagementComments({ engagement }: { engagement: DemoEngagement }) {
    const rightPane = useRightPane()
    const [view, setView] = useState<CommentsView>('all')
    const [query, setQuery] = useState('')
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [openId, setOpenId] = useState<string | null>(null)
    /** What the visitor did here: comments posted, discussions read and resolved. */
    const [posted, setPosted] = useState<Record<string, ThreadMessage[]>>({})
    const [read, setRead] = useState<Set<string>>(new Set())
    const [resolved, setResolved] = useState<Record<string, string>>({})
    // Relative to now, so set after mount to keep server and client markup equal.
    const [now, setNow] = useState<number | null>(null)
    useEffect(() => setNow(Date.now()), [])

    const files = useMemo(() => engagement.folders.flatMap((f) => f.files), [engagement])
    /** What the threads are on: two deliverables and a document in each, as on a real engagement. */
    const subjects = useMemo(() => {
        const [a, b] = getDemoDeliverables(engagement).map((d) => d.folder)
        const tagIn = (f: DemoFolder) => (f.files[1] ?? f.files[0])?.docId ?? f.docId
        const taggable = (f: DemoFolder) => f.files.map((x) => ({ id: x.id, docId: x.docId, name: x.name, mimeType: MIME_BY_TYPE[x.type] ?? 'application/octet-stream' }))
        const deliverable = (f: DemoFolder) => ({ id: f.id, docId: f.docId, name: f.name, kind: 'deliverable' as const, mimeType: null, in: null, tag: tagIn(f), taggable: taggable(f) })
        const document = (f: DemoFolder) => {
            const file = f.files[0]
            return file
                ? { id: file.id, docId: file.docId, name: file.name, kind: 'file' as const, mimeType: MIME_BY_TYPE[file.type] ?? 'application/octet-stream', in: { id: f.id, docId: f.docId, name: f.name }, tag: tagIn(f), taggable: taggable(f) }
                : null
        }
        return [a && deliverable(a), b && deliverable(b), a && document(a), b && document(b)].filter((x): x is NonNullable<typeof x> => !!x)
    }, [engagement])

    const threads = useMemo(() => {
        if (now === null) return []
        return subjects.slice(0, THREAD_LENGTHS.length).map((subject, i) => {
            const n = THREAD_LENGTHS[i]
            const messages: ThreadMessage[] = [
                ...CONVERSATION.slice(0, n).map((c, k) => ({
                    id: `${subject.id}-${k}`,
                    createdAt: new Date(now - ((i * 30) + 2 + (n - 1 - k) * 7) * 3_600_000).toISOString(),
                    authorUserId: null,
                    authorEmail: null,
                    authorName: c.author,
                    content: c.text(subject.tag),
                })),
                ...(posted[subject.id] ?? []),
            ]
            const last = messages[messages.length - 1]
            const row: DocRow = {
                projectDocumentId: subject.id,
                documentName: subject.name,
                docId: subject.docId,
                kind: subject.kind,
                mimeType: subject.mimeType,
                deliverable: subject.in,
                count: messages.length,
                latest: {
                    createdAt: last.createdAt, preview: last.content, authorUserId: null, authorName: last.authorName ?? null, authorEmail: null,
                    authorIsExternal: EXTERNAL.has(last.authorName ?? ''),
                },
                resolved: resolved[subject.id] ? { at: resolved[subject.id], byName: 'You' } : null,
                unread: START_UNREAD.has(i) && !read.has(subject.id),
            }
            return { row, messages, subject }
        })
    }, [subjects, now, posted, read, resolved])

    // Search as the app's: by ID (the thread's document's or its deliverable's; a leading "#" ignored), or by a member
    // who wrote in the thread or was mentioned in it.
    const q = query.trim().replace(/^#/, '').toLowerCase()
    const found = useMemo(() => {
        const has = (text: string | null | undefined) => !!text && text.toLowerCase().includes(q)
        const order = (row: DocRow) => {
            const i = threads.findIndex((t) => t.row.projectDocumentId === row.projectDocumentId)
            return START_UNREAD.has(i) ? i - THREAD_LENGTHS.length : i
        }
        return threads
            .filter(({ row, messages }) => !q || has(row.docId) || has(row.deliverable?.docId)
                || messages.some((m) => has(m.authorName) || mentionedNames(m.content, DELIVERABLE_ACTORS).some(has)))
            .map((t) => t.row)
            // Unread first, as the app lists them on load; reading one doesn't move it.
            .sort((a, b) => order(a) - order(b))
    }, [threads, q])
    const rows = rowsInView(found, view)
    const messagesOf = (id: string) => threads.find((t) => t.row.projectDocumentId === id)?.messages ?? []

    const text = useMemo<TextKit>(() => {
        const docs = new Map(files.map((f) => [f.docId, { docId: f.docId, fileName: f.name, mimeType: MIME_BY_TYPE[f.type] ?? 'application/octet-stream' }]))
        return {
            names: DELIVERABLE_ACTORS,
            personFor: (name) => (DELIVERABLE_ACTORS.includes(name) ? { name } : undefined),
            docFor: (docId) => docs.get(docId),
        }
    }, [files])

    const toggle = (id: string) =>
        setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })

    const toggleResolved = useCallback((id: string) =>
        setResolved((prev) => {
            const next = { ...prev }
            if (next[id]) delete next[id]
            else next[id] = new Date().toISOString()
            return next
        }), [])

    /** Opens a discussion in the right pane, as the app does, with the tour's composer. */
    const openDiscussion = (row: DocRow) => {
        const t = threads.find((x) => x.row.projectDocumentId === row.projectDocumentId)
        if (!t) return
        setOpenId(row.projectDocumentId)
        setRead((prev) => new Set(prev).add(row.projectDocumentId))
        rightPane.setBeforeClose(null)
        rightPane.setTitle(row.docId ?? 'Discussion')
        rightPane.setHeaderIcon(row.kind === 'deliverable'
            ? <DeliverableIcon className="h-4 w-4" />
            : <DocumentIcon mimeType={row.mimeType ?? undefined} className="h-4 w-4" />)
        rightPane.setHeaderSubtitle(row.documentName)
        rightPane.setContent(
            <DemoDeliverableComments
                key={row.projectDocumentId}
                documents={t.subject.taggable}
                thread={t.messages.map((m): DemoComment => ({ id: m.id, author: m.authorName ?? ME, at: m.createdAt, content: m.content }))}
                onPost={(c) => {
                    setPosted((prev) => ({
                        ...prev,
                        [row.projectDocumentId]: [...(prev[row.projectDocumentId] ?? []), { id: c.id, createdAt: c.at, authorUserId: null, authorEmail: null, authorName: c.author, content: c.content }],
                    }))
                    // A new comment reopens a resolved discussion.
                    setResolved((prev) => {
                        const next = { ...prev }
                        delete next[row.projectDocumentId]
                        return next
                    })
                }}
            />
        )
    }

    // The pane's header follows the open discussion's state, as the app's does.
    const openResolved = openId ? !!resolved[openId] : false
    useEffect(() => {
        if (!openId) return
        rightPane.setHeaderActions(<DiscussionActions resolved={openResolved} onToggleResolved={() => toggleResolved(openId)} />)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openId, openResolved, toggleResolved])
    const paneOpen = !!rightPane.content
    useEffect(() => {
        if (!paneOpen) setOpenId(null)
    }, [paneOpen])

    return (
        <div className="flex flex-col gap-3">
            <CommentsToolbar
                view={view}
                onView={setView}
                counts={{
                    all: now === null ? null : rowsInView(found, 'all').length,
                    awaiting: now === null ? null : rowsInView(found, 'awaiting').length,
                    mentions: null,
                    resolved: now === null ? null : rowsInView(found, 'resolved').length,
                }}
                query={query}
                onQuery={setQuery}
            />

            {view !== 'mentions' && (
                <div className="overflow-hidden border-t border-line">
                    {now !== null && rows.length === 0 ? (
                        <EmptyDiscussions view={view} query={query} />
                    ) : (
                        <div className="divide-y divide-line">
                            {rows.map((row) => (
                                <ThreadRow
                                    key={row.projectDocumentId}
                                    row={row}
                                    author={row.latest?.authorName ? { name: row.latest.authorName } : null}
                                    selected={openId === row.projectDocumentId}
                                    open={expanded.has(row.projectDocumentId)}
                                    thread={{ status: 'ready', messages: messagesOf(row.projectDocumentId).slice(-PEEK) }}
                                    text={text}
                                    authorOf={(_id, name) => (name ? { name } : null)}
                                    onToggle={() => toggle(row.projectDocumentId)}
                                    onRetry={() => {}}
                                    onOpen={() => openDiscussion(row)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {view === 'mentions' && (
                <div className="overflow-hidden border-t border-line">
                    <div className="py-12 text-center">
                        <AtSign className="mx-auto mb-2.5 h-7 w-7 text-line" />
                        <div className="text-sm font-medium text-fg">No mentions yet</div>
                        <div className="mt-1 text-xs text-fg-muted">Comments that @mention you will appear here.</div>
                    </div>
                </div>
            )}
        </div>
    )
}
