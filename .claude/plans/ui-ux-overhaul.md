# Plan: UI/UX Overhaul — Notion's look, Linear's information architecture

Branch: **`dev`**, behind the per-user New UI toggle. Work started on `feature/ui-ux-overhaul` and
moved to `dev` on 2026-10-15 at Deepak's request: Phase 0 was replayed as `2b9f5f03` and the
branch deleted. See **Delivery** for the rules that make building on `dev` safe.

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

### Phase 1 — Primitives v2 ✅ (uncommitted, 2026-10-15)

**How v2 styling layers on without touching v1:**
- A `v2:` Tailwind variant (`[data-ui="v2"] &`, in `tailwind.config.js`) applies a class only when
  the New UI is on.
- Primitives keep every v1 class exactly as it was and add `v2:` classes alongside. The attribute
  selector gives `v2:` classes the specificity to beat the v1 class for the same property.
- `cnV2(classes, className)` in `lib/utils.ts` drops any `v2:` class whose property the caller's
  `className` overrides, so caller overrides still win in v2.
- `cn` now uses `extendTailwindMerge`, so `text-ui`/`text-caption` count as font sizes and
  `rounded-control` and `shadow-popover` as radius and shadow.
- Tests are in `lib/utils.test.ts`.

**Restyled (v2 only):**
- **Button:**
  - Variants: `default` gets an emerald fill (the plan originally said "secondary"; most default
    Buttons are primary CTAs). Outline and secondary become hairline neutrals; ghost becomes muted
    text with a hover background.
  - No shadows or press-scale.
  - Sizes: 28, 32 and 36px.
- **Fields:** Input, Textarea and the Select trigger are 32px, with a `line-strong` border and an
  emerald focus ring.
- **Menus:** Select content and DropdownMenu get `rounded-card` and `shadow-popover`, with no
  border. Items are 14px with a warm hover; labels are 12px muted.
- **Dialog / Sheet:**
  - The scrim is `rgba(15,15,15,.6)` and the panel has `shadow-dialog`, with a 10px radius on
    Dialog.
  - One close icon (`X`) everywhere; v1 keeps `SquareX` via a `v2:hidden`/`hidden v2:block` pair.
- **Tabs:** underline tabs.
- **Tooltip:** light and dark variants, both with Notion styling.
- **Smaller controls:** Avatar is round. Checkbox, Switch, Progress, Skeleton and Badge follow the
  token colors and shapes. The custom Toast stack drops its colored accent bar and mono labels.

**New v2-only primitives (token classes, no `v2:` prefix):**
- `Tag` and `StatusPill` (`components/ui/tag.tsx`), backed by `lib/ui/status-colors.ts`, the one
  status → color/label map.
- `SectionLabel`, `Kbd`, `PropertyList`/`PropertyRow`, `ListGroup`/`ListRow`, `PageHeading`,
  `EmptyPanel`.

**Codemod:** `frontend/scripts/ui-token-codemod.mjs` runs as a dry run by default; `--write`
applies it.
- A dry run finds 2,392 exact hex → token rewrites across 113 files.
- It skips anything that can't map exactly: opacity suffixes, `#f3f4f6` under hover, and hexes
  without a token.
- It runs per screen in Phase 6. Before that run it needs one addition: a check that skips a
  class sharing an element with another class of the same color utility. Such pairs exist where a
  raw `className` isn't passed through `cn`, and renaming could change which class wins.

**Verified:**
- Typecheck is clean, and the suite's only failures are the 13 that already fail on `dev`.
- `/demo` tabs keep their caller overrides in v2.
- Rendering the primitives' exact class strings in both shells shows v1 unchanged and v2 restyled.

### Phase 2 — Shell v2 and responsive ✅ (uncommitted, 2026-10-15)

**New components in `components/shell/`:**
- **`AppShellV2`:**
  - 240px sidebar, collapsible with `[` or its button; the state persists in
    `uiPrefs.sidebarCollapsed` via `setSidebarCollapsed`.
  - A 44px header bar and the content column.
  - The right pane docks at ≥1024px and overlays below that. It no longer collapses the sidebar.
  - Below 1024px the sidebar is a left `Sheet` drawer (`SheetContent` gained an additive
    `hideClose` prop).
  - Mounts the existing `CommandPalette` until Phase 5.
- **`SidebarV2`:**
  - Top: workspace switcher, then Search (⌘K), Home (firm root until Phase 3), and Inbox
    (`/d/u/notifications` until Phase 4).
  - Favorites: bookmarked engagements and documents in this firm.
  - "Your engagements": grouped by client, open engagements only, with a status dot and up to 8
    clients, followed by "All clients".
  - Firm section: Overview, Members and Settings only with `can_manage`; Calendar and Doc Search
    for everyone else.
  - A profile menu with the New UI switch.
  - EC/EV-only users see "Shared with you" and no Firm section.
- **`WorkspaceSwitcher`:**
  - Firms grouped by Firm Group.
  - Switching runs the same `switchFirm` → session refresh → permission rebuild →
    hard-navigation sequence as `FirmSwitchDialog`, so `FirmMember.isDefault` and the JWT now
    track the last firm chosen.
- **`HeaderBar`:**
  - Breadcrumbs built from the URL and named from the shell data; on phones only the last two show.
  - AI credits.
  - Interim `RemindersPanel` and a Notifications link (this keeps the daily-digest catch-up) until
    Phase 4.
