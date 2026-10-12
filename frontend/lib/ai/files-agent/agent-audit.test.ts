import { describe, it, expect } from 'vitest'
import { agentApprovalMeta, approverLabel } from './agent-audit'

describe('approverLabel', () => {
    it('prefers the full name', () => {
        expect(approverLabel({
            id: 'u1', email: 'd@example.com', user_metadata: { full_name: 'Deepak Shettigar', name: 'Deepak' },
        })).toBe('Deepak Shettigar')
    })

    it('falls back to name, then email, then id', () => {
        expect(approverLabel({ id: 'u1', email: 'd@example.com', user_metadata: { name: 'Deepak' } })).toBe('Deepak')
        expect(approverLabel({ id: 'u1', email: 'd@example.com', user_metadata: {} })).toBe('d@example.com')
        expect(approverLabel({ id: 'u1' })).toBe('u1')
    })

    /** Supabase metadata is untyped JSON, so a non-string must not reach the audit row. */
    it('ignores non-string metadata values', () => {
        expect(approverLabel({
            id: 'u1', email: 'd@example.com', user_metadata: { full_name: 42, name: null },
        })).toBe('d@example.com')
    })

    it('never returns empty, even with no email', () => {
        expect(approverLabel({ id: 'u1', email: null, user_metadata: null })).toBe('u1')
    })
})

describe('agentApprovalMeta', () => {
    /** The agent marker and the approver are inseparable — that is the point of the helper. */
    it('always carries both the agent marker and the approver', () => {
        const meta = agentApprovalMeta({
            id: 'u1', email: 'd@example.com', user_metadata: { full_name: 'Deepak Shettigar' },
        })
        expect(meta).toEqual({
            viaAgent: true,
            approvedBy: 'u1',
            approvedByLabel: 'Deepak Shettigar',
        })
    })

    it('records the id separately from the label, so the label can be denormalized', () => {
        const meta = agentApprovalMeta({ id: 'u1', email: 'd@example.com', user_metadata: {} })
        expect(meta.approvedBy).toBe('u1')
        expect(meta.approvedByLabel).toBe('d@example.com')
    })
})
