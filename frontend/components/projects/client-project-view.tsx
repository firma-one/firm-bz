'use client'

import React, { useState, useEffect } from 'react'
import { HierarchyClient, getIsOrgInternal } from '@/lib/actions/hierarchy'
import { getProjectMemberSummaries, type ProjectMemberSummary } from '@/lib/actions/members'
import { ProjectList } from './project-list'
import { ClientSettingsForm } from './client-settings-form'
import type { LwCrmClientStatus } from '@/lib/actions/client'
import { SquarePlus, ChevronRight, Building2, Users, Briefcase, LayoutGrid, List, Home, Settings, UserCog, CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { AddProjectModal } from './add-project-modal'
import { ClientDetailsModal } from './client-details-modal'
import { ClientContactsTab } from './client-contacts-tab'
import { ClientMembersTab } from './members/client-members-tab'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Link from 'next/link'

interface ClientProjectViewProps {
    clients: HierarchyClient[]
    firmSlug: string
    firmName?: string
    firmId?: string
    firmSandboxOnly?: boolean
    selectedClientSlug?: string
    contactCount?: number
    memberCount?: number
}

export function ClientProjectView({ clients, firmSlug, firmName, firmId, firmSandboxOnly = false, selectedClientSlug, contactCount, memberCount }: ClientProjectViewProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
    const [isClientDetailsOpen, setIsClientDetailsOpen] = useState(false)
    const [isFirmInternal, setIsFirmInternal] = useState(false)
    const [memberSummaries, setMemberSummaries] = useState<Record<string, ProjectMemberSummary>>({})
    const [canManageClient, setCanManageClient] = useState(false)

    // Load view mode preference from localStorage on mount
    useEffect(() => {
        const savedViewMode = localStorage.getItem('fm-project-view-mode')
        if (savedViewMode === 'grid' || savedViewMode === 'list') {
            setViewMode(savedViewMode)
        }
    }, [])

    // Save view mode preference to localStorage when it changes
    const handleViewModeChange = (mode: 'grid' | 'list') => {
        setViewMode(mode)
        localStorage.setItem('fm-project-view-mode', mode)
    }

    const tabParam = searchParams.get('tab') || 'projects'
    const currentTab =
        tabParam === 'settings' && canManageClient
            ? 'settings'
            : tabParam === 'contacts'
                ? 'contacts'
                : tabParam === 'members' && canManageClient
                    ? 'members'
                    : 'projects'

    const handleTabChange = (value: string) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('tab', value)
        router.push(`${pathname}?${params.toString()}`, { scroll: false })
    }

    // If a specific clientSlug is provided via props (from URL), use it. Otherwise fallback to first client or empty.
    const activeClientSlug = selectedClientSlug || (clients.length > 0 ? clients[0].slug : '')
    const selectedClient = clients.find(c => c.slug === activeClientSlug)

    useEffect(() => {
        const resolvedFirmId = firmId ?? clients[0]?.firmId ?? clients[0]?.organizationId
        const slug = selectedClientSlug || (clients.length > 0 ? clients[0].slug : '')
        const client = clients.find(c => c.slug === slug)
        if (!resolvedFirmId || !client?.id) return
        fetch(`/api/permissions/firm?firmId=${resolvedFirmId}&clientId=${client.id}`)
            .then(res => res.json())
            .then(data => setCanManageClient(data.canManageClient ?? false))
            .catch(() => setCanManageClient(false))
    }, [firmId, clients, selectedClientSlug])

    useEffect(() => {
        getIsOrgInternal(firmSlug).then(setIsFirmInternal)
    }, [firmSlug])

    useEffect(() => {
        if (!selectedClient?.projects?.length) {
            setMemberSummaries({})
            return
        }
        const projectIds = selectedClient.projects.map((p) => p.id)
        getProjectMemberSummaries(projectIds).then(setMemberSummaries)
    }, [selectedClient?.id, selectedClient?.projects?.length])

    if (clients.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center">
                <h3 className="text-lg font-medium text-slate-900">No Clients Found</h3>
                <p className="text-slate-500 mt-2">Get started by creating your first client workspace using the sidebar.</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full">
            {/* Breadcrumbs */}
            <div className="d-body flex items-center text-stone-500 mb-2">
                <span className="flex items-center gap-2 text-stone-500" title="Home">
                    <Home className="h-4 w-4" />
                </span>
                <ChevronRight className="h-4 w-4 mx-1 text-slate-300" />
                <Link 
                    href={`/d/f/${firmSlug}`}
                    className="flex items-center gap-2 hover:text-slate-900 transition-colors cursor-pointer"
                >
                    <Building2 className="h-4 w-4" />
                    <span className="font-medium">{firmName || 'Firm'}</span>
                </Link>
                {selectedClient && (
                    <>
                        <ChevronRight className="h-4 w-4 mx-1 text-slate-300" />
                        <button
                            onClick={() => setIsClientDetailsOpen(true)}
                            className="flex items-center gap-2 text-slate-900 bg-slate-100 px-2 py-1 rounded-md hover:bg-slate-200 transition-colors cursor-pointer"
                        >
                            <Users className="h-4 w-4" />
                            <span className="font-semibold">{selectedClient.name}</span>
                        </button>
                    </>
                )}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                {selectedClient ? (
                    <>
                        {/* Title (same style as project workspace) */}
                        <div className="bg-white border border-stone-200 rounded-xl p-5 mb-4 shadow-sm">
                            <div className="min-w-0 flex-1">
                                <h1 className="d-title flex items-center gap-2.5">
                                    <Users className="h-6 w-6 text-stone-500" />
                                    {selectedClient.name}
                                </h1>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <p className="d-subtitle">Manage projects and client settings.</p>
                                    {(() => {
                                        const fud = selectedClient.followUpDate
                                        if (!fud) return null
                                        const today = new Date(); today.setHours(0, 0, 0, 0)
                                        const d = new Date(fud); d.setHours(0, 0, 0, 0)
                                        const delta = Math.round((d.getTime() - today.getTime()) / 86400000)
                                        if (delta > 2 || delta < -2) return null
                                        const chips: Record<number, { label: string; cls: string }> = {
                                            2:  { label: 'Follow up · in 2 days', cls: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
                                            1:  { label: 'Follow up · tomorrow',  cls: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
                                            0:  { label: 'Follow up today',        cls: 'bg-amber-50 text-amber-700 border-amber-200'  },
                                            [-1]: { label: 'Follow up · 1 day late', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
                                            [-2]: { label: 'Follow up · 2 days late', cls: 'bg-red-50 text-red-700 border-red-200' },
                                        }
                                        const chip = chips[delta]
                                        if (!chip) return null
                                        return (
                                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${chip.cls}`}>
                                                <CalendarClock className="h-3 w-3" />
                                                {chip.label}
                                            </span>
                                        )
                                    })()}
                                </div>
                            </div>
                        </div>

                        <Tabs value={currentTab} onValueChange={handleTabChange} className="flex-1 flex flex-col min-h-0">
                            <div className="mb-6">
                                <TabsList className="h-10 p-1 bg-slate-100 rounded-lg inline-flex justify-start flex-wrap gap-1">
                                    <AddProjectModal
                                        orgSlug={firmSlug}
                                        clientSlug={selectedClient.slug}
                                        firmSandboxOnly={firmSandboxOnly}
                                        trigger={
                                            <Button
                                                variant="blackCta"
                                                type="button"
                                                className="h-full px-3 rounded-md text-sm font-medium inline-flex items-center gap-1.5"
                                            >
                                                <SquarePlus className="h-3.5 w-3.5" />
                                                New Engagement
                                            </Button>
                                        }
                                    />
                                    <TabsTrigger
                                        value="projects"
                                        className="h-full px-4 rounded-md font-medium text-slate-500 hover:bg-white hover:text-slate-900 hover:shadow-sm data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm transition-all"
                                    >
                                        <Briefcase className="w-4 h-4 mr-2" />
                                        Engagements
                                        {selectedClient && selectedClient.projects.length > 0 && (
                                            <span className="ml-2 rounded-full bg-slate-900 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums leading-none">
                                                {selectedClient.projects.length}
                                            </span>
                                        )}
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="contacts"
                                        className="h-full px-4 rounded-md font-medium text-slate-500 hover:bg-white hover:text-slate-900 hover:shadow-sm data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm transition-all"
                                    >
                                        <Users className="w-4 h-4 mr-2" />
                                        Contacts
                                        {contactCount !== undefined && contactCount > 0 && (
                                            <span className="ml-2 rounded-full bg-slate-900 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums leading-none">
                                                {contactCount}
                                            </span>
                                        )}
                                    </TabsTrigger>
                                    {canManageClient && (
                                        <TabsTrigger
                                            value="members"
                                            className="h-full px-4 rounded-md font-medium text-slate-500 hover:bg-white hover:text-slate-900 hover:shadow-sm data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm transition-all"
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
                                    {canManageClient && (
                                        <TabsTrigger
                                            value="settings"
                                            className="h-full px-4 rounded-md font-medium text-slate-500 hover:bg-white hover:text-slate-900 hover:shadow-sm data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm transition-all"
                                        >
                                            <Settings className="w-4 h-4 mr-2" />
                                            Settings
                                        </TabsTrigger>
                                    )}
                                </TabsList>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                                <TabsContent value="projects" className="m-0 h-full">
                                    <div className="py-1">
                                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                                            <div className="flex items-center gap-4 mb-4">
                                                <span className="px-3 py-1 bg-slate-100 rounded-full text-sm font-medium text-slate-600">
                                                    {selectedClient.projects.length} Engagements
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
                                            <ProjectList
                                                projects={selectedClient.projects}
                                                orgSlug={firmSlug}
                                                clientSlug={selectedClient.slug}
                                                viewMode={viewMode}
                                                isOrgInternal={isFirmInternal}
                                                memberSummaries={memberSummaries}
                                            />
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="contacts" className="m-0 h-full">
                                    <div className="w-full py-2">
                                        <ClientContactsTab
                                            orgSlug={firmSlug}
                                            clientSlug={selectedClient.slug}
                                            canManage={canManageClient}
                                            firmSandboxOnly={firmSandboxOnly}
                                        />
                                    </div>
                                </TabsContent>

                                {canManageClient && (
                                    <TabsContent value="members" className="m-0 h-full">
                                        <div className="w-full py-2">
                                            <ClientMembersTab
                                                firmId={firmId ?? selectedClient?.firmId ?? selectedClient?.organizationId ?? ''}
                                                clientId={selectedClient.id}
                                                orgSlug={firmSlug}
                                                clientSlug={selectedClient.slug}
                                                canManage={canManageClient}
                                            />
                                        </div>
                                    </TabsContent>
                                )}

                                {canManageClient && (
                                    <TabsContent value="settings" className="m-0 h-full">
                                        <div className="w-full py-2">
                                            <ClientSettingsForm
                                            orgSlug={firmSlug}
                                            firmId={firmId ?? selectedClient.firmId ?? selectedClient.organizationId}
                                            clientSlug={selectedClient.slug}
                                            initialName={selectedClient.name}
                                            initialIndustry={selectedClient.industry ?? undefined}
                                            initialStatus={(selectedClient.status as LwCrmClientStatus) ?? 'ACTIVE'}
                                            initialWebsite={selectedClient.website ?? ''}
                                            initialDescription={selectedClient.description ?? ''}
                                            initialTags={selectedClient.tags ?? []}
                                            initialOwnerId={selectedClient.ownerId}
                                            initialFollowUpDate={selectedClient.followUpDate instanceof Date ? selectedClient.followUpDate.toISOString() : (selectedClient.followUpDate as string | null) ?? undefined}
                                            initialExpectedCloseDate={selectedClient.expectedCloseDate instanceof Date ? selectedClient.expectedCloseDate.toISOString() : (selectedClient.expectedCloseDate as string | null) ?? undefined}
                                            initialLeadSource={selectedClient.leadSource ?? undefined}
                                            initialInternalMemo={selectedClient.internalMemo ?? undefined}
                                            initialClientSinceDate={selectedClient.clientSinceDate instanceof Date ? selectedClient.clientSinceDate.toISOString() : (selectedClient.clientSinceDate as string | null) ?? undefined}
                                            initialLinkedInUrl={selectedClient.linkedInUrl ?? undefined}
                                            initialCompanySizeBracket={selectedClient.companySizeBracket ?? undefined}
                                            initialBillingAddress={selectedClient.billingAddress ?? undefined}
                                            firmSandboxOnly={firmSandboxOnly}
                                            onSaved={() => {
                                                const params = new URLSearchParams(searchParams.toString())
                                                params.set('tab', 'projects')
                                                router.push(`${pathname}?${params.toString()}`, { scroll: false })
                                                router.refresh()
                                            }}
                                            />
                                        </div>
                                    </TabsContent>
                                )}
                            </div>
                        </Tabs>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-slate-400">Select a client to view projects</div>
                )}
            </div>

            {/* Client Details Modal */}
            <ClientDetailsModal
                client={selectedClient || null}
                open={isClientDetailsOpen}
                onOpenChange={setIsClientDetailsOpen}
            />
        </div>
    )
}
