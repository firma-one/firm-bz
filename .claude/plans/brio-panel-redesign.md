# Brio panel redesign (Engagement Overview, Files and /tour)

Status: built, 2026-10-17 (Deepak: "Address all 10 recommendations"). Not committed yet.

The panel's behavior is solid: it docks to either corner, resizes, keeps its thread while
collapsed, can be stopped mid-answer and takes ratings. The work is in its framing, which surrounds
the conversation with three header layers, an icon rail, a chip strip and a scope control under the
composer. Files: `components/projects/floating-ai-chat.tsx` (frame),
`components/projects/engagement-ai-chat.tsx` (conversation), `components/demo/demo-brio-chat.tsx`
(the /tour copy).

## The ten changes

1. **Gutter.** A right-docked panel lines up with the page's content edge. The edge is measured
   from the app's scroll container (`data-app-scroll` on AppShellV2) rather than assumed to be 24px,
   so it follows the shell's `md:px-8` and moves when the shell's right pane opens.
2. **Scrollbar inset.** `rightContentInset()` looked up `.d-app .overflow-y-auto`, which now finds
   the sidebar's scroller first. It reads `[data-app-scroll]` instead.
3. **One header row.** "Ask Brio", an info icon whose hint carries the capability note, then New
   conversation, Conversations, a ⋯ menu (copy conversation, dock or float) and collapse. The icon
   rail and the separate Pinned pane go: pinned conversations already sort first in Conversations,
   with a pin icon. The capability note shows in the empty state, where it is read.
