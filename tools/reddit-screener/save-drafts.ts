import { saveDrafts } from './store'

// Invoked by the skill after Claude drafts Variation A/B in-conversation.
// Reads the draft pair as JSON from argv[3] to avoid shell-escaping issues
// with long multi-paragraph text.
function parseArgs() {
    const redditId = process.argv[2]
    const jsonPayload = process.argv[3]

    if (!redditId || !jsonPayload) {
        console.log(
            'Usage: npx tsx lib/reddit-screener/save-drafts.ts <reddit_id> \'{"draftHelpOnly":"...","draftSoftPromo":"...","softPromoAdvised":true}\''
        )
        process.exit(1)
    }

    const parsed = JSON.parse(jsonPayload)
    return { redditId, drafts: parsed }
}

const { redditId, drafts } = parseArgs()

saveDrafts(redditId, drafts)
    .then(() => console.log(`Saved drafts for ${redditId}.`))
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
    .finally(() => process.exit(0))
