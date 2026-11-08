import { NextRequest, NextResponse } from 'next/server'
import { getManageableConnector } from '@/lib/connectors/connector-access'
import { createClient } from '@/utils/supabase/server'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { prisma } from '@/lib/prisma'
import { IndexingInterceptor } from '@/lib/services/indexing-interceptor'
import { assertWithinDocumentCap } from '@/lib/billing/effective-billing-caps'
import { logger } from '@/lib/logger'
import { StorageFailure, storageFailure, storageFailureFromResponse } from '@/lib/connectors/storage-failure'
import { UserFacingError } from '@/lib/actions/action-result'
import { describeNotDone, type NotDone } from '@/lib/files/partial-outcome'

/**
 * Import from Google Drive: copies each pick (a file, or a folder and everything in it) into the
 * engagement folder. What worked is kept and what didn't is named with Drive's reason, so the
 * browser can say "Imported 2 of 5. Not imported: report.pdf · …"; nothing imported is an error
 * (.claude/plans/error-handling-audit.md, FI-3; decision 1).
 */

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { connectionId, fileIds, parentId, userToken } = body // Extract userToken
        // The picks' names, as the picker showed them: what a refusal is reported under.
        const pickedNames: Record<string, string> = body?.names && typeof body.names === 'object' ? body.names : {}

        if (!connectionId) {
            return NextResponse.json({ error: 'Reconnect Google Drive to import. Firm Settings has the storage connection.', code: 'reconnect' }, { status: 400 })
        }
        if (!fileIds || !Array.isArray(fileIds) || !parentId) {
            return NextResponse.json({ error: 'Pick the files to import, and open the folder they go in.' }, { status: 400 })
        }

        // The connector must be one the caller manages (the UI sends their own), and a target folder
        // that belongs to an engagement needs edit rights on that engagement.
        if (!(await getManageableConnector(user.id, connectionId))) {
            return NextResponse.json({ error: 'Only the person who connected this Google Drive can import from it.', code: 'not_connector_owner' }, { status: 403 })
        }
        const targetFolder = await prisma.engagementDocument.findFirst({
            where: { externalId: parentId },
            select: { engagementId: true, engagement: { select: { clientId: true, client: { select: { firmId: true } } } } },
        })
        if (targetFolder?.engagementId) {
            const { canEditProject } = await import('@/lib/permission-helpers')
            const e = targetFolder.engagement
            if (!e || !(await canEditProject(e.client.firmId, e.clientId, targetFolder.engagementId))) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
            }
            const { blockIfEngagementCompleted } = await import('@/lib/engagement-access')
            const completed = await blockIfEngagementCompleted(targetFolder.engagementId)
            if (completed) return completed
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
        if (!connector) {
            return NextResponse.json({ error: 'Reconnect Google Drive to import. Firm Settings has the storage connection.', code: 'reconnect' }, { status: 404 })
        }

        // Get decrypted access token (handles refresh if needed)
        const connectorToken = await googleDriveConnector.getAccessToken(connectionId)
        // Prefer userToken for copy operations as the user owns the source file
        const accessToken = userToken || connectorToken

        if (!accessToken) throw storageFailure('reconnect', 'Google Drive')

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
        const importedFiles: { id: string; name: string; originalId: string; isFolder: boolean }[] = []
        // Already tracked in this firm, and already the connected account's own (elsewhere in its Drive).
        let skippedCount = 0
        let skippedOwnedCount = 0
        // Files are what's counted: a picked folder counts what's in it.
        let filesTotal = 0
        let filesImported = 0
        const failed: NotDone[] = []
        const reasonOf = (e: unknown) => e instanceof Error && e.message ? e.message : "Google Drive couldn't copy it."
        logger.info(`[Import] ParentId: ${parentId}, Files: ${fileIds.length}, UsingUserToken: ${!!userToken}`)

        for (const fileId of fileIds) {
            const pickName = typeof pickedNames[fileId] === 'string' && pickedNames[fileId] ? pickedNames[fileId] : 'A picked item'
            try {
                if (alreadyIndexedIds.has(fileId)) {
                    skippedCount++
                    continue
                }

                let metaRes: Response
                try {
                    metaRes = await fetch(
                        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,parents,owners(emailAddress)&supportsAllDrives=true`,
                        { headers: { Authorization: `Bearer ${accessToken}` } }
                    )
                } catch {
                    throw storageFailure('unreachable', 'Google Drive')
                }
                if (!metaRes.ok) {
                    const refusal = await storageFailureFromResponse(metaRes, 'Google Drive', 'read a picked file')
                    filesTotal++
                    failed.push({ name: pickName, reason: refusal.message })
                    continue
                }
                const meta = await metaRes.json()
                const isFolder = meta.mimeType === 'application/vnd.google-apps.folder'

                const ownedByConnector = connectorEmail
                    && Array.isArray(meta.owners)
                    && meta.owners.some((o: { emailAddress?: string }) => o.emailAddress === connectorEmail)

                if (ownedByConnector && !(Array.isArray(meta.parents) && meta.parents.includes(parentId))) {
                    // Already owned by this connector but not sitting in the destination folder —
                    // nothing to import; the app already has real access to it elsewhere.
                    skippedOwnedCount++
                    continue
                }

                if (Array.isArray(meta.parents) && meta.parents.includes(parentId)) {
                    // Already in the destination folder — index in place, no copy.
                    importedFiles.push({ id: meta.id, name: meta.name, originalId: meta.id, isFolder })
                    if (!isFolder) { filesTotal++; filesImported++ }
                    continue
                }

                const outcome = await googleDriveConnector.recursiveCopy(fileId, parentId, accessToken)
                importedFiles.push(...outcome.copied)
                failed.push(...outcome.failed)
                filesTotal += outcome.filesTotal
                filesImported += outcome.filesCopied
            } catch (e) {
                logger.warn(`[Import] Couldn't import ${fileId}`, { reason: reasonOf(e) })
                filesTotal++
                failed.push({ name: pickName, reason: reasonOf(e) })
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

        // Nothing imported out of something is an error, with what was refused and why.
        if (filesImported === 0 && failed.length > 0) {
            return NextResponse.json({
                error: `No files were imported. ${describeNotDone(failed)}`,
                code: 'nothing_imported',
                filesImported, filesTotal, failed, skipped: skippedCount, skippedOwned: skippedOwnedCount,
            }, { status: 502 })
        }

        return NextResponse.json({
            success: true,
            count: importedFiles.length,
            filesImported,
            filesTotal,
            failed,
            skipped: skippedCount,
            skippedOwned: skippedOwnedCount,
            files: importedFiles,
        })

    } catch (error) {
        if (error instanceof StorageFailure) {
            return NextResponse.json({ error: error.message, code: error.reason }, { status: error.status })
        }
        // The plan's file limit, in its own words.
        if (error instanceof UserFacingError) {
            return NextResponse.json({ error: error.message, code: error.code }, { status: 402 })
        }
        logger.error('Import error:', error as Error)
        return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 })
    }
}
