'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Check, X, FolderTree, ChevronRight } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/lib/auth-context'
import { AgentPromptCard } from '@/components/ui/agent-prompt-card'
import { ElapsedTime } from '@/components/ui/elapsed-time'
import {
    SCAFFOLD_QUESTIONS, buildScaffold, flattenScaffold, unusedAnswers,
    type ScaffoldAnswers, type ScaffoldQuestionId,
} from '@/lib/ai/files-agent/scaffold'

/**
 * The folder-structure interview, asked one question at a time.
 *
 * Same card as every other agent confirmation: a question, numbered options, skip. The interview is
 * a sequence of ordinary questions, so it uses the ordinary pattern rather than a bespoke wizard —
 * which is the point of having the pattern at all.
 *
 * Costs no credits. The questions are fixed and the tree is computed, so nothing here reaches a
 * model; see `lib/ai/files-agent/scaffold.ts`.
 */
export function FilesScaffoldPanel({
    projectId,
    open,
    onClose,
    onCreated,
}: {
    projectId: string
    open: boolean
    onClose: () => void
    /** Called after folders are created, so the file list can refresh. */
    onCreated?: () => void
}) {
    const { session } = useAuth()
    const token = session?.access_token
    const { addToast } = useToast()

    const [answers, setAnswers] = useState<ScaffoldAnswers>({})
    const [creating, setCreating] = useState(false)

    const answer = useCallback((id: ScaffoldQuestionId, value: string) => {
        setAnswers((prev) => ({ ...prev, [id]: value }))
    }, [])

    // The first unanswered question. Everything before it stays visible as a record of what was
    // chosen; nothing after it is shown, because a later question may read differently once an
    // earlier one is settled.
    const pendingIndex = SCAFFOLD_QUESTIONS.findIndex((q) => !(q.id in answers))
    const complete = pendingIndex === -1

    const preview = useMemo(
        () => (complete ? flattenScaffold(buildScaffold(answers)) : []),
        [complete, answers],
    )

    /**
     * The server's approval token for the tree being previewed.
     *
     * Creating folders changes the state of a client's Drive, so it goes through the same
     * confirmation the file review does: the server signs the exact folders it showed, and refuses
     * to create a tree it never showed. Fetched once the answers are complete, which is also when
     * the preview appears — the user never waits on it.
     */
    const [approval, setApproval] = useState<string | null>(null)
    /** A previous run, if this engagement has been scaffolded before. Advisory only. */
    const [previousRun, setPreviousRun] = useState<{ at: string; folderCount: number } | null>(null)
    useEffect(() => {
        // Runs as soon as the panel OPENS, not only once the answers are complete: a structure
        // that already exists should stop the interview before the first question, not after the
        // fifth. The token is only minted once there is a tree to sign, so an early call returns
        // the previous run and a null token, which is exactly what is wanted here.
        if (!open || !token) { setApproval(null); return }
        let cancelled = false
        fetch(
            `/api/projects/${projectId}/files-agent/scaffold?answers=${encodeURIComponent(JSON.stringify(answers))}`,
            { headers: { Authorization: `Bearer ${token}` }, credentials: 'include' },
        )
            .then((res) => (res.ok ? res.json() : null))
            .then((body) => {
                if (cancelled) return
                setApproval(body?.data?.token ?? null)
                setPreviousRun(body?.data?.previousRun ?? null)
            })
            .catch(() => { if (!cancelled) setApproval(null) })
        return () => { cancelled = true }
    }, [open, complete, answers, projectId, token])

    /** Typed answers the tree builder could not act on — surfaced rather than dropped. */
    const unused = useMemo(() => (complete ? unusedAnswers(answers) : []), [complete, answers])

    const create = useCallback(async () => {
        if (!token) {
            addToast({ type: 'error', title: 'Session expired', message: 'Reload the page and try again.' })
            return
        }
        setCreating(true)
        try {
            const res = await fetch(`/api/projects/${projectId}/files-agent/scaffold`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                credentials: 'include',
                body: JSON.stringify({ answers, token: approval }),
            })
            const body = await res.json().catch(() => ({}))
            if (!res.ok) {
                addToast({ type: 'error', title: 'Could not create folders', message: body.error ?? 'Please try again.' })
                return
            }
            const { created, failed } = body.data
            addToast({
                type: failed > 0 ? 'warning' : 'success',
                title: failed > 0 ? `Created ${created}, ${failed} failed` : `Created ${created} folders`,
                message: 'Recorded in the audit trail as Brio, your Executive Assistant.',
            })
            setAnswers({})
            onClose()
            onCreated?.()
        } catch {
            addToast({ type: 'error', title: 'Could not create folders', message: 'Please try again.' })
        } finally {
            setCreating(false)
        }
    }, [projectId, token, answers, approval, addToast, onClose, onCreated])

    if (!open) return null

    // Already scaffolded: say so instead of asking five questions and refusing at the end.
    //
    // The server refuses too — this is the courtesy, not the control. A second run with different
    // answers would leave both structures side by side, and tidying that up would mean deleting
    // folders, which the agent never does.
    if (previousRun) {
        return (
            <div className="rounded-xl border border-gray-200 bg-white px-3.5 py-3">
                <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 font-headline text-[13px] leading-snug text-gray-900">
                        This engagement already has a folder structure.
                    </p>
                    <button
                        type="button"
                        onClick={onClose}
                        className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                        aria-label="Close"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
                    Set up on {new Date(previousRun.at).toLocaleDateString(undefined, {
                        day: 'numeric', month: 'short', year: 'numeric',
                    })}
                    {previousRun.folderCount > 0 && `, ${previousRun.folderCount} folders`}.
                    Brio sets one up once — add or rename folders yourself from the file list, or
                    ask Brio to review how the existing structure is organized.
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-2">
            {SCAFFOLD_QUESTIONS.map((q, i) => {
                // One question on screen at a time — see the agent panel for why.
                if (i !== pendingIndex) return null
                return (
                    <AgentPromptCard
                        key={q.id}
                        question={q.question}
                        options={q.options}
                        step={i + 1}
                        stepCount={SCAFFOLD_QUESTIONS.length}
                        answer={answers[q.id] ?? undefined}
                        disabled={creating}
                        onAnswer={(value) => answer(q.id, value)}
                        // Skipping takes the default for that question rather than leaving a hole:
                        // the tree still has to be buildable, and `buildScaffold` falls back safely.
                        onSkip={() => answer(q.id, q.options[0].value)}
                        onDismiss={i === 0 ? onClose : undefined}
                        freeTextPlaceholder="Describe what you need instead"
                    />
                )
            })}

            {/* The whole tree, before anything is created. One preview and one approval, rather
                than a folder appearing per answer. */}
            {/* While creating, the preview gives way to a progress block: the tree is already
                agreed, so showing it again with a disabled button underneath says less than naming
                what is being made. Same shape as the file review's, for the same reason. */}
            {complete && creating && (
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                        <p className="min-w-0 flex-1 text-xs text-gray-700">
                            Creating {preview.length} folder{preview.length === 1 ? '' : 's'}
                            <span className="animate-search-dots">.</span>
                            <span className="animate-search-dots animate-search-dots-delay-1">.</span>
                            <span className="animate-search-dots animate-search-dots-delay-2">.</span>
                        </p>
                        <ElapsedTime className="shrink-0 text-[10px] text-gray-400" />
                    </div>
                    <ul className="space-y-0.5 pl-5">
                        {preview.map((f) => (
                            <li key={f.path} className="truncate text-[10px] text-gray-400">
                                {f.path}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {complete && !creating && (
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                    <div className="flex items-start gap-2 px-3.5 pb-2.5 pt-3">
                        <p className="min-w-0 flex-1 font-headline text-[13px] leading-snug text-gray-900">
                            Create these {preview.length} folders?
                        </p>
                        <button
                            type="button"
                            onClick={onClose}
                            className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                            aria-label="Cancel"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>

                    <ul className="hover-scrollbar max-h-64 overflow-y-auto border-t border-gray-100">
                        {preview.map((f) => (
                            <li
                                key={f.path}
                                className="flex items-start gap-1.5 border-t border-gray-100 px-3.5 py-1.5 first:border-t-0"
                                // Nesting shown by indent, which is how a folder tree is read
                                // everywhere else the user has seen one.
                                style={{ paddingLeft: f.parentPath ? '2.25rem' : undefined }}
                            >
                                {f.parentPath && (
                                    <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-gray-300" aria-hidden />
                                )}
                                <span className="min-w-0">
                                    <span className="block truncate text-xs text-gray-800">{f.name}</span>
                                    <span className="block text-[10px] leading-snug text-gray-400">{f.purpose}</span>
                                </span>
                            </li>
                        ))}
                    </ul>

                    {/* Already scaffolded once. Said BEFORE the button, because afterwards is too
                        late to matter, and as a warning rather than a block: re-running is
                        legitimate when an engagement changes shape, and only adds what is missing.
                        The user is told and decides. */}
                    {/* Typed answers that named no branch this builder knows. Shown rather than
                        silently dropped: the user said something specific, and they should see
                        that the structure below does not reflect it before they create it. */}
                    {unused.length > 0 && (
                        <div className="border-t border-gray-100 bg-amber-50/50 px-3.5 py-2">
                            <p className="text-[10px] font-medium text-amber-800">
                                Not reflected in this structure:
                            </p>
                            {unused.map((u) => (
                                <p key={u.id} className="mt-0.5 text-[10px] leading-snug text-amber-700">
                                    &ldquo;{u.value}&rdquo; — ask Brio about this once the folders exist.
                                </p>
                            ))}
                        </div>
                    )}

                    <p className="border-t border-gray-100 px-3.5 py-2 text-[10px] leading-relaxed text-gray-400">
                        Folders are added to your Drive. Anything already there is left exactly as it
                        is — nothing is renamed, moved or removed.
                    </p>

                    <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-3.5 py-2.5">
                        <button
                            type="button"
                            onClick={() => setAnswers({})}
                            disabled={creating}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                        >
                            Start over
                        </button>
                        <button
                            type="button"
                            onClick={() => void create()}
                            // Until the token arrives there is nothing to confirm against, so the
                            // button does not pretend to be ready.
                            disabled={creating || !approval}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:brightness-105 disabled:bg-gray-200 disabled:text-gray-400"
                        >
                            {creating
                                ? <><Loader2 className="h-3 w-3 animate-spin" /> Creating…</>
                                : <><Check className="h-3 w-3" /> Create {preview.length}</>}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

/** The chip that starts the interview, for the suggestion row. */
export function FilesScaffoldTrigger({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title="Answer a few questions and Brio will create a folder structure for this engagement."
            className="inline-flex max-w-full shrink-0 items-center gap-1.5 truncate rounded-full border border-primary/30 bg-white px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/5 disabled:opacity-60"
        >
            <FolderTree className="h-3 w-3 shrink-0" />
            Set up folders
        </button>
    )
}
