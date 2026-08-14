# TODO: Bugs

## Firm > Settings > Data Storage

### 1. Client-to-connector link row is not self-intuitive [DONE]
The link Client to connector has a small right-aligned link icon to click, but it is not self-intuitive. Make the whole row clickable and reuse the on-hover tooltip of the link icon.

### 2. New Google connector not mapped correctly when switching an existing client
When adding a new Google connector and switching the connector for an existing client, the connector is not mapped correctly. As a result, on Engagement > Files, uploads are blocked with "no connector available" and the user is redirected to Settings.

### 5. Deleting an engagement, client, or firm shows a 404 page instead of navigating up
When an engagement, client, or firm is deleted, the user is left on/redirected to a 404 page. It should instead navigate smoothly to the page one level up (e.g. deleting an engagement should return to its client, deleting a client should return to its firm).

### 6. Deleted docs/engagements leave orphaned Recents and Reminders
When a doc or engagement is deleted, its entries in the sidebar's "Recent" and "Reminders" lists are not cleaned up. Clicking an orphaned entry navigates to a 404 page (see bug #5). These lists should be pruned when the underlying item is deleted.

### 7. Left nav links unresponsive while on the 404 page
From the 404 page (see bug #5), clicking left-nav items like Overview or Clients does nothing — navigation appears dead until the user clicks "Go to Dashboard"/"Go Back" or reloads.

### 9. No way to remove individual Recents entries [MEDIUM]
Add the ability to remove/dismiss individual entries from Recents in the left app sidebar, the TopBar, and the dedicated /d/u/recent page.

### 10. Stale Recents point to deleted clients/engagements, causing 404s [MEDIUM]
Recents entries for clients/engagements that have since been deleted still show up in Recents (left sidebar, TopBar, and /d/u/recent). Clicking one navigates to a 404 page. Related to bug #6 (orphaned Recents/Reminders not cleaned up on deletion).

### 11. Reminders are left stale when the underlying Document, Deliverable, or Engagement is deleted [MEDIUM]
Like Recents (see bug #10), Reminders are not cleaned up when their corresponding Document, Deliverable, or Engagement is deleted — the stale reminder stays visible. Reminders should be auto-removed when the corresponding Document, Deliverable, or Engagement is deleted.

### 8. Engagement card shows both client status and engagement status badges together [DONE]
On a client's Engagements tab, the engagement card shows two status badges side by side — the parent client's status (e.g. "Prospect") and the engagement's own status (e.g. "Active"). Showing both on the same card reads as contradictory. Repro: create a client with status Prospect, add an engagement under it with status Active — the engagement card displays both "Prospect" and "Active" badges.

### 4. Firm logo route still trusts `firm.firmFolderId` instead of the connector-scoped folder ID
`app/api/firms/[firmId]/logo/route.ts`'s `getFirmDriveContext` reads `firm.firmFolderId` first (falling back to `firm.settings.organizations[firmId].orgFolderId`), same bug shape fixed elsewhere on 2026-08-07 (see `.claude/plans/connector-microsoft-impl.md`) for `ensureAppFolderStructure` and the Google/OneDrive `route.ts`/`callback/route.ts` provisioning gates: `firm.firmFolderId` is a single column shared across every connector a firm has, so it can go stale/cross-contaminated once a firm has more than one connector (e.g. Google + OneDrive). Also reads `orgFolderId` from `firm.settings` instead of `connector.settings` — likely always empty, a second latent bug in the same function. Should read solely from `connector.settings.organizations[firmId].orgFolderId` on the firm's actual connector, matching the fix applied to the other call sites.

## Engagement > Files

### 3. `.txt` and `.csv` file preview not supported
Preview for `.txt` and `.csv` files is currently unsupported. It should be.

### 12. Preview has no page numbers and no way to jump to a page
The file preview does not show page numbers and offers no way to jump to a specific page. Add either a left sidebar with page thumbnails, or at minimum a "Go to [x] of [y] pages" input for direct page navigation.
