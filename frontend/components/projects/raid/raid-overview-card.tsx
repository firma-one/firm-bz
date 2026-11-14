'use client'

import { useEffect, useId, useState } from 'react'
import { AlertCircle, ArrowRight } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Tag } from '@/components/ui/tag'
import { failureFrom, failureReason } from '@/lib/files/action-failure'
import {
    RAID_MEANING,
    firstNameOf,
    raidLogHref,
    raidOverviewOf,
    shortDay,
    type RaidItemView,
    type RaidLogPayload,
} from '@/lib/raid/raid-shared'
import { RaidLink } from './raid-tab'
import { RaidCountLine, RaidRow, RaidSectionHeader } from './raid-list'
import { LoadingAnnouncement, ShimmerBar, ShimmerBlock } from '@/components/ui/shimmer'
import { InfoHint } from '@/components/projects/overview-charts'

/**
 * The RAID section on the engagement Overview (.claude/plans/brio-features-round-2.md, §9): counts by type,
 * the top open entries from every source, the latest decision people recorded, how many of Brio's
 * suggestions wait, and the way to the full log on its tab. Leads and Contributors · Full Access only.
 *
 * Status and health entries are listed too, as on the Firm Overview. They used to be left out, as the
 * Action Center's to show, which drew counts over an empty list (Deepak, 2026-11-14).
 *
 * The same look as the Firm Overview's risks and issues (raid-list.tsx, 2026-11-14): a header like the
 * Action Center's with each type's colored letter in the count line, then a row per entry.
 *
 * `RaidOverviewView` is the section alone, so /tour renders it over entries in memory.
 */

/** Rows the section lists, the latest decision among them. */
const MAX_ROWS = 5

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

/** "Thread · QSR-9" from "Thread · QSR-9 · Dana · Nov 11": where it was raised, without who and when. */
function whereRaised(item: RaidItemView): string | null {
    const label = item.sources[0]?.label
    return label ? label.split(' · ').slice(0, 2).join(' · ') : null
}

export function RaidOverviewView({ log, engagementBase, loadError, onRetry }: {
    log: Pick<RaidLogPayload, 'items' | 'suggestions'> | null
    engagementBase: string
    loadError?: string | null
    onRetry?: () => void
}) {
    const headingId = useId()
    const href = raidLogHref(engagementBase)
    const overview = log ? raidOverviewOf(log, MAX_ROWS) : null
    const more = overview ? overview.openTotal - overview.open.length : 0

    return (
        <section aria-labelledby={headingId} className="flex flex-col gap-3" data-no-export="">
            <RaidSectionHeader
                id={headingId}
                title="RAID"
                after={(
                    <>
                        <InfoHint label="About the RAID log" text={`${RAID_MEANING} Internal only.`} />
                        <Tag color="gray">Internal only</Tag>
                        {overview && (
                            <RaidCountLine
                                parts={[
                                    { type: 'ISSUE', count: overview.counts.openIssues, one: 'open issue', many: 'open issues' },
                                    { type: 'RISK', count: overview.counts.openRisks, one: 'open risk', many: 'open risks' },
                                    { type: 'ASSUMPTION', count: overview.counts.assumptions, one: 'assumption', many: 'assumptions' },
                                    { type: 'DECISION', count: overview.counts.decisions, one: 'decision', many: 'decisions' },
                                ]}
                            />
                        )}
                    </>
                )}
                actions={(
                    <>
                        {overview && overview.suggestionCount > 0 && (
                            <RaidLink href={href} className="text-small font-medium text-action hover:underline">
                                {overview.suggestionCount} {plural(overview.suggestionCount, 'suggestion', 'suggestions')} to review
                            </RaidLink>
                        )}
                        <RaidLink href={href} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                            Open RAID log
                            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                        </RaidLink>
                    </>
                )}
            />

            {loadError && !log ? (
                <div className="flex flex-wrap items-center gap-2 px-2">
                    <p className="flex items-start gap-1 text-small text-danger" role="alert">
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                        {loadError}
                    </p>
                    {onRetry && <Button type="button" variant="ghost" size="sm" onClick={onRetry}>Try again</Button>}
                </div>
            ) : !overview ? (
                // The section's own shape while it loads, so the Overview doesn't jump when it arrives.
                <div className="flex flex-col gap-1" aria-busy="true">
                    <LoadingAnnouncement label="Loading the RAID log" />
                    {['w-1/2', 'w-2/5', 'w-1/3'].map((w, i) => (
                        <div key={i} className="flex items-center gap-3 px-2 py-2">
                            <ShimmerBlock className="h-[22px] w-[22px]" />
                            <ShimmerBar className={w} />
                        </div>
                    ))}
                </div>
            ) : overview.open.length > 0 || overview.latestDecision ? (
                <>
                    <ul>
                        {overview.open.map((item) => (
                            <RaidRow
                                key={item.id}
                                type={item.type}
                                title={item.title}
                                context={whereRaised(item)}
                                meta={`${firstNameOf(item.ownerName) ?? 'No owner'} · ${shortDay(item.raisedAt)}`}
                                href={href}
                                testId={`raid-card-row-${item.id}`}
                            />
                        ))}
                        {overview.latestDecision && (
                            <RaidRow
                                type="DECISION"
                                title={overview.latestDecision.title}
                                context={whereRaised(overview.latestDecision)}
                                meta={`latest decision · ${shortDay(overview.latestDecision.raisedAt)}`}
                                href={href}
                                testId={`raid-card-row-${overview.latestDecision.id}`}
                            />
                        )}
                    </ul>
                    {more > 0 && (
                        <p className="px-2 text-small text-fg-muted">and {more} more open, in the RAID log</p>
                    )}
                </>
            ) : (
                <p className="px-2 text-small text-fg-muted">
                    Nothing open, and no decisions recorded yet.
                </p>
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
