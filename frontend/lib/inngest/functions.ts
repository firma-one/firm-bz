import { inngest } from "./client";
import { prisma } from "@/lib/prisma";
import { googleDriveConnector } from "@/lib/google-drive-connector";
import { logger } from "@/lib/logger";
import { DocumentSharingPermissionStatus } from "@prisma/client";
import { grantEngagementDriveFolderAccess } from "@/lib/grant-engagement-drive-folder-access";
import { safeInngestSend } from "./client";
import { provisionSandboxHierarchyForFirm } from '@/lib/onboarding/onboarding-helper'

// ---------------------------------------------------------------------------
// Search Indexing Functions
// ---------------------------------------------------------------------------

/**
 * Index a single file or folder for search (V2)
 */
export const indexFileForSearch = inngest.createFunction(
    { id: "index-file-for-search" },
    { event: "file.index.requested" },
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
        return { externalId: event.data.externalId, fileName: event.data.fileName }
    }
)

/**
 * Index a batch of files/folders for search (V2)
 */
export const indexBatchForSearch = inngest.createFunction(
    { id: "index-batch-for-search" },
    { event: "file.index.batch.requested" },
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
    { id: "scan-and-index-project" },
    { event: "project.index.scan.requested" },
    async ({ event, step }) => {
        const { organizationId, clientId, projectId, connectorId, rootFolderIds } = event.data

        const allFiles = await step.run("discover-files", async () => {
            const files: { externalId: string; fileName: string; parentId: string | null }[] = []
            const queue = [...rootFolderIds]
            const visited = new Set<string>()

            for (const folderId of rootFolderIds) {
                try {
                    const meta = await googleDriveConnector.getFileMetadata(connectorId, folderId)
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
                    const children = await googleDriveConnector.listFiles(connectorId, folderId, 500)
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
    { id: "populate-sandbox-sample-files" },
    { event: "sandbox.populate.sample-files.requested" },
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

/** Async half of onboarding Stage 1 (sandbox): Drive + DB hierarchy + documents (after create-sandbox sync). */
export const provisionSandboxHierarchy = inngest.createFunction(
    { id: 'provision-sandbox-hierarchy' },
    { event: 'sandbox.provision.requested' },
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
    { id: "reconcile-file-deletion" },
    { event: "file.delete.requested" },
    async ({ event, step }) => {
        const { organizationId, externalId, googlePermissionId } = event.data

        await step.run("remove-from-search-index", async () => {
            const { SearchService } = await import("@/lib/services/search-service")
            await SearchService.removeFile(organizationId, externalId)
        })

        if (googlePermissionId) {
            await step.run("revoke-google-permission", async () => {
                const firm = await prisma.firm.findUnique({
                    where: { id: organizationId },
                    select: { connectorId: true }
                })
                const connectorId = firm?.connectorId
                if (connectorId) {
                    await googleDriveConnector.revokePermission(connectorId, externalId, googlePermissionId)
                }
            })
        }

        await step.run("cleanup-sharing-records", async () => {
            const docs = await prisma.engagementDocument.findMany({
                where: { firmId: organizationId, externalId },
                select: { id: true },
            })
            const docIds = docs.map((d) => d.id)
            if (docIds.length === 0) return
            await prisma.engagementDocumentSharingUser.updateMany({
                where: {
                    projectDocumentId: { in: docIds },
                    ...(googlePermissionId ? { googlePermissionId } : {}),
                },
                data: {
                    sharingPermissionStatus: DocumentSharingPermissionStatus.REVOKED,
                    googlePermissionId: null,
                },
            })
        })

        return { externalId, status: "reconciled" }
    }
)

/**
 * Reconciliation for folder deletion (V2)
 */
export const reconcileFolderDeletion = inngest.createFunction(
    { id: "reconcile-folder-deletion" },
    { event: "folder.delete.requested" },
    async ({ event, step }) => {
        const { organizationId, externalId } = event.data

        await step.run("remove-folder-from-search-index", async () => {
            const { SearchService } = await import("@/lib/services/search-service")
            await SearchService.removeFile(organizationId, externalId)
        })

        return { externalId, status: "reconciled" }
    }
)

export const revokeProjectSharing = inngest.createFunction(
    { id: "revoke-project-sharing" },
    { event: "project/archived" },
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
                        googlePermissionId: null,
                    },
                });
            });
            return { message: "Marked shares revoked (no connector)", projectId };
        }

        const revokeResults = await step.run("revoke-permissions", async () => {
            let successCount = 0;
            const BATCH_SIZE = 10;

            for (let i = 0; i < shares.length; i += BATCH_SIZE) {
                const batch = shares.slice(i, i + BATCH_SIZE);
                await Promise.all(batch.map(async (share: { googlePermissionId: string | null; document: { externalId: string } | null }) => {
                    if (share.googlePermissionId && share.document?.externalId) {
                        try {
                            await googleDriveConnector.revokePermission(connectorId, share.document.externalId, share.googlePermissionId);
                            successCount++;
                        } catch (e) {
                            successCount++
                        }
                    }
                }));
            }
            return { successCount };
        });

        await step.run("mark-shares-revoked", async () => {
            await prisma.engagementDocumentSharingUser.updateMany({
                where: { engagementId: projectId },
                data: {
                    sharingPermissionStatus: DocumentSharingPermissionStatus.REVOKED,
                    googlePermissionId: null,
                },
            });
        });

        await step.run("downgrade-eng-member-folder-access", async () => {
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
                where: { engagementId: projectId, role: "eng_member" },
                select: { userId: true },
            });
            if (members.length === 0) return { downgraded: 0 };

            const userIds = members.map((m) => `'${m.userId}'`).join(",");
            const authUsers = await prisma.$queryRawUnsafe<Array<{ id: string; email: string }>>(
                `SELECT id::text, email FROM auth.users WHERE id IN (${userIds})`
            );
            const folderIds = await googleDriveConnector.getProjectFolderIds(cid, engagement.slug, {
                projectName: engagement.name,
                clientSlug: engagement.client.slug,
                clientName: engagement.client.name,
                projectFolderId: engagement.connectorRootFolderId,
            });
            let n = 0;
            for (const row of authUsers) {
                if (!row.email) continue;
                if (folderIds.generalFolderId) {
                    if (await googleDriveConnector.downgradeFolderUserPermissionToReader(cid, folderIds.generalFolderId, row.email)) n++;
                }
                if (folderIds.confidentialFolderId) {
                    await googleDriveConnector.downgradeFolderUserPermissionToReader(cid, folderIds.confidentialFolderId, row.email);
                }
            }
            return { downgraded: n };
        });

        return { message: "Revoked project permissions", results: revokeResults, projectId };
    }
);

