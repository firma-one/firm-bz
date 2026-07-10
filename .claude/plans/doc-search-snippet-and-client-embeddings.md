# Doc Search: Snippet Summaries (#1) + Browser-Side Query Embedding (#2)

> Per project convention, this plan is mirrored at `<project>/.claude/plans/doc-search-snippet-and-client-embeddings.md`.
> Note: an NL query interpreter ("#4", prose → inferred filter chips) was evaluated and explicitly dropped on 2026-07-09 — entity-name/date collisions and silent over-filtering risk; explicit @ picker chips remain the only filter input. Do not re-add without a new decision.

## Context

Firm-wide Doc Search is hybrid: pgvector similarity (`all-MiniLM-L6-v2`, 384-dim, via `@xenova/transformers` on the server) merged with filename/term ILIKE. Two problems:

1. **Index time** — `generateSummary()` runs distilbart (~250MB model) to write a summary that gets embedded with the filename. It's the single real Vercel deployment risk (size/memory/cold-start), slow, and only covers Google Docs/txt/md/json — Office files and PDFs never get summaries anyway.
2. **Query time** — every search embeds the query on the server (lambda inference per search). Since Doc Search is never the user's first surface, the ~25MB MiniLM model can be preloaded in the browser during idle time, making query embedding instant and free.

**Hard constraint (user, 2026-07-09, "IMP"):** do NOT delete or restructure any existing code path. New code goes alongside old; old paths stay functional and selectable until Deepak tests and signs off. This matches the codebase's own "duplicate per-route until validated" convention (see comments at `frontend/app/api/firms/[firmId]/search/route.ts:10,21`).

**Scope:** firm-wide global search only. The project-scoped route (`app/api/projects/[projectId]/search/route.ts`) is untouched.

---

## Part 1 — Extractive snippet instead of distilbart summary

