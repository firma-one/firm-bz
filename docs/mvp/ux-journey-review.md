# UX Journey Review

**Date:** 2026-08-06
**Scope:** Journey 1 — Delivery tracking · Journey 2 — Connector setup
**Method:** Code walkthrough of the shipped flows (routes, components, API handlers). Findings are grounded in specific files/lines, not speculation.

Two journeys are covered here as requested. A backlog of the remaining journeys worth the same treatment is at the end.

---

## Journey 1 — Delivery tracking

### What the flow actually is today

| # | Step | Where | Mechanism |
|---|------|-------|-----------|
| 0 | Storage connector must exist and be attached to the client | Firm Settings → Document Storage, then Client Settings → Document storage | prerequisite, see Journey 2 |
| 1 | Upload a folder of documents | Engagement → **Files** tab → New Document / drag-drop | `webkitdirectory` folder picker, `engagement-file-list.tsx:2477` |
| 2 | Tag folder as deliverable | Files tab → row action menu → *Tag as Deliverable* | `PUT …/sharing {markAsDeliverable:true}`, `engagement-file-list.tsx:1122` |
| 3 | Set the due date | **Board** tab → open deliverable → detail panel | `PUT …/due-date`, `deliverable-detail-panel.tsx:697` |
| 4 | Files become sub-tasks | automatic | descendant files with `INHERITED` sharing rows, `subtasks/route.ts` |
| 5 | Move through stages | Board drag-drop or detail panel | `to_do → in_progress → in_review → approved`, `lib/deliverable-stage-roles.ts` |
| 6 | Report | **Overview** tab → Action Center | Overdue / Upcoming buckets, `engagement-insights-dashboard.tsx:516` |

The three-surface split the brief describes (intake on Files, tracking on Board, reporting on Overview) is real and is a reasonable information architecture. The problems are at the **seams between them**, not in the split itself.

### Findings

**1.1 — Tagging never asks for the due date. (High)**

`handleMarkAsDeliverable` fires a single API call with one boolean, toasts *"added to the Board"*, and stops (`engagement-file-list.tsx:1122-1142`). The due date — the one attribute that makes a deliverable trackable, and the thing the Overview page's entire Action Center is built on — is only reachable by leaving Files, going to Board, finding the card, and opening a panel.

A deliverable with no due date is invisible to Overdue/Upcoming reporting. The flow's default outcome is therefore an untracked deliverable.

> **Fix:** *Tag as Deliverable* opens a compact sheet — Due date, Owner, Starting stage — pre-filled with defaults (e.g. engagement end date, current user, `to_do`) and dismissible with *Skip*. Cheaper interim fix: give the success toast a **Set due date** action that opens the detail panel in place.

**1.2 — Configuring a deliverable requires a full page navigation. (High)**

`/e/[slug]/board` is a separate server route from `/e/[slug]/files`, so tag → configure is a page load, not a panel. The detail panel component (`deliverable-detail-panel.tsx`) is already self-contained and takes `documentId` + `projectId`.

> **Fix:** Mount the same panel from the Files row. Tag → configure → keep working, without leaving the tree you were just in.

**1.3 — Sub-tasks are derived, not authored — and the derivation is invisible. (High)**

The Jira analogy in the brief sets an expectation the implementation doesn't meet. Sub-tasks are not created by the user: they are *"descendant files of a Deliverable folder that have `INHERITED` sharing rows"* (`subtasks/route.ts:12-13`). A file sitting in the folder without a sharing row simply does not appear, with no explanation. There is an `onRemoveSubtask` path but no add path.

> **Fix:** Make the rule visible on the panel — *"Tracking 7 of 11 files in this folder"* with a one-click **Track all**, and an empty state that states the rule in plain language rather than showing nothing.

**1.4 — Upload and tagging are disconnected acts. (Medium)**

You upload a folder, the upload panel completes, and then you must find that folder again in the tree and right-click it. The upload progress panel (`components/ui/upload-progress-panel.tsx`) already knows exactly which folder was created.

> **Fix:** Offer *Tag as deliverable* directly in the upload-complete state. Separately, support multi-select tagging from the Files toolbar — today it is strictly one folder at a time via the row menu.

**1.5 — One concept, four names. (Medium — cheap to fix)**

| Surface | Name |
|---|---|
| Tab label | **Board** |
| URL | `/board` |
| Tab state value in `VALID_TABS` | `shares` |
| Count badge variable | `sharesCount` |
| API route | `/api/projects/[id]/shares` |
| The thing itself | **Deliverable** |

`VALID_TABS` (`[[...rest]]/page.tsx:18`) contains `shares` but not `board`; the `board` route exists as its own page. This is legacy drift from when the feature was "sharing," and it leaks into the UI.

