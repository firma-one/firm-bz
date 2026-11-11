# Count email campaign visits in Google Analytics

Status: built on `dev` on 2026-11-11, not committed. Checked in the browser as a US visitor and as an opt-in-zone
visitor. Still to do: the Vercel preview check, then ship when Deepak says so.

Preview locally as a US visitor with the `frontend-us-visitor` entry in `.claude/launch.json`, which sets
`ANALYTICS_COUNTRY_OVERRIDE=US`.

**History**
- Drafted 2026-11-11.
- Same day: switched to Google Analytics instead of a custom counter (summary under "Alternative kept on file").
- Same day: switched to a two-zone rule. Opt-in only where the law clearly requires it, and a notice everywhere else.

**Notice mock:** `.claude/plans/analytics-notice-mock.html`.

## Goal

For each Apollo sequence, see in Google Analytics:
- how many people open the tour from an email;
- how many of them sign up.

We want this for every market we email (US and UK now, Canada and Australia later), with no custom counting code and no
new paid tool.

## The problem today

The email links already carry UTM tags, for example
`firma.bz/tour?utm_source=apollo&utm_medium=cold-email&utm_campaign=wave1-us-agency`. GA reads those on its own.

But `ConsentAwareGoogleAnalytics` doesn't load GA at all until a visitor clicks Accept on the cookie banner. The
banner shows to every visitor in every country, so anyone who rejects or ignores it never reaches GA. GA sees only
the visitors who accept.

Google's Consent Mode doesn't fix this. Events from visitors who decline only appear through Google's behavioral
modeling, which needs about 1,000 daily users.

## Approach: two zones, on public pages only

This is the common pattern: consent tools like Cookiebot and CookieYes do the same with their location setting.

| Zone | Public pages (marketing, tour, sign-up, sign-in, `/go`) | App pages (`/d`, `/dash`, `/invite`, `/system` and the rest) |
|---|---|---|
| **Opt-in:** EU and EEA, Quebec, and any visitor whose country can't be read | Unchanged: the opt-in banner, GA only after Accept. | Unchanged. |
| **Notice:** everywhere else, including the US, UK, rest of Canada, Australia, Switzerland and India for now | GA loads on arrival. A small notice says so and links to Cookie settings. | Unchanged: the opt-in banner. |

Two rules apply in every zone:
- **A saved choice wins.** A visitor who rejected analytics before never gets GA.
- **Global Privacy Control:** a browser that sends this privacy signal never gets GA.

**Why app pages stay opt-in:** client portals carry firm and client names in their addresses and page titles, and
those visitors are our customers' clients. A visitor who moves from a public page into the app without a saved choice
has GA removed: its scripts are unloaded and its cookies cleared.

### Legal basis (Deepak to confirm; this is not legal advice)

- **US:** state privacy laws are opt-out for analytics like ours. The opt-out is the Cookie settings link, plus
  honoring Global Privacy Control, which California and several other states expect.
- **UK:** since 5 February 2026, PECR as amended by the Data (Use and Access) Act lets a site set cookies used only to
  collect statistics that improve the site, without consent. The visitor must be told clearly and given a simple way
  to object.
  - The exception fails if the data is also used for anything else, such as advertising. GA qualifies only with
    Google's own uses switched off (see step 6).
  - Deepak chose to rely on it. The rollout includes a final check.
- **EU and EEA:** the ePrivacy rules require opt-in for analytics cookies. France's narrow consent exemption for
  audience measurement doesn't cover GA. The EU's Digital Omnibus would allow consent-free first-party aggregated
  audience measurement, but it's still being negotiated. Opt-in zone.
- **Quebec (Law 25):** tracking must be off by default. Opt-in zone.
- **Rest of Canada, Australia, Switzerland:** notice and opt-out is generally accepted. These come from vendor
  summaries, not primary sources.
- **India:** the DPDP Rules require full consent from 12 May 2027. Move India to the opt-in zone before then.
- **Other countries:** notice zone. If a market we enter turns out to need opt-in, add it to the list. That's a
  one-line change.

## Changes

### 1. Zone, read once on the server

- The root layout (`app/layout.tsx`, already dynamic because it reads the session cookie) reads Vercel's
  `x-vercel-ip-country` and `x-vercel-ip-country-region` headers with `headers()`.
