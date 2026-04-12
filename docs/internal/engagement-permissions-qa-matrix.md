# Engagement permissions QA matrix

Maps product scenarios to enforcement surfaces (code paths). Use when regressing permissions, closure, deeplinks, and Drive grants.

| ID | Scenario | Expected | Primary enforcement |
|----|-----------|----------|------------------------|
| 1.1a | Internal before uploads — Engagement Lead | General + Confidential + Staging in UI; Drive writer on those roots | `grantEngagementDriveFolderAccess` (invitation + Inngest `project.member.added`), `linked-files` list |
| 1.1b | Internal — additional Lead | Same as lead | Same |
| 1.1c | Internal — Contributor (`eng_member`) | General + edit; no Confidential/Staging tabs without lead | Folder grants: General `writer` only |
| 1.2a | External Contributor before share | Only shared subtree; filtered `linked-files` + `file-info` | `getSharedAndAncestorIdsForPersona`, `project-sharing-ids` |
| 1.2b | External Viewer | Shared subtree read-only | Same + `eng_viewer` reader folder grant |
| 1.3 | Internal added after uploads | Folder grants from Inngest `grant-folder-access` step | `grantPermissionsForNewMember` folder step |
| 1.4 | External added after share | Per-doc Drive rows + shared ids | `sync-document-sharing`, `grantPermissionsForNewMember` (external only) |
| 1.5 | Deeplinks | Only users with `engagement_members` row | `file-info`, `resolve-path`, `doc-comments` + membership guard |
| 1.6 | Secure Open / re-grant | Member only; respect `REVOKED`; completed → reader for members | `sharing/regrant` |
| 1.7 | Lock / Unlock version | Lead only; Drive permission downgrade + stored rollback | `sharing/finalize`, `sharing/unlock`, `DocumentActionMenu` |

**Known non-member bypass removed:** `checkProjectPermission` still grants firm-wide admins for other flows; engagement-scoped document APIs above require explicit membership.

**Closure (COMPLETED):** External members removed; internal `eng_member` read-only; email share rows `REVOKED`; Inngest revokes Drive file permissions and downgrades folder collaborators to reader.

## Manual QA checklist (post-implementation)

1. Invite internal lead + member + external EC + viewer; verify folder grants (viewer = reader on General) and shared-only listing for externals.
2. Deeplink `#doc-file:UUID` and `#doc-comment:UUID` as firm admin **without** engagement membership → expect 404 on `file-info` / `resolve-path`.
3. Close engagement: externals removed from `engagement_members`; `linked-files` mutations return 403 for `eng_member`; lead can still reopen.
4. Lock version as lead: file menu shows Lock → Unlock; non-lead menus hide lock; `regrant` returns reader when locked.
5. After DB reset: apply renamed migration `20260412120000_init_platform` and run `prisma migrate deploy` / `migrate dev` as appropriate.
