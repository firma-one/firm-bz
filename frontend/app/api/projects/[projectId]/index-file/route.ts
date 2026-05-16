import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { IndexingInterceptor } from '@/lib/services/indexing-interceptor'
import { logger } from '@/lib/logger'
import { requireProjectManage } from '@/lib/api/project-auth'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const { projectId } = await params
        const body = await request.json()
        const { externalId, fileName, organizationId, clientId, files } = body

        if (!files && (!externalId || !fileName)) {
            return NextResponse.json({ error: 'Missing externalId/fileName or files array' }, { status: 400 })
        }

        const authResult = await requireProjectManage(request, projectId)
        if (authResult instanceof NextResponse) return authResult

        const orgId = organizationId || authResult.ctx.orgId
        const cliId = clientId || authResult.ctx.clientId

        if (!orgId) {
            return NextResponse.json({ error: 'Organization context not found' }, { status: 404 })
        }

        // 3. Index File(s) - Non-blocking (blocks only if waitUntil is missing)
        if (files && Array.isArray(files)) {
            // Batch Index
            await IndexingInterceptor.indexBatch(request, {
                organizationId: orgId,
                clientId: cliId,
                projectId,
                files
            })
            // Audit: one event per file added (e.g. upload or import)
            const userId = authResult.user?.id
            for (const f of files as { externalId: string; fileName: string }[]) {
                audit(AUDIT_EVENT.DOCUMENT_CREATED)
                    .scope(AUDIT_SCOPE.DOCUMENT)
                    .firm(orgId)
                    .client(cliId)
                    .engagement(projectId)
                    .actor(userId)
                    .meta({ fileName: f.fileName, externalId: f.externalId })
                    .fireAndForget()
            }
        } else {
            // Single Index
            await IndexingInterceptor.indexSingle(request, {
                organizationId: orgId,
                clientId: cliId,
                projectId,
                externalId: externalId as string,
                fileName: fileName as string
            })
            // Audit: file added (upload or import)
            audit(AUDIT_EVENT.DOCUMENT_CREATED)
                .scope(AUDIT_SCOPE.DOCUMENT)
                .firm(orgId)
                .client(cliId)
                .engagement(projectId)
                .actor(authResult.user?.id)
                .meta({ fileName: fileName as string, externalId: externalId as string })
                .fireAndForget()
        }

        return NextResponse.json({ success: true, message: 'Indexing triggered' })

    } catch (error) {
        logger.error('Index File API Error:', error as Error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