- A small module, `lib/analytics-zone.ts`, holds the opt-in list and maps the headers to
  `analyticsMode: 'consent' | 'notice'`:
  - **EU 27:** `AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE`.
  - **EEA:** `IS LI NO`.
  - **EU territories that IP lookups report under their own codes:** `AX GF GP MQ RE YT MF`.
  - **Quebec:** country `CA` with region `QC`.
  - **A missing country header:** maps to `'consent'`, so local dev keeps today's behavior.
  - **Everything else:** maps to `'notice'`.
- An `AnalyticsModeProvider` passes the mode to the client. The banner, the GA loader and the tour shell all read it.
- **Preview testing:** an `ANALYTICS_COUNTRY_OVERRIDE` env var (for example `US` or `DE`), set only on Vercel's
  Preview environment. The code ignores it when `VERCEL_ENV === 'production'`.

### 2. One decision function

Add `analyticsAllowed({ mode, stored, gpc, pathname })` to `lib/cookie-consent-storage.ts`. It applies these rules
in order:
1. A saved choice wins, whichever way it went.
2. If Global Privacy Control is on, GA is not allowed.
3. On an app page, GA is not allowed (there's no saved choice by this point).
4. On a public page, GA is allowed in `notice` mode and not in `consent` mode.

The public pages are an allowlist, so a new app route stays opt-in by default: `/`, `/landing`, `/pricing`, `/contact`,
`/privacy`, `/terms`, `/waitlist`, `/resources`, `/tour`, `/signup`, `/signin`, `/go`.

### 3. GA loader (`components/analytics/consent-aware-google-analytics.tsx`)

- Use `analyticsAllowed`, and check it again on every page change with `usePathname`.
- Moving into the app without a saved choice calls the existing `revokeGoogleAnalyticsClientSide`.
- Add `allow_google_signals: false` and `allow_ad_personalization_signals: false` to `gtag('config', …)`. Today's
  denials of `ad_storage`, `ad_user_data` and `ad_personalization` stay.

### 4. Banner and notice (`components/ui/cookie-consent.tsx`)

When the mode is `notice`, the page is public and there's no saved choice, show the notice from the mock instead of
the banner. It doesn't block the page or the tour.

- **Copy:** "We use Google Analytics to see how visitors use this site.", then a Cookie settings link and an OK button.
- **Placement:** bottom-left on desktop, top on phones (under 768px wide).
- **Layering:** it sits below the tour's intro dialog and its overlay, so a click on it can't close the dialog.
- **OK** only hides the notice. It records that the notice was seen under its own key, `fm_analytics_notice_seen`.
  It doesn't write `fm_cookie_consent`, so it isn't treated as consent inside the app.
- **Cookie settings** opens today's details panel. Saving there writes a real choice, which then wins everywhere.
- **Everything else is unchanged:** `consent` mode, and app pages in either mode.

### 5. Tour shell (`components/demo/demo-tour-shell.tsx`)

The tour waits for the banner to be answered before it opens. In `notice` mode it opens straight away.

### 6. GA admin settings (done by Deepak, 2026-11-11)

All done on property FirmaBz (`a392577060p534595617`) and checked from screenshots:
- **Data sharing:** all four settings are off.
- **Data Processing Terms:** accepted on 25 April 2026.
- **Google signals:** off.
- **User-provided data collection:** off.
- **Ads personalization:** allowed in 0 of 307 regions.
- **Granular location and device data:** kept on. It's aggregate and helps catch layout bugs.
- **Retention:** event data and user data are both 2 months, and "Reset on new user activity" is off.
- **Google Ads links:** none.
- **Key event:** `sign_up` was created with "Create with code", counted once per session, with no default value.

These are needed for the UK exception, and sensible anyway. Menu names were checked against Google's help pages on
2026-11-11.

**Admin, then Account, then Account details:**
- Turn all four data sharing settings off:
  - "Google products & services". With this on, Google is an independent controller of the data.
  - "Modeling contributions & business insights".
  - "Technical support".
  - "Recommendations for your business".
- Under "Data Processing Amendment", accept the Google Ads Data Processing Terms if it offers them. These terms make
  Google our processor. They're automatic only for accounts based in the UK, EEA or Switzerland.

**Admin, then Data collection and modification, then Data collection:**
- Switch off "Enable Google signals data collection".
- Under "Advanced settings to allow for ads personalization", switch it off for all regions.
- Make sure user-provided data collection is off.

**Admin, then Data collection and modification, then Data retention:**
- Set event data retention to 2 months. That's the shortest setting, and it doesn't affect the standard reports.
- Switch off "Reset user data on new activity".

**Admin, then Product links, then Google Ads links:** there should be no link. A link sends data to Google Ads.

**Admin, then Data display, then Key events:** add `sign_up` as a key event. The sign-up form already sends it
(`components/signup/signup-form.tsx:331`).

**UK gray area:** GA keeps event-level data for at least 2 months, and that can't be shortened. The ICO says not to
keep individual-level data once it's aggregated. Record the decision in a short written note before shipping.

### 7. Privacy policy (`components/legal/privacy-policy.tsx`)

- **"Usage telemetry" clause:** it now says GA loads "only after you accept analytics cookies". It changes to:
  - Outside the EU, EEA and Quebec, GA loads on our public pages without asking, and you can turn it off in Cookie
    settings.
  - Inside those regions, and inside the app everywhere, it loads only after you accept.
  - We honor Global Privacy Control.
- **Cookies section:** "aggregated and anonymized" becomes "pseudonymous", matching the telemetry clause.

## Reading the numbers (no code)

In GA, open Reports, then Acquisition, then Traffic acquisition:
- filter "Session source / medium" to `apollo / cold-email`;
- break down by "Session campaign".

That gives sessions and `sign_up` key events per sequence. GA keeps the campaign for the whole session, even after the
tour drops the tags from the address, so a sign-up is credited to the email that brought the visitor.

## What it still won't count

- Visitors who block GA with an ad blocker, Brave, or Firefox's strict mode.
- Browsers that send Global Privacy Control, and anyone who opts out.
- Visitors in the opt-in zone who don't accept the banner.

For campaigns in the notice zone, this is close to a full count, not an exact one.

## Tests

- **Zone mapping:**
  - `US`, `GB`, `AU`, `CH`, `IN`, and `CA` with region `ON` map to `notice`.
  - `DE`, `FR`, `NO`, `RE`, `CA` with region `QC`, and a missing header map to `consent`.
  - The override is ignored in production.
- **Decision function:** one case per rule.
  - A saved Reject wins in `notice` mode.
  - Global Privacy Control wins.
  - An app page with no saved choice is denied.
  - `notice` on a public page is allowed.
  - `consent` on a public page is denied.
- **GA loader:**
  - It loads on `/tour` in `notice` mode.
  - It never loads with Global Privacy Control.
  - It revokes on moving to `/d/...` without a saved choice.
- **Banner:**
  - `notice` mode shows the notice on `/tour`, not the banner, and shows the banner on `/d`.
  - OK writes only the notice key.
  - `consent` mode is unchanged.
- **Tour shell:** it doesn't wait for the banner in `notice` mode.

## Rollout

1. Deepak approves the notice mock and gives the UK exception a final check. The GA admin settings are done.
2. Build on `dev`, then check locally:
   - with no country header, the opt-in banner is unchanged;
   - with the override set to `US`, the notice shows. GA itself doesn't load in development.
3. On the Vercel preview, with the override set to `US`:
   - load `/tour?utm_source=apollo&utm_medium=cold-email&utm_campaign=plan-check`;
   - confirm GA loads without a click, its collect request carries the campaign, and the visit shows in GA Realtime;
   - repeat with `DE` and confirm the banner shows and GA waits;
   - check whether `NEXT_PUBLIC_GA_ID` is set on Preview, and if it is, filter preview hostnames out of reports.
4. Ship with the next PR, only when Deepak says so. Visits from emails already sent count from the deploy onward.
5. Before 12 May 2027, move India to the opt-in list.

## Effort

- About half a day of code.
- About 15 minutes of GA admin settings for Deepak.

## Alternative kept on file: a first-party counter

The first draft planned a small cookieless counter on our own database:
- a `CampaignVisit` table;
- a public `/api/campaign-visit` route;
- a page beacon;
- a report on `/system/links`.

It counts every visit in every country, ad blockers included, and needs no legal judgment. But it doesn't show
sign-ups, and it duplicates GA. Pick it up again if the UK check says GA can't rely on the exception, or if
ad-blocker losses turn out to be large.

## Decided (2026-11-11)

1. **UK:** rely on the statistics exception, with GA set up as in step 6. Deepak gives it a final check before
   shipping.
2. **Notice:** shown everywhere in the notice zone.
3. **Pages:** public pages only. App pages stay opt-in.
4. **Zones:** opt-in in the EU, EEA and Quebec, and the notice everywhere else.

## Open

- Nothing. The notice mock was approved on 2026-11-11.
