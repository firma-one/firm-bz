# Engagement Assets: Details pane, asset dataset, versions and activity

Status: **draft for review, nothing built** (2026-10-28).
Scope: the engagement Files tab, its `DocumentActionMenu` Details submenu, the right pane, and
what Brio reads about files.

---

## 1. What the code does today (findings)

### 1.1 Why Version history and Activity stream are empty

The screenshot's file (`01_ICP_Firmographics_&_Persona_Data.xlsx`) is on a **OneDrive** connector
(local DB: `connectors.type = ONEDRIVE`, the only connector). So yes, the cause is the missing
OneDrive implementation:

- `app/api/documents/versions/route.ts` returns `{ revisions: [], unsupported: true }` for any
  non-Google connector. `DocumentHistoryPane` ignores `unsupported` and shows "No version history
  available", which reads as "this file has no versions". That is misleading.
- This gap is already noted in `.claude/plans/connector-microsoft-impl.md` (item 4). The code
  comments say Graph has no per-version content fetch. **That is wrong.** Graph v1.0 has:
  - `GET /drives/{d}/items/{i}/versions` (list, with `lastModifiedBy`, `lastModifiedDateTime`, `size`)
  - `GET /drives/{d}/items/{i}/versions/{v}/content` (download one version)
  - `POST /drives/{d}/items/{i}/versions/{v}/restoreVersion` (restore)

  These work on OneDrive for Business and SharePoint. Personal OneDrive keeps versions too.

The same route also has problems that don't depend on the provider:

| # | Problem | Effect |
|---|---|---|
| a | The route only allows the connector owner (`connector.userId === user.id`) | Every other firm member gets 403, then "Failed to load version history". This affects Google firms too. It is listed as SELF in `access-gates-inventory.md` row 11. |
| b | The `fileId` regex is `^[A-Za-z0-9_-]+$` | Personal OneDrive ids contain `!`, so they would get 400 before they reach the provider. |
| c | Version download went through `/api/documents/download?...&token=<access_token>` | The access token ended up in the URL, and the route gates on the **legacy** `Firm.connector` relation, which this firm's connector doesn't have, so it returned 403. The plain Files-tab **Download** was never affected: with a project id the menu uses the gated `download-share` route. **Fixed 2026-10-28:** version download now goes through `download-share?revisionId=` (internal roles, Google only), and nothing calls the legacy route. Deleting the route (`access-gates-inventory.md` row 10, High) waits for sign-off. |

### 1.2 "Activity stream" is not an activity stream

`DocumentActivityPane` calls the **same versions endpoint** and keeps only revisions from the
last 30 days. Each one shows as "X edited this file". On Google it is a subset of Version
history. On OneDrive it is empty.

Meanwhile:

- `app/api/documents/activity/route.ts` (Drive Activity API) exists, but nothing calls it.
- **Firma already records real per-document activity.** `platform_audit_events.projectDocumentId`
  is indexed by `(engagementId, projectDocumentId, eventAt)` and holds `DOCUMENT_OPENED`,
  `DOWNLOADED`, `STATUS_CHANGED`, `MOVED`, `VERSIONED`, `FINALIZED`, `SHARE_*`, `SHARE_VIEWED`
  and `COMMENT_*`. The local DB already has 11 such rows. This source works the same for every
  provider, and it is the activity a firm cares about: who opened it, whether the client viewed
  it, when the stage changed. Raw provider edits matter less.

### 1.3 Data the document row already has (no new storage needed)

| Ask | Already exists as |
|---|---|
| FileType | `mimeType` column plus `getDisplayType()` |
| Status | `settings.activity.status` (`to_do / in_progress / in_review / approved`), the Board stage. **Don't add a second status.** `EngagementDocument.status` is indexing state (PROCESSING/…), not workflow. |
| Due date | `dueDate` column |
| Description | `settings.description`, already written by the sharing route's description path and edited in the Deliverable detail panel (`deliverable-detail-panel.tsx`). Today it's for deliverables only. |
| Owner | The creator: `createdBy`, resolved by `creatorOf()` in `lib/files/file-creator.ts`, shown as "Created by". Don't add a separate owner field. |
| Assignee | `settings.assigneeUserId`, the person working on it now. Written by `documents/[documentId]/assignee`, read by My Work (which falls back to `createdBy`), Calendar, Insights and subtasks |
| Created / Modified | Provider `createdTime`/`modifiedTime` on the live listing; row `createdAt`/`updatedAt`; creator via `lib/files/file-creator.ts` |
| Comments | `DocCommentMessage` per document, plus `#QSR-16` tags in other comments (`lib/comments/tagged-documents.ts`) |

