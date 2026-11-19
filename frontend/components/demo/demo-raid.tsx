'use client'

import { useEffect, useState } from 'react'
import { RaidTabView, type RaidHandlers, type RaidNewItem } from '@/components/projects/raid/raid-tab'
import { RaidOverviewView } from '@/components/projects/raid/raid-overview-card'
import {
    RAID_CHANGED_EVENT,
    autoLineFor,
    hasPriority,
    liveStatusFor,
    nextWeekStart,
    raidOpenCount,
    priorityOf,
    shortDay,
    type RaidItemView,
    type RaidLogPayload,
    type RaidMember,
    type RaidSourceView,
    type RaidType,
    type RaidChangedDetail,
} from '@/lib/raid/raid-shared'

/**
 * The RAID log on /tour (.claude/plans/brio-features-round-2.md, §9): the app's own tab and Overview card
 * (RaidTabView, RaidOverviewView) over canned entries kept in memory, as in the approved mock. Accept,
 * Dismiss, Add, owner and mitigation edits, Close and Reopen all work here; Check now waits a moment
 * and finds nothing new. Nothing is sent anywhere.
 */

const DAY = 86_400_000

const MEMBERS: RaidMember[] = [
    { userId: 'tour-alex', name: 'Alex Jordan' },
    { userId: 'tour-jordan', name: 'Jordan Lee' },
    { userId: 'tour-sam', name: 'Sam Rivera' },
]
const ME = MEMBERS[0]
/** The tour's signed-in person, who owns the sample's Actions. */
export const TOUR_ME = ME.userId

/** A day `n` days from today (negative for the past), as UTC midnight ISO. */
function day(n: number, now: Date): string {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + n * DAY)
    return d.toISOString()
}

const chip = (kind: RaidSourceView['kind'], label: string, extra: Partial<RaidSourceView> = {}): RaidSourceView =>
    ({ kind, label, documentId: null, memoId: null, quote: null, internal: kind === 'MEMO', ...extra })

function item(p: Partial<RaidItemView> & Pick<RaidItemView, 'id' | 'type' | 'title' | 'sourceKind' | 'sources' | 'raisedAt'>): RaidItemView {
    const owner = p.ownerUserId ? MEMBERS.find((m) => m.userId === p.ownerUserId) : undefined
    return {
        notes: null,
        ownerUserId: null,
        ownerName: owner?.name ?? null,
        status: liveStatusFor(p.type),
        internalSource: p.sources.some((s) => s.internal),
        autoLine: null,
        overdue: false,
        attachedTo: null,
        closedAt: null,
        closedReason: null,
        canReopen: false,
        prioritySetByPerson: false,
        followUp: null,
        ...p,
        dueDate: p.type === 'ACTION' ? p.dueDate ?? null : null,
        // As the app reads it: Medium for a Risk or an Issue not given one, none for the others.
        priority: priorityOf({ type: p.type, priority: p.priority }),
    }
}

