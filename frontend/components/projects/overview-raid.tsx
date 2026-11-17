'use client'

import { ChevronRight, ShieldAlert, Sparkles } from 'lucide-react'
import { Brio } from '@/components/ui/brio'
import { BRIO_GREEN } from '@/lib/ai/assistant'
import { dueDay, memoReviewHref, memoSuggestionGroups, raidLogHref, raidOverviewOf, waitsOnMemo, type RaidLogPayload } from '@/lib/raid/raid-shared'
import { RaidInfo } from './raid/raid-info'
import { RaidLink, RaidTypeBadge } from './raid/raid-tab'
import { NEEDS_ACTION_CLASS, StatusCell, type NeedsItem } from './overview-layout'

/*
 * The Overview's RAID pieces (.claude/plans/engagement-overview-restructure.md): the status row's RAID
 * cell and Needs you's RAID rows. Their own module, without the dashboard's sign-in and data reads, so
 * the tour (demo-engagement-overview.tsx) draws them over its sample log.
 */

const countOf = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const DAY = 86400000

/** The status row's RAID cell: what's open, and the way to the log. Internal only, never exported. */
export function RaidStatusCell({ log, error, engagementBase }: { log: RaidLogPayload | null; error: string | null; engagementBase: string }) {
    const o = log ? raidOverviewOf(log, 0) : null
    const open = o ? o.counts.openIssues + o.counts.openRisks + o.counts.openActions : 0
    const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
    return (
        <StatusCell icon={ShieldAlert} label={<span className="inline-flex items-center gap-1">RAID <RaidInfo /></span>} noExport tour="overview-raid-card">
            {o ? (
                <>
                    <p className="flex min-w-0 items-baseline gap-1.5">
                        <span className="text-h2 tabular-nums text-fg">{open} open</span>
                        <span className="truncate text-small text-fg-muted">{plural(o.counts.decisions, 'decision')}</span>
                    </p>
                    <p className="truncate text-caption font-normal text-fg-muted">
                        {plural(o.counts.openIssues, 'issue')} · {plural(o.counts.openRisks, 'risk')} · {plural(o.counts.openActions, 'action')}
                    </p>
                    <RaidLink href={raidLogHref(engagementBase)} className="inline-flex items-center gap-0.5 self-start text-caption text-action hover:underline">
                        Open RAID log
                        <ChevronRight className="h-3 w-3" aria-hidden />
                    </RaidLink>
                </>
            ) : error ? (
                <p className="text-caption font-normal text-danger" role="alert">Couldn&apos;t load the RAID log · {error}</p>
            ) : (
                <div className="flex flex-col gap-2" aria-busy="true">
                    <div className="h-6 w-20 animate-pulse rounded bg-surface-muted" />
                    <div className="h-3 w-32 animate-pulse rounded bg-surface-muted" />
                </div>
            )}
        </StatusCell>
    )
}

/**
 * Needs you's RAID rows (shared with the tour): your open Actions that are late or due within the week,
 * and Brio's suggestions, those on the log and each memo's.
 */
export function raidNeedsItems(raidLog: RaidLogPayload | null, me: string | null, engagementBase: string, nowMs: number): NeedsItem[] {
    const mine: NeedsItem[] = []
    if (!raidLog) return mine
    if (me) {
        const weekOut = nowMs + 7 * DAY
        const actions = raidLog.items
            .filter((i) => i.type === 'ACTION' && i.status === 'OPEN' && i.ownerUserId === me && i.dueDate)
            .filter((i) => i.overdue || new Date(`${i.dueDate}T00:00:00Z`).getTime() <= weekOut)
            .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
        for (const a of actions) {
            const daysLate = Math.floor((nowMs - new Date(`${a.dueDate}T00:00:00Z`).getTime()) / DAY)
            const where = a.sources[0]?.label?.split(' · ').slice(0, 2).join(' · ')
            mine.push({
                key: `raid-action-${a.id}`,
                icon: <RaidTypeBadge type="ACTION" small />,
                title: a.title,
                context: ['Action', where, 'you own it'].filter(Boolean).join(' · '),
                meta: a.overdue && daysLate > 0
                    ? <span className="font-medium text-danger">{countOf(daysLate, 'day')} overdue</span>
                    : `Due ${dueDay(a.dueDate)}`,
                action: <RaidLink href={raidLogHref(engagementBase)} className={NEEDS_ACTION_CLASS}>Open</RaidLink>,
            })
        }
    }
    // Brio's suggestions: those on the log, then each memo's, which wait on the memo.
    const onLog = raidLog.suggestions.filter((s) => !waitsOnMemo(s))
    if (onLog.length > 0) {
        mine.push({
            key: 'raid-suggestions',
            icon: <Sparkles className="h-4 w-4" style={{ color: BRIO_GREEN }} />,
            title: <span className="inline-flex items-center gap-1">{countOf(onLog.length, 'RAID suggestion')} from <Brio /> <RaidInfo /></span>,
            context: onLog.slice(0, 2).map((s) => s.title).join(' · '),
            action: <RaidLink href={raidLogHref(engagementBase)} className={NEEDS_ACTION_CLASS}>Review</RaidLink>,
        })
    }
    for (const g of memoSuggestionGroups(raidLog.suggestions)) {
        mine.push({
            key: `memo-suggestions-${g.memoId ?? g.title}`,
            icon: <Sparkles className="h-4 w-4" style={{ color: BRIO_GREEN }} />,
            title: <span className="inline-flex items-center gap-1">{countOf(g.count, 'RAID suggestion')} on a memo <RaidInfo /></span>,
            context: [g.title, 'accept or dismiss them with its action items'].filter(Boolean).join(' · '),
            action: <RaidLink href={memoReviewHref(engagementBase, g.memoId)} className={NEEDS_ACTION_CLASS}>Review</RaidLink>,
        })
    }
    return mine
}
