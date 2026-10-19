# Landing page redesign — proposal

**Status:** proposal, waiting on Deepak's direction (2026-10-18). No production code has changed.
**Revision 2 (same day):** Deepak liked the structure and the real screens and asked for Brio to be
brought to life and moved up the page. Brio is now in the hero (the Ask Brio panel) and has its own
section directly after the trust strip (§3), and a Brio chip appears on every How-it-works step.
**Mockup:** Design canvas "Firma Landing Redesign": https://claude.ai/artifact/RJcxws62pBX3MojTpNemTo
(desktop page and phone first screens side by side; Tweaks switch the CTA accent and the display font).
**Scope:** the public home page `/` only — `app/(marketing)/page.tsx` → `components/landing/landing-page.tsx`
(`skin="legacy"`). The audience pages, `/pricing` and `/tour` stay as they are, except for the links into them.

---

## 1. What is there today

| Block (top to bottom) | Component | Notes |
|---|---|---|
| Header | `components/layout/Header.tsx` | Platform / Contact / Pricing / Resources mega-menus; Sign in (dark) + Get started (lime). Both CTAs are `hidden md:inline-flex`, so phones see neither. |
| Hero | `landing-page.tsx` (legacy branch) | Rotating headline (Friction → Need → Solution, every 4 s), a "Consumer-Grade Ease \| Institutional Trust \| Frictionless Delivery" line, a rotating sub-paragraph, three equal buttons (Contact Us, Take a Tour, Book a Demo), a giant "PROFESSIONAL" watermark, and the six-step `LegacyHeroScreenMock` carousel (Link → Setup → Protect → Deliver → Wrap → Audit, 6 s). |
| The firmä Transformation | `firm-transformation-section.tsx` (1,487 lines) | Before/After diagram: animated "document chaos" chips vs. a persona map. "Reality check" and "Trust architecture" open full-screen modals. |
| Who is firmä for? | `landing-page.tsx` + `lib/marketing/target-audience-nav.ts` | 11 role chips and 6 use-case cards (Partnership, Consultation, Project, Case management, Audit, Training). |
| Brio | `brio-section.tsx` | Three cards (status, answers, search) and a dark "kept in its lane" strip. |
| Footer | `components/layout/Footer.tsx` | Five link columns; FAQ, Privacy, Terms and Support open as modals. |

Measured on the local dev server: the page is about 5,200 px tall at 1440 px and about 9,400 px at 375 px.
The fonts are Space Grotesk for display and Work Sans for body. The palette mixes lime `#72ff70`, blue
`#5a78ff`, navy `#141c2a`, red `#ba1a1a`, emerald and orange, plus a pearl background with lime and blue glows.

## 2. Critique

**Message clarity.** A visitor can't tell in five seconds what firmä is. The headline rotates through three
different claims: the client's pain, "one Board", and "a premium client showcase". On a slow read, someone
can land on any one of them, or on the empty beat between two. The one fact that sets firmä apart, that it
runs **on the firm's own Drive**, is in the sub-paragraph, and that paragraph also rotates out. The
"Consumer-Grade Ease | Institutional Trust | Frictionless Delivery" line is three abstract nouns that
could describe any SaaS product. The page also names three products at once: a client portal (title tag,
badge), a deliverables Board (headline 2), and a "premium showcase" (headline 3).

**Information hierarchy.** The page leads with the problem and the abstraction (the Transformation
diagram, 11 role chips, 6 use-case cards) and shows the product last. The real app, with its Overview,
Board, health and Brio, now looks good after the overhaul, but the page never shows it. The hero "screen
mock" is an illustration of an older UI (peach and lime tiles, "Acme Rebrand 2024") that doesn't match
what a visitor sees in `/tour`. The two most persuasive facts are buried: the product is free to start,
and the tour is the real app with sample data.

**Visual system.** There are too many accents (lime, blue, navy, red, emerald, orange), too many type
styles (uppercase micro-labels with `tracking-widest` everywhere, three weights of Space Grotesk, a
160 px watermark), and decorative motion: two carousels, the rotating headline, the drifting chaos chips
and the ambient glows. Every block uses a different card style: square bordered, dark navy, dotted
background, dashed persona boxes. Nothing on the page shares the restrained Notion/Linear look the app
now has, so the marketing site and the product feel like two companies.

**Conversion path.** The primary hero button is **Contact Us**, not sign-up. The header says
*Get started*, the hero says *Contact Us*, *Take a Tour* and *Book a Demo* at equal weight, and the
Transformation section has more buttons that open modals. That's five competing actions and none of them
says "free". *Take a Tour* opens in a new tab, which splits the session and hurts attribution. Pricing
(free tier, then $49/month) never appears on the page. On phones the header CTAs are hidden, and the hero
buttons sit below the fold under a 48 px headline that takes the whole first screen.

**Proof.** The page has none, or worse than none. The "93% of client-facing teams…" figure has no
source. The editorial skin (not live) has placeholder logos (AXIOM, STRATOS…). There are no customer
quotes yet, which is fine for this stage, but then the proof has to be the product itself (the live tour,
real screens) and specific, checkable promises (non-custodial, read-only AI). Today both are hidden
behind modals.

**Mobile.** At 375 px: the only `<h1>` is the decorative "PROFESSIONAL" watermark; the headline is a
rotating `<h2>` rendered four times (three invisible sizers plus the live one). The three hero buttons
stack into about 280 px of full-width bars. The Transformation diagram shrinks to 7–8.5 px labels. The
page runs to about 9,400 px. Use-case headings at 36 px wrap to four lines.

**Accuracy (fix whatever the redesign decides).**
- The Brio card "Find documents by describing them" promises natural-language Doc Search, but Ask mode
  was hidden on 2026-10-15 (`ASK_MODE_ENABLED = false`). Doc Search is filters only today.
- The Brio strip says "Read-only. It cannot share, edit, or change a status." That stopped being
  true when the Files agent (rename, move, create folder, with approval) shipped to main in PR #120.
  The product's own line is `ASSISTANT_POLICY.consent`: "Brio never changes anything without your
  consent."
- The hero mock and FAQ promise "Never Share" tags, share "self-destruct timers", one-click "Wrap", and
  "biometrics or magic links". I could not find "Never Share", share expiry or a Wrap action in the app
  code. Sign-in is email OTP. Confirm each one or drop it.
- The free plan is described two ways: the FAQ says "1 active engagement, 1 client and 10 documents",
  while `config/pricing.ts` says 1 client, 2 users and 25 credits a month.
- SEO: the title tag leads with "Client Portal for Marketing Firms…", and the only H1 is "PROFESSIONAL".

## 3. Proposed page, section by section

Principles: **one promise, shown in the product.** One accent, used for one action. The real app is
the hero image, and every section after it shows another real screen. Motion only where it explains
something: state changes on the Board, the health ring filling, Brio's brief writing out. Nothing loops
on its own.

### 0. Navigation
- Wordmark (no "Organize · Protect · Deliver" sub-line), then **Product · Brio · Tour · Pricing · Resources**
  (Brio with its sparkle),
  then *Sign in* (text) and **Start free** (accent). Mega-menus shrink to plain links.
- On phones, **Start free** stays visible next to the menu button.

