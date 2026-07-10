import { prisma } from '../prisma'
import { generateEmbedding, prepareTextForEmbedding } from '../embeddings'
import { generateSummary } from '../summarization'
import { extractSnippet } from '../snippet'
import { logger } from '../logger'
import { assignDocId } from '../doc-id'

export interface VectorSearchResult {
    externalId: string
    fileName: string
    score: number
    updatedAt: Date
    metadata?: any
    isFolder?: boolean
    /** Optional — only set by searchGlobal's branches (name/semantic), unused by existing methods. */
    matchType?: 'name' | 'semantic'
    /** Optional — only set by searchGlobal's branches, used to resolve breadcrumb (parent folder, client, engagement) in the route layer. */
    parentId?: string | null
    clientId?: string | null
    engagementId?: string
    /** Optional — only set by searchGlobal's branches, used to score against an auto-detected softDateRange. */
    dueDate?: Date | null
    /** Optional — only set by searchGlobal's branches, e.g. "NVQ-7". Used to suffix the filename in results and as a dedicated exact-match search branch. */
    docId?: string | null
    /** Optional — only set by searchGlobal's branches, raw Supabase auth user ids, resolved to name/email/avatar in the route layer. */
    createdBy?: string | null
    updatedBy?: string | null
}

export class SearchService {
    /**
     * Index or update a file's embedding and sync metadata to Google Drive (V2)
     */
    static async indexFile(params: {
        organizationId: string
        clientId?: string
        projectId?: string
        externalId: string
        fileName: string
        parentId?: string
        actorId?: string | null
    }) {
        const name = params.fileName.toLowerCase()
        const isJunk = [
            '.ds_store', 'desktop.ini', 'thumbs.db', '.trash', '.spotlight-v100', '.fseventsd'
        ].some(junk => name === junk || name.endsWith('/' + junk))

        if (isJunk) {
            logger.debug(`Skipping indexing for junk file: ${params.fileName}`)
            return
        }

        try {
            const { googleDriveConnector } = await import('../google-drive-connector')
            let connectorId: string | null = null
            if (params.clientId) {
                const { resolveClientConnector } = await import('../connectors/resolve-client-connector')
                const resolved = await resolveClientConnector(params.clientId)
                connectorId = resolved.connectorId
            } else {
                const firm = await prisma.firm.findUnique({
                    where: { id: params.organizationId },
                    select: { connectorId: true }
                })
                connectorId = firm?.connectorId ?? null
            }

            let driveMetadata: any = {}
            let driveParentId = params.parentId || null
            let isFolder = false

            const meta = connectorId ? await googleDriveConnector.getFileMetadata(connectorId, params.externalId) : null
            let summary: string | null = null

            if (meta) {
                isFolder = meta.mimeType === 'application/vnd.google-apps.folder'
                driveMetadata = {
                    thumbnailLink: meta.thumbnailLink,
                    iconLink: meta.iconLink,
                    mimeType: meta.mimeType,
                    size: meta.size,
                    modifiedTime: meta.modifiedTime,
                    webViewLink: meta.webViewLink,
                    owners: meta.owners ?? null,
                    lastModifyingUser: meta.lastModifyingUser ?? null,
                }
                if (!driveParentId && meta.parents && meta.parents.length > 0) {
                    driveParentId = meta.parents[0]
                }

                // Widened alongside SEARCH_SUMMARY_MODE=snippet: with the free extractive
                // path, every format googleDriveConnector.getFileText can decode now feeds
                // into content-based embeddings. Google-native Sheets/Slides via export API;
                // modern Office (docx/pptx/xlsx) and PDFs parsed in-memory (officeparser /
                // pdf-parse). Legacy .doc/.ppt/.xls and scanned PDFs stay filename-only.
                const isSummarizable = [
                    'application/vnd.google-apps.document',
                    'application/vnd.google-apps.spreadsheet',
                    'application/vnd.google-apps.presentation',
                    'text/plain', 'text/markdown', 'text/csv', 'application/json',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'application/pdf',
                ].includes(meta.mimeType)

                if (isSummarizable && connectorId) {
                    const text = await googleDriveConnector.getFileText(connectorId, params.externalId)
                    if (text) {
                        // SEARCH_SUMMARY_MODE=model re-enables the legacy distilbart summarizer
                        // (lib/summarization.ts, retained until snippet mode is signed off);
                        // default is the extractive snippet — no ML model at index time.
                        summary = process.env.SEARCH_SUMMARY_MODE === 'model'
                            ? await generateSummary(text)
                            : extractSnippet(text)
                        if (summary) {
                            driveMetadata.summary = summary
                        }
                    }
                }
            }

            const embeddingText = prepareTextForEmbedding(params.fileName, summary)
            const embedding = await generateEmbedding(embeddingText)
            const embeddingSql = `[${embedding.join(',')}]`

            // projectId required: one row per (projectId, organizationId, externalId)
            if (!params.projectId) {
                logger.debug('Skipping indexFile: projectId required for engagement_documents')
                return
            }

            // Store in platform schema (do not overwrite settings/slug on conflict; backfill createdBy/updatedBy if missing)
            await prisma.$executeRawUnsafe(`
    INSERT INTO platform.engagement_documents (
      "firmId",
      "clientId",
      "engagementId",
      "connectorId",
      "externalId",
      "parentId",
      "fileName",
      "isFolder",
      "mimeType",
      "fileSize",
      "content",
      "embedding",
      "metadata",
      "createdBy",
      "updatedBy",
      "updatedAt"
    )
    VALUES (
      $1::uuid,
      $2::uuid,
      $3::uuid,
      $4::uuid,
      $5,
      $6,
      $7,
      $8::boolean,
      $9,
      $10::bigint,
      $11,
      $12::vector,
      $13::jsonb,
      $14::uuid,
      $14::uuid,
      NOW()
    )
    ON CONFLICT ("engagementId", "firmId", "externalId")
    DO UPDATE SET
      "fileName" = EXCLUDED."fileName",
      "isFolder" = CASE WHEN platform.engagement_documents."isFolder" = true THEN true ELSE EXCLUDED."isFolder" END,
      "mimeType" = COALESCE(EXCLUDED."mimeType", platform.engagement_documents."mimeType"),
      "fileSize" = EXCLUDED."fileSize",
      "content" = EXCLUDED."content",
      "embedding" = EXCLUDED."embedding",
      "clientId" = COALESCE(EXCLUDED."clientId", platform.engagement_documents."clientId"),
      "connectorId" = COALESCE(EXCLUDED."connectorId", platform.engagement_documents."connectorId"),
      "parentId" = COALESCE(EXCLUDED."parentId", platform.engagement_documents."parentId"),
      "metadata" = EXCLUDED."metadata",
      "createdBy" = COALESCE(platform.engagement_documents."createdBy", EXCLUDED."createdBy"),
      "updatedBy" = COALESCE(EXCLUDED."updatedBy", platform.engagement_documents."updatedBy"),
      "updatedAt" = NOW()
  `,
                params.organizationId,
                params.clientId || null,
                params.projectId,
                connectorId || null,
                params.externalId,
                driveParentId,
                params.fileName,
                isFolder,
                meta?.mimeType || null,
                meta?.size ? BigInt(meta.size) : null,
                null,
                embeddingSql,
                JSON.stringify(driveMetadata),
                params.actorId || null
            )

            // Assign docId to new rows
            if (params.projectId) {
                const doc = await prisma.engagementDocument.findUnique({
                    where: {
                        engagementId_firmId_externalId: {
                            engagementId: params.projectId,
                            firmId: params.organizationId,
                            externalId: params.externalId,
                        },
                    },
                    select: { id: true, docId: true, engagement: { select: { name: true } } },
                })
                if (doc && !doc.docId && doc.engagement?.name) {
                    await assignDocId(doc.id, params.projectId, doc.engagement.name)
                }
            }

            // Sync to GDrive
            if (connectorId) {
                const properties: Record<string, string> = { organizationId: params.organizationId }
                if (params.clientId) properties.clientId = params.clientId
                if (params.projectId) properties.projectId = params.projectId
                await googleDriveConnector.updateAppProperties(connectorId, params.externalId, properties)
            }

        } catch (error) {
            logger.error('Failed to index file in SearchService (V2):', error as Error)
            throw error
        }
    }

