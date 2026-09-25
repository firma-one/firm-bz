# Plan: AI-Native Features for the Client Delivery OS

**This is the single AI plan.** It absorbed `ai-insights-and-business-features.md` (the
Gemma/HuggingFace design) on 2026-09-25; everything still worth keeping from that file now lives
here, in §7 and §11. That file was deleted as redundant — see §11 to recover it from git if needed.

**Status (2026-09-25):** Phase A is **built and on `origin/dev`** (commit `c0a7898f`), except four
items tracked in §A.10. Phases C and D also shipped ahead of their sketches — see their sections.
Phase B remains unbuilt.

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
3. **Zero-result guard.** *(NOT BUILT — spec in §A.11.)* If an Ask search returns 0 results, relax
   the inferred filters **one at a time, in a fixed order**, and stop at the first step that
   returns something. Interpretation can never produce a dead end — but "broaden" must not become
   "show unrelated results". See §A.11 for the ladder and its stopping rules.
   Items 1, 2, 4 and 5 shipped; this one did not, so the release gate named in §A.8 is still open.
4. **Failure falls back to Filters mode.** If the interpret call errors, times out, or AI is not
   configured, the query runs as a plain search with no filters. The user gets results, not an error.
5. **Filters mode is untouched.** It does not call the model, does not consume credits, and behaves
   exactly as it does today — including when credits are exhausted.

Dropped from the earlier draft: the *"search everything instead"* escape hatch, which existed to
undo inference the user never asked for. In an opt-in mode the toggle itself is that escape.

### A.6 Ranking improvement (non-AI, ships with A) — NOT BUILT

Did not ship with A. `lib/snippet.ts` and `lib/services/search-service.ts` are both unmodified.
Two changes the user asked for, independent of the LLM:

- **Snippet 500 → 2000 chars.** `extractSnippet` (`lib/snippet.ts`) cap raised. Improves both what the user reads *and* what gets embedded, since `prepareTextForEmbedding` builds from the summary. **Requires a re-embed backfill** — a longer snippet changes the vector.
- **Better ranking.** Fuse the existing four branches (docId / vector / filename / terms) with explicit weights rather than merge-and-dedupe, and apply `softDateRange`-style boosts for inferred signals instead of hard cuts.

> **Open question for implementation:** widening the embedded text 4× may *dilute* the vector — a 2000-char average is less focused than a 500-char head. Worth A/B-ing embed-500/display-2000 against embed-2000/display-2000 before committing the backfill. Flag this rather than assume.

### A.7 Files

| File | Action |
|---|---|
| `frontend/lib/ai/client.ts` | Exists — Anthropic client, `server-only`. |
| `frontend/lib/ai/assistant.ts` | Exists — `ASSISTANT.name` ("Brio"). Use for every user-facing string. |
| `frontend/lib/ai/search-interpreter.ts` | **Done** — `interpretSearchQuery({ text, candidates, existingChips })`; constrained schema output, validates every returned id against the candidate set. |
| `frontend/app/api/firms/[firmId]/search/interpret/route.ts` | **Done** — auth via `requireFirmSearch`, candidates via `computeGlobalSearchAccessScope`. Never returns an entity outside the user's scope. |
| `frontend/components/search/global-search-view.tsx` | **Partly done** — interpret call, chip merge and inferred markers shipped; zero-result guard did not. |
| `frontend/lib/snippet.ts` | **Not started** — snippet cap → 2000. |
| `frontend/lib/services/search-service.ts` | **Not started** — weighted rank fusion. |
| `frontend/app/api/firms/[firmId]/search/route.ts` | **Unchanged, as planned.** Interpretation happens before it; it keeps receiving structured filters. |

### A.8 Risks

| Risk | Mitigation |
|---|---|
| Latency on submit | One call on Enter, not per keystroke. Show a clear pending state; the user has explicitly asked and is expecting a moment's work. |
| Credit burn | Explicit send caps it at one call per search (5× lower than debounced firing) — **shipped**. Cache by `(normalized text, candidate-set hash)` so an identical repeat search is free and uncharged — **NOT BUILT** (§A.10); an identical repeat Ask search re-bills today. |
| Hallucinated entity id | Server validates every id against the candidate set; unknown ids dropped silently. |
| Misread producing a dead end | §A.5 items 1–2 shipped (chips visible, removable, free to correct). The 0-result auto-broaden did **not** ship, so this release gate is **still open** — §A.10. |
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
- 0 results with inferred chips → auto-broadened results with the explanatory label. **(Cannot pass — guard not built, §A.10.)**

