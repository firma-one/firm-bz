import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * An open Action with an owner and a due date is a reminder for its owner, and the reminder follows the
 * entry. The database, the reminder service and the logger are mocked; nothing here writes a reminder.
 */

const h = vi.hoisted(() => ({
    db: {
        engagement: { findUnique: vi.fn() },
        engagementRaidItem: { findUnique: vi.fn(), update: vi.fn() },
    },
    upsert: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    logError: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: h.db }))
vi.mock('@/lib/reminders/reminder-service', () => ({ upsertFollowUpReminder: h.upsert, removeRemindersByEntity: h.remove }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: h.logError } }))

import { engagementPath } from '@/lib/navigation/firm-paths'
import {
    RAID_ACTION_DATE_KEY,
    RAID_ACTION_ENTITY_KEY,
    RAID_ACTION_REMINDER,
    closeActionFromReminder,
    syncActionReminder,
    type ActionReminderState,
} from './raid-action-reminders'

const ITEM = '77777777-7777-4777-8777-777777777777'
const RAID_TAB = engagementPath('acme', 'acme-tax', 'whitfield', 'q2', { tab: 'raid' })

const action = (p: Partial<ActionReminderState> = {}): ActionReminderState => ({
    id: ITEM,
    type: 'ACTION',
    status: 'OPEN',
    ownerUserId: 'u-alex',
    dueDate: new Date('2026-11-20T00:00:00Z'),
    title: 'Send Dana the revised engagement letter',
    firmId: 'f1',
    engagementId: 'e1',
    ...p,
})

beforeEach(() => {
    h.db.engagement.findUnique.mockReset().mockResolvedValue({
        slug: 'q2',
        client: { slug: 'whitfield', firm: { slug: 'acme-tax', group: { slug: 'acme' } } },
    })
    h.db.engagementRaidItem.findUnique.mockReset()
    h.db.engagementRaidItem.update.mockReset().mockResolvedValue({})
    h.upsert.mockReset().mockResolvedValue(undefined)
    h.remove.mockReset().mockResolvedValue(undefined)
    h.logError.mockReset()
})

describe('syncActionReminder', () => {
    it("puts an open Action with an owner and a due date in its owner's reminders, opening the RAID tab", async () => {
        await syncActionReminder(null, action())
        expect(h.remove).not.toHaveBeenCalled()
        expect(h.upsert).toHaveBeenCalledWith({
            userId: 'u-alex',
            entityKey: 'platform.engagement_raid_items',
            entityValue: ITEM,
            action: 'Action',
            dateKey: 'platform.engagement_raid_items.dueDate',
            dateValue: '2026-11-20',
            entityName: 'Send Dana the revised engagement letter',
            firmId: 'f1',
            ctaUrl: RAID_TAB,
        })
        expect([RAID_ACTION_ENTITY_KEY, RAID_ACTION_DATE_KEY, RAID_ACTION_REMINDER]).toEqual(['platform.engagement_raid_items', 'platform.engagement_raid_items.dueDate', 'Action'])
    })

    it('reads a due date given as a day', async () => {
        await syncActionReminder(null, action({ dueDate: '2026-11-27' }))
        expect(h.upsert).toHaveBeenCalledWith(expect.objectContaining({ dateValue: '2026-11-27' }))
    })

    it("given to someone else, the new owner takes it over and the old owner's goes", async () => {
        await syncActionReminder(action(), action({ ownerUserId: 'u-priya' }))
        expect(h.remove).toHaveBeenCalledWith('u-alex', RAID_ACTION_ENTITY_KEY, ITEM)
        expect(h.upsert).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-priya', entityValue: ITEM }))
    })

    it("a new date updates the owner's reminder in place", async () => {
        await syncActionReminder(action(), action({ dueDate: new Date('2026-11-27T00:00:00Z') }))
        expect(h.remove).not.toHaveBeenCalled()
        expect(h.upsert).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-alex', dateValue: '2026-11-27' }))
    })

    it('closing it, or clearing its owner or date, removes the reminder', async () => {
        for (const after of [action({ status: 'CLOSED' }), action({ ownerUserId: null }), action({ dueDate: null }), null]) {
            h.remove.mockClear()
            await syncActionReminder(action(), after)
            expect(h.remove).toHaveBeenCalledWith('u-alex', RAID_ACTION_ENTITY_KEY, ITEM)
        }
        expect(h.upsert).not.toHaveBeenCalled()
    })

    it('reopening it puts the reminder back', async () => {
        await syncActionReminder(action({ status: 'CLOSED' }), action())
        expect(h.remove).not.toHaveBeenCalled()
        expect(h.upsert).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-alex' }))
    })

    it('a Risk, an Issue or a Decision never makes one', async () => {
        for (const type of ['RISK', 'ISSUE', 'DECISION', 'ASSUMPTION']) {
            await syncActionReminder(null, action({ type }))
            await syncActionReminder(action({ type }), action({ type, ownerUserId: 'u-priya' }))
        }
        expect(h.upsert).not.toHaveBeenCalled()
        expect(h.remove).not.toHaveBeenCalled()
        expect(h.db.engagement.findUnique).not.toHaveBeenCalled()
    })

    it('without the engagement\'s slugs, the reminder opens nowhere rather than somewhere wrong', async () => {
        h.db.engagement.findUnique.mockResolvedValue(null)
        await syncActionReminder(null, action())
        expect(h.upsert).toHaveBeenCalledWith(expect.objectContaining({ ctaUrl: null }))
    })

    it('a failure is logged, never thrown: the entry is saved either way', async () => {
        h.upsert.mockRejectedValue(new Error('lock timeout'))
        await expect(syncActionReminder(null, action())).resolves.toBeUndefined()
        expect(h.logError).toHaveBeenCalledWith(expect.stringContaining('reminder'), expect.any(Error), 'RAID', { itemId: ITEM })
    })
})

describe('closeActionFromReminder', () => {
    const NOW = new Date('2026-11-15T09:00:00Z')
    const row = (p: Record<string, unknown> = {}) => ({ id: ITEM, type: 'ACTION', status: 'OPEN', ownerUserId: 'u-alex', ...p })

    it("Done on the owner's own reminder closes the open Action, saying it's done", async () => {
        h.db.engagementRaidItem.findUnique.mockResolvedValue(row())
        await closeActionFromReminder('u-alex', ITEM, NOW)
        expect(h.db.engagementRaidItem.update).toHaveBeenCalledWith({
            where: { id: ITEM },
            data: { status: 'CLOSED', closedAt: NOW, closedBy: 'u-alex', closedReason: 'Done · Nov 15', updatedBy: 'u-alex' },
        })
        // The caller is removing the reminder already, inside its lock.
        expect(h.remove).not.toHaveBeenCalled()
    })

    it("closes nothing that isn't the person's own open Action", async () => {
        for (const found of [null, row({ ownerUserId: 'u-priya' }), row({ status: 'CLOSED' }), row({ type: 'RISK' })]) {
            h.db.engagementRaidItem.findUnique.mockResolvedValue(found)
            await closeActionFromReminder('u-alex', ITEM, NOW)
        }
        expect(h.db.engagementRaidItem.update).not.toHaveBeenCalled()
    })
})
