# PRD — Branded Link Redirect System (`/to/`)

**Status:** Deferred — not building now
**Last reviewed:** May 2026
**Owner:** Deepak Shettigar (Founder, Firma)
**Estimated build effort when picked up:** 2-3 days for solo dev

---

## TL;DR

A self-hosted URL shortener at `firma.bz/to/<slug>` for sharing external resources on LinkedIn, X, and other platforms — with click tracking, source attribution, and UTM passthrough. **Deferred** in favor of higher-leverage work (content under firma.bz, continued FCMO survey campaign). Revisit when content distribution volume justifies the infrastructure.

---

## The Problem We Were Trying to Solve

When sharing external resources (Gartner reports, GitHub repos, third-party blog posts) to LinkedIn or X, three things go missing:

1. **Click attribution** — no native way to know how many people clicked vs. just saw the post
2. **Cross-platform aggregation** — LinkedIn/X analytics live in separate dashboards
3. **Brand impression** — the user sees the destination domain, not Firma's

The initial idea was a branded short-link system with a database, admin UI, and analytics dashboard. Possibly with a 1-to-many "resource collection" pattern (`firma.bz/to/ab12` → page with multiple curated links + commentary).

---

## What We Considered Building

### Architecture (single-hop redirect, no interstitial)

```
User clicks  firma.bz/to/abc123?utm_source=linkedin&utm_medium=post
   ↓
Server-side /to/[slug] handler:
   1. Look up slug in DB → get target_url + default_utms
   2. Read inbound UTMs from request
   3. Merge: inbound wins on conflict, defaults fill gaps
   4. Upsert per-source counter row
   5. 302 redirect to: target_url + merged UTMs
   ↓
User lands on  gartner.com/fcmo-best-practices?utm_source=linkedin&...
```

**Critical UX decision: no interstitial.** Branded splash pages with auto-redirects (Bored Panda-style) were considered and explicitly rejected. They contradict Firma's "founder-led, no-pitch" brand voice and trigger algorithm down-ranking on X.

### Data model (refined to one + one)

```
short_links_to
├── id              cuid/uuid
├── slug            unique, indexed, 6 chars [a-hjkmnp-z2-9] (omits 0,o,1,l,i)
├── target_url      string
├── default_utms    json (optional)
├── title           string (internal label)
├── click_count     int default 0
├── last_clicked_at timestamp nullable
├── created_at, updated_at, archived

short_link_to_clicks_by_source
├── id
├── short_link_id   FK
├── utm_source      string
├── utm_medium      string
├── click_count     int
├── last_clicked_at timestamp
├── UNIQUE(short_link_id, utm_source, utm_medium)
```

Pre-aggregated counters, not per-click event rows. One upsert per click. Scales without bloat.

### Slug strategy

- **Length:** 6 characters (~887M combinations with the cleaned alphabet — collision probability stays under 1% well past 30,000 links)
- **Alphabet:** `abcdefghjkmnpqrstuvwxyz23456789` (31 chars, no `0/o/1/l/i` ambiguity)
- **Randomness:** `crypto.randomInt` or `crypto.getRandomValues` (NOT `Math.random`)
- **Custom slugs allowed:** admin form auto-generates if blank, accepts custom if provided (e.g., `gartner-fcmo`)
- **Route namespace:** `/to/` deliberately separate from existing `/go/` (which is reserved for the FCMO campaign and other Tally form redirects). Two namespaces serve different intents.

### Admin UI (skeleton)

- `/system/admin/to-links` — list/create/edit/archive
- Password-gated (env var or existing auth)
- `noindex, nofollow` meta + robots.txt entry
- Match `/research` page's minimal aesthetic

---

## Why We're NOT Building This Now

This is the most important section. The pros/cons matter more than the architecture when revisiting later.

### What `/to/` redirects DO deliver

| Benefit | Real value | Already available elsewhere? |
|---|---|---|
| Per-link click count | Modest | LinkedIn shows post engagement; X shows clicks |
| Source attribution across platforms | Modest | UTM strings work without our redirector |
| Brand impression in URL bar | Tiny | Sub-second visibility during 302; most users don't notice |
| Future link-target flexibility | Real but rarely exercised | We could update Gartner's link if it moves, but it rarely does |
| Cross-platform aggregation in one dashboard | Real | The only thing native analytics genuinely can't do |

### What `/to/` redirects do NOT deliver

These were our initial assumptions; they turned out to be wrong on inspection.

**❌ GA4 attribution for the click.** GA4 is client-side and only fires when a page renders. A server-side 302 redirect renders nothing on firma.bz, so GA4 sees nothing. UTMs land on the destination (Gartner) URL — but Gartner has its own analytics, not ours. **GA4 has no role in `/to/` redirect tracking.** Our DB IS the analytics.

