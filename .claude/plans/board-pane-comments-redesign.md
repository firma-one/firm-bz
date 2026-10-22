# Board pane and comments redesign

Asked 2026-10-17: "go ahead with all the recommendations" for the Engagement → Board right pane
and the comments sub-tab (and its @-mention popup). Comments live in
`components/projects/document-doc-comments-pane.tsx`, shared by the deliverable pane, the Files
comments pane and the document menu, so every place gets the changes.

## Mentions

- Typing `@` opens an inline menu just above the composer, at the caret (Linear, Notion, Slack).
  It narrows as you type (`@dee`); ↑/↓ move, Enter or Tab insert, Esc closes. Picking inserts
  `@Name ` where you were typing. No checkboxes, no Done, no close button.
- Rows show avatar, name and the person's role on the engagement (Lead, Member, Collaborator,
  Reviewer). Brio and you are left out. "No one matches" when nothing does.
- Mentions stay where they were typed (they used to be prepended). Only people still mentioned in
  the text when it is sent get notified. Rendering finds known names anywhere in a comment and
  keeps reading the old prepended form.

## Reminders

- Out of the mention picker. A clock button in the composer ("Remind…", enabled once someone is
  mentioned) picks a date. It shows as a chip — "Remind Deepak · Oct 20, 9:00 AM ×" — and applies
  to everyone mentioned in that comment. No date still notifies them right away.

## Composer

- A box that grows with the text (up to ~8 lines), placeholder "Leave a comment…", `@` and
  Remind buttons in its bottom row, "⌘↵ to send" beside the send button. Enter is a new line;
  ⌘/Ctrl+Enter sends. The hint line above the box goes.

## Comments list

- Filters and View become one compact toolbar row: a count, Filter pills (Status, People,
  Date: any / last 7 / last 30 days, Mentions me) and a sort menu (Oldest / Newest first, Only the
  latest). Shown only once a thread has more than 3 comments or a filter is on. The From/To date
  pickers become the Date presets.
- Each comment: avatar and name (email on hover), relative time with the exact time on hover, no
  "Latest" badge. React, copy link and delete show on hover at the top right; the reminder bell
  stays visible because it is state.

## Deliverable pane

- Header subtitle without the numbering prefix ("Market & Competitive Intelligence Report"); Board
  cards keep the number, muted, before the name.
- Status is one control (no separate chevron). Due reads "Oct 16 · 1 day overdue".
- New rows: Lead (the deliverable's owner — its `assigneeUserId`, set through the existing
  assignee route; the subtasks API returns it) and Progress ("0 of 4 documents approved").
- The Comments tab shows its count.

## Document tags with # (2026-10-22)

Deepak: "use # and tag 1 or more documents in this deliverable", alongside @-mentions.

- **Typing `#`** in a deliverable's comment composer (or the new # button beside @) opens a menu
  of the deliverable's documents. It matches by document ID or name, and picking inserts `#QSR-12 `.
  The ID, not the name: short, unique in the engagement, and it survives a rename.
- **Which documents:** the ones the Board's deliverable panel already loads for the viewer
  (`subtasks?persona=…`), passed in as `taggableDocuments`. An external collaborator is offered only
  what's shared with them. A document without an ID yet can't be tagged.
- **In the composer** a tag of a known document is marked like a mention chip, in gray. **In the
  thread** it's a chip with the document's icon and ID (Deepak: the ID, since hovering shows the
  details); hovering shows its name and folder, and clicking opens its preview. A tag of a document
  the viewer can't see, or that's gone, is a muted ID chip with no icon, link or details.
- Stored as plain text in the comment (like mentions), so no schema change; tags notify no one.
  Helpers: `findTagQuery`, `insertTag`, `splitDocTags`, `taggedDocIds` in `lib/comments/mentions.ts`.
- Where: the Board's deliverable panel. Other comment panes (a single document's, in Files) show a
  tag as its ID and don't offer `#` until they're given the deliverable's documents.
- **The tour:** the Board pane's Comments tab now works on screen (`demo-deliverable-comments.tsx`),
  with sample comments that mention a teammate and tag the deliverable's documents, and the same
  composer with @ and #. Posting changes only what's on screen.

## The engagement Comments page: peek at a thread (2026-10-22)

Deepak: keep one row per document with its latest comment, but be able to see the thread's latest
five on the page.

- **The row** shows what the thread is on (folder-plus for a deliverable, the file-type icon for a
  document) before its ID, the latest comment with @ and # chips, and who wrote it and when.
- **"Show N earlier"** (N up to 4) opens the row in place to the thread's last five comments, oldest
  first, the newest marked Latest, each with avatar, name, time and up to three lines. A longer thread
  says "N older comments · Open thread". Several rows can be open; Hide closes one. Reading an open
  row doesn't navigate; the row itself and its arrow open the whole thread in the deliverable, where
  replying stays.
- **Loaded when first opened** from the thread endpoint with `?limit=5`, not in the list response.
- **Access:** the list endpoint now follows the thread endpoint's rule: engagement members only, and
  external personas see only threads on documents shared with them (`visibleDocumentIdsFor`). Both
  return `taggedDocuments` (the tagged documents the viewer may open) so tags draw as chips.
- **One renderer** for comment text everywhere: `components/comments/comment-text.tsx` (the
  deliverable pane, this page and their tour copies).
- **The tour** draws the app's own `ThreadRow` over sample threads on two deliverables and a
  document in each.
- Open: searching by comment text can't match (content is encrypted at rest, and the search filters
  in the database); the Comments tab count still counts threads on documents an external can't see.
