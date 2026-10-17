'use client'

import { useState, useEffect, useTransition, type ReactNode } from 'react'
import { ClientSummary, getFirmName } from '@/lib/actions/hierarchy'
import { Settings, Users, ClipboardList, Printer, CalendarDays, Plus, Table2, BarChart3 } from 'lucide-react'
import { PageHeading } from '@/components/ui/page-heading'
import { AccessLock } from '@/components/ui/access-lock'
import { ShimmerBar } from '@/components/ui/shimmer'
import { ViewModeToggle } from '@/components/ui/view-mode-toggle'
import { Button } from '@/components/ui/button'
import { ClientList } from './client-list'
import { AddClientModal } from './add-client-modal'
import { FirmSettingsForm } from './firm-settings-form'
import { FirmMembersTab } from './members/firm-members-tab'
import { GlobalSearchView } from '@/components/search/global-search-view'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { useSearchParams, usePathname, useRouter } from 'next/navigation'
import { EngagementAuditPane } from './engagement-audit-pane'
import { ErrorBoundary } from '@/components/error-boundary'
import { FirmBusinessInsights } from '@/components/dashboard/firm-business-insights'
import { CalendarView } from '@/components/calendar/calendar-view'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/lib/auth-context'
import { LandingArrivalOverlay } from '@/components/app/landing-arrival-overlay'

interface FirmClientsViewProps {
    clients: ClientSummary[]
    groupSlug: string
    orgSlug: string
    orgId?: string
    /** From server: show "+ New Client" in sandbox so restriction toast is discoverable */
    firmSandboxOnly?: boolean
    memberCount?: number
    auditCount?: number
    /** Server-gated via Firm.settings.betaFeatures.microsoftStorageConnector, fails closed if omitted. */
    microsoftConnectorEnabled?: boolean
}

const FIRM_ADMINS_ONLY = 'Firm admins only — hidden from other members'

/** The table is the default; whichever view the user last picked is remembered. */
const VIEW_MODE_KEY = 'fm-clients-view'

/**
 * The title for each firm view. Doc Search and Members carry their own headings (search
 * history toggle, invite button), so they are left out here.
 */
const VIEW_TITLES: Record<string, { title: string; icon: ReactNode; lock?: string }> = {
    analytics: { title: 'Overview', icon: <BarChart3 />, lock: FIRM_ADMINS_ONLY },
    clients: { title: 'Clients', icon: <Users /> },
    calendar: { title: 'Calendar', icon: <CalendarDays /> },
    audit: { title: 'Audit', icon: <ClipboardList />, lock: FIRM_ADMINS_ONLY },
    settings: { title: 'Settings', icon: <Settings />, lock: FIRM_ADMINS_ONLY },
}

