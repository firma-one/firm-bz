'use client'

import React, { useEffect, useMemo, useState } from 'react'
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
}: {
  projectId: string
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

  const header = useMemo(() => {
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-slate-600" />
              <div className="text-base font-semibold text-slate-900">Comments</div>
            </div>
            <div className="mt-1 text-sm text-slate-600">
              Pick a document to view and post in its thread.
            </div>
          </div>
          <div className="shrink-0 text-xs text-slate-500">
            {loading ? 'Loading…' : `${rows.length} docs`}
          </div>
        </div>
        <div className="mt-3 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents…"
            className="pl-9 h-9 bg-slate-50 border-slate-200 focus:bg-white"
          />
        </div>
      </div>
    )
  }, [loading, rows.length, query])

  return (
    <div className="space-y-4">
      {header}

      <div className="bg-white border border-stone-200 rounded-xl shadow-sm overflow-hidden">
        {error ? (
          <div className="p-6 text-sm text-rose-700 bg-rose-50 border-b border-rose-100">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading comments…</div>
        ) : empty ? (
          <div className="p-8 text-center">
            <MessageCircle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <div className="text-sm font-medium text-slate-700">No comments yet</div>
            <div className="text-xs text-slate-500 mt-1">
              Add a comment from any document, then it will show up here.
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((r) => (
              <button
                key={r.projectDocumentId}
                type="button"
                className={cn(
                  'w-full text-left p-4 hover:bg-slate-50 transition-colors',
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
                    />
                  )
                  rightPane.setExpanded?.(false)
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        {r.documentName}
                      </div>
                      {r.latest ? (
                        <div className="mt-1 text-xs text-slate-600 line-clamp-2">
                          {r.latest.preview}
                        </div>
                      ) : null}
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                        {r.count}
                      </span>
                      <ChevronRight className="h-4 w-4 text-slate-300" />
                    </div>
                  </div>
                  {r.latest ? (
                    <div className="mt-2 text-[11px] text-slate-400">
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

