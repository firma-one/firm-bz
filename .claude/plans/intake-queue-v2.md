# Plan: EC/EV Intake Queue — v2 (EngagementDocument-first approach)

## Why this replaces the nullable-FK plan

The nullable-FK approach (plan v1) deferred `EngagementDocument` creation to approval time. This caused:
- Complex schema changes (nullable FK, partial indexes, `as any` casts everywhere)
- Files tab needed shadow-row logic to surface items that had no doc record yet
- Approval path had to create doc + link FK — more moving parts
- Standalone file uploads were invisible on the Files tab (no doc to join to)

The v2 approach is simpler: create `EngagementDocument` immediately (same as today), but **skip Inngest indexing** until approval. The `PENDING` sharing row controls UI visibility. Indexing is the thing that makes a doc "real" in search — not the DB record.

---

## Key Design Decisions

1. **`EngagementDocument` created at upload/folder-creation time** — same as before. No schema change to `projectDocumentId` (stays NOT NULL, stays a real FK).

2. **`PENDING` on `engagementDocumentSharingUser` is the single source of truth** for intake state. No `lock.type = 'intake'` in settings.

3. **Inngest indexing deferred to approval** — `file.index.requested` never fires at upload time for EC/EV intake items.

4. **Billing cap (`assertWithinDocumentCap`) stays at folder/file creation time** — correct gate; avoids approving something that exceeds the cap with no recourse.

5. **File tree visibility**: `PENDING` rows already surface in the file tree with `isPendingApproval: true` (current linked-files behaviour). The UI shows them dimmed with Approve/Reject/Withdraw controls. No change needed to visibility logic.

6. **Folder is the unit of approval** — when EC/EV creates a folder, ONE `PENDING` sharing row is written for the folder. Files uploaded inside it are covered by the parent; they get no sharing row of their own (parent check in `index-file-intake`).

7. **On approval**: flip sharing row `PENDING → GRANTED`, generate slug, fire Inngest for the folder + all children.

8. **On reject/withdraw**: delete `EngagementDocument` (cascade deletes sharing rows), trash Drive file.

9. **`syncDocumentSharingUsers` guard**: skip auto-granting any `PENDING` row — already in place in `sync-document-sharing.ts`.

---

## Schema Changes

**None.** `EngagementDocumentSharingUser` stays as-is (projectDocumentId NOT NULL). The only schema change needed is:

```sql
ALTER TYPE "platform"."DocumentSharingPermissionStatus" ADD VALUE 'PENDING';
```

This is already in `init_platform` migration. No new columns, no nullable FK, no partial indexes.

**Revert `init_platform`** back to the original unique index and NOT NULL constraint.

---

## Files to Change

| File | Change |
|---|---|
| `prisma/schema.prisma` | Revert `projectDocumentId` to NOT NULL; remove `externalDriveId`/`fileName`/`mimeType`; restore original `@@unique([projectDocumentId, userId])` |
| `prisma/migrations/20260416120000_init_platform/migration.sql` | Revert table definition + unique index; keep `PENDING` in enum |
| `app/api/projects/[projectId]/documents/[documentId]/index-file-intake/route.ts` | Create `EngagementDocument` (upsert) + write `PENDING` sharing row; NO Inngest; parent folder check skips file if folder already has `PENDING` row |
| `app/api/connectors/google-drive/linked-files/route.ts` | After folder upsert for EC/EV: write `PENDING` sharing row; NO Inngest at creation; pending queries use `sharingUsers: { some: { sharingPermissionStatus: 'PENDING' } }` (standard Prisma, no `as any`) |
| `app/api/projects/[projectId]/documents/[documentId]/intake/route.ts` | approve: flip to GRANTED + generate slug + fire Inngest for doc + children; reject/withdraw: delete `EngagementDocument` (cascade) + trash Drive |
| `app/api/projects/[projectId]/shares/route.ts` | Query docs with `sharingUsers: { some: { sharingPermissionStatus: 'PENDING' } }` (standard Prisma join); return `pendingApproval: true` + `pendingUploaderId` |
| `lib/sync-document-sharing.ts` | Keep PENDING guard — already correct |
| `lib/types.ts` | Keep `isPendingApproval` and `uploadedByUserId` on `DriveFile`; remove 'intake' from lock type |
| `components/projects/shares/engagement-shares-tab.tsx` | Keep UI changes (pending cards, Approve/Reject/Withdraw) — no change needed |
| `components/projects/engagement-file-row.tsx` | Keep `isPendingApproval` styling + Withdraw button for EC/EV |
| `components/files/document-share-modal.tsx` | Keep Approve/Reject modal branch for `isPendingApproval` |
| `components/ui/document-action-menu.tsx` | Keep `isPendingApproval` prop passthrough |

