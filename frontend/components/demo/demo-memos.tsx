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
    appliedTargetOf,
    byNewestMemo,
    memoFileName,
    memoMarkdown,
    type MemoAppliedAction,
    type MemoListItem,
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
}

const DAY = 86_400_000

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
        applied: params.applied ?? [],
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
    ]
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

    const apply = useCallback(async (memo: MemoListItem, _found: MemoFound, p: ApplicableProposal) => {
        await wait(400, null)
        const target = appliedTargetOf(p as NotesProposal)
        if (target) {
            setMemos((list) => (list ?? []).map((m) => {
                if (m.id !== memo.id) return m
                const applied = [...m.applied, { ...target, label: appliedLabelOf(p), at: new Date().toISOString() }]
                return { ...m, applied, appliedCount: applied.length }
            }))
        }
        return { ok: true as const }
    }, [wait])

    /** The memo's file as the app would read it from storage: heading, byline, then the notes. */
    const loadContent = useCallback(async (memo: MemoListItem, signal: AbortSignal): Promise<MemoContent> => {
        const demo = memosRef.current?.find((m) => m.id === memo.id)
        const text = demo ? memoMarkdown({ title: demo.title, date: demo.date, authorName: demo.authorName, body: demo.body }) : ''
        return wait(300, { text, webUrl: null }, signal)
    }, [wait])

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
        return { ok: true, memo, fileName: memo.fileName }
    }, [wait])

    return { memos, findActions, apply, loadContent, save }
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
            />
            <AddMemoSheet open={adding} onOpenChange={setAdding} onSave={save} />
        </>
    )
}
