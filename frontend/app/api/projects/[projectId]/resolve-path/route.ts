import { NextRequest, NextResponse } from 'next/server'
import { prisma } from "@/lib/prisma"
import { SearchService } from '@/lib/services/search-service'
import { logger } from '@/lib/logger'
import { requireProjectView } from '@/lib/api/project-auth'
import { requireEngagementMember } from '@/lib/engagement-access'

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

        let path = await SearchService.resolvePathToProjectRoot(authResult.ctx.orgId, fileId)

        const engagement = await prisma.engagement.findUnique({
            where: { id: projectId },
            include: { client: { include: { firm: { include: { connector: true } } } } },
        })
        const settings = (engagement?.client?.firm?.connector?.settings as any) || {}
        const engagementSlug = engagement?.slug
        const ps =
            engagementSlug && settings.projectFolderSettings
                ? settings.projectFolderSettings[engagementSlug] || {}
                : {}
        const rootIds = [ps.generalFolderId, ps.confidentialFolderId, ps.stagingFolderId].filter(Boolean) as string[]

        let projectRootFolderId: string | null = null
        const rootInPath = path.find((p: { id: string }) => rootIds.includes(p.id))
        if (rootInPath) {
            projectRootFolderId = rootInPath.id
        } else if (path.length > 0 && rootIds.length > 0) {
            // Path doesn't include the project root (e.g. root folder not in engagement_documents). Look up parent of top-most segment.
            const topId = path[0].id
            const doc = await prisma.engagementDocument.findFirst({
                where: { firmId: authResult.ctx.orgId, engagementId: projectId, externalId: topId },
                select: { parentId: true }
            })
            const parentId = doc?.parentId ?? null
            if (parentId && rootIds.includes(parentId)) {
                projectRootFolderId = parentId
                const rootName = parentId === ps.generalFolderId ? 'General' : parentId === ps.confidentialFolderId ? 'Confidential' : 'Staging'
                path = [{ id: parentId, name: rootName }, ...path]
            }
        }

        return NextResponse.json({ path, projectRootFolderId })

    } catch (error) {
        logger.error('Resolve Path API Error:', error as Error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
