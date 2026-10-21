"use client"

import * as React from "react"
import { Check, ChevronDown, X } from "lucide-react"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

/*
 * Notion's filter bar, shared by Doc Search and the engagement Files toolbar
 * (.claude/plans/ui-ux-overhaul.md, Phase 6). A pill per filter opens a compact menu.
 */

export interface FilterPillProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "value"> {
    icon: React.ReactNode
    label: string
    /** The chosen value. Set, the pill is filled in the accent and reads "Label: value". */
    value?: React.ReactNode
    /** Shows an x on a set pill that clears the filter, in place of the chevron. */
    onClear?: () => void
    /** Doc Search's zero-result ladder: still shown, struck through, but not applied. */
    relaxed?: boolean
    /** Neutral styling even with a value — for controls that always have one, like Sort. */
    neutral?: boolean
    /** Makes the pill an on/off toggle (Files' "Deliverables"): filled while on, no menu chevron. */
    pressed?: boolean
}

/** The pill itself. Use it as a DropdownMenuTrigger's child; it forwards the ref. */
export const FilterPill = React.forwardRef<HTMLButtonElement, FilterPillProps>(function FilterPill(
    { icon, label, value, onClear, relaxed = false, neutral = false, pressed, className, ...props },
    ref
) {
    const isToggle = pressed !== undefined
    const isSet = !isToggle && value !== undefined && value !== null && value !== ""
    const filled = isToggle ? pressed : isSet && !neutral && !relaxed
    return (
        <button
            ref={ref}
            type="button"
            aria-pressed={isToggle ? pressed : undefined}
            {...props}
            className={cn(
                "inline-flex h-7 max-w-[18rem] items-center gap-1.5 rounded-full border px-2.5 text-small transition-colors outline-none focus-visible:ring-2 focus-visible:ring-action/30",
                "disabled:pointer-events-none disabled:opacity-40",
                filled
                    ? "border-action/30 bg-action/[0.08] text-action hover:bg-action/[0.14]"
                    : "border-line text-fg-muted hover:bg-surface-hover hover:text-fg",
                relaxed && "border-dashed border-line-strong",
                className
            )}
        >
            <span className={cn("flex shrink-0 items-center [&_svg]:h-3.5 [&_svg]:w-3.5", !filled && "text-fg-subtle")}>{icon}</span>
            {isSet ? (
                <span className="flex min-w-0 items-baseline gap-1">
                    <span className="shrink-0 opacity-75">{label}:</span>
                    <span className={cn("truncate", !neutral && "font-medium", relaxed && "line-through")}>{value}</span>
                </span>
            ) : (
                <span>{label}</span>
            )}
            {relaxed && <span className="shrink-0 text-caption">not applied</span>}
            {isSet && onClear ? (
                <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Clear ${label} filter`}
                    onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onClear()
                    }}
                    className="-mr-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full hover:bg-action/15"
                >
                    <X className="h-3 w-3" />
                </span>
            ) : isToggle ? null : (
                <ChevronDown className="h-3 w-3 shrink-0 text-fg-subtle" />
            )}
        </button>
    )
})

/** Several picks on a pill: "Folders, Documents", then "Folders +2" from three. */
export function summarizePicks(labels: string[]): string {
    if (labels.length <= 2) return labels.join(", ")
    return `${labels[0]} +${labels.length - 1}`
}

/** The menu's caption: the property name, or a section within the menu. */
export function FilterMenuLabel({ children, className }: { children: React.ReactNode; className?: string }) {
    return <p className={cn("px-2 pb-1 pt-1.5 text-caption text-fg-subtle", className)}>{children}</p>
}

/** One row in a filter menu, Notion-style: compact, with a check on the chosen value. */
export function FilterMenuRow({
    selected,
    multi = false,
    icon,
    onSelect,
    children,
}: {
    selected: boolean
    /**
     * Multi-select (Type): a checkbox leads the row and the menu stays open, so several values can
     * be ticked. Single-select rows show a check on the chosen value and close the menu.
     */
    multi?: boolean
    /** Optional leading icon, after the checkbox. */
    icon?: React.ReactNode
    onSelect: () => void
    children: React.ReactNode
}) {
    return (
        <DropdownMenuItem
            onSelect={(e) => {
                if (multi) e.preventDefault()
                onSelect()
            }}
            role={multi ? "menuitemcheckbox" : undefined}
            aria-checked={multi ? selected : undefined}
            className={cn("h-8 cursor-pointer gap-2 px-2 py-0", !multi && selected && "font-medium")}
        >
            {multi && (
                <span
                    aria-hidden
                    className={cn(
                        "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border",
                        selected ? "border-action bg-action text-action-fg" : "border-line-strong"
                    )}
                >
                    {selected && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                </span>
            )}
            {icon && <span className="flex shrink-0 items-center text-fg-subtle [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>}
            <span className="min-w-0 flex-1 truncate">{children}</span>
            {!multi && selected && <Check className="h-3.5 w-3.5 shrink-0 text-fg-muted" aria-hidden />}
        </DropdownMenuItem>
    )
}

/**
 * The search box at the top of a long filter menu. Radix focuses the menu itself when it opens, so
 * this takes the focus back on the next frame: typing filters the list straight away. Typing stays
 * in the box; arrows and Escape still reach the menu.
 */
export function FilterMenuSearch(props: Omit<React.InputHTMLAttributes<HTMLInputElement>, "className">) {
    const ref = React.useRef<HTMLInputElement>(null)
    React.useEffect(() => {
        const id = requestAnimationFrame(() => ref.current?.focus())
        return () => cancelAnimationFrame(id)
    }, [])
    return (
        <div className="px-1 pb-1">
            <input
                ref={ref}
                {...props}
                onKeyDown={(e) => {
                    if (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete") e.stopPropagation()
                    props.onKeyDown?.(e)
                }}
                className="h-7 w-full rounded-control border border-line bg-surface-subtle px-2 text-small text-fg placeholder:text-fg-subtle focus:border-line-strong focus:bg-surface focus:outline-none"
            />
        </div>
    )
}
