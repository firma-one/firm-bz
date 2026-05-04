'use client'

import React, { useState, useEffect } from 'react'
import { HierarchyClient, getFirmName } from '@/lib/actions/hierarchy'
import { UserPlus, Building2, LayoutGrid, List, Home, ChevronRight, Settings, Users, ClipboardList, UserCog } from 'lucide-react'
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

interface FirmClientsViewProps {
    clients: HierarchyClient[]
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
        const organizationId = orgId ?? (clients.length > 0 ? clients[0].organizationId : null)
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
            {/* Breadcrumbs */}
            <div className="d-body flex items-center text-stone-500 mb-2">
                <span className="flex items-center gap-2 text-stone-500" title="Home">
                    <Home className="h-4 w-4" />
                </span>
                <ChevronRight className="h-4 w-4 mx-1 text-slate-300" />
                <div className="flex items-center gap-2 text-slate-900 bg-slate-100 px-2 py-1 rounded-md">
                    <Building2 className="h-4 w-4" />
                    <span className="font-semibold">{orgName || 'Firm'}</span>
                </div>
            </div>

            {/* Title / Tabs header (same style as project workspace) */}
            <div className="bg-white border border-stone-200 rounded-xl p-5 mb-4 shadow-sm">
                <div className="min-w-0 flex-1">
                    <h1 className="d-title flex items-center gap-2.5">
                        <Building2 className="h-6 w-6 text-stone-500" />
                        {orgName || 'Firm'}
                    </h1>
                    <p className="d-subtitle mt-1">Manage clients and firm settings.</p>
                </div>
            </div>

            <Tabs value={currentTab} onValueChange={handleTabChange} className="flex-1 flex flex-col min-h-0">
                <div className="mb-6">
                    <TabsList className="h-10 p-1 bg-slate-100 rounded-lg inline-flex justify-start flex-wrap gap-1">
                        {(canCreateClient || firmSandboxOnly) && (
                            <AddClientModal
                                orgSlug={orgSlug}
                                firmId={orgId}
                                firmSandboxOnly={firmSandboxOnly}
                                trigger={
                                    <Button
                                        variant="blackCta"
                                        type="button"
                                        className="h-full px-3 rounded-md text-sm font-medium inline-flex items-center gap-1.5"
                                    >
                                        <UserPlus className="h-3.5 w-3.5" />
                                        New Client
                                    </Button>
                                }
                            />
                        )}
                        <TabsTrigger
                            value="clients"
                            className="h-full px-4 rounded-md font-medium text-slate-500 data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
                        >
                            <Users className="w-4 h-4 mr-2" />
                            Clients
                            {clients.length > 0 && (
                                <span className="ml-2 rounded-full bg-slate-900 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums leading-none">
                                    {clients.length}
                                </span>
                            )}
                        </TabsTrigger>
                        {canViewOrgAudit && (
                            <TabsTrigger
                                value="members"
                                className="h-full px-4 rounded-md font-medium text-slate-500 data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
                            >
                                <UserCog className="w-4 h-4 mr-2" />
                                Members
                                {memberCount !== undefined && memberCount > 0 && (
                                    <span className="ml-2 rounded-full bg-slate-900 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums leading-none">
                                        {memberCount}
                                    </span>
                                )}
                            </TabsTrigger>
                        )}
                        {canViewOrgAudit && (
                            <TabsTrigger
                                value="audit"
                                className="h-full px-4 rounded-md font-medium text-slate-500 data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
                            >
                                <ClipboardList className="w-4 h-4 mr-2" />
                                Audit
                                {auditCount !== undefined && auditCount > 0 && (
                                    <span className="ml-2 rounded-full bg-slate-900 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums leading-none">
                                        {auditCount}
                                    </span>
                                )}
                            </TabsTrigger>
                        )}
                        {canViewOrgSettings && (
                            <TabsTrigger
                                value="settings"
                                className="h-full px-4 rounded-md font-medium text-slate-500 data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
                            >
                                <Settings className="w-4 h-4 mr-2" />
                                Settings
                            </TabsTrigger>
                        )}
                    </TabsList>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                    <TabsContent value="clients" className="m-0 h-full">
                        <div className="py-1">
                            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="flex items-center gap-4 mb-4">
                                    <span className="px-3 py-1 bg-slate-100 rounded-full text-sm font-medium text-slate-600">
                                        {clients.length} {clients.length === 1 ? 'Client' : 'Clients'}
                                    </span>
                                    <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
                                        <button
                                            onClick={() => handleViewModeChange('grid')}
                                            className={`px-3 py-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/60'}`}
                                            title="Grid View"
                                        >
                                            <LayoutGrid className="h-4 w-4" />
                                        </button>
                                        <button
                                            onClick={() => handleViewModeChange('list')}
                                            className={`px-3 py-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/60'}`}
                                            title="List View"
                                        >
                                            <List className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                                <ClientList
                                    clients={clients}
                                    orgSlug={orgSlug}
                                    viewMode={viewMode}
                                />
                            </div>
                        </div>
                    </TabsContent>

                    {canViewOrgAudit && (orgId ?? (clients[0]?.firmId ?? clients[0]?.organizationId)) && (
                        <TabsContent value="members" className="m-0 h-full">
                            <div className="py-1 h-full">
                                <FirmMembersTab
                                    firmId={orgId ?? clients[0]?.firmId ?? clients[0]?.organizationId ?? ''}
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
                                        firmId={orgId ?? (clients.length > 0 ? clients[0].firmId ?? clients[0].organizationId : undefined)}
                                        exportTitle={orgName ?? 'firm'}
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
