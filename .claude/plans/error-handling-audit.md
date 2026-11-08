# User-facing error handling: audit

**Status:** inventory 2026-11-07; **fixed 2026-11-08**, uncommitted on `dev` at the time of writing. Every P0 and P1 is fixed, and every P2 except P2-46 and P2-63 (see "Still open" below). Line numbers in the tables are from the inventory, before the fixes. Raw pass output is in [error-handling-audit-inventory.md](error-handling-audit-inventory.md).

## Fix status, 2026-11-08

Six fix agents worked in three waves, each owning its own files, with a typecheck and the full suite between waves. Each fix has a test next to it. **Nothing ran against a live Drive, OneDrive, Polar or production**: every fix is checked by tests and by reading the code.

**What changed, by root cause**
1. **Server action reasons.** `lib/actions/action-result.ts` adds `asResult`, `ActionResult` and `userFacing`. Browser-called actions answer `{ ok, error, warning }` and never throw a reason. The guard `lib/actions/action-result-guard.test.ts` fails on a dropped result, on `e.message` from a throwing action, on `instanceof` against an action error class, and on a `userFacing` throw from an export that doesn't return `ActionResult`. The plan-cap throws in `lib/billing` are `userFacing` too.
2. **Permission methods.** `revokePermission`, `grantFolderPermission`, the folder downgrade and upgrade calls, and `listFilePermissions` throw `StorageFailure` on a refusal on both providers. New adapter methods: `revokeFolderPermissionByEmail`, `restrictFolderToOwnerOnly` and `getTrashState`. Every Drive permission URL carries `supportsAllDrives=true`, enforced by a guard test.
3. **Record kept until confirmed.** A revoked row keeps its permission id until storage confirms. Demote, removal, engagement delete, unlock, reject and Internal only all revoke before erasing, and keep what storage refused.
4. **Jobs report.** `safeInngestSend` returns a boolean. Revoke and grant jobs retry once, then send the new Inbox notice `STORAGE_ACCESS_NOT_CHANGED` to the Leads (`lib/storage-access-notice.ts`). A failed workspace move is recorded as failed.
5. **Failed loads.** `components/ui/load-failed.tsx` replaces every false empty in the audit.
6. **Writes read the answer.** `useSaving` toasts any rejected save. The deliverable pane, comments, Board, Inbox and push read `.ok` and roll back.
7. **Partial results.** "X of Y" with what failed and why, from `lib/files/partial-outcome.ts`, covering upload, import, folder copy, ZIP, Attach all, health report and scaffold.
8. **Storage reasons everywhere.** Preview, download, sharing, intake, folder create and list, upload start, and connector setup all carry `StorageFailure` words. A null token gives the `reconnect` reason.
9. **Legacy `Firm.connectorId`.** No longer read by Migrate, Dossier, the sharing and intake routes, connector setup or the Board. The remaining readers are admin, dead onboarding routes and the last fallback in `resolve-client-connector.ts`.
10. **Dead paths.** The deliverable pane's trash, onboarding's removed `create-sandbox` and the invite's Sign Out now point at working code.

**Decisions taken as recommended** (the table below): partial copies keep what worked and report "X of Y"; jobs notify the Leads in the Inbox; a refused grant or an unpreparable PDF copy refuses the open for Contributor · Limited Access and Reviewer; removing or lowering a role takes back folder access; demote revokes; reject trashes first and keeps the row on refusal.

