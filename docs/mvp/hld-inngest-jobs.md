# Background Jobs Architecture: Inngest

**Document purpose:** This document describes all background functionality implemented using Inngest event-driven system. It documents job definitions, event triggers, and how background tasks prevent API timeouts and improve user experience.

**Audience:** Developers implementing features that require background processing, DevOps managing job execution, and stakeholders reviewing async architecture decisions.

**Related documents:** [HLD](hld.md) (system architecture), [PRD](prd.md) (product requirements).

---

## Overview

Inngest is an event-driven job queue used to offload long-running operations from the critical path. Background jobs:
- Prevent API timeouts on resource-intensive operations (file indexing, sandbox setup)
- Enable fire-and-forget task dispatch without blocking user requests
- Provide retry logic and error handling out of the box

All Inngest events use **`safeInngestSend()`** — a wrapper that never throws, so background job failures never break user-facing operations.

**Configuration:**
- Client: `lib/inngest/client.ts`
- Functions: `lib/inngest/functions.ts`
- API endpoint: `app/api/inngest/route.ts`
- Local dev server: `http://localhost:8288`

---

## Background Jobs

### Search & Indexing

#### 1. Index File for Search (`index-file-for-search`)

**Event:** `file.index.requested`

**Purpose:** Index a single file or folder for search.

**Trigger locations:**
- File upload completion
- File import from Drive
- Drive sync operations

**Data payload:**
```typescript
{
  organizationId: string
  clientId?: string
  projectId?: string
  externalId: string      // Google Drive file ID
  fileName: string
  parentId?: string       // Google Drive parent folder ID
}
```

**Implementation:** Uses `SearchService.indexFile()` to process file metadata and make it searchable.

---

#### 2. Index Batch for Search (`index-batch-for-search`)

**Event:** `file.index.batch.requested`

**Purpose:** Batch index multiple files/folders in parallel (10-file batches).

**Trigger locations:**
- Multi-file upload completion
- Bulk import operations

**Data payload:**
```typescript
{
  organizationId: string
  clientId?: string
  projectId?: string
  files: Array<{
    externalId: string
    fileName: string
    parentId?: string
  }>
}
```

**Implementation:** Processes files in BATCH_SIZE (10) chunks to optimize throughput.

---

#### 3. Scan and Index Project (`scan-and-index-project`)

**Event:** `project.index.scan.requested`

**Purpose:** Recursively discover and index all files in a project's Drive folder tree (up to 1000 files).

**Trigger locations:**
- Project creation
- Onboarding flow (custom workspace)
- Auto-import on connector setup

**Data payload:**
```typescript
{
  organizationId: string
  clientId?: string
  projectId: string
  connectorId: string
  rootFolderIds: string[]  // Google Drive folder IDs
}
```

**Implementation:**
1. Breadth-first discovery of all files under root folders (max 1000)
2. Batch index in 20-file chunks
3. Recursively traverses folder hierarchy

---

### Onboarding & Setup

#### 4. Populate Sandbox Sample Files (`populate-sandbox-sample-files`)

**Event:** `sandbox.populate.sample-files.requested`

**Purpose:** Populate sandbox project folders with sample files on Google Drive, then trigger search indexing.

**Trigger locations:**
- Sandbox workspace creation (`create-sandbox` API)

**Data payload:**
```typescript
{
  organizationId: string
  connectionId: string
  projects: Array<{
    projectId: string
    projectName: string
    rootFolderId: string
    generalFolderId?: string
    stagingFolderId?: string
    confidentialFolderId?: string
  }>
}
```

**Implementation:**
1. Creates folder structure on Drive (General, Staging, Confidential subfolders)
2. Populates each subfolder with sample files from `SampleFileService`
3. Triggers `project.index.scan.requested` for search indexing
4. Prevents `create-sandbox` API from timing out (runs async)

---

#### 5. Provision Sandbox Hierarchy (`provision-sandbox-hierarchy`)

**Event:** `sandbox.provision.requested`

**Purpose:** Async sandbox provisioning after initial sync: creates Drive hierarchy and provisions sample files.

**Trigger locations:**
- Sandbox workspace creation (`create-sandbox` API) — async phase after initial DB setup

**Data payload:**
```typescript
{
  firmId: string
  userId: string
  userEmail: string
  firstName?: string
  lastName?: string
  connectionId: string
}
```

