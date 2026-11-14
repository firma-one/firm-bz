import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Whether Brio has read the RAID log's conversation as it is now: a fingerprint of what people did in
 * threads and memos, never of the clock (the rule the Overview's Summary fingerprint follows).
 */

const h = vi.hoisted(() => ({
    groupBy: vi.fn(),
    docs: [] as Array<{ id: string; metadata: unknown }>,
    memos: [] as Array<{ id: string; createdAt: string }>,
}))

vi.mock('@/lib/prisma', () => ({
    prisma: {
        docCommentMessage: { groupBy: h.groupBy },
        engagementDocument: { findMany: async () => h.docs },
    },
}))
vi.mock('@/lib/memos/memo-store', () => ({ listMemos: async () => h.memos }))

import { conversationStateOf, fingerprintConversation, loadConversationStamps, type ConversationStamps } from './raid-fingerprint'

const STAMPS: ConversationStamps = {
    threads: [
        { documentId: 'doc-9', count: 2, latestAt: '2026-11-11T16:00:00.000Z' },
        { documentId: 'doc-14', count: 1, latestAt: '2026-11-07T10:00:00.000Z' },
    ],
    memos: [{ id: 'memo-1', changedAt: '2026-11-12T07:30:00.000Z' }],
}

describe('fingerprintConversation', () => {
    it('is the same however the rows come back, and none for no conversation', () => {
        const fp = fingerprintConversation(STAMPS)
        expect(fp).toMatch(/^[0-9a-f]{32}$/)
        expect(fingerprintConversation({ threads: [...STAMPS.threads].reverse(), memos: STAMPS.memos })).toBe(fp)
        expect(fingerprintConversation({ threads: [], memos: [] })).toBeNull()
    })

    it('moves with a new message, a deleted one, and a memo made or changed', () => {
        const fp = fingerprintConversation(STAMPS)
        const [doc9, doc14] = STAMPS.threads
        expect(fingerprintConversation({ ...STAMPS, threads: [{ ...doc9, count: 3, latestAt: '2026-11-12T09:00:00.000Z' }, doc14] })).not.toBe(fp)
        expect(fingerprintConversation({ ...STAMPS, threads: [{ ...doc9, count: 1 }, doc14] })).not.toBe(fp)
        expect(fingerprintConversation({ ...STAMPS, memos: [{ id: 'memo-1', changedAt: '2026-11-12T10:00:00.000Z' }] })).not.toBe(fp)
        expect(fingerprintConversation({ ...STAMPS, memos: [...STAMPS.memos, { id: 'memo-2', changedAt: '2026-11-12T11:00:00.000Z' }] })).not.toBe(fp)
    })
})

describe('conversationStateOf', () => {
    const settings = (raid: Record<string, unknown>) => ({ raid })

    it('is up to date when the conversation matches the last check, out of date when it moved on', () => {
        const fp = fingerprintConversation(STAMPS)
        expect(conversationStateOf(STAMPS, settings({ lastCheckedAt: '2026-11-12T08:02:00.000Z', fingerprint: fp }))).toBe('current')
        expect(conversationStateOf(STAMPS, settings({ lastCheckedAt: '2026-11-12T08:02:00.000Z', fingerprint: 'an-older-one' }))).toBe('changed')
    })

    it('is out of date before the first check, and says nothing when there is nothing to read', () => {
        expect(conversationStateOf(STAMPS, {})).toBe('changed')
        expect(conversationStateOf({ threads: [], memos: [] }, {})).toBe('none')
    })

    it('compares by time for a log checked before fingerprints were kept', () => {
        expect(conversationStateOf(STAMPS, settings({ lastCheckedAt: '2026-11-12T08:02:00.000Z' }))).toBe('current')
        expect(conversationStateOf(STAMPS, settings({ lastCheckedAt: '2026-11-12T07:00:00.000Z' }))).toBe('changed')
    })
})

describe('loadConversationStamps', () => {
    beforeEach(() => {
        h.groupBy.mockReset().mockResolvedValue([
            { projectDocumentId: 'doc-9', _count: { _all: 2 }, _max: { createdAt: new Date('2026-11-11T16:00:00Z') } },
        ])
        h.memos = [
            { id: 'memo-1', createdAt: '2026-11-10T09:00:00.000Z' },
            { id: 'memo-2', createdAt: '2026-11-12T09:00:00.000Z' },
        ]
        h.docs = [{ id: 'memo-1', metadata: { modifiedTime: '2026-11-11T12:00:00.000Z' } }]
    })

    it('reads each threaded document, and no memo: a memo is read when added, not by the check (§13)', async () => {
        expect(await loadConversationStamps('p1')).toEqual({
            threads: [{ documentId: 'doc-9', count: 2, latestAt: '2026-11-11T16:00:00.000Z' }],
            memos: [],
        })
        expect(h.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { engagementId: 'p1' } }))
    })

    it('up to a check, leaves out what came after it', async () => {
        const until = new Date('2026-11-12T08:02:00Z')
        await loadConversationStamps('p1', until)
        expect(h.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { engagementId: 'p1', createdAt: { lte: until } } }))
    })
})
