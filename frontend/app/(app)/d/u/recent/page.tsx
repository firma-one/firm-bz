'use client'

import { useEffect, useState } from "react"
import { Users, Briefcase, Clock } from "lucide-react"
import Link from "next/link"

type RecentItem = {
  type: 'client' | 'engagement'
  name: string
  slug: string
  href: string
  visitedAt: number
}

const MAX_RECENT_ITEMS = 10

function toLabel(slug: string) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function RecentPage() {
  const [items, setItems] = useState<RecentItem[]>([])
  const [mounted, setMounted] = useState(false)

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

  const COLS = '1fr 12% 20%'

  return (
    <div className="px-6 py-6">
      <div className="bg-white border border-[#e5e7eb] rounded-[2px] overflow-hidden">
        {/* Header */}
        <div
          className="grid items-center bg-[#f9f9fb] border-b border-[#e5e7eb] px-4 py-2.5 gap-3"
          style={{ gridTemplateColumns: COLS }}
        >
          <span className="text-[0.75rem] font-semibold text-[#45474c]">Name</span>
          <span className="text-[0.75rem] font-semibold text-[#45474c]">Type</span>
          <span className="text-[0.75rem] font-semibold text-[#45474c]">Last visited</span>
        </div>

        {items.length === 0 ? (
          <div className="px-4 py-12 text-center text-[0.8125rem] text-[#45474c]">
            No recently visited pages yet. Navigate to clients and engagements to build your history.
          </div>
        ) : (
          items.map((item) => {
            const Icon = item.type === 'client' ? Users : Briefcase
            const visitedDate = new Date(item.visitedAt)
            const isToday = new Date().toDateString() === visitedDate.toDateString()
            const dateLabel = isToday
              ? visitedDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
              : visitedDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

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
