import type { CandidatePost } from './types'
import { TARGET_SUBREDDITS, KEYWORD_GROUP_A, KEYWORD_GROUP_B } from './search-config'

const REDDIT_OAUTH_TOKEN_URL = 'https://www.reddit.com/api/v1/access_token'
const REDDIT_API_BASE = 'https://oauth.reddit.com'

interface RedditCredentials {
    clientId: string
    clientSecret: string
    username: string
    password: string
    userAgent: string
}

function loadCredentials(): RedditCredentials {
    const clientId = process.env.REDDIT_CLIENT_ID
    const clientSecret = process.env.REDDIT_CLIENT_SECRET
    const username = process.env.REDDIT_USERNAME
    const password = process.env.REDDIT_PASSWORD
    const userAgent = process.env.REDDIT_USER_AGENT

    if (!clientId || !clientSecret || !username || !password || !userAgent) {
        throw new Error(
            'Missing Reddit API credentials. Set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, ' +
                'REDDIT_USERNAME, REDDIT_PASSWORD, REDDIT_USER_AGENT (see .env.example). ' +
                'Use --dry-run with fixture data if you do not have credentials yet.'
        )
    }
    return { clientId, clientSecret, username, password, userAgent }
}

let cachedToken: { accessToken: string; expiresAt: number } | null = null

async function getAccessToken(creds: RedditCredentials): Promise<string> {
    if (cachedToken && cachedToken.expiresAt > Date.now()) {
        return cachedToken.accessToken
    }

    const basicAuth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')
    const body = new URLSearchParams({
        grant_type: 'password',
        username: creds.username,
        password: creds.password,
    })

    const res = await fetch(REDDIT_OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': creds.userAgent,
        },
        body: body.toString(),
    })

    if (!res.ok) {
        throw new Error(`Reddit OAuth token request failed: ${res.status} ${await res.text()}`)
    }

    const json = (await res.json()) as { access_token: string; expires_in: number }
    cachedToken = {
        accessToken: json.access_token,
        expiresAt: Date.now() + (json.expires_in - 60) * 1000,
    }
    return cachedToken.accessToken
}

async function redditGet(
    creds: RedditCredentials,
    path: string,
    params: Record<string, string>,
    retriesLeft = 3
): Promise<any> {
    const token = await getAccessToken(creds)
    const url = new URL(`${REDDIT_API_BASE}${path}`)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

    const res = await fetch(url.toString(), {
        headers: {
            Authorization: `Bearer ${token}`,
            'User-Agent': creds.userAgent,
        },
    })

    if (res.status === 429 && retriesLeft > 0) {
        const retryAfter = Number(res.headers.get('retry-after') ?? '2')
        await new Promise((r) => setTimeout(r, retryAfter * 1000))
        return redditGet(creds, path, params, retriesLeft - 1)
    }

    if (!res.ok) {
        throw new Error(`Reddit API request failed: ${res.status} ${await res.text()}`)
    }

    return res.json()
}

function toCandidatePost(child: any): CandidatePost {
    const d = child.data
    return {
        redditId: d.name,
        permalink: `https://www.reddit.com${d.permalink}`,
        subreddit: d.subreddit,
        postTitle: d.title,
        postBody: d.selftext || null,
        author: d.author || null,
        createdUtc: new Date(d.created_utc * 1000),
        score: typeof d.score === 'number' ? d.score : null,
        numComments: typeof d.num_comments === 'number' ? d.num_comments : null,
        upvoteRatio: typeof d.upvote_ratio === 'number' ? d.upvote_ratio : null,
    }
}

/**
 * Search Reddit for the configured keyword sets, across the configured
 * subreddits and sitewide, sorted by new. Requires REDDIT_* env vars.
 */
export async function discoverCandidatePosts(hoursWindow: number): Promise<CandidatePost[]> {
    const creds = loadCredentials()
    const allKeywords = [...KEYWORD_GROUP_A, ...KEYWORD_GROUP_B]
    const seen = new Map<string, CandidatePost>()
    const cutoff = Date.now() - hoursWindow * 60 * 60 * 1000

    const searchTargets = [null, ...TARGET_SUBREDDITS]

    for (const subreddit of searchTargets) {
        for (const keyword of allKeywords) {
            const path = subreddit ? `/r/${subreddit}/search` : '/search'
            const json = await redditGet(creds, path, {
                q: keyword,
                sort: 'new',
                t: 'week',
                restrict_sr: subreddit ? 'true' : 'false',
                limit: '25',
            })

            for (const child of json?.data?.children ?? []) {
                const post = toCandidatePost(child)
                if (post.createdUtc.getTime() < cutoff) continue
                if (!seen.has(post.redditId)) seen.set(post.redditId, post)
            }
        }
    }

    return Array.from(seen.values())
}