- **`ShellDataProvider`:**
  - Calls `getShellSidebarData(firmSlug)` (`lib/actions/shell.ts`). This is a light query using
    the same membership rule as `getFirmHierarchy`, plus favorites filtered to engagements the
    caller can see.
  - Gets `can_manage` from `/api/permissions/firm` and applies View As.
  - Falls back to the default firm on pages without a firm.

**Wiring:** `DLayoutClient` returns the v2 frame early when `uiShell === 'v2'` (except onboarding).
It passes the same banners, right pane, progress panels and demo tour, so behavior is shared. The
legacy JSX is untouched.

**Verified:**
- Typecheck is clean.
- 11 component tests: sidebar role gating, completed-engagement hiding, active state,
  external-user view, favorites, and breadcrumbs.
- 7 access tests for `getShellSidebarData`: no data without a session or `FirmMember`; the
  membership where-clause; favorites limited to visible engagements; the EC/EV-only flag.

**Not yet seen in the running app:** the server only picks v2 after the `uiPrefs` migration is
applied (`npm run build`).

### Phase 3 — Server-side recents, landing and Firm Home ✅ (uncommitted, 2026-10-15)

**Recording visits:**
- `recordVisit(path)` (`lib/actions/recents.ts`) is called by the v2 shell (`useRecordVisits`)
  1.2s after the user settles on a page, including on hash changes.
- It records the deepest visible entity (engagement > client > firm) with the full path. It
  writes nothing unless the caller can see that entity right now, using the `getFirmHierarchy`
  membership rule and a group-slug check.
- `?landed=` is stripped from the stored path, and rows are pruned to the newest 50 per user.
- `importLegacyRecents` brings in the old `fm_nav_recents_*` localStorage entries once per browser.
  It accepts their epoch-millisecond `visitedAt` and never overwrites a newer row.

**Reading recents** (`lib/recents.ts`, server-only):
- `getRecentVisits` re-checks access on every read: firm membership, engagement membership (not
  deleted) and client reach. It uses live names, skips firm-level rows (so Continue never points at
  Home), and returns nothing until the migration exists.
- `getLastVisitedFirmId` and `getLastEngagementTab` serve the landing and the default tab.
- `parseAppPath` is the shared parser.

**Landing:** `resolveDefaultFirmLandingPath` → `resolveV2LandingPath`, for v2 only. It picks the
last-visited firm, then the `isDefault` firm (which the v2 switcher now maintains), then the only
firm. With none of those it falls through to the v1 pickers.
- No arrival overlay for v2.
- A bare `/d` (no `entry=auth`) still shows the workspace list, which is the "All workspaces…"
  target.
- A deploy's forced `redirect=/d` already auto-resolves (`post-auth-target.ts`).

**Engagement default tab (v2):** the last tab from recents, else Files. Existing tab-permission
redirects still apply.

**Firm Home** (`components/home/firm-home.tsx`): the bare firm URL in v2; any `?tab=` keeps the
legacy firm view. Sections:
- Greeting in the viewer's timezone.
- **Continue:** one large card plus four smaller ones.
- **Needs you:**
  - Deliverables in review on engagements the user leads.
  - Intake uploads pending.
  - AI summary drafts pending review.
  - Review / @mention reminders.
- **Due soon (14 days):**
  - Deliverables assigned to the user. EC/EV users see only stages their role may see.
  - Engagements the user leads, never completed ones.
  - Dated reminders, firm-scoped.
- **My engagements:** a Linear-style list with an Open/All toggle and grouping by client or status.

`getMyWork` (`lib/home/my-work.ts`) starts from the user's own `EngagementMember` rows, and runs
the approval queries only for engagements they lead.

**Not done yet:** "Unanswered client threads" in Needs you. Firm-wide it is the admin Insights scan
of up to 2,000 messages, and a per-user version needs a thread model. Follow-up.

**Verified:**
- Typecheck is clean.
- 23 new tests:
  - Path parser.
  - `recordVisit`: membership-gated writes, group-slug check, `landed` stripping, pruning.
  - Legacy import: never overwrites newer rows.
  - `getRecentVisits`: access re-check, firm-row skip, works before the migration.
  - `getMyWork`: membership scope, lead-only approvals, EC/EV stage filter, firm-scoped reminders.
- All three raw SQL queries ran read-only against local Postgres.

### Phase 4 — Unified Inbox ✅ (uncommitted, 2026-10-15)

**Route:** `/d/{g}/f/{f}/inbox` (`app/(app)/d/[groupSlug]/f/[firmSlug]/inbox/page.tsx`). It
requires firm membership and shows only the caller's own items.

**`InboxView`** (`components/inbox/inbox-view.tsx`) has two panes.
- **List:**
  - "To do" holds this firm's visible reminders: overdue first, then soonest, undated review and
    @mention requests last.
  - "Notifications" comes from `/api/notifications?firmId=` (this firm plus platform-wide; the API
    keeps its RLS and retention cleanup), newest first.
  - Unread items show a dot (red when overdue).
- **Detail pane:** Open, Done or Dismiss, and Hide for reminders.
- **Keyboard:** `j`/`k` or arrows, Enter, `e`, `h`.
- **Read state:** selecting a notification marks it read; there's also "Mark all read".
- **Mobile:** the list, then a full-screen detail view with a back button.
- **Actions reuse existing endpoints:** notifications PATCH/DELETE, `markReminderDone`,
  `hideReminder`.
