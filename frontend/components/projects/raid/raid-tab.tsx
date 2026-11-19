'use client'

import { useCallback, useEffect, useId, useRef, useState, type ComponentProps } from 'react'
import Link from 'next/link'
import { AlertCircle, AlertTriangle, CalendarDays, Check, CircleDot, Clock3, Link2, ListChecks, Loader2, MoreHorizontal, Plus, Shapes, SignalHigh, Sparkles, Type as TypeIcon, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LoadingAnnouncement, ShimmerBar, ShimmerBlock } from '@/components/ui/shimmer'
import {
    NotionTable,
    NotionTableActions,
    NotionTableActionsHead,
    NotionTableBody,
    NotionTableCell,
    NotionTableHead,
    NotionTableHeader,
    NotionTableRow,
} from '@/components/ui/notion-table'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Tag } from '@/components/ui/tag'
import { Hint, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Brio } from '@/components/ui/brio'
import { ThinkingDots } from '@/components/brio/brio-typing'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { ASSISTANT, BRIO_GREEN } from '@/lib/ai/assistant'
import { BRIO_RAID_FAILED, brioFailureReason } from '@/lib/ai/brio-failure'
import { fetchWithTimeout } from '@/lib/ai/fetch-timeout'
import { failureFrom, failureReason } from '@/lib/files/action-failure'
import type { TagColor } from '@/lib/ui/status-colors'
import { STAGE_PILL_CLASSES } from '@/lib/ui/status'
import { RaidPriorityMark, RaidPriorityPicker } from './raid-priority'
import {
    RAID_CHANGED_EVENT,
    RAID_NOTES_MAX,
    RAID_PRIORITY_LABEL,
    RAID_TITLE_MAX,
    RAID_TYPES,
    RAID_TYPE_LABEL,
    RAID_TYPE_LETTER,
    RAID_TYPE_STAGE,
    RAID_TYPE_PLURAL,
    attachPhrase,
    displayTypeOf,
    dueDay,
    filterRaidItems,
    hasPriority,
    isAutoSource,
    isLegacyAssumption,
    isLive,
    lastCheckedPhrase,
    memoReviewHref,
    nextWeekStart,
    raidCountsByType,
    raidOpenCount,
    raidStatusLabel,
    raidTone,
    shortDay,
    sourceHref,
    waitsOnMemo,
    type RaidChangedDetail,
    type RaidConversationState,
    type RaidItemView,
    type RaidLogPayload,
    type RaidMember,
    type RaidPriority,
    type RaidSourceView,
    type RaidStateFilter,
    type RaidTone,
    type RaidType,
    type RaidTypeFilter,
} from '@/lib/raid/raid-shared'

/**
 * The RAID tab (.claude/plans/brio-features-round-2.md, §9; a Discussions sub-tab until 2026-11-14): the engagement's Risks, Actions,
 * Issues and Decisions, internal only (Actions replaced Assumptions on 2026-11-15, .claude/plans/raid-actions-memo-minutes.md).
 * An Action has an owner and a due date, and is its owner's reminder on Home and in the Inbox. Status, health and Board entries keep themselves current; Brio's
 * suggestions from threads and memos wait in a strip until a person accepts or dismisses them; people
 * add their own, own them and write the mitigation.
 *
 * `RaidTabView` is the tab alone, with what it does passed in, so /tour renders the same tab over
 * entries kept in memory (components/demo/demo-raid.tsx). `RaidTab` is the app's.
 */

// ── Pieces ────────────────────────────────────────────────────────────────────────────────────

/** The type's letter in a gray square: R, A, I or D. */
export function RaidTypeBadge({ type, decorative = false, small = false }: {
    type: RaidType
    /** Beside the type's own name: hidden from screen readers. */
    decorative?: boolean
    /** The legend's size, in the filter chips. */
    small?: boolean
}) {
    // The full word on hover, wherever a letter shows (Deepak, 2026-11-14): not everyone reads R, A, I, D.
    return (
        <Hint label={RAID_TYPE_LABEL[type]}>
            <span
                className={cn(
                    'inline-flex shrink-0 items-center justify-center rounded-control font-bold',
                    small ? 'h-4 w-4 text-[10px] leading-none' : 'h-[22px] w-[22px] text-caption',
                    // The Board's colors for state (RAID_TYPE_STAGE): no new ones.
                    STAGE_PILL_CLASSES[RAID_TYPE_STAGE[type]],
                )}
                aria-hidden={decorative || undefined}
            >
                <span aria-hidden>{RAID_TYPE_LETTER[type]}</span>
                {!decorative && <span className="sr-only">{RAID_TYPE_LABEL[type]}</span>}
            </span>
        </Hint>
    )
}

/**
 * A link out of the RAID log. In the app, a plain link to another tab's path. On /tour, where links are
 * a query of the page's own (`?tab=…`, raid-shared.ts), it moves in the page as the tour's tabs do: a
 * full load would start the tour over, its panel open again.
 */
export function RaidLink({ href, onClick, className, children, ...rest }: ComponentProps<'a'> & { href: string }) {
    // The full load takes a moment (the engagement page renders on the server), and a link that did
    // nothing visible read as broken: it shows a spinner from the click until the page goes.
    const [opening, setOpening] = useState(false)
    useEffect(() => {
        // Coming back with the browser's Back button can restore this page as it was left.
        const reset = () => setOpening(false)
        window.addEventListener('pageshow', reset)
        return () => window.removeEventListener('pageshow', reset)
    }, [])
    if (href.startsWith('?')) return <Link href={href} onClick={onClick} className={className} {...rest}>{children}</Link>
    return (
        <a
            {...rest}
            href={href}
            aria-busy={opening || undefined}
            className={cn(className, opening && 'cursor-progress')}
            onClick={(e) => {
                onClick?.(e)
                // A new tab or window leaves this page where it is.
                if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                setOpening(true)
            }}
        >
            {opening && <Loader2 className="mr-1 h-3 w-3 shrink-0 animate-spin" aria-hidden />}
            {children}
            {opening && <span className="sr-only"> · opening</span>}
        </a>
    )
}

/** Where an entry came from, linked to it when it can be: the thread, the memo, the item on the Board. */
export function RaidSourceChip({ source, engagementBase }: { source: RaidSourceView; engagementBase: string }) {
    const href = sourceHref(engagementBase, source)
    const className = 'inline-flex h-5 max-w-full items-center whitespace-nowrap rounded-control bg-surface-muted px-1.5 text-caption text-fg-muted'
    if (!href) return <span className={className}><span className="truncate">{source.label}</span></span>
    return (
        <RaidLink href={href} className={cn(className, 'hover:text-fg hover:underline')} title={source.kind === 'MEMO' ? 'Open the memo' : undefined}>
            <span className="truncate">{source.label}</span>
        </RaidLink>
    )
}

const TONE_COLOR: Record<RaidTone, TagColor> = { open: 'yellow', late: 'red', closed: 'green', recorded: 'blue', suggested: 'gray' }

export function RaidStatusTag({ item }: { item: Pick<RaidItemView, 'status' | 'type' | 'overdue'> }) {
    return <Tag color={TONE_COLOR[raidTone(item)]}>{raidStatusLabel(item)}</Tag>
}