export function FirmClientsView({ clients, groupSlug, orgSlug, orgId, firmSandboxOnly = false, memberCount, auditCount, microsoftConnectorEnabled = false }: FirmClientsViewProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const { user } = useAuth()
    const [arrivalVariant] = useState<'new' | 'returning' | null>(() => {
        const landed = searchParams.get('landed')
        return landed === 'new' || landed === 'returning' ? landed : null
    })
    const [showArrivalOverlay, setShowArrivalOverlay] = useState(arrivalVariant !== null)
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')
    const [orgName, setOrgName] = useState<string | null>(null)
    const [isPendingRefresh, startRefresh] = useTransition()
    const [canCreateClient, setCanCreateClient] = useState(false)
    const [canViewOrgSettings, setCanViewOrgSettings] = useState(false)
    const [canViewOrgAudit, setCanViewOrgAudit] = useState(false)
    // Gates tab content until /api/permissions/firm resolves — otherwise the tab briefly
    // defaults to 'clients' (since canViewOrgAudit starts false) then jumps to 'analytics'
    // once permissions load, a visible flash on every landing.
    const [permissionsLoading, setPermissionsLoading] = useState(true)

    const tabParam = searchParams.get('tab') || 'analytics'
    const currentTab =
        tabParam === 'settings' && canViewOrgSettings
            ? 'settings'
            : tabParam === 'audit' && canViewOrgAudit
                ? 'audit'
                : tabParam === 'doc-search'
                    ? 'doc-search'
                    : tabParam === 'calendar'
                        ? 'calendar'
                        : tabParam === 'members' && canViewOrgAudit
                            ? 'members'
                            : tabParam === 'analytics' && canViewOrgAudit
                                ? 'analytics'
                                : 'clients'

    const handleTabChange = (value: string) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('tab', value)
        router.push(`${pathname}?${params.toString()}`, { scroll: false })
    }

    // Restore the saved view mode on mount; the table is the default.
    useEffect(() => {
        try {
            const saved = localStorage.getItem(VIEW_MODE_KEY)
            if (saved === 'grid' || saved === 'list') setViewMode(saved)
        } catch { /* storage blocked — keep the table */ }
    }, [])

    // Fetch firm name
    useEffect(() => {
        getFirmName(orgSlug).then(setOrgName).catch(() => setOrgName(null))
    }, [orgSlug])

    // Fetch permissions: canCreateClient (client scope can_manage), canViewOrgSettings (org scope can_manage)
    useEffect(() => {
        const organizationId = orgId ?? (clients.length > 0 ? clients[0].firmId : null)
        if (!organizationId) {
            setPermissionsLoading(false)
            return
        }
        fetch(
            `/api/permissions/firm?firmId=${encodeURIComponent(organizationId)}&firmSlug=${encodeURIComponent(orgSlug)}`
        )
            .then(res => res.json())
            .then(data => {
                setCanCreateClient(data.canManageClients ?? false)
                // Firm admin / owner can see Settings tab (show in Sandbox too; form is read-only there).
                const isFirmOwner = data.isFirmOwner ?? data.isOrgOwner ?? false
                setCanViewOrgSettings(isFirmOwner)
                setCanViewOrgAudit(Boolean(data.canManage ?? isFirmOwner))
            })
            .catch(err => {
                console.error("Failed to fetch organization permissions", err)
                setCanCreateClient(false)
                setCanViewOrgSettings(false)
                setCanViewOrgAudit(false)
            })
            .finally(() => setPermissionsLoading(false))
    }, [orgId, clients])

    // Correct the URL only for a user who genuinely cannot view Analytics.
    //
    // `permissionsLoading` is the important guard: `canViewOrgAudit` starts false, so without it
    // this effect fired on mount — before /api/permissions/firm resolved — and rewrote
    // ?tab=analytics to ?tab=clients for everyone, firm admins included, on every refresh.
    useEffect(() => {
        if (permissionsLoading) return
        const tab = searchParams.get('tab')
        if (tab === 'analytics' && !canViewOrgAudit) {
            const params = new URLSearchParams(searchParams.toString())
            params.set('tab', 'clients')
            router.replace(`${pathname}?${params.toString()}`, { scroll: false })
        }
    }, [canViewOrgAudit, permissionsLoading])

    const handleViewModeChange = (mode: 'grid' | 'list') => {
        setViewMode(mode)
        try {
            localStorage.setItem(VIEW_MODE_KEY, mode)
        } catch { /* storage blocked — the choice lasts for this visit */ }
    }

    // Overview print: title the document with a timestamp so the saved PDF is a dated snapshot.
    const printOverview = () => {
        const now = new Date()
        const pad = (n: number) => String(n).padStart(2, '0')
        const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}--${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
        const prev = document.title
        document.title = `${orgName} - Overview - ${stamp}`
        const restore = () => {
            document.title = prev
            window.removeEventListener('afterprint', restore)
        }
        window.addEventListener('afterprint', restore)
        window.print()
    }

    const canAddClient = canCreateClient || firmSandboxOnly
    const view = VIEW_TITLES[currentTab]
    const viewCount = currentTab === 'clients' ? clients.length : currentTab === 'audit' ? auditCount : undefined
    const heading = view && (
        <PageHeading
            className="pb-4 print:hidden"
            icon={view.icon}
            title={
                <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{view.title}</span>
                    {viewCount !== undefined && viewCount > 0 && (
                        <span className="text-h3 font-normal tabular-nums text-fg-subtle">{viewCount}</span>
                    )}
                    {view.lock && <AccessLock label={view.lock} className="[&_svg]:h-3.5 [&_svg]:w-3.5" />}
                </span>
            }
            actions={
                currentTab === 'analytics' ? (
                    <TooltipProvider delayDuration={300}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="outline" size="sm" onClick={printOverview}>
                                    <Printer className="h-3.5 w-3.5" />
                                    Print
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" align="end">
                                Save a dated PDF snapshot to compare against later
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                ) : currentTab === 'clients' ? (
                    <>
                        {clients.length > 0 && <ViewModeToggle value={viewMode} onChange={handleViewModeChange} />}
                        {canAddClient && (
                            <AddClientModal
                                groupSlug={groupSlug}
                                orgSlug={orgSlug}
                                firmId={orgId}
                                onSaved={() => startRefresh(() => router.refresh())}
                                trigger={
                                    <Button size="sm" type="button">
                                        <Plus className="h-3.5 w-3.5" />
                                        New client
                                    </Button>
                                }
                            />
                        )}
                    </>
                ) : undefined
            }
        />
    )

    const closeArrivalOverlay = () => {
        setShowArrivalOverlay(false)
        const params = new URLSearchParams(searchParams.toString())
        params.delete('landed')
        const query = params.toString()
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    }

    return (
        <div className="flex flex-col h-full">
            {showArrivalOverlay && arrivalVariant && (
                <LandingArrivalOverlay
                    variant={arrivalVariant}
                    firstName={user?.user_metadata?.first_name as string | undefined}
                    onClose={closeArrivalOverlay}
                />
            )}

            {permissionsLoading ? (
                <div className="flex flex-col gap-4 pb-4" aria-hidden>
                    <ShimmerBar className="h-7 w-48" />
                    <ShimmerBar className="w-full max-w-xl" />
                    <ShimmerBar className="w-full max-w-md" />
                </div>
            ) : (
            <Tabs value={currentTab} onValueChange={handleTabChange} className="flex-1 flex flex-col min-h-0 print:block print:flex-none animate-in fade-in duration-200 ease-out">
                {heading}

                <div className="flex-1 overflow-y-auto custom-scrollbar print:overflow-visible print:flex-none print:h-auto">
                    <TabsContent value="clients" className="m-0 h-full">
                        <div className="py-2">
                            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <ClientList
                                    clients={clients}
                                    groupSlug={groupSlug}
                                    orgSlug={orgSlug}
                                    viewMode={viewMode}
                                    isRefreshing={isPendingRefresh}
                                />
                            </div>
                        </div>
                    </TabsContent>

                    {canViewOrgAudit && (orgId ?? (clients[0]?.firmId ?? clients[0]?.firmId)) && (
                        <TabsContent value="members" className="m-0 h-full">
                            <div className="py-1 h-full">
                                <FirmMembersTab
                                    firmId={orgId ?? clients[0]?.firmId ?? clients[0]?.firmId ?? ''}
                                    groupSlug={groupSlug}
                                    orgSlug={orgSlug}
                                    canManage={canViewOrgAudit}
                                />
                            </div>
                        </TabsContent>
                    )}

                    {(orgId ?? (clients[0]?.firmId ?? clients[0]?.firmId)) && (
                        <TabsContent value="doc-search" className="m-0 h-full">
                            <div className="py-1 h-full">
                                <ErrorBoundary context="GlobalSearchTab">
                                    <GlobalSearchView firmId={orgId ?? clients[0]?.firmId ?? ''} />
                                </ErrorBoundary>
                            </div>
                        </TabsContent>
                    )}

                    <TabsContent value="calendar" className="m-0 h-full">
                        <div className="py-2 h-full">
                            <ErrorBoundary context="FirmCalendarTab">
                                <CalendarView firmSlug={orgSlug} />
                            </ErrorBoundary>
                        </div>
                    </TabsContent>

                    {canViewOrgAudit && (
                        <TabsContent value="audit" className="m-0 h-full">
                            <div className="py-1 h-full">
                                <ErrorBoundary context="OrgAuditTab">
                                    <EngagementAuditPane
                                        firmId={orgId ?? (clients.length > 0 ? clients[0].firmId : undefined)}
                                        exportTitle={orgName ?? 'firm'}
                                    />
                                </ErrorBoundary>
                            </div>
                        </TabsContent>
                    )}

                    {canViewOrgAudit && (orgId ?? (clients[0]?.firmId ?? clients[0]?.firmId)) && (
                        <TabsContent value="analytics" className="m-0">
                            {/* The engagement Overview's layout: the Action Center on top, then the
                                report (.claude/plans/firm-overview-redesign.md). FirmBusinessInsights
                                renders both from one request. */}
                            <div data-print-overview className="pb-6">
                                <ErrorBoundary context="FirmInsightsTab">
                                    <FirmBusinessInsights
                                        firmId={orgId ?? clients[0]?.firmId ?? ''}
                                        firmSlug={orgSlug}
                                        groupSlug={groupSlug}
                                    />
                                </ErrorBoundary>
                            </div>
                        </TabsContent>
                    )}

                    {canViewOrgSettings && (
                        <TabsContent value="settings" className="m-0 h-full">
                            <div className="w-full py-2">
                                <FirmSettingsForm
                                    orgSlug={orgSlug}
                                    orgId={orgId}
                                    initialName={orgName ?? ''}
                                    microsoftConnectorEnabled={microsoftConnectorEnabled}
                                    initialSection={(searchParams.get('section') as 'main' | 'branding' | 'appsettings' | 'storage' | 'danger') || undefined}
                                    onSaved={() => {
                                        const params = new URLSearchParams(searchParams.toString())
                                        params.set('tab', 'clients')
                                        router.push(`${pathname}?${params.toString()}`, { scroll: false })
                                    }}
                                />
                            </div>
                        </TabsContent>
                    )}
                </div>
            </Tabs>
            )}
        </div>
    )
}
