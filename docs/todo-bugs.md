# TODO: Bugs

## Firm > Settings > Data Storage

### 1. Client-to-connector link row is not self-intuitive
The link Client to connector has a small right-aligned link icon to click, but it is not self-intuitive. Make the whole row clickable and reuse the on-hover tooltip of the link icon.

### 2. New Google connector not mapped correctly when switching an existing client
When adding a new Google connector and switching the connector for an existing client, the connector is not mapped correctly. As a result, on Engagement > Files, uploads are blocked with "no connector available" and the user is redirected to Settings.

### 4. Firm logo route still trusts `firm.firmFolderId` instead of the connector-scoped folder ID
`app/api/firms/[firmId]/logo/route.ts`'s `getFirmDriveContext` reads `firm.firmFolderId` first (falling back to `firm.settings.organizations[firmId].orgFolderId`), same bug shape fixed elsewhere on 2026-08-07 (see `.claude/plans/connector-microsoft-impl.md`) for `ensureAppFolderStructure` and the Google/OneDrive `route.ts`/`callback/route.ts` provisioning gates: `firm.firmFolderId` is a single column shared across every connector a firm has, so it can go stale/cross-contaminated once a firm has more than one connector (e.g. Google + OneDrive). Also reads `orgFolderId` from `firm.settings` instead of `connector.settings` — likely always empty, a second latent bug in the same function. Should read solely from `connector.settings.organizations[firmId].orgFolderId` on the firm's actual connector, matching the fix applied to the other call sites.

## Engagement > Files

### 3. `.txt` and `.csv` file preview not supported
Preview for `.txt` and `.csv` files is currently unsupported. It should be.
