'use client'

import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { AlertCircle, CalendarDays, Check, Copy, Link2, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Tag } from '@/components/ui/tag'
import { Hint } from '@/components/ui/tooltip'
import { Brio } from '@/components/ui/brio'
import { ThinkingDots } from '@/components/brio/brio-typing'
import { LoadingAnnouncement } from '@/components/ui/shimmer'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { RaidPriorityPicker } from './raid/raid-priority'
import type { AcceptSelected } from './notes-proposals-panel'
import { ASSISTANT, BRIO_GREEN } from '@/lib/ai/assistant'
import { STAGE_PILL_CLASSES } from '@/lib/ui/status'
import { cn } from '@/lib/utils'
import {
    RAID_TITLE_MAX,
    RAID_TYPES,
    RAID_TYPE_LABEL,
    RAID_TYPE_LETTER,
    RAID_TYPE_STAGE,
    dueDay,
    hasPriority,
    nextWeekStart,
    type RaidKind,
    type RaidPriority,
} from '@/lib/raid/raid-shared'
import {
    memoMatchText,
    minutesActionItems,
    minutesDate,
    minutesHtml,
    minutesPlainText,
    quoteFromAnchor,
    type MemoMinutes,
    type MemoRaidSuggestion,
    type MemoReviewPayload,
} from '@/lib/memos/memo-shared'

/**
 * Brio's panel beside a memo (.claude/plans/raid-actions-memo-minutes.md, mock 2026-11-15): two sub-tabs.
 *
 *  - Summary: the meeting's minutes, for the people who were there, with Copy subject and Copy summary.
 *    Their action items are this memo's Actions, as the RAID tab holds them, so the two never disagree.
 *  - RAID: what Brio suggests from the memo, Risks, Actions, Issues and Decisions, each a row of two or
 *    three lines: its letter (a menu to change the type), its title (edited in place), Accept; then its due
 *    date or priority and the line it came from. Owner and status are set on the RAID tab.
 *
 * `MemoBrioPanel` is the view alone, with what it does passed in, so /tour renders the same one.
 */

/** What a person changed on a suggestion before accepting it; left out, Brio's stands. */
export interface MemoSuggestionChanges {
    type?: RaidKind
    title?: string
    /** Actions: YYYY-MM-DD. */
    dueDate?: string
    /** Risks and Issues. */
    priority?: RaidPriority
}

type Shown = { type: RaidKind; title: string; dueDate: string | null; priority: RaidPriority | null }

/** A suggestion as Brio found it, in the four types a person chooses from (an old Assumption reads as a Risk). */
function asFound(item: MemoRaidSuggestion): Shown {
    const type: RaidKind = item.type === 'ASSUMPTION' ? 'RISK' : item.type
    return {
        type,
        title: item.title,
        dueDate: type === 'ACTION' ? item.dueDate ?? nextWeekStart() : null,
        priority: hasPriority(type) ? item.priority ?? 'MEDIUM' : null,
    }
}

/**
 * The panel's choices over the memo's suggestions: each one's type, title, date and priority as changed,
 * which are selected (all, to start), which are being accepted; and the changes to send for one.
 */
