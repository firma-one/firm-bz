"use client"

import * as React from "react"
import { format } from "date-fns"
import { Check, Loader2, Search, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { StatusPill } from "@/components/ui/tag"
import { cn } from "@/lib/utils"
import type { StatusKind } from "@/lib/ui/status-colors"

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
    overdue,
}: {
    kind: StatusKind
    value: string
    options: string[]
    onChange: (next: string) => unknown | Promise<unknown>
    disabled?: boolean
    overdue?: boolean
}) {
    const [open, setOpen] = React.useState(false)
    const { saving, run } = useSaving(onChange)
    const pill = <StatusPill kind={kind} status={value} overdue={overdue} />
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
function parseDateValue(value: string): Date {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value)
}

function toInputValue(iso: string | null): string {
    if (!iso) return ""
    // A bare calendar day is already the answer — parsing it would read it as UTC midnight and
    // show the previous day west of Greenwich.
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? "" : format(d, "yyyy-MM-dd")
}

export function DateProperty({
    value,
    onChange,
    disabled,
    placeholder = "Empty",
    highlightOverdue = false,
}: {
    /** ISO date-time or null. */
    value: string | null
    /** Receives an ISO date (yyyy-MM-dd) or null to clear. */
    onChange: (next: string | null) => unknown | Promise<unknown>
    disabled?: boolean
    placeholder?: string
    /** Show past dates in red — for due dates. */
    highlightOverdue?: boolean
}) {
    const [open, setOpen] = React.useState(false)
    const { saving, run } = useSaving(onChange)
    const date = value ? parseDateValue(value) : null
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
    const overdue = highlightOverdue && date !== null && date < startOfToday
    const label = date && !Number.isNaN(date.getTime()) ? (
        <span className={cn("tabular-nums", overdue && "text-danger")}>{format(date, "MMM d, yyyy")}</span>
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
            <PopoverContent className="w-60 p-2" onClick={(e) => e.stopPropagation()}>
                <input
                    type="date"
                    autoFocus
                    defaultValue={toInputValue(value)}
                    onChange={(e) => {
                        if (!e.target.value) return
                        setOpen(false)
                        void run(e.target.value)
                    }}
                    className="h-8 w-full rounded-control border border-line-strong bg-surface px-2 text-ui text-fg focus:border-action/60 focus:outline-none focus:ring-2 focus:ring-action/20"
                />
                {value && (
                    <button
                        type="button"
                        onClick={() => {
                            setOpen(false)
                            void run(null)
                        }}
                        className="mt-1 flex h-8 w-full items-center gap-2 rounded-control px-2 text-small text-fg-muted hover:bg-surface-hover hover:text-fg"
                    >
                        <X className="h-3.5 w-3.5" /> Clear date
                    </button>
                )}
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
        <span style={style} className="flex shrink-0 items-center justify-center rounded-full bg-surface-muted text-[10px] font-medium text-fg-muted">
            {(person.name || "?").trim().charAt(0).toUpperCase()}
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
