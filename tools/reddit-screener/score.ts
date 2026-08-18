import type { CandidatePost, ScoreBreakdown } from './types'
import {
    KEYWORD_GROUP_A,
    KEYWORD_GROUP_B,
    KEYWORD_GROUP_C,
    VENDOR_HOSTILE_SUBREDDITS,
} from './search-config'

// Blended 0-100 model per references/search-config.md. Do NOT rank on raw
// upvotes — that's an explicit anti-pattern (old, crowded threads win on
// upvotes but a reply there is invisible).

function includesKeyword(haystack: string, keyword: string): boolean {
    return haystack.toLowerCase().includes(keyword.toLowerCase())
}

function scoreTopical(post: CandidatePost): { score: number; matched: string[] } {
    const title = post.postTitle || ''
    const body = post.postBody || ''
    const matched: string[] = []
    let score = 0

    for (const kw of KEYWORD_GROUP_A) {
        if (includesKeyword(title, kw)) {
            score += 30
            matched.push(kw)
        } else if (includesKeyword(body, kw)) {
            score += 20
            matched.push(kw)
        }
    }
    for (const kw of KEYWORD_GROUP_B) {
        if (includesKeyword(title, kw) || includesKeyword(body, kw)) {
            score += 12
            matched.push(kw)
        }
    }
    const icpMatched = KEYWORD_GROUP_C.some(
        (kw) => includesKeyword(title, kw) || includesKeyword(body, kw)
    )
    if (icpMatched) score += 8

    return { score: Math.min(score, 45), matched }
}

function scoreRecency(createdUtc: Date, now: Date): number {
    const hoursOld = (now.getTime() - createdUtc.getTime()) / (1000 * 60 * 60)
    if (hoursOld < 6) return 25
    if (hoursOld < 24) return 20
    if (hoursOld < 48) return 14
    if (hoursOld < 24 * 7) return 7
    return 2
}

function scoreVisibility(numComments: number | null): number {
    const n = numComments ?? 0
    if (n === 0) return 10
    if (n <= 15) return 20
    if (n <= 30) return 10
    if (n <= 60) return 4
    return 1
}

function scoreReach(score: number | null): number {
    const s = score ?? 0
    if (s >= 50) return 10
    if (s >= 10) return 7
    if (s >= 3) return 4
    return 2
}

export function scorePost(post: CandidatePost, now: Date): ScoreBreakdown {
    const topical = scoreTopical(post)
    const recency = scoreRecency(post.createdUtc, now)
    const visibility = scoreVisibility(post.numComments)
    const reach = scoreReach(post.score)
    const vendorHostile = VENDOR_HOSTILE_SUBREDDITS.includes(post.subreddit)

    const total = topical.score + recency + visibility + reach

    const reasonParts = [
        `topical ${topical.score}/45`,
        `recency ${recency}/25`,
        `visibility ${visibility}/20`,
        `reach ${reach}/10`,
    ]
    if (vendorHostile) reasonParts.push('vendor-hostile sub: Variation A only')

    return {
        topical: topical.score,
        recency,
        visibility,
        reach,
        total,
        reason: reasonParts.join(', '),
        matchedKeywords: topical.matched,
        vendorHostile,
    }
}