function useSuggestionChoices() {
    const [edits, setEdits] = useState<Record<string, Partial<Shown>>>({})
    const [unselected, setUnselected] = useState<ReadonlySet<string>>(new Set())
    const [acting, setActing] = useState<ReadonlySet<string>>(new Set())

    const shownOf = (item: MemoRaidSuggestion): Shown => ({ ...asFound(item), ...edits[item.id] })
    const change = (item: MemoRaidSuggestion, next: Partial<Shown>) => setEdits((e) => {
        const current = { ...asFound(item), ...e[item.id] }
        const merged = { ...current, ...next }
        // A new type brings what it carries: an Action its date, a Risk or an Issue its priority.
        if (next.type && next.type !== current.type) {
            merged.dueDate = next.type === 'ACTION' ? current.dueDate ?? item.dueDate ?? nextWeekStart() : null
            merged.priority = hasPriority(next.type) ? current.priority ?? item.priority ?? 'MEDIUM' : null
        }
        return { ...e, [item.id]: merged }
    })
    /** What to send with Accept: only what differs from what Brio found. */
    const changesOf = (item: MemoRaidSuggestion): MemoSuggestionChanges => {
        const found = asFound(item)
        const shown = shownOf(item)
        const title = shown.title.replace(/\s+/g, ' ').trim()
        const retyped = shown.type !== item.type
        return {
            ...(retyped ? { type: shown.type } : {}),
            ...(title && title !== found.title ? { title } : {}),
            ...(shown.type === 'ACTION' && shown.dueDate && (retyped || shown.dueDate !== found.dueDate) ? { dueDate: shown.dueDate } : {}),
            ...(shown.priority && (retyped || shown.priority !== found.priority) ? { priority: shown.priority } : {}),
        }
    }
    return {
        shownOf,
        change,
        changesOf,
        isEdited: (item: MemoRaidSuggestion) => Object.keys(changesOf(item)).length > 0,
        reset: (item: MemoRaidSuggestion) => setEdits((e) => { const n = { ...e }; delete n[item.id]; return n }),
        isSelected: (item: MemoRaidSuggestion) => !unselected.has(item.id),
        setSelected: (item: MemoRaidSuggestion, on: boolean) => setUnselected((u) => {
            const n = new Set(u)
            if (on) n.delete(item.id)
            else n.add(item.id)
            return n
        }),
        isActing: (item: MemoRaidSuggestion) => acting.has(item.id),
        setActing: (id: string, on: boolean) => setActing((a) => {
            const n = new Set(a)
            if (on) n.add(id)
            else n.delete(id)
            return n
        }),
    }
}

type Choices = ReturnType<typeof useSuggestionChoices>

// ── Pieces ────────────────────────────────────────────────────────────────────────────────────

/** The type's letter in its color; a menu to change it while the suggestion waits. */
function TypeMark({ type, disabled, onChange }: { type: RaidKind; disabled: boolean; onChange: (t: RaidKind) => void }) {
    const mark = (t: RaidKind, size: 'row' | 'menu') => (
        <span
            aria-hidden
            className={cn(
                'inline-flex shrink-0 items-center justify-center rounded-control font-bold leading-none',
                size === 'row' ? 'h-6 w-6 text-caption' : 'h-[18px] w-[18px] text-[10.5px]',
                STAGE_PILL_CLASSES[RAID_TYPE_STAGE[t]],
            )}
        >
            {RAID_TYPE_LETTER[t]}
        </span>
    )
    if (disabled) return <Hint label={RAID_TYPE_LABEL[type]}>{mark(type, 'row')}</Hint>
    return (
        <DropdownMenu>
            <Hint label={`${RAID_TYPE_LABEL[type]} · change the type`}>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        aria-label={`Type: ${RAID_TYPE_LABEL[type]}. Change`}
                        className="mt-0.5 rounded-control transition-shadow hover:ring-1 hover:ring-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/40 data-[state=open]:ring-2 data-[state=open]:ring-action/40"
                    >
                        {mark(type, 'row')}
                    </button>
                </DropdownMenuTrigger>
            </Hint>
            <DropdownMenuContent align="start" className="w-48">
                {RAID_TYPES.map((t) => (
                    <DropdownMenuItem key={t} onSelect={() => onChange(t)} className="gap-2">
                        {mark(t, 'menu')}
                        {RAID_TYPE_LABEL[t]}
                        {t === type && <Check className="ml-auto h-3.5 w-3.5 text-action" aria-hidden />}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

/** The suggestion's words: wrapping text, an input while it's changed. */
function TitleField({ value, disabled, label, onChange }: { value: string; disabled: boolean; label: string; onChange: (next: string) => void }) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(value)
    if (editing && !disabled) {
        const commit = () => {
            const next = draft.replace(/\s+/g, ' ').trim()
            if (next) onChange(next)
            setEditing(false)
        }
        return (
            <Input
                autoFocus
                aria-label={label}
                value={draft}
                maxLength={RAID_TITLE_MAX}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commit() }
                    if (e.key === 'Escape') { e.preventDefault(); setDraft(value); setEditing(false) }
                }}
                className="h-7 px-2 text-ui font-medium"
            />
        )
    }
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={() => { setDraft(value); setEditing(true) }}
            aria-label={`${label}: ${value}. Edit`}
            className="-mx-2 block w-[calc(100%+1rem)] rounded-control border border-transparent px-2 py-1 text-left text-ui font-medium leading-5 text-fg hover:border-line-strong disabled:hover:border-transparent"
        >
            {value}
        </button>
    )
}