### 1. Hero
- **Pill:** "NEW · Meet ✦Brio AI, the client-delivery assistant every firm owner wishes they had ›"
  (anchors to §3). On phones: "Meet ✦Brio AI, your delivery assistant ›". Revision 5, per Deepak:
  Brio is the executive assistant for client delivery, not just a status-report writer, so the copy
  never narrows it to one task.
- **H1 (a real `<h1>`, static):** "Run every client engagement from your own Drive."
  **Brio-led alternative** (a Tweak on the canvas): "Run every client engagement from your Drive,
  with ✦Brio AI as your right hand." Others to A/B test: "Client delivery, built on the Drive you
  already use." / "The client workspace that runs on your Google Drive."
- **Sub:** "firmä turns the Google Drive or OneDrive you already use into a client workspace: every
  deliverable on a Board, every approval in one thread, and ✦Brio AI, the assistant for client
  delivery that briefs you, answers your questions and drafts the client update. Your files never
  leave your Drive."
- **Brio's tagline** (under the big lockup in §3): "The executive assistant for client delivery,
  built into firmä."
- **CTAs:** **Start free** (accent, → `/signup`), **Take the tour →** (secondary, same tab),
  then a text link "or book a demo".
- **Microcopy:** "Free for your first client · No credit card · Google Drive and OneDrive".
- **Visual:** a large, crisp composite of the **real Engagement Overview**: sidebar, tabs, health ring
  71/100, Brio's summary ("Written by Brio · approved by Alex Jordan") and the Action Center. It sits
  half on a warm neutral band. The **Ask Brio panel** is docked over the right edge, as it is in the
  app: "What needs my attention today?", then Brio's answer with a writing caret and fact chips
  (1 overdue · 1 waiting on the client · Open QPL-11). A Board card ("In review → Approved") breaks the
  bottom-left edge. Built as live HTML in the app's own components with demo data, not a screenshot,
  so it stays sharp and current. The client's approval card moves to step 03.
- **Motion:** on load the ring fills to 71 and the Board card moves from *In review* to *Approved*,
  once each.
- **Live Ask Brio exchange (revision 16, prototyped on the canvas).** An 11.4 s loop in the hero
  panel, Stripe-style "the product using itself":
  - 0.5 s idle with the placeholder
  - the question "What needs my attention today?" types into the input at 45 ms per character,
    and the send button turns green
  - 2.15 s: sends, and the user bubble appears
  - Brio "thinks" (three pulsing dots) until 3.05 s
  - the answer streams word by word at 70 ms, keeping the bold deliverable name, with a green caret
  - 6.8 s: the three fact chips pop in 150 ms apart
  - hold, then reset

  The phone does the same inside its answer card, typing into the bubble, with a fixed card height
  so the page never shifts. With the animation Tweak off or `prefers-reduced-motion`, it renders the
  finished exchange statically. In the build: a small state machine on `requestAnimationFrame` that
  pauses when the hero is off-screen (IntersectionObserver), plus `aria-live="polite"` on the
  answer so screen readers get the final text once rather than every word.

### 2. Trust strip
"Built on the storage your firm already uses": Google Drive · OneDrive · SharePoint (beta), plus three
plain checks: *Files stay in your Drive · No migration · Leave anytime, folders stay put.* This takes the
place of a logo wall until real customers can be named.

### 3. Meet Brio (moved up; the page's one dark band)
Brio stops being a feature lower down the page and becomes a character the visitor meets right after
the hero.

- **Character, without a mascot.** Brio is branded exactly as in the app (`components/ui/brio.tsx`):
  the Lucide Sparkles icon at 0.82em, pinned to Brio green on static surfaces (electric green on
  dark), then **Brio** in bold, then "AI" as a small uppercase subscript on the baseline. No tile or
  avatar. The lockup appears in headings, labels, chips, attributions and the first mention in each
  paragraph; placeholder text stays plain, as in the app. It's alive but quiet: the sparkle glows
  softly (3.2 s) and twinkles once every 6 s. Answers write in with a green caret. Its personality comes from its voice: short,
  factual and specific, the way the real brief is written ("One thing. Creative & Landing Page Assets
  was due Oct 8…").
- **H2:** "Meet Brio. It already knows where every engagement stands." Body: what it reads (delivery
  data), what it does (answers, drafts the client update, tidies files), and that it always waits for
  you.
- **"How Brio is kept in its lane"**, four promises next to the intro: reads names, statuses and
  dates, never what's inside a document or a comment · never changes anything without your consent ·
  nothing reaches a client until a person publishes it · leaves Mitigation and Next Steps to the
  engagement lead.
- **"A day with Brio"**, four real moments as product cards, each ending with the human's part:
  - 8:30 AM: Today's brief (Firm Overview). *You: know where things stand in 30 seconds.*
  - 10:15 AM: Ask Brio, "Which deliverables are at risk?" *You: ask in plain words, get the facts.*
  - 2:00 PM: The client update. Five sections drafted; Mitigation and Next Steps are left for you;
    a Review and publish button. *You: edit, then publish.*
  - 4:30 PM: Tidy the files (labeled **New**). Six files don't match the naming pattern, with a
    rename preview, Preview all 6 and Approve. *You: preview, approve, reversible.*
- One line about credits: 25 a month free, 500 on Standard, one credit per brief, summary or answer.
- Visual: near-black `#0E1114` with one soft green glow behind Brio's mark (localized, not a wash).
  The cards are the light product UI. On phones the four cards scroll sideways.
- Motion: the mark breathes (the one loop on the page). Each card's text writes in once when the
  row enters the viewport, staggered 150 ms.

Brio then appears again as a **Brio chip** on each How-it-works step, so the character stays with the
reader down the page:
01 "Ask Brio: 'What's still in Drafts?'" (a real Files prompt in the tour) · 02 "Brio: 1 overdue,
8 planning gaps. Want the list?" · 03 the client sees a "Status update · Drafted by Brio · published by
Alex Jordan" item · 04 "Today's brief: Horizon FinTech carries the largest share…". The final CTA
becomes "Ask Brio about a real engagement," with the mark above it.

### 4. Product story: How it works (one tabbed showcase; revision 16)
Intro H2, keeping the best line from today's page: **"Clients shouldn't have to ask 'is this done?'"**

**Desktop: a single tabbed carousel instead of four stacked rows** (prototyped on the canvas;
it saves about 1,400 px of page):
- **Tabs:** four tabs (01 Connect · 02 Plan · 03 Share · 04 Steer), each showing its number tile,
  label and headline. The active tab is a raised white card; the others are translucent and muted.
- **Progress and timing:** a 3 px gradient progress bar fills on the active tab, and the showcase
  auto-advances every 6 s.
- **Control:** clicking a tab jumps to it and restarts its timer. Hovering the stage pauses the
  rotation, so readers aren't pulled away mid-read.
- **Stage:** one pastel-mesh panel with all four panels stacked in a single grid cell. The stage takes
  the tallest panel's height, so switching tabs never moves the page.
- **Transition choreography (revision 17; a plain 450 ms crossfade felt "too instant"):**
  - the outgoing panel fades and lifts 8 px over 380 ms (`cubic-bezier(.4,0,1,1)`)
  - after a 120 ms beat, the incoming panel rises 16 px from 99.2% scale and fades in over 750 ms
    (`cubic-bezier(.22,1,.36,1)`)
  - the tab chrome eases over 400 ms
  - these are keyframe animations, alternating two identical names per switch so they replay
    reliably however the framework re-renders
- **Panels:** each panel is the step's body copy plus the same real screen as before (folder picker,
  Board, client view, Firm Overview), each with its Brio chip.
