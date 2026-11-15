import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { PERSONA_CAPABILITY_MAP } from '@/lib/permissions/persona-map'
import { ROLE_NAME } from '@/lib/persona-ui-groups'

/**
 * Who the engagement's audit trail answers: the people the app shows it to, and no one else. The Audit
 * tab (the whole trail) is a Lead's or a firm admin's; a file's Activity in the Details pane is the firm's
 * own people's. A Contributor · Limited Access and a Reviewer see neither, and their own session can't
 * pull it from the route either: the trail names internal-only files and memos. The database is stubbed.
 */

const h = vi.hoisted(() => ({
    user: { id: 'u1' } as object | null,
    caps: {} as Record<string, boolean>,
    findMany: vi.fn(async () => [] as unknown[]),
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
}))
vi.mock('@/lib/resolve-project-context', () => ({ resolveProjectContext: async () => ({ firmId: 'f1', orgId: 'f1', clientId: 'c1', projectId: 'p1' }) }))
vi.mock('@/lib/permission-helpers', () => ({
    canViewProject: async () => !!h.caps['project:can_view'],
    canManageProject: async () => !!h.caps['project:can_manage'],
    canViewProjectInternalTabs: async () => !!h.caps['project:can_view_internal'],
}))
vi.mock('@/lib/prisma', () => ({ prisma: { platformAuditEvent: { findMany: h.findMany } } }))
vi.mock('@/lib/audit/file-names', () => ({ withResolvedFileNames: async (events: unknown[]) => events }))

import { GET } from './route'

const DOC = '33333333-3333-4333-8333-333333333333'
const get = (query = '') => GET(new NextRequest(`http://localhost/api/projects/p1/audit${query}`), { params: Promise.resolve({ projectId: 'p1' }) })
/** As each role holds the engagement, from the one capability map the app uses. */
const as = (role: string) => { h.caps = { ...(PERSONA_CAPABILITY_MAP[role] as Record<string, boolean>) } }

beforeEach(() => {
    h.user = { id: 'u1' }
    h.findMany.mockClear()
})

describe('GET the engagement audit trail', () => {
    it(`a ${ROLE_NAME.eng_admin} reads the whole trail and a file's activity`, async () => {
        as('eng_admin')
        expect((await get()).status).toBe(200)
        expect((await get(`?documentId=${DOC}`)).status).toBe(200)
        expect(h.findMany).toHaveBeenCalledTimes(2)
    })

    it(`a ${ROLE_NAME.eng_member} reads a file's activity, but not the whole trail, which the app keeps to Leads`, async () => {
        as('eng_member')
        const whole = await get()
        expect(whole.status).toBe(403)
        expect((await whole.json()).error).toBe("This engagement's audit trail is for Leads and firm admins.")
        expect((await get(`?documentId=${DOC}`)).status).toBe(200)
        expect(h.findMany).toHaveBeenCalledTimes(1)
    })

    for (const role of ['eng_ext_collaborator', 'eng_viewer'] as const) {
        it(`a ${ROLE_NAME[role]} reads neither, and nothing is read for them`, async () => {
            as(role)
            expect((await get()).status).toBe(403)
            const file = await get(`?documentId=${DOC}`)
            expect(file.status).toBe(403)
            expect((await file.json()).error).toBe("A file's activity is for the firm's own people.")
            expect(h.findMany).not.toHaveBeenCalled()
        })
    }

    it('no one signed in, or no access to the engagement: refused before anything is read', async () => {
        h.user = null
        expect((await get()).status).toBe(401)
        h.user = { id: 'u1' }
        h.caps = {}
        expect((await get(`?documentId=${DOC}`)).status).toBe(403)
        expect(h.findMany).not.toHaveBeenCalled()
    })
})
