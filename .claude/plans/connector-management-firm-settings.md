# Plan: Move Connector Management to Firm Settings

## Goal
Connector lifecycle (connect, reconnect, disconnect, remove, switch, test) moves to Firm Settings → Document Storage section.  
Client Settings → Document Storage becomes read-only: shows attached connector name/status + an Attach button.

## Data Model
No changes. `Connector.firmId` column stays as-is — it's a proper FK, indexed, correct cardinality.

---

## Step 1 — Server actions in `lib/actions/firms.ts`

Add 4 new exported server actions:

### `getFirmConnectors(firmId)`
Returns all connectors for a firm with their attached clients.
```ts
type FirmConnectorRecord = {
  id: string; name: string; email: string; status: string
  workspaceRootLocation: string | null
  rootFolderId: string | null
  attachedClients: { id: string; name: string }[]
}
```
- Query `connector.findMany({ where: { firmId } })`
- Query `client.findMany({ where: { firmId, connectorId: { in: [...ids] }, deletedAt: null } })`
- Group clients by connectorId, merge into each record
- Derive `email` from `settings.accountEmail ?? externalAccountId`

### `disconnectFirmConnector({ connectorId, firmId })`
Revokes the live session without nulling `client.connectorId` (clients stay linked, just show Disconnected).
- Verify connector.firmId === firmId
- `connector.update({ status: 'REVOKED', accessToken: '', refreshToken: null, tokenExpiresAt: null })`
- Fire `STORAGE_CONNECTOR_DETACHED` audit event
- `revalidatePath('/d/f')`

### `removeFirmConnector({ connectorId, firmId })`
Full cleanup — same logic as `removeClientConnector` but keyed by connectorId directly.
- Verify ownership
- Clear `engagement.connectorRootFolderId` for all linked engagements
- Null `client.connectorId` + `driveFolderId` for all linked clients
- Null `firm.firmFolderId`
- Hard-delete the connector row
- Fire `STORAGE_CONNECTOR_DETACHED` audit event
- `revalidatePath('/d/f')`

### `renameFirmConnector({ connectorId, firmId, name })`
Like `renameClientConnector` but checks firm membership instead of `connector.userId`.

---

## Step 2 — New component `components/connectors/firm-drive-section.tsx`

Self-contained. Props: `{ firmId, orgSlug, isSandboxFirm? }`

### State
- `connectors: FirmConnectorRecord[]` — from `getFirmConnectors`
- `statusMap: Record<string, { rootFolderName: string | null } | null>` — lazy-loaded per card via `/api/connectors/google-drive?action=status&connectionId=`
- `disconnectTarget / removeTarget: FirmConnectorRecord | null` — for confirm dialogs
- `testResult / isTestModalOpen` — reuse `ConnectionTestModal`
- `switchModalOpen / switchTargetConnectorId` — reuse `SwitchAccountModal`
- `loading: boolean` — OAuth in progress
- `friendlyName / friendlyNameTouched` — for "Connect new account" form

### Per-connector card
- Left: GoogleDriveProductMark, name/email, status dot
- Below card: `Used by: ClientA, ClientB` (from `attachedClients`) or `"Not attached to any clients"`
- Right buttons:
  - ACTIVE: Test · Switch · Disconnect
  - REVOKED: Edit name · Reconnect · Remove

### Connect new account
- Same name input + arrow button pattern as existing `ClientDriveSection` no-connector branch
- OAuth body: `{ organizationId: firmId, skipAutoFolder: true, friendlyName }` — no `clientId`

### Reconnect(connectorId)
- Same OAuth flow with `replaceConnectorId: connectorId`

### Disconnect / Remove confirm dialogs
- Show `connector.attachedClients` list from already-loaded state (no extra fetch)
- Amber warning block when `attachedClients.length > 0`
- Call `disconnectFirmConnector` or `removeFirmConnector` on confirm

### Workspace root per card
- Show `GoogleDriveWorkspaceRoot` inline when ACTIVE, populated from `statusMap[id]`

---

## Step 3 — Update `components/projects/firm-settings-form.tsx`