/** An Action's due date as a chip; a date field while it's changed. */
function DueChip({ value, disabled, label, onChange }: { value: string; disabled: boolean; label: string; onChange: (day: string) => void }) {
    const [editing, setEditing] = useState(false)
    if (editing && !disabled) {
        return (
            <Input
                type="date"
                autoFocus
                aria-label={label}
                defaultValue={value}
                onBlur={() => setEditing(false)}
                onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setEditing(false) } }}
                onChange={(e) => { if (e.target.value) { onChange(e.target.value); setEditing(false) } }}
                className="h-[26px] w-[9.5rem] px-2 text-small"
            />
        )
    }
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={() => setEditing(true)}
            aria-label={`${label}: ${dueDay(value)}. Change`}
            className="inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-control border border-line-strong bg-surface px-2.5 text-small text-fg hover:bg-surface-hover disabled:hover:bg-surface"
        >
            <CalendarDays className="h-3.5 w-3.5 text-fg-muted" aria-hidden />
            {dueDay(value)}
        </button>
    )
}

/** Copies what `get` gives, saying "Copied" for a moment; formatted and plain where the browser takes both. */
function CopyButton({ label, get }: { label: string; get: () => { text: string; html?: string } }) {
    const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
    useEffect(() => {
        if (state === 'idle') return
        const t = window.setTimeout(() => setState('idle'), 2000)
        return () => window.clearTimeout(t)
    }, [state])
    const copy = async () => {
        const { text, html } = get()
        try {
            if (html && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
                await navigator.clipboard.write([new ClipboardItem({
                    'text/html': new Blob([html], { type: 'text/html' }),
                    'text/plain': new Blob([text], { type: 'text/plain' }),
                })])
            } else {
                await navigator.clipboard.writeText(text)
            }
            setState('copied')
        } catch {
            setState('failed')
        }
    }
    return (
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()} aria-live="polite">
            {state === 'copied' ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
            {state === 'copied' ? 'Copied' : state === 'failed' ? "Couldn't copy" : label}
        </Button>
    )
}

// ── Summary ───────────────────────────────────────────────────────────────────────────────────

function MinutesView({ minutes, meetingDate, actions }: {
    minutes: MemoMinutes
    meetingDate: string
    actions: { title: string; dueDate: string | null }[]
}) {
    const section = (heading: string, lines: string[], list = true) => lines.length > 0 && (
        <div className="mt-4 first:mt-0">
            <h5 className="mb-1 text-caption font-semibold text-fg-muted">{heading}</h5>
            {list ? (
                <ul className="list-disc space-y-0.5 pl-4">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
            ) : (
                <p>{lines.join(' ')}</p>
            )}
        </div>
    )
    return (
        <div className="mx-5 mb-5 rounded-card border border-line bg-surface-subtle px-5 py-4 text-small leading-[21px] text-fg">
            <p className="mb-2 text-small font-semibold">{minutes.subject}</p>
            <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5">
                <dt className="text-fg-muted">Date</dt><dd>{minutesDate(meetingDate)}</dd>
                {minutes.attendees.length > 0 && <><dt className="text-fg-muted">Attendees</dt><dd>{minutes.attendees.join(', ')}</dd></>}
            </dl>
            {section('Summary', [minutes.summary], false)}
            {section('Discussed', minutes.discussed)}
            {section('Decisions', minutes.decisions)}
            {section('Action items', actions.map((a) => (a.dueDate ? `${a.title} · ${dueDay(a.dueDate)}` : a.title)))}
            {actions.length > 0 && (
                <p className="mt-1 flex items-start gap-1 text-caption font-normal text-fg-muted">
                    <Link2 className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                    From the Actions on the RAID tab: change or dismiss one and this list follows.
                </p>
            )}
            {section('Open questions', minutes.openQuestions)}
            {minutes.nextMeeting && section('Next meeting', [minutes.nextMeeting], false)}
        </div>
    )
}

