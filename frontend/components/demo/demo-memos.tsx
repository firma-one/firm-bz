'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useToast } from '@/components/ui/toast'
import { MemosView, type ApplicableProposal, type MemoContent, type MemoEditOpening, type MemoFound } from '@/components/projects/engagement-memos'
import { AddMemoSheet, localDay, type AddMemoInput, type AddMemoOutcome, type MemoEditInput } from '@/components/projects/add-memo-sheet'
import { AiAbortedError } from '@/lib/ai/fetch-timeout'
import type { NotesProposal } from '@/lib/ai/notes-proposals'
import type { DemoEngagement } from '@/lib/demo/static-demo-data'
import { getDemoDeliverables } from '@/lib/demo/demo-deliverables'
import { prettyName } from '@/lib/demo/demo-summary'
import {
    appliedLabelOf,
    appliedStoredIds,
    appliedStoredOn,
    appliedTargetOf,
    byNewestMemo,
    cleanMemoTitle,
    memoFileName,
    anchorQuote,
    memoMarkdown,
    memoMatchText,
    memoReadReview,
    reanchorReview,
    waitingActionItems,
    type MemoAcceptedAction,
    type MemoAppliedAction,
    type MemoListItem,
    type MemoMinutes,
    type MemoRaidSuggestion,
    type MemoReview,
    type MemoReviewPayload,
} from '@/lib/memos/memo-shared'
import type { MemoBrioTab, MemoSuggestionChanges } from '@/components/projects/memo-brio-panel'

/*
 * Internal memos on /tour: three canned calls of the sample engagement, kept in memory. Brio's read
 * answers with canned minutes and RAID suggestions grounded in the memo's own lines (every commitment
 * an Action, .claude/plans/raid-actions-memo-minutes.md), Accept takes them off the memo, and a memo added
 * here joins the list. Nothing is sent. Discussions › Memos shows them (DemoMemosTab, the app's own
 * MemosView); the Overview card that showed them before (demo-internal-memos.tsx) reads them here too.
 */

/** What Brio's read of a tour memo gives: its minutes, its RAID suggestions and the lines it left. */
export interface DemoMemoRead {
    minutes: MemoMinutes
    raid: MemoRaidSuggestion[]
    skipped: { quote: string; reason: string }[]
}

export interface DemoMemo extends MemoListItem {
    body: string
    authorName: string
    applied: MemoAppliedAction[]
    found: (today: Date) => MemoFound
    /** What waits on it (§13), as the app keeps it: quotes as anchors only. */
    review: MemoReview | null
    raid: MemoRaidSuggestion[]
    /** Its minutes, once Brio has read it (the app keeps them sealed with the review). */
    minutes: MemoMinutes | null
    /** Actions accepted from it, for the minutes. */
    acceptedActions: MemoAcceptedAction[]
    /** Brio's read of it, canned; null for a memo read before minutes and RAID Actions. */
    read: ((today: Date) => DemoMemoRead) | null
    /** When its notes last changed here (§14.3), as the app keeps it. */
    notesChangedAt: string | null
}

/** The memo's file, as the app reads it from storage: heading, byline, then the notes. */
function demoMemoText(m: Pick<DemoMemo, 'title' | 'date' | 'authorName' | 'body'>): string {
    return memoMarkdown({ title: m.title, date: m.date, authorName: m.authorName, body: m.body })
}

/** The row's counts, as the app's list works them out. */
function withCounts(m: DemoMemo): DemoMemo {
    return {
        ...m,
        toReview: waitingActionItems(m) + m.raid.length,
        reviewedAt: m.review?.at ?? null,
        changedSinceRead: !!m.notesChangedAt && !!m.review && m.notesChangedAt > m.review.at,
    }
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
    read?: (today: Date) => DemoMemoRead
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
        edited: null,
        changedSinceRead: false,
        notesChangedAt: null,
        applied: params.applied ?? [],
        review: null,
        raid: [],
        minutes: null,
        acceptedActions: [],
        read: params.read ?? null,
        createdAt: `${params.date}T17:00:00.000Z`,
        body: params.body,
        found: params.found,
    }
}

