'use client'

import { useEffect, useMemo, useState } from 'react'
import {
    AlertTriangle,
    Archive,
    ClipboardCheck,
    Eye,
    FileQuestion,
    FileType,
    FileWarning,
    FolderMinus,
    FolderOpen,
    FolderTree,
    HardDrive,
    Heart,
    Inbox,
    MessagesSquare,
    RefreshCw,
    Users,
} from 'lucide-react'
import { InsightCard } from '@/components/dashboard/insight-card'
import { ActionList, attentionCount, type ActionItem } from '@/components/dashboard/action-list'
import { DATA } from '@/components/projects/insight-rings'
import { DeliverablesTimeline } from '@/components/projects/deliverables-timeline'
import {
    FileOrganizationSection,
    OverviewDetails,
    OverviewTop,
    TeamSection,
    type OverviewDeliverable,
    type ReportInputs,
} from '@/components/projects/engagement-overview-sections'
import { countFilesInFolder, type DemoEngagement } from '@/lib/demo/static-demo-data'
import { DemoSummaryCard } from '@/components/demo/demo-summary-card'
import { getDemoDeliverables } from '@/lib/demo/demo-deliverables'

const DAY = 86400000

function startOfToday(): Date {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
}

/**
 * Static counterpart to EngagementInsightsDashboard: the same layout and the same sections
 * (components/projects/engagement-overview-sections.tsx), computed from the engagement's sample
 * deliverables — the milestones the board and Brio also show. Anything that depends on today is
 * worked out after mount, so the server and the visitor agree; the dated sections wait for it.
 */
