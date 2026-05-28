# MVP Todo List

## HIGH Priority

- [x] **Insights**

- [x] **Audit** — more events need to be captured
  - Event Source: Firm, Client, Engagement, Document
  - Event Type: CREATED, MODIFIED, DELETED, OPENED, DOWNLOADED, SHARE-CREATED, SHARE-MODIFIED, SHARE-DELETED

- [ ] **Connectors** — restore the functionality of setting up the Workspace on Google Shared Drive in addition to My Drive

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

- [ ] **Confidential folder** — implement via `settings.locked = private`, Google Drive permissions, or both; currently the folder exists on Drive but has no enforced access control in the app

- [ ] **Cleanup: remove Staging & Confidential folder creation from onboarding** — these folders are no longer surfaced in the UI; remove the Drive-side provisioning code that creates them during workspace setup

## AI Features — [plan](../../.claude/plans/ai-insights-and-business-features.md)

AI layer using Gemma 4 (HuggingFace Transformers, same runtime as release notes generation — no API key, model cached locally).

- [ ] **AI Firm Brief** — 3–5 sentence plain-English narrative at the top of the Insights page; synthesises pipeline, overdue engagements, unanswered threads, revenue at risk; cached in `firm.settings.aiBrief` (1h TTL), refreshable on demand

- [ ] **Auto-Reminder: Unanswered Comment Threads** — Inngest cron every 4h; threads unanswered > 48h by an external collaborator → AI-classified urgency → reminder auto-created for firm admin; duplicate-safe via `metadata.source = 'ai_thread_alert'`

- [ ] **Engagement Kickoff Checklist** — when engagement transitions to `ACTIVE`, Gemma generates a 5–8 item task checklist (tailored to contract type) stored in `engagement.settings.aiChecklist` and surfaced in the engagement overview

- [ ] **Weekly Digest Notification** — Inngest cron every Monday 8am; Gemma-written brief covering last week's activity and top 3 priorities for the week, delivered as an in-app notification to firm admins

## Future Roadmap

- [ ] **Branded Link Redirect System (`/to/`)** — [PRD](../prd-linkfarm.md) — Deferred; self-hosted URL shortener at `firma.bz/to/<slug>` with click tracking, source attribution, and UTM passthrough. Revisit when content distribution volume justifies the infrastructure (see PRD for conditions).
