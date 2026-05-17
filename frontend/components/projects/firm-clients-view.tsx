'use client'

import React, { useState, useEffect, useTransition } from 'react'
import { ClientSummary, getFirmName } from '@/lib/actions/hierarchy'
import { UserPlus, Building2, LayoutGrid, List, Home, ChevronRight, Settings, Users, ClipboardList, UserCog, LayoutDashboard, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ClientList } from './client-list'
import { AddClientModal } from './add-client-modal'
import { FirmSettingsForm } from './firm-settings-form'
import { FirmMembersTab } from './members/firm-members-tab'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Link from 'next/link'
import { useSearchParams, usePathname, useRouter } from 'next/navigation'
import { ProjectAuditPane } from './project-audit-pane'
import { ErrorBoundary } from '@/components/error-boundary'
import { FirmBusinessInsights } from '@/components/dashboard/firm-business-insights'
import { DriveInsightsSection } from '@/components/dashboard/drive-insights-section'
import { FirmActionCenter } from '@/components/dashboard/firm-action-center'

interface FirmClientsViewProps {
    clients: ClientSummary[]
    orgSlug: string
    orgId?: string
    /** From server: show "+ New Client" in sandbox so restriction toast is discoverable */
    firmSandboxOnly?: boolean
    memberCount?: number
    auditCount?: number
}

