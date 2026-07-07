"use client"

import Logo, { type OrganizationBranding } from "@/components/Logo"
import { hexToHsl, hexToRgbStr, getContrastForegroundHsl } from "@/lib/color-utils"

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react"
import { usePathname } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { supabase } from "@/lib/supabase"
import { Bell, Bookmark, Briefcase, ChevronDown, ChevronRight, ChevronUp, History, Info, Megaphone, MapPinned as MapIcon, Search, Send, SquareX, Trash2, Users, X, ArrowUpRight } from "lucide-react"
import Link from "next/link"
import { Tip } from "@/components/ui/tip"
import { formatRelativeTime } from "@/lib/utils"
import { RemindersPanel } from "@/components/app/reminders-panel"
import { CommandPalette } from "@/components/app/command-palette"
import { useSidebarFirms } from "@/lib/sidebar-firms-context"
import { useDemoTour } from "@/lib/demo-tour-context"

// --- Typewriter trigger text ---
const TYPEWRITER_PHRASES = [
  "Go to Clients…",
  "Go to Analytics…",
  "Go to Reminders…",
  "Go to Bookmarks…",
  "Go to Notifications…",
  "Go to Profile…",
  "Go to Settings…",
]
const TYPE_MS = 65
const ERASE_MS = 25
const HOLD_MS = 2200
const INTER_PHRASE_MS = 450
const LOOP_DELAY_MS = 10000

function TypewriterText({ isOpen }: { isOpen: boolean }) {
  const [text, setText] = useState("Go to…")
  const [cursorOn, setCursorOn] = useState(true)
  const [showCursor, setShowCursor] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setCursorOn((v) => !v), 530)
    return () => clearInterval(id)
  }, [])

  // Reset immediately when palette opens
  useEffect(() => {
    if (isOpen) {
      setText("Go to…")
      setShowCursor(false)
    }
  }, [isOpen])

  // Typewriter loop — restarts cleanly each time palette closes
  useEffect(() => {
    if (isOpen) return
    let cancelled = false
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

    async function run() {
      await sleep(1800)
      let idx = 0
      while (!cancelled) {
        setShowCursor(true)
        const phrase = TYPEWRITER_PHRASES[idx % TYPEWRITER_PHRASES.length]
        for (let c = 1; c <= phrase.length; c++) {
          if (cancelled) return
          setText(phrase.slice(0, c))
          await sleep(TYPE_MS)
        }
        await sleep(HOLD_MS)
        if (cancelled) return
        for (let c = phrase.length - 1; c >= 0; c--) {
          if (cancelled) return
          setText(phrase.slice(0, c))
          await sleep(ERASE_MS)
        }
        idx++
        if (idx % TYPEWRITER_PHRASES.length === 0) {
          setShowCursor(false)
          setText("Go to…")
          await sleep(LOOP_DELAY_MS)
        } else {
          await sleep(INTER_PHRASE_MS)
        }
      }
    }

    run()
    return () => { cancelled = true }
  }, [isOpen])

  return (
    <span className="flex-1 text-left">
      {text}
      {showCursor && (
        <span
          aria-hidden
          className="inline-block w-[1.5px] h-[13px] bg-[#45474c]/50 align-middle ml-[1px]"
          style={{ opacity: cursorOn ? 1 : 0 }}
        />
      )}
    </span>
  )
}

// Cache firm branding by slug (in-memory for session)
const brandingCache = new Map<string, { branding: OrganizationBranding | null; firmId?: string }>()
const clientBrandingCache = new Map<string, OrganizationBranding | null>()

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

type SessionBrandingPayload = OrganizationBranding & {
  primaryHsl?: string
  primaryFgHsl?: string
  primaryRgb?: string
  accentHsl?: string
  accentFgHsl?: string
}

function setBrandingInSession(slug: string, payload: SessionBrandingPayload | null): void {
  if (typeof window === 'undefined' || !slug) return
  try {
    if (payload) sessionStorage.setItem(SESSION_STORAGE_KEY(slug), JSON.stringify(payload))
    else sessionStorage.removeItem(SESSION_STORAGE_KEY(slug))
  } catch {
    // ignore
  }
}

