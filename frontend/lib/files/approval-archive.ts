import 'server-only'
import { randomUUID } from 'crypto'
import { ConnectorType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getContentAdapter, getPermissionAdapter, getStorageAdapter } from '@/lib/connectors/registry'
import { copyOneDriveFile } from '@/lib/connectors/adapters/onedrive-file-ops'
import { StorageFailure } from '@/lib/connectors/storage-failure'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { getLock, type LockBlock } from '@/lib/sharing-settings'
import { logger } from '@/lib/logger'
import { lockFileInStorage, StorageNotSupportedError, unlockFileInStorage, type DowngradedPermission } from './storage-lock'
import { archiveNameFor, type ApprovalRecord, type ApprovedVersion } from './approvals'

/**
 * Approving a document in its storage (.claude/plans/document-approval-record.md, sections 2, 3, 5):
 * lock the file, read which version is current, and copy that version into the engagement's
 * Archive folder. In that order, so the copy is exactly the version recorded. If any step fails the
 * approval is refused and the lock undone: an approval without its copy is the gap the record exists
 * to close. A lock storage refuses refuses the approval too (lib/files/storage-lock.ts, AP-1).
 *
 * What protects the copy itself (an owner-only Archive folder, read-only content on Google) is
 * reported as a warning when storage refuses it (P1-54): the approval stands, but the firm is told.
 */

export const ARCHIVE_FOLDER_NAME = 'Archive'

/** Approving couldn't reach the storage. `message` says what to do, for the lead who approved. */
export class ApprovalStorageError extends Error {
    constructor(message: string, readonly cause?: unknown) {
        super(message)
    }
}

const providerName = (type: ConnectorType | null | undefined) => (type === ConnectorType.ONEDRIVE ? 'OneDrive' : 'Google Drive')

const unreachable = (type: ConnectorType | null | undefined, cause?: unknown) =>
    new ApprovalStorageError(
        `Couldn't reach ${providerName(type)} to archive the approved version. Try again, or reconnect the storage.`,
        cause,
    )

// ─── The current version ────────────────────────────────────────────────────

type GoogleRevision = { id: string; modifiedTime: string; size?: string; lastModifyingUser?: { displayName?: string } }

/** Google: the head revision of an uploaded file; for Docs, Sheets and Slides, which have none, the newest revision. */
async function currentGoogleVersion(connectorId: string, externalId: string): Promise<ApprovedVersion> {
    const token = await googleDriveConnector.getAccessToken(connectorId)
    if (!token) throw new Error('No access token')
    const headers = { Authorization: `Bearer ${token}` }
    const fileRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(externalId)}?fields=headRevisionId,modifiedTime,size,lastModifyingUser(displayName)&supportsAllDrives=true`,
        { headers },
    )
    if (!fileRes.ok) throw new Error(`files.get ${fileRes.status}`)
    const file = await fileRes.json() as { headRevisionId?: string; modifiedTime: string; size?: string; lastModifyingUser?: { displayName?: string } }
    if (file.headRevisionId) {
        return { id: file.headRevisionId, savedAt: file.modifiedTime, ...(file.size ? { size: file.size } : {}), ...(file.lastModifyingUser?.displayName ? { savedBy: file.lastModifyingUser.displayName } : {}) }
    }
    // Revisions come oldest first, a page at a time: the last page's last one is current.
    let last: GoogleRevision | null = null
    let pageToken: string | undefined
    for (let page = 0; page < 50; page++) {
        const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(externalId)}/revisions?fields=nextPageToken,revisions(id,modifiedTime,size,lastModifyingUser(displayName))&pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`
        const res = await fetch(url, { headers })
        if (!res.ok) throw new Error(`revisions.list ${res.status}`)
        const data = await res.json() as { revisions?: GoogleRevision[]; nextPageToken?: string }
        if (data.revisions?.length) last = data.revisions[data.revisions.length - 1]
        if (!data.nextPageToken) break
        pageToken = data.nextPageToken
    }
    if (!last) throw new Error('No revisions')
    return { id: last.id, savedAt: last.modifiedTime, ...(last.size ? { size: last.size } : {}), ...(last.lastModifyingUser?.displayName ? { savedBy: last.lastModifyingUser.displayName } : {}) }
}

/**
 * OneDrive and SharePoint: the newest of Graph's versions, with its label ("3.0"). A library with
 * versioning off lists none; then the record names the file as it is now.
 */
async function currentOneDriveVersion(connectorId: string, externalId: string): Promise<ApprovedVersion> {
    const content = await getContentAdapter(connectorId)
    if (!content?.listVersions) throw new Error('No version list for this storage')
    const versions = await content.listVersions(connectorId, externalId)
    const newest = versions.at(-1)
    if (!newest) return { id: 'current', savedAt: new Date().toISOString() }
    return {
        id: newest.id,
        ...(newest.label ? { label: newest.label } : {}),
        savedAt: newest.modifiedTime,
        ...(newest.size ? { size: newest.size } : {}),
        ...(newest.lastModifyingUser?.displayName ? { savedBy: newest.lastModifyingUser.displayName } : {}),
    }
}

