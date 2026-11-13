import { inngest } from "./client";
import { prisma } from "@/lib/prisma";
import { googleDriveConnector } from "@/lib/google-drive-connector";
import { isDocumentPrivate } from "@/lib/sharing-settings";
import { getPermissionAdapter, getMigrationAdapter, getConnectorInstance } from "@/lib/connectors/registry";
import { markSharesRevoked, revokeSharePermissions, SHARE_TO_REVOKE_SELECT, type RevokeOutcome, type ShareToRevoke } from "@/lib/connectors/revoke-share-permissions";
import { revokeMemberFolderAccess, setFirmFolderAccess, type FolderAccessFailure } from "@/lib/connectors/firm-folder-access";
import { setMemberFileAccess, type FileAccessFailure } from "@/lib/connectors/member-file-access";
import { StorageFailure } from "@/lib/connectors/storage-failure";
import { notifyLeadsOfStorageAccess, type StorageAccessProblem } from "@/lib/storage-access-notice";
import { TRASH_UNDO_WINDOW_SECONDS, wasRestoredFromBin } from "@/lib/connectors/trash-undo";
import { parseSettingsFromDb } from "@/lib/sharing-settings";
import { logger } from "@/lib/logger";
import { DocumentSharingPermissionStatus, Prisma } from "@prisma/client";
import { engagementFoldersFor, grantEngagementDriveFolderAccess, type EngagementFolderName, type FolderGrantOutcome } from "@/lib/grant-engagement-drive-folder-access";
import { safeInngestSend } from "./client";
import { clientPath } from "@/lib/navigation/firm-paths";
import {
    setMaintenanceMode,
    setMigrationPending,
    setMigrationState,
    sendMaintenanceWarningToFirmMembers,
    createMigration,
    getActiveMigration,
    addMigrationFiles,
    updateMigrationStatus,
} from '@/lib/firm-maintenance'
import {
    getPlatformMaintenanceConfig,
    setPlatformMaintenanceConfig,
    getAllNonAdminUserEmails,
    sendPlatformMaintenanceEmail,
    sendPlatformMaintenanceNotification,
} from '@/lib/platform-maintenance'

// ---------------------------------------------------------------------------
// Search Indexing Functions
// ---------------------------------------------------------------------------

/**
 * Index a single file or folder for search (V2)
 */
/**
 * Search indexing and deletion share one small budget of concurrently running steps across the
 * environment. Each step holds database connections, and on 2026-10-29 a burst of them (one hit a
 * statement timeout) starved the Files page's requests of the pool. Over the limit, runs queue;
 * none is dropped, and a step.sleep (the Undo window) doesn't count.
 */
const SEARCH_INDEX_CONCURRENCY = { scope: 'env' as const, key: '"search-index"', limit: 3 }

export const indexFileForSearch = inngest.createFunction(
    { id: "index-file-for-search", triggers: [{ event: "file.index.requested" }], concurrency: SEARCH_INDEX_CONCURRENCY },
    async ({ event, step }) => {
        await step.run("index-file", async () => {
            const { SearchService } = await import("@/lib/services/search-service")
            await SearchService.indexFile({
                organizationId: event.data.organizationId,
                clientId: event.data.clientId ?? undefined,
                projectId: event.data.projectId ?? undefined,
                externalId: event.data.externalId,
                fileName: event.data.fileName,
                parentId: event.data.parentId ?? undefined,
                actorId: event.data.actorId ?? null,
            })
        })

        // Notify engagement leads when a file lands in the Staging folder
        await step.run("notify-staging-intake", async () => {
            const { projectId, parentId, organizationId, clientId, fileName, externalId } = event.data
            if (!projectId || !parentId || !organizationId) return
            if (event.data.isFolder) return

            try {
                const engagement = await prisma.engagement.findUnique({
                    where: { id: projectId },
                    select: { slug: true, firmId: true, clientId: true },
                })
                if (!engagement) return

                const connectorId = (await prisma.firm.findUnique({
                    where: { id: organizationId },
                    select: { connectorId: true },
                }))?.connectorId
                if (!connectorId) return

                const connector = await (prisma as any).connector.findUnique({
                    where: { id: connectorId },
                    select: { settings: true },
                })
                const stagingFolderId = (connector?.settings as any)
                    ?.projectFolderSettings?.[engagement.slug]?.stagingFolderId as string | undefined

                if (!stagingFolderId || parentId !== stagingFolderId) return

                // Not whoever put it there: no one is told of their own change
                const leads = await prisma.engagementMember.findMany({
                    where: { engagementId: projectId, role: 'eng_admin', ...(event.data.actorId ? { userId: { not: event.data.actorId } } : {}) },
                    select: { userId: true },
                })
                if (!leads.length) return

                // Look up document record for the id (may already exist from indexFile above)
                const doc = await prisma.engagementDocument.findFirst({
                    where: { engagementId: projectId, firmId: organizationId, externalId },
                    select: { id: true },
                })

                const rows = leads.map((l: { userId: string }) => ({
                    organizationId,
                    clientId: clientId ?? engagement.clientId,
                    projectId,
                    documentId: doc?.id ?? null,
                    userId: l.userId,
                    type: 'DOCUMENT_STAGING_INTAKE',
                    priority: 'INFO',
                    title: 'New file in Staging',
                    body: `"${fileName}" was uploaded to Staging and is awaiting review.`,
                    ctaUrl: null,
                    metadata: { externalId, fileName, stagingFolderId },
                    channels: { inApp: true, email: false },
                    dedupeKey: `staging-intake:${projectId}:${externalId}`,
                }))
                await (prisma as any).notification.createMany({ data: rows, skipDuplicates: true })
            } catch (e) {
                logger.warn('staging intake notification failed', e as Error)
            }
        })

        // Notify engagement leads when an EC/EV uploads a file for intake review
        await step.run("notify-general-intake", async () => {
            const { projectId, organizationId, clientId, fileName, externalId, uploadedBy } = event.data
            if (!event.data.isIntakeUpload) return
            if (!projectId || !organizationId || !uploadedBy) return

            try {
                const engagement = await prisma.engagement.findUnique({
                    where: { id: projectId },
                    select: { clientId: true },
                })

                const doc = await prisma.engagementDocument.findFirst({
                    where: { engagementId: projectId, firmId: organizationId, externalId },
                    select: { id: true },
                })

                const leads = await prisma.engagementMember.findMany({
                    where: { engagementId: projectId, role: { in: ['eng_admin', 'eng_member'] }, userId: { not: uploadedBy } },
                    select: { userId: true },
                })
                if (!leads.length) return

                const rows = leads.map((l: { userId: string }) => ({
                    organizationId,
                    clientId: clientId ?? engagement?.clientId ?? null,
                    projectId,
                    documentId: doc?.id ?? null,
                    userId: l.userId,
                    type: 'DOCUMENT_STAGING_INTAKE',
                    priority: 'INFO',
                    title: event.data.isFolder ? 'New folder pending review' : 'New file pending review',
                    body: event.data.isFolder
                        ? `Folder "${fileName}" was uploaded and is awaiting your approval.`
                        : `"${fileName}" was uploaded and is awaiting your approval.`,
                    ctaUrl: null,
                    metadata: { externalId, fileName, uploadedBy },
                    channels: { inApp: true, email: false },
                    dedupeKey: `intake-pending:${projectId}:${externalId}`,
                }))
                await (prisma as any).notification.createMany({ data: rows, skipDuplicates: true })

                // Reminders are created synchronously in the API routes (create-folder, index-file-intake)
                // to guarantee immediate visibility. Nothing to do here.
            } catch (e) {
                logger.warn('general intake notification failed', e as Error)
            }
        })

        return { externalId: event.data.externalId, fileName: event.data.fileName }
    }
)

/**
 * Index a batch of files/folders for search (V2)
 */
export const indexBatchForSearch = inngest.createFunction(
    { id: "index-batch-for-search", triggers: [{ event: "file.index.batch.requested" }], concurrency: SEARCH_INDEX_CONCURRENCY },
    async ({ event, step }) => {
        const { organizationId, clientId, projectId, files } = event.data
        const BATCH_SIZE = 10

        for (let i = 0; i < files.length; i += BATCH_SIZE) {
            const batch = files.slice(i, i + BATCH_SIZE)
            await step.run(`index-files-${i}`, async () => {
                const { SearchService } = await import("@/lib/services/search-service")
                for (const file of batch) {
                    await SearchService.indexFile({
                        organizationId,
                        clientId: clientId ?? undefined,
                        projectId: projectId ?? undefined,
                        externalId: file.externalId,
                        fileName: file.fileName,
                        parentId: file.parentId ?? undefined,
                        actorId: event.data.actorId ?? null,
                    })
                }
            })
        }

        return { indexed: files.length }
    }
)

/**
 * Recursively scan all files in a project's Drive folder tree and index them (V2)
 */
export const scanAndIndexProject = inngest.createFunction(
    { id: "scan-and-index-project", triggers: [{ event: "project.index.scan.requested" }], concurrency: SEARCH_INDEX_CONCURRENCY },
    async ({ event, step }) => {
        const { organizationId, clientId, projectId, connectorId, rootFolderIds: rawRootFolderIds } = event.data
        const rootFolderIds: string[] = Array.isArray(rawRootFolderIds) ? rawRootFolderIds : []

        if (rootFolderIds.length === 0) {
            logger.warn('scan-and-index-project: no rootFolderIds provided, skipping', 'Inngest', { organizationId, projectId })
            return { indexed: 0, skipped: true }
        }

        const allFiles = await step.run("discover-files", async () => {
            const files: { externalId: string; fileName: string; parentId: string | null }[] = []
            const queue = [...rootFolderIds]
            const visited = new Set<string>()
            const adapter = await getPermissionAdapter(connectorId)
            // A storage type with no file access can't be indexed: nothing to retry.
            if (!adapter) {
                logger.warn('scan-and-index-project: connector has no permission adapter, nothing indexed', 'Inngest', { connectorId, projectId })
                return files
            }

            // A read that fails throws, so this step fails and Inngest retries it. Skipping it left the
            // folder's files missing from search for good, with nothing to say so (P2-38). A folder
            // that's gone lists as empty on both storages, and doesn't fail the step.
            for (const folderId of rootFolderIds) {
                const meta = await adapter.getFileMetadata(connectorId, folderId)
                if (meta?.name) {
                    files.push({
                        externalId: folderId,
                        fileName: meta.name,
                        parentId: meta.parents?.[0] ?? null,
                    })
                }
            }

            while (queue.length > 0 && visited.size < 1000) {
                const folderId = queue.shift()!
                if (visited.has(folderId)) continue
                visited.add(folderId)

                const children = await adapter.listFiles(connectorId, folderId, 500)
                for (const child of children) {
                    if (!child.id || !child.name) continue
                    files.push({ externalId: child.id, fileName: child.name, parentId: folderId })
                    if (child.mimeType === 'application/vnd.google-apps.folder') {
                        queue.push(child.id)
                    }
                }
            }

            return files
        })

        if (allFiles.length === 0) return { indexed: 0, projectId }

        const BATCH_SIZE = 20
        for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
            const batch = allFiles.slice(i, i + BATCH_SIZE)
            await step.run(`index-batch-${i}`, async () => {
                const { SearchService } = await import("@/lib/services/search-service")
                for (const file of batch) {
                    // Skip FIRMA_PDF files (internal shared PDF copies that shouldn't be visible)
                    if (file.fileName.startsWith('[FIRMA_PDF]')) {
                        continue
                    }
                    await SearchService.indexFile({
                        organizationId,
                        clientId: clientId ?? undefined,
                        projectId: projectId ?? undefined,
                        externalId: file.externalId,
                        fileName: file.fileName,
                        parentId: file.parentId ?? undefined,
                    })
                }
            })
        }

        return { indexed: allFiles.length, projectId, organizationId }
    }
)

