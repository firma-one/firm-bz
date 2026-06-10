# Connector Stress Test Cases

> **QA Reference** — moved from `.claude/plans/` to `docs/qa/` on 2026-06-10.
> Open items are tracked in [docs/mvp/todo.md](../mvp/todo.md).

## Summary

- `1` ✅ Remove connector → re-add
- `2` ✅ Remove → re-add → pick same Shared Drive folder (idempotent)
- `3` ✅ Disconnect → reconnect (same Google account)
- `4` ✅ Disconnect → reconnect (different Google account)
- `5` ✅ Link client → unlink → re-link
- `6` ✅ Link a second client
- `7` ✅ Link client with multiple existing engagements
- `8` ✅ Create new engagement after client already linked
- `9` ⚠️ Engagement folder manually deleted from Drive — deferred
- `10` 🔲 Same Google account connected to two firms — not tested
- `11` 🔲 Workspace root folder deleted from Drive — not tested
- `12` ⚠️ Shared Drive with restricted permissions (Contributor role) — deferred
- `13` ⚠️ Remove → re-add → existing Drive files not re-indexed — deferred
- `14` 🔲 Remove → re-add → pick DIFFERENT workspace folder — needs retest after fix

---

## Connector Lifecycle

### 1. Remove → re-add

**Result:** ✅ Pass

Firm folder, client folder, and engagement folders all re-created fresh on Drive in the new workspace root.

**Fix applied (2026-06-10):** Engagement folders were previously created in the old workspace after re-add. Root cause: `detachConnectorFromClient` was not clearing `engagement.connectorRootFolderId` at unlink time, leaving stale IDs. Fixed in `detachConnectorFromClient` (clears engagement folder IDs on unlink) and `removeConnector` (clears `engagementDocument.connectorId` directly by `connectorId`).

---

### 14. Remove → re-add → pick DIFFERENT workspace folder

**Result:** 🔲 Needs retest

**Root cause (found 2026-06-10):** When `update-root-folder` was called with a new workspace root, `setupFirmFolder` was skipped because `firm.firmFolderId` was already set (from the client re-link that ran before the folder was picked). `ensureAppFolderStructure` then used the stale `firmFolderId` (old workspace) as `orgFolderId`, creating all client/engagement/General folders in the old workspace instead of the new one. Uploads subsequently landed in the old workspace.

**Fix applied (2026-06-10):** In `update-root-folder` (`route.ts`): detect `workspaceChanged` by comparing `prevSettings.rootFolderId` to `newRootId`; when changed, clear stale folder IDs (`orgFolderId`, `clientFolderIds`, `projectFolderIds`, `projectFolderSettings`, `organizations`) from connector settings before provisioning, and always call `setupFirmFolder` regardless of whether `firmFolderId` is set. Same `workspaceChanged` guard added to the OAuth callback path.

---

### 2. Remove → re-add → pick same Shared Drive folder

**Result:** ✅ Pass

No duplicate folders created. `findOrCreate` is idempotent — existing folders found by name and reused.

---

### 3. Disconnect → reconnect (same Google account)

**Result:** ✅ Pass

Folders NOT re-created. `firm.firmFolderId` stays set. Workspace root restored from REVOKED connector settings via `storeConnection` dedup.

---

### 4. Disconnect → reconnect (different Google account)

**Result:** ✅ Pass

OAuth rejects the alternate account and returns an `account_mismatch` error. Fix: `login_hint` passed on OAuth redirect + server-side guard in callback.

---

## Client Linking

### 5. Link client → unlink → re-link

**Result:** ✅ Pass

Existing client folder reused on Drive. No duplicate created.

---

### 6. Link a second client

**Result:** ✅ Pass

Second folder created alongside first inside firm folder. First client unaffected.

---

### 7. Link client with multiple existing engagements

**Result:** ✅ Pass

All engagement folders created on Drive. All `connectorRootFolderId` values saved in DB.

---

## Engagement Folders

### 8. Create new engagement after client already linked

**Result:** ✅ Pass

Engagement folder created immediately on Drive when engagement is created.

---

### 9. Engagement folder manually deleted from Drive

**Result:** ⚠️ Known limitation — deferred

**Test steps:**

