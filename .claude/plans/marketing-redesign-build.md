# Marketing website redesign — build plan

**Branch:** `feature/marketing-redesign` (from `dev` at `fe00743c`, 2026-10-20).
**Design source:** `.claude/plans/landing-page-redesign.md` (the proposal, revisions 1–29) and the Design
canvas "Firma Landing Redesign" (https://claude.ai/artifact/RJcxws62pBX3MojTpNemTo). The boards that
are the spec: *Desktop — variant: silk ribbon hero*, *Phone — variant: silk ribbon hero*, the sign-in and
sign-up boards, *Pricing — sample inner page* and *Blog article — sample reading page*.
**Status:** in progress. Nothing committed until Deepak approves.

## Decisions taken for the build

The proposal left a few calls open (§6). The build follows its recommendations; each is easy to flip.

| # | Call | Build uses |
|---|---|---|
| 0 | Green or firma blue | Green (decided) |
| 2 | Display face | Space Grotesk 700 for display, Inter for body and UI |
| 3 | Primary CTA | Start free → `/signup`; Take the tour second; "or book a demo" as a link |
| 4 | Brand in copy | firmä |
| 5 | Wrap / Never Share / share expiry | **Never Share: shipped** (Deepak, 2026-10-20), so the pricing row stays. **Engagement closure** (the real "one click revokes client access and pending invites", the honest version of Wrap): exists, but not messaged; Deepak: skip it if it complicates the story, since a survey showed fractional CMOs aren't concerned with the ending phase. **Share expiry**: not confirmed, not claimed |
| 6 | Hero headline | Drive-led ("Run every client engagement from your own Drive.") |
| 7 | Files agent moment | Behind `FILES_AGENT_PUBLIC` in `components/marketing/v2/config.ts`. Off: the 4:30 moment is "Ask Brio on Files" ("What's still in Drafts?"). On: "Tidy the files", as on the canvas |
| 8 | Hero background | The silk ribbon (adopted); the mesh band is retired on the new pages |

## Rules

- **Replace in place; the branch is the fallback** (Deepak, 2026-10-20: "if the new design overhaul can be
  done cleanly without the switch, then let's do it, that's why I asked to start the work on a new
  branch"). No skin switch. The `(marketing)` and `(resources)` layouts are the new shell
  (`components/marketing/v2/marketing-page.tsx`: tokens, fixed header, footer, demo dates); pages render
  content only. `dev` and `main` keep the current site until this branch merges.
- **Legacy code is deleted on this branch once nothing references it** (last phase), so the merge removes
  it in one reviewable step: `components/landing/landing-page.tsx`, `LegacyHeroScreenMock.tsx`,
  `firm-transformation-section.tsx`, the Kinetic/Stitch skins, `components/layout/Header.tsx` and
  `Footer.tsx` (once sign-in, sign-up and docs no longer use them), and their helpers.
- **Tokens, not copies.** Colors, type sizes, radii and shadows come from the `.mk` scope's CSS variables.
- **Motion budget.** Only `transform` and `opacity` animate. Nothing loops except the ribbon, Brio's
  sparkle and the two bento loops. Off-screen work stops. Everything has a final state under
  `prefers-reduced-motion`. The H1 and product screen are never delayed by the canvas.
- **Phones:** no sideways scrollers below 768 px; stack instead.
- **Claims match what ships** (Brio's policy in `lib/ai/assistant.ts`, pricing in `config/pricing.ts`).

## Page coverage (every public page is in the overhaul)

Deepak, 2026-10-20: "Ensure other pages such as Contact Form are covered in this overhaul."

| Route | Source | Design reference | Status |
|---|---|---|---|
| `/` | `components/marketing/v2/home/*` | Desktop + phone variant boards | done; checked at 1440 and 390 in the dev server |
| `/signin`, `/signup` | `app/(app)/signin`, `app/(app)/signup`, `components/signup/*`, `components/marketing/v2/auth/*` | Sign-in / sign-up boards | restyled; the real flows (email check, code, Google, redirects) still need an end-to-end test |
| `/pricing` | `app/(marketing)/pricing`, `components/marketing/v2/pricing/*` | Pricing sample board | done. Checkout intent kept as before (persisted on load, toggle, plan pick and click) |
| `/contact` | `app/(marketing)/contact`, `components/marketing/v2/forms/*` | System (form card from the sign-in board) | done (thank-you state needs a real submission to see) |
| `/waitlist`, `/waitlist/[campaignId]` | `app/(marketing)/waitlist/*` | System (form card) | done; not rendered locally (no campaign rows). Copy to confirm: "launching soon, invitation only" and the Pro referral offer |
| `/go/[campaignId]` | `app/(campaign)/go/*` (own brand bar, no site nav) | System | done; not rendered locally (no campaign rows) |
| `/resources/blog`, `/[category]`, `/[category]/[slug]` | `app/(resources)/resources/blog/*`, `components/marketing/v2/reading/*` | Blog article sample board | done. New index headline "How good firms deliver client work" needs Deepak's OK |
| `/landing/marketing-agencies`, `/fractional-cmos`, `/fulltime-cmos`, `/fractional-execs` | `components/marketing/v2/audience/*` | Home sections (Who it's for, bento, pricing teaser, CTA) | done |
| `/privacy`, `/terms` | `components/legal/*` | Reading template (legal text unchanged) | done; text diffed before/after, only page chrome changed |
| `/resources/faq` | `app/(resources)/resources/faq/*`, `components/marketing/v2/reading/faq-list.tsx` | Reading template + FAQ section | done |
| `/resources/changelog` | `app/(resources)/resources/changelog/*` | Reading template | done |
| `/resources/trust-center` | `app/(resources)/resources/trust-center`, `components/marketing/v2/trust/*` | System; the hero is an interactive systems map (elkjs + React Flow) | done |
| `/resources/docs/**` (9 pages, not in the sitemap) | `app/(resources)/resources/docs/*` | Reading template with the docs sidebar | done; content is stale (describes the older Drive-monitoring product), restyled only |
| Marketing 404 | `app/(marketing)/not-found.tsx` | System | done |
| Cookie consent banner, settings modal, toast (site-wide) | `components/ui/cookie-consent.tsx` | System: pills, Space Grotesk titles, bottle switches, plain copy | done |
| `/tour` | the product demo (app UI) | out of scope: it is the product; only links into it change | — |
| Emails (every template) | `lib/email-templates/*`, `lib/email.ts`, `supabase/magic-link-email-template.html` | System, kept minimal (Deepak, 2026-10-20) | done; see "Emails" below |

## Emails (added to the scope 2026-10-20)

Deepak: "Also include the redesign of the email templates in this scope. Apply the new design system,
but keep the email templates design minimal."

- **One shell** (`lib/email-templates/base.ts` → `renderEmail`): pale green-gray page `#F6FAF8`, one white
  card (12 px radius, hairline `#E3EBE7`), the text wordmark above it, Inter (Space Grotesk where the
  client has it, for headings), ink `#05271C` / body `#3F5650`, and a short footer (why you got it,
  "firmä · The client workspace built on your own Drive · firma.bz", ©). No header bar, gradients,
  images or web fonts. `footerNote` replaces the "member of a workspace" line where it doesn't apply
  (waitlist, admin-created accounts).
- **Building blocks:** `emailHeading`, `emailText`, `detailCard` (gray box: green label, title, muted
  lines), `ctaButton` (electric-green pill with a › chevron), `emailFootnote`; `EMAIL_COLORS`/`EMAIL_FONTS`
  for anything custom.
- **Every template moved onto them:** invite, added to engagement, invite accepted, client comment,
  document intake, document status changed, reminder, the admin sign-up confirmation, the shared
  health report, and the waitlist confirmation and referral notice (its 820 px two-column layout and
  navy header became the single column). Copy is unchanged apart from sentence-case button labels.
- **Bare fragments are wrapped automatically:** `sendEmail` puts any HTML without `<html>` into the
  shell (maintenance notices, the due-soon alert, the deletion-request notice), so nothing goes out
  unstyled.
- **Sign-in code** (`supabase/magic-link-email-template.html`) is on the same shell. It is pasted into
  Supabase (Auth → Email Templates → Magic Link) by hand; the repo file is the source. Deepak updated it in
  Supabase Preview and Production on 2026-10-20 (it doesn't depend on the website changes).

## Phases

1. **Foundations** — tokens and type scale under `.mk`; fonts; `SilkRibbon`; `demoDates`; `Band`
   (surface white | gray | dark, optional slant) and `PageGuides`; pill buttons, eyebrow chips; the card
   motion kit (hover rim and spotlight, touch press, scroll reveal, odometer); the new header and footer.
2. **Home page** — the twelve sections of the variant board, responsive at 1440 / 1024 / 768 / 375,
   with the phone layout from the phone board.
3. **Sign in and sign up** — the same flows and components, restyled onto the ribbon pages.
4. **Pricing** — the inner-page sample.
5. **Reading pages** — blog index and article, resources, legal pages, trust center, FAQ.
6. **Other top-level pages** — contact, waitlist, the audience landing pages (`/landing/*`).
7. **Finish** — metadata and OG for the new H1, Lighthouse (LCP, CLS), accessibility pass, and the
   list of legacy files to delete once Deepak signs off.

## Progress log

- 2026-10-20: branch created; spec boards split into per-section references; `SilkRibbon` and
  `demoDates` (with tests) written. Foundations, header, footer, hero and trust strip built; four
  sections built in parallel by agents. The switch was dropped at Deepak's request: both marketing
  layouts are the v2 shell, every page lost its own legacy Header/Footer (contents restyled in later
  phases), and `/go/*` moved to a `(campaign)` group (same URLs) to keep its minimal brand bar.
- 2026-10-20 (later): Deepak confirmed Never Share is shipped and asked to restore the fractional-CMO FAQ
  "Can I lock down sensitive frameworks?" as a Never Share–only answer, adding that everything explicitly
  shared with a client is revoked when the engagement ends; Never Share is also back in the
  fractional-execs safety answer. He asked to soften the unsourced audience-page numbers: every figure
  in `lib/marketing/audience-content.ts` ("renew 3x", "$12-24K", "$2-3K", "15-25%", "2x less", "30% of
  time", hours saved) is now unquantified wording.
- 2026-10-20 (later): the Trust Center hero diagram is now an interactive systems map, as Deepak asked:
  **elkjs 0.12.0** (Eclipse Layout Kernel, layered algorithm; licence "EPL-2.0 OR GPL-3.0-or-later",
  still to be checked before this ships) lays it out **on the server** (`trust-map-layout.ts`,
  `server-only`), so elkjs never reaches the browser; **React Flow 12.12.0** (`@xyflow/react`, MIT)
  draws it (`trust-map-flow.tsx`, loaded with next/dynamic): six systems (your team, your client,
  firmä, your storage, encrypted metadata, Brio), labelled edges, + / − / fit buttons, and a side panel
  per system (`trust-map-data.ts` holds the copy; it restates the Trust Center's own claims, including
  Never Share and revocation at engagement end). Scroll never zooms; on touch screens dragging
  scrolls the page. Phones get a top-to-bottom layout without edge labels. Both packages are pinned
  to exact versions. Never Share and engagement-end revocation were also restored in the pillar cards.
- 2026-10-20 (later): checks. `tsc --noEmit` clean. `vitest run`: 1138 passed, 13 failed, all in the
  Drive/connector tests that already fail on clean dev (grant-engagement-drive-folder-access,
  sync-document-sharing, connectors/registry, connectors/sharing-actions,
  google-drive-permission-adapter). Every marketing route returns 200 with no render errors. The site
  404 (`app/not-found.tsx`) is on the system too.
- 2026-10-20 (later): with Deepak's OK, deleted the 57 legacy marketing files nothing imported any more
  (old landing page and sections, Kinetic/Stitch skins and config, legacy Header/Footer/PublicPageLayout,
  old blog and docs components, FaqGrid and the FAQ chat/modal, old marketing helpers, sections/Pricing,
  animations/fade-in, the legal cookie-policy/support modals, config/kinetic-institution.ts). Type check
  and route sweep clean afterwards.
- 2026-10-20 (later): the cookie banner, settings modal and saved toast fully redesigned on the system
  (Deepak noticed the modal still had the Kinetic look): sentence-case pill buttons, Space Grotesk titles,
  mint icon circles, bottle-green switches, 18 px cards, green-tinted scrim. Consent logic unchanged;
  verified accept/customize/save in the browser.
- 2026-10-20 (later): storage marks in the trust strip and the story's Drive chip are now single-color
  outlines (`storage-icons.tsx`: Google Drive, OneDrive, SharePoint), as Deepak asked.
- 2026-10-20 (later): header navigation restored to the old site's menus, as dropdowns timed from
  Stripe's live menu (`site-nav.tsx`): Product ▾ (How it works, Features, Brio, Built on your Drive, Who
  it's for, Take the tour), Pricing, Resources ▾ (FAQs, Blog, Changelog, Trust Center), Contact ▾
  (Get in touch, Book a demo). Brio and Tour left the bar (both are in Product; the tour is also in the
  hero). Sign in is the bordered secondary pill, like the hero's Take the tour. The panel stays put
  under the bar, wipes open downward, eases its height between menus (300 ms) and carousels the menus:
  the new one slides 160 px in from the side you moved toward over 500 ms while the old one fades in
  120 ms; the arrow slides to the item. Every menu is two columns at one width. Icons are duotone, in
  the Features bento's language (`nav-icons.tsx`). Hover with a mouse, click or Enter/Space, ArrowDown or
  Tab into the menu, Escape back to the item; menus not shown are inert. The phone sheet groups the same
  entries under Product / Resources / Contact (Pricing joins Product). Home sections got `id="drive"`
  and `id="who-its-for"`, and anchored sections clear the fixed header. Verified in the browser at
  1440, 1024 and 390.
