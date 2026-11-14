'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '@/components/ui/toast'
import { MemosView, type ApplicableProposal, type MemoContent, type MemoFound } from '@/components/projects/engagement-memos'
import { AddMemoSheet, localDay, type AddMemoInput, type AddMemoOutcome } from '@/components/projects/add-memo-sheet'
import { AiAbortedError } from '@/lib/ai/fetch-timeout'
import type { NotesProposal } from '@/lib/ai/notes-proposals'
import type { DemoEngagement } from '@/lib/demo/static-demo-data'
import { getDemoDeliverables } from '@/lib/demo/demo-deliverables'
import { prettyName } from '@/lib/demo/demo-summary'
import {
    alreadyAppliedIds,
    appliedLabelOf,
    appliedStoredIds,
    appliedTargetOf,
    byNewestMemo,
    memoFileName,
    memoMarkdown,
    memoReviewOf,
    waitingActionItems,
    type MemoAppliedAction,
    type MemoListItem,
    type MemoRaidSuggestion,
    type MemoReview,
    type MemoReviewPayload,
} from '@/lib/memos/memo-shared'

/*
 * Internal memos on /tour: three canned calls of the sample engagement, kept in memory. Find actions
 * answers with canned proposals grounded in the memo's own lines, Apply marks the memo, and a memo
 * added here joins the list. Nothing is sent. Discussions › Memos shows them (DemoMemosTab, the app's
 * own MemosView); the Overview card that showed them before (demo-internal-memos.tsx) reads them here too.
 */

export interface DemoMemo extends MemoListItem {
    body: string
    authorName: string
    applied: MemoAppliedAction[]
    found: (today: Date) => MemoFound
    /** What waits on it (§13), as the app keeps it: quotes as anchors only. */
    review: MemoReview | null
    raid: MemoRaidSuggestion[]
}

/** The memo's file, as the app reads it from storage: heading, byline, then the notes. */
function demoMemoText(m: Pick<DemoMemo, 'title' | 'date' | 'authorName' | 'body'>): string {
    return memoMarkdown({ title: m.title, date: m.date, authorName: m.authorName, body: m.body })
}

/** The row's counts, as the app's list works them out. */
function withCounts(m: DemoMemo): DemoMemo {
    return { ...m, toReview: waitingActionItems(m) + m.raid.length, reviewedAt: m.review?.at ?? null }
}

const DAY = 86_400_000
/** How long a memo added on the tour takes to be "identified". */
const IDENTIFY_MS = 2_500

/** Monday of the week `weeksAhead` from this one. */
function mondayOf(weeksAhead: number, now: Date): Date {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dow = d.getDay()
    d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow) + weeksAhead * 7)
    return d
}

function daysAgo(n: number, now: Date): string {
    return localDay(new Date(now.getTime() - n * DAY))
}

/** A memo of the sample engagement, as the list shows it. */
export function demoMemo(params: {
    id: string
    date: string
    title: string
    authorName: string
    source: 'notes' | 'transcript'
    durationMinutes?: number
    body: string
    applied?: MemoAppliedAction[]
    found: (today: Date) => MemoFound
}): DemoMemo {
    return {
        id: params.id,
        docId: null,
        fileName: memoFileName(params.date, params.title, []),
        date: params.date,
        title: params.title,
        authorFirstName: params.authorName.split(' ')[0],
        authorName: params.authorName,
        source: params.source,
        durationMinutes: params.durationMinutes ?? null,
        appliedCount: params.applied?.length ?? 0,
        toReview: 0,
        reviewedAt: null,
        applied: params.applied ?? [],
        review: null,
        raid: [],
        createdAt: `${params.date}T17:00:00.000Z`,
        body: params.body,
        found: params.found,
    }
}

