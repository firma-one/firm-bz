# Comments / Chat Feature — World-Class Improvements

## Context

The in-app Comments panel (`DocumentDocCommentsPane`) was introduced specifically to support commenting on non-Google-Workspace files — PDFs, images, audio, video — where no native comment system exists. That original intent remains valid and is the primary motivation for improving this feature.

This plan improves the Comments feature across two phases: @mention tagging with notifications (Phase 1) and emoji panel polish (Phase 2). A GDrive native comments panel (Phase 3) is parked — GDocs already surfaces resolved comments natively via "Show all comments", and the data model mismatch (anchored multi-thread vs. flat feed) makes unification non-trivial. Instead, Phase 1 adds a lightweight "Open" link on the preview pane and on each comment, reusing the existing secure document open flow.

---

## Phase 1 — @Mentions via Reminders

### Key insight
The existing `SetupReminderModal` already supports multi-select recipients and is accessible from the comment pane. Rather than building a separate @mention system, typing `@` in the composer opens this existing modal — the selected recipients become the @mentions. **No new library, no new data model, no schema change for mentions.**

### How it works end-to-end

1. User types `@` anywhere in the comment composer textarea
2. `SetupReminderModal` opens (same modal as the CalendarClock reminder button), pre-populated with the comment draft as the note
3. User selects one or more recipients (multi-select already supported), optionally sets a due date
4. On confirm: selected recipients shown as `@Name` pills inline in the composer textarea
5. Clicking any `@Name` pill reopens the modal pre-filled — user can edit recipients or due date
6. On post: comment is submitted, reminders are created for each recipient via existing `upsertFollowUpReminder()` in `lib/actions/user-reminders.ts`

**No new data model needed** — recipients are already stored in `UserPersonalization.reminders` keyed by comment. The reminder's `recipientId` array IS the mention list.

### Schema changes

**No migration needed** — no new columns for mentions (reuse reminders) and hard delete requires no soft-delete fields.

### API changes

**POST doc-comments route** (`app/api/projects/[projectId]/documents/[documentId]/doc-comments/route.ts`):
- No change for mentions — reminder creation handled client-side via existing `upsertFollowUpReminder()` after comment POST succeeds

**DELETE doc-comments route** (new handler in same `route.ts`):
- Body: `{ messageId: string }`
- Validate: `authorUserId === currentUser`
- Server-side guard: check no `DocCommentMessage` exists with `createdAt > this.createdAt` on the same document — if any exist, reject with 403 (race condition safety net only; UI prevents reaching this in normal flow)
- Hard delete: `DELETE FROM DocCommentMessage WHERE id = ?`
- Cancel associated Inngest reminder jobs for this message

### Firm Settings — mention email toggle

The existing reminder email system (`sendImmediateReminderEmail()`) already handles notification emails when a reminder is created. Extend `Firm.settings` (already `Json`, no migration) with:

```json
{ "mentionEmailConfig": { "enabled": true } }
```

When enabled: `sendImmediateReminderEmail()` fires for each recipient tagged via `@` — no new email template needed, existing reminder email serves this purpose.

**UI**: In `components/projects/firm-settings-form.tsx`, add a toggle in the existing "App Settings" section alongside reminder config:
- Toggle: "Email notification on @mention" (default: on)
- Helper: "Send an email to users when they are @mentioned in a comment"

### UI changes (`components/projects/document-doc-comments-pane.tsx`)

**Composer**:
- Keep plain `<textarea>` — no library needed
- `@` keypress opens `SetupReminderModal` with comment draft pre-filled as note
- After modal confirm: render `@Name` pills below or inline in the composer (not inside the textarea — keeps input simple)
- Clicking a pill reopens modal pre-filled for editing
- On submit: POST comment, then call `upsertFollowUpReminder()` for each selected recipient

**Mention filter** (inside doc comments pane):
- Add a "Mentions" filter chip alongside Status and Commentor filters
- When active: show only comments where current user appears as a reminder recipient (query `UserPersonalization.reminders` by `entityKey = messageId`)
- Mentioned comments: left-border accent (`border-l-2 border-blue-400`) + subtle background tint

**Engagement-level Mentions rollup** (`components/projects/engagement-comments-tab.tsx`):
- New "Mentions" tab alongside existing document list
- Endpoint: `GET /api/projects/[projectId]/doc-comments?filter=mentions&userId=<me>`
- Extend rollup route (`app/api/projects/[projectId]/doc-comments/route.ts`) — join `UserPersonalization.reminders` to find comments where current user is a recipient
- Shows: document name, comment preview, timestamp — click opens `DocumentDocCommentsPane` scrolled to that comment

