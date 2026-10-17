/** A date with no time: "2026-10-20". */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * When a reminder's email goes out, or null when that is already past (nothing to schedule).
 *
 * A reminder on a date field (dateKey set: a due date, a follow-up date, an invitation's expiry)
 * or on a bare "YYYY-MM-DD" is about a day, and goes out at 09:00 UTC that day. A reminder
 * someone set for a time (a comment, a file, an ad-hoc reminder: dateKey null, picked with
 * DateTimePicker) goes out at that time. Pinning those to 09:00 UTC too sent "Tomorrow, 9:00 AM"
 * in India at 2:30 PM.
 */
export function reminderFireAt(dateKey: string | null, dateValue: string, now: Date = new Date()): Date | null {
    const at = new Date(dateValue)
    if (Number.isNaN(at.getTime()) || at <= now) return null
    if (dateKey !== null || DATE_ONLY.test(dateValue)) at.setUTCHours(9, 0, 0, 0)
    return at
}
