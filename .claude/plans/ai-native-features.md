# Plan: AI-Native Features for the Client Delivery OS

**Supersedes:** `.claude/plans/ai-insights-and-business-features.md` (Phases 2/3/4 of that plan move to HOLD — see §7).

**Status:** Phase A is the active work. Phases B+ are sketched, not committed.

---

## 0a. The assistant's name

The in-product assistant is **Brio**. The name is defined once in `frontend/lib/ai/assistant.ts`
(`ASSISTANT.name`) and imported wherever it is shown — never written inline in a component or a
prompt. It is still subject to trademark clearance, so a rename must stay a one-line change.

This applies to new AI surfaces too, including the Doc Search work in Phase A: user-facing strings
reference `ASSISTANT.name` rather than the literal "Brio" or a generic "AI".

## 0. Framing — what makes a feature AI-native here

The earlier plan used an LLM as a text formatter bolted onto deterministic logic: cron finds the rows, LLM writes a sentence about them. That is an LLM *feature*, not an AI-native one. The rule this plan holds to:

> A feature is AI-native if the model does something the product **cannot do without it** — interpret ambiguous human intent, or reason over unstructured content. Not if it rewords a number a SQL query already produced.

By that test the highest-value target in the product today is **Document Search**, because the one thing it cannot do is understand what the user meant.

---

## Phase A — Natural-Language Document Search

### A.1 The problem

Doc Search is a good semantic engine behind a filing-cabinet UI. To narrow a search the user operates a five-stage picker — Client → Engagement → Deliverable → Type → Time — via `@`/Tab, committing a `SelectedChip` per stage. It works, and it is entirely manual.

The user's actual intent arrives as a sentence: *"the Acme SOW from last spring"*, *"overdue spreadsheets on the Nexus rollout"*. Today they must decompose that sentence into chips themselves. The product makes the human do the parsing.

**Scope boundary (explicit):** this is *not* RAG. Retrieval stays as-is — one vector per document over `filename + snippet`. No chunking, no full-text indexing, no citations, no synthesized answers. The output remains a ranked list of documents with title + snippet. The only change is **how filters get chosen**, plus a snippet widening and a ranking improvement.

### A.2 Reopening the 2026-07-09 decision — decision record

NL→filter interpretation was evaluated and rejected twice, most recently 2026-07-09. That decision is hereby **superseded**, narrowly. The record:

| | Rejected approach (2026-07-09) | This approach |
|---|---|---|
| Mechanism | `chrono-node` + heuristic string parsing over raw prose | LLM resolving against the **actual access-scoped entity list** from `picker-data` |
| Grounding | None — "Acme" matched as a string anywhere | Candidate set is the user's real clients/engagements/deliverables; a name that isn't in the list cannot be resolved |
| Failure mode | Wrong hard filter applied **silently** → correct document invisible, no signal | Low confidence → **no filter**, falls back to today's plain semantic search |
| Visibility | Inferred filters indistinguishable from chosen ones | Every inferred filter renders as a normal removable chip, visually marked as inferred |
| Reversibility | User couldn't tell what went wrong | One click removes a chip and re-runs |

**Why the original rejection was correct and still is:** the named failures — bare years unrecognized, fiscal-quarter ambiguity, date words colliding with entity names (`global-search-view.tsx:118-126`) — are all failures of *ungrounded string parsing*. They are not arguments against inference; they are arguments against inference that (a) has no candidate list to check itself against and (b) hard-filters on a guess.

**The non-negotiable invariant this plan adopts:**

> Inference may only ever *reorder or narrow within what the user can already see*, and must degrade to today's behavior when unsure. An inferred filter must never be the reason a document the user was looking for is absent, without the user being able to see and undo it in one click.

Note the codebase already contains a weaker form of this idea: the API's `softDateRange` (`app/api/firms/[firmId]/search/route.ts:78-89`) applies a *ranking boost only*, never excluding. That instinct was right; it was attached to the wrong (chrono) mechanism. This plan generalizes it and grounds it properly.

