import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requireFirmSearch } from '@/lib/api/firm-search-auth'
import { computeGlobalSearchAccessScope } from '@/lib/services/global-search-access'
import { isAiConfigured } from '@/lib/ai/client'
import { buildInterpretCacheKey, getCachedInterpretation, setCachedInterpretation } from '@/lib/ai/interpret-cache'
import { interpretSearchQuery, type InterpretCandidates } from '@/lib/ai/search-interpreter'
import { recordAiUsage } from '@/lib/ai/usage'

// Local, not exported: Next.js only permits route handlers and its own config keys to be
// exported from a route file.
const MAX_QUERY_LENGTH = 300

/**
 * POST /api/firms/[firmId]/search/interpret
 *
 * Resolves a natural-language query into filter chips for the opt-in "Ask" search mode. Invoked
 * explicitly on submit, never while typing.
 *
 * The candidate list is built server-side from the caller's own access scope, so the model can
 * only ever resolve to entities this user may already see — an inaccessible client cannot be
 * named in a chip, and its existence is not revealed.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ firmId: string }> }
) {
    try {
        const { firmId } = await params

        const authResult = await requireFirmSearch(request, firmId)
        if (authResult instanceof NextResponse) return authResult
        const { user } = authResult

        if (!isAiConfigured()) {
            return NextResponse.json({ error: 'AI is not configured' }, { status: 503 })
        }

        const body = await request.json().catch(() => null)
        const text = typeof body?.text === 'string' ? body.text.trim().slice(0, MAX_QUERY_LENGTH) : ''
        if (!text) return NextResponse.json({ error: 'A query is required' }, { status: 400 })

        const accessScope = await computeGlobalSearchAccessScope(user.id, firmId)
        const visibleEngagementIds = [
            ...accessScope.fullAccessEngagementIds,
            ...accessScope.grantGatedEngagementIds,
        ]
        if (!accessScope.isFirmAdmin && visibleEngagementIds.length === 0) {
            return NextResponse.json({ chips: [], residualText: text })
        }

        const engagements = await prisma.engagement.findMany({
            where: accessScope.isFirmAdmin
                ? { firmId, isDeleted: false }
                : { firmId, isDeleted: false, id: { in: visibleEngagementIds } },
            select: { id: true, name: true, clientId: true },
            orderBy: { name: 'asc' },
        })

        const clientIds = Array.from(new Set(engagements.map((e) => e.clientId)))
        const clients = clientIds.length > 0
            ? await prisma.client.findMany({
                where: { id: { in: clientIds } },
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
            })
            : []

        const engagementIds = engagements.map((e) => e.id)
        const deliverables = engagementIds.length > 0
            ? await prisma.$queryRawUnsafe<Array<{ id: string; name: string; engagementId: string }>>(`
                SELECT id, "fileName" as name, "engagementId"
                FROM platform.engagement_documents
                WHERE "firmId" = $1::uuid
                  AND "isFolder" = true
                  AND "engagementId" = ANY($2::uuid[])
                  AND (settings->'share'->>'createdAt') IS NOT NULL
                ORDER BY "fileName" ASC
                LIMIT 300
            `, firmId, engagementIds)
            : []

        const candidates: InterpretCandidates = {
            clients: clients.map((c) => ({ id: c.id, name: c.name })),
            engagements: engagements.map((e) => ({ id: e.id, name: e.name, clientId: e.clientId })),
            deliverables: deliverables.map((d) => ({ id: d.id, name: d.name, engagementId: d.engagementId })),
        }

        // An identical question against an unchanged visible entity set resolves identically, so
        // serve it from cache rather than paying for — and charging for — the same call twice.
        const cacheKey = buildInterpretCacheKey(firmId, user.id, text, candidates)
        const cached = getCachedInterpretation(cacheKey)
        if (cached) {
            // No recordAiUsage: no model call was made, so no credits are consumed.
            return NextResponse.json({ chips: cached.chips, residualText: cached.residualText, ambiguity: cached.ambiguity, cached: true })
        }

        const result = await interpretSearchQuery(text, candidates)
        // Interpretation is an enhancement: on failure the caller searches the raw text instead.
        if (!result) return NextResponse.json({ chips: [], residualText: text, degraded: true })

        await recordAiUsage({
            firmId,
            userId: user.id,
            feature: 'searchInterpret',
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
        })

        setCachedInterpretation(cacheKey, { chips: result.chips, residualText: result.residualText, ambiguity: result.ambiguity })

        return NextResponse.json({ chips: result.chips, residualText: result.residualText, ambiguity: result.ambiguity })
    } catch (error) {
        logger.error('Search interpret API error:', error as Error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
