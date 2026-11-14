# Doc Search: delegate content search to the storage provider

Asked 2026-10-24/26, out of a privacy review. Written **after** the first commits landed, as a
record of what was decided, what shipped, and what is still open — there was no plan file while
the work was done, so treat the "Done" section as a description of `origin/dev`, not as intent.

Commits: `46ec683` (indexing + legal pages), `41da976` (Type filter UI, unrelated to the rest).

**Reviewed 2026-10-26** against `origin/dev` at `8055bfef`, by reading the code (nothing run but
the typecheck and tests noted in item 6). The review corrected "What was already there", turned
item 1 into a design, confirmed item 4 and fixed the notes on items 2, 3 and 5. Line numbers are
as of that commit.

## Why

`SearchService.indexFile` extracted each file's text and stored the leading ~500 characters
verbatim in `engagement_documents.metadata->>'summary'`, feeding it into the row's embedding.
That is document content, stored unencrypted (`EngagementDocument` is not in
`ENCRYPTED_FIELDS_MAP`), and it contradicted the privacy policy's bolded claim that we do not
store the contents of your files.

The decision: **our index holds structure, the provider holds content.** Drive and Graph already
index the whole document; we were keeping a worse copy of the first page and carrying the
privacy liability for it.

## Done — on `origin/dev`

- `lib/services/search-service.ts`: `INDEX_DOCUMENT_TEXT: boolean = false` gates the extraction.
  `isSummarizable` now begins with it, so `summary` stays null and
  `prepareTextForEmbedding(fileName, summary)` embeds the file name alone. No document text is
  read, stored or vectorized on new or re-indexed rows.
- A constant, not an env var, on purpose: a published privacy claim should not be able to stop
  being true because of a value set in an environment. Flipping it is a code change that shows up
  in review next to the comment saying what it costs.
- **Nothing was removed.** Per instruction, `extractOneDriveFileText`, `MAX_INDEXABLE_TEXT_SIZE_BYTES`,
  `lib/snippet.ts`, `lib/snippet.test.ts`, `lib/summarization.ts` and the `getFileText` call path
  are all intact and reachable; the gate is one line to flip back. No DB column was dropped.
- Legal pages corrected against the code (privacy §01/§03/§04/§05/§06, terms §01/§02), dates
  bumped to October 2026. Details in `46ec683`'s message.

### What was already there (not built by this work)

The engagement Doc Search route `app/api/projects/[projectId]/search/route.ts:116` already called
`permissionAdapter.searchFiles`:

- Drive: `(name contains '…' or fullText contains '…') and trashed = false`, scoped by
  `'<id>' in parents` — `lib/google-drive-connector.ts:4189`.
- OneDrive: `/items/{id}/search(q='…')` or `/root/search(q='…')` —
  `lib/connectors/adapters/onedrive-permission-adapter.ts:248`.

So for that surface the delegation was in place and turning the gate off cost little. It is a
weaker template than it looks, though; item 1 must not copy these four things:

- **Provider hits are not ranked first.** They get `matchType: 'keyword'` and score 1.0 (`:169`),
  but the final sort (`:255`) orders by `updatedAt`, newest first, and uses the composite score
  only to break ties between identical timestamps. In practice results come out by date,
  whatever matched them. Vector hits need ≥ 0.38 (`:144`).
- **The lock filter fails open.** Locked documents (private, intake, finalize) are post-filtered by
  a raw query (`:198–220`), but its `catch` only logs (`:219`) and returns everything unfiltered.
- **Drive coverage is silently capped.** `in parents` matches direct children only, so the route
  passes every indexed folder ID as a parent, then truncates the list to 50 (`:88`). Files in
  folders past the 50th never come back from Drive.
- **OneDrive makes one Graph call per folder.** The adapter (`:254`) runs a `search(q=)` per parent
  ID, so up to 50 parallel calls per search, although Graph's folder search
  already covers the whole subtree. Each failed call is dropped without a log (`:263`). That costs
  throttling headroom and hides outages.