    static async indexBatch(params: {
        organizationId: string
        clientId?: string
        projectId?: string
        files: { externalId: string; fileName: string }[]
    }) {
        for (const file of params.files) {
            await this.indexFile({
                organizationId: params.organizationId,
                clientId: params.clientId,
                projectId: params.projectId,
                externalId: file.externalId,
                fileName: file.fileName
            })
            if (params.files.length > 5) await new Promise(r => setTimeout(r, 50))
        }
    }

    static async removeFile(organizationId: string, externalId: string) {
        try {
            await prisma.$executeRawUnsafe(`
        WITH RECURSIVE descendants AS (
            SELECT "externalId"
            FROM platform.engagement_documents
            WHERE "firmId" = $1::uuid AND "externalId" = $2
            UNION
            SELECT child."externalId"
            FROM platform.engagement_documents child
            JOIN descendants d ON child."parentId" = d."externalId"
            WHERE child."firmId" = $1::uuid
        )
        DELETE FROM platform.engagement_documents
        WHERE "firmId" = $1::uuid
        AND "externalId" IN (SELECT "externalId" FROM descendants);
      `, organizationId, externalId)
        } catch (error) {
            logger.error('Failed to remove file from platform search index:', error as Error)
        }
    }

    static async searchSimilarityHierarchy(params: {
        organizationId: string
        clientId?: string
        projectId?: string
        query: string
        limit?: number
    }): Promise<VectorSearchResult[]> {
        try {
            const embedding = await generateEmbedding(params.query)
            const embeddingSql = `[${embedding.join(',')}]`
            const limit = params.limit || 20

            let scopeFilter = `"firmId" = $2::uuid`
            const queryParams: any[] = [embeddingSql, params.organizationId]

            if (params.projectId) {
                scopeFilter += ` AND "engagementId" = $3::uuid`
                queryParams.push(params.projectId)
            } else if (params.clientId) {
                scopeFilter += ` AND "clientId" = $3::uuid`
                queryParams.push(params.clientId)
            }
            queryParams.push(limit)

            const results = await prisma.$queryRawUnsafe<any[]>(`
        SELECT
          "externalId",
          "fileName",
          "updatedAt",
          "metadata",
          "isFolder",
          1 - (embedding <=> $1::vector) as score
        FROM platform.engagement_documents
        WHERE ${scopeFilter}
          AND (settings->>'locked') IS DISTINCT FROM 'private'
          AND (settings->'lock'->>'type') IS NULL
        ORDER BY embedding <=> $1::vector
        LIMIT $${queryParams.length}
      `, ...queryParams)

            return results.map(r => ({
                externalId: r.externalId,
                fileName: r.fileName,
                updatedAt: new Date(r.updatedAt),
                score: Number(r.score),
                metadata: r.metadata,
                isFolder: Boolean(r.isFolder)
            }))
        } catch (error) {
            logger.error('Vector search failed in platform schema:', error as Error)
            return []
        }
    }

