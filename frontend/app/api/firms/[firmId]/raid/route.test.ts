import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * GET /api/firms/[firmId]/raid: the Firm Overview's open risks and issues, for those who may open an
 * engagement's RAID log, and a refusal (which hides the section) for everyone else.
 */

const { getUser, findFirm, engagementIds, overview } = vi.hoisted(() => ({
    getUser: vi.fn(),
    findFirm: vi.fn(),
    engagementIds: vi.fn(),
    overview: vi.fn(),
}))

vi.mock('@/utils/supabase/server', () => ({ createClient: async () => ({ auth: { getUser } }) }))
vi.mock('@/lib/user-settings-plus', () => ({ userSettingsPlus: { getUserSettingsPlus: async () => ({ permissions: { firms: [] } }) } }))
vi.mock('@/lib/permission-helpers', () => ({ findFirmInPermissions: findFirm }))
vi.mock('@/lib/raid/firm-raid', () => ({ firmRaidEngagementIds: engagementIds, firmRaidOverview: overview }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))

import { GET } from './route'

const get = () => GET(new NextRequest('http://localhost/api/firms/f1/raid'), { params: Promise.resolve({ firmId: 'f1' }) })

beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ data: { user: { id: 'u1' } } })
    findFirm.mockReset().mockReturnValue({ id: 'f1' })
    engagementIds.mockReset().mockResolvedValue(['e1'])
    overview.mockReset().mockResolvedValue({ counts: { openIssues: 1, openRisks: 0, engagements: 1 }, rows: [], more: 0 })
})

describe('GET /api/firms/[firmId]/raid', () => {
    it('answers the open risks and issues across the engagements the person may see', async () => {
        const res = await get()
        expect(res.status).toBe(200)
        expect(engagementIds).toHaveBeenCalledWith('f1', { firms: [] })
        expect(overview).toHaveBeenCalledWith(['e1'])
        expect((await res.json()).data.counts.openIssues).toBe(1)
        expect(res.headers.get('cache-control')).toBe('private, no-store')
    })

    it('refuses someone with no engagement whose RAID log they may open: a Limited Access contributor or a Reviewer', async () => {
        engagementIds.mockResolvedValue([])
        const res = await get()
        expect(res.status).toBe(403)
        expect(overview).not.toHaveBeenCalled()
    })

    it('refuses someone outside the firm, and someone signed out', async () => {
        findFirm.mockReturnValue(null)
        expect((await get()).status).toBe(404)
        getUser.mockResolvedValue({ data: { user: null } })
        expect((await get()).status).toBe(401)
        expect(engagementIds).not.toHaveBeenCalled()
    })

    it('says so in words when it fails', async () => {
        overview.mockRejectedValue(new Error('db down'))
        const res = await get()
        expect(res.status).toBe(500)
        expect((await res.json()).error).toMatch(/didn't load/)
    })
})
