'use client'

import { useEffect, useMemo, useState } from 'react'
import {
    AlertTriangle,
    Archive,
    CalendarClock,
    ClipboardCheck,
    Eye,
    FileQuestion,
    FileType,
    FileWarning,
    FolderMinus,
    FolderOpen,
    FolderTree,
    Gauge,
    HardDrive,
    Heart,
    Inbox,
    MessagesSquare,
    Package,
    RefreshCw,
    Target,
    Users,
} from 'lucide-react'
import { InsightCard } from '@/components/dashboard/insight-card'
import { ActionSection, attentionCount, type ActionItem } from '@/components/dashboard/action-list'
import { ConcentricRings, Donut, PlanningGapRow, RING, RingWithLegend, ScoreDeductions } from '@/components/projects/insight-rings'
import { countFilesInFolder, type DemoEngagement } from '@/lib/demo/static-demo-data'
import { getDemoDeliverables } from '@/lib/demo/demo-deliverables'

const DAY = 86400000

const STAGES = [
    { key: 'to_do', label: 'To Do', hex: RING.amber },
    { key: 'in_progress', label: 'In Progress', hex: RING.blue },
    { key: 'in_review', label: 'In Review', hex: RING.indigo },
    { key: 'approved', label: 'Approved', hex: RING.green },
] as const

