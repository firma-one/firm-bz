import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Where memos go and how they're read back, against an in-memory table and stubbed storage: nothing
 * here reaches Google Drive or OneDrive.
 */

type Row = {
    id: string
    engagementId: string
    firmId: string
    externalId: string
    parentId: string | null
    fileName: string
    isFolder: boolean
    status: string
    connectorId: string | null
    docId: string | null
    settings: Record<string, unknown>
    createdAt: Date
}

const h = vi.hoisted(() => {
    const state = {
        rows: [] as Row[],
        seq: 0,
        clientConnectorId: 'conn-1' as string | null,
        connectorType: 'GOOGLE_DRIVE',
        generalFolderId: 'general' as string | null,
        stored: [] as { id: string; name: string }[],
        trashed: new Set<string>(),
        fileText: '# Call notes\n\nThursday, November 12, 2026 · Alex Jordan\n\n- Chase the 1099-B',
    }
    return {
        state,
        createFolder: vi.fn(),
        findOrCreateFolder: vi.fn(),
        createFile: vi.fn(),
        getRenderableContent: vi.fn(),
        withdrawClientAccess: vi.fn(),
        loadPrivacyRows: vi.fn(),
        assertWithinDocumentCap: vi.fn(),
        overwrite: vi.fn(),
        renameDrive: vi.fn(),
        renameOneDrive: vi.fn(),
        raidDelete: vi.fn(async () => ({ count: 0 })),
        // Every audit line written, with what its builder was given.
        audits: [] as Array<Record<string, unknown>>,
    }
})

const matches = (row: Row, where: Record<string, unknown>) => Object.entries(where).every(([key, value]) => {
    if (key === 'settings') {
        const { path, equals } = value as { path: string[]; equals: unknown }
        return row.settings?.[path[0]] === equals
    }
    if (key === 'status') return row.status !== (value as { not: string }).not
    if (value && typeof value === 'object' && 'in' in (value as object)) return (value as { in: unknown[] }).in.includes(row[key as keyof Row])
    return row[key as keyof Row] === value
})

vi.mock('@/lib/prisma', () => ({
    prisma: {
        // What still waits from each memo (§13): none in these tests.
        engagementRaidItem: { groupBy: async () => [], deleteMany: h.raidDelete },
        engagementDocument: {
            findMany: async ({ where, orderBy }: { where: Record<string, unknown>; orderBy?: unknown }) => {
                const found = h.state.rows.filter((r) => matches(r, where))
                return orderBy ? [...found].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()) : found
            },
            findFirst: async ({ where }: { where: Record<string, unknown> }) => h.state.rows.find((r) => matches(r, where)) ?? null,
            findUnique: async ({ where }: { where: { id: string } }) => h.state.rows.find((r) => r.id === where.id) ?? null,
            upsert: async ({ where, create, update }: { where: { engagementId_firmId_externalId: { externalId: string } }; create: Partial<Row>; update: Partial<Row> }) => {
                const existing = h.state.rows.find((r) => r.externalId === where.engagementId_firmId_externalId.externalId)
                if (existing) { Object.assign(existing, update); return existing }
                const row = { id: `00000000-0000-4000-8000-${String(++h.state.seq).padStart(12, '0')}`, status: 'PROCESSED', docId: null, createdAt: new Date(Date.now() + h.state.seq), ...create } as Row
                h.state.rows.push(row)
                return row
            },
            update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
                const row = h.state.rows.find((r) => r.id === where.id)!
                Object.assign(row, data)
                return row
            },
        },
        engagement: {
            findUnique: async () => ({
                name: '2025 Individual Return',
                slug: 'return-2025',
                firmId: 'f1',
                clientId: 'c1',
                connectorRootFolderId: 'project-folder',
                client: { slug: 'dana', name: 'Dana', connectorId: h.state.clientConnectorId, connector: { type: h.state.connectorType } },
            }),
        },
        connector: { findUnique: async () => ({ type: h.state.connectorType }) },
    },
}))