export function cannedMemos(engagement: DemoEngagement, now: Date): DemoMemo[] {
    const nextMonday = localDay(mondayOf(1, now))
    const mondayAfter = localDay(mondayOf(2, now))
    const fridayAfterNext = (() => { const d = mondayOf(2, now); d.setDate(d.getDate() + 4); return localDay(d) })()
    const target = getDemoDeliverables(engagement).find((d) => d.status !== 'approved' && d.dueDate && d.dueDate !== fridayAfterNext)
    const targetName = target ? prettyName(target.folder.name) : null

    const weekly = {
        figures: "They'll send the latest figures by end of next week",
        due: targetName ? `Wants the ${targetName} by the Friday after next` : null,
        scope: 'Asked if we can also put together a board summary; new piece of work',
        chase: 'I need to chase the signed change order, still missing',
        later: 'Next check-in after the holidays',
    }
    const kickoff = {
        access: 'Dana Whitfield: I can get you access to the shared finance folder by Monday.',
        owner: "Alex Jordan: Great. I'll own the weekly status note from our side.",
    }
    const scoping = {
        timeline: 'Timeline agreed: first drafts in three weeks',
        contact: 'Main contact is Dana; billing questions go to her office',
    }

    return [
        demoMemo({
            id: 'tour-memo-weekly',
            date: daysAgo(2, now),
            title: 'Weekly check-in',
            authorName: 'Alex Jordan',
            source: 'notes',
            body: [weekly.figures, weekly.due, weekly.scope, weekly.chase, weekly.later].filter(Boolean).map((l) => `- ${l}`).join('\n'),
            found: () => ({
                proposals: [
                    { kind: 'reminder', id: 'reminder-1', title: 'Check the figures arrived', date: mondayAfter, quote: weekly.figures },
                    ...(target && weekly.due ? [{
                        kind: 'dueDate' as const, id: 'dueDate-2', deliverableId: target.folder.id, docId: target.folder.docId,
                        deliverableName: targetName!, currentDate: target.dueDate, newDate: fridayAfterNext, quote: weekly.due,
                    }] : []),
                    { kind: 'reminder', id: 'reminder-3', title: 'Chase the signed change order', date: nextMonday, quote: weekly.chase },
                    { kind: 'deliverable', id: 'deliverable-4', name: 'Board Summary', dueDate: null, quote: weekly.scope },
                ],
                skipped: [{ quote: weekly.later, reason: 'has no date' }],
                dropped: 0,
            }),
        }),
        demoMemo({
            id: 'tour-memo-kickoff',
            date: daysAgo(9, now),
            title: 'Kickoff call',
            authorName: 'Sam Rivera',
            source: 'transcript',
            durationMinutes: 38,
            body: [
                'Alex Jordan: Thanks for making the time. We will walk through scope, then timing.',
                kickoff.access,
                kickoff.owner,
                'Dana Whitfield: Perfect. Send the agenda for next time and we will review it with the team.',
            ].join('\n\n'),
            found: () => ({
                proposals: [
                    { kind: 'reminder', id: 'reminder-1', title: 'Check finance folder access', date: nextMonday, quote: kickoff.access },
                ],
                skipped: [{ quote: kickoff.owner, reason: 'is an ongoing task with no date' }],
                dropped: 0,
            }),
        }),
        demoMemo({
            id: 'tour-memo-scoping',
            date: daysAgo(23, now),
            title: 'Scoping call',
            authorName: 'Alex Jordan',
            source: 'notes',
            body: `# Scope\n\n- ${scoping.timeline}\n- ${scoping.contact}`,
            // Applied when it was written, so Find actions shows it as done.
            applied: [{
                kind: 'reminder', target: 'check the first drafts are on track', date: nextMonday, quote: scoping.timeline.toLowerCase(),
                label: 'Reminder · Check the first drafts are on track', at: new Date(now.getTime() - 22 * DAY).toISOString(),
            }],
            found: () => ({
                proposals: [{ kind: 'reminder', id: 'reminder-1', title: 'Check the first drafts are on track', date: nextMonday, quote: scoping.timeline }],
                skipped: [],
                dropped: 0,
            }),
        }),
    ].map((m) => withCounts(m.id === 'tour-memo-weekly'
        // The newest call arrived with its action items, and a RAID suggestion, already waiting (§13).
        ? {
            ...m,
            review: memoReviewOf(m.found(now), demoMemoText(m), 'auto', new Date(m.createdAt)),
            raid: [{ id: 'tour-raid-weekly-1', type: 'RISK', title: 'The signed change order may hold up the launch' }],
        }
        : m))
}

