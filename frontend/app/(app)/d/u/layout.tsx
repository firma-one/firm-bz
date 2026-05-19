'use client'

import Link from "next/link"
import { usePathname } from "next/navigation"
import { User } from "lucide-react"
import { PageBreadcrumb } from "@/components/ui/page-breadcrumb"

const TABS = [
  { label: 'Recent', href: '/d/u/recent' },
  { label: 'Reminders', href: '/d/u/reminders' },
  { label: 'Bookmarks', href: '/d/u/bookmarks' },
]

export default function UserLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div className="flex flex-col min-h-screen bg-[#f9f9fb]">
      <div className="max-w-5xl mx-auto w-full px-6 pt-8">
        <PageBreadcrumb items={[{ label: 'Personalization', icon: <User className="h-4 w-4" /> }]} />
        <nav className="flex items-end gap-0 border-b border-[#e5e7eb] mt-4">
          {TABS.map((tab) => {
            const isActive = pathname?.startsWith(tab.href)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-4 py-2.5 text-[0.8125rem] font-medium transition-colors border-b-2 -mb-px ${
                  isActive
                    ? 'border-[#069668] text-[#1b1b1d] font-bold'
                    : 'border-transparent text-[#45474c] hover:text-[#1b1b1d]'
                }`}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </div>
      <div className="flex-1 max-w-5xl mx-auto w-full">
        {children}
      </div>
    </div>
  )
}