// ---------------------------------------------------------------------------
// Sandbox onboarding: Drive sample file uploads (offloaded from API to avoid timeouts)
// ---------------------------------------------------------------------------

type SandboxPopulateProject = {
    projectId: string
    projectName: string
    rootFolderId: string
    generalFolderId?: string
    stagingFolderId?: string
    confidentialFolderId?: string
}

/**
 * Populate sandbox project folders with sample files on Drive, then trigger search index scan.
 * Runs in background so create-sandbox API returns in <30s and avoids Vercel/DB timeouts.
 */
export const populateSandboxSampleFiles = inngest.createFunction(
    { id: "populate-sandbox-sample-files", triggers: [{ event: "sandbox.populate.sample-files.requested" }] },
    async ({ event, step }) => {
        const { organizationId, connectionId, projects } = event.data as {
            organizationId: string
            connectionId: string
            projects: SandboxPopulateProject[]
        }

        for (let i = 0; i < projects.length; i++) {
            const proj = projects[i]
            await step.run(`populate-project-${i}-${proj.projectId}`, async () => {
                const adapter = await googleDriveConnector.createGoogleDriveAdapter(connectionId)
                const { SampleFileService, DEFAULT_SAMPLE_FILES, SANDBOX_ENGAGEMENT_FOLDER_DATA } = await import("@/lib/services/sample-file-service-server")
                const subfoldersMap = [
                    { subName: "General" as const, subId: proj.generalFolderId ?? null },
                    { subName: "Staging" as const, subId: proj.stagingFolderId ?? null },
                    { subName: "Confidential" as const, subId: proj.confidentialFolderId ?? null },
                ]
                for (const { subName, subId } of subfoldersMap) {
                    if (!subId) continue
                    try {
                        const structure = SANDBOX_ENGAGEMENT_FOLDER_DATA[proj.projectName]?.[subName]
                        if (structure) {
                            await SampleFileService.createFolderStructure(adapter, connectionId, subId, structure)
                        } else if (DEFAULT_SAMPLE_FILES[subName]) {
                            await SampleFileService.createSampleFiles(adapter, connectionId, subId, DEFAULT_SAMPLE_FILES[subName])
                        }
                    } catch (e) {
                        logger.error(`Sandbox populate failed for ${proj.projectName}/${subName}`, e as Error)
                    }
                }
                safeInngestSend("project.index.scan.requested", {
                    organizationId,
                    projectId: proj.projectId,
                    connectorId: connectionId,
                    rootFolderIds: [proj.rootFolderId],
                })
                if (proj.generalFolderId) {
                    safeInngestSend("sandbox.seed.board-data.requested", {
                        organizationId,
                        projectId: proj.projectId,
                        generalFolderId: proj.generalFolderId,
                    })
                }
            })
        }

        return { populated: projects.length, organizationId }
    }
)


// ---------------------------------------------------------------------------
// Sandbox board data seeding: tag General subfolders as deliverables with varied statuses
// ---------------------------------------------------------------------------

/**
 * Statuses cycle in this order so demo boards always look live and varied.
 * Index 0 = approved (first subfolder looks done), then in_review, in_progress, to_do repeating.
 */
const BOARD_SEED_STATUS_CYCLE = ['approved', 'in_review', 'in_progress', 'to_do'] as const
type BoardSeedStatus = typeof BOARD_SEED_STATUS_CYCLE[number]

/**
 * After the Drive scan indexes engagement documents, tag General subfolders as deliverables
 * with varied board statuses so the sandbox Board view has meaningful demo data out of the box.
 * Sleeps 2 minutes to let the scan complete before querying indexed documents.
 */
export const seedSandboxDeliverables = inngest.createFunction(
    { id: "seed-sandbox-deliverables", triggers: [{ event: "sandbox.seed.board-data.requested" }] },
    async ({ event, step }) => {
        const { organizationId, projectId, generalFolderId } = event.data as {
            organizationId: string
            projectId: string
            generalFolderId: string
        }

        // Wait for the scan to index documents into the DB
        await step.sleep('wait-for-scan', '2m')

        await step.run('tag-deliverables', async () => {
            // Find direct children of the General folder that are themselves folders (the subfolders like 01_Discovery etc.)
            // These become the deliverable items on the board.
            const generalSubfolders = await prisma.engagementDocument.findMany({
                where: {
                    engagementId: projectId,
                    firmId: organizationId,
                    parentId: generalFolderId,
                    isFolder: true,
                },
                select: { id: true, fileName: true, settings: true },
                orderBy: { fileName: 'asc' },
            })

            // If no subfolders (flat file engagement), fall back to direct non-folder children of General
            const candidates = generalSubfolders.length > 0
                ? generalSubfolders
                : await prisma.engagementDocument.findMany({
                    where: {
                        engagementId: projectId,
                        firmId: organizationId,
                        parentId: generalFolderId,
                        isFolder: false,
                    },
                    select: { id: true, fileName: true, settings: true },
                    orderBy: { fileName: 'asc' },
                })

            if (candidates.length === 0) {
                logger.info('seedSandboxDeliverables: no candidates found, skipping', 'Inngest', { projectId, generalFolderId })
                return
            }

            const now = new Date().toISOString()

            for (let i = 0; i < candidates.length; i++) {
                const doc = candidates[i]
                const existing = parseSettingsFromDb(doc.settings)
                // Don't overwrite if already tagged as a deliverable
                if (existing.share?.createdAt) continue

                const status: BoardSeedStatus = BOARD_SEED_STATUS_CYCLE[i % BOARD_SEED_STATUS_CYCLE.length]

                const newSettings = {
                    ...(doc.settings as object || {}),
                    share: {
                        guest: { enabled: false, options: { publish: false, addWatermark: false, sharePdfOnly: false, allowDownload: false, sharedPdfDriveId: null } },
                        externalCollaborator: { enabled: false, options: { allowDownload: false } },
                        createdAt: now,
                        createdBy: null,
                        updatedAt: now,
                        updatedBy: null,
                        publishedVersionId: null,
                        publishedAt: null,
                        finalizedAt: status === 'approved' ? now : null,
                    },
                    activity: {
                        status,
                        updatedAt: now,
                        orderIndex: i,
                    },
                }

                await prisma.engagementDocument.update({
                    where: { id: doc.id },
                    data: { settings: newSettings },
                })
            }

            logger.info(`seedSandboxDeliverables: tagged ${candidates.length} deliverables`, 'Inngest', { projectId })
        })

        return { projectId, organizationId, generalFolderId }
    }
)


/**
 * How long a job waits before trying again what storage refused once: long enough for a rate limit or a
 * blip to pass, short enough that the Leads hear soon when it didn't.
 */
const STORAGE_RETRY_WAIT = "1m";

/** The step tools these helpers use, as Inngest passes them to a function. */
type JobStep = {
    run: <T>(id: string, fn: () => Promise<T> | T) => Promise<any>;
    sleep: (id: string, duration: string) => Promise<unknown>;
};

/** A sharing row, with what the notice to the Leads names. */
const SHARE_NOTICE_SELECT = {
    id: true,
    userId: true,
    connectorPermissionId: true,
    document: { select: { id: true, fileName: true, isFolder: true } },
} as const;

/** The file permissions still standing on these rows, as problems for the Leads' notice. */
async function shareProblems(rowIds: string[], reasons: Record<string, string>): Promise<StorageAccessProblem[]> {
    if (rowIds.length === 0) return [];
    const rows = await prisma.engagementDocumentSharingUser.findMany({ where: { id: { in: rowIds } }, select: SHARE_NOTICE_SELECT });
    return rows.map((row) => ({
        kind: "revoke" as const,
        userId: row.userId,
        itemName: row.document?.fileName || "a file",
        itemType: row.document?.isFolder ? "folder" as const : "file" as const,
        documentId: row.document?.id ?? null,
        reason: reasons[row.id] ?? "The storage refused to remove it.",
        key: row.connectorPermissionId ?? row.id,
    }));
}

/**
 * Takes back the rows' storage permissions and marks them revoked in Firma. What storage refuses is tried
 * once more after a wait; what still stands keeps its permission id (markSharesRevoked), so a later
 * revoke retries it, and the engagement's Leads are told what, who and why.
 */
async function revokeSharesWithRetry(
    step: JobStep,
    engagementId: string,
    shares: ShareToRevoke[],
    where: Prisma.EngagementDocumentSharingUserWhereInput,
): Promise<RevokeOutcome> {
    const first: RevokeOutcome = await step.run("revoke-permissions", () => revokeSharePermissions(engagementId, shares));
    await step.run("mark-shares-revoked", () => markSharesRevoked(where, first.failed));
    if (first.failed.length === 0) return first;

    await step.sleep("wait-before-retrying-revoke", STORAGE_RETRY_WAIT);
    // Only rows still revoked in Firma: one granted again meanwhile was granted on purpose.
    const again: ShareToRevoke[] = await step.run("find-shares-to-retry", () => prisma.engagementDocumentSharingUser.findMany({
        where: {
            id: { in: first.failed },
            connectorPermissionId: { not: null },
            sharingPermissionStatus: DocumentSharingPermissionStatus.REVOKED,
        },
        select: SHARE_TO_REVOKE_SELECT,
    }));
    if (again.length === 0) return { ...first, failed: [], reasons: {} };

    const second: RevokeOutcome = await step.run("retry-revoke-permissions", () => revokeSharePermissions(engagementId, again));
    await step.run("mark-retried-shares-revoked", () => markSharesRevoked({ id: { in: again.map((s) => s.id) } }, second.failed));
    if (second.failed.length > 0) {
        await step.run("tell-leads-access-stands", async () =>
            notifyLeadsOfStorageAccess(engagementId, await shareProblems(second.failed, second.reasons)));
    }
    return { revoked: first.revoked + second.revoked, failed: second.failed, unreachable: second.unreachable, reasons: second.reasons };
}

