import { describe, it, expect, vi, beforeEach } from 'vitest'

const { db, access } = vi.hoisted(() => ({
    db: {
        docs: [] as any[],
        messages: [] as any[],
        reminders: [] as any[],
        threads: [] as any[],
        reads: [] as any[],
    },
    access: { member: { role: 'eng_admin' } as { role: string } | null, visible: null as Set<string> | null },
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) } }),
}))
vi.mock('@/lib/resolve-project-context', () => ({
    resolveProjectContext: async () => ({ orgId: 'f', clientId: 'c', projectId: 'p' }),
}))
vi.mock('@/lib/permission-helpers', () => ({ canViewProject: async () => true }))
vi.mock('@/lib/engagement-access', () => ({
    requireEngagementMember: async () => access.member,
    visibleDocumentIdsFor: async () => access.visible,
}))
vi.mock('@/lib/files/file-creator', () => ({
    loadPeople: async (ids: string[]) => new Map(ids.map((id) => [id, { name: `Name of ${id}`, email: `${id}@x.com`, avatarUrl: null }])),
}))
vi.mock('@/lib/comments/tagged-documents', () => ({ taggedDocumentsIn: async () => ({}) }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        userPersonalization: { findUnique: async () => ({ reminders: db.reminders }) },
        engagementMember: { findMany: async () => [{ userId: 'u3', role: 'eng_member' }] },
        engagementDocument: {
            findMany: async ({ where }: any) =>
                db.docs.filter((d) => (!where.id?.in || where.id.in.includes(d.id)) && (where.isFolder === undefined || d.isFolder === where.isFolder)),
        },
        docCommentMessage: {
            findMany: async ({ where, orderBy }: any) => {
                const found = db.messages.filter((m) => (!where.id?.in || where.id.in.includes(m.id)) && (!where.projectDocumentId?.in || where.projectDocumentId.in.includes(m.projectDocumentId)))
                return orderBy?.createdAt === 'desc' ? [...found].reverse() : found
            },
            groupBy: async ({ where, _max }: any) => {
                // The newest comment by someone other than the caller, per discussion (for unread).
                if (_max) {
                    const others = db.messages.filter((m) => where.projectDocumentId.in.includes(m.projectDocumentId) && m.authorUserId !== 'me')
                    const ids = Array.from(new Set(others.map((m) => m.projectDocumentId)))
                    return ids.map((id) => ({ projectDocumentId: id, _max: { createdAt: others.filter((m) => m.projectDocumentId === id).at(-1).createdAt } }))
                }
                const ids = Array.from(new Set(db.messages.map((m) => m.projectDocumentId)))
                return ids.map((id) => ({ projectDocumentId: id, _count: { _all: db.messages.filter((m) => m.projectDocumentId === id).length } }))
            },
            findFirst: async ({ where }: any) => db.messages.filter((m) => m.projectDocumentId === where.projectDocumentId).at(-1) ?? null,
        },
        docCommentThread: { findMany: async ({ where }: any) => db.threads.filter((t) => where.projectDocumentId.in.includes(t.projectDocumentId) && t.resolvedAt) },
        docCommentRead: { findMany: async ({ where }: any) => db.reads.filter((r) => r.userId === where.userId && where.projectDocumentId.in.includes(r.projectDocumentId)) },
    },
}))

import { GET } from './route'

const get = (qs = '') => GET({ nextUrl: new URL(`http://x/api/projects/p/doc-comments${qs}`) } as any, { params: Promise.resolve({ projectId: 'p' }) })

