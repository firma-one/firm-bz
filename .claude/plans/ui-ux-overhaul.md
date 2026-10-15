# Plan: UI/UX Overhaul — Notion's look, Linear's information architecture

Branch: `feature/ui-ux-overhaul` (cut from `dev` @ `3aef4fa0`, 2026-10-15)

## Context

Two goals:

1. **Look and feel (Notion).** Replace today's mix of design languages with one calm, neutral system
   built on tokens: Inter, warm-gray text, hairline borders, small radii, minimal shadows and muted
   color tags.
2. **Information architecture (Linear).** Get people back to "where I was working last night" in
   0–1 clicks instead of 3–7, and give each firm a Home that answers "what should I jump into?".
   Everything must stay within the existing access-control rules.

### Decisions (Deepak, 2026-10-15)

| Topic | Decision |
|---|---|
| Landing | **Per-firm Home.** Sign-in lands on the Home of the firm the user last worked in. Other firms are reached through the workspace switcher. |
| Brand | **Neutral UI with an emerald accent.** Inter everywhere and a warm-gray monochrome UI. Emerald is only for primary actions, links and focus. The firm logo appears only in the workspace switcher and client-facing (EC/EV) views. Space Grotesk, Work Sans and the uppercase mono micro-labels are dropped. |
| In scope | Unified Inbox, ⌘K entity search, mobile-responsive shell |
| Out of scope | Dark mode. Tokens are still structured so it can be added later without rework. |
| Review | **Straight to code**, behind a per-user "New UI" toggle. The old UI stays fully intact until sign-off (no deletion before sign-off). |

---

## Current state (findings)

### Design system: there isn't one

- **Three overlapping layers.** A shadcn base with HSL variables sits under the "Kinetic Institution"
  theme (emerald, Space Grotesk + Work Sans + JetBrains Mono, applied mostly as hardcoded hex), with
  leftover blue/gray "Pockett"-era code underneath.
- **About 11,500 hardcoded color usages.** 309 of 371 `.tsx` files contain at least one. There are
  206 distinct hex values; the top five (`#45474c`, `#e5e7eb`, `#1b1b1d`, `#f9f9fb`, `#f3f4f6`)
  account for about 2,900 uses. Semantic token classes appear only about 1,000 times.
- **No type scale.** There are about 1,400 arbitrary font sizes (`text-[10px]` ×652, `text-[9px]`
  ×118, down to `text-[6.5px]`). Three fonts are loaded twice, once via `next/font` and again via a
  CDN `@import` in `globals.css`.
- **The default `<Button>` is `bg-blue-600`.** `Progress` is blue too. There are 673 raw `<button>`s
  against 311 `<Button>`s.
- **Seven duplicated, inconsistent status-color maps.** For example, "approved" renders in three
  different greens.
- **`.d-app` contains `!important` remaps** that silently rewrite Tailwind slate classes app-wide
  (`globals.css:268-310`).
- **Dead shell code:** `ui/top-bar.tsx`, `ui/search-dropdown.tsx`, `navigation/sidebar.tsx`,
  `layouts/app-layout.tsx`, four unused spinners, `empty-state.tsx`, `StdCTAButton.tsx` and several
  unused CSS classes.
- **Hotspots** (hardcoded colors per file):
  - `engagement-insights-dashboard` 536
  - `engagement-file-list` 320
  - `engagement-shares-tab` 214
  - `firm-business-insights` 212
  - `document-doc-comments-pane` 211
  - `firm-action-center` 191

### Navigation: why getting back to work takes so many clicks

| Case | Clicks after sign-in to reach an engagement's files |
|---|---|
| Non-admin, 1 group / 1 firm | 3 (plus a ~3s arrival overlay) |
| Firm admin, 1 firm (lands on Overview) | 4 |
| 1 group, 2+ firms (firm picker) | 4–5 |
| 2+ groups (group card → firm card → confirm dialog) | up to 7 |

Root causes:

