import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * What Brio's placeholders stand for: the names we already know, by request. The database and the people
 * lookup are stubbed; nothing is read or sent anywhere.
 */

const h = vi.hoisted(() => ({
    firmSettings: {} as Record<string, unknown>,
    offFirms: new Set<string>(),
    /** How many times an engagement's names were looked up. */
    lookups: 0,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        firm: {
            findUnique: async ({ where }: { where: { id: string } }) => ({
                id: where.id,
                name: where.id === 'f1' ? 'Beacon Growth Partners' : 'Northpoint Advisors',
                groupId: 'g1',
                settings: h.offFirms.has(where.id) ? { brio: { maskNames: false } } : h.firmSettings,
            }),
        },
        group: { findUnique: async () => ({ id: 'g1', name: 'Beacon Growth' }) },
        engagement: { findUnique: async () => { h.lookups += 1; return { firmId: 'f1', clientId: 'c1' } } },
        client: {
            findUnique: async () => ({ id: 'c1', name: 'Acme Robotics, Inc.' }),
            findMany: async () => [{ id: 'c1', name: 'Acme Robotics, Inc.' }, { id: 'c2', name: 'Horizon FinTech' }],
        },
        clientContact: { findMany: async () => [{ id: 'cc1', name: 'Dana Whitfield' }] },
        engagementMember: { findMany: async () => [{ userId: 'u-alex' }, { userId: 'u-brio' }] },
        clientMember: { findMany: async () => [{ userId: 'u-sam' }] },
        firmMember: { findMany: async () => [{ userId: 'u-alex' }] },
    },
}))
vi.mock('@/lib/files/file-creator', () => ({
    loadPeople: async (ids: string[]) => new Map(ids.flatMap((id) => {
        const people: Record<string, { email: string; name: string; avatarUrl: null }> = {
            'u-alex': { email: 'alex@beacon.com', name: 'Alex Jordan', avatarUrl: null },
            'u-sam': { email: 'sam@acme.com', name: 'Sam Rivera', avatarUrl: null },
            'u-brio': { email: 'brio+f1@agents.firma.bz', name: 'Brio', avatarUrl: null },
        }
        return people[id] ? [[id, people[id]] as const] : []
    })),
}))
vi.mock('./agent-email', () => ({ isAgentEmail: (e: string | null | undefined) => !!e && e.endsWith('@agents.firma.bz') }))

import { engagementEntities, forgetKnownNames, vaultForEngagement, vaultForFirms } from './known-entities'

beforeEach(() => {
    h.firmSettings = {}
    h.offFirms = new Set()
    h.lookups = 0
    forgetKnownNames()
})

describe('what an engagement\'s request knows', () => {
    it('the firm and its group, the client and its contacts, and the people on it; never Brio', async () => {
        const names = (await engagementEntities('p1')).map((e) => `${e.kind}:${e.name}`).sort()
        expect(names).toEqual([
            'client:Acme Robotics, Inc.', 'firm:Beacon Growth', 'firm:Beacon Growth Partners',
            'person:Alex Jordan', 'person:Dana Whitfield', 'person:Sam Rivera',
        ])
    })

    it('masks them, and leaves "Brio" as it is', async () => {
        const vault = (await vaultForEngagement('p1', 'f1'))!
        const masked = vault.session().mask('Brio: Dana Whitfield asked Alex for the Acme Robotics K-1; Sam agreed.')
        expect(masked).toMatch(/^Brio: \[PERSON_[0-9A-F]+\] asked \[PERSON_[0-9A-F]+_FIRST\] for the \[CLIENT_[0-9A-F]+\] K-1; \[PERSON_[0-9A-F]+_FIRST\] agreed\.$/)
    })

    it('nothing when the firm turned it off', async () => {
        h.firmSettings = { brio: { maskNames: false } }
        expect(await vaultForEngagement('p1', 'f1')).toBeNull()
    })
})

describe('a request across firms', () => {
    it('masks every firm\'s clients; off only when every firm turned it off', async () => {
        const vault = (await vaultForFirms(['f1', 'f2']))!
        expect(vault.session().mask('Horizon FinTech and Northpoint Advisors')).toMatch(/^\[CLIENT_[0-9A-F]+\] and \[FIRM_[0-9A-F]+\]$/)
        // The rule, not the caching (tested below): each switch read afresh.
        h.offFirms = new Set(['f1'])
        forgetKnownNames()
        expect(await vaultForFirms(['f1', 'f2'])).not.toBeNull()
        h.offFirms = new Set(['f1', 'f2'])
        forgetKnownNames()
        expect(await vaultForFirms(['f1', 'f2'])).toBeNull()
    })
})

describe('kept for a little while', () => {
    it('calls close together share one lookup; after 2 minutes, it looks again', async () => {
        vi.useFakeTimers({ now: new Date('2026-11-14T10:00:00Z') })
        try {
            await Promise.all([engagementEntities('p1'), engagementEntities('p1'), vaultForEngagement('p1', 'f1')])
            expect(h.lookups).toBe(1)
            vi.setSystemTime(new Date('2026-11-14T10:01:59Z'))
            await engagementEntities('p1')
            expect(h.lookups).toBe(1)
            vi.setSystemTime(new Date('2026-11-14T10:02:01Z'))
            await engagementEntities('p1')
            expect(h.lookups).toBe(2)
        } finally {
            vi.useRealTimers()
        }
    })

    it('turning masking off takes effect within a minute', async () => {
        vi.useFakeTimers({ now: new Date('2026-11-14T10:00:00Z') })
        try {
            expect(await vaultForEngagement('p1', 'f1')).not.toBeNull()
            h.firmSettings = { brio: { maskNames: false } }
            expect(await vaultForEngagement('p1', 'f1')).not.toBeNull()
            vi.setSystemTime(new Date('2026-11-14T10:01:01Z'))
            expect(await vaultForEngagement('p1', 'f1')).toBeNull()
        } finally {
            vi.useRealTimers()
        }
    })
})