1. Add `'storage'` to `Section` type union
2. Import `FirmDriveSection` and `HardDrive` icon
3. Insert new section between App Settings and Danger Zone:

```tsx
{/* ── 4. DOCUMENT STORAGE ── */}
<section className="border border-[#e5e7eb] rounded overflow-hidden">
  <button onClick={() => toggleSection('storage')} ...>
    <HardDrive className="h-3.5 w-3.5" />
    <span>Document Storage</span>
  </button>
  <div className={`grid ... ${openSection === 'storage' ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
    <div className="p-5 border-t bg-white">
      {orgId
        ? <FirmDriveSection firmId={orgId} orgSlug={orgSlug} isSandboxFirm={isSandboxFirm} />
        : <div className="text-xs text-[#9a9ba0]">Loading…</div>
      }
    </div>
  </div>
</section>
```

---

## Step 4 — Strip `components/connectors/client-drive-section.tsx`

### Remove entirely
- `startOAuthFlow`, `handleConnect`, `handleReconnect`
- `openDisconnectConfirm`, `handleDisconnect`
- `openRemoveConfirm`, `handleRemove`
- `handleTestConnection`, `handleOpenSwitchModal`, `handleSwitchAccount`
- `handleSaveName`
- All migration/maintenance state + fetch
- State: `testingConnection`, `testResult`, `isTestModalOpen`, `switchModalOpen`, `firmAdmins`, `editingName`, `editNameValue`, `savingName`, `migrationPending`, `migrationActive`, `latestMigrationStatus`, `failedFileCount`, `disconnectConfirmOpen`, `removeConfirmOpen`, `siblingClients`
- Imports: `SwitchAccountModal`, `ConnectionTestModal`, `GoogleDriveWorkspaceRoot`, lifecycle icons

### Keep + simplify
- `isLoadingData`, `connection`, `loading` (for attach flow), `sharingConnectorId`, `firmConnectors`
- Lightweight status fetch on mount (name + email + status only — no workspace root)
- `loadFirmConnectors` — triggered when attach dialog opens

### Add
- `attachDialogOpen: boolean`
- `handleAttach(connectorId)` — renamed `handleShareExisting`

### New render output
**Connected:**
```
[Drive icon] DataSentry Google Drive  ●  deepak@...      [Attach]
```
**Not connected:**
```
No storage connector linked                               [Attach]
```

### Attach dialog
- Lists `firmConnectors` (loaded on dialog open)
- Each row: connector name/email, status dot, click to attach
- Empty state: "No connectors set up yet. Add one in Firm Settings → Document Storage."
- On select: calls `shareConnectorWithClient`, toasts, refreshes, closes dialog

---

## Step 5 — `components/projects/client-settings-form.tsx`

No prop changes to `<ClientDriveSection />` call — interface stays identical.  
Optional: add a muted note below the section header: `"Manage connectors in Firm Settings → Document Storage"`

---

## Implementation Order

| # | What | Risk |
|---|------|------|
| 1 | Server actions in `firms.ts` | Low — additive only |
| 2 | Create `firm-drive-section.tsx` | Medium — new file, no existing changes |
| 3 | Add storage section to `firm-settings-form.tsx` | Low — additive |
| 4 | Strip `client-drive-section.tsx` | High — destructive, do after firm side confirmed working |
| 5 | Note in `client-settings-form.tsx` | Low — cosmetic |

---

## Key Gotchas

- `orgId` in `FirmSettingsForm` starts null (async fetch) — guard with `{orgId ? <FirmDriveSection> : loading}`. Caller in `firm-clients-view.tsx` passes `orgId={orgId}` so it resolves quickly.
- OAuth from firm context omits `clientId` in body — callback route already handles this (folder provisioning is skipped when no `clientId`).
- `disconnectFirmConnector` marks REVOKED but does NOT null `client.connectorId` — clients stay linked and show "Disconnected" in read-only view, reconnect path is via Firm Settings only.
- `isSandboxFirm` must be passed to `FirmDriveSection` to disable all action buttons in sandbox mode.