    static async getAllProjectFolderIds(params: {
        organizationId: string
        projectId: string
    }): Promise<string[]> {
        try {
            const results = await prisma.$queryRawUnsafe<{ externalId: string }[]>(`
        SELECT "externalId"
        FROM platform.engagement_documents
        WHERE "firmId" = $1::uuid
          AND "engagementId" = $2::uuid
          AND "isFolder" = true
      `, params.organizationId, params.projectId)
            return results.map(r => r.externalId)
        } catch (error) {
            logger.error('getAllProjectFolderIds failed:', error as Error)
            return []
        }
    }

    static async searchByFileName(params: {
        organizationId: string
        clientId?: string
        projectId?: string
        query: string
        limit?: number
    }): Promise<VectorSearchResult[]> {
        try {
            const limit = params.limit || 20
            let scopeFilter = `"firmId" = $1::uuid`
            const queryParams: any[] = [params.organizationId, `%${params.query}%`]

            if (params.projectId) {
                scopeFilter += ` AND "engagementId" = $3::uuid`
                queryParams.push(params.projectId)
            } else if (params.clientId) {
                scopeFilter += ` AND "clientId" = $3::uuid`
                queryParams.push(params.clientId)
            }
            queryParams.push(limit)

            const results = await prisma.$queryRawUnsafe<any[]>(`
        SELECT
          "externalId",
          "fileName",
          "updatedAt",
          "metadata",
          "isFolder"
        FROM platform.engagement_documents
        WHERE ${scopeFilter}
          AND "fileName" ILIKE $2
          AND (settings->>'locked') IS DISTINCT FROM 'private'
          AND (settings->'lock'->>'type') IS NULL
        ORDER BY "updatedAt" DESC
        LIMIT $${queryParams.length}
      `, ...queryParams)

            return results.map(r => ({
                externalId: r.externalId,
                fileName: r.fileName,
                updatedAt: new Date(r.updatedAt),
                score: 0.92,
                metadata: r.metadata,
                isFolder: Boolean(r.isFolder)
            }))
        } catch (error) {
            logger.error('Filename search failed in platform schema:', error as Error)
            return []
        }
    }

    /**
     * Filename search matching any of the given terms (OR). Used to find files whose name
     * contains at least one significant term (e.g. "legal", "NDA") for better relevance.
     */
    static async searchByFileNameTerms(params: {
        organizationId: string
        clientId?: string
        projectId?: string
        terms: string[]
        limit?: number
    }): Promise<VectorSearchResult[]> {
        if (params.terms.length === 0) return []
        try {
            const limit = params.limit || 20
            let scopeFilter = `"firmId" = $1::uuid`
            const queryParams: any[] = [params.organizationId]

            if (params.projectId) {
                scopeFilter += ` AND "engagementId" = $2::uuid`
                queryParams.push(params.projectId)
            } else if (params.clientId) {
                scopeFilter += ` AND "clientId" = $2::uuid`
                queryParams.push(params.clientId)
            }

            const ilikeConditions = params.terms
                .filter(t => t.length > 0)
                .map((_, i) => `"fileName" ILIKE $${queryParams.length + i + 1}`)
            if (ilikeConditions.length === 0) return []
            params.terms.forEach(t => queryParams.push(`%${t}%`))
            queryParams.push(limit)

            const results = await prisma.$queryRawUnsafe<any[]>(`
        SELECT
          "externalId",
          "fileName",
          "updatedAt",
          "metadata",
          "isFolder"
        FROM platform.engagement_documents
        WHERE ${scopeFilter}
          AND (${ilikeConditions.join(' OR ')})
          AND (settings->>'locked') IS DISTINCT FROM 'private'
          AND (settings->'lock'->>'type') IS NULL
        ORDER BY "updatedAt" DESC
        LIMIT $${queryParams.length}
      `, ...queryParams)

            return results.map(r => ({
                externalId: r.externalId,
                fileName: r.fileName,
                updatedAt: new Date(r.updatedAt),
                score: 0.92,
                metadata: r.metadata,
                isFolder: Boolean(r.isFolder)
            }))
        } catch (error) {
            logger.error('Filename terms search failed in platform schema:', error as Error)
            return []
        }
    }

