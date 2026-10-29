/**
 * Due dates nest (.claude/plans/due-date-rule.md): a document can't be due after its deliverable,
 * nor a deliverable after its engagement. Compared by calendar day; approved work is left out.
 * The shapes the due-date route answers with (409 `needsResolution`), and the fixes a client sends
 * back. Client-safe: the dialog reads these too.
 */

export interface DueNamed {
    id: string
    docId: string | null
    name: string
}

export type DueConflict =
    /** A document would be due after its deliverable. */
    | { kind: 'after_deliverable'; proposed: string; document: DueNamed; deliverable: DueNamed & { due: string } }
    /** A deliverable would be due before some of its documents. */
    | { kind: 'before_documents'; proposed: string; deliverable: DueNamed; latest: DueNamed & { due: string }; count: number }
    /** A deliverable would be due after its engagement. */
    | { kind: 'after_engagement'; proposed: string; deliverable: DueNamed; engagement: { id: string; name: string; due: string } }

/** The one-click fix for each conflict, sent back in `fixes`. */
export type DueFix = 'move_deliverable' | 'pull_documents' | 'move_engagement'

export const DUE_FIXES: readonly DueFix[] = ['move_deliverable', 'pull_documents', 'move_engagement']

export const FIX_FOR: Record<DueConflict['kind'], DueFix> = {
    after_deliverable: 'move_deliverable',
    before_documents: 'pull_documents',
    after_engagement: 'move_engagement',
}

/** A due date's calendar day ("2026-11-12"), the unit the rule compares. */
export function dueDay(value: Date | string): string {
    return (typeof value === 'string' ? new Date(value) : value).toISOString().slice(0, 10)
}

/** Whether `a` falls on a later day than `b`. */
export function isLaterDay(a: Date | string, b: Date | string): boolean {
    return dueDay(a) > dueDay(b)
}

/** "QSR-16 · Plan.xlsx": how the app names a document or deliverable. */
export function dueLabel(item: DueNamed): string {
    return item.docId ? `${item.docId} · ${item.name}` : item.name
}
