import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Server actions that take an entity id must check the caller's rights on that entity — every
 * export of a 'use server' file is a callable endpoint. Covers client connector/brand actions,
 * the firm Storage-settings connector actions, the shared removeConnector, and the /system admin
 * campaign actions. Each: refused caller, allowed caller, signed-out caller.
 */

const { prisma, auth, perms, admin } = vi.hoisted(() => {
    // Any prisma model/method resolves to an empty-ish result unless a test overrides it.
    const models: Record<string, Record<string, any>> = {}
    const prisma = new Proxy({} as Record<string, any>, {
        get(_t, model: string) {
            if (!models[model]) {
                models[model] = new Proxy({} as Record<string, any>, {
                    get(m, method: string) {
                        if (!m[method]) m[method] = vi.fn(async () => (method.startsWith('findMany') || method === 'groupBy' ? [] : {}))
                        return m[method]
                    },
                })
            }
            return models[model]
        },
    })
    return {
        prisma,
        auth: { user: { id: 'u1', email: 'pat@acme.test' } as { id: string; email: string } | null },
        perms: { manageFirm: false, manageClient: false },
        admin: { emails: ['root@firma.test'] },
    }
})

vi.mock('@/lib/prisma', () => ({ prisma, basePrisma: prisma }))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: auth.user }, error: null }) } }) }))
vi.mock('@/lib/permission-helpers', () => ({
    canManageOrganization: vi.fn(async () => perms.manageFirm),
    canManageClient: vi.fn(async () => perms.manageClient),
}))
vi.mock('@/lib/system/admin-check', () => ({ isSystemAdminEmail: (e?: string | null) => !!e && admin.emails.includes(e) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
vi.mock('@/lib/audit', () => ({
    audit: () => { const b: any = { scope: () => b, firm: () => b, actor: () => b, meta: () => b, client: () => b, fireAndForget: () => {} }; return b },
    AUDIT_EVENT: new Proxy({}, { get: (_t, k) => k }),
    AUDIT_SCOPE: new Proxy({}, { get: (_t, k) => k }),
}))
vi.mock('@/lib/connectors/pockett-structure.service', () => ({ ensureAppFolderStructure: vi.fn(), setupFirmFolder: vi.fn() }))
vi.mock('@/lib/connectors/registry', () => ({ getStorageAdapter: vi.fn() }))
vi.mock('@/lib/reminders/reminder-service', () => ({ upsertFollowUpReminder: vi.fn() }))
vi.mock('@/lib/billing/effective-billing-caps', () => ({ assertWithinClientCap: vi.fn(), assertWithinClientContactCap: vi.fn() }))
vi.mock('@/lib/landing/default-landing-path', () => ({ resolveDefaultFirmLandingPath: vi.fn() }))

import { getConnectorSiblingClients, removeClientConnector, upsertClientBrand } from './client'
import { getFirmConnectors, getFirmAllClients, disconnectFirmConnector, renameFirmConnector, removeFirmConnector, detachConnectorFromClient } from './firms'
import { removeConnector } from './connectors'
import { closeWaitlistCampaign } from '@/app/actions/admin/close-waitlist-campaign'
import { createResearchCampaign } from '@/app/actions/admin/create-research-campaign'
import { createWaitlistCampaign } from '@/app/actions/admin/create-waitlist-campaign'
import { deleteResearchCampaign } from '@/app/actions/admin/delete-research-campaign'
import { setResearchCampaignStatus } from '@/app/actions/admin/set-research-campaign-status'
import { updateResearchCampaign } from '@/app/actions/admin/update-research-campaign'

beforeEach(() => {
    vi.clearAllMocks()
    auth.user = { id: 'u1', email: 'pat@acme.test' }
    perms.manageFirm = false
    perms.manageClient = false
    prisma.client.findUnique.mockResolvedValue({ firmId: 'f1', connectorId: 'conn-1', name: 'Contoso', settings: {} })
    prisma.connector.findUnique.mockResolvedValue({ firmId: 'f1', userId: 'someone-else' })
    prisma.client.findMany.mockResolvedValue([{ id: 'c1' }])
})

describe('client connector and brand actions require client manage rights', () => {
    it('refuses a caller who cannot manage the client', async () => {
        await expect(getConnectorSiblingClients('c1')).rejects.toThrow('Unauthorized')
        await expect(upsertClientBrand('c1', { name: 'X' })).rejects.toThrow('Unauthorized')
        await expect(removeClientConnector({ clientId: 'c1' })).rejects.toThrow('Unauthorized')
        expect(prisma.brand.create).not.toHaveBeenCalled()
        expect(prisma.connector.delete).not.toHaveBeenCalled()
    })

    it('checks rights on the client\'s own firm', async () => {
        await expect(upsertClientBrand('c1', null)).rejects.toThrow()
        const { canManageClient } = await import('@/lib/permission-helpers')
        expect(canManageClient).toHaveBeenCalledWith('f1', 'c1')
    })

    it('allows a client manager', async () => {
        perms.manageClient = true
        await expect(upsertClientBrand('c1', { name: 'Brand' })).resolves.toBeUndefined()
        expect(prisma.brand.create).toHaveBeenCalled()
    })

    it('refuses signed-out callers', async () => {
        auth.user = null
        await expect(getConnectorSiblingClients('c1')).rejects.toThrow('Unauthorized')
    })
})

describe('firm Storage-settings connector actions require firm manage rights', () => {
    it('refuses a firm member who is not a manager', async () => {
        await expect(getFirmConnectors('f1')).rejects.toThrow('Unauthorized')
        await expect(getFirmAllClients('f1')).rejects.toThrow('Unauthorized')
        await expect(disconnectFirmConnector({ connectorId: 'conn-1', firmId: 'f1' })).rejects.toThrow('Unauthorized')
        await expect(renameFirmConnector({ connectorId: 'conn-1', firmId: 'f1', name: 'X' })).rejects.toThrow('Unauthorized')
        await expect(removeFirmConnector({ connectorId: 'conn-1' })).rejects.toThrow('Unauthorized')
        await expect(detachConnectorFromClient({ clientId: 'c1', firmId: 'f1' })).rejects.toThrow('Unauthorized')
        expect(prisma.connector.update).not.toHaveBeenCalled()
        expect(prisma.connector.delete).not.toHaveBeenCalled()
        expect(prisma.client.update).not.toHaveBeenCalled()
    })

    it('checks the firm that owns the connector, not just the firmId the caller passes', async () => {
        perms.manageFirm = true
        await expect(disconnectFirmConnector({ connectorId: 'conn-1', firmId: 'f-other' })).rejects.toThrow('Unauthorized')
        const { canManageOrganization } = await import('@/lib/permission-helpers')
        await disconnectFirmConnector({ connectorId: 'conn-1', firmId: 'f1' })
        expect(canManageOrganization).toHaveBeenCalledWith('f1')
        expect(prisma.connector.update).toHaveBeenCalled()
    })

    it('allows a firm manager', async () => {
        perms.manageFirm = true
        await expect(getFirmConnectors('f1')).resolves.toEqual([])
        await expect(renameFirmConnector({ connectorId: 'conn-1', firmId: 'f1', name: 'Shared drive' })).resolves.toBeUndefined()
    })

    it('refuses signed-out callers', async () => {
        auth.user = null
        perms.manageFirm = true
        await expect(getFirmAllClients('f1')).rejects.toThrow('Unauthorized')
    })
})

describe('removeConnector needs manage rights, not just firm membership', () => {
    it('refuses a plain firm member (external EC/EV users hold firm_member rows too)', async () => {
        await expect(removeConnector({ connectorId: 'conn-1' })).rejects.toThrow('Unauthorized')
        expect(prisma.connector.delete).not.toHaveBeenCalled()
    })

    it('allows a firm manager, or a manager of a client that uses the connector', async () => {
        perms.manageFirm = true
        await expect(removeConnector({ connectorId: 'conn-1' })).resolves.toBeUndefined()
        perms.manageFirm = false
        perms.manageClient = true
        await expect(removeConnector({ connectorId: 'conn-1' })).resolves.toBeUndefined()
        expect(prisma.connector.delete).toHaveBeenCalledTimes(2)
    })
})

describe('/system campaign actions require a system admin', () => {
    const calls: [string, () => Promise<{ success: boolean }>][] = [
        ['closeWaitlistCampaign', () => closeWaitlistCampaign('camp-1')],
        ['createResearchCampaign', () => createResearchCampaign()],
        ['createWaitlistCampaign', () => createWaitlistCampaign('Spring')],
        ['deleteResearchCampaign', () => deleteResearchCampaign('camp-1')],
        ['setResearchCampaignStatus', () => setResearchCampaignStatus('camp-1', 'closed' as never)],
        ['updateResearchCampaign', () => updateResearchCampaign('camp-1', {} as never)],
    ]

    it.each(calls)('%s refuses a signed-in non-admin and touches nothing', async (_name, call) => {
        const res = await call()
        expect(res.success).toBe(false)
        expect(prisma.waitlistCampaign.update).not.toHaveBeenCalled()
        expect(prisma.waitlistCampaign.create).not.toHaveBeenCalled()
        expect(prisma.researchCampaign.create).not.toHaveBeenCalled()
        expect(prisma.researchCampaign.delete).not.toHaveBeenCalled()
        expect(prisma.researchCampaign.update).not.toHaveBeenCalled()
    })

    it('refuses signed-out callers', async () => {
        auth.user = null
        expect((await closeWaitlistCampaign('camp-1')).success).toBe(false)
    })

    it('lets a system admin through', async () => {
        auth.user = { id: 'u-admin', email: 'root@firma.test' }
        await closeWaitlistCampaign('camp-1')
        expect(prisma.waitlistCampaign.update).toHaveBeenCalled()
    })
})
