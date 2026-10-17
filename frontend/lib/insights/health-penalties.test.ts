import { describe, it, expect } from 'vitest'
import { overdueDeliverablesPenalty, planningGapCount } from './health-penalties'

describe('overdueDeliverablesPenalty', () => {
    it('costs nothing when nothing is overdue', () => {
        expect(overdueDeliverablesPenalty(0)).toBeNull()
    })

    it('makes one overdue deliverable a high-severity deduction', () => {
        expect(overdueDeliverablesPenalty(1)).toEqual({ label: '1 overdue deliverable', points: 15 })
    })

    it('adds up per deliverable, to a cap', () => {
        expect(overdueDeliverablesPenalty(2)).toEqual({ label: '2 overdue deliverables', points: 30 })
        expect(overdueDeliverablesPenalty(5)?.points).toBe(45)
    })
})

describe('planningGapCount', () => {
    it('counts every missing due date and assignee on in-flight work', () => {
        expect(planningGapCount({
            deliverableTotal: 1, deliverableWithDueDate: 1,
            docTotal: 4, docWithDueDate: 0, docWithAssignee: 0,
        })).toBe(8)
    })

    it('is zero without planning data', () => {
        expect(planningGapCount(undefined)).toBe(0)
        expect(planningGapCount(null)).toBe(0)
    })
})