/** A person's address, for the folder calls that work by email. */
async function emailOfUser(userId: string): Promise<string | null> {
    const rows = await prisma.$queryRaw<Array<{ email: string | null }>>(
        Prisma.sql`SELECT email FROM auth.users WHERE id = ${userId}::uuid`
    );
    return rows[0]?.email ?? null;
}

/**
 * Takes back folder grants a member's role no longer has, once more after a wait for what storage refused,
 * then tells the Leads what still stands.
 */
async function revokeFoldersWithRetry(
    step: JobStep,
    engagementId: string,
    userId: string,
    folders: EngagementFolderName[],
): Promise<{ revoked: EngagementFolderName[]; failures: FolderAccessFailure[] }> {
    const email: string | null = await step.run("find-member-email", () => emailOfUser(userId));
    if (!email) return { revoked: [], failures: [] };

    const first = await step.run("revoke-folder-access", () => revokeMemberFolderAccess(engagementId, { userId, email }, folders));
    if (first.failures.length === 0) return first;

    await step.sleep("wait-before-retrying-folders", STORAGE_RETRY_WAIT);
    const second = await step.run("retry-revoke-folder-access", () =>
        revokeMemberFolderAccess(engagementId, { userId, email }, first.failures.map((f: FolderAccessFailure) => f.folder)));
    if (second.failures.length > 0) {
        await step.run("tell-leads-folder-access-stands", () => notifyLeadsOfStorageAccess(engagementId, second.failures.map((f: FolderAccessFailure) => ({
            kind: "folder_revoke" as const,
            userId,
            itemName: f.folder,
            itemType: "folder" as const,
            reason: f.reason,
            key: f.folderId || f.folder,
        }))));
    }
    return { revoked: [...first.revoked, ...second.revoked], failures: second.failures };
}

/**
 * What a member's rows on trashed documents still hold, taken back before the rows go. Nothing can retry
 * it once the rows are deleted, so what storage refuses is logged with the file and the person, and the
 * Leads are told: restoring the item in storage would bring that access back with it.
 */
async function revokeTrashedDocumentShares(docIds: string[]): Promise<void> {
    const shares = await prisma.engagementDocumentSharingUser.findMany({
        where: { projectDocumentId: { in: docIds }, connectorPermissionId: { not: null } },
        select: {
            id: true,
            engagementId: true,
            connectorPermissionId: true,
            document: { select: { externalId: true, connectorId: true } },
        },
    });
    const byEngagement = new Map<string, typeof shares>();
    for (const share of shares) byEngagement.set(share.engagementId, [...(byEngagement.get(share.engagementId) ?? []), share]);

    for (const [engagementId, group] of Array.from(byEngagement.entries())) {
        const outcome = await revokeSharePermissions(engagementId, group);
        if (outcome.failed.length === 0) continue;
        const problems = (await shareProblems(outcome.failed, outcome.reasons))
            // The documents are about to be deleted: the notice can't link to them.
            .map((p) => ({ ...p, documentId: null }));
        logger.warn("Trash cleanup could not take back storage access", {
            engagementId,
            stillStanding: problems.map((p) => ({ file: p.itemName, userId: p.userId, reason: p.reason })),
        });
        await notifyLeadsOfStorageAccess(engagementId, problems);
    }
}

/**
 * Reconciliation for file deletion (V2)
 */
export const reconcileFileDeletion = inngest.createFunction(
    { id: "reconcile-file-deletion", triggers: [{ event: "file.delete.requested" }], concurrency: SEARCH_INDEX_CONCURRENCY },
    async ({ event, step }) => {
        const { organizationId, externalId, connectorId: trashedVia, undoable } = event.data

        // Moved to the trash from the Files list: wait out the Undo window, and keep everything if
        // the file came back out of the trash meanwhile. A check storage couldn't answer fails the
        // step, and Inngest tries it again later: the records stay until there's an answer.
        if (undoable && trashedVia) {
            await step.sleep("undo-window", `${TRASH_UNDO_WINDOW_SECONDS}s`)
            const restored = await step.run("check-still-in-bin", () => wasRestoredFromBin(trashedVia, externalId))
            if (restored) return { externalId, status: "restored" }
        }

        await step.run("remove-from-search-index", async () => {
            const { SearchService } = await import("@/lib/services/search-service")
            await SearchService.removeFile(organizationId, externalId)
        })

        await step.run("cleanup-sharing-records", async () => {
            const docs = await prisma.engagementDocument.findMany({
                where: { firmId: organizationId, externalId },
                select: { id: true, settings: true, connectorId: true, firmId: true, engagementId: true },
            })
            if (docs.length === 0) return

            const docIds = docs.map((d) => d.id)

            // Every permission a row still holds, through the connector it was granted on.
            await revokeTrashedDocumentShares(docIds)

            // Trash system PDF copies (guest sharePdfOnly) — one per doc, if present
            const connectorId = docs[0].connectorId ?? (await prisma.firm.findUnique({
                where: { id: organizationId },
                select: { connectorId: true },
            }))?.connectorId
            const adapter = connectorId ? await getPermissionAdapter(connectorId) : null
            if (connectorId && adapter) {
                await Promise.allSettled(
                    docs
                        .map((d) => parseSettingsFromDb(d.settings)?.share?.guest?.options?.sharedPdfDriveId)
                        .filter((pdfId): pdfId is string => !!pdfId)
                        .map((pdfId) => adapter.trashFile(connectorId, pdfId))
                )
            }

            // Delete sharing user records (must happen before document delete to avoid FK violation)
            await prisma.engagementDocumentSharingUser.deleteMany({
                where: { projectDocumentId: { in: docIds } },
            })

            // Fire document.deleted before deleting — cleanupDocumentReminders fetches
            // comment IDs from DB, so it must run before the FK cascade drops them.
            await Promise.allSettled(
                docs.map((d) =>
                    safeInngestSend('document.deleted', {
                        documentId: d.id,
                        engagementId: d.engagementId,
                    })
                )
            )

            // Delete the engagement document records — file is gone from Drive
            await prisma.engagementDocument.deleteMany({
                where: { id: { in: docIds } },
            }).catch(() => {})
        })

        return { externalId, status: "reconciled" }
    }
)

/**
 * Reconciliation for folder deletion (V2)
 */
export const reconcileFolderDeletion = inngest.createFunction(
    { id: "reconcile-folder-deletion", triggers: [{ event: "folder.delete.requested" }], concurrency: SEARCH_INDEX_CONCURRENCY },
    async ({ event, step }) => {
        const { organizationId, externalId, connectorId: trashedVia, undoable } = event.data

        // As for files: wait out the Undo window, and keep everything if the folder came back.
        if (undoable && trashedVia) {
            await step.sleep("undo-window", `${TRASH_UNDO_WINDOW_SECONDS}s`)
            const restored = await step.run("check-still-in-bin", () => wasRestoredFromBin(trashedVia, externalId))
            if (restored) return { externalId, status: "restored" }
        }

        await step.run("remove-folder-from-search-index", async () => {
            const { SearchService } = await import("@/lib/services/search-service")
            await SearchService.removeFile(organizationId, externalId)
        })

        await step.run("cleanup-folder-sharing-records", async () => {
            const doc = await prisma.engagementDocument.findFirst({
                where: { firmId: organizationId, externalId },
                select: { id: true, settings: true, connectorId: true, engagementId: true },
            })
            if (!doc) return

            // Every permission a row still holds, through the connector it was granted on.
            await revokeTrashedDocumentShares([doc.id])

            // Delete sharing user records (must happen before document delete to avoid FK violation)
            await prisma.engagementDocumentSharingUser.deleteMany({
                where: { projectDocumentId: doc.id },
            })

            // Fire document.deleted before deleting — cleanupDocumentReminders fetches
            // comment IDs from DB, so it must run before the FK cascade drops them.
            await safeInngestSend('document.deleted', {
                documentId: doc.id,
                engagementId: doc.engagementId,
            })

            // Delete the engagement document record — folder is gone from Drive
            await prisma.engagementDocument.delete({
                where: { id: doc.id },
            }).catch(() => {})
        })

        return { externalId, status: "reconciled" }
    }
)

export const revokeProjectSharing = inngest.createFunction(
    { id: "revoke-project-sharing", triggers: [{ event: "project/archived" }] },
    async ({ event, step }) => {
        const { projectId } = event.data;

        const shares = await step.run("fetch-shares", async () => {
            return await prisma.engagementDocumentSharingUser.findMany({
                where: {
                    engagementId: projectId,
                    // A row keeping a permission id is one an earlier revoke couldn't finish: this retries it.
                    OR: [
                        { sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED },
                        { connectorPermissionId: { not: null } },
                    ],
                },
                select: SHARE_TO_REVOKE_SELECT,
            });
        });

        const revokeResults: RevokeOutcome = shares.length > 0
            ? await revokeSharesWithRetry(step, projectId, shares, { engagementId: projectId })
            : { revoked: 0, failed: [], unreachable: 0, reasons: {} };

        const folderAccess = await step.run("downgrade-internal-member-folder-access", () => setFirmFolderAccess(projectId, 'read_only'));

        await step.run("clear-share-configs", async () => {
            const documents = await prisma.engagementDocument.findMany({
                where: { engagementId: projectId, slug: { not: null } },
                select: { id: true, settings: true },
            });

            if (documents.length === 0) return { cleared: 0 };

            const updatePromises = documents.map((doc) => {
                const settings = (doc.settings as Record<string, any>) || {};
                const clearedSettings = {
                    ...settings,
                    share: {
                        ...settings.share,
                        externalCollaborator: { enabled: false },
                        guest: { enabled: false },
                    },
                };

                return prisma.engagementDocument.update({
                    where: { id: doc.id },
                    data: {
                        slug: null,
                        settings: clearedSettings,
                    },
                });
            });

            await Promise.all(updatePromises);
            return { cleared: documents.length };
        });

        return { message: "Revoked project permissions", results: revokeResults, folderAccess, projectId };
    }
);