**Behavior changes to know about**
- Search for Contributor · Limited Access and Reviewer is now limited to what's shared with them. Before, it was unfiltered.
- Bulk download is scoped to the engagement. It applies `allowDownload` and the private-document rule, and leaves out a Reviewer's PDF-only files.
- The deliverable pane asks before Move to trash. The /tour demo pane isn't mirrored.
- The members list fails as a whole if one person's lookup fails, rather than quietly leaving them out. Every picker shows the failure with a retry.
- `getUserFirms` throws on a database failure, so `/d` shows the error page instead of "no firms".
- A paid Polar webhook that matches no group answers 500, so Polar retries, and is logged as an error. In the sandbox it only warns.
- Reprovision firms (admin) refuses with 409, because nothing listens for its event.
- Fixed in passing: corrupt small ZIPs (a pooled Buffer's `.buffer`), the regrant email saying "POCKETT", and the maintenance GET ordering by a column that doesn't exist.

**Still open**
- **Check 1** (production #441): not seen in a browser. The fix doesn't depend on it.
- **Check 3** (Shared Drive revoke): fixed in code and guard-tested, not tried on a live Shared Drive.
- **P2-46** `lib/email.ts` returns as if sent when SMTP is unset: left alone, because another session works on email.
- **P2-63** dead routes: kept, per the rule of no deletion until sign-off. `lib/actions/client-errors.ts` is unused now and kept for the same reason.
- `removeFirmMember` keeps the person's engagement rows. This predates the audit and belongs with the access-gates work.
- `getRecentVisits` answers `[]` on failure. It's deliberate: recents are a convenience list.
- The reminders panel's done and hide buttons are commented out, so their new error paths can't be reached yet.
- Live checks worth doing before launch: on a real Drive and OneDrive, with an account that isn't the Drive's owner, revoke, remove a member, lower a role, demote, lock and unlock, then confirm in Drive that access really changed.

**Question (Deepak):** "Should we should audit such and other user encountered - error handling scenarios ?" It came from a rename toast that said only "Failed to rename file" while OneDrive had the file locked. His rule: "We cant have no reason being stated."

**Short answer:** yes, and the problem is bigger than weak toast wording.
1. **Firma says access is gone when it isn't.** Revoke Access, Remove member, lowering a role and demoting a deliverable all report success while the Drive or OneDrive permission stays. Several of these happen every time, with no failure involved.
2. **In production, the reasons server actions throw never reach the browser.** 165 `throw new Error` statements arrive as "Minified React error #441". About 30 catch sites show that text, including "A client with this name already exists" and plan limits. It reads fine in `next dev`, which is why it has gone unnoticed.
3. **Failures are reported as success.** Uploads, imports, folder copies, ZIPs and the deliverable pane all have paths that say "complete" when the work did not finish.
4. **Failed loads read as "nothing there".** A failed load shows "You're all caught up", "No deliverables yet" or "No results found". The person can't tell a failure from an empty list.

## Counts

| Severity | Meaning | Count |
|---|---|---:|
| **P0** | Looks like it worked but didn't, or data at risk | **52** (44 false successes or data at risk, 8 failed loads shown as empty) |
| **P1** | Failure on a common path with no reason | **79** |
| **P2** | Rare path or weak message | **66** |
| Not findings | Read and judged fine: audit logging, best-effort reminders, fail-open cap checks, browser storage | about 300 |

| Area | P0 | P1 | P2 |
|---|---:|---:|---:|
| Sharing and access | 12 | 6 | 4 |
| Approvals | 3 | 3 | 0 |
| Files | 6 | 14 | 13 |
| Uploads | 3 | 3 | 4 |
| Board and deliverables | 6 | 6 | 4 |
| Comments | 1 | 6 | 0 |
| Members and invites | 2 | 8 | 1 |
| Connectors | 7 | 9 | 8 |
| Settings | 2 | 3 | 6 |
| Billing | 2 | 4 | 6 |
| Onboarding and sign-in | 0 | 5 | 3 |
| Notifications and inbox | 3 | 1 | 5 |
| Search | 1 | 1 | 1 |
| Brio | 0 | 4 | 2 |
| Support, admin, marketing, dead paths | 1 | 0 | 6 |
| Dossier (beta) | 2 | 1 | 1 |
| Other | 1 | 5 | 2 |

**The first sweep's rough grep counts**, against what reading found: the 88 generic route answers are 128 lines on a wider search, and many of them nobody sees (P2-63, P2-64). The 47 dropped storage answers are mostly permission methods (root cause 2). The 17 "Error" toasts are 16, across P1 and P2. The 44 silent catches are 114 on a wider search plus 193 that only log; most are deliberate.

**How this was checked.** Five read-only passes covered every `app/api` route, everything under `lib` and `app/actions`, and all mounted UI; candidates came from ten grep lists, but each row was read in the code. I then read **every P0 myself** against the current code. That reading changed three: one claim was wrong (see P1-23) and two were demoted (P1-56, P2-26). **P1 and P2 rows are the passes' reading, spot-checked, not all re-read by me: confirm each when fixing.** Nothing ran. No build, no live Drive, no production. "Read from code" means exactly that.

---

## Check these first (no code)

| # | Check | Why | Time |
|---|---|---|---|
| 1 | In production, try **Add client** with a name that already exists | Confirms root cause 1. The browser's production build returns `Error(formatProdErrorMessage(441))` from `resolveErrorProd`, read in `node_modules/next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-client.browser.production.js:1598`. Next documents this too, but I haven't seen it in a browser. | 1 minute |
| 2 | Count firms with `Firm.connectorId` set | Decides CN-1 and DO-1, plus the fallback in four sharing routes. I found nothing in the connect flow that writes it: the only writer is `lib/services/connection-manager.ts:53`, reached only through `auto-import`. | 1 minute |
| 3 | On a throwaway file in a **Shared Drive**, revoke a permission with `GoogleDriveConnector.revokePermission`, then look at Drive | `lib/google-drive-connector.ts:3294` is the one permission call without `supportsAllDrives=true`, and `:3300` counts a 404 as "already gone". If Drive answers 404 without that flag, as I recall it does, **every revoke on a Shared Drive reports success and revokes nothing**. Unverified. | 5 minutes |

---

## Root causes

**1. Server actions throw reasons the browser can't receive.** `lib/actions/**` holds 165 throws that cross raw: 36 are reasons a person needs (plan limit, name taken, due date rule, last admin), 71 not-allowed checks, 58 stale-id or programmer checks (pass C's tally). Custom classes don't survive either, so `e instanceof ClientLinkedFolderFailedError` at `firm-drive-section.tsx:565` is always false in the browser, and the ticket number in its message never arrives. The good shape already exists: `lib/server-action-wrapper.ts`, `acceptInvitationAction`, `createOwnWorkspace` and `updateProfileNames` return `{ error }`. Fixing each `catch` can't help, because the words never arrive.

**2. Permission methods flatten the provider's answer to `boolean` or `null`.** `grantFolderPermission`, `grantFilePermission`, `revokePermission`, `patchFilePermissionRole`, `setFileContentReadOnly`, `revokeFolderPermissionByEmail` and `restrictFolderToOwnerOnly` all do this, while rename, move and copy now throw `StorageFailure`. Most callers don't read the result at all.

**3. The record is erased before the work is confirmed.** The rule "keep the permission id until the revoke is confirmed" is already written in `revoke-share-permissions.ts` and `private-documents.ts`. These break it: `sync-document-sharing.ts:57,131` (AC-1), `removeMember` (AC-3), `deleteProject` (AC-7), `unlock/route.ts:85` (AP-2), `intake/route.ts:285` (AP-3), `onedrive/sites/route.ts:160` (CN-2), `google-drive/route.ts:670` (CN-1).

**4. Background jobs have no way to tell anyone.** `safeInngestSend` returns void and swallows failures. That's fine for indexing, but wrong for `sharing.settings.updated`, the only thing that takes access back. Revoke jobs end green when storage refuses, so Inngest never retries. Only one job has `onFailure`, and it mislabels the run (CN-6). There's no channel for a job to reach a person; `createEventNotifications` could be it.

**5. `r.ok ? r.json() : <empty>` and `.catch(() => [])`.** A failure becomes the same value as "none", so the empty state speaks with confidence. These screens need a third state: failed. `global-search-view.tsx:632` even has a comment naming the difference, then draws the same empty screen.

**6. `await fetch(...)` with no `.ok` check on writes.** `deliverable-detail-panel.tsx` alone has four. `useSaving` in `components/ui/property-cells.tsx:27-31` is `try/finally` with no `catch`, so any rejected `onChange` is silent in every property cell. `failureFrom` and `failureReason` exist but only the file-ops hook and file list use them.

**7. Partial results are reported as totals.** ZIP, import, folder copy, Attach all, health report. Some routes prepare an answer nobody reads: `X-Bulk-Download-Skipped` and `-Failed` are read nowhere. `upload-progress-panel.tsx:88-92` already says "1 of 3 uploaded · 2 failed" and draws each reason, so that's the model.

**8. `StorageFailure` stops at the file actions.** Nothing under `app/api/projects/` uses it except through `drive-action`. Preview, download, sharing, regrant, intake, finalize, unlock, due date, versions, folder creation, folder listing and upload start all end in a generic catch. `getAccessToken` returns null, so each caller invents its own words for "needs reconnecting".

**9. Legacy `Firm.connectorId` is still read.** Migrate (`google-drive/route.ts:689`), Dossier (`engagement-wiki.ts:155,246`), the sharing `finalize`, `unlock` and `accept` routes, `intake/route.ts:111,293`, `shares/route.ts:47`. Where it's null they do nothing or refuse, usually without saying so.

**10. Dead paths still wired up.** `/documents/[id]/trash` (BD-1), `/api/onboarding/create-sandbox` (P1-22), `/api/auth/signout` (P1-18), `project.member.removed` (AC-3), `repair-org-folder` (no caller), `skip-upgrade`'s sandbox lookup (P2-48).

---

## Decisions needed

| # | Question | Recommendation |
|---|---|---|
| 1 | What should a partial folder copy say? | Keep what was copied and report it: "Copied 12 of 15 files to Acme Audit. Not copied: Budget.xlsx (Google Drive has it locked), Q3.pdf, Notes.docx." Nothing copied is an error toast. Rolling back deletes work that succeeded. Use the same wording for import and ZIP. OneDrive's copy is one Graph call with no per-file result, so it can only report the whole. |
| 2 | Where does a job tell a person? | An Inbox notice to the engagement's Lead, with Retry. A revoke or grant runs after the toast, so a toast can't carry it. |
| 3 | When a grant is refused, or the PDF copy can't be made, should the open go ahead? | Refuse it (AC-9, AC-10). "PDF only" is a promise the firm made about its file. |
| 4 | Should removing a Lead or Contributor take back folder access? | Yes (AC-4). Graph has no revoke-by-email, so OneDrive needs its permissions listed first. |
| 5 | Should demoting a deliverable revoke access? | Yes (AC-8). The code's own comment says "Use "Untag as Deliverable" to fully revoke." |
| 6 | On reject, which goes first: the trash or the row delete? | Trash first, and keep the row if it's refused (AP-3). |

---

## Fix batches, in order

Each batch ends with a guard test, in the style of `tour-parity.test.tsx` and the server-action identity guard, so it can't regress. New wording follows the existing rules: title names the action, American English, middle dot rather than em dash. Sample copy here says Firma; real strings use `BRAND_NAME`.

| Batch | What | Clears | Size |
|---|---|---|---|
| **0** | The three checks above | Settles CN-1, DO-1 and the Shared Drive risk | Minutes |
| **1. Access** | Keep permission ids until storage confirms. Permission methods throw `StorageFailure`. Revoke jobs retry and report through an Inbox notice. Must-happen events report failure to send. Fix removal, role change, demote and delete. Refuse PDF-only fallback and the false "Check your email". Stop the delivery toggle turning Reviewers off. Lock, unlock and reject. Also the two access gaps below. | AC-1 to 12, AP-1 to 3, P1-54 to 60 | Large. Can land as 1a (order and refusals, no new UI) and 1b (notice to the Lead) |
| **2. Server action reasons** | Actions return `{ error, code }` instead of throwing a reason. Guard test: no person-facing throw in a `'use server'` file. | P1-01 to 13, P1-14, CN-4, ST-2 | Medium, mostly mechanical. Widest visible win for the effort |
| **3. False success in daily work** | Upload and intake indexing, import, folder copy, ZIP, deliverable pane writes and its missing trash route, details pane, mentions, resend, Attach, health report, push, crash report, Firm Settings and Dossier overwrite. | FI-1 to 7, BD-1 to 4, CM-1, MB-1, CN-5, ST-1, OT-1 to 3, DO-1 and 2 | Medium to large |
| **4. Connectors and migration** | Migrate, site selection, folder setup, migration status, cancel. Then OAuth codes, popup blocked, reconnect words, Test. Retire `Firm.connectorId` reads. | CN-1 to 3, CN-6, CN-7, P1-28 to 35 | Medium |
| **5. Billing** | Webhook with no group must reach an operator. Hold Checkout until the plan loads. Keep checkout errors inside the app. Success page checks activation. | BL-1, BL-2, P1-24 to 27 | Small to medium |
| **6. Failed loads** | One load-state shape (`loading`, `ready`, `failed` with reason), then every false empty. | EM-1 to 8, P1-45, 46, 66 to 69, 71, 73 | Medium |
| **7. Storage reasons everywhere** | `StorageFailure` through preview, download, sharing, intake, folder create and list, upload start. One "reconnect" reason. `failureFrom` and `failureReason` on the Board, comments, downloads, secure open. | P1-36 to 44, 47 to 53, 61 to 65, 70, 72, 74, 75 | Medium |
| **8. Sign-in and onboarding** | Remove dead routes' callers, read `auth_code_error`, guard rejected requests, give Turnstile a way out, say why an invite link is dead. | P1-15 to 23 | Small to medium |
| **9. Brio and the P2 sweep** | Brio's own words, then P2 by area. Delete dead paths rather than fixing them. | P1-76 to 79, P2 | Medium, can stay open |

**Recommended first:** Batch 1 (access). It's the only group where Firma tells a firm something untrue about who can open a client's file. As far as I know prod still has no outside users, so nothing is exposed yet, but this must land before launch. **If you'd rather have a quick visible win first:** Batch 2 is contained and cheap.

### Two access gaps found along the way

These aren't error handling. They belong with the [access-gates](access-gates.md) work, and I'd fold them into Batch 1.

- **Bulk download checks membership only.** `R/documents/bulk-download/route.ts:26-31` takes `externalIds` from the body and reads them with the engagement's connector. It has no check that the ids belong to this engagement, and it applies neither `allowDownload` nor the private-document rule that `D/download-share/route.ts:68-75` enforces. A Reviewer could fetch an internal-only file, or a file from another client on the same connector, if they had its id. Read from code.
- **Search fails open on privacy.** `R/search/route.ts:221-223` logs a failed lock-filter query and carries on unfiltered, so private and intake files from the Drive results could be listed.

---

## P0: looks like it worked but didn't, or data at risk

All read by hand against current code. **Every time** means no failure is needed.

Paths: `R/` = `frontend/app/api/projects/[projectId]/`, `D/` = `R/documents/[documentId]/`. Everything else is relative to `frontend/`. Sample copy uses a real-looking name where a value would go.

### Sharing and access

| ID | Where | Trigger | The person sees today | They should see |
|---|---|---|---|---|
| AC-1 | `D/sharing/route.ts:757,783`; `lib/sync-document-sharing.ts:43-62,126-135`; `lib/inngest/functions.ts:736`; `components/projects/hooks/use-engagement-file-ops.ts:572` | **Every time**, once a client has opened the file (a secure open saves a permission id). Revoke Access, or a role switched off. The sync clears `connectorPermissionId`, then the job reads it and finds nothing to revoke. The `PUT` path (`:535,570`) races the same way. | "Unshared · "Budget.xlsx" is no longer shared externally." The storage permission stands and its id is gone, so nothing can ever retry. | Keep the id until storage confirms. If refused: "Unshared in Firma. Google Drive still lets ana@client.com open this · {reason}. Retry." |
| AC-2 | `lib/connectors/revoke-share-permissions.ts:52-56,59-63,81-93`; `lib/inngest/functions.ts:651-654,749-751,786-788,816-818` | Any revoke job where storage refuses, or no connector is left. | Nothing. The job ends green so Inngest doesn't retry, and rows read REVOKED. Rows with no connector also lose their id for good. | Inbox notice to the Lead: "Couldn't take back access to Budget.xlsx for ana@client.com · Google Drive refused. Retry." |
| AC-3 | `lib/actions/members.ts:221-225,263,309`; `lib/inngest/functions.ts:763`; `components/projects/members/member-list.tsx:111` | Remove a member while storage refuses or the connector is down. `allSettled` is unread, then the cascade drops the rows and ids. The retry job listens for `project.member.removed`, which nothing sends (`engagement.member.removed` is what's sent). | "Member Removed · User access has been revoked." | "Removed from Acme Audit. Google Drive still gives them access to 3 files · Retry." |
| AC-4 | `lib/actions/members.ts:235-247`; `lib/grant-engagement-drive-folder-access.ts:59-64`; `lib/google-drive-connector.ts:3719-3723` | **Every time** a Lead or Contributor · Full Access is removed. Grants sit on General, Confidential and Staging. The revoke looks only at the engagement root, finds nothing and counts that as done. OneDrive isn't attempted at all. | The same "User access has been revoked." They keep write access in storage. | That message only once the folder permissions are gone. Otherwise: "Removed in Firma. They can still open General in Google Drive." |
| AC-5 | `lib/inngest/functions.ts:802-805`; `lib/actions/members.ts:371-400`; `member-list.tsx:93` | **Every time** a role is lowered from Lead or Contributor · Full Access. The job only revokes when the old role was Limited Access or Reviewer. | "Role Updated · Member role has been updated." Folder write access is unchanged. | The change also changes storage access. Otherwise: "Role updated in Firma. Their Google Drive access to General hasn't changed." |
| AC-6 | `lib/grant-engagement-drive-folder-access.ts:46-58`; `lib/google-drive-connector.ts:3574-3580`; `lib/connectors/adapters/onedrive-permission-adapter.ts:596-601`; `lib/inngest/functions.ts:851,861` | Joining, or a raised role, when storage refuses the folder grant. The result is dropped and the job returns `{ granted: true }`. | The person shows as joined, then lands in Files and Drive says they need access. No reason, for them or the Lead. | To the Lead: "Ana joined, but Google Drive refused to share General with her · {reason}. Retry." |
| AC-7 | `lib/actions/project.ts:820-824,832-840,844-846`; `lib/connectors/adapters/google-drive-adapter.ts:289-296`; `lib/connectors/firm-folder-access.ts:26`; `components/projects/engagement-settings-form.tsx:166` | Delete an engagement. Revokes are unread, then the cascade drops the rows. Restrict-to-owner reads no answers and touches only the root. OneDrive has no such method. | "Engagement deleted · Engagement has been removed." Clients and firm members can keep access. | "Engagement deleted. Google Drive still gives 2 people access to its folder. Open it in Drive to remove them." |
| AC-8 | `D/sharing/route.ts:327-358,376`; `lib/files/apply-stage-change.ts:74-75`; `components/projects/shares/engagement-shares-tab.tsx:1671`; `components/projects/engagement-file-list.tsx:1665` | **Every time** a deliverable whose documents clients have opened is demoted. No revoke job runs in this branch. The folder's rows are deleted, and GRANTED rows on its documents stay. | "Demoted to folder · It is a plain folder again and off the Board." Those clients keep access. | Revoke first. If refused: "Demoted, but 2 people still have access in storage · {reason}." |
| AC-9 | `D/sharing/regrant/route.ts:352-358,362-368,373-379`; `D/sharing/route.ts:614-634` | The firm set "PDF only" or a watermark, and exporting, watermarking or `setCopyRestricted` fails. | The Reviewer silently gets the original file, no watermark, download not blocked. Nobody is told on either side. | Refuse the open: "This document couldn't be prepared. Try again in a moment." Log it for the firm. |
| AC-10 | `D/sharing/regrant/route.ts:508-525`; `lib/use-secure-open-document.ts:251-265`; `components/projects/shares/secure-access-modal.tsx:46`; `components/files/document-edit-sheet.tsx:76-80,112` | Storage refuses the grant. The route answers success on purpose ("Return success so the modal shows"). | "Check your email · A verification link was sent to ana@client.com." Nothing was sent. OneDrive shows it too, and OneDrive never emails. | "Couldn't open this document. Google Drive refused access for ana@client.com · {reason}." |
| AC-11 | `components/projects/shares/deliverable-detail-panel.tsx:731-746,1152-1177`; `D/sharing/route.ts:402-403,472-473,542-543,570` | **Every time** a Delivery settings toggle is used. The body has no `guest` key, so `body.guest === true` reads as off, and `body.externalCollaborator !== false` reads as on. It also clears `sharedPdfDriveId`. **Read from code: pin with a test first.** | The toggle looks saved. Reviewers lose the deliverable and the revoke job runs, and Limited Access contributors are switched on. | The toggle changes only its own option. |
| AC-12 | `D/privacy/route.ts:64,92-97`; `lib/files/private-documents.ts:91-125` | Withdrawing access fails after the lock is saved, and the person retries as told. The retry hits "Already so: nothing to do". The job can also drop in `safeInngestSend`. Rare. | First "Couldn't make it internal only · Something went wrong on our side. Try again." Then "Budget.xlsx is now internal only." Client rows and storage permissions were never taken back. | Finish taking access back on retry, or "Internal only is set, but 2 people still have access in storage." |

### Approvals

| ID | Where | Trigger | The person sees today | They should see |
|---|---|---|---|---|
| AP-1 | `lib/files/storage-lock.ts:29,37-38,41`; `lib/google-drive-connector.ts:3350`; `lib/connectors/adapters/onedrive-permission-adapter.ts:273`; `lib/files/approval-archive.ts:175`; `components/ui/document-action-menu.tsx:315` | Lock or Approve when listing permissions fails (`[]`), a downgrade is refused (skipped), or read-only is refused (unread; **always false on OneDrive**). `approval-archive.ts` says the approval is refused if any step fails, but these never raise. | "Version locked · Others can only view this file until you unlock it." or Approved. Editors can still edit it in Drive. | "Couldn't lock this in Google Drive. ana@client.com can still edit it · {reason}." Not approved. |
| AP-2 | `lib/files/storage-lock.ts:59-64`; `D/sharing/unlock/route.ts:70,85`; `components/ui/document-action-menu.tsx:351` | Unlock when storage refuses to restore a role. The answer is unread, then the route deletes `settings.lock`, the only record of who was downgraded. | "Unlocked · Edit access restored." or "Returned to Draft · "Budget.xlsx" is now editable." Those people stay viewers and nothing can restore them. | "Unlocked in Firma. Couldn't restore edit access for ana@client.com · Retry." Keep the list until restored. |
| AP-3 | `D/intake/route.ts:285,291-300`; `components/projects/hooks/use-engagement-file-ops.ts:601`; `components/projects/shares/engagement-shares-tab.tsx:1704` | Reject or withdraw when the trash is refused. The row is deleted first and the refusal is only logged. With no `doc.connectorId` it falls back to legacy `Firm.connectorId`; if that's empty, no trash is attempted at all. | "File rejected · "Budget.xlsx" has been removed." It's still in storage with no Firma record, so nothing can act on it again. | "Rejected in Firma, but OneDrive has this locked. Close it everywhere, then remove it there." |

### Uploads and Files

| ID | Where | Trigger | The person sees today | They should see |
|---|---|---|---|---|
| FI-1 | `components/projects/hooks/use-engagement-upload.ts:259-269,393-400`; `R/index-file/route.ts:76-81` | The bytes reach storage, then `index-file` answers 403 (plan limit), 500, or the connection drops. `.then(() => undefined)` never reads the answer. | "Upload complete · 3 files added." The route's own comment says such a file 404s on preview, download, secure open and sharing, permanently. | Row in red: "In storage, but not added to Firma · {reason}", with Retry. |
| FI-2 | `components/projects/hooks/use-engagement-upload.ts:273-282` | A Limited Access contributor or Reviewer uploads, and `index-file-intake` fails. Not awaited, no `.ok` check. | "Upload complete". No row, no reminder, nothing in the Lead's review queue. The uploader believes it was submitted. | "Uploaded, but not sent for review · {reason}", with Retry. |
| FI-3 | `app/api/connectors/google-drive/import/route.ts:106-109,134-138,165`; `components/projects/engagement-file-list.tsx:2155-2161` | Import from Google Drive where a pick can't be read or copied. Logged, loop continues, `success: true`. | "Import complete · Imported 2 files from Google Drive." when 5 were picked. Also "Imported 0 files". | "Imported 2 of 5. Not imported: report.pdf, notes.docx · Google Drive refused them." Zero is an error. |
| FI-4 | `lib/google-drive-connector.ts:3160,3176-3185,3192-3195`; `app/api/connectors/google-drive/linked-files/route.ts:1189,1200`; `components/projects/hooks/use-engagement-file-ops.ts:755` | Copy a Google Drive folder to another engagement. A child is refused, the listing fails, or the folder has over 100 children (one page, always). The new root folder alone counts as a result. | "Copied · Acme Reports copied to the selected engagement." with files missing, or even with all of them missing. | "Copied 12 of 15 files to Acme Audit. Not copied: Budget.xlsx (Google Drive has it locked), Q3.pdf, Notes.docx." |
| FI-5 | `R/documents/bulk-download/route.ts:62,88-114,129-130`; `components/projects/engagement-file-list.tsx:1036-1051` | Download as ZIP where a file can't be read, or the selection expands past 100. The route sets headers so "the client can warn", and nothing reads them. The cap isn't counted at all. | Download panel: done, with a tick. The ZIP is short of files and may be sent on to a client. | "Downloaded 96 of 100. Not included: {names}." and "Only the first 100 files fit in one download." |
| FI-6 | `components/projects/engagement-file-list.tsx:1042,1053,2978-2981,3006` | The ZIP route fails or the connection drops. | "Download complete 0/1" and a red cross. `item.error` is set but never drawn. | "Download failed · {reason}" |
| FI-7 | `components/files/asset-details-pane.tsx:152-167,334-343` | The Details pane's `sharing` request fails. | Blank description, "No assignee", no Approvals, for a file that may have all three. Typing saves over the real description. | "Couldn't load this file's details · {reason}", with Retry. Read-only until then. |

### Board and deliverables

| ID | Where | Trigger | The person sees today | They should see |
|---|---|---|---|---|
| BD-1 | `components/projects/shares/deliverable-detail-panel.tsx:261-271,371` | **Every time.** "Move to trash" on a document in the deliverable pane posts to `/documents/[id]/trash`, which doesn't exist. No `.ok` check. | The row disappears, no toast. The file is untouched and comes back on reload. | "Moved to trash", through the working trash route, or "Move to trash failed · {reason}". |
| BD-2 | `deliverable-detail-panel.tsx:224-238` | Document assignee save refused or dropped. Optimistic, no `.ok`, no catch. | The new assignee stays on the row, with no message. Reverts on reload. | The assignee goes back, and "Couldn't change the assignee · {reason}". |
| BD-3 | `deliverable-detail-panel.tsx:669-680,731-754` | Delivery settings `PUT` refused. Or the load failed, so the toggles show defaults and flipping one saves all four defaults over the real settings. | The toggle stays flipped. A Lead who turned off a Reviewer's download believes it's off. Only a dropped connection gets "Error · Failed to save delivery settings." | The toggle flips back, and "Couldn't save delivery settings · {reason}". Toggles locked if the load failed. |
| BD-4 | `deliverable-detail-panel.tsx:669-680,782-800` | Description `PUT` refused. Or the load failed, so the box is blank and typing overwrites the real description. | The text stays and reads as saved. The file pane's copy of this field already says "Not saved". | "Not saved · {reason}" |

### Comments, members

| ID | Where | Trigger | The person sees today | They should see |
|---|---|---|---|---|
| CM-1 | `components/projects/document-doc-comments-pane.tsx:501-507`; `D/doc-comments/route.ts:410-426` | A comment with @mentions posts, then the per-person reminder fails. The pane has no `.ok` and `.catch(() => {})`. The route's write is unawaited with its own `.catch(() => {})`, so it always answers success. | The comment appears with its bell set. "Couldn't save the reminder" can never show. The person mentioned is never told. | "Comment posted. Couldn't notify Anna · Try again." |
| MB-1 | `lib/actions/invitations.ts:220-226`; `lib/actions/firm-members.ts:290-296`; `lib/actions/client-members.ts:203-205`; `components/projects/members/firm-members-tab.tsx:89,247`; `client-members-tab.tsx:75`; `member-list.tsx:143` | Resend an invitation when the mail server refuses. The action catches it and returns normally. | "Invitation resent" every time. The firm tab's pill is hardcoded to Invited. The engagement tab's pill says "Email failed", contradicting the toast. | "Couldn't email ana@client.com · The mail server refused it. Try again." |

### Connectors

| ID | Where | Trigger | The person sees today | They should see |
|---|---|---|---|---|
| CN-1 | `app/api/connectors/google-drive/route.ts:670-679,688-690,711`; `lib/inngest/client.ts:28-32` | Migrate on Google. The root is repointed first. The firm is then looked up by legacy `Firm.connectorId`; with no match, no job is queued and the route still answers ok. **Every time if that column is empty (check 2).** If it's set but the send fails, the failure is swallowed. | The dialog closes with no toast. Location now names a new empty folder, and every file is still in the old one. | "Migration couldn't start. Your files and folder are unchanged · {reason}." |
| CN-2 | `app/api/connectors/onedrive/sites/route.ts:160-167,176-178,273-275`; `components/connectors/onedrive-workspace-root.tsx:299` | Choose a SharePoint site where folder creation fails. The connector is saved to the new site before the folder exists, and isn't put back. | "Site selection failed · Site selection failed". The connector now points at the new site's drive with the old root id, so existing files stop resolving. | "Couldn't use Finance Site · {Microsoft's reason}. Your current folder is unchanged." |
| CN-3 | `app/api/connectors/google-drive/route.ts:431,487-492`; `app/api/connectors/onedrive/route.ts:284-289`; `app/api/connectors/onedrive/sites/route.ts:267-272`; toasts at `onedrive-workspace-root.tsx:249,291`, `google-drive-workspace-root.tsx:369` | Choosing the workspace folder when firm or client folder setup fails, or there's no token. "Non-fatal — folder structure can be retried", and nothing retries. | "Folder created · "Acme" set as your workspace root." or "SharePoint site connected". Creating an engagement later fails on "Organization folder not configured". | "Folder set, but the firm's folders couldn't be created inside it · {reason}. Retry." |
| CN-4 | `components/connectors/firm-drive-section.tsx:563-576`; `lib/actions/client.ts:719-731` | Attach a client when the link saves but the folder fails. `instanceof` is always false in the browser. | "Attach failed · Minified React error #441...". The client shows as not attached, though it is. The reason and the auto-filed ticket number are lost. | "Attached with a problem · The Drive folder couldn't be set up: {reason}. Ticket #123." |
| CN-5 | `components/connectors/firm-drive-section.tsx:584-592`; `lib/actions/client.ts:715-717` | Attach all when one fails (the handler swallows its own error), or an engagement's folder fails (the inner catch only logs). | A failure toast, then "Attached · Attached 5 clients to this connector." Single attach says "Client linked to this connector." with an engagement left folderless. | "Attached 4 of 5. Not attached: Beta · {reason}." and "Attached. 1 engagement has no folder yet: Acme Audit." |
| CN-6 | `lib/inngest/functions.ts:935-945`; `lib/firm-maintenance.ts:136-142,248-254`; `components/ui/migration-progress-panel.tsx:288` | A workspace move gives up. `onFailure` clears maintenance first, which marks the run `completed`, so `failed` is never written. The root has already switched. Partial failures go to `migrationWarnings`, which nothing reads. | The page reloads with no words. Missing files look like an empty workspace. | Banner to the firm admin: "Workspace move stopped. 14 of 60 items moved; the rest are still in the old folder. Retry." |
| CN-7 | `components/ui/migration-progress-panel.tsx:76-104`; `app/api/firm/maintenance/route.ts:108-122`; `app/(app)/d/[groupSlug]/f/[firmSlug]/maintenance/page.tsx:53-62` | Cancel or Unlock fails: no `.ok`, `catch { /* ignore */ }`. Cancel also answers ok when the job has already started. | The page moves on as though it worked. The workspace locks minutes later. | "Couldn't cancel. The migration has already started" or "Couldn't unlock · {reason}." |

### Settings and billing

| ID | Where | Trigger | The person sees today | They should see |
|---|---|---|---|---|
| ST-1 | `components/projects/firm-settings-form.tsx:249,328-329,390-398,429-464,505,717`; `lib/actions/firms.ts:503` | `GET /api/firm` fails when Firm Settings opens, and `loaded` still becomes true. Save branding isn't gated on `loaded` at all. | No message and every field blank. Change one, Save, and "Saved · Firm details updated." It wrote blanks and defaults over memo, industry, notes, reminder and event config, beta features and domain access. Save branding sends `logoData: null`, erasing the logo. | "Couldn't load firm settings. Reload before editing." Form locked. |
| ST-2 | `components/projects/add-firm-modal.tsx:106-122` | `createFirm` commits, then `updateFirm` throws. | The dialog stays open with #441. The firm exists. Create again fails too (name taken, also #441). | "Firm created, but its details weren't saved. Open it to finish." |
| BL-1 | `lib/billing/polar-webhook-sync.ts:191-199`; `app/api/webhooks/polar/route.ts:31-48` | A paid subscription webhook that matches no group logs a warning and answers 200, so Polar never retries. How often is unknown; it has a real payment behind it. | "You're all set", then Billing shows the old plan with upgrade buttons. Nothing alerts anyone. | An error that reaches an operator. "Payment received. We couldn't activate your plan yet and have been alerted · reference {checkout id}." |
| BL-2 | `components/billing/billing-page-client.tsx:118-120,137-141`; `lib/billing/fetch-billing-current-plan.ts:8`; `components/billing/polar-plans-picker.tsx:986-991,1201-1215` | `current-plan` fails, including on any tab refocus (a laptop waking before the network is back). No plan state means "not paid". | "Unable to load plan details." and a live Checkout on every plan, for an admin already paying. Whether a second checkout bills twice: couldn't tell. | "Couldn't load your plan." Checkout held back. Keep the last known plan on a failed refresh. |

### Other false successes

| ID | Where | Trigger | The person sees today | They should see |
|---|---|---|---|---|
| OT-1 | `lib/hooks/use-register-push.ts:72-78` | `POST /api/push/subscribe` fails. No `.ok`. | The switch reads On, and no push ever arrives. | Switch back to Off, and "Couldn't turn on notifications · {reason}". |
| OT-2 | `app/error.tsx:57,90,142`; `components/error-boundary.tsx:122,140,214`; `app/actions/submit-ticket.ts:96` | `submitErrorTicket` returns `{ success: false }`, and the result is ignored. | "Thank you! Report submitted." No ticket exists. | "Couldn't send your report. Please email support." |
| OT-3 | `R/insights/share-report/route.ts:84-96`; `components/projects/engagement-insights-dashboard.tsx:2561` | Every send fails, or SMTP is unset. `allSettled` is discarded and `sent: emails.length` always returned. | A green tick beside "Email health report PDF to 5 team members". Possibly nobody got it. | "Sent to 3 of 5. Couldn't reach Ana, Raj." |
| DO-1 | `lib/actions/engagement-wiki.ts:155-156,246-248`; `components/projects/wiki/wiki-editor.tsx:50-51` | Dossier (beta, firm-flagged). Read and write use legacy `Firm.connectorId` while create uses the client's. **Every save if that column is empty (check 2).** | "Saved". Nothing is written. Blank after reload. | "Couldn't save this page. Your changes are still here · Retry." |
| DO-2 | `components/projects/wiki/wiki-editor.tsx:62-68,44-51` | Dossier (beta). Content fails to load, and the catch sets the editor to empty. | A blank editable page. The first keystroke autosaves over the real page in storage. | "Couldn't load this page · {reason}", with Retry. Read-only until then. |

### Failed loads shown as "nothing there"

| ID | Where | Trigger | The person sees today | They should see |
|---|---|---|---|---|
| EM-1 | `components/inbox/inbox-view.tsx:186-190,543`; `lib/actions/inbox.ts:55-57` | Reminders, notifications or Needs you fail. | "You're all caught up", with an approval still waiting. | "Couldn't load your Inbox. Try again." Never "all caught up" after a failure. |
| EM-2 | `app/(app)/d/u/home/page.tsx:33-34`; `components/home/agenda-week.tsx:208`; `lib/home/home-firms.ts:59-61`; `lib/home/my-work.ts:377-379`; `components/home/home-view.tsx:98` | Calendar, reminders or firms fail on Home. | "Nothing overdue or on the calendar this week." and "All caught up." | "Couldn't load your agenda. Reload to try again." |
| EM-3 | `components/projects/shares/engagement-shares-tab.tsx:1589-1595,2253` | `/shares` fails. The catch only logs. | "No deliverables yet · Mark a folder as a Deliverable from the Files tab to see it here" | "Couldn't load the Board · {reason}", with Retry. |
| EM-4 | `deliverable-detail-panel.tsx:682-700,1004,1091` | `/subtasks` fails. `// non-critical`. | "No documents yet", "No files in this deliverable yet." The person may upload again. | "Couldn't load this deliverable's documents · {reason}", with Retry. |
| EM-5 | `components/projects/members/firm-members-tab.tsx:74-75,176`; `client-members-tab.tsx:60-61,215`; `engagement-members-tab.tsx:41-42`; `member-list.tsx:385` | The members load fails. | "No members yet" and "0 people", with Invite beside it. An admin may re-invite everyone. | "Couldn't load members · {reason}", with Retry. |
| EM-6 | `components/search/global-search-view.tsx:631-634,736-739,756-757,1343`; `components/projects/engagement-search-context.tsx:151-157`; `engagement-search-panel.tsx:556-560`; `lib/actions/quick-search.ts:101-103`; `components/shell/command-menu.tsx:109,235` | Firm search, engagement search or ⌘K fails. | "No results found · Try a different search term or remove a filter." The person concludes the document isn't there and may upload it again. | "Search couldn't run · {reason}. Try again." |
| EM-7 | `components/projects/hooks/use-engagement-file-ops.ts:285-295,683-694`; `components/projects/file-organize-dialogs.tsx:227` | The Move/Copy picker's folder list fails. | "No subfolders here. Use the path above to go back, or move into this folder." It invites the action, and the file lands in the wrong folder. | "Couldn't load folders · {reason}", with Retry. No Move here until it loads. |
| EM-8 | `lib/google-drive-connector.ts:3981-3984`; `lib/connectors/adapters/onedrive-list-files.ts:171,188`; `components/projects/engagement-file-list.tsx:3239` | The folder was moved or deleted in storage, or the account lost access. 404 returns an empty list on both storages. Not tested against Drive. | "Folder is empty". The person may recreate files that still exist elsewhere. | "This folder is no longer available in Google Drive. It may have been moved or deleted there." |

---

## P1: failure on a common path with no reason

The passes' reading, spot-checked. Confirm when fixing. "#441" means "Minified React error #441; visit https://react.dev/errors/441 ...".

### Server action reasons lost (root cause 1)

| ID | Where | Trigger | Today | Should see |
|---|---|---|---|---|
| P1-01 | `components/projects/add-client-modal.tsx:182`; `add-engagement-modal.tsx:163`; `add-firm-modal.tsx:121` | Name taken, plan limit, storage setup failed | #441 in the dialog. Lost: "A client with this name already exists", "Your plan allows 5 clients. Upgrade to add more." | Those words |
| P1-02 | `components/projects/members/invite-member-modal.tsx:121`; `firm-invite-modal.tsx:38`; `client-invite-modal.tsx:39` | Already a member, already joined, mid-accept, not allowed | #441 in the dialog | "A member with this email is already in the firm" |
| P1-03 | `components/projects/members/member-list.tsx:98` | Role change throws | "Update Failed · #441" | "Couldn't change the role · {reason}" |
| P1-04 | `member-list.tsx:115,132,147`; `firm-members-tab.tsx:92,108,124`; `client-members-tab.tsx:78,94` | Remove, revoke or resend throws | "Error · Failed to remove member." "Failed to Send · Could not resend the invitation." Lost: "Cannot remove the last Firm Administrator" | "Couldn't remove member · This is the last firm administrator." |
| P1-05 | `components/projects/firm-settings-form.tsx:416,480,496` | Save or delete a firm | "Save failed · #441", "Delete failed · #441" | Title plus the reason |
| P1-06 | `components/projects/engagement-settings-form.tsx:156,171`; `engagement-header.tsx:99` | Date conflict, edit while Completed | "Update failed · #441". Lost: "{x} is due {date}, after that. Set the engagement's due date on or after it, or move that deliverable first." | That sentence |
| P1-07 | `components/projects/client-settings-form.tsx:359,417,432`; `client-header.tsx:52`; `client-contacts-tab.tsx:69,166,372` | Save or delete a client, contacts, status | "Update failed · #441". Lost: "Only firm admins can delete a client", the contact plan limit. Failed load also says "No contacts yet" | The thrown words |
| P1-08 | `components/connectors/firm-drive-section.tsx:410,427,439,454,467,611` | Disconnect, remove, rename, detach | "Disconnect failed · #441" and the same for each | Named reason |
| P1-09 | `components/projects/firm-switch-dialog.tsx:68`; `app/(app)/d/(landing)/group-picker.tsx:140` | Switch firm or workspace | #441. Lost: "You do not have access to this firm" | The thrown words |
| P1-10 | `components/projects/engagement-file-list.tsx:921` | "Set up storage folder" fails | "Setup failed · #441", on the screen whose only job is this | "Setup failed · {StorageFailure words}" |
| P1-11 | `components/projects/engagement-insights-dashboard.tsx:2596,2842,2867`; `summary-draft-review.tsx:247` | Publish, dismiss or save a summary, including "Complete these sections before publishing: …" | Nothing. `try/finally`, no catch. The spinner stops | "Not published · Complete these sections: Next steps" |
| P1-12 | `components/projects/wiki/wiki-editor.tsx:50,84`; `engagement-wiki-tab.tsx:30,36,66,72,79`; `wiki-sidebar.tsx:121,146` | Any Dossier action throws (beta) | "Saving…" forever. New and Delete do nothing. Load spins forever | "Couldn't save this page · {reason}" |
| P1-13 | `components/projects/add-reminder-popover.tsx:64` | Save reminder throws | "Failed · Could not save reminder." | "Couldn't save the reminder · {reason}" |

### Invites and sign-in

| ID | Where | Trigger | Today | Should see |
|---|---|---|---|---|
| P1-14 | `lib/actions/firm-members.ts:202,235`; `lib/actions/client-members.ts:132,156` | First firm or client invite; mail refused | #441 in the dialog. The invitation is saved and shows "Invited" after refresh, though no email left | "Couldn't email ana@client.com · Try again." Row marked Email failed |
| P1-15 | `lib/actions/invitations.ts:105-107,162-164`; `invite-member-modal.tsx:117-119`; `lib/ui/status.ts:135` | First engagement invite; mail refused | The dialog closes as success with no toast. A small "Email failed" pill for those who look | "Invitation saved, but the email wasn't sent. Try again." |
| P1-16 | `lib/actions/engagement-membership.ts:280-303` | Adding an existing user; email fails | The same success. The person is never told | "Added Ana, but couldn't email her. Let her know yourself." |
| P1-17 | `app/(app)/invite/[token]/page.tsx:20-37`; `lib/actions/invitations.ts:276,299,330` | Expired or revoked invite link, or a database error | "404 · Page not found", on purpose | "This invitation has expired. Ask whoever invited you to send a new one." |
| P1-18 | `components/invite/invite-landing-client.tsx:77,112` | Signed in as the wrong account | "Please sign out." The button goes to `/api/auth/signout`, which doesn't exist: 404 | A Sign Out that works and returns to the invite |
| P1-19 | `app/(app)/auth/callback/route.ts:108` | Google or Microsoft code exchange fails | `/signin?error=auth_code_error`, which nothing reads. A blank form | "Google sign-in didn't finish. Please try again." |
| P1-20 | `app/(app)/signin/use-sign-in-flow.ts:128,155`; `components/signup/signup-form.tsx:361` | `checkEmailExists` or `sendOTPWithTurnstile` rejects | No try/catch. "Sending code…" spins forever | "Couldn't reach us. Check your connection and try again." |
| P1-21 | `app/(app)/signin/signin-view.tsx:134-141,275-282` | Turnstile keeps failing (the known 600010) | "Captcha verification failed. Retrying…" forever, with no way out | "We couldn't run the security check. Turn off blockers for this site or try another browser." |
| P1-22 | `app/(app)/d/onboarding/page.tsx:585,593-596,652-656,1025-1034`; `lib/landing/default-landing-path.ts:66-70` | First-firm provisioning or `/api/firm` fails. Falls to step 1, which posts to `/api/onboarding/create-sandbox`, removed in #97 | "Failed to create sandbox workspace", and a Retry that can never work. The person is stuck | "We couldn't set up your workspace · {reason}." with a retry that works |
| P1-23 | `lib/actions/firms.ts:99-101`; `app/(app)/d/(landing)/group-picker.tsx:67-75`; `app/(app)/d/(landing)/page.tsx:86-92`; `components/projects/firm-list.tsx:71`; `components/billing/billing-page-client.tsx:83` | The firm query fails. `getUserFirms` returns `[]`. `getUserGroups` has no catch, so the picker's load rejects | Picker: spinner forever. `/d`: "No firms found". Billing's own "Could not load your workspaces." can't fire | "Couldn't load your workspaces. Try again." |

### Billing

| ID | Where | Trigger | Today | Should see |
|---|---|---|---|---|
| P1-24 | `app/api/checkout/route.ts:65,89,91,133`; `components/billing/polar-plans-picker.tsx:1211`; `standard-checkout-intent-banner.tsx:174` | Any checkout start failure. The button navigates the tab to the route | Raw `{"error":"Unknown product"}` on a bare page | Back on Billing: "Checkout didn't open · {reason}. You have not been charged." |
| P1-25 | `app/api/billing/customer-portal/route.ts:64-78`; `lib/billing/open-polar-customer-portal.ts:9`; `polar-plans-picker.tsx:999-1011`; `current-plan-summary.tsx:285-297` | Opening the portal, the only way to cancel or change plan | "Could not open billing portal right now." or the false "No Polar customer on file yet." or nothing | "Couldn't open billing · {Polar's reason}. Your plan is unchanged." |
| P1-26 | `app/api/billing/checkout-invoice/route.ts:130-138`; `app/checkout/success/success-redirect-card.tsx:103-110,159-165` | Invoice still generating: a 202 with the message in `error`, read only on `!res.ok` | "Preparing invoice…", then nothing. The page may redirect first | "Your invoice is still being generated. Find it in Billing in a minute." |
| P1-27 | `app/checkout/success/success-redirect-card.tsx:95-110,232-238` | Any return from Polar; activation is never checked | "You're all set", on a timer. Billing can show the old plan with upgrade buttons | "Payment received. Activating your plan…" until it's active |

### Connectors

| ID | Where | Trigger | Today | Should see |
|---|---|---|---|---|
| P1-28 | `lib/google-drive-popup-oauth.ts:51`; `lib/onedrive-popup-oauth.ts:36`; `firm-drive-section.tsx:257,362` | A code the map doesn't know: `session_mismatch`, `invalid_state`, `forbidden`, `database_error` and others | "Connection failed · session_mismatch" | One sentence per code |
| P1-29 | `lib/google-drive-popup-oauth.ts:217-236,252-262`; `lib/onedrive-popup-oauth.ts:171-187,201-209` | Popup blocked or closed; `popup.closed` is never checked | A spinner for 2 minutes, then "Sign-in timed out" | "Your browser blocked the sign-in window. Allow popups, then try again." |
| P1-30 | `lib/google-drive-popup-oauth.ts:194-215,238-245`; `lib/onedrive-popup-oauth.ts:152-169,189-195` | An active connector in another firm makes the status poll "succeed" and removes the listener | The spinner stops with nothing added, and the popup's real answer is lost | The spinner stays until this popup answers |
| P1-31 | `firm-drive-section.tsx:237` | Google initiate refused; body not read | "Connection failed · Failed to initiate Google sign-in" | The route's reason |
| P1-32 | `app/api/connectors/google-drive/route.ts:718-724`; `app/api/connectors/onedrive/route.ts:338-341`; `onedrive/sites/route.ts:134-149,273-275`; `google-drive-workspace-root.tsx:373,468-470,508-511`; `onedrive-workspace-root.tsx:253` | A folder step fails at the provider: no permission, out of space, read-only site | "Could not create folder · Internal server error" | `StorageFailure`'s words |
| P1-33 | `google-drive/route.ts:545,875,901`; `onedrive/route.ts:161`; `onedrive/sites/route.ts:45,126`; `google-drive/upload/route.ts:100,118`; `linked-files/route.ts:733` | The connection needs renewing. `getAccessToken` returns null | "Unauthorized/Expired", "Could not obtain access token", "Failed to get access token" | "The connection to Google Drive needs renewing. Reconnect the storage, then try again." |
| P1-34 | `firm-drive-section.tsx:481-484,499-505`; `onedrive/route.ts:330-334`; `google-drive/route.ts:163-164` | Test connection, pressed because something is wrong | "Test failed · Could not verify connection." | "Test failed · Google rejected the saved sign-in. Reconnect this account." |
| P1-35 | `firm-drive-section.tsx:157` | Connectors or clients fail to load | A toast, then an empty panel with only the Connect form, inviting a second connection | An error line with Retry; no Connect form |

### Files and uploads

| ID | Where | Trigger | Today | Should see |
|---|---|---|---|---|
| P1-36 | `linked-files/route.ts:735,746,1337-1338`; `lib/connectors/adapters/onedrive-adapter.ts:104`; `engagement-file-list.tsx:1926-1929`; `use-engagement-upload.ts:656` | New folder, document or folder upload refused. Throws a plain Error, a hole in the earlier Files work | "Could not create file · Internal Server Error" | `StorageFailure`'s words |
| P1-37 | `lib/google-drive-connector.ts:3988`; `onedrive-list-files.ts:174`; `linked-files/route.ts:1337-1338`; `engagement-file-list.tsx:3147` | Opening a folder when storage answers 403 or 429 | "Internal Server Error" in the file pane | "Google Drive refused to list this folder · {reason}." |
| P1-38 | `engagement-file-list.tsx:2010-2014,2097-2098,2130-2133`; `google-drive/route.ts:855-861` | Import by someone not the connector's owner, or a revoked connector | Pressing Import does nothing. Later "Import failed · Missing required params" | "Only {owner} can import from this Google Drive", or "Reconnect Google Drive to import." |
| P1-39 | `D/preview/route.ts:96,113,127,152-160,170,215`; `components/files/document-pdf-preview-pane.tsx:506-518`; `document-blob-preview-pane.tsx:42,144` | Any preview failure: panes hand off to an iframe of a route that answers JSON | Raw JSON in the pane: `{"error":"Failed to fetch document content from storage"}` | "Preview not available · {reason}", with Reload |
| P1-40 | `components/files/document-image-preview-pane.tsx:101`; `document-media-preview-pane.tsx:43,50` | Image, video or audio preview errors; no `onError` | A broken-image icon or a black pane | "Preview not available · {reason}" |
| P1-41 | `D/download-share/route.ts:260-263`; `document-action-menu.tsx:426-429,442,456,466-468`; `document-versions-timeline.tsx:91,104` | Storage refuses a download. Reasons dropped on both sides | "Download failed". No session: nothing | "Download failed · The connection to Google Drive needs renewing." |
| P1-42 | `lib/use-secure-open-document.ts:192-196,275-279`; `D/sharing/regrant/route.ts:152,158,559`; `document-edit-sheet.tsx:82-86` | Open in Drive refused | Any 403: "Your access to this document has been revoked." even when it was never shared. Otherwise "Unable to open this document." | The route's reason |
| P1-43 | `engagement-file-list.tsx:1216-1255`; `D/resolve-deeplink/route.ts:136-138`; `D/file-info/route.ts:74-76` | A link from a notification hits a 500 or a dropped connection. The result is cached | "Link unavailable · You do not have access to this item." The person chases a Lead for access they already have | "Couldn't open that link. Try again." "No access" only on 403 or 404 |
| P1-44 | `engagement-file-list.tsx:1737,3028-3031,3058` | Bulk trash, some or all fail | "Moved to trash 0/3". The reason is only in a hover title | "Moved 1 of 3 to trash", each failed row with its reason |
| P1-45 | `engagement-file-list.tsx:552-594`; `R/sharing/ids/route.ts:74` | `/sharing/ids` fails | Deliverable icons and Internal only marks vanish. Files look unshared | "Couldn't load sharing status." Keep the last known marks |
| P1-46 | `use-engagement-file-ops.ts:330,703-712`; `file-organize-dialogs.tsx:352` | Copy target list or a picker folder fails | "No other engagements available." and "Error · Could not load folder" | "Couldn't load engagements · {reason}" |
| P1-47 | `lib/connectors/adapters/onedrive-file-ops.ts:122-133` | OneDrive copy runs past 30 seconds. A same-named item in the destination counts as done | "Copied", possibly for a copy still running or an older folder of that name | The existing `timed_out` words |
| P1-48 | `lib/connectors/trash-undo.ts:17-23`; `lib/inngest/functions.ts:483-484,570-571` | Undo a trash, then storage can't answer at the check 60 seconds later. Rare, not reversible | "Restored". Then Firma's row, comments and sharing rows are deleted for a file that came back | "Couldn't reach storage" means try again, never "still trashed" |
| P1-49 | `use-engagement-upload.ts:76,318` | The provider refuses the upload: full, locked, no permission | "Upload failed: 403" | "Upload failed · OneDrive has this file locked" |
| P1-50 | `use-engagement-upload.ts:304,329,344-354` | Big file to Google Drive: one PUT with a 5-minute limit | Progress drops to 0 twice with no word, then "Upload timed out." Retry hits the same limit | "Timed out after 5 minutes · Too large for this connection" |
| P1-51 | `use-engagement-upload.ts:654-658` | Folder upload where a subfolder can't be created | "Nothing from this folder was uploaded past this point." In fact nothing from the whole selection went up, and empty folders stay | "Folder upload stopped · No files were uploaded. 3 empty folders were created" |

### Sharing and approvals

| ID | Where | Trigger | Today | Should see |
|---|---|---|---|---|
| P1-52 | `use-engagement-file-ops.ts:551,554,577,580`; `engagement-file-list.tsx:1640,1646,1662,1668`; `document-action-menu.tsx:315-322`; `D/sharing/unlock/route.ts:123`; `D/sharing/route.ts:707,812`; `D/sharing/finalize/route.ts:105` | Unlock, revoke, promote, demote or lock fails | "Failed · Failed to unlock", "Failed · Network error.", "Lock failed · Failed to finalize" | "Return to draft failed · {reason}" |
| P1-53 | `D/intake/route.ts:317`; `use-engagement-file-ops.ts:606,636`; `engagement-shares-tab.tsx:1681-1692,1708` | Approve, reject or withdraw fails. On the Board a network failure shows nothing | "Action failed · Internal server error", "Could not complete the intake action." even for "Document is not pending intake" | "Approve failed · It's no longer waiting for review. Refresh the list." |
| P1-54 | `lib/files/approval-archive.ts:124-127,192-196`; `google-drive-adapter.ts:289-296`; `onedrive-permission-adapter.ts:273` | Approve; the Archive can't be made owner-only or read-only | Approved. The Archive copy can be editable | "Approved. The archive copy couldn't be locked in OneDrive." |
| P1-55 | `D/sharing/activity/route.ts:161,180-195,202-205`; `approval-archive.ts:220` | Approve; storage steps succeed, then a database write fails | "Failed to update activity". The file is locked and copied. A retry makes a second archive copy | "Approved in storage, but Firma couldn't record it. Retry." |
| P1-56 | `lib/connectors/firm-folder-access.ts:40,72-79`; `lib/inngest/functions.ts:699-707`; `engagement-settings-form.tsx:153` | Mark Completed or reopen when storage refuses for a member. `failed` is a count nobody reads. Demoted from P0: firm's own members, rare | "Saved · Engagement properties updated." Some keep write on Completed work, or stay read-only after reopen | "Completed. 2 people couldn't be set to read-only in Google Drive: A, B. Retry." |
| P1-57 | `lib/inngest/client.ts:19-32` | Inngest can't be reached when any revoke, grant or cleanup event is sent | The usual success. The job never exists | Lead told the follow-up didn't start, or the event queued durably |
| P1-58 | `lib/files/apply-stage-change.ts:95-155`; `lib/sync-document-sharing.ts:136-137` | Move a deliverable forward; the access sync runs after the response and only logs. May not finish on Vercel | "Stage updated". Clients may not get their rows | "Moved to In review, but clients couldn't be given access. Retry." |
| P1-59 | `D/sharing/route.ts:236-301,327-358` | Promote or demote fails partway: settings first, per-row loops, no transaction | "Failed · Failed to save sharing" while the folder is already on the Board | One transaction, or "Promoted, but some people's access wasn't set up. Try again." |
| P1-60 | `lib/actions/client.ts:580,588`; `lib/actions/firm-members.ts:114,131`; `client-settings-form.tsx:427`; `firm-members-tab.tsx:121` | Delete a client or remove a firm member. No storage revoke is attempted | "Client deleted", "Member Removed". Storage access stands | "Their access in Google Drive isn't changed. Open Drive to remove it." |

### Board and deliverables

| ID | Where | Trigger | Today | Should see |
|---|---|---|---|---|
| P1-61 | `D/sharing/activity/route.ts:161`; `components/files/use-stage-move.tsx:50,64`; `file-property-cells.tsx:75`; `deliverable-detail-panel.tsx:247` | Stage write fails, or a dropped connection | "Couldn't change the stage · Failed to update activity" or "Please try again." | "Couldn't change the stage · {reason}" |
| P1-62 | `D/due-date/route.ts:64-70,87-92,100-103`; `components/files/use-due-date-save.tsx:63,66` | `updateEngagement` throws, or a later row fails. Three writes, no transaction | "Couldn't set due date · Failed to update due date". The engagement's date may already have moved | The thrown words, plus what did change |
| P1-63 | `deliverable-detail-panel.tsx:713-728` | Lead change refused | Snaps back with no word. No session: keeps the new value, unsaved | "Couldn't change the Lead · {reason}" |
| P1-64 | `engagement-shares-tab.tsx:1664-1666,1672-1674` | Demote from the Board refused | "Demote failed · Could not demote the deliverable to a folder." The Files view shows the server's words for the same call | "Demote failed · {reason}" |
| P1-65 | `components/ui/property-cells.tsx:27-31`; `components/files/save-assignee.ts:5`; `blocked-property.tsx:43-66` | Any property cell's save rejects | Dropdown closes, old value stays, no message. One catch here closes all of them | "Couldn't change the assignee · Check your connection" |
| P1-66 | `engagement-insights-dashboard.tsx:1315,1330,2575,2588`; `R/insights/route.ts:66` | Overview fails. No `.ok`, so `{error}` becomes `data` and it throws | The whole page becomes the error boundary, or counts read 0 and "nothing overdue" | "Couldn't load this overview · {reason}", with Retry |
| P1-67 | `components/dashboard/firm-business-insights.tsx:83-88,129-133`; `firm-actions.tsx:153-158`; `app/api/firms/[firmId]/insights/route.ts:591` | Firm Overview data fails | Shimmer forever on the firm's landing page | "Couldn't load this overview · {reason}" |
| P1-68 | `components/calendar/calendar-view.tsx:129-130`; `calendar-sidebar.tsx:51`; `calendar-event-detail-modal.tsx:190,205,327` | Calendar or event documents fail. A refresh also wipes the screen | Empty calendar, "No engagements yet.", "No documents in this deliverable." | "Couldn't load the calendar · {reason}" |
| P1-69 | `app/(app)/d/[groupSlug]/f/[firmSlug]/c/[clientSlug]/e/[engagementSlug]/[[...rest]]/page.tsx:72-73`; `.../board/page.tsx:34,42` | Hierarchy lookup fails on a database blip | "404 · Page not found · This page doesn't exist or you no longer have access." | "Couldn't load this engagement · {reason}", with Retry |

### Comments

| ID | Where | Trigger | Today | Should see |
|---|---|---|---|---|
| P1-70 | `D/doc-comments/route.ts:142,336,430,559`; `document-doc-comments-pane.tsx:231,238,489,518,535,541` | Load, post or delete fails | "Failed to add comment", "Failed to process request" | "Couldn't post your comment. It's still in the box. Try again." |
| P1-71 | `document-doc-comments-pane.tsx:238,1117,1142` | Thread fails to load | A red banner, and under it "No comments yet. Start the conversation below." | Banner with Retry, no empty line |
| P1-72 | `document-doc-comments-pane.tsx:685-695` | Reaction refused or dropped | Undone with no word, or stays lit | "Couldn't add the reaction" |
| P1-73 | `components/files/document-discussion-tab.tsx:39-40,53,61-66`; `D/deliverable/route.ts:43` | `/deliverable` fails | "Discussions happen on deliverables, and this file isn't in one." False | "Couldn't load this discussion · {reason}" |
| P1-74 | `engagement-comments-tab.tsx:336-342`; `D/doc-comments/resolve/route.ts:11-17` | Resolve or reopen fails | Title only. Dropped connection: nothing | "Couldn't resolve this discussion · {reason}" |
| P1-75 | `document-action-menu.tsx:1447-1466`; `document-doc-comments-pane.tsx:721,756`; `D/reminder/route.ts:80,195` | A reminder for several people partly fails | "Partial failure · 1 operation(s) failed." | "Reminder set for Ana. Couldn't set it for Raj · {reason}" |

### Brio and search

| ID | Where | Trigger | Today | Should see |
|---|---|---|---|---|
| P1-76 | `R/ai-chat/route.ts:267,284`; `components/projects/engagement-ai-chat.tsx:741,783,786,1528` | The model fails before or during the stream | "Internal server error", or the browser's own "network error" beside a partial answer | "Brio couldn't finish this answer. Try again." Mark a partial answer as cut off |
| P1-77 | `R/ai-summary/route.ts:164-165,181-184`; `engagement-insights-dashboard.tsx:2759,2800` | Out of AI credits. The gate throws before the stream, with no `aiLimitResponse` in the outer catch | "Brio could not write a summary. Try again." Trying again can't help | The limit's own words, as chat gets |
| P1-78 | `components/dashboard/ai-firm-brief.tsx:89-92,114-121`; `app/api/firms/[firmId]/ai-brief/route.ts:64-65` | Rewrite refused, including credits (429). A bare `catch {` discards the reason | "Could not rewrite it. The brief below is unchanged." | "You have used this month's 500 AI credits. They refill on {date}." |
| P1-79 | `components/search/global-search-view.tsx:783,792` | Open in Files on a result fails | Spinner, then nothing | "Couldn't open this file · {reason}" |

---

## P2: rare path or weak message

The passes' reading. Many same-shaped rows are grouped.

| ID | Area | Where | Today | Should see |
|---|---|---|---|---|
| P2-01 | Files | `document-action-menu.tsx:272,1060`; `use-engagement-file-ops.ts:604,607,634,637` | Title "Failed" or "Action failed"; fallback "Network error." | Title names the action |
| P2-02 | Files | `D/versions/route.ts:69`; `use-document-versions.ts:33,41`; `document-versions-timeline.tsx:127`; `document-activity-feed.tsx:299`; `R/audit/route.ts:137` | "Failed to load version history", "Failed to load activity" | The storage's reason, with Retry |
| P2-03 | Files | `D/preview/route.ts:113,127,159`; `D/download-share/route.ts:122,176` | "No content adapter available for connector", "The account linked to Pockett…" | "Connect storage for this client." |
| P2-04 | Files | `R/documents/create-link/route.ts:168`; `engagement-file-list.tsx:1928-1933,1971-1977` | Dialog closes and the typed name is lost; "Could not create file" for a folder | Keep the dialog open with the reason |
| P2-05 | Files | `app/api/drive-action/route.ts:208,293` | "Move to trash failed · Internal server error" though it's in the trash; restore's reason dropped | Metadata read optional; carry the reason |
| P2-06 | Files | `app/api/bookmarks/route.ts`; `engagement-file-row.tsx:299-306`; `app-topbar.tsx:813-818`; `home-bookmarks.tsx:27-36` | Nothing, or "Error · Failed to remove bookmark." | "Couldn't remove the bookmark · {reason}" |
| P2-07 | Files | `engagement-file-list.tsx:1141-1155`; `engagement-shares-tab.tsx:1855-1863` | Lands on the root or opens nothing | "Couldn't find that file's folder" |
| P2-08 | Files | `document-action-menu.tsx:239-240` | "Copied" regardless of the clipboard | "Couldn't copy" |
| P2-09 | Files | `engagement-file-list.tsx:710,1484,1499` | "Unexpected token…", "Failed to fetch" | "Couldn't load this folder · {reason}" |
| P2-10 | Files | `lib/google-drive-connector.ts:2166` | Versions on a 403 read as no versions | "Google Drive won't show versions for this file." |
| P2-11 | Files | `linked-files/route.ts:1172`; `lib/google-drive-connector.ts:4219-4222` | The copy is named with the raw file id | Stop with the reason |
| P2-12 | Files | `lib/inngest/functions.ts:509,518,525,552,594,603,625` | Nothing. A later restore in Drive brings back old access | The job records what it couldn't do |
| P2-13 | Files | `engagement-insights-dashboard.tsx:2533-2535` | Health PDF button resets, nothing said | "Couldn't create the PDF" |
| P2-14 | Uploads | `use-engagement-upload.ts:187,221,639`; `google-drive/upload/route.ts:131`; `onedrive-content-adapter.ts:186` | "No access token", or raw "Failed to create upload session for x: 423 - {json}" | The provider's reason in plain words |
| P2-15 | Uploads | `use-engagement-upload.ts:608` | Pick a folder with no session or open folder: nothing | "Open a folder first" or "Sign in again" |
| P2-16 | Uploads | `use-engagement-upload.ts:512,515,535` | Same-name check skipped; two files of one name | Ask, or say the check couldn't run |
| P2-17 | Uploads | `engagement-file-list.tsx:2133,2151` | "Import failed · Missing required params" or a JSON parse message | "Import failed · {reason}" |
| P2-18 | Sharing | `D/sharing/route.ts:444,562,777` | Nothing. A Firma-made PDF stays in Drive after sharing ends | Log it; a note to the firm if it matters |
| P2-19 | Sharing | `D/sharing/route.ts:393-398` | A raw Prisma message, labeled 404 | "Couldn't set up sharing for this file." |
| P2-20 | Sharing | `firm-clients-view.tsx:122-137`; `client-project-view.tsx:85-92`; `shell-data-context.tsx:99-106`; `app/api/permissions/firm/route.ts:148` | Settings, Audit and New client vanish, as though the person lacks access | "Couldn't load your permissions. Refresh." |
| P2-21 | Sharing | `R/members/route.ts:47,55,64`; `document-doc-comments-pane.tsx:205`; `engagement-comments-tab.tsx:273` | People missing from pickers, empty mention list | "Couldn't load the people on this engagement." |
| P2-22 | Board | `R/shares/order/route.ts:61`; `engagement-shares-tab.tsx:1616-1628` | "Move failed · … The board has been restored." True, no reason | The same, with the reason |
| P2-23 | Board | `engagement-header.tsx:84,87` | Empty pickers, and the empty answer is cached | Don't cache a failure |
| P2-24 | Board | `lib/actions/client.ts:194`; `lib/services/project.service.ts:144`; `lib/actions/project.ts:253` | Success with no folders. Heals later | A note that storage isn't ready |
| P2-25 | Board | `D/sharing/activity/route.ts` stage labels in `use-stage-move.tsx:65` | "Failed to update activity": a word people never see elsewhere | "Couldn't change the stage" |
| P2-26 | Notifications | `inbox-view.tsx:194-200,212-218,433-440` | Mark read: dots clear, come back on next load. Demoted from P0: small stakes | Roll back with a toast |
| P2-27 | Notifications | `app-topbar.tsx:447,898-908,1012-1037,1079-1085,1127-1133` (only on `/d/onboarding`) | Clear all, Broadcast: nothing | A toast, or retire these controls |
| P2-28 | Notifications | `inbox-view.tsx:386-390` | "Couldn't dismiss it · … is back in your Inbox." No reason | Add the reason |
| P2-29 | Notifications | `push-notification-toggle.tsx:23-29`; `use-register-push.ts:57,100` | Switch snaps back with no message | "Couldn't turn on notifications · {reason}" |
| P2-30 | Notifications | `lib/actions/user-reminders.ts:122,147,162` | Session gone: returns as if done | "Sign in again to update this." |
| P2-31 | Connectors | `google-drive/callback/route.ts:98-104,196-204`; `onedrive/callback/route.ts:107-114,187-196` | The provider's `error_description` dropped: "Microsoft sign-in was cancelled or denied." | "Your Microsoft admin needs to approve Firma first" |
| P2-32 | Connectors | `google-drive/callback/route.ts:103,146,627`; `onedrive/callback/route.ts:104,157,424`; `onboarding/page.tsx:840-842` | `/d?error=…`, which nothing reads | "Connecting storage didn't finish · {reason}." |
| P2-33 | Connectors | `google-drive/callback/route.ts:416-453`; `onedrive/callback/route.ts:346-377` | Reconnect revokes the old connector before saving. "Connection failed · database_error", and it's gone from the list | "Reconnect failed · {reason}. Your connection is unchanged." |
| P2-34 | Connectors | `google-drive/route.ts:612-633`; `onedrive-workspace-root.tsx:186-194`; `firm-drive-section.tsx:173,189,293,310,518-524`; `switch-account-modal.tsx` | "about 1 minute" for a large folder; a false reconnect hint; "No firm administrators found." | The real reason on each |
| P2-35 | Connectors | `google-drive-adapter.ts:42,71,206,325`; `onedrive-adapter.ts:58`; `lib/connectors/pockett-structure.service.ts:28` | A failed read reads as "no such folder": a duplicate folder on Drive | A failed read stops setup and says so |
| P2-36 | Connectors | `client-drive-section.tsx:65,75,115,123` | Green check, "Google account" even for OneDrive, "Disconnected — reconnect in Firm Settings" | "Couldn't check the connection" |
| P2-37 | Connectors | `lib/google-drive-connector.ts:1258,2672,3228,3280`; `onedrive-permission-adapter.ts:339,384`; `lib/connectors/registry.ts:283-335`; `engagement-file-scope.ts:39` | "No duplicates" results; refusal with the wrong reason | Failed read says so |
| P2-38 | Connectors | `lib/inngest/functions.ts:229,241,260`; `onedrive-permission-adapter.ts:183` | Files quietly missing from search | Job fails so it retries |
| P2-39 | Settings | `client-settings-form.tsx:207,229,317` | Failed brand load looks like no branding; saving can delete the real record | "Couldn't load branding." |
| P2-40 | Settings | `sessions-card.tsx:28`; `data-privacy-card.tsx:61-62,86-87`; `app/api/account/deletion-request/route.ts:85-138`; `profile-page-client.tsx:58` | "Please try again." Name save never ends | The reason; button back |
| P2-41 | Settings | `audit-with-filters.tsx:610-613,661,1057-1061`; `app/api/firms/[firmId]/audit/route.ts:133` | "Failed to load audit"; filter dropdowns silently empty | "Couldn't load activity · {reason}" |
| P2-42 | Settings | `components/ui/setup-reminder-modal.tsx:179-189` | `try/finally`, no catch | "Couldn't save the reminder." |
| P2-43 | Settings | `ai-firm-brief.tsx:62,137`; `sidebar-v2.tsx:389` | Brief disappears; "No active engagements yet." | Quiet "Couldn't load" lines |
| P2-44 | Settings | `lib/actions/client.ts:580,588`; `lib/actions/firms.ts:590,597` | Audit says deleted, the person sees a failure | Audit after the write |
| P2-45 | Members | `lib/actions/members.ts:67,70`; `firm-members.ts:85,173`; `client-members.ts:60,105` | "Unknown User"; the duplicate-invite check silently passes | Failed lookup marked as such |
| P2-46 | Other | `lib/email.ts:54-56` | `SMTP_HOST` unset: `sendEmail` returns as if sent | Throws outside local development |
| P2-47 | Other | `app/actions/send-otp.ts:97`; `lib/actions/system-admin-signup.ts:127`; `lib/actions/profile.ts:60` | Supabase's raw words | Our words |
| P2-48 | Billing | `app/api/billing/skip-upgrade/route.ts:21-25`; `upgrade-nudge-status/route.ts:23-27`; `billing-page-client.tsx:249-256` | "Failed to skip for now" every time: it looks for a `sandboxOnly` firm that no longer exists | The skip saves |
| P2-49 | Billing | `lib/billing/polar-billing-lifecycle.ts:32-38,51-58,93-100` | Nothing. A duplicate or free subscription can stay running | An alert to the Firma team |
| P2-50 | Billing | `app/api/billing/catalog/route.ts:17-23`; `polar-plans-picker.tsx:738,746` | Raw provider text, or "Could not load plans (502)" | "Couldn't load plans. Try again in a minute." |
| P2-51 | Billing | `onboarding/page.tsx:1000-1011`; `success-redirect-card.tsx:135-138` | Progress save fails after paying: back on the plan step | "Your payment went through. We couldn't move you on. Continue." |
| P2-52 | Billing | `billing-page-client.tsx:200-206,226-232` | Bounced off Billing; false "Billing isn't available for your role" | "Couldn't load billing · {reason}" |
| P2-53 | Billing | `app/api/billing/subscription/cancel/route.ts:53-63` | No caller. A DB failure after Polar canceled would answer 500 | Fix or remove before anything calls it |
| P2-54 | Onboarding | `onboarding/page.tsx:605-609,716`; `app/api/firms/default-slug/route.ts:24-26` | "Please ensure the database is running (e.g. supabase start for local dev)" | "Couldn't reach us. Check your connection and try again." |
| P2-55 | Onboarding | `app/(app)/auth/callback/route.ts:50,53` | Unguarded after the session is set: probably a bare 500 | Send to `/d` or sign-in with a message |
| P2-56 | Onboarding | `lib/actions/invitations.ts:367`; `invite-landing-client.tsx:93,109` | "Invitation Error" plus raw Prisma text | "Couldn't join just now. Retry." |
| P2-57 | Brio | `R/files-agent/scaffold/route.ts:313,339,346,354`; `files-scaffold-panel.tsx:176,186,192` | "Created 6 folders, 3 could not be created." no reason | Each folder's reason, as apply reports |
| P2-58 | Brio | `files-agent-panel.tsx:327,447,500` | "Needs attention · Please try again." | "Couldn't reach Brio. Nothing was changed." |
| P2-59 | Support | `components/support/support-store.ts:50,76,87,91-92,102,110,163-166`; `support-request-panel.tsx:92,102,124` | Title only. A throw after filing says "couldn't send", so a retry duplicates | Keep the reason; say the ticket exists |
| P2-60 | Support | `app/error.tsx:79-81,110-112`; `app/global-error.tsx:75-82`; `error-boundary.tsx:105-107,168-169` | "A critical error occurred." no reference. The report's slug regex looks for `/o/`, `/p/`, which today's URLs lack | "Something went wrong on this page. Reference {digest}." |
| P2-61 | Dossier | `lib/actions/engagement-wiki.ts:255,257,323,327` | Rename: Firma's title changes, storage's doesn't. Delete: file stays. No word | "Deleted here, but the file is still in Google Drive." |
| P2-62 | Search | `global-search-view.tsx:386-398`; `app/api/firms/[firmId]/search/picker-data/route.ts:68` | "Nothing available" in the @ picker | "Couldn't load options." |
| P2-63 | Dead paths | `app/api/provision/route.ts:172`; `app/api/firms/route.ts:59`; `app/api/onboarding/{create-org,create-client,create-project,test-org,create-custom-workspace,domain-options,detect-orgs,import-orgs}/route.ts`; `app/api/firms/[firmId]/drive-alerts/route.ts`; `app/api/connectors/route.ts`; `google-drive/test/route.ts:55`; `R/index-project/route.ts:97`; others in the inventory | Generic words on routes with no browser caller | Delete them, or fix if any comes back |
| P2-64 | System admin | `app/api/system/**` (20 or so routes); `app/(app)/system/integrations/page.tsx:74,90,129`; `jobs/page.tsx:96`; `admin-scripts/page.tsx:40,56`; `platform-maintenance/page.tsx:116` | Status codes and `String(e)`. Worst: `reprovision-firms/route.ts:128-152` counts a firm `queued` although no job listens for the event | The real reason; count only what started |
| P2-65 | System admin | `lib/platform-maintenance.ts:169-171`; `lib/firm-maintenance.ts:335,357` | Admin not told how many maintenance emails failed | "Sent to 40 of 42." |
| P2-66 | Marketing site | `app/actions/submit-contact.ts:50,69,73,106`; `submit-waitlist.ts:62,81,85` | "Failed to verify captcha." for a refused captcha; "Database error occurred." | "We couldn't send this. Please email us." |

---

## Read and judged fine

About 300 catches and fallbacks, by kind. The inventory has one example of each.
- **Must not cost the action:** audit `.fireAndForget()`, Sentry and metering, event notifications and emails where the action itself succeeded.
- **Self-correcting:** reminder upserts and cleanups, JWT metadata refreshes, location backfills, housekeeping passes.
- **Fail open, server still enforces:** billing cap pre-checks, permission caches, permission probes that default to no.
- **Nothing for the person to do:** browser storage wrappers, clipboard and layout preferences, thumbnail and brand fallbacks, name lookups in reads.
- **Handled by the next line:** `request.json().catch(() => null)` followed by validation.
- **Good already, copy these:** `upload-progress-panel.tsx` (each reason, "1 of 3"), `R/files-agent/apply/route.ts` (per-item outcome), `lib/files/approval-archive.ts` (refuse and undo), `lib/server-action-wrapper.ts` (`{ error }`), engagement chat on credits, sign-in OTP errors.
- **Not mounted, so no finding:** `document-share-modal.tsx`, `google-drive-manager.tsx`, `components/ui/top-bar.tsx`, `components/navigation/sidebar.tsx`, `risky-share-review-modal.tsx`, others listed in the inventory.

## Could not tell

- **Work after the response.** Whether unawaited promises (`upsertFollowUpReminder`, the stage access sync, `Promise.resolve().then(...)`) finish on Vercel. There's no `after()` or `waitUntil`. If they don't, CM-1 and P1-58 happen more often.
- **Second checkout.** Whether a second Polar checkout for a group already paying bills twice or replaces the plan (BL-2).
- **OneDrive "Migrate".** Whether it's meant to leave files behind. Google's flow moves them, and I found no move job for OneDrive, while the toast says "SharePoint site connected". Possibly another P0.
- **Rows that don't backfill.** FI-1 relies on the comment in `R/index-file/route.ts:76-81` saying nothing backfills a missing row. Import into an engagement's root may land in the same state (`import/route.ts:161`).
- **Upload edge cases.** A retry after the provider finished but the connection dropped may leave a second copy. A zero-byte file to OneDrive builds `Content-Range: bytes 0--1/0`. A stalled OneDrive chunk has no timeout.
- **Bulk trash on a link** (`engagement-file-list.tsx:1728`) may always fail, with the reason hidden in the hover title.
- **`Checkout()` from `@polar-sh/nextjs`.** What it answers when Polar itself errors. Package not read.