- **Merge logic:** pure, in `components/inbox/inbox-items.ts`.

**Badges:** `getInboxCounts()` (`lib/actions/inbox.ts`) returns, per firm for the signed-in user:
unread notifications, plus reminders that are due today, overdue or undated (the same set the
digest counts). Platform notifications are added to every firm.
- `ShellDataProvider` loads the counts on mount, on the `firma:inbox-changed` event, and every
  60s.
- They appear on the sidebar Inbox item, the header Inbox icon (with a dot), and next to other
  firms in the workspace switcher.

**Header:** the interim `RemindersPanel` and Notifications link are gone in v2. The daily-digest
catch-up the panel used to do is now a once-a-day toast (`useDailyDigestToast`, same server-side
claim).

**Fixed along the way:** the bell no longer depends on the JWT's active firm. The Inbox always
passes the firm from the URL.

**Left as is:**
- **`/d/u/{notifications,reminders,recent,bookmarks}` stay reachable.** Nothing in v2 links to
  them, but the Profile page's tabs still do. Redirecting them was dropped to keep v1 identical.
- **Platform-wide notifications can't be dismissed.** The existing DELETE only removes
  firm-scoped ones, so a dismissed platform notification reappears on reload.

**Verified:**
- Typecheck is clean.
- 13 new tests:
  - Merge rules.
  - Counts: user-scoped, due/overdue/undated only, signed-out.
  - Inbox view: firm filtering, `e` → done, select → mark read, Dismiss → DELETE, Enter → open.
  - Shell: Inbox link, badge and breadcrumb.

### Phase 5 — ⌘K v2 ✅ (uncommitted, 2026-10-15)

**`CommandMenu`** (`components/shell/command-menu.tsx`) replaces the legacy palette in the v2 shell.
- **Opening:** ⌘K / Ctrl+K, or the sidebar's Search item.
- **With an empty query:** Recent (the same access-checked recents Home uses), then Go to (Home,
  Inbox, Clients, Calendar, Doc Search, and for admins Overview, Members and Settings), then
  Switch workspace (when there are 6 firms or fewer), then Actions (Profile, Toggle sidebar,
  Keyboard shortcuts).
- **With a query:** `quickSearch` results first, then matching commands.
- **Keyboard:** ↑↓, Enter, Esc. Searches are debounced at 180ms and stale responses are dropped.

**`quickSearch(q, firmSlug)`** (`lib/actions/quick-search.ts`):
- **Engagements:** the caller's own `EngagementMember` rows, not deleted, in firms they belong to,
  across all of their firms.
- **Clients:** the `getFirmHierarchy` rule.
- **Files:** current firm only, for queries of 2+ characters, using the same scope as the existing
  Doc Search: `computeGlobalSearchAccessScope`, the per-document grant check for EC/EV, and the
  same exclusions for private- and intake-locked documents.
- **Other details:** wildcards in the query are escaped. Results from other firms are labeled and
  link under their own firm. Files open through the `#doc-file:` deep link.

**Shortcuts** (`use-shell-shortcuts.ts`):
- G then H / I / C / L / D, plus O and S for admins.
- `?` opens a cheat sheet (`shortcuts-dialog.tsx`); `[` toggles the sidebar.
- Ignored while typing or when a dialog is open.
- The Inbox ignores a key that follows G, so G-then-H goes Home instead of hiding a reminder.

**Shared code:** `useSwitchFirm` is extracted from the switcher and reused by ⌘K.

**Verified:**
- Typecheck is clean.
- 14 new tests:
  - Search scope: engagement and client where-clauses, cross-firm labeling, file scope and
    wildcard escaping, no file search for non-members, single characters, users without
    engagements, or no firm.
  - Menu: recents, admin gating, type-to-search, Enter.
  - Shortcuts: G-then-I, ignored while typing, admin-only targets.
  - Inbox: the G-then-H conflict.
- The file-search SQL ran against local Postgres (admin, empty scope and escaping cases).

### Phase 6 — Redesign the inner pages (in progress, from 2026-10-15)

**Deepak's feedback after trying Phases 1–5:**
- Home and recents are right.
- The inner pages barely changed. Cards have too many nested boxes, tables should follow Notion's
  table, and forms need an overhaul.
- He is happy to drop Firma's own design character entirely, adopt Notion's design language, and
  borrow Linear's information architecture for the inner pages.

**Decisions (2026-10-15):**
1. **Redesign in place.**
   - The new UI is now the default for everyone: `normalizeUiShell` treats anything but an
     explicit `v1` as `v2`, and the pre-paint script applies v2 unless the opt-out cookie says v1.
   - Pages are restyled directly, without `v2:` duplicates; that rule stays only for the shared
     primitives already built.
   - The toggle remains as an opt-out escape hatch. The old shell is deleted after Deepak signs
     off (Phase 7).
   - Production has only Deepak, so shipping the in-progress redesign is low-risk.
2. **Tables:** Notion's table look plus inline property editing (status, due date, assignee) where
   APIs already exist. No saved per-table views yet.
3. **Order:**
   1. Engagement page: a Linear project-style header and properties, Files as a Notion table,
      Board, Comments, Overview.
   2. Client pages and lists.
   3. Firm settings forms, Members, Audit.
   4. Billing, onboarding, the remaining dialogs.

**Design rules for every inner page:**
- **Cards:** at most one level of container. Sections are a heading plus content separated by
  whitespace or a hairline — no card inside a card, no shadow on in-page cards, no colored header
  bars.
