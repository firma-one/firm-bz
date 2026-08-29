# Plan: Derived Deliverable Status, Multi-Assignee, and Status/Assignee History

## Context

Today, Deliverable status (the `to_do | in_progress | in_review | approved` lane a Deliverable folder sits in on the board) is **manually set** — via drag-and-drop on the Kanban board or a dropdown in the detail panel — independently of the actual state of its sub-task Documents. This creates drift: a Deliverable can show "Approved" while its underlying Documents are still `to_do`, or vice versa, because nothing enforces consistency between the parent and its children.

This plan makes Deliverable status **derived** from its sub-task Documents' statuses instead of manually editable, so the board always reflects real progress. It also extends Document-level assignee from single-select to multi-select (with in-review assignees relabeled as "Approvers" in the UI), and adds a persistent status/assignee change history so a timeline can be shown per Document.

There is no Prisma model literally named `Deliverable` or `Document` — both are rows in one model, `EngagementDocument`. A **Deliverable** is an `EngagementDocument` with `isFolder=true` that has been tagged (`settings.share.createdAt` set). A **Document** (sub-task) is a non-folder `EngagementDocument` inside a deliverable's descendant tree (linked via `parentId` → `externalId`, walked with recursive CTEs, not a Prisma relation). Status for both lives in `settings.activity.status` (JSON field), typed as `ActivityStatus` in `frontend/lib/sharing-settings.ts:6`.

## 1. Deliverable Status Derivation

### Rule set (precedence-ordered, covers full state space)

Given a Deliverable's sub-task Documents (`N` = count):

1. `N === 0` → `to_do` (matches current initial-tag default; empty deliverables are a normal, common state)
2. ANY document `in_progress` → `in_progress`
3. ALL documents `approved` → `approved`
4. ALL documents `in_review` → `in_review`
5. ALL documents `to_do` → `to_do`
6. Anything else (any non-uniform mix with no literal `in_progress` document — e.g. some `to_do` + some `in_review`, or some `to_do` + some `approved`) → `in_progress`

Confirmed with user: rule 6 deliberately treats any non-uniform mix as "work underway," even without a literal `in_progress` document, rather than matching the furthest-along status. This keeps the model to the existing 4 lanes — no 5th "mixed" status, which would otherwise ripple into `STAGE_ROLE_MAP`, `STATUS_LABELS`, `STATUS_PILL_CLASS`, board lanes, drag-drop, and RBAC transitions in `frontend/lib/deliverable-stage-roles.ts`.

Once a Deliverable derives to `approved`, it triggers `finalizedAt` (via the existing side-effect logic in `sharing/activity/route.ts:88`), which blocks further activity PATCHes on that share — so no downgrade-after-finalize path exists through normal flows. The derivation helper should still no-op defensively if the deliverable is already finalized.

### Where derivation is computed: write-time (recommended)

Computed synchronously at the end of every sub-task Document status PATCH, not at read-time on the board. The board's data layer and client-side lane/sort logic (`engagement-shares-tab.tsx`, ~10 call sites reading `share.activity.status` / `s.activity?.status`) already trust a stored `activity.status` field — write-time derivation keeps that as the single source of truth with zero changes to board rendering/sorting, and naturally reuses the existing EC/EV-enablement and `finalizedAt` side effects that already live in `sharing/activity/route.ts:78-94`.

**New file**: `frontend/lib/deliverable-status-derivation.ts`
- `deriveDeliverableStatus(childStatuses: ActivityStatus[]): ActivityStatus` — pure function implementing the rule set above (unit-testable in isolation).
- `deriveAndPersistDeliverableStatus(deliverableDocId: string, actorUserId: string | null): Promise<void>` — orchestration:
  1. Load the deliverable row; no-op if not `isFolder`, not tagged (`!settings.share.createdAt`), or already finalized.
  2. Run the recursive-CTE descendant query (pattern already exists in `sharing/activity/route.ts:125-137`, `shares/order/route.ts`, `subtasks/route.ts:92-105`) to fetch all non-folder descendant statuses.
  3. Compute derived status; if unchanged from stored value, no-op (avoid redundant writes/audit spam — most sub-task PATCHes won't change the parent's derived lane).
  4. If changed, apply via a shared helper (extracted from the inline logic currently in `sharing/activity/route.ts:73-172`: `isForwardMove`, EC/EV `shareUpdate`, `finalizedAt`-on-approved, `buildSettingsForDb`, persist, fire descendant EC/EV sync, emit `AUDIT_EVENT.DOCUMENT_STATUS_CHANGED` with `metadata.derived: true`).

