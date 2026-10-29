import { describe, it, expect, vi, beforeEach } from 'vitest'

// The Discussions list and internal notes (2026-10-29): a client's list never shows one — not its
// text, its count or an unread dot — and an internal note after a client's comment doesn't count
// as the firm's reply.

const { st, where } = vi.hoisted(() => ({
    st: { role: 'eng_admin' as string },
    where: [] as any[],
}))

/** A client asked; the firm then wrote an internal note, not a reply. */
const MESSAGES = [
    { id: 'm1', projectDocumentId: 'd1', createdAt: new Date('2026-10-01'), content: 'When will the deck be ready?', authorUserId: 'client-1', isInternal: false },
    { id: 'm2', projectDocumentId: 'd1', createdAt: new Date('2026-10-02'), content: 'Pricing slide needs partner sign-off first', authorUserId: 'lead-1', isInternal: true },
]
const matches = (m: any, w: any) =>
    (w.isInternal === undefined || m.isInternal === w.isInternal)
    && (!w.projectDocumentId || (typeof w.projectDocumentId === 'string' ? m.projectDocumentId === w.projectDocumentId : w.projectDocumentId.in.includes(m.projectDocumentId)))
    && (!w.id?.in || w.id.in.includes(m.id))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) } }),
}))
vi.mock('@/lib/resolve-project-context', () => ({ resolveProjectContext: async () => ({ orgId: 'f', clientId: 'c', projectId: 'p' }) }))
vi.mock('@/lib/permission-helpers', () => ({ canViewProject: async () => true }))
vi.mock('@/lib/engagement-access', () => ({
    requireEngagementMember: async () => ({ role: st.role }),
    visibleDocumentIdsFor: async () => null,
}))
vi.mock('@/lib/files/file-creator', () => ({
    loadPeople: async (ids: string[]) => new Map(ids.map((id) => [id, { name: `Name of ${id}`, email: `${id}@x.com`, avatarUrl: null }])),
}))
vi.mock('@/lib/comments/tagged-documents', () => ({ taggedDocumentsIn: async () => ({}) }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        userPersonalization: { findUnique: async () => ({ reminders: [{ entityKey: 'platform.doc_comments', entityValue: 'm2' }] }) },
        engagementMember: { findMany: async () => [{ userId: 'client-1', role: 'eng_viewer' }, { userId: 'lead-1', role: 'eng_admin' }] },
        engagementDocument: {
            findMany: async () => [{ id: 'd1', externalId: 'ext1', parentId: null, fileName: 'Deck', docId: 'QSR-9', isFolder: true, mimeType: null, settings: { share: { createdAt: '2026-09-01' } } }],
        },
        docCommentMessage: {
            findMany: async (args: any) => { where.push(args.where); return MESSAGES.filter((m) => matches(m, args.where)) },
            findFirst: async (args: any) => { where.push(args.where); return MESSAGES.filter((m) => matches(m, args.where)).at(-1) ?? null },
            groupBy: async (args: any) => {
                where.push(args.where)
                const found = MESSAGES.filter((m) => matches(m, args.where))
                const ids = Array.from(new Set(found.map((m) => m.projectDocumentId)))
                return ids.map((id) => ({
                    projectDocumentId: id,
                    _count: { _all: found.filter((m) => m.projectDocumentId === id).length },
                    _max: { createdAt: found.filter((m) => m.projectDocumentId === id).at(-1)!.createdAt },
                }))
            },
        },
        docCommentThread: { findMany: async () => [] },
        docCommentRead: { findMany: async () => [] },
    },
}))

import { GET } from './route'

const get = (qs = '') => GET({ nextUrl: new URL(`http://x/api/projects/p/doc-comments${qs}`) } as any, { params: Promise.resolve({ projectId: 'p' }) })

beforeEach(() => {
    st.role = 'eng_admin'
    where.length = 0
})

describe('Discussions and internal notes', () => {
    it.each(['eng_viewer', 'eng_ext_collaborator'])('a client (%s) never sees one: count, preview and unread', async (role) => {
        st.role = role
        const { documents } = await (await get()).json()
        expect(documents[0].count).toBe(1)
        expect(documents[0].latest.preview).toBe('When will the deck be ready?')
        expect(documents[0].latest.isInternal).toBe(false)
        // Every comment query made for a client leaves internal notes out.
        expect(where.length).toBeGreaterThan(0)
        for (const w of where) expect(w.isInternal).toBe(false)
    })

    it('nor in their mentions', async () => {
        st.role = 'eng_viewer'
        const { mentions } = await (await get('?filter=mentions')).json()
        expect(mentions).toEqual([])
    })

    it('the firm sees the note as the latest, marked, and the client still awaits a reply', async () => {
        const { documents } = await (await get()).json()
        expect(documents[0].count).toBe(2)
        expect(documents[0].latest.preview).toBe('Pricing slide needs partner sign-off first')
        expect(documents[0].latest.isInternal).toBe(true)
        expect(documents[0].latest.authorIsExternal).toBe(true)
    })
})