/** Folder failures as problems for the Leads' notice, for Completed and reopen. */
function folderAccessProblems(kind: "read_only" | "restore", failures: FolderAccessFailure[]): StorageAccessProblem[] {
    return failures.map((f) => ({ kind, userId: f.userId, itemName: f.folder, itemType: "folder" as const, reason: f.reason, key: f.folderId }));
}

function fileAccessProblems(kind: "read_only" | "restore", failures: FileAccessFailure[]): StorageAccessProblem[] {
    return failures.map((f) => ({ kind, userId: f.userId, itemName: f.fileName, itemType: "file" as const, documentId: f.documentId, reason: f.reason, key: f.permissionId }));
}

/**
 * A status change's access change, tried once more after a wait if storage refused any of it (both
 * helpers skip what's already right), then reported to the Leads.
 */
async function changeAccessWithRetry<F>(
    step: JobStep,
    projectId: string,
    label: string,
    change: () => Promise<{ changed: number; failed: number; failures: F[] }>,
    problems: (failures: F[]) => StorageAccessProblem[],
) {
    const first = await step.run(label, change);
    if (first.failed === 0) return first;
    await step.sleep(`wait-before-retrying-${label}`, STORAGE_RETRY_WAIT);
    const second = await step.run(`retry-${label}`, change);
    if (second.failed > 0) {
        await step.run(`tell-leads-${label}`, () => notifyLeadsOfStorageAccess(projectId, problems(second.failures)));
    }
    return second;
}

/**
 * An engagement marked Completed is read-only in Drive too, and reopening it gives write back. These two
 * are the firm's folders; the permissions on the files themselves, for any role, are the pair below.
 */
export const restrictFirmFoldersOnCompletion = inngest.createFunction(
    { id: "restrict-firm-folders-on-completion", triggers: [{ event: "engagement.completed" }] },
    async ({ event, step }) => changeAccessWithRetry(step, event.data.projectId, "downgrade-firm-folder-access",
        () => setFirmFolderAccess(event.data.projectId, 'read_only'), (f) => folderAccessProblems("read_only", f))
);

export const restoreFirmFoldersOnReopen = inngest.createFunction(
    { id: "restore-firm-folders-on-reopen", triggers: [{ event: "engagement.reopened" }] },
    async ({ event, step }) => changeAccessWithRetry(step, event.data.projectId, "restore-firm-folder-access",
        () => setFirmFolderAccess(event.data.projectId, 'restore'), (f) => folderAccessProblems("restore", f))
);

/** The permissions a secure open granted on the files themselves: see setMemberFileAccess. */
export const restrictMemberFilesOnCompletion = inngest.createFunction(
    { id: "restrict-member-files-on-completion", triggers: [{ event: "engagement.completed" }] },
    async ({ event, step }) => changeAccessWithRetry(step, event.data.projectId, "downgrade-member-file-access",
        () => setMemberFileAccess(event.data.projectId, 'read_only'), (f) => fileAccessProblems("read_only", f)),
);

export const restoreMemberFilesOnReopen = inngest.createFunction(
    { id: "restore-member-files-on-reopen", triggers: [{ event: "engagement.reopened" }] },
    async ({ event, step }) => changeAccessWithRetry(step, event.data.projectId, "restore-member-file-access",
        () => setMemberFileAccess(event.data.projectId, 'restore'), (f) => fileAccessProblems("restore", f)),
);

/**
 * Revoke permissions when sharing settings updated (V2)
 *
 * The rows were marked revoked when the role was switched off, and kept their permission ids for this
 * (lib/sync-document-sharing.ts): the id is what's revoked here.
 */
export const revokeByDisabledPersona = inngest.createFunction(
    { id: "revoke-by-disabled-persona", triggers: [{ event: "sharing.settings.updated" }] },
    async ({ event, step }) => {
        const { projectId, sharingId, disabledPersonas } = event.data;

        const usersToRevoke = await step.run("fetch-sharing-users", async () => {
            const doc = await prisma.engagementDocument.findUnique({
                where: { id: sharingId },
                include: { sharingUsers: true }
            });

            if (!doc) return [];

            // Switched back on before this ran, and granted again by the sync: that permission is wanted.
            const share = (doc.settings as { share?: { guest?: { enabled?: boolean }; externalCollaborator?: { enabled?: boolean } } } | null)?.share;
            const onNow = { eng_viewer: share?.guest?.enabled === true, eng_ext_collaborator: share?.externalCollaborator?.enabled === true };

            const usersForRevocation = [];
            for (const user of doc.sharingUsers) {
                const projectMember = await prisma.engagementMember.findFirst({
                    where: { engagementId: projectId, userId: user.userId }
                });

                const personaSlug = projectMember?.role;
                const shouldRevoke =
                    (disabledPersonas.includes('guest') && personaSlug === 'eng_viewer') ||
                    (disabledPersonas.includes('externalCollaborator') && personaSlug === 'eng_ext_collaborator');
                const grantedAgain = user.sharingPermissionStatus !== DocumentSharingPermissionStatus.REVOKED
                    && (personaSlug === 'eng_viewer' || personaSlug === 'eng_ext_collaborator')
                    && onNow[personaSlug];

                if (shouldRevoke && user.connectorPermissionId && !grantedAgain) {
                    usersForRevocation.push({
                        id: user.id,
                        connectorPermissionId: user.connectorPermissionId,
                        document: { externalId: doc.externalId, connectorId: doc.connectorId },
                    });
                }
            }
            return usersForRevocation;
        });

        if (usersToRevoke.length === 0) return { message: "No users to revoke" };

        const revokeResults = await revokeSharesWithRetry(step, projectId, usersToRevoke, { id: { in: usersToRevoke.map((u: { id: string }) => u.id) } });

        return { message: "Revoked disabled personas", results: revokeResults };
    }
);

/**
 * Revoke document-level Drive permissions when an EC/EV member is removed from a project.
 *
 * Nothing sends `project.member.removed`: removeMember (lib/actions/members.ts) takes access back itself,
 * file and folder, before the member's rows go, and reports what storage refused. Its event is
 * `engagement.member.removed`, which only cleans up reminders. Kept registered, unsent, so an event
 * already queued under this name still runs.
 */
export const revokeByRemovedMember = inngest.createFunction(
    { id: "revoke-by-removed-member", triggers: [{ event: "project.member.removed" }] },
    async ({ event, step }) => {
        const { projectId, userId, personaSlug } = event.data;

        const revokablePersonas = ['eng_viewer', 'eng_ext_collaborator'];
        if (!revokablePersonas.includes(personaSlug)) return { message: "Non-external role — no revocation needed" };

        const sharesToRevoke = await step.run("find-shares-to-revoke", async () => {
            return prisma.engagementDocumentSharingUser.findMany({
                where: {
                    engagementId: projectId,
                    userId,
                    OR: [
                        { sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED },
                        { connectorPermissionId: { not: null } },
                    ],
                },
                select: SHARE_TO_REVOKE_SELECT,
            });
        });

        if (sharesToRevoke.length === 0) return { message: "No shares to revoke" };

        const revokeResults = await revokeSharesWithRetry(step, projectId, sharesToRevoke, { id: { in: sharesToRevoke.map((s: { id: string }) => s.id) } });

        return { message: "Revoked for removed member", revokedCount: revokeResults.revoked, results: revokeResults };
    }
);

/**
 * A role change changes storage access to match the new role.
 *
 * Folders: a Lead has General, Confidential and Staging; a Contributor · Full Access, General; a
 * Contributor · Limited Access or Reviewer, none (they get access file by file). Lowering takes back the
 * folders the new role doesn't have. Raising is the grant job's (project.member.added).
 *
 * Files: a client role's per-file permissions are all taken back when the role changes, as before, and
 * so are a firm member's when they become a client role: the next secure open grants what the new role
 * may have.
 *
 * Goes by the role they hold when it runs, not only the event's: changed back meanwhile, nothing is taken.
 */
export const revokeByMemberPersonaChange = inngest.createFunction(
    { id: "revoke-by-member-persona-change", triggers: [{ event: "project.member.persona.updated" }] },
    async ({ event, step }) => {
        const { projectId, userId, oldPersonaSlug, newPersonaSlug } = event.data;

        const isClientRole = (slug: string | null | undefined) => slug === 'eng_viewer' || slug === 'eng_ext_collaborator';
        if (!oldPersonaSlug) return { message: "No revocation needed" };

        const currentRole: string | null = await step.run("find-current-role", async () => {
            const member = await prisma.engagementMember.findFirst({ where: { engagementId: projectId, userId }, select: { role: true } });
            return member?.role ?? null;
        });
        // Removed meanwhile: removeMember took their access back.
        if (!currentRole) return { message: "No longer a member" };

        // Without the new role in the event, only the client-role file rule applies.
        const kept = new Set(engagementFoldersFor(currentRole));
        const lostFolders = newPersonaSlug ? engagementFoldersFor(oldPersonaSlug).filter((f) => !kept.has(f)) : [];
        const revokeFiles = isClientRole(oldPersonaSlug) || (!!newPersonaSlug && isClientRole(currentRole));

        if (lostFolders.length === 0 && !revokeFiles) return { message: "No revocation needed" };

        let fileResults: RevokeOutcome | null = null;
        if (revokeFiles) {
            const sharesToRevoke = await step.run("find-shares-to-revoke", async () => {
                return prisma.engagementDocumentSharingUser.findMany({
                    where: { engagementId: projectId, userId, connectorPermissionId: { not: null } },
                    select: SHARE_TO_REVOKE_SELECT,
                });
            });
            if (sharesToRevoke.length > 0) {
                fileResults = await revokeSharesWithRetry(step, projectId, sharesToRevoke, { id: { in: sharesToRevoke.map((s: { id: string }) => s.id) } });
            }
        }

        const folderResults = lostFolders.length > 0 ? await revokeFoldersWithRetry(step, projectId, userId, lostFolders) : null;

        if (!fileResults && !folderResults) return { message: "No shares found" };
        return { message: "Revoked for persona change", results: fileResults, folders: folderResults };
    }
);

/** A document to share with a new client member, as the grant step reads it. */
type DocToGrant = { id: string; externalId: string | null; fileName: string | null };

