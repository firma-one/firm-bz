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
- **Search** looks a thread up by **ID or member name** (Deepak, 2026-10-23; the box's hint says
  so, "ID" as the Files and Support columns name it; a leading "#", as a tag is written, is ignored): the thread's document's ID or its deliverable's, so `QSR-9` brings up the deliverable's
  thread and its documents'; or a member who wrote in the thread or was @mentioned in it. It no
  longer looks in what was said or in file names, and there's no "Match" preview: rows always show
  the latest comment. Comment text is encrypted at rest, so mentions are read after loading. Rows
  for documents inside a deliverable say "in" with its mark, ID and name.
- **Awaiting reply** sits beside All and Mentions: threads where a client or external collaborator
  spoke last. Search is on the same row (`CommentsToolbar`, shared with the tour), and narrows
  Mentions too.
- Open: the Comments tab count still counts threads on documents an external can't see.

## Next: the Comments page becomes Discussions (planned and built 2026-10-23)

Deepak agreed to all the recommendations for the engagement Comments page and asked for them the same
day; all five steps below are built. Decisions taken: "Show N earlier" stays for now (skim without
opening); at launch existing discussions start as read (the migration gives every current member a
read marker; members who join later see them unread). A reload after posting or resolving keeps the
rows' order (`keepOrder`), so the open row doesn't jump. Migration:
`prisma/migrations/20261023120000_discussions_resolve_and_unread` (two tables, plus the backfill).
Follow-up spotted: the subtasks endpoint trusts the `persona` the client sends.

### 1. Rename the page to "Discussions"

- Why: the tab counts threads, so "Comments 1" read as one comment when there were three. "Discussions
  1" reads right (one discussion, three comments), covers team-internal and client threads, and fits
  what the page does (awaiting reply, read, resolved). Not "Messages" or "Chat" (sound like DMs), not
  "Threads" (jargon for clients), not "Conversations" (long for the tab bar).
- Change the label where the page is named: the engagement tab (`components/projects/engagement-tabs.tsx`),
  the breadcrumb (`components/shell/header-bar.tsx`, `comments:` entry), the tour's crumb
  (`components/demo/demo-header-bar.tsx`) and its tour step (`components/demo/demo-tour.tsx`, title and
  copy), and the page's empty-state copy. The marketing mock tab rows (`components/marketing/v2/home/
  hero-overview.tsx`, `product-story.tsx`) show the tab bar too; update them to match.
- Keep: the `comments` URL slug and `?tab=comments` (links and notifications keep working), the
  `data-demo-tour="engagement-comments-tab"` hook, and component and file names. Individual comments stay
  "Comments": the deliverable pane's tab, the Files comments pane title, "Leave a comment".
- Also fix the open item from before: the tab count counts threads on documents an external can't
  see. Count only what the viewer may open, as the list does (`visibleDocumentIdsFor`).

### 2. Rows: the latest author's avatar, and a muted count

- Replace the left tile (the same chat icon on every row) with the latest author's avatar
  (`PersonAvatar`, as the Inbox rows show who). It carries the unread dot from step 4.
- The count becomes a muted number (`text-fg-subtle tabular-nums`), not the green pill; the all-caps
  "LATEST" label gets quieter or goes.
- `ThreadRow` is shared with the tour, so the tour follows.

### 3. Reply in the right pane

- Clicking a row opens the whole thread with its composer in the right pane, as the Support page opens
  a request, instead of navigating to the Board. Reuse `DocumentDocCommentsPane`
  (`components/projects/document-doc-comments-pane.tsx`); pane title is the row's ID and name, with its
  folder-plus or file icon, and a header action "Open in deliverable" (today's `goToDeliverable`).
- `#` tags in the pane need the deliverable's documents (`taggableDocuments`): for a deliverable row,
  its documents, loaded as the Board's deliverable panel loads them (`subtasks?persona=…`); for a
  document row, the documents of the deliverable it's in.
- Posting in the pane refreshes the row (count, latest, Awaiting reply).
- Decide after seeing it: whether "Show N earlier" stays for skimming without opening, or the pane
  replaces it.
- The tour: the row opens the tour's composer (`components/demo/demo-deliverable-comments.tsx`) in the
  tour's right pane.

### 4. Resolve (schema change)

- "Mark resolved" on a discussion (in the pane header and the row's hover actions); a new comment
  reopens it. Resolved discussions leave All and Awaiting reply, under a "Resolved" view or filter.
- Store it per discussion, not in `EngagementDocument.settings` (that holds sharing settings): a small
  table keyed by `projectDocumentId` with `resolvedAt` and `resolvedBy`. Migration with
  `prisma migrate dev --create-only`.
- The Overview's "Unanswered comments" (the insights route's `unansweredThreads`, the same rule as
  Awaiting reply) must skip resolved ones too, so the two counts keep agreeing.

### 5. Unread (schema change)

- A dot on discussions with comments since you last opened them, and unread ones first.
- Store per person and discussion: `userId`, `projectDocumentId`, `lastReadAt` (unique on the pair).
  Opening a discussion (the pane, or the deliverable's Comments tab) marks it read. Unread = a
  comment by someone else after `lastReadAt`. Migration with `--create-only`.
- Decide: on launch, treat existing discussions as read (no flood of dots) or unread.

### Not doing

- No flat feed of individual comments (it loses which discussion each belongs to).
- The Mentions view stays (Deepak, 2026-10-23), although mentions also reach the Inbox's Needs you.