/** An Action's due date: the day, in red once it's past; a date field while it's changed. */
function DueCell({ item, readOnly, onChange }: {
    item: RaidItemView
    readOnly: boolean
    onChange: (dueDate: string) => Promise<boolean>
}) {
    const [editing, setEditing] = useState(false)
    const [busy, setBusy] = useState(false)
    if (item.type !== 'ACTION') return <span className="text-fg-subtle">·</span>
    const label = item.dueDate ? dueDay(item.dueDate) : 'No date'
    const shown = <span className={cn(item.overdue && 'font-medium text-danger')}>{label}{item.overdue ? ' · overdue' : ''}</span>
    if (readOnly || !isLive(item)) return shown
    if (editing) {
        return (
            <Input
                type="date"
                autoFocus
                aria-label={`Due date of ${item.title}`}
                defaultValue={item.dueDate ?? ''}
                disabled={busy}
                onBlur={() => setEditing(false)}
                onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setEditing(false) } }}
                onChange={async (e) => {
                    const next = e.target.value
                    if (!next || next === item.dueDate) return
                    setBusy(true)
                    const ok = await onChange(next)
                    setBusy(false)
                    if (ok) setEditing(false)
                }}
                className="h-7 w-[9.5rem] px-2 text-small"
            />
        )
    }
    return (
        <button
            type="button"
            onClick={() => setEditing(true)}
            className="-mx-1 rounded-control px-1 text-left hover:bg-surface-hover"
            aria-label={`Due ${label} for ${item.title}. Change`}
        >
            {shown}
        </button>
    )
}

/** Text a person edits in place: shown as text, an input while editing. Enter or leaving the field saves. */
function InlineText({ value, placeholder, label, maxLength, onSave, className }: {
    value: string | null
    placeholder: string
    label: string
    maxLength: number
    onSave: (next: string | null) => Promise<boolean>
    className?: string
}) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(value ?? '')
    const [busy, setBusy] = useState(false)

    const commit = async () => {
        const next = draft.replace(/\s+/g, ' ').trim()
        if (next === (value ?? '')) { setEditing(false); return }
        setBusy(true)
        const ok = await onSave(next || null)
        setBusy(false)
        if (ok) setEditing(false)
    }

    if (editing) {
        return (
            <Input
                autoFocus
                aria-label={label}
                value={draft}
                maxLength={maxLength}
                disabled={busy}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => void commit()}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); void commit() }
                    if (e.key === 'Escape') { e.preventDefault(); setDraft(value ?? ''); setEditing(false) }
                }}
                className="h-7 min-w-[12rem] px-2 text-small"
            />
        )
    }
    return (
        <button
            type="button"
            onClick={() => { setDraft(value ?? ''); setEditing(true) }}
            className={cn('-mx-1 rounded-control px-1 text-left hover:bg-surface-hover', className)}
            aria-label={`${label}: ${value || 'none'}. Edit`}
        >
            {value || <span className="text-fg-subtle">{placeholder}</span>}
        </button>
    )
}

const NO_OWNER = '__none'

/** Who owns an entry: one of the engagement's Leads or Contributors · Full Access. */
function OwnerCell({ item, members, readOnly, onChange }: {
    item: RaidItemView
    members: RaidMember[]
    readOnly: boolean
    onChange: (ownerUserId: string | null) => void
}) {
    if (readOnly || !isLive(item)) return item.ownerName ? <span>{item.ownerName}</span> : <span className="text-fg-subtle">·</span>
    // Someone no longer on the engagement still shows as the owner until changed.
    const options = item.ownerUserId && !members.some((m) => m.userId === item.ownerUserId)
        ? [...members, { userId: item.ownerUserId, name: item.ownerName ?? 'Former member' }]
        : members
    return (
        <Select value={item.ownerUserId ?? NO_OWNER} onValueChange={(v) => onChange(v === NO_OWNER ? null : v)}>
            <SelectTrigger
                aria-label={`Owner of ${item.title}`}
                className="-mx-1 h-7 w-auto min-w-[6rem] gap-1 border-transparent bg-transparent px-1 text-small hover:bg-surface-hover"
            >
                <SelectValue placeholder="Assign">{item.ownerName ?? <span className="text-fg-subtle">Assign</span>}</SelectValue>
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={NO_OWNER}>No owner</SelectItem>
                {options.map((m) => <SelectItem key={m.userId} value={m.userId}>{m.name}</SelectItem>)}
            </SelectContent>
        </Select>
    )
}

// ── Adding an entry ───────────────────────────────────────────────────────────────────────────

export interface RaidNewItem {
    type: RaidType
    title: string
    notes: string | null
    /** Risks and Issues: Medium unless the person chose otherwise. */
    priority?: RaidPriority
    /** Actions: who owns it. Left out, it's the person adding it. */
    ownerUserId?: string | null
    /** Actions: YYYY-MM-DD. */
    dueDate?: string
}

/** The owner picker's own choice for "the person adding it", which the server fills in. */
const ME = '__me'

/** What each type is, under the pane's title. */
const TYPE_HINT: Record<RaidType, string> = {
    ASSUMPTION: 'What people agreed.',
    RISK: 'What could go wrong.',
    ACTION: 'Who does what, by when.',
    ISSUE: 'What has already gone wrong.',
    DECISION: 'What people agreed.',
}

/** Low to High, as a person reads a scale; the picker in the table lists High first. */
const PRIORITY_SCALE: readonly RaidPriority[] = ['LOW', 'MEDIUM', 'HIGH']

/** A row of choices, one pressed, in the pane: the type and a Risk's or an Issue's priority. */
function Segmented<T extends string>({ label, value, options, onChange }: {
    label: string
    value: T
    options: readonly { value: T; label: string; badge?: RaidType }[]
    onChange: (next: T) => void
}) {
    return (
        <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label={label}>
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={value === o.value}
                    onClick={() => onChange(o.value)}
                    className={cn(
                        'inline-flex h-7 items-center gap-1.5 rounded-control px-2.5 text-small font-medium',
                        value === o.value ? 'bg-surface-selected text-fg' : 'text-fg-muted hover:bg-surface-hover',
                    )}
                >
                    {o.badge && <RaidTypeBadge type={o.badge} decorative small />}
                    {o.label}
                </button>
            ))}
        </div>
    )
}

/**
 * + Add's side pane (2026-11-19, the approved mock): the log stays where it is behind it. The fields
 * follow the row it makes, title first, and only those its type uses: an Action asks an owner and a
 * due date and no priority; a Decision is its title.
 */