vi.mock('@/lib/connectors/registry', () => ({
    getStorageAdapter: async () => ({
        createFolder: h.createFolder,
        findOrCreateFolder: h.findOrCreateFolder,
        getFolderName: async () => 'Internal Memos',
        listFolderChildren: async () => h.state.stored,
    }),
    getContentAdapter: async () => ({ createFile: h.createFile, getRenderableContent: h.getRenderableContent, overwriteFileContent: h.overwrite }),
    getPermissionAdapter: async () => ({
        getEngagementFolderIds: async () => ({ generalFolderId: h.state.generalFolderId, confidentialFolderId: null, stagingFolderId: null }),
        getFileMetadata: async (_c: string, id: string) => ({ id, name: 'Internal Memos', trashed: h.state.trashed.has(id) }),
    }),
}))
vi.mock('@/lib/files/private-documents', () => ({ loadPrivacyRows: h.loadPrivacyRows, withdrawClientAccess: h.withdrawClientAccess }))
vi.mock('@/lib/billing/effective-billing-caps', () => ({ assertWithinDocumentCap: h.assertWithinDocumentCap }))
vi.mock('@/lib/doc-id', () => ({ assignDocId: async () => 'RET-9' }))
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
    AUDIT_EVENT: { DOCUMENT_CREATED: 'DOCUMENT_CREATED', DOCUMENT_MEMO_ADDED: 'DOCUMENT_MEMO_ADDED', DOCUMENT_MEMO_EDITED: 'DOCUMENT_MEMO_EDITED' },
    AUDIT_SCOPE: { DOCUMENT: 'DOCUMENT' },
}))
vi.mock('@/lib/google-drive-connector', () => ({ googleDriveConnector: { renameFile: h.renameDrive } }))
vi.mock('@/lib/connectors/adapters/onedrive-file-ops', () => ({ renameOneDriveFile: h.renameOneDrive }))

import { saveMemo, readMemoText, listMemos, memoStorageFailure, recordMemoApplied, findMemo, editMemo, writeMemoReview } from './memo-store'
import { memoReviewOf, resolveMemoReview } from '@/lib/memos/memo-shared'
import { StorageFailure } from '@/lib/connectors/storage-failure'

const AUTHOR = { userId: 'u1', name: 'Alex Jordan', firstName: 'Alex' }
const save = (overrides: Partial<Parameters<typeof saveMemo>[0]> = {}) => saveMemo({
    engagementId: 'p1', title: 'Call notes', date: '2026-11-12', body: '- Chase the 1099-B', source: 'notes',
    durationMinutes: null, speakers: null, author: AUTHOR, ...overrides,
})
const row = (overrides: Partial<Row>): Row => ({
    id: `00000000-0000-4000-9000-${String(++h.state.seq).padStart(12, '0')}`, engagementId: 'p1', firmId: 'f1', externalId: `ext-${h.state.seq}`,
    parentId: 'general', fileName: 'x', isFolder: false, status: 'PROCESSED', connectorId: 'conn-1', docId: null, settings: {},
    createdAt: new Date(h.state.seq), ...overrides,
})
const memoFolders = () => h.state.rows.filter((r) => r.settings?.memoFolder === true)

beforeEach(() => {
    Object.assign(h.state, { rows: [], seq: 0, clientConnectorId: 'conn-1', connectorType: 'GOOGLE_DRIVE', generalFolderId: 'general', stored: [], trashed: new Set() })
    let folders = 0
    h.createFolder.mockReset().mockImplementation(async () => `memos-folder-${++folders}`)
    h.findOrCreateFolder.mockReset()
    let files = 0
    h.createFile.mockReset().mockImplementation(async () => ({ id: `memo-file-${++files}` }))
    h.getRenderableContent.mockReset().mockImplementation(async () => ({ stream: Buffer.from(h.state.fileText, 'utf-8'), mimeType: 'text/markdown', fileName: 'x.md' }))
    h.withdrawClientAccess.mockReset().mockResolvedValue({ kept: [], peopleStillHolding: 0, stillHolding: null })
    h.loadPrivacyRows.mockReset().mockImplementation(async () => h.state.rows)
    h.assertWithinDocumentCap.mockReset().mockResolvedValue(undefined)
    // Storage keeps what was last written, as Drive would.
    h.overwrite.mockReset().mockImplementation(async (_c: string, _id: string, bytes: Buffer) => { h.state.fileText = bytes.toString('utf-8') })
    h.renameDrive.mockReset().mockImplementation(async (_c: string, id: string, name: string) => ({ id, name }))
    h.renameOneDrive.mockReset().mockImplementation(async (_c: string, id: string, name: string) => ({ id, name }))
    h.raidDelete.mockClear()
    h.audits.length = 0
})

