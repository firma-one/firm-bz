'use client'

import { useEffect, useMemo, useState } from 'react'
import { AtSign, MessagesSquare, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { DemoEngagement, DemoFolder } from '@/lib/demo/static-demo-data'
import { DELIVERABLE_ACTORS, getDemoDeliverables } from '@/lib/demo/demo-deliverables'
import { MIME_BY_TYPE } from '@/components/demo/demo-file-list'
import { PEEK, ThreadRow, type DocRow, type TextKit, type ThreadMessage } from '@/components/projects/engagement-comments-tab'

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

const toggleClass = (active: boolean) =>
    cn(
        'inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-small transition-colors',
        active ? 'bg-surface-selected text-fg' : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
    )

/**
 * Static counterpart to engagement-comments-tab.tsx: the same All / Mentions toggles and thread rows
 * (the app's own ThreadRow), on two of the engagement's deliverables and a document in each, over
 * sample comments with a mention and a document tag. "Show N earlier" opens a row in place, as in the app; no fetching.
 * Mentions shows its real empty state.
 */
export function DemoEngagementComments({ engagement }: { engagement: DemoEngagement }) {
    const [activeTab, setActiveTab] = useState<'all' | 'mentions'>('all')
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
        const deliverable = (f: DemoFolder) => ({ id: f.id, docId: f.docId, name: f.name, kind: 'deliverable' as const, mimeType: null, tag: tagIn(f) })
        const document = (f: DemoFolder) => {
            const file = f.files[0]
            return file ? { id: file.id, docId: file.docId, name: file.name, kind: 'file' as const, mimeType: MIME_BY_TYPE[file.type] ?? 'application/octet-stream', tag: tagIn(f) } : null
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
                count: messages.length,
                latest: { createdAt: last.createdAt, preview: last.content, authorUserId: null, authorName: last.authorName ?? null, authorEmail: null },
            }
            return { row, messages: messages.slice(-PEEK) }
        })
    }, [subjects, now])

    const text = useMemo<TextKit>(() => {
        const docs = new Map(files.map((f) => [f.docId, { docId: f.docId, fileName: f.name, mimeType: MIME_BY_TYPE[f.type] ?? 'application/octet-stream' }]))
        return {
            names: DELIVERABLE_ACTORS,
            personFor: (name) => (DELIVERABLE_ACTORS.includes(name) ? { name } : undefined),
            docFor: (docId) => docs.get(docId),
        }
    }, [files])

    const q = query.trim().toLowerCase()
    const filtered = q ? threads.filter((t) => t.row.documentName.toLowerCase().includes(q)) : threads

    const toggle = (id: string) =>
        setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-0.5">
                <button type="button" onClick={() => setActiveTab('all')} className={toggleClass(activeTab === 'all')}>
                    <MessagesSquare className="h-3.5 w-3.5" />
                    All
                    {threads.length > 0 && <span className="tabular-nums text-fg-subtle">{threads.length}</span>}
                </button>
                <button type="button" onClick={() => setActiveTab('mentions')} className={toggleClass(activeTab === 'mentions')}>
                    <AtSign className="h-3.5 w-3.5" />
                    Mentions
                </button>
            </div>

            {activeTab === 'all' && (
                <>
                    <div className="flex items-center justify-end">
                        <div className="relative w-52">
                            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted" />
                            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search comments…" className="pl-8" />
                        </div>
                    </div>

                    <div className="overflow-hidden border-t border-line">
                        {now !== null && filtered.length === 0 ? (
                            <div className="py-12 text-center">
                                <MessagesSquare className="mx-auto mb-2.5 h-7 w-7 text-line" />
                                <div className="text-sm font-medium text-fg">No comments found</div>
                            </div>
                        ) : (
                            <div className="divide-y divide-line">
                                {filtered.map(({ row, messages }) => (
                                    <ThreadRow
                                        key={row.projectDocumentId}
                                        row={row}
                                        author={{ name: row.latest!.authorName! }}
                                        open={expanded.has(row.projectDocumentId)}
                                        thread={{ status: 'ready', messages }}
                                        text={text}
                                        authorOf={(_id, name) => (name ? { name } : null)}
                                        onToggle={() => toggle(row.projectDocumentId)}
                                        onRetry={() => {}}
                                        onOpenThread={() => {}}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}

            {activeTab === 'mentions' && (
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
