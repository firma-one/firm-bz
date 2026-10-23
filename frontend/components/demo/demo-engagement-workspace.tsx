'use client'

import { useMemo } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Hint } from '@/components/ui/tooltip'
import { EngagementHeader } from '@/components/projects/engagement-header'
import { EngagementTabsList } from '@/components/projects/engagement-tabs'
import { HorizontalScroll } from '@/components/ui/horizontal-scroll'
import { DemoClient, DemoEngagement, countFilesInEngagement } from '@/lib/demo/static-demo-data'
import { getDeliverableDueMap, getDeliverableStatusMap, getDemoDeliverables } from '@/lib/demo/demo-deliverables'
import { DemoFileList } from '@/components/demo/demo-file-list'
import { DemoEngagementOverview } from '@/components/demo/demo-engagement-overview'
import { DemoEngagementBoard } from '@/components/demo/demo-engagement-board'
import { DemoEngagementComments } from '@/components/demo/demo-engagement-comments'
import { DemoEngagementAudit } from '@/components/demo/demo-engagement-audit'
import { DemoEngagementMembers } from '@/components/demo/demo-engagement-members'
import { DemoBrioChat } from '@/components/demo/demo-brio-chat'
import { filesChat, overviewChat, overviewFacts } from '@/lib/demo/demo-brio'

interface DemoEngagementWorkspaceProps {
    client: DemoClient
    engagement: DemoEngagement
}

const VALID_TABS = new Set(['analytics', 'files', 'board', 'comments', 'audit', 'members'])

/** Static counterpart to engagement-workspace.tsx: the app's engagement header and tab row over the
 * selected engagement's sample data. Overview, Files, Board, Discussions, Audit and Members are static
 * pages; Settings is left out, as for a viewer who can't manage the engagement. */
export function DemoEngagementWorkspace({ client, engagement }: DemoEngagementWorkspaceProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const tabParam = searchParams.get('tab') || 'analytics'
    const currentTab = VALID_TABS.has(tabParam) ? tabParam : 'analytics'

    // Brio's prompt hints for this engagement, as on the real Overview and Files pages.
    const overviewTurns = useMemo(() => overviewChat(client, engagement), [client, engagement])
    const filesTurns = useMemo(() => filesChat(engagement), [engagement])

    const handleTabChange = (value: string) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('tab', value)
        router.push(`${pathname}?${params.toString()}`, { scroll: false })
    }

    const deliverableCount = getDemoDeliverables(engagement).length
    const kickoff = (() => {
        if (!engagement.dueDate) return null
        const d = new Date(engagement.dueDate)
        d.setDate(d.getDate() - 90)
        return d.toISOString().slice(0, 10)
    })()

    return (
        <div className="flex flex-1 flex-col min-h-0">
            {/* The app's engagement header, read-only: no people fetch, no edits. */}
            <EngagementHeader
                projectId={`demo-${engagement.slug}`}
                groupSlug=""
                orgSlug=""
                clientSlug={client.slug}
                clientName={client.name}
                clientHref={`/tour/${client.slug}`}
                name={engagement.name}
                description={`${engagement.contractType ?? 'Client'} engagement · ${countFilesInEngagement(engagement)} files across ${engagement.folders.length} folders`}
                status="ACTIVE"
                kickoffDate={kickoff}
                dueDate={engagement.dueDate ?? null}
                canManage={false}
                showPeople={false}
                fetchPeople={false}
                membersHref="?tab=members"
            />

            <Tabs value={currentTab} onValueChange={handleTabChange} className="flex flex-1 flex-col min-h-0">
                <div className="mb-4 flex shrink-0 items-end justify-between gap-3 border-b border-line">
                    <HorizontalScroll>
                        <EngagementTabsList
                            clientConnectorType="GOOGLE_DRIVE"
                            sharesCount={deliverableCount}
                            auditCount={undefined}
                            memberCount={4}
                            canViewInternalTabs={true}
                            canManage={true}
                            canViewSettings={false}
                        />
                    </HorizontalScroll>
                    {currentTab === 'files' && (
                        <div className="flex shrink-0 items-center pb-1">
                            <Hint label="Not available in this demo" side="bottom">
                                <span data-demo-tour="engagement-upload-btn" className="inline-flex">
                                    <Button size="sm" type="button" disabled>
                                        <Plus className="h-3.5 w-3.5" />
                                        New
                                    </Button>
                                </span>
                            </Hint>
                        </div>
                    )}
                </div>

                <div className="flex min-h-0 flex-1 flex-col">
                    <TabsContent value="analytics" className="m-0">
                        <DemoEngagementOverview engagement={engagement} />
                    </TabsContent>
                    <TabsContent value="files" className="m-0 flex h-full min-h-0 flex-col data-[state=inactive]:hidden">
                        <DemoFileList folders={engagement.folders} deliverableStatusByFolderId={getDeliverableStatusMap(engagement)} deliverableDueByFolderId={getDeliverableDueMap(engagement)} />
                    </TabsContent>
                    <TabsContent value="board" className="m-0 h-full">
                        <DemoEngagementBoard engagement={engagement} />
                    </TabsContent>
                    <TabsContent value="comments" className="m-0">
                        <DemoEngagementComments engagement={engagement} />
                    </TabsContent>
                    <TabsContent value="audit" className="m-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
                        <DemoEngagementAudit engagement={engagement} />
                    </TabsContent>
                    <TabsContent value="members" className="m-0">
                        <DemoEngagementMembers />
                    </TabsContent>
                </div>
            </Tabs>

            {/* One panel per page, keyed so each keeps its own conversation. */}
            {currentTab === 'analytics' && <DemoBrioChat key="overview" turns={overviewTurns} facts={overviewFacts(engagement)} />}
            {currentTab === 'files' && (
                <DemoBrioChat
                    key="files"
                    title="Files"
                    turns={filesTurns}
                    placeholder="Ask Brio about the deliverables, folders & files…"
                    capabilityNote={<>Ask about these files and how the engagement&apos;s deliverables are organized.</>}
                />
            )}
        </div>
    )
}
