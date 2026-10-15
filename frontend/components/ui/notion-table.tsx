import * as React from "react"
import { cn } from "@/lib/utils"

/*
 * Notion-style table (.claude/plans/ui-ux-overhaul.md, Phase 6). No outer border or card: a muted
 * 32px header row with optional column icons, hairline row dividers, 36px rows with a hover tint,
 * and a trailing actions cell that appears on row hover.
 *
 *   <NotionTable>
 *     <NotionTableHeader>
 *       <NotionTableHead icon={<Type />}>Name</NotionTableHead> …
 *     </NotionTableHeader>
 *     <NotionTableBody>
 *       <NotionTableRow> <NotionTableCell>…</NotionTableCell> … <NotionTableActions>…</NotionTableActions> </NotionTableRow>
 *     </NotionTableBody>
 *   </NotionTable>
 */

export function NotionTable({ className, children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
    return (
        <div className="w-full overflow-x-auto">
            <table className={cn("w-full border-collapse text-left text-ui text-fg", className)} {...props}>
                {children}
            </table>
        </div>
    )
}

export function NotionTableHeader({ className, children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
    return (
        <thead className={cn("border-b border-line", className)} {...props}>
            <tr>{children}</tr>
        </thead>
    )
}

export function NotionTableHead({
    icon,
    className,
    children,
    ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { icon?: React.ReactNode }) {
    return (
        <th
            className={cn("h-8 whitespace-nowrap px-2 text-small font-normal text-fg-muted first:pl-1", className)}
            {...props}
        >
            <span className="inline-flex items-center gap-1.5 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:text-fg-subtle">
                {icon}
                {children}
            </span>
        </th>
    )
}

export function NotionTableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
    return <tbody className={cn("[&>tr:last-child]:border-b-0", className)} {...props} />
}

export function NotionTableRow({
    className,
    selected,
    ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }) {
    return (
        <tr
            data-selected={selected ? "" : undefined}
            className={cn(
                "group/row h-9 border-b border-line transition-colors hover:bg-surface-hover data-[selected]:bg-surface-selected",
                props.onClick && "cursor-pointer",
                className
            )}
            {...props}
        />
    )
}

export function NotionTableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
    return <td className={cn("px-2 py-1 align-middle first:pl-1", className)} {...props} />
}

/** Trailing cell whose contents (⋯ menu, quick actions) show only on row hover or keyboard focus. */
export function NotionTableActions({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
    return (
        <td
            className={cn(
                "w-px whitespace-nowrap px-1 text-right align-middle opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100",
                className
            )}
            onClick={(e) => e.stopPropagation()}
            {...props}
        />
    )
}
