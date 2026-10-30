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

How a run plays, picked on the tour panel's start and switchable mid-run from its mode pill
(`TOUR_MODES`, remembered in localStorage `fm_demo_tour_mode`):

- **Autoplay** (the default; Deepak's "driverless"): each step moves on by itself after its own time,
  worked out from how much the card says (`autoplayDuration`: about 300 words a minute plus a beat,
  within 5–15 s) or set on the step (`duration`). A line along the card's foot fills as it runs.
  Pause holds it, and so does pointing at the card or the page being hidden. Next and Back still work.
  The whole tour plays through; a chapter or section stops on the panel's ending.
- **Step by step** ("guided"): waits for Next, as before.
- **Explore** ("unguided"): no step cards and no dimmed page. The tour panel is the tour: a click
  takes the visitor to that part's page and pulses an outline around where it is. Switching back to
  Autoplay or Step by step shows the card where the visitor is.

A deep link can name its mode, `?guide=files&mode=step`; otherwise it plays in the visitor's own
mode (Autoplay at first).

## Deep links

- `?guide=<nodeId>` on any `/tour` route starts that chapter or section: no start panel, even for
  visitors who chose "Don't show this again". The tour navigates to its first step, replacing the
  URL so Back doesn't land on the deep link. An unknown id is ignored.
- `tourGuideHref(id)` is `/tour?guide=<id>`; the first step carries its own route.

## Runs, the step card and the ending

- A run is one node with everything under it, or the whole tour.
- Starting a run (a node, the whole tour, Resume, or a jump from the tour panel) navigates to the
  step's page first, then runs Joyride, keyed per run.
- The tour scrolls each target into view itself (`scrollIntoView`, nearest) and Joyride never
  scrolls: Joyride's own animated scroll left steps waiting with no card mid-run.
- Steps whose target opens from the URL and animates (the right pane, the profile menu) wait a
  little longer (`settle`), or the card points at where the target was mid-animation.
- The step card shows where the step sits ("Engagements › Files › Details") above its title, and
  counts within that section.
- **Autoplay's clock** (2026-10-30): one inset bar at the top of the step card, for this step's time
  only; where the visitor is in the tour stays in the panel, since a bar for 50-plus steps says
  little. Pausing, or pointing at the card to read it, holds the clock and greys the bar. A pause
  also says "Paused" at the bar's end and turns Pause into Play. ("Paused" was meant to sit beside
  the step count, but on a whole-tour run the footer has no room: "Skip tour", Play, Back and Next.)
- **A chapter or section ends** on the panel's ending: "Next: <what follows in the outline>", Done,
  and "All chapters". **The whole tour** runs straight through and ends on "That's the tour".

## The tour panel

`demo-tour-panel.tsx`: one panel, the product tour's start and its outline, always in the
bottom-right corner (2026-10-30, after Deepak found the modal plus a separate pane confusing, the
mode switch unclear, and the pane's side-to-side jumps disconcerting).

- **Start** (first visit, the map icons, coming back): "Product tour", a line on the sample data, the
  three modes as cards (icon, name, "Plays itself" / "You click Next" / "You click around"; the
  chosen one tinted, bordered and checked), a Resume row when a run was left partway ("You stopped
  at Engagements › Files"), and the chapters: each row plays that chapter, a chevron opens its
  sections, each of which plays on its own. "Don't show again", Skip, and the primary button, which
  follows the mode ("Play the whole tour", "Take the whole tour", "Start exploring"). It is a
  dialog (focus kept, Escape closes), and the page behind is softly blurred until the visitor
  picks. On a first visit it waits for the cookie banner to be answered: both sit at the page's foot.
- **Running** (a run, or exploring): the same corner and rows. "Product tour" with the step count, the
  mode as a pill that opens the three to switch mid-run (Pause beside it in Autoplay), and the
  outline: chapters, the current one open to its sections, where the run is, what's been seen, a
  click to anywhere. It folds to one line and closes the tour (progress saved).
- **Ending** (2026-10-30): the same corner and glass, the page undimmed. The whole tour ends on
  "That's the tour": Replay (back to the start), Done, Sign up. A chapter or section ends on "That's
  Files · Up next: Engagements › Board": All chapters, Done, Next. These replace the centered end
  modals, which broke the one-panel model. Focus goes to the primary button; Escape is Done.
- **It keeps to its corner.** When the current step's target would sit under the open panel, it folds
  to its head in place and opens again on a step that leaves room. A target in the very corner (Ask
  Brio) moves the folded head just past it along the bottom edge, where the step card, which opens
  above the target, doesn't land; or just above it when there's no room beside it.
- It floats rather than docks: docked, it took 240px from the page, and the Files table dropped its
  Status and Due columns at laptop widths, breaking those steps. It sits above Joyride's dimmed
  overlay (z 10050) and below its step card (z 10150). Hidden below 1024px, where the step card's
  breadcrumb says where the visitor is.

### Frosted glass

The panel and the step cards are frosted (`TOUR_GLASS_CLASS`: 90% white over a blur
and saturation of the page, a faint edge; the step cards 97%, so their copy reads cleanly); the start's backdrop blurs the page softly instead of a
flat dim. Joyride's own overlay stays a plain dim, so the context around each highlighted spot stays
readable. Tour chrome only: the app's own surfaces stay solid. "Product tour" replaces "Guided tour"
wherever the tour names itself, since not every mode is guided.

## Progress

localStorage `fm_demo_tour`: `resume: { scope, step }` (scope null for the whole tour) and
`completed: string[]`, the nodes whose own steps were all seen. A node shows as seen when every part
of it with steps is. Older `stepIndex` progress is ignored. `fm_demo_tour_never_show` is unchanged.

**Rings** (2026-10-30): every row in the panel ends in a status ring, for a part and everything
under it.
- An empty ring: not started.
- A filling ring: the share of its steps seen. For the section the run is in, and the chapter
  around it, the ring fills as the run goes. In Autoplay it follows the step's clock
  (`lib/demo/tour-clock.ts`, kept outside React state so only the rings re-render, not the tour).
  Otherwise it moves a step at a time as each step comes on screen.
- A round check: seen.

The start panel shows the same rings, so a partly seen chapter's ring is partly filled; on hover, a
row's ring gives way to a play mark.

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
