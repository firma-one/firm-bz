"use client"

import Logo, { type OrganizationBranding } from "@/components/Logo"

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react"
import { usePathname } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { supabase } from "@/lib/supabase"
import { Bell, Bookmark, ChevronDown, ChevronUp, HelpCircle, Info, Megaphone, Search, Send, Trash2, User, X } from "lucide-react"
import { Tip } from "@/components/ui/tip"
import { RemindersPanel } from "@/components/app/reminders-panel"

// Cache firm branding by slug (in-memory for session)
const brandingCache = new Map<string, { branding: OrganizationBranding | null; firmId?: string }>()

const SESSION_STORAGE_KEY = (slug: string) => `fm_firm_branding_${slug}`

type NotificationItem = {
  id: string
  createdAt: string
  type: string
  priority?: 'INFO' | 'WARNING' | 'CRITICAL' | null
  title: string
  body: string | null
  ctaUrl: string | null
  readAt: string | null
  clientId?: string | null
  projectId?: string | null
  documentId?: string | null
  metadata?: any
}

type BookmarkItem = {
  id: string
  kind: 'document' | 'project' | 'comment' | 'url'
  label?: string
  url?: string
  clientId?: string
  projectId?: string
  documentId?: string
  createdAt: string
}

type BroadcastScope = 'org' | 'client' | 'project'

function getBrandingFromSession(slug: string | null): OrganizationBranding | null {
  if (typeof window === 'undefined' || !slug) return null
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY(slug))
    return raw ? (JSON.parse(raw) as OrganizationBranding) : null
  } catch {
    return null
  }
}

function setBrandingInSession(slug: string, branding: OrganizationBranding | null): void {
  if (typeof window === 'undefined' || !slug) return
  try {
    if (branding) sessionStorage.setItem(SESSION_STORAGE_KEY(slug), JSON.stringify(branding))
    else sessionStorage.removeItem(SESSION_STORAGE_KEY(slug))
  } catch {
    // ignore
  }
}

