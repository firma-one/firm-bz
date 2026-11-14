import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { UserPermissions } from '@/lib/user-settings-plus'
import { getCapabilitiesForPersona } from '@/lib/permissions/persona-map'

/**
 * The Firm Overview's open risks and issues: only engagements whose RAID log the person may open, as the
 * RAID tab decides it, and every open one from any source as rows, issues first.
 */

const { engagementFindMany, raidFindMany, loadPeople } = vi.hoisted(() => ({
    engagementFindMany: vi.fn(),
    raidFindMany: vi.fn(),
    loadPeople: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
    prisma: { engagement: { findMany: engagementFindMany }, engagementRaidItem: { findMany: raidFindMany } },
}))
vi.mock('@/lib/files/file-creator', () => ({ loadPeople }))

import { firmRaidEngagementIds, firmRaidOverview, mayReadRaid } from './firm-raid'

/** A project's scopes as UserSettingsPlus builds them from the role's capabilities. */
function scopesOf(persona: string): Record<string, string[]> {
    const scopes: Record<string, string[]> = {}
    for (const [key, on] of Object.entries(getCapabilitiesForPersona(persona) as Record<string, boolean | undefined>)) {
        if (!on) continue
        const [scope, privilege] = key.split(':')
        ;(scopes[scope] ??= []).push(privilege)
    }
    return scopes
}

function perms({ personas = ['firm_member'], clientScopes = {}, projects = [] }: {
    personas?: string[]
    clientScopes?: Record<string, string[]>
    projects?: { id: string; persona: string }[]
}): UserPermissions {
    return {
        firms: [{
            id: 'f1',
            role: personas[0],
            personas,
            scopes: {},
            isDefault: true,
            clients: [{ id: 'c1', scopes: clientScopes, projects: projects.map((p) => ({ id: p.id, persona: p.persona, scopes: scopesOf(p.persona) })) }],
        }],
    }
}

beforeEach(() => {
    engagementFindMany.mockReset()
    raidFindMany.mockReset()
    loadPeople.mockReset()
    loadPeople.mockResolvedValue(new Map([['u-alex', { name: 'Alex Rivera' }]]))
})

describe('mayReadRaid', () => {
    it.each([
        ['eng_admin', true],
        ['eng_member', true],
        ['eng_ext_collaborator', false],
        ['eng_viewer', false],
    ])('on the engagement as %s: %s', (persona, expected) => {
        expect(mayReadRaid(perms({ projects: [{ id: 'e1', persona }] }), 'f1', 'c1', 'e1')).toBe(expected)
    })

    it('lets a firm admin and the client manager in where they have no role, and no one else', () => {
        expect(mayReadRaid(perms({ personas: ['firm_admin'] }), 'f1', 'c1', 'e1')).toBe(true)
        expect(mayReadRaid(perms({ clientScopes: { client: ['can_manage'] } }), 'f1', 'c1', 'e1')).toBe(true)
        expect(mayReadRaid(perms({}), 'f1', 'c1', 'e1')).toBe(false)
    })

    it('goes by the role on the engagement first, as the RAID tab does: a firm admin who is a Reviewer there is not let in', () => {
        expect(mayReadRaid(perms({ personas: ['firm_admin'], projects: [{ id: 'e1', persona: 'eng_viewer' }] }), 'f1', 'c1', 'e1')).toBe(false)
    })
})

describe('firmRaidEngagementIds', () => {
    it('keeps the live engagements the person may open the RAID log of', async () => {
        engagementFindMany.mockResolvedValue([
            { id: 'e-lead', clientId: 'c1' },
            { id: 'e-limited', clientId: 'c1' },
            { id: 'e-reviewer', clientId: 'c1' },
            { id: 'e-none', clientId: 'c1' },
        ])
        const ids = await firmRaidEngagementIds('f1', perms({
            projects: [
                { id: 'e-lead', persona: 'eng_admin' },
                { id: 'e-limited', persona: 'eng_ext_collaborator' },
                { id: 'e-reviewer', persona: 'eng_viewer' },
            ],
        }))
        expect(ids).toEqual(['e-lead'])
        expect(engagementFindMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { firmId: 'f1', deletedAt: null, status: { not: 'COMPLETED' } },
        }))
    })

    it('asks nothing for a firm the person is not in', async () => {
        expect(await firmRaidEngagementIds('other', perms({ personas: ['firm_admin'] }))).toEqual([])
        expect(engagementFindMany).not.toHaveBeenCalled()
    })
})

describe('firmRaidOverview', () => {
    const at = (d: number) => new Date(Date.UTC(2026, 10, d))
    const entry = (id: string, type: string, sourceKind: string, day: number, engagementId = 'e1', ownerUserId: string | null = null) =>
        ({ id, type, title: `Title ${id}`, ownerUserId, sourceKind, raisedAt: at(day), engagementId })

    it('lists every open one, status and health ones too, issues first then newest, and says how many more', async () => {
        raidFindMany.mockResolvedValue([
            entry('r-new', 'RISK', 'MEMO', 12, 'e1', 'u-alex'),
            entry('i-old', 'ISSUE', 'THREAD', 5, 'e2'),
            entry('i-new', 'ISSUE', 'MEMO', 10),
            entry('r-status', 'RISK', 'STATUS', 13),
            entry('i-health', 'ISSUE', 'HEALTH', 13, 'e3'),
        ])
        engagementFindMany.mockResolvedValue([
            { id: 'e1', name: 'Q2 Launch', slug: 'q2', client: { name: 'Horizon', slug: 'horizon', firm: { slug: 'beacon', group: { slug: 'g' } } } },
            { id: 'e2', name: 'Retainer', slug: 'ret', client: { name: 'Acme', slug: 'acme', firm: { slug: 'beacon', group: { slug: 'g' } } } },
            { id: 'e3', name: 'Brand Refresh', slug: 'q4', client: { name: 'Acme', slug: 'acme', firm: { slug: 'beacon', group: { slug: 'g' } } } },
        ])

        const out = await firmRaidOverview(['e1', 'e2', 'e3'], 3)

        expect(raidFindMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { engagementId: { in: ['e1', 'e2', 'e3'] }, status: 'OPEN', type: { in: ['RISK', 'ISSUE'] } },
        }))
        expect(out.counts).toEqual({ openIssues: 3, openRisks: 2, engagements: 3 })
        // An overdue deliverable (status) and behind pace (health) are listed: the firm's Action Center doesn't show them.
        expect(out.rows.map((r) => r.id)).toEqual(['i-health', 'i-new', 'i-old'])
        expect(out.more).toBe(2)
        expect(out.rows[2].engagement).toEqual({ name: 'Retainer', clientName: 'Acme', href: expect.stringContaining('/raid') })
    })

    it("names the owner by first name, and no one when it has none", async () => {
        raidFindMany.mockResolvedValue([entry('r1', 'RISK', 'MEMO', 12, 'e1', 'u-alex'), entry('r2', 'RISK', 'THREAD', 11)])
        engagementFindMany.mockResolvedValue([
            { id: 'e1', name: 'Q2 Launch', slug: 'q2', client: { name: 'Horizon', slug: 'horizon', firm: { slug: 'beacon', group: { slug: 'g' } } } },
        ])
        const out = await firmRaidOverview(['e1'])
        expect(out.rows.map((r) => r.ownerFirstName)).toEqual(['Alex', null])
    })

    it('reads nothing without engagements', async () => {
        expect(await firmRaidOverview([])).toEqual({ counts: { openIssues: 0, openRisks: 0, engagements: 0 }, rows: [], more: 0 })
        expect(raidFindMany).not.toHaveBeenCalled()
    })
})
