import { prisma } from '../prisma'
import { generateEmbedding, prepareTextForEmbedding } from '../embeddings'
import { generateSummary } from '../summarization'
import { logger } from '../logger'
import { assignDocId } from '../doc-id'

export interface VectorSearchResult {
    externalId: string
    fileName: string
    score: number
    updatedAt: Date
    metadata?: any
    isFolder?: boolean
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

                const isSummarizable = [
                    'application/vnd.google-apps.document',
                    'text/plain', 'text/markdown', 'application/json'
                ].includes(meta.mimeType)

                if (isSummarizable && connectorId) {
                    const text = await googleDriveConnector.getFileText(connectorId, params.externalId)
                    if (text) {
                        summary = await generateSummary(text)
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
}
