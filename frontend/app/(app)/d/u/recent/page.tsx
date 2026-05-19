'use client'

import { useEffect, useState } from "react"
import { Users, Briefcase, Clock, Filter, ChevronDown } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type RecentItem = {
  type: 'client' | 'engagement'
  name: string
  slug: string
  href: string
  visitedAt: number
}

type TypeFilter = 'all' | 'client' | 'engagement'

const MAX_RECENT_ITEMS = 10

function toLabel(slug: string) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const COLS = '1fr 12% 18%'

export default function RecentPage() {
  const [items, setItems] = useState<RecentItem[]>([])
  const [mounted, setMounted] = useState(false)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  useEffect(() => {
    const allItems: RecentItem[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith('fm_nav_recents_')) continue
      try {
        const raw = localStorage.getItem(key)
        if (!raw) continue
        const parsed = JSON.parse(raw) as RecentItem[]
        allItems.push(...parsed)
      } catch { /* ignore */ }
    }
    // Deduplicate by href, keep most recent visit
    const seen = new Map<string, RecentItem>()
    for (const item of allItems) {
      const existing = seen.get(item.href)
      if (!existing || item.visitedAt > existing.visitedAt) {
        seen.set(item.href, {
          ...item,
          name: item.name || toLabel(item.slug),
        })
      }
    }
    const sorted = Array.from(seen.values())
      .sort((a, b) => b.visitedAt - a.visitedAt)
      .slice(0, MAX_RECENT_ITEMS)
    setItems(sorted)
    setMounted(true)
  }, [])

  if (!mounted) return null

  const filtered = typeFilter === 'all' ? items : items.filter((i) => i.type === typeFilter)

  return (
    <div className="flex flex-col gap-3">
      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={`h-8 gap-1.5 text-xs bg-white rounded-[2px] border-[#e5e7eb] text-[#45474c] hover:bg-[#f9f9fb] hover:text-[#1b1b1d] transition-colors ${typeFilter !== 'all' ? 'border-[#069668] ring-1 ring-[#069668]/30 text-[#069668]' : ''}`}
            >
              <Filter className="h-3.5 w-3.5" />
              Type{typeFilter !== 'all' && `: ${typeFilter === 'client' ? 'Client' : 'Engagement'}`}
              <ChevronDown className="h-3 w-3 ml-0.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuRadioGroup value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
              <DropdownMenuRadioItem value="all" className="text-xs">All</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="client" className="text-xs">Client</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="engagement" className="text-xs">Engagement</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="ml-auto text-[0.8125rem] text-[#45474c]">{filtered.length} pages</span>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#e5e7eb] rounded overflow-hidden">
        {/* Column headers */}
        <div
          className="grid items-center h-10 px-4 gap-3 border-b border-[#e5e7eb] bg-white"
          style={{ gridTemplateColumns: COLS }}
        >
          <span className="text-[11px] font-medium text-[#45474c] opacity-60 uppercase tracking-tight">Name</span>
          <span className="text-[11px] font-medium text-[#45474c] opacity-60 uppercase tracking-tight">Type</span>
          <span className="text-[11px] font-medium text-[#45474c] opacity-60 uppercase tracking-tight">Last visited</span>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-[0.8125rem] text-[#45474c]">
            No recently visited pages yet. Navigate to clients and engagements to build your history.
          </div>
        ) : (
          filtered.map((item) => {
            const Icon = item.type === 'client' ? Users : Briefcase
            const visitedDate = new Date(item.visitedAt)
            const isToday = new Date().toDateString() === visitedDate.toDateString()
            const dateLabel = isToday
              ? visitedDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
              : visitedDate.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })

            return (
              <div
                key={item.href}
                className="grid items-center h-10 px-4 gap-3 border-b border-[#e5e7eb] hover:bg-[#f9f9fb] transition-colors"
                style={{ gridTemplateColumns: COLS }}
              >
                <Link href={item.href} className="flex items-center gap-2 min-w-0 group">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-[#45474c]" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[0.8125rem] font-medium text-[#1b1b1d] truncate group-hover:text-[#069668] transition-colors">
                      {item.name}
                    </span>
                    <span className="block text-[10px] font-mono text-[#9ca3af] truncate">/{item.slug}</span>
                  </span>
                </Link>
                <span className="text-[0.8125rem] text-[#45474c] capitalize">{item.type}</span>
                <span className="flex items-center gap-1.5 text-[0.8125rem] text-[#45474c]">
                  <Clock className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" />
                  {dateLabel}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
