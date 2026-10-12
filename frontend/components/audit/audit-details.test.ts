import { describe, it, expect } from 'vitest'
import { eventDetails, type AuditEventRow } from './audit-with-filters'

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
