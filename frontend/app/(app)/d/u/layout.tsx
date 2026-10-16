'use client'

import { usePathname } from "next/navigation"
import { UserCircle } from "lucide-react"
import { type ReactNode } from "react"
import { PageHeading } from "@/components/ui/page-heading"

// Profile is the one page with this frame. Home and Inbox (/d/u/home, /d/u/inbox) span firms and
// draw their own headings; the old Recent, Bookmarks, Reminders and Notifications URLs redirect to
// them (next.config.js).
const PROFILE_PATH = '/d/u/profile'

export default function UserLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isProfile = pathname?.startsWith(PROFILE_PATH) ?? false

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {isProfile && (
        <PageHeading
          icon={<UserCircle />}
          title="Profile"
          description="Your details, notifications and data."
          className="pb-6"
        />
      )}

      {children}
    </div>
  )
}
