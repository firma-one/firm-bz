import 'server-only'
import { prisma } from '@/lib/prisma'
import { getContentAdapter, getPermissionAdapter, getStorageAdapter } from '@/lib/connectors/registry'
import { StorageFailure, reasonFor, storageFailure, type StorageProvider } from '@/lib/connectors/storage-failure'
import { contentFailure, providerOf, NO_STORAGE_MESSAGE } from '@/lib/connectors/content-failure'
import type { IConnectorContentAdapter, IConnectorPermissionAdapter, IConnectorStorageAdapter } from '@/lib/connectors/types'
import { loadPrivacyRows, withdrawClientAccess } from '@/lib/files/private-documents'
import { isDocumentPrivate } from '@/lib/sharing-settings'
import { assertWithinDocumentCap } from '@/lib/billing/effective-billing-caps'
import { userFacing } from '@/lib/actions/action-result'
import { assignDocId } from '@/lib/doc-id'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'
import { logger } from '@/lib/logger'
import {
    MEMO_APPLIED_MAX,
    MEMO_FOLDER_NAME,
    byNewestMemo,
    isMemoFolder,
    memoFileName,
    memoListItem,
    memoMarkdown,
    parseMemoSettings,
    type MemoAppliedAction,
    type MemoListItem,
    type MemoReview,
    type MemoSettings,
    type MemoSource,
} from '@/lib/memos/memo-shared'

/**
 * Internal memos in storage and in the database (.claude/plans/brio-features-round-2.md, §8).
 *
 * ## The folder
 *
 * "Internal Memos" sits at the engagement's root in Files (its General folder, where deliverables
 * live), created on the first save. It is found again by the marker on its EngagementDocument row
 * (`settings.memoFolder = true`), never by its name: a folder the firm made and happened to call
 * "Internal Memos" is theirs, and adopting it would hide what it holds. Renamed or moved in storage,
 * the marked folder is still the memos folder.
 *
 * It is made internal only the way "Make internal only" does it (the privacy route): a `private` lock
 * on its row, then `withdrawClientAccess`. That mark is what hides it, and everything inside it, from
 * Limited Access contributors and Reviewers on every path (privateSubtreeIds). The privacy route offers
 * the mark only inside a deliverable, since those roles reach nothing outside one; the memos folder takes
 * it anyway, so it stays hidden if anyone ever moves it into one. In storage those roles are only ever
 * granted file by file (grantEngagementDriveFolderAccess shares folders with Leads and Full Access
 * contributors alone), and a file that's internal only is never granted to them.
 *
 * ## The files
 *
 * One Markdown file per memo, created through the connector's content adapter and indexed here: a row
 * with `settings.memo` (what the card lists, so listing never reads storage) and its own `private`
 * lock, so a memo moved out of the folder stays internal only. The file isn't sent to the search
 * indexer: memo text is never read for search, whatever INDEX_DOCUMENT_TEXT says.
 */

const FOLDER_MIME = 'application/vnd.google-apps.folder'
const MEMO_MIME = 'text/markdown'
/** A memo file read for Brio: far past the longest memo saved, so only a file changed in storage is refused. */
const MAX_MEMO_BYTES = 1_000_000

// ── Failures ──────────────────────────────────────────────────────────────────────────────────

/**
 * Why storage didn't take the memo, in its words. The content adapters throw a StorageFailure, a
 * plain `…: 403` or `…: 403 - {body}`, a missing token, or a network error; each is read for its reason.
 */