function AddItemSheet({ open, initialType, members, onAdd, onOpenChange }: {
    open: boolean
    /** The type filter's, when one is on. */
    initialType: RaidType
    members: RaidMember[]
    onAdd: (input: RaidNewItem) => Promise<string | null>
    onOpenChange: (open: boolean) => void
}) {
    const titleId = useId()
    const [type, setType] = useState<RaidType>(initialType)
    const [priority, setPriority] = useState<RaidPriority>('MEDIUM')
    const [title, setTitle] = useState('')
    const [notes, setNotes] = useState('')
    const [owner, setOwner] = useState<string>(ME)
    const [dueDate, setDueDate] = useState(() => nextWeekStart())
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const isAction = type === 'ACTION'

    const submit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!title.trim()) { setError('Give the entry a title.'); return }
        if (isAction && !dueDate) { setError('Choose a due date.'); return }
        setBusy(true)
        setError(null)
        const failed = await onAdd({
            type,
            title: title.trim(),
            notes: type === 'DECISION' ? null : notes.trim() || null,
            ...(hasPriority(type) ? { priority } : {}),
            ...(isAction ? { dueDate, ...(owner === ME ? {} : { ownerUserId: owner === NO_OWNER ? null : owner }) } : {}),
        })
        setBusy(false)
        if (failed) setError(failed)
    }

    return (
        <Sheet open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
            <SheetContent side="right" className="flex w-full flex-col sm:max-w-[460px]">
                <form onSubmit={(e) => void submit(e)} className="flex min-h-0 flex-1 flex-col" aria-label="Add a RAID entry">
                    <div className="flex flex-col gap-1 border-b border-line px-5 pb-3.5 pt-4">
                        <div className="flex items-center gap-2 pr-8">
                            <RaidTypeBadge type={type} decorative />
                            <SheetTitle className="text-h3 text-fg">New {RAID_TYPE_LABEL[type]}</SheetTitle>
                        </div>
                        <SheetDescription className="text-small text-fg-muted">{TYPE_HINT[type]} Internal only.</SheetDescription>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-5 py-[18px]">
                        <div className="flex flex-col gap-1.5">
                            <span className="text-caption text-fg-muted">Type</span>
                            <Segmented
                                label="Type"
                                value={type}
                                onChange={setType}
                                options={RAID_TYPES.map((t) => ({ value: t, label: RAID_TYPE_LABEL[t], badge: t }))}
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor={titleId} className="text-caption text-fg-muted">Title</label>
                            <Input id={titleId} value={title} maxLength={RAID_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder="Short, in your words" autoFocus />
                        </div>
                        {hasPriority(type) && (
                            <div className="flex flex-col gap-1.5">
                                <span className="text-caption text-fg-muted">Priority</span>
                                <Segmented
                                    label="Priority"
                                    value={priority}
                                    onChange={setPriority}
                                    options={PRIORITY_SCALE.map((p) => ({ value: p, label: RAID_PRIORITY_LABEL[p] }))}
                                />
                            </div>
                        )}
                        {isAction && (
                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1.5">
                                    <span id={`${titleId}-owner`} className="text-caption text-fg-muted">Owner</span>
                                    <Select value={owner} onValueChange={setOwner}>
                                        <SelectTrigger aria-labelledby={`${titleId}-owner`} className="h-9 text-small">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={ME}>You</SelectItem>
                                            {members.map((m) => <SelectItem key={m.userId} value={m.userId}>{m.name}</SelectItem>)}
                                            <SelectItem value={NO_OWNER}>No owner</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label htmlFor={`${titleId}-due`} className="text-caption text-fg-muted">Due</label>
                                    <Input id={`${titleId}-due`} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-9 text-small" />
                                </div>
                            </div>
                        )}
                        {type !== 'DECISION' && (
                            <div className="flex flex-col gap-1.5">
                                <label htmlFor={`${titleId}-notes`} className="text-caption text-fg-muted">
                                    {isAction ? 'Next step' : 'Mitigation · next step'} <span className="text-fg-subtle">(optional)</span>
                                </label>
                                <Textarea id={`${titleId}-notes`} value={notes} maxLength={RAID_NOTES_MAX} onChange={(e) => setNotes(e.target.value)} rows={3} className="resize-none text-ui" />
                            </div>
                        )}
                        {error && (
                            <p className="flex items-start gap-1 text-small text-danger" role="alert">
                                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                                {error}
                            </p>
                        )}
                    </div>
                    <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">
                        <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
                        <Button type="submit" size="sm" disabled={busy}>
                            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                            Add to the log
                        </Button>
                    </div>
                </form>
            </SheetContent>
        </Sheet>
    )
}

// ── Brio's check ──────────────────────────────────────────────────────────────────────────────

/** 28px icon buttons, each named by a Hint and an aria-label, as on the Overview's Summary. */
const ICON_BUTTON = 'inline-flex h-7 w-7 items-center justify-center rounded-control text-fg-muted transition-colors duration-ui-fast hover:bg-surface-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent'

/** The status's tooltip: what Brio has read, and when it last checked. */
export function checkStatusTip(state: Exclude<RaidConversationState, 'none'>, lastCheckedAt: string | null, now?: Date): string {
    const when = lastCheckedPhrase(lastCheckedAt, now)
    const name = ASSISTANT.name
    if (state === 'current') return `${name} has read every thread message.${when ? ` Last checked ${when}.` : ''}`
    return when
        ? `Threads changed since ${name} last checked, ${when}. ${name} reads them once a day, or now with the sparkle.`
        : `${name} hasn't read this engagement's threads yet. It reads them once a day, or now with the sparkle.`
}

/**
 * Whether Brio has read the threads and memos as they are now, as the Summary says it is out of date:
 * quiet when it has, orange when they changed since its last check (lib/raid/raid-fingerprint.ts).
 * When it last checked is in the tooltip. Nothing to read: nothing shown.
 */
