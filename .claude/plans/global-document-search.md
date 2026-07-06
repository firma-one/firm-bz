# Plan: Global Search, Share Status Redesign & Overview Metrics

## Context

Three product improvements to the engagement management platform:
1. **Global Document Search** — users need cross-engagement search (e.g. "find all legal docs for NaviQure AI"). Currently search is scoped to one project at a time, and client/engagement names are not in the vector string.
2. **Share Status Redesign** — the Kanban delivery board currently uses `to_do | in_progress | in_review | done`, which doesn't map well to the document delivery lifecycle. Replace with `ready | in_progress | in_review | approved`.
3. **Overview Metrics** — the engagement insights dashboard lacks two key KPIs: revision rounds per deliverable and approval cycle time.

---

## Feature 1: Global Document Search

### What changes

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

## Feature 2: Share Status Redesign

### Status mapping

| Old value | New value | Meaning |
|---|---|---|
| `to_do` | `ready` | Deliverable identified, not yet shared with client |
| `in_progress` | `in_progress` | Actively being coordinated (unchanged) |
| `in_review` | `in_review` | Client reviewing (unchanged) |
| `done` | `approved` | Client approved/confirmed |

### Backward compatibility

No DB migration needed — these are JSON string values in `settings.activity.status`.

**Read path**: normalize old values transparently:
```ts
const LEGACY: Record<string, ActivityStatus> = { to_do: 'ready', done: 'approved' }
const status = VALID_STATUSES.includes(raw) ? raw : LEGACY[raw] ?? 'ready'
```

**Write path**: always write new values going forward.

### Files to modify

1. [frontend/lib/sharing-settings.ts](frontend/lib/sharing-settings.ts)
   - Change `ActivityStatus = 'to_do' | 'in_progress' | 'in_review' | 'done'` → `'ready' | 'in_progress' | 'in_review' | 'approved'`
   - Add legacy normalization in `parseSettingsFromDb` (line 155)
   - Change `DEFAULT_ACTIVITY.status` from `'to_do'` to `'ready'` (line 70)

2. [frontend/app/api/projects/[projectId]/documents/[documentId]/sharing/activity/route.ts](frontend/app/api/projects/[projectId]/documents/[documentId]/sharing/activity/route.ts)
   - Update `VALID_STATUSES` to `['ready', 'in_progress', 'in_review', 'approved']`

3. [frontend/app/api/projects/[projectId]/shares/order/route.ts](frontend/app/api/projects/[projectId]/shares/order/route.ts)
   - Update body key names: `to_do → ready`, `done → approved`; accept old keys for transition

4. [frontend/app/api/projects/[projectId]/shares/route.ts](frontend/app/api/projects/[projectId]/shares/route.ts)
   - Update `statusOrder` map keys

5. [frontend/app/api/projects/[projectId]/documents/[documentId]/sharing/route.ts](frontend/app/api/projects/[projectId]/documents/[documentId]/sharing/route.ts)
   - Change default status on new share creation: `'to_do'` → `'ready'`

6. [frontend/components/projects/shares/engagement-shares-tab.tsx](frontend/components/projects/shares/engagement-shares-tab.tsx)
   - Update `ActivityStatus` type (line 52)
   - Update `LANES` array (line 121+): `to_do → ready`, `done → approved`; update labels to "Ready" / "Approved"
   - Update `CARD_ACCENT` (line 184): key rename `to_do → ready`, `done → approved`
   - Update `STATUS_LABELS` (line 591): `to_do: 'To Do'` → `ready: 'Ready'`, `done: 'Done'` → `approved: 'Approved'`
   - Update `STATUS_PILL_CLASS` (line 598)
   - Update `saveOrder` call (line 1525): `{ to_do: ..., done: ... }` → `{ ready: ..., approved: ... }`
   - Update drag-drop logic (lines 1662–1720): all `'to_do'`/`'done'` literals → `'ready'`/`'approved'`
   - Update LANES check in drag handler (line 1701)

7. [frontend/app/api/projects/[projectId]/insights/route.ts](frontend/app/api/projects/[projectId]/insights/route.ts)
   - Rename `SharesProgress.toDo` → `ready`, `done` → `approved`
   - Update counting: treat `'to_do'` and `'ready'` both as `ready`, `'done'` and `'approved'` both as `approved`

8. [frontend/components/projects/engagement-insights-dashboard.tsx](frontend/components/projects/engagement-insights-dashboard.tsx)
   - Update `SharesProgressCard` to use `sp.ready` / `sp.approved` and update labels

---

## Feature 3: Overview Metrics — Revision Rounds & Approval Cycle Time

### Data sources

- **Revision rounds**: count of `DOCUMENT_SHARE_CHANGED` audit events per document from `PlatformAuditEvent` table (already has index on `(engagementId, projectDocumentId, eventAt)`)
- **Approval cycle time**: `settings.share.finalizedAt - settings.share.createdAt` (already stored in the `settings` JSON — no new data needed)

### Files to modify

1. [frontend/app/api/projects/[projectId]/insights/route.ts](frontend/app/api/projects/[projectId]/insights/route.ts)
   - Add new interfaces: `DeliverableRevisionMetric` and `ApprovalCycleMetric`
   - Add to `Promise.all`: query `PlatformAuditEvent` where `engagementId = projectId` and `eventType IN ('DOCUMENT_SHARE_CHANGED', 'DOCUMENT_SHARE_CREATED')`, select `projectDocumentId` and `eventType`
   - Group by `projectDocumentId`, count `DOCUMENT_SHARE_CHANGED` → `revisionMetrics[]`
   - From the existing `shares` array: compute `cycleDays = finalizedAt - createdAt` for each share that has both timestamps → `approvalCycleMetric { avgCycleDays, medianCycleDays, deliverableCount, approvedCount }`
   - Add both to `EngagementInsightsResponse`

2. [frontend/components/projects/engagement-insights-dashboard.tsx](frontend/components/projects/engagement-insights-dashboard.tsx)
   - Add two new `StatTile` entries to the KPI strip:
     - "Avg Revision Rounds" — `RefreshCw` icon, violet color, shows average rounds across all deliverables
     - "Avg Approval Cycle" — `Clock` icon, color-coded (green ≤7d, amber ≤14d, red >14d)
   - Add a detail card "Revision Rounds" listing top-5 deliverables by revision count with a `×` count badge

---

## Verification

**Feature 1:**
1. Re-index a test engagement belonging to "NaviQure AI" via the admin endpoint
2. `GET /api/firm/[firmId]/search?q=NaviQure+AI` returns documents from that client
3. Global search panel shows client/engagement breadcrumbs; clicking navigates correctly

**Feature 2:**
1. New share defaults to `ready` in DB
2. Kanban board shows "Ready" and "Approved" lanes with correct icons
3. Old document with `to_do` in DB renders in "Ready" lane without errors
4. Drag from Ready → Approved saves `'approved'` to DB
5. Insights progress bar shows 4 segments including "Ready" and "Approved"

**Feature 3:**
1. Insights dashboard shows "Avg Revision Rounds" and "Avg Approval Cycle" stat tiles
2. Making `DOCUMENT_SHARE_CHANGED` audit events increments revision count for that document
3. Finalizing a share computes `avgCycleDays` correctly
4. Empty state (no shares): both tiles show `—` with placeholder sub-text