> **Fix:** Settle on one noun. "Deliverables" is the one the domain uses. At minimum align tab label, URL, and user-facing copy; the API rename can follow later.

**1.6 — Untag is gated by stage, but the menu doesn't show it. (Medium — cheap)**

Untag is only permitted at `to_do`. The item renders enabled at every stage and the user learns otherwise from an error toast: *"Only deliverables with a To Do status can be untagged"* (`document-action-menu.tsx:662-663`). The adjacent approved-deliverable case already does this correctly — disabled item plus explanatory tooltip (`:653-656`).

> **Fix:** Apply the same disabled-with-tooltip treatment. The pattern is already in the file.

**1.7 — Stage transitions are constrained, and the board doesn't say why. (Medium)**

`getAllowedTransitions` enforces ±1 step only, no return from `approved`, and different rights per role — an External Collaborator may only do `in_progress → in_review`, a Viewer only `in_review → in_progress` (`deliverable-stage-roles.ts:52-79`). The rules are sound. But an invalid drop target on a Kanban board that silently refuses reads as a bug.

> **Fix:** On drag, dim invalid columns and show the reason on hover ("Only the engagement lead can approve").

**1.8 — "The client can't see this yet" is never surfaced. (Medium)**

`STAGE_ROLE_MAP` hides `to_do` deliverables from External Collaborators and Viewers entirely (`deliverable-stage-roles.ts:11-15`). Correct behaviour — but the firm-side card gives no signal that the client currently sees nothing. The first time this matters is a client asking why a deliverable never arrived.

> **Fix:** A small "Internal only" marker on `to_do` cards, and a visibility line in the detail panel: *"Visible to: firm team only."*

---

## Journey 2 — Connector setup

### What the flow actually is today

**Google Drive → Shared Drive** (the path called out in the brief):

1. Firm Settings → expand the **Document Storage** accordion (`firm-settings-form.tsx:874`)
2. Connect new account → friendly name → OAuth
3. *Choose Location* → **My Drive** or **Shared Drive**
4. Copy a generated folder name (button is ring-animated until clicked)
5. Watch a guide animation — gated, disabled until step 4 is done
6. Open Google Shared Drives in a new tab — gated, disabled until step 5 is done
7. **Manually create a folder in Google Drive with the exact pasted name**
8. Return, *Select Folder* via Google Picker — gated, disabled until step 6 is done
9. Separately, per client: Client Settings → Document storage → attach the firm connector (`client-settings-form.tsx:612`)

**Microsoft / SharePoint**, for the same job:

1. → 3. as above
2. Pick a SharePoint site from a searchable in-app list
3. Done — the app auto-creates `_firma/<generated-name>` inside the site's drive

Same product, same task, radically different experience.

### Root cause of the Google detour — and why the current design is a justified trade-off

Google is connected with `drive.file` + `drive.appdata` (`app/api/connectors/google-drive/route.ts:65-68`). Verified against Google's current documentation (Aug 2026):

| Constraint | Status |
|---|---|
| Can the Picker select a **shared drive itself**? | **No.** `setEnableDrives` "shows shared drives and the files they contain" — selection is of files/folders *within* a shared drive, not the drive container. |
| Can the app **list** shared drives programmatically (the SharePoint approach)? | **No.** `drives.list` requires `drive` or `drive.readonly`. `drive.file` is not accepted. |
| Cost of adopting those scopes | `drive` and `drive.readonly` are **restricted** scopes — OAuth verification **plus an annual third-party (CASA) security assessment**. `drive.file` is **non-sensitive**, requiring only basic verification. |

So the SharePoint-style "pick a site from an in-app list" pattern is not reachable from `drive.file`, and reaching it means taking on restricted-scope compliance permanently. Microsoft is only easier because `Files.ReadWrite.All` + `Sites.Read.All` are ordinary delegated Graph permissions with no equivalent gate.

**The current flow is therefore a reasonable response to a real platform constraint, not an oversight.** I found no 2025–2026 Picker change that alters this. The findings below are refinements within the constraint, not a way around it.

### Findings

**2.1 — Pick the *parent folder*, not the pre-named target. (Medium — partial win, not parity)**

The one thing `drive.file` *does* allow: after the user picks a folder, the app can create children inside it by setting `parents` on `files.create`. Google explicitly recommends this combination — *"Using the drive.file OAuth scope in combination with the Google Picker API optimizes both user experience and safety for your app."*

That means the exact-name requirement is avoidable even though drive selection isn't. Instead of *"create a folder named `<generated>`, then find and select it"*, the step becomes *"select the folder in your shared drive where the workspace should live"* — and the app then creates `_firma/<generated-name>` inside it, reusing the `ensure-folder` calls it already runs for My Drive (`google-drive-workspace-root.tsx:216-261`).

