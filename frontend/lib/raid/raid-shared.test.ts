import { describe, it, expect } from 'vitest'
import { compareRaid, filterRaidItems, overviewSectionOf, priorityForPoints, priorityOf, raidLogHref, sourceHref, type RaidPriority, type RaidSourceView, type RaidType } from './raid-shared'

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