- **No record of where the user was, on the server.** Recents live in localStorage
  (`fm_nav_recents_{firmSlug}`, `app-sidebar.tsx:92-269`). They are per device and per firm, they
  only cover clients and engagements, and they open the engagement's **Overview** tab rather than
  the tab or folder the user was in.
- **The group and firm pickers always appear for multi-firm users.** `FirmMember.isDefault` and the
  JWT `active_firm_id` exist, but the landing resolver ignores them (`lib/actions/firms.ts:293-357`).
- **Overview is the default tab** both at firm level (for admins) and at engagement level.
- **The sidebar is the same at every level.** It has no client/engagement tree and no favorites.
  Recents, Reminders and Bookmarks show only their top 3.
- **The top bar has three separate dropdowns** for notifications, reminders and bookmarks. The bell
  can show a different firm than the one in the URL: it uses the JWT active firm, and `switchFirm`
  isn't called from the firm picker.
- **⌘K is a static list of links.** It doesn't search entities.
- **Breadcrumbs are drawn separately by each page,** and the Home icon leads to the firm picker.
- **The shell has no responsive behavior.** The sidebar is fixed at 256px; there is no drawer or
  hamburger.
- **Every deploy signs users out.** The version-mismatch check in `proxy.ts:139-153` forces
  `redirect=/d`, which drops the user's place.

### Access control (rules the new surfaces must follow)

- **Visibility means an `EngagementMember` row.** `getFirmHierarchy` (`lib/actions/hierarchy.ts:79`)
  is the listing source of truth. Firm admins get break-glass access in the permission checks
  (`permission-helpers.ts:197`), but they are *not* auto-listed on engagements they don't belong to.
- **External users (EC/EV) also get a `FirmMember` row with role `firm_member`.** Use
  `isExternalEngagementRole` (`lib/engagement-access.ts:34`) to tell them apart, not the firm role.
  - Deliverable stage visibility comes from `lib/deliverable-stage-roles.ts`.
  - Documents are limited to the shared subtree (`getSharedAndAncestorIdsForPersona`).
  - Only `eng_admin` can approve.
- **Brio (the agent user) is a member of everything.** Exclude it with `isAgentUserId`.
- **Notifications are a per-firm table.** Reminders, bookmarks and the permission cache
  (`getUserSettingsPlus`) are cross-firm.
- **Deliverable status and assignee live in `EngagementDocument.settings` JSON.** There is no task
  table.

---

## Target experience

### Information architecture (Linear mapping)

| Linear | Firma | Treatment |
|---|---|---|
| Workspace | **Firm** | Workspace switcher at the top-left of the sidebar |
| (billing org) | **Firm Group** | Hidden from navigation. Shown only as section headers inside the switcher, plus billing in settings. No more group picker in the daily path. |
| Team | **Client** | Collapsible group in the sidebar under "Your engagements" |
| Project | **Engagement** | Sidebar leaf; opens on the user's last tab |
| My Issues / Inbox | **Home / Inbox** | Per firm |
| Favorites | **Favorites** | Reuses bookmarks (`kind: project` and `document`) |

### Sidebar v2

```
┌──────────────────────────────┐
│ [▣] Acme Advisory        ▾   │  ← workspace switcher: firms grouped by group,
│                              │     unread counts per firm, "All workspaces…"
│  ⌕  Search            ⌘K     │
│  ⌂  Home                     │
│  ✉  Inbox               3    │
│                              │
│  FAVORITES                   │
│   ★ Contoso · FY26 Audit     │
│   ▤ Engagement letter.pdf    │
│                              │
│  YOUR ENGAGEMENTS            │
│   ▾ Contoso                  │
│       FY26 Audit       ●     │  ← dot = unread activity
│       Tax Advisory           │
│   ▸ Fabrikam                 │
│   All clients →              │
│                              │
│  FIRM                        │
│   Overview (admin)           │
│   Clients · Calendar         │
│   Doc Search · Settings      │
│                              │
│ (DS) Deepak Shettigar   ⚙    │
└──────────────────────────────┘
```