/** A tour memo as Brio's read leaves it: the minutes and suggestions waiting, the review noting the read. */
function afterRead(m: DemoMemo, at: Date): DemoMemo {
    if (!m.read) return m
    const read = m.read(at)
    return {
        ...m,
        minutes: read.minutes,
        raid: read.raid,
        review: memoReadReview({ skipped: read.skipped, dropped: 0, minutes: null }, demoMemoText(m), 'auto', at),
    }
}

/** One canned suggestion: its line's place in the memo, as the app stores it. */
function suggestion(text: string, p: Omit<MemoRaidSuggestion, 'quoteAt' | 'dueDate' | 'followUp' | 'priority'> & {
    quote: string
    priority?: MemoRaidSuggestion['priority']
    dueDate?: string | null
    followUp?: MemoRaidSuggestion['followUp']
}): MemoRaidSuggestion {
    return {
        id: p.id,
        type: p.type,
        title: p.title,
        priority: p.priority ?? null,
        quoteAt: anchorQuote(memoMatchText(text), p.quote),
        dueDate: p.dueDate ?? null,
        followUp: p.followUp ?? null,
    }
}

/** "Mar 4, 2026": the day in a tour memo's minutes subject. */
const subjectDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

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

    const fridayNext = (() => { const d = mondayOf(1, now); d.setDate(d.getDate() + 4); return localDay(d) })()
    const weeklyMeta = { title: 'Weekly check-in', date: daysAgo(2, now), authorName: 'Alex Jordan' }
    const weeklyBody = [weekly.figures, weekly.due, weekly.scope, weekly.chase, weekly.later].filter(Boolean).map((l) => `- ${l}`).join('\n')
    const weeklyText = demoMemoText({ ...weeklyMeta, body: weeklyBody })
    const kickoffMeta = { title: 'Kickoff call', date: daysAgo(9, now), authorName: 'Sam Rivera' }
    const kickoffBody = [
        'Alex Jordan: Thanks for making the time. We will walk through scope, then timing.',
        kickoff.access,
        kickoff.owner,
        'Dana Whitfield: Perfect. Send the agenda for next time and we will review it with the team.',
    ].join('\n\n')
    const kickoffText = demoMemoText({ ...kickoffMeta, body: kickoffBody })

    return [
        demoMemo({
            id: 'tour-memo-weekly',
            ...weeklyMeta,
            source: 'notes',
            body: weeklyBody,
            read: () => ({
                minutes: {
                    subject: `Minutes · ${engagement.name} weekly check-in · ${subjectDay(weeklyMeta.date)}`,
                    attendees: ['Alex Jordan', 'Dana Whitfield'],
                    summary: `The latest figures are due by the end of next week${targetName ? `, and the ${targetName} is wanted sooner` : ''}. Dana asked whether a board summary could be added, and the signed change order is still outstanding.`,
                    discussed: ['Latest figures', ...(targetName ? [`Timing of the ${targetName}`] : []), 'A possible board summary', 'The signed change order'],
                    decisions: [],
                    openQuestions: ['Whether a board summary is in scope.'],
                    nextMeeting: 'After the holidays',
                },
                raid: [
                    suggestion(weeklyText, { id: 'tour-raid-weekly-figures', type: 'ACTION', title: 'Dana to send the latest figures', quote: weekly.figures, dueDate: fridayNext }),
                    ...(target && weekly.due ? [suggestion(weeklyText, {
                        id: 'tour-raid-weekly-due', type: 'ACTION' as const, title: `Move the ${targetName} due date earlier`, quote: weekly.due, dueDate: nextMonday,
                    })] : []),
                    suggestion(weeklyText, { id: 'tour-raid-weekly-board', type: 'ACTION', title: 'Set up the Board Summary deliverable', quote: weekly.scope, dueDate: nextMonday, followUp: 'DELIVERABLE' }),
                    suggestion(weeklyText, { id: 'tour-raid-weekly-chase', type: 'ACTION', title: 'Chase the signed change order', quote: weekly.chase, dueDate: nextMonday }),
                    // The same entry the RAID tab's line to this memo names (demo-raid.tsx).
                    suggestion(weeklyText, { id: 'tour-raid-weekly-1', type: 'RISK', title: 'The signed change order may hold up the launch', quote: weekly.chase, priority: 'MEDIUM' }),
                ],
                skipped: [{ quote: weekly.later, reason: 'the next check-in, not a commitment' }],
            }),
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
            ...kickoffMeta,
            source: 'transcript',
            durationMinutes: 38,
            body: kickoffBody,
            read: () => ({
                minutes: {
                    subject: `Minutes · ${engagement.name} kickoff · ${subjectDay(kickoffMeta.date)}`,
                    attendees: ['Alex Jordan', 'Dana Whitfield'],
                    summary: 'The call walked through scope, then timing. Dana is opening the shared finance folder, and Alex will write the weekly status note.',
                    discussed: ['Scope', 'Timing', 'Access to the shared finance folder', 'The weekly status note'],
                    decisions: ['Alex writes the weekly status note.'],
                    openQuestions: [],
                    nextMeeting: null,
                },
                raid: [
                    suggestion(kickoffText, { id: 'tour-raid-kickoff-access', type: 'ACTION', title: 'Dana to give access to the shared finance folder', quote: kickoff.access, dueDate: nextMonday }),
                    suggestion(kickoffText, { id: 'tour-raid-kickoff-agenda', type: 'ACTION', title: 'Send Dana the agenda for the next call', quote: 'Send the agenda for next time', dueDate: nextMonday }),
                ],
                skipped: [],
            }),
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
    ].map((m) => {
        // The newest call arrived with its minutes and RAID suggestions already waiting.
        if (m.id === 'tour-memo-weekly') return withCounts(afterRead(m, new Date(m.createdAt)))
        // The kickoff was read and its Actions accepted: the minutes list them, nothing waits.
        if (m.id === 'tour-memo-kickoff') {
            const read = afterRead(m, new Date(m.createdAt))
            return withCounts({
                ...read,
                raid: [],
                acceptedActions: read.raid.map((r) => ({ id: r.id, title: r.title, dueDate: r.dueDate, followUp: r.followUp })),
            })
        }
        // The scoping call was read before minutes and RAID Actions: its action item was applied then.
        return withCounts(m)
    })
}

/** A memo added on the tour: Brio's read finds a follow-up on its first line, and writes short minutes. */
function addedMemoRead(m: Pick<DemoMemo, 'title' | 'date' | 'authorName' | 'body'>, now: Date): DemoMemoRead {
    const first = m.body.split('\n').map((l) => l.replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|>\s*)/, '').trim()).find((l) => l.length >= 4)
    const text = demoMemoText(m)
    return {
        minutes: {
            subject: `Minutes · ${m.title} · ${subjectDay(m.date)}`,
            attendees: [m.authorName],
            summary: first ? `The call covered: ${first.length > 160 ? `${first.slice(0, 160)}…` : first}` : 'A short call.',
            discussed: first ? [first.length > 80 ? `${first.slice(0, 80)}…` : first] : [],
            decisions: [],
            openQuestions: [],
            nextMeeting: null,
        },
        raid: first ? [suggestion(text, {
            id: `tour-raid-added-${Date.now()}`, type: 'ACTION', title: 'Follow up on this call', quote: first.length > 200 ? first.slice(0, 200) : first, dueDate: localDay(mondayOf(1, now)),
        })] : [],
        skipped: [],
    }
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

    const update = useCallback((id: string, change: (m: DemoMemo) => DemoMemo) => {
        setMemos((list) => (list ?? []).map((m) => (m.id === id ? withCounts(change(m)) : m)))
    }, [])

    /** The sparkle, as the app's: Brio reads the memo again, and its minutes and suggestions wait on it. */
    const readMemo = useCallback(async (memo: MemoListItem, signal: AbortSignal): Promise<void> => {
        await wait(1_400, null, signal)
        update(memo.id, (m) => afterRead({ ...m, read: m.read ?? ((day: Date) => addedMemoRead(m, day)) }, new Date()))
    }, [wait, update])

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
            appliedOn: review && demo ? appliedStoredOn(review, demo.applied) : {},
            applied: (demo?.applied ?? []).map((a) => ({ label: a.label, at: a.at })),
            engagement: { id: engagement.slug, name: engagement.name, firmId: 'tour', ctaUrl: null },
            raid: demo?.raid ?? [],
            minutes: demo?.minutes ?? null,
            acceptedActions: demo?.acceptedActions ?? [],
        }, signal)
    }, [wait, engagement.slug, engagement.name])

    /** Dismiss all, as the app: the waiting suggestions go; the minutes stay. */
    const dismissReview = useCallback(async (memo: MemoListItem) => {
        await wait(200, null)
        update(memo.id, (m) => ({ ...m, raid: [], review: m.review ? { ...m.review, dismissed: true } : m.review }))
    }, [wait, update])

    /** Accepts or dismisses one suggestion; an accepted Action joins the minutes' action items. */
    const actOnRaid = useCallback(async (memo: MemoListItem, itemId: string, action: 'accept' | 'dismiss', changes: MemoSuggestionChanges = {}) => {
        await wait(300, null)
        update(memo.id, (m) => {
            const item = m.raid.find((r) => r.id === itemId)
            const type = changes.type ?? item?.type
            return {
                ...m,
                raid: m.raid.filter((r) => r.id !== itemId),
                acceptedActions: item && action === 'accept' && type === 'ACTION'
                    ? [...m.acceptedActions, { id: item.id, title: changes.title ?? item.title, dueDate: changes.dueDate ?? item.dueDate, followUp: item.followUp }]
                    : m.acceptedActions,
            }
        })
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
            read: (day) => addedMemoRead({ title: input.title, date: input.date, authorName: 'Alex Jordan', body: input.body }, day),
        })
        memo.fileName = memoFileName(input.date, input.title, list.map((m) => m.fileName))
        memo.createdAt = now.toISOString()
        setMemos([memo, ...list].sort(byNewestMemo))
        setIdentifyingIds((ids) => [...ids, memo.id])
        timers.current.push(setTimeout(() => {
            update(memo.id, (m) => afterRead(m, new Date()))
            setIdentifyingIds((ids) => ids.filter((id) => id !== memo.id))
        }, IDENTIFY_MS))
        return { ok: true, memo, fileName: memo.fileName }
    }, [wait, update])

    /**
     * An edit (§14.3), as the app makes it: renamed, new notes stop what Brio found before (and are read
     * again when asked), a new title or day keeps every action item. Nothing applied is undone.
     */
    const edit = useCallback(async (memo: MemoListItem, input: MemoEditInput): Promise<{ ok: true; memo: DemoMemo; fileName: string }> => {
        await wait(500, null)
        const now = new Date().toISOString()
        const list = memosRef.current ?? []
        const current = list.find((m) => m.id === memo.id)!
        const title = cleanMemoTitle(input.title)
        const notesChanged = input.body !== null && memoMatchText(input.body) !== memoMatchText(current.body)
        const body = notesChanged && input.body !== null ? input.body : current.body
        const fileName = memoFileName(input.date, title, list.filter((m) => m.id !== memo.id).map((m) => m.fileName))
        const oldText = demoMemoText(current)
        const next = withCounts({
            ...current,
            title,
            date: input.date,
            body,
            fileName,
            edited: { at: now, byName: 'Alex Jordan' },
            ...(notesChanged
                ? {
                    notesChangedAt: now,
                    source: input.source,
                    durationMinutes: input.source === 'transcript' ? input.durationMinutes : null,
                    review: current.review ? { ...current.review, dismissed: true } : null,
                    raid: [],
                    // New notes: the minutes were the old notes' words.
                    minutes: null,
                    found: (day: Date) => addedMemoFound(body, day),
                    read: (day: Date) => addedMemoRead({ title, date: input.date, authorName: current.authorName, body }, day),
                }
                : { review: current.review ? reanchorReview(current.review, oldText, demoMemoText({ ...current, title, date: input.date })) : null }),
        })
        setMemos(list.map((m) => (m.id === memo.id ? next : m)).sort(byNewestMemo))
        if (notesChanged && input.identify) {
            setIdentifyingIds((ids) => [...ids.filter((id) => id !== memo.id), memo.id])
            timers.current.push(setTimeout(() => {
                update(memo.id, (m) => afterRead(m, new Date()))
                setIdentifyingIds((ids) => ids.filter((id) => id !== memo.id))
            }, IDENTIFY_MS))
        }
        return { ok: true, memo: next, fileName }
    }, [wait, update])

    return { memos, readMemo, apply, loadContent, save, edit, loadReview, dismissReview, actOnRaid, identifyingIds }
}