function CheckStatus({ state, lastCheckedAt, checking, now }: {
    state: RaidConversationState
    lastCheckedAt: string | null
    checking: boolean
    now?: Date
}) {
    if (checking) {
        return (
            <span className="mr-1.5 inline-flex items-center gap-1.5 text-caption text-fg-muted" aria-live="polite">
                <ThinkingDots />
                <span><Brio /> is checking…</span>
            </span>
        )
    }
    if (state === 'none') return null
    const tip = checkStatusTip(state, lastCheckedAt, now)
    return (
        <TooltipProvider delayDuration={300}>
            <Tooltip>
                <TooltipTrigger asChild>
                    {state === 'current' ? (
                        <span className="mr-1.5 inline-flex shrink-0 cursor-default items-center gap-1 text-caption text-fg-subtle">
                            <Check className="h-3 w-3" aria-hidden />
                            Up to date
                        </span>
                    ) : (
                        <span className="mr-1.5 inline-flex shrink-0 cursor-default items-center gap-1 text-caption font-medium text-tag-orange-fg">
                            <AlertTriangle className="h-3 w-3" aria-hidden />
                            Out of date
                        </span>
                    )}
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[260px] text-xs">{tip}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}

// ── The view ──────────────────────────────────────────────────────────────────────────────────

/** What changes an entry: each answers with the words to show when it didn't work, or null. */
export interface RaidHandlers {
    /** `suggested`: how many new suggestions the check made, for the note that offers to review them. */
    onCheckNow: () => Promise<{ message: string | null; error: string | null; suggested?: number }>
    /** `priority`: the one chosen on the card, when it differs from Brio's. */
    /** `priority` and `title`: as changed on the card before accepting, if they were. */
    onAccept: (item: RaidItemView, priority?: RaidPriority, title?: string) => Promise<string | null>
    onDismiss: (item: RaidItemView) => Promise<string | null>
    onAdd: (input: RaidNewItem) => Promise<string | null>
    onEdit: (item: RaidItemView, patch: { title?: string | null; notes?: string | null; ownerUserId?: string | null; priority?: RaidPriority; dueDate?: string | null }) => Promise<string | null>
    onClose: (item: RaidItemView) => Promise<string | null>
    onReopen: (item: RaidItemView) => Promise<string | null>
}

export interface RaidTabViewProps extends RaidHandlers {
    /** Null while loading. */
    log: RaidLogPayload | null
    loadError?: string | null
    onRetry?: () => void
    engagementBase: string
    /** A completed engagement: listed, nothing changed. */
    readOnly: boolean
    /** For tests and /tour: the clock "Checked today" reads. */
    now?: Date
}

const TYPE_FILTERS: RaidTypeFilter[] = ['ALL', ...RAID_TYPES]

/**
 * The log's shape while it loads: the toolbar, Brio's suggestions strip, the filters and the table, so
 * nothing jumps when it arrives. The table rows match the loaded row: type, priority, item, source, owner, status.
 */
function RaidLogSkeleton() {
    const titleWidths = ['w-3/5', 'w-1/2', 'w-2/3', 'w-2/5', 'w-1/2']
    return (
        <div className="flex flex-col gap-4" aria-busy="true">
            <LoadingAnnouncement label="Loading the RAID log" />
            <div className="flex items-center gap-2">
                <ShimmerBar className="h-5 w-24 rounded-control" />
                <span className="flex-1" />
                <ShimmerBar className="h-3 w-20" />
                <ShimmerBlock className="h-7 w-7" />
                <ShimmerBlock className="h-7 w-7" />
            </div>
            <div className="rounded-card border border-line">
                <div className="px-3.5 py-3"><ShimmerBar className="w-48" /></div>
                {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-start gap-2.5 border-t border-line px-3.5 py-3">
                        <ShimmerBlock className="h-[22px] w-[22px]" />
                        <div className="flex flex-1 flex-col gap-2">
                            <ShimmerBar className={titleWidths[i]} />
                            <ShimmerBar className="h-2 w-1/3" />
                        </div>
                        <ShimmerBar className="h-6 w-16 rounded-control" />
                        <ShimmerBar className="h-6 w-16 rounded-control" />
                    </div>
                ))}
            </div>
            <div className="flex gap-1.5">
                {['w-12', 'w-16', 'w-24', 'w-14', 'w-20'].map((w, i) => <ShimmerBar key={i} className={`h-6 rounded-control ${w}`} />)}
            </div>
            <div className="border-t border-line">
                {titleWidths.map((w, i) => (
                    <div key={i} className="flex h-[34px] items-center gap-4 border-b border-line px-2.5">
                        <ShimmerBlock className="h-[22px] w-[22px]" />
                        <ShimmerBar className="w-16" />
                        <div className="flex-1"><ShimmerBar className={w} /></div>
                        <ShimmerBar className="h-5 w-20 rounded-control" />
                        <ShimmerBar className="w-16" />
                        <ShimmerBar className="h-5 w-14 rounded-control" />
                    </div>
                ))}
            </div>
        </div>
    )
}

/**
 * The Suggested view (2026-11-19): Brio's suggestions on their own, apart from the log, each with the
 * line it came from. A thread's is accepted or dismissed here, its title and priority editable first; a
 * memo's waits on the memo, with its action items, and links there.
 */
function SuggestedList({ suggestions, engagementBase, readOnly, busyIds, titleFor, onTitle, priorityFor, onPriority, onAccept, onDismiss }: {
    suggestions: RaidItemView[]
    engagementBase: string
    readOnly: boolean
    busyIds: ReadonlySet<string>
    titleFor: (s: RaidItemView) => string
    onTitle: (s: RaidItemView, title: string) => void
    priorityFor: (s: RaidItemView) => RaidPriority | null
    onPriority: (s: RaidItemView, p: RaidPriority) => void
    onAccept: (s: RaidItemView) => void
    onDismiss: (s: RaidItemView) => void
}) {
    return (
        <section aria-label={`${ASSISTANT.name}'s suggestions`} className="flex flex-col gap-3">
            <p className="text-small text-fg-muted">From new messages and memos. Nothing enters the log until someone accepts it.</p>
            {suggestions.length === 0 ? (
                <p className="border-y border-line px-2.5 py-2.5 text-small text-fg-muted">
                    Nothing waiting. What <Brio noIcon /> suggests from threads and memos shows up here.
                </p>
            ) : (
                <NotionTable>
                    <NotionTableHeader>
                        <NotionTableHead icon={<Shapes />} className="w-[72px]">Type</NotionTableHead>
                        <NotionTableHead icon={<TypeIcon />}>Item · what it came from</NotionTableHead>
                        <NotionTableHead icon={<SignalHigh />} className="w-[112px]">Priority</NotionTableHead>
                        <NotionTableHead icon={<Link2 />}>Source</NotionTableHead>
                        <NotionTableActionsHead />
                    </NotionTableHeader>
                    <NotionTableBody>
                        {suggestions.map((s) => {
                            const source = s.sources[0]
                            const onMemo = waitsOnMemo(s)
                            const memoId = s.sources.find((x) => x.kind === 'MEMO')?.memoId ?? null
                            const editable = !readOnly && !onMemo && !s.attachedTo
                            const busy = busyIds.has(s.id)
                            return (
                                <NotionTableRow key={s.id} data-testid={`raid-suggestion-${s.id}`}>
                                    <NotionTableCell><RaidTypeBadge type={s.type} /></NotionTableCell>
                                    <NotionTableCell className="min-w-[14rem] max-w-[24rem] py-1.5">
                                        {editable ? (
                                            // Editable before it's accepted, as a memo's action items are.
                                            <Input
                                                value={titleFor(s)}
                                                onChange={(e) => onTitle(s, e.target.value)}
                                                disabled={busy}
                                                maxLength={RAID_TITLE_MAX}
                                                aria-label={`${RAID_TYPE_LABEL[s.type]}: what the entry says`}
                                                className="-ml-2 h-7 border-transparent bg-transparent px-2 text-ui font-medium shadow-none hover:border-line focus-visible:border-line-strong"
                                            />
                                        ) : (
                                            <span className="block truncate font-medium text-fg" title={s.title}>{s.title}</span>
                                        )}
                                        <span className="mt-0.5 block truncate text-small text-fg-muted">
                                            {onMemo
                                                ? 'Waits on the memo, with its action items'
                                                : [s.attachedTo ? attachPhrase(s.attachedTo) : null, source?.quote ? `“${source.quote}”` : null].filter(Boolean).join(' · ') || `${ASSISTANT.name}'s suggestion`}
                                        </span>
                                    </NotionTableCell>
                                    <NotionTableCell className="whitespace-nowrap">
                                        {s.priority && editable ? (
                                            <RaidPriorityPicker
                                                value={priorityFor(s) ?? s.priority}
                                                onChange={(p) => onPriority(s, p)}
                                                label={`Priority of ${s.title}`}
                                                disabled={busy}
                                            />
                                        ) : (
                                            <RaidPriorityMark priority={s.attachedTo ? null : s.priority} />
                                        )}
                                    </NotionTableCell>
                                    <NotionTableCell className="whitespace-nowrap">
                                        <span className="inline-flex items-center gap-1">
                                            {source && <RaidSourceChip source={source} engagementBase={engagementBase} />}
                                            {s.internalSource && <Tag color="gray">Internal source</Tag>}
                                        </span>
                                    </NotionTableCell>
                                    {!readOnly && (
                                        <NotionTableCell className="w-px whitespace-nowrap py-1 pr-2 text-right">
                                            {onMemo ? (
                                                <RaidLink href={memoReviewHref(engagementBase, memoId)} className="px-1.5 text-small font-medium text-action hover:underline">
                                                    Review in Memos
                                                </RaidLink>
                                            ) : (
                                                <span className="inline-flex items-center gap-1">
                                                    <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onDismiss(s)} aria-label={`Dismiss ${s.title}`}>
                                                        Dismiss
                                                    </Button>
                                                    <Button type="button" variant="outline" size="sm" disabled={busy || !titleFor(s).trim()} onClick={() => onAccept(s)} aria-label={`Accept ${s.title}`}>
                                                        Accept
                                                    </Button>
                                                </span>
                                            )}
                                        </NotionTableCell>
                                    )}
                                </NotionTableRow>
                            )
                        })}
                    </NotionTableBody>
                </NotionTable>
            )}
        </section>
    )
}