function injectBrandCssVars(branding: OrganizationBranding | null): SessionBrandingPayload {
  const payload: SessionBrandingPayload = { ...branding }

  if (branding?.themeColor) {
    const [h, s, l] = hexToHsl(branding.themeColor)
    payload.primaryHsl = `${h} ${s}% ${l}%`
    payload.primaryFgHsl = getContrastForegroundHsl(h, s, l)
    payload.primaryRgb = hexToRgbStr(branding.themeColor)
    document.documentElement.style.setProperty('--primary', payload.primaryHsl)
    document.documentElement.style.setProperty('--primary-foreground', payload.primaryFgHsl)
    document.documentElement.style.setProperty('--primary-rgb', payload.primaryRgb)
  } else {
    document.documentElement.style.removeProperty('--primary')
    document.documentElement.style.removeProperty('--primary-foreground')
    document.documentElement.style.removeProperty('--primary-rgb')
  }

  if (branding?.secondaryColor) {
    const [h, s, l] = hexToHsl(branding.secondaryColor)
    payload.accentHsl = `${h} ${s}% ${l}%`
    payload.accentFgHsl = getContrastForegroundHsl(h, s, l)
    document.documentElement.style.setProperty('--brand-accent', payload.accentHsl)
    document.documentElement.style.setProperty('--brand-accent-foreground', payload.accentFgHsl)
  } else {
    document.documentElement.style.removeProperty('--brand-accent')
    document.documentElement.style.removeProperty('--brand-accent-foreground')
  }

  return payload
}

function DemoTourTopbarButton({ firmSlug }: { firmSlug: string }) {
  const { run, restartTour } = useDemoTour()
  return (
    <Tip label={run ? "Tour in progress" : "Start guided tour"} position="bottom">
      <button
        type="button"
        onClick={() => { if (!run) void restartTour(firmSlug) }}
        disabled={run}
        className="w-10 h-10 flex items-center justify-center rounded-xl text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Start guided tour"
      >
        <MapIcon className="h-5 w-5" />
      </button>
    </Tip>
  )
}