/**
 * Grant permissions for new member (V2)
 *
 * Folder access for a Lead or Contributor · Full Access, and the documents already shared with a client
 * role. What storage refuses is tried once more after a wait, then the Leads are told; the job's answer
 * says what was shared, never `granted: true` for a grant that didn't happen.
 */
export const grantPermissionsForNewMember = inngest.createFunction(
    { id: "grant-permissions-for-new-member", triggers: [{ event: "project.member.added" }] },
    async ({ event, step }) => {
        const { projectId, userId, email, personaSlug } = event.data;

        const connectorId = await step.run("fetch-connector", async () => {
            const { resolveEngagementConnectorId } = await import('@/lib/connectors/resolve-client-connector')
            return resolveEngagementConnectorId(projectId)
        });

        if (!connectorId) return { message: "No connector" };

        const grantFolders = async (only?: EngagementFolderName[]): Promise<FolderGrantOutcome> => {
            if (!email) return { granted: [], failed: [], skipped: "no_email" };
            const engagement = await prisma.engagement.findFirst({
                where: { id: projectId, isDeleted: false },
                select: {
                    slug: true,
                    name: true,
                    connectorRootFolderId: true,
                    client: { select: { slug: true, name: true } },
                },
            });
            if (!engagement?.connectorRootFolderId) return { granted: [], failed: [], skipped: "no_connector_root" };
            return grantEngagementDriveFolderAccess({
                connectorId,
                engagementSlug: engagement.slug,
                email,
                role: personaSlug as "eng_admin" | "eng_member" | "eng_ext_collaborator" | "eng_viewer",
                projectName: engagement.name,
                clientSlug: engagement.client.slug,
                clientName: engagement.client.name,
                projectFolderId: engagement.connectorRootFolderId,
                only,
            });
        };

        let folderGrant: FolderGrantOutcome = await step.run("grant-folder-access", () => grantFolders());
        if (folderGrant.failed.length > 0) {
            await step.sleep("wait-before-retrying-folder-grant", STORAGE_RETRY_WAIT);
            const retried: FolderGrantOutcome = await step.run("retry-folder-access", () =>
                grantFolders(folderGrant.failed.map((f) => f.folder)));
            folderGrant = { granted: [...folderGrant.granted, ...retried.granted], failed: retried.failed, skipped: retried.skipped };
            if (folderGrant.failed.length > 0) {
                const failed = folderGrant.failed;
                await step.run("tell-leads-folder-grant", () => notifyLeadsOfStorageAccess(projectId, failed.map((f) => ({
                    kind: "grant" as const,
                    userId,
                    itemName: f.folder,
                    itemType: "folder" as const,
                    reason: f.reason,
                    key: f.folderId,
                }))));
            }
        }
        // `granted` only when every folder the role has was shared.
        const folders = {
            granted: folderGrant.failed.length === 0 && !folderGrant.skipped,
            folders: folderGrant.granted,
            failed: folderGrant.failed,
            ...(folderGrant.skipped ? { reason: folderGrant.skipped } : {}),
        };

        const documentsToGrant: DocToGrant[] = await step.run("find-sharings-to-grant", async () => {
            const docs = await prisma.engagementDocument.findMany({
                where: { engagementId: projectId },
                include: {
                    sharingUsers: {
                        where: { userId, sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED },
                    },
                },
            });

            const isGuest = personaSlug === "eng_viewer";
            const isExternalCollaborator = personaSlug === "eng_ext_collaborator";

            return docs.filter((doc: { sharingUsers: unknown[]; settings: unknown; externalId: string | null }) => {
                if (doc.sharingUsers.length > 0) return false;
                if (isDocumentPrivate(doc.settings)) return false;
                const settings = doc.settings as { share?: { guest?: { enabled?: boolean }; externalCollaborator?: { enabled?: boolean } } };
                const guestEnabled = settings?.share?.guest?.enabled === true;
                const ecEnabled = settings?.share?.externalCollaborator?.enabled === true;
                if (isExternalCollaborator) return ecEnabled;
                if (isGuest) return guestEnabled;
                return false;
            }).map((doc: { id: string; externalId: string | null; fileName: string | null }) => ({ id: doc.id, externalId: doc.externalId, fileName: doc.fileName }));
        });

        if (documentsToGrant.length === 0) {
            return { message: "Folder access only (no per-document shares)", folderGrant: folders, docShares: 0 };
        }

        const role: "editor" | "viewer" = personaSlug === "eng_viewer" ? "viewer" : "editor";

        const grantDocs = async (docs: DocToGrant[]) => {
            const adapter = await getPermissionAdapter(connectorId)
            if (!adapter) return { successCount: 0, failed: docs.map((d) => ({ ...d, reason: "No storage is connected to this client any more." })) }
            let successCount = 0;
            const failed: Array<DocToGrant & { reason: string }> = [];
            for (const doc of docs) {
                const externalId = doc.externalId;
                if (!externalId) continue;
                try {
                    const permissionId = await adapter.grantFolderPermission(connectorId, externalId, email, role);
                    if (!permissionId) {
                        failed.push({ ...doc, reason: "The storage didn't confirm the share." });
                        continue;
                    }
                    await prisma.engagementDocumentSharingUser.create({
                        data: {
                            engagementId: projectId,
                            projectDocumentId: doc.id,
                            userId,
                            connectorPermissionId: permissionId,
                            sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED,
                        },
                    });
                    successCount++;
                } catch (e) {
                    logger.error("Failed to grant permission in Inngest (V2)", e as Error);
                    failed.push({ ...doc, reason: e instanceof StorageFailure ? e.message : "Couldn't reach the storage." });
                }
            }
            return { successCount, failed };
        };

        let grantResults = await step.run("grant-permissions", () => grantDocs(documentsToGrant));
        if (grantResults.failed.length > 0) {
            await step.sleep("wait-before-retrying-document-grants", STORAGE_RETRY_WAIT);
            const retried = await step.run("retry-grant-permissions", () => grantDocs(grantResults.failed));
            grantResults = { successCount: grantResults.successCount + retried.successCount, failed: retried.failed };
            if (grantResults.failed.length > 0) {
                const failed = grantResults.failed;
                await step.run("tell-leads-document-grants", () => notifyLeadsOfStorageAccess(projectId, failed.map((d: DocToGrant & { reason: string }) => ({
                    kind: "grant" as const,
                    userId,
                    itemName: d.fileName || "a file",
                    itemType: "file" as const,
                    documentId: d.id,
                    reason: d.reason,
                    key: d.externalId ?? d.id,
                }))));
            }
        }

        return { message: "Granted permissions for new member", folderGrant: folders, results: grantResults };
    }
);

export const migrateWorkspaceRoot = inngest.createFunction(
    {
        id: 'migrate-workspace-root',
        name: 'Migrate workspace root folder',
        retries: 2,
        triggers: [{ event: 'workspace.migrate.requested' }],
        // The run gave up: it's recorded as failed. Clearing maintenance closes the active migration, so
        // it's told the status to close it with; it used to mark it completed, and `failed` was then never
        // written because nothing was active any more. One write at a time: each reads and rewrites the
        // firm's settings, and run together one lost the other's change.
        onFailure: async ({ error, event }: { error: Error; event: { data: { event: { data: { firmId: string; newRootFolderId: string; oldRootFolderId: string; startedAt?: string } } } } }) => {
            const { firmId } = event.data.event.data
            logger.error('Workspace move gave up', error, 'MigrateWorkspace', { firmId })
            await setMaintenanceMode(firmId, null, { endStatus: 'failed' })
            await setMigrationPending(firmId, null)
        },
    },
    async ({ event, step }: { event: { data: { connectionId: string; newRootFolderId: string; oldRootFolderId: string; firmId: string; initiatingUserId: string; estimatedMinutes: number; organizationId?: string; startedAt?: string; graceMinutes?: number } }; step: any }) => {
        const { connectionId, newRootFolderId, oldRootFolderId, firmId, initiatingUserId, estimatedMinutes } = event.data
        // "Start now" (default) keeps the original fixed 2-minute buffer — enough time for the
        // in-app lock notice to render before the workspace locks, but not a real scheduling
        // choice. "Notify members and start in 15 minutes" extends this so members have a
        // meaningful window to finish what they're doing. Clamped to sane bounds server-side
        // since this value rides in on a public-facing API request body.
        const graceMinutes = Math.min(Math.max(Number(event.data.graceMinutes) || 2, 2), 60)

        await step.run('notify-members', () =>
            sendMaintenanceWarningToFirmMembers(firmId, estimatedMinutes, graceMinutes)
        )

        // Create the DB migration record so latestMigrationStatus is trackable from the start.
        // upsert-style: if a record already exists from a prior attempt, reuse it.
        await step.run('create-migration-record', async () => {
            const existing = await getActiveMigration(firmId)
            if (!existing) {
                await createMigration({
                    firmId,
                    connectorId: connectionId,
                    oldRootFolderId: oldRootFolderId || null,
                    newRootFolderId,
                    initiatedBy: initiatingUserId,
                    estimatedMinutes,
                })
            }
        })

        await step.sleep('grace-period', `${graceMinutes}m`)

        await step.run('lock-and-sign-out', async () => {
            // Guard: if cancelled during the grace sleep, migrationPending will be null — abort
            const migration = await getActiveMigration(firmId)
            if (!migration || migration.status !== 'pending_grace') {
                logger.info('Migration cancelled during grace period — aborting lock', 'MigrateWorkspace', { firmId })
                return
            }
            // One at a time: both rewrite the firm's settings, and run together one could drop the
            // other's change (the lock itself, or the pending banner's removal).
            await setMaintenanceMode(firmId, {
                active: true,
                startedAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + Math.max(estimatedMinutes * 4, 30) * 60_000).toISOString(),
                estimatedMinutes,
                initiatedBy: initiatingUserId,
                reason: 'workspace_migration',
            })
            await setMigrationPending(firmId, null)
            await updateMigrationStatus(migration.id, 'in_progress')
            // No sign-out: the maintenance page already holds the firm's routes until the migration ends.
        })

        // Resolve the migration adapter once (one DB read) and verify the access token before proceeding.
        // getMigrationAdapter is called outside step.run intentionally: it is idempotent, has no
        // side-effects, and its result (an object) cannot be serialized across Inngest step boundaries.
        // The token check is wrapped in a step so Inngest can retry it independently.
        const migrationAdapter = await getMigrationAdapter(connectionId)

        await step.run('get-access-token', async () => {
            const connector = await prisma.connector.findUnique({ where: { id: connectionId }, select: { type: true } })
            if (!connector) throw new Error('Connector not found: ' + connectionId)
            const token = await getConnectorInstance(connector.type).getAccessToken(connectionId)
            if (!token) throw new Error('Could not obtain access token for connector ' + connectionId)
            return token
        })
        const allFailures: { id: string; error: string }[] = []

        if (oldRootFolderId) {
            // Step: list all top-level children of the old root (with names for progress tracking)
            const fileItems = await step.run('list-children', () =>
                migrationAdapter.listTopLevelChildrenWithNames(connectionId, oldRootFolderId)
            )
            const fileIds = fileItems.map((f: { id: string; name: string }) => f.id)

            // Bulk-insert file records for tracking (with names so the UI can show them)
            if (fileItems.length > 0) {
                await step.run('register-migration-files', async () => {
                    const migration = await getActiveMigration(firmId)
                    if (migration) {
                        await addMigrationFiles(migration.id, fileItems.map((f: { id: string; name: string }) => ({ fileId: f.id, fileName: f.name })))
                    }
                })
            }

            // Per-batch move steps (max 50 per Drive Batch API call)
            const BATCH_SIZE = 50

            for (let i = 0; i < fileIds.length; i += BATCH_SIZE) {
                const batch = fileIds.slice(i, i + BATCH_SIZE)
                const batchIndex = Math.floor(i / BATCH_SIZE)

                const result = await step.run(`move-batch-${batchIndex}`, () =>
                    migrationAdapter.moveBatch(connectionId, batch, oldRootFolderId, newRootFolderId)
                )
                allFailures.push(...result.failures)

                if (i + BATCH_SIZE < fileIds.length) {
                    await step.sleep(`rate-limit-pause-${batchIndex}`, '1s')
                }
            }
        }

        await step.run('persist-root-location', () =>
            migrationAdapter.persistWorkspaceRootLocation(connectionId, newRootFolderId)
        )

        // Note: project-level reindex requires rootFolderIds per project — not available
        // here after a workspace root migration. Individual projects will be reindexed
        // on next access or via a dedicated reindex trigger.

        await step.run('unlock-workspace', async () => {
            const finalStatus = allFailures.length > 0 ? 'failed_partial' : 'completed'
            // Clearing maintenance closes the active migration with this status. Writing the status
            // alongside it raced: whichever landed last won, and a partial move could read completed.
            await setMaintenanceMode(firmId, null, { endStatus: finalStatus })
            if (allFailures.length > 0) {
                const firm = await prisma.firm.findUnique({ where: { id: firmId } })
                if (firm) {
                    const prev = (firm.settings as Record<string, unknown>) || {}
                    await prisma.firm.update({
                        where: { id: firmId },
                        data: { settings: { ...prev, migrationWarnings: allFailures } },
                    })
                }
            }
        })

        return { ok: true, failures: allFailures.length }
    }
)

