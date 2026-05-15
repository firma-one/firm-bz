# MVP Todo List

## HIGH Priority

- [x] **Insights**

- [x] **Audit** — more events need to be captured
  - Event Source: Firm, Client, Engagement, Document
  - Event Type: CREATED, MODIFIED, DELETED, OPENED, DOWNLOADED, SHARE-CREATED, SHARE-MODIFIED, SHARE-DELETED

- [ ] **Connectors** — restore the functionality of setting up the Workspace on Google Shared Drive in addition to My Drive

- [ ] **Finalize Document** — [plan](/.claude/plans/update-docs-mvp-todo-md-we-need-structured-hinton.md)
  - Client accepts the document → status set to `Finalized`; document becomes read-only
  - Engagement Lead can unlock it (revert to `Draft`) if revisions are needed
  - Finalization notifies internal team and locks sharing permissions

- [ ] **Document Intake** — [plan](.claude/plans/update-docs-mvp-todo-md-we-need-structured-hinton.md)
  - External personas (EC, EV) upload → land in per-engagement `Staging` folder, isolated from other clients
  - Reminder triggered for Engagement Lead to review and move approved files to `General`
  - On EL move: Staging copy removed, audit event `DOCUMENT_MOVED` recorded

- [ ] **File/Folder operations** — [plan](/.claude/plans/update-docs-mvp-todo-md-we-need-structured-hinton.md)
  - Copy/Move b/w Engagements
  - Bulk select & download files or select folder & download.

- [ ] **Confidential folder** — implement via `settings.locked = private`, Google Drive permissions, or both; currently the folder exists on Drive but has no enforced access control in the app

- [ ] **Cleanup: remove Staging & Confidential folder creation from onboarding** — these folders are no longer surfaced in the UI; remove the Drive-side provisioning code that creates them during workspace setup