- **Notion table:**
  - The header row is 32px in `text-small` `fg-muted`, with a column icon; the table has no outer
    border.
  - Row lines are `border-line` hairlines; rows are 36px with a `surface-hover` hover.
  - The first column is the title; row actions (⋯) appear on hover.
  - Property cells use `StatusPill`/`Tag`, avatars and dates, and are clickable to edit in a
    popover.
- **Notion forms:**
  - Label/value property rows (`PropertyRow`), not stacked boxed fields.
  - Inputs are borderless until hover or focus.
  - Group headings in `text-h3`; one primary action, bottom-right, or autosave.
- **Linear information architecture:**
  - Every entity page has the same top block: title, a properties row (status, lead, dates,
    members), then underline tabs.
  - Lists can be grouped and show item counts.
  - Detail opens in the right pane, not a new page, where possible.

**Progress (uncommitted, 2026-10-15) — engagement page:**
- **New primitives:** `ui/popover`, `ui/notion-table`, `ui/property-cells` (`StatusProperty`,
  `DateProperty`, `PersonProperty`). `PropertyRow` is tightened to 32px rows with a narrower label
  on phones.
- **Header and tabs:** `projects/engagement-header.tsx` holds the title, description and a properties
  row: inline status (never Completed; closing and reopening stay in Settings), lead, members, and
  start and due dates. The breadcrumb shows in v1 only. Tabs are underlined.
- **Files:** a Notion table header with column icons, 36px rows, and an inline due date for
  managers (`FileDueDateCell`, through the existing due-date route).
- **Flattened:** Overview (insight cards and stat tiles), Board (lane theme from the status
  palette), and Comments.
- **Settings:**
  - Details, Commercial and Tracking are property rows with borderless fields.
  - Status uses the same picker as the header and includes Completed.
  - Save is disabled while the name is blank.
  - The danger zone is a Linear-style row.
  - Fixed the `initialTags = []` default, which re-ran the sync effect on every render.
- **Shared pickers:** `DateTimePicker` and `SelectWithCustomEntry` are restyled to tokens, which
  changes them on every page that uses them.
- **Members:**
  - One Notion table grouped by role, with Linear group headers: count, description and
    "Invite {role}".
  - Invitations are rows in their own group.
  - Clicking the role cell opens the role dialog. Row actions are shown only to managers; the old
    no-persona fallback showed them to everyone.
  - The tab has a slim toolbar and an `EmptyPanel` for when Drive isn't connected.
- **Tests:** `property-cells`, `engagement-header`, `engagement-settings-form` and `member-list`.
  An isolated production build passed with no warnings.

- **Audit (`audit/audit-with-filters.tsx`, shared with the firm and demo audits):**
  - Linear-style filter chips replace the stacked labeled fields.
  - Ghost icon buttons; the events are a Notion table and the event icons are muted.
  - The Client and Engagement columns and sorts show in firm mode only.
- **Deliverable detail pane:**
  - Status and Due are peek property rows. Due uses `DateProperty`, since the route stores a
    date; status options are `StatusPill`.
  - Submit and Request changes are plain buttons.
  - Underline tabs and a ghost description field.
  - Document rows show a status pill and inline status, assignee and due chips instead of
    labeled boxes.
- **`DateProperty`:** a bare `yyyy-MM-dd` is a local calendar day, both when displayed and
  when edited; this is tested in America/Los_Angeles.
- **Doc comments pane:**
  - Comments are a hairline list, not cards. Filters and View are disclosure rows, not boxes.
  - Reactions are neutral pills, with yours tinted in the accent.
  - Mentioning you is shown as an accent left rule.

**Fixes from Deepak's review (2026-10-15, uncommitted):**
- **Home:** "Continue where you left off" is an even grid of identical cards showing only full rows
  (1–3, or 6), instead of a featured card beside small ones.
- **Sidebar collapse:** `setSidebarCollapsed` moved out of the state updater. Calling it there
  caused "Cannot update a component (Router) while rendering AppShellV2" and saved the setting
  twice.
- **Loading:**
  - `components/ui/shimmer.tsx` adds skeletons with a sweep. The Files table loads as skeleton rows
    on its own grid, and `Skeleton` sweeps in v2.
  - `LoadingSpinner` is a small conic-gradient arc that inherits the text color.
  - Breadcrumbs show a placeholder instead of humanized slugs while shell data loads.
- **Second review round:**
  - **Overview summary:** the AI summary draft and edit cards are flat `surface-subtle` blocks
    with token fields and `Button`s; the header icons are neutral.
  - **Sidebar:** it animates open and closed (width, 150 ms, inert when collapsed, no motion for
    reduced-motion users).
  - **Board:** the `100vh − 220px` min-height is gone, which caused a scrollbar beside the
    detail pane.
  - **Sidebar rows:** client rows show a building icon that swaps to the chevron on hover;
    engagement rows show a briefcase icon with a status dot.
  - **Brio chat:** the pane uses tokens. The header is plain, answers have no bubble (Notion
    AI), and the chips and composer use the standard controls.
  - **Status pill in selects:** it is wrapped in a `div`, because `SelectTrigger` clamps direct
    `span` children (`[&>span]:line-clamp-1`), which misaligned "To do" and hid its dot.
  - **Document action menu:** token pass; danger items are `text-danger`, approve is `text-action`.
  - **Access locks:** `ui/access-lock.tsx` is one lock icon with a "who can see this" tooltip, used
    on the engagement's internal tabs and the sidebar's admin-only items.