describe('the Internal Memos folder', () => {
    it('is created on the first save, at the engagement\'s root in Files, marked on its row', async () => {
        await save()
        expect(h.createFolder).toHaveBeenCalledTimes(1)
        expect(h.createFolder).toHaveBeenCalledWith('conn-1', 'general', 'Internal Memos')
        expect(memoFolders()).toEqual([expect.objectContaining({ externalId: 'memos-folder-1', parentId: 'general', isFolder: true, fileName: 'Internal Memos' })])
    })

    it('is internal only, through the same steps as "Make internal only"', async () => {
        await save()
        const folder = memoFolders()[0]
        expect(folder.settings.lock).toEqual({ type: 'private' })
        expect(h.withdrawClientAccess).toHaveBeenCalledWith('p1', expect.objectContaining({ id: folder.id, settings: expect.objectContaining({ lock: { type: 'private' } }) }), expect.any(Array), 'u1')
    })

    it('is found again by its marker and created once, renamed or not', async () => {
        await save()
        memoFolders()[0].fileName = 'Call notes (renamed in Drive)'
        await save({ title: 'Follow-up' })
        expect(h.createFolder).toHaveBeenCalledTimes(1)
        expect(h.createFile.mock.calls.map((c) => c[1])).toEqual(['memos-folder-1', 'memos-folder-1'])
        // Already internal only: nothing more to take back.
        expect(h.withdrawClientAccess).toHaveBeenCalledTimes(1)
    })

    it('is created once when two first saves arrive together', async () => {
        await Promise.all([save(), save({ title: 'Second call' })])
        expect(h.createFolder).toHaveBeenCalledTimes(1)
        expect(memoFolders()).toHaveLength(1)
    })

    it('never adopts a folder the firm made with the same name', async () => {
        h.state.rows.push(row({ externalId: 'firms-own', fileName: 'Internal Memos', isFolder: true }))
        await save()
        expect(h.findOrCreateFolder).not.toHaveBeenCalled()
        expect(h.createFolder).toHaveBeenCalledTimes(1)
        expect(h.state.rows.find((r) => r.externalId === 'firms-own')!.settings).toEqual({})
    })

    it('is made internal only again when the mark was removed in Files', async () => {
        h.state.rows.push(row({ externalId: 'memos-old', fileName: 'Internal Memos', isFolder: true, settings: { memoFolder: true } }))
        await save()
        expect(h.createFolder).not.toHaveBeenCalled()
        expect(h.state.rows.find((r) => r.externalId === 'memos-old')!.settings.lock).toEqual({ type: 'private' })
        expect(h.withdrawClientAccess).toHaveBeenCalledTimes(1)
    })

    it('is replaced when it is in the trash in Drive, and the old one is retired, not unmarked', async () => {
        h.state.rows.push(row({ externalId: 'memos-old', fileName: 'Internal Memos', isFolder: true, settings: { memoFolder: true, lock: { type: 'private' } } }))
        h.state.trashed.add('memos-old')
        await save()
        expect(h.createFolder).toHaveBeenCalledTimes(1)
        const old = h.state.rows.find((r) => r.externalId === 'memos-old')!
        expect(old.settings).toEqual(expect.objectContaining({ memoFolder: true, memoFolderRetiredAt: expect.any(String) }))
        expect(h.createFile.mock.calls[0][1]).toBe('memos-folder-1')
    })
})