---

## Flow

### EC/EV uploads a file

```
index-file-intake POST (externalId = Drive file ID)
  1. Check if parent folder already has PENDING sharing row for this user
     → if yes: return { ok: true, covered: true }  // folder covers it
  2. assertWithinDocumentCap (already called upstream? check — if not, call here)
  3. EngagementDocument.upsert (create the DB record — no slug, no Inngest)
  4. EngagementDocumentSharingUser.upsert { sharingPermissionStatus: PENDING }
  5. Create EL reminder
  // NO safeInngestSend
```

### EC/EV creates a folder (linked-files create-folder)

```
  1. assertWithinDocumentCap (already in place — keep it)
  2. googleDriveConnector.createDriveFile (already in place)
  3. EngagementDocument.upsert for the folder (already in place)
  4. EngagementDocumentSharingUser.upsert { sharingPermissionStatus: PENDING }
  5. Create EL reminder
  // NO safeInngestSend (move it out of this branch)
```

### EL approves (single file or folder)

```
intake PATCH { action: 'approve' | 'approve-folder' }
  documentId param = EngagementDocument.id (DB UUID, not Drive ID)

  For 'approve' (single file):
    1. Load doc; verify lock.type === 'intake'
    2. Find PENDING sharing row by projectDocumentId → get userId (uploader)
       (replaces reading lock.uploadedBy from settings JSON)
    3. Resolve uploader's engagement role → shareKey ('externalCollaborator' | 'guest' | null)
    4. engagementDocument.update { settings: clear lock + share[shareKey].enabled=true, slug: generated }
    5. engagementDocumentSharingUser.updateMany { PENDING → GRANTED }
    6. safeInngestSend('file.index.requested') — indexing fires NOW for the first time
    7. Clear notifications + EL reminders

  For 'approve-folder':
    documentId param = folder's externalId (Drive ID) ← current behaviour, keep as-is
    1. Load folderDoc by externalId
    2. Load allChildDocs where parentId = folderExternalId AND lock.type = 'intake'
    3. For folder: find PENDING sharing row → resolve uploader role → shareKey
       engagementDocument.update { clear lock + share enabled + slug }
       engagementDocumentSharingUser.updateMany { PENDING → GRANTED }
       safeInngestSend for folder
    4. For each child: same — clear lock + flip sharing row + safeInngestSend
    5. Clear notifications + EL reminders for folder + all children
```

**Key change from current code:** uploader identity now comes from `PENDING` sharing row `.userId` instead of `settings.lock.uploadedBy`. Both hold the same value — sharing row is the authoritative source going forward since we're removing the lock field.

### EL rejects / EC/EV withdraws

```
intake PATCH { action: 'reject' | 'withdraw' }   ← single file
  documentId param = EngagementDocument.id (DB UUID)

  1. Load doc + lock; verify lock.type === 'intake'
  2. For withdraw: verify lock.uploadedBy === user.id (server-enforced, not just UI)
  3. prisma.engagementDocument.delete  ← cascade deletes PENDING sharing row
  4. googleDriveConnector.trashFile    ← move to Drive trash
  5. Clear notifications + EL reminders
  // NO safeInngestSend('file.delete.requested') — never indexed, nothing to remove from search

intake PATCH { action: 'reject-folder' | 'withdraw-folder' }   ← folder
  documentId param = folder's externalId (Drive ID)  ← current behaviour, keep as-is

  1. Load folderDoc by externalId
  2. Load allChildDocs where parentId = folderExternalId AND lock.type = 'intake'
  3. For withdraw-folder: filter childDocs to lock.uploadedBy === user.id only
  4. Delete all child docs + folderDoc (cascade deletes sharing rows)
  5. Trash each Drive file (folder + children) via googleDriveConnector.trashFile
  6. Clear notifications + EL reminders for folder + all children
  // NO safeInngestSend('file.delete.requested') — never indexed
```