**Delete-own-comment UI**:
- UI check first (no server trip): trash icon only renders on messages where `authorUserId === currentUser` AND no subsequent message exists in the local `messages` array (i.e. no `msg.createdAt > this.createdAt` for the same document)
- Icon disappears automatically once someone else comments — no stale state
- Clicking shows a confirmation tooltip ("Delete this comment?") with Confirm / Cancel
- On confirm: hard DELETE request, optimistic removal from local state; server rejects silently if a race-condition reply snuck in

---

## Phase 2 — Emoji Panel Design Improvements

**No library change needed** — keep the 9 curated business reactions, improve the panel UI.

Changes in `components/projects/document-doc-comments-pane.tsx`:

- **Layout**: Change 3-col grid to a horizontal scrollable row of reaction pills (labels always visible, not just on hover)
- **Labels**: Show emoji + short label below each button (e.g. "⚠️ Urgent"), not just emoji
- **Sizes**: Increase hit targets from current small buttons to min 40×40px
- **Active state**: Filled background when current user has reacted (already partially done, make more distinct)
- **Reaction chips on messages**: Show count badge alongside emoji (e.g. "👍 3"), and on hover show a popover with the user list (names, not just emails)
- **Keyboard navigation**: Arrow keys cycle through reactions in the dropdown, Enter to select
- **Group separator**: Visual divider between "Status" reactions (Urgent, Looking, Done) and "Response" reactions (Yes, No, OK, +1, 👍, 🎉)

---

## Phase 3 — Open in Google Docs (Preview pane + per-comment link)

Zero new API surface — both reuse the existing `useSecureOpenDocument` hook (`lib/use-secure-open-document.ts`) which calls `POST .../sharing/regrant`.

**"Open" button on Preview pane**:
- The PDF Preview iframe has no path to the native document with comments
- Add an "Open" button to the Preview pane toolbar — calls `useSecureOpenDocument` with the current document's details
- Works for all file types (GDocs open natively; PDFs/images open via secure export flow)

**Open link per in-app comment**:
- Each comment row in `DocumentDocCommentsPane` shows a small `ExternalLink` icon (lucide-react) visible on hover
- Clicking triggers `useSecureOpenDocument` — opens the document so the user can see native GDocs inline comments in context
- Shown on all file types consistently

---

## Phase 4 — Google Drive Native Comments Panel (PARKED)

This is planned as a **separate, independent feature** — not merged with existing in-app comments. If it proves useful and stable, in-app comments will be retired in a future phase.

### OAuth scope

**No scope change, no re-auth needed.** All engagement documents enter Firma through flows (app-created files, Picker, import/copy) that already grant `drive.file`-level access. The GDrive Comments API (`GET /drive/v3/files/{fileId}/comments`) respects this same file-level token.

Caveat: edge cases (e.g. Shared Drive files the app's token doesn't fully own) may return 403 — handle gracefully with a "Google Docs comments unavailable for this file" notice. Do not fail the whole panel.

### Scope

- Only for Google Docs (`mimeType === 'application/vnd.google-apps.document'`) — Sheets/Slides comments are less relevant to document review workflows
- Only surfaced for whichever document is currently open in the panel
- Read-only — no write-back to Google Docs
- No DB persistence for now (GDrive stores all comments including resolved ones; fetch live. Add caching only if latency/reliability becomes a problem)

### New API route

`GET /api/projects/[projectId]/documents/[documentId]/gdrive-comments`

- Validate: document `mimeType` is `application/vnd.google-apps.document`
- Resolve `externalId` (GDrive file ID) from `EngagementDocument`
- Authenticate using the firm connector token — same pattern as `getFileMetadata()` in `lib/google-drive-connector.ts`
- Add `getFileComments(fileId, accessToken)` method to `lib/google-drive-connector.ts`:
  ```
  GET https://www.googleapis.com/drive/v3/files/{fileId}/comments
    ?fields=comments(id,content,author,createdTime,resolved,deleted,quotedFileContent,replies(id,content,author,createdTime))
    &includeDeleted=false
  ```
  `includeDeleted=false` excludes permanently deleted comments (their content is wiped by GDrive anyway — just a tombstone). Resolved comments (`"resolved": true`) are always returned by default with full content — no separate parameter needed.
- Transform to: `{ id, content, authorName, authorEmail, createdAt, resolved, quotedText, source: 'gdrive', replies: [...] }`
- Filter out any `deleted: true` entries defensively on our side too
- Short edge cache: `next: { revalidate: 30 }`

### New UI — GDrive Comments Panel

This is a **new separate panel/tab**, not inserted into the existing `DocumentDocCommentsPane`. Options:
- A "Google Docs Comments" tab alongside the existing "Comments" tab in the document sidebar, OR
- A collapsible section below the existing comments

**Layout: Stacked thread cards** — each GDrive comment thread is an independent card (not a single flat feed), matching the GitHub PR review / Figma comments mental model.

