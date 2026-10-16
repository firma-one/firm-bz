# Retire the legacy tokens, the `v2:` variant and the old fonts

Status: built 2026-10-16 with Deepak's go-ahead (all three recommended decisions). Follows the
Phase 7 cleanup in `ui-ux-overhaul.md` (commit `33f36605`). See **As built** at the end.

## Where things stand

- **Two token scopes** in `app/ui-tokens.css`: `:root` (legacy values) and `[data-ui='v2']`
  (Notion values, set on every `/d` route).
- **The `v2:` variant:** about 70 lines across 17 shared primitives (Button, Input, Select,
  Dialog, Dropdown, Toast, Tabs…), plus `cnV2` in `lib/utils.ts`. Each primitive carries the legacy
  look plus a `v2:` layer.
- **Old dashboard CSS:** `globals.css` has about 34 `.d-app` rules: Work Sans / Space Grotesk /
  JetBrains Mono, the `d-title`/`d-section` helpers, and remaps of slate colors to the old pearl
  palette.
- **Two Google Fonts CDN `@import`s:** Inter, Work Sans, Space Grotesk, JetBrains Mono. The fonts
  are also loaded through `next/font`, but `font-headline`, `font-work-sans`, `.blog-font` and
  `.d-app` name the families literally, and only the CDN provides those names.

Who still sees the legacy values (traced through imports):

| Surface | Shared parts it uses | Effect of retiring |
|---|---|---|
| Sign-in, sign-up, invite, maintenance | Button, Input, Tooltip | New UI look (emerald action, flat 32px buttons) |
| Checkout, error and not-found pages | Button, Toast | New UI look |
| System admin (`/system`) | Badge, Button, Dialog, Input, Select, Tabs, Textarea | New UI look |
| Blog / docs / FAQ (`/resources`) | Button, Dialog, Dropdown, Sheet, Toast | New UI look where those appear |
| Marketing site | 3 CTAs (fully restyled by the caller), contact and waitlist inputs | Pinned: stays as it is |
| Demo (`/demo`) | The old dashboard look (`.d-app`, slate classes) | Kept as it is, scoped to the demo |
| Onboarding | The legacy frame with `.d-app` | Moves onto the New UI styling |

## Plan

1. **Fonts — no visible change.** Point `font-headline`, `font-work-sans`, `.blog-font` and the
   kinetic aliases at the `next/font` variables already loaded in `app/layout.tsx`. Add JetBrains
   Mono through `next/font` for the demo. Delete both CDN `@import`s; that saves a render-blocking
   request on every page.
2. **One token scope.** Move the Notion values into `:root` and delete the `[data-ui='v2']` token
   block. The shadcn base variables get the warm neutrals everywhere.
   - `--primary` becomes emerald-700 (#047857) everywhere, the accessible shade the app already
     uses. Firm branding still overrides it inside `/d` (`use-brand-accent.ts`).
   - `data-ui="v2"` stays only where something still keys on it, or goes entirely if nothing does.
3. **Flatten `v2:`.** In each primitive, the New UI classes become the base classes and the legacy
   ones go. Remove `cnV2` and the Tailwind variant. Pin the marketing CTAs, contact form and
   waitlist input to their current look at the call sites, so the marketing site doesn't change.
4. **Old dashboard CSS.**
   - Delete the `.d-app` remaps, helpers and font rules from `globals.css`.
   - The onboarding frame and the profile popover drop `.d-app`.
   - The demo keeps its look through a demo-only stylesheet (`app/(demo)/demo/demo.css`), until the
     demo itself is redesigned.
5. **Verify.**
   - Typecheck, full test suite and a production build.
   - Before/after screenshots of sign-in, sign-up, the marketing home, contact, a blog post, the
     demo and an error page. These are public pages, so the in-app browser can load them without
     signing in.
   - Onboarding and system admin need your signed-in check.

## Decisions for Deepak

1. **App entry pages adopt the New UI look:** sign-in, sign-up, invite, checkout, error pages and
   system admin. *Recommended:* they're part of the product, and today they still show the old blue
   buttons.
2. **One emerald for `--primary`:** #047857 everywhere instead of #069668 outside `/d`. #069668 is
   only 3.8:1 against white text. *Recommended.*
3. **Marketing site and demo stay visually as they are.** The demo shows the old app UI, so it
   deserves its own redesign later. *Recommended.*

## Out of scope

- Dark mode (`.dark` block untouched).
- Redesigning the demo or the marketing site.
- Replacing hard-coded hex colors (`text-[#45474c]`…) in components outside the shared primitives.

## As built (2026-10-16)

- **Fonts:** this Next version registers `next/font` faces under their real family names, so the
  two CDN `@import`s were pure duplicates. They're gone. Work Sans gained 600/700 (the CDN had
  supplied them), and JetBrains Mono loads only in the demo layout (`--font-demo-mono`).
