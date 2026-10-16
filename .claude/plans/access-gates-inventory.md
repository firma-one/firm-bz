# Access-gate inventory — raw audit, 2026-10-15

Read-only audit of every `'use server'` export and every `app/api/**/route.ts` handler in the working tree, done in four parallel passes. Companion to [access-gates.md](access-gates.md), which has the summary, root causes and migration order.

**How to read it:** the verdicts follow one rubric across all four passes.
- **OK:** checks both sign-in and rights on the named entity.
- **SELF:** touches only the caller's own rows.
- **PUBLIC:** intentionally works without sign-in.
- **AUTH-ONLY:** checks sign-in but not rights on the entity it acts on.
- **PARTIAL:** checks the wrong scope, trusts a caller-supplied scope id, or checks view rights for a write.
- **MISSING:** no check at all.
- **UNSURE:** depends on something the audit could not see.

"Risk" is the impact if the gap is real; on OK rows it is the endpoint's inherent sensitivity.

**Spot-checked by hand:**
- the firm-logo SVG, waitlist `to:` and support-tickets claims (pass B);
- `/drive-action` connector trust, and `sharing` GET plus `sharing/ids` GET being sign-in only (pass C);
- `inviteClientMember` with the caller's `firmId`, `getFirmMembers` being sign-in only, and the unscoped `deleteClientContact` (pass A);
- the token route having no auth, `ensure-org` forging the persona, and `/api/connectors` GET being sign-in only (pass D).

Everything else is the auditors' reading of the code: treat it as **to be confirmed when fixing**.

---

## A. Server actions — `lib/actions/**` (120 exports)

READ-ONLY inventory of 120 exports across the 28 'use server' files in /Users/deepak/Personal/Projects/firma-one/firm-bz/frontend/lib/actions/. Working tree read, not HEAD. No file was edited. The 120 includes 7 `export const` aliases in project.ts, each its own endpoint.

**Identity parameters:** no export takes a `userId` or other identity parameter. Closest cases:
- `updateClient`'s `data.ownerId` is validated as a firm member.
- `inviteClientMember(firmId)` and `createManualReminder(firmId, entityKey, entityValue)` take caller-supplied scope that is NOT validated.
- `reportActionFailure(firmSlug, clientSlug, projectSlug)` takes caller-supplied scope that is NOT validated.

**Legend.** Risk is the impact if the endpoint were reachable unguarded, so OK and SELF rows still show their sensitivity. `CMC` means `canManageClient`, `COM` means `canManageOrganization`, `RCM` means `requireClientManager`, `REM` means `requireEngagementManager`.

#### 0. Findings that change how to read the table

1. **`checkClientPermission` and `checkProjectPermission` never tie `clientId` or `projectId` to `firmId`.**
   - `checkClientPermission` returns true for any `clientId` in two cases. One is the JWT fast path, when `active_firm_id` equals `firmId` and the persona is firm_admin. The other is the fallback when the caller is `firm_admin` of `firmId`.
   - `checkProjectPermission` has the same flaw through its firm_admin and client-can_manage fallbacks.
   - So any gate built on a caller-supplied `firmId` is bypassable by a firm_admin of any firm.
   - Any signed-in user can become firm_admin of a fresh firm via `createOwnWorkspace`.
   - `firms.ts:226` (`createOwnWorkspace`) has no cap or rate limit and creates a Group, Firm and Polar free plan on every call.
2. **The JWT persona fast path is never revoked.**
   - `checkFirmPermission` and `checkClientPermission` trust `app_metadata.active_firm_id` plus `active_persona`.
   - Nothing clears them in `removeFirmMember`, `removeMember` or `deleteFirm`. Only `switchFirm`, the sign-in callback (when the field is missing) and invite acceptance rewrite them.
   - A removed firm_admin keeps `firm:can_manage` and `client:can_manage` for the firm and every client in it.
   - `FirmService.updateFirm`, `FirmService.deleteFirm` and `deleteClient` use DB roles and are unaffected.
3. **`removeFirmMember` revokes too little.**
   - It deletes only the `FirmMember` row.
   - `computePermissions` (`lib/user-settings-plus.ts`) builds the tree from `EngagementMember` and `ClientMember` rows even without a `FirmMember` row.
   - Rows auto-created for firm admins by `createClient` (client_admin) and `createEngagement` (eng_admin) survive, along with Drive grants.
4. **External guests (EC/EV) hold `FirmMember(role=firm_member)` rows** (`engagement-membership.ts`, default `membershipType`). So "has a firm member row" does not mean internal. Domain-joined users also get `firm_member`.
5. **`acceptInvitation` only rejects JOINED status and expiry.** `removeFirmMember` and `removeMember` set invites to SUPERSEDED, which is not rejected.
6. **`getSession()` instead of `getUser()` in 7 exports:** `getFirmCalendarData`, `getUserFirms`, and all 5 in `hierarchy.ts`. `getSession()` trusts the cookie without server verification. It is only mitigated because `proxy.ts` runs `getUser()` and redirects unauthenticated requests on `/d/*`.
7. **`isAgentUser` trusts user-writable `user_metadata`.** This is cosmetic only: it hides a user from member summaries and suppresses reminders.

#### 1. Table

