'use client'

import { useEffect, useId, useState } from 'react'
import { AlertCircle, ArrowRight } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Tag } from '@/components/ui/tag'
import { failureFrom, failureReason } from '@/lib/files/action-failure'
import {
    raidLogHref,
    raidOverviewOf,
    shortDay,
    type RaidItemView,
    type RaidLogPayload,
} from '@/lib/raid/raid-shared'
import { RaidSourceChip, RaidTypeBadge } from './raid-tab'
import { LoadingAnnouncement, ShimmerBar, ShimmerBlock } from '@/components/ui/shimmer'
import { InfoHint } from '@/components/projects/overview-charts'

/**
 * The RAID card on the engagement Overview (.claude/plans/brio-features-round-2.md, §9): counts by type,
 * the top open entries raised in conversation (threads and memos), the latest decision people recorded,
 * how many of Brio's suggestions wait, and the way to the full log in Discussions.
 *
 * It leaves out on purpose what the Action Center above it already shows: overdue work, planning gaps,
 * pace and waiting threads. Those are in the full log. Leads and Contributors · Full Access only.
 *
 * `RaidOverviewView` is the card alone, so /tour renders it over entries in memory.
 */

function Stat({ value, label }: { value: number; label: string }) {
    return (
        <div className="flex flex-col">
            <span className="text-[18px] font-semibold leading-6 tabular-nums text-fg">{value}</span>
            <span className="text-caption font-normal text-fg-muted">{label}</span>
        </div>
    )
}

function Row({ item, engagementBase, latestDecision = false }: { item: RaidItemView; engagementBase: string; latestDecision?: boolean }) {
    const source = item.sources[0]
    return (
        <li className="flex items-center gap-2.5 py-1.5 text-small" data-testid={`raid-card-row-${item.id}`}>
            <RaidTypeBadge type={item.type} />
            <span className="min-w-0 flex-1">
                <strong className="font-semibold text-fg">{item.title}</strong>
                {latestDecision && <span className="text-fg-muted"> · latest decision</span>}
            </span>
            {source && <RaidSourceChip source={source} engagementBase={engagementBase} />}
            <span className="shrink-0 text-fg-muted">{latestDecision ? shortDay(item.raisedAt) : item.ownerName ?? ''}</span>
        </li>
    )
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

export function RaidOverviewView({ log, engagementBase, loadError, onRetry }: {
    log: Pick<RaidLogPayload, 'items' | 'suggestions'> | null
    engagementBase: string
    loadError?: string | null
    onRetry?: () => void
}) {
    const headingId = useId()
    const href = raidLogHref(engagementBase)
    const overview = log ? raidOverviewOf(log) : null

    return (
        <section aria-labelledby={headingId} className="rounded-card border border-line bg-surface px-4 py-3" data-no-export="">
            <div className="flex flex-wrap items-center gap-2.5">
                <h2 id={headingId} className="text-[16px] font-semibold leading-6 text-fg">RAID</h2>
                <InfoHint
                    label="About the RAID log"
                    text="Risks, Assumptions, Issues and Decisions: what could go wrong, what the plan relies on, what has gone wrong, and what people agreed. Internal only."
                />
                <Tag color="gray">Internal only</Tag>
                <span className="flex-1" />
                {overview && overview.suggestionCount > 0 && (
                    <a href={href} className="text-small font-medium text-action hover:underline">
                        {overview.suggestionCount} {plural(overview.suggestionCount, 'suggestion', 'suggestions')} to review
                    </a>
                )}
                <a href={href} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                    Open RAID log
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </a>
            </div>

            {loadError && !log ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <p className="flex items-start gap-1 text-small text-danger" role="alert">
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                        {loadError}
                    </p>
                    {onRetry && <Button type="button" variant="ghost" size="sm" onClick={onRetry}>Try again</Button>}
                </div>
            ) : !overview ? (
                // The card's own shape while it loads, so the Overview doesn't jump when it arrives.
                <div className="mt-2.5 flex flex-col gap-3" aria-busy="true">
                    <LoadingAnnouncement label="Loading the RAID log" />
                    <div className="flex flex-wrap gap-7">
                        {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="flex flex-col gap-1.5">
                                <ShimmerBar className="h-4 w-6" />
                                <ShimmerBar className="h-2 w-16" />
                            </div>
                        ))}
                    </div>
                    <div className="border-t border-line">
                        {['w-1/2', 'w-2/5', 'w-1/3'].map((w, i) => (
                            <div key={i} className="flex items-center gap-2.5 py-2">
                                <ShimmerBlock className="h-[22px] w-[22px]" />
                                <ShimmerBar className={w} />
                                <span className="flex-1" />
                                <ShimmerBar className="h-5 w-24 rounded-control" />
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <>
                    <div className="mb-1.5 mt-2.5 flex flex-wrap gap-7">
                        <Stat value={overview.counts.openRisks} label={plural(overview.counts.openRisks, 'open risk', 'open risks')} />
                        <Stat value={overview.counts.assumptions} label={plural(overview.counts.assumptions, 'assumption', 'assumptions')} />
                        <Stat value={overview.counts.openIssues} label={plural(overview.counts.openIssues, 'open issue', 'open issues')} />
                        <Stat value={overview.counts.decisions} label={plural(overview.counts.decisions, 'decision', 'decisions')} />
                    </div>
                    {overview.conversation.length > 0 || overview.latestDecision ? (
                        <ul className="mt-1.5 border-t border-line">
                            {overview.conversation.map((item) => <Row key={item.id} item={item} engagementBase={engagementBase} />)}
                            {overview.latestDecision && <Row item={overview.latestDecision} engagementBase={engagementBase} latestDecision />}
                        </ul>
                    ) : (
                        <p className="mt-1.5 border-t border-line pt-2 text-small text-fg-muted">
                            Nothing raised in threads or memos yet. Status and health items are in the full log.
                        </p>
                    )}
                </>
            )}
        </section>
    )
}

/**
 * The Overview card. Asks the RAID route, which answers only Leads and Contributors · Full Access: for
 * anyone else (403, 404) it renders nothing at all, and it shows nothing while it loads.
 */
export function RaidOverviewCard({ projectId, engagementBase }: { projectId: string; engagementBase: string }) {
    const [log, setLog] = useState<RaidLogPayload | null>(null)
    const [hidden, setHidden] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [tick, setTick] = useState(0)

    useEffect(() => {
        let live = true
        void (async () => {
            try {
                const res = await fetch(`/api/projects/${projectId}/raid`)
                if (res.status === 401 || res.status === 403 || res.status === 404) {
                    if (live) setHidden(true)
                    return
                }
                if (!res.ok) throw await failureFrom(res)
                const body = await res.json() as { data: RaidLogPayload }
                if (!live) return
                setLog(body.data)
                setLoadError(null)
            } catch (e) {
                if (live) setLoadError(failureReason(e))
            }
        })()
        return () => { live = false }
    }, [projectId, tick])

    if (hidden || (!log && !loadError)) return null
    return <RaidOverviewView log={log} engagementBase={engagementBase} loadError={loadError} onRetry={() => setTick((t) => t + 1)} />
}
