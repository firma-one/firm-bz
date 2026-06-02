# Connector: Replace Owning Account

## Context

The Connectors settings page already supports reconnecting (re-auth as the same Google account) and disconnecting. The new requirement is to let a firm admin **replace the owning Google account** on an existing Connector — authenticate as a different Google account, and have the old tokens/account info replaced in-place on that Connector record.

This is distinct from:
- **Reconnect** — re-auths the same Google account (refresh tokens)
- **Disconnect** — revokes and removes the connector

Use case: the account that originally connected Drive is no longer available (person left, account deleted, etc.), so an admin needs to re-own the connection under a different Google account.

---

## What Changes

### 1. OAuth state — add `replaceConnectorId`

**File:** `frontend/app/api/connectors/google-drive/route.ts`

In the `initiate` action (POST body → stateObj), accept `replaceConnectorId` from the request body and include it in the base64-encoded state object passed to Google:

```typescript
const stateObj = {
  userId,
  organizationId: body.organizationId,
  rootFolderId: rootFolderId || null,
  next: body.next || null,
  flow,
  skipAutoFolder: body.skipAutoFolder === true,
  replaceConnectorId: body.replaceConnectorId || null,   // NEW
  ...(nonce && { nonce }),
  ...
}
```

### 2. OAuth callback — detect and handle replace mode

**File:** `frontend/app/api/connectors/google-drive/callback/route.ts`

After decoding state, if `replaceConnectorId` is present:

1. Load the old Connector record (verify it belongs to the current `organizationId`/firm).
2. Call `storeConnection()` normally — it upserts by `type + userId` of the **new** auth user, creating or updating that record with the new tokens.
3. After `storeConnection()` returns the new connector, if the new connector's `id !== replaceConnectorId`:
   - Update the old connector: `status = REVOKED`, clear `accessToken`, `refreshToken`, `tokenExpiresAt`, and unlink from firm (`firmId = null`).
   - Link the new connector to the firm (`firmId = firm.id`).
4. If the new connector's `id === replaceConnectorId` (same userId re-authed): no extra steps needed, tokens already updated in-place.

> Note: `storeConnection()` already handles linking connector to firm via `organizationId`. The extra step (3) is only to clean up the *old* connector when it's a genuinely different account/userId.

### 3. `storeConnection()` — also update `externalAccountId`

**File:** `frontend/lib/google-drive-connector.ts`

In the `update` branch of `storeConnection()` (around line 1740), also write `externalAccountId` so it stays in sync when the account changes:

```typescript
await prisma.connector.update({
  where: { id: existingConnector.id },
  data: {
    externalAccountId,   // ADD THIS
    name,
    avatarUrl,
    accessToken,
    refreshToken: refreshToken ?? existingConnector.refreshToken,
    tokenExpiresAt,
    status: ConnectorStatus.ACTIVE,
    updatedAt: new Date(),
    settings: mergedSettings,
  }
})
```

### 4. UI — "Replace account" button

**File:** `frontend/app/(app)/d/f/[slug]/connectors/page.tsx`

Add a **"Replace account"** button alongside the existing Test / Reconnect / Disconnect buttons in the account action section (around line 544). Clicking it:

1. Calls `handleConnectGoogleDrive()` (or a thin wrapper) with the current `connection.id` passed as `replaceConnectorId`.
2. After the popup closes and the parent receives the success message, refreshes the connector list.

UI copy: **"Replace account"** with a brief tooltip: "Authenticate as a different Google account. The Drive workspace and all folders remain unchanged."

Add a confirmation step (simple `AlertDialog` or inline warning banner before the OAuth popup opens) informing the user:

> "This will disconnect **[current-email]** and authenticate as a new account. The Drive workspace structure is preserved."

No new component file needed — use the existing `AlertDialog` already used elsewhere in the page.

---

## Files to Touch

| File | Change |
|------|--------|
| `frontend/app/api/connectors/google-drive/route.ts` | Accept + forward `replaceConnectorId` in state |
| `frontend/app/api/connectors/google-drive/callback/route.ts` | Handle replace mode: revoke old connector, re-link firm |
| `frontend/lib/google-drive-connector.ts` | Also update `externalAccountId` on upsert |
| `frontend/app/(app)/d/f/[slug]/connectors/page.tsx` | Add "Replace account" button + confirmation |

---

## Verification

1. In the connectors settings page, with an active connector, click **"Replace account"**.
2. Confirm the warning dialog, complete Google OAuth as a **different** account.
3. After the popup closes, the connector card should show the new account's email and avatar.
4. The old account should no longer appear (it's been revoked + de-linked).
5. The Drive workspace root (folder IDs, client/engagement folders) should be unchanged — verify by navigating to an engagement's documents.
6. Re-test with the **same** Google account to confirm reconnect still works without double-records.
7. Check the DB: old connector's `status = REVOKED`, `firmId = null`; new connector has `firmId = firm.id` and correct `externalAccountId`.
