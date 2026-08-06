import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { prisma } from "@/lib/prisma"
import { safeInngestSend } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'
import { blockIfEngagementFileMutationForbidden } from '@/lib/engagement-access'
import { resolveEngagementConnector } from '@/lib/connectors/resolve-client-connector'
import { getPermissionAdapter } from '@/lib/connectors/registry'
import type { IConnectorPermissionAdapter } from '@/lib/connectors/types'

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
        // projectId is the wire name sent by clients — aliased to engagementId internally
        const { action, fileId, limit, permissionId, expirationTime, projectId: engagementId, fileName: requestFileName } = body
        // Optional: specific connectorId. If not provided, use default.
        let { connectorId } = body

        if (!action) {
            return NextResponse.json({ error: 'Action is required' }, { status: 400 })
        }

        // 3. Resolve connector via engagement → client.connector (source of truth)
        // When no engagementId is provided, fall back to scanning the user's firm/client memberships.
        let primaryConnector: any = null
        if (engagementId) {
            primaryConnector = await resolveEngagementConnector(engagementId)
        }

        // Fallback: scan all memberships for any active connector (used for non-engagement-scoped actions)
        let connectors: Array<any & { organizationId: string }> = []
        if (!primaryConnector) {
            const [firmMemberships, clientMemberships] = await Promise.all([
                prisma.firmMember.findMany({ where: { userId: user.id }, select: { firmId: true } }),
                prisma.clientMember.findMany({ where: { userId: user.id }, include: { client: { select: { firmId: true, connectorId: true } } } }),
            ])
            const allOrgIds = Array.from(new Set([
                ...firmMemberships.map(m => m.firmId),
                ...clientMemberships.map(m => m.client.firmId),
            ]))
            const [orgsWithConnectors, clientsWithConnectors] = await Promise.all([
                prisma.firm.findMany({
                    where: { id: { in: allOrgIds }, connector: { status: 'ACTIVE' } },
                    include: { connector: true }
                }),
                prisma.client.findMany({
                    where: { id: { in: clientMemberships.map(m => m.clientId) }, connector: { status: 'ACTIVE' } },
                    include: { connector: true }
                }),
            ])
            connectors = [
                ...orgsWithConnectors.filter(o => o.connector).map(o => ({ ...o.connector!, organizationId: o.id })),
                ...clientsWithConnectors.filter(c => c.connector).map(c => ({ ...c.connector!, organizationId: c.firmId })),
            ]
        } else {
            const engagement = await prisma.engagement.findUnique({ where: { id: engagementId }, select: { firmId: true } })
            connectors = [{ ...primaryConnector, organizationId: engagement?.firmId ?? '' }]
        }

        if (connectors.length === 0) {
            return NextResponse.json({ error: 'No active storage connector found' }, { status: 404 })
        }

        // 4. Perform Action
        let result

        switch (action) {
            case 'trash':
                if (!fileId) {
                    return NextResponse.json({ error: 'fileId is required for trash action' }, { status: 400 })
                }

                // Sandbox restriction: disallow deletes for sandbox orgs.
                const orgIdForTrash = engagementId
                    ? (
                          await prisma.engagement.findFirst({
                              where: { id: engagementId, isDeleted: false },
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

                if (typeof engagementId === 'string' && engagementId) {
                    const closedDenied = await blockIfEngagementFileMutationForbidden(user.id, engagementId)
                    if (closedDenied) return closedDenied
                }

                // Try to trash the file. If connectorId is provided, use it.
                // Otherwise default to the first connector.
                let targetId = connectorId || (connectors.length > 0 ? connectors[0].id : null)
                if (!targetId) {
                    return NextResponse.json({ error: 'No active storage connector found' }, { status: 400 })
                }

                let lastTrashError: string | null = null
                const tryTrash = async (id: string): Promise<boolean> => {
                    const adapter = await getPermissionAdapter(id)
                    if (!adapter) return false
                    try {
                        await adapter.trashFile(id, fileId)
                        return true
                    } catch (err) {
                        lastTrashError = err instanceof Error ? err.message : String(err)
                        return false
                    }
                }

                let success = await tryTrash(targetId)
                let successOrgId = connectors.find(c => c.id === targetId)?.organizationId

                // FALLBACK: If trashing fails and we have multiple connectors, try others.
                // This handles "older folders" or files with mismatched connector context.
                if (!success && connectors.length > 1) {
                    logger.debug(`[trash] Failed with initial connectorId=${targetId}. Trying fallbacks for fileId=${fileId}...`)
                    for (const fallback of connectors) {
                        if (fallback.id === targetId) continue

                        success = await tryTrash(fallback.id)
                        if (success) {
                            logger.info(`[trash] Successfully trashed fileId=${fileId} using fallback connectorId=${fallback.id}`)
                            targetId = fallback.id // Re-assign so metadata fetch works below
                            successOrgId = fallback.organizationId
                            break
                        }
                    }
                }

                if (!success || !successOrgId) {
                    logger.error(`[trash] Failed to trash fileId=${fileId} after trying all connectors (success=${success}, orgId=${successOrgId}, lastError=${lastTrashError})`)
                    // Surface the real upstream error (e.g. "locked/checked out" 423 from SharePoint)
                    // when we have one, instead of a generic message that hides the actual cause.
                    const message = lastTrashError
                        ? `Failed to delete: ${lastTrashError}`
                        : 'Failed to trash file. The file may not exist in the connected storage account, or the connected account may not have permission to delete it.'
                    return NextResponse.json({ error: message }, { status: 500 })
                }

                // Get metadata using the successful connector to determine if it's a folder or file
                const trashAdapter = await getPermissionAdapter(targetId)
                const fileMeta = trashAdapter ? await trashAdapter.getFileMetadata(targetId, fileId) : null

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

                // Engagement-scoped audit: record file removed (moved to bin) when engagementId is provided
                if (engagementId) {
                    try {
                        const engagement = await prisma.engagement.findFirst({
                            where: { id: engagementId, isDeleted: false },
                            select: { firmId: true, clientId: true },
                        })
                        if (engagement) {
                            const doc = await prisma.engagementDocument.findFirst({
                                where: {
                                    engagementId,
                                    firmId: engagement.firmId,
                                    externalId: fileId,
                                },
                                select: { id: true },
                            })
                            audit(AUDIT_EVENT.DOCUMENT_DELETED)
                                .scope(AUDIT_SCOPE.DOCUMENT)
                                .firm(engagement.firmId)
                                .client(engagement.clientId)
                                .engagement(engagementId)
                                .document(doc?.id)
                                .actor(user.id)
                                .meta({ fileName: requestFileName ?? fileId, reason: 'moved_to_bin' })
                                .fireAndForget()
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
                    const adapter = await getPermissionAdapter(c.id)
                    if (!adapter) return []
                    return adapter.getDuplicateFiles(c.id, searchLimit)
                })

                const duplicateResults = await Promise.all(duplicatePromises)
                // Flatten and deduplicate by signature (same file can appear across connectors)
                const seen = new Set<string>()
                const duplicates = duplicateResults.flat().filter(g => {
                    if (seen.has(g.signature)) return false
                    seen.add(g.signature)
                    return true
                })
                result = { duplicates }
                break

            case 'stale_search':
                // Search ALL connectors and aggregate
                const staleLimit = Math.min(limit || 50, 100)
                const stalePromises = connectors.map(async c => {
                    try {
                        logger.debug(`[Stale Action] Fetching stale files for connector ${c.id}...`)
                        const adapter = await getPermissionAdapter(c.id)
                        const files = adapter ? await adapter.getStaleFiles(c.id, staleLimit) : []
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
                const revokeAdapter = await getPermissionAdapter(revokeConnectorId)
                const revoked = revokeAdapter ? await revokeAdapter.revokePermission(revokeConnectorId, fileId, permissionId) : false
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
                const expiryAdapter = await getPermissionAdapter(expiryConnectorId)
                const updated = expiryAdapter ? await expiryAdapter.updatePermissionExpiry(expiryConnectorId, fileId, permissionId, expirationTime) : false
                if (!updated) {
                    return NextResponse.json({ error: 'Failed to update permission' }, { status: 500 })
                }
                result = { success: true }
                break

            case 'folder_names': {
                const { folderIds } = body
                if (!Array.isArray(folderIds) || folderIds.length === 0) {
                    result = { names: {} }
                    break
                }
                const folderConnector = connectors[0]
                const folderNamesAdapter = await getPermissionAdapter(folderConnector.id)
                const folderMetas = folderNamesAdapter
                    ? await Promise.allSettled(
                        (folderIds as string[]).map(id => (folderNamesAdapter as IConnectorPermissionAdapter).getFileMetadata(folderConnector.id, id))
                    )
                    : []
                const folderNameMap: Record<string, string> = {}
                ;(folderIds as string[]).forEach((id, i) => {
                    const r = folderMetas[i]
                    if (r.status === 'fulfilled' && r.value?.name) folderNameMap[id] = r.value.name
                })
                result = { names: folderNameMap }
                break
            }

            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
        }

        return NextResponse.json(result)

    } catch (error) {
        logger.error('Action API Error:', error as Error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
