'use client'

import { Briefcase, Contact, Plus, Settings } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AccessLock } from '@/components/ui/access-lock'
import { Button } from '@/components/ui/button'
import { Hint } from '@/components/ui/tooltip'
import { ClientHeader } from '@/components/projects/client-header'
import { ProjectList } from '@/components/projects/engagement-list'
import type { HierarchyClient } from '@/lib/actions/hierarchy'
import type { ProjectMemberSummary } from '@/lib/actions/members'
import type { DemoClient } from '@/lib/demo/static-demo-data'
import { DELIVERABLE_ACTORS } from '@/lib/demo/demo-deliverables'

const NOT_IN_DEMO = 'Not available in this demo'

const daysBefore = (iso: string | undefined, days: number) => {
    if (!iso) return null
    const d = new Date(iso)
    d.setDate(d.getDate() - days)
    return d.toISOString()
}

/** The sample client in the shape the app's ClientHeader and ProjectList render. */
function toHierarchyClient(client: DemoClient): HierarchyClient {
    return {
        id: client.slug,
        name: client.name,
        slug: client.slug,
        status: client.status ?? 'ACTIVE',
        industry: client.industry ?? null,
        description: null,
        website: null,
        brandLogoUrl: null,
        tags: [],
        clientSinceDate: client.clientSinceDate ?? null,
        expectedCloseDate: null,
        followUpDate: client.followUpDate ?? null,
        engagements: client.engagements.map((e, i) => ({
            id: e.slug,
            slug: e.slug,
            name: e.name,
            description: `${e.contractType ?? 'Client'} engagement`,
            status: 'ACTIVE',
            members: [{ role: 'eng_admin' }],
            kickoffDate: daysBefore(e.dueDate, 90),
            dueDate: e.dueDate ?? null,
            updatedAt: new Date(Date.now() - (i + 1) * 5 * 3600_000).toISOString(),
        })),
    } as unknown as HierarchyClient
}

/**
 * Static counterpart to client-project-view.tsx: the app's ClientHeader (read-only) and underline
 * tabs, with the engagements in the app's ProjectList. Contacts and Settings are shown but inert.
 */
export function DemoClientDetail({ client }: { client: DemoClient }) {
    const hierarchyClient = toHierarchyClient(client)
    const leads: Record<string, ProjectMemberSummary> = Object.fromEntries(
        client.engagements.map((e, i) => [
            e.slug,
            { projectLeads: [{ name: DELIVERABLE_ACTORS[i % DELIVERABLE_ACTORS.length], email: '' }], teamMembers: [], external: [] },
        ]),
    )

    return (
        <div className="flex flex-col">
            <ClientHeader client={hierarchyClient} firmSlug="" canManage={false} />

            <Tabs value="projects" className="flex flex-col">
                <div className="mb-4 flex shrink-0 items-end justify-between gap-3 border-b border-line">
                    <TabsList className="min-w-max border-b-0">
                        <span data-demo-tour="client-engagements-tab" className="inline-flex">
                            <TabsTrigger value="projects" className="relative gap-1.5">
                                <Briefcase className="h-4 w-4" />
                                Engagements
                                <span className="text-small tabular-nums text-fg-subtle">{client.engagements.length}</span>
                            </TabsTrigger>
                        </span>
                        <Hint label={NOT_IN_DEMO} side="bottom">
                            <span className="inline-flex">
                                <TabsTrigger value="contacts" disabled className="relative gap-1.5">
                                    <Contact className="h-4 w-4" />
                                    Contacts
                                    <AccessLock label="Firm admins only — hidden from other members" />
                                </TabsTrigger>
                            </span>
                        </Hint>
                        <Hint label={NOT_IN_DEMO} side="bottom">
                            <span className="inline-flex">
                                <TabsTrigger value="settings" disabled className="relative gap-1.5">
                                    <Settings className="h-4 w-4" />
                                    Settings
                                    <AccessLock label="Client managers only — partners and firm admins" />
                                </TabsTrigger>
                            </span>
                        </Hint>
                    </TabsList>
                    <div className="shrink-0 pb-1.5">
                        <Hint label={NOT_IN_DEMO} side="bottom">
                            <span data-demo-tour="engagement-add-btn" className="inline-flex">
                                <Button size="sm" type="button" disabled>
                                    <Plus className="h-3.5 w-3.5" />
                                    New engagement
                                </Button>
                            </span>
                        </Hint>
                    </div>
                </div>

                <TabsContent value="projects" className="m-0">
                    <ProjectList
                        projects={hierarchyClient.engagements}
                        groupSlug=""
                        orgSlug=""
                        clientSlug={client.slug}
                        clientStatus={client.status}
                        memberSummaries={leads}
                        hrefFor={(p) => `/demo/${client.slug}/${p.slug}`}
                    />
                </TabsContent>
            </Tabs>
        </div>
    )
}
