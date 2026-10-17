# Firm Overview redesign

Asked 2026-10-17: bring the Firm Overview (`?tab=analytics` on the firm) in line with the Engagement
Overview redesign (`.claude/plans/engagement-overview-redesign.md`).

## What was there

- Today's brief (flat section, refresh icon, a "Written by Brio…" line under it) and the Business
  overview on the left; the Action Center in a sticky right column (`20rem`), usually two
  "All clear · N checks passed" rows and a lot of empty column.
- Business overview: four big count tiles; a **Revenue pipeline** bar running the full page width
  (with no fees entered, every client shows "—"); **Engagement types** as a text legend; **This
  week**, four more big tiles.
- Bug: the insights route's engagement list only had engagements **with a due date**. Engagement
  types, the pipeline, the unanswered-comments scan and revenue-at-risk all read that list, so
  they disagreed with "Active engagements" (types said 1 where there were 2).

## The new page, top to bottom

1. **Action Center**, full width, Follow-ups and Documents side by side, as on the engagement.
2. **The top row**: three cards in the left third, the brief in the right two thirds (the
   engagement's cards-and-summary layout). Without a brief the cards sit in a row of thirds.
   - **Engagements**: active count, a bar of how they're tracking (On pace / Slightly behind /
     Behind / Overdue / no due date or no deliverables yet), with its legend.
   - **Clients**: active, prospects, on hold and past when there are any, pending invitations.
   - **This week**: new clients, new engagements, invitations sent, engagements closed.
   - **Today's brief**: a bordered card with the Engagement Summary's header: title, age,
     Copy, "Rewrite with Brio". The policy line stays, inside the card.
3. **Engagements**: one row per active engagement, like Linear's project list and the
   engagement's deliverables timeline: name and client; lead; deliverables approved (x of y, with
   the stage bar); time used with days left or overdue; a pace tag. Overdue and behind first.
   Each row opens that engagement's Overview.
4. **Pipeline**, in thirds: Revenue pipeline (the client bar and drill-down, now a third wide),
   Engagement types (a bar and legend), Closing soon / At risk. Without fees the pipeline says so
   ("No fees yet") and what it will show, instead of dashes.

## Pace, per engagement

Cheap counts from the database, not the engagement's full Health Score (that one lists Drive
folders; running it for every engagement on each load would be slow):
- deliverables = the engagement's folders marked as deliverables (`settings.share.createdAt`),
  their stage from `settings.activity.status`, overdue when past their due date and not approved;
- time used = kickoff (or created) to due date;
- tag: **Overdue** (engagement past its due date), else `paceStatus(delivered %, time %)`
  (On pace / Slightly behind / Behind pace, the engagement Overview's rule), else **No due date**
  or **No deliverables yet**.

## Route changes (`/api/firms/[firmId]/insights`)

- The engagement list no longer requires a due date (fixes the counts above).
- New `engagementRows`: per active engagement, dates, lead (first `eng_admin`, Brio excluded),
  deliverable counts by stage and overdue.

## Shared with the tour

The page's sections are presentational (`components/dashboard/firm-overview-sections.tsx`); the app
feeds them from the route, the tour (`demo-firm-overview.tsx`) from its sample data, as with the
engagement Overview.

## Layout rules from review (2026-10-17)

- **The top row ends level.** Cards column and brief share one height: when the brief is taller
  the cards grow to share it; when the cards are, the brief card stretches and its footer stays at
  the bottom. Keep the cards short (Clients is one wrapping row) so the brief has little to fill.
- **Bars in a row start level.** Blocks side by side put their bar directly under the title; hints
  go in the block's info tip, not in a line above one bar only.
- **No negative margins in the list.** The firm page scrolls inside an `overflow-y-auto` area,
  which makes horizontal overflow scroll too: rows pulled 8px past the edge drew a page-wide
  horizontal scrollbar.

## The firm Action Center (2026-10-17)

Rebuilt around what only the firm level can act on (`components/dashboard/firm-actions.tsx`,
derived in `lib/insights/firm-actions.ts`), one request with the report:

- **Engagements**: Extend or close overdue engagements · Reply to client comments (the client
  wrote last) · Finish engagement setup (no lead, due date or deliverables) · Resend invitations
  (invitations are to an engagement; expired in the last 30 days, or expiring within 3 — a pending
  one past its date counts as expired, since expiry is only written when the link is opened).
- **Clients**: Start work with idle clients (active, no active engagement) · Decide on prospects
  (past their expected close date, or with none set; opens the client's settings).
- **Client follow-up dates are paused, not retired** (2026-10-17: the field complicated the client
  form, and Deepak plans to bring it back). Its field had already left Client Settings and Add
  client in July (`7902446d`); the client list's follow-up tags and the details popup's date are
  hidden too. Everything behind them stays — the column, the forms carrying the value through on
  save, the reminder `client.ts` writes, the reminder clearer, the insights route's follow-up list
  — each marked "KEEP: client follow-up dates are paused" so it isn't removed as dead code.
- **Gone**: the Documents group (file checks belong to each engagement's Housekeeping; it also
  dropped a firm-wide Drive scan from every load), personal reminders (Inbox and Home), and
  Upcoming (due dates are in Coming up).
- Each item is worded as the thing to do and opens its rows, with a line on how to do it.
- **All clear is one line**: "All clear · 6 checks passed", the checks listed on a click.
- The tour shows two sample items (a client comment, an invitation about to lapse) so visitors
  see what the list is for.
- The old `firm-action-center.tsx` and `demo-firm-action-center.tsx` were deleted on sign-off
  (2026-10-17).

## Rewriting the brief (2026-10-17)

"Rewrite with Brio" streams in place (decided over a draft pane like the Engagement Summary's: the
brief is internal, has nothing to edit, and no client sees it). `POST /api/firms/[id]/ai-brief?stream=1`
sends NDJSON (`meta`, `delta`s, `done` with the saved brief, or `error`); the brief is saved only
when complete. The card shows "Brio is reading your firm's data…", then the sections writing in
(same styles as the finished brief, words fading in, a caret), with Stop: stopping, leaving the
page or a failure keeps the old brief, and a stopped rewrite stops the model and isn't charged.
The tour simulates it.
