'use client'

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, User, ChevronRight, Clock, Bell, Bookmark, BellRing } from "lucide-react"
import { useState, useCallback, type ReactNode } from "react"
import { LayoutContext } from "./layout-context"

const TABS = [
  { label: 'Profile',       href: '/d/u/profile',       icon: User     },
  { label: 'Recent',        href: '/d/u/recent',        icon: Clock    },
  { label: 'Reminders',     href: '/d/u/reminders',     icon: Bell     },
  { label: 'Bookmarks',     href: '/d/u/bookmarks',     icon: Bookmark },
  { label: 'Notifications', href: '/d/u/notifications', icon: BellRing },
]

export default function UserLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [slot, setSlotState] = useState<ReactNode>(null)
  const [tabCounts, setTabCountsState] = useState<Record<string, number | null>>({})

  const setSlot = useCallback((node: ReactNode) => setSlotState(node), [])
  const setTabCount = useCallback((href: string, count: number | null) => {
    setTabCountsState((prev) => (prev[href] === count ? prev : { ...prev, [href]: count }))
  }, [])

  return (
    <LayoutContext.Provider value={{ slot, setSlot, setTabCount }}>
      <div className="flex flex-col flex-1 min-h-0">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 mb-4">
          <Home className="h-4 w-4 text-[#45474c] opacity-60" />
          <ChevronRight className="h-3.5 w-3.5 text-[#d1d5db]" />
          <User className="h-4 w-4 text-[#069668]" />
          <span className="font-mono text-[11px] font-bold text-[#1b1b1d] uppercase tracking-tighter">
            Personalization
          </span>
        </nav>

        {/* Page identity header */}
        <div className="flex items-start justify-between gap-6 mb-6">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-white border border-[#e5e7eb] flex items-center justify-center rounded shadow-sm shrink-0">
              <User className="h-10 w-10 text-[#1b1b1d]" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight text-[#1b1b1d] truncate">
                Personalization
              </h1>
              <p className="text-sm text-[#45474c] mt-1">
                Manage your profile, recent pages, reminders, bookmarks and notifications.
              </p>
            </div>
          </div>
        </div>

        {/* Tab strip */}
        <div className="bg-white border border-[#e5e7eb] rounded mb-3 shrink-0 flex items-center justify-between h-14 pr-3">
          <div className="flex items-center h-full">
            {TABS.map((tab) => {
              const isActive = pathname?.startsWith(tab.href)
              const Icon = tab.icon
              const count = tabCounts[tab.href]
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`inline-flex items-center gap-2 h-full px-4 rounded-none font-medium text-sm border-b-2 transition-all ${
                    isActive
                      ? 'border-[#069668] text-[#1b1b1d] font-bold opacity-100'
                      : 'border-transparent text-[#45474c] opacity-60 hover:opacity-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  {count != null && count > 0 && (
                    <span className="ml-1 font-mono text-[10px] font-bold bg-[#069668] text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                      {count}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
          {slot && <div className="shrink-0">{slot}</div>}
        </div>

        {children}
      </div>
    </LayoutContext.Provider>
  )
}
