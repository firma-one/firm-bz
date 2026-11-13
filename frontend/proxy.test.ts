// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { auth } = vi.hoisted(() => ({ auth: { user: null as { id: string; email: string } | null } }))
vi.mock('@supabase/ssr', () => ({
    createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: auth.user } }), signOut: vi.fn() } }),
}))
vi.mock('@/lib/system/admin-check', () => ({ isSystemAdminEmail: (e?: string | null) => e === 'root@firma.test' }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }))

import { proxy } from './proxy'

function req(path: string, init?: { method?: string; headers?: Record<string, string> }) {
    return new NextRequest(new URL(path, 'http://localhost:3000'), init)
}

beforeEach(() => {
    auth.user = null
})

/**
 * The /system layout checks admin access only in the browser. A server action POSTed to a /system
 * page runs before anything renders, so the proxy must refuse non-admins itself.
 */
describe('proxy — /system is system-admin only', () => {
    it('sends signed-out visitors to sign-in', async () => {
        const res = await proxy(req('/system/waitlist'))
        expect(res.status).toBe(307)
        expect(res.headers.get('location')).toContain('/signin?redirect=%2Fsystem%2Fwaitlist')
    })

    it('turns away a signed-in non-admin, including a server action POST', async () => {
        auth.user = { id: 'u1', email: 'pat@acme.test' }
        const page = await proxy(req('/system'))
        expect(page.headers.get('location')).toBe('http://localhost:3000/d')
        const action = await proxy(req('/system/waitlist', { method: 'POST', headers: { 'Next-Action': 'abc123' } }))
        expect(action.status).toBe(307)
        expect(action.headers.get('location')).toBe('http://localhost:3000/d')
    })

    it('lets a system admin through', async () => {
        auth.user = { id: 'u-admin', email: 'root@firma.test' }
        const res = await proxy(req('/system/waitlist'))
        expect(res.headers.get('location')).toBeNull()
    })

    it('does not touch look-alike paths', async () => {
        auth.user = { id: 'u1', email: 'pat@acme.test' }
        const res = await proxy(req('/systems-overview'))
        expect(res.headers.get('location')).toBeNull()
    })
})

/**
 * A deploy used to sign everyone out: a build-version cookie that no longer matched sent the user to
 * /signin and revoked their sign-ins on every device. Sign-ins no longer depend on the build.
 */
describe('proxy — a deploy signs nobody out', () => {
    it('lets a signed-in user with an older build cookie straight through', async () => {
        auth.user = { id: 'u1', email: 'pat@acme.test' }
        const res = await proxy(req('/d/acme', { headers: { cookie: 'fm-deployment-version=1700000000' } }))
        expect(res.headers.get('location')).toBeNull()
    })

    it('sends a signed-in visitor on /signin to their deep link, else into the app', async () => {
        auth.user = { id: 'u1', email: 'pat@acme.test' }
        const deepLink = await proxy(req('/signin?redirect=%2Fd%2Facme%2Ff%2Fplum'))
        expect(deepLink.headers.get('location')).toBe('http://localhost:3000/d/acme/f/plum')
        const plain = await proxy(req('/signin'))
        expect(plain.headers.get('location')).toBe('http://localhost:3000/d?entry=auth')
        const offSite = await proxy(req('/signin?redirect=%2F%2Fevil.test'))
        expect(offSite.headers.get('location')).toBe('http://localhost:3000/d?entry=auth')
    })

    it('leaves /signup/callback to run', async () => {
        auth.user = { id: 'u1', email: 'pat@acme.test' }
        const res = await proxy(req('/signup/callback'))
        expect(res.headers.get('location')).toBeNull()
    })
})

/**
 * A workspace's custom domain (.claude/plans/branded-host-email-links.md): any host that isn't one of
 * Firma's own opens the app at its root, keeping the address, with no hard-coded list.
 */
describe('proxy — custom domains', () => {
    function on(host: string, path = '/') {
        return new NextRequest(new URL(path, `https://${host}`), { headers: { host } })
    }

    it('opens the app at a custom domain\'s root, resolving the workspace', async () => {
        auth.user = { id: 'u1', email: 'pat@acme.test' }
        for (const host of ['datasentry.firma.bz', 'acme.firma.bz', 'portal.acme.com']) {
            const res = await proxy(on(host))
            expect(res.headers.get('x-middleware-rewrite')).toBe(`https://${host}/d?entry=auth`)
        }
    })

    it('sends a signed-out visitor at a custom domain to sign in there', async () => {
        const res = await proxy(on('portal.acme.com'))
        expect(res.headers.get('location')).toBe('https://portal.acme.com/signin?redirect=%2Fd')
    })

    it('leaves Firma\'s own hosts and other paths alone', async () => {
        auth.user = { id: 'u1', email: 'pat@acme.test' }
        for (const host of ['www.firma.bz', 'firma.bz', 'preview.firma.bz', 'localhost:3000', 'firm-bz-git-dev.vercel.app']) {
            const res = await proxy(on(host))
            expect(res.headers.get('x-middleware-rewrite')).toBeNull()
            expect(res.headers.get('location')).toBeNull()
        }
        const pricing = await proxy(on('portal.acme.com', '/pricing'))
        expect(pricing.headers.get('x-middleware-rewrite')).toBeNull()
    })
})
