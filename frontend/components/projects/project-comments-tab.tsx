'use client'

import React, { useEffect, useState } from 'react'
import { MessageCircle, Search, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useRightPane } from '@/lib/right-pane-context'
import { DocumentDocCommentsPane } from '@/components/projects/document-doc-comments-pane'
import { RelativeDateTime } from '@/components/ui/relative-date-time'

type DocRow = {
  projectDocumentId: string
  documentName: string
  count: number
  latest: { createdAt: string; preview: string } | null
}

export function ProjectCommentsTab({
  projectId,
  orgSlug,
}: {
  projectId: string
  orgSlug?: string
}) {
  const rightPane = useRightPane()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<DocRow[]>([])
  const [error, setError] = useState<string | null>(null)

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
    return () => {
      cancelled = true
    }
  }, [projectId, query])

  const empty = !loading && !error && rows.length === 0

  return (
    <div className="p-4 flex flex-col gap-3">
      {/* toolbar row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-[#45474c]" />
          <span className="text-sm font-semibold text-[#1b1b1d]">Comments</span>
          {!loading && (
            <span className="font-mono text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
              {rows.length}
            </span>
          )}
        </div>
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

      {/* content card */}
      <div className="bg-white border border-[#e5e7eb] rounded overflow-hidden">
        {error ? (
          <div className="p-6 text-sm text-rose-700 bg-rose-50 border-b border-rose-100">
            {error}
          </div>
        ) : loading ? (
          <div className="p-6 text-sm text-[#45474c]">Loading comments…</div>
        ) : empty ? (
          <div className="py-12 text-center">
            <MessageCircle className="h-7 w-7 text-[#e5e7eb] mx-auto mb-2.5" />
            <div className="text-sm font-medium text-[#1b1b1d]">No comments yet</div>
            <div className="text-xs text-[#45474c] mt-1">
              Add a comment from any document, then it will show up here.
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[#e5e7eb]">
            {rows.map((r) => (
              <button
                key={r.projectDocumentId}
                type="button"
                className={cn(
                  'w-full text-left px-4 py-3 hover:bg-[#f9f9fb] transition-colors',
                  'flex items-start gap-3'
                )}
                onClick={() => {
                  rightPane.setTitle('Comment')
                  rightPane.setHeaderActions(null)
                  rightPane.setHeaderIcon(<MessageCircle className="h-4 w-4" />)
                  rightPane.setHeaderSubtitle('Append-only. Visible to all engagement members.')
                  rightPane.setContent(
                    <DocumentDocCommentsPane
                      engagementId={projectId}
                      documentId={r.projectDocumentId}
                      documentName={r.documentName}
                      orgSlug={orgSlug}
                    />
                  )
                  rightPane.setExpanded?.(false)
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#1b1b1d] truncate">
                        {r.documentName}
                      </div>
                      {r.latest ? (
                        <div className="mt-0.5 text-xs text-[#45474c] line-clamp-2">
                          {r.latest.preview}
                        </div>
                      ) : null}
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <span className="inline-flex items-center rounded border border-[#e5e7eb] bg-[#f3f4f6] px-1.5 py-0.5 text-[10px] font-semibold text-[#45474c]">
                        {r.count}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-[#c5c7cc]" />
                    </div>
                  </div>
                  {r.latest ? (
                    <div className="mt-1.5 text-[10px] text-[#9a9ba0]">
                      <RelativeDateTime date={r.latest.createdAt} />
                    </div>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