export async function readCurrentVersion(connectorId: string, type: ConnectorType, externalId: string): Promise<ApprovedVersion> {
    return type === ConnectorType.ONEDRIVE ? currentOneDriveVersion(connectorId, externalId) : currentGoogleVersion(connectorId, externalId)
}

// ─── The Archive folder ─────────────────────────────────────────────────────

/** The connector's settings for this firm: under `organizations[firmId]`, or at the root on older connectors. */
function orgSettingsOf(settings: Record<string, any>, firmId: string): { scope: 'org' | 'root'; value: Record<string, any> } {
    const org = settings.organizations?.[firmId]
    return org ? { scope: 'org', value: org } : { scope: 'root', value: settings }
}

/**
 * The engagement's Archive folder: beside General, Confidential and Staging, created on the first
 * approval, owner-only, and kept in the connector's `projectFolderSettings` as `archiveFolderId`.
 * The Files listings leave it out, as they do Staging; nothing crawls it (search and indexing start
 * from General, Confidential and Staging).
 */
export async function ensureArchiveFolder(
    connectorId: string,
    firmId: string,
    engagementSlug: string,
    warn: (warning: string) => void = () => {},
    provider: 'Google Drive' | 'OneDrive' = 'Google Drive',
): Promise<string> {
    const storage = await getStorageAdapter(connectorId)
    const connector = await prisma.connector.findUnique({ where: { id: connectorId }, select: { settings: true } })
    const settings = (connector?.settings as Record<string, any>) || {}
    const { value: org } = orgSettingsOf(settings, firmId)
    const ps = org.projectFolderSettings?.[engagementSlug] || {}

    if (ps.archiveFolderId && await storage.fileExists(connectorId, ps.archiveFolderId)) return ps.archiveFolderId

    const projectFolderId: string | null = org.projectFolderIds?.[engagementSlug]
        ?? (ps.generalFolderId ? await storage.getFileParent(connectorId, ps.generalFolderId) : null)
    if (!projectFolderId) throw new Error("No engagement folder in storage")

    const archiveFolderId = await storage.findOrCreateFolder(connectorId, projectFolderId, ARCHIVE_FOLDER_NAME)
    try {
        await storage.restrictFolderToOwnerOnly?.(connectorId, archiveFolderId)
    } catch (e) {
        logger.error('[approval] could not restrict the Archive folder', e as Error)
        warn(`The Archive folder couldn't be made owner-only in ${provider}, so people with access to the engagement's folder can open the archive copy.`)
    }

    // Read again just before writing, so a settings change made meanwhile isn't lost.
    const fresh = await prisma.connector.findUnique({ where: { id: connectorId }, select: { settings: true } })
    const next = { ...((fresh?.settings as Record<string, any>) || {}) }
    const target = orgSettingsOf(next, firmId)
    const orgNext = { ...target.value }
    orgNext.projectFolderSettings = {
        ...(orgNext.projectFolderSettings || {}),
        [engagementSlug]: { ...(orgNext.projectFolderSettings?.[engagementSlug] || {}), archiveFolderId },
    }
    const written = target.scope === 'org'
        ? { ...next, organizations: { ...next.organizations, [firmId]: orgNext } }
        : orgNext
    await prisma.connector.update({ where: { id: connectorId }, data: { settings: written } })
    return archiveFolderId
}

// ─── Approving ──────────────────────────────────────────────────────────────

export interface ApprovalInStorage {
    record: ApprovalRecord
    /** The lock to record in `settings.lock`; null when the document was already locked. */
    lock: LockBlock | null
    /** What storage refused that doesn't undo the approval: the archive copy left editable, say. */
    warnings: string[]
}

/**
 * Lock, read, copy. A document already locked (finalized earlier, or private) keeps its lock as it
 * is. Throws ApprovalStorageError, with the lock undone, when storage can't be reached.
 */
