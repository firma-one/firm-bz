'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, AtSign, MessagesSquare, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import { DemoEngagement } from '@/lib/demo/static-demo-data'

const COMMENT_PREVIEWS = [
    "This looks great overall. Can we tighten the summary — the main recommendation should come first.",
    "A few numbers here look outdated. Should these reflect the latest figures?",
    "Client requested a slimmed-down version for the board deck. Can we prepare that?",
]

const toggleClass = (active: boolean) =>
    cn(
        'inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-small transition-colors',
        active ? 'bg-surface-selected text-fg' : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
    )

/**
 * Static counterpart to engagement-comments-tab.tsx: the same All / Mentions toggles and hairline
 * thread rows, one thread per real file in the engagement, no fetching. Mentions shows its real
 * empty state.
 */
export function DemoEngagementComments({ engagement }: { engagement: DemoEngagement }) {
    const [activeTab, setActiveTab] = useState<'all' | 'mentions'>('all')
    const [query, setQuery] = useState('')
    // Relative to now, so set after mount to keep server and client markup equal.
    const [now, setNow] = useState<number | null>(null)
    useEffect(() => setNow(Date.now()), [])

    const threadFiles = engagement.folders.flatMap((f) => f.files).slice(0, 4)
    const rows = threadFiles.map((file, i) => ({
        file,
        count: threadFiles.length - i,
        preview: COMMENT_PREVIEWS[i % COMMENT_PREVIEWS.length],
        ts: now === null ? null : new Date(now - (i + 1) * 3 * 86400000).toISOString(),
    }))

    const q = query.trim().toLowerCase()
    const filteredRows = q ? rows.filter((r) => r.file.name.toLowerCase().includes(q)) : rows

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-0.5">
                <button type="button" onClick={() => setActiveTab('all')} className={toggleClass(activeTab === 'all')}>
                    <MessagesSquare className="h-3.5 w-3.5" />
                    All
                    {rows.length > 0 && <span className="tabular-nums text-fg-subtle">{rows.length}</span>}
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
                        {filteredRows.length === 0 ? (
                            <div className="py-12 text-center">
                                <MessagesSquare className="mx-auto mb-2.5 h-7 w-7 text-line" />
                                <div className="text-sm font-medium text-fg">No comments found</div>
                            </div>
                        ) : (
                            <div className="divide-y divide-line">
                                {filteredRows.map((r) => (
                                    <div key={r.file.id} className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-hover">
                                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
                                            <MessagesSquare className="h-3.5 w-3.5 text-primary" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="shrink-0 font-mono text-[11px] font-bold tracking-wide text-primary">{r.file.docId}</span>
                                                <span className="truncate text-sm font-semibold text-fg">{r.file.name}</span>
                                                <span className="inline-flex shrink-0 items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums text-primary">
                                                    {r.count}
                                                </span>
                                            </div>
                                            <div className="mt-0.5 line-clamp-1 text-xs text-fg-muted">
                                                <span className="mr-1.5 text-[9px] font-bold uppercase tracking-wide text-fg-subtle">Latest</span>
                                                {r.preview}
                                            </div>
                                            {r.ts && (
                                                <div className="mt-1 flex items-center gap-1 text-[10px] text-fg-subtle">
                                                    <span>Last comment</span>
                                                    <RelativeDateTime date={r.ts} />
                                                </div>
                                            )}
                                        </div>
                                        <div className="shrink-0 text-fg-subtle transition-all group-hover:translate-x-0.5 group-hover:text-primary">
                                            <ArrowRight className="h-3.5 w-3.5" />
                                        </div>
                                    </div>
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
