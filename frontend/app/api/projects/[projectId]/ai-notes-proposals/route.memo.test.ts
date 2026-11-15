import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

/**
 * The sparkle on an internal memo: the route reads the memo's text from storage itself, and only a memo
 * of this engagement that sits in its memos folder, then has Brio read it for its minutes and RAID
 * suggestions (lib/memos/memo-review.ts readMemoWithBrio, stubbed here and tested on its own). Storage
 * and the model are stubbed: nothing here reaches Google Drive, OneDrive or Anthropic.
 */

const MEMO_ID = '11111111-1111-4111-8111-111111111111'
const FOREIGN_ID = '22222222-2222-4222-8222-222222222222'
const PLAIN_ID = '33333333-3333-4333-8333-333333333333'

type DocRow = { id: string; engagementId: string; externalId: string; parentId: string | null; connectorId: string | null; isFolder: boolean; status: string; settings: Record<string, unknown> }

const h = vi.hoisted(() => ({
    completed: false,
    canEdit: true,
    canViewInternal: true,
    text: '',
    docs: [] as DocRow[],
    create: vi.fn(),
    getRenderableContent: vi.fn(),
    recordAiUsage: vi.fn(async () => {}),
    update: vi.fn<(args: { where: { id: string }; data: { settings: Record<string, unknown> } }) => Promise<object>>(async () => ({})),
    audits: [] as Array<Record<string, unknown>>,
    readMemo: vi.fn(),
}))

vi.mock('@/lib/memos/memo-review', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/memos/memo-review')>()),
    readMemoWithBrio: h.readMemo,
}))

// Masking has its own tests (lib/ai/pseudonymize, masked-client, known-entities): no vault here.
vi.mock('@/lib/ai/known-entities', () => ({ vaultForEngagement: async () => null, vaultForFirms: async () => null }))
vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }),
}))
vi.mock('@/lib/resolve-project-context', () => ({ resolveProjectContext: async () => ({ firmId: 'f1', orgId: 'f1', clientId: 'c1', projectId: 'p1' }) }))
vi.mock('@/lib/permission-helpers', () => ({
    canEditProject: async () => h.canEdit,
    canViewProjectInternalTabs: async () => h.canViewInternal,
}))
vi.mock('@/lib/engagement-access', () => ({
    blockIfEngagementCompleted: async () => (h.completed
        ? NextResponse.json({ error: "This engagement is completed, so it's read only." }, { status: 403 })
        : null),
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
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
vi.mock('@/lib/ai/client', () => ({
    isAiConfigured: () => true,
    AI_MODEL: 'test-model',
    AI_EFFORT: { proposals: 'medium' },
    getAnthropic: () => ({ messages: { create: h.create } }),
}))
vi.mock('@/lib/ai/credit-cap', () => ({ assertWithinAiCreditCap: async () => {}, AiCreditLimitError: class extends Error {} }))
vi.mock('@/lib/ai/usage', () => ({ recordAiUsage: h.recordAiUsage }))
vi.mock('@/lib/connectors/registry', () => ({
    getContentAdapter: async () => ({ getRenderableContent: h.getRenderableContent }),
    getStorageAdapter: vi.fn(),
    getPermissionAdapter: vi.fn(),
}))

const matches = (row: DocRow, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => {
    if (k === 'status') return row.status !== (v as { not: string }).not
    return row[k as keyof DocRow] === v
})

vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagementDocument: {
            findMany: async () => [],
            findFirst: async ({ where }: { where: Record<string, unknown> }) => h.docs.find((d) => matches(d, where)) ?? null,
            findUnique: async ({ where }: { where: { id: string } }) => h.docs.find((d) => d.id === where.id) ?? null,
            update: h.update,
        },
        engagement: {
            findUnique: async () => ({
                name: '2025 Individual Return',
                slug: 'return-2025',
                client: { connectorId: 'conn-1', slug: 'dana', firm: { slug: 'northpoint', group: { slug: 'np' } } },
            }),
        },
        connector: { findUnique: async () => ({ type: 'GOOGLE_DRIVE' }) },
    },
}))

