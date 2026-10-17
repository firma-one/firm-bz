# Engagement Overview redesign (Linear / Jira inspired)

Asked 2026-10-17: "Fix all your recommendations, apart from 5" (keep the no-data metrics visible:
prospects and new customers should see what exists and what to track). Take inspiration from
Linear and Jira.

## Where we start

The Overview (`components/projects/engagement-insights-dashboard.tsx`) draws 19 rings:
7 under Engagement Health, 3 under Team Status, 9 under File Organization. A sticky Action Center
rail sits on the right. The tour copy (`components/demo/demo-engagement-overview.tsx`) mirrors it.

## Decisions

1. **One ring on the page: the Overall Health Score.** It is a score out of 100, which is what a
   gauge is for. Everything else becomes a bar, a meter or a list:
   - Delivery Status: a segmented bar in workflow order (To Do → In Progress → In Review →
     Approved), "0 of 1 approved". Linear's project progress bar.
   - Delivery Schedule, Time Lapsed and Pace: one **timeline strip** from kickoff to the due
     date, with today marked, elapsed time filled, and a tick per deliverable due date colored by
     state (overdue red). Pace sits beside it as two short bars, Delivered vs Time elapsed.
   - Deliverables: the existing per-deliverable timeline (`DeliveryTimeline`), titled
     "Deliverables". With few deliverables it is the list itself.
   - Planning Hygiene: three coverage meters (x of y set). Comment Responsiveness and
     First-Time-Right: segmented bars. Jira's "Types of work" style.
   - Team Status: three segmented bars. File Organization: the score as a number with a thin bar,
     and its eight checks as meter rows (no more Show more).
2. **Overdue deliverables lower the Overall Health Score**: −15 each, at most −45, labeled
   "N overdue deliverable(s)". A missed client deadline is high severity. Until now only
   overdue documents and an overdue engagement counted, so a page could read "90 Healthy" with
   its only deliverable late.
3. **Summary draft**: the page shows a one-line banner ("Brio drafted a new summary · Review")
   and keeps the published summary visible. Review happens in the right pane: the draft rendered,
   with a Preview / Edit toggle, the currently published summary below it, and one neutral line
   that says what publishing does and, if Publish is disabled, why. Streaming shows in the pane.
4. **Action Center moves to the top** of the page, Delivery and Housekeeping side by side; the
   right rail goes, so the report gets the full width. "N with nothing to do" becomes
   "N checks passed" (shared ActionSection, so the firm Overview changes too).
5. **Planning gaps in one unit**: the health deduction says "Planning gaps (8 missing)", the same
   count the Action Center shows. One helper computes it for both.
6. **No-data metrics stay** (the excluded recommendation), but say "No data yet" and what they
   will track, instead of a bare "—" or a misleading "0.0".

Ring ids (`ring-status`, `ring-schedule`, `ring-pace`, `ring-planning`, `ring-comments`,
`ring-ftr`, `ring-health`) and `hiddenRings` keys stay, so the Action Center's "Show in…"
buttons and the firm's hide settings keep working. The PDF export still captures the report
block; `#ring-health > :last-child` is still the deductions list.

Old components (`EngagementHealthBody`, `FolderHealthBody`, `TeamStatusBody`, `FolderHealthRing`,
the ring primitives) stay in the code, unused, until Deepak signs off on deleting them.

## Files

- `lib/insights/health-penalties.ts` (+ test): overdue-deliverable penalty, planning-gap count.
- `lib/insights/engagement-insights.ts`: use both.
- `components/projects/overview-charts.tsx`: SegmentedBar, Legend, Meter, TimelineStrip,
  PaceBars, MetricStat. Shared with the tour.
- `components/projects/summary-draft-review.tsx`: the right-pane review.
- `components/projects/engagement-insights-dashboard.tsx`: new layout.
- `components/dashboard/action-list.tsx`: "checks passed".
- `components/demo/demo-engagement-overview.tsx`: same layout with sample data.