**Progress (uncommitted, 2026-10-15) — client and firm pages:**
- **Client page:**
  - `projects/client-header.tsx` is a Linear-style header like the engagement's: name,
    description, then a properties row with inline status for managers, industry, website,
    client since (or expected close for a prospect), engagement count and tags.
  - `ui/header-prop.tsx` is the tooltip-labeled property both headers share.
  - Underline tabs, with locks on Contacts (firm admins) and Settings (client managers), and a
    "New engagement" button.
  - Engagements are a Notion table: name, status, lead, start, due (red when overdue), your role
    and last update. A row click opens the engagement.
- **Contacts:** a Notion table (name with a Primary tag, title, email link, phone, tags) with a
  search box and "New contact". Managers edit by clicking a row; the dialog uses tokens.
- **All clients:** the table is the default view, and the last view picked is remembered
  (`fm-clients-view`). The gallery is flat cards with a brand-tinted logo tile and no corner
  triangle. Follow-ups due within two days are tags.
- **Firm views (v2):** the big firm header and boxed tab strip show in v1 only. The sidebar's
  Firm section picks the view, and Audit is added there with a lock. Each view gets a heading
  with its count, a lock and its action: Print, the table/gallery toggle, or New client. Doc
  Search and Members keep their own headings.
- **Firm members:** a Notion table (name, email, role tag, added) with an Invite button in the
  heading. Invitations are rows with resend and cancel on hover. The client Members tab is
  still switched off in code (`false &&`), so it was left alone.
- **Settings forms:**
  - **Client:** Details and Relationship are property rows. Expected close shows only for a
    prospect and Client since only for a client; both are still saved. Storage, Branding and a
    danger-zone row follow. Branding toggles between firm branding and custom.
  - **Firm:** the five accordions are underline tabs: General, Branding, App settings and
    Storage. `?section=` deep links still work; `danger` opens General and scrolls to the danger
    zone. App settings is property rows plus Linear switch rows, and event notifications are a
    Notion table. Storage stays mounted while hidden, so "no connector yet" still opens it.
  - The field classes are shared from `ui/property-list.tsx` (`PROPERTY_FIELD_CLASS` and the
    others) across the engagement, client and firm forms.
- **Tests:** `client-list.test.tsx`.

**Third review round (2026-10-15, uncommitted):**
- **Doc Search:** a `PageHeading` with History as an outline button. The `ki-*` palette maps to
  tokens, and the page background is the surface (not gray). The search box is a plain card
  with a segmented Filters/Ask toggle and 28px filter buttons. Results are hairline rows, not
  shadowed cards; the match type is a tag, and the empty states are `EmptyPanel`s. The history
  pane is a flat card.
- **Calendar:** a React toolbar replaces FullCalendar's (title, Today, previous and next,
  refresh, and a Month/Week/Day/Agenda segmented control). The grid is Notion Calendar style
  under `.firm-calendar--notion`: hairlines, sentence-case weekdays, today as a filled circle,
  and events as tag-colored chips (`getEngagementTagColor`). The demo calendar keeps the old
  rules. The sidebar is flat rows with tag-colored checkboxes, and the event dialog had a token
  pass.
- **Home agenda:** "Agenda" (`home/agenda-week.tsx`) replaces "Due soon".
  - **Overdue row:** the viewer's past-due work from `getMyWork` (assigned deliverables,
    engagements they lead, their own dated reminders), oldest first. Up to six chips, then
    "+N more".
  - **The week:** today and the next six days as day columns, with up to three event chips each
    and a "+N more" link to the calendar. It reads `getFirmCalendarData`, so it follows the
    calendar's access rules. Upcoming reminders join the week, since the calendar has none.
    Upcoming deliverables and engagements already appear as calendar events, so they aren't
    added twice.
  - **Timezone:** days are bucketed in the viewer's timezone after mount, and Overdue is anything
    before the viewer's today. On phones only days with events show.
  - **What's lost:** items due 8–14 days out, which "Due soon" covered, now show only on the
    calendar.
  - **Cleanup:** `DueSoonSection` is kept but no longer rendered, until Deepak signs off on its
    deletion.
- **Firm Overview:** the brief, Business overview and Action center are single flat cards like
  the engagement Overview. Stat tiles are neutral and the pipeline is a thin bar in tag colors.
  Action center rows are Linear-style, without shadows or scaling; status chips are tags and the
  all-clear states are calm instead of green banners.
- **Workspace pickers:** `/d` and `/d/{group}/f` use a `PageHeading` and `projects/workspace-card.tsx`
  (the All clients gallery card), with a "Current" tag and a role tag. The breadcrumb shows in
  v1 only, and the switch dialog had a token pass. `FirmsView` (the `/d` fallback for a
  single-group admin) is unchanged.
- **Fix:** `text-fg-subtle/40` doesn't work; neutral tokens take no opacity modifier.
- **Tests:** `agenda-week.test.tsx`.

**Progress (uncommitted, 2026-10-15) — dialogs and storage sections (order item 4):**
- **`ConfirmDialog`:** Linear-style. A tag-tinted icon tile, a visible sentence-case `DialogTitle`
  (it was visually hidden and duplicated as uppercase text), the consequence in muted text, and
  `sm` outline and destructive/default buttons bottom-right. No header strip and no tinted body.
  Every confirm in the app inherits this.