- **In the build:** a proper ARIA tabs pattern, with `role="tablist"`, `tab` and `tabpanel`, arrow-key
  navigation and `aria-controls`.
- **Phone:** keeps the vertical stack (revision 15). Swapping tall panels in tabs on a narrow screen
  causes jumps.

The step content below is unchanged; it now lives in the tabs and panels.

| # | Headline | Copy direction | Visual (real UI) |
|---|---|---|---|
| 01 Connect | Start from the folders you already have. | OAuth to Google or Microsoft, pick folders, mapped to Client → Engagement → Deliverable. Nothing copied. | Drive folder picker |
| 02 Plan | Every deliverable on one Board. | Owner, due date, status: To do → In progress → In review → Approved. One shared truth. | Board, four columns |
| 03 Share | Your brand in front. Your Drive behind. | Branded client view of only what's shared; comment, approve, get reminded. | Client view with Approve, a comment thread and a reminder chip |
| 04 Steer | Know which engagement needs you today. | Health scores pace, overdue work and gaps; the Action Center says what to do; the Firm Overview rolls it up. | Firm Overview: Action Center plus the engagements table with pace bars |

Motion: each visual animates one state change when it scrolls into view (a card moves, a pill turns
green, a row's pace bar fills). There are no carousels.

Drop "Find documents by describing them" from the Brio copy until Doc Search's Ask mode returns.

### 5. Feature grid: "Everything an engagement needs. Nothing it doesn't."
Six flat tiles with hairline borders, one icon each and no colored fills: Comments and approvals ·
Client reminders · Firm Overview · Audit trail · Doc Search · Calendar and Inbox.

### 6. Built on your Drive (security)
- H2: **"Your files never leave your Drive."**
- A three-node diagram: *Your Drive (files)* → *firmä (engagements, status, access)* → *Your client
  (sees only what you share)*.
- Three promises: no stored copy of your files · access follows the engagement and is reviewable in
  Audit · cancel anytime and your folders stay put. Link: **Trust Center →**.
- This replaces the Before/After Transformation section and the two full-screen modals.

### 7. Who it's for
Three buckets, each a card linking to an existing audience page, with small role chips so the old
11-chip list is grouped rather than lost (revision 4, per Deepak: fractional CMOs belong with the
fractional executives):
- **Consultancies and agencies** (Marketing agencies · Strategy and advisory · Management
  consulting) → `/landing/marketing-agencies`.
- **Fractional executives** (CMO · CFO · COO · CAIO · CISO) → `/landing/fractional-execs`.
- **In-house marketing leaders** (Full-time CMO · Marketing team) → `/landing/fulltime-cmos`.
  "Strategy, agency deliverables and results in one workspace, so leadership sees the work and its
  impact."

Each card opens with a **product peek** instead of a decorative stripe (revision 7, per Deepak): a 176 px pastel-mesh panel with a crisp slice of real UI bleeding off its bottom edge, specific to the audience. Agencies get the Clients list, fractional executives get Home's *My engagements* with pace pills, and in-house leaders get a status update shared with Leadership, "Drafted by ✦Brio AI · published by you". No gradient strips on cards anywhere.

Audit & compliance and corporate training drop off the home page. They have no landing page, and the
FAQ and Trust Center still serve them. This replaces the 11 chips and the 6 use-case cards. The footer's
"Who it's for" column lists Agencies, Fractional execs and In-house CMOs.

**Found while doing this:** `/landing/fractional-execs` and `/landing/fractional-cmos` ship the same
title and description ("Fractional CMO Client Portal | Show Clients the Value of Your Work"), which is
duplicate content for search. The fix is either to rewrite `fractional-execs` for all fractional roles
(CFO, COO, CAIO as well as CMO) or to 301 `fractional-cmos` to it. See P2 item 19.

### 8. Proof
- "See it before you sign up": the tour is the real product with a sample firm (Beacon Growth Partners,
  two clients, four engagements) and needs no account.
- One testimonial: **Dharita Gada, Founder, DataSentry · Fractional CISO** (named by Deepak,
  revision 8). The quote on the canvas is a **draft written for her approval, not her words yet**:
  > "As a fractional CISO, I can't ask clients to trust yet another vendor with their files. firmä
  > keeps everything in our own Drive, gives each client a clean view of their engagement, and shows me
  > exactly who can see what. Brio tells me which client needs me first."

  Deepak is getting Dharita's approval offline, so the canvas shows the card without a draft tag. It
  must not ship to production until she has approved the wording (or her edited version). Use initials, not a
  photo, unless she supplies one. Every claim in the quote is backed by the product: files stay in
  the firm's Drive, the client gets a branded view, the Audit tab shows who can see what, and Brio
  writes the brief.

### 9. Pricing teaser
"Start free. Upgrade when the second client signs." Two cards, **Free** (1 client, 2 users, 25 Brio
credits a month, no card) and **Standard** ($49/month, or $39 billed annually; 3 clients, unlimited users,
500 credits), plus "Pro and Business coming soon · See all plans →". The numbers come from
`config/pricing.ts`, so the teaser can't drift from `/pricing`.

### 10. FAQ
Six questions, shown open in two columns (no accordion for six items): Does Brio read my clients'
documents? · Can Brio change anything on its own? · Do you store my files? · How does firmä connect to
my Drive? (this answer also covers "no IT admin needed") · What happens if I stop using firmä? · Is
there a free plan? Answers come from
`data/faq-data.ts`, shortened. A link goes to the full FAQ page. No modal.

### 11. Final CTA
Brio's mark above the H2 "Ask Brio about a real engagement." Sub: the tour opens a demo firm in the
actual product with Brio switched on. **Take the tour** and **Start free**.

### 12. Footer
Four columns: Product (Tour, Pricing, Brio, Trust Center, Changelog) · Who it's for · Resources
(Blog, FAQ, Contact, Book a demo) · Legal. Legal pages are real pages, not modals.

## 3b. Sign in and sign up (revision 20)

These are on the canvas next to the landing page: desktop (1440) and phone (390) for each, on both the
Green and Blue pages. The flows mirror the real app (`app/(app)/signin`, `components/signup/signup-form.tsx`).

**Revision 19 (2026-10-19): rebuilt on Stripe's register-page structure.** Deepak found revision 18
"not quite great" and pointed at dashboard.stripe.com/register. What Stripe gets right, and what
revision 18 got wrong:
- **One idea per region.** Revision 18 put the mesh across the top like a second hero and crowded the
  form with a chip, icons, a quote, a free-plan line and trust rows. Now the top is calm white with
  the guide lines, and the form card is the hero.
- **The wave is the motion** (revision 20 below): one silk ribbon behind the card.
- **A quiet card:** a big title, labeled fields, one primary button, "Or sign up with", and a gray
  strip at the bottom with the switch link.

**Revision 20 (2026-10-19): Stripe's silk wave.** Deepak: revision 19's band "is not looking like
Stripe at all, which has the wave effect", with dashboard.stripe.com/login as the reference. Stripe's
motion isn't a gradient band. It's a 3D ribbon of fine threads that twists, folds over itself and
drifts slowly. CSS gradients can't produce that, so the band is gone and the ribbon is drawn live on a
`<canvas>` behind the card. The header gets Stripe's full-width hairline, and the footer goes back to
muted ink on white.

**Layout**
- The logo and the content line up on the page guides. The desktop card is 576 wide, so on sign-in its
  edges sit on the guides at 50% ± 288px; on sign-up the card spans the right half (50% to 50% + 576px).
- **The ribbon:** 100–160 threads, each a cubic-Bézier path offset across the ribbon's width. The
  width twists around an off-center axis (cosine of a phase that drifts along the length), so the sheet
  folds over itself instead of pinching. Light perspective spreads the near edge, and the threads overlap
  slightly so no moiré shows. Color runs along and across the threads through the green palette
  (electric, aqua, teal, bottle, lime). Back faces shade toward bottle green, and a soft white sheen
  marks each fold. The control points sway a few percent. It draws at 30 fps and stops on a still frame
  when animation is off or reduced. On Blue: periwinkle, cyan, violet and firma blue (Stripe's own family).
- **Placement:**
  - Sign in: the ribbon sweeps from the top-center down past the card's right edge, as on Stripe's
    login, with a thinner second ribbon at the far right.
  - Sign up: the ribbon rises from behind the card's lower edge to the right edge. The value points
    and the footer stay on white.
  - Phone: one tall ribbon runs behind the card, showing above it and past its lower right.
- **Build:** a small canvas component, or a WebGL shader with the same parameters if the CPU cost
  matters on low-end phones. Pause it when the tab is hidden or the ribbon is off-screen.
- **Card:** white, 12px radius, Stripe's crisp two-layer shadow. Labels are 15/600 above 48px fields
  with an 8px radius. The focus ring is bottle green with a 3px halo. Primary is the electric pill;
  Google is a white pill. The footer strip is `#F6FAF8`.

**Sign in** (`/signin`): centered card.
- **Email step:** "Sign in to your account" · Work email ("We'll email you a one-time code. No password
  needed.") · **Send me a code** · Or sign in with · Google (Microsoft only when
  `MICROSOFT_SIGNIN_ENABLED` is on) · strip: "New to firmä? **Create account**".
- **Code step:** ‹ Back · "Check your email" · "Enter the 6-digit code we sent to …" · six boxes ·
  **Verify code** (dimmed until all six are in) · "Didn't get it? Resend code".

**Sign up** (`/signup`): Stripe's two columns.
- **Left:** four value points, no heading. Each is a 17.5/600 title with a two-line description and a
  2px bottle-green bar sitting on the first guide line:
  1. Built on your own Drive
  2. Every engagement in one place
  3. ✦Brio AI, your delivery assistant
  4. Free for your first client (no credit card; two users and 25 Brio credits a month)
- **Right:** the card, with "Step 1 of 3" and three short segments at the top:
  1. Details: "Create your firmä account and run every engagement from your Drive", work email (a check
     pops in once it's valid), first and last name, **Create account**, the Terms line, Or sign up with Google
  2. How you sign in: "No passwords. Signing up as …", **Email me a code**, or Google
  3. The code step, ending in "Account created"
- Dharita's quote, the FREE chip and the trust rows are gone from sign-up; the landing page carries them.
- **Phone:** the card comes first, then the points and the footer. No sideways scrolling.
- The app's 4-segment indicator (email and names as separate sub-steps) becomes 3 steps here. Decide
  in the build whether to keep the split.

**Motion** (all of it stops for `prefers-reduced-motion` and the animate Tweak):
- The silk ribbon twists and drifts all the time. This is the page's one piece of ambient motion, as on Stripe's login.
- On load, the card rises in (900 ms, `cubic-bezier(0.22,1,0.36,1)`). On sign-up the points stagger in
  120 ms apart, and each bar grows down just after its point.
- Steps slide in from the right going forward and from the left on Back (560 ms).
- Fields: the focus ring moves with a 220 ms transition. The email check pops with a slight overshoot.
- Code: the digits fill one per 320 ms, then "Verifying…", then "Signed in" or "Account created".
- **Prototype only:** on the canvas, the fields type themselves once (email, then the names) to show
  the focus and validation states. Production never pre-fills.

The canvas has a *Step* Tweak for each screen and a Microsoft Tweak; in Play, the buttons move between
steps. The Turnstile check isn't drawn; it stays invisible unless challenged.

## 3c. Inner pages: two samples (revision 23)

The non-landing pages fall into four template families. The landing page, sign-in and sign-up cover two
of them. Two sample boards on the canvas cover the rest, in Green with the ribbon-hero rules:

- **Top-level pages → the Pricing sample.** Covers `/pricing`, `/contact`, `/waitlist` and the
  `/landing/*` audience pages (one shared `AudienceLanding` component).
  - White hero with a compact ribbon wrapping the right side behind the third plan card. Three plan
    cards: Free, Standard (tinted ring, Most firms) and a "Larger firms" card listing Pro, Business
    and Enterprise as Coming soon.
  - Monthly/Annually toggle, defaulting to annual: $39 billed annually ($468 a year), or $49 monthly.
  - An "Every plan includes" strip.
  - Flat gray block with the full comparison table: config's five categories, the Standard column
    tinted, checks, dashes and Beta chips.
  - White FAQ accordion, then the dark CTA band and the footer.
  - Numbers mirror `config/pricing.ts`, and only its four published limits appear: clients, credits,
    audit and comments.
- **Reading pages → the blog article sample.** Covers blog posts, docs, privacy, terms and the trust
  center.
  - No ribbon; the reading page stays calm.
  - Nav with a hairline and a breadcrumb, then the H1 (Space Grotesk 58), dek and byline.
  - A 720px reading column at 19/1.75 next to a sticky "On this page" list and a quiet gray CTA card.
  - A gray TL;DR panel, green-dot lists, a check-ringed checklist, the FAQ as H3s, a gray "Keep
    reading" block of three related posts, then the CTA band and the footer.
  - The post is the real `sharing-vs-delivering-document.mdx`, in American spelling.
  - **Product-led covers instead of stock photos.** The 125 posts use generic team photos. The sample
    cover shows the article's argument in the product: a generic "Anyone with the link" share dialog
    next to the same file delivered in firmä (in its engagement, In Review, shared with Leadership,
    Approve / Request changes, "Opened by …"). For the build, a cover per category, with a per-post
    override.

**Found in the real data** (fix in the build, or before):
- `data/faq-data.ts` says "All plans include unlimited members", but the free plan has 2 users.
- The same FAQ publishes the free plan's engagement and document limits (1 engagement, 10
  documents), which `config/pricing.ts` deliberately keeps unpublished.
- ~~Standard's CTA links to `/contact`~~ Not a live bug: `/pricing` already sends Standard to
  `/signup?intent=standard&interval=…&paid_plan=true` (sign-up, then Polar checkout; `/api/checkout` needs a
  signed-in user and a firm). Only the unused `components/sections/Pricing.tsx` read the stale `/contact`
  href; config now says `/signup?intent=standard&paid_plan=true`. The mock's Get Standard follows the same
  path, with the interval from its toggle.
- FAQ fixed (2026-10-19): per-user charges (paid plans unlimited, free 2 users); the free plan answers
  now use only published limits (1 client, 2 users, 25 AI credits) and drop the firm, engagement and
  document counts. The engagement and firm FAQs ("Can I add more engagements?", "What happens if I
  exceed my engagement limit?", "What if I need more than one firm?", "What counts as an active
  engagement?") keep their questions but no longer publish per-plan numbers (Deepak's call, same day).
- Comparison labels need tidying: "Firm → Client → … hierarchy" should be "Clients"; "Users &
  Access Control" should be "Users"; "In-app messaging (Deliverable comment thread) history." should
  be "Comment thread history". The sample uses the tidy labels.
- "Private documents (Never Share tags)" is still in the table, pending decision 5.

## 4. Visual system

**Revision 3 (same day):** Deepak found the calm version "a bit too vanilla" and asked for Stripe's
vibrancy: gradients, with firma's greens playing the role of Stripe's purple. The system below
replaces the earlier restrained one.

**Revision 9 (2026-10-19): two color variants to choose between.** Deepak asked to keep the green
version and add one with firma blue `#4A68EF` as the primary. The canvas has a **Green** page and a
**Firma blue** page with identical copy, layout, product screens and Tweaks. Only the color roles
differ:

| Role | Green | Firma blue |
|---|---|---|
| Titles, H1 highlight | `#009669` | `#4A68EF` |
| Buttons, chips, badges | `#7DFF77`, `#03281B` text | `#4A68EF`, white text (4.6:1) |
| Light chips on cards | electric tint, dark text | `rgba(74,104,239,.10)`, `#2C44C9` text |
| Accents on dark bands | `#7DFF77` | `#9FB0FF` (timeline dots `#A9B8FF`) |
| Dark bands, footer | `#04160F` | `#0A1033` |
| Ink / body / muted | `#05271C` / `#3F5650` / `#4F625B` | `#0B1437` / `#42506B` / `#56627F` |
| Small colored text | `#007A55` | `#3550D9` |
| Light band / panel base | `#F3FBF6` / `#EFFFF1` | `#F4F6FF` / `#F2F4FF` |
| Mesh | lime, electric, aqua, bottle, teal | lavender `#E4E0FF`, periwinkle `#7B8CFF`, violet `#9A66FF`, blue, cyan `#2EC5FF` |

Both variants keep **Brio's green sparkle** (`<Brio fixedColor />`) and the **firmä logo gradient**,
because those are brand marks, not theme colors. The app's product screens keep their own colors. In
the build, the variant should be a single token set swapped at the `.marketing-site` root, not two
copies of the page.
- **Color: one hue family, like Stripe's.**
  | Role | Token | Use |
  |---|---|---|
  | Bottle green | `#009669` | Section titles (large text only, 3.8:1), the H1's second phrase, Brio |
  | Bottle green, dark | `#007A55` | Small green text and links (5.4:1) |
  | Electric green | `#7DFF77` | Buttons, chips, badges, check dots; always with `#03281B` text |
  | Deep forest | `#04160F` | Dark bands, final CTA, footer (Stripe's navy `#0A2540` analogue) |
  | Ink / body / muted | `#05271C` / `#3F5650` / `#4F625B` | H1 and card titles / body / captions |
  | Mint band | `#F3FBF6` | Alternate light sections (features, pricing) |
  | Mesh tints | lime `#ECFF8F`, electric `#7DFF77`, aqua `#2EE6C5`, teal `#00C49A`, bottle `#009669` | Gradients only |
  **Firma blue `#5A78FF` is dropped entirely** (Deepak, 2026-10-18): greens only, a single-color
  system. Aqua `#2EE6C5` is the coolest hue the gradient uses. The product screens keep the app's own
  status colors (the blue "Active" pill, the In Progress column), because those are the real UI.
- **The gradient.** A CSS mesh of layered `radial-gradient`s, 180% size, drifting with
  `background-position` over 22 s. In production it can be Stripe-style WebGL (a `minigl` port) with
  this CSS as the fallback. Where it appears:
  - **Hero:** seven blobs over a `#B6F5C8` base: lime `#ECFF8F`, electric `#7DFF77`, aqua
    `#2EE6C5`, bottle `#009669`, teal `#00C49A`, soft lime `#A6FF7A`, and electric again. A
    full-width band sits behind the nav, H1 and the top of the product shot, with a skewed bottom edge
    (12°, see Slants). A white wash fades in from the left (97% → 0 by 60% of the width), so the H1,
    sub and buttons sit on near-white, and the color flows on the right and under the screens. The
    wash also **fades out vertically below the CTA microcopy** (full to ~73% of the band height, gone
    by ~90%, via `mask-image`). Without that, it whitened the band's lower-left all the way to the
    slanted edge, and the slant disappeared into the white page on the left (revision 14). The
    gradient itself is unchanged.
    *Tried and rejected (revision 10, reverted the same day):* an all-pastel, eight-tint hero copied
    from the product panels, with a lighter veil. Deepak judged it worse. Keep this hero gradient; the
    pastel multi-tint treatment belongs only to the panels behind product screens.
  - **Dark bands** (Meet Brio, final CTA): deep forest with the same hues as low-opacity glows, and
    skewed top and bottom edges (about 120 px on desktop, 48 px on phones).
  - **Product panels** (How it works): a pastel version of the mesh behind each screen, with a
    different blob layout per step.
  - **Feature icons (revision 11, after Stripe's product icons):** no tiles. Each is a 52 px
    duotone illustration: a primary filled shape in an aqua → bottle gradient (`#2EE6C5 → #009669`)
    and a secondary badge in an electric → teal gradient (`#7DFF77 → #00C49A`) laid over it with a
    2.5 px white keyline, plus white or ink inner details. The six pairs: speech bubble + approval
    check (Comments and approvals); bell + clock (Client reminders); rising bars + trend line (Firm
    Overview); shield with keyhole + person (Audit trail); document + magnifier (Doc Search); calendar
    + inbox tray (Calendar and Inbox). The blue variant maps them to cyan → blue with periwinkle →
    violet, which is Stripe's own pairing. In the build, ship them as one SVG component with the
    gradient stops taken from the theme tokens.
  - **Accents:** gradient tiles for the step numbers, gradient text for
    "Meet Brio." and "Ask Brio", a gradient border and gradient price on Standard. Cards never get
    decorative gradient strips; they open with a product peek instead (§7).
- **Stripe touches.** Pill buttons with a › chevron (primary electric green, secondary white). A
  transparent nav sitting on the mesh. Big soft green-tinted shadows
  (`0 60px 120px -30px rgba(3,40,27,.4)`) under the product frames. Uppercase electric-green chip
  eyebrows ("HOW IT WORKS", "PRICING").
- **Slants (revision 13): few, and one angle family.** Skewed edges are punctuation, not a section
  style. There are exactly four slanted moments: the hero (entrance), Meet Brio (into Brio's world),
  the feature grid (one light mint band that breaks up the long middle) and the final CTA (exit).
  Everything else is level and joins through the white↔gray gradients.
  - **Angles:** the hero at **12°**, all bands at **6°**, every edge rising to the right. They're set
    in `vw`, so the angle holds at any width: hero `clip-path: polygon(0 0, 100% 0, 100% calc(100% -
    21.26vw), 0 100%)`; bands `polygon(0 10.51vw, 100% 0, 100% calc(100% - 10.51vw), 0 100%)`; final
    CTA top edge only.
  - **Spacing:** padding grows to clear the slant (Meet Brio 250/260 px, feature band 240 px, CTA top
    230 px). The sections next to a slanted band end and start white, so the band reads as a clean
    parallelogram.
  - **Guide lines** are also drawn on the page background, so they continue unbroken through every
    slanted corner.
  - **Phone:** the same `vw` angles, so the hero edge is about 83 px and the bands about 41 px at
    390 px wide. The phone has no feature grid, so it has three slants.
- **Phone: no sideways scrolling (revision 15, per Deepak).** Horizontal scrollers showed an awkward
  scrollbar and hid most of their content.
  - **"A day with Brio"** is a vertical timeline on phones: a glowing dot and the time label on a line
    down the left, the card under each label, and all four moments (8:30 brief, 10:15 Ask Brio,
    2:00 client update, 4:30 tidy the files). The desktop's horizontal timeline simply rotates. The
    line can draw downward with scroll progress (§4a).
  - **The How it works Board** stacks its four columns top to bottom on phones, so the deliverable
    visibly moves down the pipeline.
  - **Rule for the build:** below 768 px, no `overflow-x` scrollers in marketing sections. Stack them
    instead.
- **Light bands and page guides (revision 12, after Stripe).**
  - **Revision 22 (2026-10-19), on the ribbon-hero variant: flat blocks, not gradients.** Keep the gray
    and change how it's used. The mirrored white↔gray fades blurred every section boundary into one
    haze, and the mint `#F3FBF6` sat too close to the gray to read as deliberate. Now there's one
    gray, `#F6FAF8`, in flat blocks with crisp edges, alternating with white:
    - hero and trust strip: white (the ribbon gets a clean ground)
    - Meet Brio: dark
    - How it works: white
    - Features: gray, keeping its slant
    - Built on your Drive: white
    - Who it's for: gray
    - Proof: white
    - Pricing: gray
    - FAQ: white
    - final CTA: dark
    Cards contrast with their ground: white on gray, hairline-edged on white. The guide lines
    continue through every light section. In the build, the `Band` component takes one `surface`
    prop (`white` | `gray` | `dark`) instead of `from` and `to`. The bullets below describe
    revision 12, which the original Main board still shows.
  - **No section is flat white.** Each light section is a vertical gradient between white and a
    light gray: green-tuned `#F6FAF8` on the Green page, and Stripe's exact `#F6F9FC` on the Blue
    page. The direction alternates (white→gray, then gray→white), so every seam matches. Sections
    next to the mint bands blend into `#F3FBF6`, and the hero's lower half fades from white into the
    gray where the trust strip starts.
  - **Dashed vertical guide lines run down the whole page** on the 4-column grid of the 1200 px rail:
    five lines at the rail's 0, 25, 50, 75 and 100%, 1 px, 3 px dash and 4 px gap,
    `rgba(5,39,28,.09)` on light sections and `rgba(255,255,255,.07)` on the dark bands and footer.
    They're drawn into each section's background, or as an overlay behind content on the hero and
    the dark bands, so cards and screenshots always sit on top of them. The phone uses three lines
    (both gutters and the center).
  - **In the build,** make this one `PageGuides` layer on the marketing layout plus a `Band` component
    with `from` and `to` props, rather than repeating backgrounds per section.
- **Type.** Two faces across every marketing page: Space Grotesk **700** for display, Inter for body and
  UI (the same face as the product screens; the current body face is Work Sans). One scale, shared by
  the landing page and the inner pages (revision 24). Every heading is fluid, using the same `clamp()`
  sizing as the landing page, so all pages scale alike:

  | Token | Use | Size (min, fluid, max) | Line height | Tracking |
  |---|---|---|---|---|
  | `display` | Home headline (landing only) | 48px, 5.8vw, 86px | 1.0 | -0.04em |
  | `page` | Top-level page headline (Pricing, Contact, audience pages) | 44px, 5vw, 72px | 1.0 | -0.04em |
  | `article` | Article and docs title | 40px, 4vw, 58px | 1.04 | -0.035em |
  | `section` | Section heading on every page | 38px, 4vw, 58px | 1.02 | -0.035em |
  | `cta` | Final CTA band headline | 42px, 4.8vw, 72px | 1.0 | -0.04em |
  | `sub` | Article subheading (H2 in long-form) | 26px, 2.4vw, 34px | 1.15 | -0.025em |
  | `card` | Card and feature titles | 28px (display) or 18–20px Inter 700 | 1.2 | -0.02em |
  | `body` | Marketing body | 16–20px Inter | 1.6 | 0 |
  | `reading` | Article body | 19px Inter | 1.75 | 0 |
  | `label` | Small uppercase labels, chips | 12–13px Inter 700 | 1.4 | +0.04–0.08em |

  The Pricing and blog article samples were moved onto this scale. Before that, their section
  headings were fixed 44–48px. In the build these become the shared marketing type tokens.
- **Surfaces.** 14 px product frames, 18–24 px marketing cards and panels, shadow plus a 1 px tinted
  ring instead of hairline borders.
- **Layout.** 1200 px content rail; 24 px gutters at phone width.
- **Motion.** The mesh drifts slowly (the page's ambient motion, like Stripe's). Brio's sparkle glows
  and twinkles. Everything else runs once on viewport entry and shows a state change. The canvas has an
  animation Tweak, and everything respects `prefers-reduced-motion`. The full spec is §4a.

## 4a. Hover and scroll spec (for the build; a canvas can't show most of it)

The canvas already runs the CSS ambient motion (mesh drift, sparkle glow and twinkle). Everything below
needs the real page in a browser. Build with **Framer Motion** (already in `frontend`, ^12):
`whileInView` with `viewport={{ once: true, amount: 0.4 }}` for reveals, and
`useScroll` + `useTransform` for scroll-linked pieces. Each item must render in its final state under
`prefers-reduced-motion` (`useReducedMotion`).

**Card motion kit (revision 25, after Stripe's "Flexible solutions" bento).** Deepak found Firma's cards
"very vanilla" next to stripe.com/in. Stripe's cards, measured on the live page:
- Each card is a button that opens a detail dialog.
- On hover:
  - The title shifts about 5px up and left.
  - The expand button shifts up and right and fills violet.
  - A radial violet-to-pink gradient behind a 1px rim follows the cursor, with a 1s ease-out lag.
  - All of it runs at 800 ms on `cubic-bezier(0.165, 0.84, 0.44, 1)`.
- Each illustration plays a short story (about 2.3 s) the first time it scrolls into view, then rests.
  Cards off-screen don't animate.
- A few illustrations loop: every text line in the mock UI rolls like an odometer (1.4 s) to a new
  scenario about every 7 s (Roastery in US$ and English, Cartsy in € and German, Showflix in ¥ and
  Japanese).

Firma's version, on the variant board:
- **Hover, on every marketing card:**
  - A 1.5px green rim (electric, aqua, bottle) and a faint green spotlight follow the cursor. Use CSS
    custom properties `--gx`/`--gy`, registered with `@property` so they ease over 700 ms. The rim is a
    masked radial gradient.
  - The title nudges 3px up and left.
  - The product scene lifts 6px.
  - Links slide 4px right, and the shadow deepens.
  - Timing matches Stripe's.
- **The feature grid becomes a bento** (3 columns: 2+1, 1+1+1, then one full-width card). Every card has
  a real product scene on a pastel panel, and the duotone icon now sits inline with the title. The
  scenes play once on scroll-in:
  - Comments and approvals: two comments arrive, Approve is pressed, the status rolls to Approved, and
    the card crosses the Board from In Review to Approved.
  - Client reminders: rows arrive, Send reminder rolls to "Reminder sent ✓", then a toast.
  - Firm Overview: 15 due-date bars rise, staggered.
  - Calendar and Inbox: chips pop onto the week and inbox rows slide in.
- **Two cards loop quietly, like Stripe's:**
  - The audit log takes a new row every 3.5 s, and the older rows push down.
  - Doc Search's filter chips and results roll every 6.5 s through three real filter searches: contracts
    for Horizon FinTech, decks in Q4 Brand Refresh, reports from the last 30 days. They use filters only;
    Ask mode stays hidden.
- **Audience cards:** the product peeks reveal row by row on scroll-in.
- **Under reduced motion:** every scene renders its final state and nothing loops.
- **Smoothness rules (revision 26).** Deepak found the first cut "sharp and jerky". Three things fix it:
  - **Animate only `transform` and `opacity`, on GPU layers.** Hover is pure CSS (`:hover` and
    transitions) with no state change or re-render. The glows are pre-rendered gradient blobs that
    travel by `translate3d`, chasing the cursor over 1s with `cubic-bezier(0.16, 1, 0.3, 1)`; nothing
    repaints a gradient per frame.
  - **State changes roll or fade, never repaint.** The status chip and the Send button carry each
    state's color inside the odometer stack. Presses are 500ms keyframes with an expanding ring, and
    reveals are 900ms on the same curve.
  - **Off-screen work stops.** The hero ribbon stops drawing while the hero is off-screen, and the
    100ms refresh stops when no section that needs it is visible. In the build, use the same
    `IntersectionObserver` gating, Framer Motion's `useInView`, and `will-change` only on moving layers.
- **Build:**
  - `useInView({ once: true, amount: 0.3 })` for the stories.
  - One `pointermove` handler per card that writes `--gx`/`--gy`.
  - The odometer is a fixed-height window over a stack of values, with the first value repeated at the
    end so it can wrap without a visible jump.
  - The scene data comes from the `/tour` demo firm.

**Dates relative to today (revision 27).** Every date in the product scenes moves with the real date, so
the page never looks stale:
- **One offset for everything.** The /tour demo data was written as if today were Oct 18, 2026. Every date
  keeps its distance from today, so "14 days left", the percentages used and "behind pace" stay true.
- **Business days for the near future.** Upcoming due dates and follow-ups land on business days.
- **Smart display:**
  - Today, Tomorrow or Yesterday.
  - A weekday ("Thu") inside the current week.
  - Otherwise a short date ("Oct 9"). The year appears only for dates more than six months away in
    another year.
  - Tables keep full dates, and prose reads naturally ("was due Monday", "due tomorrow").
- **The calendar card** shows the next five business days starting today, from Monday at the weekend.
  Today gets a green highlight.
- **Activity uses relative times:** the newest audit-log row reads "now", then "12m" and "40m". The
  approval reads "Approved just now".
- **Build:** one shared `relativeDate()` helper for every marketing scene, and the same shift for the
  `/tour` seed (`prisma/seed.ts`), so the tour and the page always agree with each other and with today.

**Meet Brio as a scroll story (revision 28).** The day is the section where Brio is told as a character,
so it gets the same treatment as the bento, tied to the reader's scroll:
- **The line follows the scroll.** Its tip tracks a fixed point on screen, written as one `scaleX`
  (desktop) or `scaleY` (phone) per frame, so it never stutters and never moves on its own.
- **Each moment wakes when the line reaches its dot.** The dot pops and the card rises. If a fast scroll
  passes several dots at once, their moments start 600 ms apart. Each one plays a short story, then rests:
  - **8:30 brief:** the brief types itself in, word by word.
  - **10:15 Ask Brio:** the question appears, Brio thinks for a beat, then the answer streams in.
  - **2:00 client update:** the draft's checklist ticks section by section, then *Review and publish*
    is pressed.
  - **4:30 tidy the files:** the messy filename is struck through, the new name slides in, then
    *Approve* is pressed.
  - The "You ·" footer under each card fades in last, because the person makes every call.
- **NOW and NEXT.** During the workday (8:30 AM to 6:30 PM local), a pulsing NOW chip marks the latest
  moment that has already happened. Outside those hours, a NEXT chip marks the morning brief.
- **Build:** `useScroll` on the timeline with `useTransform` for the scale, and `useMotionValueEvent` to
  fire each moment once. Reduced motion shows the finished day with the line full.

**Phone variant (revision 29).** The phone board now matches the desktop variant. It sits left of the
desktop variant on the canvas as *Phone — variant: silk ribbon hero*:
- **Hero:** the silk ribbon runs behind the product cards. A white wash keeps the headline and copy clean,
  and the ribbon fades out just above the trust strip. Phones get about two-thirds of the threads, and the
  ribbon stops drawing while it's off-screen.
- **Surfaces:** every light section is flat white. The feature bento is the one flat gray band, with the
  same slanted edges as the dark bands.
- **Meet Brio:** the vertical timeline from revision 15 becomes the scroll story above. Its line draws
  downward.
- **Feature bento:** the phone gains the six scenes, stacked and re-laid for a 350 px card. The scenes
  keep the desktop stories and loops. Two changes fit the narrow card: *Approved just now* replaces
  *Request changes* in place, and the inbox shows two rows.
- **Touch states:**
  - Pressing a card sinks it to 98.5% and lights its green rim under the finger.
  - Buttons press in to 96.5%.
  - Starting a scroll cancels the press (`pointercancel`).
  - Hover styles sit inside `@media (hover: hover)`, so nothing stays stuck in a hover state after a tap.
  - The build uses `whileTap`, plus a `pointerdown` handler that places the glow.
- **Type:** the landing scale's phone end: headline 48, section titles 38, final CTA 42.

**Hover (150–200 ms, ease-out)**
| Element | Effect |
|---|---|
| Pill buttons | The › chevron slides 3 px right; primary gains a brighter electric glow; secondary lifts 1 px. |
| Text links (`or book a demo`, `Compare all plans ›`) | Underline wipes in from the left; the chevron nudges right. |
| Audience cards, feature tiles, pricing cards | Lift 4 px and the shadow deepens; on audience cards the product peek rises 6 px out of its panel; Standard's gradient border brightens. |
| Hero product composite | A slight 3D tilt toward the pointer (max ±3°, perspective 1600 px), Stripe's card tilt; desktop only. |
| Brio chips and the lockup in the nav | The sparkle runs one twinkle. |
| Nav "Product" and "Resources" | Stripe-style dropdown: one panel whose background morphs size and position between menus, instead of separate pop-ups. |

**Scroll (each runs once, 400–700 ms, staggered 80–150 ms)**
| Section | Effect |
|---|---|
| Nav | Transparent over the mesh; past the hero it gets a white 80% background with blur and a hairline. |
| Hero mesh | A WebGL gradient (a `minigl` port, as Stripe does) with this CSS as the fallback; a slight parallax (the band moves at 0.85× scroll). |
| Hero composite | Rises 24 px into place; the health ring counts 0 → 71; the Ask Brio answer writes in word by word; the Board card moves *In review → Approved*. |
| Meet Brio | The large lockup fades up and its sparkle twinkles once on entry. |
| A day with Brio | The timeline line **draws left to right, tied to scroll progress** (`useScroll` on the row, `scaleX` 0 → 1; downward with `scaleY` on phones). Each dot lights as the line reaches it, and its card rises and plays its story (8:30 → 10:15 → 2:00 → 4:30; revision 28). |
| 01 Connect | The three folder checkboxes tick in sequence; the "Map to engagement" button pulses once. |
| 02 Plan | The QPL-11 card slides from In Review into Approved, and the column counts update. |
| 03 Share | Riley's comment appears, then the item flips from "Awaiting your approval" to "Approved". |
| 04 Steer | The pace bars and time bars fill from 0; the "Behind pace" pills fade in last. |
| Section headings | Fade up 16 px; the chip eyebrow leads by 80 ms. |
| Dark skewed bands | The glows drift at a different scroll rate from the content, for depth. |

**Guardrails.** No scroll-jacking or pinned full-screen sequences, since the page must scroll normally.
Nothing loops except the mesh and Brio's sparkle. The animations must keep CLS at 0 (layout is reserved
before anything animates). The hero LCP is the H1 text, never the WebGL canvas.
- **firmä logo.** Keep the original gradient treatment (Deepak, revision 6). Render the real
  `BrandMarkIcon` and `BrandName` in a `group`: the stroke and text gradient are `#4d4d4d → #2d6d3a →
  #4aba5e` (`BRAND_WORDMARK_GRADIENT_STOPS`), deepening on hover to `#000000 → #00380c → #006e16`.
  On the dark footer, use `BrandMarkIcon variant="onDark"` (solid lime stroke). The wordmark there
  needs a light version, which the canvas shows as white → `#72ff70`; `BrandName` has no dark variant
  today, so the build adds one.
- **Brio's mark.** Only the app's lockup (sparkle + **Brio** + "AI" subscript), rendered with the
  real `<Brio fixedColor />` component in the build, never hand-assembled. The sparkle is bottle green
  `#009669` on light surfaces and electric green on dark; the name follows the text color, or Brio
  green in panel headers and chips. On the canvas, the day timeline's line runs through the dot
  centers, with the time labels below it.

## 5. Prioritized changes

**P0: copy and conversion (small diffs, ship first)**
1. Make "Start free" (→ `/signup`) the primary hero CTA and the header CTA; demote Contact Us to a text link.
2. Replace the rotating headline with one static `<h1>`; delete the "PROFESSIONAL" watermark h1.
3. Make *Take the tour* open in the same tab.
4. Show *Start free* in the header on phones.
5. Remove or verify the unsupported claims: NL doc search, Never Share, self-destruct timers, Wrap,
   biometrics. Replace Brio's "Read-only…" line with "never changes anything without your consent".
6. Remove the unsourced "93%" stat; settle the free-plan description in the FAQ against `config/pricing.ts`.
7. Retitle the page around the new H1 (title, meta description, OG).

**P1: the product-led rebuild (the bulk of the work)**
8. Hero composite from real app components with demo data, with the Ask Brio panel docked; retire
   `LegacyHeroScreenMock`.
9. **Meet Brio** as section 3: the mark, the four promises and "A day with Brio" (four real moments).
10. The four-row "How it works" with real screens (Drive picker, Board, client view, Firm Overview)
    and a Brio chip on each.
11. Built on your Drive diagram, replacing the Transformation section and both modals.
12. Pricing teaser and the open FAQ.
13. New `.marketing-site` tokens for the green system (§4): bottle, electric, deep forest and mint, the
    mesh as a reusable `MeshGradient` component (CSS first, WebGL later), pill buttons, chips. Retire
    the blue `#5a78ff` everywhere in marketing (decided: greens only), and replace the old lime
    `#72ff70` with electric green `#7DFF77`.

**P2: polish and growth**
14. One-shot, viewport-triggered motion for the hero, the Board and Brio, with reduced-motion fallbacks.
15. Who it's for cards linked to the audience pages; trim the 11-chip block.
16. Get Dharita Gada's written approval of her testimonial (or her edited version) before it ships;
    A/B test the H1 alternatives.
17. Footer: legal and FAQ as pages, not modals.
18. Bring the audience landing pages (`/landing/*`) onto the same system.
19. De-duplicate `/landing/fractional-execs` and `/landing/fractional-cmos` (same title and
    description today): rewrite `fractional-execs` for every fractional role, or redirect
    `fractional-cmos` to it.
20. Sign in and sign up on the same system (§3b, revision 20): the calm card on guides, the silk-ribbon canvas wave, the four value points on sign-up, and the step and field motion. Same flows; no new auth logic.

## 6. Decisions for Deepak

0. ~~Green or firma blue~~ **Decided by Deepak (2026-10-19): Green.** The green tokens in §4 are the
   build's token set; the Blue page stays on the canvas for reference only. One more reason it was
   the right call: the silk ribbon in periwinkle, violet and cyan is Stripe's own palette and motif,
   while the green ribbon is ownable.

1. ~~Accent~~ **Decided by Deepak (revision 3):** electric green `#7DFF77` for buttons, chips and
   badges; bottle green `#009669` for titles; firma blue dropped entirely, greens only.
2. **Display face:** keep Space Grotesk for headlines (recommended), or go all Inter like the app. Also
   a Tweak.
3. **Primary CTA:** "Start free" (recommended, since the free tier exists) vs. keeping "Book a demo" first.
4. **Brand in running copy:** "firmä" (as today, used in the mockup) vs. "Firma" for readability.
5. Which of Wrap / Never Share / share expiry are real or coming soon, so the page can say so.
6. **Hero headline:** Drive-led (recommended; it says what firmä is) or Brio-led ("…Let Brio write
   the updates."). Brio is prominent either way, through the hero panel and §3. A Tweak on the canvas.
7. **Files agent on the page:** the "Tidy the files" moment is labeled New. Show it only once the
   Files agent has passed the combined test pass and is released to all firms. Until then, the card
   swaps for Ask Brio on Files ("What's still in Drafts?").

8. **Hero background** (revision 21): the current saturated mesh band, or the silk ribbon from sign-in
   and sign-up (the "Desktop — variant: silk ribbon hero" board, left of the page: the full page, so
   the slanted sections below can be judged with it). Only the hero background changes; everything
   else is byte-for-byte the current page. With the ribbon the hero loses its 12° bottom edge, and the
   slants start at Meet Brio. The ribbon
   wraps the right side, beside the headline, behind the product screen and out at its lower right,
   with a white wash on the left for the text. If the ribbon wins, the page and the sign-up flow share
   one motion. If the mesh stays, sign-in and sign-up keep the ribbon on their own.
   Deepak called the variant "great" (2026-10-19). Recommendation: adopt it on the Green page, retire
   the mesh band, and make the ribbon firmä's motion signature, used only in the hero and on the auth
   pages (plus still frames in the final CTA, emails and share images). Before it's final: a phone
   hero with the ribbon, and the engineering guardrails in §3b (never delays the H1 or product screen,
   lighter on phones, paused off-screen, still frame for reduced motion).

## 7. When a direction is approved

- Build the new page beside the current one (e.g. `components/landing/v2/*`) behind a route or skin
  switch. Keep `landing-page.tsx`, `firm-transformation-section.tsx` and `LegacyHeroScreenMock.tsx` until
  Deepak signs off on removing them.
- Product visuals should render the app's real components with `/tour` demo data where possible
  (Board card, health ring, brief card), so the marketing screens never go stale.
- Verify at 1440 / 1024 / 768 / 375 in the browser and check Lighthouse (LCP, CLS), since the hero is
  live HTML. Nothing is committed or pushed without Deepak's approval.
