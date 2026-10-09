import type { EngagementInsightsResponse } from '@/lib/insights/engagement-insights'

/**
 * Suggested questions for the engagement chat, derived from the engagement's own data.
 *
 * Deliberately not a fixed list. A static "What's overdue right now?" on an engagement with
 * nothing overdue costs a credit to answer "nothing is overdue", and teaches the user that the
 * suggestions are decoration rather than a read of their situation. Every suggestion here is
 * gated on a signal actually being present, so a chip is only offered when it has an answer.
 *
 * No `server-only`: this runs in the chat panel, from the insights payload the page already holds.
 * It makes no model call — picking what to ask is deterministic, and a model call to decide which
 * question to suggest would cost as much as the answer itself.
 */

export interface ChatSuggestion {
    /** The question sent to the model. */
    text: string
    /**
     * Ranking weight — higher wins when more candidates qualify than there are slots. Scores are
     * assigned by how much the signal demands attention, not by how interesting the answer is:
     * overdue work outranks planning hygiene, which outranks a general status question.
     */
    score: number
}

/** Four fits one row at the panel's width without wrapping into a block. */
const MAX_SUGGESTIONS = 4

/**
 * Always available, because they are answerable from any snapshot. Scored below every
 * data-driven suggestion so they fill remaining slots rather than displacing a real signal.
 */
const FALLBACKS: ChatSuggestion[] = [
    { text: 'Summarize where this engagement stands', score: 5 },
    { text: 'What needs my attention this week?', score: 4 },
]

/**
 * Builds the suggestion list for an engagement.
 *
 * `asked` drops questions already put to the model in this session: repeating a chip the user just
 * clicked wastes the slot, and the answer is still on screen above it.
 */
export function buildChatSuggestions(
    data: EngagementInsightsResponse | null | undefined,
    asked: ReadonlySet<string> = new Set(),
): string[] {
    if (!data) {
        return FALLBACKS.filter((s) => !asked.has(s.text)).map((s) => s.text).slice(0, MAX_SUGGESTIONS)
    }

    const candidates: ChatSuggestion[] = []

    // --- Delivery risk: the highest-priority band, because it is about work slipping. ---

    const overdue = data.deliveryHealth?.overdueCount ?? 0
    if (overdue > 0) {
        candidates.push({
            text: overdue === 1 ? "What's overdue, and how late is it?" : `Which ${overdue} deliverables are overdue?`,
            score: 100,
        })
    }

    const stuckInReview = data.deliveryHealth?.stalledInReview ?? 0
    if (stuckInReview > 0) {
        candidates.push({ text: "What's been sitting in review too long?", score: 90 })
    }

    // Behind pace only matters when there is a deadline to be behind — without one, timePct is
    // meaningless and the question would be unanswerable.
    const pace = data.pace
    if (pace?.hasDeadline && pace.timePct - pace.deliveredPct >= 15) {
        candidates.push({ text: 'Are we behind schedule, and on what?', score: 85 })
    }

    const dueSoon = data.documentsDueSoon?.length ?? 0
    if (dueSoon > 0 && overdue === 0) {
        // Only when nothing is already overdue — otherwise this competes with a more urgent chip
        // that asks about the same documents.
        candidates.push({ text: "What's due in the next few days?", score: 70 })
    }

    // --- Collaboration: someone is waiting on a reply. ---

    const unanswered = data.commentThreads?.unanswered ?? 0
    if (unanswered > 0) {
        candidates.push({
            text: unanswered === 1 ? 'Which comment is awaiting our reply?' : `Which ${unanswered} comments are awaiting our reply?`,
            score: 80,
        })
    }

    const flaggedOpen = data.commentThreads?.flaggedOpen ?? 0
    if (flaggedOpen > 0) {
        candidates.push({ text: 'Which threads are still flagged open?', score: 60 })
    }

    // --- Planning hygiene: not urgent, but the most common real gap. ---

    const hygiene = data.planningHygiene
    if (hygiene) {
        const docsMissingDates = hygiene.docTotal - hygiene.docWithDueDate
        const deliverablesMissingDates = hygiene.deliverableTotal - hygiene.deliverableWithDueDate
        if (docsMissingDates > 0 || deliverablesMissingDates > 0) {
            candidates.push({ text: 'What work is missing a due date?', score: 50 })
        }
        const docsMissingAssignee = hygiene.docTotal - hygiene.docWithAssignee
        if (docsMissingAssignee > 0) {
            candidates.push({ text: "What's unassigned right now?", score: 45 })
        }
    }

    // --- Quality: only meaningful once something has been approved. ---

    const ftr = data.firstTimeRight
    if (ftr && ftr.totalApproved > 0 && ftr.reworked > 0) {
        candidates.push({ text: 'Which deliverables needed rework?', score: 40 })
    }

    // --- Progress: a real question only when work is actually in flight. ---

    const inProgress = data.sharesProgress?.inProgress ?? 0
    if (inProgress > 0) {
        candidates.push({ text: "What's in progress right now?", score: 30 })
    }

    // A health score below full marks has penalties attached that the model can explain.
    const health = data.healthScore?.score
    if (typeof health === 'number' && health < 100) {
        candidates.push({ text: `Why is the health score ${health}?`, score: 35 })
    }

    const ranked = [...candidates, ...FALLBACKS]
        .filter((s) => !asked.has(s.text))
        .sort((a, b) => b.score - a.score)

    // De-duplicate by text: two signals can produce the same question (for example a single
    // overdue item that is also the only document due soon).
    const seen = new Set<string>()
    const out: string[] = []
    for (const s of ranked) {
        if (seen.has(s.text)) continue
        seen.add(s.text)
        out.push(s.text)
        if (out.length === MAX_SUGGESTIONS) break
    }
    return out
}
