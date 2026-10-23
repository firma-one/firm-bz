"use client"

import * as React from "react"
import { Check, Loader2, Search, X } from "lucide-react"
import { DuePickerPanel } from "@/components/ui/due-picker"
import { formatDue, isPastDue, readDue } from "@/lib/ui/due-date"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { StatusPill } from "@/components/ui/status-pill"
import { STAGE_PILL_CLASSES } from "@/lib/ui/status"
import { cn } from "@/lib/utils"
import type { StatusKind } from "@/lib/ui/status"
import { initialsOf } from '@/lib/initials'

/*
 * Notion-style inline property editors (.claude/plans/ui-ux-overhaul.md, Phase 6): the value shows
 * in place; clicking opens a small popover to change it. Used in Notion tables and in the
 * properties row at the top of an entity page. `disabled` renders the value read-only.
 *
 * onChange may be async — the cell shows a spinner and keeps the old value if it throws.
 */

function useSaving<T>(onChange: (v: T) => unknown | Promise<unknown>) {
    const [saving, setSaving] = React.useState(false)
    const run = React.useCallback(
        async (v: T) => {
            setSaving(true)
            try {
                await onChange(v)
            } finally {
                setSaving(false)
            }
        },
        [onChange]
    )
    return { saving, run }
}

const triggerClass =
    "inline-flex h-7 max-w-full items-center gap-1.5 rounded-control px-1.5 text-small text-fg transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30 disabled:cursor-default disabled:hover:bg-transparent"

function Empty({ label = "Empty" }: { label?: string }) {
    return <span className="text-fg-subtle">{label}</span>
}

// ── Status ────────────────────────────────────────────────────────────────────

export function StatusProperty({
    kind,
    value,
    options,
    onChange,
    disabled,
    placeholder = "Empty",
}: {
    kind: StatusKind
    /** null shows the placeholder, as a document with no stage yet. */
    value: string | null
    /** The statuses to offer. Leave out moves the viewer can't make (Files lists only allowed ones). */
    options: string[]
    onChange: (next: string) => unknown | Promise<unknown>
    disabled?: boolean
    placeholder?: string
}) {
    const [open, setOpen] = React.useState(false)
    const { saving, run } = useSaving(onChange)
    // The status language (lib/ui/status.ts). Overdue is shown on the date, not here.
    const pill = value ? <StatusPill kind={kind} status={value} /> : <span className="text-small"><Empty label={placeholder} /></span>
    if (disabled) return <span className="inline-flex h-7 items-center px-1.5">{pill}</span>
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button type="button" className={triggerClass} onClick={(e) => e.stopPropagation()}>
                    {pill}
                    {saving && <Loader2 className="h-3 w-3 animate-spin text-fg-subtle" />}
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-48" onClick={(e) => e.stopPropagation()}>
                {options.map((opt) => (
                    <button
                        key={opt}
                        type="button"
                        onClick={() => {
                            setOpen(false)
                            if (opt !== value) void run(opt)
                        }}
                        className="flex h-8 w-full items-center justify-between rounded-control px-2 hover:bg-surface-hover"
                    >
                        <StatusPill kind={kind} status={opt} />
                        {opt === value && <Check className="h-3.5 w-3.5 text-fg-muted" />}
                    </button>
                ))}
            </PopoverContent>
        </Popover>
    )
}

// ── Date ──────────────────────────────────────────────────────────────────────

