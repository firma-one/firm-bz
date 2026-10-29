# Guided tour in chapters, linked from the app

Status: built on `claude/tour-chapters-efa33d`, 2026-10-29; restructured the same day after
Deepak's review (outline in the data model's order, sections, an outline pane, Settings mock pages).
Not committed yet.

Deepak wants to teach the app visually instead of with written docs. Written docs are tedious to
keep up, and Brio's FAQ answers are only as good as those docs. So the `/tour` guided tour is split
into chapters and sections, each one linkable, and the real app links each page to its part.

## Before

- One flat 26-step `STEPS` array in `components/demo/demo-tour.tsx` (react-joyride v3). Each step
  had `target`, `title`, `content` and `route`; `navigateForStep` pushed the route.
- State in `lib/demo/demo-tour-context.tsx`. The intro modal listed six areas and offered Start or
  Resume; the outro modal ended the run.
- A missing target was retried and then skipped silently on `TARGET_NOT_FOUND`, which hid drift.

## The outline

Chapters and sections follow the sidebar and the data model: Firm › Clients › Engagements. Any
chapter, section or sub-section can be run on its own or linked; the whole tour runs them all.
`lib/demo/tour-chapters.ts` holds the tree (`TOUR_OUTLINE`, flattened in order as `TOUR_NODES`); the
steps live in `components/demo/demo-tour-steps.tsx` (`NODE_STEPS`, one list per node).

```
Search (⌘K)
Home
Inbox
Profile
Firm
  Switch firms · Overview and daily brief · Doc Search · Calendar · Members · Audit · Settings
Clients
  All clients · Contacts · New client
Engagements
  All engagements · New engagement · Overview, AI summary and progress
  Files › Details · Board › Details · Discussions · Members · Audit · Settings · Brio AI
Support
Billing
```

31 nodes, 53 steps. Added beyond Deepak's list: Search (⌘K), Switch firms, the firm Audit, New
engagement, and a Details sub-section under Board as well as Files.

### Steps teach flows that work

Steps point at controls that work on `/tour` wherever there is one. The tour's components open the
state a step needs from the URL, which also makes those states linkable:

- `?tab=files&folder=<id>` opens a top-level folder in the Files list. The Files section works in the
  first engagement's In progress deliverable, where stage, Due, Details, Blocked and drop-to-add work.
- `&details=<fileId>` opens a file's Details pane (Files › Details).
- `?tab=board&deliverable=<id>` opens a card's pane (Board › Details).
- `?menu=profile` holds the profile menu open (Profile, Support, Billing). Held that way it is
  non-modal and ignores clicks and focus outside, or the step card taking focus would close it.

Each parameter only drives the view; navigating by hand leaves the URL alone, and when a parameter
goes away (the tour steps back), the view goes back with it.

### Mock pages instead of "not in this demo"

- **Firm › Settings** (`demo-firm-settings.tsx`) and **Engagement › Settings**
  (`demo-engagement-settings.tsx`): static copies of the app's forms (the real ones fetch the firm
  and call server actions) over the sample data. Fields and switches change on screen; Save, Delete
  and the storage connection are inert. The sidebar's Settings item now opens the firm page.
- Contacts, Billing and Profile have no page on the tour: their steps point at the inert tab or the
  profile menu entry and say so ("inert in this demo").
- The demo profile menu ends with Sign out (inert), as in the app, not Sign up.

## Modes

How a run plays, picked in the chapter picker and switchable mid-run from the outline pane
(`TOUR_MODES`, remembered in localStorage `fm_demo_tour_mode`):

