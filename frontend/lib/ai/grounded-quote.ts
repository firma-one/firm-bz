/**
 * Fewest words a partial quote may keep. Shorter runs ("I think we should") match too much of any
 * call to point at the right place.
 */
export const MIN_RUN_WORDS = 5

/**
 * Where the longest run of a quote's words sits in the quote, when the quote as a whole isn't in the
 * text: [start, end) over `quoteWords`, or null.
 *
 * A call transcript splits one sentence across turns ("could become" / "Oh." / "a Monday morning
 * feature for us"), and a model quoting it joins the halves into words nobody wrote together. The part
 * that is really there still cites the place, so Brio's proposal keeps it instead of being lost. The
 * run must be at least MIN_RUN_WORDS words and half the quote, so a stock phrase never stands in for a
 * quote that isn't there.
 *
 * `quoteWords` and `text` are normalized the same way by the caller (one space between words), so a
 * run found here maps to the same word positions in the caller's own copy of the quote.
 */
export function groundedRun(quoteWords: readonly string[], text: string): [number, number] | null {
    const need = Math.max(MIN_RUN_WORDS, Math.ceil(quoteWords.length / 2))
    let best: [number, number] | null = null
    for (let i = 0; i + need <= quoteWords.length; i++) {
        // No run from here on can be longer than the best one found.
        if (best && quoteWords.length - i <= best[1] - best[0]) break
        let end = i
        while (end < quoteWords.length && text.includes(quoteWords.slice(i, end + 1).join(' '))) end += 1
        if (end - i >= need && (!best || end - i > best[1] - best[0])) best = [i, end]
    }
    return best
}
