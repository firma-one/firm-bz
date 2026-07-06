# Deliverables Board Redesign

**Context:** Transform the Engagement workspace from a document-centric sharing model into a deliverable-workflow model. Folders become "Deliverables" with a Jira-style lifecycle (To Do → In Progress → In Review → Approved). Documents inside them are child subtasks. The existing Task Board (beta) is promoted to the primary workflow surface, replacing the Shares tab. External roles are redesigned to match this workflow.

---

## Overview of Changes

| Area | Before | After |
|------|--------|-------|
| What gets shared | Files & folders | Folders only (become "Deliverables") |
| Share trigger | Modal with EC/EV toggles | No modal; sharing auto-enabled on "Mark as Deliverable" |
| Board swimlanes | To Do / In Progress / In Review / Done | To Do / In Progress / In Review / Approved |
| Role: `eng_viewer` | "Viewer (External)" | "Reviewer" |
| Comments entry | File level (Files tab) | Deliverable level (Board card modal) |
| EC/EV access | Set in share modal | Driven by lane transitions |
| Intake | Any shared folder allowed | Only files inside an existing SHARED (Deliverable) folder |
| Engagement Overview | Internal only | Visible to all roles |

---

## Phase 1 — Schema & Data Layer

### 1A. DOC_ID auto-numbering on EngagementDocument ✅ IMPLEMENTED

**Goal:** Every document (file or Deliverable folder) gets a Jira-style short ID like `NVQ-7` (files) or `NVQ-D-3` (deliverable folders).

**New DB columns** (`frontend/prisma/schema.prisma`):

```prisma
model Engagement {
  // Add:
  docIdPrefix  String?  // e.g. "NVQ" — derived on creation, stable forever
  docIdSeq     Int      @default(0)  // single unified sequence for all documents
}

model EngagementDocument {
  // Add:
  docId        String?  // e.g. "NVQ-7" — assigned to every row (file or folder) on insert
}
```

**Migration:** `npx prisma migrate dev --name add_doc_id_fields --create-only`

**Design decision:** Single sequence, single format — `NVQ-1`, `NVQ-2`, `NVQ-3`... for everything (files and folders alike). No `D-` prefix distinction — `isFolder` already identifies record type. Same approach as Jira (issue type is not encoded in the ID).

**Prefix derivation logic** (new utility `lib/doc-id.ts`):
- Take first 3 consonants from engagement name (upper-cased); e.g. "NaviQure AI" → "NVQ"; "Tax Returns 2025" → "TXR"
- Fallback to first 3 chars if fewer than 3 consonants
- Collision check at firm level: append digit suffix (NVQ2, NVQ3)
- Written to `Engagement.docIdPrefix` once on engagement creation (or lazily on first document insert)

**Sequence increment:** Single atomic counter, no race conditions:
```sql
UPDATE engagements SET doc_id_seq = doc_id_seq + 1 WHERE id = $engagementId
RETURNING doc_id_seq, doc_id_prefix
```
Then set `docId = ${prefix}-${seq}` on the document row.

**Where to hook this in:**
- `app/api/connectors/google-drive/linked-files/route.ts` — assign docId on non-folder document sync
- `app/api/projects/[projectId]/documents/[documentId]/index-file-intake/route.ts` — assign docId on intake upload
- Folder docId assigned at the moment a folder is **marked as a Deliverable** (Phase 1B), not on folder creation

No backfill needed — the Board has never been in production use (beta flag only), so all Deliverables and their docIds will be created fresh going forward.

**Display:** Show `docId` as a subtle monospace chip next to the file/folder name in Files list, Board card, Board subtasks, and `#` autocomplete in comments.

---

### 1B. Folder-sharing becomes "Mark as Deliverable" — INHERITED children ✅ IMPLEMENTED

**Current behaviour:** Sharing a folder inserts one `EngagementDocumentSharingUser` row for the folder.

**New behaviour:** When a folder is marked as a Deliverable (action menu → "Mark as Deliverable"):
1. Upsert the folder's `settings.share.createdAt` (marks it SHARED / a Deliverable). Status = `to_do`. Assign `docId = NVQ-D-{deliverableSeq}`.
2. Insert `EngagementDocumentSharingUser` rows for **ALL engagement members** (EL, EM, EC, EV), with `sharingPermissionStatus = 'GRANTED'`, for the **folder itself only**.
3. For every non-folder file currently inside the folder, insert GRANTED rows for **EL/EM only** with `sharingPermissionStatus = 'INHERITED'`. EC/EV child rows come later via lane transitions.
4. New files added inside this folder via intake → EL/EM INHERITED rows inserted immediately; EC/EV INHERITED rows inserted at the same time as the parent folder's lane transition (bulk fan-out).

**Visibility model — Deliverable folder vs child artefacts:**

| Who | Deliverable folder | Child artefacts |
|-----|-------------------|-----------------|
| EL / EM | Visible immediately on tagging | Visible immediately |
| EC | Visible immediately on tagging | Visible when deliverable moves to `in_progress`+ |
| EV | Visible immediately on tagging | Visible when deliverable moves to `in_review`+ |

The Deliverable is a project milestone — everyone sees it exists from day 1. Only the *contents* are gated by workflow stage.

**Access is additive — no revocation on backward moves:**
- When a deliverable moves back (e.g. `in_review → in_progress`), EV retains their child artefact rows.
- Backward moves affect workflow state only, not access.

**Child artefact visibility in Deliverable detail pane (EC/EV):**
EC and EV see a child document in the detail pane only when **both** conditions are met:
1. A sharing row exists for that child (`INHERITED` or `GRANTED`)
2. The deliverable's current status meets their threshold (`in_progress`+ for EC, `in_review`+ for EV)

Individual document status is **not** used as a visibility gate (removed to avoid confusion when a doc is moved backward).

**Backfill for newly added children:**
When a file is added to a Deliverable folder that is already `in_progress`+, insert EC rows immediately (and EV rows if `in_review`+) — don't wait for the next status transition.

**Why not insert EC/EV rows upfront with REVOKED status:** Option kept simple — EC/EV rows only exist when access is active. The assignee picker queries `sharingPermissionStatus = 'GRANTED'` so it naturally shows only the members with current access for the active stage. In To Do, that's EL/EM; after In Progress transition it includes EC; after In Review it includes EV. No special picker logic needed.

**API change:** `PUT /api/projects/[projectId]/documents/[documentId]/sharing/route.ts`
- Accept `{ markAsDeliverable: true }` — triggers the folder + children upsert path.
- Reject if called on a file (`isFolder === false`) with `400 Cannot mark a file as a Deliverable`.

**Ongoing sync:** When a new file is added to a Deliverable folder (via Drive sync or intake), the `index-file-intake` and `linked-files` routes should detect `parentId` in the SHARED set and auto-insert an INHERITED row.

---

### 1C. ActivityStatus rename ✅ IMPLEMENTED

Update `lib/sharing-settings.ts`:
```typescript
export type ActivityStatus = 'to_do' | 'in_progress' | 'in_review' | 'approved'
// Backward compat: map legacy 'done' → 'approved'; 'to_do'/'in_progress'/'in_review' unchanged
```

Backward-compat: In `parseSettingsFromDb`, map legacy `'in_review'` → `'in_review'`, `'done'` → `'approved'`.
No DB migration needed — stored as JSON string.

**Lane → role access mapping** (new constant `lib/deliverable-stage-roles.ts`):
```typescript
export const STAGE_ROLE_MAP = {
  to_do:      { showTo: ['eng_admin', 'eng_member'],                       ecEnabled: false, evEnabled: false },
  in_progress:{ showTo: ['eng_admin', 'eng_member', 'eng_ext_collaborator'], ecEnabled: true,  evEnabled: false },
  in_review:   { showTo: ['eng_admin', 'eng_member', 'eng_ext_collaborator', 'eng_viewer'], ecEnabled: true, evEnabled: true },
  approved:   { showTo: 'all',                                              ecEnabled: true,  evEnabled: true },
}
```

**Lane transition side-effects** (in `PUT /api/.../sharing/activity/route.ts`):
- `to_do → in_progress`: Set `settings.share.externalCollaborator.enabled = true`; sync GRANTED rows for all `eng_ext_collaborator` members.
- `in_progress → in_review`: Set `settings.share.guest.enabled = true`; sync GRANTED rows for all `eng_viewer` members.
- `in_review → approved`: Gate — only `eng_admin` (EL) or `eng_viewer` can make this move. Set `settings.share.finalizedAt`.
- Any backward move: revoke the corresponding persona's GRANTED rows.

---

## Phase 2 — Role Rename: `eng_viewer` → "Reviewer" ✅ IMPLEMENTED

**What changes:** The *display name* stored in `platform.personas` for slug `eng_viewer` changes from `"Viewer (External)"` to `"Reviewer"`. The slug itself does NOT change.

**DB change:** `UPDATE platform.personas SET display_name = 'Reviewer' WHERE slug = 'eng_viewer';`
Add as a migration: `prisma/migrations/<ts>_rename_eng_viewer_display/migration.sql`

**All hardcoded references to update:**