/** Where the log remembers the suggestions this browser has seen, so only new ones shimmer the button. */
const seenKey = (engagementBase: string) => `firma:raid-seen-suggestions:${engagementBase || 'tour'}`

function readSeen(engagementBase: string): Set<string> | null {
    try {
        const raw = window.localStorage.getItem(seenKey(engagementBase))
        return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
    } catch {
        return null
    }
}

function writeSeen(engagementBase: string, ids: string[]) {
    try {
        window.localStorage.setItem(seenKey(engagementBase), JSON.stringify(ids))
    } catch {
        // Without storage the button shimmers again next time; nothing else depends on it.
    }
}

/** How long a row stays tinted after it's added or accepted: long enough to find it. */
const FLASH_MS = 3_000

export function RaidTabView({ log, loadError, onRetry, engagementBase, readOnly: readOnlyProp, now, ...handlers }: RaidTabViewProps) {
    const [typeFilter, setTypeFilter] = useState<RaidTypeFilter>('ALL')
    const [stateFilter, setStateFilter] = useState<RaidStateFilter>('open')
    // The log, or Brio's suggestions in their own view (2026-11-19). `?view=suggested` opens on them.
    const [view, setView] = useState<'log' | 'suggested'>(() =>
        typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('view') === 'suggested' ? 'suggested' : 'log')
    const [adding, setAdding] = useState(false)
    const [addKey, setAddKey] = useState(0)
    const [checking, setChecking] = useState(false)
    const [checkNote, setCheckNote] = useState<{ text: string; error: boolean; review?: boolean } | null>(null)
    const [actionError, setActionError] = useState<string | null>(null)
    const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set())
    // A suggestion's priority as changed on its row, before it's accepted.
    const [chosenPriority, setChosenPriority] = useState<Record<string, RaidPriority>>({})
    // A suggestion's title as edited on its row, before it's accepted.
    const [editedTitle, setEditedTitle] = useState<Record<string, string>>({})
    // Rows just added or accepted, tinted for a moment so the eye finds them.
    const [flash, setFlash] = useState<ReadonlySet<string>>(new Set())
    // The Suggested button's one shimmer when suggestions arrive that this browser hasn't seen.
    const [shimmer, setShimmer] = useState(false)
    // The log's ids just before an add, to find the one it made.
    const beforeAdd = useRef<Set<string> | null>(null)
    // Set when a suggestion is accepted or dismissed: the view returns to the log once none are left.
    const handledSuggestion = useRef(false)
    const titleFor = (s: RaidItemView) => editedTitle[s.id] ?? s.title
    const changedTitle = (s: RaidItemView) => {
        const t = titleFor(s).trim()
        return t && t !== s.title ? t : undefined
    }

    const readOnly = readOnlyProp || !!log?.readOnly
    const items = log?.items
    const suggestionIds = (log?.suggestions ?? []).map((s) => s.id).join(',')

    const flashRows = useCallback((ids: string[]) => {
        if (ids.length === 0) return
        setFlash((f) => { const n = new Set(f); ids.forEach((id) => n.add(id)); return n })
        window.setTimeout(() => setFlash((f) => { const n = new Set(f); ids.forEach((id) => n.delete(id)); return n }), FLASH_MS)
    }, [])

    // The row an add made: whichever id wasn't in the log before it.
    useEffect(() => {
        const before = beforeAdd.current
        if (!before || !items) return
        const added = items.filter((i) => !before.has(i.id)).map((i) => i.id)
        if (added.length === 0) return
        beforeAdd.current = null
        flashRows(added)
    }, [items, flashRows])

    // Suggestions this browser hasn't seen shimmer the button once. Opening the view marks them seen.
    useEffect(() => {
        if (!suggestionIds || readOnly) return
        const ids = suggestionIds.split(',')
        if (view === 'suggested') { writeSeen(engagementBase, ids); return }
        const seen = readSeen(engagementBase)
        if (!seen || ids.every((id) => seen.has(id))) return
        // After this paint, so the sweep is seen from its start.
        const t = window.setTimeout(() => setShimmer(true), 0)
        return () => window.clearTimeout(t)
    }, [suggestionIds, view, engagementBase, readOnly])

    // The last suggestion handled here: back to the whole log, open entries, where the accepted ones now
    // are. A memo's that still wait are handled on the memo, so they don't hold the view open.
    useEffect(() => {
        if (view !== 'suggested' || !log || log.suggestions.some((s) => !waitsOnMemo(s)) || !handledSuggestion.current) return
        handledSuggestion.current = false
        setView('log')
        setTypeFilter('ALL')
        setStateFilter('open')
    }, [view, log])

    const run = async (item: RaidItemView, act: () => Promise<string | null>): Promise<boolean> => {
        setBusyIds((s) => new Set(s).add(item.id))
        setActionError(null)
        const failed = await act()
        setBusyIds((s) => { const n = new Set(s); n.delete(item.id); return n })
        if (failed) setActionError(failed)
        return !failed
    }

    const accept = async (s: RaidItemView) => {
        const ok = await run(s, () => handlers.onAccept(s, chosenPriority[s.id] !== s.priority ? chosenPriority[s.id] : undefined, changedTitle(s)))
        if (!ok) return
        handledSuggestion.current = true
        // One that adds to an entry merges into it: that entry is where it went.
        flashRows([s.attachedTo?.id ?? s.id])
    }

    const dismiss = async (s: RaidItemView) => {
        if (await run(s, () => handlers.onDismiss(s))) handledSuggestion.current = true
    }

    const showSuggested = () => {
        setView('suggested')
        setCheckNote(null)
        setShimmer(false)
    }

    const showLog = (state: RaidStateFilter) => {
        setView('log')
        setStateFilter(state)
    }

    const checkNow = async () => {
        setChecking(true)
        setCheckNote(null)
        const out = await handlers.onCheckNow()
        setChecking(false)
        if (out.error) setCheckNote({ text: out.error, error: true })
        else if (out.suggested && view === 'log') {
            setCheckNote({ text: `${out.suggested} new ${out.suggested === 1 ? 'suggestion' : 'suggestions'}`, error: false, review: true })
        } else if (out.message) setCheckNote({ text: out.message, error: false })
    }

    if (loadError && !log) {
        return (
            <div className="flex flex-wrap items-center gap-2 py-3">
                <p className="flex items-start gap-1 text-small text-danger" role="alert">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    {loadError}
                </p>
                {onRetry && <Button type="button" variant="ghost" size="sm" onClick={onRetry}>Try again</Button>}
            </div>
        )
    }
    if (!log) return <RaidLogSkeleton />

    const suggestedView = view === 'suggested'
    const counts = suggestedView ? raidCountsByType(log.suggestions.map((s) => ({ ...s, status: 'OPEN' as const })), 'open') : raidCountsByType(log.items, stateFilter)
    const rows = filterRaidItems(log.items, typeFilter, stateFilter)
    // A thread's first, to accept or dismiss here; a memo's last, as they're handled on the memo.
    const suggestions = log.suggestions
        .filter((s) => typeFilter === 'ALL' || displayTypeOf(s.type) === typeFilter)
        .sort((a, b) => Number(waitsOnMemo(a)) - Number(waitsOnMemo(b)))
    // The Actions filter reads as an action list: no priority (the due date does that job), "Next step", "Done".
    const actionsOnly = typeFilter === 'ACTION' && !suggestedView

    return (
        <div className="flex flex-col gap-4" data-no-export="">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-small text-fg-muted">Risks, Actions, Issues and Decisions · Internal only</span>
                <span className="flex-1" />
                {readOnly ? (
                    <span className="text-small text-fg-subtle">Read only · completed</span>
                ) : (
                    <div className="flex shrink-0 items-center gap-1.5">
                        <div className="flex items-center gap-0.5" data-demo-tour="raid-brio-check">
                            <CheckStatus state={log.conversation} lastCheckedAt={log.lastCheckedAt} checking={checking} now={now} />
                            <Hint label={log.canCheck ? <>Check with <Brio /></> : `${ASSISTANT.name} isn't available right now`}>
                                {/* aria-disabled, not disabled, when Brio is off: a disabled button shows no tooltip. */}
                                <button
                                    type="button"
                                    onClick={() => { if (log.canCheck && !checking) void checkNow() }}
                                    aria-disabled={!log.canCheck || checking}
                                    aria-label={`Check with ${ASSISTANT.name}`}
                                    className={cn(ICON_BUTTON, checking && 'cursor-default', !log.canCheck && 'cursor-default opacity-50 hover:bg-transparent')}
                                >
                                    {/* Brio's sparkle, in Brio's green. */}
                                    <Sparkles className={cn('h-4 w-4', checking && 'animate-pulse')} style={{ color: BRIO_GREEN }} />
                                </button>
                            </Hint>
                        </div>
                        {/* Adding your own, named: a bare + was easy to miss (2026-11-19). */}
                        <Button type="button" variant="outline" size="sm" onClick={() => { setAddKey((k) => k + 1); setAdding(true) }} data-demo-tour="raid-add">
                            <Plus className="h-3.5 w-3.5" aria-hidden />
                            Add
                        </Button>
                    </div>
                )}
            </div>

            {checkNote && (
                <p className={cn('flex flex-wrap items-center gap-x-1.5 gap-y-1 text-small', checkNote.error ? 'text-danger' : 'text-fg-muted')} role={checkNote.error ? 'alert' : 'status'}>
                    {checkNote.error && <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                    {checkNote.review && <Sparkles className="h-3.5 w-3.5 shrink-0" style={{ color: BRIO_GREEN }} aria-hidden />}
                    <span className={cn(checkNote.review && 'text-fg')}>{checkNote.text}</span>
                    {checkNote.review && (
                        <>
                            <span className="text-fg-subtle" aria-hidden>·</span>
                            <button type="button" onClick={showSuggested} className="font-medium text-action hover:underline">Review</button>
                        </>
                    )}
                </p>
            )}
            {actionError && (
                <p className="flex items-start gap-1 text-small text-danger" role="alert">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    {actionError}
                </p>
            )}

            {!readOnly && (
                <AddItemSheet
                    // A fresh pane for each opening: empty, on the type the log is filtered to.
                    key={addKey}
                    open={adding}
                    initialType={typeFilter === 'ALL' ? 'RISK' : typeFilter}
                    members={log.members}
                    onOpenChange={setAdding}
                    onAdd={async (input) => {
                        beforeAdd.current = new Set(log.items.map((i) => i.id))
                        const failed = await handlers.onAdd(input)
                        if (failed) {
                            beforeAdd.current = null
                            return failed
                        }
                        setAdding(false)
                        // Where the new entry shows: the open log, under its type or All.
                        setView('log')
                        setStateFilter('open')
                        if (typeFilter !== 'ALL' && typeFilter !== input.type) setTypeFilter('ALL')
                        return null
                    }}
                />
            )}

            <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Filter the RAID log" data-demo-tour="raid-filters">
                {TYPE_FILTERS.map((t) => (
                    <button
                        key={t}
                        type="button"
                        aria-pressed={typeFilter === t}
                        onClick={() => setTypeFilter(t)}
                        className={cn(
                            'inline-flex h-[26px] items-center gap-1.5 rounded-control px-2.5 text-small font-medium',
                            typeFilter === t ? 'bg-surface-selected text-fg' : 'text-fg-muted hover:bg-surface-hover',
                        )}
                    >
                        {t !== 'ALL' && <RaidTypeBadge type={t} decorative small />}
                        {t === 'ALL' ? 'All' : RAID_TYPE_PLURAL[t]}{' '}
                        <span className="text-fg-subtle">{counts[t]}</span>
                    </button>
                ))}
                <span className="flex-1" />
                {(['open', 'closed'] as const).map((st) => (
                    <button
                        key={st}
                        type="button"
                        aria-pressed={!suggestedView && stateFilter === st}
                        onClick={() => showLog(st)}
                        className={cn(
                            'inline-flex h-[26px] items-center rounded-control px-2.5 text-small font-medium',
                            !suggestedView && stateFilter === st ? 'bg-surface-selected text-fg' : 'text-fg-muted hover:bg-surface-hover',
                        )}
                    >
                        {st === 'open' ? 'Open' : actionsOnly ? 'Done' : 'Closed'}
                    </button>
                ))}
                {!readOnly && (
                    <>
                        <span className="mx-1.5 h-4 w-px bg-line-strong" aria-hidden />
                        {/* Brio's suggestions, apart from Open and Closed: a queue to review, not a state of the log. */}
                        <button
                            type="button"
                            aria-pressed={suggestedView}
                            onClick={showSuggested}
                            onAnimationEnd={() => setShimmer(false)}
                            data-demo-tour="raid-suggested"
                            data-testid="raid-suggested-view"
                            className={cn(
                                'inline-flex h-[26px] items-center gap-1.5 rounded-control px-2.5 text-small font-medium',
                                suggestedView ? 'bg-surface-selected text-fg' : 'text-fg-muted hover:bg-surface-hover',
                                shimmer && 'fm-shimmer-once',
                            )}
                        >
                            <Sparkles className="h-3.5 w-3.5" style={{ color: BRIO_GREEN }} aria-hidden />
                            Suggested
                            {log.suggestions.length > 0 && <span className="text-fg">{log.suggestions.length}</span>}
                        </button>
                    </>
                )}
            </div>

            {suggestedView ? (
                <SuggestedList
                    suggestions={suggestions}
                    engagementBase={engagementBase}
                    readOnly={readOnly}
                    busyIds={busyIds}
                    titleFor={titleFor}
                    onTitle={(s, title) => setEditedTitle((t) => ({ ...t, [s.id]: title }))}
                    priorityFor={(s) => chosenPriority[s.id] ?? s.priority}
                    onPriority={(s, p) => setChosenPriority((c) => ({ ...c, [s.id]: p }))}
                    onAccept={(s) => void accept(s)}
                    onDismiss={(s) => void dismiss(s)}
                />
            ) : (
            <>

            {/* The standard table (components/ui/notion-table.tsx, the grid the Files list follows): icon and
                label headers, hairlines between columns, single-line rows, the row menu on hover. How an
                automatic entry closes is the Source cell's tooltip; why a closed one closed, the Status's. */}
            <section aria-label="RAID log">
                {rows.length === 0 ? (
                    <p className="border-y border-line px-2.5 py-2.5 text-small text-fg-muted">
                        {log.items.length === 0
                            ? 'Nothing in the log yet. Status, health and deliverable items appear here on their own.'
                            : stateFilter === 'open' ? 'Nothing open here.' : actionsOnly ? 'Nothing done here yet.' : 'Nothing closed here yet.'}
                    </p>
                ) : (
                    <NotionTable data-demo-tour="raid-table">
                        <NotionTableHeader>
                            <NotionTableHead icon={<Shapes />} className="w-[72px]">Type</NotionTableHead>
                            {!actionsOnly && <NotionTableHead icon={<SignalHigh />} className="w-[112px]">Priority</NotionTableHead>}
                            <NotionTableHead icon={<TypeIcon />}>{actionsOnly ? 'Action' : 'Item'}</NotionTableHead>
                            <NotionTableHead icon={<Link2 />}>Source</NotionTableHead>
                            <NotionTableHead icon={<UserRound />}>Owner</NotionTableHead>
                            <NotionTableHead icon={<CalendarDays />}>Due</NotionTableHead>
                            <NotionTableHead icon={<ListChecks />}>{actionsOnly ? 'Next step' : 'Mitigation · next step'}</NotionTableHead>
                            <NotionTableHead icon={<CircleDot />}>Status</NotionTableHead>
                            <NotionTableHead icon={<Clock3 />}>Raised</NotionTableHead>
                            {!readOnly && <NotionTableActionsHead />}
                        </NotionTableHeader>
                        <NotionTableBody>
                            {rows.map((item) => {
                                const auto = isAutoSource(item.sourceKind)
                                const source = item.sources[0]
                                const more = item.sources.length - 1
                                return (
                                    <NotionTableRow key={item.id} data-testid={`raid-row-${item.id}`} data-flash={flash.has(item.id) || undefined} className={cn('transition-colors duration-1000', flash.has(item.id) && 'bg-action/[0.07]')}>
                                        <NotionTableCell><RaidTypeBadge type={item.type} /></NotionTableCell>
                                        {!actionsOnly && (
                                            <NotionTableCell className="whitespace-nowrap">
                                                {item.priority && !readOnly && isLive(item) ? (
                                                    <RaidPriorityPicker
                                                        value={item.priority}
                                                        onChange={(priority) => void run(item, () => handlers.onEdit(item, { priority }))}
                                                        label={`Priority of ${item.title}`}
                                                        disabled={busyIds.has(item.id)}
                                                    />
                                                ) : (
                                                    <RaidPriorityMark priority={item.priority} />
                                                )}
                                            </NotionTableCell>
                                        )}
                                        <NotionTableCell className="min-w-[16rem] max-w-[28rem]">
                                            <span className="flex min-w-0 items-center gap-1.5">
                                                {readOnly || auto ? (
                                                    <span className="block truncate font-medium text-fg" title={item.title}>{item.title}</span>
                                                ) : (
                                                    <InlineText
                                                        value={item.title}
                                                        placeholder="Add a title"
                                                        label="Title"
                                                        maxLength={RAID_TITLE_MAX}
                                                        className="font-medium text-fg"
                                                        onSave={async (next) => (next ? run(item, () => handlers.onEdit(item, { title: next })) : false)}
                                                    />
                                                )}
                                                {/* Saved as an Assumption before Actions: listed with the Decisions, labelled. */}
                                                {isLegacyAssumption(item) && <Tag color="gray">Assumption</Tag>}
                                            </span>
                                        </NotionTableCell>
                                        <NotionTableCell className="whitespace-nowrap">
                                            <span className="inline-flex items-center gap-1" title={item.autoLine ?? undefined}>
                                                {source && <RaidSourceChip source={source} engagementBase={engagementBase} />}
                                                {more > 0 && <span className="text-caption text-fg-subtle" title={item.sources.slice(1).map((s) => s.label).join('\n')}>+{more}</span>}
                                            </span>
                                        </NotionTableCell>
                                        <NotionTableCell className="whitespace-nowrap">
                                            <OwnerCell
                                                item={item}
                                                members={log.members}
                                                readOnly={readOnly}
                                                onChange={(ownerUserId) => void run(item, () => handlers.onEdit(item, { ownerUserId }))}
                                            />
                                        </NotionTableCell>
                                        <NotionTableCell className="whitespace-nowrap">
                                            <DueCell item={item} readOnly={readOnly} onChange={(dueDate) => run(item, () => handlers.onEdit(item, { dueDate }))} />
                                        </NotionTableCell>
                                        <NotionTableCell className="min-w-[12rem] max-w-[22rem]">
                                            {item.type === 'DECISION' || isLegacyAssumption(item) ? (
                                                <span className="text-fg-subtle">·</span>
                                            ) : readOnly || !isLive(item) ? (
                                                item.notes ? <span className="block truncate" title={item.notes}>{item.notes}</span> : <span className="text-fg-subtle">·</span>
                                            ) : (
                                                <InlineText
                                                    value={item.notes}
                                                    placeholder={item.type === 'ACTION' ? 'Add a next step' : 'Add a mitigation'}
                                                    label={`${item.type === 'ACTION' ? 'Next step' : 'Mitigation'} for ${item.title}`}
                                                    maxLength={RAID_NOTES_MAX}
                                                    onSave={(next) => run(item, () => handlers.onEdit(item, { notes: next }))}
                                                />
                                            )}
                                        </NotionTableCell>
                                        <NotionTableCell className="whitespace-nowrap">
                                            <span title={item.status === 'CLOSED' ? item.closedReason ?? undefined : undefined}>
                                                <RaidStatusTag item={item} />
                                            </span>
                                        </NotionTableCell>
                                        <NotionTableCell className="whitespace-nowrap text-fg-muted">{shortDay(item.raisedAt)}</NotionTableCell>
                                        {!readOnly && (
                                            <NotionTableActions>
                                                {(isLive(item) || item.canReopen) && (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`More for ${item.title}`} disabled={busyIds.has(item.id)}>
                                                                <MoreHorizontal className="h-4 w-4" aria-hidden />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            {isLive(item)
                                                                ? <DropdownMenuItem onSelect={() => void run(item, () => handlers.onClose(item))}>{item.type === 'ACTION' ? 'Mark done' : 'Close'}</DropdownMenuItem>
                                                                : <DropdownMenuItem onSelect={() => void run(item, () => handlers.onReopen(item))}>Reopen</DropdownMenuItem>}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                )}
                                            </NotionTableActions>
                                        )}
                                    </NotionTableRow>
                                )
                            })}
                        </NotionTableBody>
                    </NotionTable>
                )}
            </section>
            </>
            )}

            <p className="text-small text-fg-muted">
                Status, health and deliverable items keep themselves current. <Brio noIcon /> reads threads with new messages once a
                day, or when you check with the sparkle. A memo is read once, when it&apos;s added, and its suggestions
                wait on the memo, to accept or dismiss there. An open Action shows on its owner&apos;s Home and Inbox until it&apos;s done.{' '}
                <Brio noIcon /> records what people decided; it never decides.
            </p>
        </div>
    )
}

