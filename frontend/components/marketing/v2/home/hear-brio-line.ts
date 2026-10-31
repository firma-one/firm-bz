/**
 * What Brio says about itself in "Hear Brio", in the landing page's Meet Brio section
 * (hear-brio.tsx), in Brio's voice (an even blend of Kokoro's am_michael and am_fenrir;
 * .claude/plans/tour-chapters.md, Brio's voice). Kept to the section's own promises ("How Brio is
 * kept in its lane"). The clip is made with the tour's narration by
 * scripts/tour-narration/generate.py; changing the line marks it for remaking.
 */

/** The line as the caption shows it. */
export const HEAR_BRIO_LINE =
    'Hi, I’m Brio, your executive assistant for client delivery, built into firmä. I keep track of every deliverable, due date and status, and draft the briefs and client updates, so you can focus on the decisions, your client relationships, and growing your firm. I never read what’s inside your documents. I never change a thing without your go-ahead. And nothing reaches a client until someone on your team publishes it.'

/** The line as Brio says it: the brand as "Firma" (said "FUR-muh") and plain apostrophes, for Kokoro. */
export const HEAR_BRIO_SPOKEN = HEAR_BRIO_LINE.replace(/firmä/g, 'Firma').replace(/’/g, "'")

/** The clip, and when each word in it is spoken with how loud the voice is (for its wave). */
export const HEAR_BRIO_CLIP = {
    src: '/marketing/hear-brio.m4a',
    timings: '/marketing/hear-brio.json',
} as const
