import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

/**
 * A RAID entry's merged sources: a thread quote inside `extraSources` (JSON) is stored encrypted, as
 * the row's own `quote` is by the Prisma extension. Nothing here reaches the database.
 */

const db = vi.hoisted(() => ({
    engagementRaidItem: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    engagementMember: { findFirst: vi.fn() },
}))
const sync = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/files/file-creator', () => ({ loadPeople: vi.fn() }))
vi.mock('@/lib/auth/display-name', () => ({ resolveNames: vi.fn() }))
// The reminder an Action makes has its own tests (raid-action-reminders.test.ts): only that it's asked to follow.
vi.mock('./raid-action-reminders', () => ({ syncActionReminder: sync }))

import { nextWeekStart } from './raid-shared'
import { acceptRaidSuggestion, addRaidItem, editRaidItem, extraSourcesOf, sealExtraSources, type RaidExtraSource } from './raid-store'

/** What every write reads back, for the reminder sync. */
const REMINDER_SELECT = { id: true, type: true, status: true, ownerUserId: true, dueDate: true, title: true, firmId: true, engagementId: true }

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
        db.engagementMember.findFirst.mockReset().mockResolvedValue(null)
        sync.mockClear()
    })

    it("a person's choice is theirs: the sync won't change it after", async () => {
        db.engagementRaidItem.findFirst.mockResolvedValue(row({}))
        await editRaidItem('e1', ACTOR, ITEM, { priority: 'HIGH' })
        expect(db.engagementRaidItem.update).toHaveBeenCalledWith({
            where: { id: ITEM },
            data: { updatedBy: 'u-lead', priority: 'HIGH', prioritySetBy: 'u-lead' },
            select: REMINDER_SELECT,
        })
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
        db.engagementRaidItem.findFirst.mockResolvedValue(row({ status: 'SUGGESTED', sourceKind: 'MEMO', priority: 'MEDIUM', dueDate: null, followUp: null, ownerUserId: null }))
        await acceptRaidSuggestion('e1', ACTOR, ITEM)
        // Brio's grade stays Brio's.
        expect(db.engagementRaidItem.update.mock.calls[0][0]).toMatchObject({
            data: { type: 'RISK', status: 'OPEN', priority: 'MEDIUM', prioritySetBy: null, dueDate: null, followUp: null, ownerUserId: null },
            select: REMINDER_SELECT,
        })
        await acceptRaidSuggestion('e1', ACTOR, ITEM, { priority: 'HIGH' })
        expect(db.engagementRaidItem.update.mock.calls[1][0].data).toMatchObject({ priority: 'HIGH', prioritySetBy: 'u-lead' })
    })
})

