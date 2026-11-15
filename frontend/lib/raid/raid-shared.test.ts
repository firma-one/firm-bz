import { describe, it, expect } from 'vitest'
import {
    compareRaid,
    displayTypeOf,
    filterRaidItems,
    isActionOverdue,
    isLegacyAssumption,
    nextWeekStart,
    overviewSectionOf,
    parseDueDate,
    parseFollowUp,
    priorityForPoints,
    priorityOf,
    raidCountsByType,
    raidLogHref,
    raidOverviewOf,
    raidStatusLabel,
    raidTone,
    sourceHref,
    type RaidItemView,
    type RaidPriority,
    type RaidSourceView,
    type RaidStatus,
    type RaidType,
} from './raid-shared'

/** Where a RAID source chip goes: each source to the place it came from. */

const source = (p: Partial<RaidSourceView> & Pick<RaidSourceView, 'kind'>): RaidSourceView =>
    ({ label: p.kind, documentId: null, memoId: null, quote: null, internal: false, ...p })

const BASE = '/d/g/f/firm/c/client/e/q2'
const DOC = '5b0e1f3a-6c1d-4e2b-9a7f-1d2c3b4a5e6f'

describe('sourceHref', () => {
    it('sends a Health entry to the Overview chart it comes from, by the Overview\'s own path', () => {
        expect(sourceHref(BASE, source({ kind: 'HEALTH', overviewSection: 'pace' }))).toBe(`${BASE}/analytics#ring-pace`)
        expect(sourceHref(BASE, source({ kind: 'HEALTH', overviewSection: 'planning' }))).toBe(`${BASE}/analytics#ring-planning`)
        // Not knowing which chart, the Overview itself: still where health lives.
        expect(sourceHref(BASE, source({ kind: 'HEALTH' }))).toBe(`${BASE}/analytics`)
    })

    it('sends a thread to Discussions, a memo to Memos with it open, and a status or Board entry to the Board', () => {
        expect(sourceHref(BASE, source({ kind: 'THREAD', documentId: DOC }))).toBe(`${BASE}/comments#doc-comment:${DOC}`)
        expect(sourceHref(BASE, source({ kind: 'MEMO', memoId: DOC }))).toBe(`${BASE}/comments?view=memos&memo=${DOC}`)
        expect(sourceHref(BASE, source({ kind: 'BOARD', documentId: DOC }))).toBe(`${BASE}/board#doc-file:${DOC}`)
        expect(sourceHref(BASE, source({ kind: 'MANUAL' }))).toBeNull()
    })

    it('on /tour, which switches tabs with ?tab=, sends health to the Overview chart and the rest to their tab', () => {
        expect(sourceHref('', source({ kind: 'HEALTH', overviewSection: 'pace' }))).toBe('?tab=analytics#ring-pace')
        expect(sourceHref('', source({ kind: 'HEALTH', overviewSection: 'planning' }))).toBe('?tab=analytics#ring-planning')
        expect(sourceHref('', source({ kind: 'HEALTH' }))).toBe('?tab=analytics')
        // The tour's entries carry no ids: the tab, not the item.
        expect(sourceHref('', source({ kind: 'THREAD' }))).toBe('?tab=comments')
        expect(sourceHref('', source({ kind: 'STATUS', label: 'Thread · QSR-14' }))).toBe('?tab=comments')
        expect(sourceHref('', source({ kind: 'MEMO' }))).toBe('?tab=comments&view=memos')
        expect(sourceHref('', source({ kind: 'STATUS', label: 'Board' }))).toBe('?tab=board')
        expect(sourceHref('', source({ kind: 'MANUAL' }))).toBeNull()
    })
})

describe('overviewSectionOf', () => {
    it('reads the pace and planning signals, and nothing else', () => {
        expect(overviewSectionOf('pace')).toBe('pace')
        expect(overviewSectionOf('planning')).toBe('planning')
        expect(overviewSectionOf(`overdue:${DOC}`)).toBeUndefined()
        expect(overviewSectionOf(null)).toBeUndefined()
    })
})

