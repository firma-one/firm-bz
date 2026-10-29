import { describe, it, expect } from 'vitest'
import { DEMO_FIRM } from './static-demo-data'
import { demoDocumentStages, demoFilesIn, getDemoDeliverables } from './demo-deliverables'
import { deriveDeliverableStage } from '@/lib/deliverable-derivation'

// The tour's deliverables keep the app's rule: a deliverable's stage is what its documents' stages
// make it (.claude/plans/deliverable-stages-blocked.md), so the Board, the pane and Files agree.

const engagements = DEMO_FIRM.clients.flatMap((c) => c.engagements)

describe('demo document stages', () => {
    it.each(engagements.map((e) => [e.name, e] as const))("make each deliverable's stage in %s", (_name, engagement) => {
        for (const d of getDemoDeliverables(engagement)) {
            const stages = Object.values(demoDocumentStages(d.status, demoFilesIn(d.folder))).map((s) => s.stage)
            if (stages.length === 0) continue
            expect(deriveDeliverableStage(stages)).toBe(d.status)
        }
    })

    it('keeps a document off the Board, and one blocked, somewhere on the tour', () => {
        const all = engagements.flatMap((e) => getDemoDeliverables(e).flatMap((d) => Object.values(demoDocumentStages(d.status, demoFilesIn(d.folder)))))
        expect(all.some((s) => s.stage === 'not_started')).toBe(true)
        expect(all.some((s) => s.blocked)).toBe(true)
    })
})
