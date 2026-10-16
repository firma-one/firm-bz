# Cross-firm Home and Inbox (`/d/u/home`, `/d/u/inbox`)

Status: **built 2026-10-15, uncommitted, awaiting Deepak's visual review.** Approved the same day
with every recommended decision (1A, 2, 3, 4). Part of the UI/UX overhaul (`ui-ux-overhaul.md`,
Phase 6). "As built" at the end records where the build differs from or adds to this plan.

## Goal

Home and Inbox stop being per-firm pages under `/d/{group}/f/{firm}` and become one page each
under `/d/u/`, covering every firm the user belongs to. That's the GitHub model: one dashboard
and one notifications inbox across orgs, while each org keeps its own pages.

| Today | After |
|---|---|
| `/d/{g}/f/{f}`: that firm's Home | `/d/u/home`: one Home across all firms |
| `/d/{g}/f/{f}/inbox`: that firm's Inbox | `/d/u/inbox`: one Inbox across all firms |
| Sign-in lands on the last firm's Home | Sign-in lands on `/d/u/home` |
| Bare firm URL shows Home | Bare firm URL shows the firm's All clients |

Someone in one firm sees no difference except the URL. Everything below that mentions firm
labels or the firm filter only applies with two or more firms.

## Decisions I need from you

1. **Sidebar: where the firm switcher sits.**
   - **A (recommended): keep it at the top.** Search, Home and Inbox stay under it but ignore it
     and show all firms. Only Your engagements and the Firm section follow the switcher. Picking
     a firm opens that firm's All clients. This is the smallest change and keeps the lean sidebar.
   - **B: move it down.** Search, Home and Inbox go first, then the switcher heads the
     firm-scoped block. The layout is more honest about what's global, but a mid-sidebar switcher
     is unusual and it's a bigger visual change.
2. **What the bare firm URL shows.** Recommended: **All clients**, the firm's existing default
   view (the same as `?tab=clients`). The alternative is the Overview, but that's admin-only, so
   members would need a fallback anyway.
3. **Firm filter.** Recommended: an **"All firms ▾"** menu in the Home and Inbox headings, kept
   in the URL (`?firm={slug}`) so a filtered view can be linked to. It's hidden for single-firm
   users. The old per-firm Inbox URL redirects to `/d/u/inbox?firm={slug}`.
4. **Firms you can't open right now** (subscription locked, or in maintenance). Their pages
   redirect away, so Home and Inbox must not show their content. Recommended: leave them out and
   show one muted line, e.g. "Acme is unavailable (subscription paused)", linking to the lock or
   maintenance page. The alternative is leaving them out silently.

## Access rules (unchanged in spirit, now applied per firm)

- **Firms:** a firm is included only when the caller has a `FirmMember` row in it. Firms that are
  subscription-locked (`checkFirmSubscriptionAccess`) or in maintenance (the same lookup the
  proxy uses) are left out. The page computes this list on the server; the client never supplies
  it.
- **Per-engagement rules carry over unchanged:** the `EngagementMember` basis, approvals only for
  `eng_admin`, and stage visibility for external EC/EV members.
- **Notifications:** only the caller's own rows. Mark-read matches on `userId`, plus the item's
  own firm being in the caller's firm list.
- **No identity parameters:** no new server action takes a `userId` (see the
  server-actions-no-userid rule). The new data helpers are `server-only` modules called from the
  pages, which read the user themselves.

## Design

### Home (`/d/u/home`)

The same sections as now, in the current order: Continue, Agenda, Needs you, My engagements,
then Bookmarks.

