# One set of role names

**Status:** for Deepak's review (2026-11-07). No app code has changed for this.

## The problem

The same four roles have different names depending on the screen, and a lot of copy assumes anyone outside the team is a client. External roles can be internal reviewers too, so both need fixing.

| Where | `eng_admin` | `eng_member` | `eng_ext_collaborator` | `eng_viewer` |
|---|---|---|---|---|
| Members page, invite (`lib/persona-ui-groups.ts`) | Owner | Contributor · Full Access | Contributor · Limited Access | Reviewer |
| Engagement header, list, Deliverable panel | Lead | | | |
| @mention menu (`lib/comments/mentions.ts:107`) | Lead | Member | Collaborator | Reviewer |
| Overview charts (`engagement-insights-dashboard.tsx:339`) | Admin | Member | Collaborator | Reviewer |
| Database names: "You ·" tag, share dialog, Board, invite flow (`prisma/seed.ts:15`) | Engagement Lead | Contributor (Internal) | Contributor (External) | Reviewer |
| Fallback (`use-project-persona-labels.ts:6`) | | | External Collaborator | Reviewer |
| Actions menu, Files unshare dialog | | | External collaborators | viewers |
| /tour (`demo-tour-steps.tsx:501`) | Lead | | Collaborator | Viewer |
| Brio prompt (`lib/ai/engagement-chat.ts:630`) | | | External Collaborator | External Viewer |

## Proposed names

| Role | Name | Short form, where space is tight |
|---|---|---|
| `eng_admin` | **Lead** | Lead |
| `eng_member` | **Contributor · Full Access** | Full Access |
| `eng_ext_collaborator` | **Contributor · Limited Access** | Limited Access |
| `eng_viewer` | **Reviewer** | Reviewer |

Rules for all copy:

- **Internal** names an access tier: Leads and Full Access contributors. It doesn't describe where someone works. "Internal only" is the visibility term, as on the Audit and Settings tabs and in "Internal note".
- For everyone else, name the roles: "Limited Access contributors and Reviewers". Don't use external, guest, viewer or client for a role.
- **Client** stays for the organization an engagement belongs to, and for marketing, which speaks to firms about their clients.

## Decisions for Deepak

1. **Lead or Owner?** Recommend **Lead**. It's already on every engagement header, the engagement list and the Deliverable panel, and "Owner" collides with a file's owner in Drive. It means changing the Members page, invite modal and trust page, which say Owner today.
2. **"Internal" when someone inside the firm holds the Reviewer role.** They can't see Internal only files. Recommend keeping the word and naming the roles in tooltips, so the rule is always stated.
3. **Comment signals that say "client".** "Reply to client comments" and similar really mean "someone in a limited role wrote last". Recommend dropping "client" as in table B.
4. **/tour's story.** Its sample firm really does have a client, so narrative lines can stay. Recommend changing only the lines that state a visibility rule. Changing a spoken line means regenerating its clip (`scripts/tour-narration/generate.py`; `lib/demo/tour-narration.test.ts` enforces it).

## A. Role names to change

Assumes Lead. Paths are under `frontend/`.

