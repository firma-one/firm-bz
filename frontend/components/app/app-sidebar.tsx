"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { useSidebar } from "@/lib/sidebar-context"
import {
  Users,
  ChevronDown,
  Briefcase,
  BarChart3,
  Building2,
  Eye,
  Shield,
  HelpCircle,
  BookOpen,
  ArrowUpRight,
  Info,
  LifeBuoy,
  Bell,
  Clock,
  CheckCircle2,
  History,
  CornerDownRight,
  Settings,
  Lock,
  Megaphone,
  Bookmark,
} from "lucide-react"
import { WhatsNewModal } from "@/components/ui/whats-new-modal"
import { useWhatsNew, type ReleaseMeta } from "@/lib/use-whats-new"
import _releasesMetaData from "@/content/releases-meta.json"
const releasesMetaData = _releasesMetaData as ReleaseMeta[]
import { FirmSelector, type FirmOption } from "@/components/projects/firm-selector"
import { getUserFirms } from "@/lib/actions/firms"
import { getFirmRole } from "@/lib/actions/firm"
import { Skeleton } from "@/components/ui/skeleton"
import { buildBillingPageHref } from "@/lib/billing/build-billing-page-href"
import { fetchBillingCurrentPlan } from "@/lib/billing/fetch-billing-current-plan"
import { formatProfilePlanSubtitle } from "@/lib/billing/format-profile-plan-subtitle"
import { planNameForSummary } from '@/lib/billing/subscription-display'
import type { BillingCurrentPlanState } from "@/components/billing/polar-plans-picker"
import { ProfileSection } from "@/components/ui/profile-section"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useViewAs, RBAC_PERSONAS } from "@/lib/view-as-context"
import { useSidebarFirms } from "@/lib/sidebar-firms-context"
import { getUserReminders, markReminderDone, type ReminderWithContext } from "@/lib/actions/user-reminders"

interface AppSidebarProps {
  /** When "inline", sidebar fills its container (no fixed positioning). Used in 3-pane card layout. */
  variant?: 'fixed' | 'inline'
  /** Passed from server layout after checking SYSTEM_ADMIN_EMAILS env var. */
  isSystemAdmin?: boolean
}

/** Widen to `Set<string>` so `.has(unknown)` accepts normalized API/cookie values. */
const VIEW_AS_SLUG_SET = new Set<string>(RBAC_PERSONAS.map((p) => p.slug))

/**
 * Radix Select throws if `value` does not match a SelectItem. Firm roles from the API use
 * ORG_MEMBER / FIRM_ADMIN — only the latter overlaps RBAC persona slugs after lowercasing.
 */
function resolveViewAsSelectSlug(
  viewAsOverride: string | null | undefined,
  activePersona: unknown,
  role: string | null,
): string {
  const coerce = (raw: unknown): string | null => {
    if (raw == null) return null
    const s = String(raw).trim().toLowerCase()
    if (!s) return null
    if (VIEW_AS_SLUG_SET.has(s)) return s
    if (s === 'org_member') return 'firm_member'
    return null
  }
  return (
    coerce(viewAsOverride) ??
    coerce(activePersona) ??
    coerce(role?.toLowerCase()) ??
    RBAC_PERSONAS[0]?.slug ??
    'firm_member'
  )
}

// --- Recents ---

const MAX_RECENTS = 10
const MAX_SIDEBAR_RECENTS = 3

type RecentItem = {
  type: 'client' | 'engagement'
  name: string
  slug: string
  href: string
  visitedAt: number
}

function toLabel(slug: string) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const ENGAGEMENT_TABS = new Set(['files', 'shares', 'comments', 'members', 'analytics', 'sources', 'audit', 'settings', 'wiki'])

function parseRecentFromPath(pathname: string, firmSlug: string): RecentItem | null {
  const engMatch = pathname.match(/\/d\/f\/[^/]+\/c\/([^/]+)\/e\/([^/]+)(?:\/([^/]+))?/)
  if (engMatch) {
    const clientSlug = engMatch[1]
    const engSlug = engMatch[2]
    const tab = engMatch[3] && ENGAGEMENT_TABS.has(engMatch[3]) ? engMatch[3] : null
    const base = `/d/f/${firmSlug}/c/${clientSlug}/e/${engSlug}`
    return {
      type: 'engagement',
      name: toLabel(engSlug),
      slug: engSlug,
      href: base,
      visitedAt: Date.now(),
    }
  }
  // Client detail pages only — not firm-level sub-routes like /insights, /audit, /connectors
  const clientMatch = pathname.match(/\/d\/f\/[^/]+\/c\/([^/]+)(?:\/|$)/)
  if (clientMatch) {
    return {
      type: 'client',
      name: toLabel(clientMatch[1]),
      slug: clientMatch[1],
      href: `/d/f/${firmSlug}/c/${clientMatch[1]}`,
      visitedAt: Date.now(),
    }
  }
  return null
}

