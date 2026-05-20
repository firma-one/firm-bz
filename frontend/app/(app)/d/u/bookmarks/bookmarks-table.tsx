"use client"

import { useState, useMemo, useEffect } from "react"
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
  Filter,
  RotateCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTabCount } from "../layout-context"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

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

const KIND_FILTER_LABELS: Record<KindFilter, string> = {
  all: 'All',
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
  const [refreshing, setRefreshing] = useState(false)
  const setTabCount = useTabCount()

  useEffect(() => { setTabCount('/d/u/bookmarks', bookmarks.length) }, [bookmarks.length, setTabCount])

  async function handleRefresh() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/bookmarks')
      if (res.ok) { const data = await res.json(); setBookmarks(data.bookmarks ?? []) }
    } finally { setRefreshing(false) }
  }

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
    <div className="flex flex-col gap-3">
      {atCap && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded border border-amber-200 bg-amber-50 text-[0.8125rem] text-amber-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="font-semibold">Bookmarks are capped at 50.</span>
          <span>Remove older or unused ones to add more.</span>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={`h-8 gap-1.5 text-xs bg-white rounded-[2px] border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors ${kindFilter !== 'all' ? 'border-slate-400 ring-1 ring-slate-300' : ''}`}
            >
              <Filter className="h-3 w-3 opacity-60" />
              Type
              {kindFilter !== 'all' && <span className="ml-0.5 bg-slate-200 text-slate-800 px-1.5 rounded-full text-[10px] font-medium">1</span>}
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[180px] py-1 text-xs rounded-[2px]">
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-100">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400 p-0 font-medium">Type</DropdownMenuLabel>
              <DropdownMenuItem className="text-xs rounded-[2px] bg-slate-900 text-white hover:bg-slate-800 hover:text-white focus:bg-slate-800 focus:text-white p-1.5 px-2 cursor-pointer" onSelect={() => {}}>
                Done
              </DropdownMenuItem>
            </div>
            <DropdownMenuCheckboxItem checked={kindFilter === 'all'} onCheckedChange={() => setKindFilter('all')} onSelect={(e) => e.preventDefault()} className="text-xs py-1.5 pl-8">
              Any type
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            {(['document', 'project', 'comment', 'url'] as KindFilter[]).map((key) => (
              <DropdownMenuCheckboxItem key={key} checked={kindFilter === key} onCheckedChange={() => setKindFilter(kindFilter === key ? 'all' : key)} onSelect={(e) => e.preventDefault()} className="text-xs py-1.5 pl-8">
                {KIND_FILTER_LABELS[key]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {kindFilter !== 'all' && (
          <button type="button" onClick={() => setKindFilter('all')} className="h-8 px-2.5 text-xs rounded-[2px] border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors">
            Clear all
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[0.8125rem] text-[#45474c]">{filtered.length} / 50 bookmarks</span>
          <button type="button" disabled={refreshing} onClick={handleRefresh} className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs rounded-[2px] border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 transition-colors">
            <RotateCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#e5e7eb] rounded overflow-hidden">
        {/* Column headers */}
        <div
          className="grid items-center bg-white border-b border-[#e5e7eb] px-4 gap-3"
          style={{ gridTemplateColumns: COLS }}
        >
          <button
            type="button"
            onClick={() => toggleSort('name')}
            className="flex items-center gap-1 h-9 text-[0.8125rem] font-medium text-[#45474c] select-none hover:opacity-100 text-left transition-opacity"
          >
            Name <SortIcon field="name" />
          </button>
          <span className="text-[0.8125rem] font-medium text-[#45474c] select-none">Type</span>
          <span className="text-[0.8125rem] font-medium text-[#45474c] select-none">Client</span>
          <span className="text-[0.8125rem] font-medium text-[#45474c] select-none">Engagement</span>
          <button
            type="button"
            onClick={() => toggleSort('date')}
            className="flex items-center gap-1 h-9 text-[0.8125rem] font-medium text-[#45474c] select-none hover:opacity-100 text-left transition-opacity"
          >
            Bookmarked <SortIcon field="date" />
          </button>
          <span className="text-[0.8125rem] font-medium text-[#45474c] select-none" />
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
