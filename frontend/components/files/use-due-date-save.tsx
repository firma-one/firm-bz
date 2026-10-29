'use client'

import React from 'react'
import { CalendarClock } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { formatFullDate } from '@/lib/utils'
import { FIX_FOR, dueLabel, type DueConflict, type DueFix } from '@/lib/files/due-date-rule'

/**
 * Saving a due date under the rule (.claude/plans/due-date-rule.md): a document no later than its
 * deliverable, a deliverable no later than its engagement. When the due-date route answers 409
 * `needsResolution`, this asks with the two one-click fixes and resends; closing the dialog cancels.
 *
 * Used by every due-date editor: the Files Due cell and row menu, the Details pane, and the
 * deliverable pane's own Due and its documents'.
 */

export type DueSaveResult =
    | { ok: true; dueDate: string | null; alsoChanged: { id: string; dueDate: string }[]; engagementDueDate: string | null }
    | { ok: false; cancelled: true }
    | { ok: false; cancelled?: false; error: string }

type Choice = 'fix' | 'alternative' | 'cancel'

/** The date "Or" keeps: the limit the conflict is about. */
function alternativeDate(conflict: DueConflict): string {
    switch (conflict.kind) {
        case 'after_deliverable': return conflict.deliverable.due
        case 'before_documents': return conflict.latest.due
        case 'after_engagement': return conflict.engagement.due
    }
}

async function patchDue(projectId: string, documentId: string, dueDate: string | null, fixes: DueFix[]) {
    const { getSession } = await import('@/lib/supabase')
    const session = await getSession()
    return fetch(`/api/projects/${projectId}/documents/${encodeURIComponent(documentId)}/due-date`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ dueDate, ...(fixes.length > 0 ? { fixes } : {}) }),
    })
}

export function useDueDateSave() {
    const [pending, setPending] = React.useState<{ conflict: DueConflict; answer: (choice: Choice) => void } | null>(null)

    const save = React.useCallback(async (projectId: string, documentId: string, dueDate: string | null): Promise<DueSaveResult> => {
        let value = dueDate
        const fixes: DueFix[] = []
        // A fix can lead to one more conflict (moving a deliverable past its engagement): ask again.
        for (let round = 0; round < 4; round++) {
            const res = await patchDue(projectId, documentId, value, fixes).catch(() => null)
            const data = await res?.json().catch(() => ({}))
            if (res?.status === 409 && data?.needsResolution) {
                const conflict = data.needsResolution as DueConflict
                const choice = await new Promise<Choice>((answer) => setPending({ conflict, answer }))
                setPending(null)
                if (choice === 'cancel') return { ok: false, cancelled: true }
                if (choice === 'fix') fixes.push(FIX_FOR[conflict.kind])
                else value = alternativeDate(conflict)
                continue
            }
            if (!res?.ok) return { ok: false, error: data?.error ?? 'Failed to update due date' }
            return { ok: true, dueDate: data?.dueDate ?? value, alsoChanged: data?.alsoChanged ?? [], engagementDueDate: data?.engagementDueDate ?? null }
        }
        return { ok: false, error: 'Failed to update due date' }
    }, [])

    const conflict = pending?.conflict
    const text = conflict ? conflictText(conflict) : null
    const dialog = (
        <ConfirmDialog
            open={!!pending}
            onOpenChange={(open) => { if (!open) pending?.answer('cancel') }}
            icon={<CalendarClock />}
            iconVariant="amber"
            title={text?.title ?? ''}
            subtitle={text?.subtitle}
            description={text?.body ?? ''}
            confirmLabel={text?.fix}
            cancelLabel={text?.alternative}
            confirmVariant="primary"
            onConfirm={() => pending?.answer('fix')}
            onCancel={() => pending?.answer('alternative')}
            // Opened as a date picker closes: its focus hand-back mustn't cancel the question.
            ignoreFocusOutside
            wide
        />
    )

    return { save, dialog }
}

const day = (iso: string) => formatFullDate(iso)

/** A button's date: "Nov 12", with the year only when it isn't this one. */
const shortDay = (iso: string) => {
    const d = new Date(iso)
    const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear()
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }), timeZone: 'UTC' })
}

/** What the dialog says for each conflict, and its two choices: the fix, and keeping the limit. */
export function conflictText(conflict: DueConflict): { title: string; subtitle: string; body: React.ReactNode; fix: string; alternative: string } {
    switch (conflict.kind) {
        case 'after_deliverable': {
            const doc = conflict.document.docId ?? 'This document'
            return {
                title: 'Due after its deliverable',
                subtitle: `${dueLabel(conflict.document)} · ${day(conflict.proposed)}`,
                body: (
                    <p>
                        <span className="font-semibold text-fg">{dueLabel(conflict.deliverable)}</span> is due {day(conflict.deliverable.due)}.
                        A document can&apos;t be due after its deliverable.
                    </p>
                ),
                fix: `Move the deliverable to ${shortDay(conflict.proposed)}`,
                alternative: `Keep ${doc} on ${shortDay(conflict.deliverable.due)}`,
            }
        }
        case 'before_documents': {
            const more = conflict.count - 1
            return {
                title: 'Its documents are due later',
                subtitle: `${dueLabel(conflict.deliverable)} · ${day(conflict.proposed)}`,
                body: (
                    <p>
                        <span className="font-semibold text-fg">{dueLabel(conflict.latest)}</span> is due {day(conflict.latest.due)}
                        {more > 0 ? `, and ${more} more document${more === 1 ? '' : 's'} after ${day(conflict.proposed)}` : ''}.
                        A deliverable can&apos;t be due before its documents.
                    </p>
                ),
                fix: conflict.count === 1 ? `Move it to ${shortDay(conflict.proposed)}` : `Move them to ${shortDay(conflict.proposed)}`,
                alternative: `Keep the deliverable on ${shortDay(conflict.latest.due)}`,
            }
        }
        case 'after_engagement':
            return {
                title: 'Due after the engagement',
                subtitle: `${dueLabel(conflict.deliverable)} · ${day(conflict.proposed)}`,
                body: (
                    <p>
                        <span className="font-semibold text-fg">{conflict.engagement.name}</span> is due {day(conflict.engagement.due)}.
                        A deliverable can&apos;t be due after its engagement.
                    </p>
                ),
                fix: `Move the engagement to ${shortDay(conflict.proposed)}`,
                alternative: `Keep it on ${shortDay(conflict.engagement.due)}`,
            }
    }
}