### A.3 What exists that we build on

Almost everything. This is why Phase A is small.

| Asset | Location | Why it matters |
|---|---|---|
| `SelectedChip[]` state | `global-search-view.tsx:97-101` | Chips are already a structured array decoupled from the text. LLM output slots straight in — **no filter UI rewrite**. |
| `picker-data` route | `app/api/firms/[firmId]/search/picker-data/route.ts` | Already returns the access-scoped clients/engagements/deliverables. This *is* the grounding set, already permission-filtered. |
| Access scoping | `computeGlobalSearchAccessScope` | Security boundary is upstream of everything here and is not touched. |
| Soft-filter precedent | `search/route.ts:78-89` | Hard-vs-soft distinction already modeled and already returned to the UI (`dateRangeIsSoft`). |
| Deterministic time presets | `RELATIVE_TIME_PRESETS`, `resolveRelativeTimeRange` | The LLM resolves to a **named preset**, never to raw dates — reuses proven, deterministic date math. |
| Search history | `SearchHistoryEntry.chips` | Already persists query + chips. Free evaluation corpus for tuning. |

### A.4 Design — two modes, explicit invocation

Doc Search offers **two modes on one page**, switched by a toggle:

| Mode | Trigger | Cost | Behaviour |
|---|---|---|---|
| **Filters** (default) | as today — live, debounced | free | The existing five-stage chip picker. **Completely unchanged.** |
| **Ask** | user presses Enter / Send | 0.5 AI credits | Prose is interpreted into chips, then the same search runs. |

**Why two modes rather than layering inference onto the default path.** The 2026-07-09 rejection
(§A.2) was against inference being *imposed* on the search everyone uses. An opt-in mode does not
contradict that decision — the default path keeps its exact current behaviour, and a user who never
touches the toggle never sees a filter they did not choose.

**Why explicit send rather than keystroke-debounce.** Three reasons, in order of weight:

1. **Consent.** A filter the user asked for is not a surprise; a filter that appeared while they
   typed is. Most of the trust apparatus in §A.5 exists only because of that difference.
2. **Cost.** Debounced firing costs ~5 interpretation calls per search (a pause per few words).
   Explicit send costs exactly one — a 5× reduction, and the reason this is weighted at 0.5
   credits rather than fractionally hidden.
3. **Quality.** A half-typed sentence is a worse input than a finished one. Interpreting
   "the Acme SOW from last" produces a worse resolution than waiting for "…from last spring".

```
user types prose, presses Enter          ← explicit, once
   ↓
POST /api/firms/[firmId]/search/interpret     ← the only AI in the path; 0.5 credits
   input:  { text, candidates (from picker-data), existingChips }
   output: { chips: InferredChip[], residualText, confidence }
   ↓
inferred chips render in the SAME chip row the manual mode uses, marked as inferred
   ↓
GET /api/firms/[firmId]/search  ← UNCHANGED route, unchanged params
   ↓
ranked documents (title + snippet)  ← unchanged shape
```

**Resolution is constrained, not generative.** The model picks from an enumerated candidate list and returns ids, never free strings:

- `client` / `engagement` / `deliverable` → an `id` **that must exist in the supplied candidate list**. Server rejects any id not in the set (defense against hallucinated ids).
- `type` → one or more of the eight `FILE_TYPE_OPTIONS` literals.
- `dateRange` → one of the six `RELATIVE_TIME_PRESETS` literals. **Never a raw date.** This kills the fiscal-quarter/bare-year class of bug outright, because the model cannot express an arbitrary range.
- `residualText` → the part of the query that is genuinely about content, passed on as `q`.

Each inferred chip carries a `confidence`. Below threshold → dropped, not applied.

**Merge rule:** a chip the user set explicitly is never overridden or removed by inference. Inference only fills stages the user left empty.

