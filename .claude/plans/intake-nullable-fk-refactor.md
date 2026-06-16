# Plan: Intake Queue — Nullable FK Refactor

## Why This Change

The current intake implementation forces an `EngagementDocument` record to exist before writing a `PENDING_APPROVAL` sharing row, because `engagementDocumentSharingUser.projectDocumentId` is a required FK. This means:

- A document is created in DB **before EL approves it** — wrong conceptually
- Billing cap is charged at submission time, not approval time
- Inngest indexing fires for files that may never get approved
- Race conditions between file indexing and folder indexing require complex cleanup logic
- Two rows (folder + file) can exist in `engagement_document_sharing_users` for the same intake event

The correct model: the intake queue row should be able to exist **without** an `EngagementDocument`. `projectDocumentId` should be nullable (PostgreSQL fully supports nullable FKs — the FK is still enforced when the value is non-null). A new `externalDriveId` column holds the Drive file ID until approval. On EL approval, the `EngagementDocument` is created, `projectDocumentId` is set, and indexing fires.

---

## Rollback First — What to Remove

All of the following was added in the current session and must be cleanly removed before the new approach is applied:

### A. `index-file-intake/route.ts`
- Remove all `EngagementDocument` create/lookup logic (lines 33–91) — the entire connector/project/Inngest boilerplate was added only because we needed a doc ID for the FK
- Remove `pendingTargetId` parent-folder redirect logic (lines 94–109)
- Remove `safeInngestSend('file.index.requested', ...)` call — indexing should not fire at intake submission
- Keep: role check, user auth, reminder creation for ELs
- New behavior: just write `engagementDocumentSharingUser` with `projectDocumentId = NULL`, `externalDriveId = externalId`

### B. `linked-files/route.ts`
- Remove `isFolder: true` guard on EC/EV pending query (line ~351) — with new schema, intake rows are queried from `engagementDocumentSharingUser` directly, not via `engagementDocument`
- Remove `isFolder: true` guard on EL pending query (line ~468)
- Remove PENDING_APPROVAL upsert after folder creation (lines ~676–686)
- Remove child file-level row cleanup `deleteMany` block (lines ~689–703)
- Keep: folder `EngagementDocument` upsert itself — the folder still needs a DB record for the Files tab; just don't write the PENDING_APPROVAL sharing row from here

### C. `shares/route.ts`
- Remove `isFolder: true` from the pending OR arm — with new schema, pending rows live in the sharing table directly, not discovered by querying `engagementDocument`
- The Shares tab query for pending items will change entirely (see New Approach below)
- Keep: `pendingUploaderId` in response (still needed), `pendingApproval` flag

### D. `sync-document-sharing.ts`
- Keep both `PENDING_APPROVAL` guards — these are protective and correct regardless of approach

### E. Prisma schema (migration)
- Remove `PENDING_APPROVAL` from `DocumentSharingPermissionStatus` enum — **only if** no rows exist in prod. Since this is pre-production, we can do a clean migration.
- Actually: keep `PENDING_APPROVAL` in the enum, just make `projectDocumentId` nullable and add `externalDriveId`

---

## New Approach — Schema First

### Migration: `add_intake_queue_nullable_fk`

Changes to `EngagementDocumentSharingUser`:

```sql
-- Make projectDocumentId nullable
ALTER TABLE platform.engagement_document_sharing_users
  ALTER COLUMN "projectDocumentId" DROP NOT NULL;

-- Add externalDriveId to hold Drive file/folder ID before approval
ALTER TABLE platform.engagement_document_sharing_users
  ADD COLUMN "externalDriveId" TEXT;

-- Add fileName for display in the Shares tab pending list (no doc record to join to)
ALTER TABLE platform.engagement_document_sharing_users
  ADD COLUMN "fileName" TEXT;

-- Add mimeType so we know if it's a folder before doc record exists
ALTER TABLE platform.engagement_document_sharing_users
  ADD COLUMN "mimeType" TEXT;

-- The unique constraint [projectDocumentId, userId] must change:
-- When projectDocumentId is NULL, uniqueness is on (externalDriveId, userId, engagementId)
DROP INDEX platform.engagement_document_sharing_users_projectDocumentId_userId_key;
-- New partial unique indexes:
CREATE UNIQUE INDEX edsu_doc_user_unique
  ON platform.engagement_document_sharing_users ("projectDocumentId", "userId")
  WHERE "projectDocumentId" IS NOT NULL;
CREATE UNIQUE INDEX edsu_drive_user_unique
  ON platform.engagement_document_sharing_users ("externalDriveId", "userId", "engagementId")
  WHERE "projectDocumentId" IS NULL;
```

### Prisma Schema changes

