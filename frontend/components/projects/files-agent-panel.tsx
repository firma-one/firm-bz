'use client'

import { useCallback, useState } from 'react'
import { Loader2, Check, X, Sparkles, FolderPlus, PenLine, FolderInput } from 'lucide-react'
import { Brio } from '@/components/ui/brio'
import { useToast } from '@/components/ui/toast'
import type { Proposal } from '@/lib/ai/files-agent/tools'

/**
 * Review and approval for agent-proposed file changes.
 *
 * ## Every change is confirmed before it happens
 *
 * The panel never applies anything on its own. It renders each proposal as a before/after line the
 * lead can read in a second, ticked by default but individually removable, and applies only what
 * survives that pass. This is the whole safety model made visible: the agent's output is a
 * suggestion until a person says otherwise.
 *
 * Partial approval is expected rather than exceptional, which is why the approval token signs each
 * proposal separately — unticking two of twelve must not invalidate the rest.
 */

interface Finding {
    kind: string
    fileCount: number
    files: Array<{ externalId: string; fileName: string; docId: string | null }>
}

interface ReviewData {
    findings: Finding[]
    proposals: Proposal[]
    token: string | null
    nodeCount: number
    creditsSpent: number
    dropped: number
    truncated: boolean
    estimate: number
}

const FINDING_LABEL: Record<string, string> = {
    'naming-inconsistent': 'Inconsistent naming',
    'duplicate-name': 'Possible duplicates',
    'flat-folder': 'Crowded folder',
    'deep-nesting': 'Deeply nested files',
    'loose-at-root': 'Files outside any folder',
}

/** A stable key for a proposal, since proposals have no id of their own. */
function proposalKey(p: Proposal): string {
    return p.kind === 'rename' ? `r:${p.externalId}`
        : p.kind === 'move' ? `m:${p.externalId}`
        : `f:${p.parentId ?? 'root'}:${p.name}`
}

function ProposalRow({ proposal }: { proposal: Proposal }) {
    if (proposal.kind === 'rename') {
        return (
            <div className="min-w-0">
                <div className="flex items-start gap-1.5">
                    <PenLine className="mt-0.5 h-3 w-3 shrink-0 text-gray-400" aria-hidden />
                    <div className="min-w-0">
                        <span className="text-gray-400 line-through">{proposal.currentName}</span>
                        <span className="mx-1 text-gray-300">→</span>
                        <span className="font-medium text-gray-900">{proposal.proposedName}</span>
                    </div>
                </div>
                <p className="ml-4.5 pl-0.5 text-[10px] text-gray-400">{proposal.reason}</p>
            </div>
        )
    }

    if (proposal.kind === 'move') {
        return (
            <div className="min-w-0">
                <div className="flex items-start gap-1.5">
                    <FolderInput className="mt-0.5 h-3 w-3 shrink-0 text-gray-400" aria-hidden />
                    <div className="min-w-0">
                        <span className="font-medium text-gray-900">{proposal.fileName}</span>
                        <span className="mx-1 text-gray-300">→</span>
                        <span className="text-gray-600">{proposal.destinationName}</span>
                    </div>
                </div>
                <p className="ml-4.5 pl-0.5 text-[10px] text-gray-400">{proposal.reason}</p>
            </div>
        )
    }

    return (
        <div className="min-w-0">
            <div className="flex items-start gap-1.5">
                <FolderPlus className="mt-0.5 h-3 w-3 shrink-0 text-gray-400" aria-hidden />
                <span className="font-medium text-gray-900">New folder: {proposal.name}</span>
            </div>
            <p className="ml-4.5 pl-0.5 text-[10px] text-gray-400">{proposal.reason}</p>
        </div>
    )
}

