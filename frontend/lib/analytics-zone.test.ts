import { describe, it, expect } from 'vitest'
import { analyticsModeFor, analyticsModeFromRequest } from './analytics-zone'

describe('analyticsModeFor', () => {
    it.each(['US', 'GB', 'AU', 'CH', 'IN', 'NZ', 'BR'])('gives %s the notice', (country) => {
        expect(analyticsModeFor(country)).toBe('notice')
    })

    it.each(['DE', 'FR', 'IE', 'NO', 'IS', 'LI', 'RE', 'GP', 'AX'])('keeps %s on the opt-in banner', (country) => {
        expect(analyticsModeFor(country)).toBe('consent')
    })

    it('keeps Quebec on the opt-in banner and gives the rest of Canada the notice', () => {
        expect(analyticsModeFor('CA', 'QC')).toBe('consent')
        expect(analyticsModeFor('CA', 'ON')).toBe('notice')
        expect(analyticsModeFor('CA')).toBe('notice')
    })

    it('treats an unknown or malformed country as opt-in', () => {
        expect(analyticsModeFor(null)).toBe('consent')
        expect(analyticsModeFor(undefined)).toBe('consent')
        expect(analyticsModeFor('')).toBe('consent')
        expect(analyticsModeFor('XX1')).toBe('consent')
    })

    it('ignores case and stray spaces', () => {
        expect(analyticsModeFor(' us ')).toBe('notice')
        expect(analyticsModeFor('de')).toBe('consent')
        expect(analyticsModeFor('ca', 'qc')).toBe('consent')
    })
})

describe('analyticsModeFromRequest', () => {
    it('uses the Vercel country and region headers', () => {
        expect(analyticsModeFromRequest({ country: 'US' })).toBe('notice')
        expect(analyticsModeFromRequest({ country: 'CA', region: 'QC' })).toBe('consent')
        expect(analyticsModeFromRequest({ country: null })).toBe('consent')
    })

    it('honors the override outside production, including a region', () => {
        expect(analyticsModeFromRequest({ country: null, override: 'US', vercelEnv: 'preview' })).toBe('notice')
        expect(analyticsModeFromRequest({ country: 'US', override: 'DE', vercelEnv: undefined })).toBe('consent')
        expect(analyticsModeFromRequest({ country: 'US', override: 'CA-QC', vercelEnv: 'development' })).toBe('consent')
    })

    it('ignores the override in production', () => {
        expect(analyticsModeFromRequest({ country: 'DE', override: 'US', vercelEnv: 'production' })).toBe('consent')
        expect(analyticsModeFromRequest({ country: 'US', override: 'DE', vercelEnv: 'production' })).toBe('notice')
    })
})
