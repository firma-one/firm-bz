import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Prisma } from '@prisma/client'

const { prisma, reach, emails } = vi.hoisted(() => ({
    prisma: {
        firm: { findFirst: vi.fn() },
        group: { findUniqueOrThrow: vi.fn(), findUnique: vi.fn() },
        groupMember: { findFirst: vi.fn() },
        groupDomain: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
        subscription: { findFirst: vi.fn() },
        $queryRaw: vi.fn(async () => []),
    },
    reach: vi.fn(),
    emails: { notifyDomainRequested: vi.fn(async () => {}), notifyDomainDecision: vi.fn(async () => {}), notifyDomainUnreachable: vi.fn(async () => {}) },
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/billing/active-billing-subscription', () => ({ getActiveSubscriptionForGroup: (id: string) => prisma.subscription.findFirst(id) }))
vi.mock('@/lib/custom-domains/reachability', () => ({ checkDomainReachable: reach }))
vi.mock('@/lib/custom-domains/domain-emails', () => emails)

import {
    approveDomain, brandedHostForGroup, checkAvailability, clearDomainCache, rejectDomain, removeDomain, requestDomain,
} from './group-domains'

const G = 'g1'
const ADMIN = 'u-admin'

function setup({ plan = 'Pro', admin = true, live = null as unknown, holder = null as unknown } = {}) {
    prisma.groupMember.findFirst.mockResolvedValue(admin ? { id: 'm' } : null)
    prisma.group.findUniqueOrThrow.mockResolvedValue({ name: 'Acme' })
    prisma.subscription.findFirst.mockResolvedValue(plan ? { plan } : null)
    // getGroupDomainState: live, then rejected; checkAvailability: holder
    prisma.groupDomain.findFirst.mockImplementation(async (args: { where: { status?: unknown; host?: string } }) => {
        if (args.where.host) return holder
        if (args.where.status === 'REJECTED') return null
        return live
    })
    prisma.groupDomain.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'd1', host: data.host, kind: data.kind, status: 'REQUESTED', reachable: true, lastCheckedAt: null, lastCheckError: null,
        requestedAt: new Date(), reviewedAt: null, reviewNote: null, requestedBy: ADMIN,
    }))
}

beforeEach(() => {
    vi.clearAllMocks()
    clearDomainCache()
    vi.stubEnv('ENFORCE_BILLING_GATES', 'true')
})
afterEach(() => vi.unstubAllEnvs())

describe('requesting a domain', () => {
    it('a Pro Group admin requests a free subdomain', async () => {
        setup()
        const row = await requestDomain(ADMIN, G, 'SUBDOMAIN', 'Acme')
        expect(row.host).toBe('acme.firma.bz')
        expect(prisma.groupDomain.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ groupId: G, host: 'acme.firma.bz', kind: 'SUBDOMAIN', status: 'REQUESTED' }) }))
        expect(emails.notifyDomainRequested).toHaveBeenCalled()
    })

    it('only the Group admin may ask', async () => {
        setup({ admin: false })
        await expect(requestDomain('u-other', G, 'SUBDOMAIN', 'acme')).rejects.toThrow('Only the workspace admin')
    })

    it('follows /pricing: Standard gets nothing, Pro no own domain, Enterprise both', async () => {
        setup({ plan: 'Standard' })
        await expect(requestDomain(ADMIN, G, 'SUBDOMAIN', 'acme')).rejects.toThrow('available on Pro and up')
        setup({ plan: 'Pro' })
        await expect(requestDomain(ADMIN, G, 'CUSTOM', 'portal.acme.com')).rejects.toThrow('available on Enterprise')
        setup({ plan: 'Enterprise' })
        await expect(requestDomain(ADMIN, G, 'CUSTOM', 'portal.acme.com')).resolves.toMatchObject({ host: 'portal.acme.com' })
    })

    it('with billing gates off, any plan may ask', async () => {
        vi.stubEnv('ENFORCE_BILLING_GATES', 'false')
        setup({ plan: 'Free' })
        await expect(requestDomain(ADMIN, G, 'CUSTOM', 'portal.acme.com')).resolves.toMatchObject({ host: 'portal.acme.com' })
    })

    it('one at a time per workspace', async () => {
        setup({ live: { host: 'acme.firma.bz', status: 'REQUESTED', requestedBy: ADMIN } })
        await expect(requestDomain(ADMIN, G, 'SUBDOMAIN', 'other')).rejects.toThrow('already waiting for approval')
    })

    it('a name another workspace holds is taken; a race on the unique index says so too', async () => {
        setup({ holder: { groupId: 'g2' } })
        expect(await checkAvailability(G, 'SUBDOMAIN', 'acme')).toMatchObject({ ok: false, message: 'Already in use · try another' })
        await expect(requestDomain(ADMIN, G, 'SUBDOMAIN', 'acme')).rejects.toThrow('Already in use')
        setup()
        prisma.groupDomain.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }))
        await expect(requestDomain(ADMIN, G, 'SUBDOMAIN', 'acme')).rejects.toThrow('Already in use')
    })
})

