# Brio Files agent & data rights — release readiness

Status as of **2026-10-11**. Everything below is on `dev`
(`1adbde2b`..`94ff41b0`). Nothing on `main`, nothing in production.

**Release gate:** Deepak tests the Files agent and the data-rights work together, in one pass,
before anything ships. Several paths have never executed outside a unit test.

---

## Done

### Files agent — review and apply
- Five deterministic detectors; one bounded model call turns findings into proposals.
- Three tools only: `rename`, `move`, `create-folder`. Propose-only; a human approves each.
- HMAC approval token, single-use, per-item digests so partial approval works.
- Credit budget: estimate shown before the run, refusal to start a run the balance cannot
  finish, hard turn cap returning partial findings.

### Four detectors that could never fire
Each found by reading a real engagement and asking why the review reported one issue.
- `detectLooseAtRoot` compared against `connectorRootFolderId`, which matches no `parentId`
  because the root folder is not stored as a document. Dead on every engagement ever reviewed.
  Root is now derived from the tree.
- Duplicate detection missed copy suffixes — `Report (1).docx` vs `Report.docx`, the most
  common real duplicate and the one case it structurally could not catch.
- Naming consistency keyed on the full pattern, splitting one underscore convention across
  three casings and leaving the majority under the dominance threshold.
- Summary and detector computed the convention separately and disagreed.

### Safety boundary
- `lib/ai/agent-capabilities.ts` — permitted operations written down, with a test that fails if
  a tool appears outside the list.
- Validation refuses dot-prefixed names; `agentCreateFolder` throws rather than reaching the
  adapter for a reserved name.
- **The hole this closed:** `findOrCreateFolder` DELETES duplicate siblings when the name is
  `.meta`, and `.meta` passed validation. The agent never calls delete; it could cause one.
- Rule 0 in the agent prompt, rule 4b in the chat prompt: never offer to delete, say so plainly,
  point at where the user can.

### Collisions
- Resolved with a 5-char suffix (no vowels, no `0/1/l/o`) rather than refused.
- Checked at APPLY time against live siblings, for renames and moves both — a review can sit on
  screen for minutes.
- On a move the rename happens BEFORE the move, or the folder briefly holds two files of one
  name, which is the state the provider refuses.

### Scaffolding
- Four fixed questions (`clientFacing` removed — sharing is decided after work is ready, and the
  answer only controlled whether an `Internal` folder existed, which is now always created).
- One scaffold per engagement, refused thereafter: two runs with different answers leave 13
  folders from trees of 7 and 6, and reconciling that means deleting.
- Fingerprint in the engagement root's `.meta`, written by platform code. Not the audit trail —
  retention is a billing entitlement where 0 means no history, so the check would silently never
  fire on some plans.

### Conversation UI
- `AgentPromptCard`: one question, numbered options, recommendation as a property not a position,
  free text always last and not disableable.
- Answering the last question applies the batch; no Apply button, because the answers are the
  confirmation.
- Markdown with GFM tables for assistant turns; thread persisted per engagement per surface in
  `sessionStorage`; panel resizable, collapsed by default, hidden-not-unmounted so an in-flight
  answer survives collapsing.

### Audit attribution
- Every agent action records `approvedBy` and `approvedByLabel` alongside `viaAgent`, taken from
  the verified session and denormalised at write time.
- Details column reads `old → new · approved by <name>`.

### Legal
- Privacy policy: AI section (what is sent, never document contents; commercial API, no
  training; nothing without approval; what we keep). Rights section for CCPA/CPRA and PIPEDA.
- Terms: AI section (output may be wrong, you approve every change, it never deletes, credits).
- Corrections: Anthropic added as subprocessor, Stripe → Polar, "Google Drive" → "your own
  storage". Applied to both render variants of each document.

### Data rights
- `GET /api/account/export` — self-service, reads by `userId` throughout.
- `POST/GET /api/account/deletion-request` — raises a `CustomerRequest`, one open at a time.
- `buildDeletionPlan` — what a deletion would touch, computed without touching anything.
- `GET /api/system/account-deletion` — open requests, oldest first, days-open against the
  45-day commitment.
- Notification email on request, carrying the plan URL.
- Chat feedback no longer stores the typed question; the chips carry the signal.

---

## Pending

### Blocking release
- [ ] **Never run against a real Drive.** rename, move, create-folder; agent account
      provisioning (`ensureFirmAgentUser`) and `reconcileAgentName`; audit rows with
      `approvedBy`; collision suffixes; `.meta` fingerprint and the second-run refusal.
- [ ] **Deletion fulfilment.** Nothing executes a deletion and no confirmation email is sent to
      the requester. Deliberate — read a plan against a real account first. The policy commits to
      45 days, so this cannot stay manual-and-undocumented for long.

### Known gaps, not blocking
- [ ] A **stranded workspace** has no handling: deleting the last member of a group leaves its
      firms and engagements orphaned. `buildDeletionPlan` warns; nothing resolves it.
- [ ] Legal pages name **no entity or governing law**. US/Canada targeted.
- [ ] Both legal documents are **duplicated across two render variants**; every edit must be
      made twice.
- [ ] `/d/support` requires `firmSlug`, so **non-firm-admins have no ticket list**. Deletion
      requests avoid this by showing status in the settings card; other request types do not.

### Deferred deliberately
- [ ] **Scaffold category instrumentation.** Client-side bucket only, never the typed text, and
      only once "Something else" is picked often enough to matter. Same rule as chat feedback.
- [ ] **Engagement categories.** Four may be too few — tax/compliance, transaction/due diligence
      and litigation support have no good fit. Ask customers rather than infer from telemetry.
- [ ] **13 pre-existing connector/sharing test failures**, unrelated to this work. Verified
      unchanged by stashing.

---

## Facts worth not rediscovering

- **There is no `User` model.** Every `userId` is a plain uuid with no FK to Supabase auth, so
  deleting an auth record cascades nothing — despite 34 `onDelete: Cascade` rules elsewhere.
- **The one real cascade** is `EngagementDocumentSharingUser`, keyed `(engagementId, userId)`
  against `EngagementMember`: removing a membership removes that user's document shares.
- **`PlatformAuditEvent` has no FK to a user either**, which is what lets audit history survive
  an account deletion with the actor de-identified.
- **Audit retention is a billing entitlement** (`effectiveAuditDays`, 0 = no history). Anything
  that reads the audit trail to answer "did this happen?" is unreliable by plan.