// ── RAID ──────────────────────────────────────────────────────────────────────────────────────

function SuggestionRow({ item, choices, quote, readOnly, onAccept }: {
    item: MemoRaidSuggestion
    choices: Choices
    quote: string | null
    readOnly: boolean
    onAccept: () => void
}) {
    const shown = choices.shownOf(item)
    const busy = choices.isActing(item)
    const locked = readOnly || busy
    return (
        <li className="grid grid-cols-[16px_24px_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2.5 border-t border-line px-5 py-[18px]" data-testid={`memo-raid-${item.id}`}>
            <Checkbox
                className="mt-1.5"
                checked={choices.isSelected(item)}
                disabled={locked}
                onCheckedChange={(v) => choices.setSelected(item, v === true)}
                aria-label={`Select: ${RAID_TYPE_LABEL[shown.type].toLowerCase()} · ${shown.title}`}
            />
            <TypeMark type={shown.type} disabled={locked} onChange={(type) => choices.change(item, { type })} />
            <TitleField value={shown.title} disabled={locked} label={`${RAID_TYPE_LABEL[shown.type]}: what it says`} onChange={(title) => choices.change(item, { title })} />
            <Button type="button" variant="outline" size="sm" disabled={locked || !shown.title.trim()} onClick={onAccept} aria-label={`Accept ${shown.title}`}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                Accept
            </Button>
            <div className="col-start-3 col-end-[-1] flex flex-wrap items-center gap-x-3.5 gap-y-2 pl-0 text-small text-fg-muted">
                {shown.type === 'ACTION' && shown.dueDate && (
                    <DueChip value={shown.dueDate} disabled={locked} label={`Due date of ${shown.title}`} onChange={(dueDate) => choices.change(item, { dueDate })} />
                )}
                {shown.priority && (
                    <span className="inline-flex h-[26px] items-center rounded-control border border-line-strong bg-surface px-1.5">
                        <RaidPriorityPicker
                            value={shown.priority}
                            onChange={(priority) => choices.change(item, { priority })}
                            label={`Priority of ${shown.title}, ${ASSISTANT.name}'s suggestion`}
                            disabled={locked}
                            className="mx-0 h-6 min-w-[5rem]"
                        />
                    </span>
                )}
                {shown.type === 'ACTION' && item.followUp === 'DELIVERABLE' && <Tag color="gray">New deliverable</Tag>}
                {quote && <span className="min-w-0 flex-[1_1_200px] italic">“{quote}”</span>}
                {shown.type === 'ACTION' && item.followUp === 'DELIVERABLE' && (
                    <span className="basis-full not-italic">New scope is your call: set it up in Files when it&apos;s agreed.</span>
                )}
                {choices.isEdited(item) && !locked && (
                    <span className="basis-full text-caption font-normal">
                        Edited ·{' '}
                        <button type="button" onClick={() => choices.reset(item)} className="text-action hover:underline">Reset</button>
                    </span>
                )}
            </div>
        </li>
    )
}

// ── The panel ─────────────────────────────────────────────────────────────────────────────────

export type MemoBrioTab = 'summary' | 'raid'