```prisma
model EngagementDocumentSharingUser {
  id                      String                          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  createdAt               DateTime                        @default(now())
  updatedAt               DateTime                        @updatedAt
  createdBy               String?                         @db.Uuid
  updatedBy               String?                         @db.Uuid
  projectDocumentId       String?                         @db.Uuid   // nullable — null when PENDING_APPROVAL (pre-approval)
  externalDriveId         String?                                     // Drive file/folder ID — set when pending, cleared on approval
  fileName                String?                                     // display name before doc record exists
  mimeType                String?                                     // folder detection before doc record exists
  engagementId            String                          @db.Uuid
  userId                  String                          @db.Uuid
  email                   String
  connectorPermissionId   String?
  sharingPermissionStatus DocumentSharingPermissionStatus @default(GRANTED)

  document   EngagementDocument? @relation(fields: [projectDocumentId], references: [id], onDelete: Cascade)
  engagement Engagement          @relation(fields: [engagementId], references: [id], onDelete: Cascade)

  // Two partial unique indexes (handled in migration SQL, not expressible in Prisma directly)
  @@map("engagement_document_sharing_users")
  @@schema("platform")
}
```

---

## New Approach — Flow

### Intake Submission (`index-file-intake/route.ts`)

**File upload:**
```ts
// 1. Auth + role check (EC/EV only) — unchanged
// 2. Check if parent folder already has a PENDING_APPROVAL row for this user
//    → if yes, skip (folder is the intake unit, file is covered)
// 3. Write sharing row with projectDocumentId = NULL:
await prisma.engagementDocumentSharingUser.upsert({
  where: { externalDriveId_userId_engagementId: { externalDriveId: externalId, userId: user.id, engagementId: projectId } },
  create: {
    externalDriveId: externalId,
    fileName: <from Drive metadata>,
    mimeType: <from Drive metadata>,
    engagementId: projectId,
    userId: user.id,
    email: user.email ?? '',
    sharingPermissionStatus: 'PENDING_APPROVAL',
    // projectDocumentId is NULL — no doc record yet
  },
  update: { sharingPermissionStatus: 'PENDING_APPROVAL' },
})
// 4. Create EL reminders — unchanged
// NO: EngagementDocument.create
// NO: safeInngestSend
// NO: assertWithinDocumentCap (deferred to approval)
```

**Parent folder check:** before writing the row, look up whether the Drive parent folder ID already has a PENDING_APPROVAL sharing row for this user (query by `externalDriveId` on the sharing table):
```ts
const parentDriveId = await getParentDriveId(externalId, connector) // one Drive API call
if (parentDriveId) {
  const parentPending = await prisma.engagementDocumentSharingUser.findFirst({
    where: { externalDriveId: parentDriveId, userId: user.id, sharingPermissionStatus: 'PENDING_APPROVAL' },
  })
  if (parentPending) return NextResponse.json({ ok: true }) // folder covers it
}
```

### Folder creation (`linked-files/route.ts`)

When EC/EV creates a folder via Drive sync, write the intake row with `projectDocumentId = NULL`:
```ts
await prisma.engagementDocumentSharingUser.upsert({
  where: { externalDriveId_userId_engagementId: { externalDriveId: newFile.id, userId: user.id, engagementId: projectId } },
  create: {
    externalDriveId: newFile.id as string,
    fileName: name,
    mimeType: 'application/vnd.google-apps.folder',
    engagementId: bodyEngagementId as string,
    userId: user.id,
    email: user.email ?? '',
    sharingPermissionStatus: 'PENDING_APPROVAL',
  },
  update: { sharingPermissionStatus: 'PENDING_APPROVAL' },
})
// NO child cleanup needed — files never get their own rows if parent folder covers them
```

The folder `EngagementDocument` record is still created (same as today) — needed for the Files tab to show the folder. The sharing row for the folder just no longer needs `projectDocumentId`.

### EL Approval (`intake/route.ts`)

**approve (file):**
```ts
// 1. Find the PENDING_APPROVAL row by externalDriveId
const pendingRow = await prisma.engagementDocumentSharingUser.findFirst({
  where: { externalDriveId: externalDriveId, engagementId: projectId, sharingPermissionStatus: 'PENDING_APPROVAL' },
})

// 2. Assert billing cap NOW (approval time, not submission time)
await assertWithinDocumentCap(firmId, 1)

// 3. Create the EngagementDocument record
const doc = await prisma.engagementDocument.create({ ... from pendingRow.fileName/mimeType + Drive metadata ... })

// 4. Update sharing row: set projectDocumentId, flip to GRANTED
await prisma.engagementDocumentSharingUser.update({
  where: { id: pendingRow.id },
  data: { projectDocumentId: doc.id, externalDriveId: null, sharingPermissionStatus: 'GRANTED' },
})

// 5. Trigger Inngest indexing
await safeInngestSend('file.index.requested', { ... })
```

**approve-folder:**
- Same pattern but for folder + all children sharing rows that have `externalDriveId` pointing to files inside the folder
- Folder `EngagementDocument` already exists (created at folder-creation time)
- Just need to create `EngagementDocument` records for each child file and link them

