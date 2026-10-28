import { describe, it, expect, vi } from 'vitest'

vi.mock('@/components/files/use-document-versions', () => ({ useDocumentVersions: () => ({ revisions: [], loading: false, error: null, unsupported: false }) }))

import { activityEntries, groupActivity, REVISION_EDIT, type ActivityEntry, type AuditEventRow } from './document-activity-feed'
import type { DriveRevision } from '@/lib/types'

const event = (over: Partial<AuditEventRow>): AuditEventRow => ({
    id: 'e1', eventType: 'DOCUMENT_OPENED', eventAt: '2026-10-20T10:00:00Z', actorName: 'Ana', actorEmail: 'ana@firm.com', metadata: {}, ...over,
})

const revision = (id: string, at: string, name = 'Ben'): DriveRevision => ({
    id, mimeType: 'application/pdf', modifiedTime: at, lastModifyingUser: { displayName: name },
})

describe('activityEntries', () => {
    it('reads each audit event as a person doing something to this file', () => {
        const [entry] = activityEntries([event({})], [], true)
        expect(entry).toMatchObject({ who: 'Ana', what: 'opened this file' })
    })

    it('leaves out indexing, which nobody did', () => {
        expect(activityEntries([event({ eventType: 'DOCUMENT_INDEXED' })], [], true)).toEqual([])
    })

    it('names the stages a stage change moved between', () => {
        const [entry] = activityEntries([event({ eventType: 'DOCUMENT_STATUS_CHANGED', metadata: { oldStatus: 'in_progress', newStatus: 'in_review' } })], [], true)
        expect(entry.detail).toBe('In progress → In review')
    })

    it('never reads an agent change as the agent acting alone', () => {
        const [entry] = activityEntries([event({ eventType: 'DOCUMENT_MOVED', metadata: { viaAgent: true, approvedByLabel: 'Deepak' } })], [], true)
        expect(entry.detail).toBe('via Brio, approved by Deepak')
    })

    it('falls back to the email, then to "Someone", for who', () => {
        expect(activityEntries([event({ actorName: null })], [], true)[0].who).toBe('ana@firm.com')
        expect(activityEntries([event({ actorName: null, actorEmail: null })], [], true)[0].who).toBe('Someone')
    })

    it('merges the storage edits in, newest first', () => {
        const entries = activityEntries(
            [event({ id: 'a', eventAt: '2026-10-20T10:00:00Z' })],
            [revision('r1', '2026-10-21T10:00:00Z'), revision('r0', '2026-10-19T10:00:00Z')],
            true,
        )
        expect(entries.map((e) => e.id)).toEqual(['revision-r1', 'a', 'revision-r0'])
        expect(entries[0]).toMatchObject({ who: 'Ben', what: 'edited this file', type: 'REVISION_EDIT' })
    })

    it('holds back edits older than the loaded events while older events are still unloaded', () => {
        const entries = activityEntries(
            [event({ id: 'a', eventAt: '2026-10-20T10:00:00Z' })],
            [revision('r1', '2026-10-21T10:00:00Z'), revision('r0', '2026-10-19T10:00:00Z')],
            false,
        )
        expect(entries.map((e) => e.id)).toEqual(['revision-r1', 'a'])
    })
})

const entry = (over: Partial<ActivityEntry>): ActivityEntry => ({
    id: Math.random().toString(36).slice(2), type: 'DOCUMENT_OPENED', at: '2026-10-28T10:00:00', who: 'Ana', what: 'opened this file', ...over,
})

describe('groupActivity', () => {
    const NOW = new Date('2026-10-28T18:00:00')

    it('groups by day: Today, Yesterday, then the date', () => {
        const days = groupActivity([
            entry({ at: '2026-10-28T09:00:00' }),
            entry({ at: '2026-10-27T09:00:00', who: 'Ben' }),
            entry({ at: '2026-10-20T09:00:00', who: 'Cy' }),
            entry({ at: '2025-12-01T09:00:00', who: 'Di' }),
        ], NOW)
        expect(days.map((d) => d.label)).toEqual(['Today', 'Yesterday', 'Oct 20', 'Dec 1, 2025'])
    })

    it('folds the same person doing the same thing in a row that day into one line with a count', () => {
        const [today] = groupActivity([
            entry({ at: '2026-10-28T12:00:00' }),
            entry({ at: '2026-10-28T11:00:00' }),
            entry({ at: '2026-10-28T10:00:00' }),
        ], NOW)
        expect(today.items).toHaveLength(1)
        expect(today.items[0]).toMatchObject({ count: 3, at: '2026-10-28T12:00:00' })
    })

    it('keeps apart different people, different actions, different details and different days', () => {
        const days = groupActivity([
            entry({ at: '2026-10-28T12:00:00' }),
            entry({ at: '2026-10-28T11:00:00', who: 'Ben' }),
            entry({ at: '2026-10-28T10:30:00', who: 'Ben', type: REVISION_EDIT, what: 'edited this file' }),
            entry({ at: '2026-10-28T10:00:00', who: 'Ben', type: 'DOCUMENT_STATUS_CHANGED', what: 'changed the stage', detail: 'To do → In progress' }),
            entry({ at: '2026-10-28T09:00:00', who: 'Ben', type: 'DOCUMENT_STATUS_CHANGED', what: 'changed the stage', detail: 'In progress → In review' }),
            entry({ at: '2026-10-27T09:00:00', who: 'Ben', type: 'DOCUMENT_STATUS_CHANGED', what: 'changed the stage', detail: 'In progress → In review' }),
        ], NOW)
        expect(days[0].items.map((i) => i.count)).toEqual([1, 1, 1, 1, 1])
        expect(days[1].items).toHaveLength(1)
    })
})