/** The sample engagement's log, as the mock shows it, dated from today. */
export function demoRaidLog(now: Date = new Date()): RaidLogPayload {
    const overdueIssue = item({
        id: 'raid-overdue',
        type: 'ISSUE',
        priority: 'HIGH',
        title: 'QSR-9 · Market & Competitive Intelligence Report overdue by 5 days',
        sourceKind: 'STATUS',
        sources: [chip('STATUS', 'Deliverables')],
        autoLine: autoLineFor('overdue:qsr-9'),
        overdue: true,
        ownerUserId: ME.userId,
        raisedAt: day(-5, now),
    })
    const thread = (quote: string) => chip('THREAD', `Thread · QSR-9 · Dana · ${shortDay(day(-2, now))}`, { quote })

    const items: RaidItemView[] = [
        overdueIssue,
        item({
            id: 'raid-pace',
            type: 'RISK',
            priority: 'HIGH',
            title: 'Behind pace · 0% delivered against 36% of time used',
            sourceKind: 'HEALTH',
            sources: [chip('HEALTH', 'Health', { overviewSection: 'pace' })],
            autoLine: autoLineFor('pace'),
            ownerUserId: ME.userId,
            notes: `Re-plan with Dana on the ${shortDay(day(5, now))} call`,
            raisedAt: day(-9, now),
        }),
        item({
            id: 'raid-planning',
            type: 'RISK',
            priority: 'LOW',
            title: '15 planning gaps · missing due dates or assignees',
            sourceKind: 'HEALTH',
            sources: [chip('HEALTH', 'Health', { overviewSection: 'planning' })],
            autoLine: autoLineFor('planning'),
            raisedAt: day(-42, now),
        }),
        item({
            id: 'raid-waiting',
            type: 'ISSUE',
            priority: 'MEDIUM',
            title: 'Reply on QSR-14 · Interview Guide has waited 5 days',
            sourceKind: 'STATUS',
            sources: [chip('STATUS', 'Thread · QSR-14')],
            autoLine: autoLineFor('waiting:qsr-14'),
            ownerUserId: 'tour-sam',
            raisedAt: day(-6, now),
        }),
        item({
            id: 'raid-k1',
            type: 'ACTION',
            title: 'Dana to send the partnership K-1s',
            sourceKind: 'MEMO',
            sources: [chip('MEMO', `Memo · Call with Dana · ${shortDay(day(-1, now))}`)],
            ownerUserId: ME.userId,
            dueDate: day(7, now).slice(0, 10),
            notes: "Chase Dana if they aren't in",
            raisedAt: day(-1, now),
        }),
        item({
            id: 'raid-letter',
            type: 'ACTION',
            title: 'Send Dana the revised engagement letter',
            sourceKind: 'MANUAL',
            sources: [chip('MANUAL', `Added by ${ME.name.split(' ')[0]}`, { internal: false })],
            ownerUserId: ME.userId,
            dueDate: day(-2, now).slice(0, 10),
            // Past its due date: the danger tone, as the app shows it.
            overdue: true,
            raisedAt: day(-8, now),
        }),
        item({
            id: 'raid-approved',
            type: 'DECISION',
            title: 'QSR-3 · Market Sizing approved by Dana',
            sourceKind: 'BOARD',
            sources: [chip('BOARD', 'Deliverables')],
            autoLine: autoLineFor('approved:qsr-3'),
            raisedAt: day(-11, now),
        }),
        item({
            id: 'raid-scope',
            type: 'DECISION',
            title: 'Scope excludes state returns',
            sourceKind: 'MEMO',
            sources: [chip('MEMO', `Memo · Kickoff call · ${shortDay(day(-15, now))}`)],
            ownerUserId: ME.userId,
            raisedAt: day(-15, now),
        }),
    ]

    const suggestions: RaidItemView[] = [
        item({
            // The suggestion waiting on the tour's newest memo (demo-memos.tsx), so the RAID tab's line to
            // it lands on the same memo, with the same entry.
            id: 'tour-raid-weekly-1',
            type: 'RISK',
            priority: 'MEDIUM',
            title: 'The signed change order may hold up the launch',
            sourceKind: 'MEMO',
            status: 'SUGGESTED',
            sources: [chip('MEMO', `Memo · Weekly check-in · ${shortDay(day(-2, now))}`, { memoId: 'tour-memo-weekly' })],
            raisedAt: day(-2, now),
        }),
        item({
            id: 'raid-suggest-1099',
            type: 'RISK',
            priority: 'MEDIUM',
            title: 'The brokerage 1099-B may not arrive before the end of the month',
            sourceKind: 'THREAD',
            status: 'SUGGESTED',
            sources: [thread("The brokerage still hasn't issued the 1099-B, and they won't say when.")],
            raisedAt: day(-2, now),
        }),
        item({
            id: 'raid-suggest-pricing',
            type: 'ISSUE',
            priority: 'MEDIUM',
            title: 'Pricing in section 4.2 may be out of date',
            sourceKind: 'THREAD',
            status: 'SUGGESTED',
            sources: [thread('Also, is the pricing in 4.2 current?')],
            attachedTo: { id: overdueIssue.id, type: 'ISSUE', title: 'QSR-9 overdue' },
            raisedAt: day(-2, now),
        }),
    ]

    return {
        items,
        suggestions,
        members: MEMBERS,
        lastCheckedAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 8, 2)).toISOString(),
        // The suggestions above came from that check, and nothing was said since.
        conversation: 'current',
        readOnly: false,
        canCheck: true,
    }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** The RAID tab on /tour. */
