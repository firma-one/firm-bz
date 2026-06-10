import { prisma } from '@/lib/prisma'
import { generateProjectSlug } from '@/lib/slug-utils'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { logger } from '@/lib/logger'
import { resolveClientConnector } from '@/lib/connectors/resolve-client-connector'

/**
 * Service for managing projects in the V2 Platform schema.
 * Note: Projects now belong to Clients (Client -> Firm).
 */
export const projectService = {
    /**
     * Create a new project and ensure default members (Creator + Firm Owner)
     */
    async createProject(
        firmId: string,
        clientId: string,
        name: string,
        creatorUserId: string,
        description?: string,
        sandboxOnly?: boolean,
        skipDriveStructure?: boolean
    ) {
        // 1. Generate unique slug
        const MAX_SLUG_ATTEMPTS = 10
        let slug = generateProjectSlug(name)
        let attempts = 0
        while (attempts < MAX_SLUG_ATTEMPTS) {
            const existing = await prisma.engagement.findUnique({
                where: { clientId_slug: { clientId, slug } }
            })
            if (!existing) break
            slug = generateProjectSlug(name)
            attempts++
        }
        if (attempts >= MAX_SLUG_ATTEMPTS) {
            throw new Error('Could not generate a unique project slug. Please try again.')
        }

        const { assertWithinActiveEngagementCap } = await import('@/lib/billing/effective-billing-caps')
        await assertWithinActiveEngagementCap(firmId)

        // 2. Execute creation in transaction (RBAC v2: add creator + Client Admins & Firm Admins as Engagement Leads; no duplicates)
        const result = await prisma.$transaction(async (tx) => {
            const project = await tx.engagement.create({
                data: {
                    firmId,
                    name,
                    slug,
                    description: description ?? null,
                    clientId,
                    sandboxOnly: !!sandboxOnly,
                    createdBy: creatorUserId,
                    updatedBy: creatorUserId,
                }
            })

            const existingMemberIds = new Set<string>([creatorUserId])
            await tx.engagementMember.create({
                data: {
                    engagementId: project.id,
                    userId: creatorUserId,
                    role: 'eng_admin',
                    createdBy: creatorUserId,
                    updatedBy: creatorUserId,
                }
            })

            const clientAdminPersona = await tx.persona.findUnique({
                where: { slug: 'client_admin' }
            })
            const [firmAdmins, clientAdmins] = await Promise.all([
                tx.firmMember.findMany({
                    where: { firmId, role: 'firm_admin' },
                    select: { userId: true }
                }),
                clientAdminPersona
                    ? tx.clientMember.findMany({
                        where: { clientId, personaId: clientAdminPersona.id },
                        select: { userId: true }
                    })
                    : []
            ])
            const leadUserIds = Array.from(new Set([
                ...firmAdmins.map((m) => m.userId),
                ...clientAdmins.map((m) => m.userId)
            ])).filter((id) => !existingMemberIds.has(id))
            for (const userId of leadUserIds) {
                existingMemberIds.add(userId)
                await tx.engagementMember.create({
                    data: {
                        engagementId: project.id,
                        userId,
                        role: 'eng_admin',
                        createdBy: creatorUserId,
                        updatedBy: creatorUserId,
                    }
                })
            }

            return project
        })

        // 4. Create Drive Folder Structure (V2 - Automated); skip when building sandbox in one batch (Option B)
        let folderStructure: { projectId?: string; generalFolderId?: string } | null = null
        if (!skipDriveStructure) {
        try {
            const { connectorId } = await resolveClientConnector(clientId)

            if (connectorId) {
                const client = await (prisma as any).client.findUnique({
                    where: { id: clientId },
                    select: { name: true, slug: true }
                })

                if (client) {
                    const fs = await googleDriveConnector.ensureAppFolderStructure(
                        connectorId,
                        client.name,
                        client.slug,
                        await googleDriveConnector.createGoogleDriveAdapter(connectorId),
                        firmId,
                        {
                            projectName: result.name,
                            projectSlug: result.slug
                        }
                    )

                    if (fs.projectId) {
                        await prisma.engagement.update({
                            where: { id: result.id },
                            data: { connectorRootFolderId: fs.projectId }
                        })
                        result.connectorRootFolderId = fs.projectId
                    }
                    folderStructure = {
                        projectId: fs.projectId,
                        generalFolderId: fs.generalFolderId,
                    }
                }
            }
        } catch (e) {
            logger.error("Failed to create/register Google Drive folders in projectService", e as Error)
        }
        }

        return { project: result, folderStructure }
    },
}
