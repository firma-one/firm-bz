"use client"

import { useState, useMemo } from "react"
import { type BookmarkWithContext } from "@/lib/actions/user-bookmarks"
import {
  FileText,
  Briefcase,
  MessageSquare,
  Link as LinkIcon,
  ExternalLink,
  Trash2,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  AlertCircle,
} from "lucide-react"

type KindFilter = 'all' | 'document' | 'project' | 'comment' | 'url'
type SortField = 'date' | 'name'
type SortDir = 'asc' | 'desc'

const KIND_ICONS: Record<string, React.ElementType> = {
  document: FileText,
  project: Briefcase,
  comment: MessageSquare,
  url: LinkIcon,
}

const KIND_LABELS: Record<string, string> = {
  document: 'Document',
  project: 'Engagement',
  comment: 'Comment',
  url: 'Link',
}

const KIND_BADGE: Record<string, string> = {
  document: 'bg-blue-50 text-blue-700',
  project:  'bg-[#ecfdf5] text-[#065f46]',
  comment:  'bg-purple-50 text-purple-700',
  url:      'bg-[#f3f4f6] text-[#45474c]',
}

function bookmarkLabel(b: BookmarkWithContext): string {
  if (b.label) return b.label
  if (b.kind === 'project' && b.engagementName) return b.engagementName
  if (b.kind === 'document') return b.engagementName ? `Document · ${b.engagementName}` : 'Document'
  if (b.kind === 'comment') return b.engagementName ? `Comment · ${b.engagementName}` : 'Comment'
  if (b.kind === 'url' && b.url) return b.url
  return KIND_LABELS[b.kind] ?? b.kind
}

function bookmarkHref(b: BookmarkWithContext): string {
  if (b.firmSlug && b.clientSlug && b.engagementSlug) {
    const base = `/d/f/${b.firmSlug}/c/${b.clientSlug}/e/${b.engagementSlug}`
    if (b.kind === 'document' && b.documentId) return `${base}/files`
    if (b.kind === 'comment') return `${base}/comments`
    return base
  }
  return b.url ?? '#'
}

const COLS = '1fr 11% 16% 16% 11% 9%'

type Props = { initialBookmarks: BookmarkWithContext[]; atCap?: boolean }

