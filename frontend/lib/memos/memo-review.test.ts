import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * A memo reviewed in one place (.claude/plans/brio-features-round-2.md, §13): what happens after a memo is
 * added. Storage, the model and the RAID pass are stubbed; nothing reaches Drive, OneDrive or Anthropic.
 */

const MEMO_ID = '11111111-1111-4111-8111-111111111111'
const TEXT = '# Call with Dana\n\nDana: I’ll send the figures by Friday.'

const h = vi.hoisted(() => {
    class LimitError extends Error {}
    return {
        LimitError,
        configured: true,
        firmSettings: {} as Record<string, unknown>,
        read: vi.fn(),
        write: vi.fn(async () => true),
        find: vi.fn(),
        raid: vi.fn(),
        audits: [] as Array<Record<string, unknown>>,
    }
})

// Masking has its own tests (lib/ai/pseudonymize, masked-client, known-entities): no vault here.
vi.mock('@/lib/ai/known-entities', () => ({ vaultForEngagement: async () => null, vaultForFirms: async () => null }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: { firm: { findUnique: async () => ({ settings: h.firmSettings }) } } }))
vi.mock('@/lib/ai/client', () => ({ isAiConfigured: () => h.configured }))
vi.mock('@/lib/ai/guarded-client', () => ({ AiCreditLimitError: h.LimitError }))
vi.mock('@/lib/ai/notes-proposals', () => ({
    MAX_MEMO_CHARS: 100_000,
    findNotesActions: h.find,
    loadNotesDeliverables: async () => [],
    resolveToday: () => '2026-11-14',
}))
vi.mock('@/lib/raid/raid-check', () => ({ runMemoRaidCheck: h.raid }))
vi.mock('@/lib/memos/memo-store', () => ({ readMemoText: h.read, writeMemoReview: h.write }))
vi.mock('@/lib/navigation/firm-paths', () => ({ engagementPath: () => '/e' }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/audit', () => ({
    audit: (event: string) => {
        const entry: Record<string, unknown> = { event }
        h.audits.push(entry)
        const builder: Record<string, unknown> = new Proxy({}, {
            get: (_t, key: string) => (key === 'fireAndForget' ? () => {} : (value: unknown) => { entry[key] = value; return builder }),
        })
        return builder
    },
    AUDIT_EVENT: { DOCUMENT_AI_REVIEWED: 'DOCUMENT_AI_REVIEWED' },
    AUDIT_SCOPE: { DOCUMENT: 'DOCUMENT' },
}))

import { reviewMemoOnAdd } from './memo-review'

const NOW = new Date('2026-11-14T10:00:00Z')
const review = (more: Partial<Parameters<typeof reviewMemoOnAdd>[0]> = {}) =>
    reviewMemoOnAdd({ engagementId: 'p1', firmId: 'f1', clientId: 'c1', actorUserId: 'u1', memoId: MEMO_ID, now: NOW, ...more })

beforeEach(() => {
    h.configured = true
    h.firmSettings = {}
    h.read.mockReset().mockResolvedValue({ ok: true, text: TEXT, memo: { id: MEMO_ID, title: 'Call with Dana', date: '2026-11-14', fileName: '2026-11-14-Call-with-Dana.md' } })
    h.audits.length = 0
    h.write.mockClear()
    h.find.mockReset().mockResolvedValue({
        ok: true,
        proposals: [{ kind: 'reminder', id: 'reminder-1', title: 'Check the figures arrived', date: '2026-11-20', quote: "I'll send the figures by Friday." }],
        skipped: [],
        dropped: 0,
    })
    h.raid.mockReset().mockResolvedValue({ ok: true, suggested: 1, dropped: 0 })
})