**Key difference from current code (lines 167-170):** the current `reject-folder` fires `file.delete.requested` Inngest for each child. Under v2 this must be removed — intake docs are never indexed so there's nothing to remove from search. Firing delete for an unindexed file is harmless but wasteful; omit it for clarity.

### Shares tab

```
shares GET
  Approved shares:
    engagementDocument.findMany { slug: { not: null } }
  
  Pending shares (folder-level only):
    engagementDocument.findMany {
      engagementId: projectId,
      isFolder: true,
      sharingUsers: { some: { sharingPermissionStatus: 'PENDING' } }
    }
    include: { sharingUsers: { where: { sharingPermissionStatus: 'PENDING' }, select: { userId: true } } }
  
  Return both merged; pending items have pendingApproval: true, pendingUploaderId: sharingUsers[0].userId
```

---

## Shares Tab UI (`engagement-shares-tab.tsx`)

### ShareRecord interface — add two fields
```ts
pendingApproval?: boolean          // true for intake queue items
pendingUploaderId?: string | null  // userId of the EC/EV who uploaded
```

### Component state — add currentUserId
```ts
const [currentUserId, setCurrentUserId] = useState<string | null>(null)

// alongside existing currentUserEmail in useEffect:
supabase.auth.getSession().then(({ data: { session } }) => {
  setCurrentUserEmail(session?.user?.email ?? null)
  setCurrentUserId(session?.user?.id ?? null)
})
```

Pass `currentUserId` into all three view components (`SharesGridView`, `SharesListView`, `DraggableCard`) and down to `ShareCardContent` and `ShareCard`.

### isOwnPending — use userId not email
```ts
const isPending = !!share.pendingApproval
const isOwnPending = isPending && !!currentUserId && share.pendingUploaderId === currentUserId
```

### Pending card styling — muted + badge
```tsx
// Card/row wrapper:
isPending ? 'opacity-60 border-dashed border-[#d1d5db]' : ''

// Name area badge:
{isPending && (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
    <Inbox size={10} /> Pending Review
  </span>
)}
```

### Action buttons — 3 locations (ShareCardContent, SharesListView row, ShareCard)

**EL sees Approve + Reject** (`canManage && isPending`):
```tsx
<button onClick={() => handleIntakeAction(share.documentId, isFolder ? 'approve-folder' : 'approve')}>
  <CheckCircle2 size={11} /> Approve
</button>
<button onClick={() => handleIntakeAction(share.documentId, isFolder ? 'reject-folder' : 'reject')}>
  <Trash2 size={11} /> Reject
</button>
```

**EC/EV uploader sees Cancel Request** (`isExternalPersona && isOwnPending`):
```tsx
<button onClick={() => handleIntakeAction(share.documentId, isFolder ? 'withdraw-folder' : 'withdraw')}>
  <X size={11} /> Cancel Request
</button>
```

`X` icon (already imported) distinguishes visually from EL's Reject (`Trash2`).
Firm Admin sees neither — guarded by `isExternalPersona` check.

### handleIntakeAction — shared handler
```ts
const handleIntakeAction = async (
  documentId: string,
  action: 'approve' | 'reject' | 'withdraw' | 'approve-folder' | 'reject-folder' | 'withdraw-folder'
) => {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`/api/projects/${projectId}/documents/${documentId}/intake`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  })
  if (res.ok) await refreshData()
  // On failure: item stays visible for retry (no toast needed)
}
```

`documentId` here is the `EngagementDocument.id` (DB UUID) — returned by the shares API as `share.documentId`.

### isFolder detection
```ts
const isFolder = share.documentMimeType?.includes('folder') ?? false
```
Used to pick `approve-folder` vs `approve`, etc.

### Hide normal sharing badges on pending cards
```tsx
{!isPending && ( /* existing "Shared with EC / Shared with Guest" badge JSX */ )}
```

---

## Complexity & Risk

| Task | Complexity | Risk |
|---|---|---|
| index-file-intake: create doc + sharing row, no Inngest | Low | Low |
| linked-files: remove Inngest from EC/EV folder path; add sharing row; `isFolder: true` on pending queries | Low | Medium — hot path |
| intake/route.ts: approve fires Inngest; reject deletes doc | Low | Low |
| shares/route.ts: pending query via sharingUsers join + pendingUploaderId | Low | Low |
| sync-document-sharing.ts: guard already in place | None | None |
| Shares tab UI: pendingApproval cards, Approve/Reject/Cancel Request | Medium | Low — additive |