// ── The app's tab ─────────────────────────────────────────────────────────────────────────────

/** How long Check now waits: past the route's own model timeout, inside its 60 seconds. */
const CHECK_TIMEOUT_MS = 58_000

async function fetchRaidLog(projectId: string): Promise<RaidLogPayload> {
    const res = await fetch(`/api/projects/${projectId}/raid`)
    if (!res.ok) throw await failureFrom(res)
    return (await res.json() as { data: RaidLogPayload }).data
}

function announce(projectId: string, count: number, suggested: number) {
    window.dispatchEvent(new CustomEvent<RaidChangedDetail>(RAID_CHANGED_EVENT, { detail: { projectId, count, suggested } }))
}

/**
 * The engagement's RAID tab. Leads and Contributors · Full Access only: the route refuses everyone
 * else, and the switch shouldn't offer it to them.
 */
export function RaidTab({ projectId, engagementBase, readOnly = false }: {
    projectId: string
    /** The engagement's path, for source links (Discussions, Files, the Board). */
    engagementBase: string
    /** A completed engagement. The route says so too. */
    readOnly?: boolean
}) {
    const [log, setLog] = useState<RaidLogPayload | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [tick, setTick] = useState(0)
    const live = useRef(true)
    // Set on every mount, not only cleared on unmount: React runs effects twice in development
    // (mount, unmount, mount), and a flag only ever cleared stayed false after the first pass, so the
    // loaded log was dropped and the tab sat on "Loading the RAID log…" (2026-11-13).
    useEffect(() => {
        live.current = true
        return () => { live.current = false }
    }, [])

    const show = useCallback((data: RaidLogPayload) => {
        if (!live.current) return
        setLog(data)
        setLoadError(null)
        announce(projectId, raidOpenCount(data.items), data.suggestions.length)
    }, [projectId])

    /**
     * The log as it is now, after a change that worked. A refresh that fails leaves the log as shown
     * rather than saying the change didn't happen.
     */
    const refresh = useCallback(async () => {
        try {
            show(await fetchRaidLog(projectId))
        } catch {
            // The next open of the tab reads it again.
        }
    }, [projectId, show])

    useEffect(() => {
        void (async () => {
            try {
                show(await fetchRaidLog(projectId))
            } catch (e) {
                if (live.current) setLoadError(failureReason(e))
            }
        })()
    }, [projectId, show, tick])

    /** A change, then the log as it is now. Answers the words to show when it didn't work. */
    const change = useCallback(async (url: string, init: RequestInit): Promise<string | null> => {
        try {
            const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } })
            if (!res.ok) throw await failureFrom(res)
            await refresh()
            return null
        } catch (e) {
            return failureReason(e)
        }
    }, [refresh])

    const patch = (item: RaidItemView, body: Record<string, unknown>) =>
        change(`/api/projects/${projectId}/raid/${item.id}`, { method: 'PATCH', body: JSON.stringify(body) })

    const handlers: RaidHandlers = {
        onCheckNow: async () => {
            try {
                const res = await fetchWithTimeout(`/api/projects/${projectId}/raid/check`, { method: 'POST' }, CHECK_TIMEOUT_MS)
                if (!res.ok) throw await failureFrom(res)
                const body = await res.json() as { data: { status: 'nothing_new' | 'checked'; suggested: number }; warning?: string }
                await refresh()
                const said = body.data.status === 'nothing_new'
                    ? 'Nothing new since the last check.'
                    : body.data.suggested === 0 ? 'Nothing to suggest from the new messages.' : null
                return { message: [said, body.warning].filter(Boolean).join(' ') || null, error: null, suggested: body.data.suggested }
            } catch (e) {
                return { message: null, error: brioFailureReason(e, BRIO_RAID_FAILED) }
            }
        },
        onAccept: (item, priority, title) => patch(item, { action: 'accept', ...(priority ? { priority } : {}), ...(title ? { title } : {}) }),
        onDismiss: (item) => patch(item, { action: 'dismiss' }),
        onAdd: (input) => change(`/api/projects/${projectId}/raid`, { method: 'POST', body: JSON.stringify(input) }),
        onEdit: (item, p) => patch(item, { action: 'edit', ...p }),
        onClose: (item) => patch(item, { action: 'close' }),
        onReopen: (item) => patch(item, { action: 'reopen' }),
    }

    return (
        <RaidTabView
            log={log}
            loadError={loadError}
            onRetry={() => setTick((t) => t + 1)}
            engagementBase={engagementBase}
            readOnly={readOnly}
            {...handlers}
        />
    )
}

