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
 * Waiting on you now: a review request, a reminder with no date (Reconnect Drive, say), or a dated one
 * that is due today or overdue (2026-10-23: an overdue kickoff sat under Needs you uncounted, so the
 * tab said 0 and no badge showed). A reminder due later is a deadline, which Home's Agenda and the
 * Inbox's Upcoming list show.
 */
export function isNeedsYouReminder(r: Pick<ReminderWithContext, 'action' | 'dateValue' | 'delta'>): boolean {
    return isReviewReminder(r) || !r.dateValue || (r.delta !== null && r.delta <= 0)
}