**Total complexity: significantly lower than v1.** No nullable FK, no partial indexes, no `as any` casts, standard Prisma queries throughout.

---

## Key Difference from v1

| | v1 (nullable FK) | v2 (doc-first) |
|---|---|---|
| Schema change | Major (nullable FK, new cols, partial indexes) | Minimal (enum value only) |
| `EngagementDocument` created | At approval time | At upload time |
| Inngest fires | At approval time | At approval time ✓ same |
| Billing cap | At approval time | At upload/creation time |
| Files tab shadow rows | Complex (no doc to join) | Natural (doc exists) |
| `as any` casts | Many (new columns not in client) | None |
| Prisma queries | Non-standard (`as any`) | Standard |
| Reject flow | Delete sharing row only | Delete doc (cascade) |

---

## Analytics Page — Action Centre Card

On `/analytics`, add a card in the action centre (or equivalent summary section) for ELs that shows the count of pending intake items and links to the Shares tab.

**Data source:** same query as shares API pending items —
```ts
engagementDocument.count({
  where: {
    engagementId: projectId,
    isFolder: true,
    sharingUsers: { some: { sharingPermissionStatus: 'PENDING' } },
  },
})
```

**Card behaviour:**
- Only visible to EL (`canManage`) — EC/EV don't action from analytics
- Shows count: "3 items pending review"
- Clicking the card or a "Review" link navigates to the Shares tab (`/.../{projectSlug}/shares`) — filtered to pending if the Shares tab supports a `?filter=pending` param, otherwise just lands on the Shares tab (pending items already appear at top)
- Always visible to EL, even when count is 0 — shows "0 items pending review"

**File to change:** identify the analytics page component and the existing action centre pattern — add this as a new card alongside others (e.g. overdue items, unread comments).

---

## Implementation Order

1. Revert schema.prisma + init_platform migration (restore NOT NULL + original unique index)
2. `sync-document-sharing.ts` guard — already done, keep
3. `index-file-intake/route.ts` — create doc + PENDING row, no Inngest
4. `linked-files/route.ts` — remove Inngest from EC/EV folder creation; add PENDING row; fix pending queries to use standard Prisma sharingUsers join
5. `intake/route.ts` — approve fires Inngest; reject/withdraw deletes doc (no Inngest delete); uploader identity from sharing row not lock
6. `shares/route.ts` — query pending docs via sharingUsers join; return pendingApproval + pendingUploaderId
7. `engagement-shares-tab.tsx` — ShareRecord fields; currentUserId state; Approve/Reject/Cancel Request buttons
8. Analytics page — action centre card for pending intake count + link to Shares tab
9. `npm run build` — TS check + migration applied

---

## Verification

1. EC/EV uploads file → `EngagementDocument` created (no slug, no Inngest) + `PENDING` sharing row
2. EC/EV creates folder → same; files inside → no sharing rows (parent check)
3. Files tab (EL) → pending folder appears dimmed with `isPendingApproval: true`
4. Files tab (EC/EV) → sees own pending item dimmed
5. Shares tab (EL) → pending folder card appears with **Approve** + **Reject** buttons
6. Shares tab (EC/EV uploader) → sees own pending with **Cancel Request** button only
7. Shares tab (Firm Admin) → sees pending card but no action buttons
8. Approve → sharing row GRANTED + lock cleared + slug set + Inngest fires → appears in search
9. Reject (EL) → doc + sharing row deleted (cascade) + Drive file trashed + no Inngest delete
10. Cancel Request (EC/EV) → same as reject; server verifies lock.uploadedBy === user.id
11. Reject-folder → folder doc + all child docs deleted + all Drive files trashed + no Inngest delete
12. Analytics page (EL) → pending intake count card visible; clicking navigates to Shares tab
13. Analytics page (EL, 0 pending) → card still visible showing "0 items pending review"
14. `syncDocumentSharingUsers` fires → skips PENDING rows, no premature GRANTED
15. `npm run build` passes with zero TypeScript errors
