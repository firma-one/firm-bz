import { describe, it, expect } from 'vitest'
import { approvalsOf, archiveNameFor, currentApproval, versionName } from './approvals'
import { withoutFirmOnlySettings } from './blocked'

// The decision record of what was approved (.claude/plans/document-approval-record.md).

const record = (id: string, extra: object = {}) => ({
    id,
    version: { id: `v-${id}`, label: '3.0', savedAt: '2026-10-28T15:30:00Z' },
    archived: { fileId: `copy-${id}`, name: 'Plan · approved Version 3.0.xlsx' },
    approvedAt: '2026-10-28T16:00:00Z',
    approvedBy: 'u-ana',
    ...extra,
})

describe('approvalsOf', () => {
    it('reads the record, oldest first, and skips what isn\'t one', () => {
        expect(approvalsOf({ approvals: [record('a'), { nope: true }, record('b')] }).map((r) => r.id)).toEqual(['a', 'b'])
        expect(approvalsOf({})).toEqual([])
        expect(approvalsOf(null)).toEqual([])
    })
})

describe('currentApproval', () => {
    it('is the latest approval while it stands', () => {
        expect(currentApproval({ approvals: [record('a', { unlockedAt: 'x' }), record('b')] })?.id).toBe('b')
    })

    it('is none once the latest has been reopened', () => {
        expect(currentApproval({ approvals: [record('a'), record('b', { unlockedAt: 'x' })] })).toBeNull()
    })
})

describe('versionName', () => {
    it("is OneDrive's own name, or a Google version's saved time", () => {
        expect(versionName({ label: '3.0', at: '2026-10-28T15:30:00Z' })).toBe('Version 3.0')
        expect(versionName({ label: null, at: '2026-10-28T15:30:00Z' })).toMatch(/^Oct 28, 2026/)
    })
})

describe('archiveNameFor', () => {
    it("puts what was approved before the extension, in the storage's name for it", () => {
        expect(archiveNameFor('Plan.xlsx', { label: '3.0', savedAt: '2026-10-28T15:30:00Z' })).toBe('Plan · approved Version 3.0.xlsx')
    })

    it("writes a Google version's time without a colon, which OneDrive file names can't hold", () => {
        expect(archiveNameFor('Pitch deck', { savedAt: '2026-10-28T15:30:00Z' })).toBe('Pitch deck · approved 2026-10-28 15.30')
    })
})

describe('withoutFirmOnlySettings and approvals', () => {
    it('keeps the approvals for a client, without their Archive copies', () => {
        const stripped = withoutFirmOnlySettings({ approvals: [record('a')] }) as { approvals: Record<string, unknown>[] }
        expect(stripped.approvals[0]).not.toHaveProperty('archived')
        expect(stripped.approvals[0].id).toBe('a')
    })
})