| Where | Today | Proposed |
|---|---|---|
| `lib/persona-ui-groups.ts:5`, `components/projects/members/member-list.tsx:47`, `components/projects/members/invite-member-modal.tsx:178`, `components/demo/demo-engagement-members.tsx:30` | Owner | Lead |
| `components/projects/members/invite-member-modal.tsx:21` | Engagement Lead · manages the engagement and its members · internal | Lead · manages the engagement and its members · internal |
| `components/projects/members/invite-member-modal.tsx:22` | Contributor · edits all engagement content · internal | Full Access · edits all engagement content · internal |
| `components/projects/members/invite-member-modal.tsx:23` | Contributor · edits only what is shared with them · guest | Limited Access · edits only what is shared with them |
| `components/projects/members/invite-member-modal.tsx:24` | Reviewer · views shared content, read-only · guest | Reviewer · views shared content, read-only |
| "You ·" tag (`components/projects/engagement-header.tsx:128`), share dialog (`components/files/document-share-modal.tsx:206,255`), Board (`components/projects/shares/engagement-shares-tab.tsx:1722`), invite flow (`lib/actions/invitations.ts:352`): all read the database's names | Engagement Lead, Contributor (Internal), Contributor (External) | Show the code's labels by role slug instead: Lead, Contributor · Full Access, Contributor · Limited Access. The database stays as it is. |
| Invite modal Access hint (`components/projects/members/invite-member-modal.tsx:196`): reads the database's description | "External collaborator…", "External stakeholder… Typically clients, sponsors…" | Text in code that says what the role can do, not who holds it. The database stays as it is. |
| `lib/hooks/use-project-persona-labels.ts:6` | External Collaborator | Contributor · Limited Access |
| `lib/comments/mentions.ts:109-110` | Member, Collaborator | Full Access, Limited Access |
| `components/projects/engagement-insights-dashboard.tsx:339-341`, `components/demo/demo-engagement-overview.tsx:226-228` | Admin, Member, Collaborator | Lead, Full Access, Limited Access |
| `components/projects/engagement-insights-dashboard.tsx:297`, `components/projects/engagement-overview-sections.tsx:480` | Admin (Engagement Lead) · Member · Collaborator (external) · Reviewer | Lead · Full Access · Limited Access · Reviewer |
| `components/projects/engagement-insights-dashboard.tsx:313-320`, `components/projects/engagement-overview-sections.tsx:487-490` | Internal vs External; Firm-side vs client-side members | Internal vs Limited; Leads and Full Access contributors vs Limited Access contributors and Reviewers |
| `components/files/use-stage-move.tsx:121` | external contributor(s) | Limited Access contributor(s) |
| `components/files/use-stage-move.tsx:123` and the dialog title it feeds | Share its documents with the client? | Share its documents? |
| `components/projects/shares/deliverable-detail-panel.tsx:1142` | External contributors | Limited Access contributors |
| `components/ui/document-action-menu.tsx:1413` | External collaborators and viewers lose their access to it. | Limited Access contributors and Reviewers lose their access to it. |
| `components/ui/document-action-menu.tsx:315` | Collaborators can view this file only until you unlock. | Others can only view this file until you unlock it. |
| `components/projects/engagement-file-list.tsx:3944` | Remove sharing for all external collaborators. | Remove sharing for all Limited Access contributors. |
| `components/projects/engagement-file-list.tsx:3951` | All external collaborators and viewers will lose… | All Limited Access contributors and Reviewers will lose… |
| `components/projects/engagement-tabs.tsx:79,98` | Internal only — external contributors and reviewers don't see this | Internal only · Hidden from Limited Access contributors and Reviewers |
| `components/projects/firm-settings-form.tsx:849`, `components/demo/demo-firm-settings.tsx:205` | Which sections external members see… Internal members always see everything. | Which sections Limited Access contributors and Reviewers see… Leads and Full Access contributors always see everything. |
| `app/api/projects/[projectId]/documents/[documentId]/intake/route.ts:48,54` | Only Engagement Lead can approve or reject | Only a Lead can approve or reject |
| `components/projects/engagement-file-row.tsx:512` | Engagement Lead can Return to Draft | A Lead can return it to draft |
| `app/api/projects/[projectId]/documents/[documentId]/sharing/accept/route.ts:31` | only external members can accept documents | only Limited Access contributors and Reviewers can accept documents |
| `app/api/projects/[projectId]/index-file/route.ts:93` | External collaborators submit files via index-file-intake | Limited Access contributors submit files via index-file-intake |
| `components/support/create-support-request-modal.tsx:67` | How do I share files with external collaborators? | How do I share files with a reviewer? |
| `components/demo/demo-tour-steps.tsx:501` | Lead, Collaborator or Viewer | Lead, Contributor or Reviewer |
| `lib/ai/engagement-chat.ts:514,630-631` (Brio) | External participants, External Collaborator, External Viewer | Limited-access participants, Contributor · Limited Access, Reviewer |
| `lib/ai/summary-sections.ts:29`, `lib/ai/files-agent/run.ts:89`, `lib/ai/engagement-summary.ts:157` | Engagement Lead | Lead |
| `components/marketing/v2/trust/trust-map-data.ts:30,32`, `components/marketing/v2/trust/trust-page.tsx:104` | Owner | Lead |

## B. Copy that assumes a client