import { POST } from './route'

const MEMO_SETTINGS = {
    memo: {
        date: '2026-11-10', title: 'Weekly check-in', authorUserId: 'u1', authorFirstName: 'Alex', source: 'notes',
        applied: [{ kind: 'reminder', target: 'chase the brokerage 1099-b', date: '2026-11-16', quote: 'i need to chase the brokerage 1099-b, still missing', label: 'Reminder · Chase the brokerage 1099-B', at: '2026-11-11T10:00:00Z' }],
    },
    lock: { type: 'private' },
}

const post = (body: unknown) =>
    POST(
        new NextRequest('http://localhost/api/projects/p1/ai-notes-proposals', { method: 'POST', body: JSON.stringify(body) }),
        { params: Promise.resolve({ projectId: 'p1' }) },
    )

beforeEach(() => {
    h.completed = false
    h.canEdit = true
    h.canViewInternal = true
    h.text = '# Weekly check-in\n\n- I need to chase the brokerage 1099-B, still missing\n- They will send the K-1s next week'
    h.docs = [
        { id: 'folder-row', engagementId: 'p1', externalId: 'memos-folder', parentId: 'general', connectorId: 'conn-1', isFolder: true, status: 'PROCESSED', settings: { memoFolder: true, lock: { type: 'private' } } },
        { id: MEMO_ID, engagementId: 'p1', externalId: 'memo-file', parentId: 'memos-folder', connectorId: 'conn-1', isFolder: false, status: 'PROCESSED', settings: MEMO_SETTINGS },
        // Another engagement's memo, in its own memos folder.
        { id: 'folder-row-2', engagementId: 'p2', externalId: 'memos-folder-2', parentId: 'general-2', connectorId: 'conn-1', isFolder: true, status: 'PROCESSED', settings: { memoFolder: true } },
        { id: FOREIGN_ID, engagementId: 'p2', externalId: 'memo-file-2', parentId: 'memos-folder-2', connectorId: 'conn-1', isFolder: false, status: 'PROCESSED', settings: MEMO_SETTINGS },
        // An ordinary file of this engagement.
        { id: PLAIN_ID, engagementId: 'p1', externalId: 'contract', parentId: 'general', connectorId: 'conn-1', isFolder: false, status: 'PROCESSED', settings: {} },
    ]
    h.create.mockReset()
    h.create.mockResolvedValue({
        stop_reason: 'tool_use',
        usage: { input_tokens: 800, output_tokens: 200 },
        content: [{
            type: 'tool_use', id: 't1', name: 'record_actions',
            input: {
                reminders: [{ title: 'Chase the 1099-B', date: '2026-11-16', quote: 'I need to chase the brokerage 1099-B, still missing' }],
                dueDates: [], deliverables: [], skipped: [],
            },
        }],
    })
    h.getRenderableContent.mockReset()
    h.getRenderableContent.mockImplementation(async () => ({ stream: Buffer.from(h.text, 'utf-8'), mimeType: 'text/markdown', fileName: 'memo.md' }))
    h.recordAiUsage.mockClear()
    h.audits.length = 0
    h.readMemo.mockReset().mockResolvedValue({ status: 'reviewed', minutes: true, raidSuggested: 3 })
})

