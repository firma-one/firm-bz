import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUserFirms, autoProvisionFirstFirm } = vi.hoisted(() => ({
    getUserFirms: vi.fn(),
    autoProvisionFirstFirm: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'a@b.test' } } }) } }),
}))
vi.mock('@/lib/firm-service', () => ({ FirmService: { getUserFirms } }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/onboarding/auto-provision', () => ({ autoProvisionFirstFirm }))

import { resolveDefaultFirmLandingPath } from './default-landing-path'

function firm(slug: string, groupSlug: string | null = 'grp') {
    return { id: slug, slug, groupSlug, members: [{ userId: 'u1', role: 'member', isDefault: false }] }
}

beforeEach(() => vi.clearAllMocks())

describe('resolveDefaultFirmLandingPath', () => {
    it('lands a returning user on the cross-firm Home, however many firms they have', async () => {
        getUserFirms.mockResolvedValue([firm('acme')])
        expect(await resolveDefaultFirmLandingPath('u1')).toBe('/d/u/home?landed=returning')

        getUserFirms.mockResolvedValue([firm('acme'), firm('beta', 'other')])
        expect(await resolveDefaultFirmLandingPath('u1')).toBe('/d/u/home?landed=returning')
    })

    it('still lands a brand-new user in the firm just provisioned for them', async () => {
        getUserFirms.mockResolvedValue([])
        autoProvisionFirstFirm.mockResolvedValue({ groupSlug: 'g', firmSlug: 'new-firm' })
        expect(await resolveDefaultFirmLandingPath('u1')).toBe('/d/g/f/new-firm?landed=new')
    })
})
