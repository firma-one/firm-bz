import * as React from "react"
import { cn } from "@/lib/utils"
import {
    OVERDUE_STYLE,
    TAG_CLASSES,
    TAG_DOT_CLASSES,
    statusStyle,
    type StatusKind,
    type TagColor,
} from "@/lib/ui/status-colors"

/*
 * New UI (v2) primitives — Notion-style tags. Token-based, so outside data-ui="v2" they fall back
 * to the legacy token values; use them on v2 surfaces only.
 */

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
    color?: TagColor
    /** Leading dot in the tag's text color — for status, where the color carries meaning. */
    dot?: boolean
}

export function Tag({ color = "gray", dot = false, className, children, ...props }: TagProps) {
    return (
        <span
            className={cn(
                "inline-flex h-5 max-w-full items-center gap-1.5 whitespace-nowrap rounded-control px-1.5 text-caption",
                TAG_CLASSES[color],
                className
            )}
            {...props}
        >
            {dot && <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TAG_DOT_CLASSES[color])} />}
            <span className="truncate">{children}</span>
        </span>
    )
}

export interface StatusPillProps extends Omit<TagProps, "color" | "children"> {
    kind: StatusKind
    status: string
    /** Shows "Overdue" in red instead of the status, e.g. past its due date and not yet approved. */
    overdue?: boolean
}

/** A status from lib/ui/status-colors.ts — the one place status colors and labels are decided. */
export function StatusPill({ kind, status, overdue = false, dot = true, ...props }: StatusPillProps) {
    const style = overdue ? OVERDUE_STYLE : statusStyle(kind, status)
    return (
        <Tag color={style.color} dot={dot} {...props}>
            {style.label}
        </Tag>
    )
}