describe('approving and rejecting', () => {
    beforeEach(() => {
        prisma.groupDomain.findUnique.mockResolvedValue({ host: 'acme.firma.bz', status: 'REQUESTED', groupId: G, requestedBy: ADMIN })
    })

    it('approve only once the domain answers from Firma', async () => {
        reach.mockResolvedValueOnce({ ok: false, message: 'acme.firma.bz doesn\'t resolve' })
        await expect(approveDomain('u-sys', 'd1', null)).rejects.toThrow('Not reachable yet')
        expect(prisma.groupDomain.update).not.toHaveBeenCalled()
        reach.mockResolvedValueOnce({ ok: true })
        await approveDomain('u-sys', 'd1', 'Welcome')
        expect(prisma.groupDomain.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED', reviewedBy: 'u-sys', reviewNote: 'Welcome' }) }))
        expect(emails.notifyDomainDecision).toHaveBeenCalledWith(expect.objectContaining({ approved: true }))
    })

    it('reject needs a note', async () => {
        await expect(rejectDomain('u-sys', 'd1', '  ')).rejects.toThrow('Add a note')
        await rejectDomain('u-sys', 'd1', 'Trademark')
        expect(prisma.groupDomain.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'REJECTED', reviewNote: 'Trademark' }) }))
    })

    it('remove frees the name', async () => {
        setup()
        prisma.groupDomain.updateMany.mockResolvedValue({ count: 1 })
        await removeDomain(ADMIN, G)
        expect(prisma.groupDomain.updateMany).toHaveBeenCalledWith({ where: { groupId: G, status: 'APPROVED' }, data: { status: 'REMOVED' } })
    })
})

describe('brandedHostForGroup', () => {
    it('answers only in production, only approved and reachable, and caches', async () => {
        prisma.groupDomain.findFirst.mockResolvedValue({ host: 'acme.firma.bz' })
        expect(await brandedHostForGroup(G)).toBeNull()
        expect(prisma.groupDomain.findFirst).not.toHaveBeenCalled()

        vi.stubEnv('VERCEL_ENV', 'production')
        expect(await brandedHostForGroup(G)).toBe('acme.firma.bz')
        expect(prisma.groupDomain.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { groupId: G, status: 'APPROVED', reachable: true } }))
        await brandedHostForGroup(G)
        expect(prisma.groupDomain.findFirst).toHaveBeenCalledTimes(1)
    })

    it('a failed lookup never fails a link', async () => {
        vi.stubEnv('VERCEL_ENV', 'production')
        prisma.groupDomain.findFirst.mockRejectedValue(new Error('db down'))
        expect(await brandedHostForGroup(G)).toBeNull()
    })
})
