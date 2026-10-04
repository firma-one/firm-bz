# Firma's AI Implementation, Read Through the CCAR-F Lens

**A study companion for the Claude Certified Architect – Foundations exam, using our own codebase as the worked example.**

Version 1.0 · 29 September 2026 · Maps to CCAR-F Exam Guide v1.0 (effective July 2026)

---

## How to use this document

The CCAR-F exam does not test whether you can recite definitions. It tests **practical judgment about architecture, configuration, and tradeoffs in production deployments** — the guide's own words. Every item is set inside a realistic scenario, and the wrong answers are usually things that would work in a demo and fail in production.

That is a useful frame for reading our own code, because Firma's AI layer was built under exactly those pressures: real billing, real client-facing output, real cost. This document walks the five exam domains and, for each task statement, points at the place in our codebase where we made that decision — or notes honestly where we did not, and why.

Two things to hold in mind while reading:

**We are an API consumer, not an agent builder.** The exam's centre of gravity is the Claude Agent SDK — coordinators, subagents, hooks, the Task tool. Firma uses the **Claude Messages API** directly. Roughly 45% of the exam blueprint (Domains 1 and 3) describes things we have deliberately not built. That gap is not a deficiency in the product; it is a scope decision. But it is a genuine gap in exam preparation, and Section 7 says what to do about it.

**Where we do overlap, we overlap closely.** Domains 4 and 5 — Prompt Engineering & Structured Output, Context Management & Reliability — total 35% of the exam, and our implementation makes almost every call the guide identifies as correct. Several of them we arrived at the hard way, by shipping the wrong thing first. Those are the most valuable sections to read.

---

## 1. The exam at a glance

| | |
|---|---|
| **Credential** | Claude Certified Architect – Foundations |
| **Code** | CCAR-F |
| **Items** | 60 (multiple-choice and multiple-response) |
| **Structure** | 4 scenarios drawn from a bank of 6 |
| **Time** | 120 minutes |
| **Passing score** | 720 scaled (range 100–1,000) |
| **Fee** | $125 USD |
| **Validity** | 12 months |
| **Reporting** | Pass/fail with scaled score, plus percent-correct by domain |

### Domain weights, and our coverage

| # | Domain | Weight | Firma coverage |
|---|---|---|---|
| 1 | Agentic Architecture & Orchestration | 27% | **Minimal** — no agentic loop, no subagents, no tool-calling loop |
| 2 | Tool Design & MCP Integration | 18% | **Partial** — one tool schema, no MCP server |
| 3 | Claude Code Configuration & Workflows | 20% | **Indirect** — we *use* this daily; it is not in the product |
| 4 | Prompt Engineering & Structured Output | 20% | **Strong** — the interpreter is close to a model answer |
| 5 | Context Management & Reliability | 15% | **Strong** — grounding, failure handling, human review |

The honest summary: we are well prepared for 35% of the exam, partially prepared for 38%, and under-prepared for 27%.

### The six exam scenarios

Each sitting draws four of these six. Note which ones our work actually resembles.

1. **Customer Support Resolution Agent** — Agent SDK, MCP tools, escalation. *Not our shape.*
2. **Code Generation with Claude Code** — slash commands, CLAUDE.md, plan mode. *Our daily practice, not our product.*
3. **Multi-Agent Research System** — coordinator + subagents, citation preservation. *Not our shape.*
4. **Developer Productivity with Claude** — built-in tools, codebase exploration. *Our daily practice.*
5. **Claude Code for CI/CD** — automated review, structured findings, false positives. *Adjacent to our eval tests.*
6. **Structured Data Extraction** — JSON schemas, validation, edge cases. **This is our search interpreter, almost exactly.**

Scenario 6 is where our experience transfers most directly. Scenario 5 is second. Scenarios 1 and 3 are where we would be reasoning from first principles rather than memory.

---

## 2. Vocabulary: what we call it, what the exam calls it

The exam uses a specific vocabulary, and items are written against it. We independently arrived at several of these concepts under our own names. Recognising the mapping is worth real marks, because an item may describe our exact design using words we have never written down.

| Exam term | What it means | Our name / location |
|---|---|---|
| **Agentic loop** | Send → inspect `stop_reason` → execute tool → return result → repeat | **Absent.** Every call is single-turn. |
| **`stop_reason`** | `"tool_use"` = keep looping; `"end_turn"` = stop | Never inspected — we have no loop to terminate |
| **Coordinator / subagent** | Hub-and-spoke delegation with isolated context | **Absent** in the product |
| **Hook (PreToolUse / PostToolUse)** | Deterministic interception of a tool call or result | Conceptually `getGuardedAnthropic()` — see §3.5 |
| **Programmatic enforcement vs prompt guidance** | Code-level gate vs asking the model nicely | Our central design principle — see §3.4 |
| **Tool use for structured output** | JSON schema via `tools` rather than parsing prose | `search-interpreter.ts`, the `apply_filters` tool |
| **`tool_choice: {type:"tool", name:...}`** | Force one specific tool | `tool_choice: { type: 'tool', name: 'apply_filters' }` |
| **Semantic vs syntax errors** | Schema-valid but wrong vs malformed JSON | Our id-validation pass — see §5.3 |
| **Grounding** | Answer only from supplied context | `CHAT_SYSTEM_PROMPT` rule 1 |
| **Context layer / case facts** | Persistent structured facts outside summarised history | `buildEngagementContext()` |
| **Human-in-the-loop** | Model drafts, human approves before it counts | `InsightsSummaryStatus`, the publish gate |
| **Confidence calibration** | Field-level confidence routing review attention | **Absent** — see §6.5, a real gap |
| **Provenance / claim-source mapping** | Preserving which source supports which claim | DOC-ID references in summaries — see §6.6 |
| **Explicit criteria over vague instruction** | "flag X when Y" beats "be accurate" | Throughout our prompts — see §5.1 |
| **Few-shot examples** | 2–4 worked cases showing ambiguous handling | **Thin** — one inline example, see §5.2 |
| **Message Batches API** | 50% cheaper, ≤24h, no latency SLA | **Not used** — see §5.5 |

---

## 3. Domain 1 — Agentic Architecture & Orchestration (27%)

**This is our weakest domain and the exam's heaviest.** Worth reading with the most care, precisely because the codebase will not teach it to you.

### What the domain is about

