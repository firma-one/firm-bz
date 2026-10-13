# Firm Doc Templates

## The problem this solves

The scaffold creates folders and nothing else. Nine empty folders for three
questions is too thin — a user could make them by hand in two minutes.

Three attempts at filling them were considered and rejected, in order:

1. **A fixed list of templates we ship** — the same mistake as the four
   hard-coded engagement kinds. A GTM engagement, an audit and a product build
   do not want one shared set.
2. **Model-generated document content** — from four answers and a one-line
   description a model writes plausible filler a professional must delete,
   which is worse than an empty shell because it looks finished.
3. **A library of generic QMS shells we write** — does not scale across
   domains, and nobody can maintain templates for domains they do not know.

**What resolves it: the firm supplies the templates.** Their own documents,
their letterhead, their section order, their domain. We never have to know
whether they do audits or marketing.

## Shape

| | |
|---|---|
| **Storage** | A `Templates` folder under `Firm.firmFolderId`, beside the `.meta/assets` the firm logo already uses. |
| **Connector** | Chosen on the Doc Templates page. A firm may have several (`Firm.connectors` is a list), so the page picks one rather than assuming. |
| **Schema** | No change required. Optionally one nullable `Firm.templatesFolderId` so the folder is not resolved by name on every read. |
| **UI** | A dedicated **Doc Templates** page at firm level — not buried in settings. Looks and behaves like the engagement Files page. |
| **Brio reads** | Filenames only — the same boundary as today. |
| **Brio decides** | Which templates suit this engagement, from the questionnaire answers and the engagement description. |
| **Scaffold does** | Copies the chosen templates into the right folders (`copyFile` / `recursiveCopy`, both providers). |
| **No templates** | Today's behaviour, unchanged: folders only. |

## Why not a "template engagement"

The first design was an `Engagement` row with `isTemplate: true`. It forces the
question "which client?", and `Engagement.clientId` is non-null.

Every way of answering it is a workaround: a synthetic client, one copy per
client (which then needs a hook on every new client, and drifts), or making
`clientId` nullable (which gives every query, join and permission check a case
it never had — a wide blast radius for one feature, and where a permissions bug
would hide).

The tension disappears once the files live in the firm's own Drive folder.
No client mapping, no per-client copies, no drift, no new-client hook, and
nothing to exclude from lists, counts, insights or billing — because there is
no engagement row to exclude.

**Precedent:** the firm logo already stores assets under `firmFolderId` via
`firm.connector` with no client involved (`app/api/firms/[firmId]/logo/route.ts`).
A firm-level Drive folder holding firm-level files is established here, not new.

## Decided

- **Firm-level, not client-level.** Templates encode the firm's METHOD — their
  section order, their sign-off block. That does not vary by client, and if it
  did the firm would have a consistency problem. A 30-person agency with 40
  clients cannot maintain 40 copies of one campaign brief. Client-specific
  needs (brand colours, reporting cadence) are content, and belong on the
  engagement or the client, not in a parallel template library.
- **Flat, not grouped.** Good filenames — `Audit Testing Memo.docx`,
  `Campaign Brief.docx` — are enough for Brio to choose from. Subfolders per
  engagement kind are more structure to maintain for no gain. Different
  practice lines coexist in one folder, since selection is by engagement kind
  rather than by folder.
- **Firm-level, not group-level.** `firmFolderId` is already firm-scoped, and
  firms are independent.
- **Filenames only.** Brio does not read document contents. The privacy policy
  states twice, in bold, that "the contents of your documents are never sent",
  and nothing here requires changing that.
- **70% accuracy is productive.** Four templates copied, one wrong, is still a
  better start than an empty tree — the user deletes the wrong one. Selection
  does not need to be certain, which is what makes filenames sufficient rather
  than a compromise.
- **`create-file` added to `PERMITTED_AGENT_OPERATIONS`.** It meets the
  reversibility test the same way `create-folder` does: a file the user did not
  want is deleted in one click, and nothing existing is touched. `overwrite`
  and `replace` remain forbidden, and the safe-op must refuse a name already
  taken rather than replacing contents.

## Explicitly not doing

**Making templates from existing deliverables.** Firms today copy last month's
deliverable and overwrite it — but "let Brio strip a finished document into a
clean template" is a different feature, and not this one. It would require
sending document contents to the model, which contradicts a published privacy
commitment, and a template that still carries one of Client A's figures and is
then used for Client B is a confidentiality breach. Out of scope.

## The page

Its own destination at firm level, beside Clients and Calendar rather than
inside Settings. Templates are something a firm works IN — uploading, renaming,
reorganising — not a preference they set once, and settings pages are where
things go to be forgotten.

It should look and behave like the engagement Files page: upload, preview,
rename, folder navigation, and the Brio panel (so "Review folder organization"
works on the template folder too, optional but free — the capability already
exists).

The document action menu is trimmed: sharing, deliverable state, due dates,
owners and the project-management submenus are all meaningless for a template.
What remains is open, preview, rename, download, delete.

### How to reuse the Files page — three options, not yet decided

`engagement-file-list.tsx` is ~3,700 lines taking ~25 engagement-shaped props,
with 55 references to `projectId`, 39 to deliverables and 72 to sharing. None
of that applies to a template. So "reuse the Files page" needs a decision about
HOW:

| | |
|---|---|
| **A. Props and flags** | Add `mode="templates"` and branch. Fastest to a working page; makes the largest component in the codebase bigger and harder to reason about, and every future Files change has to consider a mode it was not written for. |
| **B. Extract a shared shell** | Pull the file-browsing core (list, upload, navigate, preview) out of the engagement-specific parts, and have both pages use it. The right structure; a substantial refactor of a component that currently works, with real regression risk to the engagement Files page. |
| **C. A separate, simpler page** | Write a plain file browser for templates. Duplicates list/upload/preview, but a template browser needs perhaps a fifth of what the Files page does — no sharing, no deliverables, no doc ids, no agent apply flow. |

Worth measuring before choosing: how much of the Files page a template browser
actually needs. If it is a fifth, **C** is probably cheaper than **B** and
safer than **A**.

## Build

1. **Doc Templates page** at firm level: connector picker, file list, upload,
   delete. Resolves or creates `Templates` under `firmFolderId`.
2. **Selection** — given the filenames plus the engagement kind and
   description, choose which templates apply and which folder each goes in.
3. **Copy on scaffold** — through a safe-op that creates and indexes, as
   `agentCreateFolderIndexed` does for folders.
4. **Preview** — the chosen templates appear in the existing approval card
   beside the folders, each one uncheckable.

## Open

- **Will firms curate it?** The feature is inert if the folder stays empty.
  This is the one question worth asking a real user before building the page,
  and the reason this plan is not already in progress.
- **Does selection need a model call?** Engagement kind plus filenames may be
  enough deterministically. If so the scaffold stays free, which matters — it
  costs nothing today, and adding a credit cost to a setup flow is a real
  change.
- **Template placement.** Which folder a given template lands in has to survive
  a folder being renamed or unchecked during setup.
- **The document cap.** `assertWithinDocumentCap` is enforced on creation
  elsewhere; copying templates must respect it.