| Where | Today | Proposed |
|---|---|---|
| `components/files/document-share-modal.tsx:258` | Clients, sponsors & stakeholders who review & stay informed | People who review and stay informed |
| `components/projects/engagement-comments-tab.tsx:140` | Discussions where a client or external collaborator spoke last show up here. | Discussions where a Limited Access contributor or Reviewer spoke last show up here. |
| `components/dashboard/firm-actions.tsx:30` | Reply to client comments · The client wrote last | Reply to comments · Waiting on your reply |
| `components/home/home-view.tsx:98`, `components/inbox/inbox-view.tsx:547` | Approvals, client comments, changes requested… | Approvals, comments, changes requested… |
| `components/inbox/inbox-items.ts:259` | Client comment | Comment |
| `components/projects/firm-settings-form.tsx:95`, `components/demo/demo-firm-settings.tsx:33` | Client comment posted | Comment from a Limited Access contributor or Reviewer |
| `lib/email-templates/client-comment.ts:18` | New comment from your client | New comment |
| `lib/email-templates/document-intake.ts:23` | A client uploaded this file… | Someone with limited access uploaded this file… |
| `app/api/projects/[projectId]/documents/[documentId]/sharing/accept/route.ts:125` | Document accepted by client | Document accepted |
| `components/projects/engagement-overview-sections.tsx:296,411` | unanswered client comments; how quickly client comments get a reply | unanswered comments; how quickly comments get a reply |
| `components/projects/engagement-insights-dashboard.tsx:1349` | files submitted by clients | files submitted for review |
| `components/projects/engagement-insights-dashboard.tsx:2607,2855,3051`, `components/demo/demo-summary-card.tsx:124` | Visible to the client and in exports. | Visible to everyone on the engagement and in exports. |
| `components/projects/summary-draft-review.tsx:227,233` | the engagement summary the client sees; visible to the client | the engagement summary everyone on it sees; visible to everyone on the engagement |
| `components/projects/document-doc-comments-pane.tsx:936,1179`, `components/demo/demo-deliverable-comments.tsx:292,391` | Only the firm's team sees this | Only Leads and Full Access contributors see this |
| `app/api/projects/[projectId]/documents/[documentId]/doc-comments/route.ts:184` | Only the firm's team can write internal notes | Only Leads and Full Access contributors can write internal notes |
| `app/api/projects/[projectId]/documents/[documentId]/doc-comments/route.ts:189,396` | An internal note cannot remind a client | An internal note can only remind Leads and Full Access contributors |
| `components/projects/engagement-settings-form.tsx:298`, `components/projects/add-engagement-modal.tsx:290` | Only your firm sees this. | Internal only. (check what gates each field first) |
| `components/demo/demo-tour-steps.tsx:363` | …would show the deliverable to the client for the first time | …would show the deliverable to a Limited Access contributor or Reviewer for the first time |
| `components/demo/demo-tour-steps.tsx:395` | Only your firm sees the flag | Only Leads and Full Access contributors see the flag |
| `lib/ai/engagement-chat.ts:221,569`, `lib/ai/firm-brief.ts:195` (Brio) | what the client receives; unanswered client comments | Review with the wording above; Brio's answers repeat these words |

## C. Leave as they are

- **The Client organization:** New client, the Clients tab, "Select a client", `lib/connectors/storage-failure.ts:60`, Client and Engagement settings, `components/projects/add-client-modal.tsx:262`, `components/projects/client-settings-form.tsx:501` (client records belong to the firm).
- **Marketing, legal, /resources and campaign emails**, apart from the role names on the trust page. Their audience is firms talking about their clients.
- **/tour's story lines**, such as `components/demo/demo-tour-steps.tsx:464,483,531`, and `lib/demo/demo-brio.ts`, `lib/demo/demo-summary.ts`, unless Decision 4 goes the other way.
- **Folder templates** in `lib/ai/files-agent/scaffold.ts` ("What the client receives"), which are sample folder purposes.
- **Non-role uses:** "Lead source", "External link", "Document Owner".
- **Code names:** role slugs, `share.guest`, `externalCollaborator`, `externalClientComment`. These are stored values, and nobody sees them.
- **Files with no imports found:** `components/ui/share-modal.tsx`, `components/ui/search-dropdown.tsx`, `components/dashboard/contributors-tab.tsx`, `lib/config/engagement-role-access.ts`. Not worth rewording; they need their own check before removal.

## How it would ship

- Copy changes in the files above, with /tour in the same change. `components/demo/tour-parity.test.tsx` guards the Files row and menu.
- **No data migration: labels only.** Screens stop reading role names from the database and use the code's labels, so stored names and descriptions can stay as they are.
- Regenerated narration clips for any spoken line that changes.
- One shared source for role names, so screens stop defining their own. `lib/persona-ui-groups.ts` is the natural home.

## Related: "Make private" becomes "Internal only"

Applied 2026-11-07, with no data migration: the stored value stays `private`. Offered only inside a deliverable's tree, and refused on the server elsewhere; a mark already outside one can still be removed.

| Where | Today | Proposed |
|---|---|---|
| ⋮ menu | Make private | Make internal only |
| ⋮ menu, to undo | Make public | Remove internal only |
| Lock tooltip (`components/files/private-mark.tsx`) | Private to your firm. Clients can't see this file. Click to make it visible to all members. | Internal only. Hidden from Limited Access contributors and Reviewers. Click to remove. |
| Refusal (`lib/files/private-documents.ts:74`) | A shared document can't be made private. Turn off sharing first. | A shared document can't be made internal only. Turn off sharing first. |
| Refusal (`lib/files/private-documents.ts:75`) | This folder holds documents shared with clients. Turn off their sharing first. | This folder holds shared documents. Turn off their sharing first. |
| New refusal, same file | | Only files and folders inside a deliverable can be made internal only. |
