# Search config and scoring model

Human-readable/tunable reference. The runtime values live in
`tools/reddit-screener/search-config.ts` and must be kept in sync with
this file manually when you tune weights or lists here.

## Target subreddits (starter set)

Delivery/agency-side pain lives here. Adjust as you learn.

- r/webdesign
- r/web_design
- r/freelance
- r/graphic_design
- r/videography
- r/editors
- r/agency
- r/digital_agency
- r/marketing
- r/consulting
- r/Entrepreneur
- r/smallbusiness
- r/fractional (if active)
- r/msp (managed service providers, delivery-heavy)

Also run a Reddit-wide search (no subreddit restriction) for the strongest
keyword sets, then keep only hits whose subreddit is delivery/agency-relevant.

## Keyword sets

Group A — the core delivery-portal pain (highest weight):
- "client portal"
- "share deliverables with clients"
- "sending files to clients"
- "client file sharing"
- "one place for clients"
- "branded client portal"
- "project status for clients"
- "clients chasing updates" / "chasing clients for"

Group B — adjacent friction (medium weight):
- "Google Drive links to clients"
- "WeTransfer" + client
- "Dropbox" + client + deliverable
- "version control" + client + files
- "approval flow" + client
- "feedback on deliverables"
- "scattered across email and drive"

Group C — ICP signals (used to boost, not to match alone):
- "fractional CMO" / "fractional" + leader
- "consultancy" / "agency" / "studio"
- "freelance" + client delivery

A thread matching Group A is a strong candidate. Group B + a Group C signal is
also strong. Group B alone is weak; keep only if recency and comment band are
ideal.

## Time window

Default: last 48 hours. Widen to 7 days on quiet days if the top-N comes back
thin. Never draft on threads older than ~30 days (a fresh reply there is dead on
arrival).

## Scoring model (0-100). DO NOT rank on raw upvotes.

Blend these components:

1. Topical match (0-45)
   - Group A keyword in title: +30; in body only: +20
   - Group B keyword: +12
   - Group C ICP signal present: +8 (stackable once)
   Cap the topical component at 45.

2. Recency (0-25)
   - < 6h old: 25
   - 6-24h: 20
   - 24-48h: 14
   - 2-7 days: 7
   - > 7 days: 2

3. Visibility / comment band (0-20) — the "will my reply be seen" factor
   - 0 comments: 10 (seen, but no discussion momentum)
   - 1-15 comments: 20 (sweet spot: alive but not buried)
   - 16-30 comments: 10
   - 31-60 comments: 4
   - > 60 comments: 1 (your reply lands at the bottom, invisible)

4. Reach signal (0-10) — upvotes matter a LITTLE, for reach only
   - score >= 50: 10
   - score 10-49: 7
   - score 3-9: 4
   - score < 3: 2
   Note: this is intentionally the smallest component. A high score with 80
   comments is worse for outreach than a modest score with 5 comments.

5. Penalties
   - Sub known to be vendor-hostile (e.g. r/cybersecurity): -0 to score but
     FORCE recommend Variation A (pure help) and flag Variation B "not advised".
   - Obvious "I'm building X, thoughts?" self-promo threads by someone else:
     lower priority (they're a competitor fishing, not a prospect).
   - OP is clearly a vendor/tool, not a practitioner: skip.

Keep top N (default 5) by total score. Print the score breakdown so the operator
understands why each thread ranked.

## On Reddit's AI search (Reddit Answers)

Reddit Answers is UI-only, no API. The automated screener uses the standard
Reddit search API. If you want an occasional deeper semantic sweep, the skill
will print a natural-language query for you to paste into Reddit Answers in the
browser yourself, then paste candidate permalinks back for scoring. That path is
manual and optional; it is not part of the daily automated job.
