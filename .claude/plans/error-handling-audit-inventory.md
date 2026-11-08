# Error-handling inventory: raw audit, 2026-11-07

Read-only audit of what a person sees when something fails, done in five parallel passes. Companion to [error-handling-audit.md](error-handling-audit.md), which has the deduplicated findings, the severity calls, root causes and fix batches. **Use that file first.** This one keeps each pass's detail: code quotes for its P0s, every grouped line number, and the "Deliberate, not findings" lists.

**How the two differ:**
- These severities are the passes' own. The summary file moves some: `getUserFirms`/group picker "No workspaces yet" P0 was wrong as written (see P1-23 there), Mark all read went to P2, Complete/reopen failures went to P1, and overlapping rows were merged.
- Findings overlap across passes, so the counts here don't add up to the summary's.
- Every P0 was then read by hand against the code. P1 and P2 are the passes' reading: confirm when fixing.
- "#441" means "Minified React error #441; visit https://react.dev/errors/441 ...", what a thrown server action becomes in the production browser build.
- Line numbers are from 2026-11-07, on a tree with other sessions' uncommitted stage work, so some may drift.

The rules each pass was given: read every finding in the code rather than reporting from grep; P0 is a false success or data at risk, including a failed load shown as a real-looking empty state; P1 is a failure on a common path with no reason; P2 is a rare path or weak message; deliberate cases get a count and a reason.

---

## Pass A: API routes used in daily work (`projects/**`, `drive-action`, `bookmarks`, `notifications`, `ai`, `clients`, `permissions`, `rbac`, `organization`, `deeplink`, `nav`, `push`, `proxy`)
Read: 67 route files, every in-scope candidate from lists 1, 1b, 4, 4b, 8, plus about 30 calling components and hooks and the libs they lean on (storage-lock, apply-stage-change, approval-archive, private-documents, sync-document-sharing, inngest client and revoke job, Drive and OneDrive permission adapters). Findings: P0 18, P1 20, P2 18. Deliberate: 73.

Paths below: `R/` = `app/api/projects/[projectId]/`, `D/` = `R/documents/[documentId]/`.

The working tree changed during this pass (privacy route, `use-stage-move`, `use-engagement-file-ops`, `deliverable-detail-panel`, `engagement-file-list` picked up internal-only stage work from another session). Those files were re-read and their line numbers are current as of the end of the pass; none of the findings changed, but they may drift again.

### P0
| Area | file:line | Trigger | What the person sees today | What they should see |
|---|---|---|---|---|
| Sharing | `D/sharing/regrant/route.ts:508-525`; `lib/use-secure-open-document.ts:251-265`; `components/projects/shares/secure-access-modal.tsx:46`; `components/files/document-edit-sheet.tsx:76-80,112` | Drive or OneDrive refuses the grant. `grantFilePermission` returns null on any refusal (`lib/google-drive-connector.ts:3625-3628`, `onedrive-permission-adapter.ts:601`) and the route answers `{ success: true, provider }` | "Check your email · A verification link was sent to {email}. Follow the link in the email to open the document." Nothing was sent. On OneDrive too, which never emails. The edit-sheet button says "Secure Edit Link Sent!" | "Couldn't open this document. Google Drive refused access for {email}: {reason}." |
| Sharing | `D/sharing/regrant/route.ts:352-358,362-367,373-378`; `D/sharing/route.ts:614-634` | Exporting, watermarking or uploading the PDF copy fails, or `setCopyRestricted` is refused | The firm set "PDF only" and "Apply watermark". The Reviewer is silently granted the original file, no watermark, native download not blocked. Nobody is told, on either side | Refuse the open. Reviewer: "This document couldn't be prepared. Try again in a moment." Log for the firm |
| Sharing | `D/sharing/route.ts:757,783`; `lib/sync-document-sharing.ts:43-62`; `lib/inngest/functions.ts:736`; `lib/inngest/client.ts:23-32`; `components/projects/hooks/use-engagement-file-ops.ts:572` | "Revoke Access". The sync nulls `connectorPermissionId` on GRANTED client rows before the revoke job is sent, and the job skips rows with no id. A secure open always leaves a row GRANTED (`regrant/route.ts:527-534`). `safeInngestSend` can also drop the job with no signal | "Unshared · {name} is no longer shared externally." The Drive or OneDrive permission stands, so the client still opens it from storage. Read from code; worth confirming with a test | Say so only when the storage permission is gone. Otherwise "Unshared in Firma. Couldn't remove access in Google Drive: {reason}." |
| Board and deliverables | `D/sharing/route.ts:333-358`; `lib/files/apply-stage-change.ts:75` (comment: "Use 'Untag as Deliverable' to fully revoke"); `components/projects/shares/engagement-shares-tab.tsx:1671` | "Demote to folder" on a deliverable clients have opened | "Demoted to folder · It is a plain folder again and off the Board." No revoke job is sent. Folder rows and their permission ids are deleted; document rows with a live permission are GRANTED and left in place, so those clients keep access | Revoke first. If it fails: "Demoted, but {n} people still have access in storage: {reason}." |
| Approvals | `lib/files/storage-lock.ts:37-41`; `D/sharing/accept/route.ts:84-93`; `components/ui/document-action-menu.tsx:315,390`; `components/projects/file-property-cells.tsx:83` | Storage refuses to downgrade an editor. `patchFilePermissionRole` and `setFileContentReadOnly` return `false`, and both results are dropped | "Version locked · Others can only view this file until you unlock it." / "Approved" / "Document accepted · …now locked." That editor can still edit the approved file in Drive | "Couldn't lock this. Google Drive kept edit access for {email}: {reason}." Not approved |
| Approvals | `lib/files/storage-lock.ts:46-64`; `D/sharing/unlock/route.ts:70,85`; `use-engagement-file-ops.ts:546` | Storage refuses to restore a role on unlock | "Returned to Draft · "{name}" is now editable." People stay viewers, and `settings.lock` (the only record of their old roles) is deleted, so no retry can restore them | "Couldn't restore edit access for {email}: {reason}." Keep the lock record |
| Approvals | `D/intake/route.ts:285,298-300,188-197`; `use-engagement-file-ops.ts:601,631`; `engagement-shares-tab.tsx:1704-1706` | Reject or withdraw when storage refuses the trash (OneDrive locked, reconnect needed), or there is no connector | "File rejected · "{name}" has been removed." The row is gone from Firma and the file is still in Drive. The trash now throws a `StorageFailure` with the real reason, and this route logs it and answers ok. In the folder path a failed row delete is `.catch(() => {})` too | "Rejected in Firma, but OneDrive has this locked. Close it everywhere, then remove it there." |
| Uploads | `components/projects/hooks/use-engagement-upload.ts:269,274-281,393-400,414`; `R/index-file/route.ts:76-81` (comment) | `index-file` or `index-file-intake` answers non-ok (500, or the 403 cap if the pre-check failed open). `.then(() => undefined)` and a bare `.catch(log)` never read the answer | "Upload complete · 3 files added." The route's own comment says such a file has no document row, so it "404 on preview, download, secure-open and sharing, permanently". A client's upload never reaches the Lead's review queue | "{name} uploaded to storage but couldn't be added to Firma: {reason}." with a retry |
| Files | `R/documents/bulk-download/route.ts:62,65,75,112,129-130`; `components/projects/engagement-file-list.tsx:1036-1051` | A file can't be read, or the selection holds over 100 files. The route sets `X-Bulk-Download-Skipped` and `-Failed` so "the client can warn". Nothing in the browser reads them, and the 100-file cap isn't counted at all | Download panel: done, `{engagement}.zip`. The ZIP is silently short of files, and may be sent on to a client | "Downloaded 96 of 100. Not included: {names}." and "Only the first 100 files fit in one download." |
| Comments | `D/doc-comments/route.ts:308-320,410-427`; `components/projects/document-doc-comments-pane.tsx:502-512,744-764` | The reminder write behind an @mention or a reminder date fails. The route's `.catch(() => {})` always answers `{ success: true }`, and the pane's mention call has no `.ok` check and its own `.catch(() => {})` | The comment posts with its bell set, and "Couldn't save the reminder" can never appear. The person mentioned is never told | "Comment posted. Couldn't notify {name}. Try again." |
| Board and deliverables | `components/projects/shares/deliverable-detail-panel.tsx:223-238,731-751,782-801` | Assignee, delivery settings or description save answers non-ok. `await fetch(...)` with no `.ok` | The new assignee, toggle or text stays on screen as saved. The assignee is optimistic and never rolled back. Only a network throw reaches a toast ("Error · Failed to save…"). On reopen the old value is back | Put the value back, and say "Couldn't save the assignee: {reason}." |
| Board and deliverables | `deliverable-detail-panel.tsx:736-746`; `D/sharing/route.ts:402-403,472,542-543,569-579` | Any "Delivery settings" toggle. The PUT sends only `ecOptions` and `guestOptions`, and the route reads `guest = body.guest === true`, so a missing key means off. Not a caught error, but nothing tells anyone | Toggling "Allow download" for Limited Access contributors sets the deliverable's `guest.enabled` to false, revokes Reviewer rows and sends the revoke job. The toggle looks saved; Reviewers lose the deliverable. Read from code; confirm with a test | The toggle changes only its own option |
| Board and deliverables | `engagement-shares-tab.tsx:1586-1596,2253-2259`; `deliverable-detail-panel.tsx:661-701,1004,1091` | `/shares` or `/subtasks` fails. Logged, or `// non-critical`, with state left empty | Board: "No deliverables yet · Mark a folder as a Deliverable from the Files tab to see it here". Pane: "No documents yet", "No files in this deliverable yet." The person may promote or add again | "Couldn't load the Board. Try again." with a retry |
| Notifications and inbox | `components/inbox/inbox-view.tsx:185-192,543`; `app/api/notifications/route.ts:141` (no try/catch) | The notifications fetch, `getAllUserReminders` or `getNeedsYou` fails. All three fall back to empty | "You're all caught up" / "No updates". Approvals and review requests waiting on them look like nothing | "Couldn't load your Inbox. Try again." |
| Search | `components/projects/engagement-search-context.tsx:151-157`; `engagement-search-panel.tsx:554-560` | `/search` answers non-ok or never gets there | "No results · Nothing in {folder} matches "{query}"." A false statement that the document doesn't exist; the person may upload it again | "Search isn't working right now. Try again." |
| Other | `R/insights/share-report/route.ts:84-96`; `components/projects/engagement-insights-dashboard.tsx:2559-2562,3016` | Every `sendEmail` throws, or SMTP is unset, or no address resolves. `allSettled` results are thrown away and `sent: emails.length` is always returned | Green tick beside "Email health report PDF to {n} team members". Possibly nobody received it | "Sent to 3 of 5. Couldn't reach {names}." or "Couldn't send the report: {reason}." |
| Sharing | `D/privacy/route.ts:62-63,88-94,102-104`; `lib/files/private-documents.ts:91-127`; `use-engagement-file-ops.ts:525,530` | `withdrawClientAccess` fails after the lock was saved, then the person retries as told. The retry hits "Already so: nothing to do". Its revoke job can also drop inside `safeInngestSend` | First "Couldn't make it internal only · Something went wrong on our side. Try again." Then "{name} is now internal only." Client rows and Drive permissions were never taken back | Finish taking access back on retry, or say "Internal only is set, but {n} people still have access in storage." |
| Notifications and inbox | `lib/hooks/use-register-push.ts:72-77,94-99` | `POST /api/push/subscribe` answers non-ok. No `.ok` check | The toggle shows on, and the person waits for pushes that never come | "Couldn't turn on notifications: {reason}." Toggle stays off |

#### Code for each P0

Secure open, grant refused (`regrant/route.ts:508-525`)
```ts
if (!permissionId) {
    // ... Return success so the modal shows.
    await prisma.engagementDocumentSharingUser.update({ where: { id: sharingUser.id },
        data: { sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED, updatedBy: user.id } })
    timingPath = 'membership-only'
    return NextResponse.json({ success: true, provider })
}
```

PDF-only falls back to the original (`regrant/route.ts:352-358`)
```ts
} catch (pdfError) {
    console.error('Failed to process PDF-only sharing:', pdfError)
    // Drive PDF operations failed — fall through with original file as target.
    targetFileId = fileInfo.externalId
}
```

Revoke external access (`sharing/route.ts:757,783`; `sync-document-sharing.ts:43-62`; `functions.ts:736`)
```ts
await syncDocumentSharingUsers(existing.id, user.id)      // sets REVOKED, connectorPermissionId: null on GRANTED client rows
// ...
await safeInngestSend('sharing.settings.updated', { ... }) // swallows its own failure
// revoke job:
if (shouldRevoke && user.connectorPermissionId) { usersForRevocation.push(...) } // nothing left to revoke
```

Demote (`sharing/route.ts:333-358`: deletes rows, no revoke event in this branch)
```ts
await prisma.engagementDocumentSharingUser.deleteMany({ where: { projectDocumentId: doc.id } })
// ...
await prisma.engagementDocumentSharingUser.deleteMany({ where: {
  projectDocumentId: { in: allDescendants.map((c) => c.id) },
  sharingPermissionStatus: DocumentSharingPermissionStatus.INHERITED } })
```

Lock ignores refusal (`storage-lock.ts:37-41`)
```ts
const ok = await permissionAdapter.patchFilePermissionRole(connectorId, externalId, p.id, 'viewer')
if (ok) downgraded.push({ permissionId: p.id, previousRole: prev })
// ...
await permissionAdapter.setFileContentReadOnly(connectorId, externalId, true) // result dropped
return downgraded
```

Unlock ignores refusal, then forgets (`storage-lock.ts:59-62`; `unlock/route.ts:70,85`)
```ts
for (const row of downgraded) {
    const role = toConnectorRole(row.previousRole)
    if (role) await permissionAdapter.patchFilePermissionRole(connectorId, externalId, row.permissionId, role) // result dropped
}
// route:
delete nextSettings.lock
```

Reject says removed (`intake/route.ts:285,298-300`)
```ts
await prisma.engagementDocument.delete({ where: { id: doc.id } })
// ...
await adapter.trashFile(connectorId, fileInfo.externalId).catch((e) => {
  console.error('[intake] trashFile error', { connectorId, externalId: fileInfo.externalId, ... })
})
```

Upload ignores the indexing answer (`use-engagement-upload.ts:259-269`)
```ts
docIdRequestSettled = fetch(`/api/projects/${projectId}/index-file`, { method: 'POST', ... })
    .then(() => undefined).catch(e => logger.error('Failed to trigger indexing', e))
```

Bulk download (`engagement-file-list.tsx:1042-1051`: the X-Bulk-Download headers are read nowhere in the repo)
```ts
if (!res.ok) throw new Error('Failed to create ZIP')
const blob = await res.blob()
// ...
setDownloadQueue(prev => prev.map(i => i.id === queueItem.id ? { ...i, status: 'done', name: filename } : i))
```

Mentions (`doc-comments/route.ts:410-427`; `document-doc-comments-pane.tsx:502-506`)
```ts
upsertFollowUpReminder({ ... }).catch(() => {})   // not awaited either
// ...
return NextResponse.json({ success: true })
// pane:
fetch(`.../doc-comments`, { method: 'PATCH', ... }).catch(() => {})
```

Deliverable pane (`deliverable-detail-panel.tsx:229-235`)
```ts
onAssigneeChange?.(subtask.id, userId, member?.name ?? null, ...)  // optimistic
// ...
await fetch(`/api/projects/${projectId}/documents/${subtask.documentId}/assignee`, { method: 'PATCH', ... })
// no res.ok, no rollback
```

Delivery toggle (`deliverable-detail-panel.tsx:740-745`; `sharing/route.ts:403,542-543`)
```ts
body: JSON.stringify({ ecOptions: {...}, guestOptions: {...} })   // no `guest` key
// route:
const guest = body.guest === true                                  // so false
if (oldSettings?.share?.guest?.enabled && !guest) disabledPersonas.push('guest')
```

Board empty on failure (`engagement-shares-tab.tsx:1589-1595`)
```ts
if (!response.ok) throw new Error('Failed to fetch shares')
// ...
} catch (error) {
  logger.error('Failed to fetch shares data', ...)   // shares stays []: "No deliverables yet"
}
```

Inbox (`inbox-view.tsx:186-191`)
```ts
getAllUserReminders().catch(() => [] as ReminderWithContext[]),
fetch("/api/notifications?firms=all")
    .then((r) => (r.ok ? r.json() : { notifications: [] }))
    .catch(() => ({ notifications: [] })),
getNeedsYou().catch(() => [] as NeedsYouItem[]),
```

Search (`engagement-search-context.tsx:151-157`)
```ts
logger.error('Search API failed', new Error(await res.text()))
setProjectSearchState(projectId, { searchResults: [] }, () => getRecentSearches(projectId))
```

Health report (`share-report/route.ts:84,96`)
```ts
await Promise.allSettled(emails.map((email) => sendEmail(email, subject, html, [...])))
return NextResponse.json({ sent: emails.length })
```

Internal only retry (`privacy/route.ts:63,88-93`)
```ts
if (isDocumentPrivate(prevSettings) === makePrivate) return NextResponse.json({ ok: true })
// ...
await prisma.engagementDocument.update({ ... })                                  // lock saved first
if (makePrivate) await withdrawClientAccess(projectId, existing.firmId, existing, rows, user.id)
```

Push (`use-register-push.ts:72-77`)
```ts
await fetch('/api/push/subscribe', { method: 'POST', ... })
setSubscribed(true)
return true
```

### P1
| Area | file:line | Trigger | What the person sees today | What they should see |
|---|---|---|---|---|
| Files | `D/preview/route.ts:96,113,127,152-160,170,215`; `components/files/document-pdf-preview-pane.tsx:506-518`; `document-blob-preview-pane.tsx:42,144` | Any preview failure that isn't a conversion error: storage down, file gone, token expired. pdf.js hands off to an iframe of the same URL, and the route answers JSON. A `StorageFailure` isn't handled, so it collapses to the 502 | Raw text in the preview pane: `{"error":"Failed to fetch document content from storage"}`. On 403 it names "Pockett" | "OneDrive has this locked…" or "This is no longer in Google Drive. Refresh the list." on the preview card |
| Files | `D/download-share/route.ts:260-263`; `document-action-menu.tsx:442,456`; `document-versions-timeline.tsx:91,104`; `engagement-file-list.tsx:1042` | Storage refuses a download, or a ZIP fails | Downloads panel: "Download failed". The route's specific answers ("Could not resolve parent folder…", "No active storage connector") and the storage's reason are dropped on both sides. ZIP: "Failed to create ZIP" | "Download failed. The connection to Google Drive needs renewing. Reconnect the storage, then try again." |
| Sharing | `lib/use-secure-open-document.ts:192-196,275-279`; `D/sharing/regrant/route.ts:152,158,559`; `document-edit-sheet.tsx:82-86` | Regrant answers non-ok | Any 403: "Your access to this document has been revoked. Please contact your engagement lead." (even when it was never shared). Anything else: "Access unavailable · Unable to open this document. Please try again or contact support." A dead connection is one of these. Edit sheet: "Failed to authenticate · There was a problem authenticating editor access. Please try again." | The route's reason: "The connection to OneDrive needs renewing. Ask your Lead to reconnect the storage." |
| Approvals | `D/intake/route.ts:317`; `use-engagement-file-ops.ts:606,636`; `engagement-shares-tab.tsx:1688-1691,1678-1711` | Approve, reject or withdraw fails | Files: "Action failed · Internal server error". Board: "Action failed · Could not complete the intake action. Please try again." even for "Document is not pending intake" or "Only a Lead can approve or reject". On the Board a network failure shows nothing: `try/finally` with no catch | "Approve failed. It's no longer waiting for review. Refresh the list." |
| Board and deliverables | `D/sharing/activity/route.ts:161,180-195,202-205`; `file-property-cells.tsx:75`; `deliverable-detail-panel.tsx:250`; `components/files/use-stage-move.tsx:65` | The stage write fails. If it fails after `archiveApprovedVersion`, the file is locked and copied to Archive while the stage stays put and no lock is recorded | "Couldn't change the stage · Failed to update activity" or "Failed to update status · Failed to update activity". Network: "Please try again." Words a person never sees elsewhere ("activity"), and no reason | "Couldn't change the stage. {reason}." Undo the lock when the write fails |
| Board and deliverables | `D/due-date/route.ts:64-70,87-92,100-103`; `components/files/use-due-date-save.tsx:63,66`; `lib/actions/project.ts:438,451` | `updateEngagement` throws ("Cannot update a completed engagement.", a deliverable due later) or a later row fails. Three writes, no transaction | "Couldn't set due date · Failed to update due date". The action's clear words are lost. The engagement's date may already have moved, and the UI keeps the old one | The thrown words, plus what did change |
| Sharing | `use-engagement-file-ops.ts:551,554,577,580`; `engagement-file-list.tsx:1640,1646,1662,1668`; `document-action-menu.tsx:315-322`; `D/sharing/unlock/route.ts:123`; `D/sharing/route.ts:707,812`; `D/sharing/finalize/route.ts:105` | Unlock, revoke, promote, demote or lock fails | "Failed · Failed to unlock", "Failed · Failed to delete sharing", "Failed · Failed to save sharing", "Failed · Network error.", "Error · Could not promote the folder to a deliverable.", "Lock failed · Failed to finalize". Titles don't name the action, and no route here passes a storage reason on | "Return to draft failed. {reason}." |
| Board and deliverables | `D/sharing/route.ts:236-301,327-358` | Promote or demote fails partway. Settings commit first, then per-row loops with no transaction | "Failed · Failed to save sharing" while the folder is already on the Board with only some members' rows | One transaction, or "Promoted, but some people's access wasn't set up. Try again." |
| Board and deliverables | `lib/files/apply-stage-change.ts:96-155` | The access sync after a forward move fails (`console.error`), or is cut off because it runs after the response | "Stage updated" after the person agreed to "Move and share". Clients may not get their rows. How much access rests on those rows I couldn't fully settle: `isDescendantOfGrantedFolder` does read them | Await it, and say if sharing didn't complete |
| Comments | `D/doc-comments/route.ts:142,336,430,559`; `document-doc-comments-pane.tsx:231,238,489,518,535,541` | Load, post or delete fails | "Failed to load comments", "Failed to add comment", "Failed to process request" (delete). Nothing says whether to retry, or that the text is still there | "Couldn't post your comment. It's still in the box. Try again." |
| Comments | `D/doc-comments/resolve/route.ts:11-17` (no try/catch); `components/projects/engagement-comments-tab.tsx:336-342` | Resolve or reopen fails | "Couldn't resolve this discussion" and no message. Network failure: no toast at all, unhandled rejection | "Couldn't resolve this discussion. {reason}." |
| Comments | `document-action-menu.tsx:1447-1466`; `document-doc-comments-pane.tsx:721,756`; `D/reminder/route.ts:80,195` | Setting a reminder for several people partly fails | "Partial failure · 1 operation(s) failed." Who, and why, is dropped although each call's reason was caught ("Reminders cannot be assigned to an assistant"). Title doesn't name the action | "Reminder set for Ana. Couldn't set it for Raj: {reason}." |
| Other | `engagement-file-list.tsx:1216-1229,1250-1255`; `D/resolve-deeplink/route.ts:136-138`; `D/file-info/route.ts:74-76` (neither catch logs) | A link from a notification or email hits a 500, or the network drops | "Link unavailable · You do not have access to this item." The person chases a Lead for access they already have | "Couldn't open that link. Try again." Keep "no access" for a real 404 or 403 |
| Brio | `R/ai-chat/route.ts:284`; `components/projects/engagement-ai-chat.tsx:741,783` | The model call or anything before the stream throws | The chat panel shows "Internal server error" | "Brio couldn't answer just now. Try again." |
| Brio | `R/ai-summary/route.ts:164-165,181-184`; `engagement-insights-dashboard.tsx:2759,2800` | Out of AI credits. The gate throws before the stream, and the outer catch has no `aiLimitResponse`. Those two lines sit inside the stream's catch, where returning a Response does nothing | "Brio could not write a summary. Try again." Trying again can't help. Mid-stream: "Brio was interrupted before finishing." | The limit's own words, as chat gets |
| Other | `engagement-insights-dashboard.tsx:2575,2588,1315,1425`; `R/insights/route.ts:66`; `app/error.tsx:107` | `/insights` fails. `.then((r) => r.json())` has no `.ok` check, so `{ error }` becomes `data`, and `data?.unansweredThreads.length` throws. Network failure leaves `data` null | Whole page replaced by "Something went wrong" with a stack trace option. Network: the Action Center skeleton pulses forever | "Couldn't load the Overview. Try again." |
| Files | `engagement-file-list.tsx:552-594`; `R/sharing/ids/route.ts:74` | `/sharing/ids` fails. Every set is emptied | Shared and internal-only markers vanish from the Files list, with no message. Files look unshared | "Couldn't load sharing status. Try again." |
| Comments | `components/files/document-discussion-tab.tsx:39-40,66`; `D/deliverable/route.ts:43` | `/deliverable` fails | "Discussions happen on deliverables, and this file isn't in one." False | "Couldn't load this discussion. Try again." |
| Board and deliverables | `deliverable-detail-panel.tsx:717-728` | Owner change fails | The Lead picker snaps back with no message | "Couldn't change the Lead: {reason}." |
| Board and deliverables | `engagement-shares-tab.tsx:1664-1666,1674`; `D/sharing/route.ts:707` | Demote from the Board fails | "Demote failed · Could not demote the deliverable to a folder. Please try again." Route's answer never read | Route's reason |