- **Heading:** the `Home` icon (the sidebar's), the greeting, and today's date. The firm name
  leaves the description.
- **Firm labels:** cards and rows add the firm to their context, e.g.
  "FirmaOne · DataSentry · Q2 Go-To-Market".
  - Continue: the eyebrow reads "FirmaOne · DataSentry".
  - Agenda: chips keep the client name, and their tooltip adds the firm.
  - My engagements: gains a "By firm" grouping (firm, then client), the default with 2+ firms.
- **Links:** every link already includes its firm path. Opening an item drops you into that firm,
  and the sidebar follows, because it reads the firm from the URL.

### Inbox (`/d/u/inbox`)

The same list and detail panes, tabs, and keyboard shortcuts (j/k, e, h, Enter).

- Each notification and reminder row shows its firm when there are 2+.
- "Mark all read" applies to the current filter (all firms, or the filtered one).
- **Sidebar badge:** the unread total across included firms plus platform notifications.
  `getInboxCounts` already returns per-firm counts, so this is a sum.

## Data layer

| Piece | Today | Change |
|---|---|---|
| Firm list | n/a | New `lib/home/home-firms.ts` (`server-only`): the caller's included firms (id, name, slug, group slug) plus the unavailable ones, with the reason |
| My work | `getMyWork({ firmId, … })` | Takes `firms[]`: one engagement query over `client.firmId IN (…)`, with paths built from each row's own firm. The firm page keeps working by passing one firm |
| Recents | `getRecentVisits(userId, firmId)` | Takes `firmIds[]` and returns the firm on each row |
| Bookmarks | `getShellSidebarData(firmSlug).favorites` | New lighter helper: bookmarked engagements the caller belongs to in the included firms. The sidebar no longer needs favorites |
| Agenda | `getFirmCalendarData(firmSlug)`: everything, one firm | Factor its core into a `server-only` function taking firm ids and a date window. Home asks for about 9 days; the calendar page keeps its current call |
| Reminders | `getUserReminders()`: all firms, filtered per firm later | Filter to the included firms instead of one |
| Notifications | `GET /api/notifications?firmId=` (one firm, 30 rows) | Add an all-firms mode: the caller's rows in included firms plus platform rows, 50 at a time. The PATCH and mark-all handlers accept it too |
| Inbox grouping | `groupReminders(firmId, …)` | Takes the firm set and keeps each row's firm for its label |

## Routing and shell

- **New pages:** `app/(app)/d/u/home/page.tsx` and `app/(app)/d/u/inbox/page.tsx`. They render
  outside the `/d/u` Profile heading (the layout already skips its heading for non-Profile pages).
- **Bare firm URL:** renders All clients (decision 2). The Home branch in the firm `page.tsx` goes.
- **Redirects** (server `redirect()`, no client hop):
  - `/d/{g}/f/{f}/inbox` → `/d/u/inbox?firm={f}`
  - `/d/u/recent` and `/d/u/bookmarks` → `/d/u/home`
  - `/d/u/reminders` and `/d/u/notifications` → `/d/u/inbox?tab=…`
  - `MovedPage` (added this week, uncommitted) is no longer needed.
- **Landing:** `resolveV2LandingPath` returns `/d/u/home` for returning users. A brand-new,
  auto-provisioned user still lands in their new firm (`?landed=new`), since Home would be empty.
- **Shell links:** the sidebar's Home and Inbox, the header crumbs (`PERSONAL_PAGES`), ⌘K
  "Go to Home/Inbox", and the G H / G I shortcuts all point at `/d/u/…`.
- **Switcher:** picking a firm opens that firm's bare URL, i.e. All clients (decision 1A).

## Build order

1. **Data layer** and its tests: the firm list, multi-firm my-work/recents/bookmarks, the
   calendar core, and the notifications all-firms mode.
2. **`/d/u/home`:** generalize `FirmHome` into a `Home` that takes the firm list, with firm labels
   and the filter.
3. **`/d/u/inbox`:** a firm-agnostic `InboxView`, firm labels, the filter, and the all-firms
   mark-read.
4. **Routing and shell:** sidebar, crumbs, ⌘K, shortcuts, landing, redirects, bare firm URL,
   switcher target.
5. **Verify:** typecheck and the full test suite (only the 13 known Drive failures allowed), then
   your visual pass in your signed-in browser, with a 1-firm and a 2+-firm account.

## Tests

- **New or updated:**
  - `home-firms`: locked and maintenance firms are excluded and reported.
  - `my-work` across two firms: paths use each firm, and an engagement from a non-member firm
    never appears.
  - recents and bookmarks across firms.
  - The notifications all-firms mode: never another user's rows or a non-member firm's rows.
  - Inbox grouping with firm labels.
  - Sidebar and crumb links.
  - Landing path.
- **Kept as they are:** existing `my-work`, `inbox`, `shell` and `idor-gates` tests (adjusted
  for signatures only).

## Out of scope

- ⌘K entity search stays scoped to the current firm.
- No change to engagement, client or firm pages, or to who can see what inside a firm.
- The per-firm calendar page stays per firm.

## Kept until sign-off (no-delete rule)

`FirmHome` (unused once Home moves), the per-firm `InboxView` props, the old personal pages, and
`DueSoonSection`. All are removed in the Phase 7 cleanup.

## As built (2026-10-15)

- **Data:**
  - `lib/home/home-firms.ts`: `getHomeFirms` and `maintenanceActive`.
  - `lib/home/bookmarks.ts`: `getHomeBookmarks`.
  - `lib/calendar/calendar-data.ts`: `loadCalendarData` takes firms, an optional window and
    `withAssignees`. `getFirmCalendarData` is now a thin wrapper and re-exports the types.
  - `getMyWork({ userId, firms, reminders })`: items carry `firmId`.
  - `getRecentVisits(userId, firmId | firmIds)`: rows carry `firmId`.
  - `CalendarEvent.firmId`.
- **Notifications:** `/api/notifications?firms=all` handles GET (50 rows; the retention cleanup now
  covers all the caller's rows), PATCH `markAllRead`, and DELETE by ids (own rows only). Every row
  now includes `firmId`.
- **Pages:**
  - `app/(app)/d/u/home/page.tsx` renders `components/home/home-view.tsx`.
  - `app/(app)/d/u/inbox/page.tsx` renders `InboxView`, now `{ firms, unavailable }` and reading
    `?firm=`.
  - Shared parts: `components/home/firm-filter.tsx` (`FirmFilter`, `UnavailableFirmsNote`) and
    "By firm" grouping in `MyEngagementsList`.
- **Agenda:** with several firms on screen there is no single calendar, so "Open calendar" hides
  and "+N more" is plain text with a tooltip. With one firm (or a filter) it links that firm's
  calendar.
- **Unavailable firms:** the note reads "{Firm} is under maintenance" or "{Firm} has an inactive
  subscription", then ", so it isn't shown here." The locked statuses aren't all "paused".
- **Redirects:**
  - The bare firm URL redirects to `?tab=clients`, keeping other params such as `?landed=`.
  - `/d/{g}/f/{f}/inbox` redirects to `/d/u/inbox?firm={f}`, keeping the tab.
  - `next.config.js` redirects `/d/u/recent` and `/d/u/bookmarks` to Home, and
    `/d/u/reminders` and `/d/u/notifications` to the Inbox with that tab (`permanent: false`).
    They need a dev-server restart.
  - `MovedPage` now forwards to the new pages, as a fallback.
  - The reminder digest push links straight to `/d/u/inbox?tab=reminders`.
- **Shell:**
  - Sidebar: `HomeAndInbox` goes to `/d/u/home` and `/d/u/inbox`, with the badge from the new
    `inboxTotal`. The picker pages (`/d`, `/d/{g}/f`) now show Home and Inbox too.
  - On `/d/u/*` the sidebar keeps the last firm from the URL rather than jumping to the default
    firm.
  - Header crumbs show Home, Inbox, Profile, Support and Billing with their menu icons.
  - ⌘K "Go to Home/Inbox" and G H / G I go to `/d/u/…`, even with no firm.
  - Landing: returning users go to `/d/u/home`. New auto-provisioned users still land in their
    firm.
- **Tooltips:** Home and the Inbox use the app's Radix tooltip, not native `title`. Agenda chips
  show the title, then the client or context muted; "+N more" lists the rest. Timestamps, "Due
  date" and the bookmark remove button use a new one-line `Hint` (`components/ui/tooltip.tsx`).
- **Known gap:** `inboxTotal` sums `getInboxCounts` over all the user's firms, including a locked
  or maintenance firm the Inbox leaves out. It matters only while billing gates are enforced or a
  migration runs.
- **Tests:** new or updated tests cover `home-firms`, `bookmarks`, `my-work`, `recents`,
  `calendar-data`, the notifications route, `inbox-view`, `home-view`, the shell, the command menu
  and landing. The full suite passes except the 13 known Drive failures.
- **Dead until the Phase 7 cleanup:** `FirmHome` (`components/home/firm-home.tsx`), the old
  personal pages behind the redirects, `MovedPage`'s children, and the sidebar data's `favorites`.

