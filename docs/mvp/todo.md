# MVP Todo List

## Beta Feedback Fixes

See [`.claude/plans/beta-feedback-fixes.md`](../../.claude/plans/beta-feedback-fixes.md) for the full tracked list of beta feedback items and their completion status.

---

## HIGH Priority

- [ ] **Connector: OneDrive Support** — [plan](../../.claude/plans/connectors-additional-providers-support.md)
  - Phase 1: Generalize/abstract existing GDrive code to be multi-connector ready (5–8 days)
  - Phase 2: Implement OneDrive connector on top of the abstracted foundation (10–14 days)

- [ ] **Connector: Replace Owning Account** — [plan](../../.claude/plans/connectors-additional-providers-support.md#1a--replace-owning-account-gdrive-specific-feature)
  - Let a firm admin authenticate as a different Google account on an existing Connector
  - Old connector revoked + de-linked; new connector linked to firm; Drive workspace structure preserved
  - UI: "Replace account" button with confirmation dialog alongside existing Reconnect/Disconnect

- [ ] **Cleanup: connector client-level refactor — legacy removal** — [plan](../../.claude/plans/connector-client-level-cleanup.md)
  - Remove `connector.settings.clientFolderIds` path once all clients have `driveFolderId` set
  - Remove `Firm.connectorId` legacy FK and simplify `getConnections()` union in registry
  - Remove `connector.settings.orgFolderId` redundancy (prefer `Firm.firmFolderId` exclusively)
  - Pre-condition: live in production 2+ weeks with no folder resolution issues

## Search & Discovery

- [ ] **Doc Search: Snippet Summaries + Browser-Side Query Embedding** — [plan](../../.claude/plans/doc-search-snippet-and-client-embeddings.md)
  - #1 Replace 250MB distilbart index-time summarizer with an extractive text snippet (`SEARCH_SUMMARY_MODE` switch; legacy path retained until sign-off) — implemented, pending Deepak's DB verification
  - #1b Widen summarizable mime types: Google Sheets/Slides via Drive export, and modern Office (docx/pptx/xlsx) + PDF parsed in-memory (officeparser / pdf-parse; 15MB size guard; no disk writes) — implemented alongside #1
  - #1c System-admin "Re-index documents" button per firm on `/system/user-data-map` (POST `/api/system/user-data-map/reindex`) — implemented, replaces the delete-and-reupload workaround
  - #2 Embed search queries in the browser (preloaded MiniLM worker, `NEXT_PUBLIC_CLIENT_EMBEDDINGS`, server fallback) — approved, value under discussion
  - NL query interpreter ("#4", prose → inferred filter chips) evaluated and dropped 2026-07-09 — explicit @ picker chips remain the design

- [ ] **Global Document Search** — [plan](../../.claude/plans/global-search-share-status-overview-metrics.md)
  - Cross-engagement search (e.g. "find all legal docs for NaviQure AI"); currently scoped to one project at a time
  - Extend `prepareTextForEmbedding` to include `clientName` and `engagementTitle` in the vector string; update all `indexFile` callers to pass names
  - New firm-scoped API: `GET /api/firm/[firmId]/search`; new `GlobalSearchPanel` component; new `/d/f/[slug]/search` page
  - One-time re-index admin endpoint to backfill existing documents with enriched embeddings

## Delivery Workflow

- [ ] **Redesign Share Status Labels** — [plan](../../.claude/plans/global-search-share-status-overview-metrics.md)
  - Replace `to_do | in_progress | in_review | done` with `ready | in_progress | in_review | approved`
  - "Ready" = deliverable identified but not yet shared; "Approved" = client confirmed
  - Backward-compat: normalize old DB values on read (no migration needed — JSON field)
  - Update `sharing-settings.ts`, Kanban board (`engagement-shares-tab.tsx`), shares API routes, and insights dashboard

## Personalization

- [ ] **Calendar Panel & Self-Reminders** — [plan](../../.claude/plans/personalization-calendar.md)
  - Dockable calendar dropdown in TopBar (Calendar icon); mini month grid with reminder dots; click future date → create self-reminder via `createManualReminder()`
  - "Show full calendar" → `/d/u/calendar` full-page view with month navigation; past dates show historical reminders; new Calendar tab in `/d/u/` layout
  - See also: [Firm Calendar plan](../../.claude/plans/firm-calendar-engagement-deliverable-timeline.md) — separate, firm-scoped calendar of Engagement/Deliverable dates (not personal reminders); distinct feature, same "calendar" surface area

## Client Pull Features — [plan](../../.claude/plans/client-pull-features.md)

> Add-ons to give fCMO end-clients a reason to return proactively, without touching core fCMO workflows.

- [ ] **Shared Action Items Tracker** — per-engagement checklist; fCMO creates items with optional assignee + due date; external users check off their items; in-app notification on assignment
  - New `EngagementActionItem` model; new `action-items` tab in engagement workspace (visible to all personas, write-gated to internal roles)

- [ ] **Deliverables Timeline** — read-only timeline view grouping shared documents by month + activity status; reuses existing `dueDate` + `ActivityStatus` fields; no schema changes
  - New `timeline` tab in engagement workspace; new `/api/projects/[projectId]/timeline` route
  - See also: [Firm Calendar plan](../../.claude/plans/firm-calendar-engagement-deliverable-timeline.md) — broader firm-scoped Outlook-style calendar view of Engagement/Deliverable dates across all clients, with per-engagement color-coded toggleable "calendars"; overlaps with this item's due-date data but is engagement/firm-scoped rather than per-engagement-tab

- [ ] **Weekly Client Email Digest** — Monday morning email to external engagement members (EC + EV) summarising last week's completed docs, pending reviews, and open action items; toggled per engagement by Engagement Lead
  - Activate `email` channel on existing notification infrastructure; new Inngest cron function; new email template; `digestEnabled` flag on `Engagement.settings`

## Client Management

- [ ] **Contact Follow-Up Date** — [plan](../../.claude/plans/contact-follow-up-date.md) — Client Settings › Contacts: add a "Follow Up" date field per contact; auto-creates a reminder assigned to all Firm Admins on save

## Overview & Metrics

- [ ] **Engagement Overview: Revision Rounds & Approval Cycle Time** — [plan](../../.claude/plans/global-search-share-status-overview-metrics.md)
  - Add two KPI tiles to the engagement insights dashboard: "Avg Revision Rounds" (from `DOCUMENT_SHARE_CHANGED` audit events) and "Avg Approval Cycle" (from `finalizedAt − createdAt` in share settings)
  - Top-5 deliverables by revision count shown in a detail card
  - No schema changes; source from existing `PlatformAuditEvent` table and `settings.share` JSON

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

## Bookmarks & Topbar Quick Links

- [ ] **Bookmark Pages & Documents** — users can bookmark any app page (e.g. a specific engagement, client, or section) or document for quick access
  - Bookmark button in the topbar or page header; bookmarks stored per-user in DB
  - Dedicated "Bookmarks" section in the sidebar or command palette for quick navigation
  - Bookmarks persist across sessions and are scoped to the firm the user is currently in

- [ ] **GDrive Recycle Bin quick link (Firm Admin only)** — quick link icon in the Topbar that opens the Google Drive Recycle Bin in a new tab; visible to Firm Admins only. See [beta-feedback-fixes.md §7](../../.claude/plans/beta-feedback-fixes.md)

## Infrastructure / Maintenance

- [ ] **IMP: Batch `index-file` calls in `processUploads` (multi-file picker upload)** — `frontend/components/projects/hooks/use-engagement-upload.ts`
  - `processUploads` (plain multi-file picker, not folder upload) still POSTs `/api/projects/[projectId]/index-file` once **per file**, sequentially inside its upload loop — unlike `handleBatchResolution` and `processFolderUpload`, which already send one batched POST (`files: [...]`) for the whole set
  - For N individually-selected files (e.g. 100), that's N sequential round-trips (each doing a docId upsert + Inngest enqueue) before the post-upload `fetchFiles()`, instead of 1
  - Fix: collect `{ externalId, fileName }` per successful upload in the loop (same pattern as the other two paths) and fire one batched `index-file` POST after the loop, instead of relying on each `uploadFile()` call's individual `docIdRequestSettled` promise
  - Discovered 2026-07-23 while fixing the docId-not-showing-instantly bug; not a regression from that fix, a pre-existing inefficiency in this one path

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
