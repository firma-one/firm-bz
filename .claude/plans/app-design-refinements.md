# App design refinements: Notion's language, one status language, more feedback

Status: **design approved** (2026-10-22). Wave 1 committed on `dev` (97fcc8f3), Wave 2 (16acccb0); Wave 3 built, in review. Build in three waves (section 6),
each committed on `dev` and reviewed before the next.

**Direction:** stay conservative. Keep Notion's design language: black, gray and white, with Notion's
colored chips. No new decorative color: no gradients, no colored rings or glows, no accent-colored Brio
treatment. The firm's theme color stays only where it already is (primary buttons, links, focus rings).
Color appears for three things only: **status**, **danger** and **Brio's mark**.

Mockups: the "App Design Refinements" canvas (https://claude.ai/artifact/4o62ia8m5eLBaYXCna1uo2). It
holds only approved designs: the refined Engagement Overview, the Action Center as a Linear-style list,
Brio's work (icon actions and the byline), the Board at rest (a just-approved card and its toast), the
Board while dragging, and the status sheet (the seven stages and every lifecycle mapped onto them).

Scope: the authenticated app (`app/(app)`), every screen. Not the marketing site, legal pages or
`/system`. `/tour` reuses the app's shell pieces, so it picks the changes up and doubles as the visual
check.

This plan **amends `.claude/plans/ui-ux-overhaul.md`** (Phase 6): line 317 "Cards have none (border
only)" gains the Notion card shadow for cards you open or drag; line 320 "120ms ease on hover … remove
the arrival animations" gains the motion tokens and the few transitions below. Line 683 ("no shadow on
in-page cards") still holds for page sections. Wave 1 adds a short design system section there that
points here.

---

## 1. Principles

1. **Notion's palette.** Black, warm grays and white. Status uses Notion's lighter, pastel hues
   through the status language (section 2). User-chosen labels keep Notion's tag palette.
2. **One status language.** Every lifecycle in the app maps onto the same seven stages, each with one
   icon and one pastel. People learn it on the Board and read it everywhere.
3. **Red only for danger:** overdue dates, destructive actions, errors and the "Needs fixing" stage.
4. **Depth means you can pick it up.** Cards you open or drag get Notion's card shadow,
   `0 0 0 1px rgba(15,15,15,.1), 0 2px 4px rgba(15,15,15,.1)`, and a warm hover background. No lift, no
   glow. Page sections stay flat.
5. **Work queues stay Linear.** The Action Center, Inbox and Home "Needs you" are dense lists with the
   count at the end of the row.
6. **Brio says what it wrote, in plain text,** and its actions are icon buttons with tooltips.
7. **Every state change the user makes gives feedback.** Approvals that are silent today get a toast
   and, where the item is on screen, its green "Approved" chip.
8. **Motion is quiet, tokenized and respects reduced motion,** including framer-motion, the toast tick
   and `tailwindcss-animate` (none of which do today).

## 2. The status language

### Stages

| Stage | Icon | Pill (bg / text) | Icon color | Meaning |
|---|---|---|---|---|
| Not started | empty circle | `#ebeae7` / `#5f5e5b` | `#9b9a97` | Nothing has happened yet |
| Underway | half-filled circle | `#e1eef7` / `#2b6491` | `#5a9bd4` | Work is moving |
| Waiting on someone | three-quarter circle | `#f9eecf` / `#8a6418` | `#dba940` | A review, a reply or an acceptance |
| Done | filled check | `#dfeedd` / `#2f6b4b` | `#5aa77a` | Finished and accepted |
| Paused | pause circle | `#f1e8e4` / `#7a5443` | `#b28a77` | Stopped for now, can resume |
| Closed | muted filled check | `#ebeae7` / `#5f5e5b` | `#b9b8b5` | Over, kept for the record |
| Needs fixing | filled alert circle | `#fbe4e4` / `#a8352f` | `#d9625a` | Expired, failed or revoked |