describe('raidLogHref', () => {
    it('is the engagement\'s RAID tab: its path in the app, ?tab= on /tour', () => {
        expect(raidLogHref(BASE)).toBe(`${BASE}/raid`)
        expect(raidLogHref('')).toBe('?tab=raid')
    })
})

describe('priority', () => {
    it('only Risks and Issues have one; one saved before priorities reads as Medium', () => {
        expect(priorityOf({ type: 'RISK', priority: 'HIGH' })).toBe('HIGH')
        expect(priorityOf({ type: 'ISSUE', priority: null })).toBe('MEDIUM')
        expect(priorityOf({ type: 'ASSUMPTION', priority: 'HIGH' })).toBeNull()
        expect(priorityOf({ type: 'DECISION' })).toBeNull()
    })

    it("grades points as the Health score's deductions list does: 15 High, 8 Medium, less Low", () => {
        expect([16, 15, 14, 8, 7, 0].map(priorityForPoints)).toEqual(['HIGH', 'HIGH', 'MEDIUM', 'MEDIUM', 'LOW', 'LOW'])
    })

    it('reads the log High first, then issues before risks, then newest, with no priority last', () => {
        const e = (id: string, type: RaidType, priority: RaidPriority | null, day: number) =>
            ({ id, type, priority, status: 'OPEN' as const, raisedAt: `2026-11-${String(day).padStart(2, '0')}T00:00:00Z` })
        const items = [
            e('assumption', 'ASSUMPTION', null, 14),
            e('low-issue', 'ISSUE', 'LOW', 13),
            e('high-risk', 'RISK', 'HIGH', 1),
            e('high-issue-old', 'ISSUE', 'HIGH', 2),
            e('high-issue-new', 'ISSUE', 'HIGH', 9),
            e('medium-risk', 'RISK', 'MEDIUM', 12),
        ]
        expect([...items].sort(compareRaid).map((i) => i.id)).toEqual(['high-issue-new', 'high-issue-old', 'high-risk', 'medium-risk', 'low-issue', 'assumption'])
        expect(filterRaidItems(items, 'ALL', 'open').map((i) => i.id)[0]).toBe('high-issue-new')
    })
})

describe('Actions, and Assumptions saved before them', () => {
    it('an old Assumption shows with the Decisions, and is known as one', () => {
        expect(displayTypeOf('ASSUMPTION')).toBe('DECISION')
        expect((['RISK', 'ACTION', 'ISSUE', 'DECISION'] as const).map(displayTypeOf)).toEqual(['RISK', 'ACTION', 'ISSUE', 'DECISION'])
        expect(isLegacyAssumption({ type: 'ASSUMPTION' })).toBe(true)
        expect(isLegacyAssumption({ type: 'DECISION' })).toBe(false)
    })

    it('a closed Action reads "Done"; everything else its status', () => {
        expect(raidStatusLabel({ type: 'ACTION', status: 'CLOSED' })).toBe('Done')
        expect(raidStatusLabel({ type: 'ACTION', status: 'OPEN' })).toBe('Open')
        expect(raidStatusLabel({ type: 'RISK', status: 'CLOSED' })).toBe('Closed')
        expect(raidStatusLabel({ type: 'DECISION', status: 'RECORDED' })).toBe('Recorded')
    })

    it('an open Action past its date is late, as an overdue Issue is', () => {
        expect(isActionOverdue({ type: 'ACTION', status: 'OPEN', dueDate: '2026-11-13' }, '2026-11-15')).toBe(true)
        expect(isActionOverdue({ type: 'ACTION', status: 'OPEN', dueDate: '2026-11-15' }, '2026-11-15')).toBe(false)
        expect(isActionOverdue({ type: 'ACTION', status: 'CLOSED', dueDate: '2026-11-13' }, '2026-11-15')).toBe(false)
        expect(isActionOverdue({ type: 'ACTION', status: 'OPEN', dueDate: null }, '2026-11-15')).toBe(false)
        expect(raidTone({ type: 'ACTION', status: 'OPEN', overdue: true })).toBe('late')
        expect(raidTone({ type: 'ISSUE', status: 'OPEN', overdue: true })).toBe('late')
        expect(raidTone({ type: 'RISK', status: 'OPEN', overdue: true })).toBe('open')
        expect(raidTone({ type: 'ACTION', status: 'CLOSED', overdue: true })).toBe('closed')
    })

    it('reads a due date only as a real YYYY-MM-DD day', () => {
        expect(parseDueDate('2026-11-20')).toBe('2026-11-20')
        expect(parseDueDate('2028-02-29')).toBe('2028-02-29')
        for (const bad of ['2026-02-30', '2026-13-01', '2026-11-5', '20 Nov 2026', '2026-11-20T00:00:00Z', '', null, 20261120]) {
            expect(parseDueDate(bad)).toBeNull()
        }
    })

    it('reads a follow-up as one of the two kinds, or none', () => {
        expect(parseFollowUp('DELIVERABLE')).toBe('DELIVERABLE')
        expect(parseFollowUp('PREPARE')).toBe('PREPARE')
        expect(parseFollowUp('deliverable')).toBeNull()
        expect(parseFollowUp(null)).toBeNull()
    })

    it('the start of next week is the coming Monday, a week on from a Monday', () => {
        expect(nextWeekStart('2026-11-11')).toBe('2026-11-16') // Wednesday
        expect(nextWeekStart('2026-11-15')).toBe('2026-11-16') // Sunday
        expect(nextWeekStart('2026-11-14')).toBe('2026-11-16') // Saturday
        expect(nextWeekStart('2026-11-16')).toBe('2026-11-23') // Monday
        expect(nextWeekStart('2026-12-30')).toBe('2027-01-04') // across the year
    })
})