*Since then (checked 2026-11-14):* `599016ea` sorts a doc-ID match ahead of everything (route
`:291`), then by date as before, so provider hits are still not first. `d11ecfda` made the lock
filter fail closed for a Contributor · Limited Access or a Reviewer (`:238`). For the firm's own
people it still fails open, on purpose (its test: "keeps the firm's results when the lock filter
can't run"). The 50-folder cap is now at `:95`; the OneDrive adapter is unchanged.

## Open — the leftover work

Ranked. Item 4 was fixed on 2026-11-09 (see below), apart from the Lead's preview. Items 1 and 2
are now the ones that make the shipped state incomplete.

### 1. Firm-wide Doc Search has no content matching at all

`app/api/firms/[firmId]/search/route.ts` never calls a provider. It runs `SearchService.searchGlobal`
only, which blends four local branches — `docId` exact/prefix, pgvector, `fileName ILIKE` full
query, per-term filename — plus the structured chips from `/search/interpret` (client, engagement,
deliverable, date range, file type).

Before `46ec683` its vector branch carried the 500-char extract, so it had a weak content signal.
It now has none. This is a real regression and it is live.

The fix is to call `searchFiles` here too, using the engagement route as the template. The
complications that make it more than a copy-paste:

- Firm-wide spans many clients and therefore **many connectors** — needs a fan-out over the
  firm's connectors and a merge, where the engagement route has exactly one.
- Provider relevance is not comparable across Drive and Graph (opaque ordering vs. a numeric
  `rank`), so the merge needs a deliberate rule rather than a score comparison.
- Results **must** be intersected with `computeGlobalSearchAccessScope` before anything renders,
  and with the same lock exclusions the engagement route applies.
- Provider search runs as the connector's identity, not the requesting user's, so nothing may be
  counted or ranked before that intersection — a result count computed pre-filter leaks the
  existence of documents the viewer may not see.

#### Design (from the 2026-10-26 review)

**a. Which connectors to ask: the index decides.** Select `DISTINCT d."connectorId"` from
`engagement_documents` for the firm under `buildGlobalScopeFilter` (`search-service.ts:667`) and
the chips (client, engagement, deliverable, date). That yields the connectors behind documents the
caller may see, already narrowed, so no other connector is ever queried. Fan out once per
connector, never per engagement or per folder.

**b. One scoped call per connector.**
- *Drive*: scope by the `appProperties` that `indexFile` already writes on every indexed file —
  `organizationId`, `clientId`, `projectId` (`search-service.ts:329–334`):
  `(name contains 'q' or fullText contains 'q') and trashed = false and appProperties has { key='organizationId' and value='<firmId>' }`,
  narrowed with `projectId` / `clientId` when an Engagement or Client chip is set. It covers
  every subfolder exactly, with no `in parents` list and no 50-folder cap. `searchFiles` needs a new
  option for it (e.g. `appScope: { organizationId, clientId?, projectId? }`); the same option fixes
  the engagement route's cap. Files indexed before those properties were written won't match;
  step c drops them anyway, and a re-index (item 3) writes the properties.
- *OneDrive / SharePoint*: one `search(q=)` per connector on its workspace root (where
  `persistWorkspaceRootLocation` put it), or on each engagement's `connectorRootFolderId` if a
  connector has no workspace root. Check on a real SharePoint library that a folder-scoped search
  stays inside the folder; step c keeps the result safe either way.
- Each call: a fixed page size (e.g. 50), a per-connector timeout (~2.5 s), all connectors in
  parallel. A connector that fails or times out is logged (connector id, status) and contributes
  nothing; the search still answers from the index.

**c. Intersect with the index in one query, before anything is counted, ranked or logged by name.**
Collect the provider hits as `(connectorId, externalId)` pairs and run a single query on
`engagement_documents`:
`d."firmId" = $firm AND (d."connectorId", d."externalId") IN (…)`, plus `buildGlobalScopeFilter`,
plus the lock exclusions the local branches already use
(`settings->>'locked' IS DISTINCT FROM 'private' AND settings->'lock'->>'type' IS NULL`), plus the
chips.
- This replaces "intersect with `computeGlobalSearchAccessScope`". That gives engagement IDs only.
  For external members (`grantGatedEngagementIds`) access is per document, through
  `engagement_document_sharing_users` (`search-service.ts:695`); an engagement-level intersection
  would show them every provider hit in their engagement.
- It also returns what the response needs (row id, docId, dates, mime type), so no second
  provider metadata call.
- A hit with no index row is dropped. The engagement route keeps such hits; here there is nothing
  to check access against. A hit can map to more than one row (the key is
  `engagementId, firmId, externalId`, so a file linked into two engagements has two rows); each row
  is checked on its own.
- **Fail closed**: if this query errors, every provider hit is discarded, never returned
  unfiltered.

**d. Merge by tier, not by score.** Drive's order and Graph's `rank` are not comparable, so nothing
compares them. Tiers, highest first:
1. Doc ID exact or prefix (existing branch).
2. Content and name: a provider hit the local name branches also found.
3. Content only: each connector's own order, interleaved round-robin across connectors.
4. Name terms only (existing per-term branch).
5. Vector only (existing, above its threshold).

In `searchGlobal`'s merge (`search-service.ts:818–871`) that means a `content` match type and a
tier term in `compositeScore` that outweighs recency, so the date can reorder within a tier but
never across tiers. Do not adopt the engagement route's date-first sort.

**e. Response and UI.** Add `'content'` to `matchType` (`search-service.ts:91`,
`global-search-view.tsx:59`) with a "Content match" chip beside "File match" and "Semantic match"
(`global-search-view.tsx:1270`). The result count is taken after step c.

**f. Tests.** Intersection: an external member with an ungranted document gets nothing for it; a
locked document is dropped; a hit with no row is dropped; an intersection error returns no provider
hits. A failing or slow connector degrades to index results. Tier order holds against recency. The
Drive query carries the `appProperties` scope.

### 2. Snippets already stored were never removed

A migration doing `metadata - 'summary'` plus `content = NULL` was written and then deliberately
dropped before the commit. So every file indexed before the gate still carries its extract.

Because of that, privacy §01 carries a transitional sentence:

> Files indexed before October 2026 may still carry a short extract from the start of the
> document, left by how search used to work; we are removing those.

**That sentence must stay until the data is actually purged**, and should be deleted in the same
change that purges it.

The migration's `content = NULL` is a no-op today: `indexFile` writes `NULL` to `content` (`$11`,
`search-service.ts:302`), and the extract lives only in `metadata->>'summary'` (set at `:222`). Keep
the clause as a guard; it costs nothing. Fold item 3 into the same migration (see below). Per `CLAUDE.md`, any migration is `--create-only` and the user runs
`npm run build` to apply; a hand-written data-only migration is fine here (precedent:
`20261023120000_discussions_resolve_and_unread`, whose comment explains why `migrate diff` was
used — the shadow DB cannot replay migrations referencing Supabase's `auth.users`).

### 3. Existing embeddings are still snippet-derived

The vector on an already-indexed row was computed from file name **plus** the extract. A purge
cannot regenerate vectors. New and re-indexed rows get a name-only embedding; everything else
needs the system-admin re-index (`app/api/system/user-data-map/reindex/route.ts`), which replaces
`metadata` wholesale and recomputes the embedding.

The re-index is not enough by itself: it only refreshes rows whose file it can still fetch. A row
whose file is gone, moved or unreadable keeps its old `summary` and its extract-derived vector. A
vector computed from document text is derived from content too, so it counts against the policy
claim.

Recommended: one migration does `SET embedding = NULL, metadata = metadata - 'summary' WHERE
metadata ? 'summary'`. Every row that ever held an extract loses both; no content-derived data
remains, whatever the re-index manages. Then run the re-index per firm to give those rows name-only
vectors back. Rows it cannot refresh are still found by name and doc ID. The vector branches don't
filter `embedding IS NOT NULL` today; add it so nulled rows aren't ranked with a null score. With
this, the privacy sentence can go in the same change as the migration rather than waiting on the
re-index.

### 4. Fixed: engagement search showed documents not shared with the searcher

**Status (2026-11-14): fixed by `d11ecfda`, PR #148, live since 2026-11-09, except the Lead's
"view as" preview, which is still open.**

What was wrong (confirmed by reading the code on 2026-10-26): a Contributor · Limited Access or a
Reviewer could search an engagement's Files tab and get the names and metadata of documents
nobody had shared with them. The route only checked `project:can_view`, which both roles have
(`lib/permissions/persona-map.ts:57`, `:63`). Its index branches carried no grant clause, and the
provider hits were only lock-filtered, by a filter that failed open.

What shipped in `app/api/projects/[projectId]/search/route.ts`:
- The searcher's engagement role is resolved (`requireEngagementMember`, `:31`), and
  `isExternalEngagementRole` picks out the two limited roles (`:32`).
- For those two roles every result, from the index or the provider, must be in
  `visibleDocumentIdsFor(projectId, role)` and not in `privateExternalIds(projectId)`, which also
  removes anything inside a private folder (`:249–250`). If either check fails, the search fails;
  nothing is listed unchecked.
- The lock filter fails closed for them (`:238`) and stays as it was for the firm's own people.
- `route.test.ts` covers it, including doc-ID matches (from `599016ea`): shared only, nothing
  inside something private, and the lock-filter failure case.

It went in differently from the fix sketched in this plan (one index query, as in item 1 step c).
It filters the merged list in code with the existing helpers instead. That is equivalent for this
single-engagement route; item 1 should still use the single query, because it spans many
engagements and roles at once.

**Still open: the Lead's preview.** When a Lead uses "view as" to preview a Reviewer or a
Contributor · Limited Access, the Files search sends `viewAs`
(`components/projects/engagement-search-context.tsx:129–130`). The route never reads it, so the
preview lists everything the Lead can see. Real Reviewers and contributors are filtered
correctly; only the preview misrepresents what they get. Fix: honor `viewAs` only for a caller
allowed to preview (the Lead), by running the same visibility filter for that role, with a test.

### 5. Display snippets

Neither provider is asked for a result snippet today.

- Graph's `<c0>`-highlighted, `<ddd/>`-trimmed `summary` comes from the **Microsoft Search API**
  (`POST /search/query`, each hit's `summary`), not from the driveItem `search(q=)` the adapter
  calls. That returns plain driveItems, so adding a field to its `$select` won't produce a snippet.
  Getting highlights means switching endpoints, with its own permissions, paging and cross-site
  results, which would still need step c's intersection. Confirm against Graph's docs before
  building on it.
- Drive v3 returns no content snippet, so showing one means fetching on demand for the few
  visible results at render time — **never storing it**, or we are back where we started.

### 6. Nothing here has been built or tested

Both commits were authored in a container with no `node_modules`: no typecheck, no test run, no
build. Run `npm run build` before any of this goes near `main`. `toggleFileTypeSimple` in
`41da976` is inline in the component with no unit-test seam; worth extracting if a test is wanted.

Since then (2026-10-26, local checkout at `8055bfef` plus one unrelated commit): `npx tsc --noEmit`
is clean, and the search test files pass (`lib/services`, `components/search`, `app/api/firms`;
4 files, 11 tests). The full `npm run build` runs in the pre-push hook on the next push of `dev`.

## Constraints carried from the session

- Do not remove functions, DB columns or other artifacts — gate behavior instead. This is why the
  extraction path is still present and unreachable.
- Never commit or push without explicit approval; present the message and ask (`CLAUDE.md`).
- Migrations: `--create-only`, never applied directly; never edit an applied migration.
- American English throughout.
- If the gate is ever flipped back on, the privacy policy's §01 claim becomes false — treat it as
  a change to published commitments, not a search-tuning knob.

## Separately queued, not part of this

Entity search (`lib/actions/quick-search.ts:45`, `app/api/projects/[projectId]/audit/route.ts:52-53`)
matches `Client.name` and `Engagement.name` with `contains`, but both are AES-256-GCM encrypted
with a random IV per value, so the comparison runs against ciphertext and cannot match rows
written since encryption was enabled. `quick-search.test.ts` mocks Prisma and asserts the shape of
the `where` clause, so it passes regardless. Raised as its own task.
