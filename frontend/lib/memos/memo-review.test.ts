import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * A memo reviewed in one place (.claude/plans/raid-actions-memo-minutes.md): what happens after a memo is
 * added. Storage, the model, the RAID pass and the minutes are stubbed; nothing reaches Drive, OneDrive or
 * Anthropic.
 */

const MEMO_ID = '11111111-1111-4111-8111-111111111111'
const TEXT = '# Call with Dana\n\nDana: I’ll send the figures by Friday.'
const MINUTES = {
    subject: 'Minutes · Tax prep · Nov 14, 2026',
    attendees: ['Dana Whitfield'],
    summary: 'Dana is sending the figures.',
    discussed: ['Figures'],
    decisions: [],
    openQuestions: [],
    nextMeeting: null,
}

const h = vi.hoisted(() => {
    class LimitError extends Error {}
    return {
        LimitError,
        configured: true,
        firmSettings: {} as Record<string, unknown>,
        read: vi.fn(),
        write: vi.fn(async () => true),
        raid: vi.fn(),
        minutes: vi.fn(),
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
    loadNotesDeliverables: async () => [],
}))
vi.mock('@/lib/raid/raid-check', () => ({ runMemoRaidCheck: h.raid }))
vi.mock('./memo-minutes', () => ({
    writeMemoMinutes: h.minutes,
    // Sealed as the app seals it: never the words in the clear.
    sealMinutes: (m: { subject: string }) => `sealed:${m.subject.length}`,
}))
vi.mock('@/lib/memos/memo-store', () => ({ readMemoText: h.read, writeMemoReview: h.write }))
vi.mock('./memo-store', () => ({ readMemoText: h.read, writeMemoReview: h.write }))
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
    h.raid.mockReset().mockResolvedValue({ ok: true, suggested: 2, dropped: 0, skipped: [{ quote: 'Dana: I’ll send the figures by Friday.', reason: 'an example' }] })
    h.minutes.mockReset().mockResolvedValue({ ok: true, minutes: MINUTES })
})

describe('reviewMemoOnAdd', () => {
    it('reads the memo for its RAID suggestions and its minutes, both charged to the firm with no person', async () => {
        expect(await review()).toEqual({ status: 'reviewed', minutes: true, raidSuggested: 2 })
        expect(h.raid).toHaveBeenCalledWith(expect.objectContaining({
            engagementId: 'p1', firmId: 'f1', userId: null, now: NOW,
            memo: { id: MEMO_ID, title: 'Call with Dana', date: '2026-11-14', text: TEXT },
        }))
        expect(h.minutes).toHaveBeenCalledWith(expect.objectContaining({ engagementId: 'p1', firmId: 'f1', userId: null }))
        expect(h.read).toHaveBeenCalledTimes(1)
    })

    it("stores the review with the minutes sealed and the skipped lines as anchors, never the memo's words", async () => {
        await review()
        const [, memoId, stored] = h.write.mock.calls[0] as unknown as [string, string, Record<string, unknown>]
        expect(memoId).toBe(MEMO_ID)
        expect(stored).toMatchObject({ by: 'auto', dismissed: false, at: NOW.toISOString(), proposals: [], minutes: expect.stringMatching(/^sealed:/) })
        expect(JSON.stringify(stored)).not.toContain('figures by Friday')
        expect(JSON.stringify(stored)).not.toContain('Dana is sending')
    })

    it('keeps the minutes when the RAID pass fails, and the RAID suggestions when the minutes fail', async () => {
        h.raid.mockRejectedValue(new Error('socket hang up'))
        expect(await review()).toEqual({ status: 'reviewed', minutes: true, raidSuggested: 0 })
        h.raid.mockResolvedValue({ ok: true, suggested: 2, dropped: 0, skipped: [] })
        h.minutes.mockRejectedValue(new Error('socket hang up'))
        expect(await review()).toEqual({ status: 'reviewed', minutes: false, raidSuggested: 2 })
        expect(h.write).toHaveBeenCalledTimes(2)
    })

    it('does nothing when the firm turned it off', async () => {
        h.firmSettings = { brio: { memoReview: false } }
        expect(await review()).toEqual({ status: 'off' })
        expect(h.read).not.toHaveBeenCalled()
        expect(h.raid).not.toHaveBeenCalled()
        expect(h.minutes).not.toHaveBeenCalled()
    })

    it('over the credit allowance, stops quietly: nothing stored, each call refused by its own gate', async () => {
        h.raid.mockRejectedValue(new h.LimitError('Your group has used its AI credits for this period.'))
        h.minutes.mockRejectedValue(new h.LimitError('Your group has used its AI credits for this period.'))
        expect(await review()).toEqual({ status: 'over_limit' })
        expect(h.write).not.toHaveBeenCalled()
    })

    it('saves the RAID suggestions before the review lands, so the pane that reloads on it shows both', async () => {
        const order: string[] = []
        h.raid.mockImplementation(async () => { order.push('raid'); return { ok: true, suggested: 1, dropped: 0, skipped: [] } })
        h.write.mockImplementation(async () => { order.push('review'); return true })
        await review()
        expect(order).toEqual(['raid', 'review'])
    })

    it("never throws: a memo it couldn't read is left as it was", async () => {
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
                fileName: '2026-11-14-Call-with-Dana.md', agent: 'Brio', trigger: 'added', minutes: true, raidSuggested: 2,
                summary: 'Minutes · 2 RAID suggestions · when it was added',
            }),
        })])
        expect(JSON.stringify(h.audits)).not.toContain('figures')
    })

    it('a read that came back with nothing usable is still recorded; one that never happened is not', async () => {
        h.raid.mockResolvedValue({ ok: false, reason: 'no_answer' })
        h.minutes.mockResolvedValue({ ok: false, reason: 'no_answer' })
        expect(await review()).toEqual({ status: 'no_answer' })
        expect(h.audits).toEqual([expect.objectContaining({ meta: expect.objectContaining({ minutes: false, summary: 'nothing usable came back · when it was added' }) })])
        h.audits.length = 0
        h.firmSettings = { brio: { memoReview: false } }
        await review()
        h.raid.mockRejectedValue(new h.LimitError('Your group has used its AI credits for this period.'))
        h.minutes.mockRejectedValue(new h.LimitError('Your group has used its AI credits for this period.'))
        h.firmSettings = {}
        await review()
        expect(h.audits).toEqual([])
    })

    it('an edit asked for it: read even when the firm turned automatic reading off, and recorded as after an edit', async () => {
        h.firmSettings = { brio: { memoReview: false } }
        expect(await review({ requested: true, trigger: 'edited' })).toEqual({ status: 'reviewed', minutes: true, raidSuggested: 2 })
        expect(h.audits[0]).toEqual(expect.objectContaining({ meta: expect.objectContaining({ trigger: 'edited', summary: 'Minutes · 2 RAID suggestions · after its notes were edited' }) }))
    })

    it('can only suggest: it has no way to add a reminder, move a due date or accept a RAID entry', () => {
        // Pinned on the module itself: what it may call is what it imports.
        const source = readFileSync(path.join(__dirname, 'memo-review.ts'), 'utf-8')
        const imports = source.split('\n').filter((l) => l.startsWith('import ')).join('\n')
        expect(imports).not.toMatch(/user-reminders|createManualReminder|due-date|useDueDateSave|saveDue|raid-store|raid\/\[itemId\]/)
        expect(source).not.toMatch(/status:\s*'OPEN'|action:\s*'accept'/)
    })
})