/** Parses a stored value for display. A bare `yyyy-MM-dd` is a local calendar day, not UTC midnight. */
export function DateProperty({
    value,
    onChange,
    disabled,
    placeholder = "Empty",
    highlightOverdue = false,
    allowTime = false,
    compact = false,
    chip = false,
}: {
    /** "yyyy-MM-dd", an ISO date-time, or null. */
    value: string | null
    /** Receives "yyyy-MM-dd" for a day, an ISO instant for a day with a time, or null to clear. */
    onChange: (next: string | null) => unknown | Promise<unknown>
    disabled?: boolean
    placeholder?: string
    /** Show past dates in red — for due dates. */
    highlightOverdue?: boolean
    /** Let the picker add a time, and show it beside the day. */
    allowTime?: boolean
    /** For a narrow table cell: leaves out this year's year, on one line. */
    compact?: boolean
    /**
     * Show a set date as a pill in the status pills' pastels (not started; red, the "problem" stage,
     * when overdue), so an editable cell reads as a value you can change rather than plain text.
     */
    chip?: boolean
}) {
    const [open, setOpen] = React.useState(false)
    const { saving, run } = useSaving(onChange)
    const parts = readDue(value)
    const shown = parts && !allowTime ? { ...parts, time: null } : parts
    const overdue = highlightOverdue && !!shown && isPastDue(shown)
    const label = shown ? (
        chip ? (
            <span className={cn("inline-flex h-5 max-w-full items-center whitespace-nowrap rounded-control px-1.5 text-caption tabular-nums", STAGE_PILL_CLASSES[overdue ? "problem" : "not-started"])}>
                <span className="truncate">{formatDue(shown, { compact })}</span>
            </span>
        ) : (
            <span className={cn("truncate whitespace-nowrap tabular-nums", overdue && "text-danger")}>{formatDue(shown, { compact })}</span>
        )
    ) : (
        <Empty label={placeholder} />
    )
    if (disabled) return <span className="inline-flex h-7 items-center px-1.5 text-small">{label}</span>
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button type="button" className={triggerClass} onClick={(e) => e.stopPropagation()}>
                    {label}
                    {saving && <Loader2 className="h-3 w-3 animate-spin text-fg-subtle" />}
                </button>
            </PopoverTrigger>
            {/* The shared picker (due-picker.tsx): a pick saves at once and closes, unless a time is being set. */}
            <PopoverContent align="start" className="w-auto p-0" onClick={(e) => e.stopPropagation()}>
                <DuePickerPanel
                    value={value}
                    allowTime={allowTime}
                    label={placeholder}
                    onCommit={(next, close) => {
                        if (close) setOpen(false)
                        void run(next)
                    }}
                />
            </PopoverContent>
        </Popover>
    )
}

// ── Person ────────────────────────────────────────────────────────────────────

export type PersonOption = { id: string; name: string; email?: string | null; avatarUrl?: string | null }

export function PersonAvatar({ person, size = 20 }: { person: Pick<PersonOption, "name" | "avatarUrl">; size?: number }) {
    const style = { width: size, height: size }
    if (person.avatarUrl) {
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={person.avatarUrl} alt="" style={style} className="shrink-0 rounded-full object-cover" />
    }
    return (
        <span style={style} className="flex shrink-0 items-center justify-center rounded-full bg-surface-muted text-[9px] font-medium text-fg-muted">
            {initialsOf(person.name)}
        </span>
    )
}

export function PersonProperty({
    value,
    people,
    onChange,
    disabled,
    placeholder = "Empty",
}: {
    value: PersonOption | null
    people: PersonOption[]
    onChange: (next: PersonOption | null) => unknown | Promise<unknown>
    disabled?: boolean
    placeholder?: string
}) {
    const [open, setOpen] = React.useState(false)
    const [query, setQuery] = React.useState("")
    const { saving, run } = useSaving(onChange)
    const shown = people.filter((p) => `${p.name} ${p.email ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()))
    const label = value ? (
        <>
            <PersonAvatar person={value} />
            <span className="truncate">{value.name}</span>
        </>
    ) : (
        <Empty label={placeholder} />
    )
    if (disabled) return <span className="inline-flex h-7 items-center gap-1.5 px-1.5 text-small">{label}</span>
    return (
        <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery("") }}>
            <PopoverTrigger asChild>
                <button type="button" className={triggerClass} onClick={(e) => e.stopPropagation()}>
                    {label}
                    {saving && <Loader2 className="h-3 w-3 animate-spin text-fg-subtle" />}
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-64" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2 border-b border-line px-2 pb-1.5 pt-0.5">
                    <Search className="h-3.5 w-3.5 text-fg-subtle" />
                    <input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search people…"
                        className="h-7 min-w-0 flex-1 bg-transparent text-ui outline-none placeholder:text-fg-subtle"
                    />
                </div>
                <div className="max-h-64 overflow-y-auto pt-1">
                    {value && (
                        <button
                            type="button"
                            onClick={() => { setOpen(false); void run(null) }}
                            className="flex h-8 w-full items-center gap-2 rounded-control px-2 text-small text-fg-muted hover:bg-surface-hover"
                        >
                            <X className="h-3.5 w-3.5" /> Unassign
                        </button>
                    )}
                    {shown.map((p) => (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => { setOpen(false); if (p.id !== value?.id) void run(p) }}
                            className="flex h-8 w-full items-center gap-2 rounded-control px-2 text-left hover:bg-surface-hover"
                        >
                            <PersonAvatar person={p} />
                            <span className="min-w-0 flex-1 truncate">{p.name}</span>
                            {p.id === value?.id && <Check className="h-3.5 w-3.5 text-fg-muted" />}
                        </button>
                    ))}
                    {shown.length === 0 && <p className="px-2 py-2 text-small text-fg-subtle">No one matches</p>}
                </div>
            </PopoverContent>
        </Popover>
    )
}