**Trigger point**: `sharing/activity/route.ts` PATCH, after a successful sub-task Document status write — resolve the ancestor tagged-deliverable folder by walking `parentId` up until hitting a folder with `settings.share.createdAt` set, then call `deriveAndPersistDeliverableStatus`. Also guard this same route to reject/no-op manual status PATCHes when `documentId` refers to a tagged Deliverable folder itself (`existing.isFolder && parsed.share?.createdAt`), returning a clear error.

### Removing manual deliverable status control

- `frontend/components/projects/shares/deliverable-detail-panel.tsx` — remove the `Select` + `handleMoveToNext` block (status dropdown, ~lines 736-770, 790-830); replace with the existing read-only status pill pattern (~lines 833-838), now always shown for Deliverables. `SubtaskRow`'s own status `DropdownMenu` (lines 213-228, 363-409) stays unchanged — sub-task Documents remain manually settable.
- `frontend/components/projects/shares/engagement-shares-tab.tsx` — per user decision, **remove dragging for Deliverable cards** entirely (not converted to a bulk-child-update shortcut). Make Deliverable cards non-draggable, or block the drop with a toast explaining status is derived from its documents.
- `frontend/app/api/projects/[projectId]/shares/order/route.ts` — delete or block this route once board drag-and-drop for deliverables is removed (confirm no other caller depends on it first).
- Ship the backend guard (activity route rejection) and the frontend removal (non-draggable cards) in the same deploy to avoid a dangling drag affordance that 400s on drop.
- No backfill on rollout, per user decision — existing Deliverables keep their last manually-set status until the next sub-task status change recomputes them (self-heals over time).

## 2. Multi-Assignee on Documents

- Schema (JSON field, no Prisma migration needed — only `schema.prisma` column changes require migrations): rename `settings.assigneeUserId: string | null` → `settings.assigneeUserIds: string[]`. Add a read-compat helper (e.g. in `frontend/lib/sharing-settings.ts`) that normalizes on read — array if present, else wrap a legacy single string in a 1-element array, else `[]` — matching the existing `'done'→'approved'` normalization precedent (`sharing-settings.ts:154-159`). New writes only ever write the array field; legacy rows are never rewritten.
- **API** — `frontend/app/api/projects/[projectId]/documents/[documentId]/assignee/route.ts`: accept `{ assigneeUserIds: string[] }`, validate every id is an `EngagementMember` (extend the existing single-lookup at lines 30-36 to a `findMany` + count check), and start emitting an audit event (`AUDIT_EVENT.ASSIGNEE_CHANGED`, new constant in `frontend/lib/audit/constants.ts`) with `{ fileName, oldAssigneeIds, newAssigneeIds }` metadata — this route currently fires no audit event at all.
- **UI** — `deliverable-detail-panel.tsx`'s `SubtaskRow`: convert the single-select `DropdownMenu` (lines 412-493, backed by `handleAssigneeSelect` at 196-211) to multi-select — checkbox rows, dropdown stays open across toggles (verify/add `onSelect preventDefault` if it currently auto-closes), stacked avatar circles with a "+N" overflow badge instead of one avatar+name.
- **Approver relabeling (UI-only, no schema change)**: when a Document's status is `in_review` or `approved`, render the section label as "Approver(s)" and display "Approved by A, B, C" using the same `assigneeUserIds` data — a small computed label helper, no new field.
- `frontend/app/api/projects/[projectId]/documents/[documentId]/subtasks/route.ts` — update to read via the new compat helper and return `assignees: [{userId, name, email, avatarUrl}]` arrays instead of single assignee fields.

## 3. Status & Assignee History Timeline

**Reuse `PlatformAuditEvent`** (existing audit log model, `schema.prisma:824-861`) rather than building a new dedicated table — it already has the right shape (`firmId, engagementId, projectDocumentId, actorUserId, eventType, eventAt, metadata`) and already logs `DOCUMENT_STATUS_CHANGED` with old/new values. A new model would duplicate this for no structural benefit.

The one real gap: `purgeStaleAuditEvents()` (`frontend/lib/audit/emit.ts`) currently deletes audit rows older than a firm's billing-plan-derived retention window — fine for generic audit noise, wrong for a user-facing timeline that implies durable history. Fix: exempt `DOCUMENT_STATUS_CHANGED` and the new `ASSIGNEE_CHANGED` event types from that purge query (`eventType: { notIn: [...] }` added to the existing `deleteMany` where-clause) — a small, additive, backward-compatible change instead of new infrastructure.