- **Header bar** (replaces today's 64px top bar): a breadcrumb trail (`Contoso / FY26 Audit / Files`)
  plus page actions on the left; AI credits and help on the right. In v2 the bell, reminders and
  bookmarks dropdowns go away; Inbox and Favorites replace them.
- **Breadcrumbs** come from one `PageContext` provider, which upgrades the existing
  `firma-page-context` event. Pages stop drawing their own.

### Landing (per-firm Home)

The landing resolver applies these rules in order:

1. A `?redirect=` deep link wins.
2. Otherwise, go to the Home of the user's **last-visited firm** (from the new `user_recent_visits`
   table).
3. Otherwise, go to the `FirmMember.isDefault` firm.
4. Otherwise, fall back to today's picker logic. That should only happen for brand-new or ambiguous
   users.

Related changes:

- Switching firms in the switcher calls `switchFirm`, which updates `isDefault` and the JWT. This
  also fixes the bell/firm mismatch.
- The ~3s arrival overlay is skipped for returning users in v2.
- `/d` on its own redirects to the last firm's Home. The group and firm pickers stay reachable
  through "All workspaces…".

### Firm Home (`/d/{g}/f/{f}` in v2)

Sections, top to bottom:

1. **Continue where you left off.**
   - One large card for the last thing the user opened in this firm. It stores the exact path:
     engagement, tab, folder, and document hash. One click resumes.
   - Next to it, a row of the four previous items.
2. **Needs you.** Items the user can act on, each with its own action button:
   - Deliverables `in_review` where the user is `eng_admin` (Approve / Request changes)
   - Intake files pending approval (the user is lead)
   - @mentions not yet done
   - Unanswered client threads (internal roles only)
   - AI engagement summaries awaiting review (lead)
   - For EC/EV users: documents shared with them for review, and deliverables in stages they can see
3. **Due soon.** Overdue items and the next 14 days:
   - Deliverables assigned to the user (`settings.assigneeUserId`)
   - Engagements the user leads that have a due date
   - The user's reminders in this firm
4. **My engagements.** A Linear-style list with columns client · engagement · status pill · lead ·
   due · last activity.
   - Grouping: by client or by status.
   - Filter: Active / All.

Firm admins also see an "Overview" link to the existing firm insights page and Action Center. That
page is unchanged and moves from the default tab to a sidebar item.

**Engagement default tab (v2):** the user's last tab on that engagement; if none, **Files**
(today it is Overview).

### Unified Inbox (per firm, `/d/{g}/f/{f}/inbox`)

- **Sources**, normalized into one `InboxItem` shape:
  - `Notification` rows, scoped by the `firmId` taken from the URL
  - Reminders that resolve to this firm
  - Mentions, which are reminders with `platform.doc_comments`
- **Layout:** two panes. The list is on the left; the detail or preview opens in the existing right
  pane.
- **Keyboard:** `j`/`k` to move, `e` for done, `Enter` to open, `h` to snooze (hide).
- **Actions** reuse existing endpoints: notifications PATCH/DELETE, `markReminderDone`,
  `hideReminder`.
- **Unread counts:**
  - A badge in the sidebar.
  - Per-firm counts in the workspace switcher, so work in other firms stays visible without a
    cross-firm Home.
- **Personal pages:** `/d/u/{notifications,reminders,recent,bookmarks}` redirect to Inbox, Home or
  Favorites in v2. Profile stays.

### ⌘K v2

- **With an empty query:** recents first, then actions: Go to Home / Inbox, Switch firm, New
  engagement (if permitted), Add reminder, Toggle sidebar, Settings.
- **With a query:**
  - Clients and engagements across *all* of the user's firms, from the permission-scoped
    `getUserSettingsPlus` cache.
  - Files in the current firm, through the existing global-search service
    (`computeGlobalSearchAccessScope`).
- **New endpoint:** `GET /api/search/quick?q=&firmId=`. Fuzzy ranking uses `fuse.js`, which is
  already a dependency.