export function memoStorageFailure(e: unknown, provider: StorageProvider): StorageFailure {
    if (e instanceof StorageFailure) return e
    const message = e instanceof Error ? e.message : String(e)
    const name = e instanceof Error ? e.name : ''
    if (name === 'GoogleDriveAuthError' || /access token/i.test(message)) return storageFailure('reconnect', provider)
    if (e instanceof TypeError || /fetch failed|ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(message)) {
        return storageFailure('unreachable', provider)
    }
    const answered = /: (\d{3})(?: - ([\s\S]*))?$/.exec(message)
    if (answered) {
        let code: string | undefined
        let said: string | undefined
        try {
            const body = JSON.parse(answered[2] ?? '') as { error?: { code?: unknown; message?: string; errors?: { reason?: string }[] } }
            code = body.error?.errors?.[0]?.reason ?? (typeof body.error?.code === 'string' ? body.error.code : undefined)
            said = body.error?.message
        } catch { /* the status alone decides */ }
        return storageFailure(reasonFor(Number(answered[1]), code, said), provider, said ?? `HTTP ${answered[1]}`)
    }
    return new StorageFailure('other', `${provider} didn't save the memo and didn't say why. Try again in a moment.`)
}

// ── Where memos go ────────────────────────────────────────────────────────────────────────────

export interface MemoStorage {
    engagementId: string
    engagementName: string
    firmId: string
    clientId: string | null
    connectorId: string
    provider: StorageProvider
    storage: IConnectorStorageAdapter
    content: IConnectorContentAdapter
    permissions: IConnectorPermissionAdapter | null
    /** The engagement's root in Files: its General folder. */
    rootFolderId: string
}

/** The engagement's storage, or why there is none to save to. */
export async function memoStorageFor(engagementId: string): Promise<MemoStorage> {
    const engagement = await prisma.engagement.findUnique({
        where: { id: engagementId },
        select: {
            name: true,
            slug: true,
            firmId: true,
            clientId: true,
            connectorRootFolderId: true,
            client: { select: { slug: true, name: true, connectorId: true, connector: { select: { type: true } } } },
        },
    })
    if (!engagement) throw userFacing('This engagement was deleted.', 'gone')
    const connectorId = engagement.client?.connectorId
    if (!connectorId) throw userFacing(NO_STORAGE_MESSAGE, 'no_connector')
    const provider = providerOf(engagement.client?.connector?.type)
    if (!engagement.connectorRootFolderId) {
        throw userFacing(`This engagement has no folder in ${provider} yet. Set it up from Files, then try again.`, 'no_folder')
    }

    const [storage, content, permissions] = await Promise.all([
        getStorageAdapter(connectorId),
        getContentAdapter(connectorId),
        getPermissionAdapter(connectorId),
    ])
    if (!content || !permissions) throw userFacing(`${provider} can't be written to from here. Reconnect it, then try again.`, 'no_adapter')

    let rootFolderId: string | null
    try {
        rootFolderId = (await permissions.getEngagementFolderIds(connectorId, engagement.slug, {
            projectName: engagement.name,
            clientSlug: engagement.client?.slug,
            clientName: engagement.client?.name,
            projectFolderId: engagement.connectorRootFolderId,
        })).generalFolderId
    } catch (e) {
        throw memoStorageFailure(e, provider)
    }
    if (!rootFolderId) {
        throw userFacing(`This engagement's General folder isn't in ${provider}. Open Files to set it up, then try again.`, 'no_folder')
    }

    return {
        engagementId,
        engagementName: engagement.name,
        firmId: engagement.firmId,
        clientId: engagement.clientId,
        connectorId,
        provider,
        storage,
        content,
        permissions,
        rootFolderId,
    }
}

// ── The folder ────────────────────────────────────────────────────────────────────────────────

interface FolderRow {
    id: string
    externalId: string
    parentId: string | null
    isFolder: boolean
    settings: unknown
}

const FOLDER_SELECT = { id: true, externalId: true, parentId: true, isFolder: true, settings: true } as const

/** Every folder ever marked as this engagement's memos folder, oldest first: one normally, retired ones after. */
async function markedFolders(engagementId: string): Promise<FolderRow[]> {
    return prisma.engagementDocument.findMany({
        where: { engagementId, isFolder: true, status: { not: 'ARCHIVED' }, settings: { path: ['memoFolder'], equals: true } },
        select: FOLDER_SELECT,
        orderBy: { createdAt: 'asc' },
    })
}

