import * as chrono from 'chrono-node'

export interface ParsedDateRange {
    start: Date
    end: Date
    /** The exact substring chrono matched (e.g. "from July") — for stripping out of search text so the date phrase doesn't pollute filename/semantic matching. */
    matchedText: string
    /** `text` with `matchedText` removed, whitespace-collapsed — the remainder to actually search on. */
    remainingText: string
}

/**
 * Extracts a date range from free text (e.g. "Q3 2026", "next month", "March 2026").
 * Used as a typing convenience inside the new global search free-text box. The returned
 * date range is applied as a ranking boost, not a hard filter — see searchGlobal in
 * lib/services/search-service.ts — since a date phrase in a casual query rarely means
 * "and it must have exactly this due date," and treating it as a mandatory AND filter
 * incorrectly zeroes out otherwise-relevant documents with no/different dueDate.
 */
export function parseDateRangeFromText(text: string, referenceDate: Date = new Date()): ParsedDateRange | null {
    const results = chrono.parse(text, referenceDate, { forwardDate: false })
    if (results.length === 0) return null

    const result = results[0]
    const start = result.start.date()
    const end = result.end ? result.end.date() : deriveEndOfImpliedRange(result, start)

    const matchedText = result.text
    const remainingText = (text.slice(0, result.index) + text.slice(result.index + matchedText.length))
        .replace(/\s+/g, ' ')
        .trim()

    return { start, end, matchedText, remainingText }
}

/**
 * When chrono only detects a single point in time (e.g. "Q3 2026" often resolves to
 * a start date with no explicit end), infer a sensible end-of-range boundary based on
 * which date components were "certain" (i.e. explicitly stated) vs guessed.
 */
function deriveEndOfImpliedRange(result: chrono.ParsedResult, start: Date): Date {
    const knownValues = result.start
    const hasDay = knownValues.isCertain('day')
    const hasMonth = knownValues.isCertain('month')

    if (hasDay) {
        // Fully specified date - treat as a single day.
        const end = new Date(start)
        end.setHours(23, 59, 59, 999)
        return end
    }

    if (hasMonth) {
        // Month-level precision (e.g. "March 2026") - end of that month.
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999)
        return end
    }

    // Year-level precision only - end of year.
    const end = new Date(start.getFullYear(), 11, 31, 23, 59, 59, 999)
    return end
}