function useRecentNavItems(firmSlug: string | null, pathname: string): RecentItem[] {
  const storageKey = firmSlug ? `fm_nav_recents_${firmSlug}` : null
  const [recents, setRecents] = useState<RecentItem[]>([])

  useEffect(() => {
    if (!storageKey) return
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const parsed: any[] = JSON.parse(raw)
        setRecents(parsed.map((item) => ({
          ...item,
          // backfill slug from href for items stored before slug field existed
          slug: item.slug || item.href?.split('/').filter(Boolean).pop() || '',
        })))
      }
    } catch { /* ignore */ }
  }, [storageKey])

  useEffect(() => {
    if (!firmSlug || !storageKey) return
    const item = parseRecentFromPath(pathname, firmSlug)
    if (!item) return
    setRecents((prev) => {
      const deduped = prev.filter((r) => !(r.type === item.type && r.slug === item.slug))
      const updated = [item, ...deduped].slice(0, MAX_RECENTS)
      try { localStorage.setItem(storageKey, JSON.stringify(updated)) } catch { /* ignore */ }
      return updated
    })
  }, [pathname, firmSlug, storageKey])

  // Patch stored names when a page broadcasts its real entity names
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { type: string; name?: string; slug: string } | undefined
      if (!detail?.name || !detail?.slug || !storageKey) return
      setRecents((prev) => {
        const next = prev.map((item) =>
          item.type === detail.type && item.slug === detail.slug && item.name !== detail.name
            ? { ...item, name: detail.name! }
            : item
        )
        const changed = next.some((item, i) => item.name !== prev[i].name)
        if (changed) try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* ignore */ }
        return changed ? next : prev
      })
    }
    window.addEventListener('firma-page-context', handler)
    return () => window.removeEventListener('firma-page-context', handler)
  }, [storageKey])

  return recents
}

// --- Reminder label color ---
function reminderLabelColor(style: ReminderWithContext['labelStyle']): string {
  switch (style) {
    case 'amber': return '#C4572B'
    case 'orange': return '#A33D1E'
    case 'red':    return '#7A2414'
    default:       return '#45474c'
  }
}

