# Keeping /tour and the app in sync

`/tour` is a static copy of the app over sample data (`components/demo/*`). The standing rule is that
every app UI change also lands there, but nothing enforces it: drift is found by eye. The tests in
`lib/demo/` check the tour against itself (step targets exist, narration, sample data). No test renders a
demo component beside the real one, and there are no browser tests.

## How drift gets caught

In order of preference:

1. **One component, used by both.** Where the two are the same markup, share it, so they can't drift and
   no test is needed. `BlockedTag` and `MissingDueWarning` already work this way.
2. **Render both and compare what a person sees**, in vitest (`components/demo/tour-parity.test.tsx`): the
   same state on each side, reduced to labels and icons. Fast, and it runs in the suite and the pre-push
   hook's tests.
3. **Not browser screenshots, for now.** Pixel tests would flag every intended tour difference and are
   slow. Visual checks stay a manual step.

## What differs on purpose

The tour isn't identical, and the test must say so explicitly rather than looking away:

- Actions that do nothing there (inert items, "(not in this demo)" hints). They must still be present, in
  the same place. That's what's compared, so these need no allowance.
- `Open` reads "Open in Google Drive" as its accessible label on the tour, where the storage is fixed.
- The ⋮ trigger is labeled "Actions for {name}" on the tour and "More actions" in the app.

The last two are `ON_PURPOSE` at the top of the test. A new difference fails until someone decides it
belongs there. (The note at the foot of the tour's ⋮ menu isn't a menu item, so it isn't compared.)

## First round

- **Table columns:** a shared header component, plus a check that each row's cells run in the header's order.
- **Private mark:** a shared component.
- **Row quick actions:** labels, icons and order, for a file, a folder and a link-free deliverable.
- **⋮ menu:** items, icons, separators and order, submenus included, for each kind of row.

All as a firm lead sees them, because that's the view the tour shows.

## Built (2026-11-07)

- `components/projects/file-table-header-cells.tsx` and `components/files/private-mark.tsx`: shared by both.
- `components/demo/tour-parity.test.tsx`: quick actions and the ⋮ menu for a document in a deliverable, a
  folder in one, a deliverable and a plain folder; each row's cells against the header's order; the mark.
- Proved by changing each side and watching it fail: a new or reordered quick action, Open's icon, a renamed
  menu item, cells out of order.
- It found real drift on its first run, all fixed on the tour: a file's menu offered Comment, which the app
  had dropped (the guided tour's wording said so too, and its clip was remade); a folder's Organize was
  missing Duplicate and Copy to…; "Open folder in Drive UI" had a generic icon, not the Drive logo.

## Next candidates (not in this round)

Board cards and lanes, the Details pane fields and tabs, the deliverable pane, filter pills, a client's
view of the menu (the tour has none).

## Not guarded

- Bookmark on the strip: the tour has no bookmarked rows.
- Other states of the menu: approved, finalized, pending review, a client's view. Only a firm lead's view of
  an open document or folder is compared; a change to an approved row's greyed items won't fail here.
- The ⋮ menu's header, and the Status, Due and Assignee cells' contents.
- Anything visual: spacing, color, tooltip text outside the shared components.
- Behavior: a check that an action is present doesn't check that it does the same thing.
