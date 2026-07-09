import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requireFirmSearch } from '@/lib/api/firm-search-auth'
import { computeGlobalSearchAccessScope } from '@/lib/services/global-search-access'
import { parseDateRangeFromText } from '@/lib/services/date-query-parser'
import { cleanSemanticQuery } from '@/lib/services/semantic-query-cleaner'

// Duplicated from app/api/projects/[projectId]/shares/route.ts's getAvatarUrlFromUser — same
// inline-per-route pattern used ~10 times elsewhere in this codebase (no shared util exists yet).
function getAvatarUrlFromUser(dbUser: { user_metadata?: Record<string, unknown>; identities?: Array<{ identity_data?: Record<string, unknown> }> } | null | undefined): string | null {
    if (!dbUser) return null
    const meta = dbUser.user_metadata
    const fromMeta = (meta?.avatar_url ?? meta?.picture) as string | undefined
    if (fromMeta) return fromMeta
    const firstIdentity = dbUser.identities?.[0]?.identity_data
    return (firstIdentity?.avatar_url ?? firstIdentity?.picture) as string | undefined ?? null
}

// Duplicated from app/api/projects/[projectId]/search/route.ts's QUERY_ENRICHMENTS by deliberate
// choice — the existing route is not touched (zero-regression constraint), so this is copied here
// rather than extracted into a shared module until the approach is validated. Enriches the *embedding*
// text only, bridging concept gaps (e.g. "legal" -> closer to "NDA" in vector space); does not affect
// filename/term matching, which uses the raw query.
const QUERY_ENRICHMENTS: Record<string, string> = {
    legal: 'legal NDA contract agreement terms compliance confidential',
    finance: 'finance budget revenue invoice payment accounting expense',
    marketing: 'marketing campaign brand advertising launch creative',
    channel: 'channel distribution marketing pipeline sales planning',
    hr: 'HR recruitment hiring onboarding payroll personnel',
    security: 'security confidential NDA privacy GDPR access',
    technical: 'technical spec architecture API schema design roadmap',
    operations: 'operations process workflow SOP policy procedure',
}

