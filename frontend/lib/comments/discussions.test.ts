import { describe, it, expect, vi, beforeEach } from 'vitest'

const { db, who } = vi.hoisted(() => ({
    db: {
        groups: [] as { projectDocumentId: string }[],
        docs: [] as { id: string; externalId: string }[],
        resolved: [] as { projectDocumentId: string }[],
        upserts: [] as { model: string; args: any }[],
        member: { role: 'eng_admin' } as { role: string } | null,
        visible: null as Set<string> | null,
    },
    who: { user: { id: 'me' } as { id: string } | null },
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: who.user } }) } }),
}))
vi.mock('@/lib/resolve-project-context', () => ({ resolveProjectContext: async () => ({ orgId: 'f', clientId: 'c', projectId: 'p' }) }))
vi.mock('@/lib/permission-helpers', () => ({ canViewProject: async () => true }))
vi.mock('@/lib/file-utils', () => ({ getProjectDocumentContext: async () => ({ id: 'd1', externalId: 'ext1' }) }))
vi.mock('@/lib/engagement-access', () => ({
    requireEngagementMember: async () => db.member,
    visibleDocumentIdsFor: async () => db.visible,
    isExternalEngagementRole: (r: string) => r === 'eng_ext_collaborator' || r === 'eng_viewer',
}))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        docCommentMessage: { groupBy: async () => db.groups },
        engagementDocument: { findMany: async () => db.docs },
        docCommentThread: {
            findMany: async () => db.resolved,
            upsert: async (args: any) => { db.upserts.push({ model: 'thread', args }) },
        },
        docCommentRead: { upsert: async (args: any) => { db.upserts.push({ model: 'read', args }) } },
    },
}))

import { countOpenDiscussions } from './discussions'
import { POST as resolve, DELETE as reopen } from '@/app/api/projects/[projectId]/documents/[documentId]/doc-comments/resolve/route'
import { POST as markRead } from '@/app/api/projects/[projectId]/documents/[documentId]/doc-comments/read/route'

const params = { params: Promise.resolve({ projectId: 'p', documentId: 'd1' }) }

beforeEach(() => {
    who.user = { id: 'me' }
    db.groups = [{ projectDocumentId: 'd1' }, { projectDocumentId: 'd2' }, { projectDocumentId: 'd3' }]
    db.docs = [{ id: 'd1', externalId: 'ext1' }, { id: 'd2', externalId: 'ext2' }, { id: 'd3', externalId: 'ext3' }]
    db.resolved = [{ projectDocumentId: 'd3' }]
    db.upserts = []
    db.member = { role: 'eng_admin' }
    db.visible = null
})

describe('countOpenDiscussions', () => {
    it('counts discussions that aren’t resolved', async () => {
        expect(await countOpenDiscussions('p', 'eng_admin')).toBe(2)
    })

    it('counts only what an external member may open', async () => {
        db.visible = new Set(['ext2'])
        expect(await countOpenDiscussions('p', 'eng_ext_collaborator')).toBe(1)
    })
})

describe('resolve and read endpoints', () => {
    it('resolves a discussion as the caller, and reopens it', async () => {
        expect((await resolve({} as any, params)).status).toBe(200)
        expect(db.upserts[0].args.update).toMatchObject({ resolvedBy: 'me' })
        expect(db.upserts[0].args.update.resolvedAt).toBeInstanceOf(Date)
        await reopen({} as any, params)
        expect(db.upserts[1].args.update).toEqual({ resolvedAt: null, resolvedBy: null })
    })

    it('marks a discussion read for the caller', async () => {
        await markRead({} as any, params)
        expect(db.upserts[0]).toMatchObject({ model: 'read', args: { where: { userId_projectDocumentId: { userId: 'me', projectDocumentId: 'd1' } } } })
    })

    it('keeps out someone who isn’t on the engagement, or an external member the document isn’t shared with', async () => {
        db.member = null
        expect((await resolve({} as any, params)).status).toBe(404)
        db.member = { role: 'eng_viewer' }
        db.visible = new Set(['other'])
        expect((await markRead({} as any, params)).status).toBe(404)
        expect(db.upserts).toEqual([])
    })
})