    /**
     * Returns folder externalIds that are the given root or its descendants (for scoped Drive search).
     * Includes direct children of root even when the root folder is not in engagement_documents.
     */
    static async getFolderIdsUnderRoot(params: {
        organizationId: string
        projectId: string
        rootFolderId: string
    }): Promise<string[]> {
        try {
            const { organizationId, projectId, rootFolderId } = params
            const results = await prisma.$queryRawUnsafe<{ externalId: string }[]>(`
        WITH RECURSIVE under_root AS (
            SELECT "externalId" FROM platform.engagement_documents
            WHERE "firmId" = $1::uuid AND "engagementId" = $2::uuid AND "isFolder" = true
              AND ("externalId" = $3 OR "parentId" = $3)
            UNION ALL
            SELECT p."externalId" FROM platform.engagement_documents p
            JOIN under_root u ON p."parentId" = u."externalId"
            WHERE p."firmId" = $1::uuid AND p."engagementId" = $2::uuid AND p."isFolder" = true
        )
        SELECT "externalId" FROM under_root
      `, organizationId, projectId, rootFolderId)
            return results.map(r => r.externalId)
        } catch (error) {
            logger.error('getFolderIdsUnderRoot failed:', error as Error)
            return []
        }
    }

    /**
     * Returns all document externalIds that are the given root or its descendants (for filtering search results to one tree).
     * Includes direct children of root even when the root folder is not in engagement_documents.
     */
    static async getExternalIdsUnderRoot(params: {
        organizationId: string
        projectId: string
        rootFolderId: string
    }): Promise<Set<string>> {
        try {
            const { organizationId, projectId, rootFolderId } = params
            const results = await prisma.$queryRawUnsafe<{ externalId: string }[]>(`
        WITH RECURSIVE under_root AS (
            SELECT "externalId" FROM platform.engagement_documents
            WHERE "firmId" = $1::uuid AND "engagementId" = $2::uuid
              AND ("externalId" = $3 OR "parentId" = $3)
            UNION ALL
            SELECT p."externalId" FROM platform.engagement_documents p
            JOIN under_root u ON p."parentId" = u."externalId"
            WHERE p."firmId" = $1::uuid AND p."engagementId" = $2::uuid
        )
        SELECT "externalId" FROM under_root
      `, organizationId, projectId, rootFolderId)
            return new Set(results.map(r => r.externalId))
        } catch (error) {
            logger.error('getExternalIdsUnderRoot failed:', error as Error)
            return new Set()
        }
    }

    static async resolvePathToProjectRoot(organizationId: string, externalId: string): Promise<{ id: string; name: string }[]> {
        try {
            const results = await prisma.$queryRawUnsafe<any[]>(`
        WITH RECURSIVE path_resolution AS (
            SELECT "parentId", 0 as level
            FROM platform.engagement_documents
            WHERE "firmId" = $1::uuid AND "externalId" = $2
            UNION ALL
            SELECT f."parentId", pr.level + 1
            FROM platform.engagement_documents f
            JOIN path_resolution pr ON f."externalId" = pr."parentId"
            WHERE f."firmId" = $1::uuid AND f."parentId" IS NOT NULL
        )
        SELECT p."externalId" as id, p."fileName" as name
        FROM platform.engagement_documents p
        JOIN path_resolution pr ON p."externalId" = pr."parentId"
        WHERE p."firmId" = $1::uuid
        ORDER BY pr.level DESC;
      `, organizationId, externalId)
            return results.map(r => ({ id: r.id, name: r.name }))
        } catch (error) {
            logger.error('resolvePathToProjectRoot failed:', error as Error)
            return []
        }
    }

    /**
     * Firm-wide semantic search, scoped by structured filters (client/engagement/deliverable/date)
     * resolved from explicit UI picker selections (never inferred from free text) and by the
     * requesting user's access (full-access engagements vs. grant-gated engagements requiring
     * per-document sharing grants). New method — does not modify searchSimilarityHierarchy or any
     * other existing method above.
     */
    /**
     * Builds the shared WHERE-clause fragments (access scope + structured filters) used by
     * both the vector and filename branches of searchGlobal, so both branches see the same
     * scoping. Appends params via the caller's `push` closure to keep placeholder numbering
     * correct across both queries independently (each query gets its own queryParams/push).
     */
    private static buildGlobalScopeFilter(params: {
        userId: string
        fullAccessEngagementIds: string[]
        grantGatedEngagementIds: string[]
        clientId?: string
        engagementId?: string
        deliverableDocumentIds?: string[]
        dateRange?: { start: Date; end: Date }
        dateField: 'dueDate' | 'kickoffDate' | 'updatedAt'
        push: (value: any) => string
    }): string {
        const { userId, fullAccessEngagementIds, grantGatedEngagementIds, clientId, engagementId, deliverableDocumentIds, dateRange, dateField, push } = params

        const accessConditions: string[] = []
        if (fullAccessEngagementIds.length > 0) {
            accessConditions.push(`d."engagementId" = ANY(${push(fullAccessEngagementIds)}::uuid[])`)
        }
        if (grantGatedEngagementIds.length > 0) {
            const gatedIdsParam = push(grantGatedEngagementIds)
            const userIdParam = push(userId)
            accessConditions.push(`(
                d."engagementId" = ANY(${gatedIdsParam}::uuid[])
                AND EXISTS (
                    SELECT 1 FROM platform.engagement_document_sharing_users sh
                    WHERE sh."projectDocumentId" = d.id
                      AND sh."userId" = ${userIdParam}::uuid
                      AND sh."sharingPermissionStatus" IN ('GRANTED', 'INHERITED')
                )
            )`)
        }
        // Both empty means firm_admin (no engagement restriction needed).
        let filter = accessConditions.length > 0 ? ` AND (${accessConditions.join(' OR ')})` : ''

        if (clientId) filter += ` AND d."clientId" = ${push(clientId)}::uuid`
        if (engagementId) filter += ` AND d."engagementId" = ${push(engagementId)}::uuid`
        if (deliverableDocumentIds) filter += ` AND d.id = ANY(${push(deliverableDocumentIds)}::uuid[])`
        if (dateRange) {
            const startParam = push(dateRange.start)
            const endParam = push(dateRange.end)
            filter += ` AND d."${dateField}" BETWEEN ${startParam}::timestamptz AND ${endParam}::timestamptz`
        }
        return filter
    }

