import { basePrisma } from '../../frontend/lib/prisma'
import { generateEmbedding, prepareTextForEmbedding } from '../../frontend/lib/embeddings'
import { logger } from '../../frontend/lib/logger'
import type { CandidatePost } from './types'
import { SIMILARITY_DEDUPE_THRESHOLD } from './search-config'

/**
 * Drop candidates already stored by reddit id, then drop near-duplicates by
 * pgvector cosine similarity against past post_embedding values (best-effort
 * — if embedding generation fails, similarity dedupe is skipped and only
 * id-based dedupe applies).
 */
export async function dedupeCandidates(
    candidates: CandidatePost[]
): Promise<{ fresh: CandidatePost[]; skippedById: number; skippedBySimilarity: number }> {
    if (candidates.length === 0) {
        return { fresh: [], skippedById: 0, skippedBySimilarity: 0 }
    }

    const existingIds = await basePrisma.redditScreenerPost.findMany({
        where: { redditId: { in: candidates.map((c) => c.redditId) } },
        select: { redditId: true },
    })
    const existingIdSet = new Set(existingIds.map((r) => r.redditId))

    const afterIdDedupe = candidates.filter((c) => !existingIdSet.has(c.redditId))
    const skippedById = candidates.length - afterIdDedupe.length

    const fresh: CandidatePost[] = []
    let skippedBySimilarity = 0

    for (const candidate of afterIdDedupe) {
        const text = prepareTextForEmbedding(candidate.postTitle, candidate.postBody)
        let embedding: number[] | null = null
        try {
            embedding = await generateEmbedding(text)
        } catch (error) {
            logger.error('Embedding generation failed, skipping similarity dedupe for this post', error as Error)
        }

        if (!embedding) {
            fresh.push(candidate)
            continue
        }

        const vectorLiteral = `[${embedding.join(',')}]`
        const nearest = await basePrisma.$queryRawUnsafe<Array<{ similarity: number }>>(
            `SELECT 1 - (post_embedding <=> $1::vector) as similarity
             FROM reddit_screener.posts
             WHERE post_embedding IS NOT NULL
             ORDER BY post_embedding <=> $1::vector
             LIMIT 1`,
            vectorLiteral
        )

        if (nearest[0] && nearest[0].similarity > SIMILARITY_DEDUPE_THRESHOLD) {
            skippedBySimilarity++
            continue
        }

        fresh.push(candidate)
    }

    return { fresh, skippedById, skippedBySimilarity }
}