describe('The sparkle on an internal memo', () => {
    it('reads the memo from storage, not from the browser, and has Brio read it for minutes and RAID, the person\'s 2 credits', async () => {
        const res = await post({ memoDocumentId: MEMO_ID, today: '2026-11-12', notes: 'ignored when a memo is named' })
        expect(res.status).toBe(200)
        expect(h.getRenderableContent).toHaveBeenCalledWith('conn-1', 'memo-file', 'native')
        expect(h.readMemo).toHaveBeenCalledWith(expect.objectContaining({
            engagementId: 'p1',
            firmId: 'f1',
            userId: 'u1',
            by: 'person',
            memo: expect.objectContaining({ id: MEMO_ID, title: 'Weekly check-in', date: '2026-11-10', text: expect.stringContaining('I need to chase the brokerage 1099-B, still missing') }),
        }))
        expect(JSON.stringify(h.readMemo.mock.calls[0][0])).not.toContain('ignored when a memo is named')
        expect((await res.json()).data).toEqual({ memoRead: { minutes: true, raidSuggested: 3 } })
        // The action items' own call isn't made for a memo any more.
        expect(h.create).not.toHaveBeenCalled()

        // The audit trail says Brio read it, at this person's asking, and what it found: never the words.
        expect(h.audits).toEqual([expect.objectContaining({
            event: 'DOCUMENT_AI_REVIEWED', document: MEMO_ID, actor: 'u1', client: 'c1',
            meta: expect.objectContaining({ trigger: 'person', agent: 'Brio', summary: 'Minutes · 3 RAID suggestions · asked for' }),
        })])
        expect(JSON.stringify(h.audits)).not.toContain('brokerage')
    })

    it('says so when nothing usable came back, and still records the read', async () => {
        h.readMemo.mockResolvedValue({ status: 'no_answer' })
        const res = await post({ memoDocumentId: MEMO_ID })
        expect(res.status).toBe(502)
        expect(h.audits).toEqual([expect.objectContaining({ meta: expect.objectContaining({ summary: 'nothing usable came back · asked for' }) })])
    })

    it('404 for another engagement\'s memo, without reading it', async () => {
        const res = await post({ memoDocumentId: FOREIGN_ID })
        expect(res.status).toBe(404)
        expect((await res.json()).error).toMatch(/not found in this engagement/)
        expect(h.getRenderableContent).not.toHaveBeenCalled()
        expect(h.readMemo).not.toHaveBeenCalled()
    })

    it('404 for a file of this engagement that isn\'t a memo, without reading it', async () => {
        expect((await post({ memoDocumentId: PLAIN_ID })).status).toBe(404)
        expect((await post({ memoDocumentId: 'folder-row' })).status).toBe(404)
        expect(h.getRenderableContent).not.toHaveBeenCalled()
    })

    it('404 for a memo row outside the memos folder', async () => {
        h.docs[1] = { ...h.docs[1], parentId: 'general' }
        expect((await post({ memoDocumentId: MEMO_ID })).status).toBe(404)
        expect(h.getRenderableContent).not.toHaveBeenCalled()
    })

    it('reads memos up to 100,000 characters, past the typed memo\'s 12,000', async () => {
        h.text = `- I need to chase the brokerage 1099-B, still missing\n${'x'.repeat(60_000)}`
        expect((await post({ memoDocumentId: MEMO_ID })).status).toBe(200)

        h.text = 'y'.repeat(100_001)
        const res = await post({ memoDocumentId: MEMO_ID })
        expect(res.status).toBe(413)
        expect((await res.json()).error).toMatch(/too long for Brio to read at once/)
        expect(h.readMemo).toHaveBeenCalledTimes(1)
    })

    it('still holds typed notes to 12,000 characters', async () => {
        expect((await post({ notes: 'z'.repeat(12_001) })).status).toBe(413)
        expect(h.getRenderableContent).not.toHaveBeenCalled()
    })

    it('403 for a Reviewer or a Contributor · Limited Access, and on a completed engagement, before anything is read', async () => {
        h.canEdit = false
        h.canViewInternal = false
        expect((await post({ memoDocumentId: MEMO_ID })).status).toBe(403)
        h.canEdit = true
        expect((await post({ memoDocumentId: MEMO_ID })).status).toBe(403)
        h.canViewInternal = true
        h.completed = true
        expect((await post({ memoDocumentId: MEMO_ID })).status).toBe(403)
        expect(h.getRenderableContent).not.toHaveBeenCalled()
    })

    it('an empty memo is said plainly', async () => {
        h.text = '   \n'
        const res = await post({ memoDocumentId: MEMO_ID })
        expect(res.status).toBe(400)
        expect(h.readMemo).not.toHaveBeenCalled()
    })
})
