import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

/**
 * A RAID entry's merged sources: a thread quote inside `extraSources` (JSON) is stored encrypted, as
 * the row's own `quote` is by the Prisma extension. Nothing here reaches the database.
 */

const db = vi.hoisted(() => ({
    engagementRaidItem: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    engagementMember: { findFirst: vi.fn() },
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/files/file-creator', () => ({ loadPeople: vi.fn() }))
vi.mock('@/lib/auth/display-name', () => ({ resolveNames: vi.fn() }))

import { acceptRaidSuggestion, addRaidItem, editRaidItem, extraSourcesOf, sealExtraSources, type RaidExtraSource } from './raid-store'

beforeAll(() => {
    // A throwaway key, never a real one.
    process.env.ENCRYPTION_KEY_V1 = 'c'.repeat(64)
    delete process.env.CURRENT_KEY_VERSION
})

const SOURCES: RaidExtraSource[] = [
    { kind: 'THREAD', ref: 'm1', quote: 'We may miss the K-1 deadline', internal: false, at: '2026-11-14T10:00:00Z' },
    { kind: 'MEMO', ref: 'memo-1', internal: true, at: '2026-11-14T10:05:00Z' },
]

describe('extraSources', () => {
    it('stores a thread quote encrypted and reads it back as written', () => {
        const stored = sealExtraSources(SOURCES)
        expect(JSON.stringify(stored)).not.toContain('K-1')
        expect(stored[0].quote).toMatch(/^v1\$/)
        expect(extraSourcesOf(JSON.parse(JSON.stringify(stored)))).toEqual(SOURCES)
    })

    it('reads a quote saved before encryption as it is', () => {
        expect(extraSourcesOf([{ kind: 'THREAD', ref: 'm1', quote: 'plain words', internal: false, at: '' }])[0].quote).toBe('plain words')
    })

    it('never keeps words for a memo source, whatever a row holds', () => {
        expect(extraSourcesOf([{ kind: 'MEMO', ref: 'memo-1', quote: 'a memo line', internal: true, at: '' }])[0]).not.toHaveProperty('quote')
    })
})

describe('priority', () => {
    const ITEM = '44444444-4444-4444-8444-444444444444'
    const ACTOR = { userId: 'u-lead', firstName: 'Alex' }
    const row = (p: Record<string, unknown>) => ({ id: ITEM, engagementId: 'e1', status: 'OPEN', sourceKind: 'HEALTH', type: 'RISK', priority: 'LOW', prioritySetBy: null, ...p })

    beforeEach(() => {
        db.engagementRaidItem.findFirst.mockReset()
        db.engagementRaidItem.update.mockReset().mockResolvedValue({})
        db.engagementRaidItem.create.mockReset().mockResolvedValue({ id: ITEM })
    })

    it("a person's choice is theirs: the sync won't change it after", async () => {
        db.engagementRaidItem.findFirst.mockResolvedValue(row({}))
        await editRaidItem('e1', ACTOR, ITEM, { priority: 'HIGH' })
        expect(db.engagementRaidItem.update).toHaveBeenCalledWith({ where: { id: ITEM }, data: { updatedBy: 'u-lead', priority: 'HIGH', prioritySetBy: 'u-lead' } })
    })

    it('refuses one on an Assumption or a Decision, and anything but High, Medium or Low', async () => {
        db.engagementRaidItem.findFirst.mockResolvedValue(row({ type: 'ASSUMPTION' }))
        await expect(editRaidItem('e1', ACTOR, ITEM, { priority: 'HIGH' })).rejects.toThrow('Only Risks and Issues have a priority.')
        db.engagementRaidItem.findFirst.mockResolvedValue(row({}))
        await expect(editRaidItem('e1', ACTOR, ITEM, { priority: 'URGENT' })).rejects.toThrow('Choose High, Medium or Low.')
        expect(db.engagementRaidItem.update).not.toHaveBeenCalled()
    })

    it("an entry a person adds: a Risk or an Issue starts at Medium as theirs; others have none", async () => {
        await addRaidItem({ engagementId: 'e1', firmId: 'f1', actor: ACTOR, type: 'ISSUE', title: 'Brand guidelines missing' })
        expect(db.engagementRaidItem.create.mock.calls[0][0].data).toMatchObject({ priority: 'MEDIUM', prioritySetBy: 'u-lead' })
        await addRaidItem({ engagementId: 'e1', firmId: 'f1', actor: ACTOR, type: 'RISK', title: 'Rate card may change', priority: 'HIGH' })
        expect(db.engagementRaidItem.create.mock.calls[1][0].data).toMatchObject({ priority: 'HIGH' })
        await addRaidItem({ engagementId: 'e1', firmId: 'f1', actor: ACTOR, type: 'DECISION', title: 'Scope excludes state returns' })
        expect(db.engagementRaidItem.create.mock.calls[2][0].data).toMatchObject({ priority: null, prioritySetBy: null })
    })

    it("accepting keeps Brio's priority, or the one chosen on the card as the person's", async () => {
        db.engagementRaidItem.findFirst.mockResolvedValue(row({ status: 'SUGGESTED', sourceKind: 'MEMO', priority: 'MEDIUM' }))
        await acceptRaidSuggestion('e1', ACTOR, ITEM)
        expect(db.engagementRaidItem.update.mock.calls[0][0].data).not.toHaveProperty('priority')
        await acceptRaidSuggestion('e1', ACTOR, ITEM, { priority: 'HIGH' })
        expect(db.engagementRaidItem.update.mock.calls[1][0].data).toMatchObject({ priority: 'HIGH', prioritySetBy: 'u-lead' })
    })
})