export function AppTopbar() {
  const { user } = useAuth()
  const pathname = usePathname()
  const [firmName, setFirmName] = useState<string>('')
  const [branding, setBranding] = useState<OrganizationBranding | null>(null)
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const currentSlugRef = useRef<string | null>(null)

  const [showBookmarksDropdown, setShowBookmarksDropdown] = useState(false)
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([])
  const [canBroadcast, setCanBroadcast] = useState(false)

  const [visibleNotificationsCount, setVisibleNotificationsCount] = useState(10)
  const [visibleBookmarksCount, setVisibleBookmarksCount] = useState(10)
  const [bookmarkQuery, setBookmarkQuery] = useState('')

  const [showBroadcastComposer, setShowBroadcastComposer] = useState(false)
  const [broadcastText, setBroadcastText] = useState('')
  const [broadcastTitle, setBroadcastTitle] = useState('')
  const [broadcastScope, setBroadcastScope] = useState<BroadcastScope>('org')
  const [broadcastScopes, setBroadcastScopes] = useState<BroadcastScope[]>([])
  const [broadcastSending, setBroadcastSending] = useState(false)

  // Hydration guard
  useEffect(() => {
    setMounted(true)
  }, [])

  const parsePathContext = useCallback(() => {
    const path = pathname ?? ''
    const orgMatch = path.match(/^\/d\/o\/([^/]+)/)
    const orgSlug = orgMatch?.[1] ?? null
    const clientMatch = path.match(/^\/d\/o\/[^/]+\/c\/([^/]+)/)
    const clientSlug = clientMatch?.[1] ?? null
    const projectMatch = path.match(/^\/d\/o\/[^/]+\/c\/[^/]+\/p\/([^/]+)/)
    const projectSlug = projectMatch?.[1] ?? null
    return { orgSlug, clientSlug, projectSlug }
  }, [pathname])

  // Extract firm slug from pathname
  const getSlug = () => {
    const match = pathname?.match(/^\/d\/o\/([^/]+)/)
    return match ? match[1] : null
  }
  const slug = getSlug()

  // Restore branding from sessionStorage before paint to avoid flip on refresh/reload
  useLayoutEffect(() => {
    if (!pathname?.startsWith('/d') || !slug) return
    const cached = getBrandingFromSession(slug)
    if (cached) setBranding(cached)
  }, [pathname, slug])

  // Load firm branding with caching
  useEffect(() => {
    const loadFirmBranding = async () => {
      // Only show org branding on app routes under /d/ (dashboard)
      if (!pathname?.startsWith('/d')) {
        setBranding(null)
        setLoading(false)
        currentSlugRef.current = null
        return
      }

      if (!user) {
        setLoading(false)
        currentSlugRef.current = null
        return
      }

      // Check cache first - only refetch if slug changed
      if (slug && currentSlugRef.current === slug && brandingCache.has(slug)) {
        const cached = brandingCache.get(slug)!
        setBranding(cached.branding)
        setLoading(false)
        return
      }

      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) {
          setLoading(false)
          return
        }

        const url = slug
          ? `/api/firm?slug=${encodeURIComponent(slug)}`
          : '/api/firm'
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        })

        if (response.ok) {
          const data = await response.json()
          const org = data.organization || data
          if (org?.name) setFirmName(org.name)
          const settings = (org?.settings as Record<string, unknown>) || {}
          const b = (settings.branding as Record<string, string | undefined>) || {}
          // Prefer org-level branding columns (logoUrl, themeColorHex, brandingSubtext), then settings.branding
          const logoUrl = (org?.logoUrl as string) ?? b.logoUrl ?? null
          const themeColor = (org?.themeColorHex as string) ?? b.themeColor ?? b.brandColor ?? null
          const subtext = (org?.brandingSubtext as string) ?? b.subtext ?? null
          const brandingData: OrganizationBranding | null = (logoUrl || themeColor || b.brandColor || org?.name || b.name)
            ? {
              logoUrl: logoUrl ?? null,
              name: org?.name ?? b.name ?? null,
              subtext: subtext ?? null,
              themeColor: themeColor ?? null,
            }
            : null

          setBranding(brandingData)

          // Cache by slug (in-memory + sessionStorage so cache is built on every fetch, including after Firm Settings Save)
          if (slug) {
            brandingCache.set(slug, { branding: brandingData, firmId: org?.id })
            currentSlugRef.current = slug
            setBrandingInSession(slug, brandingData)
          }
        }
      } catch {
        // Silent fail
      } finally {
        setLoading(false)
      }
    }

    loadFirmBranding()

    const onBrandingUpdated = () => {
      // Clear cache and reload when branding is updated
      if (slug) {
        brandingCache.delete(slug)
        currentSlugRef.current = null
      }
      loadFirmBranding()
    }
    window.addEventListener('firm-branding-updated', onBrandingUpdated)
    return () => window.removeEventListener('firm-branding-updated', onBrandingUpdated)
  }, [user, pathname, slug])

  const loadNotifications = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const { clientSlug, projectSlug } = parsePathContext()
      const qs = new URLSearchParams({
        ...(clientSlug ? { clientSlug } : {}),
        ...(projectSlug ? { projectSlug } : {}),
      })
      const url = qs.toString() ? `/api/notifications?${qs.toString()}` : '/api/notifications'
      const res = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (!res.ok) return
      const data = await res.json()
      setNotifications(data.notifications ?? [])
      setUnreadCount(data.unreadCount ?? 0)
      setCanBroadcast(Boolean(data.canBroadcast))
      setBroadcastScopes(
        (Array.isArray(data.broadcastScopes) ? data.broadcastScopes : []).filter(
          (s: any) => s === 'org' || s === 'client' || s === 'project'
        )
      )
    } catch {
      // ignore
    }
  }, [parsePathContext])

  const loadBookmarks = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const res = await fetch('/api/bookmarks', { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (!res.ok) return
      const data = await res.json()
      setBookmarks(data.bookmarks ?? [])
    } catch {
      // ignore
    }
  }, [])

  const resolveDeeplink = useCallback(async (args: { kind: 'project' | 'document' | 'comment'; projectId: string; documentId?: string; commentId?: string }) => {
    try {
      const qs = new URLSearchParams({
        kind: args.kind,
        projectId: args.projectId,
        ...(args.documentId ? { documentId: args.documentId } : {}),
        ...(args.commentId ? { commentId: args.commentId } : {}),
      })
      const res = await fetch(`/api/deeplink?${qs.toString()}`)
      if (!res.ok) return null
      const json = await res.json().catch(() => null) as { url?: string } | null
      return json?.url ?? null
    } catch {
      return null
    }
  }, [])

  const getScope = (n: NotificationItem): 'user' | 'org' | 'client' | 'project' | 'document' => {
    const explicit = n?.metadata?.scope
    if (explicit === 'user' || explicit === 'org' || explicit === 'client' || explicit === 'project' || explicit === 'document') return explicit
    if (n.documentId) return 'document'
    if (n.projectId) return 'project'
    if (n.clientId) return 'client'
    return 'org'
  }

  const scopePill = (scope: string) => {
    if (scope === 'document') return { label: 'Document', cls: 'bg-white text-slate-700 border-slate-200' }
    if (scope === 'project') return { label: 'Project', cls: 'bg-white text-slate-700 border-slate-200' }
    if (scope === 'client') return { label: 'Client', cls: 'bg-white text-slate-700 border-slate-200' }
    if (scope === 'user') return { label: 'User', cls: 'bg-white text-slate-700 border-slate-200' }
    return { label: 'Org', cls: 'bg-white text-slate-700 border-slate-200' }
  }

  const getPriority = (n: NotificationItem): 'INFO' | 'WARNING' | 'CRITICAL' => {
    const explicit = n?.priority ?? n?.metadata?.priority
    if (explicit === 'INFO' || explicit === 'WARNING' || explicit === 'CRITICAL') return explicit
    if (n.type === 'BROADCAST' || n?.metadata?.broadcast) return 'CRITICAL'
    const due = n?.metadata?.dueDate
    if (typeof due === 'string') {
      const t = new Date(due).getTime()
      if (!Number.isNaN(t)) {
        const diffMs = t - Date.now()
        if (diffMs < 0) return 'CRITICAL'
        const diffDays = diffMs / (1000 * 60 * 60 * 24)
        if (diffDays <= 7) return 'WARNING'
      }
    }
    return 'INFO'
  }

  const priorityAccent = (p: 'INFO' | 'WARNING' | 'CRITICAL') => {
    if (p === 'CRITICAL') return { borderLeft: 'rgb(225 29 72)', dot: 'bg-rose-600' } // rose-600
    if (p === 'WARNING') return { borderLeft: 'rgb(245 158 11)', dot: 'bg-amber-500' } // amber-500
    return { borderLeft: 'rgb(34 197 94)', dot: 'bg-emerald-500' } // emerald-500
  }

  useEffect(() => {
    if (!mounted) return
    loadNotifications()
    loadBookmarks()
    const handleNotificationsUpdate = () => loadNotifications()
    const handleBookmarksUpdate = () => loadBookmarks()
    window.addEventListener('pockett-notifications-updated', handleNotificationsUpdate)
    window.addEventListener('pockett-bookmarks-updated', handleBookmarksUpdate)
    return () => {
      window.removeEventListener('pockett-notifications-updated', handleNotificationsUpdate)
      window.removeEventListener('pockett-bookmarks-updated', handleBookmarksUpdate)
    }
  }, [mounted, loadNotifications, loadBookmarks])

  useEffect(() => {
    if (!broadcastScopes.length) return
    if (broadcastScopes.includes(broadcastScope)) return
    if (broadcastScopes.includes('project')) { setBroadcastScope('project'); return }
    if (broadcastScopes.includes('client')) { setBroadcastScope('client'); return }
    setBroadcastScope('org')
  }, [broadcastScopes, broadcastScope])

  useEffect(() => {
    if (!mounted) return
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      if (showBookmarksDropdown && !target.closest('.bookmarks-container')) setShowBookmarksDropdown(false)
      if (showNotificationsDropdown && !target.closest('.notifications-container')) setShowNotificationsDropdown(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [mounted, showBookmarksDropdown, showNotificationsDropdown])

  // Hide until mounted (Safari hydration) but always render the same subtree so child hooks run every render.
  return (
    <div
      className={`flex h-full w-full items-center px-4 gap-4 ${!mounted ? 'invisible pointer-events-none' : ''}`}
      aria-hidden={!mounted}
    >
      {/* Left: Branding — w-60 matches HTML mockup, aligns with sidebar */}
      <div className="w-60 shrink-0 flex items-center pl-1">
        <Logo
          size="md"
          showText
          branding={branding ?? undefined}
          wordmarkClassName="font-headline text-2xl font-bold tracking-tighter text-[#1b1b1d]"
        />
      </div>

      {/* Center: Prominent Search — flex-1, constrained max-width */}
      <div className="flex-1 flex justify-center px-12">
        <div className="relative w-full max-w-2xl">
          <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-[#45474c]/50">
            <Search className="h-4 w-4" />
          </span>
          <input
            className="w-full bg-[#f9f9fb] border border-[#e5e7eb] rounded-sm pl-9 pr-4 py-2 text-sm text-[#1b1b1d] placeholder:text-[#45474c]/60 focus:ring-1 focus:ring-[#069668] focus:border-[#069668] outline-none transition-all"
            placeholder="Search clients, engagements, documents…"
            type="text"
            aria-label="Global search"
          />
        </div>
      </div>

      {/* Right: Utility actions — w-64, justify-end */}
      <div className="w-64 shrink-0 flex items-center justify-end gap-1 pr-4">
        <RemindersPanel />
        <div className="relative bookmarks-container">
          <Tip label="Bookmarks" position="bottom">
          <button
            type="button"
            className="w-10 h-10 flex items-center justify-center rounded-full text-[#45474c] hover:bg-[#f9f9fb] hover:text-[#1b1b1d] transition-colors relative"
            aria-label="Bookmarks"
            onClick={() => {
              setShowBookmarksDropdown((v) => !v)
              setVisibleBookmarksCount(10)
              setBookmarkQuery('')
            }}
          >
            <Bookmark className="h-5 w-5" />
            {bookmarks.length > 0 ? (
              <span className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 px-1 bg-[#069668] text-white text-[9px] font-bold rounded-full border border-white flex items-center justify-center leading-none">
                {bookmarks.length}
              </span>
            ) : null}
          </button>
          </Tip>
          {showBookmarksDropdown ? (
            <div className="absolute right-0 top-full mt-2 w-[360px] bg-white border border-slate-200 rounded shadow-lg z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-slate-900 tracking-tight">Bookmarks</span>
                    {bookmarks.length > 0 ? (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#069668] text-white">{bookmarks.length}</span>
                    ) : null}
                  </div>
                  <button type="button" onClick={() => setShowBookmarksDropdown(false)} aria-label="Close"
                    className="p-1 rounded hover:bg-[#f0edee] text-[#45474c] hover:text-[#1b1b1d] transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2">
                  <input
                    value={bookmarkQuery}
                    onChange={(e) => { setBookmarkQuery(e.target.value); setVisibleBookmarksCount(10) }}
                    placeholder="Search bookmarks…"
                    className="w-full h-8 rounded border border-[#e5e7eb] bg-white px-2.5 text-xs text-[#1b1b1d] placeholder:text-[#45474c] focus:outline-none focus:ring-1 focus:ring-[#069668] focus:border-[#069668]"
                  />
                </div>
              </div>
              <div className="p-3 space-y-2 max-h-[380px] overflow-y-auto">
                {(() => {
                  const q = bookmarkQuery.trim().toLowerCase()
                  const filtered = q
                    ? bookmarks.filter((b) => `${b.label ?? ''} ${b.url ?? ''}`.toLowerCase().includes(q))
                    : bookmarks
                  const visible = filtered.slice(0, visibleBookmarksCount)
                  if (filtered.length === 0) {
                    return (
                      <div className="text-center py-6">
                        <Bookmark className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-sm text-slate-600">No bookmarks</p>
                        <p className="text-xs text-slate-400">Use “Bookmark” on a document to add one.</p>
                      </div>
                    )
                  }
                  return (
                    <>
                      {visible.map((b) => (
                        <div key={b.id} className="group flex items-start gap-2 p-3 rounded border border-[#e5e7eb] bg-white hover:bg-[#f0edee]">
                          <button
                            type="button"
                            className="flex-1 min-w-0 text-left"
                            title={b.label || b.url || 'Bookmark'}
                            onClick={async () => {
                              setShowBookmarksDropdown(false)
                              if (b.projectId && b.documentId) {
                                const url = await resolveDeeplink({ kind: 'document', projectId: b.projectId, documentId: b.documentId })
                                if (url) { window.location.href = url; return }
                              }
                              if (b.projectId && !b.documentId) {
                                const url = await resolveDeeplink({ kind: 'project', projectId: b.projectId })
                                if (url) { window.location.href = url; return }
                              }
                              if (b.url) window.location.href = b.url
                            }}
                          >
                            <p className="text-sm font-medium text-slate-900 truncate">{b.label || b.url || 'Bookmark'}</p>
                            <p className="text-xs text-slate-500 truncate">{b.url ? b.url : 'In-app link'}</p>
                          </button>
                          <button
                            type="button"
                            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove"
                            onClick={async () => {
                              try {
                                const { data: { session } } = await supabase.auth.getSession()
                                if (session?.access_token) {
                                  await fetch('/api/bookmarks', {
                                    method: 'DELETE',
                                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                                    body: JSON.stringify({ id: b.id }),
                                  })
                                  loadBookmarks()
                                }
                              } catch {
                                // ignore
                              }
                            }}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      <div className="sticky bottom-0 pt-2 bg-white">
                        <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                          <div className="text-[11px] text-slate-500">
                            Showing {Math.min(visibleBookmarksCount, filtered.length)} of {filtered.length}
                          </div>
                          {visibleBookmarksCount < filtered.length ? (
                            <button
                              type="button"
                              className="text-[11px] font-semibold text-slate-700 hover:text-slate-900"
                              onClick={() => setVisibleBookmarksCount((c) => c + 10)}
                            >
                              Show 10 more
                            </button>
                          ) : (
                            <div className="text-[11px] text-slate-400">All shown</div>
                          )}
                        </div>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          ) : null}
        </div>

        <div className="relative notifications-container">
          <Tip label="Notifications" position="bottom-right">
          <button
            type="button"
            className="w-10 h-10 flex items-center justify-center rounded-full text-[#45474c] hover:bg-[#f9f9fb] hover:text-[#1b1b1d] transition-colors relative"
            aria-label="Notifications"
            onClick={() => setShowNotificationsDropdown((v) => !v)}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 ? (
              <span className="absolute top-1 right-1 min-w-[14px] h-3.5 px-1 bg-[#069668] text-white text-[9px] font-bold rounded-full border border-white flex items-center justify-center leading-none">
                {unreadCount}
              </span>
            ) : (
              <span className="absolute top-1 right-1 h-2 w-2 bg-[#069668] rounded-full border border-white" />
            )}
          </button>
          </Tip>
          {showNotificationsDropdown ? (
            <div className="absolute right-0 top-full mt-2 w-[360px] bg-white border border-slate-200 rounded shadow-lg z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-slate-900 tracking-tight">Notifications</span>
                    {unreadCount > 0 ? (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-600 text-white">{unreadCount}</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setShowNotificationsDropdown(false)} aria-label="Close"
                      className="p-1 rounded hover:bg-[#f0edee] text-[#45474c] hover:text-[#1b1b1d] transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="h-9 rounded border border-[#e5e7eb] bg-white px-2 text-xs font-semibold text-[#1b1b1d] hover:border-[#069668]/50 hover:bg-[#f9f9fb] whitespace-nowrap"
                    title="Clear all notifications"
                    onClick={async () => {
                      try {
                        const { data: { session } } = await supabase.auth.getSession()
                        if (!session?.access_token) return
                        await fetch('/api/notifications', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                          body: JSON.stringify({ markAllRead: true }),
                        })
                        await fetch('/api/notifications', {
                          method: 'DELETE',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                          body: JSON.stringify({ readOnly: true, olderThanDays: 0 }),
                        })
                        loadNotifications()
                      } catch {
                        // ignore
                      }
                    }}
                  >
                    <span className="inline-flex items-center justify-center gap-1.5">
                      <Trash2 className="h-4 w-4 text-slate-700" />
                      Clear all
                    </span>
                  </button>
                  <button
                    type="button"
                    className="h-9 rounded border border-[#e5e7eb] bg-white px-2 text-xs font-semibold text-[#1b1b1d] hover:border-[#069668]/50 hover:bg-[#f9f9fb] whitespace-nowrap disabled:opacity-50"
                    onClick={() => setShowBroadcastComposer((v) => !v)}
                    disabled={!canBroadcast}
                    title={canBroadcast ? 'Send a broadcast to a team' : 'Broadcasts are available to admins'}
                  >
                    <span className="inline-flex items-center justify-center gap-1.5">
                      <Megaphone className="h-4 w-4 text-rose-700" />
                      Broadcast
                      {showBroadcastComposer ? (
                        <ChevronUp className="h-4 w-4 text-slate-500" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-slate-500" />
                      )}
                    </span>
                  </button>
                </div>
                {canBroadcast && showBroadcastComposer ? (
                  <div className="mt-3 rounded border border-[#e5e7eb] bg-white p-2.5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="text-[11px] font-semibold text-slate-700 whitespace-nowrap">Scope</div>
                        <div className="h-4 w-px bg-slate-200" />
                        <div className="flex items-center gap-1 text-[11px] text-slate-500 truncate">
                          <Info className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">Choose who receives this broadcast.</span>
                        </div>
                      </div>
                    </div>
                    <div className="mb-2 grid grid-cols-3 gap-2">
                      {(['org', 'client', 'project'] as const).map((s) => {
                        const enabled = broadcastScopes.includes(s)
                        const label = s === 'org' ? 'Firm' : s === 'client' ? 'Client team' : 'Project team'
                        const isActive = broadcastScope === s
                        return (
                          <button
                            key={s}
                            type="button"
                            disabled={!enabled}
                            className={`h-9 rounded border px-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                              !enabled
                                ? 'border-[#e5e7eb] bg-[#f9f9fb] text-[#45474c] cursor-not-allowed'
                                : isActive
                                  ? 'border-rose-300 bg-white text-slate-900 shadow-sm'
                                  : 'border-[#e5e7eb] bg-white text-[#1b1b1d] hover:border-[#069668]/50 hover:bg-[#f9f9fb]'
                            }`}
                            title={enabled ? label : `${label} (coming soon)`}
                            onClick={() => enabled && setBroadcastScope(s)}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                    <input
                      value={broadcastTitle}
                      onChange={(e) => setBroadcastTitle(e.target.value)}
                      placeholder="Title (optional)"
                      className="w-full h-8 rounded border border-[#e5e7eb] bg-white px-2.5 text-xs text-[#1b1b1d] placeholder:text-[#45474c] focus:outline-none focus:ring-1 focus:ring-[#069668] focus:border-[#069668]"
                    />
                    <textarea
                      value={broadcastText}
                      onChange={(e) => setBroadcastText(e.target.value.slice(0, 1000))}
                      placeholder="Broadcast message (max 1000 chars)…"
                      rows={4}
                      className="mt-2 w-full rounded border border-[#e5e7eb] bg-white px-2.5 py-2 text-xs text-[#1b1b1d] placeholder:text-[#45474c] focus:outline-none focus:ring-1 focus:ring-[#069668] focus:border-[#069668] resize-none"
                    />
                    <div className="mt-2 flex items-center justify-between">
                      <div className="text-[11px] text-slate-500">{broadcastText.length}/1000</div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="h-9 w-9 inline-flex items-center justify-center rounded border border-[#e5e7eb] bg-white text-[#1b1b1d] hover:bg-[#f0edee] disabled:opacity-60"
                          disabled={broadcastSending}
                          onClick={() => {
                            setShowBroadcastComposer(false)
                            setBroadcastText('')
                            setBroadcastTitle('')
                          }}
                          title="Cancel"
                        >
                          <X className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="h-9 w-9 inline-flex items-center justify-center rounded bg-[#069668] text-white hover:bg-[#057a54] disabled:opacity-60"
                          disabled={broadcastSending || broadcastText.trim().length === 0}
                          onClick={async () => {
                            try {
                              setBroadcastSending(true)
                              const { data: { session } } = await supabase.auth.getSession()
                              if (!session?.access_token) return
                              const res = await fetch('/api/notifications/broadcast', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                                body: JSON.stringify({
                                  title: broadcastTitle,
                                  message: broadcastText,
                                  scope: broadcastScope,
                                  ...(() => {
                                    const { clientSlug, projectSlug } = parsePathContext()
                                    return {
                                      ...(clientSlug ? { clientSlug } : {}),
                                      ...(projectSlug ? { projectSlug } : {}),
                                    }
                                  })(),
                                }),
                              })
                              if (res.ok) {
                                setShowBroadcastComposer(false)
                                setBroadcastText('')
                                setBroadcastTitle('')
                                setBroadcastScope('org')
                                loadNotifications()
                                if (typeof window !== 'undefined') {
                                  window.dispatchEvent(new CustomEvent('pockett-notifications-updated'))
                                }
                              }
                            } finally {
                              setBroadcastSending(false)
                            }
                          }}
                          title="Send"
                        >
                          <Send className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="p-3 space-y-2 max-h-[420px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="text-center py-6">
                    <Bell className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-600">No notifications</p>
                    <p className="text-xs text-slate-400">Set due dates on projects/documents to see alerts here.</p>
                  </div>
                ) : (
                  notifications.slice(0, visibleNotificationsCount).map((n) => (
                    (() => {
                      const p = getPriority(n)
                      const accent = priorityAccent(p)
                      return (
                    <div
                      key={n.id}
                      role="button"
                      tabIndex={0}
                      className={`group w-full text-left p-3 rounded-lg border border-slate-200 bg-white transition-colors hover:bg-slate-50 cursor-pointer ${
                        n.readAt ? 'opacity-60' : ''
                      }`}
                      style={{
                        borderLeftWidth: '3px',
                        borderLeftColor: n.readAt ? 'rgb(226 232 240)' : accent.borderLeft
                      }}
                      onClick={async () => {
                        try {
                          const { data: { session } } = await supabase.auth.getSession()
                          if (session?.access_token) {
                            await fetch('/api/notifications', {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                              body: JSON.stringify({ ids: [n.id] }),
                            })
                            loadNotifications()
                          }
                        } catch {
                          // ignore
                        }
                        if (n.projectId && n.documentId) {
                          const url = await resolveDeeplink({ kind: 'document', projectId: n.projectId, documentId: n.documentId })
                          if (url) { window.location.href = url; return }
                        }
                        if (n.projectId && !n.documentId) {
                          const url = await resolveDeeplink({ kind: 'project', projectId: n.projectId })
                          if (url) { window.location.href = url; return }
                        }
                        if (n.ctaUrl) window.location.href = n.ctaUrl
                      }}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          // mimic click
                          ;(e.currentTarget as HTMLDivElement).click()
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p
                              className={`text-sm truncate ${n.readAt ? 'font-medium text-slate-700' : 'font-semibold text-slate-900'}`}
                              title={[n.title, n.body ?? '', new Date(n.createdAt).toLocaleString()].filter(Boolean).join('\n')}
                            >
                              {n.title}
                            </p>
                            <div className="shrink-0 flex items-center gap-2">
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-slate-50"
                                  title="Clear this alert"
                                  onClick={async (e) => {
                                    e.stopPropagation()
                                    try {
                                      const { data: { session } } = await supabase.auth.getSession()
                                      if (!session?.access_token) return
                                      await fetch('/api/notifications', {
                                        method: 'DELETE',
                                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                                        body: JSON.stringify({ ids: [n.id] }),
                                      })
                                      loadNotifications()
                                    } catch {
                                      // ignore
                                    }
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 text-slate-700" />
                                </button>
                              </div>
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${scopePill(getScope(n)).cls}`}>
                                {n.type === 'BROADCAST' || n?.metadata?.broadcast ? <Megaphone className="h-3 w-3 text-slate-700" /> : null}
                                {scopePill(getScope(n)).label}
                              </span>
                            </div>
                          </div>
                          {n.body ? <p className="text-xs text-slate-600 mt-1">{n.body}</p> : null}
                          <p className="text-xs text-slate-400 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                        </div>
                        {!n.readAt ? <span className={`mt-1 h-2 w-2 rounded-full ${accent.dot} shrink-0`} /> : null}
                      </div>
                    </div>
                      )
                    })()
                  ))
                )}
                {notifications.length > 0 ? (
                  <div className="sticky bottom-0 pt-2 bg-white">
                    <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                      <div className="text-[11px] text-slate-500">
                        Showing {Math.min(visibleNotificationsCount, notifications.length)} of {notifications.length}
                      </div>
                      {visibleNotificationsCount < notifications.length ? (
                        <button
                          type="button"
                          className="text-[11px] font-semibold text-rose-700 hover:text-rose-800"
                          onClick={() => setVisibleNotificationsCount((c) => c + 10)}
                        >
                          Show 10 more
                        </button>
                      ) : (
                        <div className="text-[11px] text-slate-400">All shown</div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {/* Help */}
        <Tip label="Help" position="bottom-right">
          <button
            type="button"
            className="w-10 h-10 flex items-center justify-center rounded-full text-[#45474c] hover:bg-[#f9f9fb] hover:text-[#1b1b1d] transition-colors"
            aria-label="Help"
          >
            <HelpCircle className="h-5 w-5" />
          </button>
        </Tip>

        {/* Vertical separator */}
        <div className="h-8 w-px bg-[#e5e7eb] mx-2" />

        {/* Profile button */}
        <button
          type="button"
          className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-full hover:bg-[#f9f9fb] transition-colors"
          aria-label="Profile"
        >
          <div className="h-8 w-8 rounded-full bg-[#f3f4f6] flex items-center justify-center border border-[#e5e7eb]">
            <User className="h-4 w-4 text-[#45474c]" />
          </div>
        </button>
      </div>
    </div>
  )
}
