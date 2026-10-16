'use client'

import { useState, useEffect, useTransition } from 'react'
import { HierarchyClient, getIsOrgInternal } from '@/lib/actions/hierarchy'
import { getProjectMemberSummaries, type ProjectMemberSummary } from '@/lib/actions/members'
import { ProjectList } from './engagement-list'
import { ClientSettingsForm } from './client-settings-form'
import type { LwCrmClientStatus } from '@/lib/actions/client'
import { Plus, Users, Briefcase, Settings, UserCog, Contact } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { AddEngagementModal } from './add-engagement-modal'
import { ClientDetailsModal } from './client-details-modal'
import { ClientContactsTab } from './client-contacts-tab'
import { ClientMembersTab } from './members/client-members-tab'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { firmTabPath } from '@/lib/navigation/firm-paths'
import { ClientHeader } from './client-header'
import { AccessLock } from '@/components/ui/access-lock'
import { EmptyPanel } from '@/components/ui/empty-panel'

function PendingBar() {
    return (
        <span className="absolute -bottom-px left-0 right-0 h-0.5 overflow-hidden">
            <span className="absolute inset-y-0 w-1/2 animate-[indeterminate-progress_1.5s_infinite_linear] rounded-full bg-fg" />
        </span>
    )
}

interface ClientProjectViewProps {
    clients: HierarchyClient[]
    groupSlug: string
    firmSlug: string
    firmName?: string
    firmId?: string
    selectedClientSlug?: string
    contactCount?: number
    memberCount?: number
}