| File | Change |
|------|--------|
| `frontend/prisma/seed.ts` | Update `displayName` for `eng_viewer` seed row |
| `frontend/config/pricing.ts:91` | `'Viewer (External)'` → `'Reviewer'` |
| `frontend/config/pricing.ts:237` | Update tooltip text |
| `frontend/lib/view-as-context.tsx:32` | `displayName: "Reviewer"` |
| `frontend/lib/hooks/use-project-persona-labels.ts` | Update `FALLBACK_VIEWER = 'Reviewer'` |
| `frontend/components/projects/members/member-list.tsx` | Update role badge label |
| `frontend/components/projects/members/invite-member-modal.tsx` | Update role selection display |
| `frontend/components/projects/members/engagement-members-tab.tsx` | Update any hardcoded label |
| `frontend/lib/permissions/persona-map.ts:63` | Update `displayName` |
| `frontend/components/files/document-share-modal.tsx` | Update "Guest" / "Viewer" labels |

**Search command to find remaining occurrences:**
```bash
grep -rn "Viewer (External)\|Guest\b\|eng_viewer.*display\|displayName.*viewer" frontend/components frontend/lib frontend/config --include="*.tsx" --include="*.ts"
```

> **Note:** Internal code references (`eng_viewer` slug, `isExternalViewer` prop, `getProjectPersona` checks) do NOT need to change — only UI-facing display strings.

---

## Phase 3 — Action Menu: "Mark as Deliverable" (folders only) ✅ IMPLEMENTED

**Current:** Action Menu → Share → Share → opens `DocumentShareModal` (supports files & folders).

**New:**
- For **folders**: Action Menu → "Mark as Deliverable" — no modal appears; triggers Phase 1B logic immediately (EL/EM GRANTED rows on folder + INHERITED rows on children; `settings{stage=to_do, ec=false, ev=false}`). The Share modal is **fully removed** — sharing is now implicit and driven by lane transitions only.
- For **files**: The Share option is hidden entirely. Files are never directly shareable; they inherit access from their parent Deliverable folder's lane stage.
- The `DocumentShareModal` (`components/files/document-share-modal.tsx`) is **retired** — EC/EV options are now managed in the Deliverable Detail Panel (Phase 4D).

**Files to change:**
- `frontend/components/ui/document-action-menu.tsx` — folder branch: rename "Share" → "Mark as Deliverable", trigger Phase 1B API directly (no modal). File branch: remove Share option entirely.
- `frontend/components/files/document-share-modal.tsx` — retire (remove usages; keep file for now to avoid breaking imports until all callers are updated).

---

## Phase 3B — Approved Deliverable: Lock / Unlock Rules ✅ IMPLEMENTED

---

## Phase 4C/4D — Deliverable Detail Panel ✅ SUBSTANTIALLY IMPLEMENTED

**Status:** Core panel is live. Remaining gaps noted below.

### What's implemented

- `deliverable-detail-panel.tsx` — Jira-style right-pane panel with Details / Comments / Settings tabs
- **Stage badge row:** EL gets full Select dropdown (all ±1 moves); EM/EC/EV get a single action button ("Submit for Review" or "Request Changes") based on `getAllowedTransitions`; static badge for roles with no allowed move
- **Description field:** Editable textarea for EL; read-only `<p>` for EC/EV when a description exists; hidden when empty for non-EL
- **Subtasks list:** INHERITED children fetched via `/api/projects/[projectId]/documents/[documentId]/subtasks?persona=ec|ev|all`; EC sees files from `in_progress`+, EV sees files from `in_review`+
- **Documents progress bar:** Thin progress bar showing approvedCount/total above subtask list
- **Assignee picker:** Per-subtask avatar chip + dropdown for all engagement members (Phase 4F partially completed)
- **Comments tab:** `DocumentDocCommentsPane` scoped to deliverable folder's `projectDocumentId`
- **Settings (delivery) tab:** EC/EV sharing toggles (download, PDF-only, watermark) — EL-only
- **Success toasts:** Both panel button moves and board drag moves emit `type: 'success'` toast on success
- **Cross-fade animation:** Framer Motion `AnimatePresence mode="wait"` on right pane, keyed by `contentKey` (increments on every `setContent`)
- **Pane switching:** Clicking a different board card reloads the panel; same-card click is a no-op

### What's NOT yet implemented (gaps)