Brio currently reads, per file: name, folder path, doc ID, due date (`lib/ai/files-context.ts`).
It does **not** read status, modified date, sharing state or activity per file.

### 1.4 Where the new data goes: `settings` (decided 2026-10-28)

**Decision (Deepak):** put everything new in the existing `settings` JSONB. This follows the
pattern already in the code (`description`, `assigneeUserId`). The indexer leaves `settings`
alone on re-index ("do not overwrite settings/slug on conflict"). Phase 3 therefore needs **no
Prisma migration**.

`metadata` stays off-limits. The indexer upsert does `"metadata" = EXCLUDED."metadata"`, which
replaces the whole blob, so anything a user entered there would be erased on every re-index.

Three things in `settings` must be fixed first. Without these, Description, Owner and Notes get
lost or leak:

1. **Three paths wipe the whole blob to `{}`.** Untag-as-deliverable (`sharing/route.ts` ~:291)
   and both share-delete paths (~:412, ~:757) do it. Today that already silently deletes a
   deliverable's `description` and `assigneeUserId`. They must clear only the sharing keys
   (`share`, `activity`, lock, legacy flat share fields) and keep the asset data.
2. **Every writer does read-modify-write of the whole blob in JS** (`{ ...existing, x }`). Two
   saves that overlap can drop one of them. The new writes use atomic SQL on their own key
   (`jsonb_set(settings, '{details}', …)`, and an atomic append for notes), so they can't clobber
   sharing state. An existing sharing write that overlaps within the same instant can still
   overwrite a details save. That's acceptable at current scale. Note it, don't rewrite 15 writers.
3. **The sharing GET returns the raw row, settings included, to anyone who can view the
   engagement** (`canViewProject`, which includes external roles). Internal notes stored in
   `settings` would reach clients there. Responses to external roles must strip `notes` and any
   internal-only details.

---

## 2. Recommendations (expert feedback)

### 2.1 Storage shape: all in `settings`

```jsonc
settings: {
  // existing, reused as-is (no data move)
  description: string,          // Description: now for every asset, not only deliverables
  assigneeUserId: string,       // Assignee (current); Owner is createdBy, a column
  share: {...}, activity: {...}, // sharing + stage, untouched
  // new
  details: {
    kind: 'deliverable' | 'working_draft' | 'client_input' | 'reference'
        | 'contract' | 'meeting_notes' | 'financial',
    reviewerUserId: string,
    sensitivity: 'internal' | 'confidential' | 'personal_data',
    reviewBy: string,            // ISO date; separate from dueDate
    updatedAt: string, updatedBy: string,
  },
  notes: [                       // append-only log, internal-only in v1
    { id, kind: 'note' | 'decision' | 'client_request' | 'risk',
      body, authorUserId, createdAt, editedAt?, deletedAt? },
  ],
}
```

- **One module owns it:** `lib/files/asset-details.ts` holds the zod schema, typed reads with
  defaults, the atomic `jsonb_set` writer for `details`, atomic note append/edit/delete, and the
  "strip for external roles" filter.
- **Notes caps:** the Files list selects `settings` for every row (86 `settings: true` selects
  across the code). So cap notes at about 50 per asset and 1,000 characters each, with older notes
  soft-dropped from the list view. If firms outgrow that, notes move to their own table later.
  That's a contained change, because only `asset-details.ts` touches them.
- Description should also feed the embedding (`prepareTextForEmbedding(fileName, summary)` → add
  description) so Doc Search finds assets by what they are for.

### 2.2 Datapoints for Brio's advisory role

Biggest point first: **derived signals beat entered fields.** People stop filling in metadata
forms after about three fields. Most of the advisory value comes from facts the system already
knows. Keep the entered set small.

**Derived (no data entry, highest value). Most come from audit events and settings that already exist:**

- **Client engagement:** shared with client on X; client last viewed on Y, or never viewed
  (`DOCUMENT_SHARE_VIEWED`). Brio can then say: "you shared the deliverable 9 days ago and the
  client hasn't opened it".
- **Waiting time:** days in the current stage (`settings.activity.updatedAt`). Example: "In review for 12 days".
- **Churn:** version count and last edited by whom and when (Graph/Drive versions).
- **Exposure:** private, shared with external collaborators, published to a guest, download allowed.
- **Locked/final:** `lock.finalize`, finalizedAt.
- **Staleness:** not modified in N days while the stage isn't `approved`.
- **Discussion state:** open or resolved thread, unanswered comments, how many times it is `#`-tagged elsewhere.