**Inferred chips are real chips.** They render in the same row, with the same removal affordance
as manually-picked ones, distinguished only by an inferred marker. Removing one re-runs the search
immediately — and that re-run is **free**, because it reuses the already-resolved chips rather than
calling the model again. Only a new prose submission costs a credit.

**Credit behaviour.** An Ask search costs 0.5 credits, charged once on submission. When a group's
credits are exhausted the toggle is disabled with an explanatory message; **Filters mode continues
to work normally**, so search is never blocked — only the AI assistance is.

### A.5 Trust and reversibility

Opt-in mode plus explicit submission removes most of the original risk: a user in Ask mode asked
for interpretation and pressed Send, so an inferred filter is the requested behaviour rather than
a surprise. What remains guards against *misreading*, not against imposition.

1. **Every inferred chip is a visible chip.** Same component, same removal affordance as a
   manually-picked one, with an inferred marker so the two are never confused. The user can always
   see exactly what was applied.
2. **One-click undo, immediate re-run, no credit charged.** Removing an inferred chip re-runs the
   search with the remaining chips. No model call, so correcting a misread is free.
3. **Zero-result guard.** If an Ask search returns 0 results, automatically re-run without the
   inferred chips and label the fallback — *"No matches with the filters Brio inferred — showing
   broader results."* Interpretation can never produce a dead end.
4. **Failure falls back to Filters mode.** If the interpret call errors, times out, or AI is not
   configured, the query runs as a plain search with no filters. The user gets results, not an error.
5. **Filters mode is untouched.** It does not call the model, does not consume credits, and behaves
   exactly as it does today — including when credits are exhausted.

Dropped from the earlier draft: the *"search everything instead"* escape hatch, which existed to
undo inference the user never asked for. In an opt-in mode the toggle itself is that escape.

### A.6 Ranking improvement (non-AI, ships with A)

Two changes the user asked for, independent of the LLM:

- **Snippet 500 → 2000 chars.** `extractSnippet` (`lib/snippet.ts`) cap raised. Improves both what the user reads *and* what gets embedded, since `prepareTextForEmbedding` builds from the summary. **Requires a re-embed backfill** — a longer snippet changes the vector.
- **Better ranking.** Fuse the existing four branches (docId / vector / filename / terms) with explicit weights rather than merge-and-dedupe, and apply `softDateRange`-style boosts for inferred signals instead of hard cuts.

> **Open question for implementation:** widening the embedded text 4× may *dilute* the vector — a 2000-char average is less focused than a 500-char head. Worth A/B-ing embed-500/display-2000 against embed-2000/display-2000 before committing the backfill. Flag this rather than assume.

### A.7 Files

| File | Action |
|---|---|
| `frontend/lib/ai/client.ts` | Exists — Anthropic client, `server-only`. |
| `frontend/lib/ai/assistant.ts` | Exists — `ASSISTANT.name` ("Brio"). Use for every user-facing string. |
| `frontend/lib/ai/search-interpreter.ts` | New — `interpretSearchQuery({ text, candidates, existingChips })`; constrained schema output, validates every returned id against the candidate set. |
| `frontend/app/api/firms/[firmId]/search/interpret/route.ts` | New — auth via `requireFirmSearch`, candidates via `computeGlobalSearchAccessScope`. Never returns an entity outside the user's scope. |
| `frontend/components/search/global-search-view.tsx` | Modify — call interpret before search; merge chips; render inferred markers, escape hatch, zero-result guard. |
| `frontend/lib/snippet.ts` | Modify — snippet cap → 2000. |
| `frontend/lib/services/search-service.ts` | Modify — weighted rank fusion. |
| `frontend/app/api/firms/[firmId]/search/route.ts` | **Unchanged.** Interpretation happens before it; it keeps receiving structured filters. |

### A.8 Risks