export function BookmarksTable({ initialBookmarks, atCap }: Props) {
  const [bookmarks, setBookmarks] = useState(initialBookmarks)
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [removing, setRemoving] = useState<string | null>(null)

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  async function handleRemove(id: string) {
    setRemoving(id)
    try {
      const res = await fetch('/api/bookmarks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (res.ok) {
        setBookmarks((prev) => prev.filter((b) => b.id !== id))
        window.dispatchEvent(new Event('pockett-bookmarks-updated'))
      }
    } finally {
      setRemoving(null)
    }
  }

  const filtered = useMemo(() => {
    const f = kindFilter === 'all' ? bookmarks : bookmarks.filter((b) => b.kind === kindFilter)
    return [...f].sort((a, b) => {
      let cmp = 0
      if (sortField === 'date') {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      } else {
        cmp = bookmarkLabel(a).localeCompare(bookmarkLabel(b))
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [bookmarks, kindFilter, sortField, sortDir])

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronsUpDown className="h-3 w-3 text-[#9ca3af]" />
    return sortDir === 'asc'
      ? <ChevronUp className="h-3 w-3 text-[#069668]" />
      : <ChevronDown className="h-3 w-3 text-[#069668]" />
  }

  return (
    <div className="px-6 py-6">
      {atCap && (
        <div className="mb-4 flex items-center gap-2 px-4 py-2.5 rounded-[2px] border border-amber-200 bg-amber-50 text-[0.8125rem] text-amber-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="font-semibold">Bookmarks are capped at 50.</span>
          <span>Remove older or unused ones to add more.</span>
        </div>
      )}

      <div className="bg-white border border-[#e5e7eb] rounded-[2px] overflow-hidden">
        {/* Filters + count */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#e5e7eb] bg-[#f9f9fb] flex-wrap">
          <div className="flex items-center gap-1.5">
            <label className="text-[0.75rem] font-medium text-[#45474c]">Kind</label>
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as KindFilter)}
              className="h-7 rounded-[2px] border border-[#e5e7eb] bg-white px-2 text-[0.75rem] text-[#1b1b1d] focus:outline-none focus:ring-1 focus:ring-[#069668]"
            >
              <option value="all">All</option>
              <option value="document">Document</option>
              <option value="project">Engagement</option>
              <option value="comment">Comment</option>
              <option value="url">Link</option>
            </select>
          </div>
          <div className="ml-auto text-[0.75rem] text-[#45474c]">
            {filtered.length} / 50 bookmarks
          </div>
        </div>

        {/* Column headers */}
        <div
          className="grid items-center bg-[#f9f9fb] border-b border-[#e5e7eb] px-4 gap-3"
          style={{ gridTemplateColumns: COLS }}
        >
          <button
            type="button"
            onClick={() => toggleSort('name')}
            className="flex items-center gap-1 h-9 text-[0.75rem] font-semibold text-[#45474c] hover:text-[#1b1b1d] text-left"
          >
            Name <SortIcon field="name" />
          </button>
          <span className="text-[0.75rem] font-semibold text-[#45474c]">Kind</span>
          <span className="text-[0.75rem] font-semibold text-[#45474c]">Client</span>
          <span className="text-[0.75rem] font-semibold text-[#45474c]">Engagement</span>
          <button
            type="button"
            onClick={() => toggleSort('date')}
            className="flex items-center gap-1 h-9 text-[0.75rem] font-semibold text-[#45474c] hover:text-[#1b1b1d] text-left"
          >
            Bookmarked <SortIcon field="date" />
          </button>
          <span className="text-[0.75rem] font-semibold text-[#45474c]" />
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-[0.8125rem] text-[#45474c]">
            No bookmarks match the current filter.
          </div>
        ) : (
          filtered.map((b) => {
            const Icon = KIND_ICONS[b.kind] ?? LinkIcon
            const label = bookmarkLabel(b)
            const href = bookmarkHref(b)
            const isExternal = b.kind === 'url'
            const isRemoving = removing === b.id
            return (
              <div
                key={b.id}
                className={`grid items-center h-10 px-4 gap-3 border-b border-[#e5e7eb] hover:bg-[#f9f9fb] transition-colors ${isRemoving ? 'opacity-50' : ''}`}
                style={{ gridTemplateColumns: COLS }}
              >
                <a
                  href={href}
                  target={isExternal ? '_blank' : undefined}
                  rel={isExternal ? 'noopener noreferrer' : undefined}
                  className="flex items-center gap-2 min-w-0 group"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-[#45474c]" />
                  <span className="text-[0.8125rem] font-medium text-[#1b1b1d] truncate group-hover:text-[#069668] transition-colors">
                    {label}
                  </span>
                  {isExternal && (
                    <ExternalLink className="h-3 w-3 shrink-0 text-[#9ca3af] group-hover:text-[#069668]" />
                  )}
                </a>
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold leading-none w-fit ${KIND_BADGE[b.kind] ?? KIND_BADGE.url}`}>
                  <Icon className="h-3 w-3" />
                  {KIND_LABELS[b.kind] ?? b.kind}
                </span>
                <span className="text-[0.8125rem] text-[#45474c] truncate">
                  {b.clientName ?? <span className="text-[#9ca3af]">—</span>}
                </span>
                <span className="text-[0.8125rem] text-[#45474c] truncate">
                  {b.engagementName ?? <span className="text-[#9ca3af]">—</span>}
                </span>
                <span className="text-[0.8125rem] text-[#45474c]">
                  {b.createdAt
                    ? new Date(b.createdAt).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
                    : <span className="text-[#9ca3af]">—</span>
                  }
                </span>
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={isRemoving}
                    onClick={() => handleRemove(b.id)}
                    title="Remove bookmark"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-[2px] border border-[#e5e7eb] bg-white text-[0.75rem] text-[#45474c] hover:text-red-600 hover:border-red-300 disabled:opacity-40 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