**Credits**
- One Ask search deducts 0.5 credits — **shipped**; an identical repeat within the cache window deducts none **(cannot pass — cache not built, §A.10)**.
- At zero credits the Ask toggle is disabled with an upgrade prompt; Filters mode unaffected.



### A.11 Zero-result recovery and ambiguity disclosure — spec

Written 2026-09-25 after working through the failure cases. Supersedes the one-line sketch that
previously stood in §A.5.3.

#### The problem with "drop the chips and re-run"

The obvious implementation is wrong. For *"Acme scope doc from last spring"* the interpreter returns
chips `client=Acme`, `time=last spring` and `residualText: "scope doc"`. Dropping all chips searches
for **"scope doc" across every client and all time** — every scope document in the firm, most of
them unrelated. That is not a broader version of the user's search; it is a different search.

Worse, for *"NaviQure deliverables from last month"* the **whole query becomes filters** and
`residualText` is empty (`search-interpreter.ts:52` states this contract). Dropping the chips leaves
no search terms at all, which matches everything.

#### The ladder

Relax one filter at a time and **stop at the first step that returns results**. No model call at any
step — the chips are already structured, this is local manipulation.

| Step | Relax | Why here |
|---|---|---|
| 1 | Date filter | The most common misread. "Last spring" is an interpretation; a resolved client rarely is. |
| 2 | Deliverable, then engagement | Narrowest scope filter first, preserving the client. |
| — | **Stop.** | Never relax the client chip. |

**Two hard rules:**

1. **Never drop the client chip.** It is the highest-confidence inference — resolved against a real,
   access-scoped entity list rather than guessed — and it is what keeps results relevant. Widening
   past it is exactly what produces the unrelated results this guard exists to prevent.
2. **Never search on empty `residualText`.** If relaxing a chip leaves no search terms, that is not
   a broader search, it is "list everything". Stop and report no matches.

#### Labelling

State what was relaxed and what still applies. Not *"showing broader results"*:

> **No Acme scope documents from last spring. Showing Acme scope documents from any date.**
> [Restore date filter]

#### Where it stops

If the ladder exhausts without results, **stop deliberately** — *"No matches for 'scope doc' in
Acme"* — with all chips still visible and removable. A clear dead end beats a page of irrelevant
results, and the user can widen manually in whatever direction they know is right.

#### No per-chip confidence exists

Checked 2026-09-25 before building: `InferredChip` is `{stage, id, name}` and nothing in
`search-interpreter.ts` returns a confidence, score or certainty. So the ladder's drop order is a
**design decision**, not a fallback for missing data — ordered by what is most often misread. If a
future model returns calibrated per-chip confidence (see §A.12), the order should become derived
rather than fixed, and this section should be revisited.

#### Period tokens must never resolve as entities

Found in testing 2026-09-25. `TIME_PRESETS` has nothing finer than `This Quarter`, so "from Q1" or
"from Q2" cannot become a date filter. The failure was that the model then matched the period token
against an **engagement name** instead: a firm with `Q2 Go-To-Market Positioning` had "playbooks
from Q2" silently become an engagement filter. That looks right when the engagement happens to be
named after the quarter, and is wrong the moment a second Q2-named engagement exists — the user
asked for a period and got a scope filter, hiding everything outside it.

This is the exact class §A.2 cited when recording why the 2026-07 chrono approach was rejected, so
it is guarded in two places, not one:

- The prompt states that a period with no matching preset is dropped entirely, never resolved as a
  name, with a worked example.
- `resolvedFromPeriodToken()` enforces it structurally: an engagement or deliverable whose match
  owes itself *solely* to a period token (`Q1-Q4`, `H1/H2`, `FY24`, a bare year) is dropped. A
  genuine reference still resolves — "DataSentry Q2 Go-To-Market playbooks" keeps the engagement,
  because the query names the rest of it too.