**Entered (keep to these):**

1. **Description:** what the asset is for.
2. **Kind:** Deliverable, Working draft, Client-provided input, Research/reference, Contract/SOW,
   Meeting notes, Invoice/financial. With this Brio can spot gaps like "no signed SOW" or
   "client inputs still missing".
3. **Assignee:** already exists (`settings.assigneeUserId`). Owner is the creator and needs no
   entry. Brio can answer "Ana is assigned 4 overdue assets".
4. **Reviewer/approver:** who signs it off.
5. **Sensitivity:** Internal / Confidential / Contains personal data. The key advisory pairing is
   Sensitivity + Exposure: "this is marked as containing personal data and is published to a
   guest link". (`DriveFile.badges` already has a `sensitive` type.)
6. **Review-by date:** separate from Due. Use it for contracts and NDAs (renewal, expiry).
7. **Notes:** the log above.

Optional later: *supersedes / superseded by* (links v1 to v2 so Brio stops citing the old file),
and an AI-drafted Description from the existing `metadata.summary` that the user accepts. That
costs credits and needs an explicit click.

### 2.3 The Brio boundary needs your explicit decision

Brio is built around a deliberate line. `files-context.ts` says *"no document content, no comment
bodies"*. `engagement-activity.ts` says *"never prose a user wrote"* and names prompt injection
as the reason (a file named "ignore previous instructions…").

Description and Notes **are** user-written prose. Sending them moves that line. I think the move
is worth making, with these guardrails:

- Brio chat already refuses external roles (`ai-chat/route.ts` :98), so internal notes only reach
  internal users. If Brio ever opens to clients, notes need a visibility filter before that.
- Wrap all user-written fields in one clearly delimited "untrusted data" block, with a system
  instruction to treat it as data and never as instructions. Cap length per field and in total.
