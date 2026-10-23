import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Route-level gates from .claude/plans/access-gates.md, P0 #6, #7, #8, #10, #11: support tickets,
 * Polar checkout, onboarding ensure-org / create-org, and notification broadcast.
 */

const { who, db, polar, admin } = vi.hoisted(() => {
    const db = {
        firmAdmin: false,
        firmRole: 'firm_member' as string | null,
        firmBySlug: { id: 'f1' } as { id: string } | null,
        tickets: [] as any[],
        ownedConnector: false,
        clientInFirm: true,
    }
    return {
        who: { user: { id: 'u1', app_metadata: {}, user_metadata: {} } as any },
        db,
        polar: { lastUrl: '' as string },
        admin: { updateUserById: vi.fn(async (_id: string, _attrs: unknown) => ({})) },
    }
})

const prismaMock = {
    firm: { findUnique: vi.fn(async () => db.firmBySlug), findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    firmMember: {
        findFirst: vi.fn(async ({ where }: any) => {
            if (where.role === 'firm_admin') return db.firmAdmin ? { id: 'm' } : null
            return db.firmRole ? { id: 'm', role: db.firmRole } : null
        }),
        findMany: vi.fn(async () => [{ userId: 'u9' }]),
    },
    customerRequest: { findMany: vi.fn(async ({ where }: any) => db.tickets.filter((t) => Object.entries(where).every(([k, v]) => t[k] === v))) },
    client: { findFirst: vi.fn(async () => (db.clientInFirm ? { id: 'c1' } : null)), findUnique: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    clientMember: { findMany: vi.fn(async () => [{ userId: 'u9' }]) },
    engagement: { findFirst: vi.fn(async () => (db.clientInFirm ? { id: 'e1' } : null)), findUnique: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    engagementMember: { findMany: vi.fn(async () => []) },
    connector: { findFirst: vi.fn(async () => (db.ownedConnector ? { id: 'conn' } : null)) },
    notification: { createMany: vi.fn(async () => ({ count: 1 })) },
}

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock, getPrismaWithRls: () => prismaMock }))
vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: who.user } }), getSession: async () => ({ data: { session: null } }) } }),
}))
vi.mock('@/utils/supabase/admin', () => ({
    createAdminClient: () => ({ auth: { getUser: async () => ({ data: { user: who.user }, error: who.user ? null : new Error('x') }), admin } }),
}))
vi.mock('@supabase/supabase-js', () => ({
    createClient: () => ({ auth: { getUser: async () => ({ data: { user: who.user }, error: who.user ? null : new Error('x') }) } }),
}))
vi.mock('@polar-sh/nextjs', () => ({
    Checkout: () => async (req: NextRequest) => { polar.lastUrl = req.url; return new Response(null, { status: 302 }) },
}))
vi.mock('@/lib/billing/checkout-return-path', () => ({ validateCheckoutReturnTo: (v: string | null) => v }))
vi.mock('@/lib/billing/billing-group', () => ({ resolveGroupId: vi.fn(async () => 'own-group') }))
vi.mock('@/lib/billing/polar-client', () => ({ polarServer: () => 'sandbox' }))
vi.mock('@/lib/billing/polar-catalog', () => ({ fetchBillingCatalogPlans: vi.fn(async () => [{ id: 'prod-standard' }]) }))
vi.mock('@/lib/firm-service', () => ({ FirmService: { getDefaultFirm: vi.fn(async () => ({ id: 'f1', slug: 'acme', name: 'Acme' })) } }))
vi.mock('@/lib/auth/supabase-jwt-metadata', () => ({ mergeLeanAppMetadata: (a: object, b: object) => ({ ...a, ...b }) }))
vi.mock('@/lib/permission-helpers', () => ({ canManageClient: vi.fn(async () => true), canManageProject: vi.fn(async () => true) }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
vi.mock('@/lib/permissions/invalidate-user-settings', () => ({ invalidateUserSettingsPlus: vi.fn() }))
vi.mock('@/lib/google-drive-connector', () => ({ googleDriveConnector: {} }))
vi.mock('@/lib/billing/polar-free-plan', () => ({ ensureGroupFreePlan: vi.fn() }))
vi.mock('@/lib/billing/firm-creation-gate', () => ({ requireNonSandboxFirmCreationAccess: vi.fn(async () => null), resolveBillingAnchorForNewSatelliteFirm: vi.fn(async () => 'anchor-group') }))

const req = (url: string, init: { method?: string; body?: unknown } = {}) =>
    new NextRequest(new URL(url, 'http://localhost'), {
        method: init.method ?? 'GET',
        headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    })

beforeEach(() => {
    vi.clearAllMocks()
    who.user = { id: 'u1', app_metadata: {}, user_metadata: {} }
    Object.assign(db, { firmAdmin: false, firmRole: 'firm_member', firmBySlug: { id: 'f1' }, ownedConnector: false, clientInFirm: true })
    db.tickets = [
        { id: 't1', firmId: 'f1', userId: 'u1' },
        { id: 't2', firmId: 'f1', userId: 'someone-else' },
        { id: 't3', firmId: 'f2', userId: 'u3' },
    ]
    polar.lastUrl = ''
})

describe('GET /api/support/requests (P0 #10)', () => {
    it('shows a non-admin only their own tickets in the firm', async () => {
        const { GET } = await import('./support/requests/route')
        const body = await (await GET(req('/api/support/requests?firmSlug=acme'))).json()
        expect(JSON.stringify(body)).toContain('t1')
        expect(JSON.stringify(body)).not.toContain('t2')
    })

    it('shows a firm admin the firm\'s tickets — never another firm\'s', async () => {
        db.firmAdmin = true
        const { GET } = await import('./support/requests/route')
        const text = JSON.stringify(await (await GET(req('/api/support/requests?firmSlug=acme'))).json())
        expect(text).toContain('t2')
        expect(text).not.toContain('t3')
    })

    it('answers an unknown slug with 404 instead of every ticket on the platform', async () => {
        db.firmBySlug = null
        const { GET } = await import('./support/requests/route')
        expect((await GET(req('/api/support/requests?firmSlug=nope'))).status).toBe(404)
    })

    it('keeps every firm\'s tickets (?all=1) to the Firma team', async () => {
        vi.stubEnv('SYSTEM_ADMIN_EMAILS', 'staff@firma.bz')
        const { GET } = await import('./support/requests/route')
        who.user = { ...who.user, email: 'someone@acme.com' }
        expect((await GET(req('/api/support/requests?all=1'))).status).toBe(403)
        who.user = { ...who.user, email: 'staff@firma.bz' }
        const text = JSON.stringify(await (await GET(req('/api/support/requests?all=1'))).json())
        expect(text).toContain('t2')
        expect(text).toContain('t3')
        vi.unstubAllEnvs()
    })
})

describe('GET /api/checkout (P0 #11)', () => {
    process.env.POLAR_ACCESS_TOKEN = 'tok'
    process.env.POLAR_SUCCESS_URL = 'https://app.test/checkout/success'

    it('refuses a non-admin member and a signed-out caller', async () => {
        const { GET } = await import('./checkout/route')
        expect((await GET(req('/api/checkout?firmId=f1&products=prod-standard'))).status).toBe(403)
        who.user = null
        expect((await GET(req('/api/checkout?firmId=f1&products=prod-standard'))).status).toBe(401)
    })

    it('pins the customer and metadata to the firm\'s own group and drops everything else', async () => {
        db.firmAdmin = true
        const { GET } = await import('./checkout/route')
        await GET(req('/api/checkout?firmId=f1&products=prod-standard&customerExternalId=victim-group&metadata=%7B%22groupId%22%3A%22victim%22%7D&discountId=d&customerEmail=x%40y.z'))
        const sent = new URL(polar.lastUrl)
        expect(sent.searchParams.get('customerExternalId')).toBe('own-group')
        expect(sent.searchParams.get('metadata')).toBe(JSON.stringify({ groupId: 'own-group' }))
        expect(sent.searchParams.get('discountId')).toBeNull()
        expect(sent.searchParams.get('customerEmail')).toBeNull()
    })

    it('refuses a product that is not in the public catalog', async () => {
        db.firmAdmin = true
        const { GET } = await import('./checkout/route')
        expect((await GET(req('/api/checkout?firmId=f1&products=hidden-product'))).status).toBe(400)
    })
})

describe('POST /api/onboarding/ensure-org (P0 #7)', () => {
    it('writes the user\'s real role as the persona — a guest stays firm_member', async () => {
        const { POST } = await import('./onboarding/ensure-org/route')
        await POST(req('/api/onboarding/ensure-org', { method: 'POST' }))
        const written = admin.updateUserById.mock.calls[0]?.[1] as any
        expect(written.app_metadata.active_persona).toBe('firm_member')
    })
})

describe('POST /api/onboarding/create-org (P0 #6)', () => {
    it('refuses to take over a connector the caller did not connect', async () => {
        const { POST } = await import('./onboarding/create-org/route')
        const res = await POST(req('/api/onboarding/create-org', { method: 'POST', body: { connectionId: 'victim-conn', name: 'Evil LLP' } }))
        expect(res.status).toBe(404)
    })
})

describe('POST /api/notifications/broadcast (P0 #8)', () => {
    it('will not reach a client outside the firm it is sent from', async () => {
        db.firmAdmin = true
        db.clientInFirm = false
        const { POST } = await import('./notifications/broadcast/route')
        const res = await POST(req('/api/notifications/broadcast?firmId=f1', { method: 'POST', body: { scope: 'client', clientId: 'victim-client', title: 'x', message: 'y' } }))
        expect(res.status).toBe(400)
        expect(prismaMock.notification.createMany).not.toHaveBeenCalled()
    })
})
