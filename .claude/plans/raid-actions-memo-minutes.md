# RAID with Actions, and memo minutes

Status: built on dev 2026-11-15, not committed. Migration `20261116090000_raid_action` is written but not applied (`npm run build` applies it). Mock approved 2026-11-15: https://claude.ai/artifact/23sSkgqwcWN3QkyehLHCZ2

Measured after the build, on the masked call memo:
- Memo read, 4 runs: 12 to 14 suggestions, 7 to 9 of them Actions, 0 dropped, 32 to 39s.
- Minutes: about 14s.

## What changes, in one paragraph

RAID becomes **Risks, Actions, Issues, Decisions**. Assumptions are no longer created. Existing ones stay and show with Decisions under an "Assumption" label, with no data migration. An Action has an owner, a due date and no priority. A closed Action reads "Done". An open Action with an owner and a due date shows on that owner's Home and Inbox, as a reminder does today. On a memo, Brio's panel gets two sub-tabs:
- **Summary:** the meeting's minutes, with Copy subject and Copy summary.
- **RAID:** one list of suggestions typed R, A, I or D, each accepted into the RAID log.

The separate "action items" list (reminders, due-date moves, new deliverables) leaves the memo page. Commitments become Actions, and so do new deliverables and due-date moves. While someone works in the panel, the memo list collapses to a rail of date blocks.

## Decisions already made (from the 2026-11-15 discussion)

- **Types:**
  - Old Assumptions split three ways: implicit choices become Decisions, unconfirmed facts become Risks, promises become Actions. This only affects how Brio reads from now on.
  - No priority on Actions; the due date does that job.
- **Accept:**
  - On the memo you can change the type, title, due date or priority before accepting. Owner and status are set on the RAID tab.
  - An accepted Action is owned by whoever accepted it until reassigned.
- **Minutes:**
  - Standard minutes of the meeting for the people who attended, written only from what was said. RAID never goes in them.
  - Their action items come from this memo's Actions, so the two never disagree.
- **Panel layout:**
  - The type is a letter mark; clicking it opens the type menu.
  - The title wraps and is edited in place.
  - Due date or priority sits on a chip, with the quote beside it.
  - Each row takes two or three lines, with generous spacing (see the mock).
- **Where RAID lives:** RAID stays its own engagement tab, after Discussions.

## Answers (Deepak, 2026-11-15)

1. **Actions from threads:** memos only for now. The daily thread read suggests Risks, Issues and Decisions; it stops suggesting Assumptions too.
2. **Inbox Done:** yes. Done on an Action's reminder in the Inbox closes the Action in RAID.
3. **Credits:** every AI call costs 1 credit; nothing is free and nothing is fractional, so counting stays simple.
   - A memo read is 2 credits: 1 for RAID, 1 for the minutes.
   - `memoRaid`, `memoMinutes`, `dayBrief` and `searchInterpret` all become 1.
4. **Names:** the sparkle tooltip reads "Read this memo with Brio · 2 credits · minutes and RAID". The firm settings switch reads "Summarize memos and suggest RAID items when they're added".
5. **Memo columns:** they fill the viewport height, and content that overflows scrolls inside its column.
6. **Legal copy:** update the privacy policy and terms as needed.

## Phase 1 · Data and RAID core

**Migration** `20261116xxxxxx_raid_action` (hand-written from `prisma migrate diff --script`, as the last three were, then applied by `npm run build`):
- `ALTER TYPE "platform"."RaidItemType" ADD VALUE 'ACTION';`
- `ALTER TABLE "platform"."engagement_raid_items" ADD COLUMN "due_date" DATE;`
- `ALTER TABLE ... ADD COLUMN "follow_up" BOOLEAN NOT NULL DEFAULT false;`
  - This marks Actions Brio added for the firm itself, such as "set up the deliverable" or "prepare for the review". The minutes leave these out.
- Update the schema doc comments at `prisma/schema.prisma:1012`, `:1021`, `:1057` and `:1064`.

**`lib/raid/raid-shared.ts`**
- **Types:**
  - `RaidType` gains `ACTION`.
  - `RAID_TYPES` (what people and Brio can choose) becomes `RISK, ACTION, ISSUE, DECISION`.
  - `ASSUMPTION` stays in the type, as a legacy value.
- **Display:**
  - A helper `displayTypeOf(item)` shows an `ASSUMPTION` as a Decision, plus the "Assumption" label.
  - ACTION is letter A, label "Action", plural "Actions".
  - ACTION takes the `underway` color Assumptions had, so no new color is added.
  - Update `TYPE_RANK`.
