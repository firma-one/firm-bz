/**
 * What Brio says about itself in "Hear Brio", in the landing page's Meet Brio section
 * (hear-brio.tsx), in Brio's voice (an even blend of Kokoro's am_michael and am_fenrir;
 * .claude/plans/tour-chapters.md, Brio's voice). Kept to the section's own promises ("How Brio is
 * kept in its lane"). The clip is made with the tour's narration by
 * scripts/tour-narration/generate.py; changing the line marks it for remaking.
 */

import { NARRATION_PARAM } from '@/lib/demo/tour-chapters'

/**
 * The line as the caption shows it: what Brio does, why it matters to the firm, its promises as the
 * firm staying in charge, and an invitation to the tour it narrates, so it ends on the next step
 * rather than on what it won't do. The invitation is a statement, not a question: Kokoro reads a
 * question flat ("Want to see me at work?" fell rather than rose), and a confident "Come and see"
 * lands as an invitation either way.
 */
export const HEAR_BRIO_LINE =
    'Hi, I’m Brio, your executive assistant for client delivery, built into firmä. I keep track of every deliverable, due date and status, and draft the briefs and client updates, so you can focus on the decisions, your client relationships, and growing your firm. And you stay in charge: I never read what’s inside your documents, every change waits for your go-ahead, and nothing reaches a client until your team publishes it. Come and see me at work: take the product tour, and I’ll show you around.'

/** A little more breathing room between Brio's sentences than Kokoro gives on its own, in seconds. */
export const HEAR_BRIO_PAUSE = 0.25

/** The line as Brio says it: the brand as "Firma" (said "FUR-muh") and plain apostrophes, for Kokoro. */
export const HEAR_BRIO_SPOKEN = HEAR_BRIO_LINE.replace(/firmä/g, 'Firma').replace(/’/g, "'")

/** The tour, with Read aloud on: the visitor has just chosen to listen, so Brio carries on narrating. */
export const HEAR_BRIO_TOUR = `/tour?${NARRATION_PARAM}=on`

/** The clip, and when each word in it is spoken with how loud the voice is (for its wave). */
export const HEAR_BRIO_CLIP = {
    src: '/marketing/hear-brio.m4a',
    timings: '/marketing/hear-brio.json',
} as const
