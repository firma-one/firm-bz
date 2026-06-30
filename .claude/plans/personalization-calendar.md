# Personalization Calendar

> Referenced from: [docs/mvp/todo.md](../../docs/mvp/todo.md)

## Context

Users need a quick way to see upcoming reminders and schedule new self-reminders without navigating away from their current view. A dockable calendar panel in the TopBar — matching the existing Reminders, Recents, Bookmarks, and Notifications dropdowns — lets them glance at dates and click-to-create reminders in-place. The full-page calendar at `/d/u/calendar` gives a historical view and serves as the complete reminder timeline.

---

## What We're Building

### 1. TopBar Calendar Icon → Dockable Dropdown Panel

A new calendar icon button in `components/app/app-topbar.tsx` (right-side icon cluster, after Reminders and before Recents). Clicking it opens a dropdown calendar panel — same pattern as the existing `RemindersPanel`, `showBookmarksDropdown`, etc.

**Panel UI (matches screenshot):**
- Month/year header with `+` (add reminder) and `⋯` (future options) actions
- Week-row mini calendar: S M T W T F S grid; current day highlighted in primary colour; navigation arrows to step months
- Days with existing reminders get a dot indicator
- Below the calendar: a dated list of reminders for the selected/current day
- Footer: "Show full calendar" link → `/d/u/calendar`

**Implementation:**
- New component `components/app/calendar-panel.tsx` — self-contained, mirrors `reminders-panel.tsx` structure
- Reads reminders from `getUserReminders()` (already available) and indexes them by `dateValue` date to render dots and the day list
- Click a future date → opens inline `SetupReminderModal` pre-filled with that date (reuse existing `SetupReminderModal`)
- Click a past/present date → shows reminder list for that date; no creation prompt
- "Show full calendar" footer link → `/d/u/calendar`

**TopBar wiring (`components/app/app-topbar.tsx`):**
- Import `CalendarPanel` and add `showCalendarDropdown` state (same pattern as `showBookmarksDropdown`)
- Add `Calendar` icon from `lucide-react` as a new `w-10 h-10` button in the right cluster; tooltip "Calendar"
- Wrap in `calendar-container` div for click-outside dismissal (add `calendar-container` to the existing `handleClickOutside` effect)

---

### 2. Full Calendar Page — `/d/u/calendar`

New tab in the personalization section alongside Profile, Recent, Reminders, Bookmarks.

**Route files:**
- `frontend/app/(app)/d/u/calendar/page.tsx` — server component; loads `getUserReminders()` and passes to client
- `frontend/app/(app)/d/u/calendar/calendar-view.tsx` — client component with the full calendar UI

**`/d/u/layout.tsx` tab addition:**
```ts
{ label: 'Calendar', href: '/d/u/calendar', icon: CalendarDays, beta: false }
```
Add between Reminders and Bookmarks.

**Full calendar UI:**
- Full month grid (7 columns, all weeks visible) with month/year navigation (prev/next arrows)
- Each date cell shows a count badge or mini-list of reminders on that date
- Click any date:
  - Future date → opens `SetupReminderModal` with date pre-filled
  - Past/today date → expands a "day detail" side panel or inline section showing all reminders on that date, each with "Mark done" action

**`SetupReminderModal` integration:**
- The existing `SetupReminderModal` (`components/ui/setup-reminder-modal.tsx` or equivalent) accepts a pre-set date; pass the clicked date as `initialDate`
- On submit, call `createManualReminder()` from `lib/actions/user-reminders.ts` with `entityKey: 'platform.self'`, `entityValue: user.id`, `action` (user-provided title/note), `dateValue` (selected date)
- Fire `window.dispatchEvent(new CustomEvent('firma-reminders-updated'))` to refresh all panels

**Self-reminder entity support:**
- Add `'platform.self'` entry to the `ENTITY_KEY_ICON` map in `reminders-panel.tsx` and the entity resolver in `lib/reminders/entity-registry.ts`
- `resolveEntity` for `platform.self` returns `{ name: 'Personal reminder', slug: null, firmSlug: null, ctaUrl: '/d/u/calendar' }`

---

### 3. Reminder Creation from Calendar Click

When a user clicks a future date (in either the dropdown panel or the full-page calendar):

1. Open `SetupReminderModal` with `initialDate` prop set to the clicked date
2. User fills in: note/title (required), assignees (default: current user only)
3. On confirm → call `createManualReminder()`:
   ```ts
   createManualReminder({
     entityKey: 'platform.self',
     entityValue: userId,
     action: noteText,
     dateValue: clickedDate.toISOString(),
     entityName: 'Personal reminder',
     firmId: firmId,
     ctaUrl: '/d/u/calendar',
   })
   ```
4. Dispatch `firma-reminders-updated` to refresh the TopBar RemindersPanel and calendar dots

---

## Files to Create

| File | Purpose |
|---|---|
| `frontend/components/app/calendar-panel.tsx` | TopBar dropdown calendar with mini grid + day reminders |
| `frontend/app/(app)/d/u/calendar/page.tsx` | Server page — loads reminders, renders CalendarView |
| `frontend/app/(app)/d/u/calendar/calendar-view.tsx` | Client full calendar grid with navigation and reminder creation |

## Files to Modify

| File | Change |
|---|---|
| `frontend/components/app/app-topbar.tsx` | Add Calendar icon button + `showCalendarDropdown` state + click-outside handler |
| `frontend/app/(app)/d/u/layout.tsx` | Add Calendar tab to `TABS` array |
| `frontend/components/app/reminders-panel.tsx` | Add `'platform.self'` to `ENTITY_KEY_ICON` |
| `frontend/lib/reminders/entity-registry.ts` | Add `platform.self` resolver |

---

## Key Reuse

- **`getUserReminders()`** — `lib/actions/user-reminders.ts` — fetches all reminders, indexed by `dateValue` to drive dot indicators
- **`createManualReminder()`** — `lib/actions/user-reminders.ts:435` — creates the self-reminder DB entry + schedules Inngest email
- **`SetupReminderModal`** — existing modal; needs an `initialDate?: Date` prop added so calendar clicks pre-fill the date picker
- **`RemindersPanel`** pattern — `components/app/reminders-panel.tsx` — entire dropdown structure is copied (header, body, footer, click-outside, loading state)
- **`LayoutRightPanel` / `useRightPane`** — NOT used for this feature; the calendar panel is a standalone dropdown like the other TopBar panels, not a right-pane document sidebar

---

## Verification

1. Open the app → TopBar shows a Calendar icon next to the Reminders (CalendarClock) icon
2. Click Calendar → mini calendar dropdown opens showing current month; days with existing reminders have a dot
3. Click a future date in the dropdown → `SetupReminderModal` opens with that date pre-filled; submit → reminder appears in the Reminders panel badge count
4. Click "Show full calendar" → navigates to `/d/u/calendar`; Calendar tab is active in the Personalization tab strip
5. Full calendar: navigate to past months → past reminders appear on their dates; click a past-date reminder → shows detail inline
6. Full calendar: click a future date → same `SetupReminderModal` flow; on save → dot appears on that date
