'use client'

import React from 'react'
import { Eye, CheckCircle2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { statusOf } from '@/lib/ui/status'
import { failureReason } from '@/lib/files/action-failure'
import type { ActivityStatus } from '@/lib/sharing-settings'

/**
 * Moving a document's stage, and agreeing first when its deliverable would follow somewhere that
 * matters (.claude/plans/deliverable-stages-blocked.md, section 2): the stage route answers 409 with
 * `needsConfirmation` when the deliverable would be shown to clients for the first time or approved,
 * and this asks, then resends with `confirm: true`.
 *
 * Used wherever a document's stage changes: the Files Status cell, the Details pane, the deliverable
 * pane's documents, and a client's action on a whole deliverable. Marking a document internal only asks
 * the same way, since what's internal only doesn't count toward its deliverable's stage.
 */

export interface StageConfirmation {
    deliverable: { id: string; docId?: string | null; name: string }
    from: ActivityStatus
    to: ActivityStatus
    /** How many external contributors would newly see its documents. */
    externalCollaborators: number
    /** How many reviewers would newly see its documents. */
    viewers: number
    approves: boolean
}

/**
 * A move's answer. `warning` is "done, but…": the move stood and part of it couldn't be done (its
 * deliverable stayed, storage refused part of an approval). `code` names a refusal the caller may
 * title differently: `approval_storage` and `approval_not_recorded` (the approval was refused or put
 * back), `stage_access` (clients couldn't be given access, so nothing moved).
 */
export type StageMoveResult =
    | { ok: true; deliverable: { id: string; status: ActivityStatus } | null; warning?: string }
    | { ok: false; cancelled: true }
    | { ok: false; cancelled?: false; error: string; code?: string }

/** The toast title for a refused move: an approval says so, everything else is the stage. */
export function stageFailureTitle(result: { code?: string }, to?: ActivityStatus): string {
    if (result.code === 'approval_storage' || result.code === 'approval_not_recorded' || to === 'approved') return "Couldn't approve"
    return "Couldn't change the stage"
}

/** The title for a move that stood: shown on a warning toast when part of it couldn't be done. */
export function stageDoneTitle(to?: ActivityStatus): string {
    return to === 'approved' ? 'Approved' : 'Stage updated'
}

async function patchStage(projectId: string, documentId: string, status: ActivityStatus, confirm: boolean) {
    const { getSession } = await import('@/lib/supabase')
    const session = await getSession()
    return fetch(`/api/projects/${projectId}/documents/${encodeURIComponent(documentId)}/sharing/activity`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ status, ...(confirm ? { confirm: true } : {}) }),
    })
}

export function useStageMove() {
    const [pending, setPending] = React.useState<{ confirmation: StageConfirmation; answer: (yes: boolean) => void } | null>(null)
    const [sending, setSending] = React.useState(false)

    /** Sends a request that may answer 409 `needsConfirmation`, asks, and resends with `confirm` when agreed. */
    const send = React.useCallback(async (request: (confirm: boolean) => Promise<Response>): Promise<StageMoveResult> => {
        // A request that never got there (or a session lookup that threw) is the reason itself.
        let dropped: unknown = null
        const attempt = (confirm: boolean) => request(confirm).catch((e: unknown) => { dropped = e; return null })
        let res = await attempt(false)
        let data = await res?.json().catch(() => ({}))
        if (res?.status === 409 && data?.needsConfirmation) {
            const yes = await new Promise<boolean>((answer) => setPending({ confirmation: data.needsConfirmation, answer }))
            if (!yes) return { ok: false, cancelled: true }
            setSending(true)
            try {
                res = await attempt(true)
                data = await res?.json().catch(() => ({}))
            } finally {
                setSending(false)
                setPending(null)
            }
        }
        if (!res) return { ok: false, error: failureReason(dropped ?? new TypeError('fetch failed')) }
        if (!res.ok) {
            return {
                ok: false,
                error: typeof data?.error === 'string' && data.error ? data.error : `The server answered ${res.status}. Try again.`,
                ...(typeof data?.code === 'string' ? { code: data.code } : {}),
            }
        }
        return {
            ok: true,
            deliverable: data?.deliverable ?? null,
            ...(typeof data?.warning === 'string' && data.warning ? { warning: data.warning } : {}),
        }
    }, [])

    const move = React.useCallback(
        (projectId: string, documentId: string, status: ActivityStatus) => send((confirm) => patchStage(projectId, documentId, status, confirm)),
        [send],
    )

    const dialog = (
        <StageConfirmDialog
            confirmation={pending?.confirmation ?? null}
            loading={sending}
            onOpenChange={(open) => { if (!open && !sending) { pending?.answer(false); setPending(null) } }}
            onCancel={() => { pending?.answer(false); setPending(null) }}
            onConfirm={() => pending?.answer(true)}
        />
    )

    return { move, send, dialog }
}

