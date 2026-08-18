# Reddit Prospecting Screener (DB-backed skill) — Build Plan

> **Note:** A separate, earlier design already exists at
> [`reddit-watcher-plan-v2.md`](reddit-watcher-plan-v2.md) — filesystem-based
> (`config/`/`data/watch/` JSON files, no DB/Prisma), CLI-driven via a
> `/watch` slash command. This plan is a **different design** worked out in a
> later session: DB-backed (Prisma/Postgres, reusing this repo's existing
> `reddit_screener`-schema approach and local embeddings), packaged as an
> installable Claude skill with thin supporting scripts. Both are kept as
> separate files intentionally — decide which design to actually build (or
> merge ideas from both) before implementation starts.

Referenced from [`docs/mvp/todo.md`](../../docs/mvp/todo.md) under a new
Reddit Prospecting Screener line — see that file for how this fits into the
overall MVP priority list.

## Context

Deepak wants a daily discover-and-draft Reddit prospecting tool for Firma
(firma.bz): find Reddit threads where the ICP (consultancies/agencies/
fractional leaders) describes client-delivery/file-sharing/client-portal pain,
score/rank them, dedupe against history, and draft two reply variations
(pure-help vs. help + soft product mention) per top thread — never posting
automatically. Source material (README, SKILL.md, search-config.md,
voice-and-rules.md, schema.sql) was supplied as a packaged skill to adapt into
this repo.

**Architecture correction from first pass:** this is a **Claude skill**, not an
app feature. The first draft of this plan mistakenly designed it as a Next.js
app module (Prisma-backed service, admin-scripts UI, and — critically — a
bolted-on hosted-LLM API call for the drafting step). That's wrong: when the
skill runs, drafting IS Claude reasoning live in the conversation per the
voice-and-rules instructions — no separate LLM integration is needed or
wanted. Confirmed with Deepak: build as **skill + thin supporting scripts**,
where only the mechanical, non-LLM steps (Reddit API search, deterministic
scoring, DB read/write) become code in `firm-bz`. Drafting stays pure
skill/prompt logic, never a script.

Also confirmed: reuse firm-bz's dev Postgres via Prisma for persistence
(dedupe history, drafts, outcomes) and the existing local embeddings function
— this avoids losing the codebase context already gathered, per Deepak's
concern about starting fresh.

## Key existing conventions to reuse (from exploration)

- App lives in `frontend/` (Next.js 16 App Router, TS, npm). Business logic in
  `frontend/lib/`.
- Prisma: `frontend/prisma/schema.prisma`, multiSchema preview feature with
  `platform` and `system` schemas today. **Add a third schema:
  `reddit_screener`** (mirrors the provided `schema.sql`'s isolated-schema
  design) — add it to the datasource `schemas` array.
- Prisma client singleton: `frontend/lib/prisma.ts` exports `prisma` (encrypted
  field wrapper) and `basePrisma` (raw, unwrapped). The screener writes no
  encrypted fields, so scripts use `basePrisma` directly (same reasoning as
  `frontend/lib/admin-scripts/encrypt-backfill.ts`).
- **Embeddings already exist**: `frontend/lib/embeddings.ts` —
  `generateEmbedding(text)` using local `Xenova/all-MiniLM-L6-v2` via
  `@xenova/transformers`, **384-dimensional**, no OpenAI/Anthropic call
  anywhere in this repo (confirmed by a second exploration pass — no hosted
  LLM integration exists at all today; all AI in this app is local
  Transformers.js). Reuse `generateEmbedding` verbatim for `post_embedding`.
  Update the provided `schema.sql`'s `vector(1536)` → `vector(384)`, and
  declare the Prisma column as unsized `Unsupported("vector")?` (matching how
  `EngagementDocument.embedding` is already declared — Prisma can't type
  `vector` natively).
- Cosine-distance query pattern: raw `$queryRaw` with `embedding <=> $1::vector`
  in `frontend/lib/services/search-service.ts` (~line 249, ~392–397, ~842–848).
  Mirror this for post-similarity dedupe/retrieval instead of inventing a new
  pattern.
- Skills: `.claude/skills/<name>/SKILL.md`. Only existing example
  (`fm-ship-dev-to-main`) has no `references/` subfolder, but the provided
  skill package explicitly separates `SKILL.md` from `search-config.md` /
  `voice-and-rules.md` / `schema.sql` for editability — keep that separation
  using a `references/` subfolder (a normal supported Claude skill layout,
  just not yet demonstrated in this repo).
- Env vars: root `env.example` / `env.production.example`, grouped under
  `# Comment` headers, one purpose-line per var. Add a `# Reddit Screener`
  section to both. **No LLM API key needed** (see architecture note above).

## What gets built

### 1. Prisma schema + migration
- New `reddit_screener` schema block in `schema.prisma`, added to datasource
  `schemas`.
- `RedditScreenerPost` model (→ `reddit_screener.posts`) and
  `RedditScreenerRun` model (→ `reddit_screener.runs`), fields per the
  provided `schema.sql`, with `embedding Unsupported("vector")?` and enums
  (`status`, `posted_variation`) scoped to the new schema.
- Generate the migration file via
  `npx prisma migrate dev --name add_reddit_screener --create-only` (per
  CLAUDE.md — never apply directly). Hand-adjust the generated SQL to add what
  Prisma won't generate itself: `create extension if not exists vector;`, the
  ivfflat index, and the `touch_updated_at` trigger, matching `schema.sql`.
- **Do not run the migration** — Deepak applies it via `npm run build`, per his
  standing workflow.