Each card:
```
┌─────────────────────────────────────────┐
│ 📄 "Total revenue: $4.2M"              │  ← quotedFileContent.value (blockquote)
│                                         │
│ 👤 Jane  14:22                          │  ← author + timestamp
│ This number looks wrong                 │  ← comment content
│                                         │
│   ↳ 👤 Deepak  14:45                   │  ← replies, indented
│     Agreed, rechecking                  │
│                                  ✅ Resolved │
└─────────────────────────────────────────┘
```

Key behaviours:
- `quotedFileContent.value` is a **snapshot captured at comment creation time** — survives even if the author later deletes that passage from the document. GDrive stores it independently from the document content.
- **Open threads** shown by default, sorted by `createdTime`
- **Resolved threads** (`resolved: true`) collapsed under a "Show resolved (N)" toggle at the bottom — full content always available via API
- **Deleted comments** never shown — `includeDeleted=false` on the API call, plus client-side filter on `deleted: true` as a safeguard
- Visual distinction: Google Docs blue-green left border or "G" badge on each card
- No reaction, reminder, or delete buttons — strictly read-only
- Loading skeleton while fetching; graceful 403 handling ("Google Docs comments unavailable for this file") for Shared Drive edge cases
- "Refresh" button to re-fetch on demand (live fetch, no polling)
- Future consideration: "Suggested Edits" (tracked changes) require the Google Docs API — different concept, out of scope for this phase

---

## Critical files to modify

### Phase 1

| File | Changes |
|---|---|
| `app/api/projects/[projectId]/documents/[documentId]/doc-comments/route.ts` | Add DELETE handler (hard delete with no-reply guard) |
| `app/api/projects/[projectId]/doc-comments/route.ts` | Add `?filter=mentions` (join `UserPersonalization.reminders`) |
| `lib/actions/firms.ts` | Extend `updateFirm()` to persist `mentionEmailConfig` |
| `components/projects/firm-settings-form.tsx` | Add "Email notification on @mention" toggle in App Settings |
| `components/projects/document-doc-comments-pane.tsx` | `@` triggers `SetupReminderModal`; `@Name` pills in composer; Mentions filter chip; delete-own-comment trash icon |
| `components/projects/engagement-comments-tab.tsx` | Add Mentions rollup tab |

### Phase 2

| File | Changes |
|---|---|
| `components/projects/document-doc-comments-pane.tsx` | Emoji panel redesign — layout, labels, hit targets, count badge, keyboard nav, group separator |

### Phase 3

| File | Changes |
|---|---|
| Preview pane component | Add "Open" button using `useSecureOpenDocument` hook |
| `components/projects/document-doc-comments-pane.tsx` | Add `ExternalLink` icon per comment row on hover |

---

## Sequencing recommendation

1. **Phase 2** (emoji panel) — pure UI, no schema change, lowest risk, ships fast
2. **Phase 1** (@mentions via reminders) — soft-delete migration + composer UX + filter + rollup tab + firm settings toggle
3. **Phase 3** (Open in GDocs) — zero API, pure UI additions to preview pane and comment rows
4. **Phase 4** (GDrive Native Comments) — PARKED. Revisit only if customers explicitly request GDrive comments surfaced within Firma.

---

## Verification

### Phase 1 — @mentions via reminders

- Type `@` in the composer, confirm `SetupReminderModal` opens with comment draft pre-filled
- Select multiple recipients, set optional due date, confirm `@Name` pills appear in composer
- Post comment, confirm reminders created in `UserPersonalization.reminders` for each recipient
- With `mentionEmailConfig.enabled = true`, confirm reminder email arrives; toggle off, confirm no email
- Activate "Mentions" filter, confirm only comments where current user is a reminder recipient are shown, with left-border accent
- Check Engagement Mentions tab, confirm rollup shows correct documents + comment previews
- Post a comment with no replies: trash icon visible on hover; delete it, confirm absent from GET
- Post a comment, then post a second comment: trash icon on first comment disappears (has a follow-up)
- Race condition: verify server rejects DELETE if a reply was posted between UI render and request

### Phase 2 — Emoji panel

- Open reactions dropdown, verify emoji + label visible on each button, hit targets ≥ 40px
- Keyboard nav: arrow keys cycle reactions, Enter selects
- Group separator visible between Status (Urgent/Looking/Done) and Response reactions
- React to a comment, confirm count badge (e.g. "👍 3") shows on chip; hover shows user names not just emails

### Phase 3 — Open in GDocs

- Open document preview, click "Open" button in toolbar, confirm `useSecureOpenDocument` flow triggers
- Hover a comment row, click `ExternalLink` icon, confirm same secure open flow for both GDocs and non-GDocs file types