/**
 * Firm-wide search. New route — does not modify app/api/projects/[projectId]/search/route.ts.
 * Query/body carries structured filters resolved from explicit UI picker selections
 * (clientId/engagementId/deliverableDocumentId/dateRange) plus free-text semanticText —
 * never inferred entity mentions from prose.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ firmId: string }> }
) {
    try {
        const { firmId } = await params
        const { searchParams } = new URL(request.url)

        const semanticText = searchParams.get('q') ?? ''
        const clientId = searchParams.get('clientId') || undefined
        const engagementId = searchParams.get('engagementId') || undefined
        const deliverableDocumentId = searchParams.get('deliverableDocumentId') || undefined
        const dateStart = searchParams.get('dateStart')
        const dateEnd = searchParams.get('dateEnd')
        const dateFieldParam = searchParams.get('dateField')
        const dateField: 'dueDate' | 'kickoffDate' | 'updatedAt' =
            dateFieldParam === 'updatedAt' || dateFieldParam === 'kickoffDate' ? dateFieldParam : 'dueDate'

        const authResult = await requireFirmSearch(request, firmId)
        if (authResult instanceof NextResponse) return authResult
        const { user } = authResult

        const accessScope = await computeGlobalSearchAccessScope(user.id, firmId)
        if (!accessScope.isFirmAdmin
            && accessScope.fullAccessEngagementIds.length === 0
            && accessScope.grantGatedEngagementIds.length === 0) {
            return NextResponse.json({ files: [], resolvedFilters: {} })
        }

        // Picker-selected dates (dateStart/dateEnd) are explicit user intent — a hard AND filter,
        // same treatment as clientId/engagementId. Auto-detected dates from typed text are a
        // convenience, not an explicit choice — applied as a ranking boost only (softDateRange),
        // never excluding a document that doesn't have a matching dueDate. The matched phrase
        // (e.g. "from July") is also stripped from the text used for search/embedding so the
        // literal date words don't pollute filename/semantic matching.
        let dateRange: { start: Date; end: Date } | undefined
        let softDateRange: { start: Date; end: Date } | undefined
        let textForSearch = semanticText
        if (dateStart && dateEnd) {
            dateRange = { start: new Date(dateStart), end: new Date(dateEnd) }
        } else if (semanticText) {
            const parsed = parseDateRangeFromText(semanticText)
            if (parsed) {
                softDateRange = { start: parsed.start, end: parsed.end }
                textForSearch = parsed.remainingText
            }
        }

        let deliverableDocumentIds: string[] | undefined
        if (deliverableDocumentId) {
            const { SearchService } = await import('@/lib/services/search-service')
            const deliverable = await prisma.engagementDocument.findUnique({
                where: { id: deliverableDocumentId },
                select: { firmId: true, engagementId: true, externalId: true },
            })
            if (!deliverable || deliverable.firmId !== firmId) {
                return NextResponse.json({ error: 'Deliverable not found' }, { status: 404 })
            }
            const idSet = await SearchService.getExternalIdsUnderRoot({
                organizationId: firmId,
                projectId: deliverable.engagementId,
                rootFolderId: deliverable.externalId,
            })
            const rows = idSet.size > 0
                ? await prisma.engagementDocument.findMany({
                    where: { firmId, engagementId: deliverable.engagementId, externalId: { in: Array.from(idSet) } },
                    select: { id: true },
                })
                : []
            deliverableDocumentIds = rows.map(r => r.id)
        }

        const cleanedQuery = cleanSemanticQuery(textForSearch)
        const lowerCleaned = cleanedQuery.toLowerCase()
        const embeddingQuery = QUERY_ENRICHMENTS[lowerCleaned]
            ?? Object.entries(QUERY_ENRICHMENTS).find(([k]) => lowerCleaned.includes(k))?.[1]
            ?? cleanedQuery

        const { SearchService } = await import('@/lib/services/search-service')
        const results = await SearchService.searchGlobal({
            firmId,
            userId: user.id,
            semanticText: cleanedQuery,
            embeddingQuery,
            isFirmAdmin: accessScope.isFirmAdmin,
            fullAccessEngagementIds: accessScope.fullAccessEngagementIds,
            grantGatedEngagementIds: accessScope.grantGatedEngagementIds,
            clientId,
            engagementId,
            deliverableDocumentIds,
            dateRange,
            softDateRange,
            dateField,
            limit: 30,
        })

        // Resolve breadcrumb (client name, engagement name, full ancestor-folder chain) and the
        // internal document id (needed for deep-linking to the Files tab). Client/engagement/self
        // stay batched lookups; the ancestor chain uses the existing, unmodified
        // SearchService.resolvePathToProjectRoot (recursive parentId walk to the root) per result,
        // run in parallel — a single-level parentId lookup only showed the immediate parent, not
        // the full path (e.g. missing the deliverable folder above it).
        const resultClientIds = Array.from(new Set(results.map(r => r.clientId).filter((v): v is string => Boolean(v))))
        const resultEngagementIds = Array.from(new Set(results.map(r => r.engagementId).filter((v): v is string => Boolean(v))))

        const [clientRows, engagementRows, selfRows, ancestorPaths] = await Promise.all([
            resultClientIds.length > 0
                ? prisma.client.findMany({ where: { id: { in: resultClientIds } }, select: { id: true, name: true } })
                : Promise.resolve([]),
            resultEngagementIds.length > 0
                ? prisma.engagement.findMany({ where: { id: { in: resultEngagementIds } }, select: { id: true, name: true } })
                : Promise.resolve([]),
            results.length > 0
                ? prisma.engagementDocument.findMany({
                    where: { firmId, externalId: { in: results.map(r => r.externalId) } },
                    select: { id: true, externalId: true },
                })
                : Promise.resolve([]),
            Promise.all(results.map(async (r) => {
                const { SearchService } = await import('@/lib/services/search-service')
                const path = await SearchService.resolvePathToProjectRoot(firmId, r.externalId)
                return [r.externalId, path.map(p => p.name)] as const
            })),
        ])

        const clientNameById = new Map(clientRows.map(c => [c.id, c.name]))
        const engagementNameById = new Map(engagementRows.map(e => [e.id, e.name]))
        const documentIdByExternalId = new Map(selfRows.map(s => [s.externalId, s.id]))
        const ancestorNamesByExternalId = new Map(ancestorPaths)

        // Resolve createdBy/updatedBy (raw Supabase auth user ids) to name/email/avatar — same
        // batched auth.admin.getUserById pattern already used ~10x elsewhere (e.g. shares/route.ts),
        // since EngagementDocument has no Prisma relation to a users table for these fields.
        const uniqueUserIds = Array.from(new Set(
            results.flatMap(r => [r.createdBy, r.updatedBy]).filter((v): v is string => Boolean(v))
        ))
        const userMap: Record<string, { name: string | null; email: string | null; avatarUrl: string | null }> = {}
        if (uniqueUserIds.length > 0) {
            const supabaseAdmin = createSupabaseAdmin(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!,
            )
            await Promise.all(uniqueUserIds.map(async (userId) => {
                try {
                    const { data: { user: dbUser } } = await supabaseAdmin.auth.admin.getUserById(userId)
                    const meta = dbUser?.user_metadata ?? {}
                    const name = (meta.full_name ?? meta.name ?? dbUser?.email?.split('@')[0] ?? null) as string | null
                    userMap[userId] = { name, email: dbUser?.email ?? null, avatarUrl: getAvatarUrlFromUser(dbUser) }
                } catch {
                    // ignore - that user's avatar/name just won't resolve
                }
            }))
        }

        const filesWithBreadcrumb = results.map(r => ({
            ...r,
            documentId: documentIdByExternalId.get(r.externalId) ?? null,
            clientName: r.clientId ? clientNameById.get(r.clientId) ?? null : null,
            engagementName: r.engagementId ? engagementNameById.get(r.engagementId) ?? null : null,
            ancestorFolderNames: ancestorNamesByExternalId.get(r.externalId) ?? [],
            createdByName: r.createdBy ? userMap[r.createdBy]?.name ?? null : null,
            createdByEmail: r.createdBy ? userMap[r.createdBy]?.email ?? null : null,
            createdByAvatarUrl: r.createdBy ? userMap[r.createdBy]?.avatarUrl ?? null : null,
            updatedByName: r.updatedBy ? userMap[r.updatedBy]?.name ?? null : null,
            updatedByEmail: r.updatedBy ? userMap[r.updatedBy]?.email ?? null : null,
            updatedByAvatarUrl: r.updatedBy ? userMap[r.updatedBy]?.avatarUrl ?? null : null,
        }))

        const effectiveDateRange = dateRange ?? softDateRange
        return NextResponse.json({
            files: filesWithBreadcrumb,
            resolvedFilters: {
                clientId: clientId ?? null,
                engagementId: engagementId ?? null,
                deliverableDocumentId: deliverableDocumentId ?? null,
                dateRange: effectiveDateRange ? { start: effectiveDateRange.start.toISOString(), end: effectiveDateRange.end.toISOString() } : null,
                dateRangeIsSoft: Boolean(softDateRange && !dateRange),
            },
        })
    } catch (error) {
        logger.error('Global search API error:', error as Error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
