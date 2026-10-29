import { describe, it, expect } from 'vitest'
import { blockedOf, withoutFirmOnlySettings } from './blocked'

describe('blockedOf', () => {
    it('reads a stored flag', () => {
        expect(blockedOf({ blocked: { reason: 'client', note: 'Waiting on the export', at: '2026-10-29T10:00:00Z', by: 'u1' } }))
            .toEqual({ reason: 'client', note: 'Waiting on the export', at: '2026-10-29T10:00:00Z', by: 'u1' })
    })

    it('drops an empty note', () => {
        expect(blockedOf({ blocked: { reason: 'on_hold', note: '  ', at: 'x', by: 'u1' } })).toEqual({ reason: 'on_hold', at: 'x', by: 'u1' })
    })

    it('is null when not blocked, or the stored value is no flag', () => {
        expect(blockedOf({})).toBeNull()
        expect(blockedOf(null)).toBeNull()
        expect(blockedOf({ blocked: { reason: 'nope' } })).toBeNull()
        expect(blockedOf({ blocked: true })).toBeNull()
    })
})

describe('withoutFirmOnlySettings', () => {
    it('leaves the Blocked flag out, and everything else in', () => {
        const settings = { share: { createdAt: 'x' }, description: 'd', blocked: { reason: 'team', at: 'x', by: 'u' } }
        expect(withoutFirmOnlySettings(settings)).toEqual({ share: { createdAt: 'x' }, description: 'd' })
        expect(settings.blocked).toBeTruthy()
    })

    it('passes settings with no flag through as they are', () => {
        const settings = { description: 'd' }
        expect(withoutFirmOnlySettings(settings)).toBe(settings)
        expect(withoutFirmOnlySettings(null)).toBeNull()
    })
})
