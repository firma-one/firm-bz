/**
 * Why an AI answer was unhelpful.
 *
 * A closed list rather than free text: a comment box would become a second store of client data,
 * since people paste the answer they are complaining about. A category is enough to tell which
 * prompt needs work, which is the only thing this feedback is for.
 *
 * Lives apart from `feedback.ts` because that module is `server-only` (it touches Prisma) while the
 * chat panel needs these labels to render the picker.
 */
export const FEEDBACK_REASONS = [
    { value: 'inaccurate', label: 'Inaccurate or wrong' },
    { value: 'incomplete', label: 'Missing information' },
    { value: 'refused', label: "Wouldn't answer" },
    { value: 'confusing', label: 'Hard to understand' },
    { value: 'other', label: 'Something else' },
] as const

export type FeedbackReason = (typeof FEEDBACK_REASONS)[number]['value']

export function isValidReason(value: unknown): value is FeedbackReason {
    return typeof value === 'string' && FEEDBACK_REASONS.some((r) => r.value === value)
}
