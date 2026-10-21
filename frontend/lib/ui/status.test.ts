import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { ClientStatus, ConnectorStatus, EngagementStatus, InvitationStatus, TicketStatus } from '@prisma/client'
import { STAGES, STAGE_LABEL, STAGE_LANE_CLASSES, STATUS, statusOf, type StatusKind } from './status'

// The enums each lifecycle is read from at runtime. ActivityStatus is a TypeScript union, not a
// Prisma enum, so its values are listed here.
const ENUM_VALUES: Record<StatusKind, string[]> = {
    deliverable: ['to_do', 'in_progress', 'in_review', 'approved'],
    engagement: Object.values(EngagementStatus),
    client: Object.values(ClientStatus),
    invitation: Object.values(InvitationStatus),
    connector: Object.values(ConnectorStatus),
    ticket: Object.values(TicketStatus),
}

describe('status language', () => {
    it.each(Object.keys(ENUM_VALUES) as StatusKind[])('maps every %s value to a stage and a label', (kind) => {
        for (const value of ENUM_VALUES[kind]) {
            const entry = (STATUS[kind] as Record<string, { stage: string; label: string }>)[value]
            expect(entry, `${kind}.${value}`).toBeDefined()
            expect(STAGES).toContain(entry.stage)
            expect(entry.label.trim()).not.toBe('')
        }
        expect(Object.keys(STATUS[kind]).sort()).toEqual([...ENUM_VALUES[kind]].sort())
    })

    it('names every stage', () => {
        for (const stage of STAGES) expect(STAGE_LABEL[stage]).toBeTruthy()
    })

    it('has pill and icon tokens for every stage', () => {
        const css = readFileSync(resolve(__dirname, '../../app/ui-tokens.css'), 'utf8')
        for (const stage of STAGES) {
            for (const part of ['bg', 'fg', 'icon']) expect(css).toContain(`--ui-status-${stage}-${part}:`)
        }
        for (const stage of Object.keys(STAGE_LANE_CLASSES)) {
            for (const part of ['bar', 'lane', 'lane-line', 'lane-target', 'lane-target-line']) {
                expect(css).toContain(`--ui-status-${stage}-${part}:`)
            }
        }
    })

    it('gives every Board lane a stage with lane tokens', () => {
        for (const value of ENUM_VALUES.deliverable) {
            expect(Object.keys(STAGE_LANE_CLASSES)).toContain(STATUS.deliverable[value as 'to_do'].stage)
        }
    })

    it('shows an unknown value as itself, not started', () => {
        expect(statusOf('engagement', 'ARCHIVED')).toEqual({ stage: 'not-started', label: 'ARCHIVED' })
    })
})