const isRetired = (settings: unknown) => !!(settings as { memoFolderRetiredAt?: unknown } | null)?.memoFolderRetiredAt

/**
 * A memos folder that's gone from storage is retired, not unmarked: the memos it held are still memos,
 * and the next save makes a new folder.
 */
async function retireFolder(folder: FolderRow): Promise<void> {
    await prisma.engagementDocument.update({
        where: { id: folder.id },
        data: { settings: { ...(folder.settings as object ?? {}), memoFolderRetiredAt: new Date().toISOString() }, updatedAt: new Date() },
    })
}

/** Created in storage and indexed, as the Files agent makes a folder (safe-ops), with the marker on its row. */
async function createMemoFolder(s: MemoStorage, actorUserId: string): Promise<FolderRow> {
    let externalId: string
    try {
        // Always a new folder: never one found by name (see the module comment).
        externalId = await s.storage.createFolder(s.connectorId, s.rootFolderId, MEMO_FOLDER_NAME)
    } catch (e) {
        throw memoStorageFailure(e, s.provider)
    }
    // OneDrive names it "Internal Memos 1" when the name is taken; the row says what storage says.
    const fileName = await s.storage.getFolderName(s.connectorId, externalId).catch(() => null) ?? MEMO_FOLDER_NAME

    const row = await prisma.engagementDocument.upsert({
        where: { engagementId_firmId_externalId: { engagementId: s.engagementId, firmId: s.firmId, externalId } },
        update: { settings: { memoFolder: true } },
        create: {
            engagementId: s.engagementId,
            firmId: s.firmId,
            clientId: s.clientId,
            externalId,
            connectorId: s.connectorId,
            parentId: s.rootFolderId,
            fileName,
            mimeType: FOLDER_MIME,
            isFolder: true,
            createdBy: actorUserId,
            updatedBy: actorUserId,
            metadata: { modifiedTime: new Date().toISOString() },
            settings: { memoFolder: true },
        },
        select: { ...FOLDER_SELECT, docId: true },
    })
    if (!row.docId) void assignDocId(row.id, s.engagementId, s.engagementName).catch(() => {})

    audit(AUDIT_EVENT.DOCUMENT_CREATED)
        .firm(s.firmId).client(s.clientId ?? undefined).engagement(s.engagementId)
        .actor(actorUserId).scope(AUDIT_SCOPE.DOCUMENT)
        .meta({ fileName, parentId: s.rootFolderId, folderId: externalId, memoFolder: true })
        .fireAndForget()

    return { id: row.id, externalId: row.externalId, parentId: row.parentId, isFolder: row.isFolder, settings: row.settings }
}

/**
 * Internal only, as "Make internal only" makes it (the privacy route): the `private` lock, then whatever
 * Limited Access contributors and Reviewers were granted is taken back. Done again whenever the mark is
 * found missing, so removing it in Files doesn't open the memos up. Answers what storage wouldn't take back.
 */
async function keepInternalOnly(engagementId: string, folder: FolderRow, actorUserId: string): Promise<string | null> {
    if (isDocumentPrivate(folder.settings)) return null
    // As the privacy route writes it: the legacy `locked` key gives way to `lock`.
    const settings: Record<string, unknown> = { ...(folder.settings ?? {}) as Record<string, unknown>, lock: { type: 'private' } }
    delete settings.locked
    await prisma.engagementDocument.update({ where: { id: folder.id }, data: { settings, updatedAt: new Date() } })
    folder.settings = settings
    const rows = await loadPrivacyRows(engagementId)
    const taken = await withdrawClientAccess(engagementId, { ...folder, settings }, rows, actorUserId)
    if (taken.stillHolding) logger.warn('[memos] the memos folder is internal only, but storage kept access', { engagementId, folderId: folder.id })
    return taken.stillHolding
}