Same principle as validating ids against the candidate list: the prompt asks, the code enforces.

#### Date filters must not exclude un-dated documents

Found in testing 2026-09-25. "playbooks from Q3 2026" returned nothing, although every document
had been updated in Q3. Cause: `dateField` defaults to `dueDate` throughout the search service, and
**34 of 35 documents in the test corpus have no due date at all** — so a `dueDate` range excluded
essentially the whole corpus.

This is a semantics question, not a plumbing one. "From Q3" means *due in Q3, or created in Q3 if it
has no due date* — not *has a due date AND that date is in Q3*. A `dueDate` range falls back per row
to `createdAt` (`COALESCE`), which is NOT NULL so it always resolves.

**Why coalesce rather than one field.** A due date is a deliberate human statement about when a
deliverable belongs; `createdAt` is an incidental system timestamp that, for a bulk upload, records
when someone dragged a folder in. Where a person has said "due in Q4", honouring that beats
overriding it with an upload time. Two documents can therefore match the same quarter via different
fields — that is semantic, not arbitrary: both answer "which period does this belong to" from the
best evidence each has.

**Why `createdAt` and not `updatedAt` as the fallback.** `updatedAt` moves on any touch — a rename,
a status change, a re-index — so a Q1 document edited once in Q3 would vanish from "Q1" and appear
under "Q3", and the same query would return different results over time with no visible cause.
`createdAt` is stable. Recency ranking already uses `updatedAt` independently (`compositeScore`), so
filtering on `createdAt` costs nothing: recently-touched documents still rank higher within results.

The exception is **Overdue**, which keeps strict `dueDate` semantics: a document with no due date is
not overdue, and coalescing would make every un-dated document appear overdue. That is carried by an
explicit `strictDueDate` flag rather than inferred from `dateField`, since both cases send
`dueDate`.

Verified against the corpus: Q3 2026 → 34, Q2 2026 → 0, Overdue → 0.

#### Conflicts between a hand-picked chip and the typed sentence

Found in testing 2026-09-25. With `This Quarter` picked by hand, "show me DataSentry messaging
playbooks from Q2" resolved `Q2 2026` — and it was silently dropped. The precedence was right (a
chip set by hand is an instruction, not a guess, so prose never overrides it) but the user was told
nothing, and read the results as answering their sentence.

A second, worse bug sat underneath: `setInferredStages` marked every resolved stage inferred,
including ones whose chip the user had set. The zero-result ladder only relaxes *inferred* filters,
so it would have dropped the user's own hand-picked chip believing Brio had guessed it.

Now: only stages inference actually filled are marked inferred, and a conflict is disclosed with a
one-click switch — *"Using your This Quarter filter, not Q2 2026 from your question. [Use Q2 2026]"*.
Same principle as §A.11 throughout: **never block, always disclose.**

#### Ambiguity disclosure

Today two similarly-named clients means the interpreter resolves **nothing**: `SYSTEM` instructs
*"resolve nothing rather than guess"* (`search-interpreter.ts:47-48`) and the tool schema has no
field for a runner-up, so the ambiguity is discarded at the moment it is detected. The user is never
told a choice existed.

Fix: let the tool return the runner-up alongside the chosen entity, and disclose it **after** the
search, inline with results:

> Showing results for **Acme Corp**. Did you mean **Acme Industries**? [Switch]

No extra AI call — the model already knows both matched. Switching re-runs locally with the other id.

#### Why not ask before searching

Considered and rejected 2026-09-25. Cost is not the reason (a second interpret call is 0.5 credits,
still under a chat answer); **latency and friction** are. Search is a reflex — type, glance, click —
and a blocking question breaks it on the one interaction that most needs to be instant.

The deciding argument: **every chip is already visible and removable**. Asking "did you mean last
spring?" when a removable `last spring ×` chip is on screen asks a question the interface has
already answered, and correcting a chip is one click and free. Users who want a dialogue have the
chat panel, which is already conversational and where they have opted into a back-and-forth.

**Principle: never block, always disclose.** Run the search, relax deliberately, surface ambiguity
inline. Revisit only if real queries show a single pass genuinely cannot get there.