- **Remaining modals**, in a scripted pass from the scratchpad scripts (codemod `--palette`, then
  typography, surface and palette passes). These are add client, engagement, firm and reminder;
  invite member, firm and client; client details; engagement settings; firm switch; Drive import;
  secure access; document share and edit; file review; support create and view; recent
  sessions; what's new; broadcast; data privacy; account type; and switch account.
  - Uppercase mono labels and uppercase button text are gone. Dialog titles are `text-ui
    font-semibold`.
  - Tinted header and footer strips are plain hairlines, and brand-tinted icon tiles are neutral.
  - Focus rings use the accent. Create dialogs drop the gray body and the bordered tiles inside
    it, so there's no card in a card.
  - Error, success and warning banners use tag tokens, and green buttons use the accent.
- **Storage sections:** `FirmDriveSection`, `ClientDriveSection`, the OneDrive and Google Drive
  workspace roots, the connector tab and the Drive manager had the same pass.
- **Left as is:** the file review and document edit sheets keep their gray canvas, since they
  are full-screen work surfaces. The debug and system-admin modals were not touched.

- **`FirmsView`** (the `/d` fallback) has a `PageHeading` with the gallery/list toggle and a "New
  firm" button. `FirmList` cards keep their link and switch behavior with flat card styling.

- **Billing** (`components/billing/*`):
  - **Page:** a `PageHeading` ("Billing"; "Billing & plans" in onboarding) at `max-w-4xl`, with
    the breadcrumb in v1 only. Sections run Current plan, then Plans, then Payments, and the
    Payments trust cards are now a quiet section.
  - **Current plan:** one flat card with property rows (entity, plan, valid until), a "Manage"
    outline button, usage on thin bars, and AI-credit segments mixed from the accent.
  - **Plan cards:** flat with a hairline. The current plan has a ring and an "Active" tag and the
    recommended plan a blue tag; there are no corner triangles, lifts or dark pills.
  - **Plan card details:**
    - The Annual/Monthly toggle is a segmented control.
    - Features show six, then "Show all N features".
    - Each card has one CTA (accent on the recommended card, outline otherwise).
  - **Tour and dialogs:** the Joyride tooltip reads the tokens. The upgrade dialog and the checkout
    banner are restyled.
  - **Copy:** "Manage subscription", "Secure checkout" and "Subscription canceled" are now sentence
    case and American English. The "Scale as you grow" headline isn't shown anymore (the key
    stays).
- **Onboarding** (`app/(app)/d/onboarding/*`, `components/onboarding/*`):
  - **Layout:** a centered column (`max-w-xl`, wider for the Drive and plans steps) with
    `StepIntro` (caption, `text-h1` question, muted explanation).
  - **Step parts:** Required/Optional tags, flat selectable drive cards, tag-token notices, a thin
    progress bar on finalize, and `greenCta` primaries with ghost Back.
  - **Sidebar:** a Linear checklist with step markers and an active row.
  - **Exit guard:** a centered notice over the scrim.
  - **Unchanged:** no handler, step or sign-out logic changed. Steps 3 and 4 still can't be
    reached (nothing calls `setStep(3|4)`); that was already the case.
  - **Frame:** in v2 the legacy frame (`d-layout-client.tsx`, now used only by onboarding) gets a
    plain surface, token borders and no dot pattern.
- **How it was built:** billing and onboarding were done by two background agents, each confined
  to its own files. I reviewed their diffs for behavior changes: handlers, tour attributes,
  checkout and portal calls, and sign-out all carry over unchanged.

**Fourth review round (2026-10-15, uncommitted):**
- **New UI toggle removed; the new UI is the only UI.**
  - `normalizeUiShell` always returns `v2`, so a stored `v1` preference or cookie is ignored.
  - The pre-paint script in `app/layout.tsx` always sets `data-ui="v2"` on `/d`.
  - The toggle is gone from both profile menus (`sidebar-v2.tsx`, `ui/profile-section.tsx`).
  - The `v1` code paths stay compiled but are unreachable until the Phase 7 cleanup.
- **Billing** — the gray background and the icon buttons with no gap were the v1 shell (the
  toggle was off), and both are gone now that v2 is forced. AI credits now read like a
  context-usage breakdown:
  - **Bar:** one segment per feature in its own tag color (blue, orange, green, yellow, purple),
    with the unused allowance as the gray track.
  - **Legend:** swatch, feature, credits and share in two columns. A "Remaining" row appears when
    a cap is live, and shares are of the allowance, so the rows add up to 100%.

- **Plan cards:** the name sits above its status tag, with the Annual/Monthly toggle fixed
  top-right, so the longer "Active · date" tag no longer pushes the toggle to a second row.
- **Segmented controls** (billing period, Doc Search mode, clients table/gallery, calendar views,
  branding source, firm gallery/list): the browser's black focus outline on the clicked segment is
  replaced by `outline-none focus-visible:ring-2 focus-visible:ring-action/30`, so the ring shows
  for keyboard focus only.
- **Chart palette:** `--ui-chart-{blue,orange,green,yellow,purple,pink,teal}` in `ui-tokens.css`,
  vivid fills for bars, segments and legend swatches. The tag `fg` tones are text colors and read
  dark and muddy as fills. AI credits and the firm Overview revenue pipeline use the new palette.