### P2
| Area | file:line | Trigger | What the person sees today | What they should see |
|---|---|---|---|---|
| Files | `D/versions/route.ts:69`; `components/files/use-document-versions.ts:33,41`; `document-versions-timeline.tsx:127`; `document-activity-feed.tsx:299`; `R/audit/route.ts:137` | Version or activity load fails | "Failed to load version history", "Failed to load activity". A storage refusal is flattened | The storage's reason |
| Sharing | `D/sharing/route.ts:444,562,777` | Trashing the system PDF copy fails | Nothing. A Firma-made PDF stays in Drive after sharing ends (one `catch {}` with no log at all) | Log at least; a note to the firm if it matters |
| Sharing | `D/sharing/route.ts:393-398` | `ensureDocument` throws | A raw Prisma message, labeled 404 | "Couldn't set up sharing for this file." |
| Files | `D/preview/route.ts:113,127,159`; `D/download-share/route.ts:122,176` | Connector missing or unsupported | "No content adapter available for connector", "The account linked to Pockett…": developer words and the old brand | "Connect storage for this client." |
| Settings | `components/projects/firm-clients-view.tsx:123-136`; `client-project-view.tsx:85-92`; `components/shell/shell-data-context.tsx:100-102`; `app/api/permissions/firm/route.ts:148` | Permissions fetch fails. `res.json()` with no `.ok` in two of them | Settings tab, Audit and "New client" simply vanish, as though the person lacks access | "Couldn't load your permissions. Refresh." |
| Notifications and inbox | `components/app/app-topbar.tsx:447,898-908,1079-1085,1127-1133`; `app/api/notifications/route.ts` (no try/catch) | Load, Clear all, mark read or clear alert fails | Nothing; the list refreshes unchanged. No `.ok` checks | "Couldn't clear notifications." |
| Notifications and inbox | `inbox-view.tsx:194-200,212-218,433-440` | Mark read or Mark all read fails | Dots clear optimistically, come back on the next load | Roll back with a toast |
| Notifications and inbox | `app-topbar.tsx:1012-1036`; `app/api/notifications/broadcast/route.ts` (no try/catch) | Broadcast composer send fails | The composer stays open, no message (`broadcast-modal.tsx:54-56` does this properly) | The route's reason |
| Other | `app/api/bookmarks/route.ts` (no try/catch); `components/projects/engagement-file-row.tsx:299-304`; `app-topbar.tsx:813-818`; `components/home/home-bookmarks.tsx:27-34`; `document-action-menu.tsx:1060` | Removing a bookmark fails | Nothing, or "Failed · {message}" when adding | "Couldn't remove the bookmark." |
| Search | `components/search/global-search-view.tsx:783,793` | `/api/deeplink` fails when opening a global result | The click does nothing | "Couldn't open this file." |
| Search | `R/search/route.ts:221-223` | The private-and-intake lock filter query fails | Logged, and results carry on unfiltered. Drive-direct hits for private files could be listed. Failing open on privacy | Drop unfiltered Drive hits on failure |
| Brio | `R/files-agent/scaffold/route.ts:313,339,346,354`; `components/projects/files-scaffold-panel.tsx:176,186,192`; `R/files-agent/route.ts:248` | Scaffold folder fails, or marking the run fails after folders exist | "Created 6 folders, 3 could not be created." no reason. "Please try again." "Could not create the folders" even though some were | Each folder's reason, as apply reports |
| Members and invites | `R/members/route.ts:47,55,64`; `document-doc-comments-pane.tsx:205`; `engagement-comments-tab.tsx:273`; `use-engagement-file-ops.ts:704-715`; `engagement-file-list.tsx:3563` | Member or engagement list fails | People missing from pickers, empty mention list, "No other engagements available." | "Couldn't load the people on this engagement." |
| Files | `R/documents/create-link/route.ts:168`; `engagement-file-list.tsx:1973-1977` | Create link fails | "Could not create link · Internal Server Error", and the dialog closes, losing the name and URL typed | Keep the dialog open with a real reason |
| Files | `app/api/drive-action/route.ts:208,293` | Post-trash metadata read throws; restore fails | "Move to trash failed · Internal server error" though the file is in the trash. Restore: fixed "Couldn't restore it" with the reason dropped | Treat the metadata read as optional; carry the reason |
| Comments | `document-doc-comments-pane.tsx:685-695`; `components/files/blocked-property.tsx:43-66`; `components/files/save-assignee.ts:5` | Reaction fails; network failure on Blocked or assignee | Reaction snaps back silently, and a network throw leaves it optimistic. Blocked and assignee: unhandled rejection, no message | A toast naming the action |
| Board and deliverables | `R/shares/order/route.ts:61`; `engagement-shares-tab.tsx:1617-1628` | Reorder fails | "Move failed · Could not save the new position. The board has been restored." True, but no reason | Fine with the reason added |
| Other | `app/api/organization/create/route.ts:51`; `app/api/permissions/project/route.ts:58` (only `useProjectPermissions`, which nothing imports); `app/api/permissions/project-tabs/route.ts:79`; `R/documents/count/route.ts:26`; `R/index-project/route.ts:97`; `app/api/rbac/effective-permissions/route.ts:48`; `R/documents/[documentId]/route.ts:55-58,73`; `drive-action:365,378` | Generic strings where nobody reads them. No browser caller for the first five; rbac is admin View As. The document DELETE's trash swallow is reachable for files only from the unmounted `EngagementActionCenter`; links are fine. Revoke and set_expiry serve only `risky-share-review-modal.tsx`, imported nowhere | Nobody sees these | Clear them when that code is removed |

### Deliberate, not findings
- 24 audit `.fireAndForget()` calls: a failed audit row must not fail the action (`D/sharing/route.ts:311`).
- 11 event notifications and emails: best effort, the action itself succeeded (`D/doc-comments/route.ts:289`, `D/sharing/accept/route.ts:134`, `D/due-date/route.ts:220`, `D/index-file-intake/route.ts:175`).
- 4 `assignDocId` catches: the indexing job assigns it later (`R/index-file/route.ts:57`).
- 3 housekeeping passes: comment purge, notification prune, bookmark migration (`D/doc-comments/route.ts:32`).
- 5 regrant fallbacks: stale revoke, webViewLink read, guest pre-invite twice, duplicate lookup; a working link path remains (`regrant/route.ts:262`).
- 8 name, email and label lookups in reads: a blank name beats a failed page (`R/shares/route.ts:186`, `R/search/route.ts:279`).
- 5 `request.json().catch(() => null)` with validation right after (`R/ai-chat/route.ts:105`).
- 4 thumbnail and client brand routes: the caller falls back to an icon or the default brand (`secure-access-modal.tsx:149`).
- 3 Brio best-efforts: sources line, engagement kind, previous scaffold run; the answer still arrives (`R/ai-chat/route.ts:244`).
- 2 description side effects: vector refresh and native field, the Firma copy is saved (`D/sharing/route.ts:176`).
- 2 ambient: AI credits and recents, which answers 503 by design so a blip can't wipe the list (`app/api/nav/recents/resolve/route.ts:74`).
- 2 permission probes that default to no: `can-use-view-as`, `is-system-admin`.

### Patterns
- **Nothing under `R/` uses `StorageFailure`.** `grep` finds it only in `drive-action`. Every storage-backed route here (sharing, regrant, intake, preview, download, finalize, unlock, accept, activity, due-date, versions) ends in a generic catch. A shared "answer from this error" helper in those catches would turn most of the P1 strings into real reasons.
- **Boolean adapter methods swallow the provider's answer.** `grantFilePermission`, `patchFilePermissionRole`, `setFileContentReadOnly`, `revokePermission` and much of the OneDrive adapter return false or null on `!res.ok`, while `trashFileWithReason` was moved to throw a `StorageFailure`. Giving grant and role changes the same treatment addresses P0 rows 1, 5, 6 at the source.
- **`safeInngestSend` returns void and never fails.** Fine for reindexing. Wrong for `sharing.settings.updated`, the only thing that takes access back in storage. Must-happen events need a result the caller can see (P0 rows 3, 17).
- **Sharing PUT treats a missing key as "off".** `guest = body.guest === true` with partial bodies is what makes the delivery toggles destructive (P0 row 12).
- **Work after the response.** `Promise.resolve().then(...)` and un-awaited promises (stage access sync, sharing sync, mention reminders) have no `after()` or `waitUntil`. The pane says so outright: "the server writes reminders after it replies".
- **`r.ok ? r.json() : emptyDefault` is the false-empty factory.** Board, deliverable pane, Inbox, Search, Discussion tab, share markers and pickers all share it. They need a third state: failed.
- **Browser clients discard the server's words.** `failureFrom` and `failureReason` exist in `lib/files/action-failure.ts`, but Download, ZIP, Board intake, secure open and Demote still use fixed strings. Only `document-action-menu`'s lock and accept and `use-engagement-file-ops` read `error`, and there the title is often "Failed".
- **Good examples to copy:** `R/files-agent/apply/route.ts` (per-item outcome with reason), `lib/files/approval-archive.ts` (refuse and undo), `D/sharing/regrant/route.ts:469-482` (the one storage reason carried out by `code`).

### Could not tell
- Whether a deployed function survives long enough for the un-awaited writes above (`upsertFollowUpReminder` in `doc-comments/route.ts:410`, the stage access sync). Needs a production look.
- How much client access depends on the rows the stage sync writes versus the settings flags. `isDescendantOfGrantedFolder` reads rows, the shared-id lists read settings.
- The revoke-after-null sequence (P0 row 3) and the delivery toggle (P0 row 12) are read from code only. No test was run, per the brief. `route.promote.test.ts` covers neither.
- Whether `getFileInfo` or a later listing ever backfills a missing document row. The P0 uploads row relies on the comment in `R/index-file/route.ts:76-81`, which says nothing does.
- Noticed, outside this audit's question: `R/documents/bulk-download/route.ts` checks membership only, so it applies neither `allowDownload` nor the private-document rule that `download-share` enforces. Worth a look by the access-gates work.

---

## Pass B: API routes outside engagements (connectors, firms, firm, billing, checkout, onboarding, account, support, webhooks, provision, system, demo, debug, version, inngest)
Read: 85 route files (`system/**` and `demo/**` read by their catch and status lines, not line by line; `linked-files/route.ts` only its GET, DELETE, list, create and catch parts), all 90 in-scope lines from candidate lists 1 and 1b, and about 30 calling components and libs. Findings: P0 10, P1 19, P2 15. Deliberate: 52.

### P0
| Area | file:line | Trigger | What the person sees today | What they should see |
|---|---|---|---|---|
| Billing | `lib/billing/polar-webhook-sync.ts:191-199`, `app/api/webhooks/polar/route.ts:31-48` | A paid subscription webhook whose customer external id, customer id and subscription id match no group. The handler logs a warning and returns null, so the route answers `{ received: true }` and Polar never retries. | "You're all set" and "Thanks for subscribing." Then Billing still shows the old plan with upgrade buttons. Nothing tells anyone: it is a `warn`, not an error, and no ticket is raised. | "Payment received. We couldn't activate your plan yet and have been alerted · reference <checkout id>." |
| Connectors | `app/api/connectors/google-drive/route.ts:670-679`, `:688-690`, `:697`, `:711`; `lib/inngest/client.ts:28-32`; `components/google-drive/google-drive-workspace-root.tsx:497-506` | Migrate on a Google connector. The root folder is repointed first. Then the firm is looked up by the legacy `Firm.connectorId`, which OAuth never sets, so nothing is queued and the route still answers `{ ok: true, async: true }`. Second trigger: the firm link exists but `safeInngestSend` fails, and that failure is swallowed. | First trigger: the dialog closes with no toast, the panel clears on its first poll, and Location now names a new empty folder. Every file is still in the old one. Second trigger: "Save any open work — the workspace will lock in:" then "Workspace is locked — migration started", indefinitely. | "Migration couldn't start. Your files and folder are unchanged · <reason>." |
| Connectors | `app/api/connectors/onedrive/sites/route.ts:160-167`, `:176-178`, `:273-275`; `components/connectors/onedrive-workspace-root.tsx:298-303`; `lib/connectors/adapters/onedrive-adapter.ts:24-34` | Migrate to a SharePoint site where folder creation fails, for example read-only access to that site. The connector is saved as SHARED on the new site before the folder exists, and is not put back. | "Site selection failed · Site selection failed". The title and message are the same words, and nothing says the connector now points at the new site's drive with the old root folder id, so existing files stop resolving. | "Couldn't use <site> · <Microsoft's reason>. Your current folder is unchanged." |
| Connectors | `app/api/connectors/google-drive/route.ts:431`, `:487-492`; `app/api/connectors/onedrive/route.ts:231`, `:284-289`; `app/api/connectors/onedrive/sites/route.ts:267-272`; `lib/connectors/pockett-structure.service.ts:789` | Choosing or changing the workspace folder when creating the firm, client or engagement folders fails, or when no token is available. The route logs "Non-fatal — folder structure can be retried" and answers `{ success: true }`. `repair-org-folder` has no caller, so nothing offers that retry. | "Folder created · "<name>" set as your workspace root." or "SharePoint site connected · <site> is now linked." Later, creating an engagement can fail on "Organization folder not configured; complete Drive setup first." Attaching a client does re-run setup on first-time connections, which softens this only there. | "Folder set, but we couldn't create the firm folders inside it · <reason>. Retry." |
| Connectors | `components/connectors/firm-drive-section.tsx:584-592` | Attach all clients when any attach fails. `handleAttachClient` catches its own errors, so the loop always reaches the success toast. | The per-client failure toast, followed by "Attached · Attached <N> clients to this connector." with N counting the failures. | "Attached <X> of <N> clients. Not attached: <names> · <reason>." |
| Connectors | `components/connectors/firm-drive-section.tsx:563-576`; `lib/actions/client.ts:728-730` | Attach a client when the link saves but the Drive folder fails. The server action throws `ClientLinkedFolderFailedError`. In production `e instanceof` is false and the words become error #441, so the warning branch built for exactly this case never runs. | "Attach failed · Minified React error #441; visit https://react.dev/errors/441 ...". The client shows as not attached although it is linked. The reason and the auto-filed ticket number are both lost. | "Attached with a problem · the Drive folder couldn't be set up: <reason>. Ticket <number>." |
| Files | `app/api/connectors/google-drive/import/route.ts:106-109`, `:136-138`, `:165`; `components/projects/engagement-file-list.tsx:2155-2160` | Import from Google Drive where Drive refuses one or all files. Each failure goes to `console.error` and the loop continues, and the route answers `success: true` with the count that worked. | A success toast: "Import complete · Imported 0 files from Google Drive." or "Imported 2 files" when 5 were picked. Nothing names what failed. | "Imported 2 of 5 files. Not imported: <names> · <Drive's reason>." |
| Files | `lib/google-drive-connector.ts:3982-3985`; `lib/connectors/adapters/onedrive-list-files.ts:171`, `:188`; `components/projects/engagement-file-list.tsx:3238` | The folder was moved or deleted in storage, or the connected account lost access. A 404 is returned as an empty list on both providers, and OneDrive does the same when the access check fails. | "Folder is empty". The person may upload again or recreate files that still exist elsewhere. | "This folder is no longer available in <provider>. It may have been moved or deleted there." |
| Search | `components/search/global-search-view.tsx:634`, `:736-739`, `:756-757`, `:1343`; `app/api/firms/[firmId]/search/route.ts:232` | Search fails: a 500 from the route, a network failure, or a non-JSON body. The code's own comment says null means "request failed", then the UI clears the results. | "No results found · Try a different search term or remove a filter." The failure looks exactly like "that document does not exist". | "Search couldn't run · <reason>. Try again." |
| Connectors | `components/ui/migration-progress-panel.tsx:80-86`, `:96-101`; `app/(app)/d/[groupSlug]/f/[firmSlug]/maintenance/page.tsx:53-62`; `app/api/firm/maintenance/route.ts:113-121` | Cancel migration or Unlock when the POST fails: no `.ok` check before the page moves on, and `catch { /* ignore */ }`. Also, cancel answers `{ ok: true }` when the `updateMany` matched nothing because the job has already started. | The page reloads or moves on as though it worked, with no words. The migration carries on and the workspace locks minutes later, or the person lands back on "Workspace under maintenance". | "Couldn't cancel. The migration has already started" or "Couldn't unlock · <reason>." |

```ts
// lib/billing/polar-webhook-sync.ts:191-199 (the route then answers { received: true })
const groupId = await resolveGroupForPayload(details)
if (!groupId) {
    logger.warn('Polar webhook: no group mapping found', {
        customerExternalId: details.customerExternalId,
        customerId: details.customerId,
        subscriptionId: details.subscriptionId,
    })
    return null
}
```

```ts
// app/api/connectors/google-drive/route.ts:688-690, 711 (settings were already rewritten at :670)
if (oldRoot && oldRoot !== migNewRoot) {
  const firm = await prisma.firm.findFirst({ where: { connectorId: migConnId } })
  if (firm) {
    // setMigrationPending + safeInngestSend('workspace.migrate.requested', ...)
  }
}
return NextResponse.json({ ok: true, async: true, estimatedMinutes: bodyEstMinutes ?? 5 })
```

```ts
// app/api/connectors/onedrive/sites/route.ts:160-167, 176 (no rollback in the catch at :273)
await prisma.connector.update({
  where: { id: connectionId },
  data: { workspaceRootLocation: 'SHARED', workspaceRootSharedStorageId: siteId, workspaceRootSharedStorageName: siteName ?? null },
})
const adapter = createOneDriveAdapter(async () => token)
const firmaFolderId = await adapter.findOrCreateFolder(connectionId, driveRootId, '_firma')
```

```ts
// app/api/connectors/google-drive/route.ts:487-492
} catch (provErr) {
  logger.error('update-root-folder: provisioning failed', provErr instanceof Error ? provErr : new Error(String(provErr)))
  // Non-fatal — folder structure can be retried
}

return NextResponse.json({ success: true })
```

```ts
// components/connectors/firm-drive-section.tsx:588-592
try {
  for (const client of unattached) {
    await handleAttachClient(connectorId, client.id)
  }
  addToast({ type: 'success', title: 'Attached', message: `Attached ${unattached.length} client${unattached.length === 1 ? '' : 's'} to this connector.` })
```

```ts
// components/connectors/firm-drive-section.tsx:563-565, 574 (shareConnectorWithClient is in a 'use server' file)
} catch (e) {
  const { ClientLinkedFolderFailedError } = await import('@/lib/actions/client-errors')
  if (e instanceof ClientLinkedFolderFailedError) {
    // ... never true in production
  } else {
    addToast({ type: 'error', title: 'Attach failed', message: e instanceof Error ? e.message : 'Could not link client.' })
```

```ts
// app/api/connectors/google-drive/import/route.ts:106-109, 136-138, 165
if (!metaRes.ok) {
    console.error(`[Import] Failed to fetch metadata for ${fileId}:`, await metaRes.text())
    continue
}
// ...
} catch (e) {
    console.error(`[Import] Exception processing ${fileId}:`, e)
}
// ...
return NextResponse.json({ success: true, count: importedFiles.length, skipped: skippedCount, files: importedFiles })
```

```ts
// lib/google-drive-connector.ts:3980-3985
if (!response.ok) {
  // Handle 404 (folder not found) gracefully?
  if (response.status === 404) {
    logger.debug(`[GoogleDrive] Folder not found: ${folderId}`)
    return []
  }
```

```ts
// components/search/global-search-view.tsx:736-740, then :1343 renders "No results found"
if (files === null) {
  setResults([])
  setResolvedFilters(null)
  return
}
```

```ts
// components/ui/migration-progress-panel.tsx:80-87
await fetch('/api/firm/maintenance', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
  body: JSON.stringify({ action: 'cancel-migration', firmId }),
})
onRefresh?.()
onCancelled?.()
} catch { /* ignore */ } finally {
```

