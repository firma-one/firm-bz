import { describe, it, expect } from 'vitest'
import { bulkDownloadNote, readBulkDownloadHeaders } from './bulk-download-summary'

// A ZIP that's short of files says so, from the route's headers, and never reads as complete.

const headers = (h: Record<string, string>) => new Headers(h)

describe('bulk download headers', () => {
    it('reads what was left out, named with why', () => {
        const summary = readBulkDownloadHeaders(headers({
            'X-Bulk-Download-Included': '96',
            'X-Bulk-Download-Failed': '3',
            'X-Bulk-Download-Withheld': '1',
            'X-Bulk-Download-Capped': 'false',
            'X-Bulk-Download-Limit': '100',
            'X-Bulk-Download-Not-Included': encodeURIComponent(JSON.stringify([
                { name: 'Budget.xlsx', reason: 'Google Drive has this locked.' },
                { name: 'Q3.pdf', reason: 'Google Drive has this locked.' },
                { name: 'Notes.docx', reason: 'This is no longer in Google Drive.' },
            ])),
        }))
        expect(summary).toMatchObject({ included: 96, total: 100, capped: false })
        expect(bulkDownloadNote(summary)).toBe('Downloaded 96 of 100. Not included: Budget.xlsx, Q3.pdf · Google Drive has this locked. Notes.docx · This is no longer in Google Drive. And 1 more.')
    })

    it('says when the selection was cut at the limit', () => {
        const note = bulkDownloadNote(readBulkDownloadHeaders(headers({ 'X-Bulk-Download-Included': '100', 'X-Bulk-Download-Capped': 'true', 'X-Bulk-Download-Limit': '100' })))
        expect(note).toBe('Only the first 100 files fit in one download. Download the rest separately.')
    })

    it('has nothing to say about a complete ZIP', () => {
        expect(bulkDownloadNote(readBulkDownloadHeaders(headers({ 'X-Bulk-Download-Included': '4', 'X-Bulk-Download-Capped': 'false' })))).toBeNull()
    })
})
