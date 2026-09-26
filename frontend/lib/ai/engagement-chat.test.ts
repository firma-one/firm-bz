import { describe, it, expect } from 'vitest'
import { buildEngagementContext } from './engagement-chat'
import type { EngagementInsightsResponse } from '@/lib/insights/engagement-insights'

/**
 * The context builder is the boundary that enforces the product's central AI promise: Brio reads
 * delivery data, never the contents of a client's documents or the text of their comments.
 *
 * Two things rest on this. The landing page and FAQ both state it outright, and it is the
 * prompt-injection boundary — a client can write anything in a comment, and none of it should
 * reach a model that also sees engagement data.
 *
 * Planted strings rather than assertions about shape: if a future field quietly carries content
 * through, a structural test would pass and this one fails.
 */
const SECRET_DOC_BODY = 'ZZTOPSECRET-document-body-must-never-reach-the-model'
const SECRET_COMMENT = 'ZZTOPSECRET-comment-body-must-never-reach-the-model'

const data = {
    kickoffDate: '2026-10-01',
    engagementDueDate: '2026-12-31',
    deliverables: [{
        documentId: 'd1', docId: 'QSR-9', name: 'Market Report',
        stage: 'in_review', dueDate: '2026-10-16',
        // Fields a future refactor might plausibly add to this payload.
        content: SECRET_DOC_BODY,
        snippet: SECRET_DOC_BODY,
    }],
    commentThreads: {
        answered: 1, unanswered: 1, total: 2, flaggedOpen: 0,
        documents: [{
            documentId: 'd1', docId: 'QSR-9', documentName: 'Market Report',
            messageCount: 3, awaitingReply: true, followUpReasons: ['urgent'],
        }],
    },
    unansweredThreads: [{
        documentId: 'd1',
        documentName: 'Market Report',
        lastMessagePreview: SECRET_COMMENT,
        lastMessageAt: '2026-09-20T00:00:00Z',
        messageCount: 3,
    }],
} as unknown as EngagementInsightsResponse

describe('buildEngagementContext — client data boundary', () => {
    const context = buildEngagementContext(data, { clientName: 'Acme', engagementName: 'Q4 GTM' })

    it('never includes a document body', () => {
        expect(context).not.toContain(SECRET_DOC_BODY)
    })

    it('never includes a comment body, even the stored preview', () => {
        // unansweredThreads carries lastMessagePreview for other surfaces; it must not leak here.
        expect(context).not.toContain(SECRET_COMMENT)
    })

    it('still passes the delivery data the assistant needs', () => {
        expect(context).toContain('Market Report')
        expect(context).toContain('QSR-9')
        expect(context).toContain('Q4 GTM')
    })

    it('reports comment activity as counts and document names only', () => {
        expect(context).toMatch(/Comment threads: 2 total, 1 awaiting/)
        expect(context).toContain('awaiting firm reply')
    })
})