- **Autoplay** (the default; Deepak's "driverless"): each step moves on by itself after its own time,
  worked out from how much the card says (`autoplayDuration`: about 300 words a minute plus a beat,
  within 5–15 s) or set on the step (`duration`). A line along the card's foot fills as it runs.
  Pause holds it, and so does pointing at the card or the page being hidden. Next and Back still work.
  The whole tour plays through; a chapter or section stops on its end card.
- **Step by step** ("guided"): waits for Next, as before.
- **Explore** ("unguided"): no step cards and no dimmed page. The outline pane is the tour: a click
  takes the visitor to that part's page and pulses an outline around where it is. Switching back to
  Autoplay or Step by step shows the card where the visitor is.

A deep link can name its mode, `?guide=files&mode=step`; otherwise it plays in the visitor's own
mode (Autoplay at first).

## Deep links

- `?guide=<nodeId>` on any `/tour` route starts that chapter or section: no intro modal, even for
  visitors who chose "Don't show this again". The tour navigates to its first step, replacing the
  URL so Back doesn't land on the deep link. An unknown id is ignored.
- `tourGuideHref(id)` is `/tour?guide=<id>`; the first step carries its own route.

## Runs, the step card and the end card

- A run is one node with everything under it, or the whole tour.
- Starting a run (a node, the whole tour, Resume, or a jump from the outline pane) navigates to the
  step's page first, then runs Joyride, keyed per run.
- The tour scrolls each target into view itself (`scrollIntoView`, nearest) and Joyride never
  scrolls: Joyride's own animated scroll left steps waiting with no card mid-run.
- Steps whose target opens from the URL and animates (the right pane, the profile menu) wait a
  little longer (`settle`), or the card points at where the target was mid-animation.
- The step card shows where the step sits ("Engagements › Files › Details") above its title, and
  counts within that section.
- **A chapter or section ends** on an end card: "Next: <what follows in the outline>", Done, and
  "All chapters". **The whole tour** runs straight through and ends on the outro modal.

## The outline pane

`demo-tour-outline.tsx`: a pane that floats in a bottom corner while a run is on (or while
exploring), above the tour's dimmed overlay. Under its header, the mode switch: the current mode by
name, the others as icons. It lists the chapters with the icon of their page in the app, opens the current one
to its sections (and the current section to its own), marks where the run is and what's been seen,
and goes anywhere on a click: within the run, or as a new run of that part. It shows the step count,
folds to one line, and closes the tour (progress saved).

It floats rather than docks: docked, it took 240px from the page, and the Files table dropped its
Status and Due columns at laptop widths, breaking those steps. It moves to the other corner when the
current target would sit under it. Hidden below 1024px, where the step card's breadcrumb says where
the visitor is.

## The picker

The intro modal opens with the mode switch (Autoplay selected at first) and a line on what the mode
does, then lists the chapters with their icons; a chapter's sections are links under it, so any part
starts with one click, in the chosen mode. The primary button follows the mode: "Play the whole
tour", "Take the whole tour" or "Start exploring". With unfinished
progress it offers Resume beside "Take the whole tour".

## Progress

localStorage `fm_demo_tour`: `resume: { scope, step }` (scope null for the whole tour) and
`completed: string[]`, the nodes whose own steps were all seen. A node shows as seen when every part
of it with steps is. Older `stepIndex` progress is ignored. `fm_demo_tour_never_show` is unchanged.

## Real-app entry points (new UI only)

"How this works" beside the page title (`components/ui/how-this-works-link.tsx`, `PageHeading`'s
new `titleAside` slot) opens the page's part of the tour in a new tab.

| Page | Opens |
|------|-------|
| Engagement page (`EngagementHeader`; follows the open tab) | Overview → `engagement-overview`, Files → `files`, Board → `board`, Discussions → `discussions`, Members → `engagement-members`, Audit → `engagement-audit`; none on Settings or Wiki |
| Firm Overview, Clients, Calendar, Audit (`FirmClientsView`) | `firm-overview`, `all-clients`, `calendar`, `firm-audit` |
| Doc Search (`GlobalSearchView`) | `doc-search` |

Hidden for client roles: on the engagement page for `eng_ext_collaborator` and `eng_viewer` (and
"view as" one); on firm pages for external-only users. The loading state keeps the link
(`EngagementChromeSnapshot.tourLinks`).

**Later:** empty states (Board, Discussions, an empty folder) link their section with the same
component; Brio's answers can end with a "See how" link from `tourGuideHref`.

## Guarding against drift

`lib/demo/tour-chapters.test.ts`: every step's target exists as a `data-demo-tour` value in the
components; every node is listed once in order, Firm before Clients before Engagements; every leaf
has 1–6 steps; every node is reachable by its deep link and has steps to run; "next" follows the
outline; the engagement tabs map to the right sections; the modes parse from a deep link and
Autoplay is the default; step times stay within bounds. `engagement-header.test.tsx` checks the
link's `href` and new tab. The tour also warns in development when it skips a step.

## Out of scope

- Client-role tours (a client's view of the portal).
- Mock pages for Contacts, Billing and Profile (follow-up if wanted), and View As.
- Video or GIF captures, chapter analytics, translation.
- Making the tour's other inert actions work (New client, Invite, Upload menu).
