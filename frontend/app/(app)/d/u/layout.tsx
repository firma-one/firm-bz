'use client'

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, User, ChevronRight, Clock, Bell, Bookmark } from "lucide-react"

const TABS = [
  { label: 'Recent', href: '/d/u/recent', icon: Clock },
  { label: 'Reminders', href: '/d/u/reminders', icon: Bell },
  { label: 'Bookmarks', href: '/d/u/bookmarks', icon: Bookmark },
]

export default function UserLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Breadcrumb — monospace architectural style matching project-workspace */}
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
              Manage your recent pages, reminders and bookmarks.
            </p>
          </div>
        </div>
      </div>

      {/* Tab strip */}
      <div className="bg-white border border-[#e5e7eb] rounded mb-3 shrink-0 flex items-center h-14">
        <div className="flex items-center h-full">
          {TABS.map((tab) => {
            const isActive = pathname?.startsWith(tab.href)
            const Icon = tab.icon
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
              </Link>
            )
          })}
        </div>
      </div>

      {children}
    </div>
  )
}
