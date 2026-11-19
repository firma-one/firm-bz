# AI metering by tokens: every call counted, no free calls

Status: **built 2026-11-19, uncommitted, awaiting Deepak's review.** Replaces "every AI call costs exactly 1
credit" (2026-11-15). Deepak asked for all 8 steps in one release; the open questions were settled with the
defaults below, to confirm.

Defaults taken (2026-11-19):
1. Unit: **0.25¢** a credit (`CREDIT_UNIT_MICROS` in `frontend/lib/ai/pricing.ts`).
2. Allowances: **unchanged** (Free 25, Standard 500). Replayed on the local ledger's 51 real calls: 42 credits
   under the old rule, 65 under the new (+55%, nearly all notes proposals at 2 and memo reads at 2 to 3).
3. No billing group: the call is **refused** (`unbillable`). Your brief already bills the person's first firm
   when nothing else picks one; the RAID cron already has the engagement's group.
4. Credit costs before an action: **not shown** (No Credit Anxiety, 2026-11-19).

## Goal

Brio can never cost us more than a firm pays. Three rules from Deepak (2026-11-19):

1. **No free calls.** Every model call is metered: on-demand, on page load, background and cron.
2. **Failed and cancelled calls count too.** Anthropic bills them, so we do. Failures get fixed at the source
   (better error handling, caps that fit), not given away.
3. **Credits follow tokens.** A big call costs more credits than a small one.

Plus a dollar backstop: a firm's monthly model spend is capped at a share of its plan price.

## Where we are (read from the code 2026-11-19)

Successful calls are metered at 1 credit each. Tokens spent on these paths write **no usage row**:

| Feature | Unmetered path | Where |
|---|---|---|
| summary | Stop / pane leave (`cancel()` aborts), refusal, `max_tokens`, empty text, mid-stream error | `app/api/projects/[projectId]/ai-summary/route.ts` |
| chat, firmChat | API error mid-stream (disconnects are metered, with output ≈ 0) | `ai-chat/route.ts`, `firms/[firmId]/ai-chat/route.ts` |
| brief (firm brief, on Overview load) | refusal, any API error (`completeText`); streamed Rewrite: Stop, refusal, empty, mid-stream error | `lib/ai/client.ts`, `lib/ai/firm-brief.ts` |
| dayBrief (on Home load) | refusal; whole row dropped when `billFirmId` is null | `lib/ai/day-brief.ts` |
| searchInterpret | no tool call (refusal / `max_tokens`), validation throw | `lib/ai/search-interpreter.ts` |
| filesAgent | a failed turn | `lib/ai/files-agent/run.ts` |
| notesProposals, memoMinutes, raidCheck, memoRaid | SDK timeout after tokens were spent | `notes-proposals.ts`, `memo-minutes.ts`, `raid-check.ts` |
| any | `recordAiUsage` drops the row when no billing group resolves, and swallows DB errors | `lib/ai/usage.ts` |
| every stream | output tokens arrive only in the last event: a stopped or broken stream records output 0, thinking included | all streaming routes |

Also: `generateEngagementSummary` (lib/ai/engagement-summary.ts) has no gate and no meter, but no callers. Delete it.

Automatic calls (all count against the firm, all metered on success today): Your brief on Home load, Firm brief on
Overview load (when stale), memo minutes + memo RAID when a memo is added or edited (`after()`), the daily RAID
check (Inngest cron, 07:00, no user).

## What things cost (Haiku 5.5: $0.10 / M input, $0.50 / M output, thinking billed as output)

Local usage ledger (51 real calls) and the worst case at each feature's token cap:

| Feature | Typical cost | Worst at cap |
|---|---|---|
| dayBrief, brief, nudge, reply | 0.02¢ | 0.11¢ |
| statusUpdate | 0.07¢ | 0.14¢ |
| chat, firmChat | 0.11¢ | 0.2¢ |
| raidCheck | 0.11¢ | 0.43¢ |
| summary | 0.15¢ | 0.43¢ |
| notesProposals | 0.27¢ | 0.59¢ |
| memoRaid | 0.29¢ | 0.82¢ |
| memoMinutes | 0.34¢ | 0.49¢ |
| filesAgent, per turn (≤ 8 turns) | n/a locally | ~0.7¢ |

A credit earns 7.8¢ (Standard annual, $39 / 500) to 9.8¢ (monthly).

## The mapping (decision 1)

**Credits for a call = our model cost for that call ÷ the unit, rounded up, at least 1.** Cost comes from the
call's own token counts × the model's price, read from a price table keyed by model, so a model change reprices
by itself. Recorded on the row at call time (history never reprices).

| Unit (1 credit =) | In tokens on Haiku 5.5 | Typical action | Heavy action | 500 credits cost us at most |
|---|---|---|---|---|
| **0.25¢ (recommended)** | 25,000 input or 5,000 output | 1 | memo read 2 to 4, Files agent 1 to 3 a turn | $1.25 (3% of $39) |
| 0.1¢ | 10,000 input or 2,000 output | 1 to 2 | summary 2 to 5, memo read 3 to 9 | $0.50, but allowances would need ×2.5 to keep today's use |