describe('a memo file', () => {
    it('is Markdown named by its day and title, with its byline, and indexed with settings.memo', async () => {
        const saved = await save({ body: '- Chase the 1099-B\n- Next check-in after Thanksgiving' })
        expect(saved.fileName).toBe('2026-11-12-Call-notes.md')
        const [connectorId, folderId, fileName, bytes, mime] = h.createFile.mock.calls[0]
        expect([connectorId, folderId, fileName, mime]).toEqual(['conn-1', 'memos-folder-1', '2026-11-12-Call-notes.md', 'text/markdown'])
        expect((bytes as Buffer).toString('utf-8')).toBe('# Call notes\n\nThursday, November 12, 2026 · Alex Jordan\n\n- Chase the 1099-B\n- Next check-in after Thanksgiving\n')

        const file = h.state.rows.find((r) => r.externalId === 'memo-file-1')!
        expect(file).toEqual(expect.objectContaining({ parentId: 'memos-folder-1', isFolder: false, fileName: '2026-11-12-Call-notes.md' }))
        expect(file.settings.lock).toEqual({ type: 'private' })
        expect(file.settings.memo).toEqual(expect.objectContaining({
            date: '2026-11-12', title: 'Call notes', authorUserId: 'u1', authorFirstName: 'Alex', source: 'notes', applied: [],
        }))
        // No memo text in the database, not even a preview: the words stay in the file.
        expect(JSON.stringify(file.settings)).not.toMatch(/1099-B|Thanksgiving/)
        expect(saved.memo).toEqual(expect.objectContaining({ id: file.id, docId: 'RET-9', authorFirstName: 'Alex', appliedCount: 0 }))
    })

    it('takes a number when its name is taken in the folder, in storage or in the table', async () => {
        await save()
        h.state.stored = [{ id: 'by-hand', name: '2026-11-12-Call-notes-2.md' }]
        const third = await save()
        expect(third.fileName).toBe('2026-11-12-Call-notes-3.md')
    })

    it('keeps a transcript\'s length, and nothing of it for notes', async () => {
        await save({ source: 'transcript', durationMinutes: 42, speakers: 3 })
        await save({ source: 'notes', durationMinutes: 42, speakers: 3 })
        const [transcript, notes] = h.state.rows.filter((r) => !r.isFolder).map((r) => r.settings.memo as Record<string, unknown>)
        expect([transcript.source, transcript.durationMinutes, transcript.speakers]).toEqual(['transcript', 42, 3])
        expect([notes.source, notes.durationMinutes, notes.speakers]).toEqual(['notes', null, null])
    })

    it('says why storage refused it, in storage\'s words', async () => {
        h.createFile.mockRejectedValue(new Error('Failed to upload file: 403'))
        const refused = await save().catch((e: unknown) => e)
        expect(refused).toBeInstanceOf(StorageFailure)
        expect((refused as StorageFailure).message).toBe("The Google Drive account connected to this client doesn't have permission to change this.")
    })

    it('is refused when the client has no storage connected', async () => {
        h.state.clientConnectorId = null
        await expect(save()).rejects.toThrow('No storage is connected to this client.')
        expect(h.createFolder).not.toHaveBeenCalled()
    })

    it('counts toward the plan\'s file limit', async () => {
        h.assertWithinDocumentCap.mockRejectedValue(new Error('Your plan allows 10 files and folders.'))
        await expect(save()).rejects.toThrow('Your plan allows 10 files')
        expect(h.createFile).not.toHaveBeenCalled()
    })

    it('is listed newest call first, from the table alone', async () => {
        await save({ date: '2026-11-01', title: 'Kickoff' })
        await save({ date: '2026-11-12', title: 'Check-in' })
        h.state.rows.push(row({ parentId: 'general', settings: { memo: { date: '2026-11-20', title: 'Loose', authorUserId: 'u1' } } }))
        expect((await listMemos('p1')).map((m) => m.title)).toEqual(['Check-in', 'Kickoff'])
        expect(h.getRenderableContent).not.toHaveBeenCalled()
    })
})