**What this removes:** the copy step, the exact-name-matching failure mode, the guide animation, and the "Open Shared Drives" round trip — *when the shared drive already contains at least one folder*, which is the common case for an established firm.

**What it does not remove:** an **empty** shared drive has nothing to pick, so that case still needs a manual folder creation. But it degrades to *"create any folder"* rather than *"create a folder named exactly this"* — a materially easier instruction with no transcription failure mode.

**Honest scope of the win:** this is a smaller improvement than SharePoint parity. It shortens the common path and removes a failure class; it does not eliminate the manual step universally.

> **Fix:** Reframe the Shared Drive branch as *pick where it should live*, keep the generated name as an internal detail rather than something the user must reproduce, and keep a short "no folders here yet — create one" fallback for empty drives.

**2.1b — Service account on the shared drive (alternative worth evaluating, not recommended blind)**

The other way to get full programmatic access to a shared drive without a restricted scope: the user adds a service account email as a **Content Manager** on the shared drive. Access is then granted by the user's explicit sharing action rather than by OAuth scope, and content created in a shared drive is owned by the drive, so there's no SA storage-quota problem.

Trade-offs that need your judgement, not mine:
- **Attribution.** Drive-side actions would appear as the service account, not the acting user. Given the engagement Audit tab, this may be disqualifying.
- **It's still a manual step** — copy an email, add it as a member in Drive — though it's a widely used pattern and arguably more familiar than exact-name folder creation.
- **Architectural cost.** It sits alongside, not inside, the existing per-user OAuth model.

I have not validated this against your permission/audit requirements. Flagging it as an option, not a recommendation.

**2.2 — Connecting storage is not part of onboarding. (High)**

Onboarding is two steps: *Initialize Workspace* (mandatory) and *Subscribe to a plan* (optional) — `onboarding-sidebar.tsx:26-27`. Neither connects storage. The app cannot store a single document without a connector, yet the only way to find one is: guess that it lives in Firm Settings, then expand a collapsed accordion section.

> **Fix:** Add *Connect storage* as onboarding step 2 (mandatory). Add a persistent empty state on the Files tab — *"No storage connected"* with a direct link — so the dead end is at least self-explanatory.

**2.3 — `/d/f/[slug]/connectors` is a dead route. (Low — cheap)**

The URL exists and immediately redirects back to the firm page (`connectors/page.tsx`). It reads like a connectors page that was planned and never built, and it means there is no linkable address for connector setup — you can only send someone "Firm Settings, then expand Document Storage."

> **Fix:** Either make it the real connectors page (and link onboarding/empty states at it), or delete the route.

**2.4 — Setup is two-place and the first place never says so. (High)**

The firm connects the account; each client must then be attached to it separately. The firm-level connector card shows no coverage. An admin can complete the entire, laborious Google setup and still have zero clients able to store anything, with no indication that they aren't finished.

> **Fix:** Show attachment coverage on the connector card — *"Attached to 2 of 7 clients"* — with a bulk **Attach to all clients** action.

**2.5 — The Google step counter moves its own goalposts. (Medium — cheap)**

`totalSteps = setupSteps + 1 + (rootFolderId ? 1 : 0)` where `setupSteps` is `4` for Shared and `3` for My Drive, and `currentStep` is a five-level nested ternary over four booleans (`google-drive-workspace-root.tsx:414-423`). The total therefore *changes* when you choose Shared Drive — after the progress indicator is already on screen.

OneDrive already solved this and documents why: `totalSteps = 2` fixed, *"so the bar doesn't jump/reflow once a location is chosen"* (`onedrive-workspace-root.tsx:273-275`).

> **Fix:** Fix the total up front, same as OneDrive. Worth doing regardless of 2.1 — the Google flow keeps a multi-step shape either way.

**2.6 — Progressive gating has no escape hatch. (Medium)**

Each button unlocks only after the previous one is clicked: *Open Shared Drives* requires `hasCopied && hasWatchedGuide` (`:792-795`); *Select Folder* requires `hasOpenedDrive` (`:823`). The gates are a proxy for "did you really do the manual step" — they can't verify it, and they penalise the user who already has the folder ready or is setting up their fifth firm.

> **Fix:** Keep the sequence as the suggested path, but let users click ahead. If 2.1 lands, the guide gate in particular has nothing left to enforce.

**2.7 — Migration locks the workspace with no scheduling. (Medium)**

