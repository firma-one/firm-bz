import { describe, it, expect } from 'vitest'
import { shareReportText } from './share-report-outcome'

describe('shareReportText (OT-3)', () => {
    it('says everyone was reached', () => {
        expect(shareReportText({ sent: 5, total: 5, failed: [] })).toEqual({ type: 'success', title: 'Report sent', message: 'Sent to 5 team members.' })
        expect(shareReportText({ sent: 1, total: 1, failed: [] }).message).toBe('Sent to 1 team member.')
    })

    it('names who was not reached when some were', () => {
        expect(shareReportText({ sent: 3, total: 5, failed: ['Ana', 'Raj'] })).toEqual({
            type: 'warning', title: 'Report sent to some', message: "Sent to 3 of 5. Couldn't reach Ana and Raj.",
        })
        expect(shareReportText({ sent: 2, total: 5, failed: ['Ana', 'Raj', 'Lee'] }).message).toBe("Sent to 2 of 5. Couldn't reach Ana, Raj and Lee.")
    })

    it('counts the ones without a name', () => {
        expect(shareReportText({ sent: 3, total: 5, failed: ['Ana'] }).message).toBe("Sent to 3 of 5. Couldn't reach Ana and 1 more.")
    })

    it('makes nothing sent an error', () => {
        expect(shareReportText({ sent: 0, total: 2, failed: ['Ana', 'Raj'] })).toEqual({ type: 'error', title: 'Report not sent', message: "Couldn't reach Ana and Raj." })
        expect(shareReportText({ sent: 0, total: 0, failed: [] }).type).toBe('error')
    })
})
