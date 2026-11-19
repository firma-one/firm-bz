/**
 * Every metered AI feature and its token cap. What a call costs in credits follows its tokens
 * (lib/ai/pricing.ts).
 *
 * Safe to import from client components: no SDK, no database. The billing page reads the list from here.
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
 * The most each feature's model call may write, thinking included (thinking counts toward it on Haiku
 * 5.5). One table, so the cap-fit test (lib/ai/caps.test.ts) checks every feature: a cap too small for
 * the thinking gets an answer cut off every time (the summary at 3000, 2026-11-19), and a cap too large
 * lets one call cost more than a credit earns.
 *
 * Credits are not set per feature: a call costs what its tokens cost us, in credits (lib/ai/pricing.ts).
 */
export const AI_MAX_TOKENS: Record<AiFeature, number> = {
    brief: 2000,
    summary: 8000,
    chat: 2500,
    searchInterpret: 1024,
    // Per turn; a review runs at most MAX_AGENT_TURNS turns (lib/ai/files-agent/budget.ts).
    filesAgent: 8000,
    firmChat: 3000,
    statusUpdate: 2500,
    replyDraft: 2000,
    nudgeDraft: 2000,
    notesProposals: 8000,
    reviewerChat: 2000,
    dayBrief: 2000,
    dayBriefRewrite: 2000,
    raidCheck: 6000,
    // A memo read: an hour's call notes and every RAID item in them.
    memoRaid: 12_000,
    memoMinutes: 6000,
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
