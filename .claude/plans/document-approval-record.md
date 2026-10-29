# Approval record: approve, lock, and archive a copy of the approved version

Agreed direction with Deepak 2026-10-29: approving a document locks it, puts an exact copy of the
approved version in the engagement's **Archive** folder, and records it. The records form an
append-only list, a **decision record** of what was signed off. A later phase can unlock the
document and carry on editing; the record and its copy stay.

Today (checked against the code): approving moves the stage and stamps `share.finalizedAt`;
Finalize (`sharing/finalize`) makes the file read-only in storage and writes `settings.lock`.
Neither records the version, and the audit entries carry only the file name. Unlock clears the lock
and `finalizedAt` but leaves the document at Approved. `share.publishedVersionId` / `publishedAt`
exist in the settings types but nothing writes them.

## 1. The record

`settings.approvals: ApprovalRecord[]`, append-only, newest last:

```ts
interface ApprovalRecord {
  id: string                      // uuid, for linking from the audit trail
  version: {
    id: string                    // the provider's id: Google revision id, Graph version id
    label?: string                // OneDrive's "3.0"; none on Google Drive
    savedAt: string               // when that version was saved (the provider's modifiedTime)
    savedBy?: string
    size?: string
  }
  archived: { fileId: string; name: string }   // the copy in Archive (section 3)
  approvedAt: string
  approvedBy: string              // user id
  unlockedAt?: string             // set when this approval is reopened (section 4)
  unlockedBy?: string
}
```

- Outside `share` on purpose: un-sharing or untagging resets `share`. Add `approvals` to
  `ASSET_SETTING_KEYS` so `assetSettingsOf` keeps it.
- Written with one `jsonb_set` append, so no other settings write can drop it.
- Replaces the unused `publishedVersionId` / `publishedAt`, which stay in the types until Deepak
  signs off removing them.

## 2. Approving

One action: moving a document to Approved (the stage route; firm leads only, as now). In this order,
so the copy is exactly the version recorded:

1. **Lock** the file: the Finalize logic (storage read-only, roles downgraded and kept in
   `settings.lock`), moved from `sharing/finalize` into a shared `lib/files/finalize.ts`.
