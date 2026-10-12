# Folder organization: one capability, two entry points

## The problem

Two chips sit beside each other on the Files page and look like two features:

- **Set up folders** — a 4-question interview, then creates a tree.
- **Review file organization** — measures an existing tree for hygiene.

They are the same job: get this engagement's folders right. One starts from
nothing, the other from what is already there. Splitting them produced three
real defects.

### 1. The scaffold chip is a dead end on a populated engagement

`FilesScaffoldTrigger` is gated only on `!scaffoldOpen`
(`components/projects/engagement-file-list.tsx:3632`). It knows nothing about
whether folders exist. The server refuses with 409 `already-scaffolded`
(`app/api/projects/[projectId]/files-agent/scaffold/route.ts:241`), but only
**after** the user has answered four questions.

Note the server guard keys on the `.meta` **fingerprint**, not on "folders
exist". An engagement whose folders were made by hand has no fingerprint, so it
would scaffold — which is the case in the screenshot that prompted this.

### 2. Review has no business intelligence

`analyzeFiles` produces only hygiene findings — `naming-inconsistent`,
`duplicate-name`, `flat-folder`, `deep-nesting`, `loose-at-root`
(`lib/ai/files-agent/analyze.ts:37`). It reports "Nothing to fix" on a tree with
`01__`–`04__` deliverables and `Internal`, because it cannot know a GTM
engagement is missing a legal review folder. It is a linter, not an advisor.

### 3. The interview's knowledge is spent once and discarded

The 4 answers — engagement kind, review stages, working papers, numbering —
are exactly what Review would need to judge completeness. They are used at
creation and never read again.

## The shape

**One capability: get this engagement's folder structure right.**

- **Inputs:** the engagement kind (asked), and the current tree (measured —
  empty is a valid value).
- **Output:** proposals. `create-folder` for what is missing, `rename`/`move`
  for what is wrong. Both already permitted and reversible, so the existing
  approval flow covers both with no new capability.

| Starting state | Chip | Behaviour |
|---|---|---|
| No folders | **Set up folder organization** | Asks all 4 questions, proposes the whole tree |
| Folders exist | **Review folder organization** | Detects numbering/stages/papers from the tree, asks only engagement kind, proposes creates for what is missing **and** renames/moves for what is wrong |

Exactly one chip shows, gated on whether any folders exist. No unlock, no
override, no 409 dead end.

### Why no unlock

Considered and rejected. The server refuses on the fingerprint regardless, so
an unlock leads to a 409 anyway. And for the hand-made case the honest advice
is "use Review instead" — so an unlock exists only to let someone do the thing
we have just told them not to.

### Three of the four questions are observable

On an existing tree the interview mostly collapses:

- `numbering` — **detected.** `dominantSeparator` already computes this
  ("underscores (98%)"). Asking would be worse than measuring, and a mismatch
  is itself a finding.
- `reviewStages`, `workingPapers` — **detected** from folder presence.
- `engagementKind` — **not observable.** The one genuinely missing input, and
  the one that determines which folders should exist.

So Review asks one question, not four. Where a fingerprint exists it asks none:
`ScaffoldFingerprint.answers` already persists them
(`lib/connectors/pockett-structure.service.ts:80`).

## Decided: the one-scaffold guard stays

The 409 is kept, scoped to creates.

It exists for a measured reason: two runs with different answers left **13
folders from trees of 7 and 6**, because the second run could not see the first
and could not reconcile without deleting — which the agent must never do.

A merged flow *should not* have that failure mode, since it reads the tree
first and can only propose what is genuinely absent. But that depends entirely
on the missing-folder detector being right about what counts as "already
there", including near-matches (`01_Planning` / `01-Planning` / `1. Planning`).
That is exactly the kind of logic that is right in testing and wrong on a real
Drive, and the agent cannot clean up after itself. The fingerprint costs
near-nothing to keep.

**Rule:** the fingerprint records what has been created, so a later run cannot
re-propose the same folder under a different name.

## Naming

"Set up folder organization" / "Review folder organization" — the shared noun
says one capability, the verb says which starting state.

"Scaffold" was rejected: developer vocabulary for an audience of
professional-services staff.

**This renames the existing chip** from "Review **file** organization". The same
phrase appears in the Overview ring tooltip
(`components/projects/engagement-insights-dashboard.tsx:2150`) and the system
prompt. The ring and the chip are deliberately one engine — calling it two
things is how that gets forgotten — so all references move together.

## Build

### 1. Gate the chips on folder presence

`engagement-file-list.tsx` — show **Set up** only when the engagement has no
folders; otherwise show **Review**. Removes the dead-end 409.

Stands alone and is worth doing regardless of the rest.

### 2. A `missing-folder` finding

New finding kind in `lib/ai/files-agent/analyze.ts`, fed by the expected tree
that `scaffold.ts` already derives from answers. Pure and unit-testable, like
the rest of the module.

