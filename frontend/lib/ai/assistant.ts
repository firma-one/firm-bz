/**
 * Identity of the in-product AI assistant.
 *
 * Single source of truth for the name shown to users. Import `ASSISTANT` rather than writing
 * the name in a component — the name is still subject to trademark clearance and may change,
 * and a rename should be a one-line edit here.
 *
 * Safe to import from client components: this file holds no secrets and no SDK.
 */
/** firmä brand green — the fixed colour for Brio on marketing, demo and other static surfaces. */
export const BRIO_GREEN = '#049669'

export const ASSISTANT = {
    /** Display name. */
    name: 'Brio',
    /** Used where the assistant is the subject of a sentence. */
    possessive: "Brio's",
} as const

/**
 * The product's stance on AI autonomy, stated once so every surface says the same thing.
 *
 * Human review here is deliberate policy, not a gap in what the model can produce. Brio can write
 * a plausible mitigation plan; it is withheld from doing so because committing the firm to a
 * course of action needs a person accountable for that decision.
 */
export const ASSISTANT_POLICY = {
    /** One line, for footers and captions. */
    short: `${ASSISTANT.name} reports what the data shows. Decisions stay with you.`,
    /** For places with room to explain why. */
    long: `${ASSISTANT.name} reports what the data shows — it does not decide what your firm does `
        + 'about it. Anything that commits you to a course of action is reviewed by a person first, '
        + 'by design.',
    /** Shown where generated text is awaiting a human before it goes anywhere. */
    reviewGate: 'Reviewed by a person before anyone else sees it.',
} as const
