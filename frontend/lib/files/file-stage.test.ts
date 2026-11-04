import { describe, expect, it } from 'vitest'
import { fileStage } from './file-stage'

const firm = { isExternalViewer: false }
const client = { isExternalViewer: true }

describe('fileStage', () => {
    it('starts a document at Not started and a deliverable at To do', () => {
        expect(fileStage({}, { ...firm, isFolder: false, isInsideDeliverable: true })).toEqual({ tracked: true, stage: 'not_started' })
        expect(fileStage({ isDeliverable: true }, { ...firm, isFolder: true, isInsideDeliverable: false })).toEqual({ tracked: true, stage: 'to_do' })
    })

    it('shows the stage a tracked row has', () => {
        expect(fileStage({ activityStatus: 'in_review' }, { ...firm, isFolder: false, isInsideDeliverable: true }).stage).toBe('in_review')
        expect(fileStage({ isDeliverable: true, deliverableStatus: 'approved' }, { ...firm, isFolder: true, isInsideDeliverable: false }).stage).toBe('approved')
    })

    it('tracks a file outside any deliverable for the firm', () => {
        expect(fileStage({}, { ...firm, isFolder: false, isInsideDeliverable: false })).toEqual({ tracked: true, stage: 'not_started' })
        expect(fileStage({ activityStatus: 'in_progress' }, { ...firm, isFolder: false, isInsideDeliverable: false }).stage).toBe('in_progress')
    })

    it("keeps that stage from a client, but shows them a deliverable's documents", () => {
        expect(fileStage({ activityStatus: 'in_progress' }, { ...client, isFolder: false, isInsideDeliverable: false })).toEqual({ tracked: false, stage: null })
        expect(fileStage({ activityStatus: 'in_progress' }, { ...client, isFolder: false, isInsideDeliverable: true }).stage).toBe('in_progress')
    })

    it('leaves a plain folder with no stage, whatever an older value says', () => {
        expect(fileStage({}, { ...firm, isFolder: true, isInsideDeliverable: true })).toEqual({ tracked: false, stage: null })
        expect(fileStage({ activityStatus: 'in_progress' }, { ...firm, isFolder: true, isInsideDeliverable: false }).stage).toBeNull()
    })
})
