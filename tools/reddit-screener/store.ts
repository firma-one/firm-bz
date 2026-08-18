import { basePrisma } from '../../frontend/lib/prisma'
import { generateEmbedding, prepareTextForEmbedding } from '../../frontend/lib/embeddings'
import { logger } from '../../frontend/lib/logger'
import type { ScoredPost, DraftPair } from './types'

/**
 * Upsert a scored candidate (drafts still empty at this point — drafting
 * happens live in the skill conversation, not in this script).
 */
export async function upsertCandidate(post: ScoredPost): Promise<void> {
    let embedding: number[] | null = null
    try {
        const text = prepareTextForEmbedding(post.postTitle, post.postBody)
        embedding = await generateEmbedding(text)
    } catch (error) {
        logger.error('Embedding generation failed during upsert; storing without embedding', error as Error)
    }

    await basePrisma.redditScreenerPost.upsert({
        where: { redditId: post.redditId },
        create: {
            redditId: post.redditId,
            permalink: post.permalink,
            subreddit: post.subreddit,
            postTitle: post.postTitle,
            postBody: post.postBody,
            author: post.author,
            createdUtc: post.createdUtc,
            score: post.score,
            numComments: post.numComments,
            upvoteRatio: post.upvoteRatio,
            relevanceScore: post.breakdown.total,
            scoreReason: post.breakdown.reason,
            matchedKeywords: post.breakdown.matchedKeywords,
            softPromoAdvised: !post.breakdown.vendorHostile,
        },
        update: {
            score: post.score,
            numComments: post.numComments,
            upvoteRatio: post.upvoteRatio,
            relevanceScore: post.breakdown.total,
            scoreReason: post.breakdown.reason,
            matchedKeywords: post.breakdown.matchedKeywords,
            softPromoAdvised: !post.breakdown.vendorHostile,
        },
    })

    if (embedding) {
        const vectorLiteral = `[${embedding.join(',')}]`
        await basePrisma.$executeRawUnsafe(
            `UPDATE reddit_screener.posts SET post_embedding = $1::vector WHERE reddit_id = $2`,
            vectorLiteral,
            post.redditId
        )
    }
}

export async function logRun(summary: {
    postsFound: number
    postsNew: number
    topN: number
    notes?: string
}): Promise<void> {
    await basePrisma.redditScreenerRun.create({
        data: {
            finishedAt: new Date(),
            postsFound: summary.postsFound,
            postsNew: summary.postsNew,
            topN: summary.topN,
            notes: summary.notes,
        },
    })
}

/** Called by the skill after drafting Variation A/B live in-conversation. */
export async function saveDrafts(redditId: string, drafts: DraftPair): Promise<void> {
    await basePrisma.redditScreenerPost.update({
        where: { redditId },
        data: {
            draftHelpOnly: drafts.draftHelpOnly,
            draftSoftPromo: drafts.draftSoftPromo,
            softPromoAdvised: drafts.softPromoAdvised,
        },
    })
}

export async function markPosted(
    redditId: string,
    variation: 'A' | 'B',
    commentUrl: string
): Promise<void> {
    await basePrisma.redditScreenerPost.update({
        where: { redditId },
        data: {
            status: 'posted',
            postedVariation: variation,
            postedCommentUrl: commentUrl,
            postedAt: new Date(),
        },
    })
}

export async function recordOutcome(
    redditId: string,
    outcome: { upvotes?: number; replies?: number; notes?: string }
): Promise<void> {
    await basePrisma.redditScreenerPost.update({
        where: { redditId },
        data: {
            outcomeUpvotes: outcome.upvotes,
            outcomeReplies: outcome.replies,
            outcomeNotes: outcome.notes,
        },
    })
}

export async function getTopScoredCandidates(topN: number) {
    return basePrisma.redditScreenerPost.findMany({
        where: { status: 'drafted', draftHelpOnly: null },
        orderBy: { relevanceScore: 'desc' },
        take: topN,
    })
}

/** Past posted replies with recorded outcomes, used as few-shot voice examples. */
export async function getPastGoodDrafts(limit = 5) {
    return basePrisma.redditScreenerPost.findMany({
        where: { status: 'posted', outcomeUpvotes: { not: null } },
        orderBy: { outcomeUpvotes: 'desc' },
        take: limit,
    })
}
