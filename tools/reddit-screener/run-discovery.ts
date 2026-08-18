import { discoverCandidatePosts } from './search'
import { dedupeCandidates } from './dedupe'
import { scorePost } from './score'
import { upsertCandidate, logRun, getTopScoredCandidates } from './store'
import { DEFAULT_HOURS_WINDOW, DEFAULT_TOP_N, MAX_THREAD_AGE_DAYS } from './search-config'
import type { CandidatePost, ScoredPost } from './types'

interface RunOptions {
    hours: number
    topN: number
    dryRun: boolean
    fixtures?: CandidatePost[]
}

function parseArgs(): RunOptions {
    const args = process.argv.slice(2)
    const get = (flag: string, fallback: string) => {
        const idx = args.indexOf(flag)
        return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback
    }
    return {
        hours: Number(get('--hours', String(DEFAULT_HOURS_WINDOW))),
        topN: Number(get('--top', String(DEFAULT_TOP_N))),
        dryRun: args.includes('--dry-run'),
    }
}

export async function runDiscovery(options: RunOptions) {
    const maxAgeMs = MAX_THREAD_AGE_DAYS * 24 * 60 * 60 * 1000
    const now = new Date()

    const rawCandidates = options.fixtures ?? (await discoverCandidatePosts(options.hours))
    const withinAgeLimit = rawCandidates.filter(
        (c) => now.getTime() - c.createdUtc.getTime() <= maxAgeMs
    )

    const { fresh, skippedById, skippedBySimilarity } = options.dryRun
        ? { fresh: withinAgeLimit, skippedById: 0, skippedBySimilarity: 0 }
        : await dedupeCandidates(withinAgeLimit)

    const scored: ScoredPost[] = fresh
        .map((post) => ({ ...post, breakdown: scorePost(post, now) }))
        .sort((a, b) => b.breakdown.total - a.breakdown.total)

    const top = scored.slice(0, options.topN)

    if (!options.dryRun) {
        for (const post of top) {
            await upsertCandidate(post)
        }
        await logRun({
            postsFound: rawCandidates.length,
            postsNew: fresh.length,
            topN: options.topN,
            notes: `skippedById=${skippedById} skippedBySimilarity=${skippedBySimilarity}`,
        })
    }

    return {
        totalFound: rawCandidates.length,
        skippedById,
        skippedBySimilarity,
        top,
    }
}

function printReport(result: Awaited<ReturnType<typeof runDiscovery>>) {
    console.log(
        `\nFound ${result.totalFound} candidates. Skipped ${result.skippedById} (already seen), ` +
            `${result.skippedBySimilarity} (near-duplicate).\n`
    )
    console.log(`Top ${result.top.length} candidates:\n`)
    for (const post of result.top) {
        console.log(`[${post.breakdown.total}] r/${post.subreddit} — ${post.postTitle}`)
        console.log(`  ${post.permalink}`)
        console.log(`  ${post.breakdown.reason}`)
        console.log('')
    }
}

// Only run when invoked directly (npx tsx run-discovery.ts), not on import.
if (require.main === module) {
    const options = parseArgs()
    runDiscovery(options)
        .then(printReport)
        .catch((err) => {
            console.error(err)
            process.exit(1)
        })
        .finally(() => process.exit(0))
}

export { getTopScoredCandidates }
