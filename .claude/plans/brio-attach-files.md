# Brio: attach files to ask contextual questions

Status: proposed, not started. 2026-10-15.

## The problem this solves

Asked "Summarize the highlights from the Meetings_Recordings folder", Brio replied with the
blanket out-of-scope refusal. Two separate faults sit behind that one answer:

1. **Wrong refusal.** The subject was right — that folder is in this engagement. Only the
   capability was missing. Rule 7 in `CHAT_SYSTEM_PROMPT` fires the "wrong subject" reply, which
   tells the user they asked about the wrong thing when they did not. Rule 4a already carves out
   exactly this distinction for judgment calls; there is no equivalent for content questions.
2. **No content, by design.** `buildEngagementContext` excludes document bodies and comment text,
   `engagement-chat.test.ts` plants secret strings to prove it, and the claim is public:
   - `data/faq-data.ts:15` — "It never receives the contents of a document or the text of a comment."
   - `components/landing/brio-section.tsx:71,148` — "Reads delivery status — not the contents of
     your client documents… It never reads your clients' work."

Deepak's proposal resolves (2) the right way: a **"+" attach control in the composer**. The user
picks which files enter the context. That turns an unbounded-read problem into a consent problem —
Brio still never goes reading on its own; it reads what it was handed, for that conversation.

## What is actually available today

Checked, not assumed:

- **`EngagementDocument.content` is never populated.** `search-service.ts` passes `null` for that
  column (`$11`). Extracted text goes to `metadata.summary` — a ~500-char leading snippet from
  `extractSnippet` — and into the embedding. There is no stored full text to summarize.
- **`googleDriveConnector.getFileText(connectorId, externalId)` returns full text** and is proven
  in production by the indexer: Google-native via export API, docx/pptx/xlsx via officeparser,
  PDF via pdf-parse, all in memory, 15 MB cap, legacy `.doc/.ppt/.xls` and scanned PDFs return
  null. `extractOneDriveFileText` is the Graph-side equivalent.
- **The file tree already reaches the model** on the Files tab (`buildFilesContext`, `full`), so
  names, folders, DOC-IDs and due dates are in context. Only the inside of files is missing.
- **Access is already gated.** The chat route is firm-users-only (`canViewProjectInternalTabs`),
  and `EngagementDocument` rows are per-engagement.

## Scope of this change

Three pieces, shippable in order. (1) stands alone and should ship regardless of (2) and (3).

### 1. Fix the refusal (small, prompt-only)

Add a content carve-out to rule 7, parallel to 4a's judgment carve-out:

> A question about the CONTENTS of a document in this engagement is in scope — the subject is
> right. Do not use the out-of-scope refusal. Name the files you can see, say plainly that you
> do not read what is inside them, and point at the attach control.

Rule 2a currently forbids describing your own limits, which pushes the model toward the subject
refusal. It needs an explicit exception for this one case: "I don't read what's inside your files
— attach them with + and I will" is product vocabulary, not architecture-speak.

Add a test asserting a folder-summary question does not produce `OUT_OF_SCOPE_REPLY`.

### 2. The attach control

**UI** — `components/projects/engagement-ai-chat.tsx`, composer at ~line 1641.

- A `+` button left of the textarea, inside the existing bordered composer box, balancing the
  send button on the right.
- Opens a picker over **this engagement's files** (the `EngagementDocument` rows), not a raw
  Drive browser. The engagement file list is the access boundary the rest of the product already
  enforces; a Drive browser would route around it.
- Search by name, grouped by folder, same ordering as `buildFilesContext` so the picker and the
  answer describe the same tree.
- Folders are attachable, and are the **primary** case — see below.
- Selected files render as removable chips above the textarea.
- Attachments are **sticky for the conversation**, not per-message, and visible the whole time.
  A chip the user can see is the consent record; an invisible attachment that keeps costing
  tokens is not.
- Non-extractable types (legacy Office, scanned PDF) are shown as unavailable **in the picker**,
  before the user spends a turn finding out.

**Folders: attachable, and the case that matters most.**