### 2. Thin supporting scripts (mechanical steps only — no drafting logic)
Location: `frontend/lib/reddit-screener/` (scripts, not a service layer the
app UI calls into — these are invoked by the skill, not by app routes).

- `types.ts` — shared types (`CandidatePost`, `ScoredPost`, `DraftPair`, etc.)
- `search.ts` — Reddit OAuth "script" app client: token fetch/refresh,
  subreddit + sitewide search across configured keyword sets, 429 backoff.
  Built to the real Reddit API shape; **not exercisable end-to-end without
  credentials** (none exist yet — stubbed/mocked for this session's
  verification).
- `search-config.ts` — target subreddits / keyword groups / scoring weights as
  typed data, mirroring `references/search-config.md` (kept in sync manually;
  the markdown stays the human-readable/tunable source of truth referenced by
  the skill, the `.ts` file is what the script imports).
- `score.ts` — pure function implementing the exact 0–100 blended model from
  `search-config.md` (topical/recency/comment-band/reach/penalties). No LLM
  involved, fully deterministic and testable.
- `dedupe.ts` — id-based dedupe against `reddit_screener.posts` (always on),
  plus pgvector cosine similarity dedupe (`> 0.9`) using `generateEmbedding` +
  the raw-SQL pattern from `search-service.ts`, skipping gracefully if
  embedding generation fails.
- `store.ts` — upsert into `reddit_screener.posts` via `basePrisma`, log runs
  into `reddit_screener.runs`. Also exposes `markPosted(...)` and
  `recordOutcome(...)` helpers.
- `run-discovery.ts` — a `tsx`-invoked script (following the
  `frontend/scripts/cleanup-org.ts` convention: plain script, imports the
  module, runs, exits) that does ONLY the non-LLM half of the pipeline: search
  → filter/dedupe → score → persist candidates with empty draft fields. This
  is what the skill shells out to.

**Explicitly NOT a script:** drafting (Variation A/B). That step has no file
in this module. The skill instructs Claude to read the top-N scored candidates
back out of the DB (or from `run-discovery.ts`'s output), draft both
variations live per `references/voice-and-rules.md`, and write them back via a
small `store.ts` helper (`saveDrafts(redditId, draftA, draftB, ...)`) — a
mechanical write, not a generation step.

### 3. Skill files
- `.claude/skills/reddit-screener/SKILL.md` — adapted from the provided
  SKILL.md. Workflow becomes:
  1. Run `npx tsx frontend/lib/reddit-screener/run-discovery.ts --hours 48 --top 5`
     → prints/returns scored, deduped candidates (drafts still empty).
  2. **Claude drafts** Variation A and B for each candidate in-conversation,
     following `references/voice-and-rules.md` verbatim (no em-dash, no
     bullets, never name Firma, product mention only in B, vendor-hostile subs
     → recommend A).
  3. Claude calls a small write-back script/helper to persist the drafts.
  4. Claude prints the ranked summary with both drafts labeled A/B for
     Deepak to review.
  Mark-posted / record-outcome become simple documented `tsx` invocations
  (`npx tsx frontend/lib/reddit-screener/mark-posted.ts <id> --variation A --url ...`)
  the skill or Deepak can run directly.
- `.claude/skills/reddit-screener/references/search-config.md`,
  `voice-and-rules.md` — copied in as-is.
- `.claude/skills/reddit-screener/references/schema.sql` — copied in, edited
  to `vector(384)`, kept as documentation (the generated Prisma migration is
  the actual source of truth for DDL, to avoid drift).

### 4. Env vars
Add to both `env.example` and `env.production.example` under a new
`# Reddit Screener` section: `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`,
`REDDIT_USERNAME`, `REDDIT_PASSWORD`, `REDDIT_USER_AGENT`. Reuse the existing
single `DATABASE_URL`/`DIRECT_URL` (scoped to the new `reddit_screener`
Postgres schema for isolation) — no new DB env var. No LLM API key.

### 5. Module README
`frontend/lib/reddit-screener/README.md` — env vars, how to trigger a run
(via the skill, or directly via `npx tsx run-discovery.ts` for testing), how
mark-posted/record-outcome work, and an explicit note that drafting is done by
Claude when the skill runs, not by any script in this module.

### 6. Scheduling
Documented only, not built: note in the README that a daily trigger could
later invoke the skill (e.g. via a scheduled Claude Code / cron routine that
runs the skill's workflow) rather than a Vercel Cron hitting an API route,
since drafting must happen inside a Claude session. No cron file created this
session.

## Verification (end of this build, once approved)

- `npx prisma migrate dev --name add_reddit_screener --create-only` generates
  the migration file (not applied).
- Deepak runs `npm run build` himself to apply it.
- Run `npx tsx frontend/lib/reddit-screener/run-discovery.ts --hours 48 --top 5 --dry-run`
  against **stubbed/mocked Reddit search results** (no live creds yet) —
  confirm scoring math matches `search-config.md` on a couple of hand-checked
  fixtures, dedupe skips a repeated fixture id, and a run row is logged to
  `reddit_screener.runs` with nothing written to `platform`/`system` tables.
- Then run through the skill's step 2–4 once live in a Claude Code session:
  confirm drafted replies obey every hard rule (no em-dash, no bullets/bold,
  never say "Firma"/link/"DM me", product mention only in B, vendor-hostile
  sub → A recommended), and that drafts persist correctly via the write-back
  helper.
- No commit/push — present the diff and proposed commit message per standing
  instructions, wait for explicit approval.
