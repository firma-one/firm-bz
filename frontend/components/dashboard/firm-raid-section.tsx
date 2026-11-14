'use client'

import { useEffect, useId, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EntityIcon } from '@/components/ui/entity-icon'
import { withRaidInfo } from '@/components/projects/raid/raid-info'
import { LoadFailed } from '@/components/ui/load-failed'
import { LoadingAnnouncement, ShimmerBar, ShimmerBlock } from '@/components/ui/shimmer'
import { RaidCountLine, RaidRow, RaidSectionHeader } from '@/components/projects/raid/raid-list'
import { failureFrom, failureReason } from '@/lib/files/action-failure'
import { shortDay, type FirmRaidOverview } from '@/lib/raid/raid-shared'

/** Rows shown before "Show all". */
const FIRST_ROWS = 5

/** Where an entry is, each name after the app's own mark for it: the handshake a client, the briefcase an engagement. */
function Where({ clientName, engagementName }: { clientName: string; engagementName: string }) {
    const icon = 'inline-block h-3.5 w-3.5 align-[-2px] text-fg-subtle'
    // The full names on hover, for when the column cuts them short.
    return (
        <span title={`${clientName} · ${engagementName}`}>
            <EntityIcon kind="client" className={cn(icon, 'mr-1')} />
            <span>{clientName}</span>
            <EntityIcon kind="engagement" className={cn(icon, 'ml-2.5 mr-1')} />
            <span>{engagementName}</span>
        </span>
    )
}

/**
 * The Firm Overview's open risks and issues (mock A, approved 2026-11-14): its own section under the Action
 * Center, in the same look as the engagement Overview's RAID section (raid-list.tsx). Issues first, then
 * risks, newest first, each with its engagement; a row opens that engagement's RAID tab. The first five
 * show; "Show all" opens the rest in place, like the Action Center's passed checks (Deepak, 2026-11-14).
 *
 * `FirmRaidView` is the section alone, so /tour draws it over sample entries.
 */
export function FirmRaidView({ data, error, onRetry }: { data: FirmRaidOverview | null; error?: string | null; onRetry?: () => void }) {
    const headingId = useId()
    const listId = useId()
    const [showAll, setShowAll] = useState(false)
    const engagements = data?.counts.engagements ?? 0
    const rows = data ? (showAll ? data.rows : data.rows.slice(0, FIRST_ROWS)) : []
    const folded = data ? data.rows.length - Math.min(data.rows.length, FIRST_ROWS) : 0
    return (
        <section aria-labelledby={headingId} className="flex flex-col gap-3" data-testid="firm-raid">
            <RaidSectionHeader
                id={headingId}
                title="Risks and issues"
                after={data && (data.counts.openIssues > 0 || data.counts.openRisks > 0) ? (
                    <RaidCountLine
                        parts={[
                            { type: 'ISSUE', count: data.counts.openIssues, one: 'open issue', many: 'open issues' },
                            { type: 'RISK', count: data.counts.openRisks, one: 'open risk', many: 'open risks' },
                        ]}
                        suffix={<span>across {engagements} {engagements === 1 ? 'engagement' : 'engagements'}</span>}
                    />
                ) : undefined}
            />
            {!data && error ? (
                <LoadFailed compact what="the risks and issues" reason={error} onRetry={onRetry} />
            ) : !data ? (
                <div className="flex flex-col gap-1" aria-busy="true">
                    <LoadingAnnouncement label="Loading the risks and issues" />
                    {['w-1/2', 'w-2/5', 'w-1/3'].map((w, i) => (
                        <div key={i} className="flex items-center gap-3 px-2 py-2">
                            <ShimmerBlock className="h-[22px] w-[22px]" />
                            <ShimmerBar className={w} />
                        </div>
                    ))}
                </div>
            ) : data.rows.length === 0 ? (
                <p className="px-2 text-small text-fg-muted">No open risks or issues in your engagements.</p>
            ) : (
                <>
                    <ul id={listId}>
                        {rows.map((r) => (
                            <RaidRow
                                key={r.id}
                                type={r.type}
                                title={r.title}
                                place={<Where clientName={r.engagement.clientName} engagementName={r.engagement.name} />}
                                owner={r.ownerFirstName}
                                day={shortDay(r.raisedAt)}
                                href={r.engagement.href}
                                testId={`firm-raid-row-${r.id}`}
                            />
                        ))}
                    </ul>
                    {folded > 0 && (
                        <button
                            type="button"
                            onClick={() => setShowAll((v) => !v)}
                            aria-expanded={showAll}
                            aria-controls={listId}
                            className="flex h-8 items-center gap-2 self-start rounded-control px-2 text-left text-small text-fg-muted transition-colors duration-ui-fast hover:bg-surface-hover hover:text-fg"
                        >
                            {showAll ? 'Show fewer' : data.more > 0 ? `Show ${folded} more` : `Show all ${data.rows.length}`}
                            <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 transition-transform duration-ui-slow ease-ui-out', showAll && 'rotate-90')} aria-hidden />
                        </button>
                    )}
                    {data.more > 0 && (folded === 0 || showAll) && (
                        <p className="px-2 text-small text-fg-muted">{withRaidInfo(`and ${data.more} more, in their engagements\u2019 RAID logs`)}</p>
                    )}
                </>
            )}
        </section>
    )
}

/**
 * The section, from GET /api/firms/[firmId]/raid. Someone the route refuses (no engagement whose RAID log
 * they may see) gets nothing at all, and nothing shows while it first loads in their place.
 */
export function FirmRaidSection({ firmId }: { firmId: string }) {
    const [data, setData] = useState<FirmRaidOverview | null>(null)
    const [hidden, setHidden] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [tick, setTick] = useState(0)

    useEffect(() => {
        let live = true
        void (async () => {
            try {
                const res = await fetch(`/api/firms/${firmId}/raid`)
                if (res.status === 401 || res.status === 403 || res.status === 404) {
                    if (live) setHidden(true)
                    return
                }
                if (!res.ok) throw await failureFrom(res)
                const body = await res.json() as { data: FirmRaidOverview }
                if (!live) return
                setData(body.data)
                setError(null)
            } catch (e) {
                if (live) setError(failureReason(e))
            }
        })()
        return () => { live = false }
    }, [firmId, tick])

    if (hidden) return null
    return <FirmRaidView data={data} error={error} onRetry={() => setTick((t) => t + 1)} />
}
