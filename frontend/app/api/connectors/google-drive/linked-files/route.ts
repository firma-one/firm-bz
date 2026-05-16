import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { getViewAsPersonaFromCookie } from '@/lib/view-as-server'
import { canAccessRbacAdmin } from '@/lib/permission-helpers'
import { getSharedAndAncestorIdsForPersona, isFolderUnderSharedFolderDB } from '@/lib/project-sharing-ids'
import { safeInngestSend } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'
import { GoogleDriveAuthError } from '@/lib/google-drive-connector'
import { blockIfEngagementFileMutationForbidden } from '@/lib/engagement-access'
import { IndexingInterceptor } from '@/lib/services/indexing-interceptor'
import { getLock, isDocumentPrivate } from '@/lib/sharing-settings'
// GET: List linked files for a connector
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams
        const connectionId = searchParams.get('connectionId')

        if (!connectionId) {
            return NextResponse.json({ error: 'Missing connectionId' }, { status: 400 })
        }

        const linkedFilesDb = await prisma.engagementDocument.findMany({
            where: { connectorId: connectionId },
            orderBy: { createdAt: 'desc' },
        })

        if (linkedFilesDb.length === 0) {
            return NextResponse.json({ files: [] })
        }

        const fileIds = linkedFilesDb.map((f: any) => f.externalId)

        const { googleDriveConnector } = await import('@/lib/google-drive-connector')
        const driveFiles = await googleDriveConnector.getFilesMetadata(connectionId, fileIds)
        const driveFileMap = new Map(driveFiles.map(f => [f.id, f]))

        // Merge DB data with Drive data
        const mergedFiles = linkedFilesDb.map((dbFile: any) => {
            const driveFile = driveFileMap.get(dbFile.externalId)

            return {
                id: dbFile.externalId, // Use externalId as key for frontend actions
                fileId: dbFile.externalId,
                name: driveFile?.name || dbFile.fileName || 'Unknown File',
                mimeType: driveFile?.mimeType || dbFile.mimeType || 'unknown',
                size: driveFile?.size ? driveFile.size.toString() : (dbFile.fileSize ? dbFile.fileSize.toString() : '0'),
                linkedAt: dbFile.createdAt,
                isGrantRevoked: false, // In new model, we just delete the record if revoked
                webViewLink: driveFile?.webViewLink
            }
        })

        return NextResponse.json({ files: mergedFiles })
    } catch (error) {
        console.error('Fetch Linked Files Error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}

// DELETE: "Revoke" access (Mutable Soft Delete via Update)
export async function DELETE(request: NextRequest) {
    try {
        const body = await request.json()
        const { id, connectionId } = body // id here corresponds to fileId

        if (!id || !connectionId) {
            return NextResponse.json({ error: 'Missing file ID or connection ID' }, { status: 400 })
        }

        await prisma.engagementDocument.deleteMany({
            where: {
                connectorId: connectionId,
                externalId: id,
            },
        })

        // Remove from project search index
        // We look up the firmId from the firm that owns this connector
        const connector = await prisma.connector.findUnique({
            where: { id: connectionId }
        })
        if (connector) {
            const firm = await prisma.firm.findFirst({
                where: { connectorId: connector.id }
            })
            if (firm) {
                await safeInngestSend('file.delete.requested', {
                    organizationId: firm.id,
                    externalId: id
                })
            }
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Revoke Linked File Error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}

// POST: List files or Create Folder in a Google Drive folder
export async function POST(request: NextRequest) {
    try {
        // 1. Auth Check
        const authHeader = request.headers.get('authorization')
        if (!authHeader) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { createClient } = require('@supabase/supabase-js')
        const supabase = createClient(
            (process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321"),
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: authError } = await supabase.auth.getUser(token)

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // 2. Parse Request (guard against empty or invalid JSON)
        let body: Record<string, unknown> = {}
        try {
            const text = await request.text()
            body = text ? JSON.parse(text) : {}
        } catch {
            return NextResponse.json({ error: 'Invalid or empty JSON body' }, { status: 400 })
        }
        const { action, folderId, projectId: bodyProjectId, viewAsPersonaSlug: bodyViewAs, pageSize: bodyPageSize } = body

        if (action === 'list') {
            if (typeof folderId !== 'string' || !folderId) {
                return NextResponse.json({ error: 'Missing folderId' }, { status: 400 })
            }

            const { googleDriveConnector } = await import('@/lib/google-drive-connector')
            type ProjectContext = {
                projectId: string
                clientId: string | null
                generalFolderId: string | null
                confidentialFolderId: string | null
                personaName: string | null
                personaSlug?: string | null
                firmId?: string | null
            }

            let connector: { id: string; accessToken: string } | null = null
            let projectContext: ProjectContext | null = null

            // When projectId is provided, use the project's org connector and build context from project membership (eng_admin / eng_member see files)
            if (bodyProjectId) {
                const project = await prisma.engagement.findFirst({
                    where: { id: bodyProjectId, isDeleted: false },
                    include: {
                        client: {
                            include: {
                                firm: {
                                    include: {
                                        connector: true
                                    }
                                }
                            }
                        },
                        members: {
                            where: { userId: user.id }
                        }
                    }
                })
                if (project) {
                    connector = project.client.firm.connector ?? null
                    if (connector) {
                        const folderIds = await googleDriveConnector.getProjectFolderIds(connector.id, project.slug, {
                            projectName: project.name,
                            clientSlug: project.client.slug,
                            clientName: project.client.name,
                            projectFolderId: project.connectorRootFolderId
                        })
                        const userMember = project.members[0]
                        projectContext = {
                            projectId: project.id,
                            clientId: project.clientId,
                            generalFolderId: folderIds.generalFolderId,
                            confidentialFolderId: folderIds.confidentialFolderId,
                            personaName: userMember?.role ?? null,
                            personaSlug: userMember?.role ?? null,
                            firmId: (project as any).client.firmId
                        }
                    }
                }
            }

            // Fallback: search across all RELATIONSHIPS (Org, Client, Project) for an active connector
            if (!connector) {
                const orgMemberships = await (prisma as any).firmMember.findMany({
                    where: { userId: user.id },
                    select: { firmId: true, isDefault: true }
                })

                const clientMemberships = await prisma.clientMember.findMany({
                    where: { userId: user.id },
                    include: { client: { select: { firmId: true } } }
                })

                const projectMemberships = await prisma.engagementMember.findMany({
                    where: { userId: user.id },
                    include: { engagement: { include: { client: { select: { firmId: true } } } } }
                })

                const allOrgIds = Array.from(new Set([
                    ...orgMemberships.map((m: any) => m.firmId),
                    ...clientMemberships.map((m: any) => m.client.firmId),
                    ...projectMemberships.map((m: any) => m.engagement.client.firmId)
                ]))

                // Find firms with active GOOGLE_DRIVE connectors
                const orgsWithConnectors = await prisma.firm.findMany({
                    where: {
                        id: { in: allOrgIds },
                        connector: {
                            type: 'GOOGLE_DRIVE',
                            status: 'ACTIVE'
                        }
                    },
                    include: { connector: true }
                })

                // Prioritize connector from default membership if it exists
                const defaultOrgId = orgMemberships.find((m: any) => m.isDefault)?.firmId
                if (defaultOrgId) {
                    const defaultOrgWithConnector = orgsWithConnectors.find((o: any) => o.id === defaultOrgId)
                    connector = defaultOrgWithConnector?.connector ?? orgsWithConnectors[0]?.connector ?? null
                } else {
                    connector = orgsWithConnectors[0]?.connector ?? null
                }
                logger.debug('[API] linked-files: Fallback connector search complete', {
                    found: !!connector,
                    orgsWithConnectorsCount: orgsWithConnectors.length,
                    defaultOrgId,
                    resolvedConnectorId: connector?.id
                })
            }

            if (!connector) {
                return NextResponse.json({ error: 'No active Google Drive connection found' }, { status: 404 })
            }

            // If we don't have projectContext yet (no bodyProjectId or project not found), resolve from folderId
            if (!projectContext) {
                const project = await prisma.engagement.findFirst({
                    where: { connectorRootFolderId: folderId },
                    include: {
                        client: { select: { firmId: true } },
                        members: {
                            where: { userId: user.id }
                        }
                    }
                })
                if (project) {
                    const folderIds = await googleDriveConnector.getProjectFolderIds(connector.id, project.slug)
                    const userMember = project.members[0]
                    projectContext = {
                        projectId: project.id,
                        clientId: project.clientId,
                        generalFolderId: folderIds.generalFolderId,
                        confidentialFolderId: folderIds.confidentialFolderId,
                        personaName: userMember?.role ?? null,
                        personaSlug: userMember?.role ?? null,
                        firmId: (project as any).client?.firmId ?? null
                    }
                } else {
                    try {
                        const fileMetadata = await googleDriveConnector.getFileMetadata(connector.id, folderId)
                        if (fileMetadata?.parents?.length) {
                            const parentFolderId = fileMetadata.parents[0]
                            const parentProject = await prisma.engagement.findFirst({
                                where: { connectorRootFolderId: parentFolderId },
                                include: {
                                    client: { select: { firmId: true } },
                                    members: {
                                        where: { userId: user.id }
                                    }
                                }
                            })
                            if (parentProject) {
                                const folderIds = await googleDriveConnector.getProjectFolderIds(connector.id, parentProject.slug)
                                const userMember = parentProject.members[0]
                                projectContext = {
                                    projectId: parentProject.id,
                                    clientId: parentProject.clientId,
                                    generalFolderId: folderIds.generalFolderId,
                                    confidentialFolderId: folderIds.confidentialFolderId,
                                    personaName: userMember?.role ?? null,
                                    personaSlug: userMember?.role ?? null,
                                    firmId: (parentProject as any).client?.firmId ?? null
                                }
                            }
                        }
                    } catch {
                        // continue without project context
                    }
                }
            }

            const userEmail = user.email || undefined
            const listLimit = typeof bodyPageSize === 'number' && bodyPageSize > 0 ? Math.min(500, bodyPageSize) : 100

            // Detect EC/Guest persona. Fast path: genuine member role requires no extra DB/cookie calls.
            // Slow path: view-as impersonation (RBAC admins only) — check body first, then cookie.
            let personaSlugToFilter: 'eng_ext_collaborator' | 'eng_viewer' | null = null
            if (bodyProjectId) {
                if (projectContext?.personaSlug === 'eng_ext_collaborator' || projectContext?.personaSlug === 'eng_viewer') {
                    personaSlugToFilter = projectContext.personaSlug as 'eng_ext_collaborator' | 'eng_viewer'
                } else {
                    const bodyViewAsIsEC = bodyViewAs === 'eng_ext_collaborator' || bodyViewAs === 'eng_viewer'
                    const cookieViewAs = await getViewAsPersonaFromCookie()
                    if (bodyViewAsIsEC || cookieViewAs) {
                        const canUseViewAs = await canAccessRbacAdmin(user.id)
                        if (canUseViewAs) {
                            const viewAsSlug = bodyViewAsIsEC ? bodyViewAs : cookieViewAs
                            if (viewAsSlug === 'eng_ext_collaborator' || viewAsSlug === 'eng_viewer') {
                                personaSlugToFilter = viewAsSlug as 'eng_ext_collaborator' | 'eng_viewer'
                            }
                        }
                    }
                }
            }

            let files: any[] = []

            if (personaSlugToFilter && projectContext) {
                // EC/Guest: fully DB-driven listing — no Drive API call for listing.
                // sharedIds/ancestorIds computed from engagement_documents (Drive authoritative for parents).
                const { sharedIds, ancestorIds, parentMap } = await getSharedAndAncestorIdsForPersona(
                    projectContext.projectId, personaSlugToFilter, { skipDescendants: true }
                )
                const allowSet = new Set([...sharedIds, ...ancestorIds])
                const folderInShared = sharedIds.includes(folderId)
                const folderUnderShared = !folderInShared && isFolderUnderSharedFolderDB(folderId, sharedIds, parentMap)

                // When folderId is a shared folder or its descendant, show all direct children.
                // Otherwise restrict to only children that appear in allowSet.
                const [dbRows, intakeRows] = await Promise.all([
                    prisma.engagementDocument.findMany({
                        where: {
                            engagementId: projectContext.projectId,
                            parentId: folderId,
                            ...(folderInShared || folderUnderShared ? {} : { externalId: { in: Array.from(allowSet) } }),
                        },
                        select: { id: true, externalId: true, fileName: true, mimeType: true, fileSize: true, isFolder: true, metadata: true, settings: true },
                    }),
                    // Also surface the EC/EV's own PENDING intake files/folders in this folder
                    prisma.engagementDocument.findMany({
                        where: {
                            engagementId: projectContext.projectId,
                            parentId: folderId,
                            settings: { path: ['lock', 'uploadedBy'], equals: user.id } as any,
                        },
                        select: { id: true, externalId: true, fileName: true, mimeType: true, fileSize: true, isFolder: true, metadata: true, settings: true },
                    }),
                ])

                const visibleDbRows = dbRows.filter((row) => !isDocumentPrivate(row.settings))
                const seenIds = new Set<string>()
                const mapRow = (row: any) => ({
                    id: row.externalId,
                    name: row.fileName,
                    mimeType: row.mimeType ?? null,
                    size: row.fileSize != null ? String(row.fileSize) : null,
                    modifiedTime: (row.metadata as any)?.modifiedTime ?? null,
                    webViewLink: (row.metadata as any)?.webViewLink ?? null,
                    isFolder: row.isFolder,
                    connectorId: connector.id,
                    projectDocumentId: row.id,
                    lock: getLock(row.settings),
                })
                for (const row of [...visibleDbRows, ...intakeRows]) {
                    if (!seenIds.has(row.externalId)) {
                        seenIds.add(row.externalId)
                        files.push(mapRow(row))
                    }
                }
            } else {
                // Internal personas: Drive-based listing — completely unchanged.
                files = await googleDriveConnector.listFiles(
                    connector.id,
                    folderId,
                    listLimit,
                    userEmail,
                    projectContext
                )

                // Attach internal projectDocument UUIDs for UI deeplinks (never expose Drive id in URL).
                // Also surface PENDING intake shadow rows not yet in the Drive listing.
                if (bodyProjectId) {
                    const driveIds = files.length > 0
                        ? Array.from(new Set(files.map((f: { id: string }) => f.id).filter(Boolean)))
                        : []

                    const [enrichRows, intakePendingRows] = await Promise.all([
                        driveIds.length > 0
                            ? prisma.engagementDocument.findMany({
                                where: { engagementId: bodyProjectId, externalId: { in: driveIds } },
                                select: { id: true, externalId: true, settings: true },
                            })
                            : [],
                        // All PENDING intake docs/folders in this folder (shadow rows for EL/internal)
                        prisma.engagementDocument.findMany({
                            where: {
                                engagementId: bodyProjectId,
                                parentId: folderId,
                                settings: { path: ['lock', 'type'], equals: 'intake' } as any,
                            },
                            select: { id: true, externalId: true, fileName: true, mimeType: true, fileSize: true, isFolder: true, metadata: true, settings: true },
                        }),
                    ])

                    const internalByExternal = new Map<string, string>(enrichRows.map((r: any) => [r.externalId, r.id]))
                    const lockByExternal = new Map<string, any>(enrichRows.map((r: any) => [r.externalId, getLock(r.settings)]))
const privateByExternal = new Map<string, boolean>(enrichRows.map((r: any) => [r.externalId, isDocumentPrivate(r.settings)]))
                    const sharedExternalByExternal = new Map<string, boolean>(enrichRows.map((r: any) => {
                        const s = (r.settings as Record<string, any>) || {}
                        const share = s.share
                        const ecEnabled = share?.externalCollaborator?.enabled === true || s.externalCollaborator === true
                        const guestEnabled = share?.guest?.enabled === true || s.guest === true
                        return [r.externalId, ecEnabled || guestEnabled]
                    }))

                    files = files.map((f: any) => ({
                        ...f,
                        projectDocumentId: internalByExternal.get(f.id) ?? undefined,
                        lock: lockByExternal.get(f.id) ?? null,
                        isPrivate: privateByExternal.get(f.id) ?? false,
                        isSharedWithExternal: sharedExternalByExternal.get(f.id) ?? false,
                    }))

                    // Merge PENDING intake rows that aren't already in Drive listing
                    const driveIdSet = new Set(files.map((f: any) => f.id))
                    for (const row of intakePendingRows) {
                        if (!driveIdSet.has(row.externalId)) {
                            files.push({
                                id: row.externalId,
                                name: row.fileName,
                                mimeType: row.mimeType ?? null,
                                size: row.fileSize != null ? String(row.fileSize) : null,
                                modifiedTime: (row.metadata as any)?.modifiedTime ?? null,
                                webViewLink: (row.metadata as any)?.webViewLink ?? null,
                                isFolder: row.isFolder ?? false,
                                connectorId: connector.id,
                                projectDocumentId: row.id,
                                lock: getLock(row.settings),
                            })
                        }
                    }
                }
            }

            return NextResponse.json({ files })
        }

        if (action === 'create-folder') {
            const { name, mimeType } = body
            if (typeof folderId !== 'string' || !folderId || typeof name !== 'string' || !name) {
                return NextResponse.json({ error: 'Missing folderId or name' }, { status: 400 })
            }

            const membership = await prisma.firmMember.findFirst({
                where: { userId: user.id },
                orderBy: { isDefault: 'desc' },
                include: {
                    firm: {
                        include: {
                            connector: true
                        }
                    }
                }
            })
            const connector = membership?.firm.connector
            if (!connector) return NextResponse.json({ error: 'No active Google Drive connection found' }, { status: 404 })

            const { googleDriveConnector } = await import('@/lib/google-drive-connector')

            // Get decrypted access token (handles refresh if needed)
            const accessToken = await googleDriveConnector.getAccessToken(connector.id)
            if (!accessToken) {
                return NextResponse.json({ error: 'Failed to get access token' }, { status: 500 })
            }

            const mimeTypeStr = typeof mimeType === 'string' ? mimeType : 'application/vnd.google-apps.folder'
            // Sandbox: block native Google file creation (Doc/Sheet/etc.); allow plain folders only (incl. folder-upload structure).
            if (
                membership?.firm.sandboxOnly &&
                mimeTypeStr !== 'application/vnd.google-apps.folder'
            ) {
                return NextResponse.json(
                    { error: 'This operation is not permitted in a Sandbox.' },
                    { status: 403 }
                )
            }
            const newFile = await googleDriveConnector.createDriveFile(accessToken, {
                name,
                mimeType: mimeTypeStr,
                parents: [folderId]
            })

            // Note: Files and folders inherit permissions from parent project folder automatically
            // No need to restrict them - they will inherit whatever permissions the project folder has
            // (which includes Project Lead & Team Member access if granted)

            // Index the newly created folder
            if (newFile && typeof newFile === 'object' && 'id' in newFile) {
                let project = await prisma.engagement.findFirst({
                    where: { connectorRootFolderId: folderId },
                    select: { id: true, clientId: true, client: { select: { firmId: true } } }
                })

                if (!project && bodyProjectId) {
                    project = await prisma.engagement.findUnique({
                        where: { id: bodyProjectId as string },
                        select: { id: true, clientId: true, client: { select: { firmId: true } } }
                    })
                }

                const orgId = project?.client?.firmId || membership?.firmId
                if (orgId) {
                    await safeInngestSend('file.index.requested', {
                        organizationId: orgId,
                        clientId: project?.clientId ?? null,
                        projectId: project?.id ?? (bodyProjectId as string) ?? null,
                        externalId: newFile.id as string,
                        fileName: name,
                    })
                }

                // If EC/EV user created this folder, immediately write DB record with intake lock
                // so the folder is visible in their DB-driven file list
                if (bodyProjectId) {
                    const projectForRole = await prisma.engagement.findUnique({
                        where: { id: bodyProjectId as string },
                        select: { members: { where: { userId: user.id }, select: { role: true } } }
                    })
                    const userRole = projectForRole?.members?.[0]?.role
                    if (userRole === 'eng_ext_collaborator' || userRole === 'eng_viewer') {
                        const now = new Date().toISOString()
                        const folderOrgId = orgId ?? membership?.firmId
                        const folderClientId = project?.clientId
                        if (folderOrgId && folderClientId) {
                            await prisma.engagementDocument.upsert({
                                where: {
                                    engagementId_firmId_externalId: {
                                        engagementId: bodyProjectId as string,
                                        firmId: folderOrgId,
                                        externalId: newFile.id as string,
                                    }
                                },
                                update: {
                                    settings: { lock: { type: 'intake', uploadedBy: user.id, uploadedAt: now } } as object,
                                },
                                create: {
                                    engagementId: bodyProjectId as string,
                                    firmId: folderOrgId,
                                    clientId: folderClientId,
                                    externalId: newFile.id as string,
                                    connectorId: connector.id,
                                    parentId: typeof folderId === 'string' ? folderId : null,
                                    fileName: name,
                                    mimeType: 'application/vnd.google-apps.folder',
                                    isFolder: true,
                                    settings: { lock: { type: 'intake', uploadedBy: user.id, uploadedAt: now } } as object,
                                    metadata: { modifiedTime: now } as object,
                                }
                            })
                            // Notify ELs about the pending folder upload (notification via Inngest)
                            await safeInngestSend('file.index.requested', {
                                organizationId: folderOrgId,
                                clientId: folderClientId,
                                projectId: bodyProjectId as string,
                                externalId: newFile.id as string,
                                fileName: name,
                                uploadedBy: user.id,
                                isIntakeUpload: true,
                                isFolder: true,
                            })

                            // Create intake reminders synchronously for all ELs
                            const reminderId = `intake-${bodyProjectId as string}-${newFile.id as string}`
                            const leads = await prisma.engagementMember.findMany({
                                where: { engagementId: bodyProjectId as string, role: { in: ['eng_admin', 'eng_member'] } },
                                select: { userId: true },
                            })
                            const reminderItem = {
                                id: reminderId,
                                entityKey: 'platform.engagements',
                                entityValue: bodyProjectId as string,
                                action: `Review folder: "${name}"`,
                                dateKey: null,
                                dateValue: null,
                                hiddenAt: null,
                                createdAt: new Date().toISOString(),
                            }
                            await Promise.all(leads.map(async (lead) => {
                                const p = await prisma.userPersonalization.findUnique({
                                    where: { userId: lead.userId },
                                    select: { reminders: true },
                                })
                                const existing: any[] = Array.isArray(p?.reminders) ? p!.reminders as any[] : []
                                if (existing.find((r: any) => r.id === reminderId)) return
                                await prisma.userPersonalization.upsert({
                                    where: { userId: lead.userId },
                                    create: { userId: lead.userId, reminders: [reminderItem] as any },
                                    update: { reminders: [...existing, reminderItem] as any },
                                })
                            }))
                        }
                    }
                }
            }

            return NextResponse.json(newFile)
        }

        if (action === 'duplicate') {
            const { fileId } = body
            if (typeof bodyProjectId !== 'string' || !bodyProjectId || typeof fileId !== 'string' || !fileId) {
                return NextResponse.json({ error: 'Missing projectId or fileId' }, { status: 400 })
            }
            const dupDenied = await blockIfEngagementFileMutationForbidden(user.id, bodyProjectId)
            if (dupDenied) return dupDenied
            const project = await prisma.engagement.findFirst({
                where: { id: bodyProjectId, isDeleted: false },
                include: {
                    client: {
                        include: {
                            firm: {
                                include: {
                                    connector: true
                                }
                            }
                        }
                    }
                }
            })
            const connector = project?.client?.firm?.connector
            if (!connector) return NextResponse.json({ error: 'Project or connector not found' }, { status: 404 })

            const { googleDriveConnector } = await import('@/lib/google-drive-connector')
            const meta = await googleDriveConnector.getFileMetadata(connector.id, fileId)
            if (!meta?.name) return NextResponse.json({ error: 'File not found' }, { status: 404 })
            const parentId = meta.parents?.[0]
            if (!parentId) return NextResponse.json({ error: 'File has no parent folder' }, { status: 400 })

            const { randomBytes } = await import('crypto')
            const randomSuffix = Array.from(randomBytes(6), (b: number) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('')
            const base = meta.name
            const lastDot = base.lastIndexOf('.')
            const newName = lastDot > 0 ? `${base.slice(0, lastDot)}_${randomSuffix}${base.slice(lastDot)}` : `${base}_${randomSuffix}`

            const result = await googleDriveConnector.copyFile(connector.id, fileId, parentId, newName)
            if (!result) return NextResponse.json({ error: 'Failed to duplicate file' }, { status: 500 })

            // Index the duplicated file
            await safeInngestSend('file.index.requested', {
                organizationId: project.client.firmId,
                clientId: project.clientId,
                projectId: project.id,
                externalId: result.id,
                fileName: newName,
            })

            return NextResponse.json({ success: true, id: result.id, name: newName })
        }

        if (action === 'copy' || action === 'move') {
            const { fileId, destinationFolderId } = body
            if (typeof bodyProjectId !== 'string' || !bodyProjectId || typeof fileId !== 'string' || !fileId || typeof destinationFolderId !== 'string' || !destinationFolderId) {
                return NextResponse.json({ error: 'Missing projectId, fileId, or destinationFolderId' }, { status: 400 })
            }
            const copyMoveDenied = await blockIfEngagementFileMutationForbidden(user.id, bodyProjectId)
            if (copyMoveDenied) return copyMoveDenied

            const project = await prisma.engagement.findFirst({
                where: { id: bodyProjectId, isDeleted: false },
                include: {
                    client: {
                        include: {
                            firm: {
                                include: {
                                    connector: true
                                }
                            }
                        }
                    }
                }
            })
            const connector = project?.client?.firm?.connector
            if (!connector) return NextResponse.json({ error: 'Project or connector not found' }, { status: 404 })

            const { googleDriveConnector } = await import('@/lib/google-drive-connector')
            if (action === 'copy') {
                const keepBoth = body.keepBoth !== false
                const meta = await googleDriveConnector.getFileMetadata(connector.id, fileId)
                const sourceName = meta?.name ?? 'copy'
                let copyName: string | undefined
                if (keepBoth) {
                    const { randomBytes } = await import('crypto')
                    const suffix = Array.from(randomBytes(6), (b: number) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('')
                    const lastDot = sourceName.lastIndexOf('.')
                    copyName = lastDot > 0 ? `${sourceName.slice(0, lastDot)}_${suffix}${sourceName.slice(lastDot)}` : `${sourceName}_${suffix}`
                } else {
                    const existing = await googleDriveConnector.listFiles(connector.id, destinationFolderId, 500)
                    const sameName = existing.find((f: { name: string }) => f.name === sourceName)
                    if (sameName) {
                        await googleDriveConnector.trashFile(connector.id, sameName.id)
                        await safeInngestSend('file.delete.requested', {
                            organizationId: project.client.firmId,
                            externalId: sameName.id
                        })
                    }
                    copyName = sourceName
                }
                const result = await googleDriveConnector.copyFile(connector.id, fileId, destinationFolderId, copyName)
                if (!result) return NextResponse.json({ error: 'Failed to copy file' }, { status: 500 })

                // Index the copied file
                await safeInngestSend('file.index.requested', {
                    organizationId: project.client.firmId,
                    clientId: project.clientId,
                    projectId: project.id,
                    externalId: result.id,
                    fileName: copyName || sourceName,
                })

                return NextResponse.json({ success: true, id: result.id })
            }
            const result = await googleDriveConnector.moveFile(connector.id, fileId, destinationFolderId)
            if (!result) return NextResponse.json({ error: 'Failed to move file' }, { status: 500 })

            // Update index for moved file (parentId may have changed)
            const meta = await googleDriveConnector.getFileMetadata(connector.id, fileId)
            if (meta?.name) {
                await safeInngestSend('file.index.requested', {
                    organizationId: project.client.firmId,
                    clientId: project.clientId,
                    projectId: project.id,
                    externalId: fileId,
                    fileName: meta.name,
                    parentId: meta.parents?.[0] ?? null,
                })
            }

            return NextResponse.json({ success: true, id: result.id })
        }

        if (action === 'move-tree') {
            const { fileId, targetRoot } = body
            if (typeof bodyProjectId !== 'string' || !bodyProjectId || typeof fileId !== 'string' || !fileId || typeof targetRoot !== 'string') {
                return NextResponse.json({ error: 'Missing projectId, fileId, or targetRoot' }, { status: 400 })
            }
            const treeDenied = await blockIfEngagementFileMutationForbidden(user.id, bodyProjectId)
            if (treeDenied) return treeDenied
            if (!['general', 'confidential', 'staging'].includes(targetRoot)) {
                return NextResponse.json({ error: 'Invalid targetRoot' }, { status: 400 })
            }

            const { canManageProject } = await import('@/lib/permission-helpers')
            const project = await prisma.engagement.findFirst({
                where: { id: bodyProjectId, isDeleted: false },
                include: {
                    client: {
                        include: {
                            firm: {
                                include: {
                                    connector: true
                                }
                            }
                        }
                    }
                }
            })
            if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
            const canManage = await canManageProject(project.client.firmId, project.clientId, project.id)
            if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

            const connector = project.client.firm.connector
            if (!connector) return NextResponse.json({ error: 'Connector not found' }, { status: 404 })

            const { googleDriveConnector } = await import('@/lib/google-drive-connector')
            const folderIds = await googleDriveConnector.getProjectFolderIds(connector.id, project.slug, {
                projectName: project.name,
                clientSlug: project.client.slug,
                clientName: project.client.name
            })
            const generalFolderId = folderIds.generalFolderId
            const confidentialFolderId = folderIds.confidentialFolderId
            const stagingFolderId = folderIds.stagingFolderId
            const destRootId = targetRoot === 'general' ? generalFolderId
                : targetRoot === 'confidential' ? confidentialFolderId
                    : stagingFolderId
            if (!destRootId) return NextResponse.json({ error: `Target folder (${targetRoot}) not configured` }, { status: 400 })

            // Build path from file's parent up to source root so we can replicate under target root
            const fileMeta = await googleDriveConnector.getFileMetadata(connector.id, fileId)
            let destFolderId = destRootId
            if (fileMeta?.parents?.length) {
                const pathNames: string[] = []
                const MAX_DEPTH = 20
                let currentId: string | null = fileMeta.parents[0]
                let depth = 0
                let foundSourceRoot = false
                while (currentId && depth < MAX_DEPTH) {
                    if (currentId === generalFolderId || currentId === confidentialFolderId || currentId === stagingFolderId) {
                        foundSourceRoot = true
                        break
                    }
                    const meta = await googleDriveConnector.getFileMetadata(connector.id, currentId)
                    if (!meta?.name) break
                    pathNames.unshift(meta.name)
                    if (!meta.parents?.length) break
                    currentId = meta.parents[0]
                    depth++
                }
                if (foundSourceRoot && pathNames.length > 0) {
                    const resolved = await googleDriveConnector.ensureFolderPath(connector.id, destRootId, pathNames)
                    if (resolved) destFolderId = resolved
                }
            }

            const result = await googleDriveConnector.moveFile(connector.id, fileId, destFolderId)
            if (!result) return NextResponse.json({ error: 'Failed to move' }, { status: 500 })

            // Index the moved item
            await safeInngestSend('file.index.requested', {
                organizationId: project.client.firmId,
                clientId: project.clientId,
                projectId: project.id,
                externalId: fileId,
                fileName: fileMeta?.name || 'Moved Folder',
                parentId: destFolderId,
            })

            return NextResponse.json({ success: true, id: result.id })
        }

        // Cross-engagement copy or move: copies/moves file to the target engagement's General folder.
        // For move: also re-stamps engagementId + clientId on the engagement_document record.
        if (action === 'cross-engagement-copy' || action === 'cross-engagement-move') {
            const { fileId, targetEngagementId } = body
            if (
                typeof bodyProjectId !== 'string' || !bodyProjectId ||
                typeof fileId !== 'string' || !fileId ||
                typeof targetEngagementId !== 'string' || !targetEngagementId
            ) {
                return NextResponse.json({ error: 'Missing projectId, fileId, or targetEngagementId' }, { status: 400 })
            }

            const denied = await blockIfEngagementFileMutationForbidden(user.id, bodyProjectId)
            if (denied) return denied

            // Also verify caller is a member of the target engagement
            const targetDenied = await blockIfEngagementFileMutationForbidden(user.id, targetEngagementId)
            if (targetDenied) return NextResponse.json({ error: 'No access to target engagement' }, { status: 403 })

            const [sourceProject, targetProject] = await Promise.all([
                prisma.engagement.findFirst({
                    where: { id: bodyProjectId, isDeleted: false },
                    include: { client: { include: { firm: { include: { connector: true } } } } },
                }),
                prisma.engagement.findFirst({
                    where: { id: targetEngagementId, isDeleted: false },
                    include: { client: { include: { firm: { include: { connector: true } } } } },
                }),
            ])
            if (!sourceProject || !targetProject)
                return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })

            const connector = sourceProject.client.firm.connector
            if (!connector) return NextResponse.json({ error: 'No connector found' }, { status: 404 })

            const { googleDriveConnector } = await import('@/lib/google-drive-connector')
            const targetFolderIds = await googleDriveConnector.getProjectFolderIds(connector.id, targetProject.slug, {
                projectName: targetProject.name,
                clientSlug: targetProject.client.slug,
                clientName: targetProject.client.name,
            })
            const destFolderId = targetFolderIds.generalFolderId
            if (!destFolderId) return NextResponse.json({ error: 'Target engagement has no General folder' }, { status: 400 })

            const fileMeta = await googleDriveConnector.getFileMetadata(connector.id, fileId)
            const fileName = fileMeta?.name ?? fileId

            if (action === 'cross-engagement-copy') {
                const isFolder = fileMeta?.mimeType === 'application/vnd.google-apps.folder'

                if (isFolder) {
                    const accessToken = await googleDriveConnector.getAccessToken(connector.id)
                    if (!accessToken) return NextResponse.json({ error: 'Could not obtain Drive access token' }, { status: 500 })

                    const copiedItems = await googleDriveConnector.recursiveCopy(fileId, destFolderId, accessToken)
                    if (!copiedItems.length) return NextResponse.json({ error: 'Failed to copy folder' }, { status: 500 })

                    await IndexingInterceptor.indexBatch(request, {
                        organizationId: targetProject.client.firmId,
                        clientId: targetProject.clientId,
                        projectId: targetEngagementId,
                        files: copiedItems.map((item) => ({ externalId: item.id, fileName: item.name })),
                    })
                    return NextResponse.json({ success: true, count: copiedItems.length })
                }

                const result = await googleDriveConnector.copyFile(connector.id, fileId, destFolderId, fileName)
                if (!result) return NextResponse.json({ error: 'Failed to copy file' }, { status: 500 })

                await safeInngestSend('file.index.requested', {
                    organizationId: targetProject.client.firmId,
                    clientId: targetProject.clientId,
                    projectId: targetEngagementId,
                    externalId: result.id,
                    fileName,
                    parentId: destFolderId,
                })
                return NextResponse.json({ success: true, id: result.id })
            }

            // Move: update Drive + re-stamp the engagement_document record
            const result = await googleDriveConnector.moveFile(connector.id, fileId, destFolderId)
            if (!result) return NextResponse.json({ error: 'Failed to move file' }, { status: 500 })

            // Re-stamp engagement on the DB record
            await prisma.engagementDocument.updateMany({
                where: {
                    externalId: fileId,
                    engagementId: bodyProjectId,
                    firmId: sourceProject.client.firmId,
                },
                data: {
                    engagementId: targetEngagementId,
                    clientId: targetProject.clientId,
                    parentId: destFolderId,
                    updatedAt: new Date(),
                },
            })

            await safeInngestSend('file.index.requested', {
                organizationId: targetProject.client.firmId,
                clientId: targetProject.clientId,
                projectId: targetEngagementId,
                externalId: fileId,
                fileName,
                parentId: destFolderId,
            })
            return NextResponse.json({ success: true, id: result.id })
        }

        if (action === 'rename') {
            const { fileId, name: newName } = body
            if (typeof bodyProjectId !== 'string' || !bodyProjectId || typeof fileId !== 'string' || !fileId || typeof newName !== 'string' || !newName.trim()) {
                return NextResponse.json({ error: 'Missing projectId, fileId, or name' }, { status: 400 })
            }
            const renameDenied = await blockIfEngagementFileMutationForbidden(user.id, bodyProjectId)
            if (renameDenied) return renameDenied

            const project = await prisma.engagement.findFirst({
                where: { id: bodyProjectId, isDeleted: false },
                include: {
                    client: {
                        include: {
                            firm: {
                                include: {
                                    connector: true
                                }
                            }
                        }
                    }
                }
            })
            const connector = project?.client?.firm?.connector
            if (!connector) return NextResponse.json({ error: 'Project or connector not found' }, { status: 404 })

            const { googleDriveConnector } = await import('@/lib/google-drive-connector')
            const result = await googleDriveConnector.renameFile(connector.id, fileId, newName.trim())
            if (!result) return NextResponse.json({ error: 'Failed to rename file' }, { status: 500 })

            // Update vector index with new name
            await safeInngestSend('file.index.requested', {
                organizationId: project.client.firmId,
                clientId: project.clientId,
                projectId: project.id,
                externalId: fileId,
                fileName: result.name,
            })

            return NextResponse.json({ success: true, id: result.id, name: result.name })
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

    } catch (error) {
        if (error instanceof GoogleDriveAuthError) {
            const status = error.oauthMisconfigured ? 503 : 401
            return NextResponse.json(
                {
                    error: error.message,
                    reconnectRequired: error.reconnectRequired,
                    oauthMisconfigured: error.oauthMisconfigured,
                },
                { status }
            )
        }
        console.error('Linked Files API Error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