- **Files-page context:** add status, modified, owner, kind, sensitivity and exposure per file,
  and a one-line description. **Per-asset focus** (asking Brio from a file's Details pane): add
  the full description and the last ~10 notes.
- Prompt caching: the files block sits in the cached prefix. Notes change often, so per-asset
  detail should go after the cache breakpoint, or the cache misses on every note.

### 2.4 Details pane: one menu item, four tabs

Agree with folding it. The three-item submenu (File information / Activity stream / Version
history) becomes **one `Details` item**. It opens the right pane with tabs:

- **Info:** editable Description, Kind, Assignee, Reviewer, Sensitivity, Due, Review-by.
  Read-only: type, size, created/modified, owner (creator), stage, exposure. The Notes log sits at the bottom of
  Info, not in its own tab. Notes are part of the asset's record, and one fewer tab keeps the
  pane readable at 380px.
- **Versions:** the provider version list. For an unsupported provider, show an honest empty
  state: "Version history isn't available for this storage yet". Hidden for `LINK` rows.
- **Activity:** Firma audit events for this document, newest first, with provider edits merged in
  as "edited" entries where available. History goes back as far as the plan's `entitledAuditDays` allows.
- **Comments:** this document's discussion, plus **Mentioned in** (other comments that `#`-tag it).
  The existing `Comment` menu item opens this tab.

Deep link: `#doc-file:<id>&pane=versions` so Brio, notifications and the Board can open a given tab.

### 2.5 Rename Files to Assets

- `Assets` is a reasonable name here because the list already holds `LINK` rows that aren't files.
- One caution: the rest of the product says *document* (Doc Search, doc IDs, `DocumentActionMenu`,
  Discussions). Users will see "Assets" in the tab and "Doc Search" in the sidebar. Accept that
  mix knowingly, or plan a later pass.
- **Rename the label only.** Keep the `files` tab key, routes, API paths and code names (~236
  references). The URL can stay. No real production users exist, so a URL change would be safe,
  but it buys nothing.
- What changes: the header tab (`components/shell/header-bar.tsx`), the Brio mode label ("Ask
  Brio · Files"), the chat context labels (`engagement-ai-chat.tsx` :255), the search-panel filter,
  empty states and page titles, **the /tour demo copies** (`components/demo/demo-header-bar.tsx`,
  `demo-file-list.tsx`), and marketing copy (`marketing/v2/home/product-story.tsx`).

---

## 3. Phased plan

Each phase can ship on its own. Phase 0 is small and fixes what you saw today.

### Phase 0: Make what exists honest and reachable (small)
- **Done 2026-10-28:** new `GET /api/projects/[projectId]/documents/[documentId]/versions`. It is
  gated on engagement membership (internal roles only), and the connector and provider id come
  from the document row, so any id shape works. It returns `unsupported: true` for non-Google
  storage. Both panes load through `components/files/use-document-versions.ts` and show "isn't
  available for this storage yet". The menu hides Activity stream and Version history from
  external users. The old `/api/documents/versions` and `/api/documents/activity` have no callers
  and wait for sign-off to be deleted.
- ~~Stop putting the access token in download URLs~~ **Done 2026-10-28** (§1.1 c). Still to do:
  delete `app/api/documents/download/route.ts` once you sign off.
- The three `settings: {}` resets in `sharing/route.ts` clear only the sharing keys (§1.4 #1).
  This fixes today's loss of deliverable description and owner, and it must land before Phase 3.

### Phase 1: OneDrive versions: **built 2026-10-28** (uncommitted on dev)
- `listVersions` and `getVersionContent` are optional methods on `IConnectorContentAdapter`,
  implemented for Graph in `onedrive-content-adapter.ts` (`/items/{id}/versions`, reversed to
  oldest first; `/versions/{id}/content`). Google still goes through `googleDriveConnector`
  directly in the two routes; wrapping it in the adapter is left for later.
- The versions route and `download-share?revisionId=` dispatch by connector type. The current
  version downloads as the file itself (Graph serves only earlier versions that way).
- The OneDrive file list now asks for `createdDateTime`, so Created has a date there too.
- Restore a version (`restoreVersion`) is **out of scope** until you decide on it. It changes the
  client's file and needs its own audit event and role gate (admin only?).

### Phase 2: Details pane with tabs: **built 2026-10-28** (uncommitted on dev)
- `components/files/asset-details-pane.tsx` has Info / Versions / Activity / Discussions tabs.
  External users get Info and Discussions only, and links get no Versions.
  `openAssetDetailsPane()` is shared by the menu item and the row icon.
- **Info** (reworked after Deepak's review the same day): Status, Assignee, Due, Created (by · at),
  Modified (by · at), then Description, with Type and Size underneath. Status and Due reuse the
  Files row's cells (moved to `components/projects/file-property-cells.tsx`) with the row's own
  edit rules, passed in from the row as `editing`. Assignee (`settings.assigneeUserId`) and
  Description (`settings.description`, the same field the Deliverable panel edits) are for leads.
  Outside the Files list, Info reads only. The description is visible to anyone who can view the
  file, clients included, as deliverable descriptions already are.
- The share-removal and un-tag paths now keep description and assignee (`assetSettingsOf`).
- **Notes** (built the same day): `settings.notes`, internal-only.
  - Storage is `lib/files/document-notes.ts`: one-statement add, edit and delete, capped at 50 notes
    of 1,000 characters each. Authors edit; authors and the engagement lead delete, and deleting
    removes the text.
  - Routes are `.../documents/[documentId]/notes` (GET, POST) and `.../notes/[noteId]` (PATCH,
    DELETE), gated in `lib/files/document-notes-access.ts`: firm-role members only, and no writes once
    the engagement is completed.
  - `settingsForBrowser` leaves notes out of every raw settings response: the sharing route and the
    stage route, which external collaborators call too.
  - Audit events `DOCUMENT_NOTE_CREATED/CHANGED/DELETED` record ids and kind, never text. They show
    in Activity and on the Audit page.
  - UI: `components/files/document-notes-section.tsx`, under Description.
  - Not yet read by Brio (Phase 4).
- **`buildSettingsForDb` kept only share/activity/comments/accessLog**, so every share or stage change
  erased the lock (Private, Finalized), description, assignee and notes. A private document's stage
  change made it visible to clients. It now keeps every key it doesn't manage, and drops only the
  legacy flat share keys it folds into `share`.
- **To do default:** tracked work (a deliverable, and the documents inside one) with no stage shows
  To do in the Files row, the Details pane and /tour, as the Board already did. Display only.
- **Row quick icons:** Details first, then Preview, Copy link, ⋮.
- **Layout (as the Board's pane):** the shared fields (Status, Assignee, Due, Created, Modified,
  Type) sit above the tabs and stay put whichever tab is open. The tabs are Details (Description,
  then Notes, as sections), Versions, Activity and Discussions, styled as the Board's tab bar with
  icon and label.
- **Versions and Activity as timelines** (replacing one card per entry):
  - Versions (`components/files/document-versions-timeline.tsx`): a dot per version, newest first,
    as "v2 · Current", with who saved it, when, its size and the change from the one before
    ("+4.7 KB"). Download appears on hover.
  - Activity: a small icon per kind of event on a thin rail, one line each, grouped by day (Today,
    Yesterday, the date). The same person doing the same thing in a row that day folds into one
    line: "opened this file 3 times".
  - The old Version history pane keeps its cards behind the switch.
- **Stuck page after ⋮ → Open:** the secure-access dialog opens on the same click as a new tab, and
  the page could be left with `pointer-events: none` on `<body>`, so everything became unclickable.
  Open now runs from `onSelect`, as the menu's other dialog-opening items do. The dialog also calls
  `releaseStrandedPointerLock()` (`lib/ui/stranded-pointer-lock.ts`) once closed and whenever the
  page is shown again; it only clears the lock when no dialog or menu is open. Not reproduced live,
  because that needs a signed-in OneDrive open.
- **Pane header:** named as the Board's pane names a deliverable. The doc ID is the title and the
  file name sits beneath it, by the type icon; a file with no ID yet shows its name alone. The
  name chip and breadcrumb are gone from the body. The Files row highlight checks the pane's
  content (`isAssetDetailsPaneContent`) rather than a fixed title.
- **Full-screen pane header:** shows the sidebar's `FirmMark` and name (`PANE_HEADER_FIRM_MARK`).
  /tour passes its demo firm; onboarding keeps the large logo.
- **Activity** (`components/files/document-activity-feed.tsx`) reads the existing
  `GET /api/projects/[projectId]/audit?documentId=`, so no new route was needed. It merges in the
  storage's edits from the versions route (Google today), newest first, and pages with "Show older
  activity". Indexing events are left out.
- **Row quick icons:** a Details icon after Preview. The gap tightened (`gap-1` → `gap-0.5`), and
  Copy link (also in ⋮) hides when the file table is under 49rem.
- **Switch:** `DETAILS_PANE_TABS` in `components/files/details-pane-switch.ts`. False brings back
  the Details submenu with its three panes, all still in place for sign-off.
- **/tour:** `demo-file-list.tsx` menu and row icons match, read from the same switch.
- **Still open:** "Mentioned in" (needs a `taggedDocIds text[]` column with a GIN index on
  `DocCommentMessage`, written when a comment is posted: a migration), deep links to a tab
  (`#doc-file:<id>&pane=versions`), and what external users may see in Activity (Q3).

### Phase 3: Asset dataset (in `settings`, no migration)
- `lib/files/asset-details.ts` as in §2.1. Description reuses `settings.description` and
  Assignee reuses `settings.assigneeUserId`. Owner is the creator (`createdBy`). The Deliverable
  panel keeps working unchanged.
- Strip `notes` and internal-only details from the sharing GET (and every other settings-returning
  response) for external roles. Add a test that an `eng_ext_collaborator` never receives `notes`.
- Server-only modules with entity-scoped checks. Per the server-actions rule: no `userId`
  parameters, and the check uses the document's own engagement.
- Audit events: `DOCUMENT_DETAILS_CHANGED` and `DOCUMENT_NOTE_CREATED/CHANGED/DELETED`. Add them
  to `AUDIT_EVENT_TYPES` and to the activity-summary grouping.
- Description goes into the embedding text on the next index.

### Phase 4: Brio reads assets
- Extend `FileNode` and `loadEngagementFiles` with stage, modified date, kind, owner, sensitivity,
  exposure, a one-line description, and derived signals (days in stage, client last viewed).
- Add the per-asset focus context (full description and the latest notes) in the untrusted-data
  block, after the cache breakpoint.
- Tests: the boundary (no external role ever gets notes), length caps, and an injection string
  in a note staying inert data.

### Phase 5: Rename to Assets
- Label-only, as in §2.5. Independent and cheap, so it can go first or last.

---

## 4. Open questions for Deepak

1. **Brio boundary (§2.3):** OK to send Description and Notes (user-written prose) to the model,
   framed as untrusted data?
2. **Notes visibility:** internal-only in v1 (recommended), or a "shared with client" flag per note?
3. **Activity visibility:** who sees per-document activity, including client views and downloads?
   Recommendation: admins and members see everything; external collaborators and viewers see only
   their own actions, or no Activity tab.
4. **Entered fields:** is the list in §2.2 right? Should Kind be a fixed list or firm-configurable?
5. **Version restore:** in scope, and if so admin-only?
6. **Naming:** "Assets" for the tab while the rest says "document". Accept the mix for now?