describe('Actions', () => {
    const ITEM = '55555555-5555-4555-8555-555555555555'
    const ACTOR = { userId: 'u-lead', firstName: 'Alex' }
    const OTHER = '66666666-6666-4666-8666-666666666666'
    const add = (p: Record<string, unknown>) => addRaidItem({ engagementId: 'e1', firmId: 'f1', actor: ACTOR, type: 'ACTION', title: 'Send Dana the revised engagement letter', ...p })
    const suggestion = (p: Record<string, unknown>) => ({
        id: ITEM, engagementId: 'e1', firmId: 'f1', status: 'SUGGESTED', sourceKind: 'MEMO', sourceRef: 'memo-1', type: 'RISK', title: 'K-1s may be late',
        priority: 'HIGH', prioritySetBy: null, dueDate: null, followUp: null, ownerUserId: null, attachedToId: null, ...p,
    })

    beforeEach(() => {
        db.engagementRaidItem.findFirst.mockReset()
        db.engagementRaidItem.update.mockReset().mockImplementation(async (args: { data: Record<string, unknown> }) => ({ id: ITEM, ...args.data }))
        db.engagementRaidItem.create.mockReset().mockImplementation(async (args: { data: Record<string, unknown> }) => ({ id: ITEM, ...args.data }))
        // The person acting is a Lead on the engagement.
        db.engagementMember.findFirst.mockReset().mockImplementation(async (args: { where: { userId: string } }) => ({ userId: args.where.userId }))
        sync.mockClear()
    })

    it("one a person adds is theirs and due the start of next week, unless they chose otherwise", async () => {
        await add({})
        const data = db.engagementRaidItem.create.mock.calls[0][0].data
        expect(data).toMatchObject({ type: 'ACTION', status: 'OPEN', ownerUserId: 'u-lead', priority: null, dueDate: new Date(`${nextWeekStart()}T00:00:00Z`) })
        expect(db.engagementRaidItem.create.mock.calls[0][0].select).toEqual(REMINDER_SELECT)
        expect(sync).toHaveBeenCalledWith(null, expect.objectContaining({ id: ITEM, type: 'ACTION', ownerUserId: 'u-lead' }))

        await add({ ownerUserId: OTHER, dueDate: '2026-12-04' })
        expect(db.engagementRaidItem.create.mock.calls[1][0].data).toMatchObject({ ownerUserId: OTHER, dueDate: new Date('2026-12-04T00:00:00Z') })
        await add({ ownerUserId: null })
        expect(db.engagementRaidItem.create.mock.calls[2][0].data).toMatchObject({ ownerUserId: null })
    })

    it("one added by someone who can't own entries here is left unowned", async () => {
        db.engagementMember.findFirst.mockResolvedValue(null)
        await add({})
        expect(db.engagementRaidItem.create.mock.calls[0][0].data).toMatchObject({ ownerUserId: null })
    })

    it('only an Action has a due date', async () => {
        await expect(addRaidItem({ engagementId: 'e1', firmId: 'f1', actor: ACTOR, type: 'RISK', title: 'Rate card may change', dueDate: '2026-12-04' }))
            .rejects.toThrow('Only Actions have a due date.')
        await expect(add({ dueDate: '2026-02-30' })).rejects.toThrow('Choose a due date.')
        expect(db.engagementRaidItem.create).not.toHaveBeenCalled()
        // A Risk added without one has none.
        await addRaidItem({ engagementId: 'e1', firmId: 'f1', actor: ACTOR, type: 'RISK', title: 'Rate card may change' })
        expect(db.engagementRaidItem.create.mock.calls[0][0].data).toMatchObject({ dueDate: null, ownerUserId: null })
    })

    it('no new entry is an Assumption', async () => {
        await expect(add({ type: 'ASSUMPTION' })).rejects.toThrow('Choose Risk, Action, Issue or Decision.')
    })

    it("accepting a suggestion as an Action gives it a due date and the accepter, and drops its priority", async () => {
        db.engagementRaidItem.findFirst.mockResolvedValue(suggestion({}))
        await acceptRaidSuggestion('e1', ACTOR, ITEM, { type: 'ACTION', dueDate: '2026-11-20' })
        expect(db.engagementRaidItem.update.mock.calls[0][0].data).toMatchObject({
            type: 'ACTION', status: 'OPEN', priority: null, prioritySetBy: null, dueDate: new Date('2026-11-20T00:00:00Z'), ownerUserId: 'u-lead',
        })
        expect(sync).toHaveBeenCalledWith(null, expect.objectContaining({ type: 'ACTION', ownerUserId: 'u-lead' }))
    })

    it("accepting Brio's Action keeps its date, its follow-up and its owner", async () => {
        db.engagementRaidItem.findFirst.mockResolvedValue(suggestion({ type: 'ACTION', priority: null, dueDate: new Date('2026-11-16T00:00:00Z'), followUp: 'DELIVERABLE', ownerUserId: OTHER }))
        await acceptRaidSuggestion('e1', ACTOR, ITEM)
        expect(db.engagementRaidItem.update.mock.calls[0][0].data).toMatchObject({
            type: 'ACTION', priority: null, dueDate: new Date('2026-11-16T00:00:00Z'), followUp: 'DELIVERABLE', ownerUserId: OTHER,
        })
    })

    it('an Action accepted as something else loses its date and follow-up; made a Risk, it starts at Medium as the person\'s', async () => {
        db.engagementRaidItem.findFirst.mockResolvedValue(suggestion({ type: 'ACTION', priority: null, dueDate: new Date('2026-11-16T00:00:00Z'), followUp: 'PREPARE' }))
        await acceptRaidSuggestion('e1', ACTOR, ITEM, { type: 'RISK' })
        expect(db.engagementRaidItem.update.mock.calls[0][0].data).toMatchObject({
            type: 'RISK', priority: 'MEDIUM', prioritySetBy: 'u-lead', dueDate: null, followUp: null, ownerUserId: null,
        })
    })

    it("an edit to an Action's due date tells the reminder what it was and what it is", async () => {
        const before = { ...suggestion({ type: 'ACTION', status: 'OPEN', priority: null, ownerUserId: 'u-lead', dueDate: new Date('2026-11-16T00:00:00Z') }) }
        db.engagementRaidItem.findFirst.mockResolvedValue(before)
        await editRaidItem('e1', ACTOR, ITEM, { dueDate: '2026-11-27' })
        expect(db.engagementRaidItem.update.mock.calls[0][0]).toEqual({
            where: { id: ITEM },
            data: { updatedBy: 'u-lead', dueDate: new Date('2026-11-27T00:00:00Z') },
            select: REMINDER_SELECT,
        })
        expect(sync).toHaveBeenCalledWith(
            expect.objectContaining({ id: ITEM, dueDate: new Date('2026-11-16T00:00:00Z'), ownerUserId: 'u-lead' }),
            expect.objectContaining({ id: ITEM, dueDate: new Date('2026-11-27T00:00:00Z') }),
        )
    })

    it("a person's Risk turned into an Action: no priority, theirs, due next week, and the reminder told", async () => {
        db.engagementRaidItem.findFirst.mockResolvedValue(suggestion({ type: 'RISK', status: 'OPEN', sourceKind: 'MANUAL', priority: 'MEDIUM', ownerUserId: null, dueDate: null }))
        await editRaidItem('e1', ACTOR, ITEM, { type: 'ACTION' })
        expect(db.engagementRaidItem.update.mock.calls[0][0].data).toEqual({
            updatedBy: 'u-lead', type: 'ACTION', status: 'OPEN', priority: null, prioritySetBy: null,
            dueDate: new Date(`${nextWeekStart()}T00:00:00Z`), ownerUserId: 'u-lead',
        })
        expect(sync).toHaveBeenCalled()
    })

    it('a Decision is recorded, and a Risk gets a priority back; only for entries a person or Brio wrote', async () => {
        db.engagementRaidItem.findFirst.mockResolvedValue(suggestion({ type: 'ACTION', status: 'OPEN', sourceKind: 'MANUAL', priority: null, ownerUserId: 'u-lead', dueDate: new Date('2026-11-27T00:00:00Z') }))
        await editRaidItem('e1', ACTOR, ITEM, { type: 'DECISION' })
        expect(db.engagementRaidItem.update.mock.calls[0][0].data).toMatchObject({ type: 'DECISION', status: 'RECORDED', priority: null, dueDate: null })
        await editRaidItem('e1', ACTOR, ITEM, { type: 'RISK', priority: 'HIGH' })
        expect(db.engagementRaidItem.update.mock.calls[1][0].data).toMatchObject({ type: 'RISK', status: 'OPEN', priority: 'HIGH', prioritySetBy: 'u-lead' })

        db.engagementRaidItem.findFirst.mockResolvedValue(suggestion({ type: 'RISK', status: 'OPEN', sourceKind: 'HEALTH' }))
        await expect(editRaidItem('e1', ACTOR, ITEM, { type: 'ACTION' })).rejects.toThrow("This entry's type follows the engagement's own data")
        await expect(editRaidItem('e1', ACTOR, ITEM, { type: 'ASSUMPTION' })).rejects.toThrow('Choose Risk, Action, Issue or Decision.')
        expect(db.engagementRaidItem.update).toHaveBeenCalledTimes(2)
    })

    it("refuses a due date on anything but an Action", async () => {
        db.engagementRaidItem.findFirst.mockResolvedValue(suggestion({ status: 'OPEN' }))
        await expect(editRaidItem('e1', ACTOR, ITEM, { dueDate: '2026-11-27' })).rejects.toThrow('Only Actions have a due date.')
        expect(sync).not.toHaveBeenCalled()
    })
})