describe('a memo added', () => {
    it('is in the audit trail as an internal memo, firm only, against its file', async () => {
        const saved = await save()
        expect(h.audits).toContainEqual(expect.objectContaining({
            event: 'DOCUMENT_MEMO_ADDED',
            document: saved.memo.id,
            actor: 'u1',
            meta: expect.objectContaining({ fileName: '2026-11-12-Call-notes.md', memo: true, summary: 'Notes' }),
        }))
    })
})

describe('editing a memo (§14.3)', () => {
    const ACTOR = { userId: 'u2', name: 'Sam Rivera' }
    const BODY = '- Chase the 1099-B\n- Call Dana about the K-1'
    const FOUND = {
        proposals: [{ kind: 'reminder' as const, id: 'reminder-1', title: 'Chase the 1099-B', date: '2026-11-16', quote: 'Chase the 1099-B' }],
        skipped: [],
        dropped: 0,
    }
    /** A memo saved, its file as storage holds it, and Brio's action items waiting on it. */
    const memoWithReview = async () => {
        const saved = await save({ body: BODY })
        h.state.fileText = (h.createFile.mock.calls[0][3] as Buffer).toString('utf-8')
        await writeMemoReview('p1', saved.memo.id, memoReviewOf(FOUND, h.state.fileText, 'auto', new Date('2026-11-12T18:00:00Z')))
        h.audits.length = 0
        return saved.memo.id
    }
    const edit = (id: string, change: Partial<Parameters<typeof editMemo>[0]> = {}) =>
        editMemo({ engagementId: 'p1', documentId: id, title: 'Call notes', date: '2026-11-12', body: null, actor: ACTOR, ...change })

    beforeEach(() => {
        process.env.ENCRYPTION_KEY_V1 = 'd'.repeat(64)
        delete process.env.CURRENT_KEY_VERSION
    })

    it('a new title renames the file and rewrites its heading; the action items stay, on the same lines', async () => {
        const id = await memoWithReview()
        const out = await edit(id, { title: 'Call with Dana' })
        expect(out).toEqual(expect.objectContaining({ ok: true, notesChanged: false, fileName: '2026-11-12-Call-with-Dana.md' }))
        expect(h.state.fileText.startsWith('# Call with Dana\n')).toBe(true)
        expect(h.state.fileText).toContain(BODY)
        expect(h.renameDrive).toHaveBeenCalledWith('conn-1', 'memo-file-1', '2026-11-12-Call-with-Dana.md')

        const memo = (await findMemo('p1', id))!
        expect(memo.fileName).toBe('2026-11-12-Call-with-Dana.md')
        expect(memo.memo.review?.dismissed).toBe(false)
        // The heading grew, so every anchor moved with it: the quote still reads as Brio found it.
        expect(resolveMemoReview(memo.memo.review!, h.state.fileText).proposals[0].quote).toBe('Chase the 1099-B')
        expect(h.raidDelete).not.toHaveBeenCalled()
        expect(h.audits).toEqual([expect.objectContaining({
            event: 'DOCUMENT_MEMO_EDITED',
            document: id,
            actor: 'u2',
            meta: expect.objectContaining({ fileName: '2026-11-12-Call-with-Dana.md', previousName: '2026-11-12-Call-notes.md', notesChanged: false, summary: 'Title or date changed' }),
        })])
    })

    it('new notes stop what Brio found in the old ones, and its RAID suggestions still waiting; what was applied stays', async () => {
        const id = await memoWithReview()
        await recordMemoApplied('p1', id, { kind: 'reminder', target: 'chase the 1099-b', date: '2026-11-16', quote: 'chase the 1099-b', label: 'Reminder · Chase the 1099-B' })
        const out = await edit(id, { body: '- Dana sends the figures by Friday' })
        if (!out.ok) throw new Error(out.error)
        expect(out.notesChanged).toBe(true)
        expect(out.memo).toEqual(expect.objectContaining({ toReview: 0, changedSinceRead: true, appliedCount: 1, edited: expect.objectContaining({ byName: 'Sam Rivera' }) }))
        expect(h.state.fileText).toBe('# Call notes\n\nThursday, November 12, 2026 · Alex Jordan\n\n- Dana sends the figures by Friday\n')
        expect(h.renameDrive).not.toHaveBeenCalled()
        const memo = (await findMemo('p1', id))!
        expect(memo.memo.review?.dismissed).toBe(true)
        expect(memo.memo.applied.map((a) => a.quote)).toEqual(['chase the 1099-b'])
        expect(h.raidDelete).toHaveBeenCalledWith({ where: { engagementId: 'p1', status: 'SUGGESTED', sourceKind: 'MEMO', sourceRef: id } })
        expect(h.audits[h.audits.length - 1]).toEqual(expect.objectContaining({ event: 'DOCUMENT_MEMO_EDITED', meta: expect.objectContaining({ notesChanged: true, summary: 'Notes changed' }) }))
    })

    it('a rename storage refuses is said, and the notes are saved anyway', async () => {
        const id = await memoWithReview()
        h.renameDrive.mockRejectedValue(new Error('Failed to rename file: 403'))
        const out = await edit(id, { title: 'Call with Dana' })
        expect(out).toEqual(expect.objectContaining({ ok: true, fileName: '2026-11-12-Call-notes.md' }))
        expect(out.ok && out.warning).toBe("Saved, but Google Drive didn't rename the file. The Google Drive account connected to this client doesn't have permission to change this.")
        expect(h.state.fileText.startsWith('# Call with Dana\n')).toBe(true)
    })

    it('renames in OneDrive through OneDrive', async () => {
        h.state.connectorType = 'ONEDRIVE'
        const id = await memoWithReview()
        await edit(id, { date: '2026-11-13' })
        expect(h.renameOneDrive).toHaveBeenCalledWith('conn-1', 'memo-file-1', '2026-11-13-Call-notes.md')
        expect(h.renameDrive).not.toHaveBeenCalled()
    })

    it('nothing changed: nothing is written, and nothing is recorded', async () => {
        const id = await memoWithReview()
        const out = await edit(id, { body: `  ${BODY}  ` })
        expect(out).toEqual(expect.objectContaining({ ok: true, notesChanged: false }))
        expect(h.overwrite).not.toHaveBeenCalled()
        expect(h.audits).toEqual([])
    })

    it('only a memo of this engagement', async () => {
        h.state.rows.push(row({ id: '00000000-0000-4000-9000-999999999999', settings: { memo: { date: '2026-11-20', title: 'Loose', authorUserId: 'u1' } } }))
        expect(await edit('00000000-0000-4000-9000-999999999999')).toEqual({ ok: false, status: 404, error: 'This memo was not found in this engagement. Refresh the list and try again.' })
        expect(h.overwrite).not.toHaveBeenCalled()
    })
})

