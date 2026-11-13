# Plan: Brio, round 2 (seven new features)

**Status:** Built 2026-11-12 after Deepak approved the mock (https://claude.ai/artifact/BRrWkcSus3EYbwnFxZN4nc). Uncommitted; migration `20261112120000_user_day_brief` written by hand, not applied. Not yet run against a live model or a real Drive.
**Done already in this round:** three bug fixes and the Haiku 5.5 switch (see "Already shipped to the tree").

## 1. Ground rules every feature keeps

- **Metadata only.** Brio never reads file contents (`INDEX_DOCUMENT_TEXT = false`, the published
  promise). Exception decided by Deepak on 2026-11-12: comment text, for reply drafts (feature 3).
- **People decide and send.** Brio drafts; nothing reaches a client, a Reviewer or a Drive without a
  person pressing the button. Same `ASSISTANT_POLICY` wording.
- **One gate.** Every model call goes through `getGuardedAnthropic` (credit cap) and `meterAiCall`
  (ledger). No new `completeText` callers without a scope.
- **Server-built context only.** The route builds what the model sees from the caller's own access
  scope; never a client-supplied payload.
- **Failure words.** Each surface gets a `BRIO_*` line in `lib/ai/brio-failure.ts`, and browser-called
  server actions answer `ActionResult` via `asResult`.
- **Tour parity.** Each new surface either renders through the shared component on `/tour`, or gets
  a demo copy in `components/demo/*` in the same change.

## 2. Credits

**The unit today.** A credit is one AI action, not a number of tokens:

| Action | Credits |
|---|---|
| Engagement summary, firm brief, chat answer | 1 |
| Natural-language search (hidden) | 0.5 |
| Files agent | 1 per model turn (bounded by `MAX_AGENT_TURNS` = 8) |

Allowances per month, shared by the whole billing group: Sandbox 25 (2 users), Standard 500, Pro 1,000,
Business 3,000, Enterprise 10,000 (`config/pricing.ts`).

**Real cost per credit after the switch.** A chat answer on Haiku 4.5 was about $0.0075 (≈6K input,
≈300 output). On Haiku 5.5 about $0.0012 (≈8K input after the tokenizer change, ≈800 output including
thinking). So Standard's 500 credits cost at most ~$0.60 a month in model spend.

**"Your day" if charged like everything else (1 credit per user per working day, ≈22 a month):**

| Plan | Example team | Credits a month | Share of allowance |
|---|---|---|---|
| Sandbox | 2 users | 44 | 176% (the free plan runs out on its own) |
| Standard | 10 users | 220 | 44% |
| Pro | 25 users | 550 | 55% |

**Proposed weights (Deepak to confirm):**

| Feature | `AiFeature` | Weight | Why |
|---|---|---|---|
| Your day | `dayBrief` | **0** (recorded, not charged) | Brio writes it unasked; charging would drain the shared pool invisibly. ≈$0.0008 each. Guarded by one-per-user-per-day instead of the burst cap. |
| Client status update draft | `statusUpdate` | 1 | A user action that produces an answer. |
| Reply draft | `replyDraft` | 1 | Same. |
| Nudge draft | `nudgeDraft` | 1 | Same. |
| Ask Brio about the firm | `firmChat` | 1 per answer | Same as engagement chat. |
| Call notes into proposals | `notesProposals` | 1 | One call per paste. |
| Brio for Reviewers | `reviewerChat` | 1 per answer, charged to the firm | Plus a cap of 10 answers per Reviewer per day, and off until a firm admin turns it on. |

Pricing copy changes with it: the "Credits included" tooltip in `config/pricing.ts` lists four actions.

## 3. The features

### 3.1 Client status update (feature 1)

- **Where:** Overview, the published summary's card: "Draft an update". Lead only (`canManageProject`).
- **Brio is given:** the approved summary (never a pending draft), plus what changed since the last
  update sent: stage moves, approvals and acceptances, newly shared files, due dates set or moved,
  threads resolved. Counts, names, DOC-IDs and dates. No comment text.
- **Out:** a short email body (greeting line left to the Lead). The composer shows recipients (the
  engagement's Reviewers and Limited Access contributors, each removable), the draft, and Send.
- **Send:** `lib/email.ts` with a new `status-update` template; an in-app notification
  `ENGAGEMENT_STATUS_UPDATE`; an audit event. Stored on `engagement.settings.statusUpdates[]`
  `{ sentAt, sentBy, recipients, text }`, newest first, capped at 50. "Since the last update" reads the
  newest `sentAt` (falls back to the kickoff date).
- **Route:** `POST /api/projects/[projectId]/ai-status-update` (streams the draft). Sending is a
  server action `sendStatusUpdate(engagementId, text, recipientIds)` returning `ActionResult`.

### 3.2 Your day on Home (feature 2)

- **Where:** top of `/d/u/home`, above "Needs you". Three lines at most, then "Show the items" scrolls
  to Needs you. Every signed-in user, any role.
- **Brio is given:** the user's own Needs you items, this week's agenda, and their reminders (with
  notes), across all their firms. Per user, so reminders are fine here (the firm brief must omit them).
- **Cached:** once per user per local day (timezone from `notificationPrefs`). New column
  `UserPersonalization.dayBrief Json?` `{ date, text, fingerprint }` via a `--create-only` migration.
  Regenerated only when the date changes, or by "Rewrite" when the Needs you fingerprint changed.
- **Push:** the 09:00 digest (`send-daily-reminder-digest`) can carry the first line. Phase 2, after
  the card has been used for a week.
- **Route:** `GET/POST /api/me/day-brief`. Ledger row on the group of the firm the brief draws most
  from, weight 0.

### 3.3 Reply drafts (feature 3)

- **Where:** the discussion pane composer, on threads where the client wrote last ("Awaiting reply"):
  a "Draft reply" button beside Send. Firm roles who can reply.
- **Brio is given:** the thread's client-visible messages (never internal notes, so nothing internal
  leaks into a client reply), the document's name and DOC-ID, its deliverable's stage and due date.
- **Out:** the draft lands in the textarea, unsent, for the user to edit. Sending is the existing
  doc-comments POST, unchanged.
- **Rules in the prompt:** never promise dates or scope, never accept or reject on the firm's behalf,
  leave a `[placeholder]` where a decision is needed.
- **Route:** `POST /api/projects/[projectId]/documents/[documentId]/ai-reply-draft`.
- **Positioning:** comment text reaching the model is new. The summary prompt's "never characterize
  what anyone said" rule stays for the summary; the marketing line "Brio never reads your clients'
  work" stays true (comments are not files), but the Security page should say comments are used for
  drafts.

### 3.4 Ask Brio about the firm (feature 4)

- **Where:** the Analytics tab, under the firm brief: one input, answers in the same chat component
  as the engagement panel. Firm admins (`can_manage`), same as the brief.
- **Brio is given:** the firm insights payload the brief already builds (`buildSnapshot`, widened to
  per-engagement rows: name, client, status, due date, overdue counts, waiting threads), with the
  brief's omissions kept: no reminders, no revenue by client.
- **Route:** `POST /api/firms/[firmId]/ai-chat`, streamed, prompt-cached like engagement chat.
  Answers name engagements as links (resolved server-side, like the sources line).

### 3.5 Call notes into proposals (feature 5)

- **Where:** the engagement's internal memo (Settings, and the Overview memo card): "Find actions in
  these notes". Lead and Full Access contributors.
- **Brio is given:** the pasted notes (the user's own text), the deliverables list with stages, due
  dates and DOC-IDs, and today's date.
- **Out (tool call, validated like the Files agent):** proposals of three kinds, each with a quoted
  line from the notes as its reason:
  - a reminder for the user (title, date),
  - a new due date for an existing deliverable (id must be in the list),
  - a new deliverable (name, optional due date): opens the existing "Add deliverable" flow prefilled,
    never created directly.
- **Apply:** one by one or all at once, through the existing reminder and due-date actions.
  Nothing applies itself.
- **Route:** `POST /api/projects/[projectId]/ai-notes-proposals`.

### 3.6 Brio for Reviewers (feature 6)

- **Where:** for Reviewers and Limited Access contributors, a "What's waiting on me?" panel on their
  Overview. Off by default; a firm admin turns it on in Settings, next to `externalSections`.
- **Brio is given:** only what that person can already see: the published summary, deliverables at
  the stages their role sees (`deliverable-stage-roles.ts`), threads awaiting them (no internal notes),
  due dates, and documents shared with them. Built by a new `buildReviewerContext`, never by
  `buildEngagementContext` (which carries internal counts).
- **Guard test:** a fixture engagement with internal notes, private documents, early-stage
  deliverables and an internal memo; the test asserts none of their names or text appear in the
  reviewer context, per role.
- **Out:** answers about state and what's theirs to do. Same "reports, does not decide" rules.
- **Route:** `POST /api/projects/[projectId]/ai-chat/reviewer`. Credits charged to the firm, capped
  at 10 answers per Reviewer per day.

### 3.7 Nudge drafts (feature 8)

- **Where:** the Overview Action Center and the Board's detail panel, on deliverables sitting in review
  with the client for 5+ days, and intake requests with no upload: "Draft a nudge". Lead only.
- **Brio is given:** the deliverable's name, DOC-ID, stage, how long it has waited, its due date, and
  who it waits on (the Reviewer's first name).
- **Out:** a short, specific note. Composer like 3.1: recipient, draft, Send. Sent as a comment on the
  deliverable (client-visible) so it lands in the thread, plus the existing comment email.
- **Pairs with (non-AI):** a reason field when a deliverable moves back from in review ("requested
  changes"), which today sends fixed text. Optional in this round.
- **Route:** `POST /api/projects/[projectId]/documents/[documentId]/ai-nudge-draft`.

## 4. Order of work after the mock is approved

1. Shared pieces: new `AiFeature` values and weights in `lib/ai/usage.ts`, failure lines, a shared
   streamed-draft hook for the composers (3.1, 3.3, 3.7 use the same shape).
2. 3.4 firm chat (smallest, reuses the most).
3. 3.1 status update and 3.7 nudges (share the composer).
4. 3.3 reply drafts.
5. 3.2 Your day (needs the migration).
6. 3.5 notes into proposals.
7. 3.6 Brio for Reviewers last, with its guard test written first.

Each step: unit tests for the context builder and the route's gates, tour parity, then a build.

## 5. Already shipped to the tree (uncommitted)

- Files agent continuation answers every tool call with a tool result (`run.ts`), plus `max_tokens`
  8000 and refusal handling; tests in `run.test.ts`.
- Summary and brief re-read settings just before saving; test in `ai-summary/route.test.ts`.
- Chat prompt: follow-up example and the "does not carry" list corrected; tests in
  `engagement-chat.test.ts`.
- `AI_MODEL = 'claude-haiku-5-5'`, `temperature` removed everywhere, `AI_EFFORT` per surface, caps
  raised for thinking, refusal handling in every stream.

## 6. Open decisions for Deepak

1. Credit weights in §2, above all `dayBrief` = 0.
2. Brio for Reviewers: opt-in per firm (proposed) or on for every firm.
3. Nudges: sent as a client-visible comment (proposed) or as an email only.

## 7. As built (2026-11-12), and what differs from the plan

- **Credits:** decided as proposed in §2. Billing folds the new features into existing rows (the
  chart palette has no spare hues): firm briefs and assistant; engagement summaries and drafts;
  engagement assistant chat (includes Reviewer questions).
- **3.1 Status update:** "Draft an update" on the published summary card; sheet with recipients,
  "Since your last update", the draft, Send. Send refuses [bracketed] spots left in the text.
- **3.2 Your day:** as planned; free; "Nothing needs you today and your week is clear." when empty.
- **3.3 Reply drafts:** as planned, plus the Discussions UX round (thread header with DOC-ID, stage
  and due date; dashed internal notes with an Internal tag; role labels; waiting-status tokens).
  Security page wording about comments reaching Brio is NOT yet written.
- **3.4 Firm chat:** moved into the engagement Overview's floating Brio panel (Deepak, 2026-11-12):
  one `EngagementAiChat`/`FloatingAiChat` with a `subject` (engagement or firm), closed by default
  on the firm Overview, "This firm" chip, no thumbs or file tasks; the inline FirmAiChat is no longer
  mounted but kept until sign-off. Lead names are deliberately left out of the context.
- **3.5 Notes into actions:** mounted in engagement Settings under the memo (there is no Overview
  memo card). No prefilled "Add deliverable" flow exists, so a new-deliverable proposal offers
  "Copy name". Fixed in passing: two manual reminders on one engagement overwrote each other
  (`matchAction` in upsertFollowUpReminder).
- **3.6 Brio for Reviewers:** the "waiting on you" list is deterministic and free; only questions
  cost credits. Off by default (firm Settings). Not on /tour (the tour is firm-side).
- **3.7 Nudges:** "Waiting on the client" under the Action Center, deliverables in review 5+ days.
  Intake "requests with no upload" don't exist as a concept (intake = a client upload awaiting the
  firm), so nudges cover in-review only. Sent as a comment with a reminder for one person.

## 8. Internal memos as files (decided and built 2026-11-12, uncommitted)

Deepak's direction: keep call notes as historical records, as files in a dedicated, internal-only
folder under the engagement root, created from an "Add internal memo / meeting notes" action
(paste text or markdown, later upload .txt/.md/.vtt), listed on a Meetings view (a Discussions
sub-tab or its own page), each with "Find actions". Needs a positioning decision: Brio would read
these files' text, only when asked and only in that folder.

**As built:** "Internal memos" card on the Overview under the Action Center (Leads and Full Access
contributors only) and an "Add internal memo" sheet (paste, or attach .txt/.md/.vtt; VTT parsed in
the browser). Each memo is `YYYY-MM-DD-Title-Words.md` in an "Internal Memos" folder created in the
engagement's General folder (the Files root), found by the `settings.memoFolder` marker, and made
internal only through the privacy route's own steps (private lock + withdrawClientAccess); memo files
carry the private lock too. Find actions reads the memo's text server-side
(`readMemoText`, `getRenderableContent`), only for a memo in this engagement's memos folder, up to
100,000 characters. Applied actions are recorded on the memo (`settings.memo.applied`), so re-runs
mark them done. The Files agent and Folder Health ignore the memo tree (`withoutMemoTree`).
Code in `lib/memos/*`, `app/api/projects/[projectId]/memos/*`, `components/projects/internal-memos-card.tsx`,
`add-memo-sheet.tsx`, `components/demo/demo-internal-memos.tsx`.

**No memo text in the database** (Deepak, 2026-11-12): the card shows title, date, author and
notes/transcript length only; the stored preview was removed, and a test checks a saved memo's row
holds none of its words. **Open:** nothing has run against a real Drive or OneDrive yet: folder
creation in General, the internal-only mark in Drive, reading .md bytes, and OneDrive renaming a
clashing folder.

**Proposed, mocked, not built (2026-11-12):** move Internal memos off the Overview into a
Discussions › Memos sub-tab (Threads | Memos, internal roles only; the memo opens in the right pane
with Find actions; "+ Add internal memo" in the Memos header). Mock artboards 10 and 10b; 9 is marked
superseded. Reviewers and Limited Access contributors get no sub-tab at all.

## 9. RAID log (built 2026-11-13, uncommitted; migration 20261112130000_raid_items not applied)

Risks, Assumptions, Issues, Decisions, as a third Discussions sub-tab (Threads | Memos | RAID),
internal only, plus a compact card on the engagement Overview. Mock artboards 11 and 11b.

- **Sources:** (1) status and health (Action Center, health penalties, pace, planning gaps, waiting
  threads) become Risks and Issues: free, and they close themselves when the condition clears;
  (2) Board approvals become Decisions: free; (3) threads (internal notes included) and memos, read
  by Brio once a day per engagement with new activity, or on "Check now", in one batched call: at most
  1 credit per engagement per active day. Memo-derived items ride the Find actions call.
- **Human in the loop:** Brio's items land in a Suggested strip with the quote and a source link; a
  Lead or Full Access contributor accepts or dismisses. Accepted items get owner, status and date;
  the mitigation column is a person's to write. Brio records decisions people stated; never its own.
- **Dedupe:** Brio sees the current log, so a thread about an existing Issue attaches to it.
- **Storage:** items as database rows in the firm's own words (title, owner, notes); memo quotes are
  read live from the file, never stored. Each item records whether any source was internal, so a
  future Reviewer-facing view can never share it automatically.
- **Overview card:** counts by type, the top open items raised in conversation, the latest decision,
  "N suggestions to review", and "Open RAID log". It leaves out what the Action Center already shows.
- **Reviewers / Limited Access:** no RAID tab, no card, routes refuse.

**As built (2026-11-13):** Discussions has Threads | Memos | RAID (`?view=memos|raid`, internal roles
only; Reviewers and Limited Access get today's page). Memos open in the page's own right pane, read for
display via `memos/[documentId]/content` (never stored). The Overview memo card is unmounted (kept).
RAID: `EngagementRaidItem` (unique on engagementId + signalKey), free status/health/Board signals synced
on read (≤1/min/engagement) that close themselves with reasons, a daily 07:00 UTC Inngest check
(`checkRaidLogsDaily`) plus Check now (feature `raidCheck`, 1 credit; cron charges the firm), quotes
stored for thread sources only, memo suggestions link to the memo. Code: `lib/raid/*`,
`app/api/projects/[projectId]/raid/*`, `components/projects/raid/*`, `components/demo/demo-raid.tsx`.
Open: memos edited in storage aren't noticed by the cron's candidate query; nothing run against a live
model; needs the build to apply the migration and a dev-server restart.

## 10. Skeleton loaders (asked 2026-11-12 "for tomo"; DONE 2026-11-13)

**Skeleton loaders for RAID and individual memos.** Today each shows a line of text while loading:
- `components/projects/raid/raid-tab.tsx:319` "Loading the RAID log…": wants a skeleton of the
  Suggested strip (2–3 rows) and the log table (4–5 rows with type, title, chips, status columns).
- `components/projects/raid/raid-overview-card.tsx:90` "Loading…": a skeleton of the counts row and
  2–3 item rows, so the Overview doesn't jump when it arrives.
- `components/projects/engagement-memos.tsx:342` "Loading memos…": skeleton list rows (date block,
  title, meta line).
- `components/projects/engagement-memos.tsx:546` "Loading the memo…" (the memo is read from Drive or
  OneDrive, so this is the slow one): a skeleton of the header row, heading, byline and 6–8 text lines.
Use the existing `components/ui/skeleton.tsx` / `shimmer.tsx` (see how Your day's `DayBriefSkeleton`
and the Overview's loading bars do it). Keep `aria-busy`; mirror on /tour where the demo copies load
(`demo-raid.tsx`, `demo-memos.tsx` render instantly, so likely nothing there). Mock first only if the
layout changes; skeletons that mirror the loaded layout don't need one.

**Done 2026-11-13:** `RaidLogSkeleton` (toolbar, suggestions strip, filters, table rows), the RAID
Overview card's skeleton (counts + rows), `MemosSkeleton` (list rows beside a body skeleton) and
`MemoBodySkeleton` (heading, byline, lines), all with `aria-busy` and a `LoadingAnnouncement`.
**Bug fixed the same morning:** the RAID tab never left "Loading the RAID log…" in development: its
`live` ref was only cleared on unmount, never set again on React's dev double-mount, so the loaded log
was dropped. Now set on every mount; a StrictMode test fails without the fix. /tour never showed it
because the tour uses `DemoRaidTab`, which doesn't fetch.
