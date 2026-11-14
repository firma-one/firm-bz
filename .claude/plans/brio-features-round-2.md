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

- **Where:** top of `/d/u/home`, above "Needs you". Three lines at most, then a line saying the items are
  below, in Needs you and Agenda (no link: they are a scroll away). Rewrite is the Brio sparkle at the
  heading's right, after when it was written, as on the Overview's Summary (changed 2026-11-13; it was a
  "Show the items" button and a Rewrite button). Every signed-in user, any role.
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

**Later on 2026-11-13 (Deepak: "simplify", like the Overview's Summary):** the toolbar is icons now: a
status (✓ Up to date, quiet / ⚠ Out of date, orange; nothing when there is nothing to read), then Brio's
sparkle (Check with Brio) and, last, + (Add an item), 28px with Hints; when it last checked is the status's
tooltip. Up to date comes from a fingerprint (`lib/raid/raid-fingerprint.ts`): every check stores in
`settings.raid.fingerprint` a hash of the conversation it covered (per threaded document, message count
and newest; per memo, when made or last changed), and GET compares it with now. A memo edited in storage
does show as Out of date, so the sparkle catches what the cron misses. A log checked before fingerprints
existed is compared by time. The RAID table matches Files (NotionTable grid); Health sources link to the
Overview's Pace or Planning hygiene chart (`…/analytics#ring-pace`). On /tour (2026-11-13) the sources link too:
Health to the tour Overview's chart (`?tab=analytics#ring-pace`, `useRingAnchor` from `ring-anchor.ts`), the
rest to their tab (no item ids there); `RaidLink` moves in the page, as a full load would reopen the tour panel.

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

## 11. Per-person AI limits, and Rewrite charged (Deepak, 2026-11-13: "it should be there")

Your day was free, so it skipped both credit windows, and Rewrite called Brio whenever the items had
changed, with no count. The credit windows were per billing group and read from the ledger, which is
written when a call finishes. So: free features were unbounded, one person could drain a group, and
parallel requests all passed on the same count.

**As built:** `lib/ai/person-limit.ts`, called from the one gate (`getGuardedAnthropic`, after the
credit cap) and from `generateFirmBrief`, which calls the model by its own route. Every call a person
starts is written to `platform.ai_call_starts` (migration `20261113140000_ai_call_starts`), then
counted oldest first: 10 a minute and 200 in any 24 hours across all features, plus Your day's own caps
(the day's first brief twice, rewrites four times). Numbers in `AI_PERSON_LIMITS` (`lib/ai/features.ts`).
A refused call deletes its own row; a person's rows older than a day are deleted on their next call.
Refusals are `AiCreditLimitError` with kind `person`, so every route already answers 429 in the limit's
words. Calls without a person (the daily RAID check) aren't limited here. If the table can't be read or
written the call goes ahead and the failure is logged, so until the migration is applied every AI call
logs "AI person limit not checked".

Rewrite that replaces today's brief is its own feature, `dayBriefRewrite`, 1 credit, billed under
"Briefs and assistant" (was "Firm briefs and assistant"); the morning brief stays free. The Rewrite
button's tooltip says "1 credit, only when your items have changed". Brio for Reviewers keeps its own
10 a day in its route.

**Who pays on Home (Deepak, 2026-11-13).** Home stays cross-firm (the October decision,
`cross-firm-home-inbox.md`). As a shortcut, per-person AI usage on Home is billed to the firm
selected in the sidebar: Your day sends it as `?firm=<id>`, and the route bills it only when the firm
is in Home's own firm list (a member who can open it), else the firm with the most items. The Rewrite
tooltip names it: "Uses 1 FirmaOne credit, only when your items have changed". Revisit when someone
belongs to several firm groups (a Reviewer or external Contributor invited by firms in different
groups): then Home may need to follow the selected group, which also suits custom domains.

## 12. Website copy for round 2 (mocked and built 2026-11-13)

Mock: https://claude.ai/artifact/UeemgFc42vm91QpdYADwH8 (Meet Brio band, home FAQ, copy elsewhere).
The site still promises Brio never reads a comment's text (`meet-brio.tsx` lane box, `faq.tsx`,
`data/faq-data.ts`, `trust-map-data.ts`, the Hear Brio line). Reply drafts, the RAID check and Find
actions now do, so the promise becomes "never opens the files you deliver; reads comments and internal
memos only to draft a reply, log a risk or find actions". The full FAQ also says a client comment
cannot influence what Brio says, which is no longer true. A day with Brio grows to eight moments
(Your day, Ask, reply draft, call notes, client update, nudge, RAID, a Reviewer asking at 9:40 PM).
Hear Brio needs a new recording.

**Built (Deepak approved, 2026-11-13).** All of the above, plus an info tip on every RAID mention
(Deepak's ask): `components/marketing/v2/raid-tip.tsx` (`RaidTip`, `RaidTerm`, `withRaidTip`) on the
pricing comparison's `InfoTip`, whose styles moved to `pricing/info-tip.css` and whose bubble now renders
into the page's `.mk` root, so a tip can sit inside a paragraph. The meaning is `RAID_MEANING` in
`lib/raid/raid-shared.ts`, which the app's RAID card uses too. One tip per block, on its first RAID; the
full FAQ's HTML answers mark it `[[RAID:RAID check]]`; inside a tooltip (`config/pricing.ts`) RAID is
spelled out, since a tip can't open another. Where: the Meet Brio lede, the 5:00 PM moment, two home
FAQ answers, two full FAQ answers, the pricing FAQ's credits answer and the Trust Center's Brio card.

The timeline follows one engagement (Q2 – Product Launch Campaign, Dana Whitfield reviewing), two rows
of four, each row its own scroll-drawn line; cards in a row line up with subgrid. Dana's 9:40 PM
question only touches stages a Reviewer sees (lib/ai/reviewer-context.ts). The 2:00 PM card is the
status update as it ships (approved, in review, next steps yours, Send to Dana), not the summary's
sections. Once the Files agent is public, Tidy the files takes the 3:30 PM slot. Hear Brio was
re-recorded with `scripts/tour-narration/generate.py`.

Not changed: the campaign email's Brio band (`lib/email-templates/campaigns/brio-band.ts`) still says
Brio never reads a comment.

**Names (Deepak, 2026-11-13).** Home's brief is **"Your brief"** (was "Your day") and the Firm Overview
card is **"Firm brief"** (was "Today's brief"): each says whose it is, and "Your day" meant nothing to
someone who hadn't seen the app. Labels only: the feature keys stay `dayBrief`, `dayBriefRewrite` and
`brief`. Renamed across the app, its limit and failure messages, the /tour (the Firm Overview step's
narration was re-recorded), the website and the campaign email. Website copy that explains it to
newcomers says "tells you each morning what needs you" / "morning rundown".

## 13. A memo reviewed in one place (Deepak, 2026-11-14; building)

Brio identifies a memo's action items, and its RAID suggestions, automatically when the memo is added,
and both wait on the memo. Nothing applies itself: action items wait for Apply, RAID suggestions for
Accept, as before. The daily RAID check and Check now read threads only, so a memo is never read twice.

- **When.** In the memos POST route, after the response (Next `after()`, no Inngest): read the memo
  (readMemoText), identify its action items, then suggest its RAID entries. A failure or timeout leaves
  the memo as it was: the sparkle runs it by hand.
- **Credits.** One per memo, charged to the firm (no person, so no per-person limit): the action items
  call is `notesProposals` (1); the memo's RAID pass is its own feature at 0, metered for usage. A firm
  with no credits left is skipped quietly. Firm setting, on by default: "Identify action items when a
  memo is added".
- **What's stored, and what isn't.** Action items wait in the memo row's `settings.memo.review`: kind,
  title/date/deliverable/name, never the quote. Each quote (and each skipped line) is kept as where it
  sits in the memo (offset and length in the memo's match text, normalizeForMatch) and a short hash; the
  memo view fills it in from the memo it already reads from storage, and says when the memo has changed.
  RAID suggestions are SUGGESTED rows as today, sourced to the memo, no memo text.
  (Found while building: an applied action already stores a lowercase copy of its quote in
  `settings.memo.applied`, so "firmä keeps no copy of a memo's text" isn't strictly true today.)
- **The memo view.** Waiting action items show without a click, editable, Apply as now; the memo's RAID
  suggestions show under them with Accept and Dismiss (the RAID log's own routes). Dismiss all clears what
  waits. The memo row says "N to review". The sparkle runs action items again by hand (per person, 1 credit).
- **Never applies.** The job writes proposals and SUGGESTED rows only: no reminder, no due date, no
  accepted RAID entry. A test pins it.

**Memo suggestions wait on the memo only (Deepak, 2026-11-14: "why is it showing directly on RAID").**
A memo's RAID suggestions are accepted or dismissed on the memo, with its action items. The RAID tab's
strip lists thread suggestions only ("suggests N from new messages"), plus one line per memo: "N
suggestions wait on the memo “Title · date”, with its action items · Review in Memos". The Overview
card's "N suggestions to review" leaves memo ones out (the memo's row counts them). A memo source chip
opens Discussions › Memos with the memo, not Files (`waitsOnMemo`, `memoSuggestionGroups`,
`memoReviewHref` in lib/raid/raid-shared.ts).

## 14. Next, from Deepak (2026-11-14, for the next session)

0. **First: commit and push** the uncommitted round on `dev` (about 50 files: memos in three fixed-height
   columns with editable action items, "Identify action items", folder-lock on internal-only folders shown
   only inside deliverables, and §13's memo review on add). All 3,826 tests passed on 2026-11-14; checked
   on the tour, not yet with a live memo in the app. Then try adding a memo in the app (after() on Vercel).

1. **RAID as its own engagement tab.** Move the RAID log out of Discussions into a tab of its own
   (Overview · Files · Board · RAID · Discussions · Audit…, internal only with the lock, like Audit); the
   Overview's RAID card and every `raidLogHref` link point at it; /tour too. Later, optional: a firm-level
   card on Firm Overview listing open risks and issues across engagements, each linking to its tab.
   (The zero-credit `memoRaid` feature from §13 is already in the AI feature list.)
   **Built 2026-11-14 (uncommitted):** `…/raid` after Discussions (ShieldAlert, open count, internal-only
   lock), guarded on the page for a Lead or a Contributor · Full Access (`canEdit && canViewInternalTabs`,
   as the RAID routes); `…/comments?view=raid` redirects there; Discussions is Threads | Memos (the switch
   still takes a RAID option if one is passed); `raidLogHref` → `/raid` or `?tab=raid`; header crumb;
   /tour mirrored. Firm-level card not built.
2. **Native comment threads from inside documents.** Read Google Docs/Sheets/Slides comments (Drive API
   `comments.list`, also works for Office files kept in Drive) and Microsoft Office comments on OneDrive
   (Graph has no comments API for Word/Excel/PowerPoint: the file would have to be downloaded and its
   comments read from the OOXML parts), show them as a sub-tab under Discussions, and let Brio identify
   action items in them as it does for internal memos. **Decide first:** reading them, above all
   downloading an Office file to do it, conflicts with the published promise that Brio "never opens the
   files you deliver" (website, FAQ, Trust Center, email). The copy and the promise need to change with it.
   **Do this one last (Deepak, 2026-11-15).** Feasible without the .NET Open XML SDK: an Office file is a
   ZIP of XML parts, read in Node with `jszip` (already a dependency) plus a small XML parser.
   - Excel: threaded comments in `xl/threadedComments/*.xml` + `xl/persons/person.xml` (sheet and cell
     ref); notes in `xl/comments*.xml` (skip the legacy "[Threaded comment]" placeholders). Graph's Excel
     workbook API may list threaded comments with no parsing: confirm when building.
   - PowerPoint: `ppt/comments/modernComment_*.xml` + `ppt/authors.xml` (replies, resolved); older decks
     `ppt/comments/comment*.xml` + `ppt/commentAuthors.xml`. Word: `word/comments.xml` + `commentsExtended.xml`.
   - Read only the comment parts: range requests for the ZIP's central directory, then just those parts,
     so a deck full of images costs a few kilobytes. Read only (reply opens the file in Office); re-read
     when the file's modified time moves. Anchors shown as "Sheet2!B14" or "Slide 4", not the body text.
   - Promise wording to change first, e.g. "reads comments people left on files; never the files' content".
3. **Edit a memo.** Rename its title, re-upload the whole transcript or minutes, or edit the notes in
   place. Risks to handle, given §13:
   - *Waiting action items* keep their quotes as positions in the memo (anchors); after an edit a moved
     line shows "The memo has changed since" rather than the wrong words. An edit should offer to
     identify the action items again (a new review, one credit), not do it silently on every keystroke.
   - *Applied actions* stay applied (the reminder or due date exists). A new review marks them "Applied
     earlier" by kind, target and date (`appliedStoredIds`); an edit that changes a date or a reminder's
     words can make the same action look new, so guard against applying a duplicate (match on the
     deliverable or a close title, and show what was applied from this memo).
   - *RAID suggestions* from the old text that still wait should be withdrawn on a re-upload and the memo
     read again; accepted entries stay in the log (they record what was decided), their source chip still
     points at the memo.
   - *Rename* renames the file in Drive or OneDrive (date-title.md) and the row; RAID source labels and
     links that name the memo must follow (or be computed from the row when shown).
   - Every edit is audited; a memo edited in storage directly is the same case as an in-app edit.
   - **Mocked 2026-11-14, waiting for Deepak's OK** (memos canvas, "Edit memo · the sheet" and "· after
     saving"): Edit beside Open in Drive opens the Add sheet filled in; a "When you save" box says what
     changes (rename; old waiting items and RAID suggestions stop waiting; applied ones kept) with
     "Identify action items in the new notes · 1 credit" ticked. Title or date only: no new review.
   - **Approved and built 2026-11-14 (uncommitted).**
     - **Route.** `PATCH /api/projects/[id]/memos/[documentId]` → `editMemo` (memo-store) rewrites the file
       and renames it (Drive `renameFile`, OneDrive `renameOneDriveFile`). A rename storage refuses is a
       warning; the notes are already saved.
     - **New notes.**
       - The old review is kept but dismissed, and `notesChangedAt` is set.
       - The memo's SUGGESTED RAID rows are deleted.
       - With the box ticked, `reviewMemoOnAdd({ requested: true, trigger: 'edited' })` runs in `after()`:
         firm-charged, and the firm's automatic switch doesn't apply.
     - **Title or date only.** `reanchorReview` moves every quote anchor with the heading. Nothing else
       changes.
     - **"Changed since Brio read it".** Each review stores `bodyHash` (`memoBodyHash`: the notes without
       the heading). The pane compares it with the file it read, which catches edits made in Drive
       directly with no modified-time check. `MemoListItem.changedSinceRead` covers an in-app edit that
       wasn't read again.
     - **"Applied earlier".** Dated ("Applied on Nov 12 from this memo, so it isn't applied twice.").
       Matched on kind and day plus the deliverable or a close title (`closeTitles`, word Jaccard ≥ 0.6).
     - **Audited, firm-only types** (lib/audit-event-types.ts), so Reviewers and Limited Access
       contributors never see them:
       - `DOCUMENT_MEMO_ADDED`
       - `DOCUMENT_MEMO_EDITED`
       - `DOCUMENT_AI_REVIEWED` ("Read by Brio": on add, after an edit, or from the sparkle; who set it
         off, and counts only, never the words)
     - **Mirrored on /tour.**
4. **Reword the claims, not the code (Deepak, 2026-11-15).** Nothing is removed. An applied action keeps
   the line of the memo it came from (lowercase, `settings.memo.applied[].quote`) as its citation: useful,
   so it stays, and the copy stops saying "firmä keeps no copy of a memo's text" (home FAQ) or anything
   like it. Waiting action items keep quotes as anchors (§13) as built. The file promise is worded as
   "keep", never "touch": files stream through our servers for preview, download and upload but are never
   saved, so "we never keep a copy of what's in your files" is accurate. Proposed promise, for when the
   document comments ship: "Your files stay in your Drive. We never keep a copy of what's in them, and
   Brio never reads the files you deliver. It works from their names, dates and status, the comments people
   leave, and the internal memos you write for it." Say plainly that text Brio reads (a memo, a comment)
   goes to Anthropic for that one request. Before publishing, confirm preview keeps no cache and Sentry
   never records file bodies.
5. **De-identify before Brio reads free text (Deepak asked 2026-11-14; designed, not built).**
   - **Sent today, with nothing masked:**
     - Memo review (`buildNotesContext`): the memo's text, plus deliverable names and dates.
     - RAID check (`buildRaidContext`): comment text, author names and roles, document names and the
       engagement name.
     - Privacy policy §05 is wrong on two counts. It says "the contents of your documents are never sent".
       It also says Anthropic "does not retain": its default is up to 30 days, and zero only under a Zero
       Data Retention (ZDR) agreement. Fix both with #4.
   - **Layer 1, the contract (Deepak).** Ask Anthropic for ZDR. Haiku 5.5 is eligible; the Fable and Mythos
     5.x models are carved out and keep 30 days. Until it's signed, the policy says 30 days.
   - **Layer 2, `lib/ai/pseudonymize.ts`** (server-only, pure, no network, no extra provider):
     - **The vault.** Built from what we already know: engagement members' names, first names, last names
       and emails; the client and its contacts; the firm and group names. Longest match first, at word
       boundaries, possessives included ("Dana's"), case-insensitive.
     - **Patterns.**
       - Emails and URLs, internal ones included.
       - Phone numbers: formatted ones only, never a bare 10 digits. Salesforce documents an order number
         masked as a phone, which spoiled the answer.
       - SSN, EIN and ITIN.
       - Card numbers (Luhn check) and IBANs.
     - **One vault per prompt.** The memo, deliverable names, authors, document names and engagement name
       are all masked with the same vault. Otherwise "Smith" masked in the notes but left in
       "Smith Family Trust Return" re-links them, and due-date matching breaks.
     - **Placeholder tokens.** Typed and stable within a call: `[CLIENT]`, `[FIRM]`, `[PERSON_3]`,
       `[EMAIL_1]`, `[LINK_2]`, `[PHONE_1]`, `[TAX_ID_1]`. Roles already in the prompt stay. One prompt
       line: "Text in square brackets like [PERSON_1] stands for a real value. Copy it exactly; never guess
       what it stands for."
     - **Unmasking.** Put the real values back into titles, quotes and reasons, then ground quotes against
       the original text as today (`groundedQuote`, `anchorQuote`). A proposal with a token the vault
       doesn't know is dropped and counted in `dropped`.
     - **The vault never lasts beyond its call.** It lives in memory for that one call; it is never
       logged, never stored and never in a Sentry breadcrumb.
     - **Streaming surfaces (chat, briefs), later.** Hold back output from an open `[` until its `]`.
   - **Scope: every Brio call, not only memos (Deepak, 2026-11-14).** All 15 features in `lib/ai/features.ts`:
     - **Free text:** `notesProposals`, `memoRaid`, `raidCheck`, `replyDraft`, and the question typed into
       `chat`, `firmChat`, `reviewerChat` and `searchInterpret`.
     - **Names and labels:** `brief`, `dayBrief`, `dayBriefRewrite`, `summary`, `statusUpdate`, `nudgeDraft`,
       `filesAgent`.
   - **One choke point.** Every call already goes through `getGuardedAnthropic`; it takes the vault:
     - It masks every string the call sends: `system`, message text and tool results.
     - It unmasks the answer: text blocks, tool-use input (deep), and streamed deltas. A stream holds back
       from an unclosed `[` until its `]`, at most 24 characters.
     - So a call site changes one argument. Grounding checks (a quote must be in the notes) compare the
       unmasked answer with the original text, as today.
   - **Stable tokens.** The vault is built in a fixed order from `lib/ai/known-entities.ts`, so the same
     person is `[PERSON_2]` on every request.
     - Chat history re-masks the same way.
     - The prompt cache keeps hitting.
     - Engagement scope covers the firm, the client and its contacts, and the members. Firm scope (firm
       chat, briefs) covers every client, contact and member of the firm.
   - **Guard test.** Like the completed-engagement one: every `getGuardedAnthropic` call passes a vault, or
     `vault: null` with a written reason. A new feature can't skip it silently.
   - **Order of work.**
     1. The core: vault, mask, unmask, stream unmask; tests.
     2. Wire the free-text features: memos, RAID, reply drafts.
     3. Wire the chats, which stream.
     4. Wire the rest.
     5. Firm switch, then the privacy and trust copy, only once it's live.
   - **Built 2026-11-14 (uncommitted): steps 1 to 5, apart from the copy.**
     - **Core:** `lib/ai/pseudonymize.ts`, `lib/ai/known-entities.ts`, `lib/ai/masked-client.ts`.
     - **Placeholders come from the record's id, not a stored slug** (Deepak's ask, 2026-11-14: one
       identity per person).
       - `[PERSON_7F3A91C2]`: 8 hex digits, the norm (Deepak, 2026-11-14), hashed from the user, contact,
         client or firm id, never the name. The same in every engagement, firm chat and request, with no
         column and no backfill.
       - Clashes: at 8 digits, 0.003% for a 500-person firm. On one, the earlier id keeps its code and the
         later takes more digits, decided by the ids alone.
       - A first name two people share gets `[NAME_n]` for the request, numbered, never hashed from the
         name.
       - A name written another way gets `_V2`, so quotes still match the notes exactly.
       - A client's legal suffix stays visible ("[CLIENT_…], Inc.").
     - **Enforced by the compiler:** `getGuardedAnthropic(scope, { vault })` and `completeText({ vault })`
       require a vault. `lib/ai/masking-coverage.test.ts` fails on any call that passes a literal null.
     - **Wired:** all 15 call sites, plus an end-to-end test on reply drafts.
     - **Firm switch:** Settings › Brio › "Replace names, emails and links before Brio reads", on by
       default, also on /tour.
     - **Left:** ZDR (Deepak's step).
   - **Built later on 2026-11-14 (uncommitted):**
     - **Name recognition (Layer 3), by rules:** `lib/ai/name-detection.ts` finds speakers, titles,
       greetings and who-did-what words, plus first and last names alone. They're masked as `[NAME_n]`
       across the whole request (`learnNames`).
       - No model: BERT-NER through transformers.js would add a download on every cold start and seconds
         per long memo.
       - The npm install of compromise was blocked by the session's permissions, so no new dependency.
     - **Copy:**
       - Privacy section 05 has a "Names replaced before Brio reads" clause, page and embedded.
       - The terms' "What Brio reads" gains a sentence.
       - The trust center's Brio box gains a line and a point.
     - **Caching:** names are kept per server for 2 minutes and the firm switch for 1
       (`lib/ai/known-entities.ts`).
     - **Firm Overview risks and issues:** built as mock A
       (https://claude.ai/artifact/2o23j97xEMmr1ifjSUmmBJ), its own section under the Action Center.
       - Open issues and risks across the firm's live engagements, from every source, issues first, up to
         5, each opening its engagement's RAID tab.
       - Status and health entries are listed too, as in the mock. At first only thread and memo
         entries were, copying the engagement Overview, whose own Action Center shows the rest. The
         firm's Action Center doesn't show them, so a firm with only status and health entries got an
         empty list (Deepak, 2026-11-14).
       - The engagement Overview now does the same: every open entry, up to 5 rows with the latest
         decision. It showed counts over an empty list too, and Behind pace was never in its Action
         Center anyway, only under Engagement Health. The Board's approvals still stay out of
         "latest decision", since the Board shows them.
       - **Show all** on the Firm Overview: it shows the first 5 and "Show all N" opens the rest in place,
         like the Action Center's passed checks. The route sends up to 100 (`FIRM_RAID_MAX_ROWS`); past
         that, a line says how many more and that they're in each engagement's RAID log. On the
         engagement Overview the same "Show all N in the RAID log" opens the RAID tab instead: the
         whole log is one click away there.
       - **Columns:** on the Firm Overview the client and engagement have a column of their own, each
         after its icon (the handshake, the briefcase), with the full names on hover. The owner and the
         day are columns on both Overviews, after UserRound and CalendarDays as in the app's tables.
         Where the list is narrower than 56rem, the place goes on a second line under the entry.
     - **RAID explained in the app** (`components/projects/raid/raid-info.tsx`): an info icon after RAID,
       with `RAID_MEANING`, one per block on its first mention. It's on the tab, the breadcrumb, the
       Overview section, a memo's RAID suggestions, the memo sheet's warning, firm settings and the Firm
       Overview's "more" line. /privacy and /terms use the website's `RaidTerm`. Each R, A, I and D letter
       shows its full word on hover. Left without: error and toast messages, emails, the audit trail's
       text and the System Admin AI efficacy page.
     - **Priority on Risks and Issues** (mock https://claude.ai/artifact/GXfE5U1XXvZojUWGGaExkL; Deepak
       chose the gray signal bars over the Health score's colored words, which share red with the I letter):
       - High, Medium or Low, as three gray bars and the word (`components/projects/raid/raid-priority.tsx`).
         Assumptions and Decisions have none and show a dash.
       - Migration `20261114170000_raid_priority`: `priority` (enum) and `prioritySetBy`. No backfill: an
         older Risk or Issue reads as Medium, and the next sync grades every live automatic entry.
       - Where it comes from: automatic entries take the Health score's grade where Health scores the same
         thing (an overdue deliverable High; Behind pace and Planning gaps by their points, 15+ High, 8+
         Medium). Otherwise Blocked is High, and long in review or a waiting thread is Medium. Brio proposes
         one with each Risk or Issue it suggests (rule 9 of its prompt), changeable on the card before
         accepting. One added by hand starts at Medium.
       - A person's choice (`prioritySetBy`) is final: the sync never changes it.
       - One order everywhere (`compareRaid`): High, Medium, Low; within each, issues before risks; then
         newest. It applies to the RAID page, both Overviews and the Firm Overview, whose count line adds
         "N High".
       - Shown only for engagements whose RAID log the person may open, decided as the RAID tab decides
         it (`mayReadRaid` in `lib/raid/firm-raid.ts`). With none, `GET /api/firms/[firmId]/raid`
         answers 403 and the section isn't drawn.
       - Mirrored on /tour.
     - **One look for the RAID log's short form** (`components/projects/raid/raid-list.tsx`):
       - The engagement Overview's RAID card was restyled to match the firm section: a header like the
         Action Center's, a count line, and rows.
       - The R, A, I and D letters take the Board's stage colors everywhere: Risk waiting, Assumption
         underway, Issue problem, Decision done.
   - **Firm switch.** Settings › Brio › "Replace names, emails and links before Brio reads", on by default.
   - **Honest copy.** "Brio replaces the names, emails, links and ID numbers it recognizes before it reads."
     Never "anonymized": names we don't know get through, context can still identify someone, and under
     GDPR pseudonymized data is still personal data.
   - **Layer 3, only if a regulated customer asks:**
     - Name recognition for names we don't know: Presidio as a sidecar, or Bedrock Guardrails'
       sensitive-information filters.
     - Or call Claude through Bedrock in a chosen region, the Slack-style boundary.
   - **Tests.**
     - A masked value comes back unchanged after unmasking.
     - Possessives.
     - Two people named Dana.
     - A phone number vs. an order number.
     - A token the model invented is dropped.
     - A guard test that every free-text AI feature masks.
