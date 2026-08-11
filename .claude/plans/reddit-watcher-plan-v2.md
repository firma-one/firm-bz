# Reddit Watcher — Implementation Plan (v2)

**For:** Claude Code, working in the existing `firma-bz` repo
**Owner:** Deepak (solo founder)
**Scope:** 4-week trial. Build in the phase order given. Stop at the gate.

Suggested location in repo: `docs/reddit-watcher-plan.md`

---

## 0. Before you write any code

Investigate and report back. Do not edit anything until I approve.

- How is `/system` authenticated? Reuse it exactly; do not invent a second auth path.
- Next.js version, router type, route segment config conventions in use.
- Existing patterns for API routes and for shared UI components — follow them rather than introducing new styling.
- Node version; whether `tsx` is already a dev dependency.

Then propose the file layout and wait.

---

## 1. Context

I ran 8 structured conversations with fractional CMOs about how client delivery breaks down. I want to contribute usefully to Reddit threads describing that problem — as a short daily habit.

**Division of labour:** Claude Code does the fetching, filtering, judging and drafting. I approve a draft, edit it, post it myself, and tick it off. That is the entire manual surface.

**This tool never posts.** No authenticated Reddit access, ever.

---

## 2. Architecture

**Scans run from the CLI**, invoked through Claude Code. No job-trigger API routes, no status polling, no progress UI. The recon job makes hundreds of rate-limited requests over minutes and cannot live in a serverless function; the daily job runs when I sit down anyway.

**The UI is a working surface, not a control panel.** It exists so I can read drafts, edit them, copy, and mark them done — which is a browser job, not a terminal one.

Add a `.claude/commands/watch.md` slash command so I can type `/watch` in Claude Code to run the daily scan.

**Filesystem writes mean the interactive page is local-only** (`next dev`). That is expected and fine. The read-only history view still deploys so I can browse from my phone.

---

## 3. File layout

```
config/
  signals.json          # keyword tiers — I own this file
  subs.json             # subreddit list
  findings.md           # my 8 conversations, verbatim. The lane definition.

data/watch/
  seen.json             # { threadId: firstSeenISO } — dedupe
  threads.json          # append-only, every IN_LANE thread (daily + ranked)
  skipped.json          # append-only, every SKIP + reason
  engagement.json       # my decisions. Scripts NEVER write this.

recon/                  # phase 1 output, disposable
  report.md
  threads.json

lib/watch/
  reddit.ts             # fetch + rate limit
  filter.ts             # deterministic filtering, no AI
  judge.ts              # single Claude call per thread
  store.ts              # JSON read/write, append-only guarantees

scripts/
  reddit-recon.ts       # phase 1, one-off
  reddit-ranked.ts      # phase 2, one-off
  reddit-watch.ts       # phase 3, daily

app/system/watch/
  page.tsx              # digest + ranked tab + history + skipped tab

app/api/system/watch/
  engagement/route.ts   # the ONLY write route
```

---

## 4. Phase 1 — Recon (build first, run once)

Answers whether the daily channel exists before I invest in it.

**Fetch:** for each sub × keyword, `search.json?restrict_sr=1&sort=new&t=year&limit=100`. Separately paginate `/new.json` (~500 posts per sub) and match keywords locally — search and the new feed measure different things and I need both. Dedupe by thread id. Descriptive User-Agent. Sleep between requests; slow is fine.

**Output `recon/report.md`:**

1. **Tally** — hits per subreddit per keyword tier
2. **Age distribution** — hits in last 7d / 30d / 90d / 1y / older. **The decisive number.**
3. **Vocabulary** — every matched title grouped by keyword, plus the 50 most common bigrams and trigrams across matched titles and bodies that are *not* already in my keyword list. This is how I rewrite `signals.json` in real users' words instead of my guesses.
4. **Dead keywords** — which returned zero

No AI calls. Counting and string matching only.

### ⛔ Gate — report the number and wait

| Fresh hits, last 90 days, all subs | Action |
|---|---|
| 30+ | Build Phase 3 (daily) |
| 10–30 | Build Phase 2 only. Skip the daily loop. |
| Under 10 | Build Phase 2 only. The daily channel is an archive, not a conversation. |

Do not proceed past this on your own judgement.

**Phase 2 gets built regardless of the outcome** — it does not depend on fresh volume.

---

## 5. Phase 2 — Ranked pass (one-off, ~10–20 items total, ever)

Old threads that still rank and still get traffic from Google and Perplexity. The OP is gone; the page keeps being read. A comment here is content, not conversation.

**Fetch:** same subs × keywords, `sort=top&t=all`.

**Filter:** keep threads that are 6 months to 4 years old, have 20+ comments, and are **not archived or locked** — check both flags in the JSON and drop anything I cannot reply to. Most will be locked; this check is not optional.

**Judge:** same prompt as Phase 3, one change — the draft is a standalone top-level comment written to be useful to someone arriving from a search engine years later, not a reply to a live thread. 60–100 words.

**Output:** same schema as `threads.json`, flagged `mode: "ranked"`. Separate tab in the UI so it never pollutes the daily digest. It is a finite backlog, not a stream.

