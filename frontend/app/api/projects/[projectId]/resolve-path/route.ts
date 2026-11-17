import { NextRequest, NextResponse } from 'next/server'
import { prisma } from "@/lib/prisma"
import { SearchService } from '@/lib/services/search-service'
import { logger } from '@/lib/logger'
import { requireProjectView } from '@/lib/api/engagement-auth'
import { requireEngagementMember } from '@/lib/engagement-access'
import { engagementRootFolderIds, rootFolderName } from '@/lib/connectors/engagement-root-folders'

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const { projectId } = await params
        const { searchParams } = new URL(request.url)
        const fileId = searchParams.get('fileId')

        if (!fileId) {
            return NextResponse.json({ error: 'Missing fileId' }, { status: 400 })
        }

        const authResult = await requireProjectView(request, projectId)
        if (authResult instanceof NextResponse) return authResult

        const member = await requireEngagementMember(projectId, authResult.user.id)
        if (!member) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }

        // The top folders from the connector's adapter, as the Files page gets them: reading
        // settings.projectFolderSettings here found none on OneDrive (see engagementRootFolderIds).
        const [ancestors, ps] = await Promise.all([
            SearchService.resolvePathToProjectRoot(authResult.ctx.orgId, fileId),
            engagementRootFolderIds(projectId),
        ])
        let path = ancestors
        const rootIds = [ps.generalFolderId, ps.confidentialFolderId, ps.stagingFolderId].filter(Boolean) as string[]

        let projectRootFolderId: string | null = null
        const rootInPath = path.find((p: { id: string }) => rootIds.includes(p.id))
        if (rootInPath) {
            projectRootFolderId = rootInPath.id
        } else if (rootIds.length > 0) {
            // Path doesn't include the project root (e.g. root folder not in engagement_documents). Look up parent of top-most segment.
            // With no ancestors at all, the item itself is the top-most: one sitting right in the
            // root folder (a deliverable folder there, say) has an empty path, and without this the
            // page landed on the root anyway but said the file "may have been moved or deleted".
            const topId = path.length > 0 ? path[0].id : fileId
            const doc = await prisma.engagementDocument.findFirst({
                where: { firmId: authResult.ctx.orgId, engagementId: projectId, externalId: topId },
                select: { parentId: true }
            })
            const parentId = doc?.parentId ?? null
            if (parentId && rootIds.includes(parentId)) {
                projectRootFolderId = parentId
                path = [{ id: parentId, name: rootFolderName(ps, parentId) }, ...path]
            }
        }

        return NextResponse.json({ path, projectRootFolderId })

    } catch (error) {
        logger.error('Resolve Path API Error:', error as Error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
