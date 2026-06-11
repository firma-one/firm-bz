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
        const { connectionId, fileIds, mode, parentId, userToken } = body // Extract userToken

        if (!connectionId || !fileIds || !Array.isArray(fileIds) || !mode || !parentId) {
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

        // Handle Import Modes
        const importedFiles = []
        console.log(`[Import] Mode: ${mode}, ParentId: ${parentId}, Files: ${fileIds.length}, UsingUserToken: ${!!userToken}`)

        if (mode === 'copy') {
            for (const fileId of fileIds) {
                try {
                    const results = await googleDriveConnector.recursiveCopy(fileId, parentId, accessToken)
                    importedFiles.push(...results)
                } catch (e) {
                    console.error(`[Import] Exception processing ${fileId}:`, e)
                }
            }
        } else if (mode === 'shortcut') {
            // For shortcuts, we usually want the Connector to own them? 
            // Or the User? If User creates shortcut in Project Folder, User works.
            // But existing code used connectorToken. Let's stick to accessToken (User preferred) 
            // UNLESS explicit logic demands Connector.
            // Actually, if we want the shortcut to be owned by the org, maybe connectorToken is better?
            // But if connectorToken can't see the target file (fileId), it can't create a shortcut TO it.
            // So UserTokens is inherently safer for the "Target".
            const tokenToUse = userToken || connectorToken

            for (const fileId of fileIds) {
                try {
                    const res = await fetch('https://www.googleapis.com/drive/v3/files', {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${tokenToUse}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            mimeType: 'application/vnd.google-apps.shortcut',
                            parents: [parentId],
                            shortcutDetails: {
                                targetId: fileId
                            }
                        })
                    })
                    if (res.ok) {
                        const data = await res.json()
                        importedFiles.push({ id: data.id, name: data.name, targetId: fileId })
                    } else {
                        const txt = await res.text()
                        console.error('[Import] Shortcut failed', txt)
                    }
                } catch (e) {
                    console.error(`[Import] Exception shortcut ${fileId}:`, e)
                }
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

        return NextResponse.json({ success: true, count: importedFiles.length, files: importedFiles })

    } catch (error: any) {
        console.error('Import error:', error)
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        )
    }
}
