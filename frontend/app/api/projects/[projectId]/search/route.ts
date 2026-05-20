import { NextRequest, NextResponse } from 'next/server'
import { prisma } from "@/lib/prisma"
import { googleDriveConnector } from "@/lib/google-drive-connector"
import { logger } from '@/lib/logger'
import { requireProjectView } from '@/lib/api/project-auth'
import { getLock } from '@/lib/sharing-settings'

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const { projectId } = await params
        const { searchParams } = new URL(request.url)
        const query = searchParams.get('q')
        /** When set, search is scoped to this folder and its descendants (e.g. General, Confidential, or Staging root). */
        const rootFolderId = searchParams.get('rootFolderId') ?? null

        if (!query) {
            return NextResponse.json({ files: [] })
        }

        const authResult = await requireProjectView(request, projectId)
        if (authResult instanceof NextResponse) return authResult

        const project = await prisma.engagement.findUnique({
            where: { id: projectId },
            include: {
                client: {
                    include: {
                        firm: {
                            include: {
                                connector: true
                            }
                        }
                    }
                }
            }
        })

        if (!project || !project.client?.firm?.connector) {
            return NextResponse.json({ error: 'Project or active connector not found' }, { status: 404 })
        }

        const connector = project.client.firm.connector

        // 3. Resolve Project Folders from Connector Settings and search scope
        const settings = (connector.settings as any) || {}
        const ps = settings.projectFolderSettings?.[project.slug] || {}

        const projectRootFolderIds = [
            ps.generalFolderId,
            ps.confidentialFolderId,
            ps.stagingFolderId
        ].filter(Boolean) as string[]

        // When rootFolderId is provided (e.g. user is in General/Confidential/Staging), scope search to that tree only.
        let parentFolderIds: string[]
        let indexedFolderIds: string[]
        let idsUnderRoot: Set<string> | null = null

        const { SearchService } = await import('@/lib/services/search-service')

        if (rootFolderId && projectRootFolderIds.includes(rootFolderId)) {
            parentFolderIds = [rootFolderId]
            indexedFolderIds = await SearchService.getFolderIdsUnderRoot({
                organizationId: project.firmId,
                projectId,
                rootFolderId
            })
            idsUnderRoot = await SearchService.getExternalIdsUnderRoot({
                organizationId: project.firmId,
                projectId,
                rootFolderId
            })
        } else {
            parentFolderIds = projectRootFolderIds
            indexedFolderIds = await SearchService.getAllProjectFolderIds({
                organizationId: project.firmId,
                projectId
            })
        }

        // Expand Drive search scope to all indexed subfolders so keyword search is recursive.
        // Drive's `in parents` only finds direct children — by adding every indexed folder ID
        // as a parent, Drive will search one level inside each of them, effectively covering
        // the full indexed folder tree. Capped at 50 IDs to stay within Drive API URL limits.
        const allParentFolderIds = Array.from(new Set([...parentFolderIds, ...indexedFolderIds])).slice(0, 50)

        // Enrich the query for vector embedding only — this does NOT drive multiple ILIKE searches.
        // The expanded string produces a richer embedding that bridges concept gaps (e.g. "legal"
        // → closer to "NDA" in vector space) without adding round-trips or complexity.
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
        const lowerQuery = query.toLowerCase()
        const vectorQuery = QUERY_ENRICHMENTS[lowerQuery]
            ?? Object.entries(QUERY_ENRICHMENTS).find(([k]) => lowerQuery.includes(k))?.[1]
            ?? query

        // Extract significant search terms (min length 2, drop common stopwords) for filename matching
        const STOPWORDS = new Set(['show', 'me', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'is', 'it', 'be', 'as', 'by', 'with', 'from', 'that', 'this', 'are', 'was', 'were', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'can', 'may', 'all', 'each', 'every', 'file', 'files'])
        const rawWords = query.toLowerCase().split(/\s+/).filter(w => w.length >= 2)
        const filtered = rawWords.filter(w => !STOPWORDS.has(w))
        const searchTerms = filtered.filter((w, i) => filtered.indexOf(w) === i)
        const significantTerms = searchTerms.length > 0 ? searchTerms : rawWords.slice(0, 3)

        const [driveFiles, vectorResultsRaw, dbNameResultsFull, dbNameResultsTerms] = await Promise.all([
            googleDriveConnector.searchFiles(connector.id, query, {
                parentFolderIds: allParentFolderIds,
                limit: 50
            }),
            SearchService.searchSimilarityHierarchy({
                organizationId: project.firmId,
                clientId: project.clientId,
                projectId,
                query: vectorQuery,
                limit: 50
            }),
            SearchService.searchByFileName({
                organizationId: project.firmId,
                clientId: project.clientId,
                projectId,
                query,
                limit: 20
            }),
            SearchService.searchByFileNameTerms({
                organizationId: project.firmId,
                clientId: project.clientId,
                projectId,
                terms: significantTerms.slice(0, 5),
                limit: 25
            })
        ])

        // Include semantic results with moderate similarity so search isn't keyword-only (0.38 keeps meaningfully related docs, drops noise)
        const MIN_SEMANTIC_SCORE = 0.38
        const vectorResults = vectorResultsRaw.filter(r => (r.score ?? 0) >= MIN_SEMANTIC_SCORE).slice(0, 40)

        // Merge filename results: full query match first, then any-term matches, dedupe by externalId
        const dbNameById = new Map(dbNameResultsFull.map(r => [r.externalId, r]))
        for (const r of dbNameResultsTerms) {
            if (!dbNameById.has(r.externalId)) dbNameById.set(r.externalId, r)
        }
        const dbNameResults = Array.from(dbNameById.values())

        // 5. Merge results — Drive keyword results take priority, then fill in from
        //    vector + DB name matches that aren't already covered.
        const driveFileIdSet = new Set(driveFiles.map(f => f.id))

        // Combine vector and DB name results, dedup against each other
        const allIndexedResults = [...vectorResults]
        const vectorIdSet = new Set(vectorResults.map(r => r.externalId))
        for (const r of dbNameResults) {
            if (!vectorIdSet.has(r.externalId)) {
                allIndexedResults.push(r)
            }
        }

        const missingIndexedResults = allIndexedResults.filter(r => !driveFileIdSet.has(r.externalId))

        let finalFiles = driveFiles.map(f => ({ ...f, matchType: 'keyword', score: 1.0 }))

        if (missingIndexedResults.length > 0) {
            try {
                const missingIds = missingIndexedResults.map(r => r.externalId)
                const indexedMeta = await googleDriveConnector.getFilesMetadata(connector.id, missingIds)

                const scoredIndexedFiles = indexedMeta.map(f => {
                    const iRes = missingIndexedResults.find(r => r.externalId === f.id)
                    // Prefer 'name' matchType for DB name hits; 'semantic' for pure vector hits
                    const isNameMatch = dbNameResults.some(r => r.externalId === f.id)
                    return {
                        ...f,
                        matchType: isNameMatch ? 'name' : 'semantic',
                        score: iRes?.score || 0,
                        updatedAt: iRes?.updatedAt,
                        metadata: {
                            ...(f.metadata || {}),
                            ...(iRes?.metadata || {})
                        }
                    }
                })
                finalFiles = [...finalFiles, ...scoredIndexedFiles]
            } catch (e) {
                logger.warn('Failed to fetch metadata for indexed search results', { error: e })
            }
        }

        // Filter out any locked documents (intake, finalize, private) from all result sources.
        // The indexed DB queries already exclude these via SQL, but Drive-direct results need
        // a post-filter since Drive has no knowledge of our lock state.
        if (finalFiles.length > 0) {
            try {
                const allExternalIds = finalFiles.map((f: any) => f.id).filter(Boolean)
                const lockedRows = await (prisma as any).$queryRawUnsafe(
                    `SELECT "externalId" FROM platform.engagement_documents
                     WHERE "engagementId" = $1::uuid
                       AND "externalId" = ANY($2::text[])
                       AND (
                         (settings->>'locked') = 'private'
                         OR (settings->'lock'->>'type') IS NOT NULL
                       )`,
                    projectId,
                    allExternalIds
                )
                if (lockedRows.length > 0) {
                    const lockedSet = new Set(lockedRows.map((r: any) => r.externalId))
                    finalFiles = finalFiles.filter((f: any) => !lockedSet.has(f.id))
                }
            } catch (e) {
                logger.warn('Lock filter for search results failed', { error: e })
            }
        }

        // When search was scoped to a root folder, keep only results under that root.
        // If the index has the root tree (idsUnderRoot), filter by it; otherwise the root may not be
        // in engagement_documents (e.g. only subfolders indexed), so keep only Drive results which
        // were already scoped via parentFolderIds to that root.
        if (rootFolderId && projectRootFolderIds.includes(rootFolderId)) {
            if (idsUnderRoot && idsUnderRoot.size > 0) {
                finalFiles = finalFiles.filter((f: any) => idsUnderRoot!.has(f.id))
            } else {
                finalFiles = finalFiles.filter((f: any) => driveFileIdSet.has(f.id))
            }
        }

        // 6. Sort: date (newest first), then folders before files, then relevance for stable tie-break
        const FOLDER_MIME = 'application/vnd.google-apps.folder'
        const getTime = (f: any) => {
            const raw = f.updatedAt || f.modifiedTime
            return raw ? new Date(raw).getTime() : 0
        }
        const isFolder = (f: any) => f.mimeType === FOLDER_MIME
        const now = Date.now()
        const DAY_MS = 24 * 60 * 60 * 1000
        const getRecencyBoost = (dateStr: string | Date | undefined) => {
            if (!dateStr) return 0
            const date = new Date(dateStr)
            const ageDays = (now - date.getTime()) / DAY_MS
            return Math.max(0, 1 / (1 + Math.log10(1 + ageDays)))
        }
        const matchTypeBonus = (f: any) =>
            f.matchType === 'keyword' ? 0.10 : f.matchType === 'name' ? 0.05 : 0
        const compositeScore = (f: any) =>
            (f.score || 0) * 0.7 + getRecencyBoost(f.updatedAt || f.modifiedTime) * 0.2 + matchTypeBonus(f)

        finalFiles.sort((a: any, b: any) => {
            const timeA = getTime(a)
            const timeB = getTime(b)
            if (timeB !== timeA) return timeB - timeA
            const folderFirst = (f: any) => (isFolder(f) ? 0 : 1)
            const typeOrder = folderFirst(a) - folderFirst(b)
            if (typeOrder !== 0) return typeOrder
            return compositeScore(b) - compositeScore(a)
        })

        const limited = finalFiles.slice(0, 20)
        const parentIds = Array.from(new Set(limited.map((f: any) => f.parents?.[0]).filter(Boolean))) as string[]
        let parentNames: Record<string, string> = {}
        if (parentIds.length > 0 && project.firmId) {
            try {
                const rows = await (prisma as any).$queryRawUnsafe(
                    `SELECT "externalId" as id, "fileName" as name FROM platform.engagement_documents WHERE "firmId" = $1::uuid AND "externalId" = ANY($2::text[])`,
                    project.firmId,
                    parentIds
                ) as { id: string; name: string }[]
                rows.forEach((r) => { parentNames[r.id] = r.name })
            } catch (e) {
                logger.warn('Parent names lookup failed', { error: e })
            }
        }
        // Fallback: fetch parent folder names from Drive when not in engagement_documents
        const missingParentIds = parentIds.filter((id) => !parentNames[id])
        if (missingParentIds.length > 0 && connector?.id) {
            try {
                const driveMeta = await googleDriveConnector.getFilesMetadata(connector.id, missingParentIds)
                driveMeta.forEach((f: any) => { if (f?.name) parentNames[f.id] = f.name })
            } catch (e) {
                logger.warn('Drive parent names fallback failed', { error: e })
            }
        }
        const filesWithParent = limited.map((f: any) => ({
            ...f,
            parentName: (f.parents?.[0] && parentNames[f.parents[0]]) || undefined
        }))

        return NextResponse.json({ files: filesWithParent })

    } catch (error) {
        logger.error('Project Search API Error:', error as Error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
