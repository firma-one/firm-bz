import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The boundary of Brio for Reviewers: what a Reviewer or Limited Access contributor's Brio may know.
 * Every fixture below holds something that must NOT reach the model — an internal note, a private
 * document, a deliverable still in progress, a draft summary, the internal memo — and each test
 * proves it doesn't. If one of these fails, a client-side person could ask Brio about the firm's
 * internal work.
 */

const { db, visible } = vi.hoisted(() => ({
    db: {
        engagement: null as unknown,
        folders: [] as unknown[],
        messages: [] as unknown[],
        staff: [] as unknown[],
        resolved: [] as unknown[],
    },
    visible: { set: new Set<string>() },
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagement: { findFirst: async () => db.engagement },
        engagementDocument: { findMany: async () => db.folders },
        docCommentMessage: { findMany: async () => db.messages },
        engagementMember: { findMany: async () => db.staff },
        docCommentThread: { findMany: async () => db.resolved },
    },
}))
vi.mock('@/lib/engagement-access', () => ({ visibleDocumentIdsFor: async () => visible.set }))

import { loadReviewerView, buildReviewerContext } from './reviewer-context'

const now = new Date('2026-11-12T12:00:00Z')
const folder = (id: string, name: string, stage: string, over: Record<string, unknown> = {}) => ({
    id, externalId: `x-${id}`, fileName: name, docId: id.toUpperCase(), dueDate: null,
    settings: { share: { createdAt: '2026-10-01' }, activity: { status: stage, updatedAt: '2026-11-06T00:00:00Z' } },
    ...over,
})
const msg = (doc: string, author: string, at: string, over: Record<string, unknown> = {}) => ({
    projectDocumentId: doc, authorUserId: author, createdAt: new Date(at), isInternal: false,
    projectDocument: { externalId: `x-${doc}`, fileName: `File ${doc}`, docId: doc.toUpperCase(), dueDate: null },
    ...over,
})

beforeEach(() => {
    db.engagement = {
        name: 'Q4 Growth Strategy',
        settings: {
            internalMemo: 'MEMO-SECRET: margin is thin',
            insightsSummary: {
                text: 'Published summary text.', publishedAt: '2026-11-10',
                draft: { text: 'DRAFT-SECRET pending review', status: 'pending_review' },
            },
        },
    }
    db.folders = [
        folder('qsr-9', 'Intel Report', 'in_review'),
        folder('qsr-12', 'Pricing WIP', 'in_progress'),
        folder('qsr-3', 'Market Sizing', 'approved'),
        folder('qsr-99', 'Private Deliverable', 'in_review'), // not in the visible set
        { ...folder('loose', 'Not a deliverable', 'in_review'), settings: { activity: { status: 'in_review' } } },
    ]
    db.staff = [{ userId: 'lead' }]
    db.resolved = []
    db.messages = [
        msg('qsr-9', 'lead', '2026-11-11T00:00:00Z', { isInternal: true, content: 'INTERNAL-SECRET' }),
        msg('qsr-9', 'lead', '2026-11-10T00:00:00Z'),
        msg('qsr-3', 'dana', '2026-11-09T00:00:00Z'), // the client wrote last: not waiting on them
        msg('qsr-99', 'lead', '2026-11-08T00:00:00Z'), // on a document they can't see
    ]
    visible.set = new Set(['x-qsr-9', 'x-qsr-12', 'x-qsr-3', 'x-loose'])
})

describe('loadReviewerView', () => {
    it('a Reviewer sees in-review and approved deliverables only, never one in progress', async () => {
        const view = (await loadReviewerView('e1', 'eng_viewer'))!
        expect(view.deliverables.map((d) => d.name).sort()).toEqual(['Intel Report', 'Market Sizing'])
    })

    it('a Limited Access contributor also sees work in progress, as the Board shows them', async () => {
        const view = (await loadReviewerView('e1', 'eng_ext_collaborator'))!
        expect(view.deliverables.map((d) => d.name)).toContain('Pricing WIP')
    })

    it('never includes a document outside what the person can see', async () => {
        const view = (await loadReviewerView('e1', 'eng_viewer'))!
        const text = buildReviewerContext(view, now)
        expect(text).not.toContain('Private Deliverable')
        expect(view.waiting.some((w) => w.documentId === 'qsr-99')).toBe(false)
    })

    it('a discussion waits on them when the firm wrote last; internal notes never count or appear', async () => {
        const view = (await loadReviewerView('e1', 'eng_viewer'))!
        const replies = view.waiting.filter((w) => w.kind === 'reply')
        expect(replies.map((r) => r.documentId)).toEqual(['qsr-9'])
        // The visible reply is the client-visible one, not the internal note posted after it.
        expect(replies[0].since).toBe('2026-11-10T00:00:00.000Z')
        expect(JSON.stringify(view)).not.toContain('INTERNAL-SECRET')
    })

    it('a resolved discussion is not waiting on anyone', async () => {
        db.resolved = [{ projectDocumentId: 'qsr-9' }]
        const view = (await loadReviewerView('e1', 'eng_viewer'))!
        expect(view.waiting.filter((w) => w.kind === 'reply')).toEqual([])
    })

    it('carries the published summary, never the draft or the internal memo', async () => {
        const text = buildReviewerContext((await loadReviewerView('e1', 'eng_viewer'))!, now)
        expect(text).toContain('Published summary text.')
        expect(text).not.toContain('DRAFT-SECRET')
        expect(text).not.toContain('MEMO-SECRET')
    })

    it('says no summary is published rather than reaching for the draft', async () => {
        db.engagement = { name: 'E', settings: { insightsSummary: { text: 'DRAFT-ONLY', publishedAt: null } } }
        const text = buildReviewerContext((await loadReviewerView('e1', 'eng_viewer'))!, now)
        expect(text).toContain('(none published)')
        expect(text).not.toContain('DRAFT-ONLY')
    })

    it('a deliverable in review is waiting on them', async () => {
        const view = (await loadReviewerView('e1', 'eng_viewer'))!
        expect(view.waiting.find((w) => w.kind === 'review')?.name).toBe('Intel Report')
    })
})
