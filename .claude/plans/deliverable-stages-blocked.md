# Not started, derived deliverable stages, and Blocked

Agreed with Deepak 2026-10-29. Builds on `2026-08-deliverable-status-derivation-and-assignee-history.md`
(derivation rules, non-draggable deliverable cards). That plan was never built.

## 1. Not started

- New stage `not_started` before `to_do`, labeled **Not started**. "Draft" was rejected because it
  names a document's content state ("draft v0.3"), which In progress and In review already are.
- **Documents** default to Not started: a document with no stored stage reads Not started (`documentStage()`).
  **Deliverables** still start at To do on promotion, because promoting a folder is the commitment.
- Only To do and beyond are on the Board. The deliverable's pane lists, counts (progress) and
  approval-checks only its To do+ documents. Its Not started documents sit under a muted
  "n not on the Board" line, each with **Add to Board** (moves it to To do).
- Visibility: firm only, like To do. Transitions: Not started ↔ To do by firm roles (one step, as now).
- Look: the same not-started colors as To do, but outlined and muted, so it reads "not on the
  Board yet" rather than a second To do.
- `buildSettingsForDb` no longer writes a default stage when a write isn't about the stage. That
  default was why share, intake and download updates stored To do on documents nobody put on the Board.
- Existing data: a document with no stored stage becomes Not started; stored stages stay.

## 2. Deliverable stage follows its documents

The rules, over the deliverable's To do+ documents (Not started ones are left out):
1. none → To do
2. any In progress → In progress
3. all Approved → Approved (finalizes, as today)
4. all In review → In review
5. all To do → To do
6. any other mix → In progress

- Write-time: after a document's stage changes, its deliverable is recomputed. If the stage changes,
  it gets the same side effects as a manual move used to: client access widens on forward moves,
  and Approved finalizes. The audit event is marked `derived`.
- Nobody sets a deliverable's stage directly. The stage route refuses it, the order route only
  reorders within a lane, deliverable cards aren't draggable, and the pane shows the stage read-only.
- **Confirmations:** a document move that would carry its deliverable forward into In progress
  (external collaborators see its documents), In review (viewers see its documents) or Approved
  (locks it) asks first. A client sees the deliverable's card on the Board from promotion on; what
  these moves open to them is its documents, and its folder in Files.
  The route answers 409 with what would change, and the client resends with `confirm: true`.
- One-time recompute (data migration): each unfinalized deliverable takes its derived stage where
  that is the same or earlier than its stored one, which needs no side effects. A deliverable
  behind its documents catches up at its next document change.

## 3. Blocked (documents only)

- `settings.blocked = { reason: 'client' | 'team' | 'on_hold', note?, at, by }` on a document
  (not a folder). Reasons read *Waiting on client*, *Waiting on our team*, *On hold*.
- Firm only: set and cleared by firm roles, and left out of everything sent to a client.
- It doesn't change the stage. A red **Blocked** tag shows in the Files row, the Details pane (where
  it's set) and the deliverable's documents. The Board card shows an "n blocked" chip listing them
  on hover, and the Board header has a Blocked filter with a count.
- Audit events `DOCUMENT_BLOCKED` / `DOCUMENT_UNBLOCKED`.

## Also

- /tour mirrors the Files row, the Board and the deliverable pane.

## Built (2026-10-29)

- **Model:** `lib/sharing-settings.ts` (`not_started`, `BOARD_STAGES`, `isOnBoard`, `documentStage`;
  `buildSettingsForDb` writes no default stage), `lib/deliverable-derivation.ts` (rules 1–6),
  `lib/deliverable-stage-roles.ts` (`STAGE_ORDER` 0–4, Not started firm-only).
- **Moves:** `lib/files/apply-stage-change.ts` holds a move's side effects (lifted from the stage
  route); `lib/files/deliverable-stage.ts` works out the deliverable's move. The stage route moves a
  document, then its deliverable (`derived: true` in the audit meta), answering 409
  `needsConfirmation` first when the deliverable would be shown to external contributors or
  reviewers for the first time, or approved. `components/files/use-stage-move.tsx` asks and resends.
- **Clients' actions:** a deliverable's *Submit for review* (external contributor) and *Request
  changes* (reviewer) stay, and move its documents: the stage route, given a deliverable by a client
  role, moves each of its On-board documents that role may move. The firm gets 400 `derived_stage`.
- **Board:** cards drag only to reorder their own lane, and only for those who may manage
  (`shares/order` is reorder-only and skips a card listed in another lane). Progress counts On-board
  documents. "n blocked" chip (names on hover) and a Blocked filter with its count, shown while any.
- **Deliverable pane:** stage read-only ("Follows its documents"); documents on the Board, then
  "n not on the Board" folded, each with **Add to Board**; each document's Status menu offers only
  its role's moves.
- **Blocked:** `settings.blocked`, `PATCH …/documents/[id]/blocked` (firm roles, documents only, one
  `jsonb_set`), kept across untag (`assetSettingsOf`). Audit `DOCUMENT_BLOCKED` / `DOCUMENT_UNBLOCKED`,
  which the engagement audit route hides from client roles (`FIRM_ONLY_AUDIT_EVENTS`). Stripped from
  the sharing GET, the stage route's response and the subtasks route for clients; the Files listing
  and the Board's shares route send it to the firm only. The tag sits in the Files row's Name cell
  (the Status column has no room beside a pill); the Details pane has a Blocked row to set it, with a note.
- **Subtasks route:** a client role gets no Not started documents and no Blocked flags, decided by
  its real role rather than the `persona` it asks for.
- **Migration** `20261029140000_derive_deliverable_stages` (data only): moves open deliverables back
  to their derived stage where that is earlier. Previewed read-only on local data: no change.
- **/tour:** `lib/demo/demo-deliverables.ts` lays out document stages its deliverables derive from
  (tested), with one Not started and one blocked document; Files, Board and pane read them. The
  tour's Details pane sets Blocked (with its note), the Board has the Overdue and Blocked toggles, a
  folder inside a deliverable can't be promoted, and a move that shares or approves asks first
  (`StageConfirmDialog`, shared with the app, counting the tour's one reviewer).

Not done: a client still sees a deliverable's To do documents through its INHERITED sharing rows
once the deliverable is shared, as before this change.