- New route: `GET /api/projects/[projectId]/documents/[documentId]/history` — queries `PlatformAuditEvent` where `projectDocumentId = documentId AND eventType IN (DOCUMENT_STATUS_CHANGED, ASSIGNEE_CHANGED)`, ordered by `eventAt DESC`, resolves actor display names via the same Supabase admin batch-lookup pattern already used in `subtasks/route.ts:168-182`.
- Derived vs manual distinction: `deriveAndPersistDeliverableStatus`'s audit emission sets `metadata.derived: true`; timeline UI renders these with distinct copy (e.g. "Status auto-updated to Approved — all sub-tasks approved" vs "Jane moved this to Approved").
- UI: a "History" section in `SubtaskRow`'s expanded view (per-document timeline) and a "History" tab at the Deliverable-detail level (aggregated across the deliverable + its children), both in `deliverable-detail-panel.tsx`.

## Ordered File List by Phase

**Phase 1 — Derivation engine**
- `frontend/lib/deliverable-status-derivation.ts` (new) — derivation algorithm + persist orchestration
- `frontend/lib/sharing-settings.ts` — extract shared status-change side-effect helper (EC/EV enable, finalizedAt) for reuse by manual + derived paths
- `frontend/app/api/projects/[projectId]/documents/[documentId]/sharing/activity/route.ts` — trigger derivation after sub-task writes; reject manual PATCHes on tagged Deliverable folders

**Phase 2 — Remove manual deliverable status control**
- `frontend/components/projects/shares/deliverable-detail-panel.tsx` — remove status `Select`/`handleMoveToNext`, always show read-only pill for Deliverables
- `frontend/components/projects/shares/engagement-shares-tab.tsx` — make Deliverable cards non-draggable
- `frontend/app/api/projects/[projectId]/shares/order/route.ts` — remove/block once drag-drop is gone

**Phase 3 — Multi-assignee**
- `frontend/lib/audit/constants.ts` — add `ASSIGNEE_CHANGED`
- `frontend/lib/sharing-settings.ts` — `getAssigneeUserIds()` read-compat helper
- `frontend/app/api/projects/[projectId]/documents/[documentId]/assignee/route.ts` — array support, validation, audit emission
- `frontend/app/api/projects/[projectId]/documents/[documentId]/subtasks/route.ts` — return `assignees[]`
- `frontend/components/projects/shares/deliverable-detail-panel.tsx` — multi-select checkbox dropdown, stacked avatars, Approver relabeling

**Phase 4 — History timeline**
- `frontend/lib/audit/emit.ts` — exempt status/assignee events from purge
- `frontend/app/api/projects/[projectId]/documents/[documentId]/history/route.ts` (new)
- `frontend/components/projects/shares/deliverable-detail-panel.tsx` — History tab/section UI

## Key Risks

- **Concurrent sub-task PATCHes**: each recompute re-reads all descendant statuses fresh before writing, so worst case is redundant writes of the same correct value, not a correctness bug. Defer transactional locking unless observed in practice.
- **Board staleness**: a Deliverable can now "teleport" a lane on its own (e.g. jump straight to `approved` when the last child completes) without the previous single manual-move affordance — more visible than before. Consider a highlight/toast on lane change in a later UX pass; not a correctness blocker.
- **Deploy ordering**: ship the backend guard (Phase 1) and the frontend drag removal (Phase 2) together to avoid a dangling drag affordance that fails on drop.
- **New sub-task creation**: verify whatever flow adds a Document to a Deliverable also triggers derivation (not just status-change PATCHes), so a freshly-added `to_do` sub-task correctly resolves the parent via rule 5, not stale `to_do`-default carryover.
- **Idempotency**: the shared apply-side-effects helper must be a true no-op when the derived status equals the current stored status (no re-fired audit event, no redundant `finalizedAt` reset) — this is the common case for most sub-task PATCHes.

## Verification

- Unit test `deriveDeliverableStatus()` against all rule-set cases (0 docs, all-same for each of the 4 statuses, any in_progress present, and the "mixed, no in_progress" case) directly — no DB needed.
- Manually walk a Deliverable through: create with 0 docs (expect `to_do`) → add 2 docs, move one to `in_progress` (expect Deliverable `in_progress`) → move both to `in_review` (expect Deliverable `in_review`) → move one to `approved`, leave other `in_review` (expect Deliverable `in_review`, rule 5 mix) → move both `approved` (expect Deliverable `approved`, and confirm `finalizedAt` set + EC/EV enabled as before).
- Confirm the board no longer allows dragging a Deliverable card, and that dragging a sub-task's own status (via detail panel) is unaffected.
- Confirm multi-assignee: select 2+ assignees on a sub-task, verify dropdown stays open across toggles, stacked avatars render, and moving status to `in_review` relabels the section to "Approver(s)" / "Approved by A, B".
- Confirm history: status and assignee changes on a document appear in the new History view, in order, with derived vs manual status changes visually distinguished; confirm these events are NOT deleted after triggering (or simulating) the existing audit purge job.