**Implementation:**
1. Calls `provisionSandboxHierarchyForFirm()` to create complete Drive structure
2. Provisions all folders and initial content
3. Runs after API returns (not in critical path)

---

### File Operations

#### 6. Reconcile File Deletion (`reconcile-file-deletion`)

**Event:** `file.delete.requested`

**Purpose:** Clean up after file deletion: remove from search index, revoke Google permissions, and update DB sharing records.

**Trigger locations:**
- User deletes file via Files tab
- File is unlinked from Drive

**Data payload:**
```typescript
{
  organizationId: string
  externalId: string       // Google Drive file ID
  googlePermissionId?: string
}
```

**Implementation:**
1. Remove file from search index
2. Revoke Google Drive permission if exists
3. Update sharing records to REVOKED status
4. Clear `googlePermissionId` from DB

---

#### 7. Reconcile Folder Deletion (`reconcile-folder-deletion`)

**Event:** `folder.delete.requested`

**Purpose:** Clean up after folder deletion: remove from search index.

**Trigger locations:**
- User deletes folder via Files tab

**Data payload:**
```typescript
{
  organizationId: string
  externalId: string       // Google Drive folder ID
}
```

**Implementation:** Removes folder and its contents from search index.

---

### Access Control & Permissions

#### 8. Grant Permissions for New Member (`grant-permissions-for-new-member`)

**Event:** `project.member.added`

**Purpose:** When a user is added to a project, grant Drive folder access and per-document sharing permissions based on their role.

**Trigger locations:**
- Member is added to project via Members tab
- Invitation is accepted and user joins project

**Data payload:**
```typescript
{
  projectId: string
  organizationId: string
  userId: string
  email: string
  personaSlug: "eng_admin" | "eng_member" | "eng_ext_collaborator" | "eng_viewer"
}
```

**Implementation:**
1. Grant folder access (General/Staging/Confidential based on role)
2. Find documents with enabled sharing for member's persona
3. Grant individual document permissions (writer/reader based on role)
4. Create sharing records in `engagementDocumentSharingUser`

---

#### 9. Revoke Project Sharing (`revoke-project-sharing`)

**Event:** `project/archived`

**Purpose:** When a project is archived, revoke all shared permissions and downgrade engagement member folder access.

**Trigger locations:**
- Project is archived

**Data payload:**
```typescript
{
  projectId: string
  organizationId: string
  reason?: string
}
```

**Implementation:**
1. Find all GRANTED shares for the project
2. Revoke each Google Drive permission (10-document batches)
3. Mark all sharing records as REVOKED
4. Downgrade engagement members' folder access from editor to reader

---

#### 10. Revoke by Disabled Persona (`revokeByDisabledPersona`)

**Event:** `sharing.settings.updated`

**Purpose:** When document sharing settings are updated, revoke permissions for disabled persona types (guests, external collaborators).

**Trigger locations:**
- Document sharing settings are changed (guest/external collaborator disabled)

**Data payload:**
```typescript
{
  projectId: string
  organizationId: string
  sharingId: string
  disabledPersonas: ("guest" | "externalCollaborator")[]
  documentId: string
}
```

**Implementation:**
1. Fetch all sharing users for the document
2. Identify users with disabled personas (eng_viewer, eng_ext_collaborator)
3. Revoke their Google Drive permissions
4. Mark sharing records as REVOKED in DB

---

#### 11. Revoke by Member Persona Change (`revokeByMemberPersonaChange`)

**Event:** `project.member.persona.updated`

**Purpose:** When a member's role changes, revoke Drive permissions if they are downgraded from viewer/external collaborator roles.

**Trigger locations:**
- Member's role is changed

**Data payload:**
```typescript
{
  projectId: string
  organizationId: string
  userId: string
  oldPersonaSlug: string
  newPersonaSlug: string
}
```

**Implementation:**
1. Check if old persona was revokable (eng_viewer, eng_ext_collaborator)
2. Find all document shares for the user in this project
3. Revoke Google Drive permissions
4. Mark sharing records as REVOKED in DB

---

## Event Trigger Points

### API Routes

