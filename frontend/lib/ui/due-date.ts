import { addDays, differenceInCalendarDays, format, nextMonday, startOfDay } from "date-fns"

/*
 * A due date as the app stores and shows it (.claude/plans/app-design-refinements.md, section 12).
 *
 * A due date is a day, and sometimes a time. The picker saves a day alone as "yyyy-MM-dd", which the
 * server stores as UTC midnight; a day with a time is saved as a full ISO instant. Reading one back,
 * UTC midnight therefore means "a day, no time" — and is read as its UTC calendar day, so it never
 * slides to the day before west of Greenwich.
 */

export interface DueParts {
    /** The calendar day, at local midnight. */
    day: Date
    /** "HH:mm" in local time, or null for a day alone. */
    time: string | null
}

const BARE_DAY = /^(\d{4})-(\d{2})-(\d{2})$/
const UTC_MIDNIGHT = /T00:00(?::00(?:\.0+)?)?(?:Z|\+00:00)$/

export function readDue(value: string | null | undefined): DueParts | null {
    if (!value) return null
    const bare = BARE_DAY.exec(value)
    if (bare) return { day: new Date(Number(bare[1]), Number(bare[2]) - 1, Number(bare[3])), time: null }
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    if (UTC_MIDNIGHT.test(value)) return { day: new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), time: null }
    return { day: new Date(d.getFullYear(), d.getMonth(), d.getDate()), time: format(d, "HH:mm") }
}

/** What the picker saves: "yyyy-MM-dd" for a day alone, an ISO instant for a day with a time. */
export function writeDue(day: Date, time: string | null): string {
    if (!time) return format(day, "yyyy-MM-dd")
    const [h, m] = time.split(":").map(Number)
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m).toISOString()
}

/** "5:00 PM" from "17:00". */
export function formatTime(time: string): string {
    const [h, m] = time.split(":").map(Number)
    return format(new Date(2000, 0, 1, h, m), "h:mm a")
}

/**
 * "Oct 30, 2026", or "Oct 30, 2026 · 5:00 PM" when a time is set. `compact` (table cells) leaves out
 * this year's year: "Oct 30 · 5:00 PM".
 */
export function formatDue(parts: DueParts, { compact = false, now = new Date() }: { compact?: boolean; now?: Date } = {}): string {
    const day = format(parts.day, compact && parts.day.getFullYear() === now.getFullYear() ? "MMM d" : "MMM d, yyyy")
    return parts.time ? `${day} · ${formatTime(parts.time)}` : day
}

/** Past due: a day before today, or a time already gone. */
export function isPastDue(parts: DueParts, now = new Date()): boolean {
    if (!parts.time) return parts.day < startOfDay(now)
    const [h, m] = parts.time.split(":").map(Number)
    const at = new Date(parts.day.getFullYear(), parts.day.getMonth(), parts.day.getDate(), h, m)
    return at.getTime() < now.getTime()
}

/** "today", "tomorrow", "in 8 days", "yesterday", "3 days ago". */
export function relativeDay(day: Date, now = new Date()): string {
    const n = differenceInCalendarDays(day, now)
    if (n === 0) return "today"
    if (n === 1) return "tomorrow"
    if (n === -1) return "yesterday"
    return n > 0 ? `in ${n} days` : `${-n} days ago`
}

/** The picker's quick picks, resolved against today. */
export function quickPicks(now = new Date()): { label: string; day: Date }[] {
    const today = startOfDay(now)
    return [
        { label: "Today", day: today },
        { label: "Tomorrow", day: addDays(today, 1) },
        { label: "Next week", day: nextMonday(today) },
        { label: "In 2 weeks", day: addDays(today, 14) },
    ]
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

/**
 * A typed date, read the forgiving way people write them: "today", "tom", "fri", "next fri",
 * "next week", "in 3 days", "in 2 weeks", "end of month", "oct 30", "30 oct", "10/30", "2026-10-30".
 * A day without a year is the next one to come. Returns the day at local midnight, or null.
 */
export function parseDueInput(input: string, now = new Date()): Date | null {
    const text = input.trim().toLowerCase().replace(/\s+/g, " ").replace(/,/g, "")
    if (!text) return null
    const today = startOfDay(now)

    if (text === "today" || text === "tod") return today
    if (text === "tomorrow" || text === "tom" || text === "tmr") return addDays(today, 1)
    if (text === "yesterday") return addDays(today, -1)
    if (text === "next week") return nextMonday(today)
    if (text === "end of month" || text === "eom") return new Date(today.getFullYear(), today.getMonth() + 1, 0)

    const inN = /^in (\d{1,3}) (day|days|d|week|weeks|w)$/.exec(text)
    if (inN) return addDays(today, Number(inN[1]) * (inN[2].startsWith("w") ? 7 : 1))

    // "fri", "friday", "next fri": the coming one (on a Friday, "fri" is a week out)
    const weekday = /^(?:next |this )?([a-z]+)$/.exec(text)
    if (weekday) {
        const idx = weekdayIndex(weekday[1])
        if (idx >= 0) return addDays(today, (idx - today.getDay() + 7) % 7 || 7)
    }

    const iso = BARE_DAY.exec(text)
    if (iso) return valid(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))

    // "10/30" or "10/30/2026" (US order, as the app writes dates)
    const slash = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(text)
    if (slash) return withYear(Number(slash[1]) - 1, Number(slash[2]), slash[3], today)

    // "oct 30", "october 30 2026", "30 oct"
    const monthFirst = /^([a-z]{3,9}) (\d{1,2})(?: (\d{4}))?$/.exec(text)
    if (monthFirst) {
        const m = monthIndex(monthFirst[1])
        if (m >= 0) return withYear(m, Number(monthFirst[2]), monthFirst[3], today)
    }
    const dayFirst = /^(\d{1,2}) ([a-z]{3,9})(?: (\d{4}))?$/.exec(text)
    if (dayFirst) {
        const m = monthIndex(dayFirst[2])
        if (m >= 0) return withYear(m, Number(dayFirst[1]), dayFirst[3], today)
    }
    return null
}

const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

/** 0–6 from "fri", "friday", "tues", "thurs"…; -1 when it isn't a weekday. */
function weekdayIndex(word: string): number {
    if (word.length < 3) return -1
    return WEEKDAY_NAMES.findIndex((name) => name.startsWith(word))
}

function monthIndex(word: string): number {
    return MONTHS.findIndex((m) => word.startsWith(m))
}

function valid(y: number, m: number, d: number): Date | null {
    const date = new Date(y, m, d)
    return date.getMonth() === m && date.getDate() === d ? date : null
}

/** A month and day with an optional year; without one, the next time that day comes round. */
function withYear(m: number, d: number, year: string | undefined, today: Date): Date | null {
    if (year) return valid(year.length === 2 ? 2000 + Number(year) : Number(year), m, d)
    const thisYear = valid(today.getFullYear(), m, d)
    if (!thisYear) return null
    return thisYear < today ? valid(today.getFullYear() + 1, m, d) : thisYear
}

/**
 * Work underway with nothing to finish by: a document or deliverable In progress or In review with
 * no due date. Worth a warning, since that's unplanned work (2026-10-29). Approved work needs none,
 * and work not started yet hasn't committed to one.
 */
export function needsDueDate(stage: string | null | undefined, dueDate: string | null | undefined): boolean {
    return (stage === 'in_progress' || stage === 'in_review') && !dueDate
}
