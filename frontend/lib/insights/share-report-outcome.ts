/**
 * What emailing the health report did, from the real send results (OT-3): how many of the engagement's
 * people it reached, and who it couldn't. The share-report route answers it; the Overview says it.
 */
export interface ShareReportOutcome {
    sent: number
    /** Everyone it was meant for: each member of the engagement. */
    total: number
    /** Who it couldn't reach, by name (or email when there's no name). May be shorter than total − sent. */
    failed: string[]
}

/** "Ana", "Ana and Raj", "Ana, Raj and Lee", with "and 2 more" for the ones without a name. */
function listOf(names: string[], unnamed: number): string {
    const parts = [...names, ...(unnamed > 0 ? [`${unnamed} more`] : [])]
    if (parts.length <= 1) return parts[0] ?? ''
    return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/** The toast for an outcome. Nothing sent is an error; some sent is a warning that names who wasn't. */
export function shareReportText(outcome: ShareReportOutcome): { type: 'success' | 'warning' | 'error'; title: string; message: string } {
    const { sent, total, failed } = outcome
    const missed = Math.max(0, total - sent)
    const who = listOf(failed.slice(0, missed), Math.max(0, missed - failed.length))
    if (sent >= total && total > 0) {
        return { type: 'success', title: 'Report sent', message: `Sent to ${total} team member${total === 1 ? '' : 's'}.` }
    }
    if (sent === 0) {
        return { type: 'error', title: 'Report not sent', message: who ? `Couldn't reach ${who}.` : "Couldn't reach anyone on this engagement." }
    }
    return { type: 'warning', title: 'Report sent to some', message: `Sent to ${sent} of ${total}. Couldn't reach ${who}.` }
}