- `#DOC_ID` tag autocomplete in comments → Phase 6A (depends on Phase 1A DOC_ID population)
- History tab → Phase 10 (ON HOLD)
- `deeplinkBase` not passed into `DocumentDocCommentsPane` (component doesn't accept the prop yet)

---

## Phase 4E — Board Interaction Rules ✅ IMPLEMENTED

**Single source of truth:** `getAllowedTransitions(role, currentStatus)` in `lib/deliverable-stage-roles.ts` — consumed by the API route, the detail panel button, and the board drag handler.

### Transition rules (as implemented)

| Role | Allowed moves |
|------|--------------|
| EL (`eng_admin`) | Any ±1 move, including approve |
| EM (`eng_member`) | Any ±1 move except approve (`to_do↔in_progress`, `in_progress↔in_review`) |
| EC (`eng_ext_collaborator`) | `in_progress → in_review` only (submit for review) |
| EV (`eng_viewer`) | `in_review → in_progress` only (push back / request changes) |

### Board drag behaviour

- **EL drags** → routed through `shares/order` PUT (bulk reorder with full orderIndex update + EC/EV flag sync)
- **EM/EC/EV drags** → routed through `sharing/activity` PATCH (single-deliverable status change)
- **Same-lane reorder** → always allowed for any role that can see the lane (no status change, just orderIndex update for EL; no-op for others if same lane)
- **Illegal move** → error toast; board state rolled back
- **Approved lane → any move** → blocked for all roles (approved is final)

### Board visibility for EC/EV

- Any deliverable with `activity.status` set is visible on the board (regardless of current lane)
- Board visibility ≠ file access: a deliverable pushed back to `in_progress` from `in_review` stays visible to EV on the board; only the *files inside* are gated by the sharing rows written at lane-transition time

---

## Phase 4F — Board Audit Fixes ✅ IMPLEMENTED

Fixes applied after audit of the board feature:

1. **Board search/filters** — `byLane` (board view) now uses `filteredShares` (a `useMemo` computed before `byLane`) instead of raw `shares`. Search query, type filter, date filter, and shared-by filter all apply to the board.
2. **Description for EC/EV** — Description field shows for all roles when a value exists: editable for EL, read-only `<p>` for others. Hidden for non-EL only when empty.
3. **Success toast on status move** — Panel button (`handleMoveToNext`) and board drag (non-EL PATCH path) both emit success toast after successful status change.
4. **`canApproveDeliverable` corrected** — Fixed bug: only `eng_admin` (EL) can approve; EV was incorrectly listed. `getAllowedTransitions` already enforced this correctly; the standalone function now matches.
5. **Same-lane reorder for EM/EC** — Removed `&& canManage` guard; same-lane drag is always allowed for any role that can see the lane.
6. **Intake failure toast** — `handleIntakeAction` now shows error toast on failure (was silently failing before).
7. **`canViewDeliverable` not used for board visibility** — Board uses `activity.status` presence check (correct); `canViewDeliverable` is the right gate for API/sharing layer, not board card visibility. The function has been corrected to be accurate but is not wired into board visibility.

### What is locked when status = `approved`

When a Deliverable folder reaches `approved`, the following operations are disabled or restricted:

| Operation | Surface | Behaviour |
|-----------|---------|-----------|
| New File / New Folder | Files tab toolbar (when inside the deliverable folder or any subfolder) | Button hidden |
| ActionMenu → Untag as Deliverable | Deliverable folder action menu | Greyed out; tooltip: "Approved deliverables cannot be untagged" |
| ActionMenu → Organize → Copy | Any file/folder at any depth inside the deliverable | **Enabled** — copying is the intended revision workflow (clone approved deliverable as v2 starting point) |
| ActionMenu → Organize → Rename / Move / Duplicate / Make Private | Any file/folder at any depth inside the deliverable | Greyed out (hidden from sub-menu); only Copy remains available |
| ActionMenu → Organize (no Copy handler) | Any file/folder at any depth inside the deliverable | Greyed out entirely; tooltip: "Approved deliverables cannot be reorganized" |
| ActionMenu → Move to Bin | Any file/folder at any depth inside the deliverable | Greyed out; tooltip: "Approved deliverables cannot be deleted" |
| ActionMenu → Open | File rows inside the deliverable | Greyed out; tooltip: "Use the preview panel to view this document" |
| ActionMenu → Set Due Date | File rows inside the deliverable | Greyed out; tooltip: "Cannot set due date on an approved deliverable" |
| Bulk Delete (toolbar) | Files tab — selecting any item from an approved deliverable | Proceeds to click handler which blocks and shows error toast |

### Row visual treatment

- Approved deliverable folder row + all inherited children: `bg-primary/5` at rest, `bg-primary/10` on hover (theme-aware, not hardcoded green)
- Quick-action badge: `PackageCheck` icon (solid green, white icon) for approved; `PackagePlus` (outlined, primary blue) for tagged-not-yet-approved; `Share2` retained for intake rows only

### Implementation — key files changed

**`frontend/lib/types.ts`**

- Added `deliverableStatus?: 'to_do' | 'in_progress' | 'in_review' | 'approved' | null` field to `DriveFile`

**`frontend/app/api/connectors/google-drive/linked-files/route.ts`**

- Reads `s.activity?.status` from DB settings JSON when `s.share?.createdAt` is set
- Populates `deliverableStatus` on each file in the response (used by Files tab to know if a folder is approved)

**`frontend/components/projects/engagement-file-list.tsx`**

- Added `currentFolderIsApprovedDeliverable` state (boolean)
- `handleFolderClick`: sets it `true` when entering an approved deliverable folder; preserves `true` when navigating deeper into subfolders (so `isInsideApprovedDeliverable` stays `true` at all depths)
- `handleBreadcrumbClick`: re-evaluates from files list when navigating up; resets to `false` on root
- "New File / Folder" button gated on `!currentFolderIsApprovedDeliverable`
- Passes `canManage={canManage && !currentFolderIsApprovedDeliverable}` and `isInsideApprovedDeliverable={currentFolderIsApprovedDeliverable}` to each `EngagementFileRow`
- `handleBulkTrashClick`: before opening confirm dialog, checks if any selected file has `deliverableStatus === 'approved'` or if `currentFolderIsApprovedDeliverable` — shows error toast and aborts if so

**`frontend/components/projects/engagement-file-row.tsx`**

- Added `isInsideApprovedDeliverable?: boolean` prop (default `false`)
- `isFolderApproved = isFolder && file.isDeliverable && file.deliverableStatus === 'approved'`
- `canMutateFile`: also gates on `!isInsideApprovedDeliverable && !isFolderApproved`
- `canOrganizeTree`: also gates on `!isFolderApproved && !isInsideApprovedDeliverable`
- `isApprovedDeliverable={isFolderApproved || isInsideApprovedDeliverable}` passed to `DocumentActionMenu`
- `onUntagAsDeliverable` suppressed when `isInsideApprovedDeliverable || isFolderApproved`
- Row `className`: `bg-primary/5 hover:bg-primary/10` when `isFolderApproved || isInsideApprovedDeliverable`; normal hover otherwise
- Quick-action badge: `PackageCheck` (solid green) for approved, `PackagePlus` (primary blue) for tagged, `Share2` for intake/ancestor-shared

**`frontend/components/ui/document-action-menu.tsx`**

- Added `isApprovedDeliverable?: boolean` prop (default `false`)
- **Removed:** "Finalize / Return to Draft" version lock toggle (both folder and file branches)
- **Removed:** "Add Reminder" menu item (both branches)
- **Removed:** orphaned `<DropdownMenuSeparator />` left after removals
- **Separator fix:** separator before "Move to Bin" is now wrapped inside `onDeleteDocument &&` in both folder and file branches — eliminates double-divider when `onDeleteDocument` is `undefined` for approved items
- **Folder branch — Organize:** disabled greyed div with tooltip when `isApprovedDeliverable && !onCopyDocument`; if `onCopyDocument` exists, shows sub-menu with Copy only (Rename, Move, Duplicate, Make Private/Public hidden)
- **File branch — Organize:** same pattern as folder branch
- **Move to Bin (both branches):** condition changed from `onDeleteDocument &&` to `(onDeleteDocument || isApprovedDeliverable) &&`; when approved, renders greyed `<div>` with tooltip "Approved deliverables cannot be deleted" instead of active `DropdownMenuItem`
- **Untag as Deliverable:** when `isApprovedDeliverable`, shows greyed tooltip item "Approved deliverables cannot be untagged" instead of active untag button
- **Open (file branch):** disabled greyed item with tooltip when `isApprovedDeliverable`
- **Set Due Date (file branch):** disabled greyed item with tooltip when `isApprovedDeliverable`
- **Info sub-menu (file branch):** moved to top of menu (before Open), with `<DropdownMenuSeparator />` after it
- **Organize label:** renamed from "Organise" to "Organize" (American spelling) throughout
- **Divider after Organize:** added `<DropdownMenuSeparator />` after the Organize block (before Bookmark / Info / Set Due Date)

**`frontend/components/projects/shares/deliverable-detail-panel.tsx`**

- `SubtaskRow` uses real `DocumentActionMenu` (same component as Files tab) instead of custom dropdown
- `onDeleteDocument` calls `POST /api/projects/${projectId}/documents/${subtask.documentId}/trash`
- `onRemoveSubtask` callback filters subtask out of local state on trash success
- `isApprovedDeliverable` passed through to suppress Move to Bin when deliverable is approved
- **Documents progress bar:** inline above the file list — thin `h-1.5` rounded green fill track showing `approvedCount / total` subtasks; `X/Y` counter on the right; only renders when `subtasks.length > 0`; updates reactively as subtask statuses change

### Data fix applied to local DB

Legacy `"done"` status values updated to `"approved"` directly via SQL:

```sql
UPDATE platform.engagement_documents
SET settings = jsonb_set(settings, '{activity,status}', '"approved"')
WHERE settings -> 'activity' ->> 'status' = 'done';
```

Write path in `sharing/activity/route.ts` already uses `'approved'` — no code change needed there.

---

### ~~Unlock (Approved → back to In Review)~~ — **DROPPED**

**Rationale:** Approval is final and irreversible in this workflow. Rejection happens earlier in the pipeline — at **In Review → In Progress** (reviewer sends back for revisions), not after approval. Once a deliverable reaches Approved, it cannot be un-approved.

**Revision workflow instead:** If rework is needed after approval, the correct pattern is to **clone the approved deliverable** as a new starting point for v2:

- `ActionMenu → Organize → Copy` is **enabled** for approved deliverable folders and their children (all other Organize operations remain locked)
- The cloned folder starts as a fresh untagged folder — EL marks it as a new Deliverable and it goes through the full lifecycle again
- The original approved deliverable is preserved as the permanent record

---

## Phase 4 — Deliverables Board (promote from Beta) ✅ IMPLEMENTED

**Goal:** The Board tab becomes the primary delivery surface, visible to all roles (not just internal + beta). The existing Shares tab remains but is now secondary.

### 4A. Remove beta gate on Board tab

In `frontend/components/projects/engagement-workspace.tsx`:
- Remove `enableBetaFeatures &&` condition on the Board tab trigger (lines 359–370).
- Make Board visible to all personas (remove `canViewInternalTabs` gate, or extend to external roles).
- In `frontend/app/(app)/d/f/[slug]/c/[clientSlug]/e/[engagementSlug]/board/page.tsx`: remove the `redirect` when `!enableBetaFeatures || !canViewInternalTabs`.

### 4B. Update board swimlanes

In `frontend/components/projects/shares/engagement-shares-tab.tsx` (the LANES constant, lines 121–151):
```typescript
const LANES: Lane[] = [
  { id: 'to_do',      label: 'To Do',       icon: ListTodo,     bg: 'bg-[#f3f4f6]' },
  { id: 'in_progress',label: 'In Progress', icon: Loader2,      bg: 'bg-[#eff2ff]' },
  { id: 'in_review',   label: 'In Review',    icon: Eye,          bg: 'bg-[#fff7ed]' },
  { id: 'approved',   label: 'Approved',    icon: CheckCircle2, bg: 'bg-primary/10' },
]
```

### 4C. Restrict drag permissions

- `in_review → approved` drag: only allowed if `projectRole === 'eng_admin' || projectRole === 'eng_viewer'`. All others: show a toast "Only Reviewers or Engagement Leads can approve deliverables."
- Backward drag (any lane): allowed by EL only.

### 4D. Deliverable Board Card Modal (Jira-style issue panel)

This replaces the current inline share card with a full right-panel modal. Opens on card click in the Board.

**Component:** `frontend/components/projects/shares/deliverable-detail-panel.tsx` (new file, renders inside the existing `ShareDetailPanel` container)

**Panel sections:**

| Section | Details |
|---------|---------|
| **DOC_ID badge** | e.g. `NVQ-12` — same format for files and folders (see note below) |
| **Title** | Editable inline — maps to `EngagementDocument.fileName` |
| **Description** | Optional; stored in `EngagementDocument.metadata.description` (existing `metadata` JSONB) |
| **Stage** | Current lane badge; move-to buttons for allowed transitions |
| **Current Owners** | Non-editable; derived from `STAGE_ROLE_MAP`: To Do/In Progress → all EL avatars; In Review → all EV avatars |
| **Due Date** | Date picker → writes to `EngagementDocument.dueDate` |
| **Sharing Options** | Replaces the old Share modal (see below) |
| **Subtasks** | All non-folder files with INHERITED sharing rows under this deliverable; each row shows `docId`, file name, `dueDate`, assignee avatar + picker |
| **Comments** | DocCommentMessage thread scoped to `projectDocumentId = deliverable.folderId`; supports `#DOC_ID` autocomplete (only INHERITED files of this deliverable) |
| **Activity Log** | Recent `PlatformAuditEvent` rows for this document |

**Sharing Options section** (replaces `DocumentShareModal` entirely for Deliverables):

These settings apply to **all INHERITED files** under this Deliverable, not just the folder itself. Stored in the folder's `settings.share` block (existing shape). On save, propagate to each child file's `settings.share` via a bulk update.

```
Contributor (External) [EC]
  └─ Allow Download  [toggle]  → settings.share.externalCollaborator.options.allowDownload

Reviewer [EV]
  └─ Allow Download  [toggle]  → settings.share.guest.options.allowDownload
  └─ PDF Only        [toggle]  → settings.share.guest.options.sharePdfOnly
       └─ Apply Watermark [toggle, visible only when PDF Only = on]
                           → settings.share.guest.options.addWatermark
```

- These toggles are **only visible/editable once the deliverable is past "To Do"** (i.e., EC/EV access has been granted by lane transitions).
- The `enabled` flags for EC/EV (`externalCollaborator.enabled`, `guest.enabled`) are **not exposed here** — they are controlled exclusively by lane transitions (Phase 1C).
- On save: PATCH `/api/projects/[projectId]/documents/[documentId]/sharing` with the options payload; then fan-out a bulk PATCH to all child INHERITED documents to mirror the same options.
- `DocumentShareModal` (`components/files/document-share-modal.tsx`) can be retired once this panel is live.

**Subtask assignee:**

Each INHERITED file can have one designated assignee — a single member from the existing `EngagementDocumentSharingUser` rows for that file. Store in `EngagementDocument.settings.assigneeUserId` (existing `settings` JSONB — no new column needed).

- **Picker:** In the subtask row, clicking the assignee avatar opens a dropdown listing **all engagement members** (same list regardless of role). Membership is queried from `EngagementMember` for the engagement, resolved to display names via Supabase admin user lookup. No GRANTED-row filter — assignee can be anyone on the engagement.
- **API:** `PATCH /api/projects/[projectId]/documents/[documentId]/assignee` with `{ assigneeUserId: string | null }` — writes to `settings.assigneeUserId`. Validate that the userId is a member of the engagement.
- **Save mechanism:** Same pattern as status PATCH — optimistic UI update, fire-and-forget PATCH, revert on error.
- **Display:** Avatar chip + name in the subtask row; empty state shows an "Assign" placeholder button. Shown in both the detail pane subtask list and the Board card subtask view.
- **Notification:** On assignee change, create an in-app notification for the newly assigned user (type: `SUBTASK_ASSIGNED`, CTA deeplinks to the Deliverable board card).

> **Note on DOC_ID:** All records — files and folders — share the same `docId` format (e.g. `NVQ-7`) from a single sequence on `Engagement.docIdSeq`. No prefix distinction between files and folders; `isFolder` already identifies the record type.

**`#DOC_ID` autocomplete in comments:**
- When user types `#` in the comment box, show a dropdown of files with `sharingPermissionStatus = 'INHERITED'` under this Deliverable folder.
- Format: `#NAV-7 Budget Sheet Q1`
- Stored as `#NAV-7` in comment content (parse on render for linkification).

---

## Phase 4E — Due Date Reminders ✅ IMPLEMENTED (deliverable-level)

> **Implemented for deliverable folders.** On due-date set: schedules Inngest
> 24h + 1h reminders (`deliverable.due_date.set`) that send email **and** in-app
> `DELIVERABLE_DUE_REMINDER` notifications to all engagement members, with a
> board-card CTA deeplink. Skips silently at fire time if the date changed or the
> deliverable is already approved. On clear/change: cancels pending reminders
> (`deliverable.due_date.cancelled`) and retracts (dismisses) already-delivered
> due-date/reminder notifications for the document. Child-document due-date
> reminders remain out of scope (MVP).
> Files: `due-date/route.ts`, `lib/inngest/functions.ts` (`sendDeliverableDueReminder`), `lib/inngest/types.ts`.

> Implement after Phase 4D (Deliverable detail panel) is stable.

**Goal:** When a due date is set on a Deliverable or a child document, create reminders for all engagement members.

**Scope:** Deliverable-level due date only. Child document due dates do not trigger reminders (MVP).

**Who gets notified:**

Since the Deliverable folder is visible to everyone from tagging time, all engagement members are notified — no status filter needed.

| Reminder target | Recipients |
|---|---|
| Deliverable due date | All engagement members (EL, EM, EC, EV) |
| ~~Child document due date~~ | ~~Not in scope for now~~ |

**Trigger:** When `PATCH /api/projects/[projectId]/documents/[documentId]/due-date` is called on a **Deliverable folder** (`isFolder = true` and `settings.share.createdAt` set) with a non-null date, schedule a reminder job via Inngest (`scheduleDeliverableReminder`) for `dueDate - 24h` and `dueDate - 1h`.

**Notification content:**
- Type: `DELIVERABLE_DUE_REMINDER`
- Title: `"{deliverableName} is due {tomorrow / in 1 hour}"`
- CTA: deeplink to Board card `#doc-file:{documentId}`

**Edge cases:**
- If due date is cleared, cancel any pending reminder jobs for that document.
- If due date is updated, cancel previous jobs and reschedule.
- Reminder jobs check current deliverable status at fire time — if already `approved`, skip silently.

**Schema:** No new columns — `dueDate` already exists on `EngagementDocument`. Reminder job IDs stored transiently in Inngest (no DB tracking needed for MVP).

---

## Phase 4F — Assignee Dropdown (Document level) ✅ IMPLEMENTED

> Can be implemented alongside or after Phase 4D.

**Goal:** Each child document (subtask) inside a Deliverable can have one assignee — any engagement member. Surfaced as an avatar chip + dropdown in the subtask row of the Deliverable detail pane.

**Schema:** No new DB column — stored in `EngagementDocument.settings.assigneeUserId` (existing `settings` JSONB).

**New API endpoint:**

`PATCH /api/projects/[projectId]/documents/[documentId]/assignee`
```typescript
// Body
{ assigneeUserId: string | null }
// Validates: userId is an EngagementMember of this engagement
// Writes: settings.assigneeUserId
// On change: fires SUBTASK_ASSIGNED notification to new assignee
```

**Member list API:** Reuse existing `GET /api/projects/[projectId]/members` — returns all engagement members with display name + avatar. Fetched once per panel open, shared across all subtask rows.

**UI — subtask row:**

```
[doc icon] [VFH-68] [filename truncated]       [Assign ▾]  [Status ▾]  [Due date]  [...]
```

- Empty state: ghost "Assign" button with `UserPlus` icon
- Filled state: avatar chip with initials + name truncated
- Dropdown: searchable list of all engagement members, grouped by role (EL/EM / EC / EV)
- Clear option: "Unassign" at bottom of dropdown

**Files to create/modify:**

| File | Change |
|---|---|
| `app/api/projects/[projectId]/documents/[documentId]/assignee/route.ts` (new) | PATCH endpoint — validate member, write `settings.assigneeUserId`, fire notification |
| `components/projects/shares/deliverable-detail-panel.tsx` | Add assignee state + dropdown to `SubtaskRow`; fetch member list on panel open |
| `components/ui/assignee-picker.tsx` (new) | Reusable avatar chip + searchable dropdown for member selection |

---

## Phase 5 — Intake: Restrict to Deliverable Folders Only ✅ IMPLEMENTED (UI-gate approach)

> **Shipped as a lightweight UI visibility gate rather than server-side enforcement.**
> The EC/EV "New File / Folder" button is hidden unless the current folder is a
> Deliverable (any status) AND not approved. Full server-side rejection of
> out-of-folder intake uploads was deemed higher-risk (shared upload path,
> post-upload cleanup) and deferred — the UI gate prevents the bad upload from
> starting in the first place.
>
> **Implemented:**
> - `linked-files/route.ts` — EC/EV `mapRow` now populates `isDeliverable` +
>   `deliverableStatus` (previously only the internal path did). This also makes
>   the approved-lock work for external roles.
> - `engagement-file-list.tsx` — new `currentFolderIsDeliverable` tracker
>   (additive on folder click, re-eval on breadcrumb, reset on root switch);
>   EC/EV button branch gated on it instead of `currentFolderType === 'general'`.
> - Known limitation: deep-link-into-deliverable starts fail-closed until the
>   user navigates (matches existing approved-tracker behavior).
>
> Original server-enforcement plan retained below for reference.

> Implement after Phases 1–4 are stable in production. Happy path first, intake restriction second.

**Current:** EC/EV can upload anywhere; defaults to General folder.

**New rule:** EC/EV intake upload is only allowed inside a folder that is currently a Deliverable (i.e., has `settings.share.createdAt` set and `isFolder = true`).

**Enforcement in `index-file-intake/route.ts`:**
```typescript
// Resolve parent folder
const parentFolderId = driveMeta.parents?.[0] ?? null
if (parentFolderId) {
  const parentDoc = await prisma.engagementDocument.findFirst({
    where: { externalId: parentFolderId, engagementId: projectId }
  })
  if (!parentDoc?.isFolder || !parseSettingsFromDb(parentDoc.settings).share?.createdAt) {
    return NextResponse.json(
      { error: 'Intake uploads must be placed inside a Deliverable folder.' },
      { status: 400 }
    )
  }
}
```

**On approved intake upload into a Deliverable folder:** Auto-insert `EngagementDocumentSharingUser` with `sharingPermissionStatus = 'INHERITED'` referencing the file, not the folder.

**UI change in Files tab:** When EC/EV tries to upload outside a Deliverable folder, show an inline error: "Upload files inside a Deliverable folder to submit for review."

---

## Phase 6 — Comments: Move Entry Point to Deliverable ✅ COMPLETE

**No schema change.** `DocCommentMessage.projectDocumentId` points to the Deliverable folder's ID when commenting on a deliverable.

**Changes:**

1. ✅ **Add** comment section inside `deliverable-detail-panel.tsx` — `Comments` tab implemented, renders `DocumentDocCommentsPane` scoped to the deliverable folder's `projectDocumentId`.

2. ✅ **Remove** comment quick-action icon from individual file rows — `onOpenComments` prop exists in `engagement-file-row.tsx` but is never rendered in the JSX (no comment bubble in the row quick actions area). ActionMenu "Comment" option is folder-only (`mimeType?.includes('folder')`) — file rows do not expose a comment trigger.

3. ~~**Remove** the Comments tab from the workspace for external personas~~ — **DROPPED.** The workspace Comments tab is engagement-wide and valid for all roles including EC/EV. Removing it would unnecessarily limit external communication.

> `#DOC_ID` tag support in comments has been extracted to **Phase 6A** below — it depends on Phase 1A (DOC_ID population) being wired up first.

---

## Phase 6A — `#DOC_ID` Tag Autocomplete in Comments ⏸ ON HOLD

> Depends on Phase 1A (DOC_ID) being populated in the DB — `assignDocId()` must be wired into the document-creation routes first.

**Goal:** When a user types `#` in the Deliverable comment box, show a picker of child documents (INHERITED files under that deliverable). Rendered `#NVQ-7` tokens become clickable chips that deep-link to that file in the Files tab.

**Estimated effort: ~7–8 hours total.**

### Prerequisites (Phase 1A wire-up, ~1.5 hrs)

Call `assignDocId(documentId, engagementId, engagementName)` from:

- `app/api/connectors/google-drive/linked-files/route.ts` — on new non-folder document insert (skip folders; they get their docId at "Mark as Deliverable" time)
- `app/api/projects/[projectId]/documents/[documentId]/index-file-intake/route.ts` — on intake upload of a new file

### New API endpoint (~1 hr)

`GET /api/projects/[projectId]/documents/[documentId]/deliverable-children`

Returns INHERITED files under the deliverable folder with `docId` + `name`:
```typescript
// Response shape
{ files: Array<{ docId: string; name: string; id: string }> }
// Query: EngagementDocumentSharingUser where projectDocumentId = documentId and sharingPermissionStatus = 'INHERITED'
// Join EngagementDocument to get name + docId
```

### Autocomplete UI in `document-doc-comments-pane.tsx` (~2 hrs)

Reuse the existing `@` mention picker pattern (already built — dropdown, keyboard nav, search):

- On `#` keystroke in textarea, fetch deliverable children, show floating picker
- Insert format: `#NVQ-7` into comment text on selection
- Filter list by typing after `#` (e.g. `#NVQ` narrows results)

### Render linkification (~2 hrs)

Parse `#[A-Z]{2,4}-\d+` tokens in rendered comment text:

- Render as a styled `<span>` chip (monospace, primary color, clickable)
- On click: navigate to the Files tab and scroll/highlight the matching file row (use `docId` lookup — find file by `docId` in current files list, then trigger the same selection mechanism as clicking a row)

### docId display chip (~1 hr) ✅ IMPLEMENTED

Show `NVQ-7` as a subtle monospace badge next to filenames in:

- ✅ Files tab — dedicated "ID" column before the Name column (monospace primary-colored text; dash for files without a docId)
- ✅ Board card header — DOC ID as primary title (row 1, bold mono primary); filename as smaller muted subtext (row 2)
- ✅ Board card subtask list — docId chip shown in subtask rows inside deliverable detail panel
- ✅ `DriveFile.docId` type field added to `lib/types.ts`
- ✅ EC/EV path (`linked-files/route.ts`) — `docId` included in `select` and `mapRow`
- ✅ EL/EM path (`linked-files/route.ts`) — `docIdByExternal` Map built from `enrichRows`; `docId` included in `files.map(...)`
- ✅ `engagement-file-list.tsx` — dedicated checkbox column + ID column + Name column in header (`24px 72px minmax(0, 1fr) ...`)
- ✅ `engagement-file-row.tsx` — matching grid; checkbox always visible; file icon stays in Name column

---

## Phase 7 & 8 — Deliverables Analytics in Engagement Overview (All Roles) ✅ IMPLEMENTED

> **Shipped.** Overview tab opened to all roles; deliverables progress chart + Delivery Health score added, with internal data stripped at the API layer for EC/EV.
>
> - `insights/route.ts` — `shares` query extended with `fileName/docId/dueDate/isFolder`; new `deliverables: DeliverableProgress[]` (folders with `share.createdAt`, with `isOverdue`) and `deliveryHealth: DeliveryHealthScore` (penalty-based, mirrors `healthScore`). External-persona branch returns ONLY deliverables analytics — all internal sections (folder/storage health, sensitive files, threads, invitations, internal healthScore) zeroed.
> - `engagement-workspace.tsx` — Overview tab visible to all roles (removed `canViewInternalTabs` gate on trigger + content); `isExternalPersona` computed from `restrictToSharedOnly`/view-as and passed to the dashboard; "Internal only" lock hidden for externals.
> - `engagement-insights-dashboard.tsx` — `isExternalPersona` prop; `DeliverablesRing` (SVG donut: stage distribution amber→blue→indigo→green, % approved in center, count legend, overdue callout, empty state) + `DeliveryHealthCard`; externals get an early-return with just these two, internals get them appended as a new "Deliverables" section.
> - `avgDaysPerStage` is a proxy (days sitting in current stage — we don't track full transition history).
> - ⚠️ **Verify before prod:** confirm the API response for a real EC/EV session omits internal data (defense-in-depth is at the API layer, but test all four roles).

### Phase 7C — Revision Rounds & Approval Cycle Time KPIs ✅ IMPLEMENTED

> **Refined during implementation (approved):**
> - **Revision rounds use TRUE rework**, not the `DOCUMENT_SHARE_CHANGED` proxy — counts backward status transitions (later stage → earlier stage) from `DOCUMENT_STATUS_CHANGED` audit metadata `{ oldStatus, newStatus }`.
> - Added a **First-Time-Right ring** to the Engagement Health card (approved deliverables never sent back vs reworked) — it also feeds the Overall Health Score (`−1 per reworked-share ratio`, max −10).
> - KPIs shipped as metric cards (Avg Revision Rounds · Avg Approval Cycle) + a "Revision Rounds" top-5 detail card, per the ring-vs-card recommendation (durations/counts → cards; first-pass ratio → ring).

**Goal:** Add two more KPIs to the Overview dashboard, riding on the same `insights/route.ts` data layer as Phase 7/8: revision rounds per deliverable, and approval cycle time.

**Data sources:**
- **Revision rounds** — count of `DOCUMENT_SHARE_CHANGED` audit events per document from `PlatformAuditEvent` (already indexed on `(engagementId, projectDocumentId, eventAt)`)
- **Approval cycle time** — `settings.share.finalizedAt - settings.share.createdAt`, already stored in the `settings` JSON on each share — no new data needed

**Files to modify:**

1. [frontend/app/api/projects/[projectId]/insights/route.ts](frontend/app/api/projects/[projectId]/insights/route.ts)
   - Add new interfaces: `DeliverableRevisionMetric` and `ApprovalCycleMetric`
   - Add to `Promise.all`: query `PlatformAuditEvent` where `engagementId = projectId` and `eventType IN ('DOCUMENT_SHARE_CHANGED', 'DOCUMENT_SHARE_CREATED')`, select `projectDocumentId` and `eventType`
   - Group by `projectDocumentId`, count `DOCUMENT_SHARE_CHANGED` → `revisionMetrics[]`
   - From the existing `deliverables`/`shares` array: compute `cycleDays = finalizedAt - createdAt` for each share that has both timestamps → `approvalCycleMetric { avgCycleDays, medianCycleDays, deliverableCount, approvedCount }`
   - Add both to `EngagementInsightsResponse`

2. [frontend/components/projects/engagement-insights-dashboard.tsx](frontend/components/projects/engagement-insights-dashboard.tsx)
   - Add two new `StatTile` entries to the KPI strip:
     - "Avg Revision Rounds" — `RefreshCw` icon, violet color, average rounds across all deliverables
     - "Avg Approval Cycle" — `Clock` icon, color-coded (green ≤7d, amber ≤14d, red >14d)
   - Add a detail card "Revision Rounds" listing top-5 deliverables by revision count with a `×` count badge

**Verification:**
1. Insights dashboard shows "Avg Revision Rounds" and "Avg Approval Cycle" stat tiles
2. A `DOCUMENT_SHARE_CHANGED` audit event increments the revision count for that document
3. Finalizing a share computes `avgCycleDays` correctly
4. Empty state (no shares): both tiles show `—` with placeholder sub-text

---

Original design notes retained below.

> **Phases 7 and 8 are combined** — they touch the same two files (`insights/route.ts` for data, `engagement-insights-dashboard.tsx` for display), share one access-gate relaxation (opening the Overview/Analytics tab to external roles), and Phase 8's score is computed from the same `deliverables` array Phase 7's chart renders. Do them as one unit.
>
> Implement after Phases 1–4 are stable in production.

**Combined goal:** In the Engagement Overview (Analytics tab), add — visible to **all** roles including EC/EV:
- **(Phase 7)** a horizontal deliverables progress chart (one row per deliverable, bar fills by stage)
- **(Phase 8)** a second "Delivery Health" score card alongside the existing folder/storage `healthScore`

**Total effort: ≈ 2.5–3 days** (Phase 7 ≈ 1.5–2d, Phase 8 ≈ +0.5–1d riding on Phase 7's data layer + card pattern).

### What already exists (lowers the estimate)

- ✅ **`recharts@^3.1.2` is already a dependency** and already imported in `engagement-insights-dashboard.tsx` — no new dep; reuse the existing chart pattern (or use plain CSS bars, simpler for stage-fill).
- ✅ **The insights route already iterates deliverable/shared docs and reads `activity.status`** — `insights/route.ts:459-470` builds `sharesProgress`, with the legacy `done → approved` normalization already applied (`rawStatus === 'done' ? 'approved'`).
- ✅ **`healthScore` penalty-accumulator** (`insights/route.ts:635-662`) and the **Health Score KPI tile** (`engagement-insights-dashboard.tsx:1104-1153`) are direct templates for a second score + card. There is even a **commented-out delivery-penalty stub** at `insights/route.ts:656`.
- ✅ `docId`, `dueDate`, `isFolder`, `fileName` all exist on `EngagementDocument`; `ActivityStatus = 'to_do' | 'in_progress' | 'in_review' | 'approved'`.

### Implementation method (ordered)

**Step 1 — Shared data layer (backend, `insights/route.ts`) — ~0.5 day**

The existing `shares` query (`insights/route.ts:355-366`) selects only `id, settings` **and includes intake files** (via the `engagement_document_sharing_users` join), not just folders.

- Extend that raw SQL to also select `ed."fileName", ed."docId", ed."dueDate", ed."isFolder"`.
- **Filter the deliverables set to folders only:** `ed."isFolder" = true AND (ed.settings->'share'->>'createdAt') IS NOT NULL`. ⚠️ Without this, intake files render as fake deliverable rows.
- Map to a new `deliverables: DeliverableProgress[]` on the response:
  ```typescript
  interface DeliverableProgress {
    id: string
    docId: string | null      // e.g. "NVQ-7" (nullable — older folders may lack one)
    name: string
    stage: ActivityStatus      // reuse the done→approved normalization already in the shares loop
    dueDate: string | null
    isOverdue: boolean         // dueDate < now AND stage !== 'approved'
  }
  ```
- **Phase 8 score** — compute `deliveryHealth: DeliveryHealthScore` from that same array, using the existing penalty pattern:
  ```typescript
  interface DeliveryHealthScore {
    score: number             // 0–100
    level: 'good' | 'warning' | 'critical'
    penalties: DeliveryPenalty[]
    approvedCount: number
    overdueCount: number
    avgDaysPerStage: Record<ActivityStatus, number>
  }
  ```

  | Condition | Penalty |
  |-----------|---------|
  | Deliverable overdue (past dueDate, not Approved) | -10 per deliverable (max -40) |
  | >30% deliverables still in To Do after kickoff+14d | -15 |
  | Any deliverable in In Review > 14 days without move | -10 per (max -20) |
  | 0 Approved deliverables past engagement mid-point | -15 |
  | All deliverables Approved | +10 bonus (score can exceed 100, capped at 100) |

  **Level thresholds:** ≥80 = good, 50–79 = warning, <50 = critical. (`kickoffDate` and `dueDate` are already selected on the `engagement` query at `insights/route.ts:313`.)
- Add both `deliverables` and `deliveryHealth` to the `EngagementInsightsResponse` interface (`insights/route.ts:119`) so they flow to the typed client automatically.

**Step 2 — Access gate relaxation (shared) — ~0.5–1 day — HIGHEST RISK (see below)**

- `insights/route.ts:302` currently hard-`403`s non-internal users (`if (!canViewInternal) return Forbidden`). Relax to let external roles through, but derive an `isExternalPersona` flag and **omit the internal-only payload sections at the API layer** for externals (folder health, storage health, sensitive files, unanswered threads, audit events, duplicates). Do NOT rely on client-side hiding alone — sensitive data must never be sent over the wire to an external persona.
- `engagement-workspace.tsx` — the Overview/analytics tab is gated by `canViewInternalTabs` in **two** places: the tab trigger (`:323`) and the tab content render (`:570`). Open both to all roles.
- `engagement-insights-dashboard.tsx` — add an `isExternalPersona` prop (none exists today; props interface at `:1037`) and conditionally render only the deliverables chart + delivery-health card for externals; keep all existing internal cards behind the flag.

**Step 3 — Phase 7 chart UI (`engagement-insights-dashboard.tsx`) — ~0.5–1 day**

- New component: horizontal "stage progress" bars — one row per deliverable, bar fills by stage (25% To Do, 50% In Progress, 75% In Review, 100% Approved). Color amber → blue → green as it progresses; overdue rows get a red due-date accent.
- Row label: `docId` chip + deliverable name. Empty state when `deliverables.length === 0`.
- CSS bars are simpler/lighter than recharts for a pure stage-fill; recharts (`BarChart` `layout="vertical"`) is the fallback if axis ticks/tooltips are wanted.
- **Rejected alternative:** Gantt/swimlane (date X-axis) — needs due dates on every deliverable, which we don't always have.

**Step 4 — Phase 8 card UI (`engagement-insights-dashboard.tsx`) — ~0.25 day**

- New `DeliveryHealthCard` cloned from the existing Health Score tile (`:1104-1153`): score value + `level` badge (good/warning/critical) + penalty list. Sits beside the existing Drive Health card. Visible to all roles.

**Step 5 — Test across all four roles — ~0.5 day**

- Verify EL/EM see everything; EC/EV see ONLY the chart + delivery-health and **no** internal card leaks (confirm the API response itself omits internal sections for externals, not just the UI).

### The one real risk

Steps 1, 3, 4 are low-risk template/derivation work. **Step 2 is the crux and the entire regression surface.** The insights route hard-403s externals today, and the dashboard renders cards that must never reach EC/EV — storage health, sensitive-file detection, unanswered internal threads, folder/audit health. Under-gating leaks internal firm analytics to external clients. Treat data omission at the **API layer** as the source of truth and test the response payload per role.

---

## Phase 8 — Delivery Health Score (Second Score) ⏸ ON HOLD

> **Merged into "Phase 7 & 8 — Deliverables Analytics in Engagement Overview" above.** Phase 8's `DeliveryHealthScore` interface, scoring table, level thresholds, and `DeliveryHealthCard` display are documented there (Step 1 for the score computation, Step 4 for the card), because it shares the `deliverables` data array and the access-gate relaxation with Phase 7.

---

## Phase 9 — Search by DOC_ID ⏸ ON HOLD

> Implement after Phases 1–4 are stable. Depends on DOC_ID being populated (Phase 1A).

**Goal:** The Engagement → Files search bar should support lookup by DOC_ID (e.g. `NVQ-7` or `#NVQ-7`) in addition to file name / content search.

**Behaviour:**
- In the existing Files search input (`engagement-search-panel.tsx`), detect input matching `#?[A-Z]{2,4}-\d+`
- Short-circuit the vector/text search; query `EngagementDocument WHERE docId = $input AND engagementId = $engagementId`
- If found: surface as a top result with a "Jump to" label; clicking navigates to the file in the Files list
- If not found: fall through to normal name/content search results with a subtle "No document found for NVQ-7" hint

**Files to modify:**
- `app/api/projects/[projectId]/search/route.ts` — detect DOC_ID pattern in query param; add `docId` exact-match branch before vector search
- `components/projects/engagement-search-panel.tsx` — detect `#` prefix or ID pattern in input; pin the matched result to the top

**Note:** Global search (firm-wide, cross-engagement) is not yet built. When it is (see Global Document Search in `docs/mvp/todo.md`), DOC_ID search should be extended there too.

---

## Phase 10 — History Tab in Deliverable Detail Panel ⏸ ON HOLD

> Implement after Phases 1–4 are stable in production.

**Goal:** Add a "History" tab to `deliverable-detail-panel.tsx` showing an audit trail for the deliverable folder and all its INHERITED child files — without leaving the panel.

### Data source

Reuse the existing `GET /api/projects/[projectId]/audit` route which already supports `documentId` filtering and resolves actor display names. Add a new document-scoped route:

**`GET /api/projects/[projectId]/documents/[documentId]/history`**
- Uses the same recursive CTE as the subtasks route to collect all descendant file IDs under the deliverable folder
- Queries `PlatformAuditEvent` where `projectDocumentId IN (folderId, ...childIds)` and `scope IN ('DOCUMENT', 'ENGAGEMENT')`
- Returns up to 50 events, ordered by `eventAt DESC`
- Resolves actor name via Supabase admin user lookup (same pattern as `/audit`)
- Filters to only delivery-relevant event types (see below)

**Relevant event types to show:**
```
DOCUMENT_STATUS_CHANGED   — stage transitions (To Do → In Progress etc.)
DOCUMENT_SHARE_CREATED    — deliverable first shared / marked
DOCUMENT_SHARE_CHANGED    — settings updated (download, watermark, etc.)
DOCUMENT_SHARE_DELETED    — unshared
DOCUMENT_FINALIZED        — approved
DOCUMENT_UNLOCKED         — approval reversed
DOCUMENT_OPENED           — reviewer opened a file
DOCUMENT_DOWNLOADED       — file downloaded
DOCUMENT_COMMENT_CREATED  — comment posted
DOCUMENT_CHANGED          — description or settings edited
```

### UI — Compact timeline rows

Each event is a single row in a vertically stacked list inside the tab panel:

```
[icon]  [event label]         [actor initials]  [relative time]
 ↑        e.g. "Moved to      e.g. DS           e.g. "2h ago"
 colored   In Review"
 dot
```

- **Icon / dot**: small colored circle — green for approvals, blue for status moves, grey for views, amber for comments
- **Event label**: short human-readable string derived from `eventType` + `metadata` (e.g. "Moved to In Review", "File downloaded", "Comment posted")
- **Actor**: initials avatar chip (same style as existing avatars in the panel)
- **Time**: relative (`2h ago`, `Yesterday`, `Jun 30`) — no absolute timestamps unless hovered (tooltip)
- **File context**: if the event is on a child file (not the folder itself), show the file name in muted text below the label

**No infinite scroll for now** — show latest 50 events, with a "Load more" link if `nextCursor` exists.

### Files to create / modify

| File | Change |
|------|--------|
| `app/api/projects/[projectId]/documents/[documentId]/history/route.ts` (new) | Recursive CTE + audit query + actor resolution |
| `components/projects/shares/deliverable-detail-panel.tsx` | Add `'history'` to `Tab` type and tab list; render `<DeliverableHistoryTab>` |
| `components/projects/shares/deliverable-history-tab.tsx` (new) | Compact timeline list component |

### Notes

- The tab is visible to `canManage` users only (same gate as Settings tab)
- No write operations — read-only audit data
- Event label mapping lives in a `HISTORY_LABEL_MAP` constant (eventType → human string) in the new tab component
- Actor resolution is done server-side (not client-side) — the history route returns `actorName` and `actorEmail` already resolved

---

## Action Center Integration

**For external roles (EC/EV):** In the Reminders Panel, surface "In Review" deliverables assigned to them (i.e., `eng_viewer` members) as action items:
- Notification type: `DELIVERABLE_REVIEW_PENDING`
- Body: "Review pending: {deliverableName}"
- CTA: deeplink to Board card `?tab=board&deliverable={docId}`
- Created when deliverable moves to `in_review` (Phase 1C side-effect).

**For internal roles:** Add "Stalled Deliverables" section to `firm-action-center.tsx` — deliverables stuck in same stage > 7 days.

---

## Implementation Order

1. ✅ **Phase 1A** — DOC_ID schema + prefix derivation utility + wired into all creation routes
2. ✅ **Phase 1C** — ActivityStatus rename + backward compat
3. ✅ **Phase 2** — Rename `eng_viewer` display name to "Reviewer"
4. ✅ **Phase 1B** — Mark as Deliverable + INHERITED children logic
5. ✅ **Phase 3** — Action menu changes (folders only, no modal)
6. ✅ **Phase 4A/4B** — Promote Board tab, update swimlane labels
7. ✅ **Phase 4C/4D** — Deliverable detail panel (Jira card modal)
8. ✅ **Phase 4E (Board)** — Board interaction rules + drag permissions
9. ✅ **Phase 4F (Board)** — Board audit fixes
10. ✅ **Phase 4F (Panel)** — Assignee dropdown (document level)
11. ✅ **Phase 6** — Move comments entry point to Deliverable panel
12. ✅ **Phase 3B** — Approved deliverable lock / unlock rules
13. ✅ **Phase 4E (Reminders)** — Due date reminders for deliverables (email + in-app, deliverable-level)
14. **Phase 6A** — ⏸ ON HOLD — `#DOC_ID` tag autocomplete in comments
15. ✅ **Phase 5** — Intake restriction to Deliverable folders (shipped as EC/EV upload-button UI gate)
16–17. ✅ **Phase 7 & 8 (combined)** — Deliverables analytics in Engagement Overview: progress chart + Delivery Health score, opened to all roles
18. **Phase 9** — ⏸ ON HOLD — Search by DOC_ID
19. **Phase 10** — ⏸ ON HOLD — History tab in Deliverable detail panel

---

## Key Files Modified

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `docId` on `EngagementDocument`; add `docIdPrefix`, `docIdSeq`, `deliverableSeq` on `Engagement` |
| `lib/sharing-settings.ts` | Add `in_review`/`approved` status values; backward compat map |
| `lib/doc-id.ts` (new) | Prefix derivation + DOC_ID generation utility |
| `lib/deliverable-stage-roles.ts` (new) | Stage → role access + EC/EV enable mapping |
| `app/api/projects/[projectId]/documents/[documentId]/sharing/route.ts` | Mark as Deliverable logic + INHERITED children |
| `app/api/projects/[projectId]/documents/[documentId]/sharing/activity/route.ts` | Lane-transition side-effects (EC/EV access toggle) |
| `app/api/projects/[projectId]/documents/[documentId]/index-file-intake/route.ts` | Restrict to Deliverable folders; auto-insert INHERITED row |
| `app/api/projects/[projectId]/insights/route.ts` | Add `deliverables` array + `deliveryHealth` score |
| `components/ui/document-action-menu.tsx` | Folder-only share; rename label |
| `components/projects/engagement-workspace.tsx` | Remove beta gate on Board; open Analytics to all roles |
| `components/projects/shares/engagement-shares-tab.tsx` | Update lane names + drag permission gates |
| `components/projects/shares/deliverable-detail-panel.tsx` (new) | Jira-style deliverable card modal |
| `components/projects/document-doc-comments-pane.tsx` | Add `#DOC_ID` autocomplete support |
| `components/projects/engagement-insights-dashboard.tsx` | Add timeline chart + delivery health card; hide internal cards from EC/EV |
| `components/projects/members/member-list.tsx` | Update `eng_viewer` label |
| `config/pricing.ts` | Update "Viewer (External)" to "Reviewer" |
| `lib/view-as-context.tsx` | Update `eng_viewer` displayName |
| `lib/hooks/use-project-persona-labels.ts` | Update fallback label |
| `prisma/seed.ts` | Update persona display name |

---

---

## Risk Register — Phases 1–4

### 🔴 HIGH: `syncDocumentSharingUsers` will revoke EL/EM rows

**File:** `lib/sync-document-sharing.ts`

**Problem:** When both EC and EV are disabled (`!isEcEnabled && !isGuestEnabled`), the function runs:
```
updateMany WHERE sharingPermissionStatus = GRANTED → set REVOKED
```
This currently only hits EC/EV rows because EL/EM never had GRANTED rows. After Phase 1B, EL/EM will have GRANTED rows on every Deliverable folder and its INHERITED files. The next time sharing settings are saved with EC+EV both off (To Do stage), `syncDocumentSharingUsers` will revoke EL/EM rows — breaking internal access.

**Fix:** Add a role guard in `syncDocumentSharingUsers` — never touch rows belonging to `eng_admin` or `eng_member`:
```typescript
// Only revoke external persona rows — internal members always retain access
await prisma.engagementDocumentSharingUser.updateMany({
  where: {
    projectDocumentId,
    sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED,
    member: { role: { in: [EngagementRole.eng_ext_collaborator, EngagementRole.eng_viewer] } }
  },
  data: { sharingPermissionStatus: DocumentSharingPermissionStatus.REVOKED, ... }
})
```
**Existing test:** `lib/sync-document-sharing.test.ts` tests this path — must add a new test case: "does not revoke EL/EM rows when EC+EV both disabled".

---

### 🔴 HIGH: `ActivityStatus` `'done'` → `'approved'` — 6 files need updating

The string `'done'` is used as an `ActivityStatus` value in the following places (unrelated `'done'` in upload/trash queues are safe and do NOT need changing):

| File | Line | Change needed |
|------|------|--------------|
| `lib/sharing-settings.ts:6` | Type definition | Add `'approved'`, remove `'done'` |
| `lib/sharing-settings.ts:155` | Validation allowlist | Replace `'done'` with `'approved'` in the array |
| `app/api/projects/[projectId]/shares/route.ts:192` | Sort order map | `done: 3` → `approved: 3` |
| `app/api/projects/[projectId]/shares/order/route.ts:38` | Order update | `status: 'done'` → `status: 'approved'` |
| `app/api/projects/[projectId]/documents/[documentId]/sharing/activity/route.ts:8` | Valid statuses list | Replace `'done'` with `'approved'`; also update comment on line 12 |
| `app/api/projects/[projectId]/insights/route.ts:464` | SharesProgress counter | `status === 'done'` → `status === 'approved'`; also rename `sharesProgress.done` field |
| `components/projects/shares/engagement-shares-tab.tsx:52` | Local type alias | Replace `'done'` with `'approved'` |
| `components/projects/shares/engagement-shares-tab.tsx:146` | LANES constant | `status: 'done'` → `status: 'approved'` |
| `components/projects/shares/engagement-shares-tab.tsx:1667` | byLane grouping | `else if (status === 'done') done.push(rec)` → `approved` |
| `components/projects/shares/engagement-shares-tab.tsx:1701` | Drag target validation | `'done'` in the valid lane id array |
| `components/projects/shares/engagement-shares-tab.tsx:2014` | `isDoneLane` prop | Rename to `isApprovedLane`, update call sites |

**Backward compat:** `parseSettingsFromDb` must map legacy `'done'` → `'approved'` on read so existing JSON in DB is handled gracefully.

**No existing tests** cover `ActivityStatus` values directly — add unit tests to `lib/sharing-settings.ts` for the backward compat mapping.

---

### 🟡 MEDIUM: `INHERITED` status skipped by `syncDocumentSharingUsers` — confirm intentional

**Current behaviour:** `syncDocumentSharingUsers` explicitly skips `PENDING` rows (`if existing?.sharingPermissionStatus === 'PENDING') continue`). It does NOT skip `INHERITED` rows — they would be treated the same as absent rows and get upserted to `GRANTED` if the role is enabled.

**Risk:** When lane transitions to In Progress and `syncDocumentSharingUsers` fires (EC enabled = true), it will find EC members and upsert their rows. But those rows already exist as `INHERITED`. The upsert logic checks `existing?.sharingPermissionStatus === 'GRANTED'` and skips if already GRANTED — but `INHERITED` rows won't match that check and will be updated to `GRANTED`, losing the `INHERITED` status.

**Fix:** Add an `INHERITED` guard alongside `PENDING` in `syncDocumentSharingUsers`:
```typescript
if ((existing?.sharingPermissionStatus as string) === 'PENDING') continue
if ((existing?.sharingPermissionStatus as string) === 'INHERITED') continue  // add this
```
Drive access for INHERITED files is managed at the folder level, not the file level.

---

### 🟡 MEDIUM: Shares tab query may surface INHERITED files as top-level deliverables

**File:** `app/api/projects/[projectId]/shares/route.ts`

**Current query criterion:** Documents with `settings.share.createdAt IS NOT NULL` OR `sharingUsers` with status in `(GRANTED, PENDING)`.

**Risk:** After Phase 1B, INHERITED files will have `GRANTED` rows for EL/EM. This means they will appear in the Shares tab list alongside the Deliverable folder — the Board will show both the folder AND all its child files as separate cards.

**Fix:** The Shares/Board query must filter to **folders only** when the Deliverable model is active. Add `isFolder: true` to the query, or filter by `settings.share.createdAt IS NOT NULL AND isFolder = true`. INHERITED files should only appear as subtasks inside the Deliverable panel, never as top-level board cards.

---

### 🟡 MEDIUM: `sharing/activity` route doesn't gate `'approved'` transitions by role

**File:** `app/api/projects/[projectId]/documents/[documentId]/sharing/activity/route.ts`

**Current:** Any user with access can move a card to any status. No role check exists.

**Risk:** Without gating, any EC member could move a Deliverable to `approved`, bypassing the EL/EV-only rule.

**Fix:** Add role check in the activity route before accepting a transition to `approved`:
```typescript
if (body.status === 'approved') {
  const role = await getProjectPersona(firmId, clientId, projectId)
  if (role !== 'eng_admin' && role !== 'eng_viewer') {
    return NextResponse.json({ error: 'Only Engagement Leads or Reviewers can approve.' }, { status: 403 })
  }
}
```

---

### 🟡 MEDIUM: `document-action-menu.tsx` — no `isFolder` prop today

**Current:** The action menu uses `document.mimeType?.includes('folder')` to detect folders (line 391, 400, 614). It already renders a different Share section for folders vs files (line 614 branches on `mimeType?.includes('folder')`).

**Risk (low):** The `isAncestorShared` prop already exists and disables the Share item when a parent is shared. The rename from "Share" to "Mark as Deliverable" and the file-blocking logic are localised changes within an already-branched code path — low regression risk.

**Action:** Rename the folder branch label only; remove the share option from the file branch. No new prop needed — `mimeType` check already present.

---

### 🟢 LOW: `SharesProgress` interface in insights route has `done` field

**File:** `app/api/projects/[projectId]/insights/route.ts:70`

The `SharesProgress` interface has `done: number`. Must rename to `approved: number` and update all references in `engagement-insights-dashboard.tsx` that read `sharesProgress.done`.

---

### 🟢 LOW: Local `ActivityStatus` type alias in `engagement-shares-tab.tsx`

Line 52 defines its own local `type ActivityStatus = 'to_do' | 'in_progress' | 'in_review' | 'done'` instead of importing from `lib/sharing-settings.ts`. This type duplication means the file won't get a TS error when the canonical type changes — it must be updated manually. **Recommendation:** Remove the local alias and import from `lib/sharing-settings.ts`.

---

### 🟡 MEDIUM: Child file sharing options not propagated on folder save

**File:** `app/api/projects/[projectId]/documents/[documentId]/sharing/route.ts`

**Problem:** When the Deliverable Detail Panel saves EC/EV download options on the folder, `syncDocumentSharingUsers` only syncs the folder itself. INHERITED child files keep stale options.

**Fix:** After saving folder sharing settings, fan-out a bulk update to all INHERITED child files:
```typescript
// After folder PUT succeeds:
const children = await prisma.engagementDocument.findMany({
  where: { parentId: folderExternalId, engagementId: projectId, isFolder: false }
})
await Promise.all(children.map(child =>
  prisma.engagementDocument.update({
    where: { id: child.id },
    data: { settings: buildSettingsForDb(child.settings, { share: { guest: { options: guestOptions }, externalCollaborator: { options: ecOptions } } }) }
  })
))
```
This is only triggered when saving from the Deliverable panel (folder route), not from individual file routes.

---

### 🟡 MEDIUM: Member removal does not revoke INHERITED rows on child files

**File:** `lib/inngest/functions.ts` — `revokeByRemovedMember` handler

**Problem:** When an EC/EV member is removed from the engagement, Inngest fires to revoke their per-document `connectorPermissionId`. But INHERITED rows on child files are inserted when the lane transitions — the revoke handler iterates `EngagementDocumentSharingUser` rows for this member. Since INHERITED rows will now exist for child files, revocation should already fire for them too (the handler queries by `userId`, not by status).

**Risk (low):** Verify the revoke handler does not skip INHERITED status rows. If it only targets GRANTED rows, child file access won't be revoked on member removal.

**Action:** Read `lib/inngest/functions.ts` revoke handler and confirm it targets all statuses or explicitly includes INHERITED.

---

### 🟡 MEDIUM: Role change (EM → EC) does not update sharing rows on existing Deliverables

**Observed scenario:** An `eng_member` has GRANTED rows inserted at `markAsDeliverable` time. If their role is later changed to `eng_ext_collaborator`, those GRANTED rows persist — they keep internal access but are now an external role. Conversely, a new EC member added *after* `markAsDeliverable` was called gets no rows at all.

**Root cause:** There is no API route for role changes today. When one is built, it must re-run the GRANTED-row fan-out for all existing Deliverable folders (and their INHERITED children) — adding rows for newly-internal members and revoking rows for members who left the internal roles.

**Action (future):** When implementing the role-change API, call a helper that queries all `settings.share.createdAt IS NOT NULL` folders in the engagement and upserts GRANTED/INHERITED rows to match the current `eng_admin`/`eng_member` member list.

---

### 🟢 LOW: Board tab beta redirect — two places

The redirect `if (!enableBetaFeatures || !canViewInternalTabs)` exists in `board/page.tsx`. When we remove the beta gate, also ensure the `engagement-workspace.tsx` tab trigger (lines 359–370) doesn't still check `enableBetaFeatures` — otherwise internal users see the tab but external roles get a blank route.

---

### Existing Tests — Impact Summary

| Test file | Touches affected code | Impact |
|-----------|----------------------|--------|
| `lib/sync-document-sharing.test.ts` | ✅ Directly tests `syncDocumentSharingUsers` | **Must add** test: EL/EM rows not revoked; INHERITED rows not overwritten |
| `lib/grant-engagement-drive-folder-access.test.ts` | Tests Drive access grant logic | Review: EL/EM GRANTED rows should not trigger Drive permission changes |
| `lib/connectors/sharing-actions.test.ts` | Tests connector-level share actions | Review for any `'done'` status references |
| All other tests | Connectors, billing, API handlers | Not affected by these changes |

No existing tests cover: ActivityStatus validation, board lane transitions, role-gated approve move, or Deliverable folder marking. New tests should be written for these during implementation.

---



- [ ] Upload a file (non-folder) and confirm `docId` is set (e.g. `NAV-7`); folder has no `docId` (or has `NAV-D-1` prefix)
- [ ] Mark a folder as Deliverable → verify it appears in Board under "To Do"; verify all child files get INHERITED rows in `engagement_document_sharing_users`
- [ ] Drag deliverable from To Do → In Progress → confirm EC can now see it in Files; confirm `settings.share.externalCollaborator.enabled = true`
- [ ] Drag to In Review → confirm EV (Reviewer) can now see it; `settings.share.guest.enabled = true`
- [ ] Try to move In Review → Approved as `eng_member` → should be blocked with toast
- [ ] Move to Approved as `eng_admin` → `finalizedAt` set; `DELIVERABLE_REVIEW_PENDING` notification dismissed
- [ ] EC attempts to upload file outside a Deliverable folder → blocked with correct error
- [ ] EC uploads inside Deliverable folder → INHERITED row created; file appears in Deliverable panel subtasks
- [ ] Comment on Deliverable panel; type `#` → autocomplete shows only INHERITED files of that deliverable
- [ ] Engagement Overview visible as `eng_viewer` (Reviewer) — delivery timeline shows all deliverables; folder health card hidden
- [ ] Members page and Pricing page show "Reviewer" (not "Viewer (External)")
- [ ] Delivery Health Score appears as a second score card in Overview; overdue deliverable triggers "warning" or "critical" level

---

## Phase 3B Test Cases — Approved Lock & Action Menu Cleanup

### #1 — Approved Deliverable: Lock write ops in Files tab

- [ ] **1a** — Files tab: open `...` on an `approved` deliverable folder — Rename, Duplicate, Copy, Move, Move to Bin, and Untag as Deliverable are all absent
- [ ] **1b** — Navigate *inside* an approved deliverable folder — "New File / Folder" button is absent from the top bar
- [ ] **1c** — Inside approved deliverable: open `...` on a child file — Rename, Duplicate, Copy, Move, Move to Bin all absent
- [ ] **1d** — Inside approved deliverable: open `...` on a child subfolder — Organize sub-menu and Move to Bin absent
- [ ] **1e** — Breadcrumb back to parent → open `...` on a non-approved deliverable — all write ops present normally
- [ ] **1f** — Non-approved deliverable folder: all write ops present in action menu

### #2 — Remove Finalize and Add Reminder from Files ActionMenu

- [ ] **2a** — Open `...` on any file row — "Finalize" and "Add Reminder" items absent
- [ ] **2b** — Open `...` on any folder row — "Finalize" and "Add Reminder" items absent (sanity check)

### #3 — Deliverable Details pane: DocumentActionMenu per subtask row

- [ ] **3a** — Board → open deliverable Details panel → hover over a document row — `...` appears on hover, opens the full DocumentActionMenu
- [ ] **3b** — Click "Move to Bin" on a subtask in a non-approved deliverable — row disappears from list immediately
- [ ] **3c** — Deliverable is `approved` → hover subtask row — `...` appears but Move to Bin is absent
- [ ] **3d** — Click "Open in Files" on a subtask — deeplinks to the correct file in the Files tab
