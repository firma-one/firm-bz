import { describe, it, expect, vi, beforeEach } from 'vitest'

// A client sees neither a deliverable's Not started documents nor the firm's Blocked flags
// (.claude/plans/deliverable-stages-blocked.md), whatever persona it asks for.

const { st } = vi.hoisted(() => ({ st: { role: 'eng_admin' as string } }))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) } }),
}))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: () => ({ auth: { admin: { getUserById: async () => ({ data: { user: null } }) } } }) }))
vi.mock('@/lib/resolve-project-context', () => ({ resolveProjectContext: async () => ({ orgId: 'f', firmId: 'f', clientId: 'c', projectId: 'p' }) }))
vi.mock('@/lib/permission-helpers', () => ({ canViewProject: async () => true, getProjectPersona: async () => st.role }))
vi.mock('@/lib/file-utils', () => ({ getFileInfo: async () => ({ organizationId: 'f', externalId: 'ext-D' }) }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagementDocument: {
            findUnique: async () => ({ id: 'D', externalId: 'ext-D', isFolder: true, fileName: 'Report', dueDate: null, docId: 'QSR-1', settings: { share: { createdAt: 'x' }, activity: { status: 'in_progress' } } }),
            findMany: async ({ where }: any) => where.isFolder
                ? [{ externalId: 'ext-D', fileName: 'Report', parentId: null }]
                : [
                    { id: 'd1', externalId: 'e1', fileName: 'A.docx', docId: 'A', dueDate: null, parentId: 'ext-D', mimeType: null, settings: { activity: { status: 'in_progress' }, blocked: { reason: 'client', at: 'x', by: 'u' } } },
                    { id: 'd2', externalId: 'e2', fileName: 'B.docx', docId: 'B', dueDate: null, parentId: 'ext-D', mimeType: null, settings: {} },
                ],
        },
        $queryRawUnsafe: async () => [{ id: 'd1' }, { id: 'd2' }],
    },
}))

import { GET } from './route'

const get = (persona = 'all') =>
    GET({ nextUrl: new URL(`http://x/api/projects/p/documents/D/subtasks?persona=${persona}`) } as any, { params: Promise.resolve({ projectId: 'p', documentId: 'D' }) })

beforeEach(() => { st.role = 'eng_admin' })

describe('GET subtasks', () => {
    it("gives the firm every document, Not started ones too, with what's blocked", async () => {
        const { subtasks } = await (await get()).json()
        expect(subtasks.map((s: any) => [s.id, s.status, s.blocked?.reason ?? null])).toEqual([
            ['d1', 'in_progress', 'client'],
            ['d2', 'not_started', null],
        ])
    })

    it.each(['eng_ext_collaborator', 'eng_viewer'])('gives %s only the documents on the Board, with no Blocked flag', async (role) => {
        st.role = role
        const { subtasks } = await (await get()).json()
        expect(subtasks.map((s: any) => [s.id, s.blocked])).toEqual([['d1', null]])
    })
})
