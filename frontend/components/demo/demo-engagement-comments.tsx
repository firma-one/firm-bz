'use client'

import { useEffect, useMemo, useState } from 'react'
import { AtSign, Reply, Search } from 'lucide-react'
import { DemoEngagement, DemoFolder } from '@/lib/demo/static-demo-data'
import { DELIVERABLE_ACTORS, getDemoDeliverables } from '@/lib/demo/demo-deliverables'
import { MIME_BY_TYPE } from '@/components/demo/demo-file-list'
import {
    CommentsToolbar, PEEK, ThreadRow, type CommentsView, type DocRow, type TextKit, type ThreadMessage,
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

/**
 * Static counterpart to engagement-comments-tab.tsx: the same toolbar (All, Awaiting reply, Mentions,
 * and search) and thread rows (the app's own ThreadRow), on two of the engagement's deliverables and a
 * document in each, over sample comments with a mention and a document tag. Search looks in what was
 * said and in document and deliverable names and IDs; "Show N earlier" opens a row in place. No
 * fetching. Mentions shows its real empty state.
 */
export function DemoEngagementComments({ engagement }: { engagement: DemoEngagement }) {
    const [view, setView] = useState<CommentsView>('all')
    const [query, setQuery] = useState('')
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    // Relative to now, so set after mount to keep server and client markup equal.
    const [now, setNow] = useState<number | null>(null)
    useEffect(() => setNow(Date.now()), [])

    const files = useMemo(() => engagement.folders.flatMap((f) => f.files), [engagement])
    /** What the threads are on: two deliverables and a document in each, as on a real engagement. */
    const subjects = useMemo(() => {
        const [a, b] = getDemoDeliverables(engagement).map((d) => d.folder)
        const tagIn = (f: DemoFolder) => (f.files[1] ?? f.files[0])?.docId ?? f.docId
        const deliverable = (f: DemoFolder) => ({ id: f.id, docId: f.docId, name: f.name, kind: 'deliverable' as const, mimeType: null, in: null, tag: tagIn(f) })
        const document = (f: DemoFolder) => {
            const file = f.files[0]
            return file
                ? { id: file.id, docId: file.docId, name: file.name, kind: 'file' as const, mimeType: MIME_BY_TYPE[file.type] ?? 'application/octet-stream', in: { docId: f.docId, name: f.name }, tag: tagIn(f) }
                : null
        }
        return [a && deliverable(a), b && deliverable(b), a && document(a), b && document(b)].filter((x): x is NonNullable<typeof x> => !!x)
    }, [engagement])

    const threads = useMemo(() => {
        if (now === null) return []
        return subjects.slice(0, THREAD_LENGTHS.length).map((subject, i) => {
            const n = THREAD_LENGTHS[i]
            const messages: ThreadMessage[] = CONVERSATION.slice(0, n).map((c, k) => ({
                id: `${subject.id}-${k}`,
                createdAt: new Date(now - ((i * 30) + 2 + (n - 1 - k) * 7) * 3_600_000).toISOString(),
                authorUserId: null,
                authorEmail: null,
                authorName: c.author,
                content: c.text(subject.tag),
            }))
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
            }
            return { row, messages }
        })
    }, [subjects, now])

    // Search as the app's: a thread's document, its deliverable, or what was said; an older comment
    // that matches is shown in the row instead of the latest.
    const q = query.trim().toLowerCase()
    const found = useMemo(() => {
        if (!q) return threads.map((t) => t.row)
        const has = (text: string | null | undefined) => !!text && text.toLowerCase().includes(q)
        return threads.flatMap(({ row, messages }) => {
            const hit = [...messages].reverse().find((m) => has(m.content))
            if (!(has(row.documentName) || has(row.docId) || has(row.deliverable?.docId) || has(row.deliverable?.name) || hit)) return []
            const older = hit && hit !== messages[messages.length - 1] ? hit : null
            return [{
                ...row,
                match: older ? { createdAt: older.createdAt, preview: older.content, authorUserId: null, authorName: older.authorName ?? null, authorEmail: null } : null,
            }]
        })
    }, [threads, q])
    const awaiting = found.filter((r) => r.latest?.authorIsExternal)
    const rows = view === 'awaiting' ? awaiting : found
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

    return (
        <div className="flex flex-col gap-3">
            <CommentsToolbar
                view={view}
                onView={setView}
                counts={{ all: now === null ? null : found.length, awaiting: now === null ? null : awaiting.length, mentions: null }}
                query={query}
                onQuery={setQuery}
            />

            {view !== 'mentions' && (
                <div className="overflow-hidden border-t border-line">
                    {now !== null && rows.length === 0 ? (
                        <div className="py-12 text-center">
                            {view === 'awaiting' && !q ? (
                                <>
                                    <Reply className="mx-auto mb-2.5 h-7 w-7 text-line" />
                                    <div className="text-sm font-medium text-fg">Nothing awaiting a reply</div>
                                    <div className="mt-1 text-xs text-fg-muted">Threads where a client or external collaborator spoke last show up here.</div>
                                </>
                            ) : (
                                <>
                                    <Search className="mx-auto mb-2.5 h-7 w-7 text-line" />
                                    <div className="text-sm font-medium text-fg">No comments match “{query.trim()}”</div>
                                    <div className="mt-1 text-xs text-fg-muted">Search looks in what was said, and in document and deliverable names and IDs.</div>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="divide-y divide-line">
                            {rows.map((row) => {
                                const shown = row.match ?? row.latest
                                return (
                                    <ThreadRow
                                        key={row.projectDocumentId}
                                        row={row}
                                        author={shown?.authorName ? { name: shown.authorName } : null}
                                        open={expanded.has(row.projectDocumentId)}
                                        thread={{ status: 'ready', messages: messagesOf(row.projectDocumentId).slice(-PEEK) }}
                                        text={text}
                                        authorOf={(_id, name) => (name ? { name } : null)}
                                        onToggle={() => toggle(row.projectDocumentId)}
                                        onRetry={() => {}}
                                        onOpenThread={() => {}}
                                    />
                                )
                            })}
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