    /**
     * Firm-wide search combining the same signals as the existing project-scoped search route
     * (vector similarity + filename ILIKE + significant-term ILIKE, merged and deduped) rather
     * than vector-only — mirrors app/api/projects/[projectId]/search/route.ts's merge behavior
     * so a query like "show me sales playbook" finds a filename match even when the embedding
     * score alone wouldn't clear the relevance threshold.
     */
    static async searchGlobal(params: {
        firmId: string
        userId: string
        /** Raw (stopword-cleaned) query text, used for filename/term ILIKE matching. */
        semanticText: string
        /** Optionally enriched text (e.g. QUERY_ENRICHMENTS-expanded) used only for the embedding — falls back to semanticText if omitted. */
        embeddingQuery?: string
        /** firm_admin has no engagement restriction — fullAccessEngagementIds/grantGatedEngagementIds are legitimately empty in that case, not "no access." */
        isFirmAdmin: boolean
        fullAccessEngagementIds: string[]
        grantGatedEngagementIds: string[]
        clientId?: string
        engagementId?: string
        deliverableDocumentIds?: string[]
        dateRange?: { start: Date; end: Date }
        /** Auto-detected from typed text (e.g. "from July") — applied as a ranking boost only, never excludes a document with no/different dueDate. Unlike dateRange, this is not explicit user intent. */
        softDateRange?: { start: Date; end: Date }
        dateField?: 'dueDate' | 'kickoffDate' | 'updatedAt'
        limit?: number
    }): Promise<VectorSearchResult[]> {
        const {
            firmId, userId, semanticText, isFirmAdmin,
            fullAccessEngagementIds, grantGatedEngagementIds,
            clientId, engagementId, deliverableDocumentIds, dateRange, softDateRange,
            dateField = 'dueDate',
        } = params
        const embeddingQuery = params.embeddingQuery ?? semanticText
        const limit = params.limit || 30

        if (!isFirmAdmin && fullAccessEngagementIds.length === 0 && grantGatedEngagementIds.length === 0) {
            // Not firm_admin and no engagement access at all - nothing to search.
            return []
        }

        const trimmedQuery = semanticText.trim()
        const trimmedEmbeddingQuery = embeddingQuery.trim()
        // Terms used for the OR-based filename fallback (searchGlobalFileNameTerms) need real
        // discriminating power — a bare numeric token (e.g. a year like "2026") coincidentally
        // appears as a substring in unrelated filenames (versioning, dates in names, etc.)
        // without being a meaningful topical match, so pure numbers are excluded regardless of
        // length. Short alphanumeric tokens that mix a letter and a digit (e.g. "Q3", "H1") are
        // specific/discriminating despite being only 2 characters, so they're allowed through at
        // length >= 2; anything else (plain words, "SOP"/"KPI"-style acronyms) needs length >= 3.
        const isPureNumeric = (w: string) => /^\d+$/.test(w)
        const isShortAlphanumeric = (w: string) => w.length === 2 && /[a-z]/.test(w) && /\d/.test(w)
        const words = trimmedQuery.toLowerCase().split(/\s+/)
            .filter(w => !isPureNumeric(w) && (w.length >= 3 || isShortAlphanumeric(w)))
        const significantTerms = Array.from(new Set(words)).slice(0, 5)

        // A docId looks like "NVQ-7" (letters, hyphen, digits) — only attempt the dedicated
        // exact-match branch when the query plausibly looks like one, so a normal semantic
        // query never pays for an extra no-op DB round-trip.
        const looksLikeDocId = /^[a-z]{2,6}-\d+$/i.test(trimmedQuery)

        const [vectorResults, filenameResults, termResults, docIdResults] = await Promise.all([
            trimmedEmbeddingQuery
                ? SearchService.searchGlobalVector({ firmId, userId, semanticText: trimmedEmbeddingQuery, fullAccessEngagementIds, grantGatedEngagementIds, clientId, engagementId, deliverableDocumentIds, dateRange, dateField, limit: 50 })
                : SearchService.searchGlobalStructuredOnly({ firmId, userId, fullAccessEngagementIds, grantGatedEngagementIds, clientId, engagementId, deliverableDocumentIds, dateRange, dateField, limit }),
            trimmedQuery
                ? SearchService.searchGlobalFileName({ firmId, userId, query: trimmedQuery, fullAccessEngagementIds, grantGatedEngagementIds, clientId, engagementId, deliverableDocumentIds, dateRange, dateField, limit: 20 })
                : Promise.resolve([]),
            trimmedQuery && significantTerms.length > 0
                ? SearchService.searchGlobalFileNameTerms({ firmId, userId, terms: significantTerms, fullAccessEngagementIds, grantGatedEngagementIds, clientId, engagementId, deliverableDocumentIds, dateRange, dateField, limit: 25 })
                : Promise.resolve([]),
            looksLikeDocId
                ? SearchService.searchGlobalDocId({ firmId, userId, query: trimmedQuery, fullAccessEngagementIds, grantGatedEngagementIds, clientId, engagementId, deliverableDocumentIds, dateRange, dateField, limit: 10 })
                : Promise.resolve([]),
        ])

        // Merge: docId matches first (most specific/unambiguous), then vector, then filename/term
        // matches not already present, dedup by externalId.
        const byId = new Map<string, VectorSearchResult>(docIdResults.map(r => [r.externalId, { ...r, matchType: 'name' }]))
        for (const r of vectorResults) {
            if (!byId.has(r.externalId)) byId.set(r.externalId, { ...r, matchType: trimmedQuery ? 'semantic' : r.matchType })
        }
        for (const r of [...filenameResults, ...termResults]) {
            if (!byId.has(r.externalId)) byId.set(r.externalId, { ...r, matchType: 'name' })
        }
        const merged = Array.from(byId.values())

        // Same composite re-ranking as the existing project-scoped search route: recency boost +
        // match-type bonus, folders-first tiebreak, then relevance — not just insertion order.
        // softDateRange adds a bonus (never a penalty/exclusion) when a document's dueDate falls
        // inside an auto-detected-from-text date range, per the "soft, not hard filter" design.
        const now = Date.now()
        const DAY_MS = 24 * 60 * 60 * 1000
        const recencyBoost = (d: Date) => {
            const ageDays = (now - d.getTime()) / DAY_MS
            return Math.max(0, 1 / (1 + Math.log10(1 + ageDays)))
        }
        const matchTypeBonus = (r: VectorSearchResult) => (r.matchType === 'name' ? 0.05 : 0)
        const softDateBonus = (r: VectorSearchResult) => {
            if (!softDateRange || !r.dueDate) return 0
            const inRange = r.dueDate.getTime() >= softDateRange.start.getTime() && r.dueDate.getTime() <= softDateRange.end.getTime()
            return inRange ? 0.15 : 0
        }
        const compositeScore = (r: VectorSearchResult) => (r.score || 0) * 0.7 + recencyBoost(r.updatedAt) * 0.2 + matchTypeBonus(r) + softDateBonus(r)

        const docIdExternalIds = new Set(docIdResults.map(r => r.externalId))
        merged.sort((a, b) => {
            // An exact docId match is unambiguous by construction — always rank above
            // everything else, even folders-first and relevance.
            const docIdFirst = (r: VectorSearchResult) => (docIdExternalIds.has(r.externalId) ? 0 : 1)
            const docIdOrder = docIdFirst(a) - docIdFirst(b)
            if (docIdOrder !== 0) return docIdOrder

            const folderFirst = (r: VectorSearchResult) => (r.isFolder ? 0 : 1)
            const typeOrder = folderFirst(a) - folderFirst(b)
            if (typeOrder !== 0) return typeOrder
            return compositeScore(b) - compositeScore(a)
        })

        return merged.slice(0, limit)
    }