/**
 * Beside the RAID tab: the number of entries open or recorded, and how many of Brio's suggestions wait,
 * which puts a dot on the tab (2026-11-19). Null until it loads, and for anyone the log isn't for.
 * Follows changes made in the tab on this page without asking again.
 */
export function useRaidCounts(projectId: string | null): { count: number; suggested: number } | null {
    const [counts, setCounts] = useState<{ count: number; suggested: number } | null>(null)
    useEffect(() => {
        // No engagement: a viewer who doesn't get the RAID tab, whose route would refuse the count anyway.
        if (!projectId) return
        let alive = true
        void (async () => {
            try {
                const res = await fetch(`/api/projects/${projectId}/raid?view=count`)
                if (!res.ok) return
                const body = await res.json() as { data: { count: number; suggested?: number } }
                if (alive) setCounts({ count: body.data.count, suggested: body.data.suggested ?? 0 })
            } catch {
                // No number is better than a wrong one; the tab says why when it's opened.
            }
        })()
        const onChange = (e: Event) => {
            const detail = (e as CustomEvent<RaidChangedDetail>).detail
            if (detail?.projectId === projectId) setCounts((c) => ({ count: detail.count, suggested: detail.suggested ?? c?.suggested ?? 0 }))
        }
        window.addEventListener(RAID_CHANGED_EVENT, onChange)
        return () => {
            alive = false
            window.removeEventListener(RAID_CHANGED_EVENT, onChange)
        }
    }, [projectId])
    return counts
}
