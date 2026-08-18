import { recordOutcome } from './store'

function parseArgs() {
    const [redditId, ...rest] = process.argv.slice(2)
    const get = (flag: string) => {
        const idx = rest.indexOf(flag)
        return idx !== -1 ? rest[idx + 1] : undefined
    }

    if (!redditId) {
        console.log(
            'Usage: npx tsx lib/reddit-screener/record-outcome.ts <reddit_id> [--upvotes N] [--replies N] [--notes "..."]'
        )
        process.exit(1)
    }

    const upvotesRaw = get('--upvotes')
    const repliesRaw = get('--replies')

    return {
        redditId,
        upvotes: upvotesRaw ? Number(upvotesRaw) : undefined,
        replies: repliesRaw ? Number(repliesRaw) : undefined,
        notes: get('--notes'),
    }
}

const { redditId, upvotes, replies, notes } = parseArgs()

recordOutcome(redditId, { upvotes, replies, notes })
    .then(() => console.log(`Recorded outcome for ${redditId}.`))
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
    .finally(() => process.exit(0))
