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
  - NL query interpreter ("#4", prose → inferred filter chips) was dropped 2026-07-09 — **superseded**: shipped 2026-09-25 as grounded, access-scoped resolution under [ai-native-features.md §A](../../.claude/plans/ai-native-features.md). The 2026-07 rejection stands against the *ungrounded regex/chrono* approach only; see §A.2 for the decision record. The keyboard-driven @ picker was also replaced by plain dropdowns in the same round.

- [ ] **Global Document Search** — [plan](../../.claude/plans/global-search-share-status-overview-metrics.md)
  - Cross-engagement search (e.g. "find all legal docs for NaviQure AI"); currently scoped to one project at a time
  - Extend `prepareTextForEmbedding` to include `clientName` and `engagementTitle` in the vector string; update all `indexFile` callers to pass names
  - New firm-scoped API: `GET /api/firm/[firmId]/search`; new `GlobalSearchPanel` component; new `/d/f/[slug]/search` page
  - One-time re-index admin endpoint to backfill existing documents with enriched embeddings

## Delivery Workflow

- [ ] **Deliverable Status Derivation, Multi-Assignee & History** — [plan](../../.claude/plans/2026-08-deliverable-status-derivation-and-assignee-history.md)
  - Deliverable status becomes derived from sub-task Document statuses instead of manually set (drag-drop/dropdown removed for Deliverables)
  - Document assignee becomes multi-select; in-review assignees shown as "Approver(s)" in UI (same underlying field)
  - Persistent status/assignee change history per Document, powering a timeline view (reuses `PlatformAuditEvent`, exempted from purge)

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

- [ ] **Engagement Invite: Immediate Join for Existing Users** — [plan](../../.claude/plans/engagement-invite-immediate-join-existing-user.md)
  - Skip the "Accept Invitation" email/click flow when the invitee already has an account — create `EngagementMember`/`ClientMember`/`FirmMember` rows synchronously inside `inviteMember()` so the engagement appears in their dashboard on next sign-in without any click-through
  - Fork in `inviteMember()` on `findAuthUserIdByEmail()`: unregistered users → today's flow unchanged; registered users → new `provisionAndNotifyExistingUser()` runs the join transaction and sends a new "Go to Engagement →" email (no accept-invite link, no 7-day expiry)
  - Extract the membership transaction currently inline in `acceptInvitation()` (invitations.ts:506–614) into a shared `joinEngagementForUser()` helper so both paths run identical logic (JWT `active_firm_id`, Drive folder grant, `project.member.added` Inngest event, cache invalidation)
  - Invitation record still created but written straight to `JOINED` — no PENDING state ever shown; keeps resend/remove/audit assumptions intact
  - No schema changes; ~½–1 day effort; low regression risk (only Scenario 1 touch is a pure lift-and-shift refactor)

## Overview & Metrics

- [ ] **Engagement Overview: Revision Rounds & Approval Cycle Time** — [plan](../../.claude/plans/global-search-share-status-overview-metrics.md)
  - Add two KPI tiles to the engagement insights dashboard: "Avg Revision Rounds" (from `DOCUMENT_SHARE_CHANGED` audit events) and "Avg Approval Cycle" (from `finalizedAt − createdAt` in share settings)
  - Top-5 deliverables by revision count shown in a detail card
  - No schema changes; source from existing `PlatformAuditEvent` table and `settings.share` JSON

## AI Features — [plan](../../.claude/plans/ai-native-features.md)

Brio, the in-product assistant. Anthropic Haiku via `lib/ai/client.ts` — server-side only,
`ANTHROPIC_API_KEY`. **One plan covers all AI work:**
[ai-native-features.md](../../.claude/plans/ai-native-features.md) — its §10 status board is the
source of truth, and the older Gemma-era plan was merged into it and retired on 2026-09-25.

**Shipped 2026-09-25** (`c0a7898f`, `4212f829`, `4013f191`):