export function AppSidebar({ variant = 'fixed', isSystemAdmin = false }: AppSidebarProps = {}) {
  const { user, signOut } = useAuth()
  const { isCollapsed, toggleSidebar } = useSidebar()
  const { viewAsPersonaSlug, setViewAsPersonaSlug, effectivePermissions, isViewAsActive, personas } = useViewAs()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialFirms = useSidebarFirms()
  const [viewAsSelectOpen, setViewAsSelectOpen] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(!initialFirms || initialFirms.length === 0)

  // Firm selector state
  const [firms, setFirms] = useState<FirmOption[]>(initialFirms as FirmOption[] || [])
  const [selectedFirmSlug, setSelectedFirmSlug] = useState<string>('')

  // Permissions state
  const [orgPermissions, setOrgPermissions] = useState<{
    canView: boolean
    canEdit: boolean
    canManage: boolean
    canManageClients: boolean
    canEditClients: boolean
    canViewClients: boolean
    isOrgOwner?: boolean
    enableBetaFeatures?: boolean
  } | null>(null)

  const [canUseViewAs, setCanUseViewAs] = useState(false)

  // Reminders state
  const [isRemindersOpen, setIsRemindersOpen] = useState(false)
  const [reminders, setReminders] = useState<ReminderWithContext[]>([])
  const [remindersLoading, setRemindersLoading] = useState(false)

  // Bookmarks state
  const [isBookmarksOpen, setIsBookmarksOpen] = useState(false)
  const [bookmarks, setBookmarks] = useState<{ id: string; label?: string; url?: string; kind: string }[]>([])
  const [bookmarksLoading, setBookmarksLoading] = useState(false)

  // Recents section collapse
  const [isRecentsOpen, setIsRecentsOpen] = useState(true)
  // Collapsed recents popover
  const [recentsPopoverOpen, setRecentsPopoverOpen] = useState(false)

  const [billingPlanState, setBillingPlanState] = useState<BillingCurrentPlanState | null>(null)
  const [billingPlanLoading, setBillingPlanLoading] = useState(false)

  const [isWhatsNewOpen, setIsWhatsNewOpen] = useState(false)
  const { hasUnread, markAsRead } = useWhatsNew(releasesMetaData)

  // Extract firm slug from URL
  const getSlug = () => {
    const match = pathname.match(/\/(?:d\/)?f\/([^\/]+)/)
    return match ? match[1] : null
  }
  const slug = getSlug()

  const baseUrl = slug ? `/d/f/${slug}` : '/d'
  const firmScopedNavBase =
    slug != null
      ? `/d/f/${slug}`
      : (() => {
          const s =
            selectedFirmSlug ||
            firms.find((o) => o.isDefault)?.slug ||
            firms[0]?.slug
          return s ? `/d/f/${s}` : '/d'
        })()

  const recents = useRecentNavItems(slug || selectedFirmSlug || null, pathname)

  // Load reminders on mount and when event fires
  const loadReminders = useCallback(async () => {
    setRemindersLoading(true)
    try { setReminders(await getUserReminders()) }
    finally { setRemindersLoading(false) }
  }, [])

  useEffect(() => { loadReminders() }, [loadReminders])
  useEffect(() => {
    const h = () => loadReminders()
    window.addEventListener('firma-reminders-updated', h)
    return () => window.removeEventListener('firma-reminders-updated', h)
  }, [loadReminders])

  const loadBookmarks = useCallback(async () => {
    setBookmarksLoading(true)
    try {
      const res = await fetch('/api/bookmarks')
      if (res.ok) {
        const data = await res.json()
        setBookmarks(data.bookmarks ?? [])
      }
    } finally { setBookmarksLoading(false) }
  }, [])

  useEffect(() => { loadBookmarks() }, [loadBookmarks])
  useEffect(() => {
    const h = () => loadBookmarks()
    window.addEventListener('pockett-bookmarks-updated', h)
    return () => window.removeEventListener('pockett-bookmarks-updated', h)
  }, [loadBookmarks])

  async function handleReminderDone(id: string) {
    try {
      await markReminderDone(id)
      window.dispatchEvent(new Event('firma-reminders-updated'))
    } catch { /* ignore */ }
  }

  const visibleReminders = reminders.filter((r) => r.hiddenAt === null)
  const remindersUrgentCount = visibleReminders.filter((r) => r.delta !== null && r.delta <= 0).length

  // Fetch firms + permissions
  const fetchData = async () => {
    const hasCachedData = firms.length > 0 && (slug ? firms.some(o => o.slug === slug) : true)
    if (!hasCachedData) setIsLoading(true)
    try {
      const orgs = await getUserFirms()
      setFirms(orgs)
      if (slug) {
        setSelectedFirmSlug(slug)
        const currentOrg = orgs.find(o => o.slug === slug)
        if (currentOrg) {
          const [roleData, permResponse] = await Promise.all([
            getFirmRole(slug),
            fetch(`/api/permissions/firm?firmId=${currentOrg.id}`)
          ])
          setRole(roleData)
          if (permResponse.ok) {
            try {
              const permData = await permResponse.json()
              setOrgPermissions(permData)
            } catch { /* ignore */ }
          }
        }
      } else if (orgs.length > 0) {
        const defaultOrg = orgs.find(org => org.isDefault) || orgs[0]
        const selectedSlug = defaultOrg?.slug || orgs[0].slug
        setSelectedFirmSlug(selectedSlug)
        if (defaultOrg) {
          const [roleData, permResponse] = await Promise.all([
            getFirmRole(defaultOrg.slug),
            fetch(`/api/permissions/firm?firmId=${defaultOrg.id}`)
          ])
          setRole(roleData)
          if (permResponse.ok) {
            try {
              const permData = await permResponse.json()
              setOrgPermissions(permData)
            } catch { /* ignore */ }
          }
        }
      }
    } catch { /* ignore */ }
    finally { setIsLoading(false) }
  }

  useEffect(() => {
    fetchData()
    const handleRefresh = () => fetchData()
    window.addEventListener('pockett:refresh-firms', handleRefresh)
    return () => window.removeEventListener('pockett:refresh-firms', handleRefresh)
  }, [slug])

  useEffect(() => {
    if (slug) {
      setSelectedFirmSlug(slug)
    } else if (firms.length > 0) {
      const defaultOrg = firms.find(org => org.isDefault)
      setSelectedFirmSlug(defaultOrg?.slug || firms[0].slug)
    }
  }, [pathname, slug, firms])

  const isDashboardPath = pathname?.startsWith('/d') || pathname?.startsWith('/o/')
  useEffect(() => {
    if (!user || !isDashboardPath) {
      setCanUseViewAs(false)
      return
    }
    fetch('/api/permissions/can-use-view-as')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setCanUseViewAs(data?.canUseViewAs === true))
      .catch(() => setCanUseViewAs(false))
  }, [user, isDashboardPath])

  // Permissions — use effective (View As) when active, else real org permissions
  const effective = isViewAsActive ? effectivePermissions : null
  const canManageOrg = effective ? effective.canManage : (orgPermissions?.canManage ?? false)
  const canEditOrg = effective ? effective.canEdit : (orgPermissions?.canEdit ?? false)
  const canViewOrg = effective ? effective.canView : (orgPermissions?.canView ?? true)

  const canShowViewAsDropdown = canUseViewAs

  // Active state helpers
  const isInsightsActive = searchParams.get('tab') === 'analytics'
  const isSettingsActive = searchParams.get('tab') === 'settings'
  const isSupportActive = pathname.startsWith('/d/support')
  const isRemindersPageActive = pathname.startsWith('/d/u/reminders')
  const isClientsActive =
    Boolean(slug) &&
    !isInsightsActive &&
    !isSettingsActive &&
    !isSupportActive &&
    !isRemindersPageActive &&
    !pathname.startsWith('/d/u/') &&
    (pathname === baseUrl || (pathname.startsWith(`${baseUrl}/c`) && !pathname.includes('/e/')))

  const billingFirmSlug =
    slug || selectedFirmSlug || firms.find((o) => o.isDefault)?.slug || firms[0]?.slug || null

  const billingFirmId = useMemo(() => {
    if (!billingFirmSlug) return null
    return firms.find((f) => f.slug === billingFirmSlug)?.id ?? null
  }, [firms, billingFirmSlug])

  const billingSandboxOnly = useMemo(() => {
    if (!billingFirmSlug) return false
    return firms.find((f) => f.slug === billingFirmSlug)?.sandboxOnly ?? false
  }, [firms, billingFirmSlug])

  useEffect(() => {
    if (!billingFirmId) {
      setBillingPlanState(null)
      setBillingPlanLoading(false)
      return
    }
    let cancelled = false
    setBillingPlanLoading(true)
    fetchBillingCurrentPlan(billingFirmId)
      .then((s) => { if (!cancelled) { setBillingPlanState(s); setBillingPlanLoading(false) } })
      .catch(() => { if (!cancelled) { setBillingPlanState(null); setBillingPlanLoading(false) } })
    return () => { cancelled = true }
  }, [billingFirmId])

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      if (!billingFirmId) return
      void fetchBillingCurrentPlan(billingFirmId).then(setBillingPlanState)
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [billingFirmId])

  const profilePlanSubtitle = useMemo(() => {
    if (!billingPlanState) return formatProfilePlanSubtitle(null, { sandboxOnly: billingSandboxOnly })
    return `${planNameForSummary(billingPlanState)} plan`
  }, [billingPlanState, billingSandboxOnly])

  const spaceTitle = 'mb-2'
  const SeparatorLine = () => <div className="-mx-3 border-b border-[#e5e7eb] my-8" aria-hidden />

  const isInline = variant === 'inline'
  const outerClass = isInline
    ? 'h-full w-full flex flex-col bg-white overflow-visible'
    : `fixed inset-y-0 left-0 z-40 bg-white border-r border-[#e5e7eb] transition-all duration-300 pt-16 overflow-visible ${isCollapsed ? 'w-16' : 'w-64'}`

  // Shared nav link + icon class helpers
  const navLinkClass = (active: boolean) =>
    `flex items-center d-sidebar-nav transition-colors py-2 ${
      active
        ? 'bg-primary/10 border-l-2 border-brand-accent text-primary font-semibold'
        : 'text-[#45474c] font-medium hover:bg-[#f9f9fb] hover:text-[#1b1b1d]'
    } ${isCollapsed ? 'px-0 justify-center' : 'px-3'}`

  const navIconClass = (active: boolean) =>
    `h-4 w-4 shrink-0 ${isCollapsed ? 'mx-auto' : 'mr-3'} ${active ? 'text-primary' : 'text-[#45474c]'}`

  return (
    <div className={outerClass}>
      {isLoading ? (
        <div className="flex flex-col h-full px-3 pt-6 gap-4">
          {!isCollapsed && (
            <>
              <Skeleton className="h-10 w-full rounded" />
              <div className="mx-3 border-b border-[#e5e7eb] mb-2" />
              <Skeleton className="h-3 w-20" />
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-9 w-full rounded" />
              ))}
            </>
          )}
          {isCollapsed && (
            <div className="flex flex-col items-center gap-3 pt-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-8 w-8 rounded" />
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-col h-full">
            {/* Collapse toggle */}
            <button
              type="button"
              onClick={toggleSidebar}
              className="absolute right-0 top-4 translate-x-1/2 z-[500] w-8 h-8 rounded-full bg-white text-[#45474c] hover:bg-[#f3f4f6] flex items-center justify-center shadow-sm border border-[#e5e7eb] cursor-pointer"
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M3 18h18v-2H3zm0-5h18v-2H3zm0-7v2h18V6z"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M3 18h13v-2H3zm0-5h10v-2H3zm0-7v2h13V6zm18 9.59L17.42 12 21 8.41 19.59 7l-5 5 5 5z"/>
                </svg>
              )}
            </button>

            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar px-3 space-y-4 pt-3 pb-3">
                <nav className="space-y-1">

                  {/* FIRM SWITCHER — compact when expanded, icon when collapsed */}
                  {!isCollapsed && (slug || firms.length > 0) && (
                    <>
                      <FirmSelector
                        firms={firms}
                        selectedFirmSlug={selectedFirmSlug}
                        onFirmChange={(firmSlug) => {
                          setSelectedFirmSlug(firmSlug)
                          router.push(`/d/f/${firmSlug}`)
                        }}
                        compact
                      />
                      {/* Tree sub-items: Overview + Clients + Settings */}
                      <div className="ml-1 space-y-0.5">
                        {canManageOrg && (
                          <Link href={`${firmScopedNavBase}?tab=analytics`} className={`group/lock flex w-full items-center transition-colors pl-2 pr-3 py-1.5 text-[0.8125rem] ${isInsightsActive ? 'bg-primary/10 border-l-2 border-brand-accent text-primary font-semibold' : 'text-[#45474c] font-medium hover:bg-[#f9f9fb] hover:text-[#1b1b1d]'}`}>
                            <CornerDownRight className="h-3 w-3 shrink-0 text-[#d1d5db] mr-1.5" />
                            <BarChart3 className={`h-3.5 w-3.5 mr-2 shrink-0 ${isInsightsActive ? 'text-primary' : 'text-[#45474c]'}`} />
                            <span>Overview</span>
                            <span title="Internal only" className="ml-auto flex items-center"><Lock className="w-2.5 h-2.5 text-[#45474c]/40 group-hover/lock:text-[#45474c] transition-colors shrink-0" /></span>
                          </Link>
                        )}
                        <Link href={`${baseUrl}?tab=clients`} className={`flex items-center transition-colors pl-2 pr-2 py-1.5 text-[0.8125rem] ${isClientsActive ? 'bg-primary/10 border-l-2 border-brand-accent text-primary font-semibold' : 'text-[#45474c] font-medium hover:bg-[#f9f9fb] hover:text-[#1b1b1d]'}`}>
                          <CornerDownRight className="h-3 w-3 shrink-0 text-[#d1d5db] mr-1.5" />
                          <Users className={`h-3.5 w-3.5 mr-2 shrink-0 ${isClientsActive ? 'text-primary' : 'text-[#45474c]'}`} />
                          <span>Clients</span>
                        </Link>
                        {canManageOrg && (
                          <Link href={`${firmScopedNavBase}?tab=settings`} className={`group/lock flex w-full items-center transition-colors pl-2 pr-3 py-1.5 text-[0.8125rem] ${isSettingsActive ? 'bg-primary/10 border-l-2 border-brand-accent text-primary font-semibold' : 'text-[#45474c] font-medium hover:bg-[#f9f9fb] hover:text-[#1b1b1d]'}`}>
                            <CornerDownRight className="h-3 w-3 shrink-0 text-[#d1d5db] mr-1.5" />
                            <Settings className={`h-3.5 w-3.5 mr-2 shrink-0 ${isSettingsActive ? 'text-primary' : 'text-[#45474c]'}`} />
                            <span>Settings</span>
                            <span title="Internal only" className="ml-auto flex items-center"><Lock className="w-2.5 h-2.5 text-[#45474c]/40 group-hover/lock:text-[#45474c] transition-colors shrink-0" /></span>
                          </Link>
                        )}
                      </div>
                    </>
                  )}

                  {/* Collapsed: firm icon + clients + analytics icons */}
                  {isCollapsed && (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link href={firmScopedNavBase} className={navLinkClass(false)}>
                            <Building2 className={navIconClass(false)} />
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right">{firms.find(f => f.slug === selectedFirmSlug)?.name ?? 'Workspace'}</TooltipContent>
                      </Tooltip>
                      {canManageOrg && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link href={`${firmScopedNavBase}?tab=analytics`} className={navLinkClass(isInsightsActive)}>
                              <BarChart3 className={navIconClass(isInsightsActive)} />
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent side="right">Overview</TooltipContent>
                        </Tooltip>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link href={`${baseUrl}?tab=clients`} className={navLinkClass(isClientsActive)}>
                            <Users className={navIconClass(isClientsActive)} />
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right">Clients</TooltipContent>
                      </Tooltip>
                      {canManageOrg && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link href={`${firmScopedNavBase}?tab=settings`} className={navLinkClass(isSettingsActive)}>
                              <Settings className={navIconClass(isSettingsActive)} />
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent side="right">Settings</TooltipContent>
                        </Tooltip>
                      )}
                    </>
                  )}

                  {/* SUPPORT */}
                  {canManageOrg && (
                    isCollapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link href={slug ? `/d/support?firmSlug=${slug}` : '/d/support'} className={navLinkClass(isSupportActive)}>
                            <LifeBuoy className={navIconClass(isSupportActive)} />
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right">Support</TooltipContent>
                      </Tooltip>
                    ) : (
                      <Link href={slug ? `/d/support?firmSlug=${slug}` : '/d/support'} className={`group/lock ${navLinkClass(isSupportActive)}`}>
                        <LifeBuoy className={navIconClass(isSupportActive)} />
                        <span className="flex-1">Support</span>
                        <span title="Internal only" className="flex items-center"><Lock className="w-2.5 h-2.5 text-[#45474c]/40 group-hover/lock:text-[#45474c] transition-colors shrink-0" /></span>
                      </Link>
                    )
                  )}

                  <SeparatorLine />

                  {/* RECENTS — expanded: collapsible inline list; collapsed: hover popover (only when items exist) */}
                  {!isCollapsed && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setIsRecentsOpen((v) => !v)}
                        className={`d-sidebar-section flex items-center w-full px-3 ${spaceTitle} hover:opacity-80 transition-opacity`}
                      >
                        <History className="h-3 w-3 shrink-0 mr-1.5 text-[#45474c]" />
                        <span className="flex-1 text-left">Recent</span>
                        {recents.length > 0 && (
                          <span
                            className="mr-1.5 min-w-[14px] h-3.5 px-1 text-white text-[8px] font-bold rounded-full flex items-center justify-center leading-none bg-primary"
                          >
                            {recents.length}
                          </span>
                        )}
                        <ChevronDown className={`h-3 w-3 text-[#9ca3af] transition-transform duration-200 ${isRecentsOpen ? 'rotate-180' : ''}`} />
                      </button>
                      <div className={`grid transition-all duration-200 ease-out ${isRecentsOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                        <div className="overflow-hidden">
                          <div className="space-y-1.5 pt-0.5">
                            {recents.length === 0 ? (
                              <p className="px-3 py-2.5 text-[0.75rem] text-[#9ca3af]">No recent pages yet</p>
                            ) : (
                              <>
                                {recents.slice(0, MAX_SIDEBAR_RECENTS).map((item) => {
                                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                                  const iconLabel = item.type === 'client' ? 'Client' : 'Engagement'
                                  return (
                                    <Link
                                      key={item.href}
                                      href={item.href}
                                      className={`flex items-center transition-colors pl-2 pr-3 py-1.5 ${
                                        isActive
                                          ? 'bg-primary/10 border-l-2 border-brand-accent text-primary font-semibold'
                                          : 'text-[#45474c] font-medium hover:bg-[#f9f9fb] hover:text-[#1b1b1d]'
                                      }`}
                                    >
                                      <CornerDownRight className="h-3 w-3 shrink-0 text-[#d1d5db] mr-1.5" />
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="flex items-center gap-2 min-w-0 flex-1">
                                            {item.type === 'client' ? (
                                              <Users className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-primary' : 'text-[#45474c]'}`} />
                                            ) : (
                                              <Briefcase className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-primary' : 'text-[#45474c]'}`} />
                                            )}
                                            <span className="flex-1 min-w-0 text-[0.8125rem] truncate">{item.name}</span>
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="right">{iconLabel}: {item.name}</TooltipContent>
                                      </Tooltip>
                                    </Link>
                                  )
                                })}
                                {recents.length > MAX_SIDEBAR_RECENTS && (
                                  <Link
                                    href="/d/u/recent"
                                    className="block pl-7 py-1.5 text-[0.75rem] text-primary hover:text-primary/80 font-medium"
                                  >
                                    View all ({recents.length}) →
                                  </Link>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {isCollapsed && recents.length > 0 && (
                    <div
                      className="relative"
                      onMouseEnter={() => setRecentsPopoverOpen(true)}
                      onMouseLeave={() => setRecentsPopoverOpen(false)}
                    >
                      <button
                        type="button"
                        className="flex items-center d-sidebar-nav transition-colors px-0 justify-center py-2 w-full text-[#45474c] hover:bg-[#f9f9fb] hover:text-[#1b1b1d]"
                        aria-label="Recent pages"
                      >
                        <History className="h-4 w-4 mx-auto" />
                      </button>
                      {recentsPopoverOpen && (
                        <div className="absolute left-full top-0 ml-2 w-56 bg-white border border-[#e5e7eb] rounded-[2px] shadow-md z-50 py-1.5">
                          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#9ca3af]">Recent</div>
                          {recents.slice(0, MAX_SIDEBAR_RECENTS).map((item) => (
                            <Link
                              key={item.href}
                              href={item.href}
                              title={item.name}
                              className="flex items-center gap-2 px-3 py-2 hover:bg-[#f9f9fb] transition-colors"
                            >
                              {item.type === 'client' ? (
                                <Users className="h-3.5 w-3.5 shrink-0 text-[#45474c]" />
                              ) : (
                                <Briefcase className="h-3.5 w-3.5 shrink-0 text-[#45474c]" />
                              )}
                              <span className="flex-1 min-w-0 text-[0.8125rem] text-[#1b1b1d] font-medium truncate" title={item.name}>{item.name}</span>
                            </Link>
                          ))}
                          {recents.length > MAX_SIDEBAR_RECENTS && (
                            <Link
                              href="/d/u/recent"
                              className="block px-3 py-1.5 text-[0.75rem] text-primary hover:text-primary/80 font-medium"
                            >
                              View all ({recents.length}) →
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {!isCollapsed && <SeparatorLine />}

                  {/* REMINDERS — expanded: inline accordion; collapsed: icon navigates to /d/u/reminders */}
                  {!isCollapsed ? (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setIsRemindersOpen((v) => !v)}
                        className={`d-sidebar-section w-full flex items-center px-3 ${spaceTitle} hover:opacity-80 transition-opacity`}
                      >
                        <Bell
                          className="h-3 w-3 mr-1.5 shrink-0"
                          style={{ color: remindersUrgentCount > 0 ? '#C4572B' : undefined }}
                        />
                        <span className="flex-1 text-left">Reminders</span>
                        {visibleReminders.length > 0 && (
                          <span
                            className="mr-1.5 min-w-[14px] h-3.5 px-1 text-white text-[8px] font-bold rounded-full flex items-center justify-center leading-none"
                            style={{ background: '#C4572B' }}
                          >
                            {visibleReminders.length}
                          </span>
                        )}
                        <ChevronDown className={`h-3 w-3 shrink-0 text-[#9ca3af] transition-transform duration-200 ${isRemindersOpen ? 'rotate-180' : ''}`} />
                      </button>

                      <div className={`grid transition-all duration-200 ease-out ${isRemindersOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                        <div className="overflow-hidden">
                          <div className="ml-1 space-y-0.5 pt-0.5">
                            {remindersLoading ? (
                              <div className="pl-3 py-2 text-[0.75rem] text-[#9ca3af]">Loading…</div>
                            ) : visibleReminders.length === 0 ? (
                              <div className="pl-3 py-2 text-[0.75rem] text-[#9ca3af]">No reminders</div>
                            ) : (
                              <>
                                {visibleReminders.slice(0, 3).map((r) => (
                                  <div
                                    key={r.id}
                                    className="flex items-center gap-1 pl-2 pr-1 py-1.5 hover:bg-[#f9f9fb] group"
                                  >
                                    <CornerDownRight className="h-3 w-3 shrink-0 text-[#d1d5db] mr-0.5" />
                                    <a href={r.ctaUrl ?? '#'} className="flex-1 min-w-0 flex items-center gap-1.5">
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Clock
                                            className="h-3 w-3 shrink-0"
                                            style={{ color: reminderLabelColor(r.labelStyle) }}
                                          />
                                        </TooltipTrigger>
                                        <TooltipContent side="right" className="text-xs">
                                          {r.label}
                                        </TooltipContent>
                                      </Tooltip>
                                      <span className="text-[0.8125rem] font-medium text-[#45474c] truncate">{r.entityName}</span>
                                    </a>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          onClick={() => handleReminderDone(r.id)}
                                          className="shrink-0 h-5 w-5 flex items-center justify-center rounded border border-[#e5e7eb] bg-white text-[#45474c]/40 hover:text-emerald-600 hover:border-emerald-300 transition-colors"
                                        >
                                          <CheckCircle2 className="h-3 w-3" />
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent side="right" className="text-xs">Mark as done</TooltipContent>
                                    </Tooltip>
                                  </div>
                                ))}
                                <Link
                                  href="/d/u/reminders"
                                  className="block pl-7 py-1.5 text-[0.75rem] text-primary hover:text-primary/80 font-medium"
                                >
                                  {visibleReminders.length > 3
                                    ? `View all (${visibleReminders.length}) →`
                                    : 'View all →'}
                                </Link>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          href="/d/u/reminders"
                          className="relative flex items-center d-sidebar-nav transition-colors px-0 justify-center py-2 text-[#45474c] hover:bg-[#f9f9fb] hover:text-[#1b1b1d]"
                        >
                          <Bell
                            className="h-4 w-4 mx-auto"
                            style={{ color: remindersUrgentCount > 0 ? '#C4572B' : undefined }}
                          />
                          {visibleReminders.length > 0 && (
                            <span
                              className="absolute top-0.5 right-1 min-w-[14px] h-3.5 px-0.5 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none"
                              style={{ background: '#C4572B' }}
                            >
                              {visibleReminders.length}
                            </span>
                          )}
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">Reminders</TooltipContent>
                    </Tooltip>
                  )}

                  <SeparatorLine />

                  {/* BOOKMARKS — expanded: inline accordion; collapsed: icon navigates */}
                  {!isCollapsed ? (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setIsBookmarksOpen((v) => !v)}
                        className={`d-sidebar-section w-full flex items-center px-3 ${spaceTitle} hover:opacity-80 transition-opacity`}
                      >
                        <Bookmark className="h-3 w-3 mr-1.5 shrink-0 text-[#45474c]" />
                        <span className="flex-1 text-left">Bookmarks</span>
                        {bookmarks.length > 0 && (
                          <span className="mr-1.5 min-w-[14px] h-3.5 px-1 text-white text-[8px] font-bold rounded-full flex items-center justify-center leading-none bg-primary">
                            {bookmarks.length}
                          </span>
                        )}
                        <ChevronDown className={`h-3 w-3 shrink-0 text-[#9ca3af] transition-transform duration-200 ${isBookmarksOpen ? 'rotate-180' : ''}`} />
                      </button>

                      <div className={`grid transition-all duration-200 ease-out ${isBookmarksOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                        <div className="overflow-hidden">
                          <div className="ml-1 space-y-0.5 pt-0.5">
                            {bookmarksLoading ? (
                              <div className="pl-3 py-2 text-[0.75rem] text-[#9ca3af]">Loading…</div>
                            ) : bookmarks.length === 0 ? (
                              <div className="pl-3 py-2 text-[0.75rem] text-[#9ca3af]">No bookmarks</div>
                            ) : (
                              <>
                                {bookmarks.slice(0, 3).map((b) => {
                                  const href = b.url ?? '#'
                                  const label = b.label ?? 'Untitled'
                                  return (
                                    <a
                                      key={b.id}
                                      href={href}
                                      className="flex items-center gap-1 pl-2 pr-1 py-1.5 hover:bg-[#f9f9fb] group"
                                    >
                                      <CornerDownRight className="h-3 w-3 shrink-0 text-[#d1d5db] mr-0.5" />
                                      <Bookmark className="h-3 w-3 shrink-0 text-[#45474c]" />
                                      <span className="flex-1 min-w-0 text-[0.8125rem] font-medium text-[#45474c] truncate ml-1.5">{label}</span>
                                    </a>
                                  )
                                })}
                                {bookmarks.length > 3 && (
                                  <Link
                                    href="/d/u/bookmarks"
                                    className="block pl-7 py-1.5 text-[0.75rem] text-primary hover:text-primary/80 font-medium"
                                  >
                                    {`Show more (${bookmarks.length}) →`}
                                  </Link>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          href="/d/u/bookmarks"
                          className="relative flex items-center d-sidebar-nav transition-colors px-0 justify-center py-2 text-[#45474c] hover:bg-[#f9f9fb] hover:text-[#1b1b1d]"
                        >
                          <Bookmark className="h-4 w-4 mx-auto" />
                          {bookmarks.length > 0 && (
                            <span className="absolute top-0.5 right-1 min-w-[14px] h-3.5 px-0.5 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none bg-primary">
                              {bookmarks.length}
                            </span>
                          )}
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">Bookmarks</TooltipContent>
                    </Tooltip>
                  )}

                  <SeparatorLine />

                  {/* RESOURCES */}
                  <div className={isCollapsed ? 'w-full flex items-center gap-0.5' : 'pt-2'}>
                    {!isCollapsed && (
                      <>
                        <h3 className={`d-sidebar-section flex items-center px-3 ${spaceTitle}`}>
                          <BookOpen className="h-3 w-3 shrink-0 mr-1.5 text-[#45474c]" />
                          Resources
                        </h3>
                        <div className="ml-1 space-y-0.5">
                          <Link
                            href="/resources/faq"
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center transition-colors pl-2 pr-2 py-1.5 text-[0.8125rem] ${pathname?.startsWith('/resources/faq') ? 'bg-primary/10 border-l-2 border-brand-accent text-primary font-semibold' : 'text-[#45474c] font-medium hover:bg-[#f9f9fb] hover:text-[#1b1b1d]'}`}
                          >
                            <CornerDownRight className="h-3 w-3 shrink-0 text-[#d1d5db] mr-1.5" />
                            <HelpCircle className={`h-3.5 w-3.5 mr-2 shrink-0 ${pathname?.startsWith('/resources/faq') ? 'text-primary' : 'text-[#45474c]'}`} />
                            <span className="flex-1">FAQs</span>
                            <ArrowUpRight className="h-3 w-3 shrink-0 text-[#45474c]/40" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => setIsWhatsNewOpen(true)}
                            className="relative flex items-center w-full transition-colors pl-2 pr-2 py-1.5 text-[0.8125rem] text-[#45474c] font-medium hover:bg-[#f9f9fb] hover:text-[#1b1b1d]"
                          >
                            <CornerDownRight className="h-3 w-3 shrink-0 text-[#d1d5db] mr-1.5" />
                            <Megaphone className="h-3.5 w-3.5 mr-2 shrink-0 text-[#45474c]" />
                            <span className="flex-1 text-left">What&apos;s New</span>
                            {hasUnread && (
                              <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                            )}
                          </button>
                        </div>
                      </>
                    )}
                    {isCollapsed && (
                      <>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link
                              href="/resources/faq"
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`flex-1 flex items-center d-sidebar-nav transition-colors px-0 justify-center py-2 ${pathname?.startsWith('/resources/faq') ? 'text-primary' : 'text-[#45474c] hover:bg-[#f9f9fb] hover:text-[#1b1b1d]'}`}
                            >
                              <HelpCircle className="h-4 w-4 mx-auto" />
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent side="right">FAQs</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => setIsWhatsNewOpen(true)}
                              className="relative flex-1 flex items-center d-sidebar-nav transition-colors px-0 justify-center py-2 text-[#45474c] hover:bg-[#f9f9fb] hover:text-[#1b1b1d]"
                            >
                              <Megaphone className="h-4 w-4 mx-auto" />
                              {hasUnread && (
                                <span className="absolute top-1.5 right-1 w-2 h-2 rounded-full bg-blue-500" />
                              )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="right">What&apos;s New</TooltipContent>
                        </Tooltip>
                      </>
                    )}
                  </div>

                  {!isCollapsed && <SeparatorLine />}

                  {/* VIEW AS */}
                  {canShowViewAsDropdown && !isCollapsed && (
                    <div className="pt-2 pb-2">
                      <h3 className={`d-sidebar-section flex w-full items-center px-3 ${spaceTitle}`}>
                        <Eye className="h-3 w-3 shrink-0 mr-1.5 text-[#45474c]" />
                        <span className="flex-1">Viewing As</span>
                        <span title="Internal only" className="flex items-center"><Lock className="w-2.5 h-2.5 text-[#45474c]/40 shrink-0" /></span>
                      </h3>
                      <div className="ml-1 space-y-0.5">
                        <Select
                          value={resolveViewAsSelectSlug(
                            viewAsPersonaSlug,
                            (user?.app_metadata as any)?.active_persona,
                            role,
                          )}
                          onValueChange={(newSlug) => {
                            const naturalSlug = resolveViewAsSelectSlug(
                              null,
                              (user?.app_metadata as any)?.active_persona,
                              role,
                            )
                            setViewAsPersonaSlug(newSlug === naturalSlug ? null : newSlug)
                            window.location.reload()
                          }}
                          open={viewAsSelectOpen}
                          onOpenChange={setViewAsSelectOpen}
                        >
                          <SelectTrigger
                            className={`flex h-auto w-full items-center gap-0 rounded border-0 bg-transparent px-0 pr-2 py-1.5 !text-[0.8125rem] text-[#45474c] font-medium shadow-none transition-colors hover:bg-[#f9f9fb] hover:text-[#1b1b1d] focus:ring-0 [&>svg:last-child]:ml-auto [&>svg:last-child]:h-3 [&>svg:last-child]:w-3 [&>svg:last-child]:shrink-0 [&>svg:last-child]:text-[#45474c] [&>svg:last-child]:transition-transform [&>svg:last-child]:duration-200 ${viewAsSelectOpen ? '[&>svg:last-child]:rotate-180' : ''}`}
                          >
                            <CornerDownRight className="h-3 w-3 shrink-0 text-[#d1d5db] mr-1.5 ml-2" />
                            <Eye className="h-3.5 w-3.5 mr-2 shrink-0 text-[#45474c]" />
                            <SelectValue placeholder="View as..." />
                          </SelectTrigger>
                          <SelectContent
                            className="rounded-[2px] border border-[#e5e7eb] bg-white shadow-md py-0.5 min-w-[var(--radix-select-trigger-width)] max-h-[var(--radix-select-content-available-height)]"
                            data-view-as-select
                          >
                            {personas.map((p) => (
                              <SelectItem
                                key={p.slug}
                                value={p.slug}
                                className="cursor-pointer rounded-none py-1 px-2.5 !text-[0.8125rem] text-[#45474c] outline-none focus:bg-[#f9f9fb] data-[state=checked]:bg-primary/10 data-[state=checked]:border-l-2 data-[state=checked]:border-brand-accent data-[state=checked]:text-primary data-[state=checked]:font-semibold data-[highlighted]:bg-[#f9f9fb]"
                                endAdornment={p.description ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Info className="h-3 w-3 text-[#9ca3af] hover:text-[#45474c]" aria-hidden />
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="max-w-[220px] text-xs leading-snug">
                                      {p.description}
                                    </TooltipContent>
                                  </Tooltip>
                                ) : undefined}
                              >
                                {p.displayName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                </nav>
              </div>
            </div>

            <WhatsNewModal
              isOpen={isWhatsNewOpen}
              onClose={() => setIsWhatsNewOpen(false)}
              onRead={markAsRead}
              releases={releasesMetaData}
            />

            {/* Profile — pinned to bottom */}
            <div className="border-t border-[#e5e7eb]/50">
              <ProfileSection
                user={user}
                signOut={signOut}
                isCollapsed={isCollapsed}
                showBillingLink={canManageOrg}
                billingHref={buildBillingPageHref({ firmSlug: billingFirmSlug, pathname })}
                isSystemAdmin={isSystemAdmin}
                {...(firms.length > 0 && billingFirmId
                  ? { planSubtitle: profilePlanSubtitle, planSubtitleLoading: billingPlanLoading }
                  : {})}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