/** Saves for one engagement on this server wait for the one making its folder. */
const making = new Map<string, Promise<FolderRow>>()

async function findOrMakeFolder(s: MemoStorage, actorUserId: string): Promise<{ folder: FolderRow; created: boolean }> {
    for (const row of await markedFolders(s.engagementId)) {
        if (isRetired(row.settings)) continue
        // In Drive's trash it still answers, so ask: memos saved into it would be in the trash too.
        const meta = await s.permissions?.getFileMetadata(s.connectorId, row.externalId).catch(() => null)
        if (meta?.trashed) {
            await retireFolder(row)
            continue
        }
        return { folder: row, created: false }
    }
    const pending = making.get(s.engagementId)
    if (pending) return { folder: await pending, created: false }
    const creating = createMemoFolder(s, actorUserId).finally(() => making.delete(s.engagementId))
    making.set(s.engagementId, creating)
    const folder = await creating
    // Another server may have made one at the same moment: the oldest marked folder is the one.
    const oldest = (await markedFolders(s.engagementId)).find((r) => !isRetired(r.settings))
    return { folder: oldest ?? folder, created: true }
}

/** The memos folder, made if missing and internal only either way. */
export async function ensureMemoFolder(s: MemoStorage, actorUserId: string): Promise<{ folder: FolderRow; created: boolean; warning: string | null }> {
    const { folder, created } = await findOrMakeFolder(s, actorUserId)
    const warning = await keepInternalOnly(s.engagementId, folder, actorUserId)
    return { folder, created, warning }
}

// ── Saving ────────────────────────────────────────────────────────────────────────────────────

export interface SaveMemoInput {
    engagementId: string
    title: string
    date: string
    body: string
    source: MemoSource
    durationMinutes: number | null
    speakers: number | null
    author: { userId: string; name: string; firstName: string }
}

export interface SavedMemo {
    memo: MemoListItem
    fileName: string
    /** Saved, but storage kept someone's access to the folder. */
    warning?: string
}

/** Names already in the folder, in storage and in the database, so a new memo never takes one. */
async function namesIn(s: MemoStorage, folderId: string): Promise<string[]> {
    const [stored, indexed] = await Promise.all([
        s.storage.listFolderChildren(s.connectorId, folderId).catch((e: unknown) => { throw memoStorageFailure(e, s.provider) }),
        prisma.engagementDocument.findMany({ where: { engagementId: s.engagementId, parentId: folderId }, select: { fileName: true } }),
    ])
    return [...stored.map((f) => f.name), ...indexed.map((r) => r.fileName)]
}

