# Engagement Overview restructure (2026-11-17)

Deepak: "the current Engagement Overview with Action Center may have become overwhelming … too much to
look at & for the user to understand in what priority should the information be consumed." Approved
mock: https://claude.ai/artifact/Wn9cZaKL8fGaRereu6Zuit (canvas: Overview, Where each block went,
Members, Files · Recent, Files · Health). "This is great, yes we should build it."

## What was wrong

Three pages stacked into one (to-do surface, client report, admin hygiene), all at the same heading
weight, and the same facts repeated 4–7 times (planning gaps 7×, QGT-12 in review ~7×). Three to-do
lists with three models: Action Center (counts by category), RAID card (owned rows), summary prose.

## The new Overview (in order)

1. **Status row**: Health (the one ring, score, what lowered it as a caption) · Timeline (days left,
   bar) · Progress (x of y approved, stage bar, pace) · Next due · RAID (open counts, link; internal,
   never exported).
2. **Needs you**: one list in Home/Inbox rows, each a specific item with one action.
   - Waiting on you: your RAID actions overdue or due within 7 days, Brio's RAID suggestions, overdue
     deliverables, rework, planning gaps, unanswered comments, intake to review, sensitive files.
   - Waiting on others: deliverables in review (Leads get Draft a nudge, WaitingOnClient's rows),
     pending invitations.
   - One quiet "N checks passed" line for what's clear.
   - Internal viewers only; Reviewers and Limited Access contributors keep ReviewerBrioPanel.
   - RAID auto issues (overdue, behind pace, planning gaps, unanswered threads) are left out: they are
     the same signals as the rows above.
3. **Latest update**: the published summary, its first section shown, the rest behind "Read the full
   update". All of it still exports.
4. **Deliverables**: the timeline, unchanged.
5. **Health details**: OverviewDetails, closed by default, always exported.

One toolbar on the tab row (Refresh, settings, Download PDF, Email report), portaled like Files' New.

Export: status row (minus RAID), the full update, deliverables, health details. Needs you and every
control are `data-no-export`; collapsed parts render hidden with `data-export-only`.

## Where the rest went

- Team Status → top of the Members tab (two cells: Joined, By role with "N internal · N limited").
- File Organization + the Action Center's Housekeeping → Files tab, **Health** view (score, what
  lowered it, 8 checks incl. sensitive files; duplicates open their drilldown).
- Document Activity → Files tab, **Recent** view.
- Recent and Health are internal only (canViewInternalTabs and not viewing as a limited role).
- Files tab view is `?view=recent|health`; All files is the default and unchanged.

## Kept, unused, until Deepak signs off (feedback: no deletion until sign-off)

EngagementActionCenterV2, RaidOverviewCard, OverviewTop and its cards, TeamSection's Overview mount,
the old summary card markup's helpers. Nothing deleted.

## Tour

DemoEngagementOverview, DemoEngagementMembers and the tour's Files tab get the same layout from the
same shared components (components/projects/overview-layout.tsx). The tour's Team Status now agrees
with its Members list (4 people, 1 invited).

## Files

- `components/projects/overview-layout.tsx` (new, shared with the tour): StatusRow, NeedsYou rows,
  LatestUpdate shell, HealthDetails.
- `components/projects/engagement-insights-dashboard.tsx`: new layout, RAID fetch, Needs you items,
  toolbar portal.
- `components/projects/engagement-workspace.tsx`: Overview toolbar slot; Files views.
- `components/projects/waiting-on-client.tsx`: `rows` variant for Needs you.
- `components/projects/members/team-status-strip.tsx` (new) + `engagement-members-tab.tsx`.
- `components/projects/files-views.tsx` (new): view tabs, Recent, Health.
- Tour: `demo-engagement-overview.tsx`, `demo-summary-card.tsx`, `demo-engagement-members.tsx`,
  `demo-engagement-workspace.tsx`.

## Status (2026-11-17)

- [x] Overview  - [x] Members  - [x] Files views  - [x] Tour  - [x] tsc, tests, browser check
- Built on dev, not committed. tsc clean; 116 test files / 1,436 tests pass in components/demo,
  components/projects, lib/demo, lib/raid, lib/insights, lib/ai. Tour narration clips 2–6 of the
  Overview chapter remade with scripts/tour-narration/generate.py.
- Checked in the browser: /tour (Overview, Members, Files › Recent and Health) and the app signed in
  (Overview with live data, Files › Health with duplicates drilldown, Files › Recent, Members). The PDF
  export's content was checked by running its clone steps in the page (no file downloaded): status row
  without RAID, the full update, deliverables, health details, no Needs you.
- Decided while building: an overdue deliverable that is in review lists once, under Waiting on
  others, marked overdue (it's with the client); the RAID log's auto entries stay off Needs you.
- Board → **Deliverables** (Deepak, 2026-11-17): the tab, breadcrumbs, toasts, empty states, the
  deliverable pane ("N not started", "Move to To do"), RAID source labels ("Deliverables", "From
  Deliverables", "Resolved · no longer a deliverable"), Needs you's buttons, Brio's reviewer prompt
  and the tour (steps, chapter title, narration clips remade). Label only: the `/board` and
  `/shares/board` URLs, ids and `data-demo-tour` anchors stay. RAID close reasons already stored keep
  "Board". Marketing copy and campaign emails still say Board (a board is still how the tab lays them
  out); not touched.
- Tour sequences (Autopilot and Guided play the same steps): Overview chapter retitled "Overview and
  what needs you"; Files gets a 6th step, "Recent and Health" (`files-views`, route `view=health`);
  the Members step mentions Team Status. Clips remade (files-6, engagement-members-1); the Overview
  chapter played through in Guided with every target on screen.
- Files stays **Files** (it holds folders, images, sheets and links, not only documents).
- Sub-tabs, one look (components/ui/sub-tabs.ts): borderless pills, the open one tinted, as Linear and
  Vercel draw a page's views. Discussions › Threads | Memos moved off its boxed segmented control;
  Files › All files | Recent | Health uses the same, with Discussions' AccessLock and wording.
- Follow-up: the tour's RAID sample is from a tax engagement (K-1s, 1099-B, QSR ids, Dana) on a GTM
  engagement; realign it with the memos and comments that share it, and their tests.
