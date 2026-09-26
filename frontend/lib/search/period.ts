/**
 * Absolute calendar periods for search: "Q1 2026", "Q4 2025", "H2 2025", "2024".
 *
 * **The model never emits a date.** That is the safety property this preserves. §A.2 records that
 * free-form date parsing is what killed the 2026-07 chrono approach: a model that resolves "last
 * spring" to an explicit range silently hides documents outside its guess. Here the model emits a
 * *period identifier* matching a strict grammar, and this module does the arithmetic. Anything
 * malformed, or outside a sane year window, resolves to null and the filter is dropped rather
 * than guessed.
 *
 * This complements the relative presets (`Overdue`, `This Quarter`, …), which keep their fixed
 * enum. It exists only for the absolute periods that enum cannot express.
 *
 * Safe on both client and server: pure arithmetic, no imports.
 */

/**
 * `Q1 2026` | `H2 2025` | `2024` | `Q1` | `H2`.
 *
 * A bare quarter or half resolves against the current year. The model is told to supply the year,
 * but it does not always, and silently dropping "Q2" made the same phrase behave differently
 * between runs — sometimes filtering, sometimes doing nothing at all. Defaulting is both the
 * obvious reading of "from Q2" and the consistent one. A bare year still needs four digits, so
 * nothing here can be confused for one.
 */
const PERIOD_GRAMMAR = /^(?:(Q[1-4]|H[12])(?:\s+(\d{4}))?|(\d{4}))$/i

const MIN_YEAR = 2000
/** One year ahead, so a forward-looking due date still resolves without accepting "Q1 2190". */
const MAX_YEAR_AHEAD = 1

export interface ResolvedPeriod {
    start: Date
    end: Date
    /** Canonical display form, e.g. "Q1 2026". Used as the chip label. */
    label: string
}

export function resolvePeriod(token: string, now: Date = new Date()): ResolvedPeriod | null {
    const m = PERIOD_GRAMMAR.exec(token.trim())
    if (!m) return null

    const unit = m[1]?.toUpperCase()
    // Group 2 is the year after a quarter/half; group 3 is a bare year. A quarter with neither
    // defaults to the current year.
    const year = m[3] ? Number(m[3]) : m[2] ? Number(m[2]) : now.getFullYear()
    if (!Number.isInteger(year)) return null
    if (year < MIN_YEAR || year > now.getFullYear() + MAX_YEAR_AHEAD) return null

    // Boundaries are local midnight, matching the relative presets. `end` is the last millisecond
    // of the period, derived by stepping to the start of the next one — which handles leap years
    // and month lengths without a table.
    const lastMsBefore = (y: number, monthAfter: number) =>
        new Date(new Date(y, monthAfter, 1, 0, 0, 0, 0).getTime() - 1)

    if (!unit) {
        return { start: new Date(year, 0, 1), end: lastMsBefore(year, 12), label: String(year) }
    }
    if (unit.startsWith('Q')) {
        const q = Number(unit[1])
        const startMonth = (q - 1) * 3
        return {
            start: new Date(year, startMonth, 1),
            end: lastMsBefore(year, startMonth + 3),
            label: `Q${q} ${year}`,
        }
    }
    const h = Number(unit[1])
    const startMonth = (h - 1) * 6
    return {
        start: new Date(year, startMonth, 1),
        end: lastMsBefore(year, startMonth + 6),
        label: `H${h} ${year}`,
    }
}