// ---------------------------------------------------------------------------
// Platform Maintenance — Grace Period Activation
// ---------------------------------------------------------------------------
// Sleeps for the 2-minute grace window, then checks if maintenance is still
// pending. If so, activates it fully and signs out all non-admin users.
export const platformMaintenanceActivate = inngest.createFunction(
    { id: 'platform-maintenance-activate', triggers: [{ event: 'platform/maintenance.grace-requested' }] },
    async ({ event, step }) => {
        const graceEndsAt = new Date(event.data.graceEndsAt)
        const msRemaining = graceEndsAt.getTime() - Date.now()
        if (msRemaining > 0) {
            await step.sleep('grace-period', `${Math.ceil(msRemaining / 1000)}s`)
        }

        await step.run('activate-maintenance', async () => {
            const config = await getPlatformMaintenanceConfig()
            // Abort if admin cancelled during the grace window
            if (!config || !config.gracePeriod || config.active) {
                logger.info('Platform maintenance grace period cancelled — skipping activation', 'PlatformMaintenance')
                return
            }
            const updated = {
                ...config,
                active: true,
                gracePeriod: false,
            }
            await setPlatformMaintenanceConfig(updated)

            const users = await getAllNonAdminUserEmails()
            // No sign-out: proxy.ts redirects everyone but system admins to /platform-maintenance.
            await Promise.allSettled([
                sendPlatformMaintenanceEmail('on', updated, users),
                sendPlatformMaintenanceNotification('on', updated),
            ])
            logger.info(`Platform maintenance activated — ${users.length} users notified`, 'PlatformMaintenance')
        })

        return { ok: true }
    }
)


// ---------------------------------------------------------------------------
// Client Follow-Up Reminders (Daily Cron)
// ---------------------------------------------------------------------------

// Safety-net cron: fires at 00:00 UTC daily — catches any follow-ups whose
// Inngest sleepUntil run was lost. Creates in-app notification only (no email —
// email is handled by sendReminderEmail via sleepUntil).
export const checkClientFollowUpReminders = inngest.createFunction(
    { id: "check-client-follow-up-reminders", triggers: [{ cron: "0 0 * * *" }] },
    async ({ step }) => {
        return step.run("query-and-notify", async () => {
            const todayStart = new Date()
            todayStart.setUTCHours(0, 0, 0, 0)
            const todayEnd = new Date()
            todayEnd.setUTCHours(23, 59, 59, 999)
            const dateStr = todayStart.toISOString().slice(0, 10)

            const clients = await (prisma as any).client.findMany({
                where: {
                    followUpDate: { gte: todayStart, lte: todayEnd },
                    ownerId: { not: null },
                    status: { in: ["PROSPECT", "ACTIVE"] },
                },
                select: {
                    id: true, name: true, slug: true,
                    firmId: true, ownerId: true, followUpDate: true,
                    firm: { select: { slug: true, group: { select: { slug: true } } } },
                },
            })

            if (!clients.length) return { notified: 0 }

            const rows = clients.map((c: any) => ({
                firmId: c.firmId,
                clientId: c.id,
                userId: c.ownerId,
                scope: "CLIENT",
                type: "CLIENT_FOLLOWUP_DUE",
                priority: "WARNING",
                title: `Follow up due: ${c.name}`,
                body: `Your scheduled follow-up with ${c.name} is due today.`,
                ctaUrl: c.firm?.group?.slug && c.firm?.slug ? clientPath(c.firm.group.slug, c.firm.slug, c.slug) : null,
                channels: { inApp: true, email: false },
                dedupeKey: `client:${c.id}:followup:${dateStr}`,
                metadata: { followUpDate: c.followUpDate?.toISOString(), clientName: c.name, internal: true },
            }))

            await (prisma as any).notification.createMany({ data: rows, skipDuplicates: true })

            const { sendReminderPush } = await import("@/lib/reminders/reminder-push")
            await Promise.all(clients.map((c: any) => sendReminderPush({
                userId: c.ownerId,
                firmId: c.firmId,
                title: `Follow up due: ${c.name}`,
                body: `Your scheduled follow-up with ${c.name} is due today.`,
                ctaUrl: c.firm?.group?.slug && c.firm?.slug
                    ? clientPath(c.firm.group.slug, c.firm.slug, c.slug)
                    : null,
                tag: `client-followup:${c.id}:${dateStr}`,
            })))

            return { notified: clients.length }
        })
    }
)

// ---------------------------------------------------------------------------
// Reminder Email — sleepUntil + cancelOn
// ---------------------------------------------------------------------------

export const sendReminderEmail = inngest.createFunction(
    {
        id: "send-reminder-email",
        triggers: [{ event: "reminder.email.scheduled" }],
        cancelOn: [{
            event: "reminder.email.cancelled",
            if: "event.data.reminderId == async.data.reminderId",
        }],
    },
    async ({ event, step }: any) => {
        await step.sleepUntil("wait-for-reminder", event.data.fireAt)

        await step.run("send", async () => {
            // Skip if reminder was marked done (node was removed from the array)
            const personalization = await prisma.userPersonalization.findUnique({
                where: { userId: event.data.userId },
                select: { reminders: true },
            })
            const items: any[] = Array.isArray(personalization?.reminders)
                ? (personalization!.reminders as any[])
                : []
            const item = items.find((r: any) => r.id === event.data.reminderId)
            if (!item) return { skipped: 'done' }

            const { createAdminClient } = await import("@/utils/supabase/admin")
            const { sendEmail } = await import("@/lib/email")
            const { renderReminderEmail } = await import("@/lib/email-templates/reminder")
            const admin = createAdminClient()
            const { data } = await admin.auth.admin.getUserById(event.data.userId)
            const email = data?.user?.email
            if (!email) return { skipped: 'no-email' }

            const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
            const ctaUrl = event.data.ctaUrl ? `${appUrl}${event.data.ctaUrl}` : null
            const { subject, html } = renderReminderEmail({
                entityName: event.data.entityName,
                action: event.data.action,
                ctaUrl,
                ctaLabel: 'View →',
                kind: 'followup',
            })
            await sendEmail(email, subject, html)

            const { sendReminderPush } = await import("@/lib/reminders/reminder-push")
            await sendReminderPush({
                userId: event.data.userId,
                firmId: event.data.firmId ?? null,
                title: `${event.data.action}: ${event.data.entityName}`,
                body: 'Due now',
                ctaUrl: event.data.ctaUrl ?? null,
                tag: `reminder:${event.data.reminderId}`,
            })

            return { sent: true }
        })

        return { reminderId: event.data.reminderId }
    }
)

// ---------------------------------------------------------------------------
// Engagement Reminder Cleanup
// ---------------------------------------------------------------------------

/**
 * Clean up all reminders referencing a deleted/closed engagement for every member.
 * Covers: engagement-level reminders (dueDate, kickoffDate, followUpDate, shares)
 * and all document-level + comment-level reminders within the engagement.
 *
 * Triggered by: engagement.deleted, engagement.closed
 */
