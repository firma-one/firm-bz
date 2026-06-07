import { inngest } from "./client";
import { prisma } from "@/lib/prisma";
import { googleDriveConnector } from "@/lib/google-drive-connector";
import { getPermissionAdapter, getMigrationAdapter, getConnectorInstance } from "@/lib/connectors/registry";
import { parseSettingsFromDb } from "@/lib/sharing-settings";
import { logger } from "@/lib/logger";
import { DocumentSharingPermissionStatus } from "@prisma/client";
import { grantEngagementDriveFolderAccess } from "@/lib/grant-engagement-drive-folder-access";
import { safeInngestSend } from "./client";
import { provisionSandboxHierarchyForFirm } from '@/lib/onboarding/onboarding-helper'
import {
    setMaintenanceMode,
    setMigrationPending,
    setMigrationState,
    sendMaintenanceWarningToFirmMembers,
    forceSignOutFirmMembers,
    createMigration,
    getActiveMigration,
    addMigrationFiles,
    updateMigrationStatus,
} from '@/lib/firm-maintenance'
import {
    getPlatformMaintenanceConfig,
    setPlatformMaintenanceConfig,
    getAllNonAdminUserEmails,
    signOutAllNonAdminUsers,
    sendPlatformMaintenanceEmail,
    sendPlatformMaintenanceNotification,
} from '@/lib/platform-maintenance'

// ---------------------------------------------------------------------------
// Search Indexing Functions
// ---------------------------------------------------------------------------

/**
 * Index a single file or folder for search (V2)
 */
export const indexFileForSearch = inngest.createFunction(
    { id: "index-file-for-search", triggers: [{ event: "file.index.requested" }] },
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

                const leads = await prisma.engagementMember.findMany({
                    where: { engagementId: projectId, role: 'eng_admin' },
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
                    where: { engagementId: projectId, role: { in: ['eng_admin', 'eng_member'] } },
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
    { id: "index-batch-for-search", triggers: [{ event: "file.index.batch.requested" }] },
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
    { id: "scan-and-index-project", triggers: [{ event: "project.index.scan.requested" }] },
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

            for (const folderId of rootFolderIds) {
                try {
                    const meta = await adapter.getFileMetadata(connectorId, folderId)
                    if (meta?.name) {
                        files.push({
                            externalId: folderId,
                            fileName: meta.name,
                            parentId: meta.parents?.[0] ?? null,
                        })
                    }
                } catch {
                    // skip
                }
            }

            while (queue.length > 0 && visited.size < 1000) {
                const folderId = queue.shift()!
                if (visited.has(folderId)) continue
                visited.add(folderId)

                try {
                    const children = await adapter.listFiles(connectorId, folderId, 500)
                    for (const child of children) {
                        if (!child.id || !child.name) continue
                        files.push({ externalId: child.id, fileName: child.name, parentId: folderId })
                        if (child.mimeType === 'application/vnd.google-apps.folder') {
                            queue.push(child.id)
                        }
                    }
                } catch {
                    // skip
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
            })
        }

        return { populated: projects.length, organizationId }
    }
)

/** Async sandbox provisioning: Drive + DB hierarchy + sample files (after create-sandbox sync). Polar free plan is sync-only on create-sandbox. */
export const provisionSandboxHierarchy = inngest.createFunction(
    { id: "provision-sandbox-hierarchy", triggers: [{ event: "sandbox.provision.requested" }] },
    async ({ event, step }) => {
        const payload = event.data as {
            firmId: string
            userId: string
            userEmail: string
            firstName?: string
            lastName?: string
            connectionId: string
        }

        await step.run('provision-hierarchy-and-drive', async () => {
            await provisionSandboxHierarchyForFirm({
                firmId: payload.firmId,
                userId: payload.userId,
                userEmail: payload.userEmail,
                firstName: payload.firstName,
                lastName: payload.lastName,
                connectionId: payload.connectionId,
            })
        })

        return { ok: true, firmId: payload.firmId }
    }
)

/**
 * Reconciliation for file deletion (V2)
 */
