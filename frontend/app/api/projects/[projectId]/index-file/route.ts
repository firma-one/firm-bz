import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { IndexingInterceptor } from '@/lib/services/indexing-interceptor'
import { logger } from '@/lib/logger'
import { requireProjectManage } from '@/lib/api/engagement-auth'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'
import { assignDocId } from '@/lib/doc-id'

/**
 * Ensure a bare EngagementDocument row exists and has a docId, synchronously,
 * so the Files list can show the ID immediately after upload instead of waiting
 * for the async Inngest indexing job (embeddings/summary) to create the row.
 * The later indexFile upsert's ON CONFLICT DO UPDATE never touches docId, so this
 * assignment is not overwritten by the background job.
 */
async function ensureDocIdEarly(params: {
    organizationId: string
    clientId?: string
    projectId: string
    externalId: string
    fileName: string
    actorId?: string | null
}) {
    try {
        const engagement = await prisma.engagement.findUnique({
            where: { id: params.projectId },
            select: { name: true },
        })
        if (!engagement) return

        const doc = await prisma.engagementDocument.upsert({
            where: {
                engagementId_firmId_externalId: {
                    engagementId: params.projectId,
                    firmId: params.organizationId,
                    externalId: params.externalId,
                },
            },
            create: {
                firmId: params.organizationId,
                clientId: params.clientId || null,
                engagementId: params.projectId,
                externalId: params.externalId,
                fileName: params.fileName,
                createdBy: params.actorId || null,
                updatedBy: params.actorId || null,
            },
            update: {},
            select: { id: true, docId: true },
        })

        if (!doc.docId) {
            await assignDocId(doc.id, params.projectId, engagement.name)
        }
    } catch (error) {
        // Non-fatal: docId will still be assigned later inside the Inngest indexing job.
        logger.error('Failed to assign docId early:', error as Error)
    }
}

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
            // Assign docIds synchronously, before the async indexing job runs
            await Promise.all((files as { externalId: string; fileName: string }[]).map((f) =>
                ensureDocIdEarly({
                    organizationId: orgId,
                    clientId: cliId,
                    projectId,
                    externalId: f.externalId,
                    fileName: f.fileName,
                    actorId: authResult.user?.id ?? null,
                })
            ))

            // Batch Index
            await IndexingInterceptor.indexBatch(request, {
                organizationId: orgId,
                clientId: cliId,
                projectId,
                files,
                actorId: authResult.user?.id ?? null,
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
            // Assign docId synchronously, before the async indexing job runs
            await ensureDocIdEarly({
                organizationId: orgId,
                clientId: cliId,
                projectId,
                externalId: externalId as string,
                fileName: fileName as string,
                actorId: authResult.user?.id ?? null,
            })

            // Single Index
            await IndexingInterceptor.indexSingle(request, {
                organizationId: orgId,
                clientId: cliId,
                projectId,
                externalId: externalId as string,
                fileName: fileName as string,
                actorId: authResult.user?.id ?? null,
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
