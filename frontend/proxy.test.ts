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