export function ClientProjectView({ clients, groupSlug, firmSlug, firmName, firmId, selectedClientSlug, contactCount, memberCount }: ClientProjectViewProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [isClientDetailsOpen, setIsClientDetailsOpen] = useState(false)
    const [isFirmInternal, setIsFirmInternal] = useState(false)
    const [memberSummaries, setMemberSummaries] = useState<Record<string, ProjectMemberSummary>>({})
    const [canManageClient, setCanManageClient] = useState(false)
    const [isFirmOwner, setIsFirmOwner] = useState(false)
    const [isPendingRefresh, startRefresh] = useTransition()
    const [pendingTab, setPendingTab] = useState<string | null>(null)

    const tabParam = searchParams.get('tab') || 'projects'
    const currentTab =
        tabParam === 'settings' && canManageClient
            ? 'settings'
            : tabParam === 'contacts' && isFirmOwner
                ? 'contacts'
                : tabParam === 'members' && canManageClient
                    ? 'members'
                    : 'projects'

    // Clear pending state once searchParams catches up
    useEffect(() => {
        setPendingTab(null)
    }, [searchParams])

    const handleTabChange = (value: string) => {
        setPendingTab(value)
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
            .then(data => {
                setCanManageClient(data.canManageClient ?? false)
                setIsFirmOwner(data.isFirmOwner ?? false)
            })
            .catch(() => { setCanManageClient(false); setIsFirmOwner(false) })
    }, [firmId, clients, selectedClientSlug])

    useEffect(() => {
        getIsOrgInternal(firmSlug).then(setIsFirmInternal)
    }, [firmSlug])

    useEffect(() => {
        if (!selectedClient?.slug || !selectedClient?.name) return
        window.dispatchEvent(new CustomEvent('firma-page-context', {
            detail: { type: 'client', name: selectedClient.name, slug: selectedClient.slug },
        }))
    }, [selectedClient?.slug, selectedClient?.name])

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
            <EmptyPanel icon={<Users />} title="No clients yet" description="Create your first client from the sidebar." />
        )
    }

    return (
        <div className="flex flex-col h-full">

            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                {selectedClient ? (
                    <>
                        <ClientHeader client={selectedClient} firmSlug={firmSlug} canManage={canManageClient} />

                        <Tabs value={currentTab} onValueChange={handleTabChange} className="flex-1 flex flex-col min-h-0">
                            {/* Underline tabs (Linear/Notion); the page action sits at the right end of the row. */}
                            <div className="mb-4 flex shrink-0 items-end justify-between gap-3 border-b border-line">
                                <div className="min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                    <TabsList className="min-w-max border-b-0">
                                        <TabsTrigger value="projects" className="relative gap-1.5">
                                            <Briefcase className="h-4 w-4" />
                                            Engagements
                                            {selectedClient.engagements.length > 0 && (
                                                <span className="text-small tabular-nums text-fg-subtle">{selectedClient.engagements.length}</span>
                                            )}
                                            {pendingTab === 'projects' && <PendingBar />}
                                        </TabsTrigger>
                                        {isFirmOwner && (
                                            <TabsTrigger value="contacts" className="relative gap-1.5">
                                                <Contact className="h-4 w-4" />
                                                Contacts
                                                <AccessLock label="Firm admins only — hidden from other members" />
                                                {contactCount !== undefined && contactCount > 0 && (
                                                    <span className="text-small tabular-nums text-fg-subtle">{contactCount}</span>
                                                )}
                                                {pendingTab === 'contacts' && <PendingBar />}
                                            </TabsTrigger>
                                        )}
                                        {false && canManageClient && (
                                            <TabsTrigger value="members" className="relative gap-1.5">
                                                <UserCog className="h-4 w-4" />
                                                Members
                                                <AccessLock label="Client managers only" />
                                                {(memberCount ?? 0) > 0 && <span className="text-small tabular-nums text-fg-subtle">{memberCount}</span>}
                                                {pendingTab === 'members' && <PendingBar />}
                                            </TabsTrigger>
                                        )}
                                        {canManageClient && (
                                            <TabsTrigger value="settings" className="relative gap-1.5">
                                                <Settings className="h-4 w-4" />
                                                Settings
                                                <AccessLock label="Client managers only — partners and firm admins" />
                                                {pendingTab === 'settings' && <PendingBar />}
                                            </TabsTrigger>
                                        )}
                                    </TabsList>
                                </div>
                                {currentTab === 'projects' && (
                                    <div className="shrink-0 pb-1.5">
                                        <AddEngagementModal
                                            groupSlug={groupSlug}
                                            firmSlug={firmSlug}
                                            clientSlug={selectedClient.slug}
                                            onSaved={() => startRefresh(() => router.refresh())}
                                            trigger={
                                                <Button size="sm" type="button">
                                                    <Plus className="h-3.5 w-3.5" />
                                                    New engagement
                                                </Button>
                                            }
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                <TabsContent value="projects" className="m-0">
                                    <ProjectList
                                        projects={selectedClient.engagements}
                                        groupSlug={groupSlug}
                                        orgSlug={firmSlug}
                                        clientSlug={selectedClient.slug}
                                        clientStatus={selectedClient.status}
                                        isRefreshing={isPendingRefresh}
                                        memberSummaries={memberSummaries}
                                    />
                                </TabsContent>

                                {isFirmOwner && (
                                <TabsContent value="contacts" className="m-0">
                                    <ClientContactsTab
                                        orgSlug={firmSlug}
                                        clientSlug={selectedClient.slug}
                                        canManage={canManageClient}
                                    />
                                </TabsContent>
                                )}

                                {false && canManageClient && (
                                    <TabsContent value="members" className="m-0">
                                        <ClientMembersTab
                                            firmId={firmId ?? selectedClient?.firmId ?? ''}
                                            clientId={selectedClient?.id ?? ''}
                                            orgSlug={firmSlug}
                                            clientSlug={selectedClient?.slug ?? ''}
                                            canManage={canManageClient}
                                        />
                                    </TabsContent>
                                )}

                                {canManageClient && (
                                    <TabsContent value="settings" className="m-0">
                                        <ClientSettingsForm
                                            groupSlug={groupSlug}
                                            orgSlug={firmSlug}
                                            firmId={firmId ?? selectedClient.firmId}
                                            clientId={selectedClient.id}
                                            clientSlug={selectedClient.slug}
                                            connectorId={selectedClient.connectorId}
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
                                            onSaved={() => router.refresh()}
                                        />
                                    </TabsContent>
                                )}
                            </div>
                        </Tabs>
                    </>
                ) : (
                    <EmptyPanel title="Select a client to see its engagements" />
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
