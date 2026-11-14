'use client'

import { useCallback, useEffect, useId, useRef, useState, type ComponentProps } from 'react'
import Link from 'next/link'
import { AlertCircle, AlertTriangle, Check, CircleDot, Clock3, Link2, ListChecks, Loader2, MoreHorizontal, Plus, Shapes, SignalHigh, Sparkles, Type as TypeIcon, UserRound } from 'lucide-react'
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
import { Tag } from '@/components/ui/tag'
import { Hint, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Brio } from '@/components/ui/brio'
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
    RAID_STATUS_LABEL,
    RAID_TITLE_MAX,
    RAID_TYPES,
    RAID_TYPE_LABEL,
    RAID_TYPE_LETTER,
    RAID_TYPE_STAGE,
    RAID_TYPE_PLURAL,
    attachPhrase,
    filterRaidItems,
    hasPriority,
    isAutoSource,
    isLive,
    lastCheckedPhrase,
    memoReviewHref,
    memoSuggestionGroups,
    raidCountsByType,
    raidOpenCount,
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
 * The RAID tab (.claude/plans/brio-features-round-2.md, §9; a Discussions sub-tab until 2026-11-14): the engagement's Risks, Assumptions,
 * Issues and Decisions, internal only. Status, health and Board entries keep themselves current; Brio's
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
export function RaidLink({ href, ...rest }: ComponentProps<'a'> & { href: string }) {
    return href.startsWith('?') ? <Link href={href} {...rest} /> : <a href={href} {...rest} />
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
    return <Tag color={TONE_COLOR[raidTone(item)]}>{RAID_STATUS_LABEL[item.status]}</Tag>
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
}

