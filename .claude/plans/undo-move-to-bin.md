# Undo on "Moved to Bin"

Asked 2026-10-17: an Undo button on the "Moved to Bin" toast in the engagement Files list.

## What Move to Bin does today

`POST /api/drive-action { action: 'trash', projectId }`:
1. Trashes the item in the provider (Google: `trashed: true`; OneDrive: Graph DELETE to the recycle bin).
2. Sends `file.delete.requested` / `folder.delete.requested`. The Inngest job (`reconcileFileDeletion`,
   `reconcileFolderDeletion`) runs within seconds and is destructive:
   - removes the item from the search index;
   - revokes its external share permissions in Drive and trashes the guest PDF copies;
   - deletes its `EngagementDocumentSharingUser` rows;
   - fires `document.deleted` (comment reminders are cleaned up);
   - **deletes the `EngagementDocument` row**, and with it (FK cascade) the comments, the ID
     (QSR-73), the deliverable settings.
3. Records `DOCUMENT_DELETED` with `reason: 'moved_to_bin'`.

So taking the file out of the Drive Bin is not enough: by the time Undo is clicked the app's
records are gone, and the file would come back as a new item with a new ID and no comments.

## Design: an undo window

- **The cleanup waits.** Trash from the Files list sends the job `undoable: true` plus the
  connector it went through. The job first sleeps `TRASH_UNDO_WINDOW` (60s), then asks the
  provider whether the item is still in the Bin. If the provider positively says it is not, the
  job stops: nothing is deleted. If the item is still trashed, gone, or the provider can't be
  reached, it cleans up exactly as before. Other senders of the event (sync, linked-files) don't
  set `undoable` and are unchanged.
- **Undo only restores the file in the provider.** `POST /api/drive-action { action: 'restore' }`:
  - engagement-scoped only, same gates as trash: `canEditProject`, the engagement's own
    connector, the file inside its tree, and the closed-engagement block;
  - the file's `EngagementDocument` row must still exist (inside the window). Otherwise it is
    too late, and the answer says to restore it from the provider's Bin;
  - refuses when the item's folder is itself in the Bin;
  - idempotent: an item already out of the Bin answers success;
  - records `DOCUMENT_RESTORED` (new string event type; `eventType` is a string column, so no
    migration).
- **Providers.** `restoreFile` is optional on the adapter. Google implements it
  (`trashed: false`). OneDrive doesn't: Graph's `driveItem: restore` works only on OneDrive
  Personal, so OneDrive files get no Undo.
- **The toast.** "Moved to Bin" carries Undo (Google only) and stays 10s, paused while hovered.
  A newer toast with the same title now replaces the older one, so trashing two files in a row
  leaves the second file's Undo, not the first's.

## Trade-off accepted

For up to the window (60s) after a trash, views that read `EngagementDocument` rows rather than
Drive can still show the item: the Overview counts, Doc Search, due dates on the Calendar. The
Files list reads Drive and drops it at once. The Board's trash uses its own route
(`/documents/[id]/trash`) and is unchanged.

## Not covered

- Bulk trash (the trash queue) gets the window but no Undo button.
- Links (`documentType: 'LINK'`) are deleted from the database, not trashed: no Undo.