2. **Read** the current version (Google's head revision; the newest Graph version). Locked, it
   can't change under us.
3. **Copy** it into Archive (section 3).
4. **Record** the `ApprovalRecord`, then move the stage.
5. Audit `DOCUMENT_STATUS_CHANGED` and `DOCUMENT_FINALIZED` with the record's id, version and copy,
   so the Activity feed reads "approved Version 3.0".

If any step fails, the approval is refused and the lock undone (section 5).

Finalize on its own stays for files outside any deliverable: a lock with no record and no copy.

## 3. The Archive folder

- A new engagement root beside **General**, **Confidential** and **Staging**, in the engagement's
  own storage (its client's one connector, whoever owns that Drive). Created on the first approval
  and kept in the connector's `projectFolderSettings` as `archiveFolderId`, like the other roots.
- Layout: `Archive / <deliverable> / <file name> · approved <Version 3.0 | Oct 28, 2026>.<ext>`.
  Each approval round adds one copy; nothing is overwritten.
- The copy is exact, in the file's own format: Google's and OneDrive's copy calls (already in
  `google-drive-connector.copyFile` and `onedrive-file-ops`). A Google Doc is copied as a Google Doc,
  not a PDF.
- The copy is made read-only, so the archive itself can't drift.
- **Out of sight in Firma** (Deepak, 2026-10-29): Archive is left out of the Files list (no root
  in the switcher, never listed or browsed), and out of Doc Search, Brio and indexing. The
  connector's sync and indexing jobs skip `archiveFolderId` and everything under it. An archived
  copy is reached only through a download option, built later (likely from the Approvals section).
- In storage itself the folder is shared with the firm's own roles only. In a client-owned Drive
  the client's admins can always reach it; that's accepted.
- Archive copies aren't tracked work: no stage, not on the Board, not in the Deliverables filter.
- Copies count against the Drive owner's storage quota.

Pinning provider versions (Google's `keepForever`) and fingerprints are dropped: the Archive copy is
the durable record.

## 4. Unlocking for the next phase

`sharing/unlock`, leads only, asks first:

- Sets `unlockedAt/By` on the latest approval record. The record and its Archive copy stay.
- Restores storage roles, as now.
- Moves the document back to **To do** (Deepak, 2026-10-29), and its deliverable follows (a
  backward move, so no client-access change). Unlock is its own action, so the jump back isn't held
  to the usual one-step rule. An approved deliverable is locked, and its documents with it.
  Unlocking one of its documents is the deliberate way to reopen it, and the confirmation says so.
- Audit `DOCUMENT_UNLOCKED` with the record's id and version.

Approving again adds a new record and a new copy: approved 3.0, reopened, approved 5.0.

## 5. When storage can't be reached

Approving needs three storage calls: lock, read the version, copy. They can fail when:

- **The storage connection is broken.** The Drive or OneDrive sign-in expired or was revoked (a
  password change, Firma's access removed, an admin policy). Every call fails until someone
  reconnects.
- **The provider is down or throttling** (Google 429/5xx, Microsoft throttling). A retry a minute
  later works.
- **The file is out of reach.** It was deleted, or moved out of the engagement in Drive since the
  list loaded. Or, with Google's limited `drive.file` permission, it was added straight in Drive
  and Firma can't read its versions.
- Not a failure: a OneDrive library with versioning off has no version list. The copy is still
  made, and the record names the file's current state.

Approving is refused in these cases, with what to do ("Couldn't reach Google Drive to archive the
approved version. Try again, or reconnect the storage"), and any lock already applied is undone.
An approval without its copy is exactly the gap the record exists to close. Only a firm lead
approves, so the message reaches someone who can reconnect.

## 6. On screen

- **Versions tab** (firm roles): the approved version is tagged **Approved** (with who and when); a
  reopened one **Previously approved**.
- **Details pane:** an **Approvals** section listing the decision record, e.g.
  "Version 3.0 · approved Oct 28 by Ana · reopened Nov 3", newest first. Downloading an entry's
  Archive copy from here is the later option; until then the record shows, the copy doesn't.
- **Deliverable pane and Board:** each document's last approved version beside its stage.
- **Downloads:** anyone downloads what they can see, under the same rules as any file (the
  deliverable's Allow download and PDF-only settings for clients). Archive copies aren't on screen,
  so they wait for the later download option, which decides who may use it.
- /tour mirrors the Versions tab and the Approvals section.

## 7. Existing data

Documents approved or finalized before this have no record and no copy. They show "Approved before
approvals were recorded". No backfill: the approved version can't be known afterwards.

## Decisions

Settled with Deepak 2026-10-29:
- Pin at **Approved**: approving is when the record and the copy are made.
- Unlocking moves the document back to **To do**.
- A copy of the approved version goes in an **Archive** root beside General; who may see it is
  decided later.
- Downloads follow what each person can see; no separate client path.
- An approval is refused when storage can't be reached, and any lock already applied is undone
  (section 5).

- Archive is left out of the Files list, Doc Search, Brio and indexing; a download option comes later.

Later (not in this build):
- The download option for an archived copy, and who may use it.

## Built (2026-10-29)

- **Record:** `lib/files/approvals.ts` (types, `approvalsOf`, `currentApproval`, `versionName`,
  `archiveNameFor`). `approvals` added to `ASSET_SETTING_KEYS`.
- **Storage:** `lib/files/storage-lock.ts` (lock and unlock in storage, moved out of Finalize and
  Unlock, which now use it); `lib/files/approval-archive.ts` (current version, Archive folder,
  `archiveApprovedVersion`, `recordApproval`). Google's current version is the head revision of an
  uploaded file, or the last revision (paged) of a Doc, Sheet or Slides file.
- **Approve:** the stage route runs it for a document moving to Approved, after the deliverable
  confirmation; refuses with 502 `approval_storage` and the lock undone; audits the version.
- **Unlock:** restores roles, marks the standing approval reopened, and moves an approved document
  to To do (its deliverable follows). A document only finalized keeps its stage.
- **Hidden:** both providers' listings filter `archiveFolderId` as they do Staging (Google now reads
  `projectFolderSettings` under `organizations[firmId]` too, as OneDrive already did). Search and
  indexing crawl from General, Confidential and Staging only, so they never reach Archive. Clients
  are sent approvals without their Archive copy.
- **On screen:** Versions tab tags Approved / Previously approved; Details tab lists Approvals; the
  deliverable pane names the approved version on its pill's hint; the Activity feed names the
  version for approvals, locks and reopenings; Unlock's confirmation and toast say what now happens.

Departures from the plan above:
- The Archive folder is made **owner-only** (the connected account), not shared with the firm's
  roles: with no way to reach it in Firma yet, nobody else needs it. The later download option goes
  through the connector.
- A **private** document (already locked as private) is approved and archived but keeps its private
  lock rather than taking the finalize lock.
- The Board shows no approval detail; its cards are deliverables, and the deliverable pane has it.
- /tour has no Versions or Details pane to mirror.
- Not verified against a live Drive or OneDrive: covered by tests with the storage calls mocked.
