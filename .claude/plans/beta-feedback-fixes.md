# Beta Feedback Fixes

Source: @docs/mvp/todo-beta-feedback.md

---

## 1. Add Firm

- [ ] **Simplify Add Firm form** — TMI at creation time. Move non-essential fields (e.g. tax number, extended address) to Firm Settings. Keep creation minimal.
- [x] **Website URL validation** — `www.datasentry.in` was rejected. Relax validation to accept `www.` prefixed URLs without protocol, and show a clear format hint in the error message (e.g. `https://example.com` or `www.example.com`).
- [ ] **Rename "Billing address" → "Registered address"** across the Add Firm form and settings.

---

## 2. Add Client

- [ ] **Follow Up date + Internal memo UX** — No indicator that these fields create a reminder. Add inline hint copy, e.g. "A follow-up reminder will be created for you."
- [ ] **Billing address + Tax Account number** — Add a note that critical client information is encrypted at rest.

---

## 3. Add Client Contact

- [x] **Multiple flickering on SAVE** — Investigate double-submit or optimistic UI race causing multiple re-renders on save.

---

## 4. Client Partner — Add Engagement (Unauthorized)

- [ ] **`client_admin` persona cannot create engagements** — Server throws `Unauthorized` at `canEdit` check. Decide: should Client Partners be allowed to initiate engagements? If yes, update permission helper. If no, hide the Add Engagement CTA from `client_admin` users.

  Error location: `app/(app)/d/f/[slug]/c/[clientSlug]/page.js`

---

## 5. Invitation Emails

- [x] **Client Partner invite email is not HTML formatted** — Apply `renderInviteEmail` (same as firm/engagement invite). Covered in recent session but verify end-to-end for client_admin persona specifically.
- [x] **Add "About Firma" section to invite emails** — Brief product blurb for first-time recipients who don't know what Firma is.

---

## 6. Engagement Files

- [ ] **Quick Link > Comments did not open** — ActionMenu > Comments works. Investigate the quick-link Comments button click handler vs the action menu path.
- [ ] **Copy link intermittently blocked** — Clipboard API permission or async race; investigate and add fallback.

---

## 7. AppBar — Bookmarks & Quick Links

- [ ] **Document bookmark deeplinks are incorrect** — Bookmark URLs stored/displayed in the AppBar are not full deeplink URLs. Audit how bookmark URLs are constructed and ensure they resolve to the correct absolute path (including firm/client/engagement slug segments).
- [ ] **Bookmark count badge color** — The count badge on the AppBar bookmarks icon is green; it should be blue (match the app's primary color).
- [ ] **GDrive Recycle Bin quick link (Firm Admin only)** — Add a quick link icon in the Topbar (visible to Firm Admins only) that opens the Google Drive Recycle Bin (`https://drive.google.com/drive/trash`) in a new tab.

---

## 8. Calendar — Right Panel (Dockable)

- [ ] **Lean calendar view in right panel** — Add a dockable calendar panel on the right side of the workspace that surfaces all time-sensitive items in one place:
  - Reminders (all assignees visible to the current user)
  - Document due dates
  - Client follow-up dates
  - Should be collapsible/dockable so it doesn't crowd the main content area
  - Lean/compact design — not a full calendar app; a scrollable date-grouped list with a mini month picker is sufficient

---

## 9. Google Drive / Sharing

- [ ] **EV (Eng Viewer) sees native Google Docs SHARE button** — Sharing via native UI is blocked by Google and triggers an approval email, but it's an open loop. Options:
  - Add a caveat banner inside the engagement file view for EV/EC users warning that native sharing is controlled by Firma.
  - Investigate if Google Drive API can restrict the Share UI visibility (unlikely).
- [ ] **Shared document revocation email** — When a document is deleted or unshared, send a notification email to the recipient that access has been revoked.

---

## 9. Watermark

- [ ] **Add "[FirmName] Confidential" watermark** to viewed/downloaded documents. Scope TBD (PDF export only? Google Docs viewer overlay?).

---

## 10. Account / Data

- [ ] **Close Account — Download my data / Information export** — Users want a data export before closing account. Design and implement a data export flow (engagement files list, client list, etc.) gated behind account deletion.

---

## Priority Order (suggested)

1. Client Partner Add Engagement unauthorized (blocker for CP users)
2. Add Firm simplification + URL validation (friction at onboarding)
3. Quick Link > Comments broken (core feature)
4. Invite email "About Firma" copy (first impressions)
5. EV native Share caveat (security / trust)
6. Share revocation email (completeness)
7. Flickering on Add Client Contact save (polish)
8. Watermark (nice-to-have)
9. Data export / Close account (compliance, lower urgency)
