# Plan: Regression Tests for the AI Layer

**Status:** In progress, started 2026-09-26.

---

## 1. Where we are

**Zero tests touch any AI code path.** 18 test files in the repo (vitest, colocated as
`*.test.ts`), none covering `lib/ai/**`, the credit cap, or the four AI routes.

That matters because of what actually went wrong in the two days this layer was built. Every one
of these shipped to `dev` and was found by hand, not by a test:

| Bug | Class |
|---|---|
| Metering wired at 1 of 4 call sites for two days | Coverage gap |
| `DEFAULT_AI_CREDITS = 25` nearly blocked local AI when metadata was unsynced | Wrong fallback |
| Document cap counted re-indexed files as new | Wrong semantics |
| Period tokens resolved as engagement names ("from Q2" → the Q2 engagement) | Wrong resolution |
| Date filter excluded every document with no due date | Wrong field |
| Zero-result ladder silently dropped the user's own hand-picked chip | Wrong scope |
| Chat stream closed cleanly on error, presenting a truncated answer as complete | Silent corruption |

None of these needed a model call to detect. **Every one is deterministic logic around the model**,
which is precisely what is testable.

---

## 2. What to test, and what not to

### Not worth testing
- **Model output quality.** Whether a summary reads well is a human judgment, and asserting on
  generated prose produces tests that fail when the model improves.
- **Anything requiring a live API call.** Slow, costly, and flaky — the model is mocked throughout.

### Worth testing — the deterministic shell

**Tier 1 — pure functions, no mocking.** Highest value per line.

- `lib/search/period.ts` — `resolvePeriod`. Bare quarters default to the current year; `Q5`,
  `Q1 1999`, `Q1 2030` and free text are rejected; boundaries are correct across leap years and
  month lengths. Verified by hand during development; never locked in.
- `lib/ai/summary-sections.ts` — `findUnfilledSections`. The publish gate. Must catch curly vs
  straight apostrophes, markdown emphasis and whitespace variants, because a false pass ships a
  placeholder to a client. This has already broken once.
- `lib/ai/engagement-summary.ts` — `fingerprintInsights`. The rule is *hash what a person changed,
  never what the clock changed*. Test that stage and due-date changes move the hash, and that
  time passing does not. A violation of this shipped a bug where every summary flagged stale
  overnight.
- `lib/ai/credit-cap.ts` — window arithmetic and the burst-percentage ladder, including that a
  sub-100 allowance disables the burst window and that an unknown entitlement does not cap.
- `lib/ai/interpret-cache.ts` — key derivation. Same text plus a changed candidate set must miss;
  a renamed client must invalidate.

**Tier 2 — validation boundaries, model mocked.** The security-relevant layer.

- `lib/ai/search-interpreter.ts` — given a canned tool-use response, assert that ids outside the
  candidate set are dropped, that a date resolves only to a preset or a valid period token, and
  that `resolvedFromPeriodToken` drops an entity matched solely on "Q2"/"2024" while keeping a
  genuine reference.
- `lib/ai/usage.ts` — `recordAiUsage` never throws, and credits are recorded at the weight in
  force at call time.

**Tier 3 — the boundary that protects clients.** One test, high value:

- `buildEngagementContext` must never contain a document's content or a comment body. Plant a
  known string in both and assert it is absent from the built context. This is the promise the
  landing page makes; it should be mechanically enforced rather than trusted.

---

## 3. Explicitly out of scope

- **LLM-as-judge grading of output.** Real evals belong with a golden query set, and §A.12 already
  records that the Ask Brio query corpus is the prerequisite. Not this plan.
- **Route integration tests.** They need auth, a database and a transport layer; the cost/benefit
  is poor next to Tier 1.

---

## 4. What was built — 2026-09-26

58 tests across six files, all passing:

| File | Tests | Covers |
|---|---|---|
| `lib/search/period.test.ts` | 12 | Bare-quarter defaulting, rejection of `Q5`/`Q1 1999`/`Q1 2030`/free text/explicit dates, leap-year boundaries |
| `lib/ai/summary-sections.test.ts` | 10 | The publish gate: curly vs straight apostrophes, markdown, whitespace, casing, absent sections |
| `lib/ai/engagement-summary.test.ts` | 9 | Fingerprint — person-changes move the hash, clock-changes do not |
| `lib/ai/interpret-cache.test.ts` | 6 | Key derivation: added client, renamed client, per-user, per-firm |
| `lib/ai/usage.test.ts` | 7 | Credit weights, calendar-month period start, rolling windows |
| `lib/ai/engagement-chat.test.ts` | 4 | **The client-data boundary** — planted strings must not reach the model |
| `lib/ai/search-interpreter.test.ts` | 10 | Id validation, period-token guard, date rejection, failure → null |

**Verified, not assumed:** reverting the bare-quarter fix in `period.ts` makes exactly one test
fail, and restoring it makes it pass.

**Infrastructure:** `test/server-only-stub.ts` aliased in `vitest.config.ts`. The real
`server-only` package throws outside an RSC, which aborted any suite importing a server module.

### Pre-existing failures, NOT caused by this work

13 tests fail in 5 connector/sharing files. Verified by stashing: the same 13 fail with and without
these changes (169 → 227 tests, 13 failing both times). They are unrelated to AI and want their own
investigation — but they mean `npm test` is not currently green, so a CI gate on this suite would
need them fixed first.

---

## 5. Verification

`npx vitest run lib/ai lib/search` passes. Each test fails if its bug is reintroduced — checked by
reverting a fix locally, not by assuming.