4. **Scope chip in the composer.** The composer gets a toolbar row: a scope chip on the left ("This
   engagement ▾" on Overview, a static "Files" on Files), Send or Stop on the right. It replaces
   the "Answering about" control and slider under the composer.
5. **Suggestions where they belong.** An empty thread lists its starters as plain rows (icon and
   text). After an answer, its follow-ups show as an "Ask next" list under that answer. The page's
   action (Files: "Review folder organization" or "Set up folders") sits with them. The chip strip
   above the composer goes.
6. **An opening that says something (Overview).** The empty state leads with up to three live facts
   from the insights payload, e.g. "2 deliverables overdue". Each asks Brio about it. Built by
   `buildOpeningFacts` in `lib/ai/chat-suggestions.ts`, from the same signals as the suggestions.
7. **Answers that link to what they mention.** After the model's stream ends, the chat route appends
   one server-written line, `<<SOURCES>>{json}`. It lists the documents behind the doc IDs the
   answer cited (documentId, name, folder or file) and the deliverable and file counts the answer
   drew on.
   - The client strips the line (`parseChatReply`), turns each cited doc ID into a chip, and adds
     "Based on N deliverables · M files" under the answer.
   - A chip opens the item through the existing `#doc-file:<documentId>` deep link, which the
     workspace already routes to Files.
   - Links are built from IDs on the client, never from model text.
   - Earlier answers sent back as history have the line stripped, on both client and server.
8. **Dock to side.** A ⋯ menu option docks the panel as a full-height pane on the right, below the
   header bar. AppShellV2 makes room by reading `--ai-chat-dock-width`. The inner edge stays
   resizable. Float puts it back. The preference is remembered, like the dock corner.
9. **⌘J.** Opens the panel and focuses the composer, or collapses it if it is open and focused. Shown
   in the launcher's tooltip and listed in the shortcuts dialog.
10. **Loading.** "Brio is thinking" becomes the shimmer lines the firm brief uses, with the elapsed
    time kept beside them.

Also fixed on the way: `openConversation` and `startNewConversation` are hooks declared after an
early return, which breaks the hook order when Brio reports unavailable. The markdown renderer's
leftover gray classes move to tokens.

## /tour

`DemoBrioChat` gets the same header, empty state, Ask next list, composer toolbar and shimmer, so
the public tour matches. It has no conversations or sources, which it never had.

## Verification

- Typecheck and tests, with new tests for the sources line, `buildOpeningFacts` and the chip
  linkifier.
- `/tour` checked in the browser.
- Overview and Files are behind sign-in, so Deepak checks those.

## As built

- **Frame (`floating-ai-chat.tsx`).**
  - `contentRightEdge()` and `contentTop()` read `[data-app-scroll]`, re-measured on resize and
    by a ResizeObserver on the scroll container.
  - Layout `float | dock` (`fm_ai_chat_layout`) and dock width (`fm_ai_chat_dock_width`, 360–640px)
    are remembered.
  - ⌘J opens or focuses; opening from the launcher focuses the composer too.
  - The panel is 23rem now that the rail is gone.
- **Shell.** `app-shell-v2.tsx` tags the scroll container (`data-app-scroll`) and gives the content
  row `margin-right: var(--ai-chat-dock-width)`. The upload and download panels move left of a
  docked pane.
- **Conversation (`engagement-ai-chat.tsx`).**
  - One header row, with Conversations as a header button (pinned conversations listed first).
  - The ⋯ menu holds Copy conversation as Markdown, which now confirms with a toast, and Dock or
    Float.
  - Empty state, "Ask next", the composer toolbar with its scope chip (a dropdown), and the shimmer.
  - `SuggestionRow` is shared by the facts, starters and "Ask next".
- **Sources.**
  - `SOURCES_MARKER`, `formatSourcesLine`, `stripSources` and `parseChatReply().sources` are in
    `lib/ai/engagement-chat.ts`.
  - The route resolves cited IDs with one `engagementDocument` query per answer, limited to this
    engagement, at most 24.
  - `linkDocIds` and the chip live in `chat-markdown.tsx`; its gray classes are tokens now.
- **/tour.** `DemoBrioChat` has the same layout and ⌘J. `overviewFacts()` in
  `lib/demo/demo-brio.ts` only asks questions the demo can answer.
- **Shortcuts dialog** lists ⌘J.
- **Tests:**
  - `engagement-chat.test.ts`: the sources line.
  - `chat-suggestions.test.ts`: `buildOpeningFacts`.
  - `chat-markdown.test.tsx`: the linkifier and chips.

### After Deepak's first check (2026-10-17)

- **⋯ menu items did nothing.** The menu renders in a portal, but React still bubbled a press inside
  it up to the header, which started a drag and captured the pointer, swallowing the click.
  `startDrag` now ignores presses whose target is not inside the header's DOM, and anything but
  the primary button.
- **Docking is remembered across pages.** A docked pane also remembers whether it was open
  (`fm_ai_chat_dock_open`), so docking it on Overview means it is already docked and open on Files
  and after a reload. A floating panel still always starts collapsed, and a restored pane does not
  take focus.

### Not verified in a browser

Overview and Files sit behind sign-in, so these are covered only by typecheck and tests, and need
Deepak's check:
- dock to side;
- doc-ID chips on a real answer, and the sources line;
- the alignment on Windows, where scrollbars take up space.

## Questions and tasks (2026-10-17)

Deepak asked whether the panel tells apart prompts that are questions from ones that start a task.
He considered labeling rows "(E) Enquiry" and "(T) Task", and agreed instead to mark only the
exception, in words.

- **Questions stay as they are**, under "Right now", "Try asking" and "Ask next". They are strings
  sent to the read-only chat route.
- **Tasks get their own "Task" heading**, a green label chip, and one muted line on what will
  happen:
  - Review folder organization: "Checks names, duplicates and misplaced files, asks you about each
    fix, then applies the ones you approve. Nothing is deleted."
  - Set up folder organization: "Asks a few questions about the engagement, shows you the folders,
    then creates the ones you approve."
- **In the thread, a running task carries a header**: "Task · Review folder organization · 2 of 5
  answered", then "Applying…", "Done" or "Needs attention". The setup interview has the same
  header.
- **Code.**
  - `ChatAction`, `ChatTaskList` and `ChatTaskHeader` live in `chat-action-row.tsx`. The chat panel
    takes `actions: ChatAction[]`, which replaces the old `suggestionActions` ReactNode, so it
    draws every task the same way.
  - The review's run state moved out of a second "trigger" copy of `FilesAgentPanel` into
    `useFilesReview` on the Files page. The results panel is keyed on `reviewSeq`, so each review
    starts with no answers carried over.
  - `FilesScaffoldTrigger` is gone.
  - Tests: `chat-action-row.test.tsx`.
