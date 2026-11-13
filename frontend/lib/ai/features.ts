/**
 * Every metered AI feature, and what each costs in credits.
 *
 * Safe to import from client components: no SDK, no database. `usage.ts` (server-only) re-exports
 * these so existing imports keep working; the billing page reads the list from here.
 */

export const AI_FEATURES = [
    'brief',
    'summary',
    'chat',
    'searchInterpret',
    'filesAgent',
    'firmChat',
    'statusUpdate',
    'replyDraft',
    'nudgeDraft',
    'notesProposals',
    'reviewerChat',
    'dayBrief',
    'raidCheck',
] as const

export type AiFeature = (typeof AI_FEATURES)[number]

/**
 * Credits charged per action.
 *
 * Derived by the standard anchoring rule (one credit = the cheapest action sold) applied to
 * measured costs. The actions span only ~2.7x, so whole-number weights stay honest without a
 * token-conversion formula users could not reason about. Search interpretation is weighted below 1
 * because it is genuinely cheaper (~0.37x a chat answer) and the highest-frequency action.
 *
 * Recorded per row at call time, so re-weighting later does not retroactively change history.
 */
export const CREDIT_WEIGHTS: Record<AiFeature, number> = {
    brief: 1,
    summary: 1,
    chat: 1,
    searchInterpret: 0.5,
    // The first feature whose cost is NOT one row per user action: an agent run records one row
    // per model turn, so a single review may write several. Weighted at 1 so the unit stays "a
    // credit is an answer" rather than introducing a second pricing concept — the run's total is
    // bounded by MAX_AGENT_TURNS and shown to the user before it starts.
    filesAgent: 1,
    firmChat: 1,
    statusUpdate: 1,
    replyDraft: 1,
    nudgeDraft: 1,
    notesProposals: 1,
    // Charged to the firm whose engagement it is, and capped per person per day in the route.
    reviewerChat: 1,
    // Free, decided 2026-11-12. Brio writes it unasked, once per person per day, so charging it
    // would drain a group's shared allowance without anyone choosing to spend: 2 users on the
    // 25-credit Sandbox plan would use it all on this alone. Still recorded, so its token cost
    // stays visible in the ledger. One-per-day is its guard, since a free action never trips the
    // burst cap.
    dayBrief: 0,
    // The RAID log's Brio check (.claude/plans/brio-features-round-2.md, §9): one batched call per
    // engagement over its new comment messages and memos. At most one run per engagement per active
    // day (the daily check runs only where there is something new since the last one), plus each
    // Check now a person presses. The log's status, health and Board entries are free.
    raidCheck: 1,
}

/**
 * Brio for Reviewers: answers per person per day. Charged to the firm, so the client side can't
 * spend its credits freely. Here rather than in the route so Settings can say it.
 */
export const REVIEWER_DAILY_ANSWERS = 10

/** A zeroed count per feature, for summing ledger rows. */
export function emptyFeatureCounts(): Record<AiFeature, number> {
    return Object.fromEntries(AI_FEATURES.map((f) => [f, 0])) as Record<AiFeature, number>
}
