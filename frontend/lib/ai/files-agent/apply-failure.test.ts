import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }))

import { storageFailure } from '@/lib/connectors/storage-failure'
import { applyFailureMessage, scaffoldFolderFailure, storageWordsFor } from './apply-failure'

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

describe('the storage’s answer to a folder create', () => {
    it('reads the adapter’s refusal into the storage’s words, when the provider is known', () => {
        const refusal = new Error('Failed to create folder Notes: 403 - {"error":{"errors":[{"reason":"insufficientFilePermissions"}],"message":"no"}}')
        expect(applyFailureMessage(refusal, 'Google Drive')).toBe("The Google Drive account connected to this client doesn't have permission to change this.")
        expect(storageWordsFor(new Error('Failed to create folder Notes: 507 - not json'), 'OneDrive'))
            .toBe('The OneDrive account connected to this client is out of storage space. Free some up, then try again.')
    })

    it('says the provider couldn’t be reached when fetch never got there', () => {
        expect(storageWordsFor(new TypeError('fetch failed'), 'OneDrive')).toBe("Couldn't reach OneDrive. Try again in a moment.")
    })

    it('a code fault is not the storage', () => {
        expect(storageWordsFor(new TypeError("Cannot read properties of undefined (reading 'id')"), 'OneDrive')).toBeNull()
        expect(scaffoldFolderFailure(new Error('connect ECONNREFUSED 10.0.0.4:5432'), 'Google Drive')).toBe("Couldn't create this folder.")
    })
})