**Fifth review round (2026-10-15, uncommitted):**
- **Engagement loading — only the tab body shows a skeleton.**
  - **Why it happened:** every tab switch `router.push`es to a new URL in the same catch-all
    route, so `[[...rest]]/loading.tsx` replaced the whole page (an old v1 skeleton) while the
    server re-ran every query. Board had no `loading.tsx` and fell back to the client-level list
    skeleton.
  - **The fix:** `EngagementWorkspace` records a snapshot (header props and its permission-resolved
    tab config) in an in-memory client cache (`engagement-tabs.tsx`). `EngagementPageLoading`
    redraws the real header and tab row from it, with the target tab selected and its pending bar
    running, and only the body is a skeleton.
  - **First visit:** the title and status come from the sidebar's shell data; the tab row is a
    placeholder, so no tabs are shown before the viewer's permissions are known.
  - **Shared pieces:** the tab row is now one component (`EngagementTabsList`) used by both. The
    header caches its member list, so people show at once.
  - **Outer loaders:** the client-level and firm-level `loading.tsx` (`ListPageSkeleton`) hand
    engagement URLs to the same loading state, and give everything else a heading-and-rows
    skeleton instead of the v1 card skeleton. Board has its own `loading.tsx`.
  - **Safety:** the caches are written only in client effects, so on the server (where client
    modules are shared across requests) they stay empty.
- **Entity icons**, reusing the app's existing ones (firm `Building2`, client `Users`, engagement
  `Briefcase`):
  - **Page titles:** firm picker, firm Home, firm views (each with its sidebar icon), Members, Doc
    Search, the client header (logo, else the client icon), the engagement header, and Home's "My
    engagements".
  - **Breadcrumbs:** firm, client and engagement crumbs plus firm and engagement tab crumbs.
  - **Sidebar:** client rows now use `Users`; they had briefly used the firm icon.
- **Avatars:** round everywhere, neutral (`surface-muted`/`fg-muted`), and the same initials from
  `lib/initials.ts` (`initialsOf`: first and last word, an email's local part, one letter for a
  single word). That covers `ProfileBubble` (the files Owner column and its card),
  `UserAvatarWithTooltip`, `PersonAvatar`, the sidebar profile, members tables, Board updated-by,
  support and doc comments, mentions, the profile page and the connected Drive account. Workspace
  and firm marks stay rounded squares. Tests: `lib/initials.test.ts`.

**Sixth review round (2026-10-15, uncommitted) — create dialogs:**
- **What changed:** New firm, New client and New engagement now use the settings forms' layout:
  `PropertyList`/`PropertyRow` with the borderless `PROPERTY_FIELD_CLASS` fields. So create and
  edit look the same.
  - **Status:** the `StatusProperty` chip picker, the same one Engagement Settings and the page
    headers use. Its popover layer (`z-[130]`) sits above dialogs (`z-[121]`).
  - **Required fields first:** Name and Status, plus Description for engagements.
  - **The rest:** behind a Notion-style "More properties" disclosure. `OptionalFieldsSection` was
    restyled; the uppercase mono "OPTIONAL FIELDS" box is gone.
  - **New client:** shows Expected close for a prospect and Client since otherwise, as Client
    Settings does.
- **Shared frame (`components/ui/create-dialog.tsx`):** a visible sentence-case `DialogTitle` with
  a description (no icon tile or header strip), tag-token notices for errors and plan limits (with
  the Upgrade link), and a sticky footer with ghost Cancel and accent Create. The dialogs are 600px
  wide, single column.
- **Default triggers:** "New firm", "New client" and "New engagement", each with a plus icon.

- **Profile menu (`sidebar-v2.tsx`):** adds "View changelog" (`/resources/changelog`) and a "Learn
  more" submenu with "Privacy policy" (`/privacy`) and "Terms of service" (`/terms`). These are the
  same pages the website header and footer link to. They open in a new tab with a trailing
  external-link icon, so the app stays put.

- **Workspace pickers open as a table, like All clients.**
  - **Pages:** `/d` (groups: Name, Firms, Your role) and `/d/{group}/f` (firms: Name, Clients,
    Your role; joinable firms get a "Join firm" action column).
  - **Shared parts:** `projects/workspace-table.tsx`, built on `NotionTable`, with
    `WorkspaceMark` (logo or tinted icon) shared with `WorkspaceCard`.
  - **Toggle:** the table/gallery switch is now one shared component
    (`ui/view-mode-toggle.tsx`), with `useViewMode(key)` remembering the choice per page
    (`fm-workspaces-view`, `fm-firms-view`). All clients uses it too, and the `/d` fallback
    `FirmsView` also opens as a list.
- **Firm groups' icon:** `LayoutGrid`, the existing icon from the switcher's "All workspaces…" and
  the old "Firm Groups" tab, on the `/d` title, the group cards and rows, and the "Workspaces"
  breadcrumb.

- **Sidebar above the firm:**
  - **Picker pages** (`/d` and `/d/{group}/f`): these sit above any firm, so `SidebarV2` replaces
    the firm-scoped navigation (Search, Home, Inbox, Your engagements, Firm) with a "Workspaces"
    section ("Firm groups", "Firms") and "Back to {firm}". That matches the old sidebar, which
    hid the firm section when no firm was in the URL.
  - **Personal pages** (`/d/u/*`, Billing, Support) keep the default firm's navigation, so
    there's always a way back. Tests in `shell-v2.test.tsx`.