export function FilesAgentPanel({
    projectId,
    onApplied,
}: {
    projectId: string
    /** Called after a successful apply so the file list can refresh. */
    onApplied?: () => void
}) {
    const [state, setState] = useState<'idle' | 'reviewing' | 'applying'>('idle')
    const [review, setReview] = useState<ReviewData | null>(null)
    const [excluded, setExcluded] = useState<Set<string>>(new Set())
    const [error, setError] = useState<string | null>(null)
    const { addToast } = useToast()

    const runReview = useCallback(async () => {
        setState('reviewing')
        setError(null)
        setExcluded(new Set())
        try {
            const res = await fetch(`/api/projects/${projectId}/files-agent`, { method: 'POST' })
            const body = await res.json().catch(() => ({}))
            if (!res.ok) {
                setError(body.error ?? 'Could not review the files')
                return
            }
            setReview(body.data)
        } catch {
            setError('Could not review the files')
        } finally {
            setState('idle')
        }
    }, [projectId])

    const toggle = useCallback((key: string) => {
        setExcluded((prev) => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }, [])

    const apply = useCallback(async () => {
        if (!review?.token) return
        const approved = review.proposals.filter((p) => !excluded.has(proposalKey(p)))
        if (approved.length === 0) return

        setState('applying')
        try {
            const res = await fetch(`/api/projects/${projectId}/files-agent/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: review.token, proposals: approved }),
            })
            const body = await res.json().catch(() => ({}))
            if (!res.ok) {
                addToast({ type: 'error', title: 'Could not apply', message: body.error ?? 'Please try again.' })
                return
            }

            const { applied, failed } = body.data
            addToast({
                type: failed > 0 ? 'warning' : 'success',
                title: failed > 0 ? `Applied ${applied}, ${failed} failed` : `Applied ${applied} change${applied === 1 ? '' : 's'}`,
                message: failed > 0
                    ? 'The rest were applied. Run the review again to retry.'
                    : 'Recorded in the audit trail as Brio PMO.',
            })

            // The token is spent whatever the outcome, so the review is over either way.
            setReview(null)
            onApplied?.()
        } catch {
            addToast({ type: 'error', title: 'Could not apply', message: 'Please try again.' })
        } finally {
            setState('idle')
        }
    }, [projectId, review, excluded, addToast, onApplied])

    if (!review) {
        return (
            <div className="space-y-2">
                <p className="text-xs text-gray-500">
                    <Brio /> can check this engagement&apos;s files for inconsistent naming,
                    duplicates and files in the wrong place — then propose fixes for you to approve.
                </p>
                {error && <p className="text-xs text-red-600">{error}</p>}
                <button
                    type="button"
                    onClick={() => void runReview()}
                    disabled={state === 'reviewing'}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:brightness-105 disabled:opacity-60"
                >
                    {state === 'reviewing'
                        ? <><Loader2 className="h-3 w-3 animate-spin" /> Reviewing…</>
                        : <><Sparkles className="h-3 w-3" /> Review file organisation</>}
                </button>
            </div>
        )
    }

    const approvedCount = review.proposals.filter((p) => !excluded.has(proposalKey(p))).length

    return (
        <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs text-gray-600">
                    {review.proposals.length === 0
                        ? `Checked ${review.nodeCount} files — nothing to fix.`
                        : `${review.proposals.length} proposed change${review.proposals.length === 1 ? '' : 's'} across ${review.nodeCount} files.`}
                </p>
                <button
                    type="button"
                    onClick={() => setReview(null)}
                    className="shrink-0 text-[10px] text-gray-400 underline underline-offset-2 hover:text-gray-700"
                >
                    Dismiss
                </button>
            </div>

            {/* Findings with no proposal still matter — a crowded folder is worth knowing about
                even when the agent has no safe fix for it. */}
            {review.proposals.length === 0 && review.findings.length > 0 && (
                <ul className="space-y-1">
                    {review.findings.map((f, i) => (
                        <li key={i} className="text-xs text-gray-600">
                            {FINDING_LABEL[f.kind] ?? f.kind} — {f.fileCount} file{f.fileCount === 1 ? '' : 's'}
                        </li>
                    ))}
                </ul>
            )}

            {review.proposals.length > 0 && (
                <>
                    <ul className="hover-scrollbar max-h-72 space-y-1.5 overflow-y-auto pr-1">
                        {review.proposals.map((p) => {
                            const key = proposalKey(p)
                            const on = !excluded.has(key)
                            return (
                                <li key={key}>
                                    <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-xs transition-colors hover:bg-gray-50">
                                        <input
                                            type="checkbox"
                                            checked={on}
                                            onChange={() => toggle(key)}
                                            className="mt-0.5 h-3 w-3 shrink-0 accent-[hsl(var(--primary))]"
                                        />
                                        <span className={on ? '' : 'opacity-40'}>
                                            <ProposalRow proposal={p} />
                                        </span>
                                    </label>
                                </li>
                            )
                        })}
                    </ul>

                    {/* Stated plainly: these are the user's own files in their own Drive, and the
                        agent is about to change them. */}
                    <p className="text-[10px] text-gray-400">
                        Changes apply to your Drive and are recorded in the audit trail as Brio PMO.
                        Renames and moves can be undone from your storage provider.
                    </p>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => void apply()}
                            disabled={state === 'applying' || approvedCount === 0}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:brightness-105 disabled:bg-gray-100 disabled:text-gray-400"
                        >
                            {state === 'applying'
                                ? <><Loader2 className="h-3 w-3 animate-spin" /> Applying…</>
                                : <><Check className="h-3 w-3" /> Apply {approvedCount} change{approvedCount === 1 ? '' : 's'}</>}
                        </button>
                        <button
                            type="button"
                            onClick={() => setExcluded(new Set(review.proposals.map(proposalKey)))}
                            className="inline-flex items-center gap-1 text-[10px] text-gray-400 transition-colors hover:text-gray-700"
                        >
                            <X className="h-3 w-3" /> Deselect all
                        </button>
                    </div>
                </>
            )}

            {review.dropped > 0 && (
                <p className="text-[10px] text-gray-400">
                    {review.dropped} suggestion{review.dropped === 1 ? '' : 's'} discarded as unsafe.
                </p>
            )}
        </div>
    )
}
