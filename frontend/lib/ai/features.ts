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
    'dayBriefRewrite',
    'raidCheck',
    'memoRaid',
    'memoMinutes',
] as const

export type AiFeature = (typeof AI_FEATURES)[number]

/**
 * Credits charged per action.
 *
 * Every AI call costs one credit (Deepak, 2026-11-15): nothing is free and nothing is a fraction, so
 * counting stays simple. A feature that makes two calls costs two. This replaced a free Your brief and
 * memo RAID pass and a half-credit search interpretation.
 *
 * Recorded per row at call time, so re-weighting later does not retroactively change history.
 */
export const CREDIT_WEIGHTS: Record<AiFeature, number> = {
    brief: 1,
    summary: 1,
    chat: 1,
    searchInterpret: 1,
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
    // Brio writes it unasked, once per person per day. Free from 2026-11-12 to 2026-11-15, then 1 like
    // every call (Deepak). It counts against the group's allowance like any action, and stops when the
    // allowance is spent; the per-person limit below still holds it to twice a day.
    dayBrief: 1,
    // Rewrite is a person's choice, so it costs what any other Brio action costs (Deepak,
    // 2026-11-13). Only when their items changed: an unchanged day answers without a model call.
    dayBriefRewrite: 1,
    // The RAID log's Brio check (.claude/plans/brio-features-round-2.md, §9): one batched call per
    // engagement over its new comment messages (memos are read when added, §13). At most one run per
    // engagement per active day (the daily check runs only where there is something new since the
    // last one), plus each Check now a person presses. The log's status, health and Board entries are free.
    raidCheck: 1,
    // A memo's RAID suggestions, read when the memo is added (§13): its Risks, Actions, Issues and
    // Decisions, every commitment an Action (.claude/plans/raid-actions-memo-minutes.md).
    memoRaid: 1,
    // A memo's minutes, written in the same read as its RAID suggestions: a memo read is 2 credits.
    memoMinutes: 1,
}

/**
 * Brio for Reviewers: answers per person per day. Charged to the firm, so the client side can't
 * spend its credits freely. Here rather than in the route so Settings can say it.
 */
export const REVIEWER_DAILY_ANSWERS = 10

/**
 * Per-person limits on AI calls, for every feature, free or paid (lib/ai/person-limit.ts). The credit
 * windows in credit-cap.ts are per billing group and count credits; these count one person's calls, so
 * nobody (or no script with their session) can drain a group, and a free action can't loop unbounded.
 * Sized above what a person does by hand: in normal use they never fire.
 */
export const AI_PERSON_LIMITS = {
    /** Calls a minute across every Brio feature. */
    perMinute: 10,
    /** Calls in any 24 hours across every Brio feature. */
    perDay: 200,
    /**
     * Calls in any 24 hours for a feature that needs its own cap. Your brief: the morning brief (twice
     * covers a timezone change) and four rewrites. Brio for Reviewers keeps its own daily cap
     * (REVIEWER_DAILY_ANSWERS), counted in its route.
     */
    perFeaturePerDay: {
        dayBrief: 2,
        dayBriefRewrite: 4,
    } as Partial<Record<AiFeature, number>>,
}

/** A zeroed count per feature, for summing ledger rows. */
export function emptyFeatureCounts(): Record<AiFeature, number> {
    return Object.fromEntries(AI_FEATURES.map((f) => [f, 0])) as Record<AiFeature, number>
}