/**
 * Revoke permissions when sharing settings updated (V2)
 */
export const revokeByDisabledPersona = inngest.createFunction(
    { id: "revoke-by-disabled-persona" },
    { event: "sharing.settings.updated" },
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

                if (shouldRevoke && user.googlePermissionId) {
                    usersForRevocation.push(user);
                }
            }
            return usersForRevocation;
        });

        if (usersToRevoke.length === 0) return { message: "No users to revoke" };

        const revokeResults = await step.run("revoke-permissions", async () => {
            let successCount = 0;
            for (const user of usersToRevoke) {
                if (user.googlePermissionId) {
                    try {
                        await googleDriveConnector.revokePermission(connectorId, documentId, user.googlePermissionId);
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
                    googlePermissionId: null,
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
    { id: "revoke-by-member-persona-change" },
    { event: "project.member.persona.updated" },
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

            return docs.flatMap((d: any) => d.sharingUsers.map((u: any) => ({ document: d, user: u }))).filter((x: any) => x.user.googlePermissionId);
        });

        if (sharesToRevoke.length === 0) return { message: "No shares found" };

        const revokeResults = await step.run("revoke-permissions", async () => {
            let successCount = 0;
            for (const { document, user } of sharesToRevoke) {
                if (user.googlePermissionId && document.externalId) {
                    try {
                        await googleDriveConnector.revokePermission(connectorId, document.externalId, user.googlePermissionId);
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
                    googlePermissionId: null,
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
    { id: "grant-permissions-for-new-member" },
    { event: "project.member.added" },
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
            let successCount = 0;
            for (const doc of documentsToGrant) {
                try {
                    const externalId = doc.externalId;
                    if (!externalId) continue;

                    const permissionId = await googleDriveConnector.grantFolderPermission(connectorId, externalId, email, role);

                    if (permissionId) {
                        await prisma.engagementDocumentSharingUser.create({
                            data: {
                                engagementId: projectId,
                                projectDocumentId: doc.id,
                                userId,
                                email,
                                googlePermissionId: permissionId,
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
