'use client'

import { useState } from 'react'
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

/** Static counterpart to engagement-comments-tab.tsx — one thread per real deliverable file in the selected engagement, no fetching. Mentions tab shows its real empty state. */
export function DemoEngagementComments({ engagement }: { engagement: DemoEngagement }) {
    const [activeTab, setActiveTab] = useState<'all' | 'mentions'>('all')
    const [query, setQuery] = useState('')

    const allFiles = engagement.folders.flatMap((f) => f.files)
    const threadFiles = allFiles.slice(0, 4)
    const rows = threadFiles.map((file, i) => ({
        file,
        count: threadFiles.length - i,
        preview: COMMENT_PREVIEWS[i % COMMENT_PREVIEWS.length],
        ts: new Date(Date.now() - (i + 1) * 3 * 86400000).toISOString(),
    }))

    const filteredRows = query.trim()
        ? rows.filter((r) => r.file.name.toLowerCase().includes(query.trim().toLowerCase()))
        : rows

    return (
        <div className="p-4 flex flex-col gap-3">
            <div className="flex items-center gap-1 border-b border-[#e5e7eb] pb-0">
                <button
                    type="button"
                    onClick={() => setActiveTab('all')}
                    className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors',
                        activeTab === 'all' ? 'border-brand-accent text-[#1b1b1d] font-bold' : 'border-transparent text-[#45474c] hover:text-[#1b1b1d]'
                    )}
                >
                    <MessagesSquare className="h-3.5 w-3.5" />
                    All Comments
                    {rows.length > 0 && (
                        <span className="font-mono text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                            {rows.reduce((s, r) => s + r.count, 0)}
                        </span>
                    )}
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('mentions')}
                    className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors',
                        activeTab === 'mentions' ? 'border-brand-accent text-[#1b1b1d] font-bold' : 'border-transparent text-[#45474c] hover:text-[#1b1b1d]'
                    )}
                >
                    <AtSign className="h-3.5 w-3.5" />
                    Mentions
                </button>
            </div>

            {activeTab === 'all' && (
                <>
                    <div className="flex items-center justify-end">
                        <div className="relative w-52">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#45474c]" />
                            <Input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search comments…"
                                className="pl-8 h-8 text-xs bg-[#f9f9fb] border-[#e5e7eb] focus:bg-white rounded"
                            />
                        </div>
                    </div>

                    <div className="bg-white border border-[#e5e7eb] rounded overflow-hidden">
                        {filteredRows.length === 0 ? (
                            <div className="py-12 text-center">
                                <MessagesSquare className="h-7 w-7 text-[#e5e7eb] mx-auto mb-2.5" />
                                <div className="text-sm font-medium text-[#1b1b1d]">No comments found</div>
                            </div>
                        ) : (
                            <div className="divide-y divide-[#e5e7eb]">
                                {filteredRows.map((r) => (
                                    <div key={r.file.id} className="flex items-start gap-3 px-4 py-3 hover:bg-[#f9f9fb] transition-colors">
                                        <div className="mt-0.5 shrink-0 flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
                                            <MessagesSquare className="h-3.5 w-3.5 text-primary" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold text-[#1b1b1d] truncate">{r.file.name}</span>
                                                <span className="shrink-0 inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary tabular-nums leading-none">
                                                    {r.count}
                                                </span>
                                            </div>
                                            <div className="mt-0.5 text-xs text-[#45474c] line-clamp-1">
                                                <span className="text-[9px] font-bold uppercase tracking-wide text-[#9a9ba0] mr-1.5">Latest</span>
                                                {r.preview}
                                            </div>
                                            <div className="mt-1 text-[10px] text-[#9a9ba0] flex items-center gap-1">
                                                <span>Last comment</span>
                                                <RelativeDateTime date={r.ts} />
                                            </div>
                                        </div>
                                        <div className="shrink-0 text-[#9a9ba0]">
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
                <div className="bg-white border border-[#e5e7eb] rounded overflow-hidden">
                    <div className="py-12 text-center">
                        <AtSign className="h-7 w-7 text-[#e5e7eb] mx-auto mb-2.5" />
                        <div className="text-sm font-medium text-[#1b1b1d]">No mentions yet</div>
                        <div className="text-xs text-[#45474c] mt-1">Comments that @mention you will appear here.</div>
                    </div>
                </div>
            )}
        </div>
    )
}
