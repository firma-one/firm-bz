import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { prisma, basePrisma, domains, generateLink } = vi.hoisted(() => ({
    prisma: {
        groupMember: { findFirst: vi.fn() },
        firmMember: { findFirst: vi.fn() },
        engagementMember: { findFirst: vi.fn() },
        signInHandoff: { create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    },
    basePrisma: { $queryRaw: vi.fn(), $executeRaw: vi.fn() },
    domains: { brandedHostForGroupSlug: vi.fn(), brandedHostsEnabled: vi.fn(() => true) },
    generateLink: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma, basePrisma }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/custom-domains/group-domains', () => domains)
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: () => ({ auth: { admin: { generateLink } } }) }))

import { consumeHandoff, createHandoff, endLinkedSessions, groupSlugOfPath, isSafePath, sessionIdOfAccessToken } from './sign-in-handoff'

const base = { userId: 'u1', email: 'pat@acme.test', currentHost: 'www.firma.bz', nextPath: '/d/acme/f/acme-advisory', originSessionId: 's-www' }

beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.firma.bz')
    domains.brandedHostsEnabled.mockReturnValue(true)
    domains.brandedHostForGroupSlug.mockResolvedValue({ groupId: 'g1', host: 'acme.firma.bz' })
    prisma.firmMember.findFirst.mockResolvedValue({ id: 'fm' })
    generateLink.mockResolvedValue({ data: { properties: { hashed_token: 'hash123' } }, error: null })
    prisma.signInHandoff.create.mockResolvedValue({ id: '11111111-1111-1111-1111-111111111111' })
})
afterEach(() => vi.unstubAllEnvs())

describe('paths and tokens', () => {
    it('reads the workspace from a landing path', () => {
        expect(groupSlugOfPath('/d/acme/f/acme-advisory/x')).toBe('acme')
        expect(groupSlugOfPath('/d/')).toBeNull()
        expect(groupSlugOfPath('/d/onboarding')).toBeNull()
        expect(groupSlugOfPath('/d/u/home')).toBeNull()
        expect(groupSlugOfPath('/pricing')).toBeNull()
    })

    it('accepts only paths', () => {
        expect(isSafePath('/d/acme')).toBe(true)
        for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', 'd/acme']) expect(isSafePath(bad)).toBe(false)
    })

    it('reads the session id from an access token', () => {
        const token = `x.${Buffer.from(JSON.stringify({ session_id: 'sess-1' })).toString('base64url')}.y`
        expect(sessionIdOfAccessToken(token)).toBe('sess-1')
        expect(sessionIdOfAccessToken('garbage')).toBeNull()
        expect(sessionIdOfAccessToken(null)).toBeNull()
    })
})

describe('createHandoff', () => {
    it('makes a 60-second ticket and sends the browser to the domain with only its id', async () => {
        const url = await createHandoff(base)
        expect(url).toBe('https://acme.firma.bz/auth/handoff?t=11111111-1111-1111-1111-111111111111')
        expect(url).not.toContain('hash123')
        const data = prisma.signInHandoff.create.mock.calls[0][0].data
        expect(data).toMatchObject({ userId: 'u1', host: 'acme.firma.bz', nextPath: base.nextPath, tokenHash: 'hash123', originSessionId: 's-www' })
        expect(data.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(60_000)
    })

    it('stays put when there is nothing to hand over to', async () => {
        domains.brandedHostsEnabled.mockReturnValue(false)
        expect(await createHandoff(base)).toBeNull()
        domains.brandedHostsEnabled.mockReturnValue(true)
        domains.brandedHostForGroupSlug.mockResolvedValue(null)
        expect(await createHandoff(base)).toBeNull()
        expect(await createHandoff({ ...base, nextPath: '/d/' })).toBeNull()
        expect(generateLink).not.toHaveBeenCalled()
    })

    it('never from a custom domain (no loops), never to a workspace they are not in, never off-site', async () => {
        expect(await createHandoff({ ...base, currentHost: 'other.firma.bz' })).toBeNull()
        expect(await createHandoff({ ...base, currentHost: 'acme.firma.bz' })).toBeNull()
        expect(await createHandoff({ ...base, nextPath: '//evil.com/d/acme' })).toBeNull()
        prisma.firmMember.findFirst.mockResolvedValue(null)
        prisma.groupMember.findFirst.mockResolvedValue(null)
        prisma.engagementMember.findFirst.mockResolvedValue(null)
        expect(await createHandoff(base)).toBeNull()
        expect(prisma.signInHandoff.create).not.toHaveBeenCalled()
    })

    it('a client (engagement member only) is handed over too', async () => {
        prisma.firmMember.findFirst.mockResolvedValue(null)
        prisma.engagementMember.findFirst.mockResolvedValue({ id: 'em' })
        expect(await createHandoff(base)).toContain('https://acme.firma.bz/auth/handoff?t=')
    })

    it('any Supabase failure keeps them here', async () => {
        generateLink.mockResolvedValue({ data: null, error: { message: 'rate limited' } })
        expect(await createHandoff(base)).toBeNull()
        generateLink.mockRejectedValue(new Error('down'))
        expect(await createHandoff(base)).toBeNull()
    })
})

describe('consumeHandoff', () => {
    it('refuses a malformed id without touching the database', async () => {
        expect(await consumeHandoff("x' OR 1=1", 'acme.firma.bz')).toBeNull()
        expect(basePrisma.$queryRaw).not.toHaveBeenCalled()
    })

    it('uses a ticket once and forgets its token', async () => {
        basePrisma.$queryRaw.mockResolvedValueOnce([{ id: 't1', tokenHash: 'hash123', nextPath: '/d/acme', userId: 'u1' }])
        expect(await consumeHandoff('11111111-1111-1111-1111-111111111111', 'acme.firma.bz')).toEqual({ id: 't1', tokenHash: 'hash123', nextPath: '/d/acme', userId: 'u1' })
        expect(prisma.signInHandoff.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { tokenHash: null } })
        basePrisma.$queryRaw.mockResolvedValueOnce([])
        expect(await consumeHandoff('11111111-1111-1111-1111-111111111111', 'acme.firma.bz')).toBeNull()
    })
})

describe('endLinkedSessions', () => {
    it('ends the twin session on the other host, only this user\'s', async () => {
        prisma.signInHandoff.findMany.mockResolvedValue([{ originSessionId: 's-www', targetSessionId: 's-acme' }])
        basePrisma.$executeRaw.mockResolvedValue(1)
        expect(await endLinkedSessions('u1', 's-acme')).toBe(1)
        expect(prisma.signInHandoff.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1', OR: [{ originSessionId: 's-acme' }, { targetSessionId: 's-acme' }] } }))
        prisma.signInHandoff.findMany.mockResolvedValue([])
        expect(await endLinkedSessions('u1', 's-x')).toBe(0)
    })
})