describe('reviewMemoOnAdd', () => {
    it('identifies the action items, charged to the firm with no person, and stores them without the memo\'s words', async () => {
        expect(await review()).toEqual({ status: 'reviewed', actionItems: 1, raidSuggested: 1 })
        expect(h.find).toHaveBeenCalledWith(expect.objectContaining({ notes: TEXT, scope: { firmId: 'f1', userId: null, feature: 'notesProposals' } }))
        const [, memoId, stored] = h.write.mock.calls[0] as unknown as [string, string, Record<string, unknown>]
        expect(memoId).toBe(MEMO_ID)
        expect(stored).toMatchObject({ by: 'auto', dismissed: false, at: NOW.toISOString() })
        expect(JSON.stringify(stored)).not.toContain('figures by Friday')
    })

    it('then suggests the memo\'s RAID entries from the same read', async () => {
        await review()
        expect(h.raid).toHaveBeenCalledWith({ engagementId: 'p1', firmId: 'f1', memo: { id: MEMO_ID, title: 'Call with Dana', date: '2026-11-14', text: TEXT }, now: NOW })
        expect(h.read).toHaveBeenCalledTimes(1)
    })

    it('keeps the action items when the RAID pass fails', async () => {
        h.raid.mockRejectedValue(new Error('socket hang up'))
        expect(await review()).toEqual({ status: 'reviewed', actionItems: 1, raidSuggested: 0 })
        expect(h.write).toHaveBeenCalledTimes(1)
    })

    it('does nothing when the firm turned it off', async () => {
        h.firmSettings = { brio: { memoReview: false } }
        expect(await review()).toEqual({ status: 'off' })
        expect(h.read).not.toHaveBeenCalled()
        expect(h.find).not.toHaveBeenCalled()
    })

    it('over the credit allowance, stops quietly: nothing stored, no RAID pass', async () => {
        h.find.mockRejectedValue(new h.LimitError('Your group has used its AI credits for this period.'))
        expect(await review()).toEqual({ status: 'over_limit' })
        expect(h.write).not.toHaveBeenCalled()
        expect(h.raid).not.toHaveBeenCalled()
    })

    it('never throws: a memo it couldn\'t read is left as it was', async () => {
        h.read.mockResolvedValue({ ok: false, status: 502, error: 'OneDrive is unreachable.' })
        expect(await review()).toEqual({ status: 'unread' })
        h.read.mockRejectedValue(new Error('boom'))
        expect(await review()).toEqual({ status: 'failed' })
        expect(h.write).not.toHaveBeenCalled()
    })

    it('the audit trail says Brio read the memo: who added it, and what it found, never the words', async () => {
        await review()
        expect(h.audits).toEqual([expect.objectContaining({
            event: 'DOCUMENT_AI_REVIEWED',
            document: MEMO_ID,
            actor: 'u1',
            client: 'c1',
            meta: expect.objectContaining({
                fileName: '2026-11-14-Call-with-Dana.md', agent: 'Brio', trigger: 'added', actionItems: 1, raidSuggested: 1,
                summary: '1 action item · 1 RAID suggestion · when it was added',
            }),
        })])
        expect(JSON.stringify(h.audits)).not.toContain('figures')
    })

    it('a read that came back with nothing usable is still recorded; one that never happened is not', async () => {
        h.find.mockResolvedValue({ ok: false, reason: 'no_answer' })
        expect(await review()).toEqual({ status: 'no_answer' })
        expect(h.audits).toEqual([expect.objectContaining({ meta: expect.objectContaining({ actionItems: null, summary: 'nothing usable came back · when it was added' }) })])
        h.audits.length = 0
        h.firmSettings = { brio: { memoReview: false } }
        await review()
        h.find.mockRejectedValue(new h.LimitError('Your group has used its AI credits for this period.'))
        h.firmSettings = {}
        await review()
        expect(h.audits).toEqual([])
    })

    it('an edit asked for it: read even when the firm turned automatic reading off, and recorded as after an edit', async () => {
        h.firmSettings = { brio: { memoReview: false } }
        expect(await review({ requested: true, trigger: 'edited' })).toEqual({ status: 'reviewed', actionItems: 1, raidSuggested: 1 })
        expect(h.audits[0]).toEqual(expect.objectContaining({ meta: expect.objectContaining({ trigger: 'edited', summary: '1 action item · 1 RAID suggestion · after its notes were edited' }) }))
    })

    it('can only suggest: it has no way to add a reminder, move a due date or accept a RAID entry', () => {
        // Pinned on the module itself: what it may call is what it imports.
        const source = readFileSync(path.join(__dirname, 'memo-review.ts'), 'utf-8')
        const imports = source.split('\n').filter((l) => l.startsWith('import ')).join('\n')
        expect(imports).not.toMatch(/user-reminders|createManualReminder|due-date|useDueDateSave|saveDue|raid-store|raid\/\[itemId\]/)
        expect(source).not.toMatch(/status:\s*'OPEN'|action:\s*'accept'/)
    })
})
