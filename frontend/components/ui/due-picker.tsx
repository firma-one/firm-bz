"use client"

import * as React from "react"
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfDay, startOfMonth, startOfWeek } from "date-fns"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Hint } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { formatDue, formatTime, parseDueInput, quickPicks, readDue, relativeDay, writeDue } from "@/lib/ui/due-date"

/*
 * The date picker (.claude/plans/app-design-refinements.md, section 12): one panel wherever a due date
 * is set — beside the document menu's Due row, under a table cell or a header property (DateProperty),
 * and in the Promote dialog. Date first: type a date or pick one, and a pick is saved at once. A time
 * only if one is added, with the time zone named beside it.
 */

const WEEKDAY_INITIALS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]

/** Half-hour steps through the day, "00:00" to "23:30". */
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`)

/** The viewer's time zone, short ("GMT+5:30") and in full ("India Standard Time"). */
function timeZoneNames(at: Date): { short: string; long: string } {
    const part = (style: "short" | "long") =>
        new Intl.DateTimeFormat("en-US", { timeZoneName: style }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? ""
    const short = part("short")
    return { short, long: part("long") || short }
}

export interface DuePickerPanelProps {
    /** "yyyy-MM-dd", an ISO instant, or null. */
    value: string | null
    /**
     * A new value: "yyyy-MM-dd" for a day, an ISO instant for a day with a time, null to clear.
     * `close` is true when the pick is final (a day without a time, or Clear).
     */
    onCommit: (value: string | null, close: boolean) => void
    /** Offer "Add time". Engagement dates are days, so the header leaves it off. */
    allowTime?: boolean
    /** Names the typed-date field for screen readers. */
    label?: string
    autoFocus?: boolean
}

export function DuePickerPanel({ value, onCommit, allowTime = false, label = "Date", autoFocus = true }: DuePickerPanelProps) {
    const current = readDue(value)
    const now = new Date()
    const today = startOfDay(now)
    const [text, setText] = React.useState("")
    const [month, setMonth] = React.useState(() => startOfMonth(current?.day ?? today))
    const [timeOn, setTimeOn] = React.useState(allowTime && !!current?.time)
    const [time, setTime] = React.useState(current?.time ?? "17:00")
    // The day a hovered quick pick would choose, shown in the calendar before you click.
    const [preview, setPreview] = React.useState<Date | null>(null)
    const typed = text ? parseDueInput(text, now) : null
    const tz = timeZoneNames(now)
    const timeOptions = TIME_OPTIONS.includes(time) ? TIME_OPTIONS : [...TIME_OPTIONS, time].sort()

    const commitDay = (day: Date) => onCommit(writeDue(day, timeOn ? time : null), !timeOn)
    const days = eachDayOfInterval({
        start: startOfWeek(month, { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
    })

    return (
        <div
            className="w-[280px] py-1"
            // Keys stay in the picker: inside a menu, letters would otherwise jump to menu items.
            onKeyDown={(e) => {
                if (e.key !== "Escape") e.stopPropagation()
            }}
        >
            <div className="mx-1 mb-1 flex h-[30px] items-center gap-2 rounded-control bg-surface-subtle px-2 shadow-[inset_0_0_0_1px_var(--ui-line)] focus-within:shadow-[inset_0_0_0_1px_var(--ui-line-strong)]">
                <CalendarDays className={cn("h-3.5 w-3.5 shrink-0", current ? "text-fg-muted" : "text-fg-subtle")} />
                <input
                    autoFocus={autoFocus}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && typed) {
                            e.preventDefault()
                            commitDay(typed)
                        }
                    }}
                    placeholder={current ? formatDue(timeOn ? current : { ...current, time: null }) : "Type a date: fri, next week, oct 30"}
                    aria-label={label}
                    className={cn(
                        "min-w-0 flex-1 bg-transparent text-small text-fg outline-none",
                        current ? "placeholder:text-fg" : "placeholder:text-fg-subtle"
                    )}
                />
                <span className="shrink-0 text-caption text-fg-subtle">
                    {text ? (typed ? `↵ ${format(typed, "EEE, MMM d")}` : "Not a date") : current ? relativeDay(current.day, now) : ""}
                </span>
            </div>

            {quickPicks(now).map((pick) => (
                <button
                    key={pick.label}
                    type="button"
                    onClick={() => commitDay(pick.day)}
                    onMouseEnter={() => setPreview(pick.day)}
                    onMouseLeave={() => setPreview(null)}
                    onFocus={() => setPreview(pick.day)}
                    onBlur={() => setPreview(null)}
                    className="mx-1 flex h-7 w-[calc(100%-0.5rem)] items-center rounded-control px-2 text-left text-small text-fg transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none"
                >
                    {pick.label}
                    <span className="ml-auto tabular-nums text-fg-subtle">{format(pick.day, "EEE, MMM d")}</span>
                </button>
            ))}

            <div className="my-1 h-px bg-line" />

            <div className="flex h-[30px] items-center pl-3 pr-2">
                <span className="text-small font-medium text-fg">{format(month, "MMMM yyyy")}</span>
                <span className="flex-1" />
                <button type="button" aria-label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))} className="inline-flex h-6 w-6 items-center justify-center rounded-control text-fg-muted hover:bg-surface-hover hover:text-fg">
                    <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))} className="inline-flex h-6 w-6 items-center justify-center rounded-control text-fg-muted hover:bg-surface-hover hover:text-fg">
                    <ChevronRight className="h-3.5 w-3.5" />
                </button>
            </div>
            <div className="grid h-[22px] grid-cols-7 items-center px-1.5 text-center text-[11px] text-fg-subtle" aria-hidden>
                {WEEKDAY_INITIALS.map((d) => <span key={d}>{d}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-y-0.5 px-1.5 pb-1" role="grid" aria-label={format(month, "MMMM yyyy")}>
                {days.map((day) => {
                    const selected = !!current && isSameDay(day, current.day)
                    const inMonth = isSameMonth(day, month)
                    const isToday = isSameDay(day, today)
                    return (
                        <button
                            key={day.toISOString()}
                            type="button"
                            onClick={() => commitDay(day)}
                            aria-label={format(day, "EEEE, MMMM d, yyyy")}
                            aria-pressed={selected}
                            className={cn(
                                "mx-auto flex h-7 w-7 items-center justify-center rounded-full text-small tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30",
                                selected
                                    ? "bg-fg font-semibold text-white"
                                    : cn(
                                        "hover:bg-surface-hover",
                                        !inMonth ? "text-fg-subtle opacity-60" : isToday ? "font-semibold text-action" : day < today ? "text-fg-muted" : "text-fg",
                                        preview && isSameDay(day, preview) && "bg-surface-hover ring-1 ring-inset ring-line-strong"
                                    )
                            )}
                        >
                            {format(day, "d")}
                        </button>
                    )
                })}
            </div>

            <div className="my-1 h-px bg-line" />

            <div className="flex h-[34px] items-center gap-2 px-2.5">
                {allowTime && (
                    <>
                        <Switch
                            checked={timeOn}
                            aria-label="Add a time"
                            onCheckedChange={(on) => {
                                setTimeOn(on)
                                if (current) onCommit(writeDue(current.day, on ? time : null), false)
                            }}
                        />
                        {timeOn ? (
                            <>
                                <select
                                    value={time}
                                    aria-label="Time"
                                    onChange={(e) => {
                                        setTime(e.target.value)
                                        if (current) onCommit(writeDue(current.day, e.target.value), false)
                                    }}
                                    className="h-[26px] rounded-control border-0 bg-surface px-1.5 text-small tabular-nums text-fg shadow-[inset_0_0_0_1px_var(--ui-line-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-action/30"
                                >
                                    {timeOptions.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
                                </select>
                                <Hint label={tz.long}>
                                    <span className="cursor-default border-b border-dotted border-line-strong text-caption text-fg-subtle">{tz.short}</span>
                                </Hint>
                            </>
                        ) : (
                            <span className="text-small text-fg">Add time</span>
                        )}
                    </>
                )}
                <span className="flex-1" />
                {current && (
                    <button
                        type="button"
                        onClick={() => onCommit(null, true)}
                        className="h-6 rounded-control px-1.5 text-small text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
                    >
                        Clear
                    </button>
                )}
            </div>
        </div>
    )
}
