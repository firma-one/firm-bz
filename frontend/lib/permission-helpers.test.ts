import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * checkProjectPermission's DB fallback runs when the cached permissions don't list the engagement
 * yet (a fresh join, or a cache another server hasn't rebuilt). Membership alone answers can_view;
 * for privileges the persona map decides, the member's role must — otherwise a Reviewer with a
 * stale cache would pass a manage check.
 */

const { db, jwt } = vi.hoisted(() => ({
    db: { firmRole: null as string | null, engagementRole: null as string | null, inFirm: true },
    jwt: { app_metadata: {} as Record<string, unknown> },
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1', app_metadata: jwt.app_metadata } } }) } }),
}))
vi.mock('./user-settings-plus', () => ({
    userSettingsPlus: { getUserSettingsPlus: vi.fn(async () => ({ permissions: { firms: [] } })) },
}))
vi.mock('./prisma', () => ({
    prisma: {
        firmMember: { findFirst: vi.fn(async () => (db.firmRole ? { role: db.firmRole } : null)) },
        engagementMember: { findFirst: vi.fn(async () => (db.engagementRole ? { role: db.engagementRole } : null)) },
        // Hierarchy binding: does the client / engagement sit under the firm passed in?
        client: { findFirst: vi.fn(async () => (db.inFirm ? { id: 'c1' } : null)) },
        engagement: { findFirst: vi.fn(async () => (db.inFirm ? { id: 'e1' } : null)) },
    },
}))
vi.mock('./logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))

import { canViewProject, canManageProject, canEditProject, canViewProjectInternalTabs, canViewDocument, canManageOrganization, canManageClient } from './permission-helpers'

const args = ['f1', 'c1', 'e1'] as const

beforeEach(() => {
    db.firmRole = null
    db.engagementRole = null
    db.inFirm = true
    jwt.app_metadata = {}
})

describe('checkProjectPermission DB fallback (engagement missing from the cache)', () => {
    it('lets a Reviewer view, but not manage, edit or see internal tabs', async () => {
        db.engagementRole = 'eng_viewer'
        expect(await canViewProject(...args)).toBe(true)
        expect(await canManageProject(...args)).toBe(false)
        expect(await canEditProject(...args)).toBe(false)
        expect(await canViewProjectInternalTabs(...args)).toBe(false)
    })

    it('lets a lead manage, and a contributor edit without managing', async () => {
        db.engagementRole = 'eng_admin'
        expect(await canManageProject(...args)).toBe(true)
        db.engagementRole = 'eng_member'
        expect(await canEditProject(...args)).toBe(true)
        expect(await canManageProject(...args)).toBe(false)
    })

    it('keeps the membership answer for privileges the persona map does not define', async () => {
        db.engagementRole = 'eng_viewer'
        expect(await canViewDocument(...args)).toBe(true)
    })

    it('still lets a firm admin manage, and refuses a stranger', async () => {
        db.firmRole = 'firm_admin'
        expect(await canManageProject(...args)).toBe(true)
        db.firmRole = null
        expect(await canViewProject(...args)).toBe(false)
    })
})

describe('hierarchy binding (P0 #8)', () => {
    it('refuses a firm admin for an engagement or client that is not in their firm', async () => {
        db.firmRole = 'firm_admin'
        db.inFirm = false
        expect(await canManageProject(...args)).toBe(false)
        expect(await canViewProject(...args)).toBe(false)
        expect(await canManageClient('f1', 'foreign-client')).toBe(false)
    })

    it('still lets a firm admin manage their own firm\'s engagements and clients', async () => {
        db.firmRole = 'firm_admin'
        expect(await canManageProject(...args)).toBe(true)
        expect(await canManageClient('f1', 'c1')).toBe(true)
    })
})

describe('firm management comes from the database, not token claims (P0 #7)', () => {
    it('ignores a firm_admin persona claim the database does not back', async () => {
        jwt.app_metadata = { active_firm_id: 'f1', active_persona: 'firm_admin' }
        db.firmRole = 'firm_member'
        expect(await canManageOrganization('f1')).toBe(false)
        expect(await canManageClient('f1', 'c1')).toBe(false)
    })

    it('answers yes for a real firm admin', async () => {
        db.firmRole = 'firm_admin'
        expect(await canManageOrganization('f1')).toBe(true)
    })
})