An agentic loop is a control-flow pattern: you send a request, inspect `stop_reason`, and if it is `"tool_use"` you execute the requested tool, append its result to the conversation history, and send again. You stop when `stop_reason` is `"end_turn"`. The model decides what to call next; you do not pre-program the sequence.

The guide is emphatic about the anti-patterns, and they are all "seems reasonable, fails in production":

- Parsing natural-language signals to decide when to stop ("if the reply contains 'done'")
- Using an iteration cap as the *primary* stopping mechanism
- Checking for assistant text content as a completion indicator

The correct answer is always: **inspect `stop_reason`.** An iteration cap is a safety net, not a control mechanism.

### Where Firma stands

We have no agentic loop. Every one of our four AI surfaces is a **single-turn completion**. The closest we come is [`search-interpreter.ts`](../../frontend/lib/ai/search-interpreter.ts), which uses tool calling — but for *structured output*, not for agency. We force one tool, read its arguments, and stop:

```ts
const call = message.content.find((b) => b.type === 'tool_use')
if (!call || call.type !== 'tool_use') return null
const args = call.input as Record<string, unknown>
```

There is no loop. `stop_reason` is never inspected. The tool result is never returned to the model. This is a legitimate and deliberate architecture for our use case — but it means **the exam's single heaviest domain is one our codebase cannot teach you.**

### 3.4 Multi-step workflows: enforcement vs guidance

*This is the one Domain 1 task statement where our code is genuinely exemplary.*

The guide states the principle directly:

> When deterministic compliance is required (e.g., identity verification before financial operations), prompt instructions alone have a non-zero failure rate.

The canonical exam example is blocking `process_refund` until `get_customer` has returned a verified customer ID — as *code*, not as an instruction in the system prompt.

We reached the same conclusion from a production incident. Metering was wired at three of four call sites and stayed broken for two days; the ledger captured roughly 11% of real usage. The fix was not "remember to meter" — it was making the model unreachable except through a gate. From [`guarded-client.ts`](../../frontend/lib/ai/guarded-client.ts):

```ts
export async function getGuardedAnthropic(scope: AiScope): Promise<Anthropic | null> {
    const client = getAnthropic()
    if (!client) return null
    await assertWithinAiCreditCap({ firmId: scope.firmId, groupId: scope.groupId, feature: scope.feature })
    return client
}
```

The comment in that file states the reasoning in exam language without having read the exam guide:

> Gating and metering are attached to the CLIENT rather than to each route, so a new AI surface gets both by asking for a client at all. [...] This matters because metering was wired at three of four call sites for two days and nobody noticed. Nothing enforced it. Now the only way to reach the model is through here.

**That is the Domain 1.4 answer.** Structural impossibility beats remembered discipline. If an exam item asks how to guarantee a business rule holds, the answer is never "add it to the system prompt."

### 3.5 Hooks — the shape without the mechanism

The guide describes two hook patterns: `PostToolUse` to normalise heterogeneous data before the model sees it, and outgoing interception to block policy violations (the canonical example: refunds over $500 redirected to human escalation).

We have no Agent SDK hooks. But `getGuardedAnthropic()` **is** a pre-call interception that blocks a policy violation before tokens are spent, and `buildEngagementContext()` **is** a normalisation layer that shapes heterogeneous data into one consistent format before the model processes it. Understanding our code gives you the *concepts*; it does not give you the *API surface*, and the exam tests the API surface.

One design note worth carrying into the exam. We considered a route-level decorator — the Next.js equivalent of Spring's `@RateLimited` — and rejected it for a specific reason, documented in the code:

> the billing scope is resolved inside each handler (`resolveProjectContext`), so a wrapper would have to repeat that lookup and would run the cap check before the permission check, which is the wrong order.

Ordering matters. An unauthorised request should be refused as unauthorised, not as over-budget. The exam rewards this kind of reasoning about *where* in the flow an enforcement point belongs.

### 3.1–3.3, 3.6, 3.7 — not covered by our work

Agentic loop lifecycle, coordinator-subagent orchestration, the `Task` tool and `allowedTools`, `AgentDefinition`, task decomposition strategy, session resumption and `fork_session`. **None of this exists in Firma.** These must be learned from the Agent SDK documentation and hands-on practice, not from our codebase.

---

## 4. Domain 2 — Tool Design & MCP Integration (18%)

### 4.1 Tool interface design

The guide's core claim: **tool descriptions are the primary mechanism the model uses for selection.** Minimal descriptions cause unreliable routing, and near-identical descriptions (`analyze_content` vs `analyze_document`) cause misrouting.

We have exactly one tool, so we have never faced a selection problem. But our schema shows the right instincts — every field carries a description that explains *when* it applies, not merely what type it is:

```ts
period: {
    type: 'string',
    description: 'a specific calendar period as "Q1 2026", "H2 2025" or "2024" (a quarter or half must include the year); use instead of dateRange when the query names a specific period',
},
```

Note "use instead of `dateRange` when…". That is a **boundary explanation** — precisely what the guide asks for to differentiate overlapping options. We wrote it because the model was conflating the two fields.

### 4.2 Structured error responses

The guide asks for `errorCategory` (transient / validation / permission / business), an `isRetryable` boolean, and human-readable descriptions — because uniform "Operation failed" responses prevent the agent from choosing a recovery strategy.

We have no MCP tools returning errors to an agent. But we apply the same taxonomy at the **HTTP** layer, and the reasoning in [`guarded-client.ts`](../../frontend/lib/ai/guarded-client.ts) is exactly the guide's:

```ts
export function aiLimitResponse(error: unknown): Response | null {
    if (!(error instanceof AiCreditLimitError)) return null
    return Response.json(
        { error: error.message, kind: error.kind, limit: error.limit, used: error.used },
        { status: 429 },
    )
}
```

> 429 rather than 402: the period limit resets on its own and a burst breach clears in hours, so both are "too many requests" rather than "payment required". `kind` lets the client tell an upgrade prompt from a transient wait.

`kind: 'period' | 'burst'` is an `errorCategory`. Choosing 429 over 402 is a retryability signal. Different remediation for each is the whole point. The concepts transfer cleanly; only the transport differs.

There is a second Domain 2.2 idea we implement well — **distinguishing an access failure from a valid empty result.** A search returning nothing because the filters were too narrow is a *success* with no matches, not an error. Our zero-result handling treats it as such and explains which filter excluded everything, rather than reporting a failure.