---

### A.12 Open evaluation — System One models for the interpret call

Raised 2026-09-25 after TypeSafe's Jev announcement. **Evaluation only — nothing is committed.**

The interpret call is the one AI surface here that is *not* generative: nobody reads its output, it
classifies a query and extracts entities to feed a search. That is precisely the shape these models
target ("classify, route, score, extract, or branch where hand-written logic is too brittle").

Two claims would matter if they hold:

- **Calibrated confidence per output.** This is the gap named above — the ladder's drop order and
  the ambiguity threshold are both hand-tuned because Haiku returns an id with no confidence
  attached. A calibrated score would make both derived. This is the claim worth testing first.
- **70–500ms latency**, against seconds for Haiku. This was a stated reason for rejecting
  conversational search; sub-second changes that calculation.

Cost is the least interesting difference but is stark ($0.042/MTok input, free output), and would
make §A.8's caching concern largely moot.

**Caveats.** Every figure above is the vendor's own comparison table, unverified on our data. It
fits *one* of four AI surfaces — brief, summary and chat are generative prose and explicitly not
what these models do. The grounding constraint is unchanged: whatever resolves the query still needs
the access-scoped candidate list. And none of the §A.10 work depends on the answer, since the ladder,
fusion and cache are all deterministic.

**Next step if pursued:** test the calibrated-confidence claim against real queries before
restructuring anything around it.

---

### A.10 What remains — Phase A is not closed

Four items from §A.4–A.8 did not ship with `c0a7898f`. Verified against the tree on 2026-09-25.

| # | Item | Where | Why it matters |
|---|---|---|---|
| ~~1~~ | ~~**Zero-result guard**~~ — **BUILT**, spec §A.11 | `components/search/global-search-view.tsx` | §A.8 names this *the release gate*. An over-constrained Ask search currently returns nothing with no automatic way back — exactly the dead end §A.5 was written to prevent. Self-contained; no backfill. |
| ~~2~~ | ~~**Interpret caching**~~ — **BUILT** | `lib/ai/interpret-cache.ts` | Keyed on `(normalized text, candidate-set hash)`. Without it an identical repeat Ask search costs another 0.5 credits. |
| 3 | **Snippet 500 → 2000** (§A.6) | `lib/snippet.ts` | Cannot ship alone — needs the re-embed backfill, and the dilution question in §A.6 is still unanswered. |
| ~~4~~ | ~~**Weighted rank fusion**~~ — **BUILT** | `lib/services/search-service.ts` | Independent of #3; the four branches still merge-and-dedupe. |

**Sequencing.** #1 and #2 are independent of everything else and should go first — #1 because it is
the stated release gate, #2 because it is a direct cost leak. #3 must not ship before the
embed-500/2000 A/B in §A.6 resolves and the re-embed backfill (§8.4) exists; widening the snippet
without the backfill leaves old and new documents embedded on different bases, which is worse than
not widening at all.

---

## Phase B — Content-aware sensitivity detection *(sketch, not built)*

Sensitive-file detection is a regex over **filenames only** (`projects/[projectId]/insights/route.ts:285-286`). A file named `notes-final.docx` containing bank details is invisible; `contract-template.docx` with nothing sensitive is flagged.

The `EngagementDocument.content` column already holds full extracted text **and is read by nothing**. Classifying over actual content is genuinely AI-native (judgment over unstructured text, no deterministic equivalent) and needs no new extraction. Deferred pending Phase A.

---

## Phase C — AI narrative brief — **BUILT** (`c0a7898f`, 2026-09-25)

Phase 1 of the superseded plan survives as legitimate: turning a 25-field `FirmInsightsResponse` into prose is real language work. Lower priority than A.

---

## Phase D — Conversational engagement Q&A — **BUILT** (`c0a7898f`, 2026-09-25)

Phase 5 of the superseded plan. The only genuinely agentic item there. Revisit after A and C.

---

## 7. HOLD — parked, with the build detail kept

Three features from the retired plan fail §0's test: each uses the LLM as a cosmetic layer over
deterministic logic. They are **parked, not abandoned** — the reason is recorded so this is not
relitigated from scratch, and the useful design detail is kept here so nothing has to be
rediscovered if they are picked up.

