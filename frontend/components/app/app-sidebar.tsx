"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { useSidebar } from "@/lib/sidebar-context"
import { Button } from "@/components/ui/button"
import {
  Settings,
  User,
  Users,
  ChevronDown,
  Menu,
  ChevronLeft,
  LayoutDashboard,
  BookOpen,
  Briefcase,
  ChevronRight,
  MoreHorizontal,
  Folder,
  Share2,
  BarChart3,
  Eye,
  Check,
  Shield,
  ClipboardList,
  MessageCircle,
} from "lucide-react"
import { FirmSelector, type FirmOption } from "@/components/projects/firm-selector"
import { getUserFirms } from "@/lib/actions/firms"
import { getFirmRole } from "@/lib/actions/firm"
import { ROLES } from "@/lib/roles"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
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
import { StorageWidget } from "@/components/ui/storage-widget"
import { useSidebarFirms } from "@/lib/sidebar-firms-context"

interface AppSidebarProps {
  /** When "inline", sidebar fills its container (no fixed positioning). Used in 3-pane card layout. */
  variant?: 'fixed' | 'inline'
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

export function AppSidebar({ variant = 'fixed' }: AppSidebarProps = {}) {
  const { user, signOut } = useAuth()
  const { isCollapsed, toggleSidebar } = useSidebar()
  const { viewAsPersonaSlug, setViewAsPersonaSlug, effectivePermissions, isViewAsActive, personas } = useViewAs()
  const pathname = usePathname()
  const router = useRouter()
  const initialFirms = useSidebarFirms()
  const [viewAsSelectOpen, setViewAsSelectOpen] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  // Initial loading should only be true if we don't have initialFirms and need to fetch them
  const [isLoading, setIsLoading] = useState(!initialFirms || initialFirms.length === 0)


  // Firm selector state
  const [firms, setFirms] = useState<FirmOption[]>(initialFirms as FirmOption[] || [])
  const [selectedFirmSlug, setSelectedFirmSlug] = useState<string>('')

  // Permissions State
  const [orgPermissions, setOrgPermissions] = useState<{
    canView: boolean
    canEdit: boolean
    canManage: boolean
    canManageClients: boolean
    canEditClients: boolean
    canViewClients: boolean
    isOrgOwner?: boolean
  } | null>(null)

  // View As: show dropdown based on persona (can use RBAC admin), not page location
  const [canUseViewAs, setCanUseViewAs] = useState(false)

  // "More" Section Collapse State
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  // Projects Collapse State
  const [isProjectsOpen, setIsProjectsOpen] = useState(true)
  // Project tab visibility (Comments, Members, Shares, Insights, Settings) when in an engagement
  const [projectTabPermissions, setProjectTabPermissions] = useState<{
    canViewInternalTabs: boolean
    canViewSettings: boolean
    canViewAudit?: boolean
  } | null>(null)

  const [billingPlanState, setBillingPlanState] = useState<BillingCurrentPlanState | null>(null)
  const [billingPlanLoading, setBillingPlanLoading] = useState(false)

  // Extract firm slug (from /d/f/[slug])
  const getSlug = () => {
    const match = pathname.match(/\/(?:d\/)?f\/([^\/]+)/)
    return match ? match[1] : null
  }
  const slug = getSlug()

  // Extract client slug from URL
  const getClientSlug = () => {
    const match = pathname.match(/\/c\/([^\/]+)/)
    return match ? match[1] : null
  }
  const clientSlug = getClientSlug()

  // Extract engagement/project slug
  const getProjectSlug = () => {
    const match = pathname.match(/\/(?:e|p)\/([^\/]+)/)
    return match ? match[1] : null
  }
  const projectSlug = getProjectSlug()

  const baseUrl = slug ? `/d/f/${slug}` : '/d'
  /** Firm-scoped routes (connectors, insights) only exist under /d/f/[slug]/… — not under bare /d/… */
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

  // Fetch Data (Firms — always fetch fresh so dropdown has complete list for switching)
  const fetchData = async () => {
    const hasCachedData = firms.length > 0 && (slug ? firms.some(o => o.slug === slug) : true)
    if (!hasCachedData) {
      setIsLoading(true)
    }

    try {
      // Always fetch fresh firm list so Custom/Sandbox/Import firms all appear in dropdown after switching
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
            } catch (error) {
              console.error("Failed to fetch firm permissions", error)
            }
          }
        }
      } else if (orgs.length > 0) {
        const defaultOrg = orgs.find(org => org.isDefault) || orgs[0]
        const selectedSlug = defaultOrg?.slug || orgs[0].slug
        setSelectedFirmSlug(selectedSlug)
        // Fetch permissions for default firm on /d so Settings, View As, Add Client etc. show correctly
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
            } catch (error) {
              console.error("Failed to fetch firm permissions", error)
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch sidebar data", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()

    const handleRefresh = () => fetchData()
    window.addEventListener('pockett:refresh-firms', handleRefresh)

    return () => {
      window.removeEventListener('pockett:refresh-firms', handleRefresh)
    }
  }, [slug])

  // Fetch project tab permissions when in project context (for sidebar sub-menu visibility)
  useEffect(() => {
    if (!slug || !clientSlug || !projectSlug) {
      setProjectTabPermissions(null)
      return
    }
    const url = `/api/permissions/project-tabs?orgSlug=${encodeURIComponent(slug)}&clientSlug=${encodeURIComponent(clientSlug)}&projectSlug=${encodeURIComponent(projectSlug)}`
    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (
          data &&
          typeof data.canViewInternalTabs === 'boolean' &&
          typeof data.canViewSettings === 'boolean'
        ) {
          setProjectTabPermissions({
            canViewInternalTabs: data.canViewInternalTabs,
            canViewSettings: data.canViewSettings,
            canViewAudit: typeof data.canViewAudit === 'boolean' ? data.canViewAudit : undefined,
          })
        } else {
          setProjectTabPermissions(null)
        }
      })
      .catch(() => setProjectTabPermissions(null))
  }, [slug, clientSlug, projectSlug])

  // Determine active firm from URL or default
  useEffect(() => {
    if (slug) {
      setSelectedFirmSlug(slug)
    } else if (firms.length > 0) {
      // If no slug in URL, select the default firm (isDefault: true)
      // or fallback to the first one if no default is set
      const defaultOrg = firms.find(org => org.isDefault)
      setSelectedFirmSlug(defaultOrg?.slug || firms[0].slug)
    }
  }, [pathname, slug, firms])

  // Fetch "can use View As" (persona-based) so dropdown is shown on /d/ and legacy /o/ dashboard routes
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

  // --- RBAC HELPER ---
  // When "View As" is active, use effective permissions for nav visibility; otherwise use real firm permissions.
  const effective = isViewAsActive ? effectivePermissions : null
  const canManageOrg = effective ? effective.canManage : (orgPermissions?.canManage ?? false)
  const canEditOrg = effective ? effective.canEdit : (orgPermissions?.canEdit ?? false)
  const canViewOrg = effective ? effective.canView : (orgPermissions?.canView ?? true)
  const canManageClients = effective ? effective.canManageClients : (orgPermissions?.canManageClients ?? false)
  const canEditClients = effective ? effective.canEditClients : (orgPermissions?.canEditClients ?? false)
  const canViewClients = effective ? effective.canViewClients : (orgPermissions?.canViewClients ?? false)
  // Keep left sub-menu aligned with middle-pane tabs even if project tab API lags/stales.
  const canShowProjectInternalTabs = Boolean(projectTabPermissions?.canViewInternalTabs || canManageOrg || canEditOrg || canViewOrg)
  const canShowProjectAuditTab = Boolean(projectTabPermissions?.canViewAudit || canManageOrg)
  const canShowProjectSettingsTab = Boolean(projectTabPermissions?.canViewSettings || canManageOrg)

  // Fallback to role-based checks if permissions not loaded yet (backward compatibility)
  const isOwner = role === ROLES.ORG_OWNER
  const isMember = role === ROLES.ORG_MEMBER

  // View As dropdown: show when user has RBAC admin (real role), regardless of currently assumed persona
  const canShowViewAsDropdown = canUseViewAs

  // Rules - use permission checks when available, fallback to role checks
  const showFirmWorkspace = canViewOrg || isOwner || isMember || firms.length > 0
  const showDashboard = true
  const showResources = true
  const showSettings = canManageOrg || isOwner
  const showMore = canViewOrg || isOwner || isMember
  const isSystemAdmin = (user?.app_metadata?.role as string) === 'SYS_ADMIN'
  const showSystemSection = isSystemAdmin

  const billingFirmSlug =
    slug ||
    selectedFirmSlug ||
    firms.find((o) => o.isDefault)?.slug ||
    firms[0]?.slug ||
    null

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
      .then((s) => {
        if (!cancelled) {
          setBillingPlanState(s)
          setBillingPlanLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBillingPlanState(null)
          setBillingPlanLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
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
    return planNameForSummary(billingPlanState)
  }, [billingPlanState, billingSandboxOnly])

  // One spacing rule: compact for laptop view (avoid vertical scroll). Title-to-content within each section.
  const spaceTitle = 'mb-2'
  const SeparatorLine = () => <div className="-mx-3 border-b border-slate-100 my-4" aria-hidden />

  const isInline = variant === 'inline'
  const outerClass = isInline
    ? 'h-full w-full flex flex-col bg-white overflow-visible rounded-2xl'
    : `fixed inset-y-0 left-0 z-40 bg-white border-r border-stone-200 transition-all duration-300 pt-16 overflow-x-hidden rounded-2xl ${isCollapsed ? 'w-16' : 'w-64'}`

  return (
    <div className={outerClass}>
      {isLoading ? (
        <div className="flex flex-col h-full px-3 pt-6 gap-4">
          {!isCollapsed && (
            <>
              <Skeleton className="h-10 w-full rounded-lg" />
              <div className="mx-3 border-b border-slate-100 mb-2" />
              <Skeleton className="h-3 w-20" />
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-9 w-full rounded-lg" />
              ))}
            </>
          )}
          {isCollapsed && (
            <div className="flex flex-col items-center gap-3 pt-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-8 w-8 rounded-lg" />
              ))}
            </div>
          )}
        </div>
      ) : (
      <>
      {/* Sidebar Content */}
      <div className="flex flex-col h-full">
        {/* Workspace Selector at the very top (prominent) */}
        {!isCollapsed && (slug || firms.length > 0) && (
          <div className="shrink-0 border-b border-slate-100 bg-slate-50/30 px-3 pt-3 pb-0">
            <FirmSelector
              firms={firms}
              selectedFirmSlug={selectedFirmSlug}
              onFirmChange={(firmSlug) => {
                setSelectedFirmSlug(firmSlug)
                router.push(`/d/f/${firmSlug}`)
              }}
            />
          </div>
        )}

        <button
          type="button"
          onClick={toggleSidebar}
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-[500] w-6 h-6 rounded-full bg-black text-white hover:bg-black/90 flex items-center justify-center shadow-md border-0"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Scrollable: view as, nav — space-y-6 between sections */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar px-3 space-y-4 pt-3 pb-3">
            <div className="space-y-4">

              {canShowViewAsDropdown && !isCollapsed && (
                <>
                  <div className="pt-1">
                    <label className={`d-section ${spaceTitle} block px-1`}>View as</label>
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
                        className={`flex h-10 w-full items-center gap-2 rounded-lg border border-stone-200 bg-stone-100/80 px-3 text-stone-900 shadow-none transition-colors hover:bg-stone-200/80 focus:ring-2 focus:ring-200 [&>svg]:ml-0 [&>svg:last-child]:transition-transform [&>svg:last-child]:duration-200 ${viewAsSelectOpen ? '[&>svg:last-child]:rotate-180' : ''}`}
                      >
                        <Eye className="h-4 w-4 shrink-0 text-stone-500" />
                        <SelectValue placeholder="View as..." />
                      </SelectTrigger>
                      <SelectContent
                        className="rounded-xl border border-slate-100 bg-white shadow-md py-2 min-w-[var(--radix-select-trigger-width)] max-h-[var(--radix-select-content-available-height)]"
                        data-view-as-select
                      >
                        {personas.map((p) => (
                          <SelectItem
                            key={p.slug}
                            value={p.slug}
                            className="cursor-pointer rounded-lg py-2.5 px-3 text-sm text-slate-700"
                          >
                            {p.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <SeparatorLine />
                </>
              )}

            </div>

            <nav className="space-y-1">

              {/* DASHBOARD */}
              {showDashboard && (
                <>
                  <div className={isCollapsed ? 'w-full' : ''}>

                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link
                              href={clientSlug ? `${baseUrl}/c/${clientSlug}` : baseUrl}
                              className={`flex-1 flex items-center d-sidebar-nav rounded-lg transition-colors ${isCollapsed ? 'px-0 justify-center' : 'px-3'} py-2 ${(pathname.includes('/c/') || pathname.endsWith('/c')) && !projectSlug
                                ? 'bg-slate-100 text-slate-900 hover:bg-slate-100/90'
                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                }`}
                            >
                              <Briefcase className={`h-4 w-4 ${isCollapsed ? 'mx-auto' : 'mr-3'} ${(pathname.includes('/c/') || pathname.endsWith('/c')) && !projectSlug ? 'text-slate-900' : 'text-slate-500'}`} />
                              {!isCollapsed && <span>Engagements</span>}
                            </Link>
                          </TooltipTrigger>
                          {isCollapsed && <TooltipContent side="right">Engagements</TooltipContent>}
                        </Tooltip>

                        {!isCollapsed && projectSlug && (
                          <button
                            onClick={() => setIsProjectsOpen(!isProjectsOpen)}
                            className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isProjectsOpen ? 'rotate-180' : ''}`} />
                          </button>
                        )}
                      </div>

                      {/* Project sub-menus - tree-like hierarchy with connector line */}
                      {!isCollapsed && projectSlug && isProjectsOpen && (
                        <div className="flex flex-col gap-0.5 mt-0.5 mb-2 pl-3 ml-2 border-l-2 border-slate-200 animate-in slide-in-from-top-1 fade-in duration-200">
                          <Link
                            href={`${baseUrl}/c/${clientSlug}/e/${projectSlug}/files`}
                            className={`flex items-center d-sidebar-nav rounded-lg py-1.5 px-2.5 transition-colors ${pathname.includes(projectSlug) && (pathname.endsWith('/files') || pathname.match(/\/(?:e|p)\/[^/]+\/files(\/|$)/))
                              ? 'bg-slate-100 text-slate-900 hover:bg-slate-100/90'
                              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
                          >
                            <Folder className={`h-3.5 w-3.5 mr-2.5 ${pathname.includes(projectSlug) && (pathname.endsWith('/files') || pathname.match(/\/(?:e|p)\/[^/]+\/files(\/|$)/)) ? 'text-slate-900' : 'text-slate-400'}`} />
                            Files
                          </Link>
                          <Link
                            href={`${baseUrl}/c/${clientSlug}/e/${projectSlug}/shares`}
                            className={`flex items-center d-sidebar-nav rounded-lg py-1.5 px-2.5 transition-colors ${pathname.includes('/shares')
                              ? 'bg-slate-100 text-slate-900 hover:bg-slate-100/90'
                              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
                          >
                            <Share2 className={`h-3.5 w-3.5 mr-2.5 ${pathname.includes('/shares') ? 'text-slate-900' : 'text-slate-400'}`} />
                            Shares
                          </Link>

                          {canShowProjectInternalTabs && (
                            <Link
                              href={`${baseUrl}/c/${clientSlug}/e/${projectSlug}/comments`}
                              className={`flex items-center d-sidebar-nav rounded-lg py-1.5 px-2.5 transition-colors ${pathname.includes('/comments')
                                ? 'bg-slate-100 text-slate-900 hover:bg-slate-100/90'
                                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
                            >
                              <MessageCircle className={`h-3.5 w-3.5 mr-2.5 ${pathname.includes('/comments') ? 'text-slate-900' : 'text-slate-400'}`} />
                              Comments
                            </Link>
                          )}

                          {canShowProjectInternalTabs && (
                            <>
                              <Link
                                href={`${baseUrl}/c/${clientSlug}/e/${projectSlug}/members`}
                                className={`flex items-center d-sidebar-nav rounded-lg py-1.5 px-2.5 transition-colors ${pathname.includes('/members')
                                  ? 'bg-slate-100 text-slate-900 hover:bg-slate-100/90'
                                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
                              >
                                <Users className={`h-3.5 w-3.5 mr-2.5 ${pathname.includes('/members') ? 'text-slate-900' : 'text-slate-400'}`} />
                                Members
                              </Link>
                              <Link
                                href={`${baseUrl}/c/${clientSlug}/e/${projectSlug}/insights`}
                                className={`flex items-center d-sidebar-nav rounded-lg py-1.5 px-2.5 transition-colors ${pathname.includes('/insights')
                                  ? 'bg-slate-100 text-slate-900 hover:bg-slate-100/90'
                                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
                              >
                                <BarChart3 className={`h-3.5 w-3.5 mr-2.5 ${pathname.includes('/insights') ? 'text-slate-900' : 'text-slate-400'}`} />
                                Insights
                              </Link>
                            </>
                          )}

                          {canShowProjectAuditTab && (
                            <Link
                              href={`${baseUrl}/c/${clientSlug}/e/${projectSlug}/audit`}
                              className={`flex items-center d-sidebar-nav rounded-lg py-1.5 px-2.5 transition-colors ${pathname.includes('/audit')
                                ? 'bg-slate-100 text-slate-900 hover:bg-slate-100/90'
                                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
                            >
                              <ClipboardList className={`h-3.5 w-3.5 mr-2.5 ${pathname.includes('/audit') ? 'text-slate-900' : 'text-slate-400'}`} />
                              Audit
                            </Link>
                          )}

                          {canShowProjectSettingsTab && (
                            <Link
                              href={`${baseUrl}/c/${clientSlug}/e/${projectSlug}/settings`}
                              className={`flex items-center d-sidebar-nav rounded-lg py-1.5 px-2.5 transition-colors ${pathname.includes('/settings')
                                ? 'bg-slate-100 text-slate-900 hover:bg-slate-100/90'
                                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
                            >
                              <Settings className={`h-3.5 w-3.5 mr-2.5 ${pathname.includes('/settings') ? 'text-slate-900' : 'text-slate-400'}`} />
                              Settings
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {!isCollapsed && <SeparatorLine />}
                </>
              )}

              {/* RESOURCES */}
              {showResources && (
                <>
                  <div className={isCollapsed ? 'w-full flex items-center gap-0.5' : 'pt-2'}>
                    {!isCollapsed && <h3 className={`d-sidebar-section px-3 ${spaceTitle}`}>Resources</h3>}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          href="/resources/docs"
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center d-sidebar-nav rounded-lg transition-colors ${isCollapsed ? 'flex-1 px-0 justify-center' : 'px-3'} py-2 ${pathname?.startsWith('/resources/docs') ? 'bg-slate-100 text-slate-900 hover:bg-slate-100/90' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                        >
                          <BookOpen className={`h-4 w-4 shrink-0 ${isCollapsed ? 'mx-auto' : 'mr-3'} ${pathname?.startsWith('/resources/docs') ? 'text-slate-900' : 'text-slate-500'}`} />
                          {!isCollapsed && <span>User Guide</span>}
                        </Link>
                      </TooltipTrigger>
                      {isCollapsed && <TooltipContent side="right">User Guide</TooltipContent>}
                    </Tooltip>
                  </div>
                  {!isCollapsed && <SeparatorLine />}
                </>
              )}

              {/* OTHERS (Connectors) */}
              {showSettings && (
                <>
                  <div className={isCollapsed ? 'w-full flex items-center gap-0.5' : 'pt-2'}>
                    {!isCollapsed && <h3 className={`d-sidebar-section px-3 ${spaceTitle}`}>Others</h3>}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          href={`${firmScopedNavBase}/connectors`}
                          className={`flex items-center d-sidebar-nav rounded-lg transition-colors ${isCollapsed ? 'flex-1 px-0 justify-center' : 'px-3'} py-2 ${pathname.includes('/connectors')
                            ? 'bg-slate-100 text-slate-900 hover:bg-slate-100/90'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                            }`}
                        >
                          <Settings className={`h-4 w-4 ${isCollapsed ? 'mx-auto' : 'mr-3'} ${pathname.includes('/connectors') ? 'text-slate-900' : 'text-slate-500'}`} />
                          {!isCollapsed && <span>Connectors</span>}
                        </Link>
                      </TooltipTrigger>
                      {isCollapsed && <TooltipContent side="right">Connectors</TooltipContent>}
                    </Tooltip>
                  </div>
                  {!isCollapsed && <SeparatorLine />}
                </>
              )}

              {/* MORE */}
              {showMore && (
                <>
                  <div className={isCollapsed ? 'w-full' : ''}>
                    {!isCollapsed ? (
                      <div>
                        <button
                          onClick={() => setIsMoreOpen(!isMoreOpen)}
                          className="d-sidebar-section flex items-center w-full px-3 py-1.5 hover:text-slate-600 transition-colors rounded-lg"
                        >
                          <span>More</span>
                          <ChevronRight className={`h-3 w-3 ml-1 transition-transform duration-200 ${isMoreOpen ? 'rotate-90' : ''}`} />
                        </button>

                        {isMoreOpen && (
                          <div className="mt-0.5 animate-in fade-in slide-in-from-top-1 duration-200">
                            <Link
                              href={`${firmScopedNavBase}/insights`}
                              className={`flex items-center d-sidebar-nav rounded-lg transition-colors px-3 py-2 ${pathname.includes('/insights')
                                ? 'bg-slate-100 text-slate-900 hover:bg-slate-100/90'
                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                }`}
                            >
                              <LayoutDashboard className={`h-4 w-4 mr-3 ${pathname.includes('/insights') ? 'text-slate-900' : 'text-slate-500'}`} />
                              <span>Insights</span>
                            </Link>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex w-full items-center gap-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link
                              href={`${firmScopedNavBase}/insights`}
                              className={`flex flex-1 items-center justify-center d-sidebar-nav rounded-lg transition-colors px-0 py-2 ${pathname.includes('/insights')
                                ? 'bg-slate-100 text-slate-900 hover:bg-slate-100/90'
                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                }`}
                            >
                              <LayoutDashboard className={`h-4 w-4 ${pathname.includes('/insights') ? 'text-slate-900' : 'text-slate-500'}`} />
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent side="right">Insights</TooltipContent>
                        </Tooltip>
                      </div>
                    )}
                  </div>
                  {!isCollapsed && <SeparatorLine />}
                </>
              )}

              {/* SYSTEM - Administration (SYS_ADMIN only) */}
              {showSystemSection && (
                <>
                  <div className={isCollapsed ? 'w-full flex items-center gap-0.5' : 'pt-2'}>
                    {!isCollapsed && <h3 className={`d-sidebar-section px-3 ${spaceTitle}`}>System</h3>}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          href="/system"
                          className={`flex items-center d-sidebar-nav rounded-lg transition-colors ${isCollapsed ? 'flex-1 px-0 justify-center' : 'px-3'} py-2 ${pathname.startsWith('/system')
                            ? 'bg-slate-100 text-slate-900 hover:bg-slate-100/90'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                            }`}
                        >
                          <Shield className={`h-4 w-4 shrink-0 ${isCollapsed ? 'mx-auto' : 'mr-3'} ${pathname.startsWith('/system') ? 'text-slate-900' : 'text-slate-500'}`} />
                          {!isCollapsed && <span>Administration</span>}
                        </Link>
                      </TooltipTrigger>
                      {isCollapsed && <TooltipContent side="right">Administration</TooltipContent>}
                    </Tooltip>
                  </div>
                  {!isCollapsed && <SeparatorLine />}
                </>
              )}

            </nav>

            {/* Storage: used vs quota for connected Drive (current org) */}
            {!isCollapsed && (
              <>
                <div className="px-1">
                  <StorageWidget orgSlug={slug ?? selectedFirmSlug} collapsed={isCollapsed} />
                </div>
                <SeparatorLine />
              </>
            )}

          </div>
        </div>
        {/* Profile: fixed to bottom left */}
        <ProfileSection
          user={user}
          signOut={signOut}
          isCollapsed={isCollapsed}
          showBillingLink={canManageOrg}
          billingHref={buildBillingPageHref({ firmSlug: billingFirmSlug, pathname })}
          {...(firms.length > 0 && billingFirmId
            ? { planSubtitle: profilePlanSubtitle, planSubtitleLoading: billingPlanLoading }
            : {})}
        />
      </div>
      </>
      )}
    </div>
  )
}