/** The question itself, shared with /tour's Files (components/demo/demo-file-list.tsx). */
export function StageConfirmDialog({ confirmation, loading, onOpenChange, onCancel, onConfirm }: {
    confirmation: StageConfirmation | null
    loading?: boolean
    onOpenChange: (open: boolean) => void
    onCancel: () => void
    onConfirm: () => void
}) {
    // The last question asked, so its words stay while the dialog fades out after an answer.
    const shownRef = React.useRef(confirmation)
    if (confirmation) shownRef.current = confirmation
    const shown = confirmation ?? shownRef.current
    return (
        <ConfirmDialog
            open={!!confirmation}
            onOpenChange={onOpenChange}
            icon={shown?.approves ? <CheckCircle2 /> : <Eye />}
            iconVariant={shown?.approves ? 'primary' : 'amber'}
            title={shown?.approves ? 'Approve the deliverable?' : (whoSees(shown ?? undefined) ? `Share its documents with ${whoSees(shown ?? undefined)}?` : 'Share its documents?')}
            subtitle={shown ? `${deliverableLabel(shown)} moves to ${statusOf('deliverable', shown.to).label}` : undefined}
            description={shown ? <StageConfirmationText confirmation={shown} /> : ''}
            confirmLabel={shown?.approves ? 'Approve' : 'Move and share'}
            confirmVariant="primary"
            loading={loading}
            onCancel={onCancel}
            onConfirm={onConfirm}
        />
    )
}

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * Who the move newly lets in. Limited Access contributors and Reviewers see a deliverable's card on the
 * Board from the moment it's promoted; what a forward move opens to them is its documents (and its folder
 * in Files): In progress for Limited Access contributors, In review for Reviewers.
 */
const whoSees = (confirmation: StageConfirmation | undefined): string => {
    const count = (n: number | undefined, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : null)
    return [
        count(confirmation?.externalCollaborators, 'Limited Access contributor', 'Limited Access contributors'),
        count(confirmation?.viewers, 'Reviewer', 'Reviewers'),
    ].filter(Boolean).join(' and ')
}

/** The deliverable as the app names it everywhere: its Doc ID, then its name ("QSR-9 · Market report"). */
const deliverableLabel = (confirmation: StageConfirmation) =>
    confirmation.deliverable.docId ? `${confirmation.deliverable.docId} · ${confirmation.deliverable.name}` : confirmation.deliverable.name

export function StageConfirmationText({ confirmation }: { confirmation: StageConfirmation }) {
    const who = confirmation.externalCollaborators > 0 || confirmation.viewers > 0 ? whoSees(confirmation) : null
    const one = confirmation.externalCollaborators + confirmation.viewers === 1
    return (
        <div className="space-y-2">
            <p>
                A deliverable follows its documents, so this takes{' '}
                <span className="font-semibold text-fg">{deliverableLabel(confirmation)}</span> to{' '}
                {statusOf('deliverable', confirmation.to).label}.
            </p>
            {who && <p>{sentence(who)} already {one ? 'sees' : 'see'} the deliverable. From then on they&apos;ll see its documents too.</p>}
            {confirmation.approves && <p>Approving locks it: its documents can no longer change stage.</p>}
        </div>
    )
}