- [x] **AI Firm Brief** — narrative at the top of the firm Analytics tab; 60-min read-triggered cache
- [x] **Engagement AI Summary** — six sections, streamed, with a human-approval gate before anything reaches a client; `settings.insightsSummaryDraft`
- [x] **Engagement Chat** — read-only Q&A over delivery data; firm users only; excludes document content and comment bodies by design
- [x] **Natural-Language Doc Search ("Ask Brio")** — prose resolves to access-scoped filter chips; see Search & Discovery above
- [x] **AI usage ledger** — append-only `platform_ai_usage`; credits **instrumented but not enforced**, deliberately, pending real usage data

**Open:**

- [ ] **Doc Search: close out Phase A** — [plan §A.10](../../.claude/plans/ai-native-features.md#a10-what-remains--phase-a-is-not-closed)
  - Zero-result auto-broadening — the release gate named in §A.8; an over-constrained Ask search currently dead-ends
  - Cache interpretation by `(normalized text, candidate-set hash)` — identical repeat Ask searches re-bill today
  - Snippet 500→2000 chars + re-embed backfill — blocked on the §A.6 embed-dilution A/B
  - Weighted rank fusion in `lib/services/search-service.ts`

- [x] **AI credits: enforcement** — shipped 2026-09-26 (`c34814e8`, `2ac1fefe`). Two windows: the billing period (from `entitledAiCredits` in Polar metadata) is the budget; a rolling 4-hour window at 10% of the allowance is a burst tripwire sized above anything a person does by hand, to catch a retry storm a monthly cap would not notice until the allowance was gone. Gating and metering hang off the model client, not each route, so there is no ungated path. Breaches return 429 with a `kind` distinguishing an upgrade prompt from a transient wait. An unset entitlement means "unknown", not zero — a webhook that has not synced must not throttle a paying customer

- [ ] **Content-aware sensitivity detection** — [plan §B](../../.claude/plans/ai-native-features.md) — classify over the unused `content` column instead of the current filename regex

### On hold — not AI-native (see ai-native-features.md §7)

- [~] **Auto-Reminder: Unanswered Comment Threads** — build the 48h rule without the LLM; urgency classification adds nothing a query cannot do
- [~] **Engagement Kickoff Checklist** — templates suffice
- [~] **Weekly Digest Notification** — fold into the narrative brief rather than generating separately

## Notifications

- [ ] **Per-Event Email Notification Config + Web Push Notifications** — [plan](../../.claude/plans/firm-settings-event-email-and-push-notifications.md)
  - Firm Settings → App Settings → Email Reminders card gets per-event email toggles: new document intake (notify Engagement Admins/Members), document/deliverable status changed, document rejected, external client comment, engagement invite accepted, deliverable overdue
  - Extends existing `Firm.settings.reminderEmailConfig` JSON — no migration needed for Part A
  - Part B: Web Push (PWA-style) notifications — fully greenfield (manifest, service worker, VAPID, subscription storage); rides on the same event hooks as Part A; scoped mainly for internal staff given iOS PWA-install friction for external clients

## Email

- [ ] **Firmaone Email Accounts**
  - All notification emails should come from `no-reply@firmaone.com` so end users don't reply expecting a response
  - Establish a country-neutral persona (e.g. `sam@firmaone.com`) for client-facing communication

- [ ] **Email Document Link** — ActionMenu › Share › Email Link sends the document deeplink to a recipient

- [ ] **Automatic Welcome Email on Signup** — send a personal welcome email automatically on any new user signup
  - cc: `deepak@firmaone.com`
  - Subject: "Welcome to firmä"
  - Body: personal note from Deepak asking how they heard about firmä and whether it's a good fit, offering a walkthrough call ([Calendly link](https://calendly.com/firmaone/firma-connect)) or async help
  - Needs `[name]` interpolation from signup data

## Growth / Outreach

- [ ] **Reddit Prospecting Screener** — discover-and-draft daily screener that finds Reddit threads matching the client-delivery/file-sharing ICP pain, scores/dedupes them, and drafts two reply variations per top thread for manual review and posting; never posts automatically
  - DB-backed skill design (Prisma/Postgres `reddit_screener` schema, reuses existing local embeddings, thin non-LLM scripts + Claude does drafting live when the skill runs) — [plan](../../.claude/plans/reddit-screener-skill-db-backed.md)
  - Earlier filesystem-based design (no DB, `/watch` slash command, JSON config/history files) — [plan](../../.claude/plans/reddit-watcher-plan-v2.md)
  - Two distinct designs exist; pick one (or merge) before implementation starts

## Marketing / Landing

- [ ] **Landing Page: "Enterprise-grade everything" security section** — [plan](../../.claude/plans/landing-security-section.md)
  - New dark-themed section on the marketing landing page with 4 trust pillars: Least-Privilege Access, Encryption Everywhere, Tenant Isolation, Secure Checkout
  - Two-column desktop layout (heading left, 4 pillar cards right); responsive 2×2 on tablet, stacked on mobile
  - Uses existing lucide-react icons (`KeyRound`, `Zap`, `Database`, `CreditCard`) on circular dark badges

## Bookmarks & Topbar Quick Links

- [ ] **Bookmark Pages & Documents** — users can bookmark any app page (e.g. a specific engagement, client, or section) or document for quick access
  - Bookmark button in the topbar or page header; bookmarks stored per-user in DB
  - Dedicated "Bookmarks" section in the sidebar or command palette for quick navigation
  - Bookmarks persist across sessions and are scoped to the firm the user is currently in

- [ ] **GDrive Recycle Bin quick link (Firm Admin only)** — quick link icon in the Topbar that opens the Google Drive Recycle Bin in a new tab; visible to Firm Admins only. See [beta-feedback-fixes.md §7](../../.claude/plans/beta-feedback-fixes.md)

## Infrastructure / Maintenance

- [ ] **Admin Scripts: Persisted Run History** — [plan](../../.claude/plans/admin-scripts-run-history.md)
  - `/system/admin-scripts` runs one-off scripts server-side but only shows results live in the browser tab that triggered them — no DB-backed history of past runs (status, timestamp, who ran it, summary)
  - New `AdminScriptRun` model + write from the existing POST route; new run-history UI per script
  - Discovered while adding the OneDrive guest pre-invite backfill script (see Connector: OneDrive Support plan, item 19 Part 4)

- [ ] **IMP: Batch `index-file` calls in `processUploads` (multi-file picker upload)** — `frontend/components/projects/hooks/use-engagement-upload.ts`
  - `processUploads` (plain multi-file picker, not folder upload) still POSTs `/api/projects/[projectId]/index-file` once **per file**, sequentially inside its upload loop — unlike `handleBatchResolution` and `processFolderUpload`, which already send one batched POST (`files: [...]`) for the whole set
  - For N individually-selected files (e.g. 100), that's N sequential round-trips (each doing a docId upsert + Inngest enqueue) before the post-upload `fetchFiles()`, instead of 1
  - Fix: collect `{ externalId, fileName }` per successful upload in the loop (same pattern as the other two paths) and fire one batched `index-file` POST after the loop, instead of relying on each `uploadFile()` call's individual `docIdRequestSettled` promise
  - Discovered 2026-07-23 while fixing the docId-not-showing-instantly bug; not a regression from that fix, a pre-existing inefficiency in this one path

- [ ] **Bug: Signup OTP → redirects to `/signin` instead of `/d/signup-success`** — [plan](../../.claude/plans/signup-session-issue.md) — deferred past beta
  - Race condition: middleware reads auth cookie before browser has committed it after `verifyOTP()`
  - Fix: gate `window.location.href` on `onAuthStateChange SIGNED_IN` event instead of `getSession()`
  - Also fix: skip button in `components/signup/signup-success.tsx` incorrectly calls `signOut()` before redirecting to `/signin`

- [ ] **Refactor: Billing entitlement interceptor** — [plan](../../.claude/plans/billing-entitlement-interceptor.md)
  - Entitlement checks are scattered `assert*` calls nothing enforces. An audit on 2026-09-26 found 5 document write paths with only 3 guarded — `index-file` (bulk indexing, no check at all) and the sharing route's create branch both shipped unguarded. Both fixed in `e59b07d9`, but found by hand, not by design
  - Same failure had already happened with AI metering (1 of 4 call sites for two days), fixed structurally by moving the gate onto the model client — the precedent this follows
  - Route interceptor wrapping `requireProjectManage`, which already does auth *and* returns `firmId` in the right order. Two earlier objections to this design were wrong and are recorded in the plan so they are not re-derived
  - Risk is concentrated in documents (9 call sites, 5 write paths); the other five caps have one obvious creation path each
  - Must preserve the upsert fix from `5ef8072e`: only genuinely new documents count, or re-indexing at the cap breaks

- [ ] **Refactor: `organizationId` → `firmId`** — [plan §4](../../.claude/plans/billing-entitlement-interceptor.md)
  - 298 occurrences of the old name for a firm. Unsafe as a bulk rename: it appears in Inngest event payloads (cross-process, in-flight events carry the old key), in request body keys (renaming breaks callers), and a dozen files already use both names
  - Phased like `sandboxOnly` → `isAnchorFirm()`: internal identifiers first, then Inngest payloads with dual-accept for one deploy cycle, then body keys

- [ ] **Refactor: Replace `sandboxOnly` with `isAnchorFirm()`** — [plan](../../.claude/plans/refactor-is-anchor-firm.md)
  - `Firm.sandboxOnly` maps to DB column `isAnchor`; the two names are used interchangeably across 165+ references
  - `isAnchorFirm()` utility added to `lib/billing/effective-billing-caps.ts`; all new code should use it
  - Migrate existing reads in batches: billing/server layer first, then UI components

- [ ] **Remove per-user sandbox demo firm from onboarding** — [plan](../../.claude/plans/sandbox-firm-removal.md)
  - Now superseded by the static, unauthenticated `/demo` route as the product-preview surface
  - Sandbox-firm creation is currently load-bearing for onboarding itself (no other "create your first firm" path exists) and for billing-anchor lookups (`firm-creation-gate.ts`, `effective-billing-caps.ts`) — full phased refactor required, not a quick deletion
  - Phase A: new real-firm onboarding step + billing anchor re-plumb (backward compatible, zero migration required for existing sandbox firms). Phase B: delete `create-sandbox` route + `seedSandboxClientsInDb`. Phase C: pricing page Sandbox column/copy removal + optional dead-code cleanup
  - Existing `SandboxInfoBanner` call sites and other `sandboxOnly` UI branches stay untouched — they simply stop triggering for new users

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

- [ ] **DocuSign-Style E-Signature ("Firma Sign")** — [plan](../../.claude/plans/docusign-alt.md) — Request signatures on engagement documents from external signers via tokenized links; captured signature burned into the PDF and routed back through the existing connector storage.
  - Phase 1 (MVP, ~2–3 wks): single signer, visual-only stamp (not cryptographically sealed), reuses `pdf-lib` watermark pattern + existing invitation/email infra
  - Phase 2 (~1–2 wks): multi-signer sequential/parallel routing, reminder cron
  - Phase 3 (optional, 2–4 wks + legal review): cryptographic PDF sealing, tamper-evident audit trail, ESIGN/UETA compliance — only if legally-binding signatures (not just visual) are required
  - Net-new: PDF viewer/annotation UI (no `react-pdf`/`pdf.js` in stack today), signer routing state machine, signature capture UI
