"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

/*
 * New UI (v2) Linear-style lists: a collapsible group header with a count, then dense 36px rows
 * (leading icon/avatar · title · meta · trailing properties). Used by Home, Inbox and the engagement
 * and client lists.
 */

export interface ListGroupProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
    title: React.ReactNode
    count?: number
    /** Trailing header content, e.g. a "View all" link. */
    action?: React.ReactNode
    defaultOpen?: boolean
    /** Leading header content, e.g. a status dot. */
    icon?: React.ReactNode
}

export function ListGroup({ title, count, action, icon, defaultOpen = true, className, children, ...props }: ListGroupProps) {
    const [open, setOpen] = React.useState(defaultOpen)
    return (
        <section className={cn("flex flex-col", className)} {...props}>
            <div className="flex h-8 items-center gap-1 rounded-control bg-surface-subtle pl-1 pr-2">
                <button
                    type="button"
                    onClick={() => setOpen((o) => !o)}
                    aria-expanded={open}
                    className="flex min-w-0 flex-1 items-center gap-1.5 rounded-control px-1 py-1 text-left text-small font-medium text-fg hover:bg-surface-hover"
                >
                    <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-fg-subtle transition-transform", open && "rotate-90")} />
                    {icon}
                    <span className="truncate">{title}</span>
                    {count !== undefined && <span className="text-small font-normal text-fg-subtle">{count}</span>}
                </button>
                {action}
            </div>
            {open && <div className="flex flex-col">{children}</div>}
        </section>
    )
}

export interface ListRowProps extends Omit<React.HTMLAttributes<HTMLElement>, "title" | "onClick"> {
    title: React.ReactNode
    /** Secondary text after the title, e.g. the client name. */
    meta?: React.ReactNode
    leading?: React.ReactNode
    /** Right-aligned properties: status pill, avatar, due date. */
    trailing?: React.ReactNode
    /** Renders the row as a link. */
    href?: string
    onClick?: () => void
    selected?: boolean
    /** Bold title — e.g. unread in the Inbox. */
    emphasized?: boolean
}

export function ListRow({ title, meta, leading, trailing, href, onClick, selected, emphasized, className, ...props }: ListRowProps) {
    const classes = cn(
        "group flex h-9 min-w-0 items-center gap-2.5 rounded-control px-2 text-ui text-fg transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30",
        selected && "bg-surface-selected hover:bg-surface-selected",
        className
    )
    const content = (
        <>
            {leading && <span className="flex shrink-0 items-center text-fg-muted [&_svg]:h-4 [&_svg]:w-4">{leading}</span>}
            <span className="flex min-w-0 flex-1 items-baseline gap-2">
                <span className={cn("truncate", emphasized && "font-semibold")}>{title}</span>
                {meta && <span className="truncate text-small text-fg-muted">{meta}</span>}
            </span>
            {trailing && <span className="flex shrink-0 items-center gap-2 text-small text-fg-muted">{trailing}</span>}
        </>
    )
    if (href) {
        return (
            <Link href={href} className={classes} aria-current={selected ? "true" : undefined} {...props}>
                {content}
            </Link>
        )
    }
    if (onClick) {
        return (
            <button type="button" onClick={onClick} className={cn(classes, "w-full text-left")} aria-pressed={selected} {...props}>
                {content}
            </button>
        )
    }
    return (
        <div className={classes} {...props}>
            {content}
        </div>
    )
}