function AddItemForm({ onAdd, onCancel }: { onAdd: (input: RaidNewItem) => Promise<string | null>; onCancel: () => void }) {
    const titleId = useId()
    const [type, setType] = useState<RaidType>('RISK')
    const [priority, setPriority] = useState<RaidPriority>('MEDIUM')
    const [title, setTitle] = useState('')
    const [notes, setNotes] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const submit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!title.trim()) { setError('Give the entry a title.'); return }
        setBusy(true)
        setError(null)
        const failed = await onAdd({
            type,
            title: title.trim(),
            notes: type === 'DECISION' ? null : notes.trim() || null,
            ...(hasPriority(type) ? { priority } : {}),
        })
        setBusy(false)
        if (failed) setError(failed)
    }

    return (
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3.5" aria-label="Add a RAID entry">
            <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Type">
                {RAID_TYPES.map((t) => (
                    <button
                        key={t}
                        type="button"
                        role="radio"
                        aria-checked={type === t}
                        onClick={() => setType(t)}
                        className={cn(
                            'inline-flex h-7 items-center gap-1.5 rounded-control px-2.5 text-small font-medium',
                            type === t ? 'bg-surface-selected text-fg' : 'text-fg-muted hover:bg-surface-hover',
                        )}
                    >
                        <RaidTypeBadge type={t} decorative />
                        {RAID_TYPE_LABEL[t]}
                    </button>
                ))}
            </div>
            <div className="flex flex-col gap-1">
                <label htmlFor={titleId} className="text-caption text-fg-muted">Title</label>
                <Input id={titleId} value={title} maxLength={RAID_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder="Short, in your words" autoFocus />
            </div>
            {hasPriority(type) && (
                <div className="flex items-center gap-2">
                    <span className="text-caption text-fg-muted">Priority</span>
                    <RaidPriorityPicker value={priority} onChange={setPriority} label="Priority" className="mx-0" />
                </div>
            )}
            {type !== 'DECISION' && (
                <div className="flex flex-col gap-1">
                    <label htmlFor={`${titleId}-notes`} className="text-caption text-fg-muted">Mitigation · next step <span className="text-fg-subtle">(optional)</span></label>
                    <Input id={`${titleId}-notes`} value={notes} maxLength={RAID_NOTES_MAX} onChange={(e) => setNotes(e.target.value)} />
                </div>
            )}
            {error && (
                <p className="flex items-start gap-1 text-small text-danger" role="alert">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    {error}
                </p>
            )}
            <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>Cancel</Button>
                <Button type="submit" size="sm" disabled={busy}>
                    {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                    Add to the log
                </Button>
            </div>
        </form>
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
        ? `Threads changed since ${name} last checked, ${when}. ${name} reads them once a day, or now with the sparkle, at most 1 credit.`
        : `${name} hasn't read this engagement's threads yet. It reads them once a day, or now with the sparkle, at most 1 credit.`
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
            <span className="mr-1.5 inline-flex items-center gap-1 text-caption text-fg-muted" aria-live="polite">
                <Brio className="animate-pulse" /> is checking…
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
    onCheckNow: () => Promise<{ message: string | null; error: string | null }>
    /** `priority`: the one chosen on the card, when it differs from Brio's. */
    onAccept: (item: RaidItemView, priority?: RaidPriority) => Promise<string | null>
    onDismiss: (item: RaidItemView) => Promise<string | null>
    onAdd: (input: RaidNewItem) => Promise<string | null>
    onEdit: (item: RaidItemView, patch: { title?: string | null; notes?: string | null; ownerUserId?: string | null; priority?: RaidPriority }) => Promise<string | null>
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

export function RaidTabView({ log, loadError, onRetry, engagementBase, readOnly: readOnlyProp, now, ...handlers }: RaidTabViewProps) {
    const strip = useId()
    const [typeFilter, setTypeFilter] = useState<RaidTypeFilter>('ALL')
    const [stateFilter, setStateFilter] = useState<RaidStateFilter>('open')
    const [adding, setAdding] = useState(false)
    const [checking, setChecking] = useState(false)
    const [checkNote, setCheckNote] = useState<{ text: string; error: boolean } | null>(null)
    const [actionError, setActionError] = useState<string | null>(null)
    const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set())
    // A suggestion's priority as changed on its card, before it's accepted.
    const [chosenPriority, setChosenPriority] = useState<Record<string, RaidPriority>>({})

    const readOnly = readOnlyProp || !!log?.readOnly

    const run = async (item: RaidItemView, act: () => Promise<string | null>): Promise<boolean> => {
        setBusyIds((s) => new Set(s).add(item.id))
        setActionError(null)
        const failed = await act()
        setBusyIds((s) => { const n = new Set(s); n.delete(item.id); return n })
        if (failed) setActionError(failed)
        return !failed
    }

    const checkNow = async () => {
        setChecking(true)
        setCheckNote(null)
        const out = await handlers.onCheckNow()
        setChecking(false)
        if (out.error) setCheckNote({ text: out.error, error: true })
        else if (out.message) setCheckNote({ text: out.message, error: false })
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

    const counts = raidCountsByType(log.items, stateFilter)
    const rows = filterRaidItems(log.items, typeFilter, stateFilter)
    // A memo's suggestions wait on the memo, with its action items (§13): here, only a line to it.
    const suggestions = log.suggestions.filter((s) => !waitsOnMemo(s))
    const memoGroups = memoSuggestionGroups(log.suggestions)

    return (
        <div className="flex flex-col gap-4" data-no-export="">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-small text-fg-muted">Risks, Assumptions, Issues and Decisions · Internal only</span>
                <span className="flex-1" />
                {readOnly ? (
                    <span className="text-small text-fg-subtle">Read only · completed</span>
                ) : (
                    <div className="flex shrink-0 items-center gap-0.5">
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
                        {/* Last in the row: the status and Brio's check read together, then adding your own. */}
                        <Hint label="Add an item">
                            <button type="button" onClick={() => setAdding(true)} disabled={adding} aria-label="Add an item" className={ICON_BUTTON}>
                                <Plus className="h-4 w-4" />
                            </button>
                        </Hint>
                    </div>
                )}
            </div>

            {checkNote && (
                <p className={cn('flex items-start gap-1 text-small', checkNote.error ? 'text-danger' : 'text-fg-muted')} role={checkNote.error ? 'alert' : 'status'}>
                    {checkNote.error && <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
                    {checkNote.text}
                </p>
            )}
            {actionError && (
                <p className="flex items-start gap-1 text-small text-danger" role="alert">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    {actionError}
                </p>
            )}

            {adding && !readOnly && (
                <AddItemForm
                    onCancel={() => setAdding(false)}
                    onAdd={async (input) => {
                        const failed = await handlers.onAdd(input)
                        if (!failed) {
                            setAdding(false)
                            setStateFilter('open')
                        }
                        return failed
                    }}
                />
            )}

            {suggestions.length > 0 && (
                <section aria-labelledby={strip} className="overflow-hidden rounded-card border border-line bg-surface">
                    <div className="flex flex-wrap items-center gap-2 px-3.5 py-2.5">
                        <span id={strip} className="inline-flex flex-wrap items-baseline gap-x-1.5 text-small text-fg">
                            <Brio className="text-ui text-action" />
                            <span><strong className="font-semibold">suggests {suggestions.length}</strong> from new messages</span>
                        </span>
                        <span className="flex-1" />
                        <span className="text-caption font-normal text-fg-muted">Nothing enters the log until someone accepts it</span>
                    </div>
                    <ul>
                        {suggestions.map((s) => {
                            const source = s.sources[0]
                            return (
                                <li key={s.id} className="flex items-start gap-2.5 border-t border-line px-3.5 py-2.5" data-testid={`raid-suggestion-${s.id}`}>
                                    <RaidTypeBadge type={s.type} />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <strong className="text-ui font-semibold text-fg">{s.title}</strong>
                                            {source && <RaidSourceChip source={source} engagementBase={engagementBase} />}
                                            {s.internalSource && <Tag color="gray">Internal source</Tag>}
                                            {s.attachedTo && <span className="text-small text-fg-muted">· {attachPhrase(s.attachedTo)}</span>}
                                        </div>
                                        {s.priority && !s.attachedTo && (
                                            <div className="mt-0.5 flex items-center gap-1.5 text-caption text-fg-muted">
                                                <span>Priority</span>
                                                {readOnly ? (
                                                    <RaidPriorityMark priority={s.priority} />
                                                ) : (
                                                    <RaidPriorityPicker
                                                        value={chosenPriority[s.id] ?? s.priority}
                                                        onChange={(p) => setChosenPriority((c) => ({ ...c, [s.id]: p }))}
                                                        label={`Priority of ${s.title}`}
                                                        disabled={busyIds.has(s.id)}
                                                        className="mx-0 h-6"
                                                    />
                                                )}
                                                <span className="text-fg-subtle">· {ASSISTANT.name}&apos;s suggestion</span>
                                            </div>
                                        )}
                                        {source?.quote ? (
                                            <blockquote className="mt-1 border-l-2 border-line-strong pl-2 text-small text-fg-muted">“{source.quote}”</blockquote>
                                        ) : source?.kind === 'MEMO' && sourceHref(engagementBase, source) ? (
                                            <RaidLink href={sourceHref(engagementBase, source)!} className="mt-1 inline-block text-small text-action hover:underline">
                                                Read it in the memo
                                            </RaidLink>
                                        ) : null}
                                    </div>
                                    {!readOnly && (
                                        <div className="flex shrink-0 items-center gap-1">
                                            <Button type="button" variant="ghost" size="sm" disabled={busyIds.has(s.id)} onClick={() => void run(s, () => handlers.onDismiss(s))} aria-label={`Dismiss ${s.title}`}>
                                                Dismiss
                                            </Button>
                                            <Button type="button" variant="outline" size="sm" disabled={busyIds.has(s.id)} onClick={() => void run(s, () => handlers.onAccept(s, chosenPriority[s.id] !== s.priority ? chosenPriority[s.id] : undefined))} aria-label={`Accept ${s.title}`}>
                                                Accept
                                            </Button>
                                        </div>
                                    )}
                                </li>
                            )
                        })}
                    </ul>
                </section>
            )}

            {memoGroups.length > 0 && (
                <ul aria-label="Suggestions waiting on memos" className="flex flex-col gap-1">
                    {memoGroups.map((g) => (
                        <li key={g.memoId ?? g.title} className="flex flex-wrap items-baseline gap-x-1.5 text-small text-fg-muted">
                            <span>
                                <strong className="font-semibold text-fg">{g.count} {g.count === 1 ? 'suggestion waits' : 'suggestions wait'}</strong>{' '}
                                on the memo{g.title ? ` “${g.title}”` : ''}, with its action items.
                            </span>
                            <RaidLink href={memoReviewHref(engagementBase, g.memoId)} className="text-action hover:underline">
                                Review in Memos
                            </RaidLink>
                        </li>
                    ))}
                </ul>
            )}

            <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Filter the RAID log">
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
                        aria-pressed={stateFilter === st}
                        onClick={() => setStateFilter(st)}
                        className={cn(
                            'inline-flex h-[26px] items-center rounded-control px-2.5 text-small font-medium',
                            stateFilter === st ? 'bg-surface-selected text-fg' : 'text-fg-muted hover:bg-surface-hover',
                        )}
                    >
                        {st === 'open' ? 'Open' : 'Closed'}
                    </button>
                ))}
            </div>

            {/* The standard table (components/ui/notion-table.tsx, the grid the Files list follows): icon and
                label headers, hairlines between columns, single-line rows, the row menu on hover. How an
                automatic entry closes is the Source cell's tooltip; why a closed one closed, the Status's. */}
            <section aria-label="RAID log">
                {rows.length === 0 ? (
                    <p className="border-y border-line px-2.5 py-2.5 text-small text-fg-muted">
                        {log.items.length === 0
                            ? 'Nothing in the log yet. Status, health and Board items appear here on their own.'
                            : stateFilter === 'open' ? 'Nothing open here.' : 'Nothing closed here yet.'}
                    </p>
                ) : (
                    <NotionTable>
                        <NotionTableHeader>
                            <NotionTableHead icon={<Shapes />} className="w-[72px]">Type</NotionTableHead>
                            <NotionTableHead icon={<SignalHigh />} className="w-[112px]">Priority</NotionTableHead>
                            <NotionTableHead icon={<TypeIcon />}>Item</NotionTableHead>
                            <NotionTableHead icon={<Link2 />}>Source</NotionTableHead>
                            <NotionTableHead icon={<UserRound />}>Owner</NotionTableHead>
                            <NotionTableHead icon={<ListChecks />}>Mitigation · next step</NotionTableHead>
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
                                    <NotionTableRow key={item.id} data-testid={`raid-row-${item.id}`}>
                                        <NotionTableCell><RaidTypeBadge type={item.type} /></NotionTableCell>
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
                                        <NotionTableCell className="min-w-[16rem] max-w-[28rem]">
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
                                        <NotionTableCell className="min-w-[12rem] max-w-[22rem]">
                                            {item.type === 'DECISION' ? (
                                                <span className="text-fg-subtle">·</span>
                                            ) : readOnly || !isLive(item) ? (
                                                item.notes ? <span className="block truncate" title={item.notes}>{item.notes}</span> : <span className="text-fg-subtle">·</span>
                                            ) : (
                                                <InlineText
                                                    value={item.notes}
                                                    placeholder="Add a mitigation"
                                                    label={`Mitigation for ${item.title}`}
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
                                                                ? <DropdownMenuItem onSelect={() => void run(item, () => handlers.onClose(item))}>Close</DropdownMenuItem>
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

            <p className="text-small text-fg-muted">
                Status, health and Board items are free and keep themselves current. <Brio noIcon /> reads threads with new messages once a
                day, or when you check with the sparkle: at most 1 credit per engagement per active day. A memo is read once, when it&apos;s
                added, and its suggestions wait on the memo, to accept or dismiss there with its action items. <Brio noIcon /> records
                what people decided; it never decides.
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

function announce(projectId: string, count: number) {
    window.dispatchEvent(new CustomEvent<RaidChangedDetail>(RAID_CHANGED_EVENT, { detail: { projectId, count } }))
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
        announce(projectId, raidOpenCount(data.items))
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
                return { message: [said, body.warning].filter(Boolean).join(' ') || null, error: null }
            } catch (e) {
                return { message: null, error: brioFailureReason(e, BRIO_RAID_FAILED) }
            }
        },
        onAccept: (item, priority) => patch(item, { action: 'accept', ...(priority ? { priority } : {}) }),
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
 * The number beside the RAID tab: entries open or recorded. Null until it loads, and
 * for anyone the log isn't for. Follows changes made in the tab on this page without asking again.
 */
export function useRaidCount(projectId: string | null): number | null {
    const [count, setCount] = useState<number | null>(null)
    useEffect(() => {
        // No engagement: a viewer who doesn't get the RAID tab, whose route would refuse the count anyway.
        if (!projectId) return
        let alive = true
        void (async () => {
            try {
                const res = await fetch(`/api/projects/${projectId}/raid?view=count`)
                if (!res.ok) return
                const body = await res.json() as { data: { count: number } }
                if (alive) setCount(body.data.count)
            } catch {
                // No number is better than a wrong one; the tab says why when it's opened.
            }
        })()
        const onChange = (e: Event) => {
            const detail = (e as CustomEvent<RaidChangedDetail>).detail
            if (detail?.projectId === projectId) setCount(detail.count)
        }
        window.addEventListener(RAID_CHANGED_EVENT, onChange)
        return () => {
            alive = false
            window.removeEventListener(RAID_CHANGED_EVENT, onChange)
        }
    }, [projectId])
    return count
}