**❌ Traffic to firma.bz.** Users clicking through `/to/abc123` end up on the destination, not on firma.bz. The redirect is a pass-through, not a traffic-acquisition mechanic. "Traffic to firma" is a different goal that requires owned-content pages.

**❌ SEO benefit.** Redirects don't pass equity backward to firma.bz. Heavy use of an outbound redirect domain mildly hurts domain reputation over time (search engines deprioritize "link farm"-looking domains).

**❌ GEO (LLM citation) benefit.** LLMs cite original content, not intermediate redirects. ChatGPT/Claude/Perplexity citing a Gartner article cites gartner.com, not firma.bz/to/abc123. Zero impact.

**❌ Brand awareness in any meaningful sense at low volume.** The "URL bar flash" theory of brand-building requires either (a) being a destination brand like Bitly where the redirect IS the product, or (b) traffic volume in the thousands+ per share. Neither applies to Firma at current scale.

### Algorithm and trust costs

- **X/Twitter actively down-ranks** non-mainstream redirect domains in feed distribution
- **LinkedIn link previews** are richer for known publishers than for our redirector
- **User trust** is higher for raw destination URLs than for opaque redirector links (especially in a phishing-aware audience)

### Engineering and maintenance costs

- 2-3 days to build (DB schema, redirect handler, admin UI, auth gate, analytics view)
- Ongoing: slug collision handling, archived link management, dashboard upkeep, occasional GA4-vs-DB analytics confusion (engineer-future-you will ask "why doesn't this match GA4?")
- Opportunity cost: those 2-3 days could go to product features, content writing, or campaign outreach — all of which have higher current marginal value

---

## What We're Doing Instead

Three zero-infrastructure plays that capture most of the benefit:

### 1. Publish original content under firma.bz/research or firma.bz/blog

This is the actual SEO and GEO move. Original content under our domain:
- Gets ingested and cited by LLMs (GEO win)
- Ranks in Google for niche queries (SEO win)
- Renders a real page where GA4 actually tracks visitors (analytics win)
- Builds authority around fractional CMO operations (brand win)

**First post candidate:** Aggregate findings from the FCMO survey when it closes (~2 weeks post-launch).

### 2. Share external content with raw destination URLs

Just paste `gartner.com/...` in the LinkedIn/X post. Trade-offs:
- Lose: click attribution (small; native analytics cover most of it), URL update flexibility (rarely needed)
- Gain: rich link previews, algorithm parity, user trust, zero engineering

### 3. One-liner Firma reference in every share

Bottom of each post:
> *"Sharing this — also building Firma to help fractional execs manage client work. firma.bz."*

Zero friction, opt-in brand impression, no redirector required. People who care click through to firma.bz (where GA4 *does* track them). People who don't, don't.

This is what experienced founders actually do — Patrick Collison, Lenny Rachitsky, Pieter Levels share raw links with their brand in the post copy, not in the URL structure.

---

## When to Revisit This PRD

Revisit this work when **at least two** of these conditions are true:

1. **Volume justifies it**: sharing 50+ external resources per quarter, and the lack of unified cross-platform analytics is genuinely impeding decisions about content strategy
2. **Native analytics are insufficient**: LinkedIn/X analytics no longer answer the questions that matter (e.g., we need to track resource shares from newsletter, podcast, and community channels in one view)
3. **Brand equity exists**: firma.bz is a recognizable name in the fractional CMO community such that branded short URLs would be perceived as curation, not as a tracker
4. **Engineering capacity allows it**: we have a dedicated frontend/backend resource and 2-3 days of slack
5. **Curated link collections become a content format**: we're regularly publishing "5 reads on X" roundups that would benefit from a single shareable URL pointing to a curated page (NB: this is the `firma.bz/library/<slug>` pattern, distinct from `/to/<slug>` redirects — collection pages are owned content, redirects are pass-throughs)

If only one condition is true, push it to the next quarter. If none, leave parked.

---

## Specifically What NOT to Do (Mistakes to Avoid)

For future-Deepak or future engineer picking this up:

1. **Do not add an interstitial / splash page** between firma.bz/to and the destination. The auto-redirect-in-Ns pattern is the most-hated UI on the internet and contradicts Firma's brand voice. Single-hop, immediate 302, no exceptions.

2. **Do not try to make GA4 track the click.** GA4 doesn't see server-side redirects. Don't waste time on Measurement Protocol, JS-shim interstitials, or any other "make GA4 work" approach. The DB IS the analytics for the `/to/` step.

3. **Do not store per-click event rows.** Pre-aggregate by `(short_link_id, utm_source, utm_medium)` upsert. This scales cleanly; per-click rows turn into table-bloat fast for almost no analytical gain at our likely volume.