- **Status:**
  - New `raidStatusLabel(item)`: a CLOSED Action reads "Done".
  - `raidTone`: an overdue open Action is `late`, shown red.
- **Counts:** add an `ACTION` count. `raidOverviewOf` counts actions and folds assumptions into decisions.
- **Wording:**
  - `RAID_MEANING` becomes "Risks, Actions, Issues and Decisions: what could go wrong, what's to be done, what's already wrong, and what was decided."
  - Update `attachPhrase` to match.
- **Shape:** `RaidItemView` gains `dueDate` and `followUp`.

**`lib/raid/raid-store.ts`**
- **Fields:** `ITEM_SELECT` and `view()` include `dueDate` and `followUp`.
- **Checks:**
  - New `checkedDueDate`: a YYYY-MM-DD date that is not more than 2 years out.
  - `dueDate` is only allowed on ACTION.
  - `checkedType` takes the new list; its message becomes "Choose Risk, Action, Issue or Decision."
- **Adding by hand (`addRaidItem`):** takes `dueDate`. An Action's owner defaults to the person adding it.
- **Accepting a suggestion (`acceptRaidSuggestion`):**
  - Takes optional `type`, `title`, `dueDate` and `priority`.
  - Priority is dropped for an Action, and the due date for anything that isn't one.
  - An Action's owner defaults to the person accepting it; this needs the route's user id passed in.
- **Editing (`editRaidItem`):** `dueDate` can be edited on an Action.
- **Close and reopen:** both call the reminder sync below.

**Routes** `app/api/projects/[projectId]/raid/route.ts` and `raid/[itemId]/route.ts`
- Pass `dueDate` through on add, edit and accept, and `type` on accept.
- Both are already listed in `lib/engagement-access.completed.test.ts`, so no new write routes are added in this phase.

**Reminders for Actions** (new server-only module `lib/raid/raid-action-reminders.ts`, called from raid-store)
- `syncActionReminder(before, after)`:
  - **Upsert** when the item is an open ACTION with both an owner and a due date. It uses `upsertFollowUpReminder` with:
    - `userId`: the owner
    - `entityKey`: `platform.engagement_raid_items`
    - `entityValue`: the item id
    - `action`: "Action"
    - `dateKey`: `platform.engagement_raid_items.dueDate`
  - **Remove** from the previous owner when the owner changes.
  - **Remove** on close, or when the due date or owner is cleared.
- **Resolver** in `lib/reminders/entity-registry.ts`. It returns the Action's title, firmId, client and engagement names, and `ctaUrl` = the engagement's RAID tab. Without it, Home and the Inbox hide the reminder (they drop items without a `firmId`).
- **Inbox icon:** `components/inbox/inbox-items.ts` `reminderEntity` gets a case for the RAID item.
- **Done from the Inbox:** `markReminderDoneOrThrow` closes the Action, following the `doc_comments` hook pattern (open question 2).
- **Cleanup:** the Inngest cleanup on engagement delete and member removal (`lib/inngest/functions.ts:1525–1533`, `:1589–1600`) adds the new key.
- **Note:** `upsertFollowUpReminder` already writes for other users (review requests, mentions) and pushes "Assigned to you". No server action takes a userId.

**RAID tab UI** (`components/projects/raid/*`)
- **Header and filters:**
  - The header line reads "Risks, Actions, Issues and Decisions · Internal only".
  - Filters: All · Risks · Actions · Issues · Decisions.
  - The Closed filter reads "Done" while the Actions filter is on.
- **Table:**
  - A Due column, showing an overdue date in red.
  - Under the Actions filter, the columns are Action · Source · Owner · Due · Next step · Status · Raised, with no Priority.
  - The status tag uses `raidStatusLabel`.
  - The row menu shows "Mark done" for an Action.
- **Add form:** picking Action shows Owner (default you) and Due instead of Priority. The Next step field stays optional.
- **Legacy Assumptions:** shown as D with a gray "Assumption" label.
- **`raid-overview-card.tsx`:** the count line becomes issues · risks · actions · decisions.
- **`raid-list.tsx`:** an Action row shows its due date instead of the raised day.

## Phase 2 · Brio reads the memo: RAID with Actions, and the minutes

**RAID read** (`lib/raid/raid-check.ts`)
- **Make `suggestFrom` take its type list, prompt and tool as parameters.** The memo read uses R/A/I/D. The thread read uses R/I/D, with no Assumptions (open question 1).
- **Memo prompt:**
  - Start from today's `RAID_SYSTEM_PROMPT` and add the commitment-finding rules tuned on 2026-11-15 (in `NOTES_SYSTEM_PROMPT`):
    - every commitment, whoever made it
    - a commitment with no date is never skipped; it gets the first working day of next week
    - an agreed point to revisit gets a prepare Action five working days before
    - new work becomes "Set up the X deliverable", flagged `followUp`
  - Route what used to be Assumptions with the three-way split above.
  - Keep the made-up Maya and Tom example and extend it with Actions. Never use a firm's real notes.