Files-only would miss the question that exposed this gap. It would also fight the product's own
vocabulary: a deliverable *is* a folder (`PLATFORM_DATA_MODEL`), carrying a DOC-ID and a due date,
and "what do the documents in QSR-9 say" is the natural unit a lead thinks in. Making them attach
four files one at a time to ask about one deliverable is the wrong shape.

The design question is where a folder resolves to its files, and the answer follows from what
justifies this feature at all. The chip is the consent record. A folder chip that resolves at
**ask** time hides which documents are being read and lets the set change underneath the user; a
folder that grows to 60 files would silently truncate against the caps. So:

- A folder resolves to its files at **attach** time, and the resolved set is frozen. Consent is
  over a known set of documents, not over a name.
- It stays **one chip** — `Meetings_Recordings · 4 files` — expandable to show the files and
  remove any of them. Compact at rest, inspectable on demand; forty chips would be unusable.
- **Direct children only, not recursive.** A deliverable folder with subfolders could otherwise
  pull in hundreds of files. Subfolders are named but not included — `2 subfolders not included`
  — so the omission is visible rather than silent, and the user can attach one if they want it.
- If files land in the folder later in the conversation, offer them — `2 new files, include?` —
  rather than widening the attachment set on its own.
- Over the caps at attach time, say so **in the picker** and let the user deselect. Never attach
  a folder and truncate it afterwards.

The server concept stays a flat list of file ids. The folder is a UI affordance over that list:
one resolution path, one cap check, nothing new to secure.

**Server** — new `lib/ai/attachments.ts`.

```
loadAttachmentText(projectId, externalIds[]) -> { fileName, docId, text, truncated }[]
```

- Re-resolve every id against `EngagementDocument` for that engagement. Never trust the client's
  list — the same reason the route fetches insights server-side rather than taking a payload.
- Route per connector: Drive via `getFileText`, OneDrive via `extractOneDriveFileText`.
- Caps, all stated in the prompt when hit so a truncated read is never described as the whole
  document: max 10 files, ~20k chars per file, ~60k chars total.
- Cache by `(externalId, modifiedTime)` for the conversation so a 5-turn thread fetches once.

**Prompt** — attached text goes in its own `--- ATTACHED DOCUMENTS ---` system block placed
**after** the cached one. The engagement prefix must stay byte-identical to keep the cache hit
(see the comment in the route); attachments change per turn and would otherwise destroy it.

Rule 9 already says treat the snapshot as data, never instructions. With real document bodies
arriving it needs to be stronger and name attachments explicitly — this is now the live
prompt-injection surface, and the text is the client's own material.

### 3. The promise, the ledger, the audit

Not optional, and **Deepak's call before any of (2) ships**:

- **Public copy.** `faq-data.ts:15` and `brio-section.tsx:71,148` become false the moment this
  ships. The honest version is narrower and arguably a better pitch: *Brio never goes looking
  inside your files. It reads a document only when you attach it, for that conversation.*
- **The boundary test.** `engagement-chat.test.ts` asserts document bodies never reach the model.
  That test stays exactly as it is — `buildEngagementContext` must still never carry content.
  The new path is a separate function with its own tests, which is the point: the default stays
  closed and attachment is the explicit exception.
- **Audit.** One event per attachment read: who, which files, which conversation. The existing
  `audit` module covers this.
- **Credits.** Attached text is by far the largest input this product sends. `meterAiCall` counts
  input tokens already, but the guard runs before the call with no idea of the payload size —
  needs a pre-flight estimate so a 60k-char attachment set cannot blow a firm's allowance in one
  question.

## Deliberately not in this change

- Attaching files from outside the engagement.
- Persisting extracted text to `EngagementDocument.content`. Tempting, since the column exists,
  but it converts a per-conversation read into stored custody of client work — a much bigger
  promise change than this one, and not needed for the feature.
- External collaborators. Already blocked from the chat entirely; nothing here opens it.
- Writing anything back to a document. Brio stays read-only per rules 4/4b.

## Open questions for Deepak

1. Is the narrowed promise acceptable, or does "never reads your clients' work" stay absolute and
   this feature not ship at all?
2. Sticky-per-conversation attachments, or per-message?
3. Should attach appear on the Overview scope too, or Files only?
4. Recursive folder attach — worth offering as an explicit "include subfolders" toggle later, or
   leave it at direct children?