describe('an applied action\'s citation line', () => {
    const ACTION = { kind: 'reminder' as const, target: 'chase the 1099-b', date: '2026-11-16', quote: 'chase the brokerage 1099-b, still missing', label: 'Reminder · Chase the 1099-B' }

    beforeEach(() => {
        // A throwaway key for this suite, never a real one.
        process.env.ENCRYPTION_KEY_V1 = 'b'.repeat(64)
        delete process.env.CURRENT_KEY_VERSION
    })

    it('is stored encrypted, the one piece of a memo\'s text we keep, and reads back as written', async () => {
        const saved = await save()
        expect(await recordMemoApplied('p1', saved.memo.id, ACTION)).toBe(1)
        const stored = (h.state.rows.find((r) => r.id === saved.memo.id)!.settings.memo as { applied: { quote: string }[] }).applied[0]
        expect(stored.quote).toMatch(/^v1\$/)
        expect(JSON.stringify(h.state.rows.map((r) => r.settings))).not.toMatch(/brokerage/)
        expect((await findMemo('p1', saved.memo.id))!.memo.applied[0].quote).toBe(ACTION.quote)
    })

    it('stays encrypted as more are applied, and a line saved before encryption still reads', async () => {
        const saved = await save()
        const file = h.state.rows.find((r) => r.id === saved.memo.id)!
        const memo = file.settings.memo as Record<string, unknown>
        file.settings = { ...file.settings, memo: { ...memo, applied: [{ ...ACTION, quote: 'an older plain line', at: '2026-11-13T10:00:00Z' }] } }
        await recordMemoApplied('p1', saved.memo.id, { ...ACTION, target: 'call dana', quote: 'call dana about the k-1' })
        const applied = (file.settings.memo as { applied: { quote: string }[] }).applied
        expect(applied.map((a) => /^v1\$/.test(a.quote))).toEqual([true, true])
        expect((await findMemo('p1', saved.memo.id))!.memo.applied.map((a) => a.quote)).toEqual(['an older plain line', 'call dana about the k-1'])
    })
})

