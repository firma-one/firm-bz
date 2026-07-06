'use client'

import React, { useEffect, useState } from 'react'
import { AtSign, Search, ArrowRight, ArrowUp, MessagesSquare } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SandboxCommentsPreview } from '@/components/projects/sandbox-board-comments-preview'

function renderMentions(content: string) {
  const tokens: { type: 'mention' | 'text'; value: string }[] = []
  let remaining = content
  while (remaining.startsWith('@')) {
    const match = remaining.match(/^(@[A-Za-z][^\s]*(?:\s+[A-Z][^\s]*)?)(\s+|$)/)
    if (!match) break
    tokens.push({ type: 'mention', value: match[1] })
    remaining = remaining.slice(match[0].length)
  }
  if (remaining) tokens.push({ type: 'text', value: remaining })
  return tokens.map((t, i) =>
    t.type === 'mention'
      ? <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-primary/10 text-primary leading-none mr-1 cursor-pointer">{t.value}</span>
      : <span key={i}>{t.value}</span>
  )
}

type DocRow = {
  projectDocumentId: string
  documentName: string
  count: number
  latest: { createdAt: string; preview: string; authorIsExternal?: boolean } | null
}

type MentionRow = {
  messageId: string
  createdAt: string
  preview: string
  projectDocumentId: string
  documentName: string
}

