# Publish & send: one Brio action, the whole update by email (2026-11-17)

Mock: https://claude.ai/artifact/HrnCvBZYPn32HKaFBRMvU6 (row "Publish & send"). Deepak: "Build it."

## Decisions (Deepak, 2026-11-17)

- One Brio action on the Latest update: Rewrite with Brio. "Draft an update" (Brio's separate letter,
  a second credit) goes. Its component stays in the code, unmounted, until sign-off.
- The email carries the **whole published update**, not a "what changed since" list or a teaser.
  Sending costs no credit (no model call).
- Brio leaves out sections with nothing to report. Mitigation & Contingency and Next Steps stay the
  Lead's: the review pane keeps a box for each; left empty, they're left out when published (no more
  "NA" to get past the gate). Warn before publishing and before sending when they're missing.
- Recipients: everyone on the engagement (any role, not the sender) is filled in, each removable;
  any email address can be added. Addresses not on the engagement are "email only": no Inbox, no
  link into Firma, Reply-To is the sender.
- Optional note from the sender, above the update.
- Optional: attach the Overview as a PDF (the same capture as Download PDF).
- Simplified (Deepak, 2026-11-18: "too many options"): **one email form**, Email this update. The
  review pane has no "Also email it": its footer is Discard · Publish & send… · Publish, and Publish &
  send… publishes, then opens Email this update filled in. The pencil opens the **same pane** with the
  published update, every section a box (Cancel instead of Discard). In the sheet, To and the note
  come first, in the email's own order; warnings sit by the button they're about.

## Build

1. `lib/ai/summary-sections.ts`: `dropUnfilledLeadSections`, `missingLeadSections`, `withLeadSections`.
2. Prompt (`lib/ai/engagement-summary.ts`): Summary and Progress always; Collaboration, Risks, Needs
   Attention only with something to report; lead headings still carry the placeholder.
3. Publish (`approveEngagementAiSummary`, `updateEngagementInsightsSummary`): unfilled lead sections
   are dropped, not refused.
4. Route `app/api/projects/[projectId]/send-update`: GET recipients + last send; POST sends the
   published update (members: email + Inbox; addresses: email only, Reply-To sender; optional note,
   optional PDF). Lead only, refused once Completed, records each send on `settings.statusUpdates`.
5. Email: `renderEngagementUpdateEmail` (sections with labels, byline, note, CTA for members only).
6. UI: `UpdateEmailFields` (To chips + add address + note + PDF), review pane top block and
   "Publish & send to N", `EmailUpdateSheet` from the card's mail icon (and the toolbar's Email).
7. /tour mirrors it (no requests, nothing sent).

- Rewrite with Brio keeps going when its pane closes (Deepak, 2026-11-18): the sparkle becomes a
  working sparkle (`components/brio/brio-working-sparkle.tsx`) that opens the pane again, Stop is in
  the pane, and a toast says when the draft is ready. Closing the pane never discards a draft now (it
  used to, and lost drafts whose last words were still being typed out); Discard does, asking first
  when something was typed into it.

## Status (2026-11-18)

- [x] 1–3 sections and publish  - [x] 4–5 route and email  - [x] 6 UI  - [x] 7 tour  - [x] tests
- Built on dev, not committed. tsc clean; 437 test files / 4,147 tests pass (new: send-update route,
  section helpers, publish leaves unwritten sections out). Narration clip engagement-overview-5 remade.
- Checked on /tour in the browser: mail icon → Email this update (everyone filled in, an address
  added as "email only", a bad address refused, Send → "Update sent"); Rewrite → the missing-sections
  warning, "Publish without them", Publish & send… → published without the empty sections, then the
  sheet; closing the pane mid-draft → working sparkle → reopens writing, Stop in the pane.
- Checked signed in (Claude in Chrome, DataSentry): the pencil opens Edit update in the pane, every
  section a box, the card keeps the published text, Cancel closes it; Email this update loads the
  engagement's people from the route, offers the PDF and warns Out of date. Nothing was sent.
- Not checked: a real send (email, Inbox, Reply-To, PDF attachment). Covered by the route's tests.
- Kept, unmounted, until sign-off: StatusUpdateAction, `sendStatusUpdate`, `/ai-status-update`.