describe('counting the log', () => {
    const view = (id: string, type: RaidType, status: RaidStatus, p: Partial<RaidItemView> = {}): RaidItemView => ({
        id, type, status, title: id, notes: null, ownerUserId: null, ownerName: null, sourceKind: 'MANUAL', sources: [], internalSource: false,
        autoLine: null, overdue: false, priority: null, dueDate: null, followUp: null, prioritySetByPerson: false, attachedTo: null,
        raisedAt: '2026-11-10T00:00:00Z', closedAt: null, closedReason: null, canReopen: false, ...p,
    })
    const items = [
        view('risk', 'RISK', 'OPEN'),
        view('action-1', 'ACTION', 'OPEN', { dueDate: '2026-11-13', overdue: true, raisedAt: '2026-11-08T00:00:00Z' }),
        view('action-2', 'ACTION', 'OPEN', { dueDate: '2026-11-20', raisedAt: '2026-11-12T00:00:00Z' }),
        view('action-done', 'ACTION', 'CLOSED'),
        view('issue', 'ISSUE', 'OPEN'),
        view('decision', 'DECISION', 'RECORDED', { raisedAt: '2026-11-09T00:00:00Z' }),
        view('assumption', 'ASSUMPTION', 'OPEN', { raisedAt: '2026-11-01T00:00:00Z' }),
    ]

    it('counts an old Assumption with the Decisions, and lists it under them', () => {
        expect(raidCountsByType(items, 'open')).toEqual({ ALL: 6, RISK: 1, ACTION: 2, ISSUE: 1, DECISION: 2 })
        expect(raidCountsByType(items, 'closed')).toEqual({ ALL: 1, RISK: 0, ACTION: 1, ISSUE: 0, DECISION: 0 })
        expect(filterRaidItems(items, 'DECISION', 'open').map((i) => i.id)).toEqual(['decision', 'assumption'])
        expect(filterRaidItems(items, 'ACTION', 'open').map((i) => i.id)).toEqual(['action-2', 'action-1'])
    })

    it("the Overview counts open Risks, Actions and Issues, and Decisions with the old Assumptions", () => {
        const overview = raidOverviewOf({ items, suggestions: [] })
        expect(overview.counts).toEqual({ openRisks: 1, openActions: 2, openIssues: 1, decisions: 2 })
        // Issues before risks before actions, newest first.
        expect(overview.open.map((i) => i.id)).toEqual(['issue', 'risk', 'action-2', 'action-1'])
        expect(overview.latestDecision?.id).toBe('decision')
    })
})
