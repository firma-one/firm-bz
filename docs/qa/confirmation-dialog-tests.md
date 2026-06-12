# QA Test Scenarios — ConfirmDialog Component

Covers the `ConfirmDialog` component and all 17 call sites migrated to it.

---

## 1. Component Baseline (any dialog will do)

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1.1 | White header renders | Open any confirm dialog | Header strip is white (`bg-white`), separated from body by a border |
| 1.2 | Icon pill matches variant | Red variant dialog | Icon pill is `bg-red-50` with red icon; amber variant shows amber pill |
| 1.3 | Title is uppercase | Open any confirm dialog | Title text renders in uppercase, bold, tracked |
| 1.4 | Subtitle renders | Open any dialog with subtitle | Subtitle appears below title in muted text |
| 1.5 | Body background | Open any confirm dialog | Body area is `bg-[#f9f9fb]` (off-white), distinct from header/footer |
| 1.6 | White footer renders | Open any confirm dialog | Footer strip is white, separated from body by a top border |
| 1.7 | Button labels uppercase | Open any confirm dialog | Both Cancel and confirm button labels are uppercase |
| 1.8 | Cancel dismisses | Click Cancel | Dialog closes; no action taken |
| 1.9 | Overlay click dismisses | Click outside the dialog | Dialog closes |
| 1.10 | Escape key dismisses | Press Escape | Dialog closes |
| 1.11 | Loading state | Trigger a slow action | Confirm button shows spinner; both buttons disabled |
| 1.12 | Extra slot renders | Open "Remove connector" with attached clients | Amber warning banner appears between description and footer |

---

## 2. File List — engagement-file-list.tsx

### 2.1 Move to Bin

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 2.1.1 | Opens on action | Select file → action menu → Move to Bin | ConfirmDialog opens with Trash2 icon, red variant |
| 2.1.2 | Filename in description | Any file | Description contains the file's name in bold |
| 2.1.3 | Confirm moves file | Click "Move to Bin" | File moves to Google Drive Bin; toast shown; dialog closes |
| 2.1.4 | Cancel aborts | Click Cancel | File unchanged; dialog closes |
| 2.1.5 | Loading while deleting | Click "Move to Bin" | Spinner shown; buttons disabled until complete |

### 2.2 Return to Draft

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 2.2.1 | Opens on action | Finalized document → unlock badge/action | ConfirmDialog opens with primary variant |
| 2.2.2 | Filename in description | Any document | Description contains the document name |
| 2.2.3 | Confirm unlocks | Click "Return to Draft" | Document status reverts to Draft; collaborators regain access |
| 2.2.4 | Cancel aborts | Click Cancel | Document remains Finalized |

### 2.3 Revoke External Access

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 2.3.1 | Opens from file row | File with sharing → Revoke | ConfirmDialog opens with Link2 icon, red variant |
| 2.3.2 | Confirm revokes | Click "Revoke Access" | All external sharing removed; secure links invalidated |
| 2.3.3 | Cancel aborts | Click Cancel | Sharing unchanged |

---

## 3. Members — member-list.tsx

### 3.1 Remove Member

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 3.1.1 | Opens from member row | Member row → Remove member | ConfirmDialog opens with UserMinus icon, red variant |
| 3.1.2 | Confirm removes | Click "Remove member" | Member loses project access; row removed from list |
| 3.1.3 | Cancel aborts | Click Cancel | Member unchanged |

### 3.2 Cancel Invitation (Engagement)

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 3.2.1 | Opens from pending invite | Pending invite → cancel | ConfirmDialog opens with Mail icon; Cancel button reads "Keep invitation" |
| 3.2.2 | Confirm revokes | Click "Cancel invitation" | Invite revoked; row removed |
| 3.2.3 | Keep invitation aborts | Click "Keep invitation" | Invite unchanged |

---

## 4. Members — firm-members-tab.tsx

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 4.1 | Cancel invitation dialog | Firm member pending invite → cancel | ConfirmDialog opens; "Keep invitation" / "Cancel invitation" buttons |
| 4.2 | Confirm revokes | Click "Cancel invitation" | Invite revoked at firm level |
| 4.3 | Keep invitation aborts | Click "Keep invitation" | Invite unchanged |

---

## 5. Members — client-members-tab.tsx

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 5.1 | Cancel invitation dialog | Client member pending invite → cancel | ConfirmDialog opens with same pattern as firm tab |
| 5.2 | Confirm revokes | Click "Cancel invitation" | Invite revoked at client level |
| 5.3 | Keep invitation aborts | Click "Keep invitation" | Invite unchanged |

---