---

## 6. Phase 3 — Daily monitor

**Fetch:** `/r/{sub}/new.json`, last 72h only. Dedupe against `seen.json` *before* anything else — a thread already seen is never re-judged and never re-sent to Claude.

**Filter (no AI):** drop if older than 72h, more than 25 comments, deleted/removed, or a pure tool-recommendation request. Cap survivors at 40.

**Judge (one Claude call per survivor):** pass thread title, body, top 3 comments, and `config/findings.md`. Request JSON only:

```json
{
  "verdict": "IN_LANE" | "SKIP",
  "finding": "the specific finding that applies, with its count out of 8",
  "angle": "the non-obvious point the existing comments haven't made",
  "draft": "rough first-person fragments, 40-70 words",
  "avoid": "what would read as a pitch or oversell n=8"
}
```

**Judging rules:**

- Default is SKIP. Be strict.
- IN_LANE only if a specific finding or first-hand delivery-ops observation genuinely answers the question.
- Marketing strategy, pricing, positioning and client acquisition are **always SKIP**.

**Draft rules — these matter more than the content:**

- Fragments and short plain sentences. No transitions, no "Great question", no "In my experience".
- No em-dashes, no rule-of-three lists, no rhetorical questions.
- At most one number, carrying its own method: "8 fractional CMOs I spoke with". Never "our research shows". **Never a percentage on a base of 8.**
- Never mention firmä, never link, never end with a question or CTA.
- Deliberately unpolished. I am rewriting this, not posting it.

**Voice learning:** when drafting, also pass the last 10 entries marked `POSTED`, including my actual posted text. Instruction: *match the register and sentence length of my posted comments, not the previous drafts.* My rewrites are the signal.

---

## 7. UI — `/system/watch`

Three tabs: **Today**, **Ranked**, **History**. Plus a **Skipped** view.

Per row: title, link, subreddit, age, comment count, the applicable finding, the angle, and the avoid note.

**The draft is an editable textarea**, pre-filled with Claude's rough version. I edit in place.

**The copy button copies the current textarea contents, not the original draft.** This is the single most important detail in the UI — my edited text is what feeds `postedText`, and `postedText` is what teaches later drafts my voice. If the button copies the original, the voice-learning loop silently never engages and I will not notice for weeks.

**Mark Posted** saves my edited text plus the comment URL. Also **Skip** and **Snooze**.

**History** — paginated, filter by sub / status / date. Read-only. At ~5 entries/day this is ~150 rows after four weeks; static import is fine. If `threads.json` ever exceeds ~2MB, switch to `fs.readFile` from `process.cwd()`.

**Skipped tab** — for tuning `signals.json` against real misses.

**Empty state must be honest.** "No threads today" is a valid and expected result. Never pad the digest to five.

---

## 8. The only write route

```
POST /api/system/watch/engagement
Body: { threadId, status, postedText, commentUrl?, notes? }
```

Writes `data/watch/engagement.json`. Behind existing `/system` auth. Never touches `threads.json` or `skipped.json` — those are append-only and script-owned.

---

## 9. Data contracts

`threads.json` and `skipped.json` are **append-only**. Never rewrite history.

Each record carries `judgedWith` (hash of `findings.md` at judgement time) and `signalsVersion`. When I revise my findings the lane judgement changes, and I need to know which threads were judged under which version.

Keep observations (`threads.json`) separate from my decisions (`engagement.json`). Different lifecycles — I will rewrite the scoring without wanting to lose engagement history.

---

## 10. Guardrails

- **Never posts. Never comments. Never authenticates to Reddit.** Public JSON only.
- No headless browser, no scraping beyond public endpoints, no LinkedIn anything.
- Scripts never write `engagement.json`.
- `ANTHROPIC_API_KEY` from `.env.local`, gitignored.
- Log every SKIP with its reason — that file is tuning data, not exhaust.
- **Do not commit or push.** Show me diffs.

---

## 11. Do not build

Adding any of these is a failure of the plan:

- Prisma models, Supabase tables, or any DB
- Vercel Cron, GitHub Actions, or any scheduler
- Job-trigger API routes or progress polling
- Charts, analytics, or a metrics dashboard
- LinkedIn integration of any kind
- Auto-posting, scheduling, or approval workflows
- Multi-user anything

If the trial works, migrating JSON → Supabase is an afternoon. Doing it now is three weeks I don't have.

---

## 12. Acceptance criteria

- **Phase 1** — I run recon, read the age distribution, and know whether the daily channel exists.
- **Phase 2** — the Ranked tab has 10–20 replyable threads with drafts. I work through them across two sittings.
- **Phase 3** — `/watch` returns at most 5 items or an honest zero; I edit a draft, copy it, post it, mark it done, and see it in History.

**Success after four weeks is comments posted, not features shipped.** If that number is under 8, the constraint was never the tooling.

---

## Prerequisite I owe you

`config/findings.md` does not exist yet and nothing in Phase 2 or 3 works without it. Counts out of 8, no percentages, plus a "what surprised me" line. I write this before you build the judge.
