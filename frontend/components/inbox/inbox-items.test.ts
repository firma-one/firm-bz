import { describe, it, expect } from 'vitest'
import type { ReminderWithContext } from '@/lib/actions/user-reminders'
import { groupReminders, notificationToItem, reminderEntity, sortNotifications, type ApiNotification } from './inbox-items'

function reminder(over: Partial<ReminderWithContext>): ReminderWithContext {
    return {
        id: 'r', entityKey: 'platform.engagements', entityValue: 'x', action: 'Follow-up', dateKey: null, dateValue: null,
        hiddenAt: null, entityName: 'Thing', entitySlug: null, firmSlug: 'acme', firmId: 'f1', ctaUrl: '/go', delta: null,
        label: '', labelStyle: 'slate', ...over,
    }
}

function note(over: Partial<ApiNotification>): ApiNotification {
    return { id: 'n', createdAt: '2026-10-14T10:00:00Z', scope: 'FIRM', type: 'EXTERNAL_CLIENT_COMMENT', priority: 'INFO', title: 'T', body: null, ctaUrl: null, readAt: null, ...over }
}

describe('groupReminders', () => {
    it('groups this firm\'s visible reminders by urgency, soonest first, and keeps far-future ones', () => {
        const g = groupReminders('f1', [
            reminder({ id: 'later', delta: 5, dateValue: '2026-10-20', label: 'Due in 5 days' }),
            reminder({ id: 'next-year', delta: 108, dateValue: '2027-01-31', label: 'Due in 108 days' }),
            reminder({ id: 'mention', action: 'Review comment', delta: null }),
            reminder({ id: 'overdue', delta: -2, dateValue: '2026-10-12', label: '2 days overdue' }),
            reminder({ id: 'today', delta: 0, dateValue: '2026-10-15', label: 'Due today' }),
            reminder({ id: 'other-firm', firmId: 'f2', delta: -9 }),
            reminder({ id: 'hidden', hiddenAt: '2026-10-01', delta: -1 }),
        ])
        expect(g.overdue.map((i) => i.sourceId)).toEqual(['overdue'])
        expect(g.today.map((i) => i.sourceId)).toEqual(['today'])
        expect(g.undated.map((i) => i.sourceId)).toEqual(['mention'])
        expect(g.upcoming.map((i) => i.sourceId)).toEqual(['later', 'next-year'])
        expect(g.overdue[0]).toMatchObject({ unread: true, overdue: true, dueLabel: '2 days overdue' })
        expect(g.undated[0]).toMatchObject({ unread: true, label: 'Review comment' })
        expect(g.upcoming[0]).toMatchObject({ unread: false, overdue: false })
    })
})

describe('sortNotifications', () => {
    it('orders newest first, unread by readAt, with a readable type', () => {
        const notes = sortNotifications([
            note({ id: 'old', createdAt: '2026-10-10T10:00:00Z', readAt: '2026-10-11T00:00:00Z' }),
            note({ id: 'new', createdAt: '2026-10-14T10:00:00Z' }),
        ])
        expect(notes.map((n) => n.sourceId)).toEqual(['new', 'old'])
        expect(notes[0]).toMatchObject({ unread: true, label: 'External client comment', key: 'n:new' })
        expect(notes[1].unread).toBe(false)
    })
})

describe('what an item is about', () => {
    it('reads a reminder\'s subject from its entity key', () => {
        expect(reminderEntity('platform.engagements.dueDate', 'Engagement due')).toBe('engagement')
        expect(reminderEntity('platform.clients.followUpDate', 'Follow-up')).toBe('client')
        expect(reminderEntity('platform.engagements.shares', 'Deliverable due')).toBe('deliverable')
        expect(reminderEntity('platform.engagements.shares', 'Review comment')).toBe('comment')
        expect(reminderEntity('platform.documents.id', 'Review document')).toBe('document')
        expect(reminderEntity('platform.doc_comments', 'Review comment')).toBe('comment')
        expect(reminderEntity('platform.firm_invitations.expireAt', 'Invitation expiring')).toBe('invitation')
        expect(reminderEntity('platform.connectors.tokenExpiresAt', 'Reconnect')).toBe('storage')
        expect(reminderEntity('platform.something_new.id', 'Follow-up')).toBeNull()
    })

    it('reads a notification\'s subject from its type, and has none for the rest', () => {
        const n = (type: string): ApiNotification => ({ id: type, createdAt: '2026-10-21T00:00:00Z', scope: 'user', type, priority: 'normal', title: 't', body: null, ctaUrl: null, readAt: null })
        expect(notificationToItem(n('EXTERNAL_CLIENT_COMMENT')).entity).toBe('comment')
        expect(notificationToItem(n('ENGAGEMENT_INVITE_ACCEPTED')).entity).toBe('member')
        expect(notificationToItem(n('DELIVERABLE_OVERDUE')).entity).toBe('deliverable')
        expect(notificationToItem(n('BROADCAST')).entity).toBeNull()
    })
})
