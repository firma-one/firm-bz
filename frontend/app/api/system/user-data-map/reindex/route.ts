import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { SearchService } from '@/lib/services/search-service'
import { isSysAdminUser } from '@/lib/system/user-data-map'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Same per-engagement safety cap as the user-facing per-project route
// (app/api/projects/[projectId]/index-project/route.ts).
const MAX_FILES = 200

export interface ReindexEngagementResult {
    engagementId: string
    name: string
    status: 'indexed' | 'skipped'
    indexedCount: number
    reason?: string
    capped?: boolean
}

/**
 * System-admin force re-index: re-runs SearchService.indexFile over every file of every
 * engagement in a firm. indexFile upserts on (engagementId, firmId, externalId), so existing
 * rows get fresh summaries/embeddings in place — lets an admin backfill after indexing
 * changes (e.g. the SEARCH_SUMMARY_MODE snippet rollout) without deleting or re-uploading
 * documents. Scan logic mirrors app/api/projects/[projectId]/index-project/route.ts
 * (deliberately duplicated — that route is engagement-user-facing with per-project manage
 * auth; this one is system-admin-only and firm-wide).
 */
export async function POST(request: NextRequest) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const allowed = await isSysAdminUser(user.id)
    if (!allowed) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let body: unknown
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const firmId = typeof (body as { firmId?: unknown }).firmId === 'string' ? (body as { firmId: string }).firmId.trim() : ''
    if (!UUID_RE.test(firmId)) {
        return NextResponse.json({ error: 'firmId must be a UUID' }, { status: 400 })
    }

    try {
        const engagements = await prisma.engagement.findMany({
            where: { firmId },
            include: { client: { include: { connector: true } } },
            orderBy: { createdAt: 'asc' },
        })
        if (engagements.length === 0) {
            return NextResponse.json({ data: { totalIndexed: 0, engagements: [] } })
        }

        const results: ReindexEngagementResult[] = []
        for (const engagement of engagements) {
            const connector = engagement.client?.connector ?? null
            if (!connector) {
                results.push({ engagementId: engagement.id, name: engagement.name, status: 'skipped', indexedCount: 0, reason: 'No client connector' })
                continue
            }

            const settings = (connector.settings as any) || {}
            const ps = settings.projectFolderSettings?.[engagement.slug] || {}
            const parentFolderIds = [ps.generalFolderId, ps.confidentialFolderId, ps.stagingFolderId].filter(Boolean) as string[]
            if (parentFolderIds.length === 0) {
                results.push({ engagementId: engagement.id, name: engagement.name, status: 'skipped', indexedCount: 0, reason: 'No project folders configured' })
                continue
            }

            const files: { id: string; name: string }[] = []
            const scanRecursive = async (folderId: string) => {
                if (files.length >= MAX_FILES) return
                const listed = await googleDriveConnector.listFiles(connector.id, folderId, 1000)
                for (const file of listed) {
                    if (files.length >= MAX_FILES) break
                    files.push({ id: file.id, name: file.name })
                    if (file.mimeType === 'application/vnd.google-apps.folder') {
                        await scanRecursive(file.id)
                    }
                }
            }
            for (const folderId of parentFolderIds) {
                await scanRecursive(folderId)
            }

            for (const file of files) {
                await SearchService.indexFile({
                    organizationId: firmId,
                    clientId: engagement.clientId ?? undefined,
                    projectId: engagement.id,
                    externalId: file.id,
                    fileName: file.name,
                    actorId: user.id,
                })
            }

            results.push({
                engagementId: engagement.id,
                name: engagement.name,
                status: 'indexed',
                indexedCount: files.length,
                capped: files.length >= MAX_FILES,
            })
        }

        const totalIndexed = results.reduce((sum, r) => sum + r.indexedCount, 0)
        logger.info(`System reindex completed for firm ${firmId}: ${totalIndexed} files across ${results.length} engagements`)
        return NextResponse.json({ data: { totalIndexed, engagements: results } })
    } catch (error) {
        logger.error('System reindex API error:', error as Error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