### 1.1 New helper — `frontend/lib/snippet.ts` (new file)
`extractSnippet(text: string, maxLen = 500): string | null` — collapse whitespace, trim, slice to `maxLen` at a word boundary, return `null` for text under ~100 chars (mirrors `generateSummary`'s guard).

### 1.2 Switch in indexing — `frontend/lib/services/search-service.ts`
At `indexFile` (line ~98), branch on env `SEARCH_SUMMARY_MODE`:
- unset or `snippet` (new default): `summary = extractSnippet(text)`
- `model`: legacy `summary = await generateSummary(text)` — unchanged line, kept as-is

`summarization.ts`, its import, and everything downstream (`driveMetadata.summary`, `prepareTextForEmbedding`, MiniLM embed at line 106–108) stay exactly as they are. Rollback = `SEARCH_SUMMARY_MODE=model`.

### 1.3 Document the env var
Add `SEARCH_SUMMARY_MODE` to `env.example` with both values explained.

**Not in scope:** widening the summarizable mimeType allowlist (line 90–93) — separate follow-up once snippets are validated.

---

## Part 2 — Browser-side query embedding with preload + server fallback

### Design rules
- **Same model, same library:** client uses `@xenova/transformers` **2.17.2** (already a prod dependency; browser support is its primary use case) with `Xenova/all-MiniLM-L6-v2`, WASM backend — guarantees vectors identical to the server's. WebGPU via `@huggingface/transformers` v4 (already in devDeps, used only by `scripts/release.mjs`) is a follow-up after parity is proven, not part of this change.
- **Self-verifying protocol (no drift risk):** client sends the exact text it embedded; server recomputes what it *would* embed and only trusts the client vector when the two strings match — otherwise it falls back to server-side embedding. Wrong-vector bugs are structurally impossible.
- **Feature flag:** everything gated on `NEXT_PUBLIC_CLIENT_EMBEDDINGS=1`. Flag off (default) → app behaves byte-for-byte as today (existing GET path, untouched).

### 2.1 Shared query-prep module — `frontend/lib/search-query-prep.ts` (new file)
The server enriches/cleans text before embedding (`cleanSemanticQuery`, `parseDateRangeFromText`, `QUERY_ENRICHMENTS`); the client must produce the identical string. New module exports `prepareEmbeddingText(rawQuery: string, opts?: { hasExplicitDateRange?: boolean }): { embeddingText: string, cleanedQuery: string }`:
- reuses existing `cleanSemanticQuery` (`lib/services/semantic-query-cleaner.ts`) and `parseDateRangeFromText` (`lib/services/date-query-parser.ts`) — imported, not copied
- contains its own copy of the `QUERY_ENRICHMENTS` map (the route's copy at `route.ts:26` stays untouched, per no-delete; the string-match protocol in 2.4 makes drift harmless — mismatch just means server fallback)
- imported **dynamically** by the client (chrono adds bundle weight; only load when the flag is on)

### 2.2 Client embedding worker — `frontend/lib/client-embeddings/` (new files)
- `embedding.worker.ts` — Web Worker (webpack 5 `new Worker(new URL(...))`; this project uses webpack per `next.config.js:75`). Loads the `@xenova/transformers` feature-extraction pipeline (models fetched from HF CDN, cached by the browser; no CSP found in `next.config.js`/`middleware.ts` — confirm via network tab during verification). Message protocol: `{type:'preload'}` / `{type:'embed', id, text}` → `{type:'ready'}` / `{type:'vector', id, data}` / `{type:'error', id}`.
- `index.ts` — singleton wrapper: `preloadEmbeddingModel()` (idempotent; no-ops when flag off, `navigator.connection.saveData`, or worker unsupported) and `embedQueryLocal(text): Promise<number[] | null>` (`null` = model not ready or ~300ms timeout → caller falls back; a slow load never delays search).

### 2.3 Preload triggers
- `frontend/components/search/global-search-view.tsx` — call `preloadEmbeddingModel()` on mount and on search-input focus.
- `frontend/components/ui/top-bar.tsx` — on mount inside `requestIdleCallback` (app-shell warm-up so the model is ready long before the user reaches Doc Search).

### 2.4 New POST handler — `frontend/app/api/firms/[firmId]/search/route.ts`
Add `export async function POST` **alongside** the untouched GET. Body: existing GET params plus `queryVector?: number[]` and `embeddedText?: string`. Same auth/access-scope/filter flow as GET (duplicated deliberately, per the route's own convention). Vector acceptance:
1. validate: 384 finite numbers
2. server computes its own embedding text (same steps as GET: date-strip → clean → enrich)
3. computed text `=== embeddedText` → pass vector through; else ignore it (server embeds as today)
4. dev-only (`NODE_ENV !== 'production'`): when a vector is accepted, also server-embed and log cosine similarity — parity proof, expect ≥ 0.999

### 2.5 Plumb the vector — `frontend/lib/services/search-service.ts`
Additive optional param `queryEmbedding?: number[]` on `searchGlobal` (line 593) and `searchGlobalVector` (line ~708). In `searchGlobalVector`: `const embedding = params.queryEmbedding ?? await generateEmbedding(params.semanticText)`. No other logic changes; all four search branches (line 647–660) unchanged.

### 2.6 Client search call — `frontend/components/search/global-search-view.tsx`
In `runSearch` (line 580): when flag on AND `embedQueryLocal(embeddingText)` returns a vector → POST with `{ ...existing params, queryVector, embeddedText }`; a non-ok POST falls back to GET once. Otherwise → existing GET at line 609, unchanged.

### 2.7 Env documentation
Add `NEXT_PUBLIC_CLIENT_EMBEDDINGS` to `env.example`.

---

## Files touched

| File | Change |
|---|---|
| `frontend/lib/snippet.ts` | new |
| `frontend/lib/search-query-prep.ts` | new |
| `frontend/lib/client-embeddings/embedding.worker.ts`, `index.ts` | new |
| `frontend/lib/services/search-service.ts` | env branch at line ~98; additive optional `queryEmbedding` param |
| `frontend/app/api/firms/[firmId]/search/route.ts` | new POST handler appended; GET untouched |
| `frontend/components/search/global-search-view.tsx` | preload calls; vector branch in `runSearch`; GET fallback untouched |
| `frontend/components/ui/top-bar.tsx` | idle preload call |
| `env.example` | two new vars |

**Explicitly untouched:** `lib/summarization.ts`, `lib/embeddings.ts`, GET handler internals, project-scoped search route, Prisma schema (no migration needed — same model, same 384 dims, no reindex required; existing vectors stay valid).

## Verification

Part 1 (index time):
1. Upload/re-sync a Google Doc or `.txt` in dev; confirm via Prisma query that `metadata.summary` is now the leading text slice.
2. Flip `SEARCH_SUMMARY_MODE=model`, re-index another file, confirm legacy distilbart path still works. Flip back.
3. Search for content words from a snippet-indexed doc; confirm it ranks.

Part 2 (query time), with dev server + preview tools:
1. Flag off → confirm GET requests only, behavior identical to today.
2. Flag on → load app, confirm model files fetched once (network tab) during idle; navigate to Doc Search; type a query; confirm POST carries `queryVector`; confirm server log shows cosine ≥ 0.999 (parity check); confirm results match the flag-off results for the same query.
3. Enrichment path: search "legal" → `embeddedText` mismatch → server logs fallback to server-side embedding; results still correct.
4. First-keystroke-before-preload race: hard-reload straight onto Doc Search and type immediately → GET fallback fires, no error.
5. Offer `npm run build` to the user (never auto-run, per CLAUDE.md).

Sign-off gate: after Deepak validates both parts, a separate follow-up may remove `summarization.ts`, dedupe the POST/GET handler, and consider WebGPU — none of that happens in this change.