export async function archiveApprovedVersion(input: {
    connectorId: string
    engagement: { firmId: string; slug: string }
    document: { externalId: string; fileName: string; settings: unknown }
    /** The deliverable it's in, for its subfolder in Archive. */
    deliverableName: string | null
    actorUserId: string
}): Promise<ApprovalInStorage> {
    const { connectorId, engagement, document, deliverableName, actorUserId } = input
    const connector = await prisma.connector.findUnique({ where: { id: connectorId }, select: { type: true } })
    const type = connector?.type ?? null
    if (!type) throw unreachable(type)

    const lockHere = !getLock(document.settings)
    let downgraded: DowngradedPermission[] = []
    if (lockHere) {
        try {
            downgraded = await lockFileInStorage(connectorId, document.externalId)
        } catch (e) {
            // A refused lock says who can still edit, and why (storage-lock.ts puts back what it changed).
            if (e instanceof StorageFailure) throw new ApprovalStorageError(`${e.message} It wasn't approved.`, e)
            if (e instanceof StorageNotSupportedError) throw new ApprovalStorageError(`${e.message} It wasn't approved.`, e)
            throw unreachable(type, e)
        }
    }

    const warnings: string[] = []
    const provider = providerName(type)
    try {
        const version = await readCurrentVersion(connectorId, type, document.externalId)
        const archiveFolderId = await ensureArchiveFolder(connectorId, engagement.firmId, engagement.slug, (w) => warnings.push(w), provider)
        const storage = await getStorageAdapter(connectorId)
        const parentId = deliverableName ? await storage.findOrCreateFolder(connectorId, archiveFolderId, deliverableName) : archiveFolderId
        const name = archiveNameFor(document.fileName, version)
        const copy = type === ConnectorType.ONEDRIVE
            ? await copyOneDriveFile(connectorId, document.externalId, parentId, name)
            : await googleDriveConnector.copyFile(connectorId, document.externalId, parentId, name)

        // The archive itself mustn't drift: on Google the copy is read-only. OneDrive has no read-only
        // content (always false there); its copy is kept by the owner-only Archive folder instead.
        if (type !== ConnectorType.ONEDRIVE) {
            let readOnly = false
            try {
                const permissions = await getPermissionAdapter(connectorId)
                readOnly = (await permissions?.setFileContentReadOnly(connectorId, copy.id, true)) === true
            } catch (e) {
                logger.error('[approval] could not make the Archive copy read-only', e as Error)
            }
            if (!readOnly) warnings.push(`Approved, but the archive copy couldn't be made read-only in ${provider}. Anyone who can edit the Archive folder can change it.`)
        }

        const now = new Date().toISOString()
        return {
            record: { id: randomUUID(), version, archived: { fileId: copy.id, name }, approvedAt: now, approvedBy: actorUserId },
            lock: lockHere ? { type: 'finalize', finalizedBy: actorUserId, finalizedAt: now, downgraded } : null,
            warnings,
        }
    } catch (e) {
        // The lock is undone; who couldn't be given edit access back is said, since nothing records them.
        let undoProblem: string | null = null
        if (lockHere) {
            const undone = await unlockFileInStorage(connectorId, document.externalId, downgraded).catch((err) => {
                logger.error('[approval] could not undo the lock', err as Error)
                return null
            })
            undoProblem = undone ? undone.problem : 'Its lock in storage could not be undone.'
            if (undoProblem) logger.error('[approval] could not fully undo the lock', new Error(undoProblem))
        }
        const also = undoProblem ? ` ${undoProblem}` : ''
        if (e instanceof ApprovalStorageError) throw new ApprovalStorageError(`${e.message}${also}`, e.cause)
        if (e instanceof StorageFailure) throw new ApprovalStorageError(`Couldn't archive the approved version. ${e.message}${also}`, e)
        const plain = unreachable(type, e)
        throw new ApprovalStorageError(`${plain.message}${also}`, e)
    }
}

/**
 * Undoes an approval made in storage that Firma couldn't record (P1-55): the lock is lifted and the
 * archive copy trashed, so a retry starts clean instead of making a second copy. True when all of it
 * was undone.
 */
export async function undoApprovalInStorage(connectorId: string, externalId: string, approval: ApprovalInStorage): Promise<boolean> {
    let undone = true
    if (approval.lock) {
        const outcome = await unlockFileInStorage(connectorId, externalId, (approval.lock.downgraded ?? []) as DowngradedPermission[]).catch(() => null)
        if (!outcome || outcome.problem) undone = false
    }
    try {
        const permissions = await getPermissionAdapter(connectorId)
        if (!permissions) throw new Error('No permission adapter')
        await permissions.trashFile(connectorId, approval.record.archived.fileId)
    } catch (e) {
        logger.error('[approval] could not trash the archive copy of an unrecorded approval', e as Error)
        undone = false
    }
    return undone
}

/**
 * Adds the approval to the document's record, and its lock, in one write: an append, so no other
 * settings write can drop it. Called after the stage has moved (the stage write rebuilds settings
 * from what it read).
 */
export async function recordApproval(documentId: string, approval: ApprovalInStorage): Promise<void> {
    await prisma.$executeRawUnsafe(
        `UPDATE platform.engagement_documents
         SET settings = jsonb_set(
               ${approval.lock ? `jsonb_set(COALESCE(settings, '{}'::jsonb), '{lock}', $3::jsonb)` : `COALESCE(settings, '{}'::jsonb)`},
               '{approvals}',
               COALESCE(settings->'approvals', '[]'::jsonb) || jsonb_build_array($2::jsonb)
             ),
             "updatedAt" = now()
         WHERE id = $1::uuid`,
        documentId,
        JSON.stringify(approval.record),
        ...(approval.lock ? [JSON.stringify(approval.lock)] : []),
    )
}