export const reconcileFileDeletion = inngest.createFunction(
    { id: "reconcile-file-deletion", triggers: [{ event: "file.delete.requested" }] },
    async ({ event, step }) => {
        const { organizationId, externalId, connectorPermissionId } = event.data

        await step.run("remove-from-search-index", async () => {
            const { SearchService } = await import("@/lib/services/search-service")
            await SearchService.removeFile(organizationId, externalId)
        })

        await step.run("cleanup-sharing-records", async () => {
            const docs = await prisma.engagementDocument.findMany({
                where: { firmId: organizationId, externalId },
                select: { id: true, settings: true, connectorId: true, firmId: true },
            })
            if (docs.length === 0) return

            const connectorId = docs[0].connectorId ?? (await prisma.firm.findUnique({
                where: { id: organizationId },
                select: { connectorId: true },
            }))?.connectorId

            const docIds = docs.map((d) => d.id)

            // Revoke all outstanding connector permissions for these docs
            if (connectorId) {
                const adapter = await getPermissionAdapter(connectorId)
                const sharingUsers = await prisma.engagementDocumentSharingUser.findMany({
                    where: {
                        projectDocumentId: { in: docIds },
                        sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED,
                        connectorPermissionId: { not: null },
                    },
                    select: { connectorPermissionId: true },
                })
                await Promise.allSettled(
                    sharingUsers
                        .filter((s) => s.connectorPermissionId)
                        .map((s) => adapter.revokePermission(connectorId, externalId, s.connectorPermissionId!))
                )

                // Trash system PDF copies (guest sharePdfOnly) — one per doc, if present
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
    { id: "reconcile-folder-deletion", triggers: [{ event: "folder.delete.requested" }] },
    async ({ event, step }) => {
        const { organizationId, externalId } = event.data

        await step.run("remove-folder-from-search-index", async () => {
            const { SearchService } = await import("@/lib/services/search-service")
            await SearchService.removeFile(organizationId, externalId)
        })

        await step.run("cleanup-folder-sharing-records", async () => {
            const doc = await prisma.engagementDocument.findFirst({
                where: { firmId: organizationId, externalId },
                select: { id: true, settings: true, connectorId: true },
            })
            if (!doc) return

            const connectorId = doc.connectorId ?? (await prisma.firm.findUnique({
                where: { id: organizationId },
                select: { connectorId: true },
            }))?.connectorId

            // Revoke all outstanding connector permissions
            if (connectorId) {
                const adapter = await getPermissionAdapter(connectorId)
                const sharingUsers = await prisma.engagementDocumentSharingUser.findMany({
                    where: {
                        projectDocumentId: doc.id,
                        sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED,
                        connectorPermissionId: { not: null },
                    },
                    select: { connectorPermissionId: true },
                })
                await Promise.allSettled(
                    sharingUsers
                        .filter((s) => s.connectorPermissionId)
                        .map((s) => adapter.revokePermission(connectorId, externalId, s.connectorPermissionId!))
                )
            }

            // Delete sharing user records (must happen before document delete to avoid FK violation)
            await prisma.engagementDocumentSharingUser.deleteMany({
                where: { projectDocumentId: doc.id },
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
        const { projectId, organizationId, reason = "unknown" } = event.data;

        const shares = await step.run("fetch-shares", async () => {
            return await prisma.engagementDocumentSharingUser.findMany({
                where: {
                    engagementId: projectId,
                    sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED,
                },
                include: { document: true },
            });
        });

        if (shares.length === 0) {
            return { message: "No shares to revoke", reason, projectId };
        }

        const connectorId = await step.run("fetch-connector", async () => {
            const firm = await prisma.firm.findUnique({
                where: { id: organizationId },
                select: { connectorId: true }
            })
            return firm?.connectorId;
        });

        if (!connectorId) {
            logger.warn("Missing active Google Drive connector", { organizationId, projectId })
            await step.run("cleanup-db-no-connector", async () => {
                await prisma.engagementDocumentSharingUser.updateMany({
                    where: { engagementId: projectId },
                    data: {
                        sharingPermissionStatus: DocumentSharingPermissionStatus.REVOKED,
                        connectorPermissionId: null,
                    },
                });
            });
            return { message: "Marked shares revoked (no connector)", projectId };
        }

        const revokeResults = await step.run("revoke-permissions", async () => {
            const adapter = await getPermissionAdapter(connectorId)
            let successCount = 0;
            let failureCount = 0;
            const BATCH_SIZE = 10;

            for (let i = 0; i < shares.length; i += BATCH_SIZE) {
                const batch = shares.slice(i, i + BATCH_SIZE);
                await Promise.all(batch.map(async (share: { connectorPermissionId: string | null; document: { externalId: string } | null }) => {
                    if (share.connectorPermissionId && share.document?.externalId) {
                        try {
                            await adapter.revokePermission(connectorId, share.document.externalId, share.connectorPermissionId);
                            successCount++;
                        } catch (e) {
                            failureCount++
                        }
                    }
                }));
            }
            return { successCount, failureCount };
        });

        await step.run("mark-shares-revoked", async () => {
            await prisma.engagementDocumentSharingUser.updateMany({
                where: { engagementId: projectId },
                data: {
                    sharingPermissionStatus: DocumentSharingPermissionStatus.REVOKED,
                    connectorPermissionId: null,
                },
            });
        });

        await step.run("downgrade-internal-member-folder-access", async () => {
            const engagement = await prisma.engagement.findFirst({
                where: { id: projectId, isDeleted: false },
                select: {
                    slug: true,
                    name: true,
                    connectorRootFolderId: true,
                    client: { select: { slug: true, name: true, firm: { select: { connectorId: true } } } },
                },
            });
            const cid = engagement?.client.firm.connectorId;
            if (!cid || !engagement?.connectorRootFolderId) return { downgraded: 0 };

            const members = await prisma.engagementMember.findMany({
                where: { engagementId: projectId, role: { in: ["eng_member", "eng_admin"] } },
                select: { userId: true },
            });
            if (members.length === 0) return { downgraded: 0 };

            const userIds = members.map((m) => `'${m.userId}'`).join(",");
            const authUsers = await prisma.$queryRawUnsafe<Array<{ id: string; email: string }>>(
                `SELECT id::text, email FROM auth.users WHERE id IN (${userIds})`
            );
            const adapter = await getPermissionAdapter(cid)
            const folderIds = await adapter.getEngagementFolderIds(cid, engagement.slug, {
                projectName: engagement.name,
                clientSlug: engagement.client.slug,
                clientName: engagement.client.name,
                projectFolderId: engagement.connectorRootFolderId,
            });
            let n = 0;
            for (const row of authUsers) {
                if (!row.email) continue;
                if (folderIds.generalFolderId) {
                    if (await adapter.downgradeFolderUserPermissionToReader(cid, folderIds.generalFolderId, row.email)) n++;
                }
                if (folderIds.confidentialFolderId) {
                    await adapter.downgradeFolderUserPermissionToReader(cid, folderIds.confidentialFolderId, row.email);
                }
            }
            return { downgraded: n };
        });

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

        return { message: "Revoked project permissions", results: revokeResults, projectId };
    }
);

/**
 * Revoke permissions when sharing settings updated (V2)
 */
export const revokeByDisabledPersona = inngest.createFunction(
    { id: "revoke-by-disabled-persona", triggers: [{ event: "sharing.settings.updated" }] },
    async ({ event, step }) => {
        const { projectId, organizationId, sharingId, disabledPersonas, documentId } = event.data;

        const connectorId = await step.run("fetch-connector", async () => {
            const firm = await prisma.firm.findUnique({
                where: { id: organizationId },
                select: { connectorId: true }
            })
            return firm?.connectorId;
        });

        if (!connectorId) return { message: "No active connector" };

        const usersToRevoke = await step.run("fetch-sharing-users", async () => {
            const doc = await prisma.engagementDocument.findUnique({
                where: { id: sharingId },
                include: { sharingUsers: true }
            });

            if (!doc) return [];

            const usersForRevocation = [];
            for (const user of doc.sharingUsers) {
                const projectMember = await prisma.engagementMember.findFirst({
                    where: { engagementId: projectId, userId: user.userId }
                });

                const personaSlug = projectMember?.role;
                const shouldRevoke =
                    (disabledPersonas.includes('guest') && personaSlug === 'eng_viewer') ||
                    (disabledPersonas.includes('externalCollaborator') && personaSlug === 'eng_ext_collaborator');

                if (shouldRevoke && user.connectorPermissionId) {
                    usersForRevocation.push(user);
                }
            }
            return usersForRevocation;
        });

        if (usersToRevoke.length === 0) return { message: "No users to revoke" };

        const revokeResults = await step.run("revoke-permissions", async () => {
            const adapter = await getPermissionAdapter(connectorId)
            let successCount = 0;
            for (const user of usersToRevoke) {
                if (user.connectorPermissionId) {
                    try {
                        await adapter.revokePermission(connectorId, documentId, user.connectorPermissionId);
                        successCount++;
                    } catch (e) {
                        // ignore
                    }
                }
            }
            return { successCount };
        });

        await step.run("cleanup-db", async () => {
            const userIdsToDelete = usersToRevoke.map((u: { id: string }) => u.id);
            await prisma.engagementDocumentSharingUser.updateMany({
                where: { id: { in: userIdsToDelete } },
                data: {
                    sharingPermissionStatus: DocumentSharingPermissionStatus.REVOKED,
                    connectorPermissionId: null,
                },
            });
        });

        return { message: "Revoked disabled personas", results: revokeResults };
    }
);

/**
 * Revoke permissions due to persona change (V2)
 */
export const revokeByMemberPersonaChange = inngest.createFunction(
    { id: "revoke-by-member-persona-change", triggers: [{ event: "project.member.persona.updated" }] },
    async ({ event, step }) => {
        const { projectId, organizationId, userId, oldPersonaSlug, newPersonaSlug } = event.data;

        const revokablePersonas = ['eng_viewer', 'eng_ext_collaborator'];
        const shouldRevoke = oldPersonaSlug && revokablePersonas.includes(oldPersonaSlug);

        if (!shouldRevoke) return { message: "No revocation needed" };

        const connectorId = await step.run("fetch-connector", async () => {
            const firm = await prisma.firm.findUnique({
                where: { id: organizationId },
                select: { connectorId: true }
            })
            return firm?.connectorId;
        });

        if (!connectorId) return { message: "No connector" };

        const sharesToRevoke = await step.run("find-shares-to-revoke", async () => {
            const docs = await prisma.engagementDocument.findMany({
                where: { engagementId: projectId },
                include: { sharingUsers: { where: { userId } } }
            });

            return docs.flatMap((d: any) => d.sharingUsers.map((u: any) => ({ document: d, user: u }))).filter((x: any) => x.user.connectorPermissionId);
        });

        if (sharesToRevoke.length === 0) return { message: "No shares found" };

        const revokeResults = await step.run("revoke-permissions", async () => {
            const adapter = await getPermissionAdapter(connectorId)
            let successCount = 0;
            for (const { document, user } of sharesToRevoke) {
                if (user.connectorPermissionId && document.externalId) {
                    try {
                        await adapter.revokePermission(connectorId, document.externalId, user.connectorPermissionId);
                        successCount++;
                    } catch (e) {
                        // ignore
                    }
                }
            }
            return { successCount };
        });

        await step.run("cleanup-db", async () => {
            const userShareIds = sharesToRevoke.map((s: { user: { id: string } }) => s.user.id);
            await prisma.engagementDocumentSharingUser.updateMany({
                where: { id: { in: userShareIds } },
                data: {
                    sharingPermissionStatus: DocumentSharingPermissionStatus.REVOKED,
                    connectorPermissionId: null,
                },
            });
        });

        return { message: "Revoked for persona change", results: revokeResults };
    }
);

/**
 * Grant permissions for new member (V2)
 */
export const grantPermissionsForNewMember = inngest.createFunction(
    { id: "grant-permissions-for-new-member", triggers: [{ event: "project.member.added" }] },
    async ({ event, step }) => {
        const { projectId, organizationId, userId, email, personaSlug } = event.data;

        const connectorId = await step.run("fetch-connector", async () => {
            const firm = await prisma.firm.findUnique({
                where: { id: organizationId },
                select: { connectorId: true }
            })
            return firm?.connectorId;
        });

        if (!connectorId) return { message: "No connector" };

        const folderGrant = await step.run("grant-folder-access", async () => {
            if (!email) return { granted: false, reason: "no_email" };
            const engagement = await prisma.engagement.findFirst({
                where: { id: projectId, isDeleted: false },
                select: {
                    slug: true,
                    name: true,
                    connectorRootFolderId: true,
                    client: { select: { slug: true, name: true } },
                },
            });
            if (!engagement?.connectorRootFolderId) return { granted: false, reason: "no_connector_root" };
            await grantEngagementDriveFolderAccess({
                connectorId,
                engagementSlug: engagement.slug,
                email,
                role: personaSlug as "eng_admin" | "eng_member" | "eng_ext_collaborator" | "eng_viewer",
                projectName: engagement.name,
                clientSlug: engagement.client.slug,
                clientName: engagement.client.name,
                projectFolderId: engagement.connectorRootFolderId,
            });
            return { granted: true };
        });

        const documentsToGrant = await step.run("find-sharings-to-grant", async () => {
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
                const settings = doc.settings as { share?: { guest?: { enabled?: boolean }; externalCollaborator?: { enabled?: boolean } } };
                const guestEnabled = settings?.share?.guest?.enabled === true;
                const ecEnabled = settings?.share?.externalCollaborator?.enabled === true;
                if (isExternalCollaborator) return ecEnabled;
                if (isGuest) return guestEnabled;
                return false;
            });
        });

        if (documentsToGrant.length === 0) {
            return { message: "Folder access only (no per-document shares)", folderGrant, docShares: 0 };
        }

        const role: "writer" | "reader" = personaSlug === "eng_viewer" ? "reader" : "writer";

        const grantResults = await step.run("grant-permissions", async () => {
            const adapter = await getPermissionAdapter(connectorId)
            let successCount = 0;
            for (const doc of documentsToGrant) {
                try {
                    const externalId = doc.externalId;
                    if (!externalId) continue;

                    const permissionId = await adapter.grantFolderPermission(connectorId, externalId, email, role);

                    if (permissionId) {
                        await prisma.engagementDocumentSharingUser.create({
                            data: {
                                engagementId: projectId,
                                projectDocumentId: doc.id,
                                userId,
                                email,
                                connectorPermissionId: permissionId,
                                sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED,
                            },
                        });
                        successCount++;
                    }
                } catch (e) {
                    logger.error("Failed to grant permission in Inngest (V2)", e as Error);
                }
            }
            return { successCount };
        });

        return { message: "Granted permissions for new member", folderGrant, results: grantResults };
    }
);

export const migrateWorkspaceRoot = inngest.createFunction(
    {
        id: 'migrate-workspace-root',
        name: 'Migrate workspace root folder',
        retries: 2,
        triggers: [{ event: 'workspace.migrate.requested' }],
        onFailure: async ({ error, event }: { error: Error; event: { data: { event: { data: { firmId: string; newRootFolderId: string; oldRootFolderId: string; startedAt?: string } } } } }) => {
            const { firmId } = event.data.event.data
            await Promise.all([
                setMaintenanceMode(firmId, null),
                setMigrationPending(firmId, null),
            ])
            const migration = await getActiveMigration(firmId)
            if (migration) {
                await updateMigrationStatus(migration.id, 'failed')
            }
        },
    },
    async ({ event, step }: { event: { data: { connectionId: string; newRootFolderId: string; oldRootFolderId: string; firmId: string; initiatingUserId: string; estimatedMinutes: number; organizationId?: string; startedAt?: string } }; step: any }) => {
        const { connectionId, newRootFolderId, oldRootFolderId, firmId, initiatingUserId, estimatedMinutes } = event.data

        await step.run('notify-members', () =>
            sendMaintenanceWarningToFirmMembers(firmId, estimatedMinutes)
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

        await step.sleep('grace-period', '2m')

        await step.run('lock-and-sign-out', async () => {
            // Guard: if cancelled during the grace sleep, migrationPending will be null — abort
            const migration = await getActiveMigration(firmId)
            if (!migration || migration.status !== 'pending_grace') {
                logger.info('Migration cancelled during grace period — aborting lock', 'MigrateWorkspace', undefined, { firmId })
                return
            }
            await Promise.all([
                setMaintenanceMode(firmId, {
                    active: true,
                    startedAt: new Date().toISOString(),
                    expiresAt: new Date(Date.now() + Math.max(estimatedMinutes * 4, 30) * 60_000).toISOString(),
                    estimatedMinutes,
                    initiatedBy: initiatingUserId,
                    reason: 'workspace_migration',
                }),
                setMigrationPending(firmId, null),
                ...(migration ? [updateMigrationStatus(migration.id, 'in_progress')] : []),
            ])
            await forceSignOutFirmMembers(firmId, initiatingUserId)
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
            const migration = await getActiveMigration(firmId)
            const finalStatus = allFailures.length > 0 ? 'failed_partial' : 'completed'
            await Promise.all([
                setMaintenanceMode(firmId, null),
                ...(migration ? [updateMigrationStatus(migration.id, finalStatus)] : []),
            ])
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
            await Promise.allSettled([
                signOutAllNonAdminUsers(),
                sendPlatformMaintenanceEmail('on', updated, users),
                sendPlatformMaintenanceNotification('on', updated),
            ])
            logger.info(`Platform maintenance activated — ${users.length} users signed out`, 'PlatformMaintenance')
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
                    firm: { select: { slug: true } },
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
                ctaUrl: c.firm?.slug ? `/d/f/${c.firm.slug}/c/${c.slug}` : null,
                channels: { inApp: true, email: false },
                dedupeKey: `client:${c.id}:followup:${dateStr}`,
                metadata: { followUpDate: c.followUpDate?.toISOString(), clientName: c.name, internal: true },
            }))

            await (prisma as any).notification.createMany({ data: rows, skipDuplicates: true })
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
            return { sent: true }
        })

        return { reminderId: event.data.reminderId }
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
            const { getFirmReminderConfig } = await import('@/lib/actions/firms')
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