### 4.3 Tool distribution and `tool_choice`

The guide's numbers are worth memorising: giving an agent 18 tools instead of 4–5 measurably degrades selection reliability.

The three `tool_choice` modes:
- `"auto"` — the model may return text instead of calling a tool
- `"any"` — it must call a tool, but chooses which
- `{"type": "tool", "name": "..."}` — it must call this specific tool

We use forced selection, and for the textbook reason — we need structured output unconditionally, and cannot accept prose:

```ts
tool_choice: { type: 'tool', name: 'apply_filters' },
```

With one tool, `"any"` would be equivalent. Forced selection is the more explicit statement of intent and survives a second tool being added later.

### 4.4 MCP server integration

Project-scoped `.mcp.json` versus user-scoped `~/.claude.json`; `${GITHUB_TOKEN}` environment expansion so credentials never get committed; MCP *resources* as content catalogs that reduce exploratory tool calls.

**Firma exposes no MCP server.** We consume several in development. The scoping distinction — shared team tooling in the project file, personal experiments in the user file — has a direct analogue in our CLAUDE.md practice (§5 below), but the MCP specifics need separate study.

Worth flagging as a product opportunity rather than an exam note: an MCP server exposing engagement state as *resources* would let a firm's own Claude Code query delivery status without us building a chat UI for it. Not planned; worth recording.

### 4.5 Built-in tools

Grep for content, Glob for paths, Read/Write for whole files, Edit for targeted changes with unique anchors — and Read + Write as the fallback when Edit cannot find a unique match.

This is daily practice for us rather than product code. The guide's incremental-exploration advice ("start with Grep to find entry points, then Read to follow imports, rather than reading all files upfront") is exactly how this document was researched.

---

## 5. Domain 4 — Prompt Engineering & Structured Output (20%)

**Our strongest domain.** If the exam draws Scenario 6, our codebase is close to a model answer.

### 5.1 Explicit criteria over vague instruction

The guide's framing:

> The importance of explicit criteria over vague instructions (e.g., "flag comments only when claimed behavior contradicts actual code behavior" vs "check that comments are accurate")

and, critically:

> How general instructions like "be conservative" or "only report high-confidence findings" fail to improve precision compared to specific categorical criteria.

That second point is the one that shows up as a distractor. "Tell the model to be more careful" is always the wrong answer.

Our prompts follow the rule. From [`engagement-summary.ts`](../../frontend/lib/ai/engagement-summary.ts), the Collaboration section:

```
- Collaboration: how the two sides are communicating. Give the overall counts, then NAME only the
  threads that need something — those awaiting a reply from the firm, or marked urgent. [...]
  Do NOT list threads that are answered and unflagged; the counts already cover them.
```

"NAME only the threads that need something" and "do NOT list threads that are answered and unflagged" are categorical criteria with a decidable test. Compare with what we did *not* write: "mention the important threads."

The Risks section adds a boundary that is about product design, not accuracy:

```
- Risks: only risks visible in the data [...] State the risk. Do NOT propose how to address it.
```

That constraint exists because proposing a remedy commits the firm to a course of action — a judgment reserved for an accountable human. Which leads directly to the human-in-the-loop design in §6.5.

### 5.2 Few-shot prompting — our clearest gap in a strong domain

The guide is unambiguous that few-shot examples are **the most effective technique** for consistent formatting and for teaching ambiguous-case handling, recommending 2–4 targeted examples that show *why* one action was chosen over a plausible alternative.

We have essentially one, inline in the interpreter's rules:

```
- NEVER resolve a period as an entity. "Q1", "Q2", "H2", "2024" are periods, not names. [...]
  Example: "DataSentry playbooks from Q2" with an engagement named "Q2 Go-To-Market Positioning"
  -> client DataSentry, period "Q2 <current year>", NO engagement.
```

That single example is well-chosen — it is drawn from a real failure, and it shows the discrimination rather than merely asserting it. But one example is not few-shot prompting, and this prompt is the place in our codebase where more would most likely pay off. We compensated with a *code-level* guard instead (§5.3), which is arguably more robust — but the exam would expect both.

**Exam note:** when an item offers "add few-shot examples" against "add more detailed prose instructions," few-shot wins. When it offers few-shot against a deterministic code check for a rule that must never break, the code check wins. Know which kind of guarantee is being asked for.

### 5.3 Structured output via tool use — and its limits

The guide's key insight, and a frequent exam trap:

