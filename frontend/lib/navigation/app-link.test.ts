import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const { prisma, brandedHostForGroup } = vi.hoisted(() => ({
    prisma: {
        firm: { findUnique: vi.fn() },
        engagement: { findUnique: vi.fn() },
        engagementDocument: { findUnique: vi.fn() },
    },
    brandedHostForGroup: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/custom-domains/group-domains', () => ({ brandedHostForGroup }))

import { appLink, appLinkOrNull } from './app-link'

beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.firma.bz')
})
afterEach(() => vi.unstubAllEnvs())

const PATH = '/d/acme/f/advisory/c/contoso/e/audit?tab=files#doc-comment:d1:c1'

describe('appLink', () => {
    it('uses the workspace\'s approved domain, keeping query and hash', async () => {
        prisma.engagement.findUnique.mockResolvedValue({ firm: { groupId: 'g1' } })
        brandedHostForGroup.mockResolvedValue('acme.firma.bz')
        expect(await appLink(PATH, { engagementId: 'e1' })).toBe(`https://acme.firma.bz${PATH}`)
        expect(brandedHostForGroup).toHaveBeenCalledWith('g1')
    })

    it('finds the workspace from a firm, a document or the group itself', async () => {
        brandedHostForGroup.mockResolvedValue('portal.acme.com')
        prisma.firm.findUnique.mockResolvedValue({ groupId: 'g1' })
        prisma.engagementDocument.findUnique.mockResolvedValue({ firm: { groupId: 'g1' } })
        expect(await appLink('/x', { firmId: 'f1' })).toBe('https://portal.acme.com/x')
        expect(await appLink('/x', { documentId: 'doc1' })).toBe('https://portal.acme.com/x')
        expect(await appLink('/x', { groupId: 'g1' })).toBe('https://portal.acme.com/x')
    })

    it('falls back to the main address: no domain, no scope, or a failed lookup', async () => {
        brandedHostForGroup.mockResolvedValue(null)
        prisma.firm.findUnique.mockResolvedValue({ groupId: 'g1' })
        expect(await appLink('/x', { firmId: 'f1' })).toBe('https://www.firma.bz/x')
        expect(await appLink('/x', null)).toBe('https://www.firma.bz/x')
        prisma.firm.findUnique.mockRejectedValue(new Error('db down'))
        expect(await appLink('/x', { firmId: 'f1' })).toBe('https://www.firma.bz/x')
        expect(await appLinkOrNull(null, { firmId: 'f1' })).toBeNull()
    })
})

/**
 * Every absolute link to a workspace page goes through appLink, so it opens on the workspace's custom
 * domain. Building `NEXT_PUBLIC_APP_URL + path` by hand sends people to www, where they're signed out.
 * The allowlist is platform pages that belong to no workspace.
 */
describe('guard: absolute app links are built in one place', () => {
    const ROOT = join(__dirname, '..', '..')
    const ALLOWED = new Set([
        'lib/config.ts',
        'lib/navigation/platform-link.ts',
        'lib/custom-domains/hosts.ts',
        'lib/actions/system-admin-signup.ts', // a System Admin's sign-up invite: no workspace yet
        'app/(app)/system/links/page.tsx', // marketing UTM links
        'app/(marketing)/waitlist/[campaignId]/waitlist-content.tsx',
        'app/actions/submit-waitlist.ts',
        'app/actions/get-referral-stats.ts',
        'app/api/billing/customer-portal/route.ts', // Polar's return URL, the request's own origin first
        'app/api/connectors/google-drive/callback/route.ts', // Drive's registered redirect URI lives on www
    ])

    function files(dir: string, out: string[] = []): string[] {
        for (const entry of readdirSync(dir)) {
            if (entry === 'node_modules' || entry.startsWith('.')) continue
            const full = join(dir, entry)
            if (statSync(full).isDirectory()) files(full, out)
            else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
        }
        return out
    }

    it('no other file reads NEXT_PUBLIC_APP_URL to build a link', () => {
        const offenders = ['lib', 'app', 'components']
            .flatMap((d) => files(join(ROOT, d)))
            .filter((f) => readFileSync(f, 'utf8').includes('process.env.NEXT_PUBLIC_APP_URL'))
            .map((f) => relative(ROOT, f))
            .filter((f) => !ALLOWED.has(f))
        expect(offenders).toEqual([])
    })
})
