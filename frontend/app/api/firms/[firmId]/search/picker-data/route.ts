import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requireFirmSearch } from '@/lib/api/firm-search-auth'
import { computeGlobalSearchAccessScope } from '@/lib/services/global-search-access'

/**
 * Read-only aggregation endpoint: the user's visible Client/Engagement/Deliverable lists,
 * fetched once and cached client-side so autocomplete filtering happens locally per keystroke.
 * New route — reuses computeGlobalSearchAccessScope without modifying it.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ firmId: string }> }
) {
    try {
        const { firmId } = await params
        const authResult = await requireFirmSearch(request, firmId)
        if (authResult instanceof NextResponse) return authResult
        const { user } = authResult

        const accessScope = await computeGlobalSearchAccessScope(user.id, firmId)
        const visibleEngagementIds = [
            ...accessScope.fullAccessEngagementIds,
            ...accessScope.grantGatedEngagementIds,
        ]

        const engagementWhere = accessScope.isFirmAdmin
            ? { firmId, isDeleted: false }
            : { firmId, isDeleted: false, id: { in: visibleEngagementIds } }

        const engagements = await prisma.engagement.findMany({
            where: engagementWhere,
            select: { id: true, name: true, clientId: true },
            orderBy: { name: 'asc' },
        })

        const clientIds = Array.from(new Set(engagements.map(e => e.clientId)))
        const clients = clientIds.length > 0
            ? await prisma.client.findMany({
                where: { id: { in: clientIds } },
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
            })
            : []

        const engagementIdsForDeliverables = engagements.map(e => e.id)
        const deliverables = engagementIdsForDeliverables.length > 0
            ? await prisma.$queryRawUnsafe<any[]>(`
          SELECT id, "fileName" as name, "engagementId", "clientId"
          FROM platform.engagement_documents
          WHERE "firmId" = $1::uuid
            AND "isFolder" = true
            AND "engagementId" = ANY($2::uuid[])
            AND (settings->'share'->>'createdAt') IS NOT NULL
          ORDER BY "fileName" ASC
          LIMIT 500
        `, firmId, engagementIdsForDeliverables)
            : []

        return NextResponse.json({
            clients: clients.map(c => ({ id: c.id, name: c.name })),
            engagements: engagements.map(e => ({ id: e.id, name: e.name, clientId: e.clientId })),
            deliverables: deliverables.map(d => ({ id: d.id, name: d.name, engagementId: d.engagementId, clientId: d.clientId })),
        })
    } catch (error) {
        logger.error('Global search picker-data API error:', error as Error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
