"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { useSidebar } from "@/lib/sidebar-context"
import {
  Settings,
  Users,
  ChevronDown,
  Briefcase,
  Folder,
  Share2,
  BarChart3,
  Eye,
  Shield,
  ClipboardList,
  MessageCircle,
  PenTool,
  Lock,
  Info,
  HelpCircle,
  ArrowUpRight,
} from "lucide-react"
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
  // Keep left sub-menu aligned with middle-pane tabs even if project tab API lags/stales.
  const canShowProjectInternalTabs = Boolean(projectTabPermissions?.canViewInternalTabs || canManageOrg || canEditOrg || canViewOrg)
  const canShowProjectAuditTab = Boolean(projectTabPermissions?.canViewAudit || canManageOrg)
  const canShowProjectSettingsTab = Boolean(projectTabPermissions?.canViewSettings || canManageOrg)


  // View As dropdown: show when user has RBAC admin (real role), regardless of currently assumed persona
  const canShowViewAsDropdown = canUseViewAs

  // Rules - use permission checks when available, fallback to role checks
  const showDashboard = true
  const showResources = true
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
  const SeparatorLine = () => <div className="-mx-3 border-b border-[#e5e7eb] my-4" aria-hidden />

  const isInline = variant === 'inline'
  const outerClass = isInline
    ? 'h-full w-full flex flex-col bg-white overflow-visible'
    : `fixed inset-y-0 left-0 z-40 bg-white border-r border-[#e5e7eb] transition-all duration-300 pt-16 overflow-x-hidden ${isCollapsed ? 'w-16' : 'w-64'}`

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
      {/* Sidebar Content */}
      <div className="flex flex-col h-full">
        {/* Workspace Selector at the very top (prominent) */}
        {!isCollapsed && (slug || firms.length > 0) && (
          <div className="shrink-0 border-b border-[#e5e7eb] bg-white px-3 pt-3 pb-0">
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
          className="absolute right-0 top-4 translate-x-1/2 z-[500] w-8 h-8 rounded-full bg-white text-[#45474c] hover:bg-[#f3f4f6] flex items-center justify-center shadow-sm border border-[#e5e7eb] cursor-pointer"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            /* menu / hamburger — sidebar is closed, click to open */
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M3 18h18v-2H3zm0-5h18v-2H3zm0-7v2h18V6z"/>
            </svg>
          ) : (
            /* menu_open — sidebar is open, click to close */
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M3 18h13v-2H3zm0-5h10v-2H3zm0-7v2h13V6zm18 9.59L17.42 12 21 8.41 19.59 7l-5 5 5 5z"/>
            </svg>
          )}
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
                        className={`flex h-9 w-full items-center gap-2 rounded-[2px] border border-[#e5e7eb] bg-white px-3 text-[0.8125rem] text-[#1b1b1d] shadow-none transition-colors hover:bg-[#f3f4f6] focus:ring-1 focus:ring-[#069668] [&>svg]:ml-0 [&>svg:last-child]:transition-transform [&>svg:last-child]:duration-200 ${viewAsSelectOpen ? '[&>svg:last-child]:rotate-180' : ''}`}
                      >
                        <Eye className="h-4 w-4 shrink-0 text-[#45474c]" />
                        <SelectValue placeholder="View as..." />
                      </SelectTrigger>
                      <SelectContent
                        className="rounded-[2px] border border-[#e5e7eb] bg-white shadow-md py-1 min-w-[var(--radix-select-trigger-width)] max-h-[var(--radix-select-content-available-height)]"
                        data-view-as-select
                      >
                        {personas.map((p) => (
                          <SelectItem
                            key={p.slug}
                            value={p.slug}
                            className="cursor-pointer rounded py-2 px-3 text-[0.8125rem] text-[#45474c] outline-none focus:bg-transparent data-[state=checked]:text-[#069668] data-[state=checked]:font-medium data-[highlighted]:bg-transparent"
                            endAdornment={p.description ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-3.5 w-3.5 text-[#9ca3af] hover:text-[#45474c]" aria-hidden />
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
                              className={`flex-1 flex items-center d-sidebar-nav rounded-r transition-colors ${isCollapsed ? 'px-0 justify-center' : 'px-3'} py-2 ${(pathname.includes('/c/') || pathname.endsWith('/c')) && !projectSlug
                                ? 'bg-[#ecfdf5] border-l-2 border-[#069668] text-[#065f46] font-semibold'
                                : 'text-[#45474c] font-medium hover:bg-[#f9f9fb] hover:text-[#1b1b1d]'
                                }`}
                            >
                              <Briefcase className={`h-4 w-4 ${isCollapsed ? 'mx-auto' : 'mr-3'} ${(pathname.includes('/c/') || pathname.endsWith('/c')) && !projectSlug ? 'text-[#069668]' : 'text-[#45474c]'}`} />
                              {!isCollapsed && <span>Engagements</span>}
                            </Link>
                          </TooltipTrigger>
                          {isCollapsed && <TooltipContent side="right">Engagements</TooltipContent>}
                        </Tooltip>

                        {!isCollapsed && projectSlug && (
                          <button
                            onClick={() => setIsProjectsOpen(!isProjectsOpen)}
                            className="p-1.5 hover:bg-[#f0edee] rounded text-[#45474c] hover:text-[#1b1b1d] transition-colors"
                          >
                            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isProjectsOpen ? 'rotate-180' : ''}`} />
                          </button>
                        )}
                      </div>

                      {/* Project sub-menus - tree-like hierarchy with connector line */}
                      {!isCollapsed && projectSlug && isProjectsOpen && (
                        <div className="flex flex-col gap-0.5 mt-0.5 mb-2 pl-4 ml-3 animate-in slide-in-from-top-1 fade-in duration-200">
                          <Link
                            href={`${baseUrl}/c/${clientSlug}/e/${projectSlug}/files`}
                            className={`flex items-center d-sidebar-nav d-tree-link rounded-r py-1.5 px-2.5 transition-colors ${pathname.includes(projectSlug) && (pathname.endsWith('/files') || pathname.match(/\/(?:e|p)\/[^/]+\/files(\/|$)/))
                              ? 'bg-[#ecfdf5] border-l-2 border-[#069668] text-[#065f46] font-semibold'
                              : 'text-[#45474c] font-medium hover:bg-[#f9f9fb] hover:text-[#1b1b1d]'}`}
                          >
                            <Folder className={`h-3.5 w-3.5 mr-2.5 ${pathname.includes(projectSlug) && (pathname.endsWith('/files') || pathname.match(/\/(?:e|p)\/[^/]+\/files(\/|$)/)) ? 'text-[#069668]' : 'text-[#45474c]'}`} />
                            Files
                          </Link>
                          <Link
                            href={`${baseUrl}/c/${clientSlug}/e/${projectSlug}/shares`}
                            className={`flex items-center d-sidebar-nav d-tree-link rounded-r py-1.5 px-2.5 transition-colors ${pathname.includes('/shares')
                              ? 'bg-[#ecfdf5] border-l-2 border-[#069668] text-[#065f46] font-semibold'
                              : 'text-[#45474c] font-medium hover:bg-[#f9f9fb] hover:text-[#1b1b1d]'}`}
                          >
                            <Share2 className={`h-3.5 w-3.5 mr-2.5 ${pathname.includes('/shares') ? 'text-[#069668]' : 'text-[#45474c]'}`} />
                            Shares
                          </Link>

                          <Link
                            href={`${baseUrl}/c/${clientSlug}/e/${projectSlug}/comments`}
                            className={`flex items-center d-sidebar-nav d-tree-link rounded-r py-1.5 px-2.5 transition-colors ${pathname.includes('/comments')
                              ? 'bg-[#ecfdf5] border-l-2 border-[#069668] text-[#065f46] font-semibold'
                              : 'text-[#45474c] font-medium hover:bg-[#f9f9fb] hover:text-[#1b1b1d]'}`}
                          >
                            <MessageCircle className={`h-3.5 w-3.5 mr-2.5 ${pathname.includes('/comments') ? 'text-[#069668]' : 'text-[#45474c]'}`} />
                            Comments
                          </Link>

                          {canShowProjectInternalTabs && (
                            <Link
                              href={`${baseUrl}/c/${clientSlug}/e/${projectSlug}/wiki`}
                              className={`group flex items-center d-sidebar-nav d-tree-link rounded-r py-1.5 px-2.5 transition-colors ${pathname.includes('/wiki')
                                ? 'bg-[#ecfdf5] border-l-2 border-[#069668] text-[#065f46] font-semibold'
                                : 'text-[#45474c] font-medium hover:bg-[#f9f9fb] hover:text-[#1b1b1d]'}`}
                            >
                              <PenTool className={`h-3.5 w-3.5 mr-2.5 ${pathname.includes('/wiki') ? 'text-[#069668]' : 'text-[#45474c]'}`} />
                              Dossier
                              <span title="Internal only" className="ml-auto shrink-0"><Lock className="w-2.5 h-2.5 text-[#d1d5db] group-hover:text-[#45474c] transition-colors" /></span>
                            </Link>
                          )}

                          {canShowProjectInternalTabs && (
                            <Link
                              href={`${baseUrl}/c/${clientSlug}/e/${projectSlug}/analytics`}
                              className={`group flex items-center d-sidebar-nav d-tree-link rounded-r py-1.5 px-2.5 transition-colors ${pathname.includes('/analytics')
                                ? 'bg-[#ecfdf5] border-l-2 border-[#069668] text-[#065f46] font-semibold'
                                : 'text-[#45474c] font-medium hover:bg-[#f9f9fb] hover:text-[#1b1b1d]'}`}
                            >
                              <BarChart3 className={`h-3.5 w-3.5 mr-2.5 ${pathname.includes('/analytics') ? 'text-[#069668]' : 'text-[#45474c]'}`} />
                              Analytics
                              <span title="Internal only" className="ml-auto shrink-0"><Lock className="w-2.5 h-2.5 text-[#d1d5db] group-hover:text-[#45474c] transition-colors" /></span>
                            </Link>
                          )}

                          {canShowProjectAuditTab && (
                            <Link
                              href={`${baseUrl}/c/${clientSlug}/e/${projectSlug}/audit`}
                              className={`group flex items-center d-sidebar-nav d-tree-link rounded-r py-1.5 px-2.5 transition-colors ${pathname.includes('/audit')
                                ? 'bg-[#ecfdf5] border-l-2 border-[#069668] text-[#065f46] font-semibold'
                                : 'text-[#45474c] font-medium hover:bg-[#f9f9fb] hover:text-[#1b1b1d]'}`}
                            >
                              <ClipboardList className={`h-3.5 w-3.5 mr-2.5 ${pathname.includes('/audit') ? 'text-[#069668]' : 'text-[#45474c]'}`} />
                              Audit
                              <span title="Internal only" className="ml-auto shrink-0"><Lock className="w-2.5 h-2.5 text-[#d1d5db] group-hover:text-[#45474c] transition-colors" /></span>
                            </Link>
                          )}

                          {canShowProjectInternalTabs && (
                            <Link
                              href={`${baseUrl}/c/${clientSlug}/e/${projectSlug}/members`}
                              className={`group flex items-center d-sidebar-nav d-tree-link rounded-r py-1.5 px-2.5 transition-colors ${pathname.includes('/members')
                                ? 'bg-[#ecfdf5] border-l-2 border-[#069668] text-[#065f46] font-semibold'
                                : 'text-[#45474c] font-medium hover:bg-[#f9f9fb] hover:text-[#1b1b1d]'}`}
                            >
                              <Users className={`h-3.5 w-3.5 mr-2.5 ${pathname.includes('/members') ? 'text-[#069668]' : 'text-[#45474c]'}`} />
                              Members
                              <span title="Internal only" className="ml-auto shrink-0"><Lock className="w-2.5 h-2.5 text-[#d1d5db] group-hover:text-[#45474c] transition-colors" /></span>
                            </Link>
                          )}

                          {canShowProjectSettingsTab && (
                            <Link
                              href={`${baseUrl}/c/${clientSlug}/e/${projectSlug}/settings`}
                              className={`group flex items-center d-sidebar-nav d-tree-link rounded-r py-1.5 px-2.5 transition-colors ${pathname.includes('/settings')
                                ? 'bg-[#ecfdf5] border-l-2 border-[#069668] text-[#065f46] font-semibold'
                                : 'text-[#45474c] font-medium hover:bg-[#f9f9fb] hover:text-[#1b1b1d]'}`}
                            >
                              <Settings className={`h-3.5 w-3.5 mr-2.5 ${pathname.includes('/settings') ? 'text-[#069668]' : 'text-[#45474c]'}`} />
                              Settings
                              <span title="Internal only" className="ml-auto shrink-0"><Lock className="w-2.5 h-2.5 text-[#d1d5db] group-hover:text-[#45474c] transition-colors" /></span>
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
                          href="/resources/faq"
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center d-sidebar-nav rounded-r transition-colors ${isCollapsed ? 'flex-1 px-0 justify-center' : 'px-3'} py-2 ${pathname?.startsWith('/resources/faq') ? 'bg-[#ecfdf5] border-l-2 border-[#069668] text-[#065f46] font-semibold' : 'text-[#45474c] font-medium hover:bg-[#f9f9fb] hover:text-[#1b1b1d]'}`}
                        >
                          <HelpCircle className={`h-4 w-4 shrink-0 ${isCollapsed ? 'mx-auto' : 'mr-3'} ${pathname?.startsWith('/resources/faq') ? 'text-[#069668]' : 'text-[#45474c]'}`} />
                          {!isCollapsed && (
                            <>
                              <span className="flex-1">FAQs</span>
                              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[#45474c]/50" />
                            </>
                          )}
                        </Link>
                      </TooltipTrigger>
                      {isCollapsed && <TooltipContent side="right">FAQs</TooltipContent>}
                    </Tooltip>
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
                          className={`flex items-center d-sidebar-nav rounded-r transition-colors ${isCollapsed ? 'flex-1 px-0 justify-center' : 'px-3'} py-2 ${pathname.startsWith('/system')
                            ? 'bg-[#ecfdf5] border-l-2 border-[#069668] text-[#065f46] font-semibold'
                            : 'text-[#45474c] font-medium hover:bg-[#f9f9fb] hover:text-[#1b1b1d]'
                            }`}
                        >
                          <Shield className={`h-4 w-4 shrink-0 ${isCollapsed ? 'mx-auto' : 'mr-3'} ${pathname.startsWith('/system') ? 'text-[#069668]' : 'text-[#45474c]'}`} />
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


          </div>
        </div>
        {/* Profile: fixed to bottom, with border-t separator */}
        <div className="border-t border-[#e5e7eb]/50">
          <ProfileSection
            user={user}
            signOut={signOut}
            isCollapsed={isCollapsed}
            showBillingLink={canManageOrg}
            billingHref={buildBillingPageHref({ firmSlug: billingFirmSlug, pathname })}
            connectorsHref={canManageOrg && firmScopedNavBase ? `${firmScopedNavBase}/connectors` : undefined}
            supportHref={canManageOrg && slug ? `/d/support?firmSlug=${slug}` : undefined}
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