export interface MemoBrioPanelProps {
    memo: { id: string; title: string; date: string }
    /** The memo as the pane has it, to show each suggestion's line from (only its place is stored). */
    memoText: string | null
    /** What waits on the memo; null before it loads or when nothing does. */
    payload: MemoReviewPayload | null
    readOnly: boolean
    /** Brio is reading the memo: by the sparkle, or just after it was added or edited. */
    reading: 'sparkle' | 'added' | null
    /** Why the last read didn't work. */
    readError: string | null
    /** Why the last accept or dismiss didn't work. */
    actionError: string | null
    /** Its notes changed since Brio read them. */
    changedSinceRead: boolean
    /** Read the memo with Brio: its minutes and RAID suggestions, 2 credits. */
    onRead: () => void
    /** Accepts one suggestion with what the person changed. Throws an error carrying the words to show. */
    onAccept: (item: MemoRaidSuggestion, changes: MemoSuggestionChanges) => Promise<void>
    /** Dismiss all: the waiting suggestions go. */
    onDismissAll: () => void
    /** A tab was chosen: the memo list makes room. */
    onEngage?: () => void
    /**
     * Action items from a read before minutes and RAID Actions, still waiting on an older memo. Shown
     * under the suggestions without a foot of its own: the panel's one "Accept N selected" takes them too.
     */
    legacy?: ReactNode
    /** What's selected in `legacy`, for that one foot. */
    legacySelected?: AcceptSelected | null
    /** Opens on this tab; otherwise RAID while suggestions wait, Summary when none do. */
    initialTab?: MemoBrioTab
}

/** The sparkle's tooltip: what a read does and costs. */
export const MEMO_READ_TIP = 'Read this memo with Brio · 2 credits · minutes and RAID'

