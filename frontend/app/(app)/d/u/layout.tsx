'use client'

import { usePathname } from "next/navigation"
import { Home, User, UserCircle, ChevronRight } from "lucide-react"
import { useState, useCallback, type ReactNode } from "react"
import { LayoutContext } from "./layout-context"
import { PageHeading } from "@/components/ui/page-heading"
import { useUiShell } from "@/lib/ui-shell-context"

// Profile is the one page with this frame. Home and Inbox (/d/u/home, /d/u/inbox) span firms and
// draw their own headings; the old Recent, Bookmarks, Reminders and Notifications URLs redirect to
// them (next.config.js).
const TABS = [
  { label: 'Profile',       href: '/d/u/profile',       icon: User },
]

export default function UserLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const uiShell = useUiShell()
  // The slot and tab counts outlive the tab strip: the forwarded pages still report them.
  const [slot, setSlotState] = useState<ReactNode>(null)
  const [, setTabCountsState] = useState<Record<string, number | null>>({})

  const setSlot = useCallback((node: ReactNode) => setSlotState(node), [])
  const setTabCount = useCallback((href: string, count: number | null) => {
    setTabCountsState((prev) => (prev[href] === count ? prev : { ...prev, [href]: count }))
  }, [])

  // Home, Inbox and the forwarded pages render their own headings, not the Profile frame.
  const isMovedPage = !TABS.some((t) => pathname?.startsWith(t.href))

  return (
    <LayoutContext.Provider value={{ slot, setSlot, setTabCount }}>
      <div className="flex flex-col flex-1 min-h-0">
        {/* v1 only: the New UI's header bar carries the breadcrumb. */}
        {uiShell === 'v1' && (
          <nav className="flex items-center gap-1.5 mb-4">
            <Home className="h-4 w-4 text-[#45474c] opacity-60" />
            <ChevronRight className="h-3.5 w-3.5 text-[#d1d5db]" />
            <User className="h-4 w-4 text-primary" />
            <span className="font-mono text-[11px] font-bold text-[#1b1b1d] uppercase tracking-tighter">
              Personalization
            </span>
          </nav>
        )}

        {/* One page left here, so a plain title instead of a tab strip. */}
        {!isMovedPage && (
          <PageHeading
            icon={<UserCircle />}
            title="Profile"
            description="Your details, notifications and data."
            className="pb-6"
          />
        )}

        {children}
      </div>
    </LayoutContext.Provider>
  )
}
