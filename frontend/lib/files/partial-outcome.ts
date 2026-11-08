/**
 * What a copy, an import or a ZIP that only partly worked says: what was done, out of how many, and
 * what wasn't, with why. "Copied 12 of 15 files to Acme Audit. Not copied: Budget.xlsx, Q3.pdf ·
 * Google Drive has this locked…". Nothing done is an error, not a success: the caller decides that
 * with `outcomeKind`. Plain TypeScript, for the routes and the browser alike.
 */

/** Something that wasn't done, and why when known (a StorageFailure's words). */
export interface NotDone {
    name: string
    reason?: string
}

/** How many names to list before "and N more". */
const MAX_NAMES = 3

function listNames(names: string[]): string {
    if (names.length <= MAX_NAMES) return names.join(', ')
    return `${names.slice(0, MAX_NAMES).join(', ')} and ${names.length - MAX_NAMES} more`
}

/**
 * The things not done, grouped by why: "Budget.xlsx, Q3.pdf · Google Drive has this locked…". Several
 * reasons read one after another: "Budget.xlsx · reason one. Q3.pdf · reason two."
 */
export function describeNotDone(items: NotDone[]): string {
    if (items.length === 0) return ''
    const byReason = new Map<string, string[]>()
    for (const item of items) {
        const key = item.reason?.trim() ?? ''
        byReason.set(key, [...(byReason.get(key) ?? []), item.name])
    }
    const groups = Array.from(byReason.entries())
    // Only the first few groups: a dozen different reasons would not fit a toast.
    const shown = groups.slice(0, MAX_NAMES).map(([reason, names]) => {
        const listed = listNames(names)
        if (!reason) return listed
        return `${listed} · ${reason.replace(/[.\s]+$/, '')}`
    })
    const more = groups.slice(MAX_NAMES).reduce((n, [, names]) => n + names.length, 0)
    return `${shown.join('. ')}${more > 0 ? `. And ${more} more` : ''}.`
}

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

export interface PartialOutcome {
    /** How many were done. */
    done: number
    /** How many were tried. */
    total: number
    /** Past tense of the action, capitalized: "Copied", "Imported", "Downloaded". */
    verb: string
    /** What was counted, singular: "file". */
    noun: string
    /** Where they went, as it reads after the count: "to Acme Audit", "from Google Drive". */
    where?: string
    notDone: NotDone[]
    /** The label before the names: "Not copied", "Not included". */
    notDoneLabel: string
}

/** "Copied 12 of 15 files to Acme Audit. Not copied: Budget.xlsx · Google Drive has this locked…" */
export function describeOutcome({ done, total, verb, noun, where, notDone, notDoneLabel }: PartialOutcome): string {
    const counted = done === total ? `${verb} ${plural(total, noun)}` : `${verb} ${done} of ${plural(total, noun)}`
    const head = `${counted}${where ? ` ${where}` : ''}.`
    if (notDone.length === 0) return head
    return `${head} ${notDoneLabel}: ${describeNotDone(notDone)}`
}

/** Whether a run is a success, a partial success, or a failure. Nothing done out of something is a failure. */
export function outcomeKind(done: number, total: number): 'success' | 'partial' | 'failed' {
    if (total > 0 && done === 0) return 'failed'
    return done < total ? 'partial' : 'success'
}
