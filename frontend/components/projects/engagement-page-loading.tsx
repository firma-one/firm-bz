'use client'

import { usePathname } from 'next/navigation'
import { Briefcase } from 'lucide-react'
import { Tabs } from '@/components/ui/tabs'
import { StatusPill } from '@/components/ui/tag'
import { LoadingAnnouncement, ShimmerBar, ShimmerBlock } from '@/components/ui/shimmer'
import { useShellData } from '@/components/shell/shell-data-context'
import { EngagementHeader } from './engagement-header'
import { EngagementTabsList, engagementChromeKey, readEngagementChrome } from './engagement-tabs'

const TABS = new Set(['analytics', 'files', 'board', 'shares', 'comments', 'wiki', 'audit', 'members', 'settings', 'sources'])

/** Skeleton for the tab body only: a toolbar and a few table rows. */
function BodySkeleton() {
    return (
        <div className="flex min-h-0 flex-1 flex-col" aria-busy="true">
            <LoadingAnnouncement label="Loading engagement" />
            <div className="mb-3 flex items-center gap-2" aria-hidden>
                <ShimmerBar className="h-7 w-16 rounded-control" />
                <ShimmerBar className="h-7 w-20 rounded-control" />
                <ShimmerBar className="h-7 w-20 rounded-control" />
            </div>
            <div className="border-t border-line" aria-hidden>
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="flex h-9 items-center gap-3 border-b border-line px-1">
                        <ShimmerBlock className="h-4 w-4" />
                        <ShimmerBar className="w-[38%]" />
                        <ShimmerBar className="ml-auto w-20" />
                        <ShimmerBar className="w-16" />
                    </div>
                ))}
            </div>
        </div>
    )
}

/**
 * Loading state for an engagement page (.claude/plans/ui-ux-overhaul.md, Phase 6). Only the tab body
 * is a skeleton:
 * - Switching tabs, or coming back to an engagement seen earlier in this session: the header and tab
 *   row are redrawn exactly as the page last rendered them for this viewer (see engagement-tabs.tsx),
 *   with the target tab selected and its pending bar running.
 * - First visit: the title and status come from the sidebar's data; the tab row is a placeholder,
 *   since which tabs the viewer gets isn't known until the page resolves their permissions.
 */
export function EngagementPageLoading() {
    // From the path, not useParams: this also renders from the firm- and client-level loading
    // boundaries (via ListPageSkeleton), whose params don't reach down to the engagement.
    const pathname = usePathname() ?? ''
    const { data } = useShellData()

    const m = pathname.match(/^\/d\/([^/]+)\/f\/([^/]+)\/c\/([^/]+)\/e\/([^/]+)(?:\/([^/?#]+))?/)
    const [, groupSlug = '', firmSlug = '', clientSlug = '', engagementSlug = '', restTab] = m ?? []
    const targetTab = restTab && TABS.has(restTab) ? restTab : null

    const snapshot = readEngagementChrome(engagementChromeKey(firmSlug, clientSlug, engagementSlug))
    const shellEngagement = data?.clients
        .find((c) => c.slug === clientSlug)
        ?.engagements.find((e) => e.slug === engagementSlug)

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col">
                {snapshot ? (
                    <EngagementHeader
                        projectId={snapshot.projectId}
                        groupSlug={groupSlug}
                        orgSlug={firmSlug}
                        clientSlug={clientSlug}
                        clientName={snapshot.clientName}
                        name={snapshot.name}
                        description={snapshot.description}
                        status={snapshot.status}
                        kickoffDate={snapshot.kickoffDate}
                        dueDate={snapshot.dueDate}
                        canManage={false}
                        showPeople={snapshot.showPeople}
                        fetchPeople={false}
                        membersHref={`/d/${groupSlug}/f/${firmSlug}/c/${clientSlug}/e/${engagementSlug}/members`}
                        personaDisplayName={snapshot.personaDisplayName}
                    />
                ) : (
                    <header className="flex flex-col gap-2 pb-3" aria-hidden>
                        <div className="flex min-w-0 items-center gap-3">
                            <span className="flex shrink-0 items-center text-fg-muted [&_svg]:h-7 [&_svg]:w-7">
                                <Briefcase />
                            </span>
                            {shellEngagement ? (
                                <h1 className="min-w-0 text-h1 text-fg">{shellEngagement.name}</h1>
                            ) : (
                                <ShimmerBar className="my-1.5 h-7 w-72" />
                            )}
                        </div>
                        <div className="flex h-7 items-center gap-3">
                            {shellEngagement ? <StatusPill kind="engagement" status={shellEngagement.status} /> : <ShimmerBar className="w-16" />}
                            <ShimmerBar className="w-24" />
                            <ShimmerBar className="w-20" />
                            <ShimmerBar className="w-20" />
                        </div>
                    </header>
                )}

                <Tabs value={targetTab ?? ''} className="flex min-h-0 flex-1 flex-col">
                    <div className="mb-4 flex shrink-0 items-end justify-between gap-3 border-b border-line">
                        <div className="min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            {snapshot ? (
                                <EngagementTabsList {...snapshot.tabs} pendingTab={targetTab} />
                            ) : (
                                <div className="flex h-9 items-center gap-6 px-1" aria-hidden>
                                    {[64, 44, 52, 76].map((w) => (
                                        <ShimmerBar key={w} className="h-3.5" style={{ width: w }} />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <BodySkeleton />
                </Tabs>
            </div>
        </div>
    )
}
