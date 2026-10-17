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