## 6. Contacts — client-contacts-tab.tsx

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 6.1 | Opens from contact row | Contact → delete | ConfirmDialog opens with Trash2 icon; contact name in description |
| 6.2 | Confirm deletes | Click "Delete contact" | Contact permanently removed; list refreshes |
| 6.3 | Cancel aborts | Click Cancel | Contact unchanged |
| 6.4 | Loading while deleting | Click "Delete contact" | Spinner shown; buttons disabled |

---

## 7. Connectors — firm-drive-section.tsx

### 7.1 Disconnect Google Drive

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 7.1.1 | Opens from connector card | Active connector → Disconnect | ConfirmDialog opens with Unplug icon, red variant |
| 7.1.2 | Confirm disconnects | Click "Disconnect" | Connector session revoked; card reflects disconnected state |
| 7.1.3 | Cancel aborts | Click Cancel | Connector unchanged |

### 7.2 Remove Connector

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 7.2.1 | Opens from connector card | Connector → Remove | ConfirmDialog opens with Trash2 icon, red variant |
| 7.2.2 | No attached clients | Connector with no clients | No amber warning banner in body |
| 7.2.3 | Attached clients warning | Connector attached to 1+ clients | Amber warning banner lists affected client names |
| 7.2.4 | Confirm removes | Click "Remove" | Connector deleted; all attached clients detached |
| 7.2.5 | Cancel aborts | Click Cancel | Connector unchanged |

---

## 8. Settings — Delete Firm / Client / Engagement

| # | Scenario | File | Expected on confirm |
|---|----------|------|---------------------|
| 8.1 | Delete firm | `firm-settings-form.tsx` | Firm and all data deleted; redirected out |
| 8.2 | Delete client | `client-settings-form.tsx` | Client and all engagements deleted |
| 8.3 | Delete engagement | `engagement-settings-form.tsx` | Engagement deleted; Drive folder retained |
| 8.4 | All three: sandbox blocked | Sandbox firm | Confirm button disabled (sandbox guard) |
| 8.5 | All three: cancel aborts | Click Cancel | No deletion; dialog closes |
| 8.6 | All three: loading state | Click confirm | Spinner; buttons disabled until redirect/completion |

---

## 9. Dashboard — delete-confirmation-dialog.tsx (file-review-modal)

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 9.1 | Opens from file review | Select files → delete | ConfirmDialog opens; title shows file count |
| 9.2 | Plural vs singular | 1 file selected | Title reads "Move 1 file to Trash" (no "s") |
| 9.3 | Total size in description | Any selection | Formatted file size shown in bold in description |
| 9.4 | Confirm deletes | Click "Delete" | Files moved to Trash; modal closes |
| 9.5 | Cancel aborts | Click Cancel | No deletion |

---

## 10. Chat — recent-sessions-modal.tsx

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 10.1 | Opens from Clear All | Sessions modal → Clear all | ConfirmDialog opens with Trash2 icon, red variant |
| 10.2 | Confirm clears | Click "Clear all" | All sessions removed from browser storage |
| 10.3 | Cancel aborts | Click Cancel | Sessions unchanged |
| 10.4 | Loading state | Click "Clear all" | Spinner shown while clearing |

---

## 11. System — platform-maintenance/page.tsx (admin only)

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 11.1 | Enable maintenance | Platform inactive → Enable | ConfirmDialog opens; amber icon; button reads "Yes, start grace period"; amber confirm button |
| 11.2 | Disable maintenance | Platform active → Disable | Button reads "Yes, disable"; red confirm button |
| 11.3 | Cancel grace period | Grace period active → Cancel | Button reads "Yes, cancel grace period"; red confirm button |
| 11.4 | Confirm triggers action | Click confirm in any state | Correct API call fires; platform state updates |
| 11.5 | Cancel aborts | Click Cancel | Platform state unchanged |

---

## 12. System — integrations/page.tsx (admin only)

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 12.1 | Opens from Resume button | Select firms → Resume Provisioning | ConfirmDialog opens with RotateCw icon, primary variant |
| 12.2 | Firm count in description | 3 firms selected | Description reads "…for 3 firms…" |
| 12.3 | Singular vs plural | 1 firm selected | Description reads "…for 1 firm…" (no "s") |
| 12.4 | Confirm re-enqueues | Click "Resume Provisioning" | Inngest jobs enqueued for selected firms |
| 12.5 | Cancel aborts | Click Cancel | No jobs enqueued |

---

## Regression Checks

After any refactor touching `ConfirmDialog`, verify:

- [ ] All dialogs open and close correctly
- [ ] No dialog leaves the page in a broken state after Cancel
- [ ] Loading spinners appear and buttons disable during async operations
- [ ] Keyboard navigation (Tab, Enter, Escape) works in all dialogs
- [ ] No visual regressions: header/body/footer zones clearly distinct
- [ ] `extra` slot (amber warning) only appears when content is provided