| Route | Event(s) | Purpose |
|-------|---------|---------|
| `POST /api/onboarding/create-sandbox` | `sandbox.provision.requested` | Async sandbox setup |
| `POST /api/onboarding/create-project` | `project.index.scan.requested` | Index new project files |
| `POST /api/onboarding/create-custom-workspace` | `project.index.scan.requested` | Index workspace files |
| `POST /api/connectors/google-drive` | `project.index.scan.requested` | Scan Drive after connector link |
| `GET/POST /api/connectors/google-drive/linked-files` | `file.index.requested`, `file.delete.requested` | Index/delete imported files |
| `POST /api/drive-action` | `file.delete.requested`, `folder.delete.requested` | Handle file/folder deletion |
| `POST /api/projects/[projectId]/documents/[documentId]/sharing` | `sharing.settings.updated` | Update sharing settings |

### Server Actions (lib/actions)

| Action | Event | Purpose |
|--------|-------|---------|
| `archiveProject()` | `project/archived` | Archive project and revoke shares |
| `addMember()` | `project.member.added` | Add member to project |
| `updateMemberPersona()` | `project.member.persona.updated` | Change member role |

### Services (lib/services)

| Service | Event | Purpose |
|---------|-------|---------|
| `IndexingInterceptor` | `file.index.requested`, `file.index.batch.requested` | Intercept file operations for indexing |
| `AutoImport` | `project.index.scan.requested` | Scan Drive on auto-import |

### Onboarding Helper (lib/onboarding)

| Function | Event | Purpose |
|----------|-------|---------|
| `provisionSandboxHierarchyForFirm()` | `sandbox.populate.sample-files.requested` | Populate sandbox during onboarding |

---

## Error Handling & Retries

All Inngest functions use `step.run()` to define granular operations with automatic retry:

```typescript
await step.run("operation-name", async () => {
  // Operation with automatic retry
})
```

**Retry behavior:**
- Inngest retries failed steps with exponential backoff
- Non-critical failures (e.g. permission revoke) are logged but do not block job
- Critical steps (e.g. DB updates) are flagged for monitoring

**Logging:**
- All errors are logged via `logger.error()` with context
- PII (emails, names) is redacted from logs where applicable

---

## Performance Considerations

### Batch Processing

Large operations are batched to prevent timeouts:

| Job | Batch Size | Reason |
|-----|-----------|--------|
| `indexBatchForSearch` | 10 files | Search indexing can be slow |
| `scanAndIndexProject` | 20 files per batch | Recursive discovery + indexing |
| `revokeProjectSharing` | 10 documents | Google Drive API rate limits |
| `grantPermissionsForNewMember` | Per-document loop | Varies by document count |

### Discovery Limits

Long-running discovery operations have built-in limits:

| Job | Limit | Reason |
|-----|-------|--------|
| `scanAndIndexProject` | 1000 files max | Prevent runaway traversal |

---

## Monitoring & Debugging

### Local Development

Start the Inngest dev server:
```bash
npx inngest-cli dev
```

Then run your app normally. The dev server at `http://localhost:8288` shows:
- All events received
- Job execution history
- Error logs and retries
- Event payload inspection

### Production

Inngest cloud dashboard provides:
- Real-time job execution status
- Retry history and error rates
- Latency metrics per job
- Alert configuration for failures

---

## Security & PII

### Data in Events

Event payloads contain:
- IDs (organization, project, file, user)
- Names (file, folder, person)
- Persona slugs (role identifiers)

**PII handling:**
- Email addresses are NOT included in event payloads
- Names (file, folder, person) are logged but redacted in monitoring
- No credentials or tokens are passed via events

### Connector Tokens

Google Drive tokens are stored securely (encrypted at rest) in `portal.connectors`. Background jobs retrieve and use tokens server-side only; tokens never appear in event logs.

---

## Future Enhancements

### Potential Background Jobs

1. **Periodic Search Index Cleanup** — Remove deleted files from search index after grace period
2. **Audit Log Archival** — Move old audit events to archive storage
3. **Subscription Sync** — Periodic sync with Polar for subscription status
4. **Email Notifications** — Send digests or alerts (e.g., "3 new shares pending")
5. **Drive Sync** — Periodic re-scan to catch externally deleted files

---

## References

- [HLD](hld.md) – System architecture overview
- [Functions source](../../frontend/lib/inngest/functions.ts) – Complete function implementations
- [Client source](../../frontend/lib/inngest/client.ts) – Inngest client and `safeInngestSend()`
- [Inngest docs](https://www.inngest.com/docs) – Official Inngest documentation