- **Context:** the memo call gets TODAY and CALENDAR from `buildNotesContext`'s helpers, so it can resolve dates.
- **Tool fields:** `dueDate` (Actions only), `followUp` (Actions only), and `newDeliverable`, which shows the New deliverable tag.
- **Validation:**
  - Accept ACTION.
  - Drop `dueDate` from anything that isn't an Action.
  - Default a missing Action date to the next Monday.
  - Keep `groundedRun` quote grounding.
- **Limits:**
  - `max_tokens` goes from 6000 to 8000.
  - For memos, `MAX_INPUT` (30k) goes up to the memo limit (100k). Today's action-items read sees the whole transcript, and the RAID read would otherwise lose the end of a long one.
  - The 45s timeout stays; re-measure it.
- **Measure:** re-run the scratchpad eval (memory `project_brio_extraction_tuning.md`) on the masked call memo. It should still find:
  - the commitments from the 2026-11-15 baseline: 5 to 9 per run, with the Monday template, AI education content, CTA sheet, invoice and the Dec 24 prepare
  - the two deliverables, now as follow-up Actions
  - the RAID items

**Minutes** (new server-only `lib/memos/memo-minutes.ts`)
- **The call:** a `getGuardedAnthropic` call with a vault from `vaultForEngagement`; `lib/ai/masking-coverage.test.ts` checks this.
  - Feature: `memoMinutes`.
  - Effort: `AI_EFFORT.minutes`, set to medium.
  - Strict tool `record_minutes`, with these fields: `subject`, `meetingDate`, `attendees[]`, `summary`, `discussed[]`, `decisions[]`, `openQuestions[]`, `nextMeeting?`.
  - Action items are never written here; the panel adds them from the memo's Actions.
- **Prompt:**
  - Minutes for the people at the meeting, only from what was discussed.
  - An aside typed after the call is left out.
  - Neutral, past tense, no opinions.
  - A made-up example.
  - American English, no em dashes.
- **Storage:**
  - Kept in `EngagementDocument.settings.memo.review.minutes`, encrypted with `sealText`. The rule is that no memo text is stored in plain text.
  - The review GET route decrypts it with `openText`.
  - Replaced when the memo is read again. Cleared by `editMemo` when the notes change, as the RAID suggestions are.
- **Credits:**
  - Add `memoMinutes: 0` to `AI_FEATURES` and `CREDIT_WEIGHTS` (`lib/ai/features.ts`), to `FEATURE_LABELS` (`app/(app)/system/ai-efficacy/page.tsx`), and to its row in `components/billing/current-plan-summary.tsx`.
  - `memoRaid` goes to weight 1, so the memo read still costs 1 credit in all (open question 3).

**Pipeline** (`lib/memos/memo-review.ts`, `app/api/projects/[projectId]/ai-notes-proposals/route.ts`)
- **On add or identify:** run the RAID read and the minutes in parallel, then write the review. RAID goes first, as now.
- **Load the vault once per memo:** it is loaded for each call today.
- **`findNotesActions`:** the memo page stops calling it. The code stays for any other surface still using it (check `internal-memos-card.tsx` during the build); per the no-deletion rule, nothing is removed until sign-off.
- **The sparkle route:** re-runs both reads and is charged to the person.
- **Constraints:**
  - `memo-review.test.ts` forbids memo-review.ts from importing raid-store or reminders. Accepting stays in the routes, so this holds.
  - Add mocks there for the minutes module.
- **Audit line** (`memo-review.ts:78`): "Minutes · N RAID suggestions".

## Phase 3 · The memo panel

`components/projects/engagement-memos.tsx` and a new `components/projects/memo-brio-panel.tsx`:

- **Header:** the "Action items / from this memo" heading is replaced by the sub-tabs **Summary** and **RAID N**, with the sparkle at the right.
  - The RAID tab opens by default while suggestions are waiting; otherwise Summary does.
- **Summary tab:**
  - "Brio wrote the minutes" and the caption.
  - **Copy subject** and **Copy summary**. Copy summary writes a `ClipboardItem` with both `text/html` and `text/plain`, falling back to `writeText`.
  - The minutes, with Action items built from this memo's Actions: waiting or accepted ones, never dismissed or `followUp` ones, with titles as edited.
