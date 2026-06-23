# MVP Todo List

## Beta Feedback Fixes

See [`.claude/plans/beta-feedback-fixes.md`](../../.claude/plans/beta-feedback-fixes.md) for the full tracked list of beta feedback items and their completion status.

---

## HIGH Priority

- [x] **Insights**

- [x] **Audit** — more events need to be captured
  - Event Source: Firm, Client, Engagement, Document
  - Event Type: CREATED, MODIFIED, DELETED, OPENED, DOWNLOADED, SHARE-CREATED, SHARE-MODIFIED, SHARE-DELETED

- [x] **Connectors** — restore the functionality of setting up the Workspace on Google Shared Drive in addition to My Drive

- [ ] **Connector: OneDrive Support** — [plan](../../.claude/plans/connectors-additional-providers-support.md)
  - Phase 1: Generalize/abstract existing GDrive code to be multi-connector ready (5–8 days)
  - Phase 2: Implement OneDrive connector on top of the abstracted foundation (10–14 days)

- [ ] **Connector: Replace Owning Account** — [plan](../../.claude/plans/connectors-additional-providers-support.md#1a--replace-owning-account-gdrive-specific-feature)
  - Let a firm admin authenticate as a different Google account on an existing Connector
  - Old connector revoked + de-linked; new connector linked to firm; Drive workspace structure preserved
  - UI: "Replace account" button with confirmation dialog alongside existing Reconnect/Disconnect

- [x] **Finalize Document** — [plan](/.claude/plans/update-docs-mvp-todo-md-we-need-structured-hinton.md)
  - Client accepts the document → status set to `Finalized`; document becomes read-only
  - Engagement Lead can unlock it (revert to `Draft`) if revisions are needed
  - Finalization notifies internal team and locks sharing permissions

- [x] **Document Intake** — [plan](.claude/plans/update-docs-mvp-todo-md-we-need-structured-hinton.md)
  - External personas (EC, EV) upload → land in per-engagement `Staging` folder, isolated from other clients
  - Reminder triggered for Engagement Lead to review and move approved files to `General`
  - On EL move: Staging copy removed, audit event `DOCUMENT_MOVED` recorded

- [ ] **Intake: PENDING_APPROVAL Queue on Shares Tab** — [plan](../../.claude/plans/intake-pending-approval-shares.md) — **VERY HIGH**
  - Add `PENDING_APPROVAL` to `DocumentSharingPermissionStatus` enum
  - On EC/EV upload: create `engagement_document_sharing_users` row with `PENDING_APPROVAL` immediately
  - Shares tab shows pending intakes in muted style with inline Approve / Reject — EL gets a single cross-folder queue
  - On approve: flip row to `GRANTED` + set `slug` atomically; on reject: cascade delete handles cleanup
  - Guard `syncDocumentSharingUsers` from overwriting `PENDING_APPROVAL` rows

- [x] **File/Folder operations**
  - [x] Copy to another Engagement — files/folders land in target's General folder; Firm › Client › Engagement picker with tree UI; Move intentionally deferred (non-atomic Drive + DB op)
  - [x] Bulk select & download files or select folder & download

- [x] **Confidential folder** — implement via `settings.locked = private`, Google Drive permissions, or both; currently the folder exists on Drive but has no enforced access control in the app

- [ ] **Cleanup: remove Staging & Confidential folder creation from onboarding** — these folders are no longer surfaced in the UI; remove the Drive-side provisioning code that creates them during workspace setup

- [ ] **Cleanup: connector client-level refactor — legacy removal** — [plan](../../.claude/plans/connector-client-level-cleanup.md)
  - Remove `connector.settings.clientFolderIds` path once all clients have `driveFolderId` set
  - Remove `Firm.connectorId` legacy FK and simplify `getConnections()` union in registry
  - Remove `connector.settings.orgFolderId` redundancy (prefer `Firm.firmFolderId` exclusively)
  - Pre-condition: live in production 2+ weeks with no folder resolution issues

- [ ] **Workspace Picker Route** — [plan](../../.claude/plans/workspace-picker-route.md)
  - Move "Choose Your Workspace" (onboarding step 0) from `/d/onboarding` to `/d/f/`
  - Returning users with multiple firms get AppSidebar chrome instead of OnboardingBar

## Beta Features (hidden until `enableBetaFeatures` is on in Firm Settings)

- [ ] **Notifications bell (TopBar)** — `components/app/app-topbar.tsx`: entire notifications container gated on `betaFeaturesEnabled` (reads `settings.enableBetaFeatures` from `/api/firm` response alongside branding)
- [ ] **Notifications tab** (`/d/u/` personalization) — `app/(app)/d/u/layout.tsx`: Notifications tab filtered out unless `enableBetaFeatures`; Profile, Recent, Reminders, Bookmarks always visible. Same pattern as Engagement › Board tab in `engagement-workspace.tsx`.

## Client Management

- [ ] **Contact Follow-Up Date** — [plan](../../.claude/plans/contact-follow-up-date.md) — Client Settings › Contacts: add a "Follow Up" date field per contact; auto-creates a reminder assigned to all Firm Admins on save

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

## AI Features — [plan](../../.claude/plans/ai-insights-and-business-features.md)

AI layer using Gemma 4 (HuggingFace Transformers, same runtime as release notes generation — no API key, model cached locally).

- [ ] **AI Firm Brief** — 3–5 sentence plain-English narrative at the top of the Insights page; synthesises pipeline, overdue engagements, unanswered threads, revenue at risk; cached in `firm.settings.aiBrief` (1h TTL), refreshable on demand

- [ ] **Auto-Reminder: Unanswered Comment Threads** — Inngest cron every 4h; threads unanswered > 48h by an external collaborator → AI-classified urgency → reminder auto-created for firm admin; duplicate-safe via `metadata.source = 'ai_thread_alert'`

- [ ] **Engagement Kickoff Checklist** — when engagement transitions to `ACTIVE`, Gemma generates a 5–8 item task checklist (tailored to contract type) stored in `engagement.settings.aiChecklist` and surfaced in the engagement overview

- [ ] **Weekly Digest Notification** — Inngest cron every Monday 8am; Gemma-written brief covering last week's activity and top 3 priorities for the week, delivered as an in-app notification to firm admins

## Email

- [ ] **Firmaone Email Accounts**
  - All notification emails should come from `no-reply@firmaone.com` so end users don't reply expecting a response
  - Establish a country-neutral persona (e.g. `sam@firmaone.com`) for client-facing communication

- [ ] **Email Document Link** — ActionMenu › Share › Email Link sends the document deeplink to a recipient

## Easy Document View

- [ ] **Browser Preview** — reuse the DOWNLOAD mechanism (bypasses Google secure link flow) to render a quick in-browser preview; intended for read-only viewing without Comments or Collaboration overhead

## Bookmarks & Topbar Quick Links

- [ ] **Bookmark Pages & Documents** — users can bookmark any app page (e.g. a specific engagement, client, or section) or document for quick access
  - Bookmark button in the topbar or page header; bookmarks stored per-user in DB
  - Dedicated "Bookmarks" section in the sidebar or command palette for quick navigation
  - Bookmarks persist across sessions and are scoped to the firm the user is currently in

- [ ] **GDrive Recycle Bin quick link (Firm Admin only)** — quick link icon in the Topbar that opens the Google Drive Recycle Bin in a new tab; visible to Firm Admins only. See [beta-feedback-fixes.md §7](../../.claude/plans/beta-feedback-fixes.md)

## Infrastructure / Maintenance

- [ ] **Bug: Signup OTP → redirects to `/signin` instead of `/d/signup-success`** — [plan](../../.claude/plans/signup-session-issue.md) — deferred past beta
  - Race condition: middleware reads auth cookie before browser has committed it after `verifyOTP()`
  - Fix: gate `window.location.href` on `onAuthStateChange SIGNED_IN` event instead of `getSession()`
  - Also fix: skip button in `components/signup/signup-success.tsx` incorrectly calls `signOut()` before redirecting to `/signin`

- [ ] **Refactor: Replace `sandboxOnly` with `isAnchorFirm()`** — [plan](../../.claude/plans/refactor-is-anchor-firm.md)
  - `Firm.sandboxOnly` maps to DB column `isAnchor`; the two names are used interchangeably across 165+ references
  - `isAnchorFirm()` utility added to `lib/billing/effective-billing-caps.ts`; all new code should use it
  - Migrate existing reads in batches: billing/server layer first, then UI components

- [ ] **Unit Tests** — critical business logic coverage
  - Invite flow: token verification, email match, permission fallback (engagementMember DB check)
  - Reminder system: `upsertFollowUpReminder` upsert/dedup, `markReminderDone` cleanup, `entityTableKey` resolver mapping
  - Permission helpers: `checkProjectPermission` cache-first + DB fallback paths
  - Email templates: `renderReminderEmail` subject/body output for all `kind` variants

- [ ] **Web Automation / E2E Tests** — happy-path flows via Playwright
  - Invite flow: receive invite link → signup/signin → land on engagement workspace
  - Setup Reminder: open modal, select assignee, set date, submit → reminder appears in topbar panel
  - Document finalize + unlock cycle
  - File upload (intake) → EL approval → document moves to General

- [ ] **QA Test Scenarios** — [file-list, sharing & preview](../qa/file-list-test-scenarios.md)
  - Covers: duplicate PDF prevention, preview disposition fix, connector resolution fallback chain, EV/EC preview auth, Shares tab Preview icon (grid/list/board), folder session persistence

- [ ] **QA Test Scenarios** — [confirmation dialogs](../qa/confirmation-dialog-tests.md)
  - Covers: ConfirmDialog component baseline + all 17 call sites (file ops, members, contacts, connectors, settings, dashboard, chat, system admin)

- [ ] **QA Test Scenarios** — [groups billing refactor](../qa/group-refactor-tests.md)
  - Covers: new-user onboarding group creation, subscription isolation across groups, gate routes cap enforcement, Polar webhook groupId resolution chain, free-plan resync, cancellation reminders, migration SQL integrity
  - **Known bug B-1:** `firmId: groupId` in `polar-billing-lifecycle.ts:146` — cancellation reminders use default email config instead of firm's custom config

- [ ] **Prisma 7 Upgrade** — [plan](../../.claude/plans/prisma-7-upgrade.md)
  - Phase 1 (now, zero risk): create `frontend/prisma.config.ts`, remove deprecated `package.json#prisma` seed key
  - Phase 2 (dedicated PR): bump to v7, update generator to `prisma-client` with explicit `output`, migrate all `@prisma/client` imports to `@/generated/prisma`

## Future Roadmap

- [ ] **Branded Link Redirect System (`/to/`)** — [PRD](../prd-linkfarm.md) — Deferred; self-hosted URL shortener at `firma.bz/to/<slug>` with click tracking, source attribution, and UTM passthrough. Revisit when content distribution volume justifies the infrastructure (see PRD for conditions).