- **Tokens:** `ui-tokens.css` has one `:root` scope with the Notion values and the shadcn base
  variables, including the pinned emerald `--primary`. `globals.css` keeps only the variables
  it alone defines. `data-ui="v2"` now only switches the app's typography to Inter.
- **`.marketing-site`** pins the old base values the marketing brand was designed with: slate-800
  headings, the cooler borders, and the 0.625rem radius its `rounded-sm/md` corners derive from.
  - It's applied by the marketing layout and a new `resources/layout.tsx` (`display: contents`).
  - **Deviation:** sign-in and sign-up turned out to be designed in the marketing brand (lime CTA,
    Space Grotesk), not on the shared defaults, so they got `.marketing-site` too instead of a
    half-change of 2px corners.
  - The contact form's dropdown renders in a portal, so its radius is pinned at the call site.
- **`v2:` flattened** in 17 primitives and two app files by a script that keeps exactly what the
  New UI rendered: within a string a `v2:` class beats the plain one, and inside `cva()` the
  base's `v2:` classes also beat plain classes in later variant strings.
  - **Fixed by hand:** Toast (template strings; its colored left border was always hidden by the
    New UI's `border-0`, so the accent class went), the Skeleton (`animate-shimmer` is unknown to
    tailwind-merge, so `animate-pulse` was removed by hand), Dialog's hidden `SquareX` icon, and
    dead `ring-*`/border-color classes.
  - `cnV2`, its tests and the Tailwind variant are deleted.
- **`.d-app` CSS removed from `globals.css`:** the fonts, the `d-*` helpers, the slate remaps,
  View As and `.blog-font`.
  - The remapped classes moved onto tokens in 36 app files (108 replacements):
    - `bg-slate-50` became `bg-surface-subtle`
    - `hover:bg-slate-50` and `hover:bg-[#f3f4f6]` became `hover:bg-surface-hover`
    - `border-slate-100` became `border-line`
    - `text-slate-900` became `text-fg`
  - These are small shifts toward the New UI palette. Logo and BrandName were left alone because
    the marketing site renders them.
  - The `d-app` class stays on the app shell and the onboarding frame as a hook (print rules,
    the floating chat's scroller lookup).
  - `page-breadcrumb.tsx` had no users and is deleted.
- **Demo:** `app/(demo)/demo/demo.css` carries the legacy token values (`.demo-tokens`) and the
  old dashboard rules (`.demo-app`).
- **Verified:**
  - Computed styles of headings, buttons and fields compared before and after on the home page,
    contact, sign-in, sign-up, the demo, the FAQ and the 404 page. All match except the 404
    heading, which takes the New UI near-black per decision 1.
  - No Google Fonts requests.
  - Typecheck clean (bar the stale generated route types, which the build regenerates); tests
    993 passed with the 13 known Drive failures.
  - Signed-in pages (app, onboarding, system admin) need Deepak's check.