### P1
| Area | file:line | Trigger | What the person sees today | What they should see |
|---|---|---|---|---|
| Billing | `app/api/checkout/route.ts:65`, `:89`, `:91`, `:133`; `components/billing/polar-plans-picker.tsx:1211`; `Checkout` in `@polar-sh/nextjs` (its catch returns `NextResponse.error()`) | Pressing a plan button sends the whole page to `/api/checkout`. Polar refuses or is down, the catalog fetch throws (no try), or the product is unknown. | They leave the app for a raw page: `{"error":"Unknown product"}` or a bare browser error, with no words from us and no way back but the back button. | Back on Billing: "Checkout didn't open · <reason>. You have not been charged." |
| Billing | `app/api/billing/customer-portal/route.ts:64-78`; `lib/billing/open-polar-customer-portal.ts:9`; `components/billing/polar-plans-picker.tsx:999-1011`; `components/billing/current-plan-summary.tsx:285-297` | Opening the portal, the only way to cancel or change plan. `.catch(() => null)` throws away Polar's answer. With no stored customer id, an outage is reported as a missing customer. A rejected fetch has no catch at all. | "Could not open billing portal right now.", or the false "No Polar customer on file yet. Complete checkout first, then try again.", or the spinner stops with no words. | "Couldn't open billing · <Polar's reason>. Your plan is unchanged." |
| Billing | `lib/billing/fetch-billing-current-plan.ts:8`; `components/billing/billing-page-client.tsx:136-141`; `components/billing/polar-plans-picker.tsx:986-993`, `:1201`; `components/billing/current-plan-summary.tsx:326-331` | `/api/billing/current-plan` fails, including on the refresh that runs on tab focus. Null state means "not on a paid plan" to the picker. | "Unable to load plan details." with no reason, while every plan card loses its Active tag and offers checkout. A paying customer can start a second subscription. | "Couldn't load your current plan · <reason>." with plan buttons held back until it loads. |
| Billing | `app/api/billing/checkout-invoice/route.ts:130-138`; `app/checkout/success/success-redirect-card.tsx:103-110`, `:159-165` | Download invoice while Polar is still generating it. The route answers 202 with the message in `error`, the client only reads `error` when `!res.ok`, and a rejected fetch has no catch. The page also redirects after 5s (10s in onboarding) while the route polls for up to 15s. | "Preparing invoice…", then nothing. The route's sentence is dropped, and the page may navigate away first. | "Your invoice is still being generated. Find it in Billing in a minute." |
| Billing | `app/checkout/success/success-redirect-card.tsx:95-110`, `:232-238` | Any return from Polar. The page never checks that the plan activated, and the redirect is a plain countdown. | "You're all set", "We'll take you back automatically when your workspace is ready." Billing can then show the old plan with upgrade buttons, inviting a second payment. | "Payment received. Activating your plan…" until the plan shows active, then "You're all set." |
| Onboarding and sign-in | `app/(app)/d/onboarding/page.tsx:585`, `:593-596`, `:652-656`, `:1025-1034`; `lib/landing/default-landing-path.ts:66-70` | First-firm provisioning fails, or `/api/firm` fails on load. The page falls to step 1, which auto-posts to `/api/onboarding/create-sandbox`. That route no longer exists (removed in #97), so this 404s every time. The landing code's comment says onboarding "will retry provisioning on next visit"; it cannot. | "Initializing workspace…", "Failed to create sandbox workspace", and a Retry that can never work. The person has no firm and no way forward, and the original reason is gone. | "We couldn't set up your workspace · <reason>. Try again or contact support." with a retry that works. |
| Connectors | `lib/google-drive-popup-oauth.ts:51`; `lib/onedrive-popup-oauth.ts:36`; `components/connectors/firm-drive-section.tsx:257`, `:362`; `app/api/connectors/google-drive/callback/route.ts:124`, `:129`, `:329-336`, `:614`, `:624`; `app/api/connectors/onedrive/callback/route.ts:135`, `:140`, `:292-299`, `:410`, `:420` | Connecting or reconnecting storage fails with a code the map doesn't know: `session_mismatch`, `invalid_state` (the state expires after 30 minutes), `forbidden`, `database_error`, `callback_error`, `no_code`, `no_user_id`. | The code itself: "Connection failed · session_mismatch". | "You're signed in as a different user than the one who started this", or "That sign-in took too long. Start again", and so on, one sentence per code. |
| Connectors | `lib/google-drive-popup-oauth.ts:217-236`, `:252-262`; `lib/onedrive-popup-oauth.ts:171-187`, `:201-209`; `components/connectors/firm-drive-section.tsx:222`, `:240` | The popup is blocked, or the person closes it. `window.open` runs after an awaited request, so blockers can catch it. A null result is only logged and `popup.closed` is never checked. | A spinner for 2 minutes, then "Sign-in timed out · Timed out waiting for Google. Please try again." Popups are never mentioned. | "Your browser blocked the sign-in window. Allow popups, then try again." or "Sign-in was closed before it finished." |
| Connectors | `lib/google-drive-popup-oauth.ts:194-215`, `:238-245`; `lib/onedrive-popup-oauth.ts:152-169`, `:189-195`; `app/api/connectors/google-drive/route.ts:761-763`; `app/api/connectors/onedrive/route.ts:367`; `components/connectors/firm-drive-section.tsx:215`, `:333` | The person already has an active connector in another firm. The status poll returns it, it isn't in this firm's prior-id list, so the poll "succeeds" within 2 seconds and removes the message listener while the popup is still open. | The spinner stops with no connector added. The popup's real answer, success or failure, is never heard, so any failure is lost and a new connector only shows after a reload. | The spinner stays until this popup answers, then its real result. |
| Connectors | `components/connectors/firm-drive-section.tsx:237` | Google initiate is refused: no rights on the firm or client, or OAuth not configured. The route's reason is in the body and is not read. The OneDrive path and the shared helper do read it. | "Connection failed · Failed to initiate Google sign-in" | The route's own reason, for example "You need to be a firm admin to connect storage." |
| Connectors | `app/api/connectors/google-drive/route.ts:718-724`; `app/api/connectors/onedrive/route.ts:338-341`; `app/api/connectors/onedrive/sites/route.ts:134-137`, `:146-149`, `:273-275`; `components/google-drive/google-drive-workspace-root.tsx:373`, `:468-470`, `:508-511`; `components/connectors/onedrive-workspace-root.tsx:253` | Any folder step in connector setup fails at the provider: no permission on the Shared Drive, out of space, read-only site. It also auto-runs for personal accounts. One catch-all hides them all and logs to `console.error`. | "Could not create folder · Internal server error", "Could not complete · Internal server error", "Site selection failed · Failed to resolve site drive". This is the exact complaint in the brief. | StorageFailure's words, for example "The Google Drive account connected to this client doesn't have permission to change this." |
| Connectors | `app/api/connectors/google-drive/route.ts:545`, `:875`, `:901`; `app/api/connectors/onedrive/route.ts:161`; `app/api/connectors/onedrive/sites/route.ts:45`, `:126`; `app/api/connectors/google-drive/upload/route.ts:100`, `:118`; `app/api/connectors/google-drive/linked-files/route.ts:733` | The connection needs renewing. `getAccessToken` returns null for revoked, errored or failed refresh, and each route invents its own words, mostly with a 500 that the upload client treats as worth retrying. | "Could not create folder · Unauthorized/Expired", "Could not load sites · Could not obtain access token", or "Failed to get access token". | "The connection to <provider> needs renewing. Reconnect the storage, then try again." |
| Connectors | `components/connectors/firm-drive-section.tsx:481-484`, `:499-505`; `app/api/connectors/onedrive/route.ts:330`, `:334`; `app/api/connectors/google-drive/route.ts:163-164` | Pressing Test connection, which people press because something is wrong. The OneDrive route returns a status and an error, and the UI reads neither. The Google route collapses to "Internal server error". | "Test failed · Could not verify connection." | "Test failed · Google Drive answered that this account has no access. Reconnect it." |
| Connectors | `components/connectors/firm-drive-section.tsx:410`, `:427`, `:439`, `:454`, `:467`, `:574`, `:611`; `lib/actions/firms.ts:694-696`, `:715-716`, `:726-728` | Disconnect, Remove, Rename or Detach fails. All are server actions that throw, and the toast shows `e.message`. | "Disconnect failed · Minified React error #441; visit https://react.dev/errors/441 ..." (same for Remove, Rename, Detach, Attach). | "Disconnect failed · <reason>", returned from the action rather than thrown. |
| Files | `app/api/connectors/google-drive/linked-files/route.ts:735`, `:746`, `:1337-1338`; `createDriveFile` in `lib/google-drive-connector.ts`; `lib/connectors/adapters/onedrive-adapter.ts:104`; `components/projects/engagement-file-list.tsx:1926-1929`; `components/projects/hooks/use-engagement-upload.ts:656` | New folder, new document or folder upload where storage refuses. This path throws a plain Error, not a StorageFailure, so the catch-all takes it. It is a real hole in the "Files already follow this" list. | "Could not create file · Internal Server Error", or "Couldn't create the folder "<name>" · Internal Server Error Nothing from this folder was uploaded past this point." | "Could not create file · <StorageFailure's words>." |
| Files | `lib/google-drive-connector.ts:3988`; `lib/connectors/adapters/onedrive-list-files.ts:174`; `app/api/connectors/google-drive/linked-files/route.ts:1337-1338`; `components/projects/engagement-file-list.tsx:3147` | Opening a folder when storage answers anything but 200 or 404, such as 403 or 429. | "Internal Server Error" in the file pane, with a link to refresh. | "<provider> refused to list this folder · <reason>." |
| Files | `components/projects/engagement-file-list.tsx:2010-2014`, `:2097-2098`, `:2130-2133`; `app/api/connectors/google-drive/route.ts:855-861` | Import from Drive by someone who isn't the connector's owner, or whose connector is revoked. The token lookup is by the person's own account, not the engagement's connector. The failure only reaches `console.error`. Later, `tokenRes` has no `.ok` check. | Pressing Import does nothing: the spinner stops with no words. On the second path: "Import failed · Missing required params". | "Only <owner> can import from this Google Drive", or "Reconnect Google Drive to import." |
| Other | `components/dashboard/firm-business-insights.tsx:88`, `:129-133`; `components/dashboard/firm-actions.tsx:153-158`; `app/api/firms/[firmId]/insights/route.ts:591` | The firm Overview's data fails to load. The error only goes to `console.error`, and "no data" and "still loading" are the same state. | Loading shimmer forever, on the firm's landing page. No message at all. | "Couldn't load this overview · <reason>. Refresh." |
| Brio | `components/dashboard/ai-firm-brief.tsx:89-92`, `:114`, `:121`; `app/api/firms/[firmId]/ai-brief/route.ts:64-65` | Rewrite with Brio when AI credits are used up. The route answers 429 with a clear message, the client throws it, and the bare `catch {` discards it. | "Could not rewrite it. The brief below is unchanged." Nothing about credits. | The route's own limit message, for example "Your plan's AI credits are used up for this period." |

### P2
| Area | file:line | Trigger | What the person sees today | What they should see |
|---|---|---|---|---|
| Billing | `app/api/billing/skip-upgrade/route.ts:21-25`; `app/api/billing/upgrade-nudge-status/route.ts:23-27`; `components/billing/billing-page-client.tsx:249-256` | "Skip for now" on `/d/billing?paid_plan=true`. It looks for a `sandboxOnly: true` firm, which no longer exists, so it always answers 404 "Firm not found". The nudge route has the same dead lookup, so that strip never shows. | "Failed to skip for now" every time. | The skip saves and the person moves on. |
| Billing | `lib/billing/polar-billing-lifecycle.ts:32-38`, `:51-58`, `:93-100` | Webhook side jobs fail: revoking the other subscriptions, restoring the free plan. They log and return, so the webhook answers 200 and is not retried until another event arrives. | Nothing. A duplicate or free subscription can stay running at Polar. | An alert to the Firma team. The customer sees nothing unless billed twice. |
| Billing | `app/api/billing/catalog/route.ts:17-23`; `components/billing/polar-plans-picker.tsx:738`, `:746` | Plans fail to load. | A raw provider or config message in the Plans section. | "Couldn't load plans. Try again in a minute." |
| Billing | `app/api/billing/subscription/cancel/route.ts:53-63` | No caller in the app. No try around the Polar call, and a DB failure after Polar has cancelled would answer 500. | Nobody sees it today. | Fix or remove before anything calls it. |
| Connectors | `app/api/connectors/google-drive/callback/route.ts:98-104`, `:196-204`; `app/api/connectors/onedrive/callback/route.ts:107-114`, `:187-196` | The provider's own `error` and `error_description` are dropped at the callback, and the token error body only goes to the log. Admin consent, org policy and bad-config cases all read the same. This is the strongest row in this table. | "Microsoft sign-in was cancelled or denied." or "Google could not finish sign-in. Try again in a moment." | "Your Microsoft admin needs to approve Firma first", or the provider's reason. |
| Connectors | `app/api/connectors/google-drive/callback/route.ts:103`, `:146`, `:627`; `app/api/connectors/onedrive/callback/route.ts:104`, `:157`, `:424`; `app/(app)/d/onboarding/page.tsx:840-842` | Redirect-flow failures go to `/d?error=...`, which nothing reads, and onboarding sends any `error` straight on to the dashboard. Every live caller sends `flow: 'popup'`, so this is reached only with a missing or unreadable state. | A normal dashboard with no message. | "Connecting storage didn't finish · <reason>." |
| Connectors | `app/api/connectors/google-drive/callback/route.ts:416-453`; `app/api/connectors/onedrive/callback/route.ts:346-377` | Reconnect revokes and un-links the old connector before saving the new tokens. A DB failure between the two leaves it revoked with no firm. | "Connection failed · database_error". The connector has gone from the firm's list. | "Reconnect failed · <reason>. Your connection is unchanged." |
| Connectors | `app/api/connectors/google-drive/route.ts:612-633`; `components/connectors/onedrive-workspace-root.tsx:186-188`, `:192-194`; `components/connectors/firm-drive-section.tsx:157`, `:173`, `:293`, `:518-524` | Smaller connector reads: the migration estimate answers zero on failure; a SharePoint list failure is always blamed on missing access; status failure, or not being the connector's owner, hides Location with no message; the switch-account modal opens empty when admins fail to load. | "about 1 minute" for a large folder; "Reconnect this account to grant SharePoint site access, then try again." whatever the cause; a missing section; an empty list; "Failed to load connectors · Could not fetch storage connectors." | The real reason on each, or "Only <owner> can change this location." |
| Support | `components/support/support-store.ts:50`, `:76`, `:87`, `:110`; `app/api/support/requests/route.ts:58`; `.../comments/route.ts:74`; `.../status/route.ts:70`; `.../attachments/route.ts:74`, `:133`; `.../upload-attachment/route.ts:112` | Any support action fails. The routes return a raw `error.message` (Prisma text, if ever shown) and the store replaces it with fixed words. | "Couldn't send your reply", "Couldn't change the status", "Couldn't load requests". The action is named but no reason is given. | The action plus a plain reason. |
| Settings | `app/api/account/export/route.ts:135`; `app/api/account/deletion-request/route.ts:85-100`, `:107`, `:136-138`; `app/api/account/sessions/route.ts:23`; `components/account/data-privacy-card.tsx:60-64`, `:85-89`; `components/account/sessions-card.tsx:26` | Export, deletion request or sign-out-everywhere fails. A failed deletion-status read answers 200 with `open: null`. The team's email is fire and forget while the toast promises email later. | "Could not build your export · Please try again, or contact support if it keeps failing." and similar, with no reason. | The same, with a reason where one is known. |
| Search | `components/search/global-search-view.tsx:386-398`; `app/api/firms/[firmId]/search/picker-data/route.ts:68` | Picker data fails to load. | "Nothing available" in the @ picker. | "Couldn't load options." |
| Other | `components/audit/audit-with-filters.tsx:610-613`, `:661`, `:1057-1061`; `app/api/firms/[firmId]/audit/route.ts:133`; `.../audit/filters/route.ts:61` | Audit or its filters fail. | "Failed to load audit" with no reason; filter dropdowns silently empty. | "Couldn't load activity · <reason>." and "Couldn't load filters." |
| Onboarding and sign-in | `app/(app)/d/onboarding/page.tsx:605-609`, `:1000-1006`; `app/api/firms/default-slug/route.ts:24-26`; `app/checkout/success/success-redirect-card.tsx:135-138` | A network error shows developer wording. `default-slug` answers 200 "not complete" on a DB failure. A failed progress save after checkout only logs, and on the legacy flow the person can be shown the plan step again after paying. | "Connection error. Please ensure the database is running (e.g. supabase start for local dev) and try again." | "Connection error. Check your connection and try again." |
| Other | No caller found by grep, so nobody sees these. `app/api/provision/route.ts:172`; `app/api/firms/route.ts:59`; `app/api/onboarding/create-org/route.ts:161`, `:215-224`; `.../create-client/route.ts:62-70`; `.../create-project/route.ts:105-107`, `:123-131`; `.../test-org/route.ts:125`; `.../create-custom-workspace/route.ts:126`, `:204-212`; `.../domain-options/route.ts:81`; `.../detect-orgs/route.ts:32`; `.../import-orgs/route.ts:32`; `app/api/firms/[firmId]/drive-alerts/route.ts:96-110`, `:301`, `:400`; `.../logo/route.ts` POST and DELETE (`:275`); `app/api/connectors/route.ts`; `.../google-drive/test/route.ts:55`; `.../linked-files/route.ts:118`, `:165`; `.../google-drive/route.ts:256-259`, `:920`; `.../callback/route.ts:488-547` (unreachable: `:478` requires no client, `:488` requires one); onboarding steps 3 and 4 (`page.tsx:536-552`, no `setStep(3)` exists) | Generic or misleading answers on dead paths. Several map "could not get access token" to "Database is unreachable. For local dev, run supabase start". | Nothing today. | Fix or delete if any of these comes back. |
| System admin | `app/api/system/reprovision-firms/route.ts:128-137`, `:142`, `:152`; `.../platform-maintenance/route.ts:55` (send after the config is saved, no try); `.../integrations/status/route.ts:41`, `:66`, `:83`, `:120`, `:164`; `.../entitlements/route.ts:75`, `:98`, `:154`; `.../email-delivery/route.ts:53`, `:95`; `.../sessions/route.ts:27`; `.../stuck-firms/route.ts:115`; `.../admin-scripts/route.ts:28`; `.../admin-scripts/[scriptId]/route.ts:37`; `.../inngest-jobs/route.ts:197`; `.../user-data-map/reindex/route.ts:136`; `.../firm-groups/route.ts:32`; `.../ai-efficacy/route.ts:37`; `.../account-deletion/route.ts:61`; `.../account-deletion/plan/route.ts:47`. Also `app/api/demo/documents/route.ts:404`, `:442`; `.../search/route.ts:368`; `.../folder/[folderId]/route.ts:399`; `.../stream/route.ts:58`, `:86` (demo: no importer of `lib/api-client.ts` found) | Admin-only generic or raw messages. Worst: reprovision counts a firm as `queued` although `safeInngestSend` swallows failures and no Inngest function listens for `sandbox.provision.requested`, so it reports work that never runs. | "Failed to reprovision firms", a raw provider message, or a false "queued" count. | The real reason, and a count only of what actually started. |

### Deliberate, not findings
- 5 billing cap pre-checks that fail open: the server enforces the cap at the write (`components/projects/hooks/use-engagement-upload.ts:160`).
- 3 best-effort reads in current-plan: Polar backfill and AI credits keep DB values and must not break the page (`app/api/billing/current-plan/route.ts:104`).
- 1 webhook catch that answers 500: a throw reaches it through `Promise.all` in the Polar helper, so Polar retries, which is right (`app/api/webhooks/polar/route.ts:113-124`).
- 2 cancellation reminder catches: nothing for the person to do (`lib/billing/polar-billing-lifecycle.ts:141`).
- 2 invoice retries: a 404 is expected until Polar finishes generating (`app/api/billing/checkout-invoice/route.ts:125`).
- 6 workspace location backfills: filled in on the next status read (`app/api/connectors/google-drive/route.ts:424`).
- 4 breadcrumb and folder-name lookups: cosmetic, the row just shows less (`app/api/connectors/google-drive/route.ts:591`).
- 4 OAuth state and id_token decodes: fall back to a safe default, and the state is verified separately (`app/api/connectors/google-drive/callback/route.ts:33`).
- 3 JWT metadata writes: repaired on the next settings read (`app/api/onboarding/ensure-org/route.ts:63`).
- 1 middleware maintenance check: must never block navigation on a DB error (`app/api/firm/maintenance-by-slug/route.ts`).
- 2 per-user name lookups: only an avatar or name goes missing (`app/api/firms/[firmId]/search/route.ts:198`).
- 3 Brio enhancements: the brief card hides or serves the stale brief, and search falls back to raw text with a note (`app/api/firms/[firmId]/search/interpret/route.ts`).
- 10 `request.json().catch(() => null)`: the next line validates and answers 400 (`app/api/account/deletion-request/route.ts:44`).
- 2 popup status polls: the next tick or the timeout covers them (`lib/google-drive-popup-oauth.ts:211`).
- 1 maintenance status poll: the next interval retries (`lib/hooks/use-firm-maintenance-status.ts`).
- 3 platform maintenance emails: best effort after the state is saved (`app/api/system/platform-maintenance/route.ts:64`).

### Patterns
- **Legacy `Firm.connectorId`.** New connectors set `Connector.firmId`, and only `lib/services/connection-manager.ts:53` and `createFirmWithMember` (when passed a connector, on routes with no caller) write the old column. Six lookups still rely on it: `google-drive/route.ts:190`, `:295`, `:434`, `:689`; `onedrive/route.ts:233`; `onedrive/sites/route.ts:228`. This causes the Migrate P0. The firm logo route has the same dependency through `firm.connector`.
- **StorageFailure stops at the file actions.** Folder creation, folder setup, listing and upload start all throw plain Errors with the provider's status and body, and three catch-alls turn them into "Internal server error": `google-drive/route.ts:721`, `onedrive/route.ts:340`, `linked-files/route.ts:1338`. Fixing those three and the throws behind them covers several P1 rows at once.
- **`getAccessToken` returns null instead of a reason** (`lib/google-drive-connector.ts:2714`). Each caller then invents words: "Unauthorized/Expired", "Could not obtain access token", "Failed to get access token". A `reconnect` StorageFailure would be one place.
- **"Non-fatal — can be retried" with no retry.** Three provisioning catches say this and `repair-org-folder` has no caller. `lib/actions/client.ts:668-675` already records this exact lesson for attach; the same fix never reached these routes.
- **`safeInngestSend` swallows failures on paths that tell the person a job started** (Migrate, reprovision). Fire and forget suits indexing, but not these.
- **Custom error classes and `e.message` across the server action boundary** throughout `firm-drive-section.tsx`, including the one branch written to handle partial success.
- **Vestigial sandbox reads.** `skip-upgrade`, `upgrade-nudge-status`, the deleted `create-sandbox` route and onboarding steps 3 and 4 all still assume a sandbox firm or a Drive step that is gone.
- **API routes used as full page navigations** (`/api/checkout`) answer JSON into the address bar, so every error there becomes a raw page.
- **The two popup helpers repeat the same gaps:** the unmapped-code fallthrough, no blocked or closed detection, and a poll that isn't scoped to the firm. `firm-drive-section.tsx:222` also bypasses the Google initiate helper, which is why it loses the reason OneDrive keeps.
- **Stores and clients replace the route's reason with fixed words** (`support-store.ts`, `data-privacy-card.tsx`, `ai-firm-brief.tsx`), so a good server message never arrives.

### Could not tell
- What the browser shows exactly when the Polar helper returns `NextResponse.error()` from a route handler. Either way it carries no words from us.
- How often the webhook's no-group case happens. The checkout route always sets the group as the external id, but `extractSubscriptionDetails` prefers the Polar customer's existing external id over our metadata, so a customer already mapped elsewhere could miss. It has a real payment behind it, so I rated it P0 as briefed.
- Whether any production firm row still has `Firm.connectorId` set. Such a firm takes the second Migrate trigger instead of the first. Memory says prod has only Deepak.
- Whether OneDrive "Migrate" is meant to leave files behind. `update-root-folder` and the site POST repoint the connector and clear derived folder ids, but I found no file-move job for OneDrive, while the toast says "SharePoint site connected" and Google's flow does move files. This could be a P0 if people expect a move, but I could not settle the intent from the code.
- How a person reaches `/d/billing?paid_plan=true`. Only `/pricing` sets `paid_plan`, on its signup link, and I found nothing that forwards it to Billing.
- Whether `void sendEmail` in the deletion request finishes on Vercel after the response is sent. The ticket row exists either way and `/api/system/account-deletion` lists it.
- The Files P0 on 404 assumes Drive answers 404 when listing a folder the account can no longer see. The code treats 404 as this case, but I did not test it against Drive.
- The upload toast at `components/projects/hooks/use-engagement-upload.ts:421-422` lists file names with no reason, which also hides the "Failed to get access token" row. I did not read the upload overlay, so a per-file reason may appear there. Left for the pass covering Uploads.

---

## Pass C: lib/** and app/actions/**
Read: about 70 files in full or in the relevant part (all of `lib/actions/**`, `app/actions/**`, `lib/inngest/functions.ts`, the adapters, `lib/files/**` lock and stage code, and the Drive connector's write and permission methods), every in-scope line of candidate lists 2, 7 and 8, the in-scope lines of 4 and 4b, plus about 45 calling components and routes followed to see the words. Findings: P0 21, P1 24, P2 16. Deliberate: about 105.

Literal "#441 text" below means: "Minified React error #441; visit https://react.dev/errors/441 ...".

### P0
| Area | file:line | Trigger | What the person sees today | What they should see |
|---|---|---|---|---|
| Files | `lib/google-drive-connector.ts:3160,3176,3180,3193`, `app/api/connectors/google-drive/linked-files/route.ts:1189,1200`, `components/projects/hooks/use-engagement-file-ops.ts:752` | Copy a folder to another engagement on Google Drive. Any child refused, the child listing fails, or the folder has over 100 children (the listing asks for one page, always). | "Copied · {name} copied to the selected engagement." The root folder's creation alone counts as a result, so even every file failing is success. Provider's reason goes to the log only (`copyFileWithToken`, line 3142). | "Copied 12 of 15 files to Acme Audit. Not copied: Budget.xlsx (Google Drive has it locked), Q3.pdf, Notes.docx." If nothing copied, an error that says why. |
| Uploads | `app/api/connectors/google-drive/import/route.ts:106,134,136`, `components/projects/engagement-file-list.tsx:2157,2160` | Import from Drive picker. A pick's metadata read or copy fails. Same `recursiveCopy` for folders. | "Import complete · Imported 3 files from Google Drive." The two that failed are not mentioned. All fail: "Import complete · Imported 0 files from Google Drive." | "Imported 3 of 5. Not imported: X, Y. Google Drive refused them." Zero imported is an error toast. |
| Sharing | `lib/sync-document-sharing.ts:49,57,126,131`, `app/api/projects/[projectId]/documents/[documentId]/sharing/route.ts:535,570,757,783`, `lib/inngest/functions.ts:736`, `components/files/document-share-modal.tsx` | Turn sharing off for a role, or remove sharing. Every time, not only on a failure. The sync clears `connectorPermissionId` on GRANTED rows before the revoke job reads them. Regrant writes GRANTED rows with the id. | "Saved · Share settings updated." Firma says REVOKED. The job finds no id ("No users to revoke"), so the Drive permission stands and its id is gone, so no later job can retry. | Sharing off really takes Drive access back, and if it can't: "Sharing is off in Firma, but Google Drive still lets ana@client.com open Budget.xlsx. Retry." |
| Sharing | `lib/connectors/revoke-share-permissions.ts:59,62,68,71,81`, `lib/inngest/functions.ts:651,654,749,751,816,818` | Any revoke job where Drive or OneDrive refuses (`failed`), or no connector is left (`unreachable`). | Nothing. The job finishes green, so Inngest never retries. Rows show REVOKED in Firma. `unreachable` rows also lose the id for good. The only trace is a log line. "A later revoke" only happens if another event fires. | A notice to the lead in the Inbox: "Couldn't take back access to Budget.xlsx for ana@client.com. Google Drive refused. Retry." |
| Members and invites | `lib/actions/members.ts:221,224,263`, `lib/inngest/functions.ts:762,763`, `components/projects/members/member-list.tsx:111` | Remove a member while Drive or OneDrive refuses a revoke, or the connector is down. | "Member Removed · User access has been revoked." `allSettled` result unread, then the FK cascade drops the rows and their ids. The retry job `revokeByRemovedMember` listens for `project.member.removed`, which nothing sends (only `engagement.member.removed` is sent), so it never runs. | "Removed from Acme Audit. Google Drive still gives them access to 3 files: A, B, C." with a Retry. |
| Members and invites | `lib/actions/members.ts:235,240,243`, `lib/grant-engagement-drive-folder-access.ts:59,62,63`, `lib/google-drive-connector.ts:3719,3722`, `components/projects/members/member-list.tsx:111` | Remove a Lead or Contributor. Every time on both storages. Grants land on General, Confidential and Staging; the revoke looks only at the engagement root, finds no permission and answers "already revoked". OneDrive has no folder revoke at all. | "Member Removed · User access has been revoked." They keep write access to General (and Confidential and Staging for a Lead) in Drive. | Same message only once the folder permissions are gone. If not: "Removed in Firma. They can still open General in Google Drive." |
| Members and invites | `lib/inngest/functions.ts:802,803,805`, `lib/actions/members.ts:371,381,400`, `components/projects/members/member-list.tsx:93` | Lower a role: Lead to Contributor or Reviewer, Contributor to Reviewer. Every time. The job only revokes when the old role was Contributor · Limited Access or Reviewer. | "Role Updated · Member role has been updated." Their Drive folder write access is unchanged. | Role change also changes Drive access, or: "Role updated in Firma. Their Google Drive access to General hasn't changed." |
| Members and invites | `lib/grant-engagement-drive-folder-access.ts:50,51`, `lib/google-drive-connector.ts:3571,3574,3580`, `lib/connectors/adapters/onedrive-permission-adapter.ts:596,601`, `lib/actions/engagement-membership.ts:146`, `lib/inngest/functions.ts:851,861,904,906` | Joining an engagement, or a role raised, when Drive refuses the folder grant. The adapter returns null, never throws, and the result is dropped. | Lead sees the person as joined. Person lands in Files; Drive says they need access. Job returns `{ granted: true }` regardless. A OneDrive tenant's sharing policy block (`GraphSharingPolicyError`) lands in the same log-only catch. Per-document grants heal at secure open; folder grants for firm members do not. | To the lead: "Ana joined, but Google Drive refused to share General with her: {reason}. Retry." |
| Members and invites | `lib/actions/invitations.ts:220,222`, `lib/actions/firm-members.ts:290,292`, `lib/actions/client-members.ts:203,205`, `components/projects/members/member-list.tsx:143`, `components/projects/members/firm-members-tab.tsx:89,247`, `components/projects/members/client-members-tab.tsx:75,182` | Resend an invitation; the mail server refuses. | "Invitation resent" every time. Engagement tab's pill then says "Email failed", contradicting the toast. Firm and client tabs hardcode `status="PENDING"`, so the pill says "Invited". The action returns no sign of the failure. | "Couldn't email ana@client.com. The mail server refused it. Try again." |
| Board and deliverables | `lib/actions/project.ts:820,823,832,835,844`, `lib/connectors/adapters/google-drive-adapter.ts:289,293`, `lib/connectors/firm-folder-access.ts:25,26,35`, `components/projects/engagement-settings-form.tsx:166` | Delete an engagement. Revokes unread, then the cascade drops the rows, so the later `project/archived` job finds nothing. That job's folder step reads `isDeleted: false` and returns "none", always. Restrict-to-owner reads no DELETE answers, only touches the root, and OneDrive has no such method. | "Engagement deleted · Engagement has been removed." Clients and firm members can keep Drive access to its files. | "Engagement deleted. Google Drive still gives 2 people access to its folder. Open it in Drive to remove them." |
| Board and deliverables | `lib/connectors/firm-folder-access.ts:40,72,75,79`, `lib/inngest/functions.ts:699,701,704,706`, `lib/actions/project.ts:497,498,499`, `components/projects/engagement-settings-form.tsx:153` | Mark an engagement Completed or reopen it, and Drive refuses for a member. `failed` is a count returned to Inngest and read by nobody. No connector: silently nothing. | "Saved · Engagement properties updated." Some members keep write on Completed work; or after a reopen stay read-only with no reason. | "Completed. 2 people couldn't be set to read-only in Google Drive: A, B. Retry." |
| Approvals | `lib/files/storage-lock.ts:29,37,38,41`, `lib/google-drive-connector.ts:3350,3355`, `lib/connectors/adapters/onedrive-permission-adapter.ts:220,273`, `lib/files/approval-archive.ts:171,175,177`, `components/ui/document-action-menu.tsx:315` | Finalize or Approve when listing permissions fails (returns `[]`), a role change is refused (`false`, skipped), or read-only is refused (ignored; always false on OneDrive). | "Version locked · Others can only view this file until you unlock it." Approve moves to Approved. Editors can still edit in Drive. The header of `approval-archive.ts` says the approval is refused when any step fails; these failures never raise, so it isn't. | "Couldn't lock this in Google Drive: ana@client.com can still edit." Approval refused with that reason. |
| Approvals | `lib/files/storage-lock.ts:48,61,64`, `app/api/projects/[projectId]/documents/[documentId]/sharing/unlock/route.ts`, `components/ui/document-action-menu.tsx:351` | Unlock when Drive refuses to restore a role. `patchFilePermissionRole`'s answer unread, then the route deletes the lock record, which held the only list of who was downgraded. | "Unlocked · Edit access restored. An approved document goes back to To do; its approval stays on record." Those people stay view-only and nothing can restore them. | "Unlocked in Firma. Couldn't restore edit access for ana@client.com. Retry." Keep the list until restored. |
| Connectors | `lib/inngest/functions.ts:935,938,941,943,1065,1071`, `lib/firm-maintenance.ts:248,250,251`, `app/api/connectors/google-drive/route.ts:675,689`, `app/(app)/d/d-layout-client.tsx:91`, `components/ui/migration-progress-panel.tsx:288` | Workspace root move gives up, or some items fail. `onFailure` clears maintenance first, which marks the run `completed`, so `getActiveMigration` returns null and `failed` is never written. The root is already switched before the job starts. Partial failures go to `firm.settings.migrationWarnings`, which nothing reads. `updateMigrationFile` is never called, so the panel never counts a move or a failure. | The page reloads with no words. Missing files look like an empty workspace. No firm linked by the legacy field (`route.ts:689`): no job at all, and the route still answers `{ ok: true }`. | Banner to the firm admin: "Workspace move stopped. 14 of 60 items moved; the rest are still in the old folder. Retry." |
| Connectors | `lib/actions/client.ts:14,730`, `lib/actions/client-errors.ts:8`, `components/connectors/firm-drive-section.tsx:564,565,574` | Attach a client to a connector; folder setup fails. | Production: "Attach failed · #441 text". `instanceof` is always false in the browser, so `linkClientLocally` never runs: the client shows unattached though `Client.connectorId` is set. The ticket number in the message never arrives (the ticket is filed). | "Attached with a problem. The Drive folder couldn't be set up: {reason}. Support ticket #123 filed." Client shown as attached. |
| Connectors | `lib/actions/client.ts:703,715,716`, `components/connectors/firm-drive-section.tsx:592` | Attach a client whose engagement folder fails (inner catch logs and continues), or Attach all where one client fails (`handleAttachClient` swallows its own error). | "Attached · Client linked to this connector." Attach all: "Attached 5 clients to this connector." right after an error toast for one of them. | "Attached. 1 engagement has no folder yet: Acme Audit." Attach all: "Attached 4 of 5. Not attached: Beta." |
| Other | `lib/actions/engagement-wiki.ts:242,246,248,262,155,156`, `lib/actions/engagement-wiki.ts:188` (create uses the client's connector), `components/projects/wiki/wiki-editor.tsx:50,51,156`, `app/(app)/d/[groupSlug]/f/[firmSlug]/c/[clientSlug]/e/[engagementSlug]/[[...rest]]/page.tsx:117` | Dossier (beta flag) on a firm with no legacy `Firm.connectorId`. Read, save and delete use that field, while create uses the client's. `resolve-client-connector.ts` says firm connectors are no longer the source of truth. | Typing shows "Saved". Nothing is written. Reload: blank page. | "Couldn't save this page. Your changes are still here. Retry." |
| Other | `components/projects/wiki/wiki-editor.tsx:62,65,66,50`, `lib/actions/engagement-wiki.ts:160,162,287` | Dossier page, Drive read fails for a moment. | An empty, editable page. The first keystroke autosaves after 1.5 seconds and overwrites the real file with almost nothing. Data at risk. | "Couldn't load this page from Google Drive. Editing is off until it loads. Retry." |
| Onboarding and sign-in | `lib/actions/firms.ts:99,101`, `app/(app)/d/(landing)/group-picker.tsx:216`, `components/projects/firm-list.tsx:71`, `components/billing/billing-page-client.tsx:83` | `/d`, group picker, firm picker or billing, when the firm query fails. | "No workspaces yet · Create your own workspace to get started." or "No firms found". One click creates a real extra workspace. Billing's "Could not load your workspaces." can't fire for this. | "Couldn't load your workspaces. Try again." and no Create action. |
| Notifications and inbox | `lib/home/home-firms.ts:59,61`, `lib/home/my-work.ts:377,379`, `lib/actions/inbox.ts:24,55,57`, `components/home/home-view.tsx:98`, `components/inbox/inbox-view.tsx:190,543` | Home or Inbox when the query fails. | "All caught up. Approvals, comments, changes requested and mentions show up here." / "You're all caught up" / Home's "Nothing here yet". A reviewer can walk away from waiting approvals. | "Couldn't load what's waiting on you. Try again." |
| Members and invites | `lib/actions/members.ts:36`, `components/projects/members/engagement-members-tab.tsx:41,42`, `components/projects/members/firm-members-tab.tsx:74,75`, `components/projects/members/client-members-tab.tsx:60,61` | Members tab when the action throws. | "0 people" and an empty list. Log only. | "Couldn't load members. Try again." |

#### Code to check, P0
Drive folder copy (`lib/google-drive-connector.ts`):
```ts
3160  if (!metaRes.ok) return
3176  const listRes = await fetch(`.../files?q=...&fields=files(id)`, ...) // no pageToken
3180  if (listRes.ok) { ... }                // no else
3192  const copied = await this.copyFileWithToken(accessToken, id, parentId, meta.name)
3193  if (copied) { results.push(...) }      // null: file silently absent
```
Import (`import/route.ts`):
```ts
106  if (!metaRes.ok) { console.error(...); continue }
134  const results = await googleDriveConnector.recursiveCopy(fileId, parentId, accessToken)
136  } catch (e) { console.error(`[Import] Exception processing ${fileId}:`, e) }
```
Sharing off (`sync-document-sharing.ts`, then `functions.ts`):
```ts
55  data: { sharingPermissionStatus: REVOKED, connectorPermissionId: null, ... }
// sharing/route.ts:757 awaits that, then :783 sends sharing.settings.updated. The job:
736 if (shouldRevoke && user.connectorPermissionId) { usersForRevocation.push(...) }
```
Revoke outcome ignored (`functions.ts`):
```ts
786 const revokeResults = await step.run("revoke-drive-permissions", () => revokeSharePermissions(...));
788 await step.run("cleanup-db", () => markSharesRevoked({ id: { in: ... } }, revokeResults.failed));
790 return { message: "Revoked for removed member", revokedCount: sharesToRevoke.length };
```
Remove member (`members.ts`):
```ts
221 await Promise.allSettled(sharingRows.filter(...).map((s) => adapter.revokePermission(...)))
263 await tx.engagementMember.delete({ where: { id: memberId } }) // FK cascade drops the ids
309 await safeInngestSend('engagement.member.removed', ...)      // not project.member.removed
```
Wrong folder (`grant-engagement-drive-folder-access.ts`, `members.ts`):
```ts
59  await grant(folderIds.generalFolderId, 'editor')
62  await grant(folderIds.confidentialFolderId, 'editor')
240 await googleDriveConnector.revokeFolderPermissionByEmail(connectorId, member.engagement.connectorRootFolderId, memberEmail)
```
Role lowered (`functions.ts`):
```ts
802 const revokablePersonas = ['eng_viewer', 'eng_ext_collaborator'];
803 const shouldRevoke = oldPersonaSlug && revokablePersonas.includes(oldPersonaSlug);
805 if (!shouldRevoke) return { message: "No revocation needed" };
```
Grant dropped (`grant-engagement-drive-folder-access.ts`, `functions.ts`):
```ts
50  await adapter.grantFolderPermission(connectorId, folderId, email, r, { notify: false }) // null on refusal
851 await grantEngagementDriveFolderAccess({ ... });
861 return { granted: true };
```
Resend (`firm-members.ts`, `firm-members-tab.tsx`):
```ts
290 } catch (err) { logger.error(...); await prisma.firmInvitation.update({ data: { status: ERROR } }) }
89  resendFeedback.confirm({ id, name: email, title: 'Invitation resent' })
247 <StatusPill kind="invitation" status="PENDING" ... />
```
Engagement delete (`project.ts`, `firm-folder-access.ts`):
```ts
820 await Promise.allSettled(sharingRows...map((s) => adapter.revokePermission(...)))
835 await storageAdapter.restrictFolderToOwnerOnly?.(clientConnectorId, project.connectorRootFolderId)
844 await tx.engagementMember.deleteMany({ where: { engagementId: projectId } })
26  where: { id: projectId, isDeleted: false },  // then `if (!engagement?.connectorRootFolderId) return none`
```
Completed (`firm-folder-access.ts`, `functions.ts`):
```ts
75  if (done) result.changed++
76  else result.failed++
79  if (result.failed > 0) { logger.warn(...) }
701 async ({ event, step }) => step.run("downgrade-firm-folder-access", () => setFirmFolderAccess(event.data.projectId, 'read_only'))
```
Lock (`storage-lock.ts`):
```ts
29  const perms = await permissionAdapter.listFilePermissions(connectorId, externalId) // [] on failure
37  const ok = await permissionAdapter.patchFilePermissionRole(connectorId, externalId, p.id, 'viewer')
38  if (ok) downgraded.push({ permissionId: p.id, previousRole: prev })                 // no else
41  await permissionAdapter.setFileContentReadOnly(connectorId, externalId, true)       // answer unread
```
Unlock (`storage-lock.ts`, `unlock/route.ts`):
```ts
61  if (role) await permissionAdapter.patchFilePermissionRole(connectorId, externalId, row.permissionId, role)
64  await permissionAdapter.setFileContentReadOnly(connectorId, externalId, false)
    delete nextSettings.lock   // the only record of `downgraded`
```
Migration (`functions.ts`, `firm-maintenance.ts`):
```ts
938 setMaintenanceMode(firmId, null),
941 const migration = await getActiveMigration(firmId)   // status in pending_grace, in_progress
943 if (migration) await updateMigrationStatus(migration.id, 'failed')
250 const nextStatus = migration.status === 'failed_partial' ? 'failed_partial' : 'completed' // inside setMaintenanceMode(null)
```
Attach (`client.ts`, `firm-drive-section.tsx`):
```ts
730 throw new ClientLinkedFolderFailedError(`Client linked, but the Drive folder could not be set up: ${message}.${ticketSuffix}`)
565 if (e instanceof ClientLinkedFolderFailedError) { linkClientLocally(); addToast({ type: 'warning', ... }) }
574 else addToast({ type: 'error', title: 'Attach failed', message: e instanceof Error ? e.message : ... })
```
Attach inner loop (`client.ts`, `firm-drive-section.tsx`):
```ts
715 } catch (engErr) {
716     logger.error('[shareConnectorWithClient] Failed to provision engagement folder', ...)
592 addToast({ type: 'success', title: 'Attached', message: `Attached ${unattached.length} client...` })
```
Dossier save dropped (`engagement-wiki.ts`, `wiki-editor.tsx`):
```ts
246 const connectorId: string | undefined = row?.engagement?.firm?.connectorId
248 if (connectorId) { /* the Drive write is inside this */ }
50  await updateWikiPage(page.id, { content: markdown })
51  setSaveState('saved')
```
Dossier blank then overwrite (`wiki-editor.tsx`, `engagement-wiki.ts`):
```ts
62  getWikiPageContent(page.id).then((text) => { ... }).catch(() => {
66      if (!editor.isDestroyed) editor.commands.setContent('')
287 await contentAdapter.overwriteFileContent(connectorId, driveFileId, Buffer.from(patch.content, 'utf-8'), 'text/plain')
```
Firms load (`firms.ts`):
```ts
99  } catch (err) {
100     logger.error('Error fetching user firms (V2)', err as Error)
101     return []
```
Home and Inbox (`home-firms.ts`, `inbox.ts`):
```ts
60  logger.error('getHomeFirms failed', e as Error, 'Home', { userId })
61  return { firms: [], unavailable: [] }
56  logger.error('getNeedsYou failed', e as Error, 'Inbox')
57  return []
```
Members tab (`engagement-members-tab.tsx`):
```ts
41  } catch (error) {
42      logger.error("Failed to fetch members data", ...)   // state stays [], toolbar says "0 people"
```

### P1
| Area | file:line | Trigger | What the person sees today | What they should see |
|---|---|---|---|---|
| Settings | `components/projects/add-client-modal.tsx:182`, `lib/actions/client.ts:65,84,106`, `lib/billing/effective-billing-caps.ts:222` | New client: name taken, plan limit. | Notice in the dialog: #441 text. Thrown words lost: "A client with this name already exists", "Your plan allows 5 clients. Upgrade to add more." | Those same words. |
| Board and deliverables | `components/projects/add-engagement-modal.tsx:163`, `lib/actions/project.ts:112,134,138,267`, `lib/billing/effective-billing-caps.ts:183` | New engagement: name taken, plan limit, storage setup failed. | #441 text. Also the thrown words say "Google Drive" on OneDrive. If rollback fails (`project.ts:262,264`) the engagement exists though the person was told it failed. | "Couldn't create this engagement. {StorageFailure words}" |
| Settings | `components/projects/add-firm-modal.tsx:121`, `lib/actions/firms.ts:310,323`, `lib/billing/firm-creation-gate.ts:154` | New firm: plan gate, name taken, or `updateFirm` fails right after `createFirm` succeeded. | #441 text. In the half-done case the firm exists; retrying gives #441 again (name taken). | "A firm with this name already exists." and for half-done: "Firm created, but its details weren't saved." |
| Board and deliverables | `components/projects/engagement-settings-form.tsx:156,171`, `components/projects/engagement-header.tsx:99`, `lib/actions/project.ts:438,451` | Edit an engagement: due date before a deliverable's, or edit while Completed. | "Update failed · #441 text" and "Couldn't update {what} · #441 text". The thrown sentence names the deliverable and the date, and says what to do. | The thrown sentence. |
| Members and invites | `components/projects/members/invite-member-modal.tsx:121`, `components/projects/members/firm-invite-modal.tsx:38`, `components/projects/members/client-invite-modal.tsx:39`, `lib/actions/invitations.ts:67,70`, `lib/actions/firm-members.ts:150,179,193`, `lib/actions/client-members.ts:87,111,124` | Invite someone who already joined, is mid-accept, or is already a member, or you may not invite. | Notice: #441 text. | The thrown words: "A member with this email is already in the firm". |
| Members and invites | `components/projects/members/member-list.tsx:98,115,132,147`, `components/projects/members/firm-members-tab.tsx:92,108,124`, `components/projects/members/client-members-tab.tsx:78,94`, `lib/actions/firm-members.ts:111` | Remove, revoke, resend or change a role fails. | "Error · Failed to remove member." "Error · Failed to revoke invitation." "Failed to Send · Could not resend the invitation." Role change: "Update Failed · #441 text". A reason such as "Cannot remove the last Firm Administrator" is thrown and discarded. | Toast named for the action, with the reason returned from the action. |
| Connectors | `components/connectors/firm-drive-section.tsx:410,427,439,454,467,611`, `lib/actions/firms.ts:694,695,715,726,759,760` | Disconnect, remove, rename, detach fails. | "Disconnect failed · #441 text", same for Remove, Rename, Detach. | Named reason. |
| Settings | `components/projects/client-settings-form.tsx:359,417,432`, `components/projects/client-contacts-tab.tsx:69,166,372`, `components/projects/client-header.tsx:52`, `lib/actions/client.ts:281,457,458,575` | Save or delete a client, contacts, client status. | "Update failed · #441 text", "Delete failed · #441 text", "Failed · #441 text", "Failed to load · #441 text". Lost: "Only firm admins can delete a client", "Owner must be a member of this firm", the contact plan limit. | The thrown words. |
| Settings | `components/projects/firm-settings-form.tsx:416,480,496`, `components/projects/firm-switch-dialog.tsx:68`, `app/(app)/d/(landing)/group-picker.tsx:140`, `lib/actions/firms.ts:395` | Save or delete a firm, switch firm or workspace. | "Save failed · #441 text", "Delete failed · #441 text". Switch dialog shows #441 text. Lost: "You do not have access to this firm". | The thrown words. |
| Files | `components/projects/engagement-file-list.tsx:921`, `lib/actions/project.ts:912,924` | "Set up storage folder" fails. | "Setup failed · #441 text". | "Couldn't set up the folder. {StorageFailure words}" |
| Brio | `components/projects/engagement-insights-dashboard.tsx:2596,2842,2867`, `components/projects/summary-draft-review.tsx:247`, `lib/actions/project.ts:992,996,1003` | Publish, dismiss or save the engagement summary fails. | Nothing. `try` and `finally` with no `catch`, called from an `onClick`. The spinner stops, the draft stays, unhandled rejection. | "Publish failed. {reason}" |
| Other | `components/projects/wiki/wiki-editor.tsx:50,84`, `components/projects/wiki/engagement-wiki-tab.tsx:30,36,66,72,79`, `components/projects/wiki/wiki-sidebar.tsx:121,146`, `lib/actions/engagement-wiki.ts:108,110,120,127` | Any Dossier action throws. None of these call sites has a `catch`. | Editor stuck on "Saving…" forever. New page, new section and delete do nothing. Failed load: spinner forever. Reorder: stays moved on screen, not saved. | "Couldn't save this page. {reason}" |
| Members and invites | `lib/actions/firm-members.ts:202,235`, `lib/actions/client-members.ts:132,156`, `components/projects/members/firm-invite-modal.tsx:38`, `components/projects/members/firm-members-tab.tsx:247` | First firm or client invite; mail server refuses. | #441 text in the dialog. The invitation is already saved and shows "Invited" once the tab refreshes, though no email left. | "Couldn't email ana@client.com. The mail server refused it. Try again." with the row marked "Email failed". |
| Members and invites | `lib/actions/invitations.ts:105,107,162,164`, `components/projects/members/invite-member-modal.tsx:117,118,119`, `lib/ui/status.ts:135` | First engagement invite; mail server refuses. | Dialog closes as success with no toast. Only a small "Email failed" pill on the row, for those who look. | "Invitation saved, but the email wasn't sent. Try again." |
| Members and invites | `lib/actions/engagement-membership.ts:280,301,302,303` | Adding someone who already has an account; the "added to engagement" email fails. | Inviter sees the same success. The person is never told. Logged only. | "Added Ana, but couldn't email her. Let her know yourself." |
| Onboarding and sign-in | `app/(app)/invite/[token]/page.tsx:20`, `lib/actions/invitations.ts:276,299,330` | Open an expired invite link (7 days), or the lookup fails. | The app's not-found page, on purpose ("don't expose token validity"). No reason, no next step. A database failure lands the same way. | "This invitation has expired. Ask whoever invited you to send a new one." |
| Files | `lib/connectors/adapters/onedrive-file-ops.ts:102,118,123,130,132,156`, `app/api/connectors/google-drive/linked-files/route.ts:1183`, `components/projects/hooks/use-engagement-file-ops.ts:752` | OneDrive folder copy runs past 30 seconds, or the monitor URL stops answering. After 30 tries the code looks for that name in the destination and calls it done if found, so a folder still copying, or an older folder of the same name, is success. Later failure is never seen. A single Graph call means no per-file result is possible. | "Copied · {name} copied to the selected engagement." | The existing `timed_out` words: "OneDrive is taking longer than expected. Refresh in a minute to see if it finished." |
| Approvals | `lib/files/approval-archive.ts:124,125,127,192,194,196`, `lib/connectors/adapters/google-drive-adapter.ts:289,293`, `lib/connectors/adapters/onedrive-permission-adapter.ts:273` | Approve; the Archive can't be made owner-only or read-only. Drive's version reads no answers. OneDrive has no restrict method and read-only is always false. | The document shows Approved. The Archive copy can be editable and open to whoever inherits the folder. Code comment says "The archive itself mustn't drift". | "Approved. The archive copy couldn't be locked in OneDrive." |
| Approvals | `app/api/projects/[projectId]/documents/[documentId]/sharing/activity/route.ts:180,182`, `lib/files/approval-archive.ts:220` | Approve; the storage steps succeed, then a database write fails. | "Failed to update activity". The file is locked and copied. If the stage moved but `recordApproval` failed, the lock record and `downgraded` list are lost. A retry makes a second archive copy. | "Approved in storage, but Firma couldn't record it. Retry." |
| Board and deliverables | `lib/files/apply-stage-change.ts:95,98,145,146`, `lib/sync-document-sharing.ts:136,137`, `lib/document-sharing-access.ts:37` | Move a deliverable forward. Client access rows are written after the response, in an unawaited promise that logs on failure. | The card moves. Clients told nothing, and if the rows weren't written a secure open is refused. | "Moved to In review, but clients couldn't be given access. Retry." |
| Sharing | `lib/actions/client.ts:580,588`, `lib/actions/firm-members.ts:114,131`, `components/projects/client-settings-form.tsx:427`, `components/projects/members/firm-members-tab.tsx:121` | Delete a client, or remove a firm member. No Drive revoke is attempted. | "Client deleted · Client has been removed." "Member Removed · The firm member has been removed." Drive access stands. | Say what's left: "Their access in Google Drive isn't changed. Open Drive to remove it." |
| Sharing | `lib/inngest/client.ts:19,28,31` | Inngest can't be reached when any revoke, grant or cleanup event is sent. Swallowed by design, and every P0 revoke and grant depends on it. | Same success as always. The job never exists, so nothing can retry. | Lead told the follow-up didn't start, or the event queued durably. |
| Files | `lib/connectors/trash-undo.ts:17,18,20,22`, `lib/inngest/functions.ts:483,484,570,571` | Undo a trash, then Drive can't answer at the check 60 seconds later. Rare, but not reversible. | "Restored" earlier. Then Firma's row, comments and sharing rows are deleted for a file that came back. | Treat "couldn't reach storage" as try again, never as "still trashed". |
| Search | `lib/actions/quick-search.ts:101,103`, `components/shell/command-menu.tsx:109,235`, `lib/services/search-service.ts:471,490,546,615,997,1051,1109,1180`, `lib/connectors/adapters/onedrive-permission-adapter.ts:292` | Search fails: database or Graph. | `No results for "budget"`. Doc search and ⌘K alike. A person concludes the file isn't there. | "Search couldn't run. Try again." |

### P2
| Area | file:line | Trigger | What the person sees today | What they should see |
|---|---|---|---|---|
| Connectors | `lib/connectors/adapters/google-drive-adapter.ts:42,71,206,325`, `lib/connectors/adapters/onedrive-adapter.ts:58`, `lib/connectors/pockett-structure.service.ts:28` | Drive read fails while setting up or finding folders. `[]` reads as "no such folder". | A duplicate folder on Drive, or "no existing structure" in onboarding. | A failed read stops the setup and says so. |
| Search | `lib/inngest/functions.ts:229,241,260`, `lib/connectors/adapters/onedrive-permission-adapter.ts:183` | Index scan can't list a folder. | Nothing; files quietly missing from search. | No person waiting. Job should fail so it retries. |
| Files | `lib/google-drive-connector.ts:2166` | Versions on a 403. | The pane reads as no versions. | "Google Drive won't show versions for this file." |
| Files | `app/api/connectors/google-drive/linked-files/route.ts:1172`, `lib/google-drive-connector.ts:4219,4222` | Metadata read fails during copy to another engagement. | The copy is named with the raw file id, and a folder takes the file path. | Stop with the failure's reason. |
| Other | `lib/actions/engagement-wiki.ts:255,257,323,327` | Dossier rename or delete refused by Drive. | Rename: Firma's title changes, Drive's doesn't. Delete: page gone from Firma, file stays in Drive. No word either way. | "Deleted here, but the file is still in Google Drive." |
| Members and invites | `lib/actions/members.ts:67,70`, `lib/actions/firm-members.ts:85,173`, `lib/actions/client-members.ts:60,105` | Auth lookup fails. | "Unknown User" in the list. The duplicate-invite check silently passes. | Failed lookup marked as such. |
| Other | `lib/email.ts:54,56` | `SMTP_HOST` unset. | `sendEmail` returns as if sent. Only `/system/email-delivery` checks `isEmailConfigured`. | Throws outside local development. |
| System admin | `lib/platform-maintenance.ts:169,170,171`, `lib/firm-maintenance.ts:335,357` | Maintenance emails fail. | Admin not told how many failed. Log only. | "Sent to 40 of 42." |
| Billing | `lib/billing/polar-billing-lifecycle.ts:32,33,51,53,93,95`, `lib/billing/fetch-billing-current-plan.ts:8`, `lib/billing/entitlement-resync.ts:211` | Webhook-time Polar calls fail, or the current plan load fails. | Nobody waiting at webhook time; log only. A failed plan load reads as no plan. | Failed load says so. Webhook failures reach an operator. |
| Other | `app/actions/send-otp.ts:97`, `lib/actions/system-admin-signup.ts:127`, `lib/actions/profile.ts:60` | Supabase refuses. | Supabase's raw words. | Our words. |
| Marketing site | `app/actions/submit-contact.ts:69,73`, `app/actions/submit-waitlist.ts:81,85` | Captcha refused. The throw sits inside the `try`, so its own catch rewrites it. | "Failed to verify captcha." for a plain refused captcha. | "Captcha validation failed. Please try again." |
| Notifications and inbox | `lib/actions/user-reminders.ts:122,147,162` | Session gone when marking a reminder done or hidden. | Returns as if done. | "Sign in again to update this." |
| Other | `lib/actions/client.ts:580,588`, `lib/actions/firms.ts:590,597` | Delete fails after the audit event fired. | Audit says deleted. Person sees the failed toast. | Audit after the write. |
| Files | `lib/inngest/functions.ts:509,518,525,552,594,603,625` | Cleanup after trash: revokes and PDF trashing unread, or no adapter. | Nothing. A later restore in Drive brings back old access. | Job records what it couldn't do. |
| Board and deliverables | `lib/actions/client.ts:194`, `lib/services/project.service.ts:144`, `lib/actions/project.ts:253` | Folders not created at client or onboarding project creation, or no project folder id returned. | Success. Heals on first engagement or via "set up" in Files. | Note that storage isn't ready. |
| Connectors | `lib/google-drive-connector.ts:1258,2672,3228,3280`, `lib/connectors/adapters/onedrive-permission-adapter.ts:339,384`, `lib/connectors/registry.ts:283,291,303,335`, `lib/connectors/engagement-file-scope.ts:39` | Dashboard duplicate and stale reads fail. OneDrive migration adapter returns `[]` (not reachable today: the route allows Google only). A scope check read failing answers "not in this engagement". | "No duplicates" style results; refusal with the wrong reason. | Failed read says so. |

### Deliberate, not findings
- 20 reminder upserts and removals with `.catch(() => {})`: the person's action is done, a missed reminder is minor (`lib/actions/client.ts:211`).
- 8 notification and push fan-outs in log-only try blocks: nothing for the actor to do (`lib/inngest/functions.ts:121`).
- 7 reminder cleanup `allSettled` in jobs: a stale reminder is harmless and self-correcting (`lib/inngest/functions.ts:1293`).
- 3 JWT metadata refreshes: the app rechecks on next request (`lib/actions/firms.ts:418`).
- 2 permission-cache fallbacks: fall through to the database check (`lib/actions/hierarchy.ts:95`).
- About 20 browser-storage wrappers: private mode, nothing to tell (`lib/chat-storage.ts:142`).
- 6 recents and bookmarks: convenience lists, not acted on as truth (`lib/recents.ts:145`).
- 2 badge and digest counters: a missing badge isn't a claim (`lib/actions/inbox.ts:42`).
- 5 audit, Sentry and metering catches: must not cost the action (`lib/audit/emit.ts:61`, `lib/ai/firm-brief.ts:322`).
- About 8 AI and summarization fallbacks: fail open with no state change (`lib/summarization.ts:12`).
- 3 Polar probes where a miss means "new customer" (`lib/billing/polar-free-plan.ts:364`).
- 2 insights Drive scans: extra data, non-fatal (`lib/insights/engagement-insights.ts:886`).
- 4 sandbox population catches: sandbox is dead (`lib/inngest/functions.ts:341`).
- 12 `getFileText` and index-time null reads: a file simply isn't text-indexed (`lib/google-drive-connector.ts:2331`).
- 2 waitlist emails fire and forget: signing up succeeded (`app/actions/submit-waitlist.ts:224`).
- `serverActionWrapper` (`lib/server-action-wrapper.ts`) returning `{ error }` is the good shape: every `app/actions/**` and `system-admin-signup` throw reaches a person. Same for `acceptInvitationAction`, `createOwnWorkspace`, `updateProfileNames`.

### Patterns
**1. Thrown action errors (item 7).** Of 224 `throw new Error`: 37 are safely returned by `serverActionWrapper`, 22 in `invitations.ts` never reach the browser as a throw (`verifyInvitation` runs in a server component, `acceptInvitation` goes through `acceptInvitationAction`), and **165 reach the browser as #441**. Indirect throws add to these, not counted: `requireEngagementManager` (3), the plan caps in `effective-billing-caps.ts` (6), `firm-creation-gate.ts:154`, `requireAccess` ("Upgrade required", when `ENFORCE_BILLING_GATES` is on), `StorageFailure` from the Dossier write.

| File | Crosses raw | Reason a person needs | Not allowed | Stale id or programmer check |
|---|---:|---:|---:|---:|
| `lib/actions/client.ts` | 44 | 5 | 24 | 15 |
| `lib/actions/project.ts` | 27 | 9 | 5 | 13 |
| `lib/actions/firm-members.ts` | 21 | 6 | 10 | 5 |
| `lib/actions/firms.ts` | 19 | 3 | 10 | 6 |
| `lib/actions/client-members.ts` | 18 | 5 | 8 | 5 |
| `lib/actions/members.ts` | 11 | 0 | 5 | 6 |
| `lib/actions/engagement-wiki.ts` | 11 | 4 | 3 | 4 |
| `lib/actions/invitations.ts` | 9 of 31 | 4 | 2 | 3 |
| `lib/actions/connectors.ts` | 4 | 0 | 3 | 1 |
| `lib/actions/user-reminders.ts` | 1 | 0 | 1 | 0 |
| **Total** | **165** | **36** | **71** | **58** |
| Safe via wrapper: `system-admin-signup` 7, `submit-contact` 7, `submit-waitlist` 6, `get-waitlist-status`, `-leaderboard`, `-count` 4 each, `send-otp` 3, `get-referral-stats` 2 | 37 | | | |

Words that matter most, in order:
- Plan limits: `effective-billing-caps.ts:183,201,222,243`, `firm-creation-gate.ts:154`.
- Name taken: `client.ts:84`, `project.ts:112`, `firms.ts:323`.
- Due date rule, which says exactly what to do: `project.ts:451`. Also `project.ts:438`.
- Storage failed: `project.ts:267`, `client.ts:730`.
- Already a member, already joined, mid-accept: `firm-members.ts:179,193`, `client-members.ts:111,124`, `invitations.ts:67,70`.
- Last admin: `firm-members.ts:111`. Delete rights: `client.ts:575`.
- Publish gate: `project.ts:1003`.
- Plain not-allowed checks (`Unauthorized`, `Insufficient permissions`) are 71 of 165. People rarely hit them, and they read fine once returned.

The one-place fix is for actions to return `{ error, code }`, as `serverActionWrapper` and `createOwnWorkspace` already do, instead of throwing. Components calling them then stop catching a #441.

**2. Custom error classes crossing the boundary.** `ClientLinkedFolderFailedError` is confirmed always false at `firm-drive-section.tsx:565`, and it's the only `instanceof` on a server action in a component. `lib/actions/report-action-failure.ts` has one caller (`client.ts:720`), and its ticket number only lives in that thrown message, so it never arrives. The ticket is filed; no person ever learns its number. `StorageFailure` thrown in `updateWikiPage` crosses too, and its good words are lost. `SubscriptionRevokedError`, `ApiError`, `ApprovalStorageError`, `StorageNotSupportedError`, `ConnectorContentError`, `GraphSharingPolicyError`, `AccessError`, `AiCreditLimitError`, `GoogleDriveAuthError` are all checked server side in routes, which is fine. `AiTimeoutError` and `AiAbortedError` are thrown in the browser, also fine. No component matches on thrown words with `.message.includes`.

**3. Provider answers as `boolean` or `null`, read by nobody.** `grantFolderPermission`, `grantFilePermission`, `revokePermission`, `patchFilePermissionRole`, `setFileContentReadOnly`, `revokeFolderPermissionByEmail`, `restrictFolderToOwnerOnly` all flatten the provider's answer. `StorageFailure` already exists for rename, move and copy; none of these use it, which is why grants, revokes and locks fail silently. Bringing permission methods to the same shape fixes the root of P0 rows 3 to 8 and 10 to 13.

**4. `Promise.allSettled` on permission work.** Five sites never read the result, and each then deletes the rows that held the ids: `members.ts:221`, `project.ts:668,820`, `functions.ts:518,603`. The rule "keep the id until the revoke is confirmed" is already written in `revoke-share-permissions.ts` and `private-documents.ts`; `sync-document-sharing.ts:57,99,131` and `restoreClientAccess` break it.

**5. Jobs with no way to report.** `grep onFailure` finds one, on `migrateWorkspaceRoot`, and it mislabels the run. No revoke or grant job has one, and most wouldn't trip it because they don't throw on a refusal. There's no place for a job to tell a person. `createEventNotifications` could be it.

**6. `Firm.connectorId`.** Comments say it's legacy, but Dossier reads, `reconcile*` jobs, the migration trigger (`route.ts:689`) and the sharing finalize and unlock routes still read it. Where it's null they do nothing or refuse, without saying so.

**7. Pagination.** Three listings ask for one page and treat it as everything: `recursiveCopy` (100), `listFolderChildren` (100), `findOrCreateFolder` on OneDrive. Folder copy is the one with a user-visible cost.

### Could not tell
- `GoogleDriveConnector.revokePermission` (`lib/google-drive-connector.ts:3294`) is the one permission call without `supportsAllDrives=true`, and line 3300 counts 404 as "already gone". If Drive answers 404 for Shared Drive items without that flag, as I recall it does, **every revoke on a Shared Drive reports success and revokes nothing**, and the id is then cleared. Not tested against a real Shared Drive. Worth checking first, because it would turn "sometimes" into "always" for those firms.
- Whether a Graph folder copy creates the destination folder before it finishes. That decides how often the OneDrive 30-second fallback gives a false "Copied".
- Whether unawaited `Promise.resolve().then(...)` work (`apply-stage-change.ts:95,163`, `sharing/route.ts:535`) reliably finishes after the response on Vercel. If not, the P1 stage row gets worse, and the PUT-path race in the sharing P0 may run differently.
- `FirmService.deleteFirm`: no revoke by grep, not read further. Whether any Drive clean-up happens elsewhere.
- `lib/ai/files-agent/run.ts:260` breaks out of a run on a failed turn. I did not trace what the person is told about a partial run. Memory says it isn't run against a real Drive.
- Whether Graph's `/permissions` listing and `/children` page at 200 for these calls, which would affect the OneDrive downgrade (`onedrive-permission-adapter.ts:112`) and the copy fallback (`onedrive-file-ops.ts:125`).
- I judged #441 text from the brief; I did not run a production build.

---

## Pass D: Delivery work surfaces (components/projects, files, comments, google-drive, search, calendar, ui/document-action-menu, ui/upload-progress-panel, app/(app)/d engagement pages)
Read: 270 in-scope candidate lines (lists 3, 3b, 4, 4b, 5, 6, 8, 9, with overlap) across 48 files, plus about 25 other files: neighboring components and the routes and actions they call, where the words depended on them. Findings: P0 19, P1 41, P2 21. Deliberate: 34.

All paths are relative to `frontend/`.

### P0
| Area | file:line | Trigger | What the person sees today | What they should see |
|---|---|---|---|---|
| Uploads | components/projects/hooks/use-engagement-upload.ts:259-269, :393-400 | The bytes reach storage, then `index-file` answers 403 (plan limit), 500, or the connection drops | Green tick, "Uploads complete 3/3", toast "Upload complete". No document row exists, so the route's own comment (index-file/route.ts:78-81) says the file 404s on preview, download and sharing, permanently | Row in red: "In storage, but not added to Firma · <server's reason>", with Retry |
| Uploads | components/projects/hooks/use-engagement-upload.ts:273-282 | Limited Access contributor or Reviewer uploads; `index-file-intake` fails (it answers 500 for the plan limit too). Not awaited, no `.ok` check | Green tick and "Upload complete". No row, no reminder or email to any Lead, nothing in the review queue. The uploader believes it was submitted | "Uploaded, but not sent for review · <reason>", with Retry |
| Files | components/projects/engagement-file-list.tsx:1036-1051; app/api/projects/[projectId]/documents/bulk-download/route.ts:62, :112, :129-130 | Bulk download where some files can't be read, or the selection expands past 100 files | "Download complete 1/1" with a tick. The ZIP is missing files. The route sets `X-Bulk-Download-Skipped` and `-Failed` so the client can warn; the client never reads them. The cap of 100 has no signal at all | "Downloaded 98 of 120 · 22 left out: <names or reason>" |
| Files | components/projects/engagement-file-list.tsx:1042, :1053, :2977-2980, :3005 | Bulk download route answers 500 or the connection drops | Header "Download complete 0/1" and a red cross. `item.error` is set but never drawn; the cross has no title either | "Download failed · <reason>" |
| Uploads | components/projects/engagement-file-list.tsx:2155-2160; app/api/connectors/google-drive/import/route.ts:107-108, :119, :137, :165 | Import from Google Drive where a picked file can't be read or copied (the route logs and carries on) | Success toast "Import complete · Imported 2 files from Google Drive." or even "Imported 0 files". Failures are not counted. "skipped N already in firma" also counts files skipped for being owned by the connector elsewhere, which are not in this engagement | "Imported 2 of 3 · Couldn't import report.pdf: <reason>" |
| Board and deliverables | components/projects/shares/deliverable-detail-panel.tsx:258-268, :367 | "Move to trash" on a document row in the deliverable pane. The route `/documents/[id]/trash` does not exist (no such folder under app/api/projects/[projectId]/documents/[documentId]/), so this 404s every time | Row disappears, no toast. The file is untouched and comes back on reload. Fails on 100% of uses | "Moved to trash" with the provider's trash, or "Move to trash failed · <reason>" |
| Board and deliverables | components/projects/shares/deliverable-detail-panel.tsx:220-235 | Document assignee PATCH refused or connection drops. No `.ok`, no catch | The new assignee stays on the row, no message. Reverts on reload | Assignee goes back. "Couldn't change the assignee · <reason>" |
| Sharing | components/projects/shares/deliverable-detail-panel.tsx:727-755, with :603-608 and :665 | Settings tab toggles (allow download, PDF only, watermark): PUT answers 403, 402 or 500. Or the first load failed, so the toggles show defaults and flipping one saves all four defaults over the real settings | Toggle stays flipped, spinner ends, no message. A lead who turned off a Reviewer's download believes it is off. Only a dropped connection gets "Error · Failed to save delivery settings." | Toggle flips back. "Couldn't save delivery settings · <reason>". On a failed load: "Couldn't load these settings", toggles locked |
| Board and deliverables | components/projects/shares/deliverable-detail-panel.tsx:778-797, :665-675 | Description PUT refused. Or the load failed, so the box is blank and typing overwrites the real description | Spinner ends, text stays, reads as saved. The file pane's copy of this field already says "Not saved" (asset-details-pane.tsx:361) | "Not saved · <reason>" beside the label |
| Board and deliverables | components/projects/shares/deliverable-detail-panel.tsx:677-687, :693-694, :998, :1085 | The `subtasks` request fails | "No documents yet" and "No files in this deliverable yet." The person may upload again | "Couldn't load this deliverable's documents · <reason>", with Retry |
| Board and deliverables | components/projects/shares/engagement-shares-tab.tsx:1589-1594, :2249-2258 | `/shares` fails. Catch only logs | Empty Board: "No deliverables yet · Mark a folder as a Deliverable from the Files tab to see it here" | "Couldn't load the Board · <reason>", with Retry |
| Comments | components/projects/document-doc-comments-pane.tsx:499-513 | Comment with @mentions posts, then a per-person PATCH is refused or drops. `.catch(() => {})`, no `.ok` | Comment appears; a set reminder shows its bell. The person mentioned is never notified and nobody is told. One half of a two-part change dropped | "Comment posted, but Anna wasn't notified · <reason>", with Retry |
| Files | components/projects/hooks/use-engagement-file-ops.ts:683, :691, :293; components/projects/file-organize-dialogs.tsx:227 | Move/Copy picker's folder list fails | "No subfolders here. Use the path above to go back, or move into this folder." It invites the action, and the file lands in the wrong folder | "Couldn't load folders · <reason>", with Retry, no Move here until it loads |
| Files | components/files/asset-details-pane.tsx:156-167, :334-343 | Details pane: `sharing` request fails (non-ok, or rejected into `.catch(() => {})`) | Blank Description "What is this file for?", "No assignee", and no Approvals section, for a file that may have all three. Typing saves over the real description | "Couldn't load this file's details · <reason>", with Retry; fields read-only until then |
| Search | components/search/global-search-view.tsx:631-634, :736-739, :756-757, :1343 | Firm search answers 500 or the connection drops. The comment at :632 knows the difference; the screen doesn't | "No results found · Try a different search term or remove a filter." The person concludes the document isn't there | "Search failed · <reason>", with Retry |
| Search | components/projects/engagement-search-context.tsx:151-157; components/projects/engagement-search-panel.tsx:558-559 | Engagement search answers non-ok or drops | "No results · Nothing in this engagement matches "q"." | "Search failed · <reason>", with Retry |
| Approvals | app/api/projects/[projectId]/documents/[documentId]/intake/route.ts:194-196, :298-300; components/projects/hooks/use-engagement-file-ops.ts:599, :626-629; components/projects/shares/engagement-shares-tab.tsx:1704 | Reject or withdraw an upload; the provider's trash call fails. The route has already deleted the row, logs, and answers ok | "File rejected · "x" has been removed." The rejected file stays in storage with no Firma record, so nothing can act on it again | "Rejected, but the file is still in storage · <reason>" |
| Other | components/projects/wiki/wiki-editor.tsx:62-68, :43-51 | Dossier (beta). Page content fails to load. The catch sets the editor to empty | Blank page, "Saved". The first keystroke autosaves over the real page in storage | "Couldn't load this page · <reason>", with Retry; editor read-only |
| Other | lib/actions/engagement-wiki.ts:242, :246, :248; components/projects/wiki/wiki-editor.tsx:50-51 | Dossier (beta). `updateWikiPage` reads the legacy `firm.connectorId`. When it is null the storage write is skipped and the action returns normally. By reading only: see Could not tell | Typed text, "Saved". Empty after reload (`getWikiPageContent` reads the same column, :155-156) | "Not saved · <reason>" |

#### P0 code

Uploads, `index-file` answer dropped (use-engagement-upload.ts:259-269):
```ts
docIdRequestSettled = fetch(`/api/projects/${projectId}/index-file`, { /* … */ })
    .then(() => undefined).catch(e => logger.error('Failed to trigger indexing', e))
// and finishRun, :393-400, one batch for the whole run:
await fetch(`/api/projects/${projectId}/index-file`, { /* … */ })
    .catch(e => logger.error('Failed to trigger batch indexing', e))
```

Uploads, intake call not awaited (use-engagement-upload.ts:273-282):
```ts
if (isExternalPersona && projectId) {
    fetch(`/api/projects/${projectId}/documents/${finalFile.id}/index-file-intake`, { /* … */ })
        .catch(e => logger.error('Failed to trigger intake indexing', e))
}
return { success: true, finalFile, docIdRequestSettled }
```

Bulk download, partial ZIP (engagement-file-list.tsx:1042-1051; the route's headers are never read):
```ts
if (!res.ok) throw new Error('Failed to create ZIP')
const blob = await res.blob()
// …
setDownloadQueue(prev => prev.map(i => i.id === queueItem.id ? { ...i, status: 'done', name: filename } : i))
```

Bulk download, failure reads as complete (engagement-file-list.tsx:2977-2980, :3005):
```tsx
{downloadQueue.some(i => i.status === 'preparing')
    ? 'Preparing download…'
    : `Download${downloadQueue.length > 1 ? 's' : ''} complete`
} {downloadQueue.filter(i => i.status === 'done').length}/{downloadQueue.length}
{item.status === 'error' && <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />}
```

Import (import/route.ts:106-109, :136-138, :165; engagement-file-list.tsx:2160):
```ts
if (!metaRes.ok) { console.error(/* … */); continue }
// …
} catch (e) { console.error(`[Import] Exception processing ${fileId}:`, e) }
return NextResponse.json({ success: true, count: importedFiles.length, skipped: skippedCount, files: importedFiles })
// browser:
addToast({ type: 'success', title: 'Import complete', message })
```

Deliverable pane, trash (deliverable-detail-panel.tsx:258-268):
```ts
await fetch(`/api/projects/${projectId}/documents/${subtask.documentId}/trash`, {
  method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` },
})
onRemoveSubtask?.(subtask.id)
} catch { /* ignore */ }
```

Deliverable pane, assignee (deliverable-detail-panel.tsx:222-234):
```ts
onAssigneeChange?.(subtask.id, userId, member?.name ?? null, member?.email ?? null, member?.avatarUrl ?? null)
try {
  // …
  await fetch(`/api/projects/${projectId}/documents/${subtask.documentId}/assignee`, { method: 'PATCH', /* … */ })
} finally { setSavingAssignee(false) }
```

Deliverable pane, delivery settings (deliverable-detail-panel.tsx:732-746, :665):
```ts
await fetch(`/api/projects/${projectId}/documents/${documentId}/sharing`, { method: 'PUT', /* all four options */ })
} catch {
  addToast({ type: 'error', title: 'Error', message: 'Failed to save delivery settings.' })
}
// load, :665: if (sharingRes.ok) { setSharingOptions(…) }, no else: the defaults stand and get saved
```

Deliverable pane, description (deliverable-detail-panel.tsx:786-793):
```ts
await fetch(`/api/projects/${projectId}/documents/${documentId}/sharing`, {
  method: 'PUT', /* … */ body: JSON.stringify({ description: val }),
})
} catch {
  addToast({ type: 'error', title: 'Error', message: 'Failed to save description.' })
```

Deliverable pane, documents as empty (deliverable-detail-panel.tsx:677, :693-694, :1084-1085):
```tsx
if (subRes.ok) { /* setSubtasks */ }
} catch {
  // non-critical
}
) : subtasks.length === 0 ? (
  <p className="py-1 text-small text-fg-subtle">No files in this deliverable yet.</p>
```

Board as empty (engagement-shares-tab.tsx:1589-1594, :2253):
```ts
if (!response.ok) throw new Error('Failed to fetch shares')
// …
} catch (error) {
  logger.error('Failed to fetch shares data', /* … */)
}
// render: searchQuery.trim().length > 0 || filterOverdue ? 'No matches' : 'No deliverables yet'
```

Comment mentions (document-doc-comments-pane.tsx:501-510):
```ts
for (const { userId } of recipients) {
  fetch(`/api/projects/${engagementId}/documents/${documentId}/doc-comments`, {
    method: 'PATCH', /* … */ body: JSON.stringify({ messageId: newMsg.id, recipientId: userId, dateValue: dateVal }),
  }).catch(() => {})
}
setMessagesWithAnyMention((prev) => new Set(prev).add(newMsg.id))
```

Move/Copy picker (use-engagement-file-ops.ts:683, :691; file-organize-dialogs.tsx:227):
```tsx
.then((r) => (r.ok ? r.json() : { files: [] }))
// …
.catch(() => setDestinationFolders([]))
// render:
<ListEmpty>No subfolders here. Use the path above to go back, or {action} into this folder.</ListEmpty>
```

Details pane (asset-details-pane.tsx:156-167):
```ts
if (sharingRes.ok) {
    const settings = (await sharingRes.json()).sharing?.settings ?? {}
    // setAssigneeId, setDescription, setApprovals
}
// …
})().catch(() => {})
```

Firm search (global-search-view.tsx:634, :736-739, :756-757, :1343):
```tsx
if (!res.ok) return null
// …
if (files === null) { setResults([]); setResolvedFilters(null); return }
// …
} catch { setResults([]) }
<EmptyPanel icon={<Search />} title="No results found" description="Try a different search term or remove a filter." />
```

Engagement search (engagement-search-context.tsx:151-157):
```ts
} else {
  logger.error('Search API failed', new Error(await res.text()))
  setProjectSearchState(projectId, { searchResults: [] }, () => getRecentSearches(projectId))
}
} catch (e) {
  logger.error('Search failed', e as Error)
  setProjectSearchState(projectId, { searchResults: [] }, () => getRecentSearches(projectId))
```

Reject (intake/route.ts:285, :298-300; use-engagement-file-ops.ts:599):
```ts
await prisma.engagementDocument.delete({ where: { id: doc.id } })
// …
await adapter.trashFile(connectorId, fileInfo.externalId).catch((e) => {
  console.error('[intake] trashFile error', { /* … */ })
})
// browser: `"${file.name}" ${action === 'approve' ? 'is now available to all.' : 'has been removed.'}`
```

Dossier, blank on failed load (wiki-editor.tsx:62-68):
```ts
getWikiPageContent(page.id).then((text) => {
    if (!editor.isDestroyed) editor.commands.setContent(text || '')
    setContentLoading(false)
}).catch(() => {
    if (!editor.isDestroyed) editor.commands.setContent('')
    setContentLoading(false)
})
```

Dossier, "Saved" with no write (engagement-wiki.ts:242-248; wiki-editor.tsx:50-51):
```ts
engagement: { select: { firm: { select: { connectorId: true } } } },
// …
const connectorId: string | undefined = row?.engagement?.firm?.connectorId
if (connectorId) { /* the only place content is written */ }
// browser:
await updateWikiPage(page.id, { content: markdown })
setSaveState('saved')
```

### P1
| Area | file:line | Trigger | What the person sees today | What they should see |
|---|---|---|---|---|
| Uploads | components/projects/hooks/use-engagement-upload.ts:76, :318 | Provider refuses the PUT: storage full, file locked, no permission | Row: "Upload failed: 403" (or 507, 423). The provider's answer is only logged. A locked OneDrive file can land here, the same case that started this audit | "Upload failed · OneDrive has this file locked" |
| Uploads | components/projects/hooks/use-engagement-upload.ts:304, :329, :344-354 | Big file to Google Drive: one whole-body PUT with a hard 5-minute limit | Progress climbs, drops to 0 twice with no word, ends "Upload timed out." Retry hits the same limit. Nothing says size is the cause | "Timed out after 5 minutes · Too large for this connection" |
| Uploads | components/projects/hooks/use-engagement-upload.ts:654-658 | Folder upload where one subfolder can't be created | Toast "Couldn't create the folder "x" · <reason> Nothing from this folder was uploaded past this point." In fact no file from the whole selection went up (files only start at :669). Folders already made stay, empty; the list isn't refreshed; the panel vanishes | "Folder upload stopped · No files were uploaded. 3 empty folders were created" |
| Files | components/projects/engagement-file-list.tsx:3028-3031, :3057, :1737 | Bulk trash, some or all fail | Header "Moved to trash 0/3", red crosses. The reason is only in a hover title on the icon | "Moved 1 of 3 to trash", each failed row with its reason in words |
| Uploads | components/projects/engagement-file-list.tsx:2014, :2097-2098 | "Import from Google Drive": the token request fails | Nothing at all. `console.error` only | "Couldn't open Google Drive · <reason>" |
| Files | components/projects/engagement-file-list.tsx:1229-1231, :1246, :1250-1253 | Deep link, any failure: 500, dropped connection, deleted file. The result is cached, so the promised retry never happens | "Link unavailable · You do not have access to this item." A false reason. `resolveStatus` is known and unused | "Couldn't open this link · <reason>"; the access wording only on 403 |
| Files | components/projects/engagement-file-list.tsx:555, :580-593 | `/sharing/ids` fails | Every mark vanishes with no message: deliverable icons, Internal only, inside-a-deliverable state. Rows read as plain files | "Couldn't load sharing status", keep the last known marks |
| Files | components/projects/hooks/use-engagement-file-ops.ts:703, :710-712; components/projects/file-organize-dialogs.tsx:352 | Copy to another engagement: list fails | "No other engagements available." | "Couldn't load engagements · <reason>" |
| Files | components/projects/hooks/use-engagement-file-ops.ts:330 | Opening a folder in the Move/Copy picker fails | Title "Error", "Could not load folder" | "Couldn't open <folder> · <reason>" |
| Files | components/projects/engagement-file-row.tsx:299-306 | Row's remove-bookmark: refused, no `.ok`; dropped connection | Refused: nothing, the bookmark stays. Dropped: "Error · Failed to remove bookmark." | "Couldn't remove the bookmark · <reason>" |
| Files | components/ui/document-action-menu.tsx:442, :456, :426-429, :466-468; components/files/document-versions-timeline.tsx:91, :104 | Download route fails. It has reasons (download-share/route.ts:44, :95, :176, :262); the browser reads only the status | Tray: "Download failed" or "Download not permitted". No session or an outer throw: nothing at all | "Download failed · <server's reason>" |
| Files | lib/use-secure-open-document.ts:193, :195, :278 | Open in Drive/OneDrive refused | Any 403: "Your access to this document has been revoked. Please contact your engagement lead." Everything else: "Unable to open this document. Please try again or contact support." The server's words are dropped except for one code | The server's reason, in the modal |
| Files | components/files/document-blob-preview-pane.tsx:144; app/api/projects/[projectId]/documents/[documentId]/preview/route.ts:170 | Preview fails: the PDF, sheet, text and archive panes all hand off to this iframe | Raw JSON in the pane: `{"error":"Failed to fetch document content from storage"}` | "Preview not available · <reason>", with Reload |
| Files | components/files/document-image-preview-pane.tsx:101; components/files/document-media-preview-pane.tsx:43, :50 | Image, video or audio preview answers an error. No `onError` | Broken-image icon, or a black pane with dead controls. No words | "Preview not available · <reason>" |
| Board and deliverables | components/projects/shares/deliverable-detail-panel.tsx:713-724 | Deliverable Lead change refused | Lead snaps back with no word. With no session it keeps the new value, unsaved (:717) | "Couldn't change the Lead · <reason>" |
| Board and deliverables | components/projects/shares/engagement-shares-tab.tsx:1616, :1622, :1627 | Board reorder refused | "Move failed · Could not save the new position. The board has been restored." Reason dropped. No session: no rollback, no message | "Move failed · <reason>" |
| Board and deliverables | components/projects/shares/engagement-shares-tab.tsx:1664-1666, :1672-1674 | Demote from the Board refused | "Demote failed · Could not demote the deliverable to a folder. Please try again." The Files view shows the server's words for the same call (engagement-file-list.tsx:1661) | "Demote failed · <reason>" |
| Approvals | components/projects/shares/engagement-shares-tab.tsx:1681-1692, :1708 | Approve, reject or withdraw on the Board refused, or connection drops | "Action failed · Could not complete the intake action. Please try again." Server's words only logged. Dropped connection: try/finally, no catch, nothing shown | "Couldn't approve this file · <reason>" |
| Board and deliverables | components/files/use-stage-move.tsx:50, :64; components/projects/file-property-cells.tsx:75; components/projects/shares/deliverable-detail-panel.tsx:247 | Stage change on a dropped connection or non-JSON answer | "Couldn't change the stage · Please try again." | "Couldn't reach Firma · Check your connection and try again" |
| Files | components/files/save-assignee.ts:5; components/projects/file-property-cells.tsx:129; components/files/asset-details-pane.tsx:192; components/ui/property-cells.tsx:27-31 | Assignee on a dropped connection: `fetch` rejects, and `useSaving` is try/finally with no catch | Dropdown closes, old value stays, no message. Refused answers do get a toast | "Couldn't change the assignee · Check your connection" |
| Comments | components/projects/document-doc-comments-pane.tsx:238, :1117, :1142 | Thread fails to load | A red banner, and under it "No comments yet. Start the conversation below." The composer stays open | Banner only, with Retry; no empty-state line |
| Comments | components/projects/document-doc-comments-pane.tsx:688-693 | Reaction refused or connection drops | Refused: undone with no word. Dropped: stays lit, no rollback, unhandled | Undo it. "Couldn't add the reaction" |
| Comments | components/files/document-discussion-tab.tsx:39-40, :53, :61-66 | `deliverable` lookup fails | "Discussions happen on deliverables, and this file isn't in one." A false statement | "Couldn't load this file's discussion · <reason>" |
| Comments | components/projects/engagement-comments-tab.tsx:338-341 | Resolve or reopen refused, or connection drops | Title only: "Couldn't resolve this discussion". Dropped connection: nothing, no catch | "Couldn't resolve this discussion · <reason>" |
| Members and invites | components/projects/members/engagement-members-tab.tsx:42; components/projects/members/firm-members-tab.tsx:75; components/projects/members/client-members-tab.tsx:61 | Members fail to load. Catch only logs | "0 people", "No members yet", with Invite beside it | "Couldn't load members · <reason>", with Retry |
| Members and invites | components/projects/members/member-list.tsx:115, :132, :147; components/projects/members/firm-members-tab.tsx:92, :108, :124; components/projects/members/client-members-tab.tsx:78, :94 | Remove, revoke or resend throws in the server action | Title "Error" · "Failed to remove member." / "Failed to revoke invitation." / "Could not resend the invitation." | "Couldn't remove Anna · <reason>" |
| Members and invites | components/projects/members/invite-member-modal.tsx:121; components/projects/members/firm-invite-modal.tsx:38; components/projects/members/client-invite-modal.tsx:39; components/projects/members/member-list.tsx:98 | Invite or role change throws in a server action (lib/actions/members.ts, firm-members.ts, client-members.ts) | In production the dialog or toast reads "Minified React error #441…". The thrown words never arrive | "Couldn't send the invitation · <reason>" |
| Other | components/projects/add-engagement-modal.tsx:163; components/projects/add-client-modal.tsx:182 | Create throws, for example "A project with this name already exists for this client" (lib/actions/project.ts:112) | Dialog shows error #441 instead of those words | "An engagement with this name already exists for this client" |
| Other | components/projects/engagement-header.tsx:96-99 | Name, status, dates or Lead save throws in `updateProject` | "Couldn't update <field>" and error #441 | "Couldn't update <field> · <reason>" |
| Other | components/projects/client-contacts-tab.tsx:69, :166, :372 | Contacts server actions throw | Title "Failed" and error #441 | "Couldn't save the contact · <reason>" |
| Settings | components/projects/client-settings-form.tsx:359, :417, :432 | Branding, client update or delete throws | "Save failed" / "Update failed" / "Delete failed" and error #441 | "Couldn't delete the client · <reason>" |
| Connectors | components/projects/engagement-file-list.tsx:918-921 | "Set up Storage Folder": `provisionEngagementDriveFolder` throws | "Setup failed" and error #441, on the screen whose only job is setting this up | "Setup failed · <reason>" |
| Other | components/projects/firm-switch-dialog.tsx:68 | `switchFirm` throws | Dialog shows error #441 | "Couldn't switch firm · <reason>" |
| Notifications and inbox | components/projects/add-reminder-popover.tsx:64 | `createManualReminder` throws | Title "Failed", "Could not save reminder." | "Couldn't save the reminder · <reason>" |
| Other | components/projects/engagement-insights-dashboard.tsx:2575, :2588, :1315, :1330 | Overview fails to load. `.then(r => r.json())` with no `.ok`. Dropped connection: data stays null, counts read 0 and "nothing overdue". Refused: `{error}` becomes `data`, then `data?.unansweredThreads.length` throws, so the error boundary's "Something went wrong" | "nothing overdue" and zeros, or the bare boundary | "Couldn't load this overview · <reason>", with Retry |
| Other | components/projects/engagement-insights-dashboard.tsx:2592-2615, :2837-2862, :2864-2872; lib/actions/project.ts:1004 | Publish or discard a summary throws, including "Complete these sections before publishing: …", which is how the person learns what is missing | try/finally, no catch. The button stops spinning and nothing is said | "Not published · Complete these sections: Next steps" |
| Other | components/calendar/calendar-view.tsx:129-130; components/calendar/calendar-sidebar.tsx:51 | Calendar load throws. On a refresh it also wipes what was on screen | Empty calendar and "No engagements yet." | "Couldn't load the calendar · <reason>", with Retry |
| Other | components/calendar/calendar-event-detail-modal.tsx:190, :205, :327 | Event's documents fail to load | "No documents in this deliverable." | "Couldn't load its documents" |
| Search | components/search/global-search-view.tsx:783, :792 | Open in Files on a result: deeplink refused or drops | Spinner, then nothing | "Couldn't open this file · <reason>" |
| Other | components/projects/wiki/wiki-editor.tsx:48-50, :83-84; components/projects/wiki/engagement-wiki-tab.tsx:36, :51, :66, :72, :79; components/projects/wiki/wiki-sidebar.tsx:121 | Dossier (beta). Save, load, create, rename or delete throws. No catch on any | "Saving…" forever. Page list spins forever. New and Delete do nothing | "Not saved · <reason>" |
| Other | app/(app)/d/[groupSlug]/f/[firmSlug]/c/[clientSlug]/e/[engagementSlug]/[[...rest]]/page.tsx:72-73; .../board/page.tsx:34, :42 | Hierarchy lookup fails: a database blip, not a missing engagement | "404 · Page not found · This page doesn't exist or you no longer have access." | "Couldn't load this engagement · <reason>", with Retry |

### P2
| Area | file:line | Trigger | What the person sees today | What they should see |
|---|---|---|---|---|
| Files | components/ui/document-action-menu.tsx:272, :1060; components/projects/engagement-file-list.tsx:1639, :1645, :1661, :1667; components/projects/hooks/use-engagement-file-ops.ts:549, :552, :575, :578, :604, :607, :634, :637 | Due date, bookmark, promote, demote, unlock, unshare and Files-view intake refused | Title "Failed", "Error" or "Action failed". The message is usually the server's; the fallback is "Network error." or "Something went wrong." | Title names the action; a dropped connection says so |
| Notifications and inbox | components/ui/document-action-menu.tsx:1450, :1457, :1464; components/projects/document-doc-comments-pane.tsx:756 | Reminder save fails | "Partial failure · 1 operation(s) failed." even when one of one failed; "Couldn't save the reminder. Try again." | "Couldn't remind Anna · <reason>" |
| Uploads | components/projects/hooks/use-engagement-upload.ts:187, :221, :639; app/api/connectors/google-drive/upload/route.ts:131; lib/connectors/adapters/onedrive-content-adapter.ts:186 | Upload start fails | Row: "No access token", "Failed to initiate upload", or the raw "Failed to create upload session for x: 423 - {json}" | The provider's reason in plain words |
| Uploads | components/projects/hooks/use-engagement-upload.ts:608 | Folder upload with no session or open folder | Pick a folder, nothing happens | "Open a folder first" or "Sign in again" |
| Uploads | components/projects/hooks/use-engagement-upload.ts:512, :515, :535 | Drop on a folder row and its listing fails | The same-name check is skipped with no word; Google Drive ends up with two files of one name | Ask, or say the check couldn't run |
| Files | components/projects/engagement-file-list.tsx:1484, :1499, :710 | File list fails on a non-JSON answer, or folder ids fail | "Unexpected token…" or "Failed to fetch" as the message; "Failed to load engagement folders" | "Couldn't load this folder · <reason>" |
| Files | components/projects/engagement-file-list.tsx:1928-1933, :1971-1976 | Create file, folder or link refused | Title "Could not create file" even for a folder. The dialog closes and the typed name is lost | Keep the dialog open with the reason |
| Uploads | components/projects/engagement-file-list.tsx:2133, :2151 | Import: the token answer isn't checked; the error body isn't guarded | "Import failed · Missing required params", or a JSON parse message | "Import failed · <reason>" |
| Files | components/projects/engagement-file-list.tsx:1141-1155; components/projects/shares/engagement-shares-tab.tsx:1855-1863 | Deep link or search hit whose location can't be resolved, or whose card isn't on the Board | Lands on the root, or opens nothing, with no word | "Couldn't find that file's folder" |
| Comments | components/projects/document-doc-comments-pane.tsx:226, :518, :541 | A failed post, then a good one | The red banner stays until the next reload of the thread | Clear it on the next send |
| Files | components/files/document-versions-timeline.tsx:127; components/files/document-activity-feed.tsx:299 | Versions or activity fail | "Failed to load version history", "Failed to load activity". No reason, no Retry | Add the reason and Retry |
| Files | components/ui/document-action-menu.tsx:239-240 | Clipboard refused on Copy name | Says "Copied" regardless | "Couldn't copy" |
| Other | components/projects/client-project-view.tsx:85-91; components/projects/firm-clients-view.tsx:122-137 | Permissions check fails or answers non-ok | Manage, Settings and New client actions vanish with no word | "Couldn't check your permissions" |
| Other | components/projects/engagement-header.tsx:84, :87 | Members fail for the header's pickers | Empty people pickers, and the empty answer is cached for the page | Don't cache a failure; say it failed in the picker |
| Other | components/projects/engagement-insights-dashboard.tsx:2533-2535 | Health PDF export fails | Button resets, nothing said | "Couldn't create the PDF" |
| Other | lib/actions/engagement-wiki.ts:255, :257 | Dossier (beta). Title saved, storage rename fails | New title in Firma, old name in storage, nothing said | "Renamed here, but not in storage" |
| Connectors | components/google-drive/google-drive-workspace-root.tsx:468, :509 | Choosing or migrating the workspace folder fails | Title "Could not complete", with the route's words | Title names the step |
| Brio | components/projects/files-agent-panel.tsx:447; components/projects/files-scaffold-panel.tsx:191 | Apply or create refused with no message, or drops | "Needs attention · Please try again." | "Couldn't apply these · <reason>" |
| Connectors | app/(app)/d/[groupSlug]/f/[firmSlug]/maintenance/page.tsx:53-61 | Force unlock answered with a refusal. No `.ok`; a thrown fetch is ignored | Goes to Connectors as if it worked. Rare, firm admin only | "Couldn't unlock · <reason>" |
| Other | components/files/document-edit-sheet.tsx:82-86 | "Authenticate Editor Access" refused. See Could not tell for reachability | "Failed to authenticate · There was a problem authenticating editor access. Please try again." The thrown reason is dropped | "Couldn't authenticate · <reason>" |
| Other | app/(app)/d/u/home/page.tsx:33-34 | Reminders or calendar fail on Home | Those sections render empty. Could not confirm the exact copy | "Couldn't load your reminders" |

### Deliberate, not findings
- 11 best-effort enrichment loads: bookmarks, assignable members, file suggestions, folder-count chips, comment count, mention filter, per-comment reminders, taggable documents, search picker data, currency symbol; the page works without them (engagement-file-list.tsx:447).
- 8 storage, clipboard and layout-preference fallbacks: nothing is lost and the person has nothing to do (document-doc-comments-pane.tsx:189).
- 5 billing-gate pre-flight fail-opens: the server enforces the cap (use-engagement-upload.ts:170).
- 6 preview hand-offs that end in another pane and log: only the end of the chain is a finding (document-pdf-preview-pane.tsx:613).
- 4 background calls with no user waiting: mark-read, draft sweep, picker look-ahead, stale-draft discard (use-engagement-file-ops.ts:270).
- Not listed because not mounted: components/files/document-share-modal.tsx, components/google-drive/google-drive-manager.tsx, the V1 `EngagementActionCenter` and its delete in engagement-insights-dashboard.tsx:491, `handleFinalize` on the Board (engagement-shares-tab.tsx:1633), the comment pane's `reminderModal` (no caller sets it).
- Good already and left out: upload retry and the upload panel's header and row reasons, comment composer keeping the draft on a failed post, due-date and stage rollback on the deliverable pane, AI chat errors and rating rollback, summary-generation notes.

### Patterns
- **`r.ok ? r.json() : <empty>` is the main source of false empties.** Picker, details pane, deliverable pane, sharing marks, calendar modal, discussion tab, header pickers. Each turns a failure into the same value as "none". Search even has a comment naming the difference (global-search-view.tsx:632) and then draws the same empty screen. One small load-state shape (`loading`, `ready`, `failed with reason`) would close most of the P0 empties.
- **`deliverable-detail-panel.tsx` was missed by the failure work.** Five of the P0s are in this one file, and its neighbors `asset-details-pane.tsx:337-343` and `use-engagement-file-ops.ts` already do it right. `failureFrom` and `failureReason` are imported only by the file-ops hook and the file list, so the Board, comments, downloads and preview don't use them.
- **The Board drops reasons the Files view shows, for the same routes.** Demote and intake are the clearest: same URL, different toast.
- **Thrown server actions.** About 27 call sites in this scope show `e.message` or a fixed string for a `'use server'` throw. `lib/actions/project.ts`, `client.ts`, `members.ts`, `firm-members.ts`, `client-members.ts` and `engagement-wiki.ts` all throw for ordinary refusals ("already exists", "Complete these sections"). Fixing it where the action returns, with `{ error }`, would cover them all; fixing each catch won't, because the words never arrive.
- **`useSaving` in components/ui/property-cells.tsx:27-31 is try/finally.** Any rejected `onChange` is silent, in every property cell. One catch and toast there closes the dropped-connection cases for assignee and any other cell.
- **Routes that prepare an answer nobody reads.** Bulk download's `X-Bulk-Download-*` headers; `index-file`'s 403 with the plan-limit words; import returns `count` and `skipped` but no `failed`.
- **The download and trash panels are hand-written copies of the upload panel** (engagement-file-list.tsx:2966-3064) without what it learned. `upload-progress-panel.tsx:88-92` says "1 of 3 uploaded · 2 failed" and draws each reason; these say "complete" and hide them.
- **`Upload failed: ${status}`** is the upload path's one remaining bare failure. Reading the provider's body through `StorageFailure` on the browser side, or passing the status through a mapping, would give locked, full and forbidden their own words.

### Could not tell
- **Dossier "Saved" with no write (P0 above).** Settled by reading only. `firm.connectorId` is the schema's `LegacyFirmConnector`; the only writer I found is lib/services/connection-manager.ts:53, which has no importers, while `createWikiPage` uses the client connector. If that column is null for a firm, typed text is never stored. One query on `firms.connector_id` settles it; I did not run anything.
- **Import into an engagement's root folder.** import/route.ts:161 skips indexing when `parentId` has no document row. If root folders have no row, every import there lands in the same no-row state as the first P0, under a success toast. I did not confirm whether roots have rows.
- **Upload retry after the bytes arrive.** `xhr.onerror` and a dropped OneDrive final chunk are retried from a new session. If the provider finished before the connection dropped, a retry may leave a second copy. Not checkable by reading.
- **Zero-byte file to OneDrive.** use-engagement-upload.ts:60-68 builds `Content-Range: bytes 0--1/0`. I expect Graph refuses it and the row reads "Upload failed: 400", but I could not confirm that.
- **A hung OneDrive chunk.** `fetch` has no timeout there (:64), unlike the XHR path. Whether a stalled connection ever rejects depends on the browser; the row may spin indefinitely.
- **Bulk trash on a link.** engagement-file-list.tsx:1728 sends links through `/api/drive-action` trash, while single delete uses the document DELETE route (use-engagement-file-ops.ts:186). It may always fail for links, with the reason hidden in the hover title. Not confirmed.
- **`ReGrantEditorAccessButton` reachability.** It is imported by file-preview-sheet.tsx and document-header.tsx; I did not trace whether those are mounted on a live path, so it sits in P2.
- **Which boundary catches the Overview crash** at engagement-workspace.tsx:396, and what Home draws for empty reminders.
- **Not read in this pass:** app/(app)/d/onboarding/**, support, billing, profile and group-picker pages, since they don't load these surfaces. Their candidates remain for the Onboarding and Settings passes.

---

## Pass E: UI outside pass D (connectors, billing, account, onboarding, sign-in, invites, support, notifications, inbox, shell, home, dashboard, audit, system, marketing forms, Brio, firm and engagement settings, error boundaries)
Read: about 85 files, plus every in-scope candidate from lists 3, 3b, 4, 4b, 5, 6, 9. Findings: P0 12, P1 24, P2 23. Deliberate: 38.

The biggest answer first. These forms show `e.message` from a thrown server action, so in production they read
"Minified React error #441; visit https://react.dev/errors/441 ...": firm settings (3 places), add firm, engagement settings, engagement header,
client settings (3), client header, client contacts (3), add client, add engagement, all 3 invite dialogs, role change, firm switch (2),
and connectors (7). Rows are in P1. The written reasons they lose include "Cannot remove the last Firm Administrator" (static toast, also lost),
"A client with this name already exists", and "Your plan allows 3 clients. Upgrade to add more."

### P0
| Area | file:line | Trigger | What the person sees today | What they should see |
|---|---|---|---|---|
| Settings | components/projects/firm-settings-form.tsx:249, :328-329, :429-464, :400 | `GET /api/firm` fails, or no session token, when Firm Settings opens | No message. Every field blank or default and `loaded` is true, so the form is live. Change one field, press Save changes, and "Saved · Firm details updated." The save wrote blanks and defaults over memo, industry, notes, reminder and event config, beta features, external sections and domain access. Save branding the same way erases the logo | "Couldn't load firm settings. Reload before editing." Form locked until it loads |
| Settings | components/projects/add-firm-modal.tsx:106-122 | `createFirm` commits, then `updateFirm` throws | Dialog stays open with error #441 text. The firm already exists. Press Create again and it fails again ("A firm with this name already exists", also shown as #441) | "Firm created, but its details weren't saved. Open it to finish." Then move on to the firm |
| Connectors | components/connectors/firm-drive-section.tsx:589-592 | "Attach all" where one or more clients fail | One error toast per failed client, then a green "Attached · Attached 5 clients to this connector." `handleAttachClient` swallows its own error, so the loop counts them all as done | "Attached 3 of 5 clients. Couldn't attach Acme, Beta: {reason}" |
| Connectors | components/connectors/firm-drive-section.tsx:564-575; lib/actions/client.ts:730 | Client link saved, Drive folder setup then fails | `e instanceof ClientLinkedFolderFailedError` is always false in the browser, so the warning branch never runs. "Attach failed · Minified React error #441..." and the client shows as not attached, though it is. Lost words: "Client linked, but the Drive folder could not be set up: {reason}. Support ticket #N filed automatically." | "Attached with a problem. The Drive folder couldn't be set up: {reason}. Ticket #N." Client shown as attached |
| Connectors | app/api/connectors/onedrive/route.ts:284-289; app/api/connectors/onedrive/sites/route.ts:267-272; app/api/connectors/google-drive/route.ts:487-492; toasts at components/connectors/onedrive-workspace-root.tsx:249, :291 and components/google-drive/google-drive-workspace-root.tsx:369 | Choosing a folder or site, and `setupFirmFolder` or client folder setup throws | Route logs it and answers `{ success: true }`. Green "Folder created · set as your workspace root." or "SharePoint site connected". The firm and client folders were not made; the comment "can be retried" is not true of anything automatic (client.ts:669-671 says the same of the same bug) | "Folder chosen, but client folders couldn't be set up: {reason}" |
| Members and invites | components/projects/members/firm-members-tab.tsx:74-75, :176; client-members-tab.tsx:60-61, :215; engagement-members-tab.tsx:41-42 with member-list.tsx:385 | The members load fails | Logged only. "No members yet" (client tab adds "Use Invite to add a Client Administrator."). An admin may re-invite everyone | "Couldn't load members: {reason}" with Retry |
| Notifications and inbox | components/inbox/inbox-view.tsx:186-190, :540-548; lib/home/home-firms.ts:59-61 | Reminders, notifications, Needs you, or the firm list fail to load | Each failure turns into an empty list. "You're all caught up" with an approval still waiting. Partial failures are hidden the same way | "Couldn't load your Inbox. Retry." Never "all caught up" after a failed load |
| Other | app/(app)/d/u/home/page.tsx:33-34; components/home/agenda-week.tsx:208; components/home/home-view.tsx:98, :214-219 | Calendar or reminders fail on Home, or `getHomeFirms` fails | "Nothing overdue or on the calendar this week." and "All caught up." Firm list failure: "Nothing here yet · Once you're in a firm you can open..." to someone who has firms | "Couldn't load your agenda. Reload to try again." |
| Notifications and inbox | components/inbox/inbox-view.tsx:212-218, :433-440, :194-200 | `PATCH /api/notifications` fails (Mark all read, or opening an item) | No `.ok` check, `.catch(() => {})`, no rollback. Dots vanish as if done and return on the next load. Small stakes, only the read dot | "Couldn't mark these read." Dots stay |
| Notifications and inbox | lib/hooks/use-register-push.ts:72-77 with components/notifications/push-notification-toggle.tsx:23-29 | `POST /api/push/subscribe` fails | No `.ok` check, then `setSubscribed(true)`. The switch reads On. The server has no subscription, so no push ever arrives and nothing says so | Switch back to Off · "Couldn't turn on push: {reason}" |
| Support | app/error.tsx:57, :90, :142; components/error-boundary.tsx:122, :140, :214 | `submitErrorTicket` fails while reporting a crash | The action returns `{ success: false }` (app/actions/submit-ticket.ts) and the result is ignored. "Thank you! Report submitted." and, in the boundary, "We'll look into it on priority". No ticket exists | "Couldn't send your report. Please email support." |
| Billing | components/billing/billing-page-client.tsx:137-141, :118-120 with components/billing/polar-plans-picker.tsx:991, :1201-1215 | `current-plan` fails, including on any window focus (a laptop waking before the network is back) | A paying admin gets "Unable to load plan details." and a live "Checkout" button on every plan, because no plan state means not paid and the admin flag falls back to true. One click goes to a new Polar checkout | "Couldn't load your plan." Checkout hidden until it loads. Keep the last known plan on a failed refresh |

Code to check by hand:

```tsx
// firm-settings-form.tsx:249, :328-329  (load) and :505 (the only guard on Save)
if (!res.ok || cancelled) return
} catch { /* ignore */ } finally {
    if (!cancelled) setLoaded(true)
disabled={saving || !loaded || !mainDirty || !name.trim()}
```

```tsx
// add-firm-modal.tsx:106-107, :120-121
const newFirm = await createFirm({ name, groupSlug })
await updateFirm(newFirm.slug, { internalMemo: internalMemo.trim() || null, /* ... */ })
} catch (err: unknown) {
    setError(err instanceof Error ? err.message : 'Failed to create firm')
```

```tsx
// firm-drive-section.tsx:589-592
for (const client of unattached) {
  await handleAttachClient(connectorId, client.id)   // catches its own errors
}
addToast({ type: 'success', title: 'Attached', message: `Attached ${unattached.length} client${unattached.length === 1 ? '' : 's'} to this connector.` })
```

```tsx
// firm-drive-section.tsx:564-565, :571-574
const { ClientLinkedFolderFailedError } = await import('@/lib/actions/client-errors')
if (e instanceof ClientLinkedFolderFailedError) {   // false for anything from a server action in production
  linkClientLocally()
} else {
  addToast({ type: 'error', title: 'Attach failed', message: e instanceof Error ? e.message : 'Could not link client.' })
```

```ts
// app/api/connectors/onedrive/route.ts:284-289  (same shape in sites/route.ts:267-272, google-drive/route.ts:487-492)
} catch (provErr) {
  logger.error('onedrive update-root-folder: provisioning failed', /* ... */)
  // Non-fatal — folder structure can be retried
}
return NextResponse.json({ success: true })
```

```tsx
// firm-members-tab.tsx:74-75, :176
} catch (error) {
    logger.error('Failed to fetch firm members', /* ... */)
// ... with members still [] :
    title="No members yet"
```

```tsx
// inbox-view.tsx:186-190, :543
getAllUserReminders().catch(() => [] as ReminderWithContext[]),
fetch("/api/notifications?firms=all")
    .then((r) => (r.ok ? r.json() : { notifications: [] }))
    .catch(() => ({ notifications: [] })),
getNeedsYou().catch(() => [] as NeedsYouItem[]),
// ...
title={tab === "updates" ? "No updates" : "You're all caught up"}
```

```tsx
// app/(app)/d/u/home/page.tsx:33-34, agenda-week.tsx:208
getUserReminders().catch(() => []),
loadCalendarData({ userId: user.id, firms, window, withAssignees: false }).catch(() => null),
// calendarEvents={calendar?.events ?? []}
<HomeEmptyLine>Nothing overdue or on the calendar this week.</HomeEmptyLine>
```

```tsx
// inbox-view.tsx:212-217
markAllRead: async (firmId) => {
    await fetch(firmId ? `/api/notifications?firmId=${encodeURIComponent(firmId)}` : "/api/notifications?firms=all", {
        method: "PATCH", /* ... */
    }).catch(() => {})
},
```

```ts
// use-register-push.ts:72-77
await fetch('/api/push/subscribe', {
  method: 'POST',
  /* ... */
})
setSubscribed(true)
```

```tsx
// app/error.tsx:57, :90  (error-boundary.tsx:122, :140 is the same)
await submitErrorTicket({ description: feedback, type: 'BUG', /* ... */ })
setIsSubmitted(true)
// submit-ticket.ts catch: return { success: false, message: 'Failed to submit ticket' }
```

```tsx
// billing-page-client.tsx:137-141, polar-plans-picker.tsx:991, :1201
void fetchBillingCurrentPlan(id)
    .then(setCurrentPlanState)                 // null on !res.ok
    .catch(() => { setCurrentPlanState(null) })
const isFirmBillingAdmin = explicitAdminFlag ?? Boolean(fallbackCanManageBilling)
) : isPaidRecurringCurrent ? null : isFirmBillingAdmin ? ( <Button ...>Checkout</Button>
```

### P1
| Area | file:line | Trigger | What the person sees today | What they should see |
|---|---|---|---|---|
| Settings | components/projects/firm-settings-form.tsx:416, :480, :496 | `updateFirm` or `deleteFirm` throws | "Save failed", "Update failed" or "Delete failed" · "Minified React error #441...". Lost: "Only firm admins can update firm settings", "Only firm admins can delete a firm" (lib/firm-service.ts:274, :292), "Firm not found" | "Update failed · {the reason}" |
| Settings | components/projects/engagement-settings-form.tsx:156, :171; components/projects/engagement-header.tsx:99 | `updateProject` or `deleteProject` throws | "Update failed · #441..." or "Couldn't update due date · #441...". Lost: the written date conflict "{x} is due {date}, after that. Set the engagement's due date on or after it, or move that deliverable first." (lib/actions/project.ts:451) and "Cannot update a completed engagement." (:438) | "Couldn't update due date · {x} is due {date}. Set a later date or move it first." |
| Settings | components/projects/client-settings-form.tsx:359, :417, :432; components/projects/client-header.tsx:52 | `upsertClientBrand`, `updateClient` or `deleteClient` throws | "Save failed", "Update failed", "Delete failed", "Couldn't update status" · #441. Lost: "Only firm admins can delete a client", "Insufficient permissions", "Owner must be a member of this firm" | Title plus the reason |
| Settings | components/projects/client-contacts-tab.tsx:69, :166, :372, :208-210 | Contact load, save or remove throws | "Failed to load" or "Failed" · #441. After a failed load the panel also reads "No contacts yet". Lost: the plan cap message from `assertWithinClientContactCap` | "Couldn't save contact · {reason}". On load failure no empty state |
| Other | components/projects/add-client-modal.tsx:182; add-engagement-modal.tsx:163; add-firm-modal.tsx:121 | Create throws | #441 text in the dialog notice. Lost and common: "A client with this name already exists", "A project with this name already exists for this client", "A firm with this name already exists", "Your plan allows N clients. Upgrade to add more.", "Your plan allows N active engagements...", "Could not finish creating this engagement because Google Drive setup failed: {detail}", "Upgrade to Standard to create a new firm outside the Free Sandbox." The cap pre-check hides the plan case only when its gate call succeeded | The written reason in the notice |
| Members and invites | components/projects/members/firm-invite-modal.tsx:38; client-invite-modal.tsx:39; invite-member-modal.tsx:121 | Invite throws | #441 text in the dialog notice. Lost: "A member with this email is already in the firm", "This user has already joined the firm", "User has already joined the engagement", "User is currently accepting this invitation — please wait", "Inviting members is restricted for Sandbox firms. Upgrade to invite teammates." | The written reason in the notice |
| Members and invites | components/projects/members/member-list.tsx:98 | `updateMemberPersona` throws | "Update Failed · #441..." | "Couldn't change the role · {reason}" |
| Members and invites | components/projects/members/member-list.tsx:115, :132, :147; firm-members-tab.tsx:92, :108, :124; client-members-tab.tsx:78, :94 | Remove, revoke or resend throws | Fixed words: "Error · Failed to remove member.", "Error · Failed to revoke invitation.", "Failed to Send · Could not resend the invitation." Lost: "Cannot remove the last Firm Administrator" (lib/actions/firm-members.ts:111), "User has already joined", "User is currently accepting this invitation" | "Couldn't remove member · This is the last firm administrator." |
| Connectors | components/connectors/firm-drive-section.tsx:410, :427, :439, :454, :467, :574, :611 | Disconnect, remove, rename, attach or detach throws | "Disconnect failed", "Remove failed", "Rename failed", "Attach failed", "Detach failed" · #441. This is the known :565 family | Title plus the reason |
| Connectors | components/connectors/firm-drive-section.tsx:481-484, :499-505 | Pressing Test on a connector that is broken | "Test failed · Could not verify connection." The one button meant to diagnose a connector gives no diagnosis. Google route knows "Failed to fetch user info"; OneDrive route answers `{ success: false, status }` or "Could not obtain access token" | "Test failed · Google rejected the saved sign-in. Reconnect this account." |
| Connectors | components/connectors/firm-drive-section.tsx:157 | `getFirmConnectors` or `getFirmAllClients` throws | "Failed to load connectors · Could not fetch storage connectors." then an empty panel with only the Connect form, inviting a second connection once the toast is gone | Panel keeps an error line with Retry; no Connect form |
| Connectors | components/ui/migration-progress-panel.tsx:80, :96 | Cancel migration or force unlock fails | No `.ok` check, `catch { /* ignore */ }`. Page reloads and the migration or lock is still there, with no word why | "Couldn't cancel the migration · {reason}" |
| Other | components/projects/firm-switch-dialog.tsx:68; app/(app)/d/(landing)/group-picker.tsx:140 | `switchFirm` throws | #441 text in the dialog or picker. Lost: "You do not have access to this firm" | The written reason |
| Onboarding and sign-in | app/(app)/auth/callback/route.ts:108 | Google or Microsoft sign-in code exchange fails, or no code | Back at `/signin?error=auth_code_error`. Nothing reads that param (only this one line mentions it), so a blank sign-in form with no message | "Google sign-in didn't finish. Please try again." |
| Onboarding and sign-in | app/(app)/signin/use-sign-in-flow.ts:128, :155; components/signup/signup-form.tsx:361 | `checkEmailExists` or `sendOTPWithTurnstile` rejects: network drop, 5xx, stale tab after a deploy | No try/catch, so the error is unhandled. Continue or "Sending code…" spins forever with no message. Sign-in and sign-up sit outside the shell's NewVersionPrompt | "Couldn't reach us. Check your connection and try again." Button back |
| Onboarding and sign-in | app/(app)/signin/signin-view.tsx:134-141, :275-282 | Turnstile keeps failing (blocked script, privacy browser, the known 600010) | "Captcha verification failed. Retrying…" forever. No reason, no way out (sign-up gives up after two errors; sign-in loops). If the script never loads, nothing at all | "We couldn't run the security check. Turn off blockers for this site or try another browser." |
| Members and invites | app/(app)/invite/[token]/page.tsx:21-37 | Expired, revoked or unknown invite link, and also any database error | Generic "404 · Page not found · This page has moved or doesn't exist." · "Back to Home". The invitee is never told their invitation expired, or that it was a server failure | "This invitation has expired. Ask {inviter} to send a new one." Database error gets its own words |
| Members and invites | components/invite/invite-landing-client.tsx:77, :112 | Signed in as the wrong account on an invite link | Told "Please sign out." The Sign Out button goes to `/api/auth/signout`, which does not exist, so a 404. Still signed in; the link shows the same error again | A Sign Out that works and returns to the invite |
| Onboarding and sign-in | app/(app)/d/onboarding/page.tsx:585, :593-595, :1742-1757 (entered from :807, :1027, :1030, :1034, :1039) | Any hiccup on `/api/firm` or `ensure-org` drops the person to step 1, which auto-posts to `/api/onboarding/create-sandbox`. That route no longer exists (not in app/api/onboarding) | "Failed to create sandbox workspace" under "Initializing workspace…" with a Retry that can never succeed. Only a page reload gets out, and the exit guard blocks links away | "We couldn't load your workspace. Reload to try again." Step 1 gone or pointed at a real route |
| Billing | app/checkout/success/success-redirect-card.tsx:159-165; app/api/billing/checkout-invoice/route.ts (status 202 branch) | Invoice still generating, likely right after paying | Server writes "Invoice is still being generated. Try again in a minute..." with status 202. `res.ok` is true and no `invoiceUrl`, so after up to 15 seconds of "Preparing invoice…" nothing happens and the words are dropped | Show the server's sentence |
| Billing | components/billing/polar-plans-picker.tsx:1211, :1332; components/billing/standard-checkout-intent-banner.tsx:174; app/api/checkout/route.ts:15, :37, :47, :65, :78, :91, :120 | Any checkout start failure: Polar not configured, session gone, unknown product | The button navigates the tab to `/api/checkout`, so the person gets raw JSON such as `{"error":"Unknown product"}` on a bare page and no way back | Stay on Billing · "Checkout couldn't start: {reason}" |
| Brio | app/api/projects/[projectId]/ai-chat/route.ts:267, :284; components/projects/engagement-ai-chat.tsx:786, :1528 | The model fails: overloaded, API error, or mid-answer | Before the stream: small red "Internal server error" under the thread. During it: `controller.error` makes the read fail, so the browser's own text shows ("network error" in Chrome; words vary) beside a partial answer, which reads like the person's Wi-Fi | "Brio couldn't finish this answer. Try again." Mark a partial answer as cut off |
| Brio | components/dashboard/ai-firm-brief.tsx:91, :114-121 | Rewrite refused, including out of AI credits (429) | Reason is read then thrown away by a bare `catch {`. "Could not rewrite it. The brief below is unchanged." Lost: "You have used this month's 500 AI credits. They refill on {date}. Upgrade your plan for more." Engagement chat shows this same message correctly | The credit sentence, or the real reason |
| Other | components/dashboard/firm-business-insights.tsx:83-88, :129-133; components/dashboard/firm-actions.tsx:153 | `/api/firms/{id}/insights` fails | `console.error` only. Action Center and Business overview stay on shimmer forever, marked busy, no message. Refresh spins and returns to shimmer | "Couldn't load the overview: {reason}" with Retry |

### P2
| Area | file:line | Trigger | What the person sees today | What they should see |
|---|---|---|---|---|
| Connectors | components/connectors/firm-drive-section.tsx:237 | Google connect start refused | "Connection failed · Failed to initiate Google sign-in"; route's reason dropped. OneDrive's helper keeps it (lib/onedrive-popup-oauth.ts) | The route's reason |
| Connectors | components/connectors/firm-drive-section.tsx:518-524 with switch-account-modal.tsx | `/admins` fails on Transfer | Modal says "No firm administrators found." | "Couldn't load administrators." |
| Connectors | components/connectors/firm-drive-section.tsx:173, :189, :293, :310 | Connector status fails | Location row quietly missing and no account mismatch warning | "Couldn't check this connection" on the card |
| Connectors | components/connectors/client-drive-section.tsx:65, :75, :115, :123 | Status lookup fails on Client Settings | Green check plus "Google account" (default, even for OneDrive) plus "Disconnected — reconnect in Firm Settings", a false reason | "Couldn't check the connection" |
| Settings | components/projects/client-settings-form.tsx:207, :229 | Client brand load fails | Looks like no custom branding. Toggling and saving can delete the real brand record | "Couldn't load branding." |
| Onboarding and sign-in | app/(app)/d/onboarding/page.tsx:608, :716 | Network failure during setup | A customer reads "Connection error. Please ensure the database is running (e.g. supabase start for local dev) and try again." | "Couldn't reach us. Check your connection and try again." |
| Onboarding and sign-in | app/(app)/auth/callback/route.ts:50, :53 | Name reconcile or landing lookup throws after the session is set | Unguarded in the route handler; I expect a bare 500 page | Send to `/d` or to sign-in with a message |
| Members and invites | lib/actions/invitations.ts:367; components/invite/invite-landing-client.tsx:93, :109 | Join fails on a database error | "Invitation Error" plus the raw message, Prisma text included (this path skips `userFacingMessage`) | "Couldn't join just now. Retry." |
| Billing | app/(app)/d/onboarding/page.tsx:1000-1011; app/checkout/success/success-redirect-card.tsx:135-138 | Progress save fails after paying | Logged only. Back on the Subscribe step with plans and Checkout, no word that the payment went through | "Your payment went through. We couldn't move you on. Continue." |
| Billing | app/checkout/success/success-redirect-card.tsx:232-234 | `/checkout/success` reached with or without a real checkout | "You're all set · Thanks for subscribing" from the URL alone. "when your workspace is ready" is a plain 5 second timer | Only say it after a real checkout id |
| Billing | app/checkout/success/success-redirect-card.tsx:166; lib/billing/open-polar-customer-portal.ts:9 with current-plan-summary.tsx:295, polar-plans-picker.tsx:1009 | Network failure on invoice or portal | `try/finally` with no catch. Spinner stops, nothing shown | "Couldn't open it. Try again." |
| Billing | components/billing/billing-page-client.tsx:200-206, :226-232, :251; polar-plans-picker.tsx:738 with app/api/billing/catalog/route.ts:18-22 | Permission check, skip or catalog fails | Silently bounced off Billing; in onboarding a false reason "Billing isn't available for your role"; "Failed to skip for now"; raw Polar text or "Could not load plans (502)" | "Couldn't load billing: {reason}" |
| Account | components/account/sessions-card.tsx:28; components/account/data-privacy-card.tsx:61-62, :86-87; app/(app)/d/profile/profile-page-client.tsx:58 | Sign out everywhere, export or deletion request fails; name save rejects | "Please try again." with no reason, routes' words dropped. Name save has no try/catch, so "saving" never ends | The reason. Button back |
| Notifications and inbox | components/inbox/inbox-view.tsx:386-390 | Done or Dismiss fails | "Couldn't dismiss it · {title} is back in your Inbox." State is right; reason missing | Add the reason |
| Notifications and inbox | components/notifications/push-notification-toggle.tsx:23-29; lib/hooks/use-register-push.ts:57, :100 | Push subscribe fails, key missing, or unsubscribe fails | Result ignored; switch snaps back with no message | "Couldn't turn on push: {reason}" |
| Notifications and inbox | components/app/app-topbar.tsx:813, :898, :903, :1012-1037, :1079, :1127 | Old top bar, shown only on `/d/onboarding` | No `.ok` checks, `catch { // ignore }`. Clear all, bookmark remove and alert clear do nothing silently; a refused Broadcast leaves the composer open with no words | A toast with the reason, or retire these controls |
| Other | components/home/home-bookmarks.tsx:27-36; components/ui/setup-reminder-modal.tsx:179-189 | Bookmark remove or reminder save fails | Row stays with no message; `try/finally` with no catch. Reminder callers are in pass D scope | "Couldn't remove it." |
| Other | components/dashboard/ai-firm-brief.tsx:62, :137; components/shell/shell-data-context.tsx:99-106 with sidebar-v2.tsx:389; lib/actions/client.ts:194-196 | Brief load, sidebar data or new client's folder fails | Brief card disappears; sidebar says "No active engagements yet." and Settings and Members vanish for an admin; Add client closes as normal with no folder (the next engagement create redoes it and fails loudly if still broken) | Quiet "Couldn't load" lines |
| Search | components/shell/command-menu.tsx:111, :235 | Quick search fails | `No results for "x"` | "Search isn't working right now." |
| Support | components/support/support-store.ts:50, :76, :87, :91-92, :102, :110, :163-166; support-request-panel.tsx:92, :102, :124; support-new-request-panel.tsx:81; support-view.tsx:137-138 | Support actions fail | Title only, routes' reasons dropped: "Couldn't send your reply", "2 files couldn't be attached" (the upload's own reason is dropped). A throw after the ticket is filed says "couldn't send", so a retry duplicates it. "Link copied" shows without waiting for the clipboard | Keep the reason per file. Say the ticket exists |
| Brio | components/projects/files-agent-panel.tsx:327, :447, :500; components/projects/files-scaffold-panel.tsx:176, :192 | Network failure or no message from the route | "Needs attention · Please try again." or "Could not review the files" | "Couldn't reach Brio. Nothing was changed." |
| Support | app/error.tsx:79-81, :110-112; app/global-error.tsx:75-82; components/error-boundary.tsx:105-107, :168-169 | Any crash | "We encountered an unexpected error. Please help us fix it by checking the details below." The details are dev only. "Critical Error · A critical error occurred." gives no reference code. The report's slug regex looks for `/o/`, `/p/`, which today's URLs do not have, so reports carry no firm and won't show on that firm's Support page | "Something went wrong on this page. Reference {digest}." |
| System admin, Marketing site | app/(app)/system/integrations/page.tsx:74, :90, :129; jobs/page.tsx:96; admin-scripts/page.tsx:40, :56; platform-maintenance/page.tsx:116; app/actions/submit-contact.ts:50, :106; app/actions/submit-waitlist.ts:62 | Admin fetch fails, or contact or waitlist fails | Status codes ("Reprovision failed: 500", "Jobs API error: 500") and `String(e)`. Public forms: "Server configuration error.", "Database error occurred." Public forms return through `serverActionWrapper`, so the words do survive | "We couldn't send this. Please email us." |

### Deliberate, not findings
- 16 storage and clipboard catches: nothing for the person to do, the screen stays correct (components/shell/sidebar-v2.tsx:134)
- 17 ambient or fail-open reads: badges, credit balance, digest, nudges, cap pre-checks and JWT warm-up, where the server still enforces and silence is right (components/app/ai-credits-indicator.tsx:55)
- 3 branding and currency cosmetics that fall back to defaults (components/app/app-topbar.tsx:380)
- 2 firm switches that navigate anyway, because the firm page re-checks access (components/shell/workspace-switcher.tsx:53)
- Good and leave alone: engagement chat on credits out and on timeout, sign-in OTP errors, OAuth popup failure messages, Files agent per-file outcomes, OneDrive site timeout wording, Audit, support page load error, `/system/email-delivery`, sign-out-everyone, entitlements panel, waitlist campaign forms.

### Patterns
- **One cause for most P1s.** `lib/actions/firms.ts`, `client.ts`, `project.ts`, `firm-members.ts`, `members.ts`, `client-members.ts` and `lib/firm-service.ts` throw on purpose, with well-written sentences, and every caller shows `e.message`. `lib/server-action-wrapper.ts` already returns words that survive and hides Prisma text; `acceptInvitationAction`, `createOwnWorkspace` and `updateProfileNames` already return results. These actions just don't. Fixing them there clears about 30 catch sites, the 8 static member toasts' lost reasons, and the `instanceof` branch.
- **Dev hides all of it.** Every #441 row reads fine in `next dev`, including the `ClientLinkedFolderFailedError` branch, whose comment says it fixes a misleading state. It only works in dev.
- **`.catch(() => [])` at the data edge.** Inbox, Home, members and sidebar turn a failed read into an empty list, then the empty state speaks with confidence. The component can't tell "none" from "failed".
- **The answer held the reason; the browser dropped it.** A bare `catch {` after reading it (ai-firm-brief.tsx:91, :114), a fixed string in place of the body (firm-drive-section.tsx:481, support-store.ts:76), or a 202 treated as nothing (success-redirect-card.tsx:159-165).
- **`try/finally` with no catch** on user actions: success-redirect-card.tsx:166, current-plan-summary.tsx:295, polar-plans-picker.tsx:1009, setup-reminder-modal.tsx:179, home-bookmarks.tsx:26.
- **Dead code in the candidate lists; no finding reported.** Nothing mounts these: components/ui/top-bar.tsx, components/navigation/sidebar.tsx and components/layouts/app-layout.tsx (app-layout has no importer), components/dashboard/{risky-share-review-modal,duplicate-review-modal,file-review-modal,visualizations-tab,shared-tab,contributors-tab,storage-usage-bar}.tsx, components/support/{view-support-request-modal,create-support-request-modal,support-requests-list,support-ticket-details-pane,support-ticket-comments-pane,support-request-comments-sidebar}.tsx, components/connectors/google-drive-connector-tab.tsx, components/notifications/broadcast-modal.tsx, components/ui/{recent-sessions-modal,connection-test-modal,share-modal}.tsx. `components/safe-component.tsx` has no users either.
- **Onboarding steps 3 and 4 are unreachable** (no `setStep(3)` or `setStep(4)` anywhere). `handleRootFolderSelected` at page.tsx:536-552 and the My Drive button at :1381-1400 have no `.ok` check and look like P0s, but nobody can reach them today.
- Not person-facing, but false: the "Login Success" analytics event fires even when starting Google or Microsoft sign-in failed (use-sign-in-flow.ts:209, :225).

### Could not tell
- Whether a second Polar checkout for a group already on a paid plan bills twice or replaces the plan. The Checkout row stands either way. The comment at app/api/checkout/route.ts (rebuilding the query) hints that a checkout can replace a subscription.
- Right after paying, whether Billing can show Free for a while. `current-plan` falls back to a live Polar lookup, which should cover webhook lag, and there is no "payment processing" wording if both lag. Timing can't be settled by reading.
- What `Checkout()` from `@polar-sh/nextjs` answers when Polar itself errors. I did not read the package. Raw JSON is confirmed only for the route's own checks.
- The exact text of a stale-tab error caught in a form's try/catch. It is thrown in the browser, so it may survive as raw "Server Action ... was not found". NewVersionPrompt listens only for unhandled rejections, so caught ones don't trigger its prompt.
- Whether the browser says exactly "network error" on the Brio stream failure. It varies by browser; the route's `controller.error` is certain.
- Outside my scope, seen in passing, for pass D to confirm: `components/projects/engagement-file-list.tsx:921` ("Setup failed", same #441 shape); `app/(app)/d/(landing)/page.tsx:64` (any error sends a returning user to `/d/onboarding`, which then meets the step 1 dead end) and `:88` (failed firm list renders `FirmsView` with no firms).

---