export function EngagementCommentsTab({
  projectId,
  boardUrl,
  isSandboxFirm,
  projectName,
}: {
  projectId: string
  orgSlug?: string
  boardUrl?: string
  isSandboxFirm?: boolean
  projectName?: string
}) {
  const [activeTab, setActiveTab] = useState<'all' | 'mentions'>('all')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<DocRow[]>([])
  const [error, setError] = useState<string | null>(null)

  // Mentions tab state
  const [mentionsLoading, setMentionsLoading] = useState(true)
  const [mentionRows, setMentionRows] = useState<MentionRow[]>([])
  const [mentionsError, setMentionsError] = useState<string | null>(null)

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
        if (!cancelled) setRows(data.documents ?? [])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load comments')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [projectId, query])

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
        if (!cancelled) setMentionRows(data.mentions ?? [])
      } catch (e) {
        if (!cancelled) setMentionsError(e instanceof Error ? e.message : 'Failed to load mentions')
      } finally {
        if (!cancelled) setMentionsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [projectId])

  const empty = !loading && !error && rows.length === 0
  const mentionsEmpty = !mentionsLoading && !mentionsError && mentionRows.length === 0

  const goToDeliverable = (projectDocumentId: string) => {
    if (boardUrl) {
      window.location.href = `${boardUrl}#doc-file:${projectDocumentId}`
    }
  }

  if (isSandboxFirm) {
    return <SandboxCommentsPreview projectName={projectName} />
  }

  return (
    <div className="p-4 flex flex-col gap-3">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-[#e5e7eb] pb-0">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors',
            activeTab === 'all'
              ? 'border-brand-accent text-[#1b1b1d] font-bold'
              : 'border-transparent text-[#45474c] hover:text-[#1b1b1d]'
          )}
        >
          <MessagesSquare className="h-3.5 w-3.5" />
          All Comments
          {!loading && rows.length > 0 && (
            <span className="font-mono text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
              {rows.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('mentions')}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors',
            activeTab === 'mentions'
              ? 'border-brand-accent text-[#1b1b1d] font-bold'
              : 'border-transparent text-[#45474c] hover:text-[#1b1b1d]'
          )}
        >
          <AtSign className="h-3.5 w-3.5" />
          Mentions
          {!mentionsLoading && mentionRows.length > 0 && (
            <span className="font-mono text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
              {mentionRows.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'all' && (
        <>
          {/* search */}
          <div className="flex items-center justify-end">
            <div className="relative w-52">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#45474c]" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search documents…"
                className="pl-8 h-8 text-xs bg-[#f9f9fb] border-[#e5e7eb] focus:bg-white rounded"
              />
            </div>
          </div>

          <div className="bg-white border border-[#e5e7eb] rounded overflow-hidden">
            {error ? (
              <div className="p-6 text-sm text-rose-700 bg-rose-50 border-b border-rose-100">{error}</div>
            ) : loading ? (
              <div className="p-6 text-sm text-[#45474c]">Loading comments…</div>
            ) : empty ? (
              <div className="py-12 text-center">
                <MessagesSquare className="h-7 w-7 text-[#e5e7eb] mx-auto mb-2.5" />
                <div className="text-sm font-medium text-[#1b1b1d]">No comments yet</div>
                <div className="text-xs text-[#45474c] mt-1">Add a comment from any document, then it will show up here.</div>
              </div>
            ) : (
              <div className="divide-y divide-[#e5e7eb]">
                {rows.map((r) => (
                  <Tooltip key={r.projectDocumentId}>
                  <TooltipTrigger asChild>
                  <div
                    className="flex items-start gap-3 px-4 py-3 hover:bg-[#f9f9fb] transition-colors cursor-pointer group"
                    onClick={() => goToDeliverable(r.projectDocumentId)}
                  >
                    <div className="mt-0.5 shrink-0 flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
                      <MessagesSquare className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[#1b1b1d] truncate">{r.documentName}</span>
                        <span className="shrink-0 inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary tabular-nums leading-none">
                          {r.count}
                        </span>
                        {r.latest?.authorIsExternal && (
                            <span
                                className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-amber-50 border border-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 leading-none"
                                title="Last message is from an external contributor — awaiting your reply."
                            >
                                <ArrowUp className="h-2.5 w-2.5" />
                                Awaiting reply
                            </span>
                        )}
                      </div>
                      {r.latest ? (
                        <div className="mt-0.5 text-xs text-[#45474c] line-clamp-1">
                          <span className="text-[9px] font-bold uppercase tracking-wide text-[#9a9ba0] mr-1.5">Latest</span>{renderMentions(r.latest.preview)}
                        </div>
                      ) : null}
                      {r.latest ? (
                        <div className="mt-1 text-[10px] text-[#9a9ba0] flex items-center gap-1">
                          <span>Last comment</span>
                          <RelativeDateTime date={r.latest.createdAt} />
                        </div>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-[#9a9ba0] group-hover:text-primary group-hover:translate-x-0.5 transition-all">
                      <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                  </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">Go to Deliverable</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'mentions' && (
        <div className="bg-white border border-[#e5e7eb] rounded overflow-hidden">
          {mentionsError ? (
            <div className="p-6 text-sm text-rose-700 bg-rose-50 border-b border-rose-100">{mentionsError}</div>
          ) : mentionsLoading ? (
            <div className="p-6 text-sm text-[#45474c]">Loading mentions…</div>
          ) : mentionsEmpty ? (
            <div className="py-12 text-center">
              <AtSign className="h-7 w-7 text-[#e5e7eb] mx-auto mb-2.5" />
              <div className="text-sm font-medium text-[#1b1b1d]">No mentions yet</div>
              <div className="text-xs text-[#45474c] mt-1">Comments that @mention you will appear here.</div>
            </div>
          ) : (
            <div className="divide-y divide-[#e5e7eb]">
              {mentionRows.map((r) => (
                <div key={r.messageId} className="flex items-center gap-2 px-4 py-3 hover:bg-[#f9f9fb] transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-primary truncate flex items-center gap-1">
                      <AtSign className="h-3 w-3 shrink-0" />
                      {r.documentName}
                    </div>
                    <div className="mt-0.5 text-xs text-[#45474c] line-clamp-2">{renderMentions(r.preview)}</div>
                    <div className="mt-1 text-[10px] text-[#9a9ba0]">
                      <RelativeDateTime date={r.createdAt} />
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => goToDeliverable(r.projectDocumentId)}
                          className="h-7 w-7 rounded flex items-center justify-center text-[#9a9ba0] hover:text-primary hover:translate-x-0.5 transition-all"
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