- **RAID tab:**
  - One list, laid out as in the mock: checkbox, letter-mark type menu, wrapping title edited in place, Accept.
  - The second line has the due-date chip (date picker) for an Action or the priority chip for a Risk or Issue, then the quote.
  - The New deliverable tag and its note.
  - The skipped lines (folded) and the footnote.
  - **Dismiss all** and **Accept N selected**.
  - Accept goes through `PATCH raid/[itemId]` with `{action:'accept', type?, title?, dueDate?, priority?}`.
  - Changing the type to Action defaults the date to the next Monday.
- **Collapsed memo list:**
  - While the panel is in use, the list becomes a 64px rail of date blocks with a to-review count. Hovering a block shows the title and author. A button at the top brings the full list back.
  - The grid goes from `260px | 1fr | 300–360px` to `64px | 1fr | 440–560px`.
  - The columns fill the window instead of 480px (open question 5).
- **Labels:**
  - The sparkle tooltip changes.
  - The firm settings switch label changes (`firm-settings-form.tsx:900`, `demo-firm-settings.tsx:210`).
  - "RAID suggestions" copy at `engagement-memos.tsx:1028`.
  - `MEMO_PROPOSALS_FOOTNOTE`.

## Phase 4 · /tour, website and email (mirror rule)

- **/tour RAID** (`components/demo/demo-raid.tsx`): reuses `RaidTabView`.
  - The sample Assumptions become Actions, plus one overdue Action.
  - Keep one legacy Assumption, to show its label.
- **/tour memos** (`components/demo/demo-memos.tsx`): reuses `MemosView`.
  - Pass the new props.
  - Canned memos get minutes and R/A/I/D suggestions instead of action items.
  - `addedMemoFound` changes too.
  - The tour's memo and RAID tab share accepted state, which today is two copies.
- **/tour Settings:** `demo-engagement-settings.tsx` keeps its internal memo unless the app's surface changes.
- **Website:**
  - `meet-brio-timeline.tsx`:
    - The 1:00 PM card becomes "Call notes into minutes and RAID".
    - `RaidStory`'s A row becomes an Action.
    - Update the aria-labels.
  - `meet-brio.tsx:44` and `:116`.
  - `config/pricing.ts:223` and `:310`.
  - `data/faq-data.ts`, `faq.tsx`, `trust-map-data.ts`.
  - `RaidTip` text follows `RAID_MEANING` automatically.
- **Email:** `lib/email-templates/campaigns/brio-band.ts:64–114` (the 1:00 PM card, the RAID card, the spelled-out RAID). This reaches future sends of `brio-whats-new-2026-11` and `firma-intro-2026-11`.
- **Legal:** the privacy policy and terms list RAID and memo processing. Deepak reviews any added line (open question 6).

## Phase 5 · Tests and checks

- **Update:**
  - `raid-info.test.tsx:30` and `:40`
  - `raid-overview-card.test.tsx:26` and `:33`
  - `raid-tab.test.tsx:51` and `:71–80`
  - `raid-shared.test.ts:60` and `:72–79`
  - `raid-store.test.ts:65`
  - `raid-check.test.ts:211`, `:251–267` and `:345`
  - `raid/route.test.ts:174`
  - `demo-raid.test.tsx`
  - `engagement-discussions-memos.test.tsx:290–419`
  - `demo-engagement-comments.test.tsx:86`
  - `notes-proposals-panel.test.tsx`, only if its surface changes
- **New:**
  - raid-shared: labels, Done, the late tone, counts, the legacy display
  - raid-store: dueDate rules; owner defaults on add and accept; type change on accept
  - raid-action-reminders: upsert, move between owners, remove on close or cleared date, re-add on reopen
  - the entity-registry resolver
  - inbox `reminderEntity`
  - Inbox Done closes the Action
  - memo-minutes: validation, the vault, sealed storage, cleared on edit
  - the memo panel: sub-tabs, rail collapse, letter-mark menu, Accept with type and date, minutes action items following edits
  - a guard update if the masking-coverage count changes
- **Run:** the full vitest suite, `tsc`, lint, then `npm run build` (the pre-push hook) to apply the migration.
- **Manual check on dev:** in regular Chrome via Claude in Chrome, since Turnstile blocks sign-in in the browser pane.
  1. Add the masked call memo.
  2. Check both sub-tabs.
  3. Accept an Action.
  4. See it on the RAID tab and on Home.
  5. Mark it done in the Inbox; the Action closes.

## Order and size

The build goes in five commits on `dev`, one per phase, with Phases 1 and 2 behind nothing (no feature flag), since the only production user is Deepak. One release (dev → main) goes out once all five land, not mid-feature.

Rough size: Phase 1 is about a day; Phases 2 and 3 are the bulk; Phase 4 is copy and demo data.