| Endpoint | Takes | Check today | Verdict | Risk | Gate it needs |
|---|---|---|---|---|---|
| calendar.ts:80 `getFirmCalendarData` | firmSlug | `getSession()` cookie; FirmMember row; engagements filtered to caller's EngagementMember rows; EC/EV due-date filter | SELF | Low | self (use `getUser`) |
| client-members.ts:21 `getClientMembers` | clientId | `getUser` only; service-role lookup of every member's email/name; returns invitations incl. `token` | AUTH-ONLY | High | client manage (firm read from client row); strip tokens |
| client-members.ts:65 `inviteClientMember` | firmId, clientId, email | `getUser`; `CMC(firmId, clientId)` with caller's firmId (never bound to clientId, see section 0 item 1); client loaded by clientId only; sends email, creates ClientInvitation as client_admin | PARTIAL | High | client manage, with firmId taken from `client.firmId` |
| client-members.ts:155 `resendClientInvitation` | invitationId | `getUser`; firmId from invite.client; `CMC` | OK | Medium | client manage |
| client-members.ts:200 `revokeClientInvitation` | invitationId | same | OK | Medium | client manage |
| client.ts:42 `createClient` | organizationSlug, data | `getUser`; firm by slug; any FirmMember row (incl. EC/EV, domain-joined); billing/cap gates run before membership check | PARTIAL | High | firm manage / client:can_manage on firm (the UI's `canCreateClient`) |
| client.ts:251 `updateClient` | orgSlug, clientSlug, data (ownerId) | `getUser`; FirmMember; client resolved inside that firm; `CMC(firm.id, client.id)`; ownerId must be firm member | OK | High | client manage |
| client.ts:404 `listClientContacts` | orgSlug, clientSlug | `getUser`; FirmMember only; returns contact names/emails/phones/notes | PARTIAL | High | client view at minimum (ClientMember/engagement member), not any firm member |
| client.ts:446 `createClientContact` | orgSlug, clientSlug, data (projectId) | `assertCanManageClient` (slugs resolved in caller's firm, then `CMC`); `projectId` not validated to belong to the client | OK | Medium | client manage; validate projectId is in client |
| client.ts:485 `updateClientContact` | slugs, contactId, data | `assertCanManageClient` on slugs, but `clientContact.update({where:{id}})` is unscoped; projectId unvalidated | PARTIAL | High | client manage AND contact.clientId equals resolved clientId |
| client.ts:521 `deleteClientContact` | slugs, contactId | same; `delete({where:{id}})` unscoped | PARTIAL | High | same |
| client.ts:539 `setClientContactPrimary` | slugs, contactId | `updateMany` scoped to own client, then `update({where:{id:contactId}})` unscoped | PARTIAL | Medium | same |
| client.ts:556 `deleteClient` | orgSlug, clientSlug | `getUser`; DB `firmMember.role==='firm_admin'` in firm from slug; client inside firm; hard delete | OK | High | firm manage |
| client.ts:612 `getConnectorSiblingClients` | clientId | `RCM` (firm from client row) | OK | Low | client manage |
| client.ts:629 `shareConnectorWithClient` | clientId, connectorId | `getUser`; firm from client row; `connector.firmId===client.firmId`; `CMC` | OK | High | client manage (optionally connector owner or firm manage) |
| client.ts:734 `removeClientConnector` | clientId | `RCM` then `removeConnector` re-checks | OK | High | client manage |
| client.ts:747 `renameClientConnector` | connectorId, name | `getUser`; `connector.userId===caller` | SELF | Low | owner (or firm manage) |
| client.ts:766 `disconnectClientConnector` | clientId | `getUser`; firm from client row; `CMC` (a client manager can revoke a firm-shared connector) | OK | High | client manage |
| client.ts:800 `upsertClientBrand` | clientId, data | `RCM`; brand id read from client's own settings | OK | Medium | client manage |
| connectors.ts:25 `removeConnector` | connectorId | `getUser`; firm from connector row; `COM(connector.firmId)` or `CMC` on a linked client; if firm-less, owner only | OK | High | firm manage, or client manage on a client using it |
| domain-onboarding.ts:21 `getDomainOnboardingOptionsForCurrentUser` | none | `getUser` (redirects if signed out); looks up the caller's own email domain | SELF | Low | self |
| domain-onboarding.ts:33 `joinOrganizationByDomain` | organizationId | `getUser`; caller's email domain must equal `firm.allowedEmailDomain` and `allowDomainAccess`; creates firm_member. No `email_confirmed_at` check | SELF | Medium | self (also require a verified email) |
| engagement-wiki.ts:131 `getWikiPages` | engagementId | `requireWikiAccess('read')`: `getUser`, firm/client from engagement, `canViewProjectInternalTabs` | OK | Medium | engagement internal view |
| engagement-wiki.ts:140 `getWikiPageContent` | pageId | `requireWikiPageAccess('read')` resolves the page's own engagement | OK | Medium | engagement internal view |
| engagement-wiki.ts:165 `createWikiPage` | engagementId, ignored firmId, opts | `requireWikiAccess('write')` (view-internal AND `canEditProject`); parent verified in same engagement; firm from engagement | OK | Medium | engagement edit |
| engagement-wiki.ts:229 `updateWikiPage` | pageId, patch | `requireWikiPageAccess('write')` | OK | Medium | engagement edit |
| engagement-wiki.ts:302 `deleteWikiPage` | pageId | `requireWikiPageAccess('write')`; trashes Drive files | OK | High | engagement edit |
| engagement-wiki.ts:338 `reorderPages` | orderedIds | all pages must exist in one engagement, then `requireWikiAccess('write')` | OK | Low | engagement edit |
| firm-members.ts:24 `getFirmMembers` | firmId | `getUser` only; returns every member's email/name/role/ownsConnector plus invitations incl. `token` | AUTH-ONLY | High | firm manage (Members tab; a client-settings owner picker needs a narrower action); strip tokens |
| firm-members.ts:79 `removeFirmMember` | firmId, memberId | `getUser`; `COM(firmId)`; `member.firmId===firmId`; last-admin guard. Offboarding incomplete (section 0 item 3) | OK | High | firm manage |
| firm-members.ts:123 `inviteFirmMember` | firmId, email | `getUser`; `COM(firmId)`; always invites as firm_admin | OK | High | firm manage |
| firm-members.ts:223 `resendFirmInvitation` | invitationId | `getUser`; `COM(invite.firmId)` | OK | Medium | firm manage |
| firm-members.ts:276 `revokeFirmInvitation` | invitationId | `getUser`; `COM(invite.firmId)` | OK | Medium | firm manage |
| firm.ts:10 `getFirmRole` | firmSlug | `getUser`; own FirmMember row | SELF | Low | self |
| firms.ts:54 `getUserFirms` | none | `getSession()` cookie; own memberships | SELF | Low | self (use `getUser`) |
| firms.ts:109 `getCanCreateAdditionalFirm` | none | `getUser`; own groups | SELF | Low | self |
| firms.ts:116 `getFirmCreationGateReasonForCurrentUser` | none | `getUser`; own groups | SELF | Low | self |
| firms.ts:124 `getIsAdminOnAnyFirm` | none | `getUser`; own memberships | SELF | Low | self |
| firms.ts:144 `getIsGroupAdmin` | groupSlug | `getUser`; own GroupMember row | SELF | Low | self |
| firms.ts:172 `getUserGroups` | none | `getUser`; own firms/groups | SELF | Low | self |
| firms.ts:211 `shouldShowSwitchWorkspace` | none | via `getUserGroups` | SELF | Low | self |
| firms.ts:226 `createOwnWorkspace` | none | `getUser`; creates a new Group, Firm and Polar free plan; no cap or rate limit | SELF | Medium | self + rate limit/cap (it is the route to firm_admin of a throwaway firm) |
| firms.ts:244 `getDefaultFirmSlug` | none | `getUser`; own default firm | SELF | Low | self |
| firms.ts:259 `getDefaultFirmWithOnboardingStatus` | none | `getUser`; own | SELF | Low | self |
| firms.ts:279 `firmAdminMustCompleteOnboarding` | none | `getUser`; own | SELF | Low | self |
| firms.ts:292 `createFirm` | CreateFirmData (name, groupSlug, domain fields) | `getUser`; `requireNonSandboxFirmCreationAccess`; `resolveGroupForNewFirmInGroup` (admin on a firm in that group and under cap); `createFirmWithMember` re-checks group membership | OK | Medium | self + group-admin/cap (present) |
| firms.ts:377 `switchFirm` | firmSlug | `getUser`; requires FirmMember in that firm; rewrites own `app_metadata` | SELF | Medium | self |
| firms.ts:479 `updateFirm` | firmSlug, data | `getUser`; delegates to `FirmService.updateFirm`: DB `role==='firm_admin'` on `firm.id`. `allowDomainAccess`/`allowedEmailDomain` are silently dropped there (functional bug) | OK | High | firm manage |
| firms.ts:579 `deleteFirm` | firmSlug | `getUser`; `FirmService.deleteFirm`: DB firm_admin; hard delete | OK | High | firm manage |
| firms.ts:634 `getFirmConnectors` | firmId | `requireFirmManager(firmId)` = `COM`, same id used for the query | OK | Medium | firm manage |
| firms.ts:689 `disconnectFirmConnector` | connectorId, firmId | connector.firmId must equal firmId; `requireFirmManager(connector.firmId)` | OK | High | firm manage |
| firms.ts:713 `removeFirmConnector` | connectorId | `requireFirmManager(connector.firmId)` then `removeConnector` | OK | High | firm manage |
| firms.ts:721 `renameFirmConnector` | connectorId, firmId, name | firm bound to connector; `requireFirmManager` | OK | Low | firm manage |
| firms.ts:743 `getFirmAllClients` | firmId | `requireFirmManager(firmId)` | OK | Medium | firm manage |
| firms.ts:754 `detachConnectorFromClient` | clientId, firmId | client.firmId must equal firmId; `requireFirmManager(client.firmId)` | OK | High | firm manage |
| hierarchy.ts:79 `getFirmHierarchy` | firmSlug | `getSession()` cookie; FirmMember; clients via ClientMember or any engagement membership. Returns internalMemo, billingAddress, relationshipValue, leadSource, ownerId, connector accountEmail, engagement rateOrValue and settings to EC/EV too | PARTIAL | Medium | self-scoped, plus strip internal CRM fields for external roles |
| hierarchy.ts:259 `getClients` | firmSlug | same pattern; same fields | PARTIAL | Medium | same |
| hierarchy.ts:369 `getClientWithEngagements` | firmSlug, clientSlug | same pattern; client by slug+firm, membership in WHERE | PARTIAL | Medium | same |
| hierarchy.ts:493 `getIsOrgInternal` | firmSlug | `getSession()` cookie; returns true for any firm_member, so guests count as "internal" | SELF | Low | self (mislabel only) |
| hierarchy.ts:518 `getFirmName` | firmSlug | `getSession()` cookie; membership check before returning name | SELF | Low | self |
| inbox.ts:20 `getInboxCounts` | none | `getUser`; filters by own userId | SELF | Low | self |
| invitations.ts:23 `inviteMember` | projectId, email, personaId | `getUser`; `REM(projectId)`; persona must be an engagement role | OK | High | engagement manage |
| invitations.ts:182 `resendInvitation` | invitationId | `getUser`; `REM(invite.engagementId)` | OK | Medium | engagement manage |
| invitations.ts:256 `verifyInvitation` | token | no sign-in; bearer UUID token; returns invitee email/names; flips engagement invites PENDING to ACCEPTED | PUBLIC | Low | none (the unguessable token is the credential; add rate limit) |
| invitations.ts:356 `acceptInvitationAction` | token | wrapper of `acceptInvitation` | PARTIAL | High | see `acceptInvitation` |
| invitations.ts:381 `acceptInvitation` | token | `getUser`; invite email must equal caller email; expiry; only JOINED short-circuits. SUPERSEDED/ERROR not rejected; firm invites always grant firm_admin | PARTIAL | High | token + email match + status must be PENDING/ACCEPTED |
| members.ts:23 `getProjectMembers` | projectId | `getUser`; `canViewProjectInternalTabs` (firm/client from engagement); returns invitations incl. `token` | OK | Medium | engagement internal view (strip tokens) |
| members.ts:89 `getProjectMemberSummaries` | projectIds[] | `getUser`; per-engagement `canViewProject` only; returns member names/emails/personas to EC/EV | PARTIAL | Medium | engagement internal view (same as `getProjectMembers`) |
| members.ts:162 `removeMember` | memberId | `getUser`; `REM(member.engagementId)` | OK | High | engagement manage |
| members.ts:322 `revokeInvitation` | invitationId | `getUser`; `REM(invite.engagementId)` | OK | Medium | engagement manage |
| members.ts:349 `updateMemberPersona` | memberId, personaId | `getUser`; `REM`; persona restricted to engagement roles | OK | High | engagement manage |
| permissions.ts:8 `getFirmClientPermissions` | firmId, clientId | `getUser`; reads only the caller's own permission tree | SELF | Low | self |
| personas.ts:10 `getPersonas` | none | no sign-in; static persona catalog (slug/displayName/description) | MISSING | Low | sign-in (benign reference data) |
| personas.ts:19 `getProjectPersonas` | none | same | MISSING | Low | sign-in |
| personas.ts:29 `getOrganizationPersonas` | none | same | MISSING | Low | sign-in |
| personas.ts:40 `ensureProjectPersonasForProject` | _projectId | no sign-in; no-op | MISSING | Low | remove |
| profile.ts:15 `updateProfileNames` | firstName, lastName | `getUser`; updates caller's own user_metadata and Polar customer name | SELF | Low | self |
| project.ts:51 `createEngagement` | firmSlug, clientSlug, data | `getUser`; any FirmMember row; client by slug in firm; caller becomes eng_admin, firm admins and client admins auto-added, Drive folders created | PARTIAL | High | client manage, or internal member of that client (never EC/EV) |
| project.ts:326 `getEngagementFolderIds` | projectId | `getUser` only; uses the client's connector tokens against Drive; returns folder ids | AUTH-ONLY | Medium | engagement view |
| project.ts:379 `canViewEngagementSettings` | projectId | `getUser`; the caller's own `project:can_manage` on the engagement's real firm/client | SELF | Low | self |
| project.ts:405 `updateEngagement` | projectId, data, firmSlug, clientSlug | `assertCanManageProject` (`project:can_manage`, ids from the engagement); slugs only used for paths | OK | High | engagement manage |
| project.ts:608 `closeEngagement` | projectId, slugs | `assertCanManageProject` | OK | High | engagement manage |
| project.ts:717 `reopenEngagement` | projectId, slugs | `assertCanManageProject` | OK | Medium | engagement manage |
| project.ts:757 `deleteEngagement` | projectId, slugs | `assertCanManageProject` | OK | High | engagement manage |
| project.ts:871 `provisionEngagementDriveFolder` | engagementId | `getUser` only; creates a folder tree with the client's connector and writes `connectorRootFolderId`; returns the folder id | AUTH-ONLY | High | engagement manage |
| project.ts:912 `updateEngagementInsightsSummary` | projectId, summary | `assertCanManageProject` | OK | Medium | engagement manage |
| project.ts:954 `approveEngagementAiSummary` | projectId, editedContent | `assertCanManageProject`; publishes client-facing text | OK | Medium | engagement manage |
| project.ts:1017 `dismissEngagementAiSummary` | projectId | `assertCanManageProject` | OK | Low | engagement manage |
| project.ts:1054 `createProject` (alias of `createEngagement`) | same | same | PARTIAL | High | same |
| project.ts:1055 `getProjectFolderIds` (alias of `getEngagementFolderIds`) | same | same | AUTH-ONLY | Medium | engagement view |
| project.ts:1056 `canViewProjectSettings` (alias) | same | same | SELF | Low | self |
| project.ts:1057 `updateProject` (alias) | same | same | OK | High | engagement manage |
| project.ts:1058 `closeProject` (alias) | same | same | OK | High | engagement manage |
| project.ts:1059 `reopenProject` (alias) | same | same | OK | Medium | engagement manage |
| project.ts:1060 `deleteProject` (alias) | same | same | OK | High | engagement manage |
| quick-search.ts:38 `quickSearch` | query, firmSlug | `getUser`; engagement/client rows limited to the caller's memberships; files via `computeGlobalSearchAccessScope` plus firm membership; locked docs excluded | SELF | Low | self |
| quick-search.ts:154 `getCommandRecents` | firmSlug | `getUser`; `getRecentVisits` filters by userId and membership, re-checks access | SELF | Low | self |
| recents.ts:87 `recordVisit` | path | `getUser`; entity must be visible by the caller's membership | SELF | Low | self |
| recents.ts:112 `importLegacyRecents` | items[] | `getUser`; each item passes the same visibility check; capped at 30 | SELF | Low | self |
| report-action-failure.ts:14 `reportActionFailure` | action, error, context (arbitrary JSON), firmSlug, clientSlug, projectSlug | no sign-in (`submitErrorTicket` accepts anonymous); slugs resolved to ids with no membership check; unbounded JSON stored | MISSING | Medium | sign-in plus membership of the named entity, rate limit, size cap |
| shell.ts:57 `getShellSidebarData` | firmSlug | `getUser`; FirmMember; clients/engagements by own membership; bookmarks filtered to own visible engagements | SELF | Low | self |
| system-admin-signup.ts:141 `sendSystemAdminSignupInvite` | rawInput (email, name, coupon) | zod; local `assertSystemAdmin` = `getUser` + `isSystemAdminEmail(email)` | OK | High | system admin |
| system-admin-signup.ts:174 `getSystemSignupInvites` | none | `assertSystemAdmin` | OK | Medium | system admin |
| system-admin-signup.ts:219 `resendSystemSignupInvite` | inviteId | `assertSystemAdmin` | OK | Medium | system admin |
| system-admin-signup.ts:271 `updateSystemSignupInvite` | rawInput | `assertSystemAdmin` | OK | Low | system admin |
| user-bookmarks.ts:24 `getUserBookmarks` | none | `getUser`; own bookmarks, but resolves engagement/client/firm/group names and slugs for any `projectId` in the list; `POST /api/bookmarks` stores arbitrary `projectId` unvalidated | PARTIAL | Medium | self, plus re-check engagement access when enriching |
| user-notification-prefs.ts:20 `setUserTimezone` | timezone | `getUser`; validates timezone; writes own row | SELF | Low | self |
| user-reminders.ts:52 `getUserReminders` | none | `getUser`; own reminders | SELF | Low | self |
| user-reminders.ts:63 `getAllUserReminders` | none | `getUser`; own | SELF | Low | self |
| user-reminders.ts:78 `checkDailyReminderDigest` | none | `getUser`; own | SELF | Low | self |
| user-reminders.ts:111 `markReminderDone` | reminderId | `getUser`; own list only. Clears a client/engagement date column by the reminder's entity id without re-checking rights (stale reminder) | SELF | Low | self |
| user-reminders.ts:136 `hideReminder` | reminderId | `getUser`; own list | SELF | Low | self |
| user-reminders.ts:151 `showReminder` | reminderId | `getUser`; own list | SELF | Low | self |
| user-reminders.ts:166 `markAllRemindersDone` | reminderIds[] | loops `markReminderDone`; unbounded array | SELF | Low | self (cap array) |
| user-reminders.ts:173 `createManualReminder` | entityKey, entityValue, action, dateValue, entityName, firmId, ctaUrl, note | `getUser`; writes only to the caller's list, but entityKey/entityValue are unvalidated and `computeDueReminders` resolves them through `resolveEntity` | PARTIAL | High | validate that the caller can view the referenced entity (or restrict to a fixed key set) |
| user-settings.ts:11 `buildUserSettingsPlus` | none | `getUser`; own cache | SELF | Low | self |
| user-settings.ts:37 `refreshMyUserSettingsPlus` | none | `getUser`; own cache | SELF | Low | self |
| user-ui-prefs.ts:16 `setUiShell` | shell | `getUser`; atomic upsert on own userId; sets cookie | SELF | Low | self |
| user-ui-prefs.ts:48 `setSidebarCollapsed` | collapsed | `getUser`; own row | SELF | Low | self |
| workspace-folder-name.ts:5 `getWorkspaceFolderName` | none | no sign-in; returns a constant | MISSING | Low | none needed (a constant) |

#### 2. Counts per verdict (120 total)

- OK: 51
- SELF: 41
- PARTIAL: 16
- MISSING: 6 (`personas.ts` ×4, `reportActionFailure`, `getWorkspaceFolderName`; only `reportActionFailure` is a real gap)
- AUTH-ONLY: 5 (`getClientMembers`, `getFirmMembers`, `getEngagementFolderIds`, `provisionEngagementDriveFolder`, `getProjectFolderIds`)
- PUBLIC: 1 (`verifyInvitation`)
- UNSURE: 0

#### 3. Top 10 gaps, most severe first

1. **`inviteClientMember(firmId, clientId, email)`, client-members.ts:65.**
   - A signed-in user calls `createOwnWorkspace`, which makes them firm_admin of a throwaway firm.
   - They then call `inviteClientMember(ownFirmId, otherTenantClientId, theirEmail)`.
   - `canManageClient` passes on the firm_admin fallback without checking the client belongs to that firm.
   - A client_admin invitation on someone else's client is created and emailed, and accepting it adds them as a client member.
   - For a guest (EC/EV) who already has an engagement under that client, this yields `client:can_manage`. That gives full project rights on every engagement of that client where they hold no membership.
2. **`getFirmMembers(firmId)` / `getClientMembers(clientId)`.** Any signed-in user calls `getFirmMembers(victimFirmId)` and gets every member's email, name and role, plus pending invitations with invitee emails and invite `token`s. `getClientMembers` does the same for a client.
3. **`updateClientContact` / `deleteClientContact` / `setClientContactPrimary`.** A client manager of their own client calls `deleteClientContact(ownFirmSlug, ownClientSlug, victimContactId)`. The check passes on their own client, but the delete is `where:{id}` only, so they delete or rewrite another tenant's contact by id.
4. **`provisionEngagementDriveFolder(engagementId)` and `getEngagementFolderIds` / `getProjectFolderIds`.** Any signed-in user calls `provisionEngagementDriveFolder(victimEngagementId)`. The server builds a folder tree in the victim firm's Drive with their OAuth token and writes `connectorRootFolderId`, or returns the existing root folder id if it is already set. `getEngagementFolderIds(victimId)` returns the general, confidential and staging folder ids.
5. **`createManualReminder`.** A signed-in user calls `createManualReminder({entityKey:'platform.doc_comments' / 'platform.documents' / 'platform.engagement_invitations' / 'platform.connectors', entityValue: victimId, …})`. `getUserReminders()` then returns the resolved comment text (60 chars), file name, invitee email or connector account email, plus `firmId`, `firmSlug` and the `ctaUrl` paths.
6. **Stale JWT persona and incomplete offboarding.** `removeFirmMember(F, adminX)` deletes only the FirmMember row. X's `active_firm_id` / `active_persona` still make `canManageOrganization(F)` and `canManageClient(F, anyClient)` true. X's surviving eng_admin and client_admin rows still count as memberships. X can call `inviteFirmMember(F, X's email)`, accept it and be firm_admin again, or call `removeFirmMember` and `removeFirmConnector` on others.
7. **`createClient` / `createEngagement` / `createProject` require only a FirmMember row.** An EC/EV guest or domain-joined firm_member calls `createEngagement(firmSlug, anyClientSlug, …)`. They become eng_admin, firm and client admins are auto-added, Drive folders are created in that client's storage and plan caps are consumed. `createClient` works the same way.
8. **`listClientContacts` and the hierarchy actions.** A guest of client A calls `listClientContacts(firmSlug, 'client-b')` and reads B's contact emails, phones and notes. `getClients`, `getFirmHierarchy` and `getClientWithEngagements` return `internalMemo`, `billingAddress`, `relationshipValue` and `rateOrValue` to EC/EV as well.
9. **`acceptInvitation` / `acceptInvitationAction` reuse of SUPERSEDED invites.** `removeFirmMember` and `removeMember` set the old invite to SUPERSEDED but leave the token and expiry. The removed person reopens `/invite/<token>` within 7 days and `acceptInvitation` re-creates the membership. A firm invite always grants firm_admin; an engagement invite restores the original role.
10. **Three smaller leaks.**
    - `reportActionFailure({context: <huge JSON>, firmSlug, clientSlug, projectSlug})` works signed-out and files unlimited tickets attributed to any firm, client or engagement.
    - A signed-in user POSTs `/api/bookmarks {kind:'project', projectId: victimId}`, then `getUserBookmarks()` returns that engagement's name, client name, and firm and group slugs.
    - An EC/EV calls `getProjectMemberSummaries([id])` and sees every member's name and email, which `getProjectMembers` withholds from them.

---

## B. Server actions `app/actions/**` and API routes under `/api/{system,firms,firm,organization,rbac,permissions,debug}` (64 endpoints)

#### Security inventory: server actions and `/api/{system,firms,firm,organization,rbac,permissions,debug}`

Read-only pass over the current working tree. 16 exported server actions plus 48 HTTP handlers, 64 rows in all.

**How to read it**
- **Risk** is the inherent class if the endpoint were ungated, per your definitions. It is not the residual risk.
- **Pattern A** = cookie `createClient().auth.getUser()` + `isSysAdminUser` (email in `SYSTEM_ADMIN_EMAILS`, resolved via `admin.getUserById`).
- **Pattern B** = `Authorization: Bearer` token checked with a service-role client `getUser(token)` + `isSysAdminUser`.
- **"can_manage (cache)"** = `userSettingsPlus.getUserSettingsPlus` (30 min in-process TTL, `lib/user-settings-plus.ts:96`) + `findFirmInPermissions` + `scopes.firm` includes `can_manage`.

##### 1) Table

###### a) Server actions (`app/actions/**`)

| Endpoint | Takes | Check today | Verdict | Risk | Gate it needs |
|---|---|---|---|---|---|
| admin/close-waitlist-campaign.ts:7 `closeWaitlistCampaign` | campaignId | `requireSystemAdmin()` (getUser + `isSystemAdminEmail`) | OK | Med | system admin |
| admin/create-research-campaign.ts:7 `createResearchCampaign` | none | `requireSystemAdmin()` | OK | Med | system admin |
| admin/create-waitlist-campaign.ts:12 `createWaitlistCampaign` | name | `requireSystemAdmin()` | OK | Med | system admin |
| admin/delete-research-campaign.ts:7 `deleteResearchCampaign` | id | `requireSystemAdmin()` | OK | High | system admin |
| admin/set-research-campaign-status.ts:7 `setResearchCampaignStatus` | id, status | `requireSystemAdmin()` | OK | Med | system admin |
| admin/update-research-campaign.ts:13 `updateResearchCampaign` | id, description, scriptSnippet, queryParams | `requireSystemAdmin()` | OK | Med | system admin |
| get-active-campaign.ts:12 `getActiveCampaign` | none | none | PUBLIC (returns id/name/openedAt of the open campaign; the public waitlist page needs it, and it is the source of the campaignId every other waitlist action takes) | Low | public |
| get-referral-stats.ts:16 `getReferralStats` | email | none. Returns referralCode, referralLink, count, plan for any email. | MISSING (no importers anywhere, so latent) | Med | delete, or signed-in and email equals session email |
| get-waitlist-count.ts:16 `getWaitlistCount` | campaignId | none. Returns the raw `email` of the 5 newest joiners next to `maskedEmail` (lines 37-41), so the masking is cosmetic. | MISSING (no importers, latent) | High | delete, or drop raw email |
| get-waitlist-leaderboard.ts:25 `getWaitlistLeaderboard` | campaignId, email? | none. Returns raw emails for the top 10 plus the requested email's rank, referralCount and createdAt (lines 71-80). | MISSING (no importers, latent) | High | delete, or drop raw email; self only |
| get-waitlist-status.ts:20 `getWaitlistStatus` | email, campaignId | none (no Turnstile, no rate limit). Live: called from `waitlist-content.tsx:93,154`. | MISSING | Med | proof of ownership (emailed token) or a uniform non-leaking answer, plus rate limit |
| send-otp.ts:32 `checkEmailExists` | email, turnstileToken | Turnstile only. Parameterized query on `auth.users`. | PARTIAL (account enumeration, no per-IP/per-email limit) | Med | public + rate limit |
| send-otp.ts:58 `sendOTPWithTurnstile` | email, token, first/lastName | Turnstile only. `shouldCreateUser` is true whenever both names are given; names are unbounded. | PARTIAL | High | public + per-IP and per-email rate limit; bound name length |
| submit-contact.ts:13 `submitContactForm` | FormData, token | honeypot, 5/hr per IP counted on stored rows, Turnstile, message clamped. No email is sent. email/role/teamSize/inquiryType are unvalidated and unbounded. | PUBLIC | Low | public + rate limit (present) |
| submit-ticket.ts:29 `submitErrorTicket` | description, errorDetails, metadata (z.any, unbounded), type, firmSlug/orgSlug, clientSlug, projectSlug | Sign-in optional. Slugs resolve to firmId/clientId/engagementId with no membership check (lines 42-72). No captcha, no rate limit. | PARTIAL | High | require session and membership of the resolved firm/engagement, size caps, rate limit |
| submit-waitlist.ts:25 `submitWaitlistForm` | FormData, token, campaignId | IP limit of 3/hr counted on inserted rows, honeypot, Turnstile. Email check is only `includes('@')` (line 90). `plan`, campaignId and free-text fields are caller-controlled. | PARTIAL | High | public + captcha + real email validation (single address) + per-email limit |

###### b) HTTP handlers

| Endpoint | Takes | Check today | Verdict | Risk | Gate it needs |
|---|---|---|---|---|---|
| /api/debug/enabled GET | none | `WORKSPACE_ENV==='development'`, then getUser. Returns only `{enabled}`. | PUBLIC | Low | public (see gap 11) |
| /api/debug/user-context GET | none | `WORKSPACE_ENV==='development'` only (404 otherwise), then `auth.getSession()` (cookie user, not server-verified). Returns own decoded JWT claims and cached permissions. | SELF | Low | env-gate, plus `NODE_ENV`/`VERCEL_ENV` and system admin |
| /api/firm/maintenance-by-slug GET | ?slug | none. The proxy sends `x-internal: 1` but the route never checks it. Returns `{active, firmId (when active), groupSlug}` for any slug. | MISSING | Med | internal secret header, or fold into proxy |
| /api/firm/maintenance GET | ?firmId | Bearer getUser, any `FirmMember` row (includes external invitees) | PARTIAL | Med | firm manage (internal) |
| /api/firm/maintenance POST | action, firmId | Bearer getUser, `FirmMember.role==='firm_admin'` for that firmId | OK | Med | firm manage |
| /api/firm GET | ?slug | Bearer getUser, returns the caller's own memberships (slug match or default). Output is the full firm record: `settings`, all members' userId/role, connectorId, firmFolderId, plus `creatorEmail`. | PARTIAL (right firm, but every membership class gets the full record) | Med | strip for non-admins, or require firm manage |
| /api/firms POST | firmName, allowDomainAccess, allowedEmailDomain, email/first/lastName (unused) | Bearer getUser, `requireNonSandboxFirmCreationAccess`, billing anchor from the server, group membership check | SELF | Med | self (present) |
| /api/firms/default-slug GET | none | cookie getUser, caller's default firm | SELF | Low | self |
| /api/firms/[firmId]/admins GET | firmId | cookie getUser; cached `firm_admin` persona, else DB `firmMember` role; `assertFirmSubscriptionAccess` | OK | Med | firm admin |
| /api/firms/[firmId]/ai-brief GET | firmId | cookie getUser, can_manage (cache) | OK | Med | firm manage |
| /api/firms/[firmId]/ai-brief POST | firmId | same, plus `assertWithinAiCreditCap` | OK | Med | firm manage |
| /api/firms/[firmId]/audit/filters GET | firmId, repeatable clientId | can_manage (cache). With `clientId` supplied, engagements are queried by `clientId in [...]` with no firm constraint (line 45). | PARTIAL | Med | bind to `client:{firmId}` always |
| /api/firms/[firmId]/audit GET | firmId, filters | can_manage (cache). Query is `where firmId` and filters are ANDed. | OK | Med | firm manage |
| /api/firms/[firmId]/drive-alerts GET | firmId | Bearer getUser, can_manage (cache) | OK | Med | firm manage |
| /api/firms/[firmId]/drive-alerts POST | firmId | same | OK | Med | firm manage |
| /api/firms/[firmId]/insights GET | firmId | cookie getUser, can_manage (cache). All queries `firmId`-scoped; reminders filtered to `r.firmId===firmId`. | OK | Med | firm manage |
| /api/firms/[firmId]/logo GET | firmId | none. Does `findOrCreateFolder` (creates `.meta/assets` in the firm's Drive), downloads and serves the file with its stored Content-Type, `Cache-Control: public`. 500 body includes `detail: String(e)`. | MISSING | High | public + serve as attachment/forced image type, raster only, no Drive writes, rate limit |
| /api/firms/[firmId]/logo POST | file | Bearer getUser, DB `firm_admin`. Type check trusts client-declared `file.type`, and SVG is allowed with no sanitization (lines 150-156). | OK (authz); content unsafe | High | firm admin + raster-only or SVG sanitize |
| /api/firms/[firmId]/logo DELETE | firmId | Bearer getUser, DB `firm_admin` | OK | High | firm admin |
| /api/firms/[firmId]/search/interpret POST | text | `requireFirmSearch` (Bearer; firm exists; FirmMember or EngagementMember), then access-scoped candidates, AI credit cap | OK | Med | firm member + access scope (present) |
| /api/firms/[firmId]/search/picker-data GET | firmId | `requireFirmSearch` + `computeGlobalSearchAccessScope` | OK | Med | same |
| /api/firms/[firmId]/search GET | q, clientId, engagementId, deliverableDocumentId, dates | `requireFirmSearch`. Caller filters are ANDed with the access scope; every SQL branch has `d."firmId"=`; deliverable checked `firmId`. | OK | Med | same |
| /api/organization/create POST | none | Bearer getUser; returns the caller's own default firm (never creates) | SELF | Low | self (route is dead weight) |
| /api/permissions/can-use-view-as GET | none | cookie getUser; `canAccessRbacAdmin` (firm_admin of any firm) | SELF | Low | self |
| /api/permissions/firm GET | firmId or firmSlug, clientId | `auth.getSession()` (cookie user, not server-verified), then own cached permissions or DB membership | SELF | Low | self; switch to `getUser()` |
| /api/permissions/is-system-admin GET | none | cookie getUser; returns whether the caller's own email is an admin | SELF | Low | self |
| /api/permissions/project-tabs GET | orgSlug, clientSlug, projectSlug | cookie getUser; ids resolved from DB (client in org, engagement in client); `canViewProject` | OK | Low | project view (present) |
| /api/permissions/project GET | orgId, clientId, projectId (all caller-supplied) | cookie getUser. `checkProjectPermission` never checks that projectId belongs to orgId; a `firm_admin` of the passed org (cache or DB) gets true for any project id. | PARTIAL (boolean oracle only) | Low | resolve ids from the engagement row |
| /api/rbac/effective-permissions GET | persona | cookie getUser; sys-admin email OR firm_admin of any firm. Returns static persona capability flags. Docs say "current org". | OK | Low | firm admin / system admin |
| /api/system/account-deletion/plan GET | ?userId | Pattern A | OK | High | system admin |
| /api/system/account-deletion GET | none | Pattern A | OK | High | system admin |
| /api/system/admin-scripts/[scriptId] POST | scriptId | Pattern B; runs backfill scripts | OK | High | system admin |
| /api/system/admin-scripts GET | none | Pattern B | OK | Med | system admin |
| /api/system/ai-efficacy GET | days, firmId | Pattern A | OK | High | system admin |
| /api/system/entitlements GET | groupId | Pattern A, UUID check | OK | High | system admin |
| /api/system/entitlements POST | groupId | Pattern A (resync from Polar) | OK | High | system admin |
| /api/system/entitlements PUT | groupId, values, note | Pattern A, key whitelist, note required | OK | High | system admin |
| /api/system/firm-groups GET | search | Pattern A | OK | High | system admin |
| /api/system/inngest-jobs GET | status, functionId, firmSlug, cursor, pageSize | Pattern B | OK | High | system admin |
| /api/system/integrations/status GET | none | Pattern B (also fires an Inngest test event and an SMTP verify) | OK | Med | system admin |
| /api/system/platform-maintenance GET | none | Pattern A | OK | Med | system admin |
| /api/system/platform-maintenance POST | action, schedule, message | Pattern A. Enable/disable mails all non-admin users. | OK | High | system admin |
| /api/system/platform-maintenance/status GET | none | none (public, called by the proxy). Lazy-activation branch (lines 18-40) sets maintenance active, signs out all non-admin users and mass-emails. The write is not atomic. | PARTIAL | Med | public read; move the transition to Inngest, or compare-and-set |
| /api/system/reprovision-firms POST | firmIds (≤50 UUIDs) | Pattern B | OK | High | system admin |
| /api/system/stuck-firms GET | none | Pattern B | OK | High | system admin |
| /api/system/user-data-map/hard-reset POST | targetUserId, confirmUserId, deleteAuthAccount | Pattern A, double-UUID confirm | OK | High | system admin |
| /api/system/user-data-map/reindex POST | firmId | Pattern A | OK | High | system admin |
| /api/system/user-data-map GET | identifier | Pattern A | OK | High | system admin |

##### 2) Counts per verdict

| Verdict | Server actions (16) | Routes (48) | Total (64) |
|---|---|---|---|
| OK | 6 | 33 | 39 |
| SELF | 0 | 7 | 7 |
| PUBLIC | 2 | 1 | 3 |
| AUTH-ONLY | 0 | 0 | 0 |
| PARTIAL | 4 | 5 | 9 |
| MISSING | 4 | 2 | 6 |
| UNSURE | 0 | 0 | 0 |

The three latent MISSING actions (`getReferralStats`, `getWaitlistCount`, `getWaitlistLeaderboard`) have no importers anywhere, so Next should not expose them today. Any one import would expose them.

Admin-gating of `/system` in `proxy.ts` is bypassable for server actions (an action ID can be POSTed to any path). The in-action `requireSystemAdmin()` is the real gate, and it is present in all 6 admin actions.

##### 3) Top 10 gaps, most severe first

1. **Stored XSS through the firm logo** (`/api/firms/[firmId]/logo` POST and GET). POST accepts `image/svg+xml` based on the client-declared `file.type` and stores it unsanitized (lines 150-156). GET serves it unauthenticated, from the app origin, with the stored Content-Type, and there is no CSP, nosniff or `Content-Disposition` anywhere (`next.config.js` sets only one robots header). A firm admin of any firm (every user with Drive connected) uploads an SVG containing `<script>`, then sends a victim, system admin included, the link `/api/firms/<theirFirmId>/logo`. The script runs on the app origin as the victim and can call every cookie-authenticated API.
2. **Email fan-out via the waitlist form** (`submitWaitlistForm`, `submit-waitlist.ts:90,161,224`). The email is only checked with `includes('@')`, then passed raw to nodemailer `to` (`lib/email.ts:38-44`), which accepts comma-separated lists. Submitting `email="a@x.com,b@y.com,..."` with one Turnstile solve sends the branded confirmation from Firma's SMTP to every address (up to 3 submissions per hour per IP, as many addresses as fit in the field).
3. **Anonymous cross-tenant ticket planting** (`submitErrorTicket`). With no session, call it with `firmSlug=<victim>`, `clientSlug`, `projectSlug` and a large `errorDetails`. It writes a `CustomerRequest` bound to the victim's firm/client/engagement with no membership check, no captcha, no rate limit and no size cap. Seen outside the requested scope: `GET /api/support/requests?firmSlug=<any>` (`app/api/support/requests/route.ts:17-33`) has no membership check, so any signed-in user can also read every ticket of any firm, including userEmail and errorDetails.
4. **Waitlist PII leaks**. Live: `getWaitlistStatus(email, campaignId)` has no captcha or limit. It confirms whether any email is on the waitlist and returns that person's position, referralCode, referralCount and createdAt. Take campaignId from the public `getActiveCampaign`. Latent: `getWaitlistLeaderboard` and `getWaitlistCount` return raw emails of the top 10 / newest 5 joiners, and `getReferralStats` returns referral data for any email.
5. **OTP spam and account enumeration** (`checkEmailExists`, `sendOTPWithTurnstile`). Both are protected by Turnstile alone; there is no in-app per-email or per-IP limit. `checkEmailExists` returns whether an email has an account. `sendOTPWithTurnstile` with `firstName` and `lastName` creates an unconfirmed `auth.users` row for any address with attacker-chosen, unbounded name metadata, and sends an OTP mail to it. Only Supabase's own limits stop repetition.
6. **Full firm record readable by external members** (`/api/firm` GET, also `/api/firm/maintenance` GET). Invitees accepting an engagement invite get a `FirmMember(role:'firm_member')` row (`lib/actions/engagement-membership.ts:96-107`). `/api/firm?slug=<firm>` then returns them `settings` (cached `aiBrief` with pipeline values, `driveAlertCache` naming flagged sensitive files), every member's userId/role, connectorId, firmFolderId and the creator's email. `/api/firm/maintenance?firmId=` returns migration file names.
7. **Unauthenticated state change on a poll endpoint** (`/api/system/platform-maintenance/status` GET). Once grace expires, the first anonymous GET flips maintenance to active, signs out all non-admin users and sends the mass email (lines 18-40). The read-then-write is not atomic, so concurrent polls (the proxy calls this on every `/d` navigation) can each trigger sign-out and the mass mailing, producing duplicate emails to every user.
8. **Unauthenticated Drive side effects** (`/api/firms/[firmId]/logo` GET). Any caller with a firm UUID causes `findOrCreateFolder` (creates `.meta/assets` in the firm's Drive), a folder list and a download on the firm's connector credentials, with no rate limit. A 500 returns `detail: String(e)`, which tells a prober whether a firm UUID exists and its connector state.
9. **Cross-firm read in audit filters** (`/api/firms/[firmId]/audit/filters` GET, line 45). A manager of firm A passes `?clientId=<firm B's client uuid>` and the engagement query runs `clientId in [...]` without a firm constraint. It returns firm B's engagement ids, names and clientId.
10. **Unauthenticated firm oracle** (`/api/firm/maintenance-by-slug` GET). No auth; the `x-internal` header the proxy sends is never verified. For any guessed slug it returns the firm's `groupSlug` (and `firmId` when in maintenance), so firm slugs can be enumerated and mapped to group slugs.

##### Below the cut and cross-cutting

- **No rate limiter exists in the codebase.** The only IP limits are the two DB-row counters in the waitlist and contact actions, which read the raw `x-forwarded-for`.
- **`isSystemAdminEmail` / `requireSystemAdmin` / `isSysAdminUser` match email only.** They do not require `email_confirmed_at`. `supabase/config.toml` has `enable_confirmations = false` locally. Prod setting not verified. If it is also off, an unregistered `SYSTEM_ADMIN_EMAILS` address can be pre-claimed through the public Supabase signup endpoint.
- **Debug routes are disabled by `WORKSPACE_ENV` alone.** It is not in `env.production.example`, but `lib/suggested-workspace-folder-name.ts` reuses the same variable for folder naming, so a staging or preview env could set it. There is no `NODE_ENV`/`VERCEL_ENV` check.
- **`getSession()` is used for identity** in `/api/permissions/firm` and `/api/debug/user-context`. The installed auth-js docs say that user "must not be trusted" server-side. I did not test cookie forgery. Other routes outside scope also use `getSession`: `app/api/checkout`, `notifications`, `notifications/broadcast`, `billing/*`.
- **Public actions return raw `error.message`** (including Prisma text) to anonymous callers through `serverActionWrapper`.
- **Permission cache:** all `can_manage` checks above rely on a 30-minute in-process cache, so a demoted firm admin keeps access for up to 30 minutes on warm instances (the helper does fall back to the DB for some cases, but not for these).
- **`stuck-firms`** builds an `IN (...)` list with `$queryRawUnsafe`. The values come from the DB, so it is safe today.

All files are under `/Users/deepak/Personal/Projects/firma-one/firm-bz/frontend/`; no files were edited, created or deleted.

---

## C. API routes under `/api/{projects,documents,clients,drive-action,deeplink,ai,bookmarks,nav,hierarchy}` (66 handlers)

#### Read-only authz inventory: 66 handlers in 55 route files, current working tree

**How to read this.** The file for each row is `app/api/<path>/route.ts`, so the number after the method is the line of the handler. `P` stands for `/projects/[projectId]` and `D` for `/documents/[documentId]`.

Gate abbreviations:
- **ctx**: firm and client are resolved from the DB by `projectId` (`resolveProjectContext` or `requireProject*`), not taken from the caller.
- **view / vint / edit / manage**: `canViewProject` / `canViewProjectInternalTabs` / `canEditProject` / `canManageProject`. EC and EV (the external roles) pass `view` but not `vint`.
- **member**: `requireEngagementMember`, which needs an explicit `engagement_members` row. A firm admin with no row fails it.
- **extDoc**: `externalMemberCanAccessDocument`, which limits EC/EV to the shared subtree.
- **docIn**: the document is looked up with `engagementId = P` (`getFileInfo`, `getProjectDocumentContext`, or `findFirst({id, engagementId})`).
- **cookie / Bearer**: sign-in via `createClient()` or via `supabase.auth.getUser(token)`.

**Does `proxy.ts` authorize `/api/*`? No.** It only refreshes the session. Its redirects cover `/d`, `/system`, `/signin` and `/signup`. No route in scope relies on it.

**Helper behavior that matters here.**
- `checkProjectPermission` falls back to "firm_admin of the supplied `firmId`". That is safe only because every route in scope derives `firmId` and `clientId` from the DB. The one exception is the `index-file` body override (row 57).
- `canViewDocument`, `canEditDocument` and `canManageDocument` are unused.

##### 1) Table

| # | Endpoint (METHOD :line) | Takes | Check today | Verdict | Risk | Gate it needs |
|---|---|---|---|---|---|---|
| 1 | `/ai/credits` GET :29 | – | cookie; the caller's own internal `firmMember` gives the group | SELF | Low | self |
| 2 | `/bookmarks` GET :43 | – | cookie; own `userPersonalization` row | SELF | Low | self |
| 3 | `/bookmarks` POST :68 | bookmark{projectId, documentId, url} | cookie; writes own row; ids stored unvalidated (resolved later by `/deeplink`) | SELF | Low | self |
| 4 | `/bookmarks` DELETE :109 | id | cookie; own row | SELF | Low | self |
| 5 | `/clients/[clientId]/brand/logo` GET :6 | clientId | **none**; reads `client.settings.brandId`, then `Brand.logoData`; `Cache-Control: public` | MISSING | Low | client view; if it is meant to be public, use an unguessable or signed URL |
| 6 | `/clients/[clientId]/brand` GET :5 | clientId | cookie sign-in only | AUTH-ONLY | Medium | client view (client member, firm member, or engagement in client) |
| 7 | `/clients/brand-by-slug` GET :5 | firmSlug, clientSlug | cookie; client must list the user as a client member or firm member | OK | Low | client view |
| 8 | `/deeplink` GET :14 | kind, projectId, documentId, commentId | cookie; ctx; view; document and comment ids only echoed into a URL hash, never read | OK | Low | engagement view |
| 9 | `/documents/activity` GET :12 | fileId, connectorId | Bearer; `connector.userId === user.id` | SELF | Low | self |
| 10 | `/documents/download` GET :15 | fileId, connectorId, filename, revisionId, `?token` | Bearer or `?token=`; connector must be the legacy `Firm.connector` of any firm the user belongs to (any role); fileId tied to no engagement, document, sharing or allowDownload | PARTIAL | **High** | member + docIn + per-role download rights; take the connector from the document, not the query |
| 11 | `/documents/versions` GET :12 | fileId, connectorId | Bearer; connector owner | SELF | Low | self |
| 12 | `/drive-action` POST :17 | action, fileId, connectorId, permissionId, expirationTime, projectId, folderIds | Bearer only. `projectId` is optional and picks the connector with **no membership check** (`resolveEngagementConnector`). Body `connectorId` is trusted for trash, revoke and set_expiry and is never compared to the resolved connectors. The only trash gate, `blockIfEngagementFileMutationForbidden`, runs only when `projectId` is sent, and checks bare membership (any role) plus not-closed. fileId and permissionId are not tied to the engagement. `duplicate_search`, `stale_search` and `folder_names` list the whole connector. | PARTIAL | **High** | trash: edit/manage + document belongs to the engagement, connector taken from the document. revoke/set_expiry: manage + permission belongs to a document of P. searches: manage, scoped to the engagement tree |
| 13 | `/hierarchy` GET :11 | firmSlug | cookie; firm membership; only clients and engagements the user belongs to | SELF | Low | self |
| 14 | `/nav/recents/resolve` POST :45 | firmSlug, items[] | cookie; `getFirmHierarchy` over the user's own memberships | SELF | Low | self |
| 15 | P/ai-chat POST :46 | question, history, scope | cookie; ctx; view + vint; insights re-fetched server-side | OK | Medium | view_internal |
| 16 | P/ai-feedback POST :29 | helpful, reason, ids | cookie; ctx; view + vint | OK | Low | view_internal |
| 17 | P/ai-summary POST :25 | – | cookie; ctx; manage | OK | Medium | manage |
| 18 | P/audit GET :14 | limit, cursor, documentId, eventType, dates | cookie; ctx; **view only** (EC/EV included). Events are fixed to P, but include `metadata` (file names) and actor emails and names for all documents. | PARTIAL | Medium | view_internal, or for EC/EV only shared documents with emails and metadata redacted |
| 19 | P/doc-comments GET :15 | filter, q | cookie; ctx; **view only**. Lists every document with comments (name, UUID, 220-char latest preview); no extDoc. | PARTIAL | Medium | view + extDoc per document, or view_internal |
| 20 | P/D/assignee PATCH :7 | assigneeUserId | cookie; ctx; view; manage; docIn; assignee must be a member | OK | Medium | manage + docIn |
| 21 | P/D/doc-comments/reactions POST :25 | messageId, emojiKey, action | cookie; view; member; docIn; extDoc; message belongs to document and engagement | OK | Low | as is |
| 22 | P/D/doc-comments/reminders GET :13 | messageId | cookie; view; docIn; message belongs to document. No member or extDoc. Returns each member's userId, reminderId and date. | PARTIAL | Low | member + extDoc |
| 23 | P/D/doc-comments GET :39 | – | cookie; view; member; docIn; extDoc | OK | Medium | as is |
| 24 | P/D/doc-comments POST :137 | content, isReminder, recipientId | same gates as GET. `recipientId` is **not** checked as a member, and `upsertFollowUpReminder` writes to any userId. | PARTIAL | Medium | add "recipient ∈ engagement" (PATCH does this), closed-engagement check |
| 25 | P/D/doc-comments PATCH :306 | messageId, recipientId, dateValue | view; member; docIn; recipient is a member; message belongs to document. No extDoc, and EC/EV can set reminders on others. | PARTIAL | Low | + extDoc, internal roles only |
| 26 | P/D/doc-comments DELETE :407 | messageId, or reminderId + recipientId | view. The delete-comment branch checks docIn and author-only (fine). The remove-reminder branch ignores documentId, checks only that the recipient is a member, and deletes **any** reminder id from that user. | PARTIAL | Medium | remove-reminder: caller == recipient or manage, and reminder tied to this message |
| 27 | P/D/download-share GET :20 | `preview` | cookie; **member only** (no ctx/view); docIn. `allowDownload` is enforced for EC/EV, but skipped when `?preview=true`. No extDoc, no private-lock check. | PARTIAL | **High** | member + extDoc + privacy lock, applied to preview too |
| 28 | P/D/due-date PATCH :13 | dueDate | cookie; ctx; view; manage; docIn (UUID) | OK | Medium | as is |
| 29 | P/D/file-info GET :17 | – | cookie; view; member; docIn; extDoc | OK | Low | as is |
| 30 | P/D/index-file-intake POST :24 | documentId = Drive externalId | cookie; member; role must be EC/EV. externalId is **not** verified as the caller's upload or as inside the engagement tree. If a row exists, its settings are overwritten with `share.externalCollaborator.enabled` and a PENDING row is created for the caller. If not, any Drive file the connector can read is registered. | PARTIAL | **High** | EC/EV member + file's parent chain under the engagement upload folder + `createdBy == caller`; never touch existing rows |
| 31 | P/D/intake PATCH :22 | action | cookie; member; approve/reject/*-folder need eng_admin; withdraw needs EC/EV and the caller's own PENDING row; docIn | OK (but see row 30: the PENDING row can be forged) | High | lead, or owner of the upload |
| 32 | P/D/preview GET :79 | native, Range | cookie; docIn; **member only**. No view/ctx, no extDoc, no private-lock. | PARTIAL | **High** | member + extDoc + privacy lock |
| 33 | P/D/privacy PATCH :12 | private | cookie; member; eng_admin; docIn | OK | Medium | as is |
| 34 | P/D/reminder POST :15 | recipientId, dateValue | cookie; ctx; view only; recipient is a member; docIn (UUID). A view check guards a write into another user's store. | PARTIAL | Low | view_internal (or extDoc) |
| 35 | P/D/reminder GET :89 | – | view; docIn; returns members' userId and reminderId | PARTIAL | Low | view_internal |
| 36 | P/D/reminder DELETE :145 | reminderId, recipientId | view; recipient is a member; documentId unused; removes **any** reminder id from that user | PARTIAL | Medium | caller == recipient (or manage), reminder tied to this document |
| 37 | P/D/resolve-deeplink GET :23 | – | cookie; ctx; member; view; docIn; extDoc | OK | Low | as is |
| 38 | P/D (document) DELETE :11 | – | cookie; ctx; manage; subscription; document by id + engagement + firm | OK | High | as is |
| 39 | P/D/sharing/accept PATCH :18 | – | cookie; member EC/EV; docIn; extDoc; files only | OK | High | as is |
| 40 | P/D/sharing/activity PATCH :24 | status, orderIndex | cookie; docIn. Role comes from the cached `getProjectPersona` (30-min cache, no DB re-check; null role gets no transitions, so 403). Transition table applied. No explicit member or extDoc. | OK (caveat: cache-based role) | Medium | member + transition table with the role re-read from the DB |
| 41 | P/D/sharing/finalize PATCH :14 | – | member; eng_admin; docIn | OK | High | as is |
| 42 | P/D/sharing/regrant POST :20 | – | cookie; member; docIn. The external gate (direct share flag or descendant of granted folder) runs **only if the caller has no sharing row**. Any existing row (REVOKED on an open engagement, PENDING, stale) skips it. The route then grants a Drive editor/viewer permission to the caller's email and sets GRANTED. | PARTIAL | **High** | member + extDoc evaluated on every call; reject REVOKED and PENDING rows |
| 43 | P/D/sharing GET :94 | – | cookie sign-in only. `getFileInfo(P, D)` then returns the **full `EngagementDocument` row**: settings (share/guest options, deliverable comments, accessLog emails, `sharedPdfDriveId`), connectorId, metadata/webViewLink, assignee. | AUTH-ONLY | **High** | view_internal, or member + extDoc |
| 44 | P/D/sharing PUT :123 | description, markAsDeliverable, untag, or share body{title, mimeType, ec/guest options, `guestOptions.sharedPdfDriveId`} | cookie; ctx; manage; subscription. UUID ids go through docIn. **A non-UUID id is treated as a Drive file id and `ensureDocument` inserts a row for any id.** `sharedPdfDriveId` is caller-supplied and later passed to `trashFile`. | PARTIAL | Medium | manage + externalId inside the engagement Drive tree; `sharedPdfDriveId` generated server-side only |
| 45 | P/D/sharing DELETE :666 | – | ctx; manage; subscription; docIn | OK | Medium | as is |
| 46 | P/D/sharing/unlock PATCH :15 | – | member; eng_admin; docIn | OK | Medium | as is |
| 47 | P/D/subtasks GET :20 | persona | cookie; ctx; view only; docIn for the folder. Returns all descendants (names, due dates, breadcrumb) plus assignee email and avatar. No extDoc or vint. | PARTIAL | Medium | view_internal, or extDoc per child with assignee fields redacted |
| 48 | P/documents/bulk-download POST :15 | externalIds[] | cookie; **member (any role)**. Ids are not checked against the engagement; folders are expanded recursively on the engagement's connector. No allowDownload, extDoc or audit. | PARTIAL | **High** | member + each id is an `EngagementDocument` of P + extDoc and allowDownload for EC/EV |
| 49 | P/documents/count GET :6 | – | member | OK | Low | as is |
| 50 | P/documents/create-link POST :31 | folderId, name, url | cookie; member; mutation-not-closed; document cap; EC/EV rows go PENDING | OK | Low | as is |
| 51 | P/engagements GET :11 | – | member + eng_admin; returns only the caller's own lead memberships in the same firm | OK | Low | as is |
| 52 | P/files-agent/apply POST :106 | token, proposals, overrides | Bearer; manage; HMAC token bound to engagement + user, single use; per-operation validation | OK | High | as is |
| 53 | P/files-agent GET :48 | – | Bearer; manage | OK | Low | as is |
| 54 | P/files-agent POST :96 | engagementKind | Bearer; manage; credit check | OK | Medium | as is |
| 55 | P/files-agent/scaffold GET :113 | answers | Bearer; manage | OK | Low | as is |
| 56 | P/files-agent/scaffold POST :207 | token, edits | Bearer; manage; token verified | OK | Medium | as is |
| 57 | P/index-file POST :63 | externalId, fileName, **organizationId, clientId**, files[] | Bearer; `requireProjectEdit` with DB-derived ctx; EC/EV get 403. But `firmId = body.organizationId \|\| ctx.orgId` and `cliId = body.clientId \|\| ctx.clientId` are caller-supplied. They drive the document upsert, the document-cap check, and the Inngest indexer's connector resolution. externalIds are not tied to the engagement. | PARTIAL | **High** | edit; ignore body firm/client (use ctx); externalId inside the engagement Drive tree |
| 58 | P/index-project POST :8 | – | Bearer; manage; connector and folders from DB | OK | Medium | as is |
| 59 | P/insights GET :39 | – | cookie; ctx; view; internal data stripped for non-vint | OK | Medium | as is |
| 60 | P/insights/share-report POST :10 | pdfBase64, pageUrl | cookie; ctx; manage. Emails every member (including EC/EV) a caller-supplied PDF and link, with no size or URL validation. | OK (note) | Medium | manage |
| 61 | P/members GET :19 | – | cookie; ctx; **view only**. Returns **every** member (EC/EV and Brio included) with email, name, role and avatar. The doc comment says "internal only", but the code does not filter, and the Members tab is vint-only. | PARTIAL | Medium | view_internal; for externals, return a redacted list |
| 62 | P/resolve-path GET :8 | fileId | Bearer; view; member. `resolvePathToProjectRoot(firmId, fileId)` is **firm-wide**, so fileId is not tied to P. No extDoc. | PARTIAL | Medium | + docIn(P) + extDoc |
| 63 | P/search GET :9 | q, rootFolderId | Bearer; **view only** (no member, no extDoc). Drive keyword, vector and name search across General, Confidential and Staging. Only private/locked documents are filtered out. | PARTIAL | **High** | view_internal, or restrict EC/EV results to their shared set |
| 64 | P/shares/order PUT :19 | to_do[], in_progress[], ... | cookie; ctx; manage; each id is `findFirst({id, engagementId})` | OK | Medium | as is |
| 65 | P/shares GET :23 | – | cookie; ctx; **view only**. Returns all deliverable folders with stage, comments, accessLog emails, creator emails and the pending uploader. Stage visibility is enforced only in the UI. | PARTIAL | Medium | view + `canViewDeliverable` filter for EC/EV; accessLog and emails need vint |
| 66 | P/sharing/ids GET :12 | – | cookie sign-in only. `getSharedAndAncestorIdsForAllPersonas(P)` runs with no membership check and calls Drive. | AUTH-ONLY | **High** | member (EC/EV get only their persona's set) |

##### 2) Counts
- OK: 31
- SELF: 8
- PARTIAL: 23
- AUTH-ONLY: 3 (rows 6, 43, 66)
- MISSING: 1 (row 5)
- PUBLIC: 0
- UNSURE: 0
- Total: 66

Non-OK, non-SELF handlers by risk:
- **High (11):** rows 10, 12, 27, 30, 32, 42, 43, 48, 57, 63, 66
- **Medium (11):** rows 6, 18, 19, 24, 26, 36, 44, 47, 61, 62, 65
- **Low (5):** rows 5, 22, 25, 34, 35

##### 3) Top 10 gaps, most severe first

1. **`/drive-action` POST (row 12).**
   - Exploit: any signed-in account, even one with no memberships, sends `{action:"revoke", projectId:<any engagement uuid whose client has a connector>, fileId, permissionId}`. That passes the "no connector" gate with no membership check and revokes or re-times permissions in another tenant's Drive. `{action:"trash", connectorId:<other tenant's connector uuid>, fileId}` without `projectId` skips the membership gate, and the file is trashed upstream before the route returns its 500.
   - A plain `eng_viewer` can also trash any file in their own engagement. That bypasses the manage gate on `DELETE /documents/[id]`.
   - `duplicate_search` with a victim `projectId` lists that firm's duplicate-file inventory.
2. **`sharing/regrant` skips the external gate for existing rows (row 42, `:57-106`).**
   - Exploit: the lead un-shares a document, which marks the rows REVOKED. The EC/EV who was cut off still calls `POST .../sharing/regrant`. The route finds the REVOKED row, never re-runs the shared-subtree check, grants them Drive editor/viewer again on their own email, and sets GRANTED. Only a COMPLETED engagement blocks this.
3. **`index-file-intake` plus `intake` withdraw (rows 30 and 31).**
   - Exploit: an EC calls `POST .../documents/<Drive id of an internal file>/index-file-intake`. The existing row's settings are overwritten with `share.externalCollaborator.enabled`, and a PENDING sharing row is created for the caller. Then `PATCH .../intake {action:"withdraw"}` deletes the DB row and trashes the Drive file, because `pendingRow.userId == caller`.
   - Or: the forged PENDING row feeds `regrant` (gap 2), which grants the EC Drive access. A Drive id not yet in the engagement is simply registered.
4. **`bulk-download` (row 48).**
   - Exploit: an `eng_viewer` posts `{externalIds:[<any Drive folder id on the client's connector>]}` and gets a ZIP of the whole subtree. This bypasses `allowDownload`, the shared-only rule and privacy. The ids need not belong to the engagement, and nothing is audited.
5. **`preview` and `download-share?preview=true` (rows 32 and 27).**
   - Exploit: an EC/EV engagement member calls `GET /api/projects/P/documents/<uuid>/preview`. Any non-link document in the engagement renders, including unshared or private ones and ones never shared with their persona. For a guest, `?preview=true` skips `allowDownload`, and the watermark is applied only on the PDF-only path. UUIDs come from gap 10.
6. **`sharing` GET and `sharing/ids` GET (rows 43 and 66).**
   - Exploit: any signed-in user calls `GET /api/projects/<victim P>/documents/<D>/sharing` and gets the full document row (connectorId, settings, deliverable comments, accessLog emails). `GET /api/projects/<victim P>/sharing/ids` returns the Drive ids of all shared documents and their descendants. These ids and the connectorId feed gaps 1 and 4.
7. **`/documents/download` GET (row 10).**
   - Exploit: any member of a firm whose legacy `Firm.connector` is `<connectorId>` calls `GET /api/documents/download?fileId=<any Drive id>&connectorId=<id>`. They download any file that connector can read, regardless of engagement, sharing or `allowDownload`.
   - Separately, the UI puts the user's Supabase access token in the query string (`components/ui/document-action-menu.tsx:466`, `components/files/document-history-pane.tsx:110`), so it leaks into logs, history and referrers.
8. **`P/search` GET (row 63).**
   - Exploit: an EV/EC with a Bearer token calls `GET /api/projects/P/search?q=salary` and gets names, ids, links and thumbnails of internal and Confidential files. Only private/locked documents are filtered. The gap is that EC/EV are not limited to the shared set.
9. **`P/index-file` POST trusts body `organizationId` and `clientId` (row 57).**
   - Exploit: an engagement editor posts `{organizationId:<victim firm>, clientId:<victim client>, externalId:<victim Drive id>, fileName}`. The Inngest indexer resolves the victim client's connector and ingests the file into the caller's engagement. The content is then readable through search and preview.
10. **View-only gates leak internal data to EC/EV (rows 18, 19, 47, 61, 65, plus 22/35).**
    - Exploit: an `eng_viewer` calls `/members`, `/shares`, `/audit`, `/subtasks` and `/doc-comments`. They read internal staff emails, accessLog emails, internal file names, comment previews and every document UUID. That feeds gaps 5 and 6, even though the Members tab is vint-only in the UI.

**Runner-ups:**
- `doc-comments` POST with an unverified `recipientId` (row 24) writes a reminder into any user's store.
- `doc-comments` DELETE remove-reminder and `reminder` DELETE (rows 26 and 36) delete arbitrary reminders of members.
- `sharing` PUT (row 44) lets a manager register any Drive id and cause `trashFile` on a caller-chosen `sharedPdfDriveId`.
- The brand endpoints (rows 5 and 6) have no or weak access control for cross-tenant client brand data.

Everything above was read directly from the source in this working tree. I did not run any endpoint.

---

## D. API routes under `/api/{connectors,billing,onboarding,support,demo,notifications,account,webhooks,push,proxy,provision,inngest,checkout}` (66 handlers)

### Security inventory: connectors, billing, onboarding, support, demo, notifications, account, webhooks, push, proxy, provision, inngest, checkout

Read-only pass over the working tree. I changed no files. Paths are relative to `frontend/app/api/`. There are 66 exported handlers in 53 route files.

How to read the table:
- `getUser()` means the identity was validated by Supabase.
- `getSession()` means the identity came from the cookie without re-validation.
- Risk is the impact of the gap. For OK rows it is the inherent sensitivity of the endpoint.
- Three handlers multiplex many actions (#20, #21, #27). Their per-action verdicts are in the second table.

#### 1) Handler table

| # | Endpoint (path METHOD, file:line) | Takes | Check today | Verdict | Risk | Gate it needs |
|---|---|---|---|---|---|---|
| 1 | /account/deletion-request POST (account/deletion-request/route.ts:36) | body.reason | getUser(); rows keyed to session user. `reason` and email are interpolated raw into an HTML email to the platform inbox. | SELF | Low | self; HTML-escape |
| 2 | /account/deletion-request GET (:117) | none | getUser(); own open request | SELF | Low | self |
| 3 | /account/export GET (account/export/route.ts:29) | none | getUser(); every query keyed on user.id / actorUserId | SELF | Medium | self (consider re-auth) |
| 4 | /billing/catalog GET (billing/catalog/route.ts:5) | none | getSession() only; returns Polar public, non-archived catalog | OK | Low | sign-in via getUser() |
| 5 | /billing/checkout-invoice POST (billing/checkout-invoice/route.ts:34) | checkoutId | getUser(). Allowed if Polar `checkout.customerEmail` equals user email, OR user is any-role member of the firm whose id equals `checkout.externalCustomerId`. `/api/checkout` sets externalCustomerId to the **groupId**, so the firm branch never matches real data. | PARTIAL | Medium | firm manage on the checkout's group; compare groupId, not firmId |
| 6 | /billing/client-gate GET (billing/client-gate/route.ts:7) | firmSlug | getUser(); any-role firm member; returns cap/count/groupId | OK | Low | firm member |
| 7 | /billing/current-plan GET (billing/current-plan/route.ts:28) | firmId | getSession(); any-role member, including external. Returns plan, status, entitlements, usage, AI credits. | OK | Medium | firm member (internal); getUser() |
| 8 | /billing/customer-portal POST (billing/customer-portal/route.ts:9) | firmId, returnTo | getSession(); firm_admin of firmId; portal session for `resolveGroupId(firmId)`; returnTo allow-listed to /d/ | OK | High | firm manage. firm_admin of any single firm in a group controls group-wide billing; no GROUP_ADMIN check. |
| 9 | /billing/document-gate GET (billing/document-gate/route.ts:7) | projectId, count | getUser(); any-role member of the engagement's firm | OK | Low | firm member |
| 10 | /billing/engagement-gate GET (billing/engagement-gate/route.ts:7) | firmSlug | getUser(); any-role firm member | OK | Low | firm member |
| 11 | /billing/firm-gate GET (billing/firm-gate/route.ts:5) | groupSlug | getUser(); helper takes user.id and requires firm_admin in group | SELF | Low | self |
| 12 | /billing/skip-upgrade POST (billing/skip-upgrade/route.ts:6) | none | getUser(); default-firm membership, any role. Writes settings on the group's sandbox firm (sandboxOnly is always false, so it 404s today). | PARTIAL | Low | firm manage, or delete route |
| 13 | /billing/subscription/cancel POST (billing/subscription/cancel/route.ts:9) | firmId | getSession(); firm_admin of firmId; sets Polar cancelAtPeriodEnd on the group subscription | OK | High | firm manage (same group-wide note as #8) |
| 14 | /billing/upgrade-nudge-status GET (billing/upgrade-nudge-status/route.ts:7) | none | getUser(); own default firm, firm_admin only | SELF | Low | self |
| 15 | /checkout GET (checkout/route.ts:121) | firmId, products[], customerExternalId, customerId, customerEmail, metadata, discountId, seats, returnTo | Bearer or getSession(); **any-role** member of firmId. Every query param is forwarded to Polar `Checkout`. customerExternalId and metadata are only defaulted when absent. GET with side effects. | PARTIAL | High | firm manage; product allow-list; force customerExternalId=groupId and metadata server-side; drop customerId/discountId/etc. |
| 16 | /connectors/google-drive/callback GET (connectors/google-drive/callback/route.ts:92) | code, state (unsigned base64 JSON: userId, organizationId, clientId, replaceConnectorId, next, nonce) | **No session read.** Nonce is only echoed to the popup, never compared. Stores the connector for state.userId/organizationId (membership looked up from forged ids) and sets `Client.connectorId = state.clientId` with no ownership check. | MISSING | High | OAuth state bound to session: HMAC-signed state plus server-side nonce cookie; verify caller == userId and manage right on firm/client |
| 17 | /connectors/google-drive/import POST (…/import/route.ts:9) | connectionId, fileIds, parentId, userToken | cookie getUser(); no check that the connector or parentId belong to caller's firm/engagement. Copies with the connector's token. | AUTH-ONLY | High | engagement write right on parentId's engagement; connector must be that engagement's connector |
| 18 | /connectors/google-drive/linked-files GET (…/linked-files/route.ts:64) | connectionId | **None.** Lists engagement_documents for the connector plus Drive names and webViewLink. | MISSING | High | firm/engagement member of connector's firm |
| 19 | /connectors/google-drive/linked-files DELETE (:112) | id, connectionId | **None.** deleteMany on engagement_documents and emits `file.delete.requested`. | MISSING | High | engagement manage |
| 20 | /connectors/google-drive/linked-files POST (:153) | action, folderId, projectId, fileId, destination… | Bearer verified, then per action (see actions table) | PARTIAL | High | engagement member with write role; fileId and destination bound to the engagement |
| 21 | /connectors/google-drive POST (connectors/google-drive/route.ts:33) | action, connectionId, userId, organizationId, firmId… | No top-level auth; per action (see actions table) | MISSING | High | connector owner or firm manage, per action |
| 22 | /connectors/google-drive GET (:705) | action=status/token/drives | Bearer verified; queries `connector.userId == caller` | SELF | Medium | self (`token` hands plaintext Google token to own browser by design) |
| 23 | /connectors/google-drive/test GET (…/test/route.ts:10) | connectionId | Bearer verified; **no ownership**; returns Drive account email/name/quota and 5 files. Error `details` leaked. | AUTH-ONLY | High | connector owner or firm manage |
| 24 | /connectors/google-drive/token GET (…/token/route.ts:16) | connectionId | **NONE.** Returns a live, auto-refreshed Google access token plus OAuth clientId. | MISSING | High | connector owner / engagement member; ideally remove |
| 25 | /connectors/google-drive/upload POST (…/upload/route.ts:10) | name, mimeType, parentId, connectionId, fileId, projectId | Bearer verified. projectId branch: any-role engagement member (EC/EV may pass arbitrary parentId; fileId overwrite unbound). connectionId branch: any connector, no ownership. Returns a pre-authorized resumable upload URL. | PARTIAL | High | engagement write right; parent/file inside engagement folder; connectionId branch owner-only |
| 26 | /connectors/onedrive/callback GET (connectors/onedrive/callback/route.ts:92) | code, state | Same as #16. Only a feature-flag check (`isMicrosoftConnectorEnabledForFirm`). | MISSING | High | OAuth state bound to session (as #16) |
| 27 | /connectors/onedrive POST (connectors/onedrive/route.ts:82) | action, userId, connectionId, firmId… | No top-level auth; per action (see actions table) | MISSING | High | connector owner, per action |
| 28 | /connectors/onedrive GET (:327) | action=status | Bearer verified; own connectors | SELF | Low | self |
| 29 | /connectors/onedrive/sites GET (…/sites/route.ts:27) | connectionId, q | Bearer verified and `connector.userId == caller` | OK | Medium | connector owner |
| 30 | /connectors/onedrive/sites POST (:107) | connectionId, siteId, siteName, firmId | Bearer plus owner check. But `firmId` hint is trusted when connector is unlinked: runs `setupFirmFolder` on any firm (writes `firm.firmFolderId`). | PARTIAL | Medium | owner plus manage right on the hinted firm |
| 31 | /connectors GET (connectors/route.ts:28) | organizationId | Bearer verified; **no membership check**; returns connector id/email/name/status for any firm. Also the source of connection ids for #24. | AUTH-ONLY | High | firm member/manage on organizationId |
| 32 | /connectors DELETE (:42) | connectionId, action | Bearer verified. `remove` goes to `removeConnector()`, which does its own cookie-user check (firm manage or owner) and is fine. Default `disconnect` goes to `disconnectConnection()` with **no check**: revokes the Google token, status REVOKED, wipes tokens. | AUTH-ONLY | High | firm manage or owner on both actions |
| 33 | /demo/documents/folder/[folderId] GET (demo/documents/folder/[folderId]/route.ts:257) | folderId | None; in-file mock data | PUBLIC | Low | none (remove from prod) |
| 34 | /demo/documents GET (demo/documents/route.ts:36) | none | None; static `data/google-drive-api-mock.json` | PUBLIC | Low | none |
| 35 | /demo/documents POST (:410) | action, documentData | None; no-op, `console.log`s the body | PUBLIC | Low | none (log flooding only) |
| 36 | /demo/documents/search GET (demo/documents/search/route.ts:66) | q, filters | None; mock JSON | PUBLIC | Low | none |
| 37 | /demo/documents/stream GET (demo/documents/stream/route.ts:4) | none | None; open SSE, `ACAO: *`, unbounded in-memory client set. Only consumer is lib/api-client.ts (demo). | PUBLIC | Low | none (connection cap) |
| 38 | /demo/documents/stream POST (:65) | type, action, data | None; broadcasts arbitrary JSON to all SSE clients | PUBLIC | Low | none (demo only) |
| 39 | /inngest GET (inngest/route.ts:29) | introspection | Inngest SDK 4.2.4 `serve()`. Signature validation applies only in cloud mode. | UNSURE | Medium | INNGEST_DEV off plus INNGEST_SIGNING_KEY in prod |
| 40 | /inngest POST (:29) | function-run payload | Same. `validateSignature` returns success **without checking** when `client.mode !== "cloud"`. Mode is "dev" when INNGEST_DEV is truthy. Local `.env` has `INNGEST_DEV=1`. No signingKey in code (env only). I cannot see prod env. | UNSURE | High | prod INNGEST_DEV unset/0 and INNGEST_SIGNING_KEY set (verify in Vercel) |
| 41 | /inngest PUT (:29) | function sync | Same | UNSURE | High | same |
| 42 | /notifications/broadcast POST (notifications/broadcast/route.ts:63) | firmId, scope, clientId, projectId, title, message | getUser(). Org scope needs firm_admin of firmId (OK). Client/project scope: `clientId`/`projectId` taken from body and never bound to firmId. `orgAdmin \|\|` short-circuits, and `canManageClient` also returns true for any firm_admin of the org for any clientId. Recipients are `clientMember`/`engagementMember` of the supplied id. | PARTIAL | Medium | verify client/engagement belongs to firmId; real manage check |
| 43 | /notifications GET (notifications/route.ts:58) | firmId, slugs | getUser(); rows keyed `userId == caller`. GET also runs deleteMany retention cleanup (own rows). | SELF | Low | self |
| 44 | /notifications PATCH (:169) | ids, markAllRead | getUser(); updates filtered by userId | SELF | Low | self |
| 45 | /notifications DELETE (:206) | ids, olderThanDays | getUser(); deletes filtered by userId | SELF | Low | self |
| 46 | /onboarding/create-client POST (onboarding/create-client/route.ts:8) | firmId/organizationId, name | Bearer verified; **any-role** firm member (external members have firm_member rows); cap check in service | PARTIAL | Medium | firm manage (`canManageOrganization`) |
| 47 | /onboarding/create-custom-workspace POST (onboarding/create-custom-workspace/route.ts:22) | connectionId, orgName, clientName… | Bearer verified; plan gate (`requireNonSandboxFirmCreationAccess`). **connectionId never checked against caller.** `FirmService.createFirmWithMember` does `connector.update({firmId: newFirm})`, then `setupOrgFolder` writes into that Drive. | PARTIAL | High | `connector.userId == caller` (and status ACTIVE) |
| 48 | /onboarding/create-org POST (onboarding/create-org/route.ts:16) | connectionId, name, sandboxOnly | Same connector hijack as #47. Body `sandboxOnly` skips the plan gate (path is vestigial). | PARTIAL | High | `connector.userId == caller` |
| 49 | /onboarding/create-project POST (onboarding/create-project/route.ts:12) | firmId, clientId, name | Bearer verified; any-role member of firmId. `clientId` is **not** checked to belong to firmId; the engagement is created under it and that client's admins are added as leads. | PARTIAL | Medium | firm/client manage; client.firmId == firmId |
| 50 | /onboarding/detect-orgs POST (onboarding/detect-orgs/route.ts:6) | none | Bearer verified; returns 410 stub | SELF | Low | delete |
| 51 | /onboarding/domain-options GET (onboarding/domain-options/route.ts:58) | none | Bearer verified; lists firms whose `allowedEmailDomain` equals caller's email domain | SELF | Low | self (see #56) |
| 52 | /onboarding/ensure-org POST (onboarding/ensure-org/route.ts:22) | none | Bearer verified; takes the caller's default firm and writes `app_metadata.active_persona = 'firm_admin'` **regardless of the caller's real role**. `checkFirmPermission` (lib/permission-helpers.ts:62-72) short-circuits on that claim, so `canManageOrganization` and `client:can_manage` become true. | PARTIAL | High | derive persona from the real FirmMember.role (as auth/callback does) or remove |
| 53 | /onboarding/import-orgs POST (onboarding/import-orgs/route.ts:6) | none | Bearer verified; returns 410 stub | SELF | Low | delete |
| 54 | /onboarding/test-org POST (onboarding/test-org/route.ts:12) | connectionId, firmId | Bearer verified; any-role member of firmId. **connectionId not bound to caller or firm**; writes folders and files into that connector's Drive root and creates a sample client and engagements. | PARTIAL | High | firm manage plus connector bound to firm/owner |
| 55 | /onboarding/ui-progress POST (onboarding/ui-progress/route.ts:18) | action | Bearer verified; any-role default-firm member rewrites `firm.settings.onboarding` (read-modify-write) | PARTIAL | Low | firm manage |
| 56 | /provision POST (provision/route.ts:20) | organizationName, allowDomainAccess, allowedEmailDomain | Bearer verified; idempotent self-provision. `allowedEmailDomain` is not tied to the caller's own email domain, so a new firm can claim e.g. a victim company's domain and appear in their domain-options. | PARTIAL | Medium | domain must equal caller's verified email domain, not a public webmail domain |
| 57 | /proxy/thumbnail/[externalId] GET (proxy/thumbnail/[externalId]/route.ts:13) | externalId, firmId, size | getUser(); `firmId` from query is **not checked against membership or engagement access**. Responds `Cache-Control: public, s-maxage=3600` on authenticated content. Fetched URL comes from DB `metadata.thumbnailLink` (Drive-sourced), so not an open proxy. `size` is spliced unvalidated into the URL tail. | AUTH-ONLY | High (needs file id and firm id) | engagement view right on the document; `private` caching |
| 58 | /push/subscribe POST (push/subscribe/route.ts:11) | endpoint, keys | getUser(); self-scoped. Stored `endpoint` is any string; `web-push` later POSTs to that host:port over https (blind SSRF). Also strips the endpoint from other users. | PARTIAL | Medium | allow-list push-service hosts (fcm.googleapis.com, *.push.apple.com, updates.push.services.mozilla.com, *.notify.windows.com) |
| 59 | /push/subscribe DELETE (:68) | endpoint | getUser(); own subscriptions | SELF | Low | self |
| 60 | /support/requests/[ticketNumber]/attachments PATCH (support/requests/[ticketNumber]/attachments/route.ts:6) | attachments[] | Bearer verified; `canAccessSupportTicket` (creator or firm_admin of ticket.firmId). Client-supplied attachment JSON appended unvalidated and uncapped. | OK | Medium | ticket owner or firm manage; validate and size-cap payload |
| 61 | …/attachments DELETE (:81) | attachmentId | same check | OK | Low | ticket owner or firm manage |
| 62 | /support/requests/[ticketNumber]/comments POST (…/comments/route.ts:6) | content | getUser(); `canAccessSupportTicket` | OK | Low | ticket owner or firm manage |
| 63 | …/status PATCH (…/status/route.ts:6) | status | Bearer verified; `canAccessSupportTicket` | OK | Low | ticket owner or firm manage |
| 64 | …/upload-attachment POST (…/upload-attachment/route.ts:17) | file | Bearer verified; `canAccessSupportTicket`; 8 MB cap; nothing stored | OK | Low | ticket owner or firm manage |
| 65 | /support/requests GET (support/requests/route.ts:5) | firmSlug | getUser(). With `firmSlug`: **no membership or admin check**, returns all tickets (descriptions, comments, base64 attachments, metadata). If the slug matches no firm, `where` stays `{}` and **every ticket in the DB** is returned. | AUTH-ONLY | High | firm_admin of that firm; 404 on unknown slug |
| 66 | /webhooks/polar POST (webhooks/polar/route.ts:98) | Polar webhook | `@polar-sh/nextjs Webhooks` calls `validateEvent` (standard-webhooks, timestamp tolerance), returns 403 on failure; 503 if POLAR_WEBHOOK_SECRET unset (fails closed). Provider spellings handled verbatim in `mapPolarSubscriptionStatusToDb`. No dedupe on webhook-id (handlers mostly idempotent). | OK | High (money) | webhook signature (present) |

##### Per-action breakdown of the three multiplexed handlers

**#21 /connectors/google-drive POST**

| Action | Check today | Verdict |
|---|---|---|
| initiate | none; takes `userId` from body and mints the state | MISSING |
| ensure-my-drive-workspace | none; creates a workspace folder and writes connector settings | MISSING |
| test | none; returns account email/name/quota and 5 recent file names | MISSING |
| create-folder | none; creates a Drive folder and **overwrites connector rootFolderId/parentFolderId** | MISSING |
| ensure-folder | none; find-or-create folder in that Drive | MISSING |
| list-known-firma-folders | none | MISSING |
| estimate-migration | only checks the header starts with `Bearer ` (token never validated); no ownership | MISSING |
| finalize | Bearer optional (`detectExistingStructure` runs anonymously, then 400). With any user: `importStructureFromDrive`/`setupOrgFolder` on any connectionId. The import path calls `storeConnection(targetConnectorId)` which re-links `connector.firmId`. | AUTH-ONLY |
| repair-org-folder | Bearer verified; connectionId and organizationId unbound | AUTH-ONLY |
| update-root-folder | Bearer + `connector.userId == caller`; body `firmId` hint trusted when connector unlinked | PARTIAL |
| folder-breadcrumb | Bearer + connector owner | OK |
| migrate-and-update-root | Bearer + connector owner | OK |

**#27 /connectors/onedrive POST**

| Action | Check today | Verdict |
|---|---|---|
| initiate | none (feature flag only) | MISSING |
| ensure-folder | none | MISSING |
| test | none (Graph reachability oracle) | MISSING |
| update-root-folder | Bearer + owner; `firmId` hint trusted | PARTIAL |
| folder-breadcrumb | Bearer + owner | OK |

**#20 /connectors/google-drive/linked-files POST** (Bearer verified for all)

| Action | Check today | Verdict |
|---|---|---|
| list | No engagement or firm membership required. Non-members get only files where their email is a Drive owner/permission holder (or `anyone`), which is mostly inert. Response carries `connectorId` to every member, including EC/EV, which feeds #24. | PARTIAL |
| create-folder | Any signed-in user with a projectId creates folders or Docs in that engagement's Drive (no `blockIfEngagementFileMutationForbidden`) | AUTH-ONLY |
| duplicate / copy / move | `requireEngagementMember` (any engagement role, blocked only after closure); fileId and destinationFolderId not bound to the engagement | PARTIAL |
| cross-engagement-copy / move | member of both engagements; fileId unbound | PARTIAL |
| rename | member; fileId unbound | PARTIAL |
| move-tree | `canManageProject` | OK |

#### 2) Counts per verdict (66 handlers)

| Verdict | Count | Handlers |
|---|---|---|
| OK | 14 | #4, 6, 7, 8, 9, 10, 13, 29, 60–64, 66 |
| SELF | 14 | #1, 2, 3, 11, 14, 22, 28, 43, 44, 45, 50, 51, 53, 59 |
| PUBLIC | 6 | #33–38 |
| AUTH-ONLY | 6 | #17, 23, 31, 32, 57, 65 |
| PARTIAL | 16 | #5, 12, 15, 20, 25, 30, 42, 46, 47, 48, 49, 52, 54, 55, 56, 58 |
| MISSING | 7 | #16, 18, 19, 21, 24, 26, 27 |
| UNSURE | 3 | #39, 40, 41 (Inngest, depends on prod env) |

#### 3) Top 10 gaps, most severe first

1. **`GET /connectors/google-drive/token` has no auth (#24).** `curl '/api/connectors/google-drive/token?connectionId=<uuid>'` returns a live Google access token for that firm's Drive. Connector ids reach any engagement member (EC/EV included) via `connectorId` in linked-files `list` rows, and any signed-in user via `GET /api/connectors?organizationId=<firm>` (#31).
2. **Both OAuth callbacks trust unsigned state (#16, #26).** An attacker completes OAuth with their own Google account, swaps `state` for `{"userId":<victim admin>,"organizationId":<victim firm>,"clientId":<victim client>}` and hits the callback with no session. Their Drive becomes the victim firm's connector and `Client.connectorId` is set on the victim's client, so later folders and uploads go to the attacker. (If the Google OAuth app is in Testing status, the attacker must be a listed test user.)
3. **Unauthenticated connector endpoints (#18, #19, #21, #27).** `POST /api/connectors/google-drive {"action":"create-folder","connectionId":<id>,"name":"x"}` rewrites that connector's workspace root. `{"action":"test"}` leaks the owner's email and recent file names. `DELETE …/linked-files {"connectionId":<id>,"id":<driveFileId>}` deletes the firm's document records and queues index deletion.
4. **Connector theft via onboarding (#47, #48, #54).** A free-tier user POSTs `/api/onboarding/create-org {"connectionId":<victim connector>,"name":"X"}`. `createFirmWithMember` runs `connector.update({firmId: newFirm})`, re-parenting the victim's connector to the attacker's firm. `setupOrgFolder` then writes into the victim's Drive and the attacker's firm operates it with the victim's token.
5. **`POST /onboarding/ensure-org` forges the firm_admin persona (#52).** A firm_member or external user with a default firm calls it with their own Bearer token and gets `active_persona:'firm_admin'`. `canManageOrganization(defaultFirm)` then returns true (JWT fast path in `checkFirmPermission`), so they can e.g. delete the firm's connector via `removeConnector`.
6. **`GET /checkout` forwards caller-controlled Polar params (#15).** `?firmId=<own>&products=<cheap or free product>&customerExternalId=<victim groupId>&metadata={"groupId":"<victim>"}`. The webhook resolves the group from `customerExternalId`, and `syncFirmSubscriptionFromPolarEvent` deactivates the victim group's active subscription rows before creating the new one (polar-webhook-sync.ts ~line 195), downgrading the victim's plan. Any-role member can trigger it. I did not trace the free-plan special-casing in `polar-billing-lifecycle.ts`.
7. **`GET /support/requests?firmSlug=` has no authorization (#65).** `?firmSlug=<other firm>` returns that firm's tickets with attachments. A nonexistent slug returns all tickets platform-wide, including account-deletion requests with user emails.
8. **AUTH-ONLY connector operations (#17, #23, #25, #31, #32).** Any signed-in user can `DELETE /api/connectors {"connectionId":<victim>}`, which revokes the Google token and wipes it (storage down for the firm). The same missing binding lets `POST …/upload {"connectionId":<victim>,"parentId":…}` mint a resumable upload URL into the victim's Drive, and `…/import` write into it with the connector's token.
9. **Inngest signature check depends on env (#39–41).** Local `.env` has `INNGEST_DEV=1`, which makes the SDK skip signature validation. If prod has that flag, or no `INNGEST_SIGNING_KEY`, anyone can POST forged run payloads to `/api/inngest` and invoke functions such as `reconcileFileDeletion`, `purgeDeletedEngagements` and `sendReminderEmail` with chosen event data. Verify the Vercel prod env.
10. **`POST /notifications/broadcast` can reach other tenants (#42).** A firm_admin of their own throwaway firm posts `scope:"client"` with a victim `clientId` (or `scope:"project"` with a victim engagement id). `orgAdmin ||` short-circuits the check and a CRITICAL notification with attacker-chosen title and body is delivered to the victim's client or engagement members. No RLS policies exist in `prisma/migrations`, so the app checks are the only barrier.

#### Cross-cutting notes (not in the top 10)

- `getSession()` supplies identity in #4, #7, #8, #13 and #15 (cookie path). `proxy.ts` calls `getUser()` on `/api/*` but never enforces the result, so these routes trust unvalidated cookie contents. I did not test whether a forged cookie is accepted at runtime.
- `canManageClient` and `canManageProject` return true for any firm_admin of the passed `orgId` without checking the client or engagement belongs to that org (lib/permission-helpers.ts, `checkClientPermission` and `checkProjectPermission` fallbacks). Any route that passes body-supplied ids to them inherits the gap (#42).
- `getPrismaWithRls` decodes the Bearer JWT without verifying it and sets `request.jwt.claims`. No RLS policies exist in migrations, so this is currently inert.
- `/thumbnail` (#57) sends `Cache-Control: public, s-maxage=3600` on a signed-in response. A shared CDN could serve it to other requesters; I did not verify Vercel's behavior here.
