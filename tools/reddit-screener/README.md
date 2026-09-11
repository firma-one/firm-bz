# Reddit Screener

> ⚠️ **Do not run a real (non-dry-run) discovery pass until you've read
> "Compliance status" below and resolved it.** Reddit's Data API Terms /
> Responsible Builder Policy require **explicit written approval from Reddit**
> for any commercial use of Reddit data, with no low-volume exception. This
> tool exists to generate leads for a commercial product (Firma), which is
> commercial use. Registering a "script" app at `/prefs/apps` and adding
> credentials to `.env` does **not** satisfy that approval requirement by
> itself.

Discover-and-draft Reddit prospecting tool for Firma. Finds Reddit threads
where the ICP (consultancies, agencies, fractional leaders) describes pain
around client delivery / file sharing / client portals, scores and ranks
them, dedupes against history, and drafts two reply variations per top
thread. **Never posts to Reddit** — a human reviews and posts manually.

This module holds only the mechanical, non-LLM steps (search, scoring,
dedupe, DB read/write). **Drafting the replies is not code here** — it's done
by Claude, live, when the `.claude/skills/reddit-screener/SKILL.md` skill
runs, following `.claude/skills/reddit-screener/references/voice-and-rules.md`.
See that skill file for the full workflow.

**Deliberately kept out of `frontend/lib/`.** This directory lives at the
repo root (`tools/reddit-screener/`) so it's clearly separate from the Firma
product application code — it doesn't ship with the app, isn't part of
`frontend`'s build/typecheck/lint, and has its own lean `tsconfig.json`. It
has no `node_modules` of its own: it imports `frontend/lib/prisma.ts` (for
`basePrisma`) and `frontend/lib/embeddings.ts` (for `generateEmbedding`) via
relative paths, and reuses the app's `reddit_screener` Prisma models/migration
rather than duplicating the schema. Because of that relative import, every
command below is run **from `frontend/`** so Node resolves `@prisma/client`
and other deps from `frontend/node_modules`.

## Env vars

Add to `frontend/.env` (see `env.example` at repo root for the template):

```
REDDIT_CLIENT_ID=<client id>
REDDIT_CLIENT_SECRET=<client secret>
REDDIT_USERNAME=<reddit username>
REDDIT_PASSWORD=<reddit password>
REDDIT_USER_AGENT=firma-reddit-screener/0.1 by u/<your-username>
```

### Getting a Reddit API key

There is no single "API key" to copy — you register an OAuth2 "script" app
under your own Reddit account and use its client id/secret.

