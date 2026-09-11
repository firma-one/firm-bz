export interface CandidatePost {
    redditId: string
    permalink: string
    subreddit: string
    postTitle: string
    postBody: string | null
    author: string | null
    createdUtc: Date
    score: number | null
    numComments: number | null
    upvoteRatio: number | null
}

export interface ScoreBreakdown {
    topical: number
    recency: number
    visibility: number
    reach: number
    total: number
    reason: string
    matchedKeywords: string[]
    vendorHostile: boolean
}

export interface ScoredPost extends CandidatePost {
    score: number | null
    breakdown: ScoreBreakdown
}

export interface DraftPair {
    draftHelpOnly: string
    draftSoftPromo: string
    softPromoAdvised: boolean
}