4. **Do not use `Math.random()` for slug generation.** Use crypto-secure random. The cost is negligible; the collision pattern of `Math.random` is real.

5. **Do not unify with `/go/`.** The `/go/` namespace is reserved for campaign redirects (Tally forms, time-sensitive promotions) where the URL is the persistent reference. `/to/` is for content shares. Different use cases, different lifecycles, keep them separate.

6. **Do not allow hard-delete on short_links.** Soft-archive only (`archived = true`). Old click data must remain attributable; deleted links create gaps in retrospective analysis.

7. **Do not build a fancy charting library into the admin view.** SVG bar chart or HTML table is sufficient. Recharts, Chart.js, Plotly are all overkill for what's effectively a 12-row table.

8. **Do not implement 1-to-many "collection page" redirects under `/to/`.** Resource collection pages are a different concept (owned content, intentional destination) and should live under `/library/<slug>` or `/research/<slug>`. Mixing the two confuses both the architecture and the UX.

---

## Open Questions for Future Revisit

These were raised during ideation but not resolved. Document so they don't have to be re-discovered.

1. **Bot filtering**: should we filter out obvious bot clicks from analytics? At our scale, probably not — and bots can teach us things (e.g., is our content being scraped?). Revisit if click counts get noisy.

2. **Geo enrichment**: Vercel/Cloudflare expose country headers on the request. Worth capturing in the counter table? Probably not until we're doing geographic campaign segmentation in a meaningful way.

3. **Sunset policy for archived links**: when a link is archived for >12 months and has had zero clicks for >6 months, do we hard-delete to keep the DB tidy? Open. Default position: leave them indefinitely.

4. **Slug taxonomy for custom slugs**: should we enforce a naming convention (e.g., `gartner-fcmo-2025` vs. `gartner_fcmo_2025` vs. `gartnerfcmo`)? Currently the spec is permissive within `[a-z0-9-_]`. Personal preference, low stakes.

5. **Auth approach if we don't have one yet**: single-password env var works for solo founder. Becomes inadequate when adding any teammate. Decide at implementation time based on who else needs access.

6. **Integration with /research and /go/ legacy redirects**: when this gets built, do we migrate `firma.bz/go/cmpju66al0000l404c5teepm6` into the new system as a custom-slug record? Or leave it in its current implementation untouched? Default position: leave legacy `/go/` alone, build `/to/` from scratch with no migration debt.

---

## Reference Material (from original ideation conversation)

### Established patterns this would join

- Twitter Blue link shortening
- Substack notes referrals
- Marketing tool affiliates
- Viral content sites (Buzzfeed, Bored Panda) with auto-redirect interstitials (← anti-pattern, do not emulate)
- Pieter Levels / Marc Lou / Lenny Rachitsky: branded short URLs for tracking, **no interstitial**, immediate redirect

### When the interstitial / collection-page pattern DOES make sense (not for Firma now)

- Newsletter operators where the interstitial is a "subscribe" CTA
- Established brands where the brand IS the destination
- Conference organizers ("session recap → register for next event")
- SaaS post-PMF with dedicated growth teams running interstitial as one channel among many

What these have in common: **the interstitial is part of an established attention transaction, not a surprise tax.** Users opted into the brand's content cycle, so a brand interstitial is acceptable. Firma is pre-brand at current stage.

### The honest summary that finally killed this

> "`/to/` redirects don't generate Firma traffic; they generate Firma attribution. You're not bringing people to your site through them — you're staying in the middle of their click long enough to learn that the click happened and where it came from, then getting out of their way."

The system has value, but the value is attribution-of-shares, not traffic-acquisition. At current scale, native platform analytics + raw destination URLs + a one-line founder reference in the post copy captures 80% of the attribution value with 0% of the engineering cost. The other 20% isn't worth building infrastructure for until volume increases meaningfully.

---

## Build Checklist (for when this gets picked up)

In order:

- [ ] Confirm the conditions in "When to Revisit" section are met
- [ ] Audit the existing `firma.bz/go/...` implementation — is it a Next.js route, a Vercel config, or middleware?
- [ ] Decide migration approach: integrate legacy `/go/` into new system, or leave parallel?
- [ ] DB migration: `short_links_to` + `short_link_to_clicks_by_source`
- [ ] Public route: `/to/[slug]` with merge-and-redirect logic
- [ ] Admin route: `/system/admin/to-links` with auth gate
- [ ] Admin UI: list, create, edit, archive
- [ ] Analytics view per link: total clicks, top sources, top mediums (table or simple SVG)
- [ ] Robots.txt entry for `/system/`
- [ ] Set `noindex` meta on admin pages
- [ ] Document slug strategy in code comments
- [ ] Seed first link, verify end-to-end with test UTMs
- [ ] Add one-line note in README about how to query the counter tables directly