**reject / withdraw:**
```ts
// No EngagementDocument to delete — just delete the sharing row
await prisma.engagementDocumentSharingUser.delete({ where: { id: pendingRow.id } })
// Trash Drive file
await connector.trashFile(externalDriveId)
```
Much simpler — no cascade needed.

### Shares API (`shares/route.ts`)

**Pending items** no longer come from querying `engagementDocument` — query `engagementDocumentSharingUser` directly:
```ts
// Approved shares (existing query)
const approvedShares = await prisma.engagementDocument.findMany({
  where: { engagementId: projectId, slug: { not: null } },
  include: { sharingUsers: { ... } },
})

// Pending intake items (new query — from sharing table directly)
const pendingRows = await prisma.engagementDocumentSharingUser.findMany({
  where: {
    engagementId: projectId,
    sharingPermissionStatus: 'PENDING_APPROVAL',
    projectDocumentId: null,           // pre-approval rows only
    mimeType: { contains: 'folder' },  // folder is the unit of approval
  },
})
```

Merge both into the shares response. Pending items use `externalDriveId` as the document identifier, `fileName`/`mimeType` from the sharing row itself.

### Files Tab (`linked-files/route.ts`)

EC/EV pending query: query `engagementDocumentSharingUser` directly for rows with `userId = user.id`, `sharingPermissionStatus = PENDING_APPROVAL`, `projectDocumentId IS NULL`, then join to `engagementDocument` via `externalDriveId` if the doc exists (for folder). Surface as shadow rows.

EL pending query: same but without `userId` filter.

---

## Files Changed

| File | Change |
|---|---|
| `prisma/schema.prisma` | `projectDocumentId` nullable, add `externalDriveId`, `fileName`, `mimeType` to `EngagementDocumentSharingUser` |
| `prisma/migrations/...` | SQL migration for nullable FK + new columns + new unique indexes |
| `app/api/projects/[projectId]/documents/[documentId]/index-file-intake/route.ts` | Remove EngagementDocument create; write sharing row with null projectDocumentId; add parent-folder check |
| `app/api/projects/[projectId]/documents/[documentId]/intake/route.ts` | On approve: create EngagementDocument + set projectDocumentId + fire Inngest; on reject/withdraw: delete sharing row only |
| `app/api/projects/[projectId]/shares/route.ts` | Query pending items from sharing table directly (not via engagementDocument) |
| `app/api/connectors/google-drive/linked-files/route.ts` | Write folder intake row with null projectDocumentId; query pending items from sharing table; remove child cleanup |
| `lib/sync-document-sharing.ts` | Guards unchanged |
| `components/projects/shares/engagement-shares-tab.tsx` | `pendingUploaderId` stays; `documentId` for pending items becomes `externalDriveId` |
| `components/projects/engagement-file-row.tsx` | `isPendingApproval` stays; source changes |
| `components/files/document-share-modal.tsx` | No change to UI; intake action target changes |
| `components/ui/document-action-menu.tsx` | No change |

---

## Complexity & Risk

| Task | Complexity | Risk |
|---|---|---|
| Schema migration (nullable FK + new cols) | Low | Low — additive; nullable FK is safe |
| Rollback current `index-file-intake` | Low | Low — simplification |
| Rollback `linked-files` intake writes | Low | Low — remove cleanup logic |
| New approval flow (create doc on approve) | Medium | Medium — billing + Inngest now in approve path |
| Shares API query rewrite | Medium | Low — isolated to this endpoint |
| linked-files pending query rewrite | Medium | Medium — touches file listing backbone |
| Frontend: no change to UI logic | Low | Low — only data source changes |

---

## Implementation Order

1. Rollback all current intake code (clean slate — no mixed approach)
2. Prisma schema + migration (`--create-only`)
3. `index-file-intake` — new simple write
4. `linked-files` — folder intake row (null FK) + pending queries from sharing table
5. `intake/route.ts` — approve creates EngagementDocument + fires Inngest
6. `shares/route.ts` — pending query from sharing table
7. TypeScript check + user runs `npm run build`

---

## Verification

1. EC/EV uploads file → NO `EngagementDocument` row created; ONE `engagementDocumentSharingUser` row with `projectDocumentId = NULL`
2. EC/EV creates folder → folder `EngagementDocument` created; sharing row with `projectDocumentId = NULL`
3. EC/EV uploads file inside folder → no new sharing row (parent folder covers it)
4. Shares tab → pending folder card appears; no file card
5. Files tab → pending folder appears dimmed with "Pending Review" badge
6. EL approves folder → `EngagementDocument` created for files; sharing rows get `projectDocumentId` set; Inngest fires; billing cap charged
7. EL rejects → sharing row deleted; Drive file trashed; NO `EngagementDocument` to clean up
8. EC/EV Cancel Request → same as reject path; no doc cleanup needed
9. Billing cap check: `assertWithinDocumentCap` runs at approval, not submission
10. `npm run build` passes
