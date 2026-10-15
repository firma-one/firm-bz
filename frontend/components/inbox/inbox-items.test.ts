import { describe, it, expect } from 'vitest'
import type { ReminderWithContext } from '@/lib/actions/user-reminders'
import { buildInbox, type ApiNotification } from './inbox-items'

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

describe('buildInbox', () => {
    it('keeps only this firm\'s visible reminders, overdue first, undated last', () => {
        const { todo } = buildInbox('f1', [
            reminder({ id: 'later', delta: 5, dateValue: '2026-10-20', label: 'Due in 5 days' }),
            reminder({ id: 'mention', action: 'Review comment', delta: null }),
            reminder({ id: 'overdue', delta: -2, dateValue: '2026-10-12', label: '2 days overdue' }),
            reminder({ id: 'other-firm', firmId: 'f2', delta: -9 }),
            reminder({ id: 'hidden', hiddenAt: '2026-10-01', delta: -1 }),
        ], [])
        expect(todo.map((t) => t.sourceId)).toEqual(['overdue', 'later', 'mention'])
        expect(todo[0]).toMatchObject({ unread: true, overdue: true, dueLabel: '2 days overdue' })
        expect(todo[1]).toMatchObject({ unread: false, overdue: false })
        expect(todo[2]).toMatchObject({ unread: true, dueLabel: null, label: 'Review comment' })
    })

    it('orders notifications newest first, unread by readAt, with a readable type', () => {
        const { notifications } = buildInbox('f1', [], [
            note({ id: 'old', createdAt: '2026-10-10T10:00:00Z', readAt: '2026-10-11T00:00:00Z' }),
            note({ id: 'new', createdAt: '2026-10-14T10:00:00Z' }),
        ])
        expect(notifications.map((n) => n.sourceId)).toEqual(['new', 'old'])
        expect(notifications[0]).toMatchObject({ unread: true, label: 'External client comment', key: 'n:new' })
        expect(notifications[1].unread).toBe(false)
    })
})
