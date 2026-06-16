# Plan: Intake — "Cancel Request" for Uploader + Folder-as-Unit-of-Approval

## Context

Two related problems addressed together:

**Problem 1 — No cancel for uploader.**
When an EC/EV uploads a file, a `PENDING_APPROVAL` row is written to `engagement_document_sharing_users` with their `userId`. The Shares tab shows the pending card but the uploader sees no "Cancel Request" button. The Withdraw button is gated on `isOwnPending = share.createdByEmail === currentUserEmail`, which always fails because `EngagementDocument.createdBy` is `null` for intake uploads — `index-file-intake/route.ts` never sets it. The fix is to use `pendingUploaderId` (from the sharing row's `userId`) compared against the session user's `id`.

**Problem 2 — Folder + file appear as two separate intake cards.**
When EC/EV creates a folder and uploads files inside it, both the folder and each file get their own `PENDING_APPROVAL` sharing row and appear as separate cards on the Shares tab. EL must act on all of them individually, and approving a file before its folder leaves an orphaned folder card. The fix: make the **folder the unit of approval**. Only the folder gets a `PENDING_APPROVAL` row; files inside it are never surfaced as separate intake cards. EL approves/rejects the whole folder in one action (the existing `approve-folder` endpoint already handles this correctly).

---

## Design Decisions

- `PENDING_APPROVAL` rows on files inside a pending intake folder are redundant. The folder row is the canonical intake handle.
- Files uploaded directly to the General folder (no intake subfolder) keep their own `PENDING_APPROVAL` row — single-file intake still works.
- EL cannot cherry-pick individual files within a folder — acceptable tradeoff.
- The existing `approve-folder` / `reject-folder` / `withdraw-folder` actions on `intake/route.ts` require no changes.
- Server-side security for withdraw is unchanged: `intake/route.ts` checks `pendingRow.userId !== user.id`.

---

## Changes

### A — `index-file-intake/route.ts` — redirect `PENDING_APPROVAL` row to parent folder

**Complexity: Low | Risk: Medium (timing race — mitigated by B)**

After the `engagementDocument` upsert resolves `docId`, look up whether the file's `parentId` points to an already-indexed intake folder. If so, put the `PENDING_APPROVAL` row on the **folder** instead of the file.

```ts
// Determine where to attach the PENDING_APPROVAL row — prefer the parent folder
const parentExternalId = (driveMeta as any).parents?.[0] ?? null
let pendingTargetId = docId  // default: the file itself

if (parentExternalId) {
  const parentDoc = await prisma.engagementDocument.findFirst({
    where: { engagementId: projectId, externalId: parentExternalId, isFolder: true },
    select: { id: true },
  })
  if (parentDoc) {
    pendingTargetId = parentDoc.id
  }
}

await prisma.engagementDocumentSharingUser.upsert({
  where: { projectDocumentId_userId: { projectDocumentId: pendingTargetId, userId: user.id } },
  create: { projectDocumentId: pendingTargetId, engagementId: projectId, userId: user.id, email: user.email ?? '', sharingPermissionStatus: 'PENDING_APPROVAL' },
  update: { sharingPermissionStatus: 'PENDING_APPROVAL' },
})
```

**Race condition:** If the file is indexed before the folder record exists, the row goes on the file temporarily. Change B cleans this up the next time linked-files runs for that folder.

---

### B — `linked-files/route.ts` (folder upsert) — clean up child file-level rows

**Complexity: Low | Risk: Low**

After the folder's `PENDING_APPROVAL` row is upserted (already in place), add a cleanup step to delete any `PENDING_APPROVAL` rows that landed on child files due to the race in A:

```ts
// Remove any file-level PENDING_APPROVAL rows now that the folder is the intake unit
await prisma.engagementDocumentSharingUser.deleteMany({
  where: {
    engagementId: projectId,
    sharingPermissionStatus: 'PENDING_APPROVAL',
    projectDocument: {
      engagementId: projectId,
      parentId: folderExternalId,  // children of this folder
      isFolder: false,
    },
  },
})
```

This runs every time a folder is created/re-indexed, so the system self-heals regardless of race order.

---

### C — `linked-files/route.ts` (pending queries) — scope to folders only

**Complexity: Low | Risk: Low**

Add `isFolder: true` to both pending queries so file-level orphan rows (from the race window) never surface in the UI:

**EC/EV own-pending query (Query A, ~line 353):**
```ts
where: {
  engagementId: engagementContext.projectId,
  parentId: folderId,
  isFolder: true,   // ← add
  sharingUsers: { some: { userId: user.id, sharingPermissionStatus: 'PENDING_APPROVAL' } },
}
```

**EL all-pending query (Query B, ~line 470):**
```ts
where: {
  engagementId: bodyEngagementId,
  parentId: folderId,
  isFolder: true,   // ← add
  sharingUsers: { some: { sharingPermissionStatus: 'PENDING_APPROVAL' } },
}
```

---

### D — Shares API (`shares/route.ts`) — scope pending OR arm to folders + add `pendingUploaderId`

**Complexity: Low | Risk: Low**

Two changes in the Prisma query and response transform:

**Query — add `isFolder: true` to the pending arm:**
```ts
OR: [
  { slug: { not: null } },
  { isFolder: true, sharingUsers: { some: { sharingPermissionStatus: 'PENDING_APPROVAL' } } },
]
```

**Response transform — add `pendingUploaderId`** (no Prisma change needed, `userId` already selected):
```ts
pendingApproval: (share as any).sharingUsers?.some(
  (u: any) => u.sharingPermissionStatus === 'PENDING_APPROVAL'
) ?? false,
pendingUploaderId: (share as any).sharingUsers?.find(
  (u: any) => u.sharingPermissionStatus === 'PENDING_APPROVAL'
)?.userId ?? null,
```

---

### E — `ShareRecord` interface (`engagement-shares-tab.tsx`)

Add:
```ts
pendingUploaderId?: string | null
```

---

### F — Main component state (`EngagementSharesTab`)

Add `currentUserId` alongside the existing `currentUserEmail` (keep email for `by_me`/`by_others` filters):

```ts
const [currentUserId, setCurrentUserId] = useState<string | null>(null)

// in useEffect:
supabase.auth.getSession().then(({ data: { session } }) => {
  setCurrentUserEmail(session?.user?.email ?? null)
  setCurrentUserId(session?.user?.id ?? null)
})
```

Pass `currentUserId` to all three view components (`SharesGridView`, `SharesListView`, `DraggableCard`) and thread through to `ShareCardContent` and `ShareCard`.

---

### G — Component signatures (5 components)

Add `currentUserId?: string | null` to props type + destructuring in:
- `ShareCardContent`
- `SharesListView`
- `ShareCard`
- `SharesGridView`
- `DraggableCard`

---

### H — `isOwnPending` fix + "Cancel Request" label (3 locations)

In `ShareCardContent`, list row in `SharesListView`, and `ShareCard`:

**`isOwnPending` — replace email comparison with userId:**
```ts
// Before:
const isOwnPending = isPending && !!currentUserEmail && share.createdByEmail === currentUserEmail
// After:
const isOwnPending = isPending && !!currentUserId && share.pendingUploaderId === currentUserId
```

**Button label — rename Withdraw → Cancel Request, swap icon:**
```tsx
// Before:
<Trash2 size={11} /> Withdraw
// After:
<X size={11} /> Cancel Request
```

`X` is already imported in the file; distinguishes visually from EL's "Reject" (`Trash2`).

Guard `isExternalPersona && isOwnPending` is unchanged — admins don't see Cancel Request.

---

## Files Changed

| File | Change |
|---|---|
| `app/api/projects/[projectId]/documents/[documentId]/index-file-intake/route.ts` | Redirect `PENDING_APPROVAL` row to parent folder when folder already indexed |
| `app/api/connectors/google-drive/linked-files/route.ts` | Cleanup child file-level rows after folder upsert; add `isFolder: true` to both pending queries |
| `app/api/projects/[projectId]/shares/route.ts` | `isFolder: true` on pending OR arm; add `pendingUploaderId` to response |
| `components/projects/shares/engagement-shares-tab.tsx` | `ShareRecord.pendingUploaderId`; `currentUserId` state; thread through 5 components; fix `isOwnPending`; rename button to "Cancel Request" |

`intake/route.ts` — **no changes**. Server-side auth for withdraw is already correct.

---

## Complexity & Risk

| Task | Complexity | Risk |
|---|---|---|
| A — Redirect row to parent folder | Low | Medium — race if folder not yet indexed; mitigated by B |
| B — Cleanup child file-level rows | Low | Low — `deleteMany` is idempotent |
| C — `isFolder: true` on linked-files queries | Low | Low — purely additive filter |
| D — Shares API folder filter + `pendingUploaderId` | Low | Low — additive |
| E–H — UI: Cancel Request button | Low | Low — additive; server auth unchanged |

---

## Verification

1. **Folder + file upload (EC/EV)** → Shares tab shows **one** pending card (the folder only), not two
2. **Folder card** → uploader sees "Cancel Request"; EL sees Approve + Reject
3. **Cancel Request** → folder card disappears, Drive file + folder trashed
4. **EL Approve folder** → folder + all children approved in one shot (existing `approve-folder` behaviour)
5. **Single file upload to General folder** → file-level pending card still appears correctly (no parent intake folder)
6. **EL view** → no file-level phantom cards from race window
7. **Firm Admin view** → no Cancel Request visible (not `isExternalPersona`)
