import { describe, it, expect } from 'vitest'
import { DEMO_FIRM } from './static-demo-data'
import { getDemoDeliverables } from './demo-deliverables'
import { buildDemoFirmBrief, deliverableName, filesChat, overviewChat, DEMO_FREEFORM_REPLY } from './demo-brio'

const client = DEMO_FIRM.clients[0]
const engagement = client.engagements[0]

describe('deliverableName', () => {
    it('turns a milestone folder name into a readable title', () => {
        expect(deliverableName('01__Market_&_Competitive_Intelligence_Report')).toBe('Market & Competitive Intelligence Report')
    })
})

describe('buildDemoFirmBrief', () => {
    it('has the three sections the firm brief renders', () => {
        const brief = buildDemoFirmBrief(DEMO_FIRM)
        expect(brief).toContain('## Where things stand')
        expect(brief).toContain('## Needs attention')
        expect(brief).toContain('## Worth watching')
    })

    it('counts the sample firm as it is', () => {
        const engagements = DEMO_FIRM.clients.reduce((n, c) => n + c.engagements.length, 0)
        expect(buildDemoFirmBrief(DEMO_FIRM)).toContain(`${engagements} live engagements`)
    })
})

describe('overviewChat', () => {
    it('offers three prompts, each with an answer', () => {
        const turns = overviewChat(client, engagement)
        expect(turns).toHaveLength(3)
        turns.forEach((t) => expect(t.answer.length).toBeGreaterThan(0))
    })

    it('summarizes the deliverables the board shows', () => {
        const total = getDemoDeliverables(engagement).length
        const summary = overviewChat(client, engagement)[0].answer
        expect(summary).toContain(engagement.name)
        expect(summary).toContain(`Of its ${total} deliverables`)
    })
})

describe('filesChat', () => {
    it('lists every deliverable folder in the table answer', () => {
        const table = filesChat(engagement)[0].answer
        for (const d of getDemoDeliverables(engagement)) {
            expect(table).toContain(deliverableName(d.folder.name))
        }
    })

    it('says plainly that the demo answers only its own prompts', () => {
        expect(DEMO_FREEFORM_REPLY).toMatch(/demo/)
    })
})