The confirm step warns *"The workspace will be locked for all members during migration"* alongside a `~N min` estimate (`:873-880`). There is no way to schedule it, and no way to notify members first — an admin changing storage at 2pm silently locks out the whole firm.

> **Fix:** Offer *Start now* vs *Notify members and start in 15 minutes*, and post an in-app notice when the lock begins.

**2.8 — Provider asymmetry is unexplained. (Medium — cheap, and now permanent)**

A firm that connects both providers sees a one-click SharePoint setup and a long Google setup, with nothing accounting for the difference. Given that the gap is structural (see root cause above) rather than something you'll close, naming it matters more than it would if it were temporary.

> **Fix:** One line in the Shared Drive step: *"Google only lets apps see folders you explicitly select, so this step is manual. Microsoft doesn't have this restriction."* Attributing the constraint costs nothing and stops the flow reading as arbitrary or unfinished — this is the highest value-per-effort item in Journey 2.

**2.9 — What's already right, and worth generalising. (Note)**

Personal Google and Microsoft accounts skip the location choice entirely — the folder auto-creates on render with a spinner, because a personal account can never have a Shared Drive / SharePoint site, so there is no decision to present (`google-drive-workspace-root.tsx:283`, `onedrive-workspace-root.tsx:242`). The *Migrate* button is likewise hidden for those accounts rather than shown-and-disabled.

This is exactly the right instinct — **don't ask a question with only one possible answer**. Note that it is applied where the platform allows it; the shared-drive case resists the same treatment for the scope reasons above, which is a constraint rather than an inconsistency.

### Sources for the Google constraint

- [DocsView.setEnableDrives reference](https://developers.google.com/workspace/drive/picker/reference/picker.docsview.setenabledrives) — shared drives and the files they contain; selection is within drives
- [drives.list reference](https://developers.google.com/workspace/drive/api/reference/rest/v3/drives/list) — requires `drive` or `drive.readonly`
- [Choose Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) — `drive`/`drive.readonly` restricted (security assessment); `drive.file` non-sensitive
- [Create and populate folders](https://developers.google.com/workspace/drive/api/guides/folder) — creating inside a folder via the `parents` property
- [Google Picker overview](https://developers.google.com/workspace/drive/picker/guides/overview) — `drive.file` + Picker as the recommended combination

---

## Priority summary

| # | Finding | Impact | Effort |
|---|---------|--------|--------|
| 1.1 | Ask for due date at tag time | High | Low |
| 2.4 | Show client-attachment coverage on the connector | High | Low |
| 2.2 | Connect storage during onboarding | High | Medium |
| 1.3 | Make sub-task derivation visible + Track all | High | Medium |
| 1.2 | Configure deliverables without leaving Files | High | Medium |
| 2.8 | Explain the Google/Microsoft asymmetry | Medium | Trivial |
| 1.6 | Disable untag with tooltip instead of error toast | Medium | Trivial |
| 2.5 | Stable step count in the Google wizard | Medium | Trivial |
| 1.5 | One name for Board / Shares / Deliverables | Medium | Low |
| 1.7 | Explain invalid board transitions | Medium | Low |
| 1.8 | Surface client visibility on `to_do` cards | Medium | Low |
| 2.1 | Pick the *parent folder* instead of the pre-named target | Medium | Medium |
| 1.4 | Tag from the upload panel; bulk tagging | Medium | Medium |
| 2.7 | Schedule / announce migration lock | Medium | Medium |
| 2.6 | Allow skipping ahead in the gated wizard | Medium | Low |
| 2.3 | Fix or remove the dead `/connectors` route | Low | Trivial |
| — | Service account on shared drive (2.1b) | Unknown | High |

**Two themes run through both journeys.**

*Ask for the critical attribute at the moment of the action.* Tagging a deliverable without a due date and connecting a firm connector without attaching clients are the same failure — a flow that reports success while leaving the user short of a working outcome. This is where the cheapest, highest-impact wins are.

*Where a platform constraint forces friction, name it.* The Google Shared Drive flow can be shortened somewhat (2.1) but not made to match SharePoint. The remaining gap is `drive.file`'s doing, and saying so in one line of copy is worth more than most of the interaction changes around it.

---

## Not yet covered

Worth the same treatment, in rough order of expected value:

- **Sign-up → first document stored** — the full cold-start path across signup, onboarding, firm creation, connector, client, engagement
- **External sharing & intake** — inviting a client, the pending-approval queue, secure open/regrant
- **Client-side experience** — what an External Collaborator or Viewer actually sees, given the stage-based visibility rules
- **Search & discovery** — Doc Search, global search, bookmarks, recents
- **Firm/client/engagement setup** — the create-and-configure path and its settings depth
- **Comments & review loop** — comment threads against the `in_review` stage
