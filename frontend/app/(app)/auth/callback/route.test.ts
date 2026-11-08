import { describe, it, expect, vi, beforeEach } from 'vitest'

/** P1-19: a failed code exchange says so on /signin. P2-55: nothing after the session is set ends on a bare 500. */

const { exchange, reconcile, landing } = vi.hoisted(() => ({
    exchange: { result: { error: null as unknown, data: { session: { user: { id: 'u1', app_metadata: { active_firm_id: 'f1' } } } } as any } },
    reconcile: vi.fn(async () => undefined),
    landing: vi.fn(async () => '/d/u/home'),
}))

vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }))
vi.mock('@supabase/ssr', () => ({
    createServerClient: () => ({ auth: { exchangeCodeForSession: async () => exchange.result, refreshSession: vi.fn() } }),
}))
vi.mock('@/lib/landing/default-landing-path', () => ({ resolveDefaultFirmLandingPath: landing }))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/auth/supabase-jwt-metadata', () => ({ mergeLeanAppMetadata: vi.fn() }))
vi.mock('@/lib/firm-service', () => ({ FirmService: { getDefaultFirm: vi.fn() } }))
vi.mock('@/lib/user-settings-plus', () => ({ userSettingsPlus: { getUserSettingsPlus: vi.fn(async () => ({})) } }))
vi.mock('@/lib/auth/reconcile-names', () => ({ reconcileUserNames: reconcile }))

import { GET } from './route'

beforeEach(() => {
    vi.clearAllMocks()
    exchange.result = { error: null, data: { session: { user: { id: 'u1', app_metadata: { active_firm_id: 'f1' } } } } }
})

describe('GET /auth/callback', () => {
    it("sends a failed exchange to /signin with auth_code_error and the provider's sentence", async () => {
        exchange.result = { error: new Error('bad code'), data: { session: null } }
        const res = await GET(new Request('https://app.test/auth/callback?code=x&error_description=Code%20expired'))
        const loc = new URL(res.headers.get('location')!)
        expect(loc.pathname).toBe('/signin')
        expect(loc.searchParams.get('error')).toBe('auth_code_error')
        expect(loc.searchParams.get('error_description')).toBe('Code expired')
    })

    it('still lands the person when settling names or the landing path throws', async () => {
        reconcile.mockRejectedValueOnce(new Error('db'))
        landing.mockRejectedValueOnce(new Error('db'))
        const res = await GET(new Request('https://app.test/auth/callback?code=x'))
        expect(res.status).toBe(307)
        expect(new URL(res.headers.get('location')!).pathname).toBe('/d')
    })
})
