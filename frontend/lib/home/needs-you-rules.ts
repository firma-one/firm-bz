import type { ReminderWithContext } from '@/lib/reminders/reminder-types'

/*
 * Which of the caller's reminders "need you" — shared by Home (lib/home/my-work.ts, server) and the
 * Inbox (components/inbox, client), so the two and the Inbox badge can't disagree
 * (.claude/plans/app-design-refinements.md, section 13).
 */

/** "Review comment" (@mention), "Review document", "Review shared document", `Review: "<file>"` (intake). */
export function isReviewReminder(r: Pick<ReminderWithContext, 'action'>): boolean {
    return r.action.startsWith('Review')
}

/**
 * A review request, or a reminder with no date (Reconnect Drive, say): waiting on you now. A dated
 * reminder is a deadline instead, which Home's Agenda and the Inbox's due lists show.
 */
export function isNeedsYouReminder(r: Pick<ReminderWithContext, 'action' | 'dateValue'>): boolean {
    return isReviewReminder(r) || !r.dateValue
}