/** Writes the memo's file into the memos folder (made first if need be), and indexes it. */
export async function saveMemo(input: SaveMemoInput): Promise<SavedMemo> {
    const s = await memoStorageFor(input.engagementId)
    await assertWithinDocumentCap(s.firmId, 1)

    const ensured = await ensureMemoFolder(s, input.author.userId)
    let { folder, warning } = ensured
    const markdown = memoMarkdown({ title: input.title, date: input.date, authorName: input.author.name, body: input.body })
    const bytes = Buffer.from(markdown, 'utf-8')

    const write = async (into: FolderRow) => {
        // Listed first: OneDrive writes by path, so a name already there would be overwritten.
        const fileName = memoFileName(input.date, input.title, await namesIn(s, into.externalId))
        try {
            const { id } = await s.content.createFile(s.connectorId, into.externalId, fileName, bytes, MEMO_MIME)
            return { id, fileName }
        } catch (e) {
            throw memoStorageFailure(e, s.provider)
        }
    }

    let written: { id: string; fileName: string }
    try {
        written = await write(folder)
    } catch (e) {
        // The marked folder was deleted in storage: retire it and make a new one, once.
        if (ensured.created || !(e instanceof StorageFailure) || e.reason !== 'not_found') throw e
        await retireFolder(folder)
        ;({ folder, warning } = await ensureMemoFolder(s, input.author.userId))
        written = await write(folder)
    }

    const now = new Date().toISOString()
    const memo: MemoSettings = {
        date: input.date,
        title: input.title,
        authorUserId: input.author.userId,
        authorName: input.author.name,
        authorFirstName: input.author.firstName,
        source: input.source,
        durationMinutes: input.source === 'transcript' ? input.durationMinutes : null,
        speakers: input.source === 'transcript' ? input.speakers : null,
        createdAt: now,
        applied: [],
        review: null,
    }
    // Internal only on its own too, so moving it out of the folder doesn't open it.
    const settings = { memo, lock: { type: 'private' } } as object

    const row = await prisma.engagementDocument.upsert({
        where: { engagementId_firmId_externalId: { engagementId: s.engagementId, firmId: s.firmId, externalId: written.id } },
        update: { settings, parentId: folder.externalId, fileName: written.fileName },
        create: {
            engagementId: s.engagementId,
            firmId: s.firmId,
            clientId: s.clientId,
            externalId: written.id,
            connectorId: s.connectorId,
            parentId: folder.externalId,
            fileName: written.fileName,
            mimeType: MEMO_MIME,
            isFolder: false,
            fileSize: BigInt(bytes.byteLength),
            createdBy: input.author.userId,
            updatedBy: input.author.userId,
            metadata: { modifiedTime: now, mimeType: MEMO_MIME, size: String(bytes.byteLength) },
            settings,
        },
        select: { id: true, docId: true, fileName: true, createdAt: true },
    })

    let docId = row.docId
    if (!docId) docId = await assignDocId(row.id, s.engagementId, s.engagementName).catch(() => null)

    audit(AUDIT_EVENT.DOCUMENT_CREATED)
        .firm(s.firmId).client(s.clientId ?? undefined).engagement(s.engagementId)
        .actor(input.author.userId).scope(AUDIT_SCOPE.DOCUMENT)
        .meta({ fileName: written.fileName, externalId: written.id, parentId: folder.externalId, memo: true })
        .fireAndForget()

    return {
        memo: memoListItem({ ...row, docId }, memo),
        fileName: written.fileName,
        ...(warning ? { warning: `Saved and internal only, but ${warning}` } : {}),
    }
}

// ── Listing ───────────────────────────────────────────────────────────────────────────────────

/** This engagement's memos, newest call first, from the database alone. */
export async function listMemos(engagementId: string): Promise<MemoListItem[]> {
    const folders = await markedFolders(engagementId)
    if (folders.length === 0) return []
    const rows = await prisma.engagementDocument.findMany({
        where: {
            engagementId,
            isFolder: false,
            status: { not: 'ARCHIVED' },
            parentId: { in: folders.map((f) => f.externalId) },
        },
        select: { id: true, docId: true, fileName: true, createdAt: true, settings: true },
    })
    const raidWaiting = await raidSuggestedByMemo(engagementId, rows.map((r) => r.id))
    return rows
        .flatMap((r) => {
            const memo = parseMemoSettings(r.settings)
            return memo ? [memoListItem(r, memo, raidWaiting.get(r.id) ?? 0)] : []
        })
        .sort(byNewestMemo)
}

/** RAID suggestions still waiting, by the memo they came from (§13). */
async function raidSuggestedByMemo(engagementId: string, memoIds: string[]): Promise<Map<string, number>> {
    if (memoIds.length === 0) return new Map()
    const groups = await prisma.engagementRaidItem.groupBy({
        by: ['sourceRef'],
        where: { engagementId, status: 'SUGGESTED', sourceKind: 'MEMO', sourceRef: { in: memoIds } },
        _count: { _all: true },
    })
    return new Map(groups.flatMap((g) => (g.sourceRef ? [[g.sourceRef, g._count._all] as [string, number]] : [])))
}

