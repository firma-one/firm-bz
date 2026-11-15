# GA visits to "unlinked" pages: findings (2026-11-15)

Analysis only. No code, GA settings or commits were changed.

## TL;DR

- **The `/resources/trust-center` page is linked.** It appears in the header Resources menu, the footer, the home page's security section and the footer of both campaign emails, and it is in the sitemap. The only pages that are really unlinked are the `/resources/docs/**` pages.
- **Every `/resources/**` hit in the last 28 days looks like a bot.** Each one is `(direct) / (none)`, Chrome, one view per user, 0–2 s, with no engagement, and blog posts show exactly the same pattern. The docs pages aren't being singled out. Headless-Chrome crawlers that run JavaScript are fetching pages across the whole site.
- **None of these hits came from the Apollo emails.** There is no Email channel and no Organic Search at all in 18 Oct – 14 Nov.
- **Bots do inflate the raw numbers.** Roughly half the "active users" in the screenshot are 0-second, single-view visits. Judge Apollo by sessions with `utm_campaign` (Email channel) and by *engaged* sessions, not by active users.

## 1. How the site exposes these pages (code, `frontend/`)

| Page | Linked from | Sitemap | robots / meta | Served |
|---|---|---|---|---|
| `/resources/trust-center` | `components/marketing/v2/config.ts:47` (header Resources menu), `:77` (footer), `components/marketing/v2/home/built-on-drive.tsx:89` (home page security section), footer of both campaign emails (`lib/email-templates/campaigns/firma-intro-2026-11.ts:114`, `brio-whats-new-2026-11.ts:109`) | **Yes**, priority 0.6 (`app/sitemap.ts:49`) | indexable, canonical set | yes |
| `/resources/docs/**` (index, security, authentication/signup·signin·logout, features, dash/*) | Only the docs' own sidebar (`components/marketing/v2/docs/docs-nav.tsx`) and `components/navigation/sidebar.tsx:74` ("User Guide"), which is **dead code** (nothing imports `components/layouts/app-layout`) | **No** (left out on purpose, `app/sitemap.ts:10`). It was listed before April 2026 (git `5d0cdff3`, `55a91b86`), so Google may still have the old URLs | **indexable**: no `robots`/`noindex` in `app/(resources)/resources/docs/layout.tsx` or the pages | yes, all built |

- `robots.ts` allows `/` and disallows only `/api/`, `/d/`, `/tour/`, `/system/`, `/signin`, `/signup`, `/auth/`, `/waitlist`.
- `next.config.js:69-72` sets 308 redirects: `/docs` and `/docs/*` go to `/resources/docs/*`, and `/trust-center` goes to `/resources/trust-center`. A scanner that probes `/docs` therefore ends up on a live page with the GA tag.
- Campaign links carry `utm_source=email&utm_medium=product-update&utm_campaign=<id>` (`lib/email-templates/campaigns/kit.ts:50`).

## 2. What GA shows (read only, property FirmaBz, last 28 days: 18 Oct – 14 Nov 2026)

Pages and screens, filtered to `resources`: 14 views from 14 users across 11 paths.

| Path | Views | Session source/medium | Browser | City | Engagement |
|---|---|---|---|---|---|
| /resources/trust-center | 3 | (direct)/(none) | Chrome | (not set) ×2, … | 0 s |
| /resources/blog/comparisons/clinked-vs-pockett | 2 | (direct)/(none) | Chrome | Jackson Township, Singapore | 0 s |
| /resources/blog/… (4 other posts) | 1 each | (direct)/(none) | Chrome | Cheonan-si, (not set) ×3 | 0 s |
| /resources/docs/authentication/signup | 1 | (direct)/(none) | Chrome | São Paulo | 2 s |
| /resources/docs/security | 1 | (direct)/(none) | Chrome | (Bangladesh, per Deepak's report) | 2 s |
| /resources/docs/dash/document-actions | 1 | (direct)/(none) | Chrome | (not set) | 0 s |
| /resources/changelog | 1 | (direct)/(none) | Chrome | Mumbai | 6 s (likely Deepak) |

Traffic acquisition for the same 28 days: Direct 59 sessions (25% engaged), Unassigned 2, Paid Social 1. There is **no Email channel and no Organic Search**.

Not checked: device category and OS. The GA UI dropped the OS dimension while I was switching. With one view each and "Chrome" everywhere, the conclusion wouldn't change.

## 3. Where the traffic comes from

**`/resources/docs/**`: crawlers and scanners, not people.**
- No referrer, `(not set)` or scattered cities (São Paulo, Bangladesh, Cheonan, Jackson Township, Singapore), one view per user and 0–2 s match the profile of SEO, AI or uptime crawlers and security scanners running headless Chrome. These run the GA tag, and because they're outside the EU/EEA and Quebec, our consent rule lets GA fire.
- They most likely reach the docs through old index entries (the docs were in the sitemap until April 2026), crawler link-following from page to page (the docs sidebar links every docs page), and scanners probing common paths such as `/docs` and `/security`, which our redirect sends to `/resources/docs`.
- These are not from the emails (no UTMs, no Email channel) and not from Deepak (India and real engagement show up only on `/d/...`).

**`/resources/trust-center`: the same bots, plus a possible email-scanner effect.**
- The page is in the sitemap and linked on every marketing page, so crawlers find it easily. Its hits look just like the blog-post hits.
- Corporate mail-security systems (Microsoft Safe Links, Proofpoint, Mimecast) open every link in an email to scan it, sometimes in a headless browser. A pre-click like that would arrive *with* UTMs, though, and GA shows no email-tagged sessions. So it isn't happening yet, or Apollo's click-tracking redirect drops the UTMs (see the last point under section 5).

**`/` and blog posts:** the same crawler pattern. The 2 United States `/` users with 0 s are probably bots too.

## 4. Recommendations (per page)

| Page | Recommendation | Why |
|---|---|---|
| `/resources/trust-center` | **Keep, keep linked, keep in the sitemap.** No change. | It's a real page that is meant to be found. |
| `/resources/docs/**` (stale user guide) | **Keep it served, but add `robots: { index: false, follow: false }` to `docs/layout.tsx`.** Later, either refresh the guide and re-link it, or redirect `/resources/docs/**` to `/resources/faq` or the Trust Center. | The docs are stale, unlinked and still indexable. `noindex` takes them out of search results without breaking old bookmarks. |
| `/resources/docs/security` | **Redirect to `/resources/trust-center`** (308) once the noindex is in place, or as part of retiring the docs. | It duplicates the Trust Center, and scanners that probe "security" pages should land on the current one. |
| `/docs`, `/docs/*` redirects | Point them at `/resources/faq` (or leave them until the docs are retired). | They currently send probes to stale pages. |
| `components/navigation/sidebar.tsx` "User Guide" link | Remove it when the old layout is deleted. It's dead code, not a traffic source. | Per [[no-delete-until-signoff]]. |

**Sitemap and robots.txt:** `/resources/docs` is already out of the sitemap. Don't add a robots.txt `Disallow` for it *first*. A blocked URL can't be recrawled, so Google never sees the `noindex` and may keep the URL indexed without a snippet. Ship the `noindex` first, then add `Disallow: /resources/docs` to `robots.ts` once Search Console shows the pages dropped (or skip the disallow and go straight to redirects).

The `noindex` will **not** stop the bots. Crawlers that ignore robots rules will keep running the GA tag. It only stops search engines from sending real people to stale content.

## 5. Is bot traffic inflating the Apollo numbers?

- **It inflates the raw totals, not the campaign itself.** In 9–15 Nov, 28 active users but only 5 engaged sessions. Most of the 23 non-engaged users are bots, and Deepak accounts for most of the engaged ones.
- **For Apollo, look only at sessions tagged with `utm_campaign`.** That's the Email channel, or session campaign = `firma-intro-2026-11`. Look at engaged sessions there. Bots without UTMs can't pollute that view. Email scanners that pre-click links can, so treat email sessions under 1 s with no scroll as scanner clicks.
- **Suggested GA setup** (Deepak decides; nothing has been changed):
  - A **comparison or segment "Engaged sessions only"** (session engaged = 1), used as the default lens for marketing reports. This works better than excluding Country = (not set), which drops only part of the bots: the São Paulo, Cheonan and Singapore hits have a country.
  - Mark Deepak's own traffic as internal (Admin → Data streams → Define internal traffic by IP, then set the "Internal Traffic" data filter to Active) so it stops counting as engaged use.
  - GA4 can't filter by engagement time at collection, so the 1-second rule belongs in an Exploration segment, not in a data filter.
- **Worth checking:** GA shows *no* Email-channel sessions at all since the 9 Nov send. Either nobody has clicked yet, or Apollo's click-tracking redirect is removing the UTMs, which would make every email click look like Direct. Click a link in a test send and check that the landing URL still has `utm_*`.