1. **Log in as the account you'll use for outreach.** Use an aged account
   with real karma and post history, not a brand-new one — this affects
   posting risk later, not the read-only screener itself (see "Rate limits
   and ban risk" below).
2. Go to <https://www.reddit.com/prefs/apps>
3. Click **"create another app"** (bottom of the page).
4. Fill in the form:
   - **Type**: select **script** — this is the type for a personal/
     server-side tool acting as your own account (not a public web/installed
     app).
   - **Name**: anything descriptive, e.g. `firma-reddit-screener`.
   - **Redirect URI**: `http://localhost:8080` — required by the form but not
     actually used by a script app.
5. Click **"create app"**. You now have two values shown on the app tile:
   - **client ID** — the short string directly under the app's name.
   - **secret** — the longer string labeled "secret".
6. Map those into the env vars above:
   - `REDDIT_CLIENT_ID` = the client ID
   - `REDDIT_CLIENT_SECRET` = the secret
   - `REDDIT_USERNAME` / `REDDIT_PASSWORD` = the Reddit account you logged in
     as in step 1
   - `REDDIT_USER_AGENT` = a unique, descriptive string in the form
     `<app-name>/<version> by u/<your-username>`, e.g.
     `firma-reddit-screener/0.1 by u/yourusername`. Reddit throttles generic
     or empty user agents fastest, so don't skip this.

### Compliance status (read before running against real Reddit data)

Reddit's [Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy)
and Data API Terms set the actual rules here — not assumptions about volume.
Key points, quoting the policy:

- **Approval is required, unconditionally**: *"You must request access and
  get explicit approval before accessing any Reddit data through our API, and
  you must agree to comply with all applicable terms."*
- **Commercial use needs written approval, with no low-volume exception**:
  *"You must not sell, license, share, or otherwise commercialize Reddit data
  without express written approval... If you'd like to use Reddit data for
  commercial purposes, you'll need to get explicit written approval."* This
  screener exists to generate leads for Firma, a commercial product — that is
  commercial use of Reddit data, regardless of how few requests per day it
  makes. There is no "low volume, so it's fine" carve-out in the policy text.
  (An earlier version of this README claimed low-volume use "sits in a gray
  area" — that was wrong and has been corrected.)
- **App Transparency**: apps must register and get an "App profile label,"
  have a clearly specified purpose/scope, and must not be mixed-use accounts.
  It's not yet confirmed whether the legacy "script" app type at
  `/prefs/apps` (what this tool currently targets) satisfies this, or whether
  commercial tools now need to go through Reddit's newer Devvit / app
  registration flow — check before relying on a script-app registration
  alone.
- **What this tool already does right**: it is discover-and-draft only and
  never posts, comments, votes, or DMs automatically, which respects the
  policy's prohibition on "spamming activity through automated posts,
  comments, or direct messages" and on manipulating Reddit's features. It
  also does not attempt to infer sensitive characteristics about users or
  re-identify anyone, and `search.ts` backs off on HTTP 429s to respect rate
  limits.

**Bottom line**: before pointing this at real Reddit data for actual Firma
prospecting, get explicit written approval from Reddit for this commercial
use case (contact link is in the policy page above), and confirm the
`/prefs/apps` script-app registration is the right registration path for a
commercial tool under the current policy. Until then, treat live discovery
runs as unauthorized and stick to `--dry-run` against fixtures.

**Separately, on posting risk** (once/if approval is secured): the actual
ban/shadowban risk for the *account* lives entirely in the manual posting
step, not the read-only API calls — accounts get flagged for promotional
replies posted too often, across too many subs, from a low-karma account.
That's a distinct risk from the API-approval question above, and is exactly
why this tool only drafts; a human reviews, edits, and varies wording before
posting manually.

No separate `SCREENER_DATABASE_URL` is needed — it
reuses the app's existing `DATABASE_URL`/`DIRECT_URL`, scoped to the isolated
`reddit_screener` Postgres schema.

No LLM API key is needed — this module never calls a hosted LLM.

## How to run

All commands run from `frontend/` (so `npx tsx` resolves deps from
`frontend/node_modules`), pointing at scripts in `../tools/reddit-screener/`.

### Full discovery run (requires Reddit credentials + DB migration applied)

```bash
cd frontend
npx tsx ../tools/reddit-screener/run-discovery.ts --hours 48 --top 5
```

Searches Reddit for the configured keyword sets across the configured
subreddits (last 48h by default), dedupes against `reddit_screener.posts` (by
reddit id, then by pgvector cosine similarity > 0.9), scores every fresh
candidate 0-100, and upserts the top N into the DB with empty draft fields.
Prints a ranked summary as it runs.

Then either:
- Trigger the `reddit-screener` skill in a Claude Code / Claude session to
  have Claude draft Variation A/B for each candidate and write them back
  (`save-drafts.ts`), or
- Draft manually and call `save-drafts.ts` yourself (see below).

### Dry run (no Reddit credentials, no DB writes)

If you don't have Reddit API credentials yet, or just want to sanity-check
scoring/dedupe logic without touching Reddit or the database, use `--dry-run`
with a small fixtures file:

```bash
cat > /tmp/reddit-fixtures.ts << 'EOF'
import type { CandidatePost } from './types'

export const fixtures: CandidatePost[] = [
    {
        redditId: 't3_fixture1',
        permalink: 'https://reddit.com/r/webdesign/comments/fixture1',
        subreddit: 'webdesign',
        postTitle: 'How do you handle a branded client portal for deliverables?',
        postBody: 'Tired of emailing files back and forth, looking for one place for clients to see status.',
        author: 'fixture_user',
        createdUtc: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3h ago
        score: 12,
        numComments: 4,
        upvoteRatio: 0.9,
    },
    {
        redditId: 't3_fixture2',
        permalink: 'https://reddit.com/r/cybersecurity/comments/fixture2',
        subreddit: 'cybersecurity',
        postTitle: 'Orphaned Google Drive links to clients — how do you audit this?',
        postBody: 'Worried about who can see what months after a project ends.',
        author: 'fixture_user2',
        createdUtc: new Date(Date.now() - 20 * 60 * 60 * 1000), // 20h ago
        score: 40,
        numComments: 8,
        upvoteRatio: 0.95,
    },
]
EOF
```

Then, in a scratch script (or a Node REPL via `npx tsx`), import `runDiscovery`
directly and pass fixtures instead of going through the CLI parser, e.g.:

```ts
// /tmp/dry-run.ts
import { runDiscovery } from '/absolute/path/to/tools/reddit-screener/run-discovery'
import { fixtures } from '/tmp/reddit-fixtures'

runDiscovery({ hours: 48, topN: 5, dryRun: true, fixtures })
    .then((result) => {
        console.log(JSON.stringify(result, null, 2))
    })
    .catch(console.error)
```

```bash
cd frontend && npx tsx /tmp/dry-run.ts
```

(Run from `frontend/` so the relative imports inside `run-discovery.ts`
resolve `@prisma/client` etc. from `frontend/node_modules`.)

`--dry-run` (or `dryRun: true` when calling `runDiscovery` directly):
- Skips the Reddit API call entirely when fixtures are supplied.
- Skips DB dedupe/writes — only in-memory id filtering happens.
- Still runs the real scoring model, so you can hand-verify the score
  breakdown against `references/search-config.md`.
- Prints the same ranked report format as a real run.

This is also the fastest way to verify the hard constraint: **no ranking by
raw upvotes** — check that the `t3_fixture2` example (cybersecurity, higher
score/upvotes but marked vendor-hostile) doesn't automatically outrank a
fresher, more topically-relevant thread with fewer upvotes.

### Save drafts (after Claude drafts them via the skill, or manually)

```bash
npx tsx ../tools/reddit-screener/save-drafts.ts <reddit_id> '{"draftHelpOnly":"...","draftSoftPromo":"...","softPromoAdvised":true}'
```

### Mark posted (after you post a reply manually)

```bash
npx tsx ../tools/reddit-screener/mark-posted.ts <reddit_id> --variation A --url https://reddit.com/r/.../comment/...
```

### Record outcome (later, to teach future drafts)

```bash
npx tsx ../tools/reddit-screener/record-outcome.ts <reddit_id> --upvotes 5 --replies 2 --notes "got a DM asking about pricing"
```

## Database

Isolated `reddit_screener` Postgres schema (never touches `platform`/`system`
app tables). Models: `RedditScreenerPost` (→ `reddit_screener.posts`),
`RedditScreenerRun` (→ `reddit_screener.runs`) in
`frontend/prisma/schema.prisma`. Migration:
`frontend/prisma/migrations/20260817121827_add_reddit_screener/`. Apply it the
usual way (`npm run build`, per this repo's standing Prisma workflow) before
running a non-dry-run discovery pass.

## Scheduling (not built yet)

No cron/scheduled trigger exists yet. Since drafting must happen inside a
Claude session (there's no hosted LLM call to automate it headlessly), the
natural fit is a scheduled Claude Code routine that runs the
`reddit-screener` skill's workflow end-to-end, rather than a Vercel Cron
hitting an API route. Revisit once the manual flow has been used for a while.