export const cleanupEngagementReminders = inngest.createFunction(
    { id: "cleanup-engagement-reminders", triggers: [{ event: "engagement.deleted" }, { event: "engagement.closed" }] },
    async ({ event, step }) => {
        const { engagementId, memberUserIds } = event.data

        const { docIds, commentIds } = await step.run("fetch-child-entity-ids", async () => {
            const docs = await prisma.engagementDocument.findMany({
                where: { engagementId },
                select: { id: true },
            })
            const comments = await prisma.docCommentMessage.findMany({
                where: { engagementId },
                select: { id: true },
            })
            return {
                docIds: docs.map((d: { id: string }) => d.id),
                commentIds: comments.map((c: { id: string }) => c.id),
            }
        })

        await step.run("remove-engagement-reminders", async () => {
            const { removeRemindersByEntityForUsers } = await import('@/lib/reminders/reminder-service')
            const ENGAGEMENT_KEYS = [
                'platform.engagements',
                'platform.engagements.dueDate',
                'platform.engagements.kickoffDate',
                'platform.engagements.followUpDate',
                'platform.engagement_invitations.shares',
            ]
            await Promise.allSettled(
                ENGAGEMENT_KEYS.map((key) => removeRemindersByEntityForUsers(memberUserIds, key, engagementId))
            )
        })

        await step.run("remove-document-reminders", async () => {
            if (docIds.length === 0) return
            const { removeRemindersByEntityForUsers } = await import('@/lib/reminders/reminder-service')
            await Promise.allSettled(
                docIds.map((docId: string) => removeRemindersByEntityForUsers(memberUserIds, 'platform.documents', docId))
            )
        })

        await step.run("remove-comment-reminders", async () => {
            if (commentIds.length === 0) return
            const { removeRemindersByEntityForUsers } = await import('@/lib/reminders/reminder-service')
            await Promise.allSettled(
                commentIds.map((commentId: string) => removeRemindersByEntityForUsers(memberUserIds, 'platform.doc_comments', commentId))
            )
        })

        return { engagementId, memberCount: memberUserIds.length, docCount: docIds.length, commentCount: commentIds.length }
    }
)

// ---------------------------------------------------------------------------
// Member Removal Reminder + Sign-out Cleanup
// ---------------------------------------------------------------------------

/**
 * Clean up reminders for a single removed member.
 * Covers: engagement-level + document-level + comment-level reminders for that user.
 *
 * Triggered by: engagement.member.removed
 */
export const cleanupMemberReminders = inngest.createFunction(
    { id: "cleanup-member-reminders", triggers: [{ event: "engagement.member.removed" }] },
    async ({ event, step }) => {
        const { engagementId, userId } = event.data

        const { docIds, commentIds } = await step.run("fetch-child-entity-ids", async () => {
            const docs = await prisma.engagementDocument.findMany({
                where: { engagementId },
                select: { id: true },
            })
            const comments = await prisma.docCommentMessage.findMany({
                where: { engagementId },
                select: { id: true },
            })
            return {
                docIds: docs.map((d: { id: string }) => d.id),
                commentIds: comments.map((c: { id: string }) => c.id),
            }
        })

        await step.run("remove-reminders", async () => {
            const { removeRemindersByEntity } = await import('@/lib/reminders/reminder-service')
            const ENGAGEMENT_KEYS = [
                'platform.engagements',
                'platform.engagements.dueDate',
                'platform.engagements.kickoffDate',
                'platform.engagements.followUpDate',
                'platform.engagement_invitations.shares',
            ]
            await Promise.allSettled([
                ...ENGAGEMENT_KEYS.map((key) => removeRemindersByEntity(userId, key, engagementId)),
                ...docIds.map((docId: string) => removeRemindersByEntity(userId, 'platform.documents', docId)),
                ...commentIds.map((commentId: string) => removeRemindersByEntity(userId, 'platform.doc_comments', commentId)),
            ])
        })

        // No sign-out: leaving one engagement takes away that engagement only, and every request
        // checks membership. Ending all their sign-ins would log them out of everything else too.

        return { engagementId, userId }
    }
)

// ---------------------------------------------------------------------------
// Document Deletion Reminder Cleanup
// ---------------------------------------------------------------------------

/**
 * Clean up all reminders referencing a deleted document and its comments,
 * across all engagement members.
 *
 * Triggered by: document.deleted
 */
export const cleanupDocumentReminders = inngest.createFunction(
    { id: "cleanup-document-reminders", triggers: [{ event: "document.deleted" }] },
    async ({ event, step }) => {
        const { documentId, engagementId } = event.data

        const { memberUserIds, commentIds } = await step.run("fetch-members-and-comments", async () => {
            const [members, comments] = await Promise.all([
                prisma.engagementMember.findMany({
                    where: { engagementId },
                    select: { userId: true },
                }),
                prisma.docCommentMessage.findMany({
                    where: { projectDocumentId: documentId },
                    select: { id: true },
                }),
            ])
            return {
                memberUserIds: members.map((m: { userId: string }) => m.userId),
                commentIds: comments.map((c: { id: string }) => c.id),
            }
        })

        await step.run("remove-document-reminders", async () => {
            const { removeRemindersByEntityForUsers } = await import('@/lib/reminders/reminder-service')
            await removeRemindersByEntityForUsers(memberUserIds, 'platform.documents', documentId)
        })

        await step.run("remove-comment-reminders", async () => {
            if (commentIds.length === 0) return
            const { removeRemindersByEntityForUsers } = await import('@/lib/reminders/reminder-service')
            await Promise.allSettled(
                commentIds.map((commentId: string) => removeRemindersByEntityForUsers(memberUserIds, 'platform.doc_comments', commentId))
            )
        })

        return { documentId, memberCount: memberUserIds.length, commentCount: commentIds.length }
    }
)

// ---------------------------------------------------------------------------
// 30-day Engagement Purge (Daily Cron)
// ---------------------------------------------------------------------------

/**
 * Hard-purges engagements soft-deleted more than 30 days ago.
 * A single DELETE; FK cascades clean all child rows (documents, wiki, comments, notifications).
 */
export const purgeDeletedEngagements = inngest.createFunction(
    { id: "purge-deleted-engagements", triggers: [{ cron: "0 2 * * *" }] },
    async ({ step }) => {
        return step.run("purge", async () => {
            const cutoff = new Date()
            cutoff.setDate(cutoff.getDate() - 30)

            const toDelete = await prisma.engagement.findMany({
                where: { isDeleted: true, deletedAt: { lt: cutoff } },
                select: { id: true },
            })

            if (toDelete.length === 0) return { purged: 0 }

            await prisma.engagement.deleteMany({
                where: { id: { in: toDelete.map((e: { id: string }) => e.id) } },
            })

            logger.info(`Purged ${toDelete.length} deleted engagements`, 'purge-deleted-engagements')
            return { purged: toDelete.length }
        })
    }
)

// ---------------------------------------------------------------------------
// Recurring Reminder Email — fan-forward pattern
// ---------------------------------------------------------------------------

export const sendRecurringReminderEmails = inngest.createFunction(
    {
        id: "send-recurring-reminder-emails",
        triggers: [{ event: "reminder.recurring.scheduled" }],
        cancelOn: [{
            event: "reminder.recurring.cancelled",
            if: "event.data.reminderId == async.data.reminderId",
        }],
    },
    async ({ event, step }: any) => {
        await step.sleepUntil("wait-for-next-fire", event.data.nextFireAt)

        const result = await step.run("send-and-reschedule", async () => {
            // Check reminder still exists
            const personalization = await prisma.userPersonalization.findUnique({
                where: { userId: event.data.userId },
                select: { reminders: true },
            })
            const items: any[] = Array.isArray(personalization?.reminders)
                ? (personalization!.reminders as any[])
                : []
            const item = items.find((r: any) => r.id === event.data.reminderId)
            if (!item) return { skipped: 'done' }

            // Re-read firm config — user may have disabled recurring since this was scheduled
            const { getFirmReminderConfig } = await import('@/lib/firm-reminder-config')
            const config = await getFirmReminderConfig(event.data.firmId)
            if (!config.recurring.enabled) return { skipped: 'disabled' }

            // Send email
            const { createAdminClient } = await import('@/utils/supabase/admin')
            const { sendEmail } = await import('@/lib/email')
            const { renderReminderEmail } = await import('@/lib/email-templates/reminder')
            const admin = createAdminClient()
            const { data } = await admin.auth.admin.getUserById(event.data.userId)
            const email = data?.user?.email
            if (!email) return { skipped: 'no-email' }

            const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
            const ctaUrl = event.data.ctaUrl ? `${appUrl}${event.data.ctaUrl}` : null
            const { subject, html } = renderReminderEmail({
                entityName: event.data.entityName,
                action: event.data.action,
                ctaUrl,
                ctaLabel: 'View →',
                kind: 'recurring',
            })
            await sendEmail(email, subject, html)

            const { sendReminderPush } = await import("@/lib/reminders/reminder-push")
            await sendReminderPush({
                userId: event.data.userId,
                firmId: event.data.firmId ?? null,
                title: `${event.data.action}: ${event.data.entityName}`,
                body: 'Reminder',
                ctaUrl: event.data.ctaUrl ?? null,
                tag: `reminder:${event.data.reminderId}`,
            })

            // Compute next fire time
            const nextFireAt = new Date(event.data.nextFireAt)
            nextFireAt.setDate(nextFireAt.getDate() + event.data.frequencyDays)

            // Stop if we've passed the due date
            if (event.data.dueDate) {
                const dueDate = new Date(event.data.dueDate)
                if (nextFireAt > dueDate) return { sent: true, stopped: 'past-due' }
            }

            return { sent: true, nextFireAt: nextFireAt.toISOString() }
        })

        // Fan-forward: re-emit with updated nextFireAt to continue the chain
        if (result?.sent && result?.nextFireAt) {
            const { safeInngestSend } = await import('@/lib/inngest/client')
            await safeInngestSend('reminder.recurring.scheduled', {
                ...event.data,
                nextFireAt: result.nextFireAt,
            })
        }

        return { reminderId: event.data.reminderId }
    }
)



// ---------------------------------------------------------------------------
// Daily Reminder Digest (Hourly Cron, fires at each user's local 09:00)
// ---------------------------------------------------------------------------

/**
 * Sends one grouped Web Push per user per day covering everything due or overdue in their
 * Reminders panel. Runs hourly and notifies only users whose LOCAL time is currently 09:00,
 * so a desktop notification never lands at 3am for someone outside UTC.
 *
 * This is the path that covers date-less reminders (Review document / Review comment /
 * Review shared file) — they have no scheduled email, so without the digest they would
 * never notify at all.
 *
 * Shares the once-per-day claim stamp with the in-app sign-in catch-up via
 * claimDailyDigest(), so exactly one of the two notifies on any given local day.
 */