beforeEach(() => {
    access.member = { role: 'eng_admin' }
    access.visible = null
    db.docs = [
        { id: 'd1', externalId: 'ext1', parentId: 'root', fileName: 'Report', docId: 'QSR-9', isFolder: true, mimeType: null, settings: { share: { createdAt: '2026-09-01' } } },
        { id: 'd2', externalId: 'ext2', parentId: 'ext1', fileName: 'Budget.xlsx', docId: 'QSR-14', isFolder: false, mimeType: 'application/vnd.ms-excel', settings: {} },
    ]
    db.messages = [
        { id: 'm1', projectDocumentId: 'd1', createdAt: new Date('2026-10-01'), content: 'first', authorUserId: 'u1' },
        { id: 'm2', projectDocumentId: 'd1', createdAt: new Date('2026-10-02'), content: 'second', authorUserId: 'u2' },
        { id: 'm3', projectDocumentId: 'd2', createdAt: new Date('2026-10-03'), content: '@Name of u3 can you check the budget?', authorUserId: 'u1' },
    ]
    db.reminders = [{ entityKey: 'platform.doc_comments', entityValue: 'm1' }, { entityKey: 'platform.doc_comments', entityValue: 'm3' }]
    // Both read before the latest comments: d2 read after its comment, d1 before its second.
    db.reads = [
        { userId: 'me', projectDocumentId: 'd1', lastReadAt: new Date('2026-10-01T12:00:00Z') },
        { userId: 'me', projectDocumentId: 'd2', lastReadAt: new Date('2026-10-04') },
    ]
    db.threads = []
})

describe('GET /api/projects/[projectId]/doc-comments', () => {
    it('marks a discussion unread when someone else commented since you last read it, and lists it first', async () => {
        const { documents } = await (await get()).json()
        expect(documents.map((d: any) => [d.projectDocumentId, d.unread])).toEqual([['d1', true], ['d2', false]])
        db.reads = []
        const never = (await (await get()).json()).documents
        expect(never.every((d: any) => d.unread)).toBe(true)
    })

    it('says which discussions are resolved, and by whom', async () => {
        db.threads = [{ projectDocumentId: 'd2', resolvedAt: new Date('2026-10-05'), resolvedBy: 'u3' }]
        const { documents } = await (await get()).json()
        expect(documents.find((d: any) => d.projectDocumentId === 'd2').resolved).toEqual({ at: '2026-10-05T00:00:00.000Z', byName: 'Name of u3' })
        expect(documents.find((d: any) => d.projectDocumentId === 'd1').resolved).toBeNull()
    })

    it('lists each thread with what it is on and who wrote its latest comment', async () => {
        const { documents } = await (await get()).json()
        const report = documents.find((d: any) => d.projectDocumentId === 'd1')
        expect(report).toMatchObject({ kind: 'deliverable', count: 2, latest: { preview: 'second', authorName: 'Name of u2' } })
        expect(report.deliverable).toBeNull()
        expect(documents.find((d: any) => d.projectDocumentId === 'd2')).toMatchObject({
            kind: 'file', mimeType: 'application/vnd.ms-excel', deliverable: { docId: 'QSR-9', name: 'Report' },
        })
    })

    it('finds threads by their deliverable: the deliverable’s own, and its documents’', async () => {
        const { documents } = await (await get('?q=qsr-9')).json()
        expect(documents.map((d: any) => d.projectDocumentId).sort()).toEqual(['d1', 'd2'])
        // Written as a tag is, with "#"
        const tagged = (await (await get('?q=%23QSR-9')).json()).documents
        expect(tagged.map((d: any) => d.projectDocumentId).sort()).toEqual(['d1', 'd2'])
    })

    it('finds threads by a member who wrote in them, or was mentioned in them', async () => {
        const ids = async (q: string) => (await (await get(`?q=${encodeURIComponent(q)}`)).json()).documents.map((d: any) => d.projectDocumentId).sort()
        expect(await ids('name of u2')).toEqual(['d1'])
        expect(await ids('Name of U1')).toEqual(['d1', 'd2'])
        expect(await ids('u3')).toEqual(['d2'])
    })

    it('doesn’t look in what was said or in file names: only DOC-IDs and members', async () => {
        const { documents } = await (await get('?q=budget')).json()
        expect(documents).toEqual([])
    })

    it('is for engagement members only, as a document’s thread is', async () => {
        access.member = null
        expect((await get()).status).toBe(403)
    })

    it('shows an external member only the threads on documents shared with them', async () => {
        access.member = { role: 'eng_ext_collaborator' }
        access.visible = new Set(['ext2'])
        const { documents } = await (await get()).json()
        expect(documents.map((d: any) => d.projectDocumentId)).toEqual(['d2'])
        const { mentions } = await (await get('?filter=mentions')).json()
        expect(mentions.map((m: any) => m.messageId)).toEqual(['m3'])
    })
})