// ── A memo for Brio ───────────────────────────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const MEMO_NOT_FOUND = 'This memo was not found in this engagement. Refresh the list and try again.'

interface MemoRow {
    id: string
    externalId: string
    connectorId: string | null
    memo: MemoSettings
}

/**
 * A memo of this engagement: a file whose row says it's a memo and that sits in a memos folder. Anything
 * else, including another engagement's memo, is not found.
 */
export async function findMemo(engagementId: string, documentId: unknown): Promise<MemoRow | null> {
    if (typeof documentId !== 'string' || !UUID.test(documentId)) return null
    const doc = await prisma.engagementDocument.findFirst({
        where: { id: documentId, engagementId, isFolder: false, status: { not: 'ARCHIVED' } },
        select: { id: true, externalId: true, parentId: true, connectorId: true, settings: true },
    })
    const memo = doc ? parseMemoSettings(doc.settings) : null
    if (!doc || !memo || !doc.parentId) return null
    const folder = await prisma.engagementDocument.findFirst({
        where: { engagementId, externalId: doc.parentId, isFolder: true },
        select: { settings: true },
    })
    if (!folder || !isMemoFolder(folder.settings)) return null
    return { id: doc.id, externalId: doc.externalId, connectorId: doc.connectorId, memo }
}

export type MemoText =
    | { ok: true; text: string; memo: MemoSettings & { id: string } }
    | { ok: false; status: number; error: string }

/**
 * The text of one memo, for "Find actions", and for the Memos pane to show.
 *
 * This is the ONE place Brio reads a file's contents. Only a memo file of this engagement (findMemo), and
 * when it's added (lib/memos/memo-review.ts, §13) or when a person identifies its action items with the
 * sparkle; the text goes to the model for that one call and is
 * neither stored nor indexed. Every other Brio feature works from metadata (INDEX_DOCUMENT_TEXT stays false).
 *
 * The Memos pane reads it through the same function (memos/[documentId]/content) to show the memo to the
 * person who opened it: that text goes to their browser only, never to Brio, and isn't stored either.
 */
export async function readMemoText(engagementId: string, documentId: unknown): Promise<MemoText> {
    const found = await findMemo(engagementId, documentId)
    if (!found) return { ok: false, status: 404, error: MEMO_NOT_FOUND }

    const engagement = await prisma.engagement.findUnique({
        where: { id: engagementId },
        select: { client: { select: { connectorId: true } } },
    })
    const connectorId = found.connectorId ?? engagement?.client?.connectorId ?? null
    if (!connectorId) return { ok: false, status: 409, error: NO_STORAGE_MESSAGE }
    const connector = await prisma.connector.findUnique({ where: { id: connectorId }, select: { type: true } })
    const provider = providerOf(connector?.type)

    try {
        const content = await getContentAdapter(connectorId)
        if (!content) return { ok: false, status: 409, error: `${provider} can't be read from here. Reconnect it, then try again.` }
        const { stream } = await content.getRenderableContent(connectorId, found.externalId, 'native')
        const bytes = Buffer.isBuffer(stream) ? stream : Buffer.from(await new Response(stream).arrayBuffer())
        if (bytes.byteLength > MAX_MEMO_BYTES) {
            return { ok: false, status: 413, error: 'This memo has grown too long in storage to read at once. Split it into shorter memos.' }
        }
        return { ok: true, text: bytes.toString('utf-8'), memo: { ...found.memo, id: found.id } }
    } catch (e) {
        const failure = contentFailure(e, provider) ?? new StorageFailure('other', `Couldn't read this memo from ${provider}. Try again in a moment.`)
        logger.warn('[memos] reading a memo failed', { engagementId, documentId: found.id, reason: failure.reason })
        return { ok: false, status: failure.status, error: failure.message }
    }
}

