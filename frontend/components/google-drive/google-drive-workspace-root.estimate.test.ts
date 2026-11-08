import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: vi.fn() } } }))

import { migrationEstimateLabel } from './google-drive-workspace-root'

/** P2-34: no false "about 1 minute" for a large folder. */
describe('migrationEstimateLabel', () => {
    it('says there is no estimate, and why, when the files could not be counted', () => {
        expect(migrationEstimateLabel({ itemCount: null, estimatedMinutes: null, reason: 'The connection to Google Drive needs renewing.' })).toBe(
            'No time estimate · The connection to Google Drive needs renewing.'
        )
    })

    it('calls an estimate with folders inside a minimum', () => {
        expect(migrationEstimateLabel({ itemCount: 4, estimatedMinutes: 1, atLeast: true })).toBe('At least ~1 min maintenance window · 4 top-level items')
        expect(migrationEstimateLabel({ itemCount: 40, estimatedMinutes: 1 })).toBe('~1 min maintenance window · 40 items')
    })
})
