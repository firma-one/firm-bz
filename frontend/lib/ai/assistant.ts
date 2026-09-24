/**
 * Identity of the in-product AI assistant.
 *
 * Single source of truth for the name shown to users. Import `ASSISTANT` rather than writing
 * the name in a component — the name is still subject to trademark clearance and may change,
 * and a rename should be a one-line edit here.
 *
 * Safe to import from client components: this file holds no secrets and no SDK.
 */
export const ASSISTANT = {
    /** Display name. */
    name: 'Brio',
    /** Short badge text, e.g. on a generated-content card. */
    badge: 'Brio',
    /** Used where the assistant is the subject of a sentence. */
    possessive: "Brio's",
} as const