/** A ring's title row, as on the app's Overview. */
function RingTitle({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
    return (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-fg-muted">
            <Icon className="h-4 w-4 text-fg-subtle" /> {children}
        </p>
    )
}

function startOfToday(): Date {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
}

/**
 * Static counterpart to EngagementInsightsDashboard: the same sections, the same rings
 * (components/projects/insight-rings.tsx) and the same Linear-style Action Center, computed from the
 * engagement's sample deliverables — the four milestones the board and Brio also show. Anything
 * that depends on today is worked out after mount, so the server and the visitor agree.
 */
export function DemoEngagementOverview({ engagement }: { engagement: DemoEngagement }) {
    const [today, setToday] = useState<Date | null>(null)
    useEffect(() => setToday(startOfToday()), [])

    const m = useMemo(() => {
        const deliverables = getDemoDeliverables(engagement)
        const total = deliverables.length
        const count = (k: string) => deliverables.filter((d) => d.status === k).length
        const approved = count('approved')
        const inReview = count('in_review')
        const open = deliverables.filter((d) => d.status !== 'approved')
        const overdue = today ? open.filter((d) => d.dueDate && new Date(d.dueDate).getTime() < today.getTime()).length : 0

        const files = engagement.folders.flatMap((f) => f.files)
        const docTotal = open.reduce((s, d) => s + d.fileCount, 0)
        const docWithDueDate = Math.floor(docTotal * 0.55)
        const docWithAssignee = Math.floor(docTotal * 0.7)
        const delivDueCov = open.length > 0 ? 100 : 0
        const docDueCov = docTotal > 0 ? Math.round((docWithDueDate / docTotal) * 100) : 0
        const docAssigneeCov = docTotal > 0 ? Math.round((docWithAssignee / docTotal) * 100) : 0
        const hygienePct = Math.round((delivDueCov + docDueCov + docAssigneeCov) / 3)
        const planningGaps = (docTotal - docWithDueDate) + (docTotal - docWithAssignee)

        // Pace: delivered share against the share of a 90-day engagement already elapsed.
        const dueMs = engagement.dueDate ? new Date(engagement.dueDate).getTime() : null
        const kickoffMs = dueMs ? dueMs - 90 * DAY : null
        const timePct = today && dueMs && kickoffMs
            ? Math.max(0, Math.min(100, Math.round(((today.getTime() - kickoffMs) / (dueMs - kickoffMs)) * 100)))
            : 0
        const deliveredPct = total > 0 ? Math.round((approved / total) * 100) : 0
        const paceScore = timePct > 0 ? Math.min(100, Math.round((deliveredPct / timePct) * 100)) : 100

        const penalties = [
            ...(overdue > 0 ? [{ label: overdue === 1 ? 'Overdue deliverable' : `${overdue} overdue deliverables`, points: 15 }] : []),
            ...(planningGaps > 0 ? [{ label: 'Planning gaps', points: 6 }] : []),
            ...(paceScore < 90 ? [{ label: 'Behind pace', points: 8 }] : []),
        ]
        const score = Math.max(0, 100 - penalties.reduce((s, p) => s + p.points, 0))

        const drafts = engagement.folders.find((f) => f.name === 'Drafts')
        const draftCount = drafts ? countFilesInFolder(drafts) : 0
        const folderPenalties = draftCount > 0 ? [{ label: `${draftCount} files still in Drafts`, points: 4 }] : []
        const folderScore = 100 - folderPenalties.reduce((s, p) => s + p.points, 0)

        return {
            total, approved, inReview, overdue, open, files, docTotal, docWithDueDate, docWithAssignee,
            delivDueCov, docDueCov, docAssigneeCov, hygienePct, planningGaps, timePct, deliveredPct, paceScore,
            penalties, score, folderPenalties, folderScore,
            statusItems: STAGES.map((s) => ({ label: s.label, hex: s.hex, value: count(s.key) })),
        }
    }, [engagement, today])

    const healthHex = m.score >= 80 ? RING.green : m.score >= 50 ? RING.amber : RING.red
    const healthText = m.score >= 80 ? 'text-green-600' : m.score >= 50 ? 'text-amber-600' : 'text-red-600'
    const healthLabel = m.score >= 80 ? 'Healthy' : m.score >= 50 ? 'Needs attention' : 'Critical'
    const approvedPct = m.total > 0 ? Math.round((m.approved / m.total) * 100) : 0
    const onSchedulePct = m.total > 0 ? Math.round(((m.total - m.overdue) / m.total) * 100) : 100
    const paceHex = m.paceScore >= 90 ? RING.green : m.paceScore >= 60 ? RING.amber : RING.red
    const paceGap = m.timePct - m.deliveredPct
    const paceStatus = paceGap <= 0 ? 'On or ahead of pace' : paceGap <= 15 ? 'Slightly behind' : 'Behind pace'
    const deducted = 100 - m.score

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

    return (
        <div className="grid grid-cols-1 gap-8 pb-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="flex min-w-0 flex-col gap-10">
                <InsightCard
                    title="Engagement Health"
                    icon={Heart}
                    theme="green"
                    subtext={`Overall Health ${m.score}/100 · ${m.total} deliverable${m.total === 1 ? '' : 's'}`}
                >
                    <div className="flex flex-col gap-6 p-6">
                        {/* .ring-rows (globals.css) draws a full-width hairline between rows of rings. */}
                        <div className="ring-rows grid grid-cols-1 md:grid-cols-3" data-cols="3">
                            <div className="flex flex-col items-center gap-3">
                                <RingTitle icon={Heart}>Overall Health Score</RingTitle>
                                <Donut
                                    total={100}
                                    size={108}
                                    thickness={13}
                                    segments={[{ value: m.score, hex: healthHex }]}
                                    centerTop={<span className={`text-2xl font-bold leading-none ${healthText}`}>{m.score}</span>}
                                    centerBottom={<span className="mt-0.5 text-[10px] text-fg-subtle">/ 100</span>}
                                />
                                <div className="text-center">
                                    <p className={`text-xs font-medium ${healthText}`}>{healthLabel}</p>
                                    {deducted > 0 && (
                                        <p className="mt-0.5 text-[11px] text-fg-subtle">100 − <span className="font-medium text-red-500">{deducted}</span> = <span className={`font-semibold ${healthText}`}>{m.score}</span></p>
                                    )}
                                </div>
                                <ScoreDeductions penalties={m.penalties} emptyText="All clear — no risks" className="w-full max-w-[260px]" />
                            </div>
                            <div className="flex flex-col items-center gap-3">
                                <RingTitle icon={Package}>Delivery Status</RingTitle>
                                <RingWithLegend
                                    items={m.statusItems}
                                    centerTop={<span className="text-xl font-bold leading-none tabular-nums text-fg">{approvedPct}%</span>}
                                    centerBottom={<span className="mt-0.5 text-[10px] text-fg-subtle">approved</span>}
                                />
                            </div>
                            <div className="flex flex-col items-center gap-3">
                                <RingTitle icon={CalendarClock}>Delivery Schedule</RingTitle>
                                <RingWithLegend
                                    items={[
                                        { label: 'Completed', hex: RING.green, value: m.approved },
                                        { label: 'On Track', hex: RING.blue, value: m.total - m.approved - m.overdue },
                                        { label: 'Overdue', hex: RING.red, value: m.overdue },
                                    ]}
                                    centerTop={<span className="text-xl font-bold leading-none tabular-nums text-fg">{onSchedulePct}%</span>}
                                    centerBottom={<span className="mt-0.5 text-[10px] text-fg-subtle">on schedule</span>}
                                />
                            </div>
                            <div className="flex flex-col items-center gap-3">
                                <RingTitle icon={ClipboardCheck}>Planning Hygiene</RingTitle>
                                <ConcentricRings
                                    rings={[
                                        { pct: m.delivDueCov, hex: RING.green },
                                        { pct: m.docDueCov, hex: RING.blue },
                                        { pct: m.docAssigneeCov, hex: RING.indigo },
                                    ]}
                                    centerTop={<span className="text-lg font-bold leading-none tabular-nums text-fg">{m.hygienePct}%</span>}
                                    centerBottom={<span className="text-[9px] text-fg-subtle">set up</span>}
                                />
                                <div className="flex w-full max-w-[240px] flex-col gap-1.5">
                                    <PlanningGapRow hex={RING.green} label="Deliverable due dates" missing={0} total={m.open.length} />
                                    <PlanningGapRow hex={RING.blue} label="Doc due dates" missing={m.docTotal - m.docWithDueDate} total={m.docTotal} />
                                    <PlanningGapRow hex={RING.indigo} label="Doc assignees" missing={m.docTotal - m.docWithAssignee} total={m.docTotal} />
                                </div>
                            </div>
                            <div className="flex flex-col items-center gap-3">
                                <RingTitle icon={MessagesSquare}>Comment Responsiveness</RingTitle>
                                <RingWithLegend
                                    items={[
                                        { label: 'Resolved', hex: RING.green, value: 4 },
                                        { label: 'Flagged open', hex: RING.amber, value: 0 },
                                        { label: 'Unanswered', hex: RING.red, value: 0 },
                                    ]}
                                    centerTop={<span className="text-xl font-bold leading-none tabular-nums text-fg">100%</span>}
                                    centerBottom={<span className="mt-0.5 text-[10px] text-fg-subtle">resolved</span>}
                                />
                            </div>
                            <div className="flex flex-col items-center gap-3">
                                <RingTitle icon={Gauge}>Pace</RingTitle>
                                <Donut
                                    total={100}
                                    size={108}
                                    thickness={14}
                                    segments={[{ value: m.paceScore, hex: paceHex }]}
                                    centerTop={<span className="text-xl font-bold leading-none tabular-nums text-fg">{m.paceScore}%</span>}
                                    centerBottom={<span className="mt-0.5 text-[10px] text-fg-subtle">on pace</span>}
                                />
                                <div className="text-center">
                                    <p className="text-xs font-medium text-fg-muted">{paceStatus}</p>
                                    <p className="mt-0.5 text-[11px] text-fg-subtle">{m.deliveredPct}% delivered · {m.timePct}% elapsed</p>
                                </div>
                            </div>
                            <div className="flex flex-col items-center gap-3">
                                <RingTitle icon={Target}>First-Time-Right</RingTitle>
                                <RingWithLegend
                                    items={[
                                        { label: 'Approved first pass', hex: RING.green, value: m.approved },
                                        { label: 'Approved after rework', hex: RING.amber, value: 0 },
                                    ]}
                                    centerTop={<span className="text-xl font-bold leading-none tabular-nums text-fg">{m.approved > 0 ? '100%' : '—'}</span>}
                                    centerBottom={<span className="mt-0.5 text-[10px] tabular-nums text-fg-subtle">{m.approved}/{m.approved} approved</span>}
                                />
                                <p className="max-w-[220px] text-center text-[11px] text-fg-subtle">Approved deliverables only</p>
                            </div>
                        </div>
                    </div>
                </InsightCard>

                <InsightCard title="Team Status" icon={Users} theme="blue" count={3} subtext="Members & pending invitations">
                    <div className="ring-rows grid grid-cols-1 p-6 md:grid-cols-3" data-cols="3">
                        <div className="flex flex-col items-center gap-3">
                            <RingTitle icon={Users}>On Team vs Invited</RingTitle>
                            <RingWithLegend
                                items={[{ label: 'On team', hex: RING.green, value: 2 }, { label: 'Invited', hex: RING.gray, value: 1 }]}
                                centerTop={<span className="text-xl font-bold leading-none tabular-nums text-fg">67%</span>}
                                centerBottom={<span className="mt-0.5 text-[10px] text-fg-subtle">on team</span>}
                            />
                        </div>
                        <div className="flex flex-col items-center gap-3">
                            <RingTitle icon={Users}>Distribution by Role</RingTitle>
                            <RingWithLegend
                                items={[{ label: 'Lead', hex: RING.green, value: 1 }, { label: 'Member', hex: RING.blue, value: 1 }]}
                                centerTop={<span className="text-xl font-bold leading-none tabular-nums text-fg">2</span>}
                                centerBottom={<span className="mt-0.5 text-[10px] text-fg-subtle">members</span>}
                            />
                        </div>
                        <div className="flex flex-col items-center gap-3">
                            <RingTitle icon={Users}>Internal vs External</RingTitle>
                            <RingWithLegend
                                items={[{ label: 'Internal', hex: RING.green, value: 2 }, { label: 'External', hex: RING.indigo, value: 1 }]}
                                centerTop={<span className="text-xl font-bold leading-none tabular-nums text-fg">67%</span>}
                                centerBottom={<span className="mt-0.5 text-[10px] text-fg-subtle">internal</span>}
                            />
                        </div>
                    </div>
                </InsightCard>

                <InsightCard title="File Organization" icon={FolderOpen} theme="blue" subtext={`${m.files.length} files · ${engagement.folders.length} folders`}>
                    <div className="flex justify-center p-6">
                        <div className="flex w-full max-w-[260px] flex-col items-center gap-3">
                            <RingTitle icon={FolderOpen}>Overall Score</RingTitle>
                            <Donut
                                total={100}
                                size={108}
                                thickness={13}
                                segments={[{ value: m.folderScore, hex: RING.green }]}
                                centerTop={<span className="text-2xl font-bold leading-none text-green-600">{m.folderScore}</span>}
                                centerBottom={<span className="mt-0.5 text-[10px] text-fg-subtle">/ 100</span>}
                            />
                            <p className="text-xs font-medium text-green-600">Well organized</p>
                            <ScoreDeductions penalties={m.folderPenalties} emptyText="No organization issues" className="w-full" />
                        </div>
                    </div>
                </InsightCard>
            </div>

            <div className="sticky top-0">
                <div className="flex flex-col gap-6 xl:border-l xl:border-line xl:pl-6">
                    <div className="flex items-center gap-2 border-b border-line pb-2">
                        <Inbox className="h-4 w-4 shrink-0 text-fg-subtle" />
                        <h2 className="truncate text-h3 text-fg">Action Center</h2>
                        {attentionCount(delivery, housekeeping) > 0 && (
                            <span className="text-small tabular-nums text-fg-subtle">{attentionCount(delivery, housekeeping)}</span>
                        )}
                    </div>
                    <div className="flex flex-col gap-4">
                        <ActionSection title="Delivery" icon={Package} items={delivery} />
                        <ActionSection title="Housekeeping" icon={Archive} items={housekeeping} />
                    </div>
                </div>
            </div>
        </div>
    )
}
