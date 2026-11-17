'use client'

import { useEffect, useMemo, useState } from 'react'
import { nudgeGreeting } from '@/lib/ai/nudge-draft'
import { AlertTriangle, ClipboardCheck, UserPlus } from 'lucide-react'
import { DeliverablesTimeline } from '@/components/projects/deliverables-timeline'
import { type OverviewDeliverable, type ReportInputs } from '@/components/projects/engagement-overview-sections'
import { HealthDetails, NeedsLink, NeedsRow, NeedsYou, StatusRow, type NeedsItem } from '@/components/projects/overview-layout'
import { RaidStatusCell, raidNeedsItems } from '@/components/projects/overview-raid'
import { countFilesInFolder, type DemoEngagement } from '@/lib/demo/static-demo-data'
import { DemoSummaryCard } from '@/components/demo/demo-summary-card'
import { WaitingOnClient } from '@/components/projects/waiting-on-client'
import { demoRaidLog, TOUR_ME } from '@/components/demo/demo-raid'
import { DEMO_INVITEE } from '@/components/demo/demo-engagement-members'
import { getDemoDeliverables } from '@/lib/demo/demo-deliverables'
import { useRingAnchor } from '@/components/projects/ring-anchor'
import { nudgeCandidates } from '@/lib/ai/nudge-draft'

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
    // A Health entry in the RAID log links here (`?tab=analytics#ring-pace`), as in the app: the jump
    // waits for the dated sections, which arrive after mount and would push the chart down.
    useRingAnchor(today !== null)

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

    // Needs you, as the app builds it (engagement-insights-dashboard.tsx), over the sample.
    const raidLog = useMemo(() => demoRaidLog(), [])
    const nowMsNeeds = today?.getTime() ?? 0
    const ref = (d: { docId: string | null; name: string }) => (d.docId ? `${d.docId} · ${d.name}` : d.name)
    const mine: NeedsItem[] = today ? [
        ...raidNeedsItems(raidLog, TOUR_ME, '', nowMsNeeds),
        ...m.deliverables.filter((d) => d.isOverdue).map((d) => ({
            key: `overdue-${d.id}`,
            icon: <AlertTriangle className="h-4 w-4 text-danger" />,
            title: ref(d),
            context: 'Past its due date and not approved',
            action: <NeedsLink href="?tab=board">Open</NeedsLink>,
        })),
        ...(m.planningGaps > 0 ? [{
            key: 'planning',
            icon: <ClipboardCheck className="h-4 w-4 text-status-waiting-icon" />,
            title: `${m.planningGaps} planning gaps`,
            context: [
                m.docTotal - m.docWithDueDate > 0 ? `${m.docTotal - m.docWithDueDate} documents without a due date` : null,
                m.docTotal - m.docWithAssignee > 0 ? `${m.docTotal - m.docWithAssignee} without an assignee` : null,
            ].filter(Boolean).join(' · '),
            meta: '−6 on health',
            action: <NeedsLink href="?tab=board">Fix in Deliverables</NeedsLink>,
        }] : []),
    ] : []
    const passed = [
        ...(m.overdue === 0 ? ['nothing overdue'] : []),
        'no rework waiting', 'every comment answered', 'no intake to review', 'no sensitive files',
    ]
    // In review for six days, so the sample has something to nudge about.
    const reviewDeliverables = m.deliverables.map((d) => ({
        ...d,
        stageSince: d.stage === 'in_review' && today ? new Date(today.getTime() - 6 * DAY).toISOString() : null,
    }))
    const nudgeable = today ? nudgeCandidates(reviewDeliverables, today).length : 0

    return (
        <div className="flex min-w-0 flex-col gap-10 pb-6">
            {today ? (
                <>
                    {/* 1 · Where it stands */}
                    <StatusRow report={report} raid={<RaidStatusCell log={raidLog} error={null} engagementBase="" />} />

                    {/* 2 · Needs you */}
                    <NeedsYou
                        mine={mine}
                        othersCount={nudgeable + 1}
                        passed={passed}
                        others={(
                            <>
                                {/* As the app: deliverables in review for a while, with Brio's nudge to the Reviewer. */}
                                <WaitingOnClient
                                    projectId="tour"
                                    engagementBase=""
                                    variant="rows"
                                    deliverables={reviewDeliverables}
                                    demo={{
                                        recipients: [{ userId: 'tour-reviewer', name: 'Dana Whitfield', role: 'Reviewer' }],
                                        // Opens as the app's does: the person tagged by their member name, then Brio's words.
                                        draft: (c, name) => `${nudgeGreeting(name)}A quick check-in on ${c.name}${c.docId ? ` (${c.docId})` : ''}. It's been with you for review for ${c.daysWaiting} days.\n\nIf anything needs changing, a comment here is the quickest way to get it to us.`,
                                    }}
                                />
                                {/* The invitation the Members tab lists as pending. */}
                                <NeedsRow
                                    item={{
                                        key: 'invites',
                                        icon: <UserPlus className="h-4 w-4 text-fg-muted" />,
                                        title: '1 invitation not accepted',
                                        context: DEMO_INVITEE,
                                        action: <NeedsLink href="?tab=members">Open</NeedsLink>,
                                    }}
                                />
                            </>
                        )}
                    />

                    {/* 3 · Latest update: a sample published two days ago, with a simulated Rewrite with Brio
                        (components/demo/demo-summary-card.tsx). */}
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

                    {/* 4 · Deliverables */}
                    <div data-demo-tour="engagement-progress">
                        <DeliverablesTimeline deliverables={m.deliverables} startDate={m.kickoff} dueDate={engagement.dueDate ?? null} nowMs={nowMs} />
                    </div>
                </>
            ) : (
                // Holds the dated sections' place until the visitor's today is known.
                <div className="h-[40rem]" aria-hidden />
            )}

            {/* 5 · Health details */}
            <HealthDetails report={report} />
        </div>
    )
}
