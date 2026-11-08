import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))

import { asStorageFailure, folderStepFailure, reconnectFailure } from './folder-step-failure'
import { StorageFailure } from './storage-failure'

/** P1-32, P1-33: a folder step the storage refused says why, in StorageFailure's words. */
describe('folder step failures', () => {
    it("reads Drive's refusal out of an adapter's thrown message", () => {
        const e = new Error(
            'Failed to create folder Acme: 403 - ' + JSON.stringify({ error: { code: 403, message: 'Insufficient permissions', errors: [{ reason: 'insufficientFilePermissions' }] } })
        )
        const f = asStorageFailure(e, 'Google Drive')
        expect(f).toBeInstanceOf(StorageFailure)
        expect(f?.reason).toBe('no_permission')
        expect(f?.message).toMatch(/doesn't have permission/)
    })

    it("reads Graph's out-of-space answer", () => {
        const e = new Error('Failed to create folder X: 507 - ' + JSON.stringify({ error: { code: 'quotaLimitReached', message: 'Insufficient Space Available' } }))
        expect(asStorageFailure(e, 'OneDrive')?.reason).toBe('storage_full')
    })

    it('answers null for an error that did not come from the storage', () => {
        expect(asStorageFailure(new Error('Cannot read properties of undefined'), 'Google Drive')).toBeNull()
        expect(folderStepFailure(new Error('boom'), 'Google Drive').message).toBe('Google Drive refused the change.')
    })

    it('gives one reconnect reason', () => {
        const f = reconnectFailure('OneDrive')
        expect(f.reason).toBe('reconnect')
        expect(f.message).toBe('The connection to OneDrive needs renewing. Reconnect the storage, then try again.')
    })
})