    private static async searchGlobalVector(params: {
        firmId: string
        userId: string
        semanticText: string
        fullAccessEngagementIds: string[]
        grantGatedEngagementIds: string[]
        clientId?: string
        engagementId?: string
        deliverableDocumentIds?: string[]
        dateRange?: { start: Date; end: Date }
        dateField: 'dueDate' | 'kickoffDate' | 'updatedAt'
        limit: number
    }): Promise<VectorSearchResult[]> {
        try {
            const embedding = await generateEmbedding(params.semanticText)
            const embeddingSql = `[${embedding.join(',')}]`

            const queryParams: any[] = []
            let paramIndex = 1
            const push = (value: any) => { queryParams.push(value); return `$${paramIndex++}` }

            const embeddingParam = push(embeddingSql)
            const firmIdParam = push(params.firmId)
            const scopeFilter = SearchService.buildGlobalScopeFilter({ ...params, push })
            const limitParam = push(params.limit)

            const results = await prisma.$queryRawUnsafe<any[]>(`
        SELECT
          d."externalId", d."fileName", d."updatedAt", d."metadata", d."isFolder",
          d."parentId", d."clientId", d."engagementId", d."dueDate", d."docId", d."createdBy", d."updatedBy",
          1 - (d.embedding <=> ${embeddingParam}::vector) as score
        FROM platform.engagement_documents d
        WHERE d."firmId" = ${firmIdParam}::uuid
          ${scopeFilter}
          AND (d.settings->>'locked') IS DISTINCT FROM 'private'
          AND (d.settings->'lock'->>'type') IS NULL
        ORDER BY d.embedding <=> ${embeddingParam}::vector
        LIMIT ${limitParam}
      `, ...queryParams)

            // Same minimum-relevance threshold as the existing project-scoped search route
            // (MIN_SEMANTIC_SCORE = 0.38 in app/api/projects/[projectId]/search/route.ts).
            const MIN_SEMANTIC_SCORE = 0.38
            return results
                .map(r => ({
                    externalId: r.externalId, fileName: r.fileName, updatedAt: new Date(r.updatedAt),
                    score: Number(r.score), metadata: r.metadata, isFolder: Boolean(r.isFolder),
                    parentId: r.parentId, clientId: r.clientId, engagementId: r.engagementId,
                    dueDate: r.dueDate ? new Date(r.dueDate) : null,
                    docId: r.docId, createdBy: r.createdBy, updatedBy: r.updatedBy,
                }))
                .filter(r => r.score >= MIN_SEMANTIC_SCORE)
        } catch (error) {
            logger.error('Global vector search failed:', error as Error)
            return []
        }
    }

