'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname, useParams } from 'next/navigation'
import { Building2, ArrowRight, Loader2, Plus, Users } from 'lucide-react'
import { getDomainOnboardingOptionsForCurrentUser, joinOrganizationByDomain, type DomainOnboardingOptions, type DomainOrgOption } from '@/lib/actions/domain-onboarding'
import { getUserFirms, getIsGroupAdmin, type FirmOption } from '@/lib/actions/firms'
import { BRAND_NAME } from '@/config/brand'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { PageHeading } from '@/components/ui/page-heading'
import { EmptyPanel } from '@/components/ui/empty-panel'
import { Tag } from '@/components/ui/tag'
import { WorkspaceCard } from '@/components/projects/workspace-card'
import { WorkspaceTable } from '@/components/projects/workspace-table'
import { ViewModeToggle, useViewMode } from '@/components/ui/view-mode-toggle'
import { AddFirmModal } from '@/components/projects/add-firm-modal'
import { FirmSwitchDialog } from '@/components/projects/firm-switch-dialog'
import { firmPath } from '@/lib/navigation/firm-paths'

export default function WorkspacePickerPage() {
    const router = useRouter()
    const pathname = usePathname()
    const { groupSlug } = useParams<{ groupSlug: string }>()
    const [firms, setFirms] = useState<FirmOption[]>([])
    const [domainOptions, setDomainOptions] = useState<DomainOnboardingOptions | null>(null)
    const [isGroupAdmin, setIsGroupAdmin] = useState(false)
    const [addFirmOpen, setAddFirmOpen] = useState(false)
    const [loading, setLoading] = useState(true)
    const [joiningId, setJoiningId] = useState<string | null>(null)
    const [joinError, setJoinError] = useState<string | null>(null)
    const [switchDialogOpen, setSwitchDialogOpen] = useState(false)
    const [targetOrg, setTargetOrg] = useState<{ slug: string; name: string } | null>(null)
    // Opens as a table, like All clients; the gallery is one click away and remembered.
    const [viewMode, setViewMode] = useViewMode('fm-firms-view')

    const currentOrgSlug = pathname?.match(/^\/d\/[^/]+\/f\/([^/]+)/)?.[1] ?? null

    useEffect(() => {
        async function load() {
            const [userFirms, opts, isAdmin] = await Promise.all([
                getUserFirms(),
                getDomainOnboardingOptionsForCurrentUser(),
                getIsGroupAdmin(groupSlug),
            ])
            // getUserFirms() returns every firm the user belongs to across ALL groups — this
            // page is scoped to one group (groupSlug), so it must filter down to that group's
            // firms. Without this, a user with firms in multiple groups sees them all mixed
            // together under any single group's /d/[groupSlug]/f URL.
            setFirms(userFirms.filter((f) => f.groupSlug === groupSlug))
            setDomainOptions(opts)
            setIsGroupAdmin(isAdmin)
            setLoading(false)
        }
        void load()
    }, [groupSlug])

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <LoadingSpinner size="md" />
            </div>
        )
    }


    const joinableFirms = domainOptions?.orgsToJoin ?? []

    function handleFirmClick(firm: FirmOption) {
        if (currentOrgSlug && currentOrgSlug !== firm.slug) {
            setTargetOrg({ slug: firm.slug, name: firm.name })
            setSwitchDialogOpen(true)
        } else {
            router.push(firmPath(groupSlug, firm.slug))
        }
    }

    async function handleJoin(org: DomainOrgOption) {
        setJoiningId(org.id)
        setJoinError(null)
        const result = await joinOrganizationByDomain(org.id)
        if (result.ok) {
            router.push(firmPath(groupSlug, result.slug))
        } else {
            setJoinError(result.error)
            setJoiningId(null)
        }
    }

    return (
        <TooltipProvider>
        <div className="flex flex-col h-full overflow-y-auto">

            <PageHeading
                icon={<Building2 />}
                title={
                    <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">Choose your firm</span>
                        {firms.length > 0 && <span className="text-h3 font-normal tabular-nums text-fg-subtle">{firms.length}</span>}
                    </span>
                }
                description={`Select a firm to continue in ${BRAND_NAME}`}
                actions={
                    <>
                        {(firms.length > 0 || joinableFirms.length > 0) && <ViewModeToggle value={viewMode} onChange={setViewMode} />}
                        {isGroupAdmin && (
                            <Button size="sm" onClick={() => setAddFirmOpen(true)}>
                                <Plus className="h-3.5 w-3.5" />
                                New firm
                            </Button>
                        )}
                    </>
                }
            />

            {/* Member firms */}
            {firms.length > 0 && viewMode === 'list' ? (
                <WorkspaceTable
                    countLabel="Clients"
                    countIcon={<Users />}
                    rows={firms.map((firm) => ({
                        key: firm.id,
                        name: firm.name,
                        logoUrl: firm.logoUrl,
                        accent: firm.themeColor,
                        badge: firm.slug === currentOrgSlug ? <Tag color="green" dot>Current</Tag> : undefined,
                        count: firm.clientCount ?? 0,
                        trailing: <Tag color={firm.isFirmAdmin ? 'purple' : 'gray'}>{firm.isFirmAdmin ? 'Firm admin' : 'Firm member'}</Tag>,
                        onClick: () => handleFirmClick(firm),
                    }))}
                />
            ) : firms.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {firms.map((firm) => (
                        <WorkspaceCard
                            key={firm.id}
                            name={firm.name}
                            logoUrl={firm.logoUrl}
                            accent={firm.themeColor}
                            meta={`${firm.clientCount ?? 0} ${firm.clientCount === 1 ? 'client' : 'clients'}`}
                            badge={firm.slug === currentOrgSlug ? <Tag color="green" dot>Current</Tag> : undefined}
                            footer={<Tag color={firm.isFirmAdmin ? 'purple' : 'gray'}>{firm.isFirmAdmin ? 'Firm admin' : 'Firm member'}</Tag>}
                            onClick={() => handleFirmClick(firm)}
                        />
                    ))}
                </div>
            ) : joinableFirms.length === 0 ? (
                <EmptyPanel icon={<Building2 />} title="No firms yet" description={isGroupAdmin ? 'Create a firm to get started.' : 'Ask a group admin to add you to a firm.'} />
            ) : null}

            {/* Domain-joinable firms */}
            {joinableFirms.length > 0 && (
                <section className="mt-8 flex flex-col gap-3">
                    <div>
                        <h2 className="text-h3 text-fg">Firms you can join</h2>
                        <p className="mt-0.5 text-small text-fg-muted">Anyone with your email domain can join these without an invitation.</p>
                    </div>
                    {viewMode === 'list' ? (
                        <WorkspaceTable
                            countLabel="Clients"
                            countIcon={<Users />}
                            trailingLabel="Access"
                            rows={joinableFirms.map((org) => ({
                                key: org.id,
                                name: org.name,
                                icon: joiningId === org.id ? <Loader2 className="animate-spin" /> : undefined,
                                disabled: joiningId !== null,
                                trailing: <span className="flex items-center gap-1 text-small font-medium text-action">Join firm <ArrowRight className="h-3.5 w-3.5" /></span>,
                                onClick: () => handleJoin(org),
                            }))}
                        />
                    ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {joinableFirms.map((org) => (
                            <WorkspaceCard
                                key={org.id}
                                name={org.name}
                                meta="Request access to join"
                                icon={joiningId === org.id ? <Loader2 className="animate-spin" /> : undefined}
                                disabled={joiningId !== null}
                                footer={<span className="flex items-center gap-1 font-medium text-action">Join firm <ArrowRight className="h-3.5 w-3.5" /></span>}
                                onClick={() => handleJoin(org)}
                            />
                        ))}
                    </div>
                    )}
                    {joinError && <p className="text-small text-danger">{joinError}</p>}
                </section>
            )}

            <AddFirmModal open={addFirmOpen} onOpenChange={setAddFirmOpen} groupSlug={groupSlug} />
            {targetOrg && (
                <FirmSwitchDialog
                    open={switchDialogOpen}
                    onOpenChange={setSwitchDialogOpen}
                    groupSlug={groupSlug}
                    targetFirmSlug={targetOrg.slug}
                    targetFirmName={targetOrg.name}
                    currentFirmName={firms.find(f => f.slug === currentOrgSlug)?.name}
                />
            )}
        </div>
        </TooltipProvider>
    )
}
