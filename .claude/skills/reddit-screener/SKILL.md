---
name: reddit-screener
description: >-
  Daily Reddit prospecting screener for Firma (firma.bz). Discovers recent
  Reddit threads where consultancies, agencies, freelancers, or fractional
  leaders describe pain around client delivery, file sharing, branded client
  portals, project status/dashboards, or scattered client communication.
  Scores and ranks candidate threads, dedupes against past engagements stored
  in the reddit_screener Postgres schema, and drafts TWO reply variations per
  top thread — a pure helpful comment, and a helpful comment with a soft "we
  built this internally, almost public" mention. Discover-and-draft only: it
  never posts. Trigger with "run the reddit screener", "find reddit threads
  for firma", "daily reddit prospecting", "screen reddit for client-delivery
  pain".
---

# Reddit Screener for Firma

## What this skill is for

Run a discover-and-draft pass over Reddit to find threads where the target ICP
is describing the exact pain Firma solves, then hand the operator a ranked
shortlist with ready-to-review reply drafts. **This skill never posts to
Reddit.** It writes candidates and drafts to the database and prints a
summary; a human reviews and posts manually.

## Firma context (the thing being promoted, honestly)

Firma (firma.bz) is a client-delivery workspace built for consultancies,
agencies, and fractional leaders who deliver documents/deliverables to
multiple clients. It merges, in the leanest possible package:

- **File sharing** for deliverables
- A **branded client portal** (client-facing space)
- A **project dashboard** where clients see where things stand
- **In-app messaging on the deliverable** so conversation lives next to the work

Key honest differentiator: Firma is **built on top of the client's own Google
Drive / OneDrive tenant**, so users keep the document editing, collaboration,
admin controls, logging, and revocation they already trust, instead of
becoming yet another custodial file store with a new credential and breach
surface.

**Claims discipline:** Do NOT claim security certifications, compliance
posture, DLP, or "enterprise-grade security". The ONLY security-adjacent claim
allowed is the architectural one: "it rides on the Drive/OneDrive tenant you
already govern rather than copying your files into another vendor's store."

Product status framing to use: **"built it internally for our own delivery,
almost ready for public use, been battle-testing it in-house."**

## Architecture

This skill is DB-backed against this repo's dev Postgres (Prisma, isolated
`reddit_screener` schema). The scripts live in the top-level **`tools/reddit-screener/`**
directory — deliberately kept out of `frontend/lib/` so this stays clearly
separate from product application code. It has no `node_modules` of its own;
it imports `frontend/lib/prisma.ts` (for `basePrisma`) and
`frontend/lib/embeddings.ts` (for `generateEmbedding`) via relative paths, and
every command below is run from `frontend/` so Node resolves `@prisma/client`
etc. from `frontend/node_modules`. Only the mechanical, non-LLM steps are code:

- `tools/reddit-screener/search.ts` — Reddit OAuth API discovery
- `tools/reddit-screener/score.ts` — deterministic 0-100 scoring
- `tools/reddit-screener/dedupe.ts` — id + pgvector similarity dedupe
- `tools/reddit-screener/store.ts` — DB read/write helpers
- `tools/reddit-screener/run-discovery.ts` — orchestrates the above

**Drafting is NOT a script.** When this skill runs, drafting the two reply
variations is done by you (Claude), live, in this conversation, following
`references/voice-and-rules.md` verbatim. There is no LLM API call anywhere in
this pipeline — the discovery/scoring/dedupe scripts are pure/deterministic,
and the generative step is you reasoning in the current session.

## Workflow

### 1. Run discovery

```bash
cd frontend && npx tsx ../tools/reddit-screener/run-discovery.ts --hours 48 --top 5
```

This searches Reddit (requires `REDDIT_*` env vars — see the module README),
dedupes against `reddit_screener.posts` (id + pgvector cosine similarity
`> 0.9`), scores every fresh candidate with the blended model in
`references/search-config.md`, and persists the top N to the DB with empty
draft fields. It prints a ranked summary as it goes.

If `REDDIT_*` credentials are not yet configured, run with `--dry-run` against
hand-written fixture data instead (see the module README's dry-run
instructions) — this exercises scoring/dedupe/report without hitting Reddit or
writing to the DB.

### 2. Draft two variations per top thread — YOU do this, not a script

For each of the top-N candidates just persisted (query
`getTopScoredCandidates` from `tools/reddit-screener/store.ts`, or use
the printed report), draft:

- **Variation A — pure help.** No product mention. Purely a useful, experienced
  answer to the OP's question.
- **Variation B — help + soft build mention.** Same helpful answer, plus a
  natural aside about building something internally that merges file sharing +
  branded portal + project dashboard + in-app messaging, riding on Drive/
  OneDrive, almost ready for public use.

Follow `references/voice-and-rules.md` **verbatim**: no em-dashes anywhere, no
bullets/headers/bold in the reply, never name Firma or firma.bz, never link,
never say "DM me", answer the OP's actual question first, product mention only
in Variation B, and the only security claim allowed is the Drive/OneDrive
architecture point. Vary sentence structure across threads in the same run so
nothing reads as copy-paste. For vendor-hostile subreddits (see
`breakdown.vendorHostile` on the scored post, e.g. r/cybersecurity) strongly
prefer Variation A and set `softPromoAdvised: false`.

Pull past `status='posted'` rows with good `outcome_upvotes` (via
`getPastGoodDrafts` in `store.ts`) as few-shot voice examples when available.

### 3. Persist the drafts

```bash
cd frontend && npx tsx ../tools/reddit-screener/save-drafts.ts <reddit_id> '{"draftHelpOnly":"...","draftSoftPromo":"...","softPromoAdvised":true}'
```

Run once per top candidate.

### 4. Report

Print a ranked summary to the operator: for each top thread, show subreddit,
title, permalink, score with the one-line reason, and BOTH draft variations
clearly labeled A and B. Remind the operator to review, tweak, and post
manually.

### 5. After the operator posts

```bash
cd frontend && npx tsx ../tools/reddit-screener/mark-posted.ts <reddit_id> --variation A --url <comment_url>
cd frontend && npx tsx ../tools/reddit-screener/record-outcome.ts <reddit_id> --upvotes 4 --replies 1
```

## Guardrails

- **Compliance gate — check this before running a real (non-dry-run)
  discovery pass.** Reddit's Data API Terms / Responsible Builder Policy
  require explicit written approval from Reddit for any commercial use of
  Reddit data, with no low-volume exception — see "Compliance status" in
  `tools/reddit-screener/README.md` for the exact policy language and current
  status. If that approval hasn't been confirmed as obtained, do not run
  `run-discovery.ts` without `--dry-run`; tell the operator why and stop.
- Never post, comment, vote, or DM on Reddit. Draft only.
- Never populate production application tables — `reddit_screener` schema on
  the dev/local DB only.
- Respect Reddit API rate limits and terms; the search client backs off on
  429s automatically.
- If a sub's rules clearly forbid self-promo, or `breakdown.vendorHostile` is
  true, mark Variation B `softPromoAdvised: false` and recommend Variation A.
- Keep all security claims to the Drive/OneDrive architecture point only.
