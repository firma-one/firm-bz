import { describe, it, expect, vi, beforeEach } from 'vitest'

/** Who may use a storage connector (.claude/plans/access-gates.md, P0 #1–#4). */

const { db } = vi.hoisted(() => ({
    db: {
        connector: null as null | { id: string; userId: string; firmId: string | null; type: string; status: string },
        firmRoles: {} as Record<string, string>,          // `${userId}:${firmId}` → role
        partners: new Set<string>(),                       // `${userId}:${clientId}`
        clients: {} as Record<string, { firmId: string; connectorId?: string }>,
    },
}))

vi.mock('@/lib/prisma', () => ({
    prisma: {
        connector: { findUnique: vi.fn(async () => db.connector) },
        firmMember: { findFirst: vi.fn(async ({ where }: any) => (db.firmRoles[`${where.userId}:${where.firmId}`] ? { role: db.firmRoles[`${where.userId}:${where.firmId}`] } : null)) },
        clientMember: { findFirst: vi.fn(async ({ where }: any) => (db.partners.has(`${where.userId}:${where.clientId}`) ? { id: 'cm' } : null)) },
        client: {
            findUnique: vi.fn(async ({ where }: any) => db.clients[where.id] ?? null),
            findMany: vi.fn(async ({ where }: any) => Object.entries(db.clients).filter(([, c]) => c.connectorId === where.connectorId).map(([id]) => ({ id }))),
        },
    },
}))
vi.mock('@/lib/api/engagement-auth', () => ({ getAuthUser: vi.fn() }))
vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn() }))

import { getManageableConnector, isClientManager, checkConnectTargetRights } from './connector-access'

beforeEach(() => {
    db.connector = { id: 'conn', userId: 'owner', firmId: 'firm-a', type: 'GOOGLE_DRIVE', status: 'ACTIVE' }
    db.firmRoles = { 'admin:firm-a': 'firm_admin', 'guest:firm-a': 'firm_member', 'admin-b:firm-b': 'firm_admin' }
    db.partners = new Set(['partner:client-1'])
    db.clients = { 'client-1': { firmId: 'firm-a', connectorId: 'conn' }, 'client-b': { firmId: 'firm-b' } }
})

describe('getManageableConnector', () => {
    it('allows the owner, a firm admin of its firm, and a partner of a client using it', async () => {
        expect(await getManageableConnector('owner', 'conn')).not.toBeNull()
        expect(await getManageableConnector('admin', 'conn')).not.toBeNull()
        expect(await getManageableConnector('partner', 'conn')).not.toBeNull()
    })

    it('refuses a guest of the firm, an admin of another firm, and a stranger', async () => {
        expect(await getManageableConnector('guest', 'conn')).toBeNull()
        expect(await getManageableConnector('admin-b', 'conn')).toBeNull()
        expect(await getManageableConnector('stranger', 'conn')).toBeNull()
    })

    it('keeps the raw token to the owner and firm admins', async () => {
        expect(await getManageableConnector('partner', 'conn', { ownerOrFirmAdmin: true })).toBeNull()
        expect(await getManageableConnector('admin', 'conn', { ownerOrFirmAdmin: true })).not.toBeNull()
    })

    it('says no for a missing connector or id', async () => {
        db.connector = null
        expect(await getManageableConnector('owner', 'conn')).toBeNull()
        expect(await getManageableConnector('owner', undefined)).toBeNull()
    })
})

describe('isClientManager', () => {
    it('is a firm admin of the client\'s own firm or its partner — not an admin elsewhere', async () => {
        expect(await isClientManager('admin', 'client-1')).toBe(true)
        expect(await isClientManager('partner', 'client-1')).toBe(true)
        expect(await isClientManager('admin-b', 'client-1')).toBe(false)
        expect(await isClientManager('guest', 'client-1')).toBe(false)
    })
})

describe('checkConnectTargetRights (OAuth initiate and callbacks)', () => {
    it('needs a firm admin for firm storage and a client manager for client storage', async () => {
        expect(await checkConnectTargetRights('admin', { organizationId: 'firm-a' })).toBeNull()
        expect(await checkConnectTargetRights('guest', { organizationId: 'firm-a' })).toMatch(/firm admin/)
        expect(await checkConnectTargetRights('partner', { organizationId: 'firm-a', clientId: 'client-1' })).toBeNull()
    })

    it('refuses a client named under the wrong firm, and replacing a connector you cannot manage', async () => {
        expect(await checkConnectTargetRights('admin-b', { organizationId: 'firm-b', clientId: 'client-1' })).toMatch(/manager of this client/)
        expect(await checkConnectTargetRights('stranger', { replaceConnectorId: 'conn' })).toMatch(/cannot replace/)
    })
})