### 7.1 HOLD — Auto-reminder from unanswered threads

Thread detection is SQL plus date math; the LLM only maps text → `high|medium|low`. **The reminder
is worth building — it just does not need an LLM.** *Ship the rule, skip the AI.*

If built as a plain rule, most of the groundwork already exists:

- Detection logic **already lives in** `lib/insights/engagement-insights.ts` (~line 570, building
  `UnansweredThreadItem[]`). The retired plan proposed extracting it into
  `lib/insights/unanswered-threads.ts`; that extraction is no longer needed — the shared module
  exists and background callers can import from it directly.
- Trigger: Inngest cron `0 */4 * * *`; qualify a thread when the last message is from
  `eng_ext_collaborator` / `eng_viewer` and `lastMessageAt < now - 48h`.
- Urgency without a model: derive from age (48h → amber, 96h → orange, 7d → red). This is what the
  classifier was approximating anyway.
- Duplicate safety: store `{ source: 'ai_thread_alert', threadId, engagementId }` in the reminder's
  `metadata` and check for an existing row on `metadata->>'threadId'` before creating. Keep the
  `source` value even without AI so existing rows stay matchable.

### 7.2 HOLD — Engagement kickoff checklist

Generates a list from three strings (engagement name, contract type, client name). A per-contract-type
template gets approximately the same result, deterministically and for free. If revisited, write the
templates first and only reach for a model if they demonstrably fall short.

### 7.3 HOLD — Weekly digest

Same mechanism as Phase C on a cron. **Fold into C** rather than build separately: the firm brief
already produces this narrative, so a digest is a delivery channel (Monday 8am, per-firm timezone
from `firm.settings.timezone`, in-app notification) wrapped around an existing generator — not a new
AI feature.

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

1. ~~**Choose an LLM provider**~~ — **settled.** Anthropic (`claude-haiku-4-5-20251001`) via
   `lib/ai/client.ts`, `server-only`, key in `ANTHROPIC_API_KEY`. All AI calls are server-side.
2. ~~**Structured output is mandatory**~~ — **settled.** `lib/ai/search-interpreter.ts` uses
   constrained tool-use and validates every returned id against the candidate set; a date resolves
   only to a `RELATIVE_TIME_PRESETS` literal. This is the mechanism that makes §A.4 safe.
3. ~~**Feature-flag the whole path**~~ — **not needed as specified.** The opt-in Ask/Filters toggle
   is the flag: Filters mode shares no code path with interpretation, so "off" is a user choice
   rather than an env var. `NEXT_PUBLIC_AI_SEARCH` was never added.
4. **Re-embed backfill job** — **still outstanding.** Required before the snippet widening (§A.6)
   can land, and still pending the dilution A/B. The one open prerequisite.

---

---

## 9. `docs/mvp/todo.md`

The AI section of [`docs/mvp/todo.md`](../../docs/mvp/todo.md) was updated to match §10 on
2026-09-25. Keep the two in step: §10 is the detail, the todo entry is the pointer. Do not restate
the status in a third place.

---

## 10. Status board — the single source of truth

Everything AI, in one table. Verified against the tree on 2026-09-25.

| Feature | Status | Where |
|---|---|---|
| Firm brief | **Shipped** `c0a7898f` | `lib/ai/firm-brief.ts`; Analytics tab, 60-min read-triggered cache |
| Engagement summary | **Shipped** `c0a7898f` | `lib/ai/engagement-summary.ts`; six sections, streamed, human-approval gate |
| Engagement chat | **Shipped** `c0a7898f` | Read-only; excludes document content and comment bodies by design |
| Ask Brio (NL Doc Search) | **Shipped, tail open** | `lib/ai/search-interpreter.ts` + interpret route; see §A.10 |
| AI usage ledger | **Shipped, not enforced** | `platform_ai_usage`; §7a phase 1 of 3 done |
| Zero-result guard | **Built** — ladder + ambiguity disclosure | §A.11 |
| Interpret caching | **Built** | `lib/ai/interpret-cache.ts`; 15-min TTL, cache hits bill nothing |
| Snippet 500→2000 + backfill | **Open — blocked** | §A.10 #3; the only Phase A item left, needs the §A.6 A/B first |
| Weighted rank fusion | **Built** — branch-agreement bonus | `search-service.ts` |
| Credits enforcement | **Open — deliberate** | §7a phases 2–3; waiting on real usage data |
| Content-aware sensitivity | **Not started** | Phase B |
| Failure handling | **Shipped** `f0c65f3c` | All four surfaces; see §12 |
| Auto-reminder / checklist / digest | **HOLD** | §7 — parked as not AI-native |

