# Google Drive Connector — Setup Simplification

**Created:** 2026-08-07
**Source:** [docs/mvp/ux-journey-review.md](../../docs/mvp/ux-journey-review.md) — Journey 2 findings
**Status:** Spikes verified 2026-08-08, ready for implementation (all 4 phases)

Removes the copy-paste / watch-guide / create-folder-by-hand ritual from Google Shared Drive setup, and closes the surrounding discoverability gaps. No production users exist yet, so this ships as a clean cut with no migration, backfill, or dual-read.

---

## Verified platform constraints

Checked against Google's live docs on 2026-08-06. These bound the design — do not re-litigate without new evidence.

| Question | Answer | Source |
|---|---|---|
| Can the Picker select a **shared drive itself**? | **No.** `setEnableDrives` shows drives and their contents; selection is of items *within* a drive. | [setEnableDrives](https://developers.google.com/workspace/drive/picker/reference/picker.docsview.setenabledrives) |
| Can the app **list** shared drives (SharePoint-style)? | **No.** `drives.list` needs `drive` or `drive.readonly`; `drive.file` is not accepted. | [drives.list](https://developers.google.com/workspace/drive/api/reference/rest/v3/drives/list) |
| Can the app **discover** a hand-made `_firma` folder? | **No.** Under `drive.file`, `files.list` only returns files the app created or that were picked. | same scope model |
| Cost of adopting `drive`/`drive.readonly` | **Restricted** scopes: OAuth verification + **annual CASA assessment** + app-category eligibility. `drive.file` is non-sensitive. | [Choose Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [Restricted Scopes](https://support.google.com/cloud/answer/13464325) |
| Can the app create inside a **picked** folder? | **Yes.** `files.create` with `parents` — Google recommends `drive.file` + Picker for exactly this. | [Create and populate folders](https://developers.google.com/workspace/drive/api/guides/folder) |

**Conclusion:** SharePoint parity is unreachable without permanent restricted-scope compliance. This plan works within `drive.file` and does not attempt parity.

---

## Target design

Adopt the `_firma/<workspace>` structure that My Drive, OneDrive personal, and SharePoint already use — Shared Drive is currently the only path that doesn't.

```
<shared drive>
  └── <any folder the user picks>        ← user picks this (may be the drive's own top level content)
        └── _firma                        ← app creates (idempotent)
              └── _f_workspace_<random>   ← app creates, becomes rootFolderId
                    └── <firm>/<client>/<engagement>/…
```

**Rules:**
- The user picks a **parent**, not a pre-named target. Any folder is acceptable — if it isn't `_firma`, the app creates `_firma` inside it.
- The workspace folder is renamed `_f_workspace_<random>` so a picker query for `_firma` cannot also match workspace folders (`_firma_workspace_*` would collide on prefix).
- `findOrCreateFolder` already searches by name **and** parent ([google-drive-connector.ts:794](../../frontend/lib/google-drive-connector.ts:794)), so re-picking the same folder reuses `_firma` rather than duplicating it.

**Already in place — no backend work needed:**
- `createDriveFile` sends `supportsAllDrives=true` ([:775](../../frontend/lib/google-drive-connector.ts:775))
- `findOrCreateFolder` sends `includeItemsFromAllDrives=true` ([:800](../../frontend/lib/google-drive-connector.ts:800))
- `ensure-folder` already accepts `parentId` ([route.ts:504-518](../../frontend/app/api/connectors/google-drive/route.ts:504))
- `persistWorkspaceRootLocation` detects PERSONAL/SHARED from the folder's `driveId` ([:855-915](../../frontend/lib/google-drive-connector.ts:855)) — works unchanged at any nesting depth

**Hierarchy depth — verified safe.** All app-side ancestor walks are scoped to `engagement_documents` and terminate at the engagement boundary, so they never traverse `_firma` or the picked folder: `buildAncestorFoldersFromDB` (cap 15, [engagement-sharing-ids.ts:56](../../frontend/lib/engagement-sharing-ids.ts:56)), `isDescendantOfGrantedFolder` (cap 10, [document-sharing-access.ts:31](../../frontend/lib/document-sharing-access.ts:31)), descendant fan-out (cap 15, [:136](../../frontend/lib/engagement-sharing-ids.ts:136)). The one Drive-absolute walk, `getFolderBreadcrumb` (cap 6, [:4456](../../frontend/lib/google-drive-connector.ts:4456)), breaks on the first hop where `driveId` is present ([:4495](../../frontend/lib/google-drive-connector.ts:4495)) — and Drive v3 sets `driveId` on *every* item in a shared drive, so it resolves in one fetch regardless of nesting. Provisioning and migration operate on folder IDs and are depth-agnostic.

---

## Phase 0 — Spikes (blocking, ~half a day)

Both are cheap now and both change what gets built. Do these first.

**0.1 — Does a picker query for `_firma` match?**
Drive tokenizes on punctuation; a leading underscore may not match cleanly. Today's query works partly because the random hex suffix is a strong token.
- Create `_firma` by hand in a test shared drive.
- Run the picker with `setQuery('_firma')` and `setMimeTypes('application/vnd.google-apps.folder')`.
- Record: does it match? Does it also return `_f_workspace_*` folders?
- **If it doesn't match:** drop `setQuery` for the Shared Drive view and let the user browse. The flow still works — the query is a convenience, not a dependency.

**0.2 — Does the `drive.file` grant survive disconnect/reconnect?**
Load-bearing for Phase 2. Expectation is yes (the grant lives with Google, keyed on OAuth client + file ID, not in the token) but it is not worth assuming.
- Pick a folder, confirm `files.get` works.
- Disconnect the connector, reconnect the same Google account (same client ID).
- `files.get` the stored ID again.
- **If it fails:** Phase 2 is dead — cut it and keep the picker on every setup.

Record both outcomes in this file before starting Phase 1.

### Spike outcomes (verified 2026-08-08)

- **0.1 — Picker query for `_firma`:** Matched cleanly, no `_f_workspace_*` bleed-through. → Keep `setQuery('_firma')` as designed in 1.2; no change to the existing gate logic.
- **0.2 — Grant survives disconnect/reconnect:** Confirmed yes. → Phase 2 is fully in scope, build in full.

### Correction found during pre-implementation verification (2026-08-08)

Phase 1.3's instruction to delete `components/google-drive/google-drive-mock.tsx` "if nothing else imports it" does **not** apply — `frontend/app/(app)/d/onboarding/page.tsx` also imports `GoogleDriveMock`, `CALLOUTS`, and `STAGE_TO_STEP` from it, independently of `google-drive-workspace-root.tsx`. **Do not delete this file.** Only remove its import/usage from `google-drive-workspace-root.tsx`; the file and the onboarding page's usage stay untouched.

All other Phase 1 file/line claims in this doc were re-verified against current code on 2026-08-08 and matched within ±4 lines (trivial drift from unrelated edits since 2026-08-07) — no other corrections needed.

---

## Phase 1 — Core Shared Drive redesign

### 1.1 Name constants

`lib/generate-unique-workspace-folder-name.ts`
- Change template from `_${BRAND_NAME}_workspace_${suffix}_` to `_f_workspace_${suffix}`.
- Export a `FIRMA_PARENT_FOLDER_NAME = '_firma'` constant; replace the string literal currently hardcoded in `autoCreateMyDriveFolder` ([google-drive-workspace-root.tsx:225](../../frontend/components/google-drive/google-drive-workspace-root.tsx:225)).
- Drop the three `@deprecated` aliases in the same file — nothing should reference them; confirm with a grep before removing.

Note: this generator is shared with My Drive and `ensureDefaultWorkspaceRoot` ([:836](../../frontend/lib/google-drive-connector.ts:836)). Renaming all paths is intended.

### 1.2 Picker view

`components/google-drive/google-picker-button.tsx`
- Shared Drives view: keep `setEnableDrives(true)`, `setSelectFolderEnabled(true)`, `setMimeTypes(folder)`.
- Gate `setQuery` on the Phase 0.1 result.
- Update the label/comment — this view now selects a **parent location**, not a pre-created target.

### 1.3 Wizard collapse

`components/google-drive/google-drive-workspace-root.tsx` — the bulk of the work.

**Edit order — additions before deletions.** The file's still-live code (My Drive branch, confirm panel, `migrationLocked`/`connectorActive` gating) references state that the new code also touches; deleting first leaves the component non-compiling for the length of the edit. Land `createWorkspaceUnder`, the new `handleFolderPicked`, the create-after-confirm change to `confirmMigration`, and the new screen JSX (all specified below) first; only then delete the items in the list below; run `tsc --noEmit` clean before moving to 1.4.

**Delete:**
- `generatedFolderName` state, the copy box, `copyGeneratedFolderName`, `hasCopied`
- `hasWatchedGuide`, the `GoogleDriveMock` guide block, the "Play Guide" button
- `hasOpenedDrive` and every gate derived from it ([:792-795](../../frontend/components/google-drive/google-drive-workspace-root.tsx:792), [:823](../../frontend/components/google-drive/google-drive-workspace-root.tsx:823))
- The whole `currentStep` nested-ternary ([:414-423](../../frontend/components/google-drive/google-drive-workspace-root.tsx:414))
- ~~`components/google-drive/google-drive-mock.tsx` if nothing else imports it~~ — **do not delete**: `app/(app)/d/onboarding/page.tsx` also imports `GoogleDriveMock`/`CALLOUTS`/`STAGE_TO_STEP` independently (confirmed 2026-08-08). Only remove this file's *usage* from `google-drive-workspace-root.tsx`.

**New Shared Drive screen** — one step, no gating:
- Heading: *"Choose where Firma should work"*
- Body: *"Pick a folder in your shared drive. We'll create a `_firma` folder inside it and keep everything there."*
- Constraint note (finding 2.8): *"Google only lets apps see folders you explicitly select, so this step is manual. Microsoft doesn't have this restriction."*
- Empty-drive hint: *"No folders in your shared drive yet? Create one in Drive — any name works — then select it."*
- Buttons: **Open Shared Drives** (ungated, opens in a tab) · **Select Folder** (opens picker)

**New `handleFolderPicked(parent)`:**
```
1. ensure-folder { name: '_firma', parentId: parent.id }        → firmaId
2. ensure-folder { name: _f_workspace_<random>, parentId: firmaId } → newRootId
3. update-root-folder { rootFolderId: newRootId, firmId }
```
Steps 1–2 reuse `autoCreateMyDriveFolder`'s logic verbatim, differing only in the starting parent. Factor the shared body into one helper (`createWorkspaceUnder(parentId)`) called by both the My Drive and Shared Drive paths.

**Migration branch — ordering matters.** Today `handleFolderPicked` compares the picked ID against `rootFolderId` and jumps to the confirm step ([:332-339](../../frontend/components/google-drive/google-drive-workspace-root.tsx:332)). That comparison no longer works, because the picked item is now the *parent* and the new root doesn't exist yet.

> **Create the workspace folder only after the user confirms.** When `rootFolderId` is already set: resolve the breadcrumb of the **picked parent** for the "To" panel, show the existing confirm step, and run steps 1–3 inside `confirmMigration`. Creating before confirmation would orphan an empty `_f_workspace_*` on cancel.

**Keep unchanged:** the My Drive branch, the personal-account auto-create effect ([:283](../../frontend/components/google-drive/google-drive-workspace-root.tsx:283)), the From→To confirm panel, `migrationLocked`, `connectorActive`.

### 1.4 Step indicator

Fix `totalSteps` at 2 (Location → Select), matching OneDrive's fix and its stated reason — *"so the bar doesn't jump/reflow once a location is chosen"* ([onedrive-workspace-root.tsx:273-275](../../frontend/components/connectors/onedrive-workspace-root.tsx:273)). Add 1 only when `rootFolderId` exists (migration confirm). Closes finding 2.5; 2.6 disappears with the gates.

**Acceptance:** connecting a Workspace account and choosing Shared Drive reaches a working workspace root in two clicks plus one picker interaction, with no clipboard use and no folder created by hand — provided the shared drive has at least one folder.

---

## Phase 2 — Reuse a known `_firma` (spike 0.2 confirmed 2026-08-08 — build in full)

Skip the picker entirely on repeat setups. This is where most of the real-world saving is for a firm onboarding many clients.

**Data model:** extend `Connector.settings` JSON rather than a new table — `settings` already holds `rootFolderId`/`parentFolderId` in this same route, and `externalAccountId` is already an indexed column on `Connector`, so no migration or extra join is needed:

```
settings.knownFirmaFolders: Array<{ sharedDriveId, driveName, firmaFolderId, lastVerifiedAt }>
```

- Persist this entry when a Shared Drive setup completes, written in `update-root-folder` (route.ts:338) right after `persistWorkspaceRootLocation` resolves the location to `SHARED`.
- Add a `list-known-firma-folders` action in `route.ts` that queries sibling `Connector` rows sharing `externalAccountId`, dedupes by `firmaFolderId`, and calls `files.get` on each to filter to still-live ones.
- Offer them as one-click options in `google-drive-workspace-root.tsx` — *"Use `_firma` in **Marketing Shared Drive**"* — above a **Pick a different location** fallback into the Phase 1 picker flow.
- Stale/deleted folders: drop silently from the list, fall through to the picker.
- Small helper for the sibling-connector query + liveness check belongs near `persistWorkspaceRootLocation` in `google-drive-connector.ts`.

**Not a Drive search.** Discovery is impossible under `drive.file`; this works only because the app already holds a grant on those specific folder IDs.

---

## Phase 3 — Discoverability

Independent of Phase 1; can ship in parallel.

**3.1 — Storage in onboarding (finding 2.2) — SKIPPED 2026-08-08.** `components/onboarding/onboarding-sidebar.tsx:26-27` lists only *Initialize Workspace* and *Subscribe*. This plan proposed adding *Connect storage* as a mandatory step 2. However, `app/(app)/d/onboarding/page.tsx:952` carries a comment — "Drive/Finalize steps removed — onboarding ends at Subscribe" — showing Drive connection was already deliberately moved OUT of onboarding into per-client Client Settings, as a later architectural decision than this plan doc. Re-adding it as a mandatory onboarding step would reverse that decision. Skipped; if storage-in-onboarding is still wanted, it needs a fresh decision, not a reinstatement of superseded behavior.

**3.2 — Real connectors page (finding 2.3).** `app/(app)/d/f/[slug]/connectors/page.tsx` currently redirects to the firm page — a dead URL with no linkable address for connector setup. Either render `FirmDriveSection` there and point onboarding + empty states at it, or delete the route. Prefer the former; 3.1 needs somewhere to link.

**3.3 — Attachment coverage (finding 2.4).** A firm connector attached to zero clients stores nothing, and the firm-level UI never says so. On the connector card in `components/connectors/firm-drive-section.tsx`, show *"Attached to 2 of 7 clients"* with a bulk **Attach to all clients** action. Data is already loaded (`allClients`, `attachingClientId`).

**3.4 — Files empty state — already implemented, verified 2026-08-08.** `components/projects/engagement-file-list.tsx:2629-2683` already covers this: when `!connectorRootFolderId`, it branches on `clientConnectorId` — attached-but-not-set-up shows "Drive folder not set up" with a Migrate/Set-up-folder action; no connector at all shows "No Google Drive connected" with a "Go to Settings" link to `?tab=settings&section=storage` (the same deep link Phase 3.2 wires up). No changes needed.

---

## Phase 4 — Migration UX (finding 2.7) — IMPLEMENTED 2026-08-08

Investigation before implementing found this finding's premise partially stale: `migrateWorkspaceRoot` (`lib/inngest/functions.ts`) already **unconditionally** notifies all firm members via email and waits a 2-minute grace period before locking — this was already true, just not surfaced as a user choice. What was actually missing was narrower: a UI choice between that fixed 2-minute grace and a longer delay.

Implemented:
- `confirmMigration` now takes a `graceMinutes: 2 | 15` param; confirm-step JSX offers **Start Now** (2 min, unchanged default) vs **Notify & start in 15 min** as two buttons instead of one.
- `graceMinutes` threads through `migrate-and-update-root` (route.ts) → `workspace.migrate.requested` Inngest event (`lib/inngest/types.ts` — new optional field) → `migrateWorkspaceRoot`'s `step.sleep('grace-period', ...)`, which was previously hardcoded to `'2m'`. Clamped to `[2, 60]` minutes both in the API route and again in the Inngest job (defense in depth, since the value rides in on a request body).
- `sendMaintenanceWarningToFirmMembers` gained a `graceMinutes` param (default 2) so the notification email's "Starts in: ~N minutes" text matches the actual chosen delay instead of always claiming "~2 minutes."
- The in-app notice on lock-begin (`firma:migration-started` event dispatch) was already present in `confirmMigration` before this change — no new work needed there, matching the plan's second bullet.

---

## Out of scope

**Service account as shared-drive Content Manager.** Would give full programmatic access with no restricted scope — the user adds an SA email as a member, and content in a shared drive is owned by the drive, so no SA quota issue. Rejected for now because Drive-side actions would be attributed to the service account rather than the acting user, which conflicts with the engagement Audit tab.

Worth noting the switching cost is at its floor right now (no users, no attribution history). If this is a live question, decide it before Phase 1 rather than after.

**Restricted-scope migration.** See constraints table. Not proposed.

---

## Testing

Manual, against a Google Workspace test account with at least two shared drives:

1. Shared drive **with** existing folders → pick one → `_firma/_f_workspace_*` created, hierarchy provisions, breadcrumb badge shows `Shared drive · <name>`
2. Shared drive **with no** folders → hint shown → create any folder → pick → same result
3. Pick a folder already containing `_firma` → reuses it, no duplicate
4. Two connectors on the same picked parent → distinct `_f_workspace_*` under one `_firma`
5. Personal Gmail account → still auto-creates in My Drive, no dialog, Migrate hidden
6. Workspace account, My Drive → auto-creates, new name template
7. Migration: existing root → pick new parent → confirm panel shows correct From/To → items move
8. Migration **cancelled** at confirm → no orphan `_f_workspace_*` in Drive
9. Deep-nested picked folder (4+ levels into a shared drive) → breadcrumb still resolves
10. Disconnected connector → folder actions disabled, reconnect hint shown

`tsc --noEmit` clean. No new unit tests expected — the existing workspace-root components have none, matching OneDrive's.

---

## Rollout

No production users; the test account can be wiped and recreated. Therefore: no feature flag, no dual-read, no backfill, no mixed-name state.

**Wipe both sides together.** `drive.file` grants are bound to the *file ID* — deleting `_firma` in Drive and recreating it by hand produces a new ID the app has no grant on, while the DB may still hold the old one, and `files.get` will fail in a way that reads as a bug rather than a stale fixture. `frontend/scripts/cleanup-org.ts` already pairs DB cascade-delete with Drive folder removal; use it.

Keep the current Shared Drive flow reachable (behind a local toggle or an unrouted component) until Phase 1 is tested end to end — per standing practice, don't delete it until sign-off.
