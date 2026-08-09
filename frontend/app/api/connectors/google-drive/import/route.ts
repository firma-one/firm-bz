import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { prisma } from '@/lib/prisma'
import { IndexingInterceptor } from '@/lib/services/indexing-interceptor'
import { assertWithinDocumentCap } from '@/lib/billing/effective-billing-caps'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { connectionId, fileIds, parentId, userToken } = body // Extract userToken

        if (!connectionId || !fileIds || !Array.isArray(fileIds) || !parentId) {
            return NextResponse.json(
                { error: 'Missing required params' },
                { status: 400 }
            )
        }

        // Enforce document cap before any Drive operations
        const folderMeta = await prisma.engagementDocument.findFirst({
            where: { externalId: parentId },
            select: { firmId: true },
        })
        if (folderMeta?.firmId) {
            await assertWithinDocumentCap(folderMeta.firmId, fileIds.length)
        }

        // Sandbox: import from Google Drive is allowed (Add → Import); other creation paths are restricted in UI + linked-files API.

        // Fetch connector and get decrypted token
        const connector = await prisma.connector.findUnique({ where: { id: connectionId } })
        if (!connector) throw new Error('Connector not found')

        // Get decrypted access token (handles refresh if needed)
        const connectorToken = await googleDriveConnector.getAccessToken(connectionId)
        // Prefer userToken for copy operations as the user owns the source file
        const accessToken = userToken || connectorToken

        if (!accessToken) throw new Error('No access token available')

        // Skip files that don't actually need importing: already tracked as an
        // EngagementDocument for this engagement, or already owned by this connector's own
        // account (e.g. re-picked after a prior import, or created by the app itself).
        //
        // The owner check only works for PERSONAL (My Drive) connectors — Drive's API never
        // populates `owners` for files inside a Shared Drive (Shared Drive content is owned by
        // the drive itself, not any individual account: see Google's "shared drive versus My
        // Drive API differences" guide), so it's a guaranteed no-op there. Left disabled for
        // SHARED connectors rather than silently evaluating to false on every file.
        const connectorEmail = connector.workspaceRootLocation === 'PERSONAL'
            ? ((connector.settings as any)?.accountEmail as string | undefined)
            : undefined
        const alreadyIndexedIds = folderMeta?.firmId
            ? new Set(
                (await prisma.engagementDocument.findMany({
                    where: { firmId: folderMeta.firmId, externalId: { in: fileIds } },
                    select: { externalId: true },
                })).map(d => d.externalId)
            )
            : new Set<string>()

        // Import: copy each picked file/folder into the engagement folder, unless
        // it already lives there (e.g. it was created natively in Drive inside this
        // same folder) — in that case just index it in place instead of duplicating it.
        const importedFiles = []
        let skippedCount = 0
        console.log(`[Import] ParentId: ${parentId}, Files: ${fileIds.length}, UsingUserToken: ${!!userToken}`)

        for (const fileId of fileIds) {
            try {
                if (alreadyIndexedIds.has(fileId)) {
                    skippedCount++
                    continue
                }

                const metaRes = await fetch(
                    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,parents,owners(emailAddress)&supportsAllDrives=true`,
                    { headers: { Authorization: `Bearer ${accessToken}` } }
                )
                if (!metaRes.ok) {
                    console.error(`[Import] Failed to fetch metadata for ${fileId}:`, await metaRes.text())
                    continue
                }
                const meta = await metaRes.json()

                const ownedByConnector = connectorEmail
                    && Array.isArray(meta.owners)
                    && meta.owners.some((o: { emailAddress?: string }) => o.emailAddress === connectorEmail)

                if (ownedByConnector && !(Array.isArray(meta.parents) && meta.parents.includes(parentId))) {
                    // Already owned by this connector but not sitting in the destination folder —
                    // nothing to import; the app already has real access to it elsewhere.
                    skippedCount++
                    continue
                }

                if (Array.isArray(meta.parents) && meta.parents.includes(parentId)) {
                    // Already in the destination folder — index in place, no copy.
                    importedFiles.push({
                        id: meta.id,
                        name: meta.name,
                        originalId: meta.id,
                        isFolder: meta.mimeType === 'application/vnd.google-apps.folder',
                    })
                    continue
                }

                const results = await googleDriveConnector.recursiveCopy(fileId, parentId, accessToken)
                importedFiles.push(...results)
            } catch (e) {
                console.error(`[Import] Exception processing ${fileId}:`, e)
            }
        }

        if (importedFiles.length > 0) {
            // Find project and organization context from the search index (which tracks both files and folders)
            const folderMeta = await prisma.engagementDocument.findFirst({
                where: { externalId: parentId },
            })

            if (folderMeta && folderMeta.engagementId) {
                const indexingParams = {
                    organizationId: folderMeta.firmId,
                    projectId: folderMeta.engagementId,
                    files: importedFiles.map(f => ({
                        externalId: f.id,
                        fileName: f.name,
                        parentId: parentId
                    }))
                }

                // Use IndexingInterceptor (which now uses Inngest)
                await IndexingInterceptor.indexBatch(request, indexingParams)
            } else {
                logger.warn(`[Import] Could not find folder context for parentId=${parentId}, skipping indexing trigger`)
            }
        }

        return NextResponse.json({ success: true, count: importedFiles.length, skipped: skippedCount, files: importedFiles })

    } catch (error: any) {
        console.error('Import error:', error)
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        )
    }
}
