# Doc Search: delegate content search to the storage provider

Asked 2026-10-24/26, out of a privacy review. Written **after** the first commits landed, as a
record of what was decided, what shipped, and what is still open — there was no plan file while
the work was done, so treat the "Done" section as a description of `origin/dev`, not as intent.

Commits: `46ec683` (indexing + legal pages), `41da976` (Type filter UI, unrelated to the rest).

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
`permissionAdapter.searchFiles` and already ranked provider hits first:

- Drive: `(name contains '…' or fullText contains '…') and trashed = false`, scoped by
  `'<id>' in parents` — `lib/google-drive-connector.ts:4189`.
- OneDrive: `/items/{id}/search(q='…')` or `/root/search(q='…')` —
  `lib/connectors/adapters/onedrive-permission-adapter.ts:248`.

Provider hits get `matchType: 'keyword'`, score 1.0; vector hits need ≥ 0.38; locked documents
(private/intake/finalize) are post-filtered at `:198`. So for that surface the delegation was
already in place and turning the gate off cost little.

## Open — the leftover work

Ranked. Items 1 and 2 are the ones that make the shipped state incomplete.

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

### 2. Snippets already stored were never removed

A migration doing `metadata - 'summary'` plus `content = NULL` was written and then deliberately
dropped before the commit. So every file indexed before the gate still carries its extract.

Because of that, privacy §01 carries a transitional sentence:

> Files indexed before October 2026 may still carry a short extract from the start of the
> document, left by how search used to work; we are removing those.

**That sentence must stay until the data is actually purged**, and should be deleted in the same
change that purges it. Per `CLAUDE.md`, any migration is `--create-only` and the user runs
`npm run build` to apply; a hand-written data-only migration is fine here (precedent:
`20261023120000_discussions_resolve_and_unread`, whose comment explains why `migrate diff` was
used — the shadow DB cannot replay migrations referencing Supabase's `auth.users`).

### 3. Existing embeddings are still snippet-derived

The vector on an already-indexed row was computed from file name **plus** the extract. A purge
cannot regenerate vectors. New and re-indexed rows get a name-only embedding; everything else
needs the system-admin re-index (`app/api/system/user-data-map/reindex/route.ts`), which replaces
`metadata` wholesale and recomputes the embedding.

### 4. Verify: no per-document visibility filter on engagement search results

`app/api/projects/[projectId]/search/route.ts` gates on `requireProjectView` → `canViewProject`,
which is a project-level `can_view` check. The route then filters only **locked** documents. It
does not call `visibleDocumentIdsFor` or any external-member grant check, on the provider results
or the DB ones.

Elsewhere, external collaborators and viewers are explicitly restricted per document —
`lib/comments/discussions.ts` and the doc-comments route both intersect with
`visibleDocumentIdsFor(projectId, role)`, and `quick-search.ts` notes "the grant check
SearchService applies for EC/EV".

This may be a gap that lets an external member see, in search results, documents not shared with
them. **Not confirmed** — trace whether an external role can reach this endpoint and whether the
UI exposes it to them before concluding anything. If it is real it is an access-control bug and
takes priority over everything above.

### 5. Display snippets

Neither provider is asked for a result snippet today.

- Graph returns hit highlights for free in the `summary` field (`<c0>`-wrapped matches,
  `<ddd/>` for trimmed text); the OneDrive adapter's `$select` does not request it.
- Drive v3 returns no content snippet, so showing one means fetching on demand for the few
  visible results at render time — **never storing it**, or we are back where we started.

### 6. Nothing here has been built or tested

Both commits were authored in a container with no `node_modules`: no typecheck, no test run, no
build. Run `npm run build` before any of this goes near `main`. `toggleFileTypeSimple` in
`41da976` is inline in the component with no unit-test seam; worth extracting if a test is wanted.

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
