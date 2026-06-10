import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { SearchService } from '@/lib/services/search-service'
import { logger } from '@/lib/logger'
import { requireProjectManage } from '@/lib/api/engagement-auth'

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const { projectId } = await params

        const authResult = await requireProjectManage(request, projectId)
        if (authResult instanceof NextResponse) return authResult

        // Get Project and Connector (user has manage permission)
        const project = await prisma.engagement.findUnique({
            where: { id: projectId },
            include: {
                client: {
                    include: { connector: true }
                }
            }
        })

        const resolvedConnector = project?.client?.connector ?? null
        if (!project || !resolvedConnector) {
            return NextResponse.json({ error: 'Project or active connector not found' }, { status: 404 })
        }

        const connector = resolvedConnector
        const orgId = project.firmId
        const cliId = project.clientId

        // 3. Resolve Project Folders
        const settings = (connector.settings as any) || {}
        const ps = settings.projectFolderSettings?.[project.slug] || {}
        const parentFolderIds = [
            ps.generalFolderId,
            ps.confidentialFolderId,
            ps.stagingFolderId
        ].filter(Boolean) as string[]

        if (parentFolderIds.length === 0) {
            return NextResponse.json({ error: 'No project folders configured' }, { status: 400 })
        }

        // 4. Recursive Scan All Files
        let allFiles: { id: string, name: string }[] = []
        const MAX_FILES = 200 // Safety limit for a single request

        const scanRecursive = async (folderId: string) => {
            if (allFiles.length >= MAX_FILES) return
            const files = await googleDriveConnector.listFiles(connector.id, folderId, 1000)
            for (const file of files) {
                if (allFiles.length >= MAX_FILES) break
                allFiles.push({ id: file.id, name: file.name })
                if (file.mimeType === 'application/vnd.google-apps.folder') {
                    await scanRecursive(file.id)
                }
            }
        }

        for (const folderId of parentFolderIds) {
            await scanRecursive(folderId)
        }

        // 5. Batch Index
        const filesToIndex = allFiles
        for (const file of filesToIndex) {
            await SearchService.indexFile({
                organizationId: orgId,
                clientId: cliId,
                projectId,
                externalId: file.id,
                fileName: file.name
            })
        }

        return NextResponse.json({
            success: true,
            indexedCount: filesToIndex.length,
            totalFound: allFiles.length,
            message: allFiles.length >= MAX_FILES ? `Indexed first ${MAX_FILES} files found recursively.` : `Indexed all ${allFiles.length} files found recursively.`
        })

    } catch (error) {
        logger.error('Index Project API Error:', error as Error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