/** A memo added on the tour: Brio "finds" a follow-up on its first line, a week out. */
export function addedMemoFound(body: string, now: Date): MemoFound {
    const first = body.split('\n').map((l) => l.replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|>\s*)/, '').trim()).find((l) => l.length >= 4)
    if (!first) return { proposals: [], skipped: [], dropped: 0 }
    const quote = first.length > 200 ? first.slice(0, 200) : first
    return {
        proposals: [{ kind: 'reminder', id: 'reminder-1', title: 'Follow up on this call', date: localDay(mondayOf(1, now)), quote }],
        skipped: [],
        dropped: 0,
    }
}

/**
 * The tour's memos and what's done with them, as useEngagementMemos is for the app, all in memory.
 * `today` is the visitor's, known only after mount (the server and the browser must agree): the
 * memos are null until it is.
 */
export function useDemoMemos(engagement: DemoEngagement, today: Date | null) {
    const [memos, setMemos] = useState<DemoMemo[] | null>(() => (today ? cannedMemos(engagement, today).sort(byNewestMemo) : null))
    useEffect(() => {
        if (today && memos === null) setMemos(cannedMemos(engagement, today).sort(byNewestMemo))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [today])
    const memosRef = useRef(memos)
    memosRef.current = memos

    const timers = useRef<Array<ReturnType<typeof setTimeout>>>([])
    useEffect(() => () => timers.current.forEach(clearTimeout), [])
    const wait = useCallback(<T,>(ms: number, value: T, signal?: AbortSignal) => new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => resolve(value), ms)
        timers.current.push(t)
        signal?.addEventListener('abort', () => { clearTimeout(t); reject(new AiAbortedError()) })
    }), [])

    const findActions = useCallback(async (memo: MemoListItem, signal: AbortSignal): Promise<MemoFound> => {
        const demo = memosRef.current?.find((m) => m.id === memo.id)
        const found = demo ? demo.found(new Date()) : { proposals: [], skipped: [], dropped: 0 }
        return wait(900, { ...found, alreadyApplied: alreadyAppliedIds(found.proposals, demo?.applied ?? []) }, signal)
    }, [wait])

    const apply = useCallback(async (memo: MemoListItem, _found: MemoFound, p: ApplicableProposal, original?: ApplicableProposal) => {
        await wait(400, null)
        // As the app: what Brio found is recorded, so identifying them again knows it's done after an edit.
        const target = appliedTargetOf((original ?? p) as NotesProposal)
        if (target) {
            setMemos((list) => (list ?? []).map((m) => {
                if (m.id !== memo.id) return m
                const applied = [...m.applied, { ...target, label: appliedLabelOf(p), at: new Date().toISOString() }]
                return withCounts({ ...m, applied, appliedCount: applied.length })
            }))
        }
        return { ok: true as const }
    }, [wait])

    /** The memo's file as the app would read it from storage: heading, byline, then the notes. */
    const loadContent = useCallback(async (memo: MemoListItem, signal: AbortSignal): Promise<MemoContent> => {
        const demo = memosRef.current?.find((m) => m.id === memo.id)
        return wait(300, { text: demo ? demoMemoText(demo) : '', webUrl: null }, signal)
    }, [wait])

    // What waits on a memo (§13), kept here as the app keeps it.
    const loadReview = useCallback(async (memo: MemoListItem, signal: AbortSignal): Promise<MemoReviewPayload> => {
        const demo = memosRef.current?.find((m) => m.id === memo.id)
        const review = demo?.review && !demo.review.dismissed ? demo.review : null
        return wait(150, {
            review,
            alreadyApplied: review && demo ? appliedStoredIds(review, demo.applied) : [],
            engagement: { id: engagement.slug, name: engagement.name, firmId: 'tour', ctaUrl: null },
            raid: demo?.raid ?? [],
        }, signal)
    }, [wait, engagement.slug, engagement.name])

    const update = useCallback((id: string, change: (m: DemoMemo) => DemoMemo) => {
        setMemos((list) => (list ?? []).map((m) => (m.id === id ? withCounts(change(m)) : m)))
    }, [])

    const dismissReview = useCallback(async (memo: MemoListItem) => {
        await wait(200, null)
        update(memo.id, (m) => (m.review ? { ...m, review: { ...m.review, dismissed: true } } : m))
    }, [wait, update])

    const actOnRaid = useCallback(async (memo: MemoListItem, itemId: string) => {
        await wait(300, null)
        update(memo.id, (m) => ({ ...m, raid: m.raid.filter((r) => r.id !== itemId) }))
    }, [wait, update])

    // A memo added here: Brio "identifies" its action items a moment after it's saved, as the app does.
    const [identifyingIds, setIdentifyingIds] = useState<string[]>([])

    const save = useCallback(async (input: AddMemoInput): Promise<{ ok: true; memo: DemoMemo; fileName: string }> => {
        await wait(500, null)
        const now = new Date()
        const list = memosRef.current ?? []
        const memo = demoMemo({
            id: `tour-memo-${now.getTime()}`,
            date: input.date,
            title: input.title,
            authorName: 'Alex Jordan',
            source: input.source,
            durationMinutes: input.durationMinutes ?? undefined,
            body: input.body,
            found: (day) => addedMemoFound(input.body, day),
        })
        memo.fileName = memoFileName(input.date, input.title, list.map((m) => m.fileName))
        memo.createdAt = now.toISOString()
        setMemos([memo, ...list].sort(byNewestMemo))
        setIdentifyingIds((ids) => [...ids, memo.id])
        timers.current.push(setTimeout(() => {
            update(memo.id, (m) => ({ ...m, review: memoReviewOf(m.found(new Date()), demoMemoText(m), 'auto') }))
            setIdentifyingIds((ids) => ids.filter((id) => id !== memo.id))
        }, IDENTIFY_MS))
        return { ok: true, memo, fileName: memo.fileName }
    }, [wait, update])

    return { memos, findActions, apply, loadContent, save, loadReview, dismissReview, actOnRaid, identifyingIds }
}

