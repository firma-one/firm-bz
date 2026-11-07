import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }))

import { storageFailure } from '@/lib/connectors/storage-failure'
import { applyFailureMessage } from './apply-failure'

// What Brio's panel says when a proposal couldn't be applied: the reason where it was written for a reader,
// and nothing that may carry internals.

describe('applyFailureMessage', () => {
    it("passes on the storage's reason", () => {
        const refusal = storageFailure('locked', 'OneDrive')
        expect(applyFailureMessage(refusal)).toBe(refusal.message)
    })

    it.each(['"Confidential" cannot be used as a name', 'That folder name is reserved'])('passes on a format rule: %s', (message) => {
        expect(applyFailureMessage(new Error(message))).toBe(message)
    })

    it('collapses anything else, so internals never reach the panel', () => {
        expect(applyFailureMessage(new Error('connect ECONNREFUSED 10.0.0.4:5432'))).toBe('Could not apply this change')
        expect(applyFailureMessage('nope')).toBe('Could not apply this change')
    })
})
