# Brio on the Files page: an agent that acts, not another search box

## Context

Brio today is read-only by design. Every one of its four features is a single
bounded call — `max_tokens` ≤ 700, one credit, no tools, no loop — and
`ASSISTANT_POLICY` states the posture as product policy: *"Brio reports what the
data shows — it does not decide what your firm does about it."*

This plan breaks that posture deliberately, on one page, for one role. The Files
page is where a professional-services firm's actual mess lives: inconsistent
naming, files in the wrong folder, a new engagement that needs a structure
somebody has to invent. Those are chores a model is genuinely good at and a
human finds tedious — but acting on them means mutating client files in the
firm's own Drive, which is a different risk class from answering a question.

So the design question is not "can the model do this" but "what stops it doing
the wrong thing, and what does a mistake cost." Three answers run through
everything below: the agent only ever performs **reversible** operations, every
batch is **previewed and confirmed** before anything executes, and every run is
**bounded in credits** before it starts.

### What already exists (and changes the shape of this plan)

An earlier reading of `lib/connectors/types.ts` suggested rename and move were
missing. They are not — they live outside the adapter interfaces:

- Google Drive: `GoogleDriveConnector.renameFile` (`lib/google-drive-connector.ts:2972`),
  `.moveFile` (:2799), `.copyFile` (:3037)
- OneDrive: `renameOneDriveFile`, `moveOneDriveFile` in
  `lib/connectors/adapters/onedrive-file-ops.ts`

Both are already wired into `app/api/connectors/google-drive/linked-files/route.ts`,
which serves `rename` (:1275), `move` (:955), `create-folder` (:702) and
`move-tree` (:1044) for **both providers**, each behind
`blockIfEngagementFileMutationForbidden`. **No new provider surface is needed.**

Also reusable as-is: `FloatingAiChat` (`components/projects/floating-ai-chat.tsx`)
takes `defaultOpen` and its docstring already anticipates Files; `audit()`
(`lib/audit/builder.ts`) with `DOCUMENT_MOVED` / `DOCUMENT_CHANGED` already
declared in `lib/audit/constants.ts`; `getGuardedAnthropic` / `meterAiCall`
(`lib/ai/guarded-client.ts`) as the metering chokepoint.

## Decisions taken

| Question | Decision |
|---|---|
| Search in the panel | Brio **answers questions** about files from the tree it holds; **no search UI**. Doc Search keeps that job. |
| Agent operations | `rename`, `move`, `create-folder` only. **No trash, no delete** — worst case is a reversible reorganisation. |
| Scaffold flow | Structured interview (3–5 questions) → one preview of the whole tree → one approval. |
| Audit | Wire `DOCUMENT_MOVED` / `DOCUMENT_CHANGED` into **all** file-op paths, human and agent, flagging agent-performed ones. |
| Who | Engagement Lead (`eng_admin`, via `isEngagementLeadRole`) **or** `firm_admin`. |
| Cost | Hard step cap per run, per-step metering, estimated cost shown before starting. |

## Non-negotiable: confirmation before every mutation

Modelled on Claude Code's edit prompts. The agent **never** mutates on its own
turn. It proposes a batch; the UI renders each operation as a before/after line;
the EL approves the batch, or deselects individual items and approves the rest.

```
Rename 4 files to match the Deliverable-Section convention
  QSR-54  sample_5000.csv          → 05-Market-Data.csv
  QSR-61  sample_1mb.txt           → 06-Interview-Notes.txt
  [✓ all]  [deselect]  [Apply 4 changes · ~2 credits]
```

The approval token is server-minted and single-use, so a stale or replayed
confirmation cannot apply a batch the user never saw.

---

## Build

### 1. A fifth AI feature with real cost control

`lib/ai/usage.ts` — extend the union and weights:

```ts
export type AiFeature = 'brief' | 'summary' | 'chat' | 'searchInterpret' | 'filesAgent'
```

`filesAgent` is the first feature whose cost is **not** flat. Add
`recordAiUsage` calls per model turn inside the loop (the existing signature
already takes `inputTokens`/`outputTokens`, so no schema change). Weight it at
1 credit per turn so the user's mental model stays "one credit, one answer."

New `lib/ai/files-agent/budget.ts`:

- `MAX_AGENT_TURNS = 8` — hard abort, returns partial findings rather than
  silently continuing
- `estimateRunCredits(fileCount)` — shown before the run starts
- Pre-flight `assertWithinAiCreditCap({ feature: 'filesAgent' })` **plus** a
  check that `status.remaining >= estimate`, so a run cannot start that will
  die halfway having spent the user's balance

The existing burst window (`BURST_PERCENT = 0.1` over 4h) already protects
against a loop; this adds the per-run ceiling it does not.

### 2. Precompute the analysis; let the model phrase it

The organisation review is **mostly deterministic** and does not need a model
turn per finding. New `lib/ai/files-agent/analyse.ts` (pure, unit-testable):

- naming inconsistency — tokenise `fileName`, cluster by separator/case/prefix
  pattern, flag the minority
- duplicates — exact and near-duplicate names within a folder
- depth and fan-out anomalies — a folder with 40 loose files, or nesting 6 deep
- orphans — files directly under the engagement root that match a deliverable
  folder's naming

Only the **phrasing and the proposed new names** go to the model, in one
bounded call. This is the single biggest cost lever: a 200-file engagement
costs one call, not two hundred.

Reads `EngagementDocument` (`parentId` holds the parent's `externalId`, not a
uuid — walk accordingly, as `SearchService.resolvePathToProjectRoot` does at
`lib/services/search-service.ts:609`).