- **Shortcuts:** `G H` (Home), `G I` (Inbox), `G S` (Settings), `[` to toggle the sidebar, `?` for
  the cheat sheet.

### Responsive shell

| Breakpoint | Behavior |
|---|---|
| ≥1280px | Full layout; the right pane docks alongside. |
| 1024–1279px | Sidebar collapsible; the right pane overlays. |
| <1024px | The sidebar becomes an off-canvas drawer (Radix Dialog) opened from a menu button in the header. |
| <768px | Home is a single column. Tables become stacked list rows. The right pane becomes a full-screen sheet. Touch targets are at least 36px. Engagement tabs scroll horizontally (they already do). |

- Sidebar collapse state persists in `uiPrefs`. Today it resets on reload.
- When the right pane closes, it restores the sidebar it collapsed. Today it never does.

---

## Visual design system (Notion-inspired, light only, structured so dark mode can be added later)

### Typography

- **Inter** through `next/font` with the variable axis, falling back to the system UI stack.
  Monospace (`ui-monospace`) only for code, IDs and file sizes.
- Remove the Google Fonts CDN `@import` from `globals.css` **in the Phase 7 cleanup**, not before: the
  legacy `.d-app` rules name `'Work Sans'`, `'Space Grotesk'` and `'JetBrains Mono'` literally, and
  only the CDN import provides those faces (next/font registers hashed family names).

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| `text-caption` | 12 / 16 | 500 | Metadata, timestamps, section labels (sentence case, not uppercase) |
| `text-small` | 13 / 18 | 400 | Dense lists, sidebar secondary text, table cells |
| `text-ui` | 14 / 20 | 400 | Default UI text, sidebar items, buttons, inputs (named `ui`, not `base`, so Tailwind's own `text-base` stays 16px for v1) |
| `text-body` | 15 / 24 | 400 | Long-form text: comments, dossier, AI summaries |
| `text-h3` | 16 / 24 | 600 | Card and section titles |
| `text-h2` | 20 / 28 | 600 | Sub-page titles |
| `text-h1` | 28 / 36 | 700 | Page titles (Notion-style large, left-aligned) |

### Color (warm-gray neutrals, with Notion's tag palette)

| Token | Value | Notes |
|---|---|---|
| `--bg` | `#FFFFFF` | Main canvas |
| `--bg-sidebar` | `#F7F7F5` | Sidebar, header strip |
| `--bg-subtle` | `#FBFBFA` | Table headers, inset areas |
| `--bg-hover` | `rgba(55,53,47,.06)` | Row and item hover |
| `--bg-active` | `rgba(55,53,47,.09)` | Selected sidebar item, pressed state |
| `--fg` | `#37352F` | Primary text |
| `--fg-muted` | `#6F6E69` | Secondary text and icons. Solid rather than Notion's `rgba(55,53,47,.65)`, which is only 4.2:1; this is 5.1:1 on canvas and 4.8:1 on the sidebar. |
| `--fg-subtle` | `#A5A4A1` | Placeholders, disabled text and decorative icons only, never body copy |
| `--border` | `rgba(55,53,47,.09)` | Hairlines, cards |
| `--border-strong` | `rgba(55,53,47,.16)` | Inputs, dividers that need weight |
| `--accent` | `#047857` | Primary buttons, links, focus ring. Emerald-700 gives 5.5:1 on white and passes AA; today's `#069668` is only 3.8:1. |
| `--accent-brand` | `#069668` | Large icons and brand marks only |
| `--danger` | `#C2413B` | Destructive actions. 5.1:1, where Notion's `#D44C47` is 4.3:1. |

- **Tags and status pills** use Notion's pairs. Background / text (Notion's originals; the shipped text colors in `app/ui-tokens.css` are darkened to clear 4.5:1 on their own background, e.g. green text `#3C7355`):

  | Color | Background | Text |
  |---|---|---|
  | gray | `#E3E2E0` | `#787774` |
  | brown | `#EEE0DA` | `#9F6B53` |
  | orange | `#FADEC9` | `#D9730D` |
  | yellow | `#FDECC8` | `#CB912F` |
  | green | `#DBEDDB` | `#448361` |
  | blue | `#D3E5EF` | `#337EA9` |
  | purple | `#E8DEEE` | `#9065B0` |
  | pink | `#F5E0E9` | `#C14C8A` |
  | red | `#FFE2DD` | `#D44C47` |

