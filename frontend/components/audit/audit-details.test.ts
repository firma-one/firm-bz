import { describe, it, expect } from 'vitest'
import { eventDetails, type AuditEventRow } from './audit-with-filters'
import { FIRM_ONLY_AUDIT_EVENTS, isValidAuditEventType } from '@/lib/audit-event-types'

const row = (metadata: Record<string, unknown>): AuditEventRow => ({
    id: 'e1',
    eventType: 'DOCUMENT_CHANGED',
    eventAt: '2026-10-09T12:00:00Z',
    actorUserId: 'agent-1',
    actorEmail: 'brio+firm@agents.firma.bz',
    projectDocumentId: null,
    metadata,
})

describe('eventDetails — agent attribution', () => {
    /**
     * The core requirement: an agent-performed change must name the person who approved it, or the
     * trail reads as though a machine acted unprompted.
     */
    it('names the approver on an agent-performed change', () => {
        expect(eventDetails(row({
            fileName: 'Report.docx', viaAgent: true,
            approvedBy: 'u1', approvedByLabel: 'Deepak Shettigar',
        }))).toBe('Report.docx · approved by Deepak Shettigar')
    })

    it('shows the rename as before → after, with the approver', () => {
        expect(eventDetails(row({
            fileName: 'Interviewer_Question_Bank_Archive.docx',
            previousName: 'Interviewer_Question_Bank (1).docx',
            viaAgent: true, approvedBy: 'u1', approvedByLabel: 'Deepak Shettigar',
        }))).toBe('Interviewer_Question_Bank (1).docx → Interviewer_Question_Bank_Archive.docx · approved by Deepak Shettigar')
    })

    /** A human change must not gain an approval clause. */
    it('says nothing extra for a human change', () => {
        expect(eventDetails(row({ fileName: 'Report.docx' }))).toBe('Report.docx')
    })

    /** Rows written before the approver was recorded still mark the agent honestly. */
    it('falls back to the agent marker when no approver was recorded', () => {
        expect(eventDetails(row({ fileName: 'Report.docx', viaAgent: true })))
            .toBe('Report.docx · via agent')
    })

    it('uses the id when only the id was recorded', () => {
        expect(eventDetails(row({ fileName: 'Report.docx', viaAgent: true, approvedBy: 'u1' })))
            .toBe('Report.docx · approved by u1')
    })

    it('attaches the approver to a folder creation', () => {
        expect(eventDetails(row({
            fileName: '05-Working-Papers', parentId: 'p1',
            viaAgent: true, approvedBy: 'u1', approvedByLabel: 'Deepak Shettigar',
        }))).toBe('05-Working-Papers · approved by Deepak Shettigar')
    })

    /** Identical names must not render as a no-op arrow. */
    it('does not render an arrow when the name is unchanged', () => {
        expect(eventDetails(row({ fileName: 'Report.docx', previousName: 'Report.docx' })))
            .toBe('Report.docx')
    })
})

describe('eventDetails — file names, never raw JSON', () => {
    /** The download-share route recorded the name as `filename` before it also wrote `fileName`. */
    it('reads a name recorded under `filename`', () => {
        expect(eventDetails(row({ fileId: 'drive-1', filename: 'Report.pdf', usedPdf: true }))).toBe('Report.pdf')
    })

    it('says the name is missing for a file event that has none, instead of printing its metadata', () => {
        const opened = { ...row({ externalId: 'drive-1', mimeType: 'application/json' }), eventType: 'DOCUMENT_OPENED' }
        expect(eventDetails(opened)).toBe('File name not recorded')
    })

    it('shows other events\' plain values, without ids or JSON', () => {
        const other = { ...row({ clientId: 'c1', region: 'EMEA', seats: 5 }), eventType: 'FIRM_SETTINGS_CHANGED' }
        expect(eventDetails(other)).toBe('Region: EMEA · Seats: 5')
    })
})


describe('eventDetails — internal memos and Brio', () => {
    it('says what happened after the file: added, edited, read by Brio', () => {
        expect(eventDetails({ ...row({
            fileName: '2026-11-12-Call-with-Dana.md', previousName: '2026-11-12-Call-notes.md', summary: 'Title or date changed',
        }), eventType: 'DOCUMENT_MEMO_EDITED' })).toBe('2026-11-12-Call-notes.md → 2026-11-12-Call-with-Dana.md · Title or date changed')
        expect(eventDetails({ ...row({
            fileName: '2026-11-12-Call-with-Dana.md', summary: '3 action items · 1 RAID suggestion · when it was added',
        }), eventType: 'DOCUMENT_AI_REVIEWED' })).toBe('2026-11-12-Call-with-Dana.md · 3 action items · 1 RAID suggestion · when it was added')
    })

    it('memo events are the firm\'s own: never in a Reviewer\'s or a Limited Access contributor\'s view of the trail', () => {
        for (const e of ['DOCUMENT_MEMO_ADDED', 'DOCUMENT_MEMO_EDITED', 'DOCUMENT_AI_REVIEWED']) {
            expect(isValidAuditEventType(e)).toBe(true)
            expect(FIRM_ONLY_AUDIT_EVENTS).toContain(e)
        }
    })
})