export function DemoRaidTab({ engagementBase = '' }: { engagementBase?: string }) {
    const [log, setLog] = useState<RaidLogPayload>(() => demoRaidLog())
    const update = (fn: (l: RaidLogPayload) => RaidLogPayload) => setLog((l) => fn(l))
    const mapItem = (id: string, fn: (i: RaidItemView) => RaidItemView) =>
        update((l) => ({ ...l, items: l.items.map((i) => (i.id === id ? fn(i) : i)) }))

    const handlers: RaidHandlers = {
        onCheckNow: async () => {
            await wait(700)
            update((l) => ({ ...l, lastCheckedAt: new Date().toISOString(), conversation: 'current' }))
            return { message: 'Nothing new since the last check.', error: null }
        },
        onAccept: async (s, priority, title) => {
            update((l) => {
                const suggestions = l.suggestions.filter((x) => x.id !== s.id)
                const target = s.attachedTo ? l.items.find((i) => i.id === s.attachedTo!.id) : undefined
                if (target) {
                    return {
                        ...l,
                        suggestions,
                        items: l.items.map((i) => (i.id === target.id
                            ? { ...i, sources: [...i.sources, ...s.sources], internalSource: i.internalSource || s.internalSource }
                            : i)),
                    }
                }
                return {
                    ...l,
                    suggestions,
                    items: [{ ...s, status: liveStatusFor(s.type), attachedTo: null, ...(priority ? { priority, prioritySetByPerson: true } : {}), ...(title ? { title } : {}) }, ...l.items],
                }
            })
            return null
        },
        onDismiss: async (s) => {
            update((l) => ({ ...l, suggestions: l.suggestions.filter((x) => x.id !== s.id) }))
            return null
        },
        onAdd: async (input: RaidNewItem) => {
            const isAction = input.type === 'ACTION'
            const owner = isAction ? (input.ownerUserId === undefined ? ME.userId : input.ownerUserId) : null
            const added = item({
                id: `raid-tour-${Date.now()}`,
                type: input.type as RaidType,
                title: input.title,
                notes: input.notes,
                priority: input.priority ?? null,
                prioritySetByPerson: !!input.priority,
                sourceKind: 'MANUAL',
                sources: [chip('MANUAL', `Added by ${ME.name.split(' ')[0]}`, { internal: false })],
                ownerUserId: owner,
                dueDate: isAction ? input.dueDate ?? null : null,
                raisedAt: new Date().toISOString(),
            })
            update((l) => ({ ...l, items: [added, ...l.items] }))
            return null
        },
        onEdit: async (target, patch) => {
            // A new type takes its own fields, as the app's store does.
            const retype = (i: RaidItemView): Partial<RaidItemView> => {
                const type = patch.type
                if (!type || type === i.type) return {}
                const isAction = type === 'ACTION'
                const owner = isAction ? i.ownerUserId ?? ME.userId : i.ownerUserId
                return {
                    type,
                    status: i.status === 'CLOSED' ? 'CLOSED' : liveStatusFor(type),
                    closedReason: i.closedReason?.replace(/^(Done|Closed)\b/, isAction ? 'Done' : 'Closed') ?? null,
                    priority: hasPriority(type) ? i.priority ?? 'MEDIUM' : null,
                    prioritySetByPerson: hasPriority(type),
                    dueDate: isAction ? i.dueDate ?? nextWeekStart() : null,
                    overdue: false,
                    ownerUserId: owner,
                    ownerName: MEMBERS.find((m) => m.userId === owner)?.name ?? null,
                }
            }
            mapItem(target.id, (i) => ({
                ...i,
                ...retype(i),
                ...(patch.title !== undefined && patch.title ? { title: patch.title } : {}),
                ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
                ...(patch.priority ? { priority: patch.priority, prioritySetByPerson: true } : {}),
                ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate, overdue: !!patch.dueDate && patch.dueDate < new Date().toISOString().slice(0, 10) } : {}),
                ...(patch.ownerUserId !== undefined
                    ? { ownerUserId: patch.ownerUserId, ownerName: MEMBERS.find((m) => m.userId === patch.ownerUserId)?.name ?? null }
                    : {}),
            }))
            return null
        },
        onClose: async (target) => {
            const now = new Date()
            mapItem(target.id, (i) => ({
                ...i,
                status: 'CLOSED',
                closedAt: now.toISOString(),
                closedReason: `${i.type === 'ACTION' ? 'Done' : 'Closed'} by ${ME.name.split(' ')[0]} · ${shortDay(now)}`,
                canReopen: true,
            }))
            return null
        },
        onReopen: async (target) => {
            mapItem(target.id, (i) => ({ ...i, status: liveStatusFor(i.type), closedAt: null, closedReason: null, canReopen: false }))
            return null
        },
    }

    // The tab row's count and dot follow the log here, as the app's do.
    useEffect(() => {
        window.dispatchEvent(new CustomEvent<RaidChangedDetail>(RAID_CHANGED_EVENT, {
            detail: { projectId: TOUR_RAID_ID, count: raidOpenCount(log.items), suggested: log.suggestions.length },
        }))
    }, [log])

    return <RaidTabView log={log} engagementBase={engagementBase} readOnly={false} {...handlers} />
}

/** What the tour's RAID tab announces itself as, in place of an engagement id. */
const TOUR_RAID_ID = 'tour'

/** The tour's RAID tab count and suggestion dot: the canned log's, then whatever the tab says. */
export function useDemoRaidCounts(): { count: number; suggested: number } {
    const [counts, setCounts] = useState(() => {
        const l = demoRaidLog()
        return { count: raidOpenCount(l.items), suggested: l.suggestions.length }
    })
    useEffect(() => {
        const onChange = (e: Event) => {
            const d = (e as CustomEvent<RaidChangedDetail>).detail
            if (d?.projectId === TOUR_RAID_ID) setCounts({ count: d.count, suggested: d.suggested ?? 0 })
        }
        window.addEventListener(RAID_CHANGED_EVENT, onChange)
        return () => window.removeEventListener(RAID_CHANGED_EVENT, onChange)
    }, [])
    return counts
}

/** The Overview's RAID card on /tour, over the same canned log. */
export function DemoRaidOverviewCard({ engagementBase = '' }: { engagementBase?: string }) {
    const [log] = useState<RaidLogPayload>(() => demoRaidLog())
    return <RaidOverviewView log={log} engagementBase={engagementBase} />
}