describe('readMemoText, the one place Brio reads a file', () => {
    it('reads a memo of this engagement that sits in the memos folder', async () => {
        const { memo } = await save()
        const read = await readMemoText('p1', memo.id)
        expect(read).toEqual(expect.objectContaining({ ok: true, text: h.state.fileText }))
        expect(h.getRenderableContent).toHaveBeenCalledWith('conn-1', 'memo-file-1', 'native')
    })

    it('finds nothing, and reads nothing, for another engagement\'s memo', async () => {
        const { memo } = await save()
        h.state.rows.find((r) => r.id === memo.id)!.engagementId = 'p2'
        expect(await readMemoText('p1', memo.id)).toEqual({ ok: false, status: 404, error: expect.stringMatching(/not found in this engagement/) })
        expect(h.getRenderableContent).not.toHaveBeenCalled()
    })

    it('finds nothing for a file that isn\'t a memo, even in the memos folder', async () => {
        await save()
        const other = row({ parentId: 'memos-folder-1', fileName: 'contract.pdf' })
        h.state.rows.push(other)
        expect((await readMemoText('p1', other.id)).ok).toBe(false)
        expect(h.getRenderableContent).not.toHaveBeenCalled()
    })

    it('finds nothing for a memo moved out of the memos folder', async () => {
        const { memo } = await save()
        h.state.rows.find((r) => r.id === memo.id)!.parentId = 'general'
        expect((await readMemoText('p1', memo.id)).ok).toBe(false)
        expect(h.getRenderableContent).not.toHaveBeenCalled()
    })

    it('finds nothing for an id that isn\'t one', async () => {
        expect((await readMemoText('p1', 'not-a-uuid')).ok).toBe(false)
        expect((await readMemoText('p1', undefined)).ok).toBe(false)
    })

    it('says why storage wouldn\'t give it up', async () => {
        const { memo } = await save()
        const { ConnectorContentError } = await import('@/lib/connectors/types')
        h.getRenderableContent.mockRejectedValue(new ConnectorContentError('not_found', 'gone'))
        expect(await readMemoText('p1', memo.id)).toEqual({
            ok: false, status: 404, error: 'This is no longer in Google Drive. It may have been moved or deleted there. Refresh the list.',
        })
    })
})

describe('memoStorageFailure', () => {
    it('reads each dialect the adapters throw', () => {
        expect(memoStorageFailure(new Error('Failed to create folder Internal Memos: 404 - {"error":{"message":"File not found"}}'), 'Google Drive').reason).toBe('not_found')
        expect(memoStorageFailure(new TypeError('fetch failed'), 'OneDrive').reason).toBe('unreachable')
        expect(memoStorageFailure(new Error('Could not get access token'), 'OneDrive').reason).toBe('reconnect')
        expect(memoStorageFailure(new Error('weird'), 'OneDrive').message).toBe("OneDrive didn't save the memo and didn't say why. Try again in a moment.")
    })
})
