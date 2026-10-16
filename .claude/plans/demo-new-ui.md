# Rebuild the /demo shell in the New UI

Status: built, 2026-10-16 (Deepak: "Do this task here"). Not committed yet.

The public demo (`app/(demo)/demo`, `components/demo`) still replays the retired v1 look through
`app/(demo)/demo/demo.css`. The goal is for the demo to look like today's app. The guided tour and
the Brio pieces were already moved over in `aff94e30`.

## Approach

- **Share the shell's building blocks; don't copy them.** The real sidebar's item, section and
  client-group pieces, the workspace mark, `PageHeading`, `InsightCard`, `StatTile`,
  `ActionSection`, the engagement Overview's rings, `Tabs`, `Tag` and `ListRow` all render without
  data, so the demo uses them directly.
  - Where a real component fetches its own data or builds `/d` links, the demo keeps a static
    stand-in built from those primitives.
- **Static data stays in `lib/demo`.** Links point at `/demo/...`. Anything that would write
  (uploads, settings, invites) stays inert with a "not in this demo" hint.

## Phases

1. **Shell.** The New UI frame: a 240px sidebar on `surface-sidebar` and an 11-unit header bar
   with breadcrumbs.
   - **Sidebar:** workspace mark and name, Search, Home, Inbox, "Your engagements" (client →
     engagement tree with status dots), All clients, the Firm section, and the profile menu.
   - **Header:** the tour and Sign up buttons live in the header.
2. **Firm views.** No tab strip: the sidebar picks the view, as in the app. Each view gets a
   `PageHeading`.
   - **Overview:** the flat layout (brief, Business overview, Linear-style Action Center).
   - **Clients:** a table and grid with the view toggle.
   - **Calendar, Doc Search, Members, Audit:** restyled on the shared primitives.
3. **Client and engagement pages.**
   - **Client page:** the client header, then underline tabs.
   - **Engagement page:** the engagement header and tab row. Overview uses the real rings and
     Action Center; Files, Board, Comments, Audit and Members are restyled.
4. **Home and Inbox.**
   - **Home:** the real `HomeView` fed with demo data (Continue, Agenda, My engagements,
     Bookmarks).
   - **Inbox:** a static list in the Inbox's look.
5. **Cleanup.**
   - **Tour:** steps re-pointed at the new targets. Recent and Bookmarks become a Home step,
     Reminders becomes an Inbox step, and Support moves into the profile menu.
   - **Removals:** `demo.css`, the JetBrains Mono load and the old demo sidebar/topbar pieces go.
   - **Dead links:** the recents data that pointed at engagements that don't exist is fixed.
   - **Check:** before/after screenshots.

## As built

- **Shell.** `components/demo/demo-shell.tsx` (frame), `demo-sidebar.tsx` (the real sidebar's
  exported `SidebarItem`, `SidebarSection` and `ClientGroup`), `demo-header-bar.tsx` (breadcrumbs
  from the URL). `demo.css`, the JetBrains Mono load and `demo-topbar-panels.tsx` are gone. The
  pre-paint script in `app/layout.tsx` marks `/demo` as the app, as it does `/d`.
- **Real components reused, with small props.**
  - `ClientList` and `ProjectList` take `hrefFor`; `EngagementHeader` takes `clientHref`.
  - `HomeView` takes `calendarHref` and `readOnly` (no bookmark removal).
  - `InboxView` takes a `source` (load and the five write actions). The app passes nothing and gets
    the live source; the demo passes static data whose actions only change the list on screen.
  - The engagement Overview's rings moved to `components/projects/insight-rings.tsx` so the demo
    can share them; `PipelineBar` and `SubSection` are exported from `firm-business-insights.tsx`.
- **Static stand-ins** (the real ones fetch or write): Doc Search, Members, both audit logs (one
  shared `demo-audit-log.tsx`), Files, Board, Comments and engagement Members. Each matches the
  real component's markup and tokens.
- **Personal data.** `lib/demo/demo-topbar-data.ts` became `demo-personal-data.ts`: recents,
  reminders, notifications, bookmarks, Home's work lists and the Inbox badge, all built from the
  sample firm (so no dead links) and from `now` (per request on Home, in the browser for the Inbox
  and the badge). The badge counts by the app's own rule (`lib/actions/inbox.ts`).
- **Home and Inbox.** `/demo/home` renders `HomeView` per request (`force-dynamic`), and
  `/demo/inbox` renders `InboxView` with the demo source.
- **Tour.** Firm steps point at the sidebar items and open to the right. Recent and Bookmarks
  became a Home step (it opens `/demo/home`), Reminders an Inbox step (`/demo/inbox`), and Support
  folded into the profile-menu step. Every one of the 27 targets was checked on its route.
- **Removed as unused:** `demo-client-grid`, `demo-dead-tab`, `demo-engagement-grid`,
  `demo-pipeline-bar`.
- **Fixed along the way:** two engagement tab panels (Files, Audit) carry `flex`, which beat the
  `hidden` attribute when inactive, so the Audit panel left a 330px gap above Members. They now
  hide with `data-[state=inactive]:hidden`.

### Left as is

- The deliverable detail pane matches `layout-right-panel.tsx`, which still has the old look.
- At 1280px the Board's four 240px lanes and the Files grid scroll sideways, as in the app.
- The sample data resolves its relative dates (`today+45`) once, when `static-demo-data.ts`
  loads. A long-lived server can therefore drift from the browser by a day. This predates this
  work.

## Renamed to /tour, and the in-app tour removed (2026-10-16)

Deepak: "we don't need the tour inside /d anymore … /demo page should be called /tour".

- **Route:** `app/(demo)/demo` → `app/(demo)/tour`. Every link in the tour, the homepage hero, the
  `WatchPreviewButton` calls to action and the onboarding top bar point at `/tour`.
  - `robots.ts` disallows `/tour/`, and the pre-paint script in `app/layout.tsx` matches `/tour`.
  - `next.config.js` redirects `/demo` and `/demo/*` to `/tour` permanently, so links already out
    there keep working.
  - `/tour` no longer starts with `/d`, so `proxy.ts` stops treating it as an app route for
    signed-in visitors (no maintenance or deployment-cookie checks on the public tour).
- **In-app tour deleted.** It only ran for `sandboxOnly` firms, which no longer exist.
  - Removed: `components/app/demo-tour*.tsx`, `lib/demo-tour-context.tsx`, the tour button in the
    onboarding top bar, and `/api/hierarchy` (only the tour called it).
  - The `data-demo-tour` markers it alone used are removed from the app's components. The public
    tour's markers on `EngagementHeader` and `EngagementTabsList` stay.
- **Left alone:** `components/layouts/app-layout.tsx` and the pages it pulls in
  (`navigation/sidebar`, `ui/top-bar`) still link to `/demo/documents`. Nothing imports them, and
  those URLs were already 404s.