| Risk | Mitigation |
|---|---|
| Latency on submit | One call on Enter, not per keystroke. Show a clear pending state; the user has explicitly asked and is expecting a moment's work. |
| Credit burn | Explicit send caps it at one call per search (5× lower than debounced firing). Cache by `(normalized text, candidate-set hash)` so an identical repeat search is free and uncharged. |
| Hallucinated entity id | Server validates every id against the candidate set; unknown ids dropped silently. |
| Misread producing a dead end | §A.5 items 1–3: chips are visible, removable, free to correct, and a 0-result search auto-broadens. **Treat as the release gate.** |
| Wrong-but-plausible resolution (two similarly-named clients) | Confidence threshold; inferred chip is visible and removable; ambiguity → resolve nothing. |
| Regression to the existing search | Filters mode shares no code path with interpretation and is not modified. Verify explicitly. |

### A.9 Verification

**Mode separation**
- Filters mode: no interpret call fires, no credits consumed, behaviour identical to today.
- Filters mode still works with credits exhausted.
- Ask mode with AI unconfigured → falls back to a plain search, no error surfaced.

**Interpretation**
- "Acme SOW from last spring" → client chip `Acme` + time chip, both marked inferred.
- Removing an inferred chip re-runs immediately and consumes **no** credit.
- Query naming a client the user **cannot access** → no client chip (the candidate set never contained it); no leak that it exists.
- Nonexistent client name → no chip, plain semantic search, no error.
- Two similarly-named clients → no confident resolution, no chip.
- Explicit user chip + contradicting prose → **user chip wins**.
- 0 results with inferred chips → auto-broadened results with the explanatory label.

**Credits**
- One Ask search deducts 0.5 credits; an identical repeat within the cache window deducts none.
- At zero credits the Ask toggle is disabled with an upgrade prompt; Filters mode unaffected.

---

## Phase B — Content-aware sensitivity detection *(sketch)*

Sensitive-file detection is a regex over **filenames only** (`projects/[projectId]/insights/route.ts:285-286`). A file named `notes-final.docx` containing bank details is invisible; `contract-template.docx` with nothing sensitive is flagged.

The `EngagementDocument.content` column already holds full extracted text **and is read by nothing**. Classifying over actual content is genuinely AI-native (judgment over unstructured text, no deterministic equivalent) and needs no new extraction. Deferred pending Phase A.

---

## Phase C — AI narrative brief *(carried over, unchanged in intent)*

Phase 1 of the superseded plan survives as legitimate: turning a 25-field `FirmInsightsResponse` into prose is real language work. Lower priority than A.

---

## Phase D — Conversational engagement Q&A *(sketch)*

Phase 5 of the superseded plan. The only genuinely agentic item there. Revisit after A and C.

---

## 7. HOLD — deprecated from the previous plan

Moved to HOLD as not AI-native by §0's test. Each uses the LLM as a cosmetic layer over deterministic logic:

- **HOLD — Auto-Reminder from Unanswered Threads.** Thread detection is SQL + date math. The LLM only maps text → `high|medium|low`. The reminder is worth building; it does not need an LLM. *Ship the rule, skip the AI.*
- **HOLD — Engagement Kickoff Checklist.** Generates a list from three strings. A per-contract-type template gets ~the same result, deterministically and free.
- **HOLD — Weekly Digest.** Same mechanism as Phase C on a cron. Fold into C rather than build separately.

Not abandoned — deliberately parked, with the reason recorded so this isn't relitigated from scratch.

---

## 7a. AI credits — metering and caps

**Model:** a prepaid monthly allowance per billing group that depletes. Not pay-per-use.

