---
name: Sharing feature fixes (May 2026)
description: Summary of bugs fixed in engagement sharing — breadcrumb hierarchy, regrant modal, legacy settings
type: project
---

Four bugs fixed on 2026-05-04, pending detailed multi-persona testing on 2026-05-05:

1. **External viewer breadcrumb** (`linked-files/route.ts`): When Drive listing returned empty for external viewer, the fallback bypassed folder hierarchy. Fixed by first querying `engagement_documents` by `parentId + externalId IN allowSet` before falling back to flat shared-file list.

2. **Regrant 500 for eng_viewer** (`regrant/route.ts`): `sharePdfOnly=true` (the default) sent viewers through Branch A (PDF export/upload). Any Drive failure there returned 500 → `onRegrantFailed` → raw Drive URL. Fixed: Branch A catch now falls through with `targetFileId = fileInfo.externalId` instead of returning 500. Also wrapped `revokePermission` (for returning users with stored googlePermissionId) in try-catch.

3. **SHARES tab error overlay** (`project-shares-tab.tsx`): Missing `onRegrantFailed` handler in `useSecureOpenDocument` caused unhandled throw → Next.js dev error overlay. Fixed by adding handler.

4. **Legacy settings format** (`project-sharing-ids.ts`): Removed `settings.guest === true` legacy check; only new nested `settings.share.guest.enabled === true` format retained (safe — no production data, buildSettingsForDb always writes new format).

**Why:** Engagement membership is the access authority for secure document access. Drive permission grant is best-effort.

**How to apply:** When touching sharing/regrant flows, ensure Drive API failures are always non-fatal for valid engagement members.
