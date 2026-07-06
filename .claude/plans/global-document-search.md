# Plan: Global Document Search

## Context

Users need cross-engagement search (e.g. "find all legal docs for NaviQure AI"). Currently search is scoped to one project at a time, and client/engagement names are not in the vector string.

---

## What changes

**Embedding pipeline** — include client name and engagement title in the vector string so semantic search can match on them.

- `prepareTextForEmbedding` in [frontend/lib/embeddings.ts](frontend/lib/embeddings.ts): add optional `clientName` and `engagementTitle` params
  ```ts
  `File: ${fileName} | Client: ${clientName} | Engagement: ${engagementTitle} | Summary: ${summary}`
  ```
- `SearchService.indexFile` in [frontend/lib/services/search-service.ts](frontend/lib/services/search-service.ts): add `clientName?` and `engagementTitle?` to params; pass through to `prepareTextForEmbedding`
- All callers of `indexFile` / `indexBatch`: look up and pass both names. Primary caller: [frontend/app/api/projects/[projectId]/index-project/route.ts](frontend/app/api/projects/[projectId]/index-project/route.ts) already fetches `project` with `client` — add the two fields there. Check other callers (import route, index-file route).

**Re-indexing existing documents** — create a one-time admin endpoint:
- New file: `frontend/app/api/admin/reindex-firm-documents/route.ts`
- `POST /api/admin/reindex-firm-documents` with `{ firmId }` body
- Query all `EngagementDocument` rows for the firm, batch-resolve `engagement.name` and `client.name`, regenerate embeddings, update `embedding` column via raw SQL (`UPDATE ... SET embedding = $1::vector WHERE id = $2::uuid`)

**Global search API** — new firm-scoped route:
- New file: `frontend/app/api/firm/[firmId]/search/route.ts`
- `GET /api/firm/[firmId]/search?q=&limit=30`
- Auth: firm member only
- Call `SearchService.searchSimilarityHierarchy({ organizationId: firmId })` (no `clientId`/`projectId`) for firm-wide vector search
- Batch-enrich results: `prisma.engagement.findMany({ where: { id: { in: engagementIds } }, include: { client: true } })` to get `engagementTitle`, `clientName`, `clientSlug`, `engagementSlug`
- Return: `{ files: [{ externalId, fileName, engagementTitle, clientName, clientSlug, engagementSlug, score, mimeType }] }`

**Global search UI** — new component:
- New file: `frontend/components/search/global-search-panel.tsx`
- Reuses the look of `EngagementSearchPanel` but calls the firm-level API
- Result rows show `clientName / engagementTitle` breadcrumb
- Clicking navigates to `/d/f/${orgSlug}/c/${clientSlug}/e/${engagementSlug}/files#doc-file:${externalId}`

**Entry point** — wire into the firm-level nav or as a dedicated page:
- New file: `frontend/app/(app)/d/f/[slug]/search/page.tsx` — simplest approach, hosts `GlobalSearchPanel` full-page

---

## Verification

1. Re-index a test engagement belonging to "NaviQure AI" via the admin endpoint
2. `GET /api/firm/[firmId]/search?q=NaviQure+AI` returns documents from that client
3. Global search panel shows client/engagement breadcrumbs; clicking navigates correctly
</content>
