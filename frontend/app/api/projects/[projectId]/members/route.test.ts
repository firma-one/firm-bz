import { describe, it, expect, vi, beforeEach } from 'vitest'

// The engagement's people, for the mention and reminder pickers (error-handling audit P2-21): a lookup
// that fails fails the load, rather than leaving that person out of every picker.

const { st } = vi.hoisted(() => ({
    st: { lookups: {} as Record<string, { data: any; error: any }> },
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) } }),
}))
vi.mock('@supabase/supabase-js', () => ({
    createClient: () => ({ auth: { admin: { getUserById: async (id: string) => st.lookups[id] } } }),
}))
vi.mock('@/lib/resolve-project-context', () => ({ resolveProjectContext: async () => ({ firmId: 'f', clientId: 'c', projectId: 'p' }) }))
vi.mock('@/lib/permission-helpers', () => ({ canViewProject: async () => true }))
vi.mock('@/lib/ai/files-agent/agent-identity', () => ({ isAgentUser: () => false }))
vi.mock('@/lib/auth/display-name', () => ({ resolveDisplayName: (meta: any, email: string) => meta.full_name ?? email }))
vi.mock('@/lib/prisma', () => ({
    prisma: { engagementMember: { findMany: async () => [{ userId: 'ana', role: 'eng_member' }, { userId: 'raj', role: 'eng_admin' }] } },
}))

import { GET } from './route'

const get = () => GET({} as never, { params: Promise.resolve({ projectId: 'p' }) })
const person = (email: string, full_name: string) => ({ data: { user: { email, user_metadata: { full_name } } }, error: null })

beforeEach(() => {
    st.lookups = { ana: person('ana@firm.com', 'Ana Lopez'), raj: person('raj@firm.com', 'Raj Patel') }
})

describe('GET /api/projects/[projectId]/members', () => {
    it('lists everyone with their names', async () => {
        const data = await (await get()).json()
        expect(data.members.map((m: any) => m.name)).toEqual(['Ana Lopez', 'Raj Patel'])
    })

    it('leaves out an account that no longer exists', async () => {
        st.lookups.raj = { data: { user: null }, error: { status: 404, message: 'User not found' } }
        const data = await (await get()).json()
        expect(data.members.map((m: any) => m.userId)).toEqual(['ana'])
    })

    it('fails the load, in words, when a lookup fails, instead of leaving someone out', async () => {
        st.lookups.raj = { data: { user: null }, error: { status: 500, message: 'upstream timeout' } }
        const res = await get()
        expect(res.status).toBe(500)
        expect((await res.json()).error).toBe("Couldn't load the people on this engagement. Try again.")
    })
})
