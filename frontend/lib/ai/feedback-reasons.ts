/**
 * Why an AI answer was rated the way it was.
 *
 * Closed lists, never free text. A comment box would become a second store of client data, since
 * the natural thing to type into "what went wrong?" is the answer you are complaining about — and
 * answers are derived from engagement data that this table deliberately never holds. A chip carries
 * the same diagnostic signal with none of that risk.
 *
 * ## Single-select, strongest feeling
 *
 * The picker takes one chip, so each list is a single axis whose options are mutually exclusive and
 * ordered. Overlapping options ("accurate" alongside "clear") would make the pick arbitrary and the
 * counts meaningless, since a user who felt both would split unpredictably between them.
 *
 * ## Why `other` exists on both lists
 *
 * It records nothing about the answer — deliberately. It measures the *vocabulary*: a rising share
 * of `other` is the signal that these options no longer cover what users are actually feeling, and
 * that a category is missing. It is listed last so it does not absorb picks that belong on a real
 * option.
 *
 * Lives apart from `feedback.ts` because that module is `server-only` (it touches Prisma) while the
 * chat panel needs these labels to render the picker.
 */

/**
 * What made an answer good, weakest claim to strongest.
 *
 * The options nest — an answer cannot be actionable unless its facts are also right — so the
 * strongest true statement is the unambiguous pick. The axis is what the answer *did for the user*,
 * not how it read: prose quality is a property of the writing and would cross the axis, so it
 * appears only as a complaint on the negative list.
 */
export const POSITIVE_REASONS = [
    { value: 'correct', label: 'Got the facts right' },
    { value: 'thorough', label: "Didn't miss anything" },
    { value: 'actionable', label: 'Told me what to do next' },
    { value: 'savedtime', label: 'Saved me real work' },
    { value: 'other', label: 'Something else' },
] as const

/**
 * What was wrong with an answer, walking the pipeline: did it answer at all, were the facts right,
 * was it complete, could it be read.
 *
 * `wrongscope` sits directly below `refused` on purpose. They are adjacent symptoms with opposite
 * causes — the scope guard firing correctly versus firing wrongly — and which one a user picks is
 * the only way to tell those apart. Collapsing them would let the two cancel out in the counts.
 */
export const NEGATIVE_REASONS = [
    { value: 'refused', label: "Wouldn't answer at all" },
    { value: 'wrongscope', label: "Said it couldn't, but it should know this" },
    { value: 'inaccurate', label: 'Got facts wrong' },
    { value: 'incomplete', label: 'Left things out' },
    { value: 'confusing', label: "Couldn't follow it" },
    { value: 'other', label: 'Something else' },
] as const

export type PositiveReason = (typeof POSITIVE_REASONS)[number]['value']
export type NegativeReason = (typeof NEGATIVE_REASONS)[number]['value']
export type FeedbackReason = PositiveReason | NegativeReason

/** The chips to offer for a rating of the given sign. */
export function reasonsFor(helpful: boolean): ReadonlyArray<{ value: string; label: string }> {
    return helpful ? POSITIVE_REASONS : NEGATIVE_REASONS
}

/**
 * Validates a chip against the sign it was given with.
 *
 * Sign-aware because both vocabularies share one `reason` column: without this check a client could
 * record 'inaccurate' against a thumbs-up, which would read as a contradiction in the dashboard and
 * silently corrupt the per-reason counts.
 *
 * Note `other` is valid for both signs — it is the one value the two lists share.
 */
export function isValidReason(value: unknown, helpful: boolean): value is FeedbackReason {
    return typeof value === 'string' && reasonsFor(helpful).some((r) => r.value === value)
}

/** Labels for every reason across both lists, for rendering stored rows in the admin dashboard. */
export const REASON_LABELS: Record<string, string> = Object.fromEntries(
    [...POSITIVE_REASONS, ...NEGATIVE_REASONS].map((r) => [r.value, r.label]),
)
