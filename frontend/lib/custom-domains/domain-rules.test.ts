import { describe, it, expect, vi, afterEach } from 'vitest'
import {
    checkCustomHost, checkSubdomainLabel, isFirmaHost, isPlatformHost, kindsForPlan, lowestPlanFor, normalizeHost, pricingColumnForPlan,
} from './domain-rules'

afterEach(() => vi.unstubAllEnvs())

describe('checkSubdomainLabel', () => {
    it('turns a valid label into a host under the brand domain', () => {
        expect(checkSubdomainLabel(' Acme ')).toEqual({ ok: true, host: 'acme.firma.bz' })
        expect(checkSubdomainLabel('north-wind2')).toEqual({ ok: true, host: 'north-wind2.firma.bz' })
    })

    it('refuses bad shapes', () => {
        for (const bad of ['ab', 'acme_co', '-acme', 'acme-', 'a--b', 'acme.co', 'x'.repeat(41), '']) {
            expect(checkSubdomainLabel(bad)).toMatchObject({ ok: false, reason: 'format' })
        }
    })

    it('says "not available" for reserved names, never "taken"', () => {
        expect(checkSubdomainLabel('admin')).toEqual({ ok: false, reason: 'reserved', message: 'Not available · try another' })
        expect(checkSubdomainLabel('WWW')).toMatchObject({ reason: 'reserved' })
    })
})

describe('checkCustomHost', () => {
    it('accepts a subdomain of the customer\'s site, normalized', () => {
        expect(checkCustomHost('https://Portal.Acme.com/login')).toEqual({ ok: true, host: 'portal.acme.com' })
        expect(checkCustomHost('clients.acme.co.uk')).toEqual({ ok: true, host: 'clients.acme.co.uk' })
    })

    it('refuses the bare domain, Firma names and nonsense', () => {
        expect(checkCustomHost('acme.com')).toMatchObject({ ok: false, reason: 'apex' })
        expect(checkCustomHost('acme.firma.bz')).toMatchObject({ ok: false, reason: 'platform' })
        expect(checkCustomHost('not a domain')).toMatchObject({ ok: false, reason: 'format' })
        expect(checkCustomHost('portal.acme.c0m')).toMatchObject({ ok: false, reason: 'format' })
    })
})

describe('hosts', () => {
    it('normalizes', () => {
        expect(normalizeHost('HTTPS://www.Firma.bz:443/x?y#z')).toBe('www.firma.bz')
        expect(normalizeHost('acme.firma.bz.')).toBe('acme.firma.bz')
    })

    it('knows Firma\'s own hosts from branded ones', () => {
        vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.firma.bz')
        for (const h of ['firma.bz', 'www.firma.bz', 'preview.firma.bz', 'localhost:3000', 'firm-bz-git-dev.vercel.app']) {
            expect(isPlatformHost(h)).toBe(true)
        }
        for (const h of ['datasentry.firma.bz', 'app.firma.bz', 'portal.acme.com']) expect(isPlatformHost(h)).toBe(false)
        expect(isFirmaHost('datasentry.firma.bz')).toBe(true)
        expect(isFirmaHost('evilfirma.bz')).toBe(false)
    })
})

describe('plan gate, read from /pricing', () => {
    it('maps a stored plan name to its /pricing column', () => {
        expect(pricingColumnForPlan('Pro')).toBe('Pro')
        expect(pricingColumnForPlan('Firma Business (annual)')).toBe('Business')
        expect(pricingColumnForPlan('enterprise')).toBe('Enterprise')
        expect(pricingColumnForPlan('Standard')).toBe('Standard')
        expect(pricingColumnForPlan('Free')).toBe('Sandbox')
        expect(pricingColumnForPlan(null)).toBe('Sandbox')
        expect(pricingColumnForPlan('Product')).toBe('Sandbox')
    })

    it('Pro and up get a subdomain; only Enterprise gets an own domain', () => {
        expect(kindsForPlan('Standard')).toEqual({ SUBDOMAIN: false, CUSTOM: false })
        expect(kindsForPlan('Pro')).toEqual({ SUBDOMAIN: true, CUSTOM: false })
        expect(kindsForPlan('Business')).toEqual({ SUBDOMAIN: true, CUSTOM: false })
        expect(kindsForPlan('Enterprise')).toEqual({ SUBDOMAIN: true, CUSTOM: true })
        expect(lowestPlanFor('SUBDOMAIN')).toBe('Pro')
        expect(lowestPlanFor('CUSTOM')).toBe('Enterprise')
    })
})