- **One status map** in `lib/ui/status-colors.ts` replaces the seven duplicates:

  | Status | Values → color |
  |---|---|
  | Deliverable | `to_do` gray · `in_progress` blue · `in_review` yellow · `approved` green · overdue red |
  | Engagement | PLANNED gray · ACTIVE blue · PAUSED yellow · COMPLETED green |
  | Client | PROSPECT purple · ACTIVE green · ON_HOLD yellow · PAST gray |

### Shape, depth, density and motion

| Aspect | Spec |
|---|---|
| Radius | `4px` controls and tags · `6px` cards and menus · `10px` dialogs · `full` avatars (round) |
| Shadows | Cards have none (border only). Popovers: `0 0 0 1px rgba(15,15,15,.05), 0 3px 6px rgba(15,15,15,.1), 0 9px 24px rgba(15,15,15,.2)`. Dialogs: a larger version of the popover shadow. Scrim: `rgba(15,15,15,.6)`, the only one in the app. |
| Density | Sidebar item 28px tall · list and table row 36px · button heights 28/32/36. Page content max-width 1200px, with 96→16px side gutters (desktop → mobile). |
| Icons | lucide only; 16px, `strokeWidth={1.75}`, `--fg-muted` by default; one close icon (`X`) everywhere |
| Motion | 120ms ease on hover and background changes. Remove `active:scale-95` and the arrival animations. |

### How the token layer works with the toggle

Restyled primitives must not change the old UI. Every shared style therefore goes through semantic
CSS variables that have two values:

- **`:root` (legacy).** Each semantic token is set to today's hex value, for example
  `--fg-muted: #45474c` and `--border: #e5e7eb`. The old UI renders pixel-identical.
- **`[data-ui="v2"]` (set on `<html>`).** The Notion values from the tables above.

Mechanics:

- Tokens live in `frontend/app/ui-tokens.css` (imported after `globals.css`). Tailwind class names
  (as built in Phase 0):
  - Surfaces: `bg-surface`, `bg-surface-sidebar`, `bg-surface-subtle`, `bg-surface-muted`,
    `bg-surface-hover`, `bg-surface-selected`
  - Text: `text-fg`, `text-fg-muted`, `text-fg-subtle`
  - Lines: `border-line`, `border-line-strong`
  - Action: `bg-action`, `hover:bg-action-hover`, `text-action-fg`, `text-action`
  - Danger: `text-danger`, `bg-danger`
  - Overlays: `bg-scrim`
  - Tags: `bg-tag-{color}-bg`, `text-tag-{color}-fg`
  - Shape and depth: `rounded-control|card|dialog`, `shadow-popover|dialog`
  - Type: `text-caption|small|ui|body|h3|h2|h1`
  - `action` and `danger` take opacity modifiers (`bg-action/10`); the neutral tokens don't,
    because some are rgba.
- Fonts are switched by CSS rather than by changing Tailwind's `fontFamily`. Under `data-ui="v2"`,
  `body` and `.d-app` use Inter, and the `--font-kinetic-headline` alias plus `.font-headline`,
  `.d-title` and `.d-section` resolve to Inter too. The existing 154 `font-headline` uses become
  Inter with no edits.
- The base `h1`–`h6` color reads `var(--ui-heading)`: slate-800 in v1, `#37352f` in v2.
- **Codemod**, a script run directory by directory with each diff reviewed. It replaces hex and
  slate/gray literals with semantic classes wherever the legacy value matches exactly. That covers
  roughly 6k of the 11.5k occurrences mechanically; the rest are hand-fixed screen by screen in
  Phase 6.
