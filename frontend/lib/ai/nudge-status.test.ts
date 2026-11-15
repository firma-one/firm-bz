import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * What became of a deliverable's nudges: the last reminder comment to one of its Reviewers, whether
 * they commented after it, and whether they ticked it off. The database is mocked.
 */

const h = vi.hoisted(() => ({
    messages: [] as Array<Record<string, unknown>>,
    done: [] as Array<Record<string, unknown>>,
    doneFails: false,
    upsert: vi.fn(async () => ({})),
    findUnique: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        docCommentMessage: { findMany: async () => h.messages, findUnique: h.findUnique },
        docCommentReminderDone: {
            findMany: async () => { if (h.doneFails) throw new Error('relation does not exist'); return h.done },
            upsert: h.upsert,
        },
    },
}))
vi.mock('./status-update', () => ({
    clientSideRecipients: async () => [
        { userId: 'dana', name: 'Dana Whitfield', role: 'Reviewer' },
        { userId: 'sam', name: 'Sam Ortiz', role: 'Contributor · Limited Access' },
    ],
}))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))

import { loadNudgeStatuses, recordCommentReminderDone } from './nudge-status'

const at = (iso: string) => new Date(iso)
const nudge = (id: string, doc: string, recipientId: string, when: string) => ({
    id, projectDocumentId: doc, authorUserId: 'lead', createdAt: at(when), settings: { reminder: { recipientId } },
})
const comment = (id: string, doc: string, author: string, when: string) => ({
    id, projectDocumentId: doc, authorUserId: author, createdAt: at(when), settings: {},
})

beforeEach(() => {
    h.messages = []
    h.done = []
    h.doneFails = false
    h.upsert.mockClear()
    h.findUnique.mockReset()
})

describe('loadNudgeStatuses', () => {
    it("reads each deliverable's last nudge to a Reviewer, and leaves out the ones never nudged", async () => {
        h.messages = [
            nudge('m1', 'd1', 'dana', '2026-11-10T09:00:00Z'),
            comment('m2', 'd1', 'lead', '2026-11-11T09:00:00Z'),
            nudge('m3', 'd1', 'sam', '2026-11-12T09:00:00Z'),
            // A reminder to a Lead is not a nudge.
            nudge('m4', 'd2', 'other-lead', '2026-11-12T09:00:00Z'),
        ]
        expect(await loadNudgeStatuses('e1', ['d1', 'd2'])).toEqual([{
            deliverableId: 'd1', nudgedAt: '2026-11-12T09:00:00.000Z', recipientId: 'sam', recipientName: 'Sam Ortiz', repliedAt: null, doneAt: null,
        }])
    })

    it('sees a reply from the person nudged, after the nudge only', async () => {
        h.messages = [
            comment('m0', 'd1', 'dana', '2026-11-09T09:00:00Z'),
            nudge('m1', 'd1', 'dana', '2026-11-10T09:00:00Z'),
            comment('m2', 'd1', 'dana', '2026-11-11T15:00:00Z'),
        ]
        const [s] = await loadNudgeStatuses('e1', ['d1'])
        expect(s.repliedAt).toBe('2026-11-11T15:00:00.000Z')
    })

    it('sees the nudge ticked off, and still answers when that record cannot be read', async () => {
        h.messages = [nudge('m1', 'd1', 'dana', '2026-11-10T09:00:00Z')]
        h.done = [{ messageId: 'm1', userId: 'dana', doneAt: at('2026-11-11T08:00:00Z') }]
        expect((await loadNudgeStatuses('e1', ['d1']))[0].doneAt).toBe('2026-11-11T08:00:00.000Z')

        h.doneFails = true
        expect((await loadNudgeStatuses('e1', ['d1']))[0]).toMatchObject({ nudgedAt: '2026-11-10T09:00:00.000Z', doneAt: null })
    })
})

describe('recordCommentReminderDone', () => {
    it("records who ticked off a comment's reminder, on the comment's engagement", async () => {
        h.findUnique.mockResolvedValue({ engagementId: 'e1' })
        await recordCommentReminderDone('dana', 'm1')
        expect(h.upsert).toHaveBeenCalledWith({
            where: { messageId_userId: { messageId: 'm1', userId: 'dana' } },
            create: { messageId: 'm1', userId: 'dana', engagementId: 'e1' },
            update: {},
        })
    })

    it('records nothing when the comment is gone', async () => {
        h.findUnique.mockResolvedValue(null)
        await recordCommentReminderDone('dana', 'm1')
        expect(h.upsert).not.toHaveBeenCalled()
    })
})
