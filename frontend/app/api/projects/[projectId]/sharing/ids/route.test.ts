import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Limited roles call this route too. The ids behind the Internal only filter are what's hidden from them,
// so they must never receive that list, even as ids.

const { st, internalOnlyTreeIds } = vi.hoisted(() => ({
    st: { user: { id: 'u1' } as { id: string } | null, role: 'eng_admin' as string | null, canView: true },
    internalOnlyTreeIds: vi.fn(async () => ({ ids: ['secret'], ancestorIds: ['deliverable'] })),
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: st.user } }) } }),
}))
vi.mock('@/lib/resolve-project-context', () => ({ resolveProjectContext: async () => ({ firmId: 'f', clientId: 'c', projectId: 'p' }) }))
vi.mock('@/lib/permission-helpers', () => ({
    canViewProject: async () => st.canView,
    getProjectPersona: async () => st.role,
}))
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRawUnsafe: async () => [] } }))
vi.mock('@/lib/engagement-sharing-ids', () => ({
    internalOnlyTreeIds,
    getSharedAndAncestorIdsForAllPersonas: async () => ({
        sharedIdsUnion: ['shared'], ancestorIds: [], sharedIdsForEC: [], sharedIdsForGuest: [],
        descendantIds: [], descendantIdsForEC: [], descendantIdsForGuest: [],
    }),
}))

import { GET } from './route'

const call = () => GET(new NextRequest('http://localhost/api/projects/p/sharing/ids'), { params: Promise.resolve({ projectId: 'p' }) })

beforeEach(() => {
    vi.clearAllMocks()
    st.user = { id: 'u1' }
    st.role = 'eng_admin'
    st.canView = true
})

describe('GET sharing/ids: the Internal only filter', () => {
    it.each(['eng_admin', 'eng_member'])('gives %s the list', async (role) => {
        st.role = role
        const body = await (await call()).json()
        expect(body.internalOnlyIds).toEqual(['secret'])
        expect(body.internalOnlyAncestorIds).toEqual(['deliverable'])
    })

    it.each(['eng_ext_collaborator', 'eng_viewer', null])('never gives %s the list, and never reads it', async (role) => {
        st.role = role
        const body = await (await call()).json()
        expect(body.internalOnlyIds).toEqual([])
        expect(body.internalOnlyAncestorIds).toEqual([])
        expect(internalOnlyTreeIds).not.toHaveBeenCalled()
        expect(body.sharedExternalIds).toEqual(['shared'])
    })

    it('still refuses signed out, and anyone who cannot view the engagement', async () => {
        st.user = null
        expect((await call()).status).toBe(401)
        st.user = { id: 'u1' }
        st.canView = false
        expect((await call()).status).toBe(403)
    })
})