**Seventh review round (2026-10-15, uncommitted) — personal area:**
- **Route question:** Home and Inbox stay under the firm (`/d/{group}/f/{firm}`) by design. Phase 3
  ("Landing: per-firm Home") and Phase 4 (Unified Inbox, per firm) chose this because their
  content — recents, agenda, needs-you, notifications, reminders — is scoped to one firm's data and
  permissions. `/d/u/*` holds what doesn't depend on a firm (profile, preferences).
- **Personalization (`/d/u` layout):** a `PageHeading` (`UserCircle`) with underline tabs Profile
  and Bookmarks; the breadcrumb shows in v1 only. Recent, Reminders and Notifications left the
  tabs:
  - Recent is now Home's "Continue where you left off".
  - Reminders and Notifications are now the firm's Inbox.
  - Their old URLs forward through `d/u/moved-page.tsx` to Home or to `/inbox?tab=…` (the Inbox
    now reads `?tab=`), keeping the old page only for someone with no firm. The old components
    are unchanged.
- **Profile tab:** property rows (avatar, first and last name, email read-only with copy), "Save
  changes", then a Notifications section and "Your data".
  - **Notifications section:** the push opt-in, moved from the old Notifications page, as a
    switch row.
  - **Your data** (`DataPrivacyCard`): Linear-style rows with outline buttons, not a card.
- **Broadcast:** unused for now, so it isn't offered anywhere new; its code stays on the old page.

**Eighth review round (2026-10-15, uncommitted) — bookmarks and Support:**
- **Bookmarks move to Home**, so the sidebar stays navigation only:
  - **Home:** a "Bookmarks" list group (`home/home-bookmarks.tsx`), last, under My engagements. Rows show a
    `FileText` icon for documents and `Briefcase` for engagements, plus where each one lives. The
    first eight show, then "Show N more". A hover ✕ beside each link removes the bookmark
    (`DELETE /api/bookmarks`, then the `pockett-bookmarks-updated` event). The section always
    shows. When empty, it says how to add a bookmark: Deepak couldn't find it when it hid itself.
    Today only documents can be bookmarked (the document ⋯ menu). Nothing creates an engagement
    bookmark, though the data supports one.
  - **Data:** `getShellSidebarData(firmSlug).favorites`, so Home shows only bookmarks on
    engagements the viewer can see in this firm. A document bookmark saved without a URL now
    opens the document (`engagementDocFilePath`) instead of the engagement, and an engagement
    bookmark's context is its client.
  - **Sidebar:** the Favorites section is gone.
  - **Personal area:** now Profile only, so the layout is a plain "Profile" heading with no tab
    strip. `/d/u/bookmarks` forwards to Home through `MovedPage`; the table component is unchanged.
- **Support stays in the profile menu**, the same place as Billing. It's an occasional,
  account-level action, not daily navigation. The menu item now shows to firm admins only, with
  the lock, because `/d/support` already redirects everyone else.

**Ninth round (2026-10-15, uncommitted) — cross-firm Home and Inbox:** Home and Inbox moved to
`/d/u/home` and `/d/u/inbox`, across every firm the user may open, with an "All firms" filter.
The bare firm URL now opens All clients. Plan, decisions and as-built notes:
`cross-firm-home-inbox.md`. This supersedes the seventh round's "Home and Inbox stay under the
firm" answer. Also from this round: Tag takes an `icon` prop, so an icon no longer breaks
onto its own line. That fixes the Doc Search match chips, the Primary contact tag, the client
follow-up tags and the Your data request tag.

**Doc Search is Filters only (2026-10-15, Deepak's call):** Ask Brio ran the same search as Filters,
only filling the chips with a paid model call, so it found nothing extra while costing credits and
forcing a mode choice. `ASK_MODE_ENABLED = false` in `global-search-view.tsx` hides the toggle, and
the subtitle no longer mentions it. The interpret route and Ask code stay until sign-off. Billing's
AI credits breakdown drops the "Firm Doc Search" row, except in a period that already spent credits
on it, so the rows still add up.

**Next:** Phase 7 sign-off: visual review of everything above in a signed-in browser, then
cleanup (delete the v1 shell, the `setUiShell` action and `uiPrefs.shell`, `DueSoonSection`, the
old Bookmarks table and personal Recent/Reminders/Notifications pages, and the unused onboarding
and billing leftovers).

**Visual verification** still needs a signed-in session in the browser pane.

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

- **All work happens directly on `dev`**, committed per phase only with explicit approval, and
  pushed only when Deepak says. Unfinished v2 work ships to production switched off, so `dev → main`
  releases can go out at any time.
- **Rules that keep switched-off work harmless:**
  1. **v1 stays pixel-identical.** Shared primitives change only through tokens whose `:root` value
     equals the old literal, or through classes that apply only under `[data-ui="v2"]`. Before
     every push, compare key v1 screens.
  2. **Behavior changes are gated too, not just styling.** The landing resolver, `recordVisit`,
     engagement default tab and any redirect apply only when the user's shell is `v2`.
  3. **Migrations are additive only** until the Phase 7 cleanup. Code reading a new column
     tolerates the migration not having run yet.
  4. **The switch** is shown to system admins in production and to every account locally.
- Shipping v2 code that is switched off is not "a PR cut mid-feature" in the PR #73 sense:
  nothing users can see is half-shipped. Still check `git diff --stat origin/main origin/dev` after
  every merge to `main`.

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
