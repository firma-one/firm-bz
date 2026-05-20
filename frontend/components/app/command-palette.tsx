"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  Users,
  BarChart3,
  Bell,
  Bookmark,
  CalendarClock,
  Search,
  UserCircle,
  LifeBuoy,
  Settings,
  Clock,
} from "lucide-react"
import { getFirmRole } from "@/lib/actions/firm"

type CommandItem = {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  href: string
  group: string
  adminOnly?: boolean
  iconColor?: string
}

function getSlugFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/d\/f\/([^/]+)/)
  return m?.[1] ?? null
}

function getLastKnownSlug(pathname: string): string | null {
  const fromUrl = getSlugFromPath(pathname)
  if (fromUrl) return fromUrl
  // Fall back to the last firm whose branding was cached by the topbar
  if (typeof window === "undefined") return null
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i)
    if (key?.startsWith("fm_firm_branding_")) {
      return key.replace("fm_firm_branding_", "")
    }
  }
  return null
}

function buildItems(firmSlug: string | null, canManageOrg: boolean): CommandItem[] {
  const firmBase = firmSlug ? `/d/f/${firmSlug}` : null

  const items: CommandItem[] = []

  if (firmBase) {
    items.push(
      {
        id: "clients",
        label: "Clients",
        description: "View all clients",
        icon: <Users className="h-4 w-4" />,
        href: firmBase,
        group: "Firm",
      },
      {
        id: "analytics",
        label: "Analytics",
        description: "Firm-wide insights and reporting",
        icon: <BarChart3 className="h-4 w-4" />,
        href: `${firmBase}/insights`,
        group: "Firm",
      },
    )
    if (canManageOrg) {
      items.push({
        id: "settings",
        label: "Settings",
        description: "Manage integrations and firm settings",
        icon: <Settings className="h-4 w-4" />,
        href: `${firmBase}/connectors`,
        group: "Firm",
        adminOnly: true,
      })
    }
  }

  items.push(
    {
      id: "reminders",
      label: "Reminders",
      description: "Your upcoming reminders",
      icon: <CalendarClock className="h-4 w-4" style={{ color: "#C4572B" }} />,
      href: "/d/u/reminders",
      group: "Personal",
    },
    {
      id: "bookmarks",
      label: "Bookmarks",
      description: "Your saved bookmarks",
      icon: <Bookmark className="h-4 w-4" />,
      href: "/d/u/bookmarks",
      group: "Personal",
      iconColor: "#5A78FF",
    },
    {
      id: "notifications",
      label: "Notifications",
      description: "Your notifications",
      icon: <Bell className="h-4 w-4" />,
      href: "/d/u/notifications",
      group: "Personal",
    },
    {
      id: "recent",
      label: "Recent",
      description: "Recently visited pages",
      icon: <Clock className="h-4 w-4" />,
      href: "/d/u/recent",
      group: "Personal",
    },
    {
      id: "profile",
      label: "Profile",
      description: "Your account and settings",
      icon: <UserCircle className="h-4 w-4" />,
      href: "/d/u/profile",
      group: "Account",
    },
  )

  if (canManageOrg) {
    items.push({
      id: "support",
      label: "Support",
      description: "Help and documentation",
      icon: <LifeBuoy className="h-4 w-4" />,
      href: "/d/support",
      group: "Account",
      adminOnly: true,
    })
  }

  return items
}

export function CommandPalette({ onOpenChange }: { onOpenChange?: (open: boolean) => void } = {}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const [canManageOrg, setCanManageOrg] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const [firmSlug, setFirmSlug] = useState<string | null>(() =>
    typeof window !== "undefined" ? getLastKnownSlug(pathname ?? "") : getSlugFromPath(pathname ?? "")
  )

  // Keep firm slug in sync with navigation; fall back to sessionStorage on user-scoped pages
  useEffect(() => {
    setFirmSlug(getLastKnownSlug(pathname ?? ""))
  }, [pathname])

  // Fetch role whenever firm slug is resolved
  useEffect(() => {
    if (!firmSlug) return
    getFirmRole(firmSlug).then((role) => {
      setCanManageOrg(role === "FIRM_ADMIN")
    })
  }, [firmSlug])

  const allItems = buildItems(firmSlug, canManageOrg)

  const filtered = query.trim()
    ? allItems.filter(
        (item) =>
          item.label.toLowerCase().includes(query.toLowerCase()) ||
          item.description.toLowerCase().includes(query.toLowerCase()),
      )
    : allItems

  const groups = filtered.reduce<Record<string, CommandItem[]>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = []
    acc[item.group].push(item)
    return acc
  }, {})

  const flatFiltered = filtered

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  useEffect(() => {
    onOpenChange?.(open)
    if (open) {
      setQuery("")
      setActiveIndex(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open, onOpenChange])

  const navigate = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, flatFiltered.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const item = flatFiltered[activeIndex]
      if (item) navigate(item.href)
    }
  }

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  if (!open) return null

  let flatIdx = 0

  return (
    <div
      className="fixed inset-0 z-[2000000] flex items-start justify-center pt-[15vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      <div className="absolute inset-0 bg-black/30" />

      <div className="relative w-full max-w-[520px] mx-4 bg-white border border-[#e5e7eb] rounded-[4px] shadow-2xl overflow-hidden">
        {/* Input row */}
        <div className="flex items-center gap-3 px-4 border-b border-[#e5e7eb]">
          <Search className="h-4 w-4 text-[#45474c]/50 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Go to…"
            className="flex-1 py-3.5 text-[0.9375rem] text-[#1b1b1d] placeholder:text-[#45474c]/50 bg-transparent outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded border border-[#e5e7eb] bg-[#f9f9fb] px-1.5 py-0.5 text-[10px] font-mono text-[#45474c]">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[360px] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[#45474c]">
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            Object.entries(groups).map(([group, items]) => (
              <div key={group}>
                <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#45474c]/60">
                  {group}
                </div>
                {items.map((item) => {
                  const idx = flatIdx++
                  const isActive = idx === activeIndex
                  return (
                    <button
                      key={item.id}
                      data-idx={idx}
                      type="button"
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        isActive
                          ? "bg-firma/10 text-firma"
                          : "text-[#1b1b1d] hover:bg-[#f9f9fb]"
                      }`}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => navigate(item.href)}
                    >
                      <span
                        className={`shrink-0 ${isActive && !item.adminOnly ? "text-firma" : ""}`}
                        style={!isActive && item.iconColor ? { color: item.iconColor } : undefined}
                      >
                        {item.icon}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[0.8125rem] font-medium leading-tight">
                          {item.label}
                        </span>
                        <span className="block text-xs text-[#45474c] truncate">
                          {item.description}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-[#e5e7eb] bg-[#f9f9fb]">
          {[
            { keys: ['↑', '↓'], label: 'navigate' },
            { keys: ['↵'], label: 'open' },
            { keys: ['esc'], label: 'close' },
          ].map(({ keys, label }) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <span className="inline-flex items-center gap-0.5">
                {keys.map((k) => (
                  <kbd
                    key={k}
                    className="inline-flex items-center justify-center rounded border border-[#d1d5db] bg-white px-1.5 py-0.5 text-[11px] font-semibold font-mono text-[#1b1b1d] shadow-[0_1px_0_0_#d1d5db] leading-none"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
              <span className="text-[11px] text-[#45474c] font-medium">{label}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