export type DemoMemosController = ReturnType<typeof useDemoMemos>

/** Discussions › Memos on /tour: the app's view over the canned memos, with the app's Add sheet. */
export function DemoMemosTab({ memos: c, selectedId, onSelect }: {
    memos: DemoMemosController
    selectedId: string | null
    onSelect: (memoId: string) => void
}) {
    const { addToast } = useToast()
    const [adding, setAdding] = useState(false)

    const save = async (input: AddMemoInput): Promise<AddMemoOutcome> => {
        const out = await c.save(input)
        onSelect(out.memo.id)
        addToast({ type: 'success', title: 'Memo saved', message: `Saved as ${out.fileName} in Internal Memos.` })
        return { ok: true }
    }

    return (
        <>
            <MemosView
                memos={c.memos}
                readOnly={false}
                storage="Google Drive"
                onAdd={() => setAdding(true)}
                selectedId={selectedId}
                onSelect={onSelect}
                loadContent={c.loadContent}
                openUnavailable="Not available in this demo"
                findActions={c.findActions}
                apply={c.apply}
                loadReview={c.loadReview}
                dismissReview={c.dismissReview}
                actOnRaid={c.actOnRaid}
                identifyingIds={c.identifyingIds}
            />
            <AddMemoSheet open={adding} onOpenChange={setAdding} onSave={save} />
        </>
    )
}
