# /tour: cover every Brio surface in Autopilot and Guided

Status: built on dev 2026-11-17, not committed. Defaults taken for the open questions: steps where each surface lives (no separate Brio chapter); the generic Overview-tab step dropped; Files agent later; Audit moved before Members and the em dashes fixed.

Related: `.claude/plans/tour-chapters.md` (the tour's design), `.claude/plans/raid-actions-memo-minutes.md`
(RAID with Actions, memo minutes), `lib/demo/tour-chapters.ts` (outline), `components/demo/demo-tour-steps.tsx`
(steps and copy), `scripts/tour-narration/generate.py` (Kokoro clips).

## Review: what the tour covers today

Autopilot and Guided run the same steps (`NODE_STEPS`); only the pacing differs. So a surface is
either in both or in neither.

The app meters 16 Brio features (`lib/ai/features.ts`). Most already render on the /tour demo
pages, but the tour has no step that stops on them.

| Brio surface (feature) | Where in the app | On the /tour page? | Tour step? |
|---|---|---|---|
| Your brief (`dayBrief`, `dayBriefRewrite`) | Home | Yes (`DemoDayBrief`) | **No.** The Home step lists recents, agenda and bookmarks only |
| Firm brief (`brief`) | Firm › Overview | Yes | Yes |
| Ask Brio about the firm (`firmChat`) | Firm pages | Yes (`DemoFirmChat`, anchor `firm-chat` already exists) | **No** |
| Doc Search, semantic (`searchInterpret`) | Firm › Doc Search, ⌘K | Yes (filters); ⌘K is inert | Yes |
| AI summary (`summary`) | Engagement › Overview | Yes | Yes |
| Client status update (`statusUpdate`) | AI summary card | Yes (`demo-summary-card.tsx`) | **No** |
| Nudge the Reviewer (`nudgeDraft`) | Overview, deliverables in review | Yes (`demo-engagement-overview.tsx`) | **No** |
| RAID card on Overview | Engagement › Overview | Yes (`DemoRaidOverviewCard`) | **No** |
| Brio drafts a reply (`replyDraft`) | A deliverable's discussion | Yes (`demo-deliverable-comments.tsx`) | **No** |
| Memos: minutes and RAID suggestions (`memoMinutes`, `memoRaid`) | Discussions › Memos | Yes (`DemoMemosTab`) | **No.** There is no Memos node |
| RAID log and Brio's check (`raidCheck`) | Engagement › RAID | Yes (`DemoRaidTab`) | **No.** There is no RAID node |
| Actions as owner reminders | Home Needs you, Inbox | **No** demo data | **No** |
| Ask Brio on an engagement (`chat`) | Overview, Files | Yes | Yes (Brio AI section) |
| Identify action items in notes (`notesProposals`) | Engagement › Settings | Yes | Partly. The step says "an internal memo", which is stale |
| Brio settings: memo read, masking, Reviewers can ask | Firm › Settings › App settings | Yes (`demo-firm-settings.tsx`) | **No.** The step lists the tabs only |
| Credits (1 per call) | Billing | Placeholder page | **No** |
| Files agent (`filesAgent`) | Engagement › Files | **No** | No |
| Brio for Reviewers (`reviewerChat`) | Client-side Overview | No (client-role tours are out of scope) | No |

**Summary.** The tour covers the Firm brief, the AI summary, Doc Search and Ask Brio. It misses
everything since late October:
- Your brief and the firm chat.
- RAID, Memos (minutes and suggestions) and Actions as reminders.
- Status update, nudge and reply drafts.
- The Brio settings (masking) and credits.

Smaller findings:
- The tour runs Members before Audit; the app's tabs go Audit, then Members.
- 17 em dashes in step copy, against the no-em-dash rule for UI copy.
- Stale copy:
  - Engagement Settings says "an internal memo"; memos now live in Discussions › Memos.
  - The Inbox step doesn't mention Actions.
- There is no "How this works" link on the RAID tab, nor on the Memos sub-tab.

## Plan

### 1. Outline (`lib/demo/tour-chapters.ts`)

New nodes are added; existing ids keep their names, so deep links still work.

```
Engagements
  …
  Discussions
    Memos            ← new, child of discussions (like files › file-details)
  RAID               ← new, after Discussions, as in the app's tabs
  Audit              ← optionally moved before Members, to match the app
  Members
  Settings
  Brio AI
```

### 2. Steps (`components/demo/demo-tour-steps.tsx`)

Proposed copy below. Each step gets narration, with `spoken:` where the read-aloud text should
differ. Every section stays within the 1–6 steps per leaf that the guard test allows.

**Home** (2 → 3)
- *Your brief* (new, after Home). "Each morning <Brio/> writes your brief from what's on your plate: what needs you first, what's due and what moved. Rewrite it when your day changes."

**Inbox** (copy only)
- *Inbox*. Add Actions: "Reminders from due dates, follow-ups, Actions assigned to you, review requests and @mentions…"
- Demo data: add one Action reminder (entity `platform.engagement_raid_items`, "Go to RAID") to `demo-personal-data.ts`, so Home Needs you and the Inbox show one.

**Firm › Overview and daily brief** (2 → 3)
- *Ask Brio about the firm* (new, anchor `firm-chat`). "Ask <Brio/> across every engagement: what's late this week, which clients are waiting on you, where the pipeline stands."

**Firm › Settings** (2 → 3)
- *Brio settings* (new; anchor on the Brio section of App settings; needs a demo route param that opens that tab). The step says:
  - Brio reads a new memo once, for 2 credits.
  - Names, emails and links are replaced before Brio reads.
  - The firm chooses whether Reviewers can ask Brio.

**Engagements › Overview** (5 → 6, regrouped so the section stays within six steps)
- Engagement header (kept).
- ~~Engagement overview tab~~ (dropped; the header step covers it).
- Action Center (kept).
- *Waiting on the Reviewer* (new). "Deliverables in review for a while, each with a nudge <Brio/> drafts for you to send."
- *RAID at a glance* (new, anchor on the RAID card). "Open Risks, Actions and Issues, and the latest Decisions, with a link to the full log."
- AI summary: add the client update. "…and drafts the status update for the client. Your team edits and approves it before anything reaches the client."
- Progress (kept).

**Board › Details** (2 → 3)
- *Brio drafts a reply* (new, on the deliverable's discussion). "<Brio/> drafts a reply from the thread and the deliverable's status: edit it, then send."

**Discussions** (3, copy only)
- The first step mentions the two sub-tabs: "Threads with the client, and internal Memos."

**Discussions › Memos** (new, 5 steps; the demo memo already has 5 suggestions and minutes)
1. *Memos*. "Internal notes and call transcripts, each a Markdown file in your Drive or OneDrive. Leads and Full Access contributors only."
2. *Brio reads it once*. "When a memo is added, <Brio/> reads it once (2 credits): the minutes, and what to log in RAID."
3. *Summary*. "Minutes for the people who were there: subject, attendees, what was discussed and decided, and the action items. Copy them into an email."
4. *RAID suggestions*. "Each one is a Risk, Action, Issue or Decision. Change its type, title, due date or priority before you accept. Nothing changes until you do."
5. *Accept*. "Accept one, or all selected at once. Owner and status are set on the RAID tab."
- Demo: `DemoMemosTab` takes a param for the panel's tab (`MemoBrioPanel` already has `initialTab`), so steps 3 and 4 can show Summary and then RAID.

**RAID** (new, 4 steps)
1. *RAID log*. "Risks, Actions, Issues and Decisions for this engagement, internal only. Status, health and Board entries keep themselves current, with no credits."
2. *Actions*. "An Action has an owner and a due date. While it's open, it's a reminder on its owner's Home and Inbox, and Done there closes it."
3. *Brio's suggestions*. "<Brio/> reads threads with new messages once a day, or when you press the sparkle (1 credit). Suggestions from memos wait on the memo."
4. *Add an entry*. "Log one yourself: its type, owner and due date, or priority."
- RAID mentions in step copy use `withRaidTip`, per the Explain RAID rule.

**Engagements › Settings** (copy fix)
- Replace "an internal memo" with the notes field. "…notes from a call, where <Brio/> can identify action items."

**Brio AI** (2 → 3)
- *Brio and your data* (new, last step of the section). Covers:
  - Placeholders for names, emails and links before Brio reads.
  - Nothing changes until someone accepts it.
  - Every answer or draft costs 1 credit, shown on Billing.

**Billing** (copy only)
- Mention credits: "…your plan and its Brio credits: one per answer or draft."

### 3. Demo anchors and params

These are new `data-demo-tour` values. The guard test checks that every step target exists.
- `home-day-brief`
- `firm-settings-brio`
- `overview-waiting-reviewer`
- `overview-raid-card`
- `deliverable-reply-draft`
- Memos: `memos-tab`, `memos-list`, `memo-brio-summary`, `memo-brio-raid`, `memo-accept`
- RAID: `raid-tab`, `raid-filters`, `raid-brio-check`, `raid-add`

These route params are new:
- `settingsTab=app` on Firm › Settings.
- `brio=summary|raid` on a memo.

### 4. Narration (Kokoro)

- Run `scripts/tour-narration/generate.py` after the copy lands. It remakes only changed clips and removes unused ones. About 22 clips are new or remade: new steps, plus later steps in a node that shift their `node-n` key.
- Use `spoken:` where reading differs:
  - The letters R, A, I and D read as their words.
  - "⌘" reads as "Command".
  - Write "Firma" (it's said "FUR-muh").
- Autopilot's timing follows each clip's length plus the 1.2 s beat, so nothing else changes.

### 5. App entry points

"How this works" (`engagement-header.tsx`) gets two more links:
- The RAID tab opens `raid`.
- Discussions with `view=memos` opens `memos`.

Update the plan's table in `tour-chapters.md`.

### 6. Tests

- `lib/demo/tour-chapters.test.ts`: the new nodes in order, the anchors, and at most 6 steps per leaf.
- `lib/demo/tour-narration.test.ts`: clips match the copy.
- `engagement-header.test.tsx`: the new links.
- `tour-parity.test.tsx`: unchanged.

### 7. Cleanup (optional, same PR)

- Replace the 17 em dashes in step copy with middle dots or full stops.
- Move Audit before Members, to match the app's tabs.

## Secondary: Resume in the start panel

Resume is there. It's the gray row above the chapters: "You stopped at Engagements › Audit … Resume".
It reads like a status line, though, and the green footer button, "Play the whole tour", starts over
and clears the rings. So the obvious press loses the place.

Proposed fix (`components/demo/demo-tour-panel.tsx`):
- With a stopped place, the footer's primary button becomes **Resume at Audit** (Play icon in Autopilot).
- "Play the whole tour" becomes a secondary **Start over** button.
- The row above the chapters keeps "You stopped at Engagements › Audit" as plain text, without its own Resume link.
- Without a stopped place, the footer stays as it is today.

This is small and independent of the coverage work, so it can ship first.

## Not in this plan (decide)

1. **Files agent.** It has no demo version yet. Building one is a separate piece of work.
2. **Brio for Reviewers.** It's on the client side, and client-role tours are out of scope (tour-chapters.md). The firm setting is covered instead.
3. **⌘K natural-language search.** It stays inert in the demo.

## Open questions

1. Brio steps where each surface lives (this plan), or also a separate "Meet Brio" highlight chapter?
2. On Overview, is dropping the generic "Overview tab" step OK, to stay within 6 steps?
3. Build a Files agent demo now, or later?
4. Move Audit before Members, and fix the em dashes, in the same PR?
