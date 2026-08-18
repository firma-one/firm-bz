import { markPosted } from './store'

function parseArgs() {
    const [redditId, ...rest] = process.argv.slice(2)
    const get = (flag: string) => {
        const idx = rest.indexOf(flag)
        return idx !== -1 ? rest[idx + 1] : undefined
    }
    const variation = get('--variation')
    const url = get('--url')

    if (!redditId || (variation !== 'A' && variation !== 'B') || !url) {
        console.log(
            'Usage: npx tsx lib/reddit-screener/mark-posted.ts <reddit_id> --variation A|B --url <comment_url>'
        )
        process.exit(1)
    }

    return { redditId, variation: variation as 'A' | 'B', url: url! }
}

const { redditId, variation, url } = parseArgs()

markPosted(redditId, variation, url)
    .then(() => console.log(`Marked ${redditId} as posted (variation ${variation}).`))
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
    .finally(() => process.exit(0))