/** How long the pane waits on storage for a memo's link before it opens the memo in Files instead. */
const WEB_URL_WAIT_MS = 4_000

/**
 * Where a memo opens in its storage, for the Memos pane's "Open in Google Drive" or "Open in OneDrive":
 * the link storage gives for that file (Drive's webViewLink, Graph's webUrl). Only for a memo of this
 * engagement (findMemo). Null when storage doesn't say, or doesn't answer in time; the pane then opens
 * the memo in Files. Reads metadata only, never the file.
 */
export async function memoWebUrl(engagementId: string, documentId: unknown): Promise<string | null> {
    const found = await findMemo(engagementId, documentId)
    if (!found) return null
    let connectorId = found.connectorId
    if (!connectorId) {
        const engagement = await prisma.engagement.findUnique({
            where: { id: engagementId },
            select: { client: { select: { connectorId: true } } },
        })
        connectorId = engagement?.client?.connectorId ?? null
    }
    if (!connectorId) return null

    let timer: ReturnType<typeof setTimeout> | undefined
    try {
        const permissions = await getPermissionAdapter(connectorId)
        if (!permissions) return null
        const late = new Promise<[]>((resolve) => { timer = setTimeout(() => resolve([]), WEB_URL_WAIT_MS) })
        const [meta] = await Promise.race([permissions.getFilesMetadata(connectorId, [found.externalId]), late])
        const url = meta?.webViewLink
        return typeof url === 'string' && /^https:\/\//i.test(url) ? url : null
    } catch (e) {
        logger.warn('[memos] a memo link was not found', { engagementId, documentId: found.id, error: e instanceof Error ? e.message : String(e) })
        return null
    } finally {
        if (timer) clearTimeout(timer)
    }
}

// ── Applied actions ───────────────────────────────────────────────────────────────────────────

/** Notes on the memo that an action from it was applied. Answers how many it has noted. */
export async function recordMemoApplied(engagementId: string, documentId: unknown, action: Omit<MemoAppliedAction, 'at'>): Promise<number | null> {
    const found = await findMemo(engagementId, documentId)
    if (!found) return null
    const row = await prisma.engagementDocument.findUnique({ where: { id: found.id }, select: { settings: true } })
    const settings = (row?.settings ?? {}) as Record<string, unknown>
    const memo = (settings.memo ?? {}) as Record<string, unknown>
    const applied = [...found.memo.applied, { ...action, at: new Date().toISOString() }].slice(-MEMO_APPLIED_MAX)
    await prisma.engagementDocument.update({
        where: { id: found.id },
        data: { settings: { ...settings, memo: { ...memo, applied } } as object },
    })
    return applied.length
}

// ── Action items waiting on a memo (§13) ──────────────────────────────────────────────────────

/** Keeps what Brio identified in a memo, quotes as anchors only (memoReviewOf), in place of the last. */
export async function writeMemoReview(engagementId: string, documentId: unknown, review: MemoReview): Promise<boolean> {
    const found = await findMemo(engagementId, documentId)
    if (!found) return false
    const row = await prisma.engagementDocument.findUnique({ where: { id: found.id }, select: { settings: true } })
    const settings = (row?.settings ?? {}) as Record<string, unknown>
    const memo = (settings.memo ?? {}) as Record<string, unknown>
    await prisma.engagementDocument.update({
        where: { id: found.id },
        data: { settings: { ...settings, memo: { ...memo, review } } as object },
    })
    return true
}

/** Dismiss all: nothing from the last identification waits on the memo any more. */
export async function dismissMemoReview(engagementId: string, documentId: unknown): Promise<boolean> {
    const found = await findMemo(engagementId, documentId)
    if (!found) return false
    if (!found.memo.review || found.memo.review.dismissed) return true
    return writeMemoReview(engagementId, found.id, { ...found.memo.review, dismissed: true })
}