### 3. The agent loop and its tools

New `lib/ai/files-agent/tools.ts` — three tool definitions, mirroring the
`search-interpreter.ts` schema style:

| Tool | Maps to |
|---|---|
| `propose_renames` | `linked-files` action `rename` |
| `propose_moves` | action `move` |
| `propose_folders` | action `create-folder` |

Crucially these are **propose**, not execute. The model's tool call produces a
batch; execution happens only after human approval, through the existing route.
Every `fileId` returned is validated against the file list the model was given —
the same post-hoc grounding `search-interpreter.ts` uses (`byId()`), so a
hallucinated id is dropped rather than acted on.

New `app/api/projects/[projectId]/files-agent/route.ts`:

1. `resolveProjectContext` → `canViewProjectInternalTabs` → **EL-or-firm-admin
   gate** (`isEngagementLeadRole` from `lib/engagement-access.ts:46`, or
   `firm_admin`)
2. Budget pre-flight (§1)
3. Loop, capped at `MAX_AGENT_TURNS`, metering each turn
4. Return the proposed batch + a signed approval token

New `app/api/projects/[projectId]/files-agent/apply/route.ts` — validates the
token, re-checks the EL gate, then calls the existing `linked-files` actions
**server-side**, one at a time, stopping on first failure and reporting what
did and did not apply.

### 4. The scaffold interview

New `lib/ai/files-agent/scaffold.ts`. The interview is a **fixed question set**,
not model-generated — domain, deliverable types, client-facing vs internal,
review stages. Fixed questions cost nothing, are predictable, and avoid the
model asking something it will then ignore.

The model's job is turning those answers into a tree. It extends the existing
scaffold concept (`FOLDERS` in `lib/connectors/pockett-structure.service.ts:13`,
of which only `GENERAL` is provisioned today) rather than inventing a parallel
one.

Preview the whole tree → one approval → `create-folder` calls in dependency
order (parents before children).

### 5. Close the audit gap — all paths, not just agent ones

`DOCUMENT_MOVED` and `DOCUMENT_CHANGED` are declared in
`lib/audit/constants.ts` and **never emitted**. Wire them into every mutating
branch of `app/api/connectors/google-drive/linked-files/route.ts`:

| Action | Event | Metadata |
|---|---|---|
| `rename` | `DOCUMENT_CHANGED` | `{ fileName, previousName, viaAgent }` |
| `move`, `move-tree`, `cross-engagement-move` | `DOCUMENT_MOVED` | `{ fileName, fromFolderId, toFolderId, viaAgent }` |
| `create-folder` | `DOCUMENT_CREATED` | `{ fileName, parentId, viaAgent }` |

Use `audit(...).fireAndForget()` so an audit failure never fails the operation —
the established pattern. `viaAgent: true` is what makes AI-initiated changes
reviewable in the Audit tab, which matters more than for a human who knows what
they clicked.

### 6. Mounting on Files

`components/projects/engagement-file-list.tsx` — mount `FloatingAiChat` as a
**sibling after the root `<div>`** (:1821), matching
`engagement-insights-dashboard.tsx:3480`, with `defaultOpen={false}`.

Two known wrinkles:

- **Files unmounts on tab switch** (`engagement-workspace.tsx:501`), so the
  thread dies when the user visits Overview and returns. Accept for v1 and say
  so in the panel; persisting threads is a separate problem the `FloatingAiChat`
  docstring already flags.
- The Files page **owns the upload/download progress panels** that stack above
  the chat via `--ai-chat-corner-offset`. Verify that still works when the chat
  is mounted by the same component that renders them.

Suggestions come from a new `buildFilesSuggestions(files)` alongside
`lib/ai/chat-suggestions.ts`, gated on real signals the same way — do not offer
"fix naming" on an engagement whose naming is already consistent.

---

## Other agentic tasks worth considering (not in scope)

Listed because the question was asked; each is a separate plan.

- **Deliverable folder hygiene** — a folder is a deliverable when
  `isFolder AND settings->'share'->>'createdAt' IS NOT NULL`. Flag deliverables
  with no due date, no owner, or no files.
- **Stale draft detection** — `getStaleFiles` already exists on the permission
  adapter.
- **Duplicate cleanup** — `getDuplicateFiles` exists too, but acting on it means
  deleting, which this plan deliberately excludes.
- **Pre-delivery checklist** — before a deliverable moves to `in_review`, check
  naming, completeness and sharing state.

## Verification

1. `npx tsc --noEmit` and `npx vitest run lib/ai` — new pure modules
   (`analyse.ts`, `budget.ts`) get real unit tests; they are deterministic and
   cheap to cover.
2. **Budget**: set `MAX_AGENT_TURNS = 1` locally, confirm a run aborts cleanly
   with partial findings rather than hanging.
3. **Grounding**: feed the model a file list, assert a fabricated `fileId` in a
   tool call is dropped rather than applied.
4. **Approval gate**: confirm `apply` rejects a replayed token, and rejects a
   caller who is neither EL nor firm admin (test with `eng_member`).
5. **Both providers**: run a rename and a move on a Google-Drive-backed
   engagement and a OneDrive-backed one — the fork at :1304 is per-provider and
   only one path gets exercised by accident.
6. **Audit**: after each operation, confirm the event appears in the Audit tab
   with `viaAgent` set correctly, and that a forced audit failure does not fail
   the file operation.
7. **Credits**: check `platform_ai_usage` has one row per agent turn, and that
   `/system/ai-efficacy` and the top-bar balance both reflect the spend.