export type DemoMemosController = ReturnType<typeof useDemoMemos>

/** Discussions › Memos on /tour: the app's view over the canned memos, with the app's Add sheet. */
export function DemoMemosTab({ memos: c, selectedId, onSelect }: {
    memos: DemoMemosController
    selectedId: string | null
    onSelect: (memoId: string) => void
}) {
    const { addToast } = useToast()
    // A tour step opens Brio's panel on Summary or RAID (`brio=summary`, `brio=raid`).
    const brioParam = useSearchParams()?.get('brio')
    const brioTab: MemoBrioTab | null = brioParam === 'summary' || brioParam === 'raid' ? brioParam : null
    const [adding, setAdding] = useState(false)
    const [editing, setEditing] = useState<{ memo: MemoListItem; context: MemoEditOpening; key: number } | null>(null)
    const [editOpen, setEditOpen] = useState(false)

    const save = async (input: AddMemoInput): Promise<AddMemoOutcome> => {
        const out = await c.save(input)
        onSelect(out.memo.id)
        addToast({ type: 'success', title: 'Memo saved', message: `Saved as ${out.fileName} in Internal Memos.` })
        return { ok: true }
    }

    const saveEdit = async (memo: MemoListItem, input: MemoEditInput): Promise<AddMemoOutcome> => {
        const out = await c.edit(memo, input)
        addToast({
            type: 'success',
            title: 'Memo saved',
            message: out.fileName !== memo.fileName ? `Renamed to ${out.fileName} in Internal Memos.` : 'Your changes are in Internal Memos.',
        })
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
                readMemo={c.readMemo}
                apply={c.apply}
                loadReview={c.loadReview}
                dismissReview={c.dismissReview}
                actOnRaid={c.actOnRaid}
                identifyingIds={c.identifyingIds}
                brioTab={brioTab}
                onEdit={(memo, context) => {
                    setEditing((prev) => ({ memo, context, key: (prev?.key ?? 0) + 1 }))
                    setEditOpen(true)
                }}
            />
            <AddMemoSheet open={adding} onOpenChange={setAdding} onSave={save} />
            {editing && (
                <AddMemoSheet
                    key={editing.key}
                    open={editOpen}
                    onOpenChange={setEditOpen}
                    edit={{ ...editing.context, onSave: (input) => saveEdit(editing.memo, input) }}
                />
            )}
        </>
    )
}
