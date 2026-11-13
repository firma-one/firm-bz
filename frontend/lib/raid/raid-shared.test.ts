import { describe, it, expect } from 'vitest'
import { overviewSectionOf, sourceHref, type RaidSourceView } from './raid-shared'

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

    it('sends a thread to Discussions, a memo to Files and a status or Board entry to the Board', () => {
        expect(sourceHref(BASE, source({ kind: 'THREAD', documentId: DOC }))).toBe(`${BASE}/comments#doc-comment:${DOC}`)
        expect(sourceHref(BASE, source({ kind: 'MEMO', memoId: DOC }))).toBe(`${BASE}/files#doc-file:${DOC}`)
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