**Nothing pending is a correctness risk.** The one that was — a mid-stream chat error closing the
response cleanly, so a truncated answer read as a complete one — was fixed in `f0c65f3c` (§12).
Everything left below is capability or cost, not wrong output.

**Recommended order.** §A.10 #1 and #2 first: both are self-contained, need no backfill, and #1 is
the gate this plan named. #4 next. #3 only after the §A.6 dilution A/B resolves and the re-embed
backfill exists — shipping it alone leaves old and new documents embedded on different bases, which
is worse than not widening at all. Credits enforcement stays parked until §7a phase 2 has data.

---

## 12. Failure handling — done `f0c65f3c` (2026-09-25)

Audited all four surfaces for unconfigured, runtime-error, stream-abort and timeout behaviour.
The graceful-degradation contract in `lib/ai/client.ts` (return null, never throw, so callers
render without the AI section) was sound but incompletely applied at the edges.

**Fixed:**

- `ai-chat/route.ts` swallowed mid-stream model errors and closed the controller normally. That
  route streams raw text with no envelope, so a clean close is byte-identical to a complete
  answer — a truncated answer about an engagement was presented as authoritative. Now
  `controller.error()`.
- Summary streams ending without a `done` event evaporated silently: `finally` clears the streamed
  text, so the draft the user had just watched appear vanished with no message. Discarding a
  partial summary stays deliberate; it is now explained.
- No AI fetch had a timeout. `lib/ai/fetch-timeout.ts` wraps all five call sites — interpret 15s,
  brief 45s, streams 120s — with a distinct `AiTimeoutError`.
- The chat panel unmounted itself after the first question on unconfigured deploys. Renders inert
  with an explanation instead.
- The firm brief swallowed refresh failures entirely. Now notes the failure and keeps the existing
  brief; initial load also checks `res.ok`.

**Verified already correct, no change needed:** every loading flag resets in a `finally` (no stuck
spinners on any surface); Ask Brio's fallback to plain search works on all three failure paths.

**Knowingly left:**

- The summary's "Write with Brio" button still renders on unconfigured deploys. It fails with a
  clear message; cosmetic only.
- `ai-brief/route.ts` and `ai-chat/route.ts` fan out to the insights route server-side with no
  timeout, so a slow insights route stalls an AI route before the model is called. Real, but it is
  an insights-route concern rather than an AI one.

---

## 11. Appendix — what the retired plan contributed

`ai-insights-and-business-features.md` was written against Gemma/Gemini running locally through
HuggingFace Transformers. Merged here and **deleted** on 2026-09-25 — it was fully redundant once
its content moved into §7 and this appendix. The full original text is in git history:

```
git show c9f7d505:.claude/plans/ai-insights-and-business-features.md
```

**Carried forward:** its Phase 1 (narrative brief) became Phase C and shipped. Its Phase 5
(conversational Q&A) became Phase D and shipped. Its Phases 2–4 are §7 above, with their
implementation detail preserved.

**Deliberately dropped:**

- *The Gemma/HuggingFace runtime and its API-key setup section.* Replaced by Anthropic Haiku through
  `lib/ai/client.ts` — see §8.1. A local-model section would now be actively misleading.
- *`lib/insights/unanswered-threads.ts` as a new extraction.* Superseded: that logic already lives in
  `lib/insights/engagement-insights.ts`.
- *`lib/inngest/ai-functions.ts` as a new file.* Never created; the three functions that would have
  populated it are all on HOLD. If one is revived, decide then whether it earns its own module or
  belongs in the existing `lib/inngest/functions.ts`.
- *Its per-phase day estimates.* They were written against a different runtime and a smaller
  codebase, and re-quoting them now would be false precision.