export function MemoBrioPanel({
    memo,
    memoText,
    payload,
    readOnly,
    reading,
    readError,
    actionError,
    changedSinceRead,
    onRead,
    onAccept,
    onDismissAll,
    onEngage,
    legacy,
    legacySelected,
    initialTab,
}: MemoBrioPanelProps) {
    const baseId = useId()
    const items = useMemo(() => payload?.raid ?? [], [payload])
    const choices = useSuggestionChoices()
    const [tab, setTab] = useState<MemoBrioTab | null>(initialTab ?? null)
    const [error, setError] = useState<string | null>(null)
    const [acceptingAll, setAcceptingAll] = useState(false)
    // Until someone picks a tab: RAID while suggestions wait, else Summary.
    const current: MemoBrioTab = tab ?? (items.length > 0 || legacy ? 'raid' : 'summary')
    const choose = (t: MemoBrioTab) => { setTab(t); onEngage?.() }

    const matchText = useMemo(() => (memoText !== null ? memoMatchText(memoText) : null), [memoText])
    const quoteOf = (item: MemoRaidSuggestion) => (matchText !== null ? quoteFromAnchor(matchText, item.quoteAt) : null)

    const accept = async (item: MemoRaidSuggestion) => {
        choices.setActing(item.id, true)
        setError(null)
        try {
            await onAccept(item, choices.changesOf(item))
        } catch (e) {
            setError(e instanceof Error && e.message ? e.message : 'That suggestion wasn’t accepted. Try again.')
        } finally {
            choices.setActing(item.id, false)
        }
    }
    const selected = items.filter((i) => choices.isSelected(i) && !choices.isActing(i) && choices.shownOf(i).title.trim())
    // One foot for everything chosen on the memo: its suggestions, then any older action items.
    const selectedTotal = selected.length + (legacySelected?.count ?? 0)
    const acceptSelected = async () => {
        setAcceptingAll(true)
        try {
            for (const item of selected) await accept(item)
            if (legacySelected && legacySelected.count > 0) await legacySelected.accept()
        } finally {
            setAcceptingAll(false)
        }
    }

    // The minutes' action items: this memo's Actions as the RAID tab holds them, waiting (edited, selected)
    // and accepted; never Brio's own follow-ups.
    const actionItems = minutesActionItems([
        ...(payload?.acceptedActions ?? []),
        ...items
            .filter((i) => choices.isSelected(i) && choices.shownOf(i).type === 'ACTION')
            .map((i) => ({ title: choices.shownOf(i).title, dueDate: choices.shownOf(i).dueDate, followUp: i.followUp })),
    ])
    const minutes = payload?.minutes ?? null

    const tabButton = (t: MemoBrioTab, label: ReactNode) => (
        <button
            type="button"
            role="tab"
            id={`${baseId}-${t}`}
            aria-selected={current === t}
            aria-controls={`${baseId}-${t}-panel`}
            onClick={() => choose(t)}
            className={cn(
                '-mb-px inline-flex h-12 items-center gap-1.5 border-b-2 text-ui font-medium transition-colors',
                current === t ? 'border-fg font-semibold text-fg' : 'border-transparent text-fg-muted hover:text-fg',
            )}
        >
            {label}
        </button>
    )

    const sparkle = (
        <Hint label={<span className="flex flex-col gap-0.5"><span>Read this memo with <Brio /></span><span className="opacity-70">2 credits · minutes and RAID</span></span>}>
            <button
                type="button"
                onClick={() => { if (!reading) onRead() }}
                aria-disabled={!!reading || readOnly}
                aria-label={`Read ${memo.title} with ${ASSISTANT.name}`}
                className={cn(
                    'ml-auto inline-flex h-7 w-7 items-center justify-center self-center rounded-control transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30',
                    reading && 'cursor-default hover:bg-transparent',
                )}
            >
                <Sparkles className={cn('h-4 w-4', reading && 'animate-pulse')} style={{ color: BRIO_GREEN }} aria-hidden />
            </button>
        </Hint>
    )

    const notice = (
        <>
            {changedSinceRead && !reading && (
                <p className="flex items-start gap-1.5 border-b border-line px-5 py-3 text-small text-fg-muted" data-testid="memo-changed-since-read">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>Changed since <Brio /> read it. The sparkle reads it again.</span>
                </p>
            )}
            {(readError || actionError || error) && (
                <p className="flex items-start gap-1 border-b border-line px-5 py-3 text-small text-danger" role="alert">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    {readError ?? actionError ?? error}
                </p>
            )}
        </>
    )

    const readingNow = reading && (
        <div className="flex items-start gap-2 px-5 py-5" aria-busy="true">
            <LoadingAnnouncement label={`${ASSISTANT.name} is reading the memo`} />
            <ThinkingDots className="shrink-0" />
            <p className="text-small text-fg-muted">
                <Brio /> is reading the memo for its minutes and RAID entries. They&apos;ll appear here in a moment.
            </p>
        </div>
    )

    const neverRead = !payload?.minutes && items.length === 0 && !legacy && !reading

    return (
        <section aria-label={`${ASSISTANT.name} on this memo`} className="flex min-w-0 basis-full flex-col border-t border-line @[1040px]:min-h-0 @[1040px]:border-t-0">
            <div className="flex flex-none items-end gap-5 border-b border-line px-5" role="tablist" aria-label="From this memo" data-demo-tour="memo-brio-tabs">
                {tabButton('summary', 'Summary')}
                {tabButton('raid', <>RAID {items.length > 0 && <span className="font-normal tabular-nums text-fg-subtle">{items.length}</span>}</>)}
                {!readOnly && sparkle}
            </div>

            <div className="flex flex-col @[1040px]:min-h-0 @[1040px]:flex-1 @[1040px]:overflow-y-auto">
                {notice}
                {readingNow || (neverRead ? (
                    <div className="px-5 py-6">
                        <p className="text-ui text-fg-muted">
                            <Brio /> reads this memo for the meeting&apos;s minutes, and for its Risks, Actions, Issues and Decisions.
                        </p>
                        <p className="mt-2 text-small text-fg-muted">You can change each suggestion before accepting it, and nothing changes until you do.</p>
                    </div>
                ) : current === 'summary' ? (
                    <div role="tabpanel" id={`${baseId}-summary-panel`} aria-labelledby={`${baseId}-summary`} data-demo-tour="memo-brio-summary">
                        {minutes ? (
                            <>
                                <div className="px-5 pb-4 pt-[18px]">
                                    <h4 className="text-ui font-semibold text-fg"><Brio className="text-action" /> wrote the minutes</h4>
                                    <p className="mt-1.5 text-caption font-normal text-fg-muted">For the people at the meeting. Read them before you send them.</p>
                                    <div className="mt-3.5 flex flex-wrap gap-2">
                                        <CopyButton label="Copy subject" get={() => ({ text: minutes.subject })} />
                                        <CopyButton
                                            label="Copy summary"
                                            get={() => ({ text: minutesPlainText(minutes, memo.date, actionItems), html: minutesHtml(minutes, memo.date, actionItems) })}
                                        />
                                    </div>
                                </div>
                                <MinutesView minutes={minutes} meetingDate={memo.date} actions={actionItems} />
                            </>
                        ) : (
                            <p className="px-5 py-6 text-small text-fg-muted">
                                {readOnly
                                    ? <><Brio /> didn&apos;t write minutes for this memo.</>
                                    : <><Brio /> hasn&apos;t written minutes for this memo yet. The sparkle reads it: 2 credits.</>}
                            </p>
                        )}
                    </div>
                ) : (
                    <div role="tabpanel" id={`${baseId}-raid-panel`} aria-labelledby={`${baseId}-raid`} className="flex flex-1 flex-col">
                        {items.length > 0 ? (
                            <>
                                <div className="px-5 pb-4 pt-[18px]">
                                    <h4 className="text-ui font-semibold text-fg">
                                        <Brio className="text-action" /> suggests {items.length} for RAID
                                    </h4>
                                    <p className="mt-1.5 text-caption font-normal text-fg-muted">
                                        Click a title, type, date or priority to change it. Nothing changes until you accept. Owner and status are set on the RAID tab.
                                    </p>
                                </div>
                                <ul data-demo-tour="memo-brio-raid">
                                    {items.map((item) => (
                                        <SuggestionRow key={item.id} item={item} choices={choices} quote={quoteOf(item)} readOnly={readOnly || acceptingAll} onAccept={() => void accept(item)} />
                                    ))}
                                </ul>
                            </>
                        ) : !legacy && (
                            <p className="px-5 py-6 text-small text-fg-muted">Nothing from this memo waits for RAID.</p>
                        )}
                        {legacy}
                        {(payload?.review?.skipped?.length ?? 0) > 0 && matchText !== null && (
                            <details className="border-t border-line px-5 py-4 text-small text-fg-muted">
                                <summary className="cursor-pointer select-none">
                                    {payload!.review!.skipped.length} line{payload!.review!.skipped.length === 1 ? '' : 's'} {payload!.review!.skipped.length === 1 ? 'wasn’t' : 'weren’t'} suggested
                                </summary>
                                <div className="mt-2 space-y-1">
                                    {payload!.review!.skipped.map((s, i) => {
                                        const line = quoteFromAnchor(matchText, s.quoteAt)
                                        return line ? <p key={i}>“{line}” {s.reason.replace(/[.\s]+$/, '')}, so it isn&apos;t suggested.</p> : null
                                    })}
                                </div>
                            </details>
                        )}
                        {(items.length > 0 || legacy) && !readOnly && (
                            <div className="sticky bottom-0 mt-auto flex flex-wrap items-center justify-end gap-2.5 border-t border-line bg-surface px-5 py-4" data-demo-tour="memo-accept">
                                <Button type="button" variant="ghost" size="sm" onClick={onDismissAll} disabled={acceptingAll}>Dismiss all</Button>
                                <Button type="button" variant="greenCta" size="sm" disabled={selectedTotal === 0 || acceptingAll} onClick={() => void acceptSelected()}>
                                    {acceptingAll ? 'Accepting…' : `Accept ${selectedTotal} selected`}
                                </Button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </section>
    )
}