1. Connector set up, client linked, engagement folder exists on Shared Drive
2. Manually delete the engagement folder (e.g. `AIMS Awareness Training`) directly from Google Drive
3. Go to the engagement Files tab in the app
4. Upload a file

**Findings:**

- Upload reports success in the app — no error shown
- File is NOT visible in the expected Shared Drive hierarchy
- Drive created a `General/` subfolder inside the trashed folder ID and wrote the file there
- File shows up in Drive search but its parent (`General`) is sitting in the Bin
- "Open containing Folder in Drive" opens My Drive root, not the orphaned folder
- **Root cause:** `engagement.connectorRootFolderId` in DB still points to the deleted folder ID; `findOrCreateFolder` does not check if the parent is trashed before writing into it

**Proposed fix (lazy recovery):**

In `getProjectFolderIds`, when `listFiles(connectionId, projectFolderId)` returns a 404/trash error — catch that error → re-run `ensureAppFolderStructure` to recreate the engagement folder → update `engagement.connectorRootFolderId` in DB → retry with new folder ID.

**Performance concerns:**

| Check point | Overhead |
|-------------|----------|
| Happy path | Zero — check only triggers on Drive API error |
| `fileExists` proactive check (rejected) | ~100ms per upload; 50 extra Drive API calls on bulk folder upload |
| Page load check in `getProjectFolderIds` | Non-blocking but delays file list; adds to existing multiple Drive list calls |
| DB update + reindex on recovery | `connectorRootFolderId` updated correctly; reindex not triggered (new folder is empty — correct) |

**Decision:** Skip for now. Self-inflicted edge case (requires manual Drive folder deletion bypassing the app). Revisit if reported by a customer.

---

## Edge Cases

### 10. Same Google account connected to two firms

**Result:** 🔲 Not tested

Should be blocked by cross-firm share guard.

---

### 11. Workspace root folder deleted from Drive

**Result:** 🔲 Not tested

Next upload should show a meaningful error, not a raw Drive API error.

---

### 12. Shared Drive with restricted permissions (Contributor role)

**Result:** ⚠️ Deferred — validate with real ICP onboarding

**Real-world scenario:**

Firm admin (CA/consultant) connects their **client's Google Workspace Shared Drive** — the client's IT admin created the Shared Drive and added the firm admin as a `Contributor` or `Content Manager`, not as a `Manager`. This is a core ICP journey (accounting/consulting firm working inside the client's Drive), not an edge case.

**The risk:**

When firma creates folders (firm, client, engagement), it calls `restrictIfSupported` on each to set owner-only sharing permissions. On a Shared Drive where the connected account is not a `Manager`, the Drive API may reject the permission change. If `restrictIfSupported` throws instead of silently skipping, the entire folder creation flow fails even though the folder itself was created successfully.

**How to test:**

Connect to a Shared Drive where the firma account is `Contributor` or `Content Manager` (not `Manager`) → set workspace root → link a client → check if folders are created or if the flow errors out.

**Decision:** Skip pre-launch. Validate during early ICP onboarding — if firm-inside-client's-Drive is a real pattern among first users, fix then.

---

### 13. Remove connector → re-add → existing Drive files not re-indexed

**Result:** ⚠️ Known limitation — deferred

**Scenario:**

Firm admin removes the connector (hard delete). Re-adds with the same Google account. Re-links clients. `EngagementDocument` records survive removal but with `connectorId = null` (cleared by `removeConnector`). Drive file listing restores correctly (folder IDs healed via `findOrCreate`), but `EngagementDocument.connectorId` remains null until each document is explicitly re-indexed.

**Impact:**

| Feature | State after re-link |
|---------|---------------------|
| File listing in engagement Files tab | ✅ Works — reads from Drive via `connectorRootFolderId` |
| Sharing, permission expiry | ❌ Broken — reads `EngagementDocument.connectorId` which is null |
| `updateAppProperties`, search indexing | ❌ Skipped — same null `connectorId` issue |

**No automated recovery:** re-linking a client does not trigger a re-index. Each document needs to be re-uploaded or explicitly re-indexed via `index-file-intake` to restore `connectorId`.

**Decision:** Skip pre-launch. Requires a deliberate Remove (not Disconnect) followed by re-add — uncommon in normal usage. Add a bulk re-index trigger to the re-link flow if reported post-launch.