export const sendDailyReminderDigest = inngest.createFunction(
    { id: "send-daily-reminder-digest", triggers: [{ cron: "0 * * * *" }] },
    async ({ step }) => {
        return step.run("digest-users-at-local-9am", async () => {
            const {
                localDateFor, localHourFor, claimDailyDigest,
            } = await import("@/lib/notification-prefs")
            const { computeDueReminders } = await import("@/lib/reminders/reminder-service")
            const { remindersPushEnabled } = await import("@/lib/reminders/reminder-push")
            const { sendPushToUser } = await import("@/lib/push")

            // Only users who could actually receive a push are worth scanning.
            const candidates = await prisma.userPersonalization.findMany({
                select: { userId: true, notificationPrefs: true, pushSubscriptions: true },
            })

            const now = new Date()
            let notified = 0

            for (const row of candidates) {
                const subs = Array.isArray(row.pushSubscriptions) ? row.pushSubscriptions : []
                if (subs.length === 0) continue

                const timezone = (row.notificationPrefs as any)?.timezone ?? 'UTC'
                if (await localHourFor(timezone, now) !== 9) continue

                // Due today, overdue, or date-less (which never have a scheduled email).
                const items = (await computeDueReminders(row.userId)).filter(
                    (r) => !r.hiddenAt && (r.delta === null || r.delta <= 0)
                )
                if (items.length === 0) continue

                // Firm-scoped gate on a user-scoped surface: keep only reminders whose
                // owning firm still has reminder notifications switched on.
                const allowed: typeof items = []
                for (const item of items) {
                    if (await remindersPushEnabled(item.firmId)) allowed.push(item)
                }
                if (allowed.length === 0) continue

                // Claim last: never burn the day's stamp on a user we then skip.
                const localDate = await localDateFor(timezone, now)
                if (!(await claimDailyDigest(row.userId, localDate))) continue

                const overdue = allowed.filter((r) => r.delta !== null && r.delta < 0).length
                const single = allowed.length === 1 ? allowed[0] : null

                await sendPushToUser(row.userId, {
                    title: single
                        ? `${single.action}: ${single.entityName}`
                        : `${allowed.length} reminders need attention`,
                    body: single
                        ? (single.label || 'Due today')
                        : (overdue > 0 ? `${overdue} overdue` : 'Due today'),
                    ctaUrl: single ? (single.ctaUrl ?? '/d/u/inbox?tab=reminders') : '/d/u/inbox?tab=reminders',
                    tag: 'reminder-digest',
                })
                notified++
            }

            return { notified }
        })
    }
)

// ---------------------------------------------------------------------------
// Deliverable Due Date Reminders
// ---------------------------------------------------------------------------

/**
 * Notifies all engagement members when a Deliverable due date is approaching.
 * Fires at 24h and 1h before the due date, sending both an email and an in-app
 * DELIVERABLE_DUE_REMINDER notification to every member.
 * Cancelled when the due date is cleared or changed (same documentId).
 * Skips silently at fire time if the date was changed or the deliverable is
 * already approved.
 */
export const sendDeliverableDueReminder = inngest.createFunction(
    {
        id: "send-deliverable-due-reminder",
        triggers: [{ event: "deliverable.due_date.set" }],
        cancelOn: [{
            event: "deliverable.due_date.cancelled",
            if: "event.data.documentId == async.data.documentId",
        }],
    },
    async ({ event, step }: any) => {
        const { documentId, documentName, dueDate, memberUserIds, boardUrl, firmId, clientId, engagementId } = event.data
        const due = new Date(dueDate)
        const dueDay = due.toISOString().slice(0, 10)

        // Fetch current state at fire time — skip stale (date-changed) or approved deliverables
        const getState = async () => {
            const doc = await prisma.engagementDocument.findUnique({
                where: { id: documentId },
                select: { dueDate: true, settings: true },
            })
            if (!doc) return { dateStillSet: false, isApproved: false }
            const { parseSettingsFromDb } = await import("@/lib/sharing-settings")
            let isApproved = false
            try { isApproved = parseSettingsFromDb(doc.settings as any).activity?.status === 'approved' } catch { /* ignore */ }
            return { dateStillSet: doc.dueDate?.toISOString() === dueDate, isApproved }
        }

        const getEventConfig = async () => {
            if (!firmId) return null
            const { getFirmReminderConfig } = await import("@/lib/firm-reminder-config")
            return getFirmReminderConfig(firmId)
        }

        const sendEmails = async (recipientIds: string[], action: string, entityName: string) => {
            if (recipientIds.length === 0) return
            const { createAdminClient } = await import("@/utils/supabase/admin")
            const { sendEmail } = await import("@/lib/email")
            const { renderReminderEmail } = await import("@/lib/email-templates/reminder")
            const admin = createAdminClient()
            const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
            const cta = boardUrl ? `${appUrl}${boardUrl}` : null
            const { subject, html } = renderReminderEmail({
                entityName,
                action,
                ctaUrl: cta,
                ctaLabel: 'View Deliverable →',
                kind: 'created',
            })
            await Promise.allSettled(recipientIds.map(async (userId: string) => {
                const { data } = await admin.auth.admin.getUserById(userId)
                const email = data?.user?.email
                if (!email) return
                await sendEmail(email, subject, html)
            }))
        }

        const createInAppNotifications = async (recipientIds: string[], title: string, windowKey: string, notifType = 'DELIVERABLE_DUE_REMINDER') => {
            if (recipientIds.length === 0) return
            const rows = recipientIds.map((userId) => ({
                firmId: firmId ?? null,
                clientId: clientId ?? null,
                engagementId: engagementId ?? null,
                documentId,
                userId,
                type: notifType,
                title,
                body: `Due ${dueDay}`,
                ctaUrl: boardUrl ?? null,
                metadata: { dueDate, window: windowKey },
                channels: { inApp: true, email: false },
                dedupeKey: `deliverable:${documentId}:duerem:${windowKey}:${dueDay}`,
            }))
            if (rows.length) {
                await (prisma as any).notification.createMany({ data: rows, skipDuplicates: true })
            }
            const { sendPushToUser } = await import("@/lib/push")
            await Promise.all(recipientIds.map((userId) => sendPushToUser(userId, { title, body: `Due ${dueDay}`, ctaUrl: boardUrl ?? null })))
        }

        // Fires one advance reminder window (24h/1h before): skip if stale/approved, gated per-firm
        const fire = async (windowKey: '24h' | '1h', whenLabel: string) => {
            const { dateStillSet, isApproved } = await getState()
            if (!dateStillSet) return { skipped: 'date-changed' }
            if (isApproved) return { skipped: 'approved' }
            const config = await getEventConfig()
            const eventCfg = config?.events?.deliverableOverdue // advance windows reuse the deliverableOverdue toggle group
                ?? { email: false, inApp: true }
            const recipientIds = memberUserIds as string[]
            if (eventCfg.email) {
                await sendEmails(
                    recipientIds,
                    `Due ${whenLabel}: ${documentName}`,
                    `<p><strong>${documentName}</strong> is due ${whenLabel} (<strong>${dueDay}</strong>).</p>`
                )
            }
            if (eventCfg.inApp) {
                await createInAppNotifications(recipientIds, `${documentName} is due ${whenLabel}`, windowKey)
            }
            return { sent: true }
        }

        // Fires once, 24h after the due date has passed if the deliverable still isn't approved
        const fireOverdue = async () => {
            const { dateStillSet, isApproved } = await getState()
            if (!dateStillSet) return { skipped: 'date-changed' }
            if (isApproved) return { skipped: 'approved' }
            const config = await getEventConfig()
            const eventCfg = config?.events?.deliverableOverdue ?? { email: true, inApp: true }
            if (!eventCfg.email && !eventCfg.inApp) return { skipped: 'disabled' }

            const admins = engagementId
                ? await prisma.engagementMember.findMany({
                    where: { engagementId, role: 'eng_admin' },
                    select: { userId: true },
                })
                : []
            const recipientIds = Array.from(new Set([...(memberUserIds as string[]), ...admins.map((a) => a.userId)]))

            if (eventCfg.email) {
                await sendEmails(
                    recipientIds,
                    `Overdue: ${documentName}`,
                    `<p><strong>${documentName}</strong> was due <strong>${dueDay}</strong> and is still not approved.</p>`
                )
            }
            if (eventCfg.inApp) {
                await createInAppNotifications(recipientIds, `${documentName} is overdue`, 'overdue', 'DELIVERABLE_OVERDUE')
            }
            return { sent: true }
        }

        // 24h reminder
        const at24h = new Date(due.getTime() - 24 * 60 * 60 * 1000)
        if (at24h > new Date()) {
            await step.sleepUntil("wait-24h", at24h.toISOString())
            await step.run("send-24h", () => fire('24h', 'tomorrow'))
        }

        // 1h reminder
        const at1h = new Date(due.getTime() - 60 * 60 * 1000)
        if (at1h > new Date()) {
            await step.sleepUntil("wait-1h", at1h.toISOString())
            await step.run("send-1h", () => fire('1h', 'in 1 hour'))
        }

        // Overdue reminder — fires once, 24h after the due date, if still not approved
        const atOverdue = new Date(due.getTime() + 24 * 60 * 60 * 1000)
        await step.sleepUntil("wait-overdue", atOverdue.toISOString())
        await step.run("send-overdue", () => fireOverdue())

        return { documentId, dueDate }
    }
)

// ---------------------------------------------------------------------------
// RAID log: Brio's daily check (Daily Cron)
// ---------------------------------------------------------------------------

/**
 * Once a day, Brio reads each engagement's new comment messages and memos and suggests RAID log
 * entries for a person to accept or dismiss (lib/raid/raid-check.ts, .claude/plans/brio-features-round-2.md §9).
 *
 * Only engagements with a comment message or a memo since their own last check run at all; deleted
 * and completed engagements never do. So an engagement costs at most one credit per active day, plus
 * any Check now a person presses. Each engagement is its own step: one that fails, or whose group is
 * over its credit allowance, is skipped without stopping the rest, and its last check stays put.
 */
export const checkRaidLogsDaily = inngest.createFunction(
    { id: "check-raid-logs-daily", triggers: [{ cron: "0 7 * * *" }] },
    async ({ step }) => {
        const candidates = await step.run("find-engagements-with-new-activity", async () => {
            const { raidCheckCandidates } = await import("@/lib/raid/raid-check")
            const { isAiConfigured } = await import("@/lib/ai/client")
            return isAiConfigured() ? raidCheckCandidates() : []
        })

        const counts: Record<string, number> = {}
        for (const candidate of candidates) {
            if (!candidate) continue
            const { id, firmId } = candidate
            const result = await step.run(`check-${id}`, async () => {
                const { runScheduledRaidCheck } = await import("@/lib/raid/raid-check")
                return runScheduledRaidCheck({ id, firmId })
            })
            counts[result.status] = (counts[result.status] ?? 0) + 1
        }

        return { candidates: candidates.length, ...counts }
    }
)
