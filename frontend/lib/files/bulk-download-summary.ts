import { describeNotDone, type NotDone } from '@/lib/files/partial-outcome'

/**
 * What a "Download as ZIP" left out, read from the route's `X-Bulk-Download-*` headers
 * (app/api/projects/[projectId]/documents/bulk-download/route.ts documents them), in the words the
 * Downloads panel shows: "Downloaded 96 of 100. Not included: Budget.xlsx · Google Drive has this
 * locked." and "Only the first 100 files fit in one download." A short ZIP is still a ZIP (decision 1);
 * it just never reads as complete (FI-5).
 */
export interface BulkDownloadSummary {
    included: number
    /** Everything that was asked for and counted: in the ZIP, unreadable, refused or withheld. */
    total: number
    capped: boolean
    limit: number | null
    notIncluded: NotDone[]
}

const count = (headers: Headers, name: string) => {
    const n = Number(headers.get(name))
    return Number.isFinite(n) && n > 0 ? n : 0
}

export function readBulkDownloadHeaders(headers: Headers): BulkDownloadSummary {
    const included = count(headers, 'X-Bulk-Download-Included')
    const leftOut = count(headers, 'X-Bulk-Download-Skipped') + count(headers, 'X-Bulk-Download-Failed') + count(headers, 'X-Bulk-Download-Withheld')
    let notIncluded: NotDone[] = []
    const named = headers.get('X-Bulk-Download-Not-Included')
    if (named) {
        try {
            const parsed = JSON.parse(decodeURIComponent(named)) as unknown
            if (Array.isArray(parsed)) {
                notIncluded = parsed
                    .filter((x): x is { name: string; reason?: string } => !!x && typeof (x as { name?: unknown }).name === 'string')
                    .map((x) => ({ name: x.name, reason: typeof x.reason === 'string' ? x.reason : undefined }))
            }
        } catch { /* unreadable names: the counts still say it's short */ }
    }
    const limit = count(headers, 'X-Bulk-Download-Limit') || null
    return { included, total: included + leftOut, capped: headers.get('X-Bulk-Download-Capped') === 'true', limit, notIncluded }
}

/** The panel's note for a ZIP that's short of something, or null when everything asked for is in it. */
export function bulkDownloadNote(summary: BulkDownloadSummary): string | null {
    const parts: string[] = []
    if (summary.total > summary.included) {
        parts.push(`Downloaded ${summary.included} of ${summary.total}.`)
        const unnamed = summary.total - summary.included - summary.notIncluded.length
        if (summary.notIncluded.length > 0) {
            parts.push(`Not included: ${describeNotDone(summary.notIncluded)}${unnamed > 0 ? ` And ${unnamed} more.` : ''}`)
        }
    }
    if (summary.capped) {
        parts.push(`Only the first ${summary.limit ?? 'few'} files fit in one download. Download the rest separately.`)
    }
    return parts.length > 0 ? parts.join(' ') : null
}
