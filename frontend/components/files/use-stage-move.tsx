'use client'

import React from 'react'
import { Eye, CheckCircle2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { statusOf } from '@/lib/ui/status'
import type { ActivityStatus } from '@/lib/sharing-settings'

/**
 * Moving a document's stage, and agreeing first when its deliverable would follow somewhere that
 * matters (.claude/plans/deliverable-stages-blocked.md, section 2): the stage route answers 409 with
 * `needsConfirmation` when the deliverable would be shown to clients for the first time or approved,
 * and this asks, then resends with `confirm: true`.
 *
 * Used wherever a document's stage changes: the Files Status cell, the Details pane, the deliverable
 * pane's documents, and a client's action on a whole deliverable.
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

export type StageMoveResult =
    | { ok: true; deliverable: { id: string; status: ActivityStatus } | null }
    | { ok: false; cancelled: true }
    | { ok: false; cancelled?: false; error: string }

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

    const move = React.useCallback(async (projectId: string, documentId: string, status: ActivityStatus): Promise<StageMoveResult> => {
        let res = await patchStage(projectId, documentId, status, false).catch(() => null)
        let data = await res?.json().catch(() => ({}))
        if (res?.status === 409 && data?.needsConfirmation) {
            const yes = await new Promise<boolean>((answer) => setPending({ confirmation: data.needsConfirmation, answer }))
            if (!yes) return { ok: false, cancelled: true }
            setSending(true)
            try {
                res = await patchStage(projectId, documentId, status, true).catch(() => null)
                data = await res?.json().catch(() => ({}))
            } finally {
                setSending(false)
                setPending(null)
            }
        }
        if (!res?.ok) return { ok: false, error: data?.error ?? 'Please try again.' }
        return { ok: true, deliverable: data?.deliverable ?? null }
    }, [])

    const confirmation = pending?.confirmation
    const dialog = (
        <ConfirmDialog
            open={!!pending}
            onOpenChange={(open) => { if (!open && !sending) { pending?.answer(false); setPending(null) } }}
            icon={confirmation?.approves ? <CheckCircle2 /> : <Eye />}
            iconVariant={confirmation?.approves ? 'primary' : 'amber'}
            title={confirmation?.approves ? 'Approve the deliverable?' : `Share its documents with ${whoSees(confirmation)}?`}
            subtitle={confirmation ? `${deliverableLabel(confirmation)} moves to ${statusOf('deliverable', confirmation.to).label}` : undefined}
            description={confirmation ? <StageConfirmationText confirmation={confirmation} /> : ''}
            confirmLabel={confirmation?.approves ? 'Approve' : 'Move and share'}
            confirmVariant="primary"
            loading={sending}
            onCancel={() => { pending?.answer(false); setPending(null) }}
            onConfirm={() => pending?.answer(true)}
        />
    )

    return { move, dialog }
}

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * Who the move newly lets in. A client sees a deliverable's card on the Board from the moment it's
 * promoted; what a forward move opens to them is its documents (and its folder in Files):
 * In progress for external contributors, In review for reviewers.
 */
const whoSees = (confirmation: StageConfirmation | undefined): string => {
    const count = (n: number | undefined, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : null)
    return [
        count(confirmation?.externalCollaborators, 'external contributor', 'external contributors'),
        count(confirmation?.viewers, 'reviewer', 'reviewers'),
    ].filter(Boolean).join(' and ') || 'the client'
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
                A deliverable follows its documents, so this move takes{' '}
                <span className="font-semibold text-fg">{deliverableLabel(confirmation)}</span> to{' '}
                {statusOf('deliverable', confirmation.to).label}.
            </p>
            {who && <p>{sentence(who)} already {one ? 'sees' : 'see'} the deliverable. From then on they&apos;ll see its documents too.</p>}
            {confirmation.approves && <p>Approving locks it: its documents can no longer change stage.</p>}
        </div>
    )
}
