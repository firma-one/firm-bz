# Due dates: a document can't be due after its deliverable, nor a deliverable after its engagement

Agreed with Deepak 2026-10-29. A deliverable's due date stays **manual**: it's the promise to the
client, and the documents' dates are the plan for keeping it. Deriving it from the documents was
rejected: it would float as documents are added or re-dated, silently moving reminders, overdue
alerts and what the client sees.

## The rule

- A document's due date can't be **after** its deliverable's.
- A deliverable's due date can't be **after** its engagement's.
- Compared by calendar day: a document due 5 PM on its deliverable's due day is fine.
- **Approved** documents and deliverables are left out: they're finished, so their dates no longer
  constrain anything.
- A deliverable with no due date doesn't constrain its documents. An engagement with none doesn't
  constrain its deliverables.

## Enforced, with one-click fixes

The due-date route (`documents/[id]/due-date`, every document and deliverable date) answers **409
`needsResolution`** when a change would break the rule, and the client asks with two fixes:

| The change | Fix (primary) | Or |
|---|---|---|
| A document later than its deliverable | Move the deliverable to that day (`move_deliverable`) | Keep the document on the deliverable's day |
| A deliverable earlier than its documents | Move those documents to that day (`pull_documents`) | Keep the deliverable on its latest document's day |
| A deliverable later than the engagement | Move the engagement to that day (`move_engagement`) | Keep the deliverable on the engagement's day |

The client resends with the chosen fix in `fixes`; fixes accumulate, so moving a deliverable that
would then pass the engagement asks once more. A fix's own writes go through the same path as a
direct edit (notifications, reminders).

The engagement's own due date (`updateEngagement`) is refused when it would fall before one of its
deliverables, naming that deliverable.

## Existing conflicts

Data from before this can break the rule. The deliverable pane flags it in amber on the
deliverable's Due ("QSR-16 is due after this") and on the documents due after it, rather than
fixing it silently.

## /tour

The tour's Files list applies the same rule to the dates set there.

## Built (2026-10-29)

- `lib/files/due-date-rule.ts` (shapes, fixes, day comparison), `lib/files/due-date-check.ts`
  (`planDueDate`, `deliverableDueAfter`), the due-date route (409 `needsResolution`, fixes applied
  through the same notifications and reminders), `updateEngagement` (refuses a date before a
  deliverable), `components/files/use-due-date-save.tsx` (the dialog), used by the Files Due cell,
  the row menu's Due, the Details pane and the deliverable pane. /tour's Files list applies the rule.
- The dialog ignores focus leaving it (`ConfirmDialog ignoreFocusOutside`): it opens as a date
  picker closes, and the picker's focus hand-back would otherwise cancel it.
- Gap: the engagement's refusal is a thrown error from a server action. In development its message
  shows in the toast; production builds may replace a server action's message with a generic one, as
  they do for the existing "Cannot update a completed engagement." There's no one-click fix there yet.
