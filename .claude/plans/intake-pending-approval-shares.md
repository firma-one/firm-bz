# Plan: Intake PENDING_APPROVAL — Shares Tab as EL Queue

**Priority:** VERY HIGH  
**Tracked in:** `docs/mvp/todo.md` → Document Intake (add sub-item)

---

## Problem

When an EC/EV uploads a file (intake), the Engagement Lead (EL) must navigate into each individual folder, apply the "Pending Review" People filter, find the file, and then approve or reject it. There is no single view showing all pending intakes across the engagement.

The approved files already land in the Shares tab — so the Shares tab is the natural home for a pre-approval "pending" queue.

---

## Proposed Solution

Add a `PENDING_APPROVAL` status to `DocumentSharingPermissionStatus`. When an EC/EV uploads an intake file, immediately create an `engagement_document_sharing_users` row with `PENDING_APPROVAL`. The Shares tab shows these rows in a muted/lighter style with inline Approve / Reject actions. On approval the row flips to `GRANTED` and the document gets its `slug` (normal Shares flow). On rejection the row is deleted along with the DB doc record (same as today).

This makes the Shares tab the canonical EL intake queue — no folder navigation required.

---

## Data Model Changes

### 1. Prisma enum — add `PENDING_APPROVAL`

```prisma
// frontend/prisma/schema.prisma
enum DocumentSharingPermissionStatus {
  PENDING_APPROVAL   // ← new: intake upload awaiting EL review
  GRANTED
  REVOKED

  @@schema("platform")
}
```

Migration: `npx prisma migrate dev --name add_pending_approval_sharing_status --create-only`

No column-type change needed — Postgres enum ALTER is additive.

---

## Upload Path Changes

**File:** `frontend/app/api/connectors/google-drive/linked-files/route.ts`

When an EC/EV uploads a file and the `EngagementDocument` row is created with `lock.type = 'intake'`, immediately create an `engagement_document_sharing_users` row:

```ts
await prisma.engagementDocumentSharingUser.create({
  data: {
    projectDocumentId: newDoc.id,
    engagementId: bodyEngagementId,
    userId: user.id,
    email: user.email,
    sharingPermissionStatus: 'PENDING_APPROVAL',
  },
})
```

This applies to both file uploads (existing path) and folder creation (the folder-level upsert block at ~line 637).

---

## Approval / Rejection Path Changes

**File:** `frontend/app/api/projects/[projectId]/documents/[documentId]/intake/route.ts`

### `approve` action (single file)
After updating `EngagementDocument.settings` (clearing lock, setting share flag, generating slug), **update** the existing sharing row instead of relying on downstream sync:

```ts
await prisma.engagementDocumentSharingUser.updateMany({
  where: { projectDocumentId: doc.id, sharingPermissionStatus: 'PENDING_APPROVAL' },
  data: { sharingPermissionStatus: 'GRANTED' },
})
```

### `reject` / `withdraw` action (single file)
`EngagementDocument.delete()` already cascade-deletes sharing rows via the FK — no extra change needed.

### `approve-folder` action
After clearing child doc locks, also flip sharing rows for all child docs:

```ts
await prisma.engagementDocumentSharingUser.updateMany({
  where: {
    projectDocumentId: { in: childDocs.map(d => d.id) },
    sharingPermissionStatus: 'PENDING_APPROVAL',
  },
  data: { sharingPermissionStatus: 'GRANTED' },
})
```

### `reject-folder` / `withdraw-folder`
Cascade delete handles sharing rows — no extra change.

---

## Shares Tab Changes

**File:** `frontend/app/api/projects/[projectId]/shares/route.ts`

Include documents where any sharing user has `PENDING_APPROVAL` status in addition to those with `slug != null`:

```ts
// Current: where: { slug: { not: null } }
// New: include docs that have PENDING_APPROVAL sharing rows too
where: {
  engagementId: projectId,
  OR: [
    { slug: { not: null } },
    { sharingUsers: { some: { sharingPermissionStatus: 'PENDING_APPROVAL' } } },
  ],
}
```

Return a `pendingApproval: boolean` flag per document so the UI can style them differently.

**File:** `frontend/components/projects/shares/engagement-shares-tab.tsx`

- Render `PENDING_APPROVAL` documents in a muted/greyed style (lighter background, dimmed text, "Pending Review" badge)
- Show inline **Approve** and **Reject** buttons (calls the existing intake PATCH endpoint)
- On approve: the row transitions to normal Shares style in place (optimistic update)
- On reject: row disappears from the list
- EL sees all pending intakes across all folders in one place — no folder navigation needed

---

## syncDocumentSharingUsers Guard

**File:** `frontend/lib/sync-document-sharing.ts`

`syncDocumentSharingUsers()` runs on sharing-enabled/disabled events and must not overwrite `PENDING_APPROVAL` rows with `GRANTED` (that would bypass the intake gate):

```ts
// When creating/updating sharing rows, skip rows already in PENDING_APPROVAL
await prisma.engagementDocumentSharingUser.upsert({
  ...
  update: {
    // Only update if not PENDING_APPROVAL
    sharingPermissionStatus: { not: 'PENDING_APPROVAL' } // use conditional or JS guard
  },
})
```

In practice: add a JS guard before the upsert — if an existing row has `PENDING_APPROVAL`, skip it.

---

## Files Tab — No Change Required

The existing "Pending Review" People filter (`filterShared === 'pending_intake'` → `f.lock?.type === 'intake'`) can remain as-is. It still works per-folder for ELs who prefer browsing. The Shares tab now provides the cross-folder queue view.

---

## Implementation Order

1. **Migration** — add `PENDING_APPROVAL` to enum, generate migration file  
2. **Upload path** — create `PENDING_APPROVAL` sharing row on EC/EV intake upload (files + folders)  
3. **Approval path** — flip row to `GRANTED` on approve; cascade handles reject/withdraw  
4. **Shares API** — include `PENDING_APPROVAL` docs in response with `pendingApproval` flag  
5. **Shares UI** — muted style + Approve/Reject inline actions for `PENDING_APPROVAL` rows  
6. **syncDocumentSharingUsers guard** — skip rows already in `PENDING_APPROVAL`  

---

## Files Affected

| File | Change |
|---|---|
| `frontend/prisma/schema.prisma` | Add `PENDING_APPROVAL` to enum |
| `frontend/prisma/migrations/…` | New migration file |
| `frontend/app/api/connectors/google-drive/linked-files/route.ts` | Create sharing row on intake upload |
| `frontend/app/api/projects/[projectId]/documents/[documentId]/intake/route.ts` | Flip/cascade sharing row on approve/reject |
| `frontend/app/api/projects/[projectId]/shares/route.ts` | Include PENDING_APPROVAL docs |
| `frontend/components/projects/shares/engagement-shares-tab.tsx` | Muted style + Approve/Reject UI |
| `frontend/lib/sync-document-sharing.ts` | Guard against overwriting PENDING_APPROVAL |

---

## Out of Scope

- Moving intake state fully to `engagement_document_sharing_users` (lock.type stays as the authoritative pending marker for the Files tab filter and Drive-side logic)
- Changes to reject/withdraw logic (cascade already handles cleanup)
- Notifications / reminders (no change — reminders already fire on upload)