    private static async searchGlobalFileName(params: {
        firmId: string
        userId: string
        query: string
        fullAccessEngagementIds: string[]
        grantGatedEngagementIds: string[]
        clientId?: string
        engagementId?: string
        deliverableDocumentIds?: string[]
        dateRange?: { start: Date; end: Date }
        dateField: 'dueDate' | 'kickoffDate' | 'updatedAt'
        limit: number
    }): Promise<VectorSearchResult[]> {
        try {
            const queryParams: any[] = []
            let paramIndex = 1
            const push = (value: any) => { queryParams.push(value); return `$${paramIndex++}` }

            const firmIdParam = push(params.firmId)
            const namePattern = push(`%${params.query}%`)
            const scopeFilter = SearchService.buildGlobalScopeFilter({ ...params, push })
            const limitParam = push(params.limit)

            const results = await prisma.$queryRawUnsafe<any[]>(`
        SELECT d."externalId", d."fileName", d."updatedAt", d."metadata", d."isFolder",
          d."parentId", d."clientId", d."engagementId", d."dueDate", d."docId", d."createdBy", d."updatedBy"
        FROM platform.engagement_documents d
        WHERE d."firmId" = ${firmIdParam}::uuid
          ${scopeFilter}
          AND d."fileName" ILIKE ${namePattern}
          AND (d.settings->>'locked') IS DISTINCT FROM 'private'
          AND (d.settings->'lock'->>'type') IS NULL
        ORDER BY d."updatedAt" DESC
        LIMIT ${limitParam}
      `, ...queryParams)

            return results.map(r => ({
                externalId: r.externalId, fileName: r.fileName, updatedAt: new Date(r.updatedAt),
                score: 0.92, metadata: r.metadata, isFolder: Boolean(r.isFolder),
                parentId: r.parentId, clientId: r.clientId, engagementId: r.engagementId,
                dueDate: r.dueDate ? new Date(r.dueDate) : null,
                docId: r.docId, createdBy: r.createdBy, updatedBy: r.updatedBy,
            }))
        } catch (error) {
            logger.error('Global filename search failed:', error as Error)
            return []
        }
    }

    /**
     * Exact/prefix match against docId (e.g. "NVQ-7") — a short human-readable identifier,
     * not previously searchable anywhere in the app. Matched as ILIKE prefix rather than full
     * substring so "NVQ-7" doesn't also match "NVQ-71", and treated as a high-confidence exact
     * signal (same 0.92 flat score convention as searchGlobalFileName) since a docId match is
     * unambiguous by construction, unlike a filename substring.
     */
    private static async searchGlobalDocId(params: {
        firmId: string
        userId: string
        query: string
        fullAccessEngagementIds: string[]
        grantGatedEngagementIds: string[]
        clientId?: string
        engagementId?: string
        deliverableDocumentIds?: string[]
        dateRange?: { start: Date; end: Date }
        dateField: 'dueDate' | 'kickoffDate' | 'updatedAt'
        limit: number
    }): Promise<VectorSearchResult[]> {
        try {
            const queryParams: any[] = []
            let paramIndex = 1
            const push = (value: any) => { queryParams.push(value); return `$${paramIndex++}` }

            const firmIdParam = push(params.firmId)
            const docIdPattern = push(`${params.query}%`)
            const scopeFilter = SearchService.buildGlobalScopeFilter({ ...params, push })
            const limitParam = push(params.limit)

            const results = await prisma.$queryRawUnsafe<any[]>(`
        SELECT d."externalId", d."fileName", d."updatedAt", d."metadata", d."isFolder",
          d."parentId", d."clientId", d."engagementId", d."dueDate", d."docId", d."createdBy", d."updatedBy"
        FROM platform.engagement_documents d
        WHERE d."firmId" = ${firmIdParam}::uuid
          ${scopeFilter}
          AND d."docId" ILIKE ${docIdPattern}
          AND (d.settings->>'locked') IS DISTINCT FROM 'private'
          AND (d.settings->'lock'->>'type') IS NULL
        ORDER BY d."updatedAt" DESC
        LIMIT ${limitParam}
      `, ...queryParams)

            return results.map(r => ({
                externalId: r.externalId, fileName: r.fileName, updatedAt: new Date(r.updatedAt),
                score: 0.92, metadata: r.metadata, isFolder: Boolean(r.isFolder),
                parentId: r.parentId, clientId: r.clientId, engagementId: r.engagementId,
                dueDate: r.dueDate ? new Date(r.dueDate) : null, docId: r.docId,
                createdBy: r.createdBy, updatedBy: r.updatedBy,
            }))
        } catch (error) {
            logger.error('Global docId search failed:', error as Error)
            return []
        }
    }