**Unit:** `1 credit = 1 AI action`. Derived from the standard anchoring rule ("one credit equals the
cheapest action you sell") applied to measured costs: the four actions span only **2.7×**
(search-interpret $0.0008 → chat $0.0022 on Haiku). Credit systems exist to tame 10–100× variance;
at 2.7× a token-conversion formula would add arithmetic users cannot reason about for variance that
does not exist. Weights stay legible instead:

| Action | Credits |
|---|---|
| Firm brief | 1 |
| Engagement summary | 1 |
| Chat answer | 1 |
| **Ask search (Phase A)** | **0.5** |

Search is weighted below 1 because interpretation is genuinely cheaper (0.37× a chat answer), and
because it is the highest-frequency action. It is not weighted lower than that: explicit send
already cut its volume 5× versus keystroke firing, so a smaller fraction would obscure real cost
rather than reflect it.

**Worst-case cost per credit: $0.0032.** A 500-credit allowance therefore caps AI COGS at ~$1.60 per
group per month — about 5% of a $29 plan. An active firm (daily briefs, 10 engagements, ~8 chat
questions each) uses roughly 130 credits, so 500 is ~4× realistic usage.

**Three phases, in order:**

1. **Measure.** A `PlatformAiUsage` ledger — one append-only row per call recording groupId, firmId,
   feature, model, input/output tokens, and userId. Written inside `lib/ai/client.ts` so every
   feature is instrumented by construction. **No enforcement.**
2. **Understand.** Run for several weeks. Look at real cost per group, feature mix, and the heaviest
   users before committing to a number.
3. **Cap.** `entitledAiCredits` in Polar product metadata → `parseEntitledAiCredits` →
   `AnchorCapsRow` → `assertWithinAiCreditCap()`, following the existing cap pattern exactly and
   gated behind `enforceBillingCaps()`.

**Why a separate ledger and not `Subscription.settings`:** `polar-webhook-sync.ts` writes
`settings: settingsPayload` as a **wholesale replacement**, so every webhook (renewal, plan change,
payment retry) would silently erase usage stored there. Beyond that, JSONB has no atomic increment
(concurrent calls lose writes), grows unboundedly in a row read on every billing check, and makes
the `GROUP BY` queries phase 2 depends on painful. Entitlement belongs on the subscription;
consumption belongs in its own ledger.

**Store tokens, not dollars.** Model pricing changes; a computed cost freezes yesterday's rates into
history. The ledger records token counts plus the model name, and cost is derived at read time.

**At exhaustion:** block new generation, keep everything already produced. Published summaries stay
visible, cached briefs stay readable, chat history remains. Only the Generate/Ask affordances
disable, with an upgrade prompt. Filters-mode search is unaffected.

---

## 8. Prerequisites

1. **Choose an LLM provider** — genuinely greenfield; no SDK, key, or `lib/ai/` exists.
2. **Structured output is mandatory** — the resolver must emit constrained schema output (enum/id selection), not free text. Whichever provider is chosen must support this well; it is the mechanism that makes A.4 safe.
3. **Feature-flag the whole path** — `NEXT_PUBLIC_AI_SEARCH=1`. Off = today's behavior exactly.
4. **Re-embed backfill job** — required if the snippet widening lands (A.6), pending the dilution A/B.

---

## 9. `docs/mvp/todo.md`

```markdown
## AI Features

- [ ] **Natural-Language Document Search** — [plan](.claude/plans/ai-native-features.md)
  - Prose replaces the manual 5-stage filter picker; LLM resolves against real access-scoped entities
  - Inferred filters render as removable chips; zero-result auto-broadening; full bypass on failure
  - Reopens the 2026-07-09 NL-search rejection with a decision record (§A.2)
  - Snippet 500→2000 chars + weighted rank fusion (non-AI, ships alongside)

- [ ] **Content-aware sensitivity detection** — classify over the unused `content` column, not filenames
- [ ] **AI narrative brief** — prose over FirmInsightsResponse
- [ ] **Conversational engagement Q&A** — read-only analyst panel

### On hold — not AI-native (see plan §7)
- [~] Auto-reminder urgency classification — build the rule without the LLM
- [~] Engagement kickoff checklist — templates suffice
- [~] Weekly digest — fold into the narrative brief
```
