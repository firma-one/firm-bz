'use client'

import React, { useState, useEffect } from 'react'
import { HierarchyClient, getIsOrgInternal } from '@/lib/actions/hierarchy'
import { getProjectMemberSummaries, type ProjectMemberSummary } from '@/lib/actions/members'
import { ProjectList } from './project-list'
import { ClientSettingsForm } from './client-settings-form'
import type { LwCrmClientStatus } from '@/lib/actions/client'
import { SquarePlus, ChevronRight, Building2, Users, Briefcase, LayoutGrid, List, Home, Settings, UserCog } from 'lucide-react'
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
    orgSlug: string // Used for building links
    orgName?: string // Added orgName
    orgId?: string // Organization ID for permission checks
    firmSandboxOnly?: boolean
    selectedClientSlug?: string // Added selectedClientSlug prop
    contactCount?: number
    memberCount?: number
}

export function ClientProjectView({ clients, orgSlug, orgName, orgId, firmSandboxOnly = false, selectedClientSlug, contactCount, memberCount }: ClientProjectViewProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
    const [isClientDetailsOpen, setIsClientDetailsOpen] = useState(false)
    const [isOrgInternal, setIsOrgInternal] = useState(false)
    const [memberSummaries, setMemberSummaries] = useState<Record<string, ProjectMemberSummary>>({})
    const [canViewClientSettings, setCanViewClientSettings] = useState(false)

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
        tabParam === 'settings' && canViewClientSettings
            ? 'settings'
            : tabParam === 'contacts'
                ? 'contacts'
                : tabParam === 'members' && canViewClientSettings
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

    // Fetch org + client permissions: Client Settings visible to Org Owner OR Client Partner (canManageClient)
    useEffect(() => {
        const firmId = orgId ?? clients[0]?.firmId ?? clients[0]?.organizationId
        const activeClientSlug = selectedClientSlug || (clients.length > 0 ? clients[0].slug : '')
        const client = clients.find(c => c.slug === activeClientSlug)
        if (!firmId || !client?.id) return
        fetch(`/api/permissions/firm?firmId=${firmId}&clientId=${client.id}`)
            .then(res => res.json())
            .then(data => {
                setCanViewClientSettings(data.canManageClient ?? false)
            })
            .catch(() => setCanViewClientSettings(false))
    }, [orgId, clients, selectedClientSlug])

    // Fetch isOrgInternal and member summaries for project cards (visible only to org internal)
    useEffect(() => {
        getIsOrgInternal(orgSlug).then(setIsOrgInternal)
    }, [orgSlug])
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
                    href={`/d/f/${orgSlug}`}
                    className="flex items-center gap-2 hover:text-slate-900 transition-colors cursor-pointer"
                >
                    <Building2 className="h-4 w-4" />
                    <span className="font-medium">{orgName || 'Organization'}</span>
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
                                <p className="d-subtitle mt-1">Manage projects and client settings.</p>
                            </div>
                        </div>

                        <Tabs value={currentTab} onValueChange={handleTabChange} className="flex-1 flex flex-col min-h-0">
                            <div className="mb-6">
                                <TabsList className="h-10 p-1 bg-slate-100 rounded-lg inline-flex justify-start flex-wrap gap-1">
                                    <AddProjectModal
                                        orgSlug={orgSlug}
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
                                        className="h-full px-4 rounded-md font-medium text-slate-500 data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
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
                                        className="h-full px-4 rounded-md font-medium text-slate-500 data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
                                    >
                                        <Users className="w-4 h-4 mr-2" />
                                        Contacts
                                        {contactCount !== undefined && contactCount > 0 && (
                                            <span className="ml-2 rounded-full bg-slate-900 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums leading-none">
                                                {contactCount}
                                            </span>
                                        )}
                                    </TabsTrigger>
                                    {canViewClientSettings && (
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
                                    {canViewClientSettings && (
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
                                                orgSlug={orgSlug}
                                                clientSlug={selectedClient.slug}
                                                viewMode={viewMode}
                                                isOrgInternal={isOrgInternal}
                                                memberSummaries={memberSummaries}
                                            />
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="contacts" className="m-0 h-full">
                                    <div className="w-full py-2">
                                        <ClientContactsTab
                                            orgSlug={orgSlug}
                                            clientSlug={selectedClient.slug}
                                            canManage={canViewClientSettings}
                                            firmSandboxOnly={firmSandboxOnly}
                                        />
                                    </div>
                                </TabsContent>

                                {canViewClientSettings && (
                                    <TabsContent value="members" className="m-0 h-full">
                                        <div className="w-full py-2">
                                            <ClientMembersTab
                                                firmId={orgId ?? selectedClient?.firmId ?? selectedClient?.organizationId ?? ''}
                                                clientId={selectedClient.id}
                                                orgSlug={orgSlug}
                                                clientSlug={selectedClient.slug}
                                                canManage={canViewClientSettings}
                                            />
                                        </div>
                                    </TabsContent>
                                )}

                                {canViewClientSettings && (
                                    <TabsContent value="settings" className="m-0 h-full">
                                        <div className="w-full py-2">
                                            <ClientSettingsForm
                                            orgSlug={orgSlug}
                                            firmId={orgId ?? selectedClient.firmId ?? selectedClient.organizationId}
                                            clientSlug={selectedClient.slug}
                                            initialName={selectedClient.name}
                                            initialIndustry={selectedClient.industry ?? undefined}
                                            initialStatus={(selectedClient.status as LwCrmClientStatus) ?? 'ACTIVE'}
                                            initialWebsite={selectedClient.website ?? ''}
                                            initialDescription={selectedClient.description ?? ''}
                                            initialTags={selectedClient.tags ?? []}
                                            initialOwnerId={selectedClient.ownerId}
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
