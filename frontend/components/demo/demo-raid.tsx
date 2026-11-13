'use client'

import { useState } from 'react'
import { RaidTabView, type RaidHandlers, type RaidNewItem } from '@/components/projects/raid/raid-tab'
import { RaidOverviewView } from '@/components/projects/raid/raid-overview-card'
import {
    autoLineFor,
    liveStatusFor,
    shortDay,
    type RaidItemView,
    type RaidLogPayload,
    type RaidMember,
    type RaidSourceView,
    type RaidType,
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
        ...p,
    }
}

/** The sample engagement's log, as the mock shows it, dated from today. */
export function demoRaidLog(now: Date = new Date()): RaidLogPayload {
    const overdueIssue = item({
        id: 'raid-overdue',
        type: 'ISSUE',
        title: 'QSR-9 · Market & Competitive Intelligence Report overdue by 5 days',
        sourceKind: 'STATUS',
        sources: [chip('STATUS', 'Board')],
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
            title: 'Behind pace · 0% delivered against 36% of time used',
            sourceKind: 'HEALTH',
            sources: [chip('HEALTH', 'Health')],
            autoLine: autoLineFor('pace'),
            ownerUserId: ME.userId,
            notes: `Re-plan with Dana on the ${shortDay(day(5, now))} call`,
            raisedAt: day(-9, now),
        }),
        item({
            id: 'raid-planning',
            type: 'RISK',
            title: '15 planning gaps · missing due dates or assignees',
            sourceKind: 'HEALTH',
            sources: [chip('HEALTH', 'Health')],
            autoLine: autoLineFor('planning'),
            raisedAt: day(-42, now),
        }),
        item({
            id: 'raid-waiting',
            type: 'ISSUE',
            title: 'Reply on QSR-14 · Interview Guide has waited 5 days',
            sourceKind: 'STATUS',
            sources: [chip('STATUS', 'Thread · QSR-14')],
            autoLine: autoLineFor('waiting:qsr-14'),
            ownerUserId: 'tour-sam',
            raisedAt: day(-6, now),
        }),
        item({
            id: 'raid-k1',
            type: 'ASSUMPTION',
            title: `Partnership K-1s arrive by ${shortDay(day(7, now))}`,
            sourceKind: 'MEMO',
            sources: [chip('MEMO', `Memo · Call with Dana · ${shortDay(day(-1, now))}`)],
            ownerUserId: ME.userId,
            notes: `Check ${shortDay(day(10, now))} (reminder set)`,
            raisedAt: day(-1, now),
        }),
        item({
            id: 'raid-approved',
            type: 'DECISION',
            title: 'QSR-3 · Market Sizing approved by Dana',
            sourceKind: 'BOARD',
            sources: [chip('BOARD', 'Board')],
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
            id: 'raid-suggest-depreciation',
            type: 'DECISION',
            title: 'Rental depreciation is scoped separately',
            sourceKind: 'MEMO',
            status: 'SUGGESTED',
            sources: [chip('MEMO', `Memo · Call with Dana · ${shortDay(day(-1, now))}`)],
            raisedAt: day(-1, now),
        }),
        item({
            id: 'raid-suggest-1099',
            type: 'ASSUMPTION',
            title: `Dana sends the brokerage 1099-B by ${shortDay(day(17, now))}`,
            sourceKind: 'THREAD',
            status: 'SUGGESTED',
            sources: [thread("I'll chase the 1099-B and send it before the end of the month.")],
            raisedAt: day(-2, now),
        }),
        item({
            id: 'raid-suggest-pricing',
            type: 'ISSUE',
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
        readOnly: false,
        canCheck: true,
    }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Discussions › RAID on /tour. */
export function DemoRaidTab({ engagementBase = '' }: { engagementBase?: string }) {
    const [log, setLog] = useState<RaidLogPayload>(() => demoRaidLog())
    const update = (fn: (l: RaidLogPayload) => RaidLogPayload) => setLog((l) => fn(l))
    const mapItem = (id: string, fn: (i: RaidItemView) => RaidItemView) =>
        update((l) => ({ ...l, items: l.items.map((i) => (i.id === id ? fn(i) : i)) }))

    const handlers: RaidHandlers = {
        onCheckNow: async () => {
            await wait(700)
            update((l) => ({ ...l, lastCheckedAt: new Date().toISOString() }))
            return { message: 'Nothing new since the last check.', error: null }
        },
        onAccept: async (s) => {
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
                return { ...l, suggestions, items: [{ ...s, status: liveStatusFor(s.type), attachedTo: null }, ...l.items] }
            })
            return null
        },
        onDismiss: async (s) => {
            update((l) => ({ ...l, suggestions: l.suggestions.filter((x) => x.id !== s.id) }))
            return null
        },
        onAdd: async (input: RaidNewItem) => {
            const added = item({
                id: `raid-tour-${Date.now()}`,
                type: input.type as RaidType,
                title: input.title,
                notes: input.notes,
                sourceKind: 'MANUAL',
                sources: [chip('MANUAL', `Added by ${ME.name.split(' ')[0]}`, { internal: false })],
                raisedAt: new Date().toISOString(),
            })
            update((l) => ({ ...l, items: [added, ...l.items] }))
            return null
        },
        onEdit: async (target, patch) => {
            mapItem(target.id, (i) => ({
                ...i,
                ...(patch.title !== undefined && patch.title ? { title: patch.title } : {}),
                ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
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
                closedReason: `Closed by ${ME.name.split(' ')[0]} · ${shortDay(now)}`,
                canReopen: true,
            }))
            return null
        },
        onReopen: async (target) => {
            mapItem(target.id, (i) => ({ ...i, status: liveStatusFor(i.type), closedAt: null, closedReason: null, canReopen: false }))
            return null
        },
    }

    return <RaidTabView log={log} engagementBase={engagementBase} readOnly={false} {...handlers} />
}

/** The Overview's RAID card on /tour, over the same canned log. */
export function DemoRaidOverviewCard({ engagementBase = '' }: { engagementBase?: string }) {
    const [log] = useState<RaidLogPayload>(() => demoRaidLog())
    return <RaidOverviewView log={log} engagementBase={engagementBase} />
}