    private static async searchGlobalFileNameTerms(params: {
        firmId: string
        userId: string
        terms: string[]
        fullAccessEngagementIds: string[]
        grantGatedEngagementIds: string[]
        clientId?: string
        engagementId?: string
        deliverableDocumentIds?: string[]
        dateRange?: { start: Date; end: Date }
        dateField: 'dueDate' | 'kickoffDate' | 'updatedAt'
        limit: number
    }): Promise<VectorSearchResult[]> {
        if (params.terms.length === 0) return []
        try {
            const queryParams: any[] = []
            let paramIndex = 1
            const push = (value: any) => { queryParams.push(value); return `$${paramIndex++}` }

            const firmIdParam = push(params.firmId)
            const termParams = params.terms.map(t => push(`%${t}%`))
            const scopeFilter = SearchService.buildGlobalScopeFilter({ ...params, push })
            const limitParam = push(params.limit)

            const ilikeConditions = termParams.map(p => `d."fileName" ILIKE ${p}`)

            const results = await prisma.$queryRawUnsafe<any[]>(`
        SELECT d."externalId", d."fileName", d."updatedAt", d."metadata", d."isFolder",
          d."parentId", d."clientId", d."engagementId", d."dueDate", d."docId", d."createdBy", d."updatedBy"
        FROM platform.engagement_documents d
        WHERE d."firmId" = ${firmIdParam}::uuid
          ${scopeFilter}
          AND (${ilikeConditions.join(' OR ')})
          AND (d.settings->>'locked') IS DISTINCT FROM 'private'
          AND (d.settings->'lock'->>'type') IS NULL
        ORDER BY d."updatedAt" DESC
        LIMIT ${limitParam}
      `, ...queryParams)

            // Score by match strength, not a flat constant — a filename matching only one of several
            // query terms (e.g. an incidental word like "folder" in "find the Q3 GTM folder") is a much
            // weaker signal than one matching most/all terms, and should rank accordingly rather than
            // presenting with the same confidence as a strong multi-term match.
            const lowerTerms = params.terms.map(t => t.toLowerCase())
            return results.map(r => {
                const lowerName = (r.fileName as string).toLowerCase()
                const matchedCount = lowerTerms.filter(t => lowerName.includes(t)).length
                const matchFraction = matchedCount / lowerTerms.length
                return {
                    externalId: r.externalId, fileName: r.fileName, updatedAt: new Date(r.updatedAt),
                    score: 0.5 + matchFraction * 0.42, metadata: r.metadata, isFolder: Boolean(r.isFolder),
                    parentId: r.parentId, clientId: r.clientId, engagementId: r.engagementId,
                    dueDate: r.dueDate ? new Date(r.dueDate) : null,
                    docId: r.docId, createdBy: r.createdBy, updatedBy: r.updatedBy,
                }
            })
        } catch (error) {
            logger.error('Global filename-terms search failed:', error as Error)
            return []
        }
    }

    private static async searchGlobalStructuredOnly(params: {
        firmId: string
        userId: string
        fullAccessEngagementIds: string[]
        grantGatedEngagementIds: string[]
        clientId?: string
        engagementId?: string
        deliverableDocumentIds?: string[]
        dateRange?: { start: Date; end: Date }
        dateField: 'dueDate' | 'kickoffDate' | 'updatedAt'
        limit: number
    }): Promise<VectorSearchResult[]> {
        try {
            const queryParams: any[] = []
            let paramIndex = 1
            const push = (value: any) => { queryParams.push(value); return `$${paramIndex++}` }

            const firmIdParam = push(params.firmId)
            const scopeFilter = SearchService.buildGlobalScopeFilter({ ...params, push })
            const limitParam = push(params.limit)

            const results = await prisma.$queryRawUnsafe<any[]>(`
        SELECT d."externalId", d."fileName", d."updatedAt", d."metadata", d."isFolder", 0.5 as score,
          d."parentId", d."clientId", d."engagementId", d."dueDate", d."docId", d."createdBy", d."updatedBy"
        FROM platform.engagement_documents d
        WHERE d."firmId" = ${firmIdParam}::uuid
          ${scopeFilter}
          AND (d.settings->>'locked') IS DISTINCT FROM 'private'
          AND (d.settings->'lock'->>'type') IS NULL
        ORDER BY d."updatedAt" DESC
        LIMIT ${limitParam}
      `, ...queryParams)

            return results.map(r => ({
                externalId: r.externalId, fileName: r.fileName, updatedAt: new Date(r.updatedAt),
                score: Number(r.score), metadata: r.metadata, isFolder: Boolean(r.isFolder),
                parentId: r.parentId, clientId: r.clientId, engagementId: r.engagementId,
                dueDate: r.dueDate ? new Date(r.dueDate) : null,
                docId: r.docId, createdBy: r.createdBy, updatedBy: r.updatedBy,
            }))
        } catch (error) {
            logger.error('Global structured-only search failed:', error as Error)
            return []
        }
    }
}