- **The per-firm `--primary` override** still applies in v1. In v2, `--primary` and `--ring` are
  pinned to emerald-700 with `!important`, which beats the inline style the pre-paint script and
  AppTopbar write; the firm brand stays on `--brand-accent`.
- **The `.d-app` `!important` slate remaps** stay untouched until Phase 6 replaces the classes they
  target.

---

## Phases

Each phase ends at a point where the work can be committed (with approval). Agent roles follow
`.claude/agents/` (ux-engineer for UI, engineer for services, quality-engineer for the access matrix).

### Phase 0 — Foundations and toggle (no visible change to the legacy UI)

- **Migration A**, `20261015105703_ui_v2_recents_and_prefs` ✅. `migrate dev --create-only` fails
  here (P3006: the shadow database can't replay migrations that reference `auth.users`), so the SQL
  was generated with `prisma migrate diff` (schema → schema), like the other hand-written
  migrations. Not applied; `npm run build` applies it.
  - **New table `platform.user_recent_visits`.** Columns: `id`, `userId`, `firmId`, `entityType`
    (firm | client | engagement | document), `entityId`, `path` (full path including tab, query
    and hash), `title` (snapshot), `visitedAt`.
    - `@@unique([userId, entityType, entityId])`
    - `@@index([userId, firmId, visitedAt(sort: Desc)])`
  - **New column `user_personalizations.uiPrefs Json @default("{}")`.** It holds
    `{ shell: 'v1'|'v2', sidebarCollapsed, sidebarSections, lastTabByEngagement }`.
- **Toggle** ✅
  - A "New UI" switch in the profile menu calls `setUiShell` (`lib/actions/user-ui-prefs.ts`). That
    action merges `uiPrefs.shell` atomically and mirrors it into the `fm_ui_shell` cookie.
  - Visibility: system admins in production; every account in local dev.
  - `app/(app)/d/layout.tsx` reads the preference on the server (`lib/ui-prefs.ts`; falls back to
    v1 if the column is missing).
  - `UiShellProvider` (`lib/ui-shell-context.tsx`) keeps `<html data-ui>` and the cookie in sync,
    and clears the attribute when the user leaves `/d`.
  - The root layout's `beforeInteractive` script sets the attribute from the cookie before first
    paint.
- **Token layer** ✅: `app/ui-tokens.css` plus the Tailwind mapping. Inter's `next/font` variable is
  now on `<body>`.
- **Codemod script**: moved to the start of Phase 1. It lives in `frontend/scripts/` as a real repo
  tool, not scratch code.

### Phase 1 — Primitives v2

- **Restyle in place on semantic tokens:**
  - Button: variants `primary` (accent), `secondary` (bordered neutral), `ghost`, `danger`, `link`.
    The default becomes `secondary`; the blue default goes away.
  - Input, Textarea, Select, DropdownMenu, Dialog, Sheet.
  - Tabs: Linear/Notion-style underline tabs.
  - Tooltip: small, dark, 6px radius, 400ms delay.
  - Toast, Avatar (round), Checkbox, Switch, Progress, Skeleton.
- **New primitives:**
  - `Tag`, `StatusPill` (backed by `status-colors.ts`)
  - `PageHeader`, `SectionLabel`
  - `PropertyList` (Notion-style key/value rows)
  - `ListGroup` / `ListRow` (Linear-style lists)
  - `EmptyState` v2, `Kbd`, `SidebarItem`
- **Check:** screenshot key legacy screens before and after; they must be unchanged in v1.

### Phase 2 — Shell v2 and responsive

- **New components in `components/shell/`:** `AppShellV2`, `SidebarV2`, `WorkspaceSwitcher`,
  `HeaderBar` (breadcrumbs), `MobileNavDrawer`, `PageContextProvider`.
- **Shell choice.** `d-layout-client.tsx` picks the legacy or v2 shell from the toggle. The legacy
  shell is untouched.
- **Sidebar data:** one server call, `getSidebarData(firmSlug)`. It combines `getFirmHierarchy`
  (already membership-filtered), favorites (bookmarks), unread Inbox count and per-firm counts for
  the switcher.
- **Right pane:** restyled, and it restores the sidebar when it closes.

### Phase 3 — Server-side recents, landing and Firm Home

- **`recordVisit`.** Called on route change, debounced. It upserts into `user_recent_visits`,
  captures the engagement tab into `uiPrefs.lastTabByEngagement`, and keeps the last 50 rows per
  user.
- **`getRecentVisits(firmId)`.** Re-checks visibility through `getFirmHierarchy` and drops stale
  rows, the same way `/api/nav/recents/resolve` does today.
- **Migrating old recents.** On a user's first v2 load, the client posts their existing
  localStorage recents. After that, v2 stops writing localStorage.
- **Landing resolver v2** (rules above) and the `/d` redirect. Fix `switchFirm` so it is called
  from the switcher.
- **Firm Home** (a server component inside the firm layout, so the subscription and maintenance
  gates already apply).
  - A new service, `lib/home/my-work.ts`, with `getMyWork(firmId, userId)`.
  - It starts from the user's `EngagementMember` rows in this firm and then runs bounded queries
    for each "Needs you" and "Due soon" source, using only those engagement ids.
  - EC/EV filtering goes through `deliverable-stage-roles` and the shared subtree.
  - The agent user is excluded.
- **Engagement default tab** (v2): last tab, else Files.

### Phase 4 — Unified Inbox

- **Service:** `lib/inbox/get-inbox-items.ts`. It merges notifications (`firmId` from the URL),
  reminders resolved to this firm, and mentions.
- **`firmId` on reminders.** Add `firmId` to `ReminderItem` on new writes. For older items, resolve
  it at read time through the entity registry.
- **Inbox page** (two panes, keyboard support), plus the sidebar badge and the switcher counts.
- **Header cleanup:** in v2, remove the bell, reminders and bookmarks dropdowns. Redirect the
  `/d/u/*` pages.
- **Migration B (if `EXPLAIN` shows it's needed):** indexes on
  - `notifications(userId, firmId, createdAt)`
  - `engagement_documents(engagementId, dueDate)`
  - `engagement_document_sharing_users(engagementId, sharingPermissionStatus)`

### Phase 5 — ⌘K v2

- `GET /api/search/quick`, plus the palette UI built on Dialog, `ListRow` and `Kbd`.
- Actions registry, keyboard shortcuts, and the `?` cheat sheet.

### Phase 6 — Restyle screens (v2 scope)

Order follows traffic and how many hardcoded colors each screen has:

1. **Engagement workspace:** header and tabs, Files list, Shares/Board, Comments pane, Overview dashboard.
2. **Client page and engagement list; firm Clients list** (as Linear-style lists).
3. **Firm Overview** (business insights, Action Center), Calendar, Doc Search.
4. **Settings:** firm and client settings forms, Members, Audit, Connectors/Drive.
5. **Profile, Billing, Support.**
6. **Onboarding, sign-in/sign-up, invite pages.**

Per screen:

- Hex and palette colors → tokens.
- Micro-labels → `SectionLabel`.
- Raw `<button>` → `Button`.
- Hand-rolled `fixed inset-0` overlays → `Dialog`/`Sheet`.
- Status spans → `StatusPill`.
- Arbitrary font sizes → the type scale.

Not in scope: marketing, landing, blog, legal, `/demo`, and `/system` admin.

### Phase 7 — Sign-off and cutover

- Make v2 the default for everyone, and keep the toggle for a while.
- **After Deepak signs off,** a separate cleanup PR deletes:
  - the legacy shell and the dead files listed above
  - the legacy token scope and the `.d-app` remaps
  - the localStorage recents code
  - the unused CSS
  - the Google Fonts CDN `@import`, once nothing names Work Sans, Space Grotesk or JetBrains Mono
    literally

---

## Access-control rules for the new surfaces

- Every Home, Inbox, sidebar and ⌘K query **starts from the user's own membership rows**: the same
  basis as `getFirmHierarchy`. Non-admins never get firm-wide lists.
- **Firm admins:** Home lists only the engagements they are members of, matching today's lists.
  Firm-wide views stay on the admin Overview behind `firm:can_manage`.
- **EC/EV users:**
  - Stage visibility comes from `deliverable-stage-roles`; documents are limited to the shared
    subtree.
  - They see no internal-only items: unanswered threads, AI drafts, audit, Overview.
  - Their sidebar header shows the firm/client branding (the client-facing view).
- **Re-check on read:** recents, bookmarks and reminders are filtered against current access, and
  stale entries are dropped silently.
- **Brio:** `isAgentUserId` is excluded from people, actors and avatars.
- **No per-user data in firm-level caches.** This avoids repeating the AI-brief leak below.
- **Tests:** vitest coverage for `getMyWork`, `getInboxItems` and `/api/search/quick` across a role
  matrix: firm admin (member and non-member of the engagement), eng_admin, eng_member, EC, EV,
  non-member, and the agent user.

## Click budget (target)

| Task | Today | v2 |
|---|---|---|
| Resume last night's engagement, same tab/folder | 3–7 | **0–1** (Continue card) |
| Open another engagement in the same firm | 2–3 | **1** (sidebar tree) |
| Switch firm and resume there | 4–7 | **2** (switcher → Continue) |
| Find any client, engagement or file | n/a | **⌘K + type** |
| See everything that needs me in this firm | 3 dropdowns plus Overview | **1** (Home / Inbox) |

## Verification (each phase)

- Run `npm run typecheck` and `npm test`. Deepak runs `npm run build`, which applies the migrations.
- Use the browser preview in **both** shells. Take before/after screenshots to prove v1 is
  unchanged.
- Check viewports at 375, 768, 1024 and 1440px.
- Walk through the role matrix with test accounts (admin, member, EC, EV).
- Re-measure the click budget table above.

## Delivery

- All work happens on `feature/ui-ux-overhaul`, committed per phase with explicit approval.
- Don't open a PR to `dev` until a coherent set of phases is finished. Never open one mid-edit (the
  PR #73 lesson).
- After any merge to `main`, check `git diff --stat origin/main origin/dev`.

## Out of scope / follow-ups

- **Dark mode.** The tokens are ready for it; it needs a toggle and screen QA.
- **Shorter URLs** (dropping the `/d/{group}/f/` prefix).
- **Restyling `/system` admin and the marketing site.**
- **Sign-out on every deploy** (`proxy.ts:139-153`). Server-side recents soften the lost-place
  problem, but the forced sign-out deserves its own fix.
- **Access and security bugs found during discovery** (handle in a separate session):
  1. Firm insights mix in reminders from other firms (`api/firms/[firmId]/insights/route.ts:205`).
  2. The cached AI firm brief includes the generating admin's own reminders and is shared
     firm-wide (`lib/ai/firm-brief.ts:119-122`).
  3. `GET /api/hierarchy` has no membership check.
  4. `/api/firms/[firmId]/drive-alerts` admits external users, who have `firm_member` rows.
  5. `getFirmCalendarData` doesn't apply EC/EV stage or subtree filtering. Home's "Due soon" uses its
     own filtered query and doesn't depend on this fix.
  6. The `platform.documents` reminder resolver selects `name` instead of `fileName`.
  7. The intake reminder write bypasses `withReminderLock`.

## Defaults I chose (flag if you disagree)

1. **Engagement default tab:** the user's last tab, else **Files** (instead of Overview).
2. **Inbox is per firm.** Other firms appear as unread counts in the switcher.
3. **Firm Group is hidden from daily navigation.** It appears only as headers in the switcher and in
   billing/settings.
4. **Admin Overview** becomes a sidebar item instead of the landing page. Admins land on Home like
   everyone else.