export function AppTopbar() {
  const { user } = useAuth()
  const pathname = usePathname()
  const firms = useSidebarFirms()
  const [, setFirmName] = useState<string>('')
  const [branding, setBranding] = useState<OrganizationBranding | null>(null)
  const [, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const currentSlugRef = useRef<string | null>(null)
  const currentClientSlugRef = useRef<string | null>(null)
  const reloadBrandingRef = useRef<(() => Promise<void>) | null>(null)

  const [betaFeaturesEnabled, setBetaFeaturesEnabled] = useState(false)

  const [showRecentsDropdown, setShowRecentsDropdown] = useState(false)
  const [showBookmarksDropdown, setShowBookmarksDropdown] = useState(false)
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([])
  const [canBroadcast, setCanBroadcast] = useState(false)

  const [visibleNotificationsCount] = useState(5)
  const [visibleBookmarksCount] = useState(5)
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
    const orgMatch = path.match(/^\/d\/(?:o|f)\/([^/]+)/)
    const orgSlug = orgMatch?.[1] ?? null
    const clientMatch = path.match(/^\/d\/(?:o|f)\/[^/]+\/c\/([^/]+)/)
    const clientSlug = clientMatch?.[1] ?? null
    const projectMatch = path.match(/^\/d\/(?:o|f)\/[^/]+\/c\/[^/]+\/p\/([^/]+)/)
    const projectSlug = projectMatch?.[1] ?? null
    return { orgSlug, clientSlug, projectSlug }
  }, [pathname])

  // Extract firm slug from pathname — handles both /d/o/{slug} and /d/f/{slug}
  const getSlug = () => {
    const match = pathname?.match(/^\/d\/(?:o|f)\/([^/]+)/)
    return match ? match[1] : null
  }
  const slug = getSlug()
  const isDemoFirm = slug ? (firms?.find((f) => f.slug === slug)?.sandboxOnly === true) : false

  const [recentItems, setRecentItems] = useState<{ type: string; name: string; href: string; visitedAt: number }[]>([])
  useEffect(() => {
    if (!slug) return
    try {
      const raw = localStorage.getItem(`fm_nav_recents_${slug}`)
      if (raw) setRecentItems(JSON.parse(raw))
    } catch { /* ignore */ }
  }, [slug, pathname])

  // Restore branding from sessionStorage before paint to avoid flip on refresh/reload
  useLayoutEffect(() => {
    if (!pathname?.startsWith('/d') || !slug) return
    const cached = getBrandingFromSession(slug)
    if (cached) setBranding(cached)
  }, [pathname, slug])

  // Extract client slug from pathname for client brand overlay
  const clientSlug = pathname?.match(/^\/d\/(?:o|f)\/[^/]+\/c\/([^/]+)/)?.[1] ?? null

  // Load firm branding + optional client brand overlay with caching
  useEffect(() => {
    const loadFirmBranding = async () => {
      // Only show org branding on app routes under /d/ (dashboard)
      if (!pathname?.startsWith('/d')) {
        setBranding(null)
        setLoading(false)
        currentSlugRef.current = null
        currentClientSlugRef.current = null
        // Clear any injected brand CSS vars when leaving the dashboard
        document.documentElement.style.removeProperty('--primary')
        document.documentElement.style.removeProperty('--primary-foreground')
        document.documentElement.style.removeProperty('--brand-accent')
        document.documentElement.style.removeProperty('--brand-accent-foreground')
        return
      }

      if (!user) {
        setLoading(false)
        currentSlugRef.current = null
        return
      }

      // Check firm cache first - only refetch if slug changed
      if (slug && currentSlugRef.current === slug && brandingCache.has(slug) && currentClientSlugRef.current === clientSlug) {
        const cached = brandingCache.get(slug)!
        const clientCacheKey = slug && clientSlug ? `${slug}:${clientSlug}` : null
        const clientBrand = clientCacheKey ? clientBrandingCache.get(clientCacheKey) : undefined
        const effective = clientBrand !== undefined ? (clientBrand ?? cached.branding) : cached.branding
        setBranding(effective)
        if (pathname?.startsWith('/d')) injectBrandCssVars(effective)
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

        let firmBranding: OrganizationBranding | null = null

        if (response.ok) {
          const data = await response.json()
          const org = data.organization || data.firm || data
          if (org?.name) setFirmName(org.name)
          const settings = (org?.settings as Record<string, unknown>) || {}
          setBetaFeaturesEnabled(settings.enableBetaFeatures === true)
          const b = (settings.branding as Record<string, string | undefined>) || {}

          // Read exclusively from settings.branding — no column fallbacks
          firmBranding = (b.logoUrl || b.logoData || b.primaryColor || org?.name)
            ? {
              logoUrl: b.logoData ?? b.logoUrl ?? null,
              logoAspectRatio: b.logoAspectRatio ?? null,
              name: b.name ?? org?.name ?? null,
              subtext: b.subtext ?? null,
              themeColor: b.primaryColor ?? null,
              secondaryColor: b.secondaryColor ?? null,
              website: b.website ?? null,
            }
            : null

          if (slug) {
            brandingCache.set(slug, { branding: firmBranding, firmId: org?.id })
            currentSlugRef.current = slug
          }
        }

        // Client brand overlay — fetched when inside /c/[clientSlug]
        let effective = firmBranding
        if (clientSlug && slug) {
          const clientCacheKey = `${slug}:${clientSlug}`
          try {
            const clientRes = await fetch(
              `/api/clients/brand-by-slug?firmSlug=${encodeURIComponent(slug)}&clientSlug=${encodeURIComponent(clientSlug)}`,
              { headers: { Authorization: `Bearer ${session.access_token}` } }
            )
            if (clientRes.ok) {
              const { brand } = await clientRes.json()
              const clientBrand: OrganizationBranding | null = brand
                ? {
                    logoUrl: brand.logoUrl ?? null,
                    logoAspectRatio: brand.logoAspectRatio ?? null,
                    name: brand.name ?? firmBranding?.name ?? null,
                    subtext: brand.subtext ?? firmBranding?.subtext ?? null,
                    themeColor: brand.primaryColor ?? firmBranding?.themeColor ?? null,
                    secondaryColor: brand.secondaryColor ?? firmBranding?.secondaryColor ?? null,
                    website: firmBranding?.website ?? null,
                  }
                : null
              clientBrandingCache.set(clientCacheKey, clientBrand)
              currentClientSlugRef.current = clientSlug
              if (clientBrand) effective = clientBrand
            }
          } catch {
            // ignore, fall back to firm branding
          }
        } else {
          currentClientSlugRef.current = null
        }

        setBranding(effective)

        // Inject CSS vars + cache (in-memory + sessionStorage)
        if (slug) {
          const payload = pathname?.startsWith('/d')
            ? injectBrandCssVars(effective)
            : effective ?? {}
          setBrandingInSession(slug, payload as SessionBrandingPayload)
          window.dispatchEvent(new CustomEvent('firm-branding-reloaded'))
        } else {
          // No firm selected — reset CSS vars to Firma defaults
          document.documentElement.style.setProperty('--primary', '161 93% 31%')
          document.documentElement.style.setProperty('--primary-foreground', '0 0% 98%')
          document.documentElement.style.setProperty('--primary-rgb', '6, 150, 104')
          document.documentElement.style.removeProperty('--brand-accent')
          document.documentElement.style.removeProperty('--brand-accent-foreground')
          setBranding(null)
        }
      } catch {
        // Silent fail
      } finally {
        setLoading(false)
      }
    }

    reloadBrandingRef.current = () => {
      if (slug) {
        brandingCache.delete(slug)
        currentSlugRef.current = null
      }
      if (slug && clientSlug) {
        clientBrandingCache.delete(`${slug}:${clientSlug}`)
        currentClientSlugRef.current = null
      }
      return loadFirmBranding()
    }

    loadFirmBranding()
  }, [user, pathname, slug, clientSlug])

  useEffect(() => {
    const onBrandingUpdated = () => reloadBrandingRef.current?.()
    window.addEventListener('firm-branding-updated', onBrandingUpdated)
    window.addEventListener('client-branding-updated', onBrandingUpdated)
    return () => {
      window.removeEventListener('firm-branding-updated', onBrandingUpdated)
      window.removeEventListener('client-branding-updated', onBrandingUpdated)
    }
  }, [])

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
    if (pathname?.startsWith('/d/onboarding')) return
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
      if (showRecentsDropdown && !target.closest('.recents-container')) setShowRecentsDropdown(false)
      if (showBookmarksDropdown && !target.closest('.bookmarks-container')) setShowBookmarksDropdown(false)
      if (showNotificationsDropdown && !target.closest('.notifications-container')) setShowNotificationsDropdown(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [mounted, showRecentsDropdown, showBookmarksDropdown, showNotificationsDropdown])

  // Hide until mounted (Safari hydration) but always render the same subtree so child hooks run every render.
  return (
    <div
      className={`flex h-full w-full items-center px-4 gap-4 ${!mounted ? 'invisible pointer-events-none' : ''}`}
      aria-hidden={!mounted}
    >
      {/* Left: Firma brand when no firm selected; org branding when inside a firm */}
      <div className="shrink-0 max-w-[280px] flex items-center pl-1">
        {!slug ? (
          <Logo size="lg" showText wordmarkClassName="font-headline text-2xl font-bold tracking-tighter" />
        ) : branding ? (
          <Logo
            size="lg"
            showText
            branding={branding}
            wordmarkClassName="font-headline text-2xl font-bold tracking-tighter text-[#1b1b1d]"
          />
        ) : null}
      </div>

      {/* Center: Command palette trigger — hidden on onboarding */}
      <div className="flex-1 flex justify-center px-12">
        {!pathname?.startsWith('/d/onboarding') && (() => {
          const isMac = mounted && /Mac|iPhone|iPod|iPad/i.test(navigator.platform)
          const modKey = !mounted ? '⌘' : isMac ? '⌘' : 'Ctrl'
          return (
            <button
              type="button"
              data-demo-tour="command-palette"
              onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }))}
              className="flex items-center gap-2.5 w-full max-w-sm bg-[#f9f9fb] border border-[#e5e7eb] rounded-sm px-3 py-2 text-sm text-[#45474c]/60 hover:border-primary/40 hover:bg-white transition-colors group"
              aria-label="Open command palette"
            >
              <Search className="h-4 w-4 shrink-0" />
              <TypewriterText isOpen={paletteOpen} />
              <span className="hidden sm:inline-flex items-center gap-1">
                <kbd className="inline-flex items-center justify-center rounded border border-[#d1d5db] bg-white px-1.5 py-0.5 text-[11px] font-semibold font-mono text-[#45474c] shadow-[0_1px_0_0_#d1d5db] leading-none">
                  {modKey}
                </kbd>
                <kbd className="inline-flex items-center justify-center rounded border border-[#d1d5db] bg-white px-1.5 py-0.5 text-[11px] font-semibold font-mono text-[#45474c] shadow-[0_1px_0_0_#d1d5db] leading-none">
                  K
                </kbd>
              </span>
            </button>
          )
        })()}</div>
      <CommandPalette onOpenChange={setPaletteOpen} />

      {/* Right: Utility actions — w-64, justify-end */}
      <div className="w-64 shrink-0 flex items-center justify-end gap-1 pr-4">
        {isDemoFirm && slug && <DemoTourTopbarButton firmSlug={slug} />}
        <div data-demo-tour="topbar-reminders">
          <RemindersPanel />
        </div>
        <div className="relative recents-container">
          <Tip label="Recents" position="bottom">
          <button
            type="button"
            className="w-10 h-10 flex items-center justify-center rounded-xl text-firma hover:bg-firma/10 transition-colors relative"
            aria-label="Recents"
            onClick={() => setShowRecentsDropdown((v) => !v)}
          >
            <History className="h-5 w-5" />
            {recentItems.length > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 px-1 bg-firma text-white text-[9px] font-bold rounded-full border border-white flex items-center justify-center leading-none">
                {recentItems.length}
              </span>
            )}
          </button>
          </Tip>
          {showRecentsDropdown ? (
            <div className="absolute right-0 top-full mt-2 w-[340px] border border-[#e5e7eb] rounded shadow-lg z-50 overflow-hidden">
              {/* Header */}
              <div className="px-4 py-3 bg-[#f9f9fb] border-b border-[#e5e7eb] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[0.8125rem] font-bold text-[#1b1b1d] tracking-tight">Recents</span>
                  {recentItems.length > 0 && (
                    <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-sm tabular-nums leading-none bg-firma text-white">
                      {recentItems.length}
                    </span>
                  )}
                </div>
                <button type="button" onClick={() => setShowRecentsDropdown(false)} aria-label="Close"
                  className="p-1 rounded hover:bg-[#f3f4f6] text-[#45474c] hover:text-[#1b1b1d] transition-colors">
                  <SquareX className="h-4 w-4" />
                </button>
              </div>
              {/* Body */}
              <div className="p-3 space-y-1.5 max-h-[400px] overflow-y-auto bg-white">
                {recentItems.length === 0 ? (
                  <div className="text-center py-8">
                    <History className="h-7 w-7 mx-auto mb-2 text-[#e5e7eb]" />
                    <p className="text-[0.8125rem] font-semibold text-[#1b1b1d]">No recent pages</p>
                    <p className="text-xs text-[#45474c] mt-0.5">Pages you visit will appear here.</p>
                  </div>
                ) : (
                  recentItems.slice(0, 8).map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setShowRecentsDropdown(false)}
                      className="grid px-3 py-2 rounded border border-[#e5e7eb] bg-white hover:border-[#e5e7eb] hover:shadow-sm transition-all group"
                      style={{ borderLeftWidth: '3px', borderLeftColor: item.type === 'client' ? '#5A78FF' : '#06966A' }}
                    >
                      {/* Line 1: icon + name + chevron */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        {item.type === 'client' ? (
                          <Users className="h-3.5 w-3.5 shrink-0 text-[#45474c]" />
                        ) : (
                          <Briefcase className="h-3.5 w-3.5 shrink-0 text-[#45474c]" />
                        )}
                        <span className="text-[0.8125rem] font-semibold text-[#1b1b1d] truncate flex-1 group-hover:text-primary transition-colors">
                          {item.name}
                        </span>
                        <ChevronRight className="h-3 w-3 shrink-0 text-[#45474c]/40 group-hover:text-primary/60 transition-colors" />
                      </div>
                      {/* Line 2: type label + relative time */}
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <History className="h-3 w-3 shrink-0 text-[#9ca3af]" />
                        <span className="text-[11px] text-[#9ca3af]">
                          {item.type === 'client' ? 'Client' : 'Engagement'} · {formatRelativeTime(new Date(item.visitedAt))}
                        </span>
                      </div>
                    </Link>
                  ))
                )}
              </div>
              {/* Footer */}
              {recentItems.length > 0 && (
                <div className="sticky bottom-0 bg-white border-t border-[#e5e7eb] px-3 py-2 flex items-center justify-between">
                  <span className="text-[11px] text-[#45474c]">
                    {recentItems.length} {recentItems.length === 1 ? 'item' : 'items'}
                  </span>
                  <Link
                    href="/d/u/recent"
                    onClick={() => setShowRecentsDropdown(false)}
                    className="flex items-center gap-0.5 text-[11px] font-semibold text-firma hover:text-firma/80"
                  >
                    View all <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </div>
              )}
            </div>
          ) : null}
        </div>
        <div className="relative bookmarks-container">
          <Tip label="Bookmarks" position="bottom">
          <button
            type="button"
            data-demo-tour="topbar-bookmarks"
            className="w-10 h-10 flex items-center justify-center rounded-xl text-[#5A78FF] hover:bg-[#5A78FF]/10 transition-colors relative"
            aria-label="Bookmarks"
            onClick={() => {
              setShowBookmarksDropdown((v) => !v)
              setBookmarkQuery('')
            }}
          >
            <Bookmark className="h-5 w-5" />
            {bookmarks.length > 0 ? (
              <span className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 px-1 bg-[#5A78FF] text-white text-[9px] font-bold rounded-full border border-white flex items-center justify-center leading-none">
                {bookmarks.length}
              </span>
            ) : null}
          </button>
          </Tip>
          {showBookmarksDropdown ? (
            <div className="absolute right-0 top-full mt-2 w-[360px] bg-white border border-[#e5e7eb] rounded shadow-lg z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-[#e5e7eb] bg-[#f9f9fb]">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[0.8125rem] font-bold text-[#1b1b1d] tracking-tight">Bookmarks</span>
                    {bookmarks.length > 0 ? (
                      <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-sm tabular-nums leading-none bg-[#5A78FF] text-white">{bookmarks.length}</span>
                    ) : null}
                  </div>
                  <button type="button" onClick={() => setShowBookmarksDropdown(false)} aria-label="Close"
                    className="p-1 rounded hover:bg-[#f3f4f6] text-[#45474c] hover:text-[#1b1b1d] transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2">
                  <input
                    value={bookmarkQuery}
                    onChange={(e) => { setBookmarkQuery(e.target.value) }}
                    placeholder="Search bookmarks…"
                    className="w-full h-8 rounded border border-[#e5e7eb] bg-white px-2.5 text-[0.8125rem] text-[#1b1b1d] placeholder:text-[#45474c] focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
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
                        <Bookmark className="h-8 w-8 text-[#e5e7eb] mx-auto mb-2" />
                        <p className="text-[0.8125rem] text-[#45474c]">No bookmarks</p>
                        <p className="text-xs text-[#45474c]">Use &quot;Bookmark&quot; on a document to add one.</p>
                      </div>
                    )
                  }
                  return (
                    <>
                      {visible.map((b) => (
                        <div key={b.id} className="group flex items-start gap-2 p-3 rounded border border-[#e5e7eb] bg-white hover:bg-[#f9f9fb]">
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
                            <p className="text-[0.8125rem] font-medium text-[#1b1b1d] truncate">{b.label || b.url || 'Bookmark'}</p>
                            <p className="text-xs text-[#45474c] truncate">{b.url ? b.url : 'In-app link'}</p>
                          </button>
                          <button
                            type="button"
                            className="p-1 rounded hover:bg-[#f3f4f6] text-[#45474c] hover:text-[#1b1b1d] opacity-0 group-hover:opacity-100 transition-opacity"
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
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      <div className="sticky bottom-0 pt-2 bg-white">
                        <div className="flex items-center justify-between border-t border-[#e5e7eb] pt-2">
                          <span className="text-[11px] text-[#45474c]">
                            {filtered.length} {filtered.length === 1 ? 'bookmark' : 'bookmarks'}
                          </span>
                          <Link
                            href="/d/u/bookmarks"
                            className="flex items-center gap-0.5 text-[11px] font-semibold text-firma hover:text-firma/80"
                            onClick={() => setShowBookmarksDropdown(false)}
                          >
                            View all <ArrowUpRight className="h-3 w-3" />
                          </Link>
                        </div>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          ) : null}
        </div>

        {betaFeaturesEnabled && <div className="relative notifications-container">
          <Tip label="Notifications" position="bottom-right">
          <button
            type="button"
            className="w-10 h-10 flex items-center justify-center rounded-xl text-firma hover:bg-firma/10 transition-colors relative"
            aria-label="Notifications"
            onClick={() => setShowNotificationsDropdown((v) => !v)}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 ? (
              <span className="absolute top-1 right-1 min-w-[14px] h-3.5 px-1 bg-firma text-firma-foreground text-[9px] font-bold rounded-full border border-white flex items-center justify-center leading-none">
                {unreadCount}
              </span>
            ) : (
              <span className="absolute top-1 right-1 h-2 w-2 bg-firma rounded-full border border-white" />
            )}
          </button>
          </Tip>
          {showNotificationsDropdown ? (
            <div className="absolute right-0 top-full mt-2 w-[360px] bg-white border border-[#e5e7eb] rounded shadow-lg z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-[#e5e7eb] bg-[#f9f9fb]">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[0.8125rem] font-bold text-[#1b1b1d] tracking-tight">Notifications</span>
                    {unreadCount > 0 ? (
                      <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-sm tabular-nums leading-none bg-firma text-firma-foreground">{unreadCount}</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setShowNotificationsDropdown(false)} aria-label="Close"
                      className="p-1 rounded hover:bg-[#f3f4f6] text-[#45474c] hover:text-[#1b1b1d] transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="h-9 rounded border border-[#e5e7eb] bg-white px-2 text-xs font-semibold text-[#1b1b1d] hover:border-primary/50 hover:bg-[#f9f9fb] whitespace-nowrap"
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
                    className="h-9 rounded border border-[#e5e7eb] bg-white px-2 text-xs font-semibold text-[#1b1b1d] hover:border-primary/50 hover:bg-[#f9f9fb] whitespace-nowrap disabled:opacity-50"
                    onClick={() => setShowBroadcastComposer((v) => !v)}
                    disabled={!canBroadcast}
                    title={canBroadcast ? 'Send a broadcast to a team' : 'Broadcasts are available to admins'}
                  >
                    <span className="inline-flex items-center justify-center gap-1.5">
                      <Megaphone className="h-4 w-4 text-rose-700" />
                      Broadcast
                      {showBroadcastComposer ? (
                        <ChevronUp className="h-4 w-4 text-[#45474c]" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-[#45474c]" />
                      )}
                    </span>
                  </button>
                </div>
                {canBroadcast && showBroadcastComposer ? (
                  <div className="mt-3 rounded border border-[#e5e7eb] bg-white p-2.5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="text-[11px] font-semibold text-[#1b1b1d] whitespace-nowrap">Scope</div>
                        <div className="h-4 w-px bg-[#e5e7eb]" />
                        <div className="flex items-center gap-1 text-[11px] text-[#45474c] truncate">
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
                                  ? 'border-rose-300 bg-white text-[#1b1b1d] shadow-sm'
                                  : 'border-[#e5e7eb] bg-white text-[#1b1b1d] hover:border-primary/50 hover:bg-[#f9f9fb]'
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
                      className="w-full h-8 rounded border border-[#e5e7eb] bg-white px-2.5 text-xs text-[#1b1b1d] placeholder:text-[#45474c] focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                    />
                    <textarea
                      value={broadcastText}
                      onChange={(e) => setBroadcastText(e.target.value.slice(0, 1000))}
                      placeholder="Broadcast message (max 1000 chars)…"
                      rows={4}
                      className="mt-2 w-full rounded border border-[#e5e7eb] bg-white px-2.5 py-2 text-xs text-[#1b1b1d] placeholder:text-[#45474c] focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-none"
                    />
                    <div className="mt-2 flex items-center justify-between">
                      <div className="text-[11px] text-[#45474c]">{broadcastText.length}/1000</div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="h-9 w-9 inline-flex items-center justify-center rounded border border-[#e5e7eb] bg-white text-[#1b1b1d] hover:bg-[#f9f9fb] disabled:opacity-60"
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
                          className="h-9 w-9 inline-flex items-center justify-center rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
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
                    <Bell className="h-8 w-8 text-[#e5e7eb] mx-auto mb-2" />
                    <p className="text-[0.8125rem] text-[#45474c]">No notifications</p>
                    <p className="text-xs text-[#45474c]">Set due dates on projects/documents to see alerts here.</p>
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
                      className={`group w-full text-left p-3 rounded border border-[#e5e7eb] bg-white transition-colors hover:bg-[#f9f9fb] cursor-pointer ${
                        n.readAt ? 'opacity-60' : ''
                      }`}
                      style={{
                        borderLeftWidth: '3px',
                        borderLeftColor: n.readAt ? '#e5e7eb' : accent.borderLeft
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
                              className={`text-[0.8125rem] truncate ${n.readAt ? 'font-medium text-[#45474c]' : 'font-semibold text-[#1b1b1d]'}`}
                              title={[n.title, n.body ?? '', new Date(n.createdAt).toLocaleString()].filter(Boolean).join('\n')}
                            >
                              {n.title}
                            </p>
                            <div className="shrink-0 flex items-center gap-2">
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  className="h-7 w-7 inline-flex items-center justify-center rounded border border-[#e5e7eb] bg-white hover:bg-[#f9f9fb]"
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
                                {n.type === 'BROADCAST' || n?.metadata?.broadcast ? <Megaphone className="h-3 w-3 text-[#45474c]" /> : null}
                                {scopePill(getScope(n)).label}
                              </span>
                            </div>
                          </div>
                          {n.body ? <p className="text-xs text-[#45474c] mt-1">{n.body}</p> : null}
                          <p className="text-xs text-[#45474c] mt-1">{new Date(n.createdAt).toLocaleString()}</p>
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
                    <div className="flex items-center justify-between border-t border-[#e5e7eb] pt-2">
                      <span className="text-[11px] text-[#45474c]">
                        {notifications.length} {notifications.length === 1 ? 'notification' : 'notifications'}
                      </span>
                      <Link
                        href="/d/u/notifications"
                        className="flex items-center gap-0.5 text-[11px] font-semibold text-firma hover:text-firma/80"
                        onClick={() => setShowNotificationsDropdown(false)}
                      >
                        View all <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>}

      </div>
    </div>
  )
}
