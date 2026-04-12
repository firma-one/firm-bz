import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { prisma } from "@/lib/prisma"
import { ConnectorType } from "@prisma/client"
import { googleDriveConnector } from "@/lib/google-drive-connector"
import { safeInngestSend } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'
import { createPlatformAuditEvent } from '@/lib/platform-audit'
import { blockIfEngagementFileMutationForbidden } from '@/lib/engagement-access'

const supabase = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321"),
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
    try {
        // 1. Auth Check
        const authHeader = request.headers.get('authorization')
        if (!authHeader) {
            return NextResponse.json({ error: 'No authorization header' }, { status: 401 })
        }

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: authError } = await supabase.auth.getUser(token)

        if (authError || !user) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
        }

        // 2. Parse Request Body
        const body = await request.json()
        const { action, fileId, limit, permissionId, expirationTime, projectId: requestProjectId, fileName: requestFileName } = body
        // Optional: specific connectorId. If not provided, use default.
        let { connectorId } = body

        if (!action) {
            return NextResponse.json({ error: 'Action is required' }, { status: 400 })
        }

        // 3. Get Active Connectors — firm / client / engagement memberships (firm id = org scope)
        const firmMemberships = await prisma.firmMember.findMany({
            where: { userId: user.id },
            select: { firmId: true },
        })

        const clientMemberships = await prisma.clientMember.findMany({
            where: { userId: user.id },
            include: { client: { select: { firmId: true } } },
        })

        const engagementMemberships = await prisma.engagementMember.findMany({
            where: { userId: user.id },
            include: { engagement: { select: { firmId: true } } },
        })

        const allOrgIds = Array.from(
            new Set([
                ...firmMemberships.map((m) => m.firmId),
                ...clientMemberships.map((m) => m.client.firmId),
                ...engagementMemberships.map((m) => m.engagement.firmId),
            ])
        )

        const orgsWithConnectors = await prisma.firm.findMany({
            where: {
                id: { in: allOrgIds },
                connector: {
                    type: ConnectorType.GOOGLE_DRIVE,
                    status: 'ACTIVE'
                }
            },
            include: { connector: true }
        })

        if (orgsWithConnectors.length === 0) {
            return NextResponse.json({ error: 'No active Google Drive connection found' }, { status: 404 })
        }

        // Map connectors with their organization IDs for fallback logic
        const connectors = orgsWithConnectors
            .filter(o => o.connector)
            .map(o => ({
                ...o.connector!,
                organizationId: o.id
            }))

        // 4. Perform Action
        let result

        switch (action) {
            case 'trash':
                if (!fileId) {
                    return NextResponse.json({ error: 'fileId is required for trash action' }, { status: 400 })
                }

                // Sandbox restriction: disallow deletes for sandbox orgs.
                // Prefer project-scoped determination when available; otherwise infer via connector mapping.
                const orgIdForTrash = requestProjectId
                    ? (
                          await prisma.engagement.findFirst({
                              where: { id: requestProjectId, isDeleted: false },
                              select: { firmId: true },
                          })
                      )?.firmId
                    : (connectorId
                        ? connectors.find(c => c.id === connectorId)?.organizationId
                        : connectors[0]?.organizationId)

                if (orgIdForTrash) {
                    const org = await prisma.firm.findUnique({
                        where: { id: orgIdForTrash },
                        select: { sandboxOnly: true }
                    })
                    if (org?.sandboxOnly) {
                        return NextResponse.json({ error: 'Deleting documents is restricted for Sandbox Organizations.' }, { status: 403 })
                    }
                }

                if (typeof requestProjectId === 'string' && requestProjectId) {
                    const closedDenied = await blockIfEngagementFileMutationForbidden(user.id, requestProjectId)
                    if (closedDenied) return closedDenied
                }

                // Try to trash the file. If connectorId is provided, use it.
                // Otherwise default to the first connector.
                let targetId = connectorId || (connectors.length > 0 ? connectors[0].id : null)
                if (!targetId) {
                    return NextResponse.json({ error: 'No valid connector found' }, { status: 400 })
                }

                let success = await googleDriveConnector.trashFile(targetId, fileId)
                let successOrgId = connectors.find(c => c.id === targetId)?.organizationId

                // FALLBACK: If trashing fails and we have multiple connectors, try others.
                // This handles "older folders" or files with mismatched connector context.
                if (!success && connectors.length > 1) {
                    logger.debug(`[trash] Failed with initial connectorId=${targetId}. Trying fallbacks for fileId=${fileId}...`)
                    for (const fallback of connectors) {
                        if (fallback.id === targetId) continue

                        success = await googleDriveConnector.trashFile(fallback.id, fileId)
                        if (success) {
                            logger.info(`[trash] Successfully trashed fileId=${fileId} using fallback connectorId=${fallback.id}`)
                            targetId = fallback.id // Re-assign so metadata fetch works below
                            successOrgId = fallback.organizationId
                            break
                        }
                    }
                }

                if (!success || !successOrgId) {
                    logger.error(`[trash] Failed to trash fileId=${fileId} after trying all connectors (success=${success}, orgId=${successOrgId})`)
                    return NextResponse.json({ error: 'Failed to trash file. The file may not exist in the connected Google Drive account, or the connected account may not have permission to delete it.' }, { status: 500 })
                }

                // Get metadata using the successful connector to determine if it's a folder or file
                const fileMeta = await googleDriveConnector.getFileMetadata(targetId, fileId)

                // Trigger background reconciliation via Inngest
                if (fileMeta?.mimeType === 'application/vnd.google-apps.folder') {
                    await safeInngestSend('folder.delete.requested', {
                        organizationId: successOrgId,
                        externalId: fileId
                    })
                } else {
                    await safeInngestSend('file.delete.requested', {
                        organizationId: successOrgId,
                        externalId: fileId
                    })
                }

                // Project-scoped audit: record file removed (moved to bin) when projectId is provided
                if (requestProjectId) {
                    try {
                        const project = await prisma.engagement.findFirst({
                            where: { id: requestProjectId, isDeleted: false },
                            select: { firmId: true, clientId: true },
                        })
                        if (project) {
                            const doc = await prisma.engagementDocument.findFirst({
                                where: {
                                    engagementId: requestProjectId,
                                    firmId: project.firmId,
                                    externalId: fileId,
                                },
                                select: { id: true },
                            })
                            await createPlatformAuditEvent({
                                organizationId: project.firmId,
                                clientId: project.clientId,
                                projectId: requestProjectId,
                                projectDocumentId: doc?.id ?? undefined,
                                eventType: 'PROJECT_DOCUMENT_REMOVED',
                                actorUserId: user.id,
                                metadata: { fileName: requestFileName ?? fileId, reason: 'moved_to_bin' },
                            })
                        }
                    } catch (auditErr) {
                        logger.warn('[trash] Failed to create audit event', auditErr as Error)
                    }
                }

                result = { success: true }
                break

            case 'duplicate_search':
                // Search ALL connectors and aggregate
                const searchLimit = Math.min(limit || 50, 100)
                const duplicatePromises = connectors.map(async c => {
                    const groups = await googleDriveConnector.getDuplicateFiles(c.id, searchLimit)
                    // Inject source info? Duplicate groups structure is complex [[file, file], [file, file]]
                    // We might need to flatten or tag? 
                    // getDuplicateFiles returns File[][].
                    return groups
                })

                const duplicateResults = await Promise.all(duplicatePromises)
                // Flatten: File[][] -> File[] (groups)
                const duplicates = duplicateResults.flat()
                result = { duplicates }
                break

            case 'stale_search':
                // Search ALL connectors and aggregate
                const staleLimit = Math.min(limit || 50, 100)
                const stalePromises = connectors.map(async c => {
                    try {
                        logger.debug(`[Stale Action] Fetching stale files for connector ${c.id}...`)
                        const files = await googleDriveConnector.getStaleFiles(c.id, staleLimit)
                        logger.debug(`[Stale Action] Connector ${c.id} returned ${files.length} files`)
                        // Inject connector info so frontend has context
                        return files.map(f => ({
                            ...f,
                            connectorId: c.id,
                            source: c.name ?? c.id
                        }))
                    } catch (e) {
                        logger.error(`[Stale Action] Failed to search stale files for ${c.id}`, e as Error)
                        return []
                    }
                })

                const staleArrays = await Promise.all(stalePromises)
                const staleFiles = staleArrays.flat()
                result = { files: staleFiles }
                break

            case 'revoke':
                if (!fileId || !permissionId) {
                    return NextResponse.json({ error: 'fileId and permissionId are required' }, { status: 400 })
                }
                const revokeConnectorId = connectorId || connectors[0].id
                const revoked = await googleDriveConnector.revokePermission(revokeConnectorId, fileId, permissionId)
                if (!revoked) {
                    return NextResponse.json({ error: 'Failed to revoke permission' }, { status: 500 })
                }
                result = { success: true }
                break

            case 'set_expiry':
                if (!fileId || !permissionId || !expirationTime) {
                    return NextResponse.json({ error: 'fileId, permissionId and expirationTime are required' }, { status: 400 })
                }
                const expiryConnectorId = connectorId || connectors[0].id
                const updated = await googleDriveConnector.updatePermissionExpiry(expiryConnectorId, fileId, permissionId, expirationTime)
                if (!updated) {
                    return NextResponse.json({ error: 'Failed to update permission' }, { status: 500 })
                }
                result = { success: true }
                break

            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
        }

        return NextResponse.json(result)

    } catch (error) {
        logger.error('Action API Error:', error as Error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