Matching must be fuzzy enough to recognise `01_Planning` as satisfying
"Planning" — the separator and numbering already vary by design. A false
negative here creates a duplicate folder, which is the failure the guard exists
to catch.

### 3. Engagement kind into Review

Read `ScaffoldFingerprint.answers` first. Ask the one question only when
absent, through the existing `AgentPromptCard` flow.

### 4. Creates in the review proposal set

Missing folders become `create-folder` proposals beside the existing
rename/move ones, through the same approval token and apply route. No new
capability.

### 5. Rename, everywhere

Chips, the Overview ring tooltip, the system prompt, and the scoring module's
own vocabulary.

## Verification

- `npx tsc --noEmit`, `npx vitest run lib/ai`
- Unit: `missing-folder` does not fire for `01_Planning` vs expected "Planning",
  nor `1. Planning`, nor `01-Planning`
- Unit: a fingerprinted engagement re-reviewed proposes no folder it already
  created
- Empty engagement → Set up chip only; populated → Review chip only
- Review on the screenshot's tree (`01__`–`04__`, `Internal`) proposes the
  missing deliverable folders for its engagement kind and nothing else
- Both providers, per the standing rule — the fork is per-provider and only one
  path gets exercised by accident

## Decided: the engagement kind gets its own `.meta` mark

Legacy engagements — folders built by hand — have no scaffold fingerprint, so
Review must ask the engagement kind on first run and save it, or it will ask
again on every run and read as amnesia.

It is saved under a **separate key**, not folded into the scaffold fingerprint.

The scaffold mark means exactly one thing: *Brio built this tree*. That is what
the 409 guard keys on. Writing it from a review would record a scaffold that
never happened — harmless today, because folders exist and the Set up chip is
hidden anyway, but a false fact for the next reader or the next feature keyed
on it.

```
.meta
  scaffold:        { at, folderCount, answers }   # Brio built this tree
  engagementKind:  { value, at, source }          # the user told us what this is
```

A scaffold run writes both. A review on a hand-built tree writes only the
second. Review reads `scaffold.answers.engagementKind` first, then
`engagementKind.value`, and asks only when neither is present.

`source` distinguishes "answered during scaffold" from "answered during review",
so a later reader can tell how much the value is worth.

---

## Next: templated documents in the scaffolded folders (decided, not built)

Nine empty folders for three questions is too thin a payoff — a user could make
them by hand in two minutes. The structure and the naming convention are real
value (the review enforces them afterwards), but as a one-time return it does
not justify the flow.

**Decision: Option B — real `.docx` / `.xlsx` / `.pptx`**, generated with a
library (`docx`, `exceljs`, `pptxgenjs`) and written through the existing
`createFile(connectionId, folderId, fileName, content: Buffer, mimeType)`,
which both adapters already implement. No new provider surface.

Rejected:
- **Markdown stubs** — trivial to produce, but a professional-services firm
  opens `01_Scope_Note.md` and sees Markdown, not a document.
- **Native provider documents** (a Google Doc / Word Online file) — cleanest
  result and no dependency, but the creation call differs per provider and the
  template-content problem remains either way.

### The model picks the documents, not a fixed list

Corrected: asking which three or four templates to ship is the same mistake as
the four hard-coded engagement kinds. A GTM engagement, an audit and a platform
build do not want one shared set of stubs, and no list written in advance is
right for the next kind of work a firm takes on. **That judgement is the whole
reason this is AI-driven.**

So the model proposes the documents, from what it already knows about the
engagement — the kind, and the description, tags and contract type that now
reach it. The folder tree stays deterministic (`buildScaffold`); the documents
are a proposal, approved the same way every other agent change is.

That makes this a genuine agent capability rather than a template library, and
it inherits the existing boundary: proposals are previewed, each is approved,
and nothing is written without a signed token.

Still true regardless of who chooses: a document in every folder is clutter,
and it would make the review's own "empty folder" and "single file for its
whole life" findings fire on the scaffold's own output. A small number of
documents the firm will actually fill in is the target.

### Open for tomorrow
- **How much structure a generated document gets.** The model names the file
  and its purpose; something has to turn that into real `.docx` / `.xlsx`
  content. A heading skeleton from the model is one option; a generic shell
  (title, date, engagement name, empty sections) is another and costs no
  tokens. Worth deciding before picking the library's API surface.
- **Credits.** The scaffold costs nothing today — the tree is computed, not
  generated. Proposing documents is a model call, so the flow acquires a cost
  it did not have, and the estimate shown before the run must say so.
- **The document cap.** `assertWithinDocumentCap` is enforced on creation
  elsewhere; a scaffold that creates files must respect it.
- `PERMITTED_AGENT_OPERATIONS` is `rename`, `move`, `create-folder`. Creating
  files is a new capability and must be added there deliberately, with the
  reversibility argument made explicitly — a created file is not destructive,
  but it is not nothing either.