> That strict JSON schemas via tool use eliminate syntax errors but do **not** prevent semantic errors (e.g., line items that don't sum to total, values in wrong fields).

A schema guarantees a well-formed `clientId` string. It does not guarantee the id refers to anything real.

We learned this and handle it explicitly. Every id the model returns is validated against the candidate list it was given:

```ts
const byId = (list: PickerEntity[], id: unknown) =>
    typeof id === 'string' ? list.find((e) => e.id === id) ?? null : null
```

> Each id must exist in the candidate list the model was given; anything else is dropped.

That is **hallucination containment at the boundary** — the schema handles syntax, our code handles semantics. It is the correct division of responsibility and a direct answer to a Domain 4.3 item.

The second semantic guard is subtler and worth studying, because it catches an error the schema cannot even see. `resolvedFromPeriodToken()` detects the case where a *valid* engagement id was chosen for an invalid *reason* — the query said "from Q2", and the firm happens to have an engagement named "Q2 Go-To-Market Positioning":

```ts
function resolvedFromPeriodToken(entityName: string, queryText: string): boolean {
    const queryPeriods = queryText.match(new RegExp(PERIOD_TOKEN, 'gi'))
    if (!queryPeriods) return false
    // ... strip the period token from the name; if nothing else of the name
    // appears in the query, the token alone did the matching
}
```

Schema-valid. Semantically wrong. Caught in code. The file's own comment frames it exactly as the guide would:

> The prompt forbids it; this enforces it, in the same spirit as validating every id against the candidate list rather than trusting the model.

**Prompt forbids, code enforces.** That sentence is the thesis of both our AI layer and a large part of this exam.

We also apply the guide's schema-design advice on optional fields. Only `residualText` is required. Everything else is optional precisely so the model is never pressured to fabricate a value to satisfy a required field — which is the guide's stated reason for nullable design.

### 5.4 Validation and retry loops

The guide asks for retry-with-error-feedback (append the specific validation error and ask again) and, equally, for knowing **when retry is futile** — retries fix format and structure problems, never missing information.

**We do not retry.** We drop the invalid part and proceed with what validated. For our use case this is defensible: a dropped filter costs a wider result set, and our prompt already encodes that tradeoff —

```
- Prefer resolving nothing over resolving wrongly. A missing filter costs the user a wider result
  set; a wrong one hides the document they wanted.
```

— whereas a retry costs latency on an interactive path where the user is waiting. But it is a coverage gap for exam purposes. We have no experience of retry-with-feedback to reason from.

Nor do we implement the guide's self-correction validators: `calculated_total` alongside `stated_total`, or `conflict_detected` booleans. Our summaries report counts from a trusted snapshot rather than extracting them from documents, so there is nothing to cross-check. Worth understanding as a pattern even though our shape does not call for it.

### 5.5 Batch processing

Memorise the figures: **Message Batches API, 50% cost saving, up to a 24-hour window, no latency SLA, no multi-turn tool calling within a request,** `custom_id` for correlating request and response.

The exam's judgment test is matching the API to the latency requirement: synchronous for blocking pre-merge checks, batch for overnight and weekly analysis. There is a calculation variant too — e.g. submitting every 4 hours to guarantee a 30-hour SLA against 24-hour processing.

We use **only the synchronous API**, correctly: every AI surface is interactive with a user waiting. But our daily firm brief is a genuine batch candidate we have not taken:

```ts
export const BRIEF_MAX_AGE_MS = 60 * 60 * 1000
```

It is lazily regenerated on read with a 60-minute TTL. A pre-computed overnight batch would halve the cost and remove the first-read latency. We consciously accepted the race and the cost; the batch option was never evaluated. Worth revisiting on cost grounds independent of the exam.

### 5.6 Multi-instance review

The guide's principle:

> a model retains reasoning context from generation, making it less likely to question its own decisions in the same session

so an **independent** review instance beats self-review instructions or extended thinking.

We do not do AI review of AI output. Our review is **human** (§6.5), which is stronger for client-facing content but does not exercise the pattern. Our eval tests are deterministic assertions, not model-graded — an important distinction, and one I would flag if an item asks how to catch AI regressions: deterministic tests catch contract breaches, independent model review catches judgment failures, and they are not substitutes.

---

## 6. Domain 5 — Context Management & Reliability (15%)

### 6.1 Context construction and the "lost in the middle" effect

The guide names two risks: progressive summarisation quietly destroying numbers, dates and stated expectations; and the **"lost in the middle"** effect, where models reliably process the beginning and end of long inputs but drop findings from the middle. The mitigations are a persistent "case facts" block outside summarised history, trimming verbose tool output to relevant fields, and putting key findings at the start with explicit section headers.

[`buildEngagementContext()`](../../frontend/lib/ai/engagement-chat.ts) is a case-facts block by another name. It is rebuilt from source on every turn, never summarised, and ordered with identity and health first:

```ts
lines.push(`Engagement: ${meta.engagementName ?? 'unnamed'}...`)
lines.push(`Today: ${new Date().toISOString().slice(0, 10)}`)
lines.push(`Kickoff: ${fmtDate(data.kickoffDate)}; due: ${fmtDate(data.engagementDueDate)}...`)
```

Because it is regenerated rather than carried forward, the numbers cannot decay across turns — the failure mode the guide warns about is structurally impossible here.

We also trim aggressively, which the guide asks for explicitly ("40+ fields per order lookup when only 5 are relevant"). Deliverables cap at 40, threads at 10, with an explicit remainder line rather than silent truncation:

```ts
if (data.deliverables.length > 40) lines.push(`  ...and ${data.deliverables.length - 40} more.`)
```

Two bounded-history constants (`MAX_HISTORY_MESSAGES = 12`, `MAX_QUESTION_LENGTH = 1000`) keep the window predictable.

**One decision here is stronger than anything in the guide**, because it is about security rather than fidelity:

> Deliberately excludes free-text document content, comment bodies, and member email addresses: the chat answers questions about delivery state, and widening the payload widens the blast radius of any prompt-injection in user-authored content. Counts and statuses are enough.

Client-authored comment text never reaches the model. The context carries counts, statuses and DOC-IDs only. This is a **prompt-injection boundary**, and it is mechanically enforced by a test that plants strings in user content and asserts they never appear in the built context. The exam guide does not cover prompt injection directly, but this is the kind of production judgment the credential is meant to validate.

### 6.2 Escalation and ambiguity

The guide's ambiguity rule: when a lookup returns multiple matches, **ask for another identifier** — do not select heuristically.

Our interpreter takes a deliberately different route, and the reasoning is worth being able to defend. When two clients match similarly well, we pick the better one, run the search, and surface the runner-up as a one-click switch:

```
- When two clients match similarly well ("Acme" against both "Acme Corp" and "Acme Industries"),
  pick the closer one AND set ambiguousClientId to the other. Do not silently drop both: the user
  is shown the alternative and can switch in one click, which beats returning nothing.
```

The guide's rule is written for an agent taking a **consequential action** — a refund against the wrong account is unrecoverable. Ours is a **reversible read**: a search against the wrong client costs one click. Same principle, different stakes.

Be careful in the exam: for the support scenario, "ask for clarification" is the correct answer. Our design is right for our context, not for theirs. Knowing *why* they differ is the actual competency.

The guide also flags that **sentiment-based escalation and self-reported confidence are unreliable proxies for complexity.** Our chat has no escalation path at all — it states its limits instead:

```
4. You have read-only access. You cannot create, edit, share, assign, or change the status of
   anything. If asked to perform an action, say you cannot and describe where in the app the
   user can do it.
```

### 6.3 Error propagation

The anti-patterns the guide names: generic error statuses that hide context, silently suppressing errors by returning empty results as success, and terminating a whole workflow on one failure.

**We shipped the silent-suppression bug and fixed it**, which makes this the most instructive passage in our codebase. The chat stream originally caught its error and called `controller.close()`. Because the response is raw text with no envelope, a clean close is byte-identical to a complete answer — users saw truncated answers about their engagements presented as authoritative:

```ts
} catch (error) {
    logger.error('AI chat stream error:', error as Error)
    // Fail the stream rather than closing it cleanly. This response is raw text
    // with no envelope to carry an error flag, so a clean close is byte-identical
    // to a complete answer — the client would present a truncated answer about an
    // engagement as an authoritative one. `error()` surfaces as a read failure the
    // caller already catches, keeping whatever streamed but marking the turn failed.
    controller.error(error)
    return
}
```

That is the guide's "silently suppressing errors" anti-pattern exactly, caught in production. The fix preserves partial output while marking the turn failed — which is also the guide's preferred shape.

The counterpart decision is where we *do* suppress deliberately, and the asymmetry is the point. Metering never throws:

> Never throws: metering must not be able to fail a user-facing AI action. A dropped row costs accounting accuracy; a thrown error would cost the user their result.

**A failure that misleads the user must surface. A failure that only costs us bookkeeping must not.** That distinction — who bears the cost of the error — is the reasoning an exam item on error propagation is testing.

### 6.4 Graceful degradation

Not a named task statement, but it runs through the guide's reliability thinking. Every AI surface in Firma is an enhancement over a page that already works, and the code says so repeatedly:

```ts
/** Returns null rather than throwing when unconfigured, so callers degrade to a non-AI path. */
export function getAnthropic(): Anthropic | null {
```

With no API key, the app works — AI sections simply do not render. [`fetch-timeout.ts`](../../frontend/lib/ai/fetch-timeout.ts) applies per-surface budgets (15s interpret / 45s brief / 120s stream) with the same justification:

> Every AI feature is an enhancement over a page that already works, so waiting that long is never the right trade — failing fast returns the user to a working page.

### 6.5 Human review and confidence calibration

**Our strongest single implementation, and simultaneously a real gap.**

What we do exceptionally well is the human review workflow. Generated summaries are `pending_review` and cannot reach a client until a lead approves:

```ts
export type InsightsSummaryStatus = 'pending_review' | 'approved' | 'dismissed'
```

Two sections are reserved for humans by design, and the reasoning is a product decision rather than a capability one:

> `authored: 'lead'` sections are reserved for human judgment by design, not because the model is incapable of producing plausible text for them. Mitigation plans, contingencies and forward commitments bind the firm to a course of action, and that decision belongs to a person who is accountable for it.

The gate itself is deterministic, and its comment states precisely why:

> A plain string check, not an AI call: "did a human replace this text" has exactly one correct answer, and a gate that is occasionally wrong is not a gate.

That sentence would serve as a model answer to any exam item about when *not* to use a model.

The gate also survived a real bug worth noting: exact-matching the placeholder failed because the model emitted a straight apostrophe where our constant had a curly one, so Publish silently enabled with placeholder text intact. The fix normalises punctuation and matches on intent. **Brittle exact-matching against model output is a reliability bug**, not a cosmetic one.

**What we lack is confidence calibration.** The guide asks for field-level confidence scores calibrated against labeled validation sets, stratified random sampling of high-confidence extractions, and per-document-type accuracy analysis — because an aggregate 97% can hide a segment performing far worse.

We have none of it. Our interpreter emits no confidence, our summaries carry no per-section certainty, and we have no labeled validation set. Our human review is **universal** (everything client-facing is reviewed) rather than **routed** (review attention directed by confidence). Universal review is safer and does not scale; the guide's approach scales and requires calibration infrastructure. We should be able to argue both sides.

### 6.6 Provenance

The guide's concern is attribution surviving summarisation, structured claim-source mappings, annotating conflicts rather than silently picking a value, and carrying publication dates so temporal differences are not misread as contradictions.

Our DOC-ID convention is a genuine provenance mechanism, and it came from user feedback — Deepak's instruction was "wherever deliverable or document is referenced, use the DOC ID":

```
- Whenever you name a deliverable or document, lead with the reference the snapshot gives it
  ("QSR-9 — Market & Competitive Intelligence Report"). The reference is how a reader finds the
  artefact; a name alone makes them hunt for it. If an item has no reference, use its name alone —
  never invent one.
```

Every claim in a summary is traceable to an identified artefact. "Never invent one" closes the fabrication path.

Temporal grounding is handled by injecting `TODAY` into both the interpreter and the chat context, so relative phrasing resolves against a known date rather than the model's training cutoff.

The deepest provenance thinking in our codebase is the **fingerprint staleness rule** in [`engagement-summary.ts`](../../frontend/lib/ai/engagement-summary.ts) — about knowing when a summary no longer describes reality:

> THE RULE, when adding fields: hash what a PERSON changed, never what the CLOCK changed. Anything derived from `Date.now()` drifts on its own and will flag every summary stale overnight — that bug shipped once already.

And the refinement, which is the part I would point at first:

> A field that mixes both is DECOMPOSED rather than dropped: hash its stable core, ignore its derived wrapper. `pace` contributes `deliveredPct` (moves when work is approved) but not `timePct` (moves daily).

That is a sophisticated treatment of temporal data, arrived at by shipping the bug first. It has no direct exam analogue, but it is exactly the class of judgment the credential claims to validate.

---

## 7. Domain 3 — Claude Code Configuration & Workflows (20%)

A category error worth naming explicitly: **this domain is not about our product. It is about how we build it.** Firma ships no Claude Code integration. But this project is a working example of most of the domain, so the material is closer to hand than it looks.

### What our repo already demonstrates

**CLAUDE.md hierarchy (3.1).** We have a project-level `CLAUDE.md` in version control, carrying rules the exam would recognise as correctly scoped — commit approval, Prisma migration procedure, PR timing. The guide's diagnostic scenario is "a new team member isn't getting instructions because they live in user-level config." Our commit rule is project-level precisely so it binds everyone.

We do **not** use `@import` for modularity, and we do **not** use `.claude/rules/` with path globs. Our CLAUDE.md is monolithic. It is short enough that this is fine, but it means we have no hands-on experience of either mechanism — and path-scoped rules with YAML frontmatter (`paths: ["**/*.test.tsx"]`) are specifically tested.

**Plan mode vs direct execution (3.4).** We use this distinction constantly, and our plans live in `.claude/plans/` per an explicit project rule. The guide's threshold — plan mode for architectural decisions and multi-file changes, direct execution for well-scoped single-file work — matches our practice.

**Iterative refinement (3.5).** The guide describes the **interview pattern**: having Claude ask questions to surface considerations before implementing. This session used it repeatedly, and one instance is worth recording because the human was right and the model was wrong. On burst limits, I proposed 60 credits per 6 hours against a 500/month allowance. Deepak's response — *"if someone consumes 60 credits every 6 hours, the 500 credits will only last 2 days?"* — identified that I had patched a number without a principle. The resulting design is percentage-based:

```ts
const BURST_PERCENT = 0.1
const MIN_ALLOWANCE_FOR_BURST = 100
```

which scales across tiers instead of needing a hand-set number per plan. The guide's claim that iterative refinement produces better outcomes than first-pass generation is well evidenced here.

The guide also distinguishes **single-message batching for interacting problems** from **sequential iteration for independent ones**. Our Doc Search work followed the first pattern: period resolution, date-filter semantics, zero-result transparency and filter conflicts were addressed together because they interact.

**CI/CD (3.6).** Not implemented. The `-p` / `--print` flag, `--output-format json`, `--json-schema`, and the session-isolation argument (the session that wrote the code is a poor reviewer of it) all need separate study. Our release script is conventional-commit parsing, not Claude Code in CI — though its failure mode was instructive: it found only 5 conventional commits, all months old, and confidently generated release notes describing a previous release. **Silent wrong output beats loud failure for damage done**, which is the same lesson as the stream-close bug in §6.3.

**Skills and slash commands (3.2).** We use them; we have not authored them with `context: fork`, `allowed-tools` or `argument-hint` frontmatter. `context: fork` — running a skill in an isolated subagent so verbose output does not pollute the main conversation — is specifically tested and worth practising.

---

## 7A. Verdict: where we followed Anthropic's guidance, and where we didn't

Sections 3–7 walk the domains. This section answers the blunter question directly: **for each practice Anthropic prescribes, did we do it well, badly, or not at all — and was the deviation defensible?**

Three categories, because "didn't do it" splits into two very different things: a deliberate tradeoff we can defend, and a gap we simply have not closed.

### ✅ Done well — and for the right reason

These are cases where our implementation matches the prescribed pattern *and* the reasoning behind it, not just the shape.

**1. Programmatic enforcement over prompt instruction** — *Domain 1.4, the guide's most repeated principle*

Anthropic's rule: when compliance must be guaranteed, a code-level gate beats a system-prompt instruction, because prompts have a non-zero failure rate.

We apply this at the strongest possible point. `getGuardedAnthropic()` makes the model **unreachable** without passing the credit check. There is no path around it, so a new AI surface inherits gating by construction.

*Why this counts as "well" rather than "lucky":* we did the weak version first. Metering lived at each call site, was wired at three of four, and stayed broken for two days — the ledger held ~11% of real usage. The fix moved the check to the only chokepoint that cannot be skipped. That is the guide's principle, learned the expensive way.

**2. Forced tool use for structured output** — *Domain 4.3*

Anthropic's rule: tool use with a JSON schema is the most reliable route to schema-compliant output; `tool_choice` forced selection guarantees a specific tool runs.

We use `tool_choice: { type: 'tool', name: 'apply_filters' }` and never parse prose. Correct mechanism, correctly configured. With one tool `"any"` would be equivalent, but the explicit form states intent and survives a second tool being added.

**3. Semantic validation on top of schema validation** — *Domain 4.3, the trap most often missed*

Anthropic's rule: strict schemas eliminate **syntax** errors but not **semantic** ones. A well-formed id is not necessarily a real id.

This is where our implementation is genuinely strong. Two independent guards:

- Every returned id is checked against the candidate list the model was given. A hallucinated id is dropped, never applied.
- `resolvedFromPeriodToken()` catches a subtler class the schema cannot see at all — a *valid* id chosen for an *invalid reason*, where "from Q2" matched an engagement named "Q2 Go-To-Market Positioning".

The second guard is the interesting one, because the prompt already forbids that behaviour. We enforced it in code anyway. **Prompt forbids, code enforces** — exactly the division the guide prescribes.

**4. Explicit categorical criteria over vague instruction** — *Domain 4.1*

Anthropic's rule: "flag X when Y contradicts Z" beats "be accurate"; general instructions like "be conservative" or "only report high-confidence findings" do not improve precision.

Our summary prompt never asks for care in the abstract. It says *"NAME only the threads that need something"* and *"Do NOT list threads that are answered and unflagged"* — decidable tests, not aspirations. We did not write "mention the important threads."

**5. Errors that mislead must surface; errors that only cost us must not** — *Domain 5.3*

Anthropic names "silently suppressing errors (returning empty results as success)" as an anti-pattern. We shipped it and fixed it: the chat stream caught its error and called `controller.close()`, which for a raw-text response is byte-identical to a complete answer. Users saw truncated answers about their engagements presented as authoritative. Now it calls `controller.error()`.

The paired decision is what makes this a principle rather than a patch. Metering deliberately **never** throws:

> A dropped row costs accounting accuracy; a thrown error would cost the user their result.

**Who bears the cost of the failure** decides whether it surfaces. That asymmetry is applied consistently across the codebase.

**6. Grounding with an explicit refusal path** — *Domain 5.1*

Anthropic's rule: answer only from supplied context; say so when the context is insufficient.

`CHAT_SYSTEM_PROMPT` rules 1 and 2 do exactly this, and rule 2 names the missing data rather than just declining. The context is *regenerated from source every turn* rather than summarised forward, so the guide's progressive-summarisation decay is structurally impossible here.

**7. Human-in-the-loop for consequential output** — *Domain 5.5*

Generated summaries are `pending_review` and cannot reach a client until a lead approves. Two sections are permanently reserved for humans — and the stated reason is a product judgment, not a capability claim:

> not because the model is incapable of producing plausible text for them [...] that decision belongs to a person who is accountable for it.

The gate is a deterministic string check, and the comment justifying that is effectively a model exam answer: *"a gate that is occasionally wrong is not a gate."*

**8. Graceful degradation** — *Domain 5, reliability*

Every AI surface is an enhancement over a working page. No API key means AI sections do not render; the app is unaffected. Per-surface timeouts (15s/45s/120s) return the user to a working page rather than a hung spinner.

**9. Provenance through stable references** — *Domain 5.6*

Every deliverable named in a summary leads with its DOC-ID, with an explicit *"never invent one"* fallback. Claims are traceable to identified artefacts, which is what the guide's claim-source mapping is for.

---

### ⚖️ Deliberately diverged — defensible, but know the difference

These look like deviations from Anthropic's guidance. Each is defensible in our context, but an exam item set in *their* context would have a different correct answer, and the distinction is the actual competency.

**1. Ambiguity: we choose and offer a switch; the guide says ask** — *Domain 5.2*

Anthropic's rule for multiple matches is to **request an additional identifier**, not to select heuristically.

We pick the better match, run the search, and surface the runner-up as one-click switch. Our prompt states the tradeoff explicitly.

*Why this is defensible:* the guide's rule is written for an agent taking a **consequential, irreversible action** — a refund against the wrong account cannot be undone. Ours is a **reversible read**; a search against the wrong client costs one click, while blocking to ask costs a round trip on every ambiguous query.

*What to hold onto:* in the support scenario, "ask for clarification" is the right answer. Same principle, different stakes. Do not generalise our choice.

**2. No retry loop — we drop the invalid part and proceed** — *Domain 4.4*

Anthropic prescribes retry-with-error-feedback: append the specific validation error and ask again.

We drop what failed validation and search with what remains, which the prompt pre-justifies: *"A missing filter costs the user a wider result set; a wrong one hides the document they wanted."*

*Why this is defensible:* interpretation sits on an interactive path with a user waiting. A retry doubles latency to recover a filter whose absence is already the safe failure mode.

*What it costs us:* we have no production experience of retry-with-feedback, and this is a tested pattern. Defensible as a product call, still a preparation gap.

**3. Synchronous-only; no Message Batches** — *Domain 4.5*

Correct for our four surfaces — all interactive. But the **daily firm brief is a genuine batch candidate we never evaluated**: lazily regenerated on read with a 60-minute TTL, where an overnight batch would halve cost and remove first-read latency. We accepted the race and the cost consciously; we never weighed the batch option. That is a miss on cost grounds independently of the exam.

**4. Human review is universal, not routed** — *Domain 5.5*

Anthropic describes **calibrated** review: field-level confidence scores, stratified sampling, per-segment accuracy analysis, reviewer attention routed where it is needed.

We review *everything* client-facing. Safer, and correct at our volume — but it does not scale, and it is a different discipline from the one the guide describes. See the gap list below.

**5. No AI review of AI output** — *Domain 4.6*

Anthropic's point is that a model retains its own reasoning context and is a poor reviewer of its own work; an independent instance catches more.

Our review is **human**, which is stronger for client-facing content. Our eval tests are deterministic assertions, not model-graded. Worth being precise about: deterministic tests catch contract breaches, independent model review catches judgment failures. They are not substitutes, and we have only the first.

---

### ❌ Not done — genuine gaps

No defensible tradeoff here. These are things the guidance asks for that we simply have not done.

**1. Few-shot examples — the clearest miss inside a strong domain** — *Domain 4.2*

Anthropic is unambiguous that few-shot examples are **the most effective technique** for consistent output and ambiguous-case handling, and asks for 2–4 targeted examples showing *why* one choice beat a plausible alternative.

We have **one**, inline in the interpreter's rules. It is well-chosen — drawn from a real failure, showing the discrimination rather than asserting it — but one example is not few-shot prompting.

We compensated with a code-level guard (`resolvedFromPeriodToken`), which is arguably the more robust guarantee. But these are complements, not alternatives: the guard catches the one failure we anticipated, while few-shot examples help the model **generalise to novel cases** we haven't seen. This is the single highest-value improvement available in our prompt layer, and it is real product work, not exam theatre.

**2. No confidence signal anywhere** — *Domain 5.5*

The interpreter emits no confidence. Summaries carry no per-section certainty. We have no labeled validation set, so there is nothing to calibrate against even if we started emitting scores.

The guide's warning is directly relevant to us: **an aggregate accuracy figure can mask a segment performing badly.** We would not currently detect that — for instance, if period resolution were reliable for quarters and poor for halves, nothing in our system would surface it.

**3. Brittle exact-matching against model output (found and fixed, but instructive)** — *Domain 5.5*

The publish gate originally exact-matched the placeholder string. The model emitted a straight apostrophe where our constant had a curly one, the gate silently passed, and Publish enabled with placeholder text still in client-facing content. Now normalised and matched on intent.

Listed here rather than under "done well" because the original was a genuine reliability defect, not a stylistic one: **the gate protecting client-facing output was silently open.**

**4. Domain 1 mechanics, entirely** — *27% of the exam*

No agentic loop, no `stop_reason` inspection, no coordinator/subagent pattern, no Agent SDK hooks, no session resumption or forking. Our single-turn architecture is correct for the product; it means the heaviest domain has no representation in our codebase at all.

**5. No MCP server** — *Domain 2.4*

We consume MCP servers in development and expose none. Tool description differentiation, structured errors with `errorCategory`/`isRetryable`, and MCP resources as catalogs are all unexercised.

**6. Configuration modularity** — *Domain 3.1/3.3*

Our `CLAUDE.md` is monolithic. No `@import`, no `.claude/rules/` with YAML path globs. Fine at current size, but we have no hands-on experience of either mechanism, and path-scoped conditional loading is specifically tested.

---

### The pattern in the verdict

Read together, the three lists have a shape.

**Where we followed the guidance well, it is almost always because we shipped the weak version first and production corrected us** — metering, the stream close, the fingerprint drift, the apostrophe in the publish gate. Those decisions are well-reasoned because they were paid for.

**Where we diverged deliberately, the reasoning is consistently about stakes and reversibility** — a reversible read tolerates a wrong guess that an irreversible action does not. That reasoning is sound and applied consistently.

**Where we have genuine gaps, they cluster in things production has not yet punished us for.** Nobody has complained about a missing confidence score, because universal human review currently hides the need for one. Few-shot examples have no urgency because a code guard covers the failure we already met. Domain 1 is absent because our product never needed an agentic loop.

That last category is the one worth watching. The guidance exists because someone else already hit those failures. Waiting for our own version of each is an expensive way to learn what is already written down.

---

## 8. Honest gap analysis

Ordered by exam weight against our actual readiness.

### Critical — study from scratch

| Topic | Weight | Why it matters |
|---|---|---|
| Agentic loop + `stop_reason` | Domain 1 core | The single most-tested mechanic; we have no analogue |
| Coordinator / subagent orchestration | Domain 1 | Hub-and-spoke, isolated context, `Task` tool, `allowedTools` |
| Agent SDK hooks | Domain 1.5 | We have the concept, not the API |
| Session resume / `fork_session` | Domain 1.7 | Entirely outside our experience |
| MCP server authoring | Domain 2.4 | We consume; we have never built one |

### Moderate — partial foundation

| Topic | Weight | Our position |
|---|---|---|
| Multi-tool selection | Domain 2.1/2.3 | One tool, so no selection pressure ever faced |
| Structured MCP errors | Domain 2.2 | Right taxonomy, wrong transport (HTTP not MCP) |
| Few-shot prompting | Domain 4.2 | One example where the guide wants 2–4 |
| Retry with feedback | Domain 4.4 | We drop rather than retry |
| Batch API | Domain 4.5 | Never used; memorise the figures |
| Confidence calibration | Domain 5.5 | Universal review instead of routed review |
| `.claude/rules/` path scoping | Domain 3.3 | Monolithic CLAUDE.md |
| Claude Code in CI | Domain 3.6 | Not implemented |

### Strong — our code is the study material

| Topic | Where |
|---|---|
| Programmatic enforcement over prompt guidance | `guarded-client.ts` |
| Forced `tool_choice` for structured output | `search-interpreter.ts` |
| Semantic validation beyond schema | id validation + `resolvedFromPeriodToken()` |
| Explicit criteria in prompts | `SUMMARY_SYSTEM_PROMPT` |
| Grounding and refusal-to-invent | `CHAT_SYSTEM_PROMPT` rules 1–2 |
| Context as regenerated case facts | `buildEngagementContext()` |
| Error propagation without silent success | the `controller.error()` fix |
| Human-in-the-loop gating | `InsightsSummaryStatus`, `findUnfilledSections()` |
| Graceful degradation | `getAnthropic()` returning null, `fetch-timeout.ts` |
| Provenance via DOC-IDs | summary prompt rules |

---

## 9. Preparation plan

The guide's own advice, narrowed to what our position actually requires.

**First — build one agentic loop.** Not a product feature; a scratch exercise. Implement the full cycle: send, inspect `stop_reason`, execute the tool, append the result, repeat until `end_turn`. Deliberately try the anti-patterns — terminate on a text signal, cap iterations as the primary mechanism — and watch them fail. This single exercise addresses the largest gap against the heaviest domain.

**Second — build a two-agent system.** A coordinator delegating to one subagent. The specific thing to internalise is that **subagents do not inherit context** — everything they need must be in their prompt. Pass findings explicitly and watch what breaks when you assume inheritance.

**Third — stand up an MCP server.** The natural candidate is Firma's own engagement data as read-only resources. This covers server authoring, tool description design, structured errors with `errorCategory` and `isRetryable`, and MCP resources as catalogs. It is also plausibly useful product work rather than throwaway.

**Fourth — round out what we nearly have.** Add 2–4 few-shot examples to the search interpreter (a real improvement, not just exam prep). Implement one retry-with-error-feedback loop. Run one Message Batches job to make the constraints concrete. Split `CLAUDE.md` into `.claude/rules/` with path globs and see the conditional loading work.

**Fifth — read our own code as exam material.** `guarded-client.ts`, `search-interpreter.ts`, `engagement-chat.ts` and `engagement-summary.ts` are, between them, a worked answer to most of Domains 4 and 5. The comments explain *why*, which is what the exam actually tests.

---

## 10. Closing observation

The most useful thing this exercise surfaced is not the gap list — it is a pattern in how our AI layer was actually built.

Nearly every strong decision in the codebase was reached by shipping the weak version first and being corrected by production. Metering wired at three of four call sites became a client-level gate. A stream that closed cleanly on error became one that fails loudly. A fingerprint that drifted with the clock became one that decomposes each field. A placeholder check that broke on a curly apostrophe became one that matches on intent.

The CCAR-F guide is, read a certain way, a list of those corrections made in advance by people who had already shipped the weak version. Its anti-patterns are not hypothetical — "parsing natural language to decide when to stop", "returning empty results as success", "aggregate metrics masking segment failures" are all things that look correct until they are deployed.

That is the strongest argument for treating the certification as more than a credential. Our judgment on Domains 4 and 5 is good because we paid for it. Domain 1 is the one where we have no scars yet — which is precisely why it deserves the deliberate practice rather than the confidence.

---

## Appendix: file reference

| File | Relevant domains |
|---|---|
| [`lib/ai/client.ts`](../../frontend/lib/ai/client.ts) | 5.3 error handling, graceful degradation, model pinning |
| [`lib/ai/guarded-client.ts`](../../frontend/lib/ai/guarded-client.ts) | 1.4 enforcement, 1.5 interception, 2.2 structured errors |
| [`lib/ai/credit-cap.ts`](../../frontend/lib/ai/credit-cap.ts) | 1.4 programmatic gates, reliability tripwires |
| [`lib/ai/search-interpreter.ts`](../../frontend/lib/ai/search-interpreter.ts) | 2.1 tool design, 2.3 `tool_choice`, 4.1–4.3 structured output |
| [`lib/ai/engagement-chat.ts`](../../frontend/lib/ai/engagement-chat.ts) | 5.1 context management, grounding, injection boundary |
| [`lib/ai/engagement-summary.ts`](../../frontend/lib/ai/engagement-summary.ts) | 4.1 explicit criteria, 5.5 human review, 5.6 provenance |
| [`lib/ai/summary-sections.ts`](../../frontend/lib/ai/summary-sections.ts) | 5.5 human-in-the-loop gating |
| [`lib/ai/fetch-timeout.ts`](../../frontend/lib/ai/fetch-timeout.ts) | 5.3 reliability, graceful degradation |
| [`lib/ai/interpret-cache.ts`](../../frontend/lib/ai/interpret-cache.ts) | 5.1 cost/context management, cache-key correctness |
| [`lib/ai/usage.ts`](../../frontend/lib/ai/usage.ts) | metering, non-throwing bookkeeping |
| [`app/api/projects/[projectId]/ai-chat/route.ts`](../../frontend/app/api/projects/[projectId]/ai-chat/route.ts) | 5.3 error propagation, streaming, auth ordering |
| `CLAUDE.md` | 3.1 configuration hierarchy |
| `.claude/plans/ai-native-features.md` | 3.4 plan mode |