Values are from the canvas; they become tokens (`--ui-status-<stage>-bg|fg|icon`). Pill text clears
4.5:1 on its pill (4.6 to 5.5:1, checked). The pastel icons do **not** reach 3:1 (about 1.7 to 3.6:1), so
an icon is never the only cue: it always sits next to a label (the pill) or inside a labeled lane, and
where it stands alone (before a card's code, in a sidebar row) it carries visually hidden text naming the
status. "Overdue" is not a stage: it's a red date on whatever stage the item is in.

### Every lifecycle, mapped

| Lifecycle (enum) | Values → stage | Where it shows |
|---|---|---|
| Deliverable stage (`ActivityStatus`) | To Do → Not started · In Progress → Underway · In Review → Waiting · Approved → Done | Board, detail pane, Inbox, calendar, Home |
| Engagement (`EngagementStatus`) | Planned → Not started · Active → Underway · Paused → Paused · Completed → Done | Engagement header, sidebar, tables, Home |
| Client (`ClientStatus`) | Prospect → Not started · Active → Underway · On hold → Paused · Past → Closed | All clients, client header |
| Invitation (`InvitationStatus`) | Pending → Waiting · Accepted, Joined → Done · Superseded → Closed · Expired, Error → Needs fixing | Members, Action Center |
| Storage connection (`ConnectorStatus`) | Active ("Connected") → Done · Expired, Revoked, Error → Needs fixing | Settings, Files |
| Support ticket (`TicketStatus`) | New → Not started · In progress → Underway · Resolved → Done · Closed → Closed | Support |

`DocumentStatus` (file processing) and `DocumentSharingPermissionStatus` stay internal and aren't shown
as statuses.

### In code

- **`lib/ui/status.ts`:** a registry of `Record<Enum, { stage, label }>` per lifecycle. TypeScript makes
  each record exhaustive, so a new enum value can't ship without a stage.
- **`StatusIcon`** (`components/ui/status-icon.tsx`): the stage's icon at 13 to 16px, `aria-hidden`.
- **`StatusPill`**: the icon plus the label in the stage's pill colors. Used wherever a status is
  shown, including as group headers (Board lanes, Home "By status").
- A test asserts every enum value of every lifecycle above has a registry entry and a label.

## 3. Patterns

| Pattern | What it is | Where |
|---|---|---|
| Status | `StatusPill` / `StatusIcon` | Every status in the app (section 2's table) |
| Things you open or drag | `InteractiveCard`: Notion card shadow, warm hover, focus ring | Board cards, Home "Continue", client gallery, workspace and firm pickers |
| Groups of work | Lanes: a status pill header, sized to their contents at rest, stretched into drop zones while dragging | Board; any grouped view with drag |
| Work queues | Linear-style list rows: icon, label, muted explanation, count at the end | Action Center (engagement and firm), Inbox, Home "Needs you" |
| Brio and feedback | `BrioByline`, icon actions with `Hint`, toasts with the green chip | Engagement summary, firm brief, approvals and other state changes |
| Loading the workspace | `WorkspaceLoader`: white canvas, a small gray arc, one muted line; no card | Auth check, `/d` landing, the arrival overlay |

## 4. Tokens and shared pieces

**Tokens** (`app/ui-tokens.css` + `tailwind.config.js`):

| Token | Value | Use |
|---|---|---|
| `--ui-shadow-card` | `0 0 0 1px rgba(15,15,15,.1), 0 2px 4px rgba(15,15,15,.1)` | Cards you open or drag |
| `--ui-status-*` | Section 2 | Status pills, icons, Board lane tints and hairlines |
| `--ui-ease-out` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Expands and enters |
| `--ui-dur-fast/base/slow` | `120ms / 200ms / 320ms` | Hover / enter / expand |

Tailwind: `shadow-card`, `bg-status-*`, `text-status-*`, `ease-ui-out`, `duration-ui-*`.

**Shared pieces:**

- **`InteractiveCard`** (new, `components/ui/interactive-card.tsx`): `rounded-card` with `shadow-card`,
  the warm hover background (`surface-hover`) and the focus ring. Replaces the hand-rolled classes in
  `ContinueSection`, the `ClientList` gallery, `WorkspaceCard` and `FirmList`, and is the shell of the
  Board's `DraggableCard`. Their current `border` + `hover:border-line-strong` becomes the shadow's 1px
  ring.
- **`ActionSection`** (`components/dashboard/action-list.tsx`, shared by the engagement and firm Action
  Centers): one list, one row per check (icon, label, short muted explanation, count at the end), hover
  background. Delivery and Housekeeping merge into one list and are grouped only inside the disclosure.
  "N checks passed" gets a height-and-fade transition (`--ui-dur-slow`) and a turning chevron; the
  clear checks inside are muted rows with a gray check. Severity stays in the icon color (red only for
  critical).
- **`BrioByline`** (new, next to `components/ui/brio.tsx`): "Written by Brio · reviewed and published
  by {name} · {date}" in muted text under Brio-written content. The `<Brio>` mark is unchanged.
- **Approval feedback** (`lib/ui/use-approval-feedback.ts`): shows the success toast and, when the item
  is on screen, lets its "Approved" chip fade in. No rings or celebrations. The same helper serves
  other state changes (an invitation accepted, a storage connection restored).
- **Tooltips: always the app's `Hint`** (`components/ui/tooltip.tsx`: Radix, the light variant, white
  with `shadow-popover`, 300ms delay). Never a native `title` attribute: browsers draw and time it
  differently, which is why `Hint` exists. Every icon-only button gets `Hint` plus an `aria-label`
  (the tooltip isn't announced as the button's name). The older `Tip` (`components/ui/tip.tsx`, legacy
  slate classes, 3 importers) isn't used for new work. Native `title` attributes on surfaces each wave
  touches are swapped for `Hint` along the way (about 148 remain in `components/projects`, `home` and
  `dashboard`).
- **Toast** (`components/ui/toast.tsx`, ~30 callers): the success tick gets a reduced-motion fallback.
- **Motion:** wrap the app shell in framer's `<MotionConfig reducedMotion="user">`, and add one
  `motion-reduce` rule for the `tailwindcss-animate` enter/exit classes.

## 5. Board lanes (decided 2026-10-22)

Canvas boards: "Board · at rest" (with a just-approved card and its toast) and "Board · while
dragging".

- **Status:** each lane's header is a `StatusPill` (icon, name) with the count beside it. The same
  `StatusIcon` sits before each card's code, replacing the boxed package tile. Progress bars use the
  stage's soft hue. The hard-coded Approved tint `#0d9f5f` goes.
- **At rest, the middle ground:** each lane is a rounded container **sized to its cards** (it does not
  stretch to the tallest lane), with about half the stage tint and a 1px hairline in the lane's hue.
  Short lanes end with their last card, so empty space stays white. Rough values: To Do `#f9f9f8` /
  `rgba(55,53,47,.07)`, In Progress `#f7fafd` / blue at .18, In Review `#fefbf4` / yellow at .2,
  Approved `#f6faf5` / green at .18.
- **Cards:** `InteractiveCard`. Overdue dates are the only red.
- **While dragging:**
  - Every lane stretches to the board's full height, so the whole column is a drop zone.
  - The lane under the pointer is the target. It gets the full tint, a 1.5px dashed outline in its hue
    and a dashed landing slot where the card will go ("Move to In Review").
  - The dragged card lifts with a deeper shadow and a slight tilt (about 2.5°), and its old spot fades
    to about 35% opacity.
  - Lanes the user can't drop into (Approved for non-admins, per `deliverable-stage-roles.ts`) don't
    highlight as targets.
  - Under reduced motion there's no tilt and no stretch animation; the states just switch.
- **Drop and approval:** the drag overlay uses the card shadow scaled up instead of `shadow-xl`.
  Dropping into Approved plays the approval feedback; admins get **no feedback today**.

## 6. Rollout: three waves, each reviewed before the next

### Wave 1: foundation (almost no visible change)

- Tokens: the card shadow, the status palette, motion.
- `lib/ui/status.ts`, `StatusIcon`, `StatusPill`, with the exhaustiveness test.
- `InteractiveCard`, `BrioByline`, the approval-feedback helper.
- `MotionConfig` and the reduced-motion rule; the toast's reduced-motion fallback.
- The design system section in `ui-ux-overhaul.md` (stage table, patterns, color budget), pointing
  here; amend lines 317 and 320.
- **The workspace loader** (added 2026-10-22 at Deepak's request). Sign-in drew three different
  loaders: the auth check (a slate gradient), `/d` resolving where to land (a white card with
  `shadow-xl` on the legacy `#f9f9fb`, "Loading your workspace..." and "This will only take a
  moment"), and the arrival overlay (the same card, then a large brand-colored check and "Welcome
  back!"). One `WorkspaceLoader` (`components/app/workspace-loader.tsx`) now draws all three: the
  white canvas, a small gray arc and one muted line, no card or shadow; the welcome step uses the
  status language's Done check, "Welcome back, {name}" and "Your workspace is ready." It stays
  fully opaque (the shell loads behind it) and fades rather than zooms.
  Revised the same day: the spinner became a mark from the status language. While loading, the
  Underway ring fills and empties like a stage icon moving along and turns slowly; on arrival it
  becomes the Done check, which pops in and draws its tick. Still under reduced motion. The welcome
  step had never shown for returning users: they land on Home (`/d/u/home`), which had no
  `?landed=` handling, so Home now gets `?landed=returning` and the shared `LandingArrival`.

### Wave 2: the engagement core

| Surface | Change |
|---|---|
| Board (`DraggableCard`, `engagement-shares-tab.tsx`) | Section 5 |
| Deliverable detail pane (`deliverable-detail-panel.tsx`) | The stage selector shows `StatusIcon`s; approval feedback (document approval has **no feedback today**) |
| Engagement header (`engagement` page header) | Its status chip becomes a `StatusPill` |
| Engagement Overview Action Center (`EngagementActionCenterV2`) and Firm Overview `FirmActions` | The `ActionSection` list |
| Engagement Summary card and Publish (`engagement-insights-dashboard.tsx`, `summary-draft-review.tsx`) | `BrioByline`; publishing gets a toast (none today); the header's text buttons become 28px icon buttons with `Hint` and an `aria-label`: Edit (pencil; Add, a plus, when there's no summary yet), Copy, and Rewrite with Brio (the sparkle, in Brio's green) |
| Client intake Approve buttons (`handleIntakeAction`) | Approval feedback; **none today** |

**Built 2026-10-22 (on `dev`), with these calls made along the way:**
- Into another lane, a dropped card lands in the landing slot at the end of that lane (where the
  drop zone shows it going), not before the card under the pointer. Within a lane, reordering is
  unchanged.
- The engagement header's chip comes from the shared `StatusProperty` cell, so the client header,
  the engagement and client settings forms and the Add Client and Add Engagement dialogs got the new
  `StatusPill` now rather than in Wave 3. The old dot-style `StatusPill` (`components/ui/tag.tsx`)
  and the old `ActionSection` stay, unused or deprecated, until sign-off.
- Approving a document inside a deliverable (the detail pane's document rows) also gets the approval
  feedback, and a failed change there now reverts with an error instead of failing silently.
- The Board's intake actions confirm with the same titles the Files view already uses ("File
  approved", "Folder rejected", "Upload withdrawn").
- The Summary card's relative "2d ago" chip went: the byline dates the summary now.
- The tour's own copies (`demo-engagement-board.tsx`, `demo-summary-card.tsx`) and its Action Center
  were updated to match, so `/tour` shows Wave 2.
- Not checked in a browser: the drag state on the real Board (the app needs a sign-in; the tour's
  Board is static). Type-checked and tested only.

### Wave 3: everywhere else

| Surface | Change |
|---|---|
| Home (`home-view.tsx`) | "Continue" cards become `InteractiveCard`; "My engagements" groups and rows use `StatusPill`; "Needs you" rows use `StatusIcon` |
| Inbox (`inbox-view.tsx`) | Items show the deliverable's `StatusIcon` |
| Sidebar engagement rows (`sidebar-v2.tsx`) | The engagement's `StatusIcon` instead of the small dot |
| Client and engagement tables, client header | Status columns and chips use `StatusPill` |
| Calendar (`calendar-view`) and Home agenda | Deliverable due chips lead with `StatusIcon` |
| Members and invitations | Invitation status uses `StatusPill`; resend gets feedback |
| Storage connection (Settings, Files) | Connection health uses `StatusPill` (Connected / Needs fixing) |
| Firm Overview brief (`ai-firm-brief.tsx`) | Its "Written by Brio …" footer moves to `BrioByline` styling (no publisher: the brief has no review step) |
| Pickers and galleries (`WorkspaceCard`, `ClientList` gallery, `FirmList`) | `InteractiveCard` |
| Files: Brio task cards (`agent-prompt-card.tsx`, legacy gray classes) | Move to the app's tokens |
| Support tickets | Ticket status uses `StatusPill` |
| Engagement Overview data visuals (`insight-rings.tsx`, `engagement-overview-sections.tsx`, `overview-charts.tsx`), added 2026-10-22 | One data palette, the Board's. See "Data colors" below |

**Data colors (added 2026-10-22, at Deepak's request).** The Overview drew its charts from its own
`RING` palette (Tailwind amber-300, brand blue `#5A78FF`, indigo-400, brand green `#069668`, red-400,
slate-300), which contradicted the Board: To Do amber and In Review indigo on the Overview, gray and
amber on the Board; the deliverable list's chips had To Do yellow and In Review purple. The mapping:

| Visual | Becomes |
|---|---|
| Deliverable stages (deliverable list bars, Status donut) | The stage bar hues: To do gray, In progress blue, In review amber, Approved green |
| Deliverable list chips | `StatusPill`; an overdue due date in red; no "Overdue" pill |
| An overdue deliverable's bar | `--ui-status-problem-bar`, the only red |
| Health and score bands (Overall Health, File Organization score and its chip) | Good: done green · needs attention: waiting amber · at risk: problem red |
| Score deductions | High red · Medium amber · Low gray |
| Pace | Delivered in done green; behind (slightly or not) amber; red only for past due (the firm's Overdue), never for pace alone. One rule, `paceStage` in `lib/insights/pace.ts`, for both Overviews |
| Comment responsiveness | Resolved done · Flagged open waiting · Unanswered problem |
| Team: on team vs invited | Joined done · Invited waiting (the invitation mapping) |
| Categorical (by role, internal vs external) | Two warm grays: these aren't statuses, so they borrow no status color |

Rules: data visuals use the status tokens only; the firm's action color never appears in a chart (a
firm's theme would otherwise change what its charts mean); `RING` is retired.

Unchanged on purpose: the Ask Brio launcher and panel; engagement and firm Overview cards (flat);
user-chosen labels (Notion's tag palette).

**Wave 3 built 2026-10-22 (on `dev`), with these calls made along the way:**
- The Inbox's notifications carry no deliverable stage, so the icon follows the notification type:
  an upload to review is Waiting, a document the client accepted or an invitation accepted is Done,
  a rejected document is Needs fixing. Other notifications and reminders keep no icon.
- The Home agenda's overdue chips and the calendar's deliverable and document chips lead with the
  stage icon; engagement events keep their briefcase.
- Resending an invitation already showed a toast; it now uses the shared feedback (the toast,
  "Invitation resent · {email}", and the pill fading in), in all three member lists.
- The firm brief got the engagement summary's icon actions too (Copy, Rewrite with Brio), not only
  the byline, so Brio's two pieces of writing look the same.
- Pace: on pace is Done, behind is Waiting. A first cut made "far behind" red on the engagement
  Overview only; replaced the same day by one rule for both Overviews (`paceStage`), where red is
  kept for past due.
- Roles and internal vs external use a four-step warm gray ramp (`--ui-data-category-1…4`).
- `SidebarItem`'s tooltip is now a `Hint` for every sidebar row, and the collapse button's too.
- A prospect in the client gallery keeps its dashed edge instead of the card shadow.
- Left as they were: the support ticket status dropdowns (the select's trigger clips a pill), the
  tour's own Members, Calendar and Inbox copies, and the legacy, unrendered charts in
  `engagement-insights-dashboard.tsx` (`EngagementHealthBody`, `DeliveryTimeline`), which still
  use the deprecated `RING`.

**Document action menu (added 2026-10-22, at Deepak's request):**
- Grouped by intent: Open, Copy link, Download · Bookmark, Due date · Organize ›, Details ›, Drive
  actions › · Move to trash, last. Folders follow the same order.
- The header names the file in full (two lines), then its code and `StatusPill` where the stage is
  known, its real type (an .xlsx said "Document": every OOXML mime type contains "document"), and
  "Modified {date} by {name}".
- The due date shows on its item, red when overdue. The bookmark fills in the text color, not green.
- "Info" became "Details"; labels are sentence case; tooltips are `Hint`; submenus size to their
  longest label ("Copy to another engagement…" was cut off).
- "Bin" became "trash" across the app (American English): menus, confirmations, toasts, the Undo
  route's errors, comments and tests. OneDrive keeps its own "Recycle bin".
- Not built: a Status submenu. The Files listing doesn't carry a file's stage (only deliverable
  folders have one), so it needs that data first; where the stage is known (the Board, the detail
  pane) it already has its own control.

**Firm Overview colors (added 2026-10-22, at Deepak's request):** the Engagements card's bar and
legend, the "N need attention" headline, the rows' time bars and pace pills move from their own
`PACE_HEX` (old `RING` plus a hand-picked orange and slate) to the status palette, by the shared pace
rule; pills are plain stage pills (`StagePill`), not dotted tags. The revenue pipeline and engagement
types take the warm gray ramp (they're categories); a prospect's "Soon" is a Waiting pill.

## 7. Data change (for the byline)

- The engagement summary already stores `publishedByUserId`, `source ('ai'|'manual')` and the draft's
  `reviewedByUserId` in `Engagement.settings.insightsSummary` (`lib/ai/engagement-summary.ts`).
- The insights API (`lib/insights/engagement-insights.ts`) sends only the text and `publishedAt`. Add
  `source` and the publisher's display name (members are already loaded there). No migration.
- Show the byline only when `source` is `'ai'`; a hand-edited summary says "Edited by {name}". Older
  records without `publishedByUserId` show "Written by Brio · {date}".
- Everyone who can see the summary sees the byline, clients included (Decision D).

## 8. Keeping it consistent

- The design system section in `ui-ux-overhaul.md` is the reference: stages, patterns, color budget.
- The registry's exhaustiveness test catches unmapped statuses.
- Charts and data visuals take their colors from the status tokens (or the two categorical grays),
  never from the action color or a hand-picked hex (Wave 3, "Data colors").
- After each wave: a browser pass on `/tour` with reduced motion on and off.
- Checks per wave: `tsc`; the existing component tests (`firm-actions.test.tsx` and friends); new
  tests for the status registry, the byline mapping and the merged Action Center list.

## 9. Decisions

- **A. Action Center.** Decided 2026-10-21: the Linear-style list.
- **B. Brio's color.** Superseded by the conservative direction: no new color treatment for Brio; the
  `<Brio>` mark stays as it is.
- **C. Status colors.** Decided 2026-10-21 (Notion's hues), refined 2026-10-22 (pastel versions,
  Linear-style icons, the middle-ground lanes), and extended app-wide by F.
- **D. Byline for client users.** Decided 2026-10-21: everyone sees the publisher's name.
- **E. Branch.** Decided 2026-10-21: the website shipped first (PR #126, 2026-10-22). Revised
  2026-10-22: built directly on `dev`, no feature branch.
- **F. App-wide status language.** Decided 2026-10-22: every lifecycle maps onto the seven stages
  (section 2), rolled out in three waves (section 6).
- **G. The standard table.** Decided 2026-10-21: the database grid (section 10), picked from four
  drawings on the canvas (open, hairline rows, grid, contained).

## 10. The standard table

Every table is `NotionTable` (`components/ui/notion-table.tsx`), drawn as Notion's database grid:

- Hairlines above and below the header, between rows and between columns; no outer border on the sides.
- 34px header and rows; a muted header with a typed icon per column; hover and selected tints.
- A trailing actions column (`NotionTableActions`, `NotionTableActionsHead`) with no column line before
  it; its contents show on row hover.
- Lines sit on cells, not rows (`border-separate`), so a sticky header keeps them. A hand-written row
  (a group header, a loading row) puts `border-b border-line` on its cell.
- `variant="hairline"` keeps the earlier row-dividers-only style for any table that should stay quieter.
- The Files list is a CSS grid, not a table (drag and drop, selection, columns that hide as the pane
  narrows), so it draws the same look itself: `FILE_TABLE_COL_LINE_CLASS` in
  `engagement-file-table-grid.ts` puts a column line in the gap before Name, Owner, Modified, Due and
  Size; header and rows are 34px, the header has lines above and below, and the rows end on a line.

Audit is the first table built on it, with the columns from the canvas mock (option B):
Date · Event (the scope's icon and the action as a tag, red only for a deletion) · Scope (Firm, Client,
Engagement or File; firm-wide log only) · Details (takes the remaining width; the "approved by" clause
muted) · Where (Client › Engagement, firm-wide log only; firm events name the firm) · Actor. The table is `table-fixed` so the set widths hold. The CSV export keeps
its columns.

## 11. Files (decided 2026-10-22)

From the canvas's section 7 (the full "views" redesign was judged too extreme; these parts were kept):

- **Two toolbar rows.** First the breadcrumb and item count ("5", or "4 of 6" while filtered); then the
  filter pills on the left and two quiet 28px icons (Search, Refresh) on the right. (Built first as one row;
  Deepak split it 2026-10-22 — the breadcrumb needs the room.) The separate count row is gone.
- **Selection bar.** While files are selected, the second row reads "N selected · Download · Move to trash ·
  Clear (Esc)". Bulk Download and Trash no longer sit in the toolbar, disabled, the rest of the time.
- **Row tools on hover.** Preview, Copy link and ⋯ show on hover or focus, while the row is selected or its
  menu is open, and always on touch screens. The Name cell spans the badge and tool tracks, and hidden tools
  take no width, so a name runs on as far as the row allows.
- **Deliverables toggle.** A toggle pill shows only deliverables, what's inside them, and the folders above
  them.
- **Status and Due columns.** Status is the deliverable's stage (the Board's pill); Due is editable in place
  for files and deliverable folders. For a deliverable or a document inside one, an empty value reads
  "Not set"; folders inside a deliverable only organize it, so they have neither (a dash, not editable), as
  other rows. Columns hide from the right as the pane narrows: Size, Modified,
  Owner, Due, then Status.
- **Status changes in place.** On a deliverable or a document inside one, the Status cell is a picker
  offering only the stages the viewer's role may move it to, from `getAllowedTransitions` — the rules the
  Board and the server already share (lead: one step either way, and approve; member: one step either way,
  no approval; external collaborator: In progress → In review; viewer: In review → In progress; nothing
  leaves Approved). As on the Board, a deliverable isn't approved while a document inside it isn't. The
  listing now returns every document's own stage (`activityStatus`), so documents inside a deliverable
  show theirs. The tour's visitor gets the lead's moves.
- **One deliverable icon, everywhere.** lucide's folder-plus (Deepak, 2026-10-22): in the primary color
  where it stands alone (`DeliverableIcon`, `DeliverableGlyph`) — Files rows, the Board, the action menu's
  header, the deliverable panel, the share dialog, the Inbox, Home, the calendar's event dialog — and in
  the surrounding color inside calendar chips, filter pills (Files' Deliverables, Doc Search) and section
  headers (the Overview's Deliverables and Status). No package icons remain. A folder inside a deliverable,
  and a breadcrumb crumb that is or sits inside one, wear it a shade lighter; documents keep their file-type
  icons; rows inside a deliverable carry no trailing badge. A folder that only contains a deliverable keeps
  the shared-folder mark.
- **Promote and demote.** The menu says "Promote Folder to Deliverable" (folder-plus) and "Demote
  Deliverable to Folder" (folder-minus, in red), and so do their dialogs and toasts.
- **"Due", everywhere.** Field labels, column headers, tooltips and placeholders say "Due" (and "Start"),
  not "Due date". Sentences keep "due date".
- **Document action menu.** Stays three levels for now, made compact: 288px wide, 13px text, 26px rows,
  14px icons, a tighter header. Submenus slide 4px and fade in 100ms, without the zoom.
- **Created by, not Owner** (Deepak, 2026-10-22). Everything added through the app goes through the
  connector's Drive account, so Drive's owner was that account on every row. The column is now "Created
  by": the member who added the file in the app (`engagement_documents.createdBy`); for a file added
  straight in Drive, its Drive owner, by their member name when they're on the engagement, marked "added in
  Drive" in the profile popup — never the last modifier (`lib/files/file-creator.ts`). The People filter
  ("Created by me / others") and the menu's Details read the same value. External collaborators' intake
  uploads now record the uploader, so approval no longer credits the approver.
- **The tour mirrors every change** (`components/demo/*`), including the action menu, which the tour
  copies because the real one needs a signed-in session.

## 12. Due: one date picker (decided 2026-10-22)

The "Set due date" modal is retired: a modal whose only content was a field that opened a second popover,
time required, and a "UTC+05:30 · TZ" badge. One panel (`components/ui/due-picker.tsx`) now sets every due
date, in place:

- **Where:** beside the document menu's Due row (a submenu), under a table cell or header property
  (`DateProperty`), and as a Due row in the Promote dialog.
- **Date first:** a field that reads typed dates ("fri", "next week", "in 3 days", "oct 30", "10/30") and
  saves on Enter; quick picks (Today, Tomorrow, Next week, In 2 weeks) that preview their day in the
  calendar on hover; a Monday-first calendar where today is in the accent and the chosen day filled. A pick
  saves at once and closes.
- **Time only if added:** "Add time" shows a half-hour time list and the time zone (short, full name on
  hover). Engagement Start and Due stay days.
- **Stored values** (`lib/ui/due-date.ts`): a day alone is saved as "yyyy-MM-dd" (stored at UTC midnight,
  read back as that day); a day with a time as an ISO instant. Table cells show the compact form
  ("Oct 30 · 3:30 PM"), so Files' Due column is 128px.
- The tour's menu and Due cells use the same panel; Due is the one action that works there.
