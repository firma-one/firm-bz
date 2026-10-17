import { describe, it, expect } from 'vitest'
import { reminderFireAt } from './fire-at'

const NOW = new Date('2026-10-17T12:00:00.000Z')

describe('reminderFireAt', () => {
    it('a reminder set for a time goes out at that time', () => {
        // "Tomorrow, 9:00 AM" picked in India (UTC+5:30).
        const at = reminderFireAt(null, '2026-10-18T03:30:00.000Z', NOW)
        expect(at?.toISOString()).toBe('2026-10-18T03:30:00.000Z')
    })

    it('a reminder on a date field goes out at 09:00 UTC that day', () => {
        const at = reminderFireAt('platform.engagements.dueDate', '2026-10-20T00:00:00.000Z', NOW)
        expect(at?.toISOString()).toBe('2026-10-20T09:00:00.000Z')
    })

    it('a bare date goes out at 09:00 UTC that day', () => {
        expect(reminderFireAt(null, '2026-10-20', NOW)?.toISOString()).toBe('2026-10-20T09:00:00.000Z')
    })

    it('nothing is scheduled for a time already past', () => {
        expect(reminderFireAt(null, '2026-10-17T11:59:00.000Z', NOW)).toBeNull()
        expect(reminderFireAt('platform.clients.followUpDate', '2026-10-01T00:00:00.000Z', NOW)).toBeNull()
    })

    it('nothing is scheduled for a value that is not a date', () => {
        expect(reminderFireAt(null, 'soon', NOW)).toBeNull()
    })
})