export function DemoEngagementOverview({ engagement }: { engagement: DemoEngagement }) {
    const [today, setToday] = useState<Date | null>(null)
    useEffect(() => setToday(startOfToday()), [])

    const m = useMemo(() => {
        const demo = getDemoDeliverables(engagement)
        const dueMs = engagement.dueDate ? new Date(engagement.dueDate).getTime() : null
        // A 90-day engagement: kickoff 90 days before its due date.
        const kickoffMs = dueMs ? dueMs - 90 * DAY : null
        const deliverables: OverviewDeliverable[] = demo.map((d, i) => {
            const dueTime = d.dueDate ? new Date(d.dueDate).getTime() : null
            return {
                id: d.folder.id,
                docId: d.folder.docId,
                name: d.folder.name,
                stage: d.status,
                dueDate: d.dueDate,
                isOverdue: !!today && d.status !== 'approved' && dueTime !== null && dueTime < today.getTime(),
                // Marked a deliverable a week or so apart from kickoff, approved two days before due.
                createdAt: kickoffMs ? new Date(kickoffMs + i * 7 * DAY).toISOString() : null,
                finalizedAt: d.status === 'approved' && dueTime ? new Date(dueTime - 2 * DAY).toISOString() : null,
            }
        })
        const total = deliverables.length
        const approved = deliverables.filter((d) => d.stage === 'approved').length
        const inReview = deliverables.filter((d) => d.stage === 'in_review').length
        const overdue = deliverables.filter((d) => d.isOverdue).length
        const open = demo.filter((d) => d.status !== 'approved')

        const files = engagement.folders.flatMap((f) => f.files)
        const docTotal = open.reduce((s, d) => s + d.fileCount, 0)
        const docWithDueDate = Math.floor(docTotal * 0.55)
        const docWithAssignee = Math.floor(docTotal * 0.7)
        const planningGaps = (docTotal - docWithDueDate) + (docTotal - docWithAssignee)

        const timePct = today && dueMs && kickoffMs
            ? Math.max(0, Math.min(100, Math.round(((today.getTime() - kickoffMs) / (dueMs - kickoffMs)) * 100)))
            : 0
        const deliveredPct = total > 0 ? Math.round((approved / total) * 100) : 0

        // The same deductions the app makes (lib/insights/health-penalties.ts for the first two).
        const penalties = [
            ...(overdue > 0 ? [{ label: `${overdue} overdue deliverable${overdue === 1 ? '' : 's'}`, points: Math.min(45, overdue * 15) }] : []),
            ...(planningGaps > 0 ? [{ label: `Planning gaps (${planningGaps} missing)`, points: 6 }] : []),
            ...(timePct - deliveredPct > 15 ? [{ label: `Behind pace (${deliveredPct}% delivered vs ${timePct}% elapsed)`, points: 8 }] : []),
        ]
        const score = Math.max(0, 100 - penalties.reduce((s, p) => s + p.points, 0))

        const drafts = engagement.folders.find((f) => f.name === 'Drafts')
        const draftCount = drafts ? countFilesInFolder(drafts) : 0
        const folderPenalties = draftCount > 0 ? [{ label: `${draftCount} files still in Drafts`, points: 4 }] : []
        const folderScore = 100 - folderPenalties.reduce((s, p) => s + p.points, 0)

        return {
            deliverables, total, approved, inReview, overdue, open, files, docTotal, docWithDueDate, docWithAssignee,
            planningGaps, timePct, deliveredPct, penalties, score, folderPenalties, folderScore,
            kickoff: kickoffMs ? new Date(kickoffMs).toISOString() : null,
        }
    }, [engagement, today])

    const level = m.score >= 80 ? 'good' as const : m.score >= 50 ? 'warning' as const : 'critical' as const
    const nowMs = today?.getTime() ?? 0
    const report: ReportInputs = {
        deliverables: m.deliverables,
        startDate: m.kickoff,
        startIsKickoff: true,
        dueDate: engagement.dueDate ?? null,
        nowMs,
        deliveredPct: m.deliveredPct,
        timePct: m.timePct,
        health: { score: m.score, level, penalties: m.penalties },
        planning: {
            deliverableTotal: m.open.length,
            deliverableWithDueDate: m.open.length,
            docTotal: m.docTotal,
            docWithDueDate: m.docWithDueDate,
            docWithAssignee: m.docWithAssignee,
        },
        comments: { resolved: 4, flaggedOpen: 0, unanswered: 0 },
        firstTimeRight: { firstTime: m.approved, reworked: 0 },
        inFlightWithRework: 0,
        revisionAvg: m.approved + m.inReview > 0 ? 0.3 : null,
        reviewedCount: m.approved + m.inReview,
        approvalCycleDays: m.approved > 0 ? 9 : null,
        approvedCount: m.approved,
    }

    const delivery: ActionItem[] = [
        { key: 'overdue', label: 'Overdue deliverables', count: m.overdue, severity: 'critical', icon: AlertTriangle, sub: 'past due date, not yet approved' },
        { key: 'in-review', label: 'In review — awaiting approval', count: m.inReview, severity: 'info', icon: Eye, sub: 'ready for your review' },
        { key: 'reworked', label: 'Awaiting rework', count: 0, severity: 'warning', icon: RefreshCw },
        { key: 'planning', label: 'Planning gaps', count: m.planningGaps, severity: 'warning', icon: ClipboardCheck, sub: 'missing due dates or assignees' },
        { key: 'threads', label: 'Unanswered comments', count: 0, severity: 'warning', icon: MessagesSquare },
        { key: 'invites', label: 'Pending invitations', count: 1, severity: 'info', icon: Users, sub: 'awaiting acceptance' },
    ]
    const housekeeping: ActionItem[] = [
        { key: 'sensitive', label: 'Sensitive files', count: 0, severity: 'critical', icon: FileWarning },
        { key: 'poorly-named', label: 'Poorly named files', count: 0, severity: 'warning', icon: FileType },
        { key: 'duplicates', label: 'Duplicate files', count: 0, severity: 'warning', icon: FileWarning },
        { key: 'stale', label: 'Stale files', count: 0, severity: 'warning', icon: Archive },
        { key: 'large', label: 'Large files', count: 0, severity: 'warning', icon: HardDrive },
        { key: 'orphaned', label: 'Orphaned files', count: 0, severity: 'info', icon: FileQuestion },
        { key: 'empty-folders', label: 'Empty folders', count: 0, severity: 'info', icon: FolderMinus },
        { key: 'deep-folders', label: 'Deep folder nesting', count: 0, severity: 'info', icon: FolderTree },
    ]
    const folderCount = engagement.folders.length
    const artifacts = m.files.length + folderCount

    return (
        <div className="flex min-w-0 flex-col gap-10 pb-6">
            <div className="flex flex-col gap-4" data-demo-tour="engagement-action-center">
                <div className="flex items-center gap-2 border-b border-line pb-2">
                    <Inbox className="h-4 w-4 shrink-0 text-fg-subtle" />
                    <h2 className="truncate text-h3 text-fg">Action Center</h2>
                    {attentionCount(delivery, housekeeping) > 0 && (
                        <span className="text-small tabular-nums text-fg-subtle">{attentionCount(delivery, housekeeping)}</span>
                    )}
                </div>
                <ActionList
                    groups={[
                        { title: 'Delivery', items: delivery },
                        { title: 'Housekeeping', items: housekeeping },
                    ]}
                />
            </div>

            <InsightCard
                title="Engagement Health"
                icon={Heart}
                theme="green"
                subtext={`Overall Health ${m.score}/100 · ${m.total} deliverable${m.total === 1 ? '' : 's'}`}
            >
                <div className="flex flex-col gap-8 px-6 pt-4 pb-6">
                    {today ? (
                        <>
                            {/* A sample summary beside the cards, as on the app's Overview, with a
                                simulated Rewrite with Brio (components/demo/demo-summary-card.tsx). */}
                            <OverviewTop
                                report={report}
                                summary={
                                    <DemoSummaryCard
                                        today={today}
                                        input={{
                                            engagementName: engagement.name,
                                            deliverables: m.deliverables,
                                            timePct: m.timePct,
                                            deliveredPct: m.deliveredPct,
                                            daysLeft: engagement.dueDate ? Math.round((new Date(engagement.dueDate).getTime() - today.getTime()) / DAY) : null,
                                            planningGaps: m.planningGaps,
                                            resolvedThreads: 4,
                                        }}
                                    />
                                }
                            />
                            <div className="border-t border-line pt-6" data-demo-tour="engagement-progress">
                                <DeliverablesTimeline deliverables={m.deliverables} startDate={m.kickoff} dueDate={engagement.dueDate ?? null} nowMs={nowMs} />
                            </div>
                        </>
                    ) : (
                        // Holds the dated sections' place until the visitor's today is known.
                        <div className="h-72" aria-hidden />
                    )}
                    <div className="border-t border-line pt-6">
                        <OverviewDetails report={report} />
                    </div>
                </div>
            </InsightCard>

            <InsightCard title="Team Status" icon={Users} theme="blue" count={3} subtext="Members & pending invitations">
                <div className="px-6 pt-4 pb-2">
                    <TeamSection
                        joined={3}
                        invited={1}
                        roles={[
                            { label: 'Admin', hex: DATA.category1, value: 1 },
                            { label: 'Member', hex: DATA.category2, value: 1 },
                            { label: 'Collaborator', hex: DATA.category3, value: 1 },
                        ]}
                        internal={2}
                        external={1}
                    />
                </div>
            </InsightCard>

            <InsightCard title="File Organization" icon={FolderOpen} theme="blue" subtext={`${m.files.length} files · ${folderCount} folders`}>
                <div className="px-6 pt-4 pb-2">
                    <FileOrganizationSection
                        score={m.folderScore}
                        penalties={m.folderPenalties}
                        checks={[
                            { id: 'folder.poorly_named', label: 'Poorly named', info: 'Default or meaningless names like "Untitled", "New File" or "Copy of".', count: 0, of: artifacts },
                            { id: 'folder.duplicates', label: 'Duplicates', info: 'Files with the same or nearly the same name (90% or more) and the same extension.', count: 0, of: artifacts },
                            { id: 'folder.stale_files', label: 'Stale files', info: 'Not modified in the last 6 months.', count: 0, of: m.files.length },
                            { id: 'folder.large_files', label: 'Large files', info: 'Larger than 50 MB.', count: 0, of: m.files.length },
                            { id: 'folder.orphaned_files', label: 'Outside any folder', info: 'Files at the root with no parent folder.', count: 0, of: m.files.length },
                            { id: 'folder.empty_folders', label: 'Empty folders', info: 'Folders with no files or subfolders.', count: 0, of: folderCount },
                            { id: 'folder.deep_folders', label: 'More than 3 levels deep', info: 'Folders nested more than 3 levels down.', count: 0, of: folderCount },
                        ]}
                    />
                </div>
            </InsightCard>
        </div>
    )
}