Why 0.25¢: most actions stay at 1 credit, so "500 credits" still reads as roughly 500 answers, and only the heavy
reads cost more. Allowances (decision 2) can stay at Free 25 / Standard 500, or be raised; at 0.25¢ Standard could
go to 1,000 and still cost at most $2.50.

## Failed calls (decision 3: none, they count like any call)

- Every path above writes a row with the tokens spent and the credits they come to. A refusal, a cut-off and an
  error each count.
- A stopped or broken stream has no output count. Charge the input plus the text streamed so far (characters ÷ 4),
  marked `estimated`. Thinking before the stop is not visible to us; the dollar backstop covers it.
- Each failure says why (Failure Reasons rule): "Brio ran out of room before finishing", "Brio declined this
  request", "Brio couldn't be reached", not one generic line. Each is logged with stop reason and tokens.
- Prevent the cut-offs: a test that every feature's cap leaves room for its thinking and output (the summary bug),
  and that the worst case stays under 1.2¢ (15% of a credit's revenue).
- No automatic retries: each retry is a billed call.

## Cancellation (decision 4)

Stop only saves the person's time or lets them redo with better input. Proposal:

- **Remove Stop** where an answer takes under ~20s and can't be steered mid-way: summary, firm brief Rewrite,
  status update, nudge and reply drafts.
- **Leaving no longer cancels.** Closing the pane or the page lets the call finish on the server and save its
  draft, so the tokens aren't wasted. Today the summary's `cancel()` aborts the model.
- **Keep Stop** for chat (long answers, rephrasing) and the Files agent (multi-turn), and charge what was spent.

## Dollar backstop (decision 5)

Each billing group's monthly model spend, read from the ledger (failures included), is capped at a share of its
plan price: **30% of the plan price, 50¢ on Free** (Deepak's example). At the cap Brio pauses for the group with a
clear message and the System Admin gets a notice. With every call metered, the credit allowance should keep a
group far below this; the backstop is for pricing bugs and model price changes.

## Polar: what it takes on, what stays ours

Research from Polar's docs, 2026-11-19 (added at Deepak's request via a sibling session). Firma already bills
through Polar: `@polar-sh/sdk` 0.49, the Free plan is a Polar product, and AI credits come from product metadata
via `parseEntitledAiCredits`.

**What Polar can take on:**
- Events and Meters: we send one event per call (`events.ingest`, with `customer` or `external_customer_id` and
  free-form metadata); a meter sums a field per customer.
- Meter Credits benefit: grants a plan's credits at the start of each cycle (monthly even on a yearly plan, via a
  meter cycle); none are granted while `past_due`; one-time products grant once (credit packs). Rollover is off by
  default through the API.
- Balance: Customer State or the List Customer Meters endpoint; customers see usage per meter in the Customer Portal.
- Overage: with a metered price, usage past the credits is invoiced after it accrues (at renewal or per meter
  cycle), with an optional cap on what a customer pays. No metered price means no overage billing.
- Cost Insights: a cost on each event gives margin per customer.

**What stays ours:**
- Blocking. Polar's docs say it doesn't block usage when a customer exceeds their balance, and it aggregates
  asynchronously, so the check before each call and the dollar backstop stay in-house.
- Recording tokens. Polar's LLM ingestion strategy wraps only Vercel AI SDK models (`@ai-sdk/*`); we call
  `@anthropic-ai/sdk` directly, and the docs say nothing about failed or aborted calls. Every path in the table
  above still records its own row.

**Fit with this plan:** our ledger stays the source of truth (enforcement reads it); Polar gets a copy for invoices
and the portal. Overage pricing and credit packs are optional, later, once Deepak decides on them.

Sources: polar.sh/docs/features/usage-based-billing/introduction, /credits, /billing,
/ingestion-strategies/llm-strategy.

## Open questions (settled by the defaults at the top, to confirm)

1. The unit: 0.25¢ or 0.1¢?
2. Allowances: keep Free 25 / Standard 500, or raise Standard (for example to 1,000)?
3. Who pays when no billing group resolves (Your brief with no firm in the sidebar, the cron with no user)?
   Proposal: the user's first firm's group for Your brief; the engagement's group for the cron (it already has
   one). A call with no group is refused, never run free.

## Build order (once decided)

1. Ledger: a cost (micro-dollars) and `status` (ok, failed, cancelled, estimated) on each row; a price table per
   model; credits from cost. Migration via `--create-only`.
2. Meter every path in the table above; delete `generateEngagementSummary`; refuse calls with no group.
3. Polar: send each ledger row to Polar as an event with credits and cost in its metadata, keyed by the row id so
   a retry can't count it twice; move the monthly credit grant onto the Meter Credits benefit; a monthly
   reconciliation of ledger vs Polar meter totals (alongside the Anthropic check in the last step).
4. Failure words per kind, logged; cap-fit test.
5. Cancellation changes (summary first), mirrored on /tour.
6. Dollar backstop and the admin notice.
7. Billing page: credits by feature, failed calls shown; marketing copy updated ("one credit is one answer").
8. ~~Monthly check against Anthropic's Usage and Cost API.~~ Dropped (Deepak, 2026-11-19): a safety net he doesn't want; the gate's guard test and the self-metering client cover it.
