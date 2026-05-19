'use client'

import React, { useState, useEffect, useTransition } from 'react'
import { HierarchyClient, getIsOrgInternal } from '@/lib/actions/hierarchy'
import { getProjectMemberSummaries, type ProjectMemberSummary } from '@/lib/actions/members'
import { ProjectList } from './project-list'
import { ClientSettingsForm } from './client-settings-form'
import type { LwCrmClientStatus } from '@/lib/actions/client'
import { SquarePlus, ChevronRight, Building2, Users, Briefcase, LayoutGrid, List, Home, Settings, UserCog, CalendarClock, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { AddEngagementModal } from './add-engagement-modal'
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
    const [isPendingRefresh, startRefresh] = useTransition()

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
        const resolvedFirmId = firmId ?? clients[0]?.firmId
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
        if (!selectedClient?.engagements?.length) {
            setMemberSummaries({})
            return
        }
        const projectIds = selectedClient.engagements.map((p) => p.id)
        getProjectMemberSummaries(projectIds).then(setMemberSummaries)
    }, [selectedClient?.id, selectedClient?.engagements?.length])

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
            {/* Breadcrumbs — monospace architectural style */}
            <nav className="flex items-center gap-1.5 mb-4">
                <Home className="h-4 w-4 text-[#45474c] opacity-60" />
                <ChevronRight className="h-3.5 w-3.5 text-[#d1d5db]" />
                <Building2 className="h-4 w-4 text-[#45474c] opacity-60" />
                <Link
                    href={`/d/f/${firmSlug}`}
                    className="font-mono text-[11px] text-[#45474c] opacity-60 uppercase tracking-tighter hover:opacity-100 transition-opacity"
                >
                    {firmName || 'Firm'}
                </Link>
                <ChevronRight className="h-3.5 w-3.5 text-[#d1d5db]" />
                <Users className="h-4 w-4 text-[#069668]" />
                <span className="font-mono text-[11px] font-bold text-[#1b1b1d] uppercase tracking-tighter">
                    {selectedClient ? selectedClient.name : 'Client'}
                </span>
            </nav>

            {/* Main Content Area */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                {selectedClient ? (
                    <>
                        {/* Client Identity Header — sits directly on pearl bg */}
                        <div className="flex items-start justify-between gap-6 mb-6">
                            <div className="flex items-center gap-6">
                                <div className="w-16 h-16 bg-white border border-[#e5e7eb] flex items-center justify-center rounded shadow-sm shrink-0">
                                    <Users className="h-10 w-10 text-[#1b1b1d]" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-3 flex-wrap">
                                        <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight text-[#1b1b1d]">
                                            {selectedClient.name}
                                        </h1>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                        <p className="text-sm text-[#45474c]">Manage engagements and client settings.</p>
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
                                                <span className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[11px] font-semibold ${chip.cls}`}>
                                                    <CalendarClock className="h-3 w-3" />
                                                    {chip.label}
                                                </span>
                                            )
                                        })()}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <Tabs value={currentTab} onValueChange={handleTabChange} className="flex-1 flex flex-col min-h-0">
                            {/* Tab strip — full-width white with border-b */}
                            <div className="bg-white border border-[#e5e7eb] rounded mb-6 shrink-0">
                                <div className="flex items-center h-14 pr-4">
                                    <TabsList className="h-full p-0 bg-transparent rounded-none inline-flex justify-start gap-0 border-0">
                                        <TabsTrigger
                                            value="projects"
                                            className="h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-[#069668] data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                                        >
                                            <Briefcase className="w-4 h-4 mr-2" />
                                            Engagements
                                            {selectedClient && selectedClient.engagements.length > 0 && (
                                                <span className="ml-2 font-mono text-[10px] font-bold bg-[#069668] text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                                                    {selectedClient.engagements.length}
                                                </span>
                                            )}
                                        </TabsTrigger>
                                        <TabsTrigger
                                            value="contacts"
                                            className="h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-[#069668] data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                                        >
                                            <Users className="w-4 h-4 mr-2" />
                                            Contacts
                                            {contactCount !== undefined && contactCount > 0 && (
                                                <span className="ml-2 font-mono text-[10px] font-bold bg-[#069668] text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                                                    {contactCount}
                                                </span>
                                            )}
                                        </TabsTrigger>
                                        {canManageClient && (
                                            <TabsTrigger
                                                value="members"
                                                className="group/lock h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-[#069668] data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
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
                                        {canManageClient && (
                                            <TabsTrigger
                                                value="settings"
                                                className="group/lock h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-[#069668] data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                                            >
                                                <Settings className="w-4 h-4 mr-2" />
                                                Settings
                                                <span title="Internal only"><Lock className="w-2.5 h-2.5 ml-1 text-[#45474c]/40 group-hover/lock:text-[#45474c] transition-colors shrink-0" /></span>
                                            </TabsTrigger>
                                        )}
                                    </TabsList>
                                    <div className="flex items-center gap-3 ml-auto">
                                        {currentTab === 'projects' && (
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
                                        {currentTab === 'projects' && (
                                            <AddEngagementModal
                                                firmSlug={firmSlug}
                                                clientSlug={selectedClient.slug}
                                                firmSandboxOnly={firmSandboxOnly}
                                                onSaved={() => startRefresh(() => router.refresh())}
                                                trigger={
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        type="button"
                                                        className="h-auto px-4 py-1.5 rounded-[2px] bg-[#069668] text-white text-[10px] font-headline font-bold tracking-widest uppercase hover:bg-[#069668] hover:brightness-105 hover:text-white shadow-sm hover:shadow-[0_6px_16px_-4px_rgba(6,150,104,0.40),0_2px_4px_rgba(0,0,0,0.06)] hover:-translate-y-px active:translate-y-0 active:scale-95 transition-all border-0 inline-flex items-center gap-1.5"
                                                    >
                                                        <SquarePlus className="h-3.5 w-3.5" />
                                                        New Engagement
                                                    </Button>
                                                }
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                <TabsContent value="projects" className="m-0 h-full">
                                    <div className="py-1">
                                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                                            <ProjectList
                                                projects={selectedClient.engagements}
                                                orgSlug={firmSlug}
                                                clientSlug={selectedClient.slug}
                                                viewMode={viewMode}
                                                isOrgInternal={isFirmInternal}
                                                memberSummaries={memberSummaries}
                                                isRefreshing={isPendingRefresh}
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
                                                firmId={firmId ?? selectedClient?.firmId ?? ''}
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
                                            firmId={firmId ?? selectedClient.firmId}
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