export function FirmClientsView({ clients, orgSlug, orgId, firmSandboxOnly = false, memberCount, auditCount }: FirmClientsViewProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
    const [orgName, setOrgName] = useState<string | null>(null)
    const [isPendingRefresh, startRefresh] = useTransition()
    const [canCreateClient, setCanCreateClient] = useState(false)
    const [canViewOrgSettings, setCanViewOrgSettings] = useState(false)
    const [canViewOrgAudit, setCanViewOrgAudit] = useState(false)

    const tabParam = searchParams.get('tab') || 'clients'
    const currentTab =
        tabParam === 'settings' && canViewOrgSettings
            ? 'settings'
            : tabParam === 'audit' && canViewOrgAudit
                ? 'audit'
                : tabParam === 'members' && canViewOrgAudit
                    ? 'members'
                    : tabParam === 'insights' && canViewOrgAudit
                        ? 'insights'
                        : 'clients'

    const handleTabChange = (value: string) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('tab', value)
        router.push(`${pathname}?${params.toString()}`, { scroll: false })
    }

    // Load view mode preference from localStorage on mount (only restore grid; Card View is default)
    useEffect(() => {
        const saved = localStorage.getItem('fm-client-view-mode')
        if (saved === 'grid') {
            setViewMode('grid')
        }
        // Intentionally do not restore 'list' — Client List defaults to Card View
    }, [])

    // Fetch firm name
    useEffect(() => {
        getFirmName(orgSlug).then(setOrgName).catch(() => setOrgName(null))
    }, [orgSlug])

    // Fetch permissions: canCreateClient (client scope can_manage), canViewOrgSettings (org scope can_manage)
    useEffect(() => {
        const organizationId = orgId ?? (clients.length > 0 ? clients[0].firmId : null)
        if (!organizationId) return
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
    }, [orgId, clients])

    const handleViewModeChange = (mode: 'grid' | 'list') => {
        setViewMode(mode)
        localStorage.setItem('fm-client-view-mode', mode)
    }

    return (
        <div className="flex flex-col h-full">
            {/* Breadcrumbs — monospace architectural style */}
            <nav className="flex items-center gap-1.5 mb-4">
                <Home className="h-4 w-4 text-[#45474c] opacity-60" />
                <ChevronRight className="h-3.5 w-3.5 text-[#d1d5db]" />
                <Building2 className="h-4 w-4 text-[#069668]" />
                <span className="font-mono text-[11px] font-bold text-[#1b1b1d] uppercase tracking-tighter">{orgName || 'Firm'}</span>
            </nav>

            {/* Firm Identity Header — architectural style, sits directly on pearl bg */}
            <div className="flex items-start justify-between gap-6 mb-6">
                <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-white border border-[#e5e7eb] flex items-center justify-center rounded shadow-sm shrink-0">
                        <Building2 className="h-10 w-10 text-[#1b1b1d]" />
                    </div>
                    <div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight text-[#1b1b1d]">
                                {orgName || 'Firm'}
                            </h1>
                        </div>
                        <p className="text-sm text-[#45474c] mt-1">Manage organization-wide client records and operational parameters for this firm.</p>
                    </div>
                </div>
            </div>

            <Tabs value={currentTab} onValueChange={handleTabChange} className="flex-1 flex flex-col min-h-0">
                {/* Tab navigation — full-width white strip with border-b, matching HTML sub-header */}
                <div className="bg-white border border-[#e5e7eb] rounded mb-6 shrink-0">
                    <div className="flex items-center justify-between h-14 pr-4">
                        <TabsList className="h-full p-0 bg-transparent rounded-none inline-flex justify-start gap-0 border-0">
                            <TabsTrigger
                                value="clients"
                                className="h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-[#069668] data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent transition-all shadow-none bg-transparent"
                            >
                                <Users className="w-4 h-4 mr-2" />
                                Clients
                                {clients.length > 0 && (
                                    <span className="ml-2 font-mono text-[10px] font-bold bg-[#069668] text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                                        {clients.length}
                                    </span>
                                )}
                            </TabsTrigger>
                            {canViewOrgAudit && (
                                <TabsTrigger
                                    value="members"
                                    className="group/lock h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-[#069668] data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent transition-all shadow-none bg-transparent"
                                >
                                    <UserCog className="w-4 h-4 mr-2" />
                                    Members
                                    <span title="Internal only"><Lock className="w-2.5 h-2.5 ml-1 text-[#45474c]/40 group-hover/lock:text-[#45474c] transition-colors shrink-0" /></span>
                                    {memberCount !== undefined && memberCount > 0 && (
                                        <span className="ml-2 font-mono text-[10px] font-bold bg-[#069668] text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                                            {memberCount}
                                        </span>
                                    )}
                                </TabsTrigger>
                            )}
                            {canViewOrgAudit && (
                                <TabsTrigger
                                    value="audit"
                                    className="group/lock h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-[#069668] data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent transition-all shadow-none bg-transparent"
                                >
                                    <ClipboardList className="w-4 h-4 mr-2" />
                                    Audit
                                    <span title="Internal only"><Lock className="w-2.5 h-2.5 ml-1 text-[#45474c]/40 group-hover/lock:text-[#45474c] transition-colors shrink-0" /></span>
                                    {auditCount !== undefined && auditCount > 0 && (
                                        <span className="ml-2 font-mono text-[10px] font-bold bg-[#069668] text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                                            {auditCount}
                                        </span>
                                    )}
                                </TabsTrigger>
                            )}
                            {canViewOrgAudit && (
                                <TabsTrigger
                                    value="insights"
                                    className="group/lock h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-[#069668] data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent transition-all shadow-none bg-transparent"
                                >
                                    <LayoutDashboard className="w-4 h-4 mr-2" />
                                    Insights
                                    <span title="Internal only"><Lock className="w-2.5 h-2.5 ml-1 text-[#45474c]/40 group-hover/lock:text-[#45474c] transition-colors shrink-0" /></span>
                                </TabsTrigger>
                            )}
                            {canViewOrgSettings && (
                                <TabsTrigger
                                    value="settings"
                                    className="group/lock h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-[#069668] data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent transition-all shadow-none bg-transparent"
                                >
                                    <Settings className="w-4 h-4 mr-2" />
                                    Settings
                                    <span title="Internal only"><Lock className="w-2.5 h-2.5 ml-1 text-[#45474c]/40 group-hover/lock:text-[#45474c] transition-colors shrink-0" /></span>
                                </TabsTrigger>
                            )}
                        </TabsList>
                        <div className="flex items-center gap-3 ml-auto">
                            {currentTab === 'clients' && (
                                <div className="flex items-center bg-[#f3f4f6] p-0.5 rounded border border-[#e5e7eb]">
                                    <button
                                        onClick={() => handleViewModeChange('grid')}
                                        className={`px-1.5 py-1 rounded transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-[#069668]' : 'text-[#45474c] hover:text-[#1b1b1d] hover:bg-[#f0edee]'}`}
                                        title="Grid View"
                                    >
                                        <LayoutGrid className="h-3 w-3" />
                                    </button>
                                    <button
                                        onClick={() => handleViewModeChange('list')}
                                        className={`px-1.5 py-1 rounded transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-[#069668]' : 'text-[#45474c] hover:text-[#1b1b1d] hover:bg-[#f0edee]'}`}
                                        title="List View"
                                    >
                                        <List className="h-3 w-3" />
                                    </button>
                                </div>
                            )}
                            {/* New Client CTA — emerald, uppercase, tracking-widest */}
                            {currentTab === 'clients' && (canCreateClient || firmSandboxOnly) && (
                            <AddClientModal
                                orgSlug={orgSlug}
                                firmId={orgId}
                                firmSandboxOnly={firmSandboxOnly}
                                onSaved={() => startRefresh(() => router.refresh())}
                                trigger={
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        type="button"
                                        className="h-auto px-4 py-1.5 rounded-[2px] bg-[#069668] text-white text-[10px] font-headline font-bold tracking-widest uppercase hover:bg-[#069668] hover:brightness-105 hover:text-white active:scale-95 transition-all shadow-sm border-0 inline-flex items-center gap-1.5"
                                    >
                                        <UserPlus className="h-3.5 w-3.5" />
                                        New Client
                                    </Button>
                                }
                            />
                        )}
                    </div>
                </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <TabsContent value="clients" className="m-0 h-full">
                        <div className="py-2">
                            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <ClientList
                                    clients={clients}
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
                                    orgSlug={orgSlug}
                                    canManage={canViewOrgAudit}
                                />
                            </div>
                        </TabsContent>
                    )}

                    {canViewOrgAudit && (
                        <TabsContent value="audit" className="m-0 h-full">
                            <div className="py-1 h-full">
                                <ErrorBoundary context="OrgAuditTab">
                                    <ProjectAuditPane
                                        firmId={orgId ?? (clients.length > 0 ? clients[0].firmId : undefined)}
                                        exportTitle={orgName ?? 'firm'}
                                    />
                                </ErrorBoundary>
                            </div>
                        </TabsContent>
                    )}

                    {canViewOrgAudit && (orgId ?? (clients[0]?.firmId ?? clients[0]?.firmId)) && (
                        <TabsContent value="insights" className="m-0">
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 22rem', gap: '1.5rem', paddingTop: '0.5rem', paddingBottom: '1.5rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
                                    <ErrorBoundary context="FirmInsightsTab">
                                        <FirmBusinessInsights
                                            firmId={orgId ?? clients[0]?.firmId ?? clients[0]?.firmId ?? ''}
                                            firmSlug={orgSlug}
                                        />
                                    </ErrorBoundary>
                                    <DriveInsightsSection />
                                </div>
                                <FirmActionCenter
                                    firmId={orgId ?? clients[0]?.firmId ?? clients[0]?.firmId ?? ''}
                                    firmSlug={orgSlug}
                                />
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
                                    firmSandboxOnly={firmSandboxOnly}
                                    onSaved={() => {
                                        const params = new URLSearchParams(searchParams.toString())
                                        params.set('tab', 'clients')
                                        router.push(`${pathname}?${params.toString()}`, { scroll: false })
                                        router.refresh()
                                    }}
                                />
                            </div>
                        </TabsContent>
                    )}
                </div>
            </Tabs>
        </div>
    )
}
