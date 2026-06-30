# Completed Tasks — 2026-06-29

## HIGH Priority

- [x] **Insights**

- [x] **Audit** — more events need to be captured
  - Event Source: Firm, Client, Engagement, Document
  - Event Type: CREATED, MODIFIED, DELETED, OPENED, DOWNLOADED, SHARE-CREATED, SHARE-MODIFIED, SHARE-DELETED

- [x] **Connectors** — restore the functionality of setting up the Workspace on Google Shared Drive in addition to My Drive

- [x] **Finalize Document** — [plan](/.claude/plans/update-docs-mvp-todo-md-we-need-structured-hinton.md)
  - Client accepts the document → status set to `Finalized`; document becomes read-only
  - Engagement Lead can unlock it (revert to `Draft`) if revisions are needed
  - Finalization notifies internal team and locks sharing permissions

- [x] **Document Intake** — [plan](.claude/plans/update-docs-mvp-todo-md-we-need-structured-hinton.md)
  - External personas (EC, EV) upload → land in per-engagement `Staging` folder, isolated from other clients
  - Reminder triggered for Engagement Lead to review and move approved files to `General`
  - On EL move: Staging copy removed, audit event `DOCUMENT_MOVED` recorded

- [x] **File/Folder operations**
  - [x] Copy to another Engagement — files/folders land in target's General folder; Firm › Client › Engagement picker with tree UI; Move intentionally deferred (non-atomic Drive + DB op)
  - [x] Bulk select & download files or select folder & download

- [x] **Confidential folder** — implement via `settings.locked = private`, Google Drive permissions, or both; currently the folder exists on Drive but has no enforced access control in the app

- [x] **Cleanup: remove Staging & Confidential folder creation from onboarding** — these folders are no longer surfaced in the UI; remove the Drive-side provisioning code that creates them during workspace setup

- [x] **Intake: PENDING_APPROVAL Queue on Shares Tab** — [plan](../../.claude/plans/intake-pending-approval-shares.md)
  - Add `PENDING_APPROVAL` to `DocumentSharingPermissionStatus` enum
  - On EC/EV upload: create `engagement_document_sharing_users` row with `PENDING_APPROVAL` immediately
  - Shares tab shows pending intakes in muted style with inline Approve / Reject — EL gets a single cross-folder queue
  - On approve: flip row to `GRANTED` + set `slug` atomically; on reject: cascade delete handles cleanup
  - Guard `syncDocumentSharingUsers` from overwriting `PENDING_APPROVAL` rows

- [x] **Workspace Picker Route** — [plan](../../.claude/plans/workspace-picker-route.md)
  - Move "Choose Your Workspace" (onboarding step 0) from `/d/onboarding` to `/d/f/`
  - Returning users with multiple firms get AppSidebar chrome instead of OnboardingBar

## Beta Features (hidden until `enableBetaFeatures` is on in Firm Settings)

- [x] **Notifications bell (TopBar)** — `components/app/app-topbar.tsx`: entire notifications container gated on `betaFeaturesEnabled` (reads `settings.enableBetaFeatures` from `/api/firm` response alongside branding)
- [x] **Notifications tab** (`/d/u/` personalization) — `app/(app)/d/u/layout.tsx`: Notifications tab filtered out unless `enableBetaFeatures`; Profile, Recent, Reminders, Bookmarks always visible. Same pattern as Engagement › Board tab in `engagement-workspace.tsx`.

## Easy Document View

- [x] **Browser Preview** — reuse the DOWNLOAD mechanism (bypasses Google secure link flow) to render a quick in-browser preview; intended for read-only viewing without Comments or Collaboration overhead

## Reminders

- [x] **Firm-Level Reminder Email Configuration** — [plan](../../.claude/plans/firm-reminder-email-config.md)
  - Immediate notification on reminder creation (sync email)
  - Recurring reminder emails via Inngest fan-forward (every N days, starting X days before due)
  - Firm Settings card to configure both

- [x] **Manual Reminders on Documents & Comments**
  - SetupReminderModal — reusable portal component with multi-select assignees, date picker, "Me" row, pre-populates existing reminders
  - Per-comment CalendarClock button in Comments pane
  - "Setup Reminder" in document action menu (⋯)
  - Branded HTML reminder email template (`lib/email-templates/`)
