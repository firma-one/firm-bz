import * as React from "react"
import { cn } from "@/lib/utils"

/*
 * Notion-style table. Two ways to draw it (.claude/plans/app-design-refinements.md, "The standard table"):
 *
 *   grid (the default): Notion's database view. Hairlines above and below the header, between rows and
 *     between columns, and no outer border on the sides; 34px rows. The standard for every table.
 *   hairline: the earlier style (ui-ux-overhaul.md, Phase 6). A muted 32px header, row dividers only,
 *     36px rows, the first column flush with the page.
 *
 * Both have a hover tint, a selected tint, and a trailing actions cell that appears on row hover.
 *
 *   <NotionTable>
 *     <NotionTableHeader>
 *       <NotionTableHead icon={<Type />}>Name</NotionTableHead> … <NotionTableActionsHead />
 *     </NotionTableHeader>
 *     <NotionTableBody>
 *       <NotionTableRow> <NotionTableCell>…</NotionTableCell> … <NotionTableActions>…</NotionTableActions> </NotionTableRow>
 *     </NotionTableBody>
 *   </NotionTable>
 *
 * In the grid every line sits on a cell, not a row: the table is border-separate so a sticky header keeps
 * its lines (with border-collapse they stay behind when the header sticks). A row written by hand, such as
 * a full-width group header, needs `border-b border-line` on its cell to keep the grid closed.
 */

export type NotionTableVariant = "grid" | "hairline"

const VariantContext = React.createContext<NotionTableVariant>("grid")

export function NotionTable({
    variant = "grid",
    scrollContainer = true,
    className,
    children,
    ...props
}: React.TableHTMLAttributes<HTMLTableElement> & {
    variant?: NotionTableVariant
    /**
     * Wrap the table in its own horizontal scroller. Turn it off when an ancestor already scrolls and the
     * header is sticky: the wrapper would become the header's scroll container, and it would stop sticking.
     */
    scrollContainer?: boolean
}) {
    const table = (
        <table
            className={cn(
                "w-full text-left text-ui text-fg",
                variant === "grid" ? "border-separate border-spacing-0" : "border-collapse",
                className
            )}
            {...props}
        >
            {children}
        </table>
    )
    return (
        <VariantContext.Provider value={variant}>
            {scrollContainer ? <div className="w-full overflow-x-auto">{table}</div> : table}
        </VariantContext.Provider>
    )
}

export function NotionTableHeader({ className, children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
    const variant = React.useContext(VariantContext)
    return (
        <thead className={cn(variant === "hairline" && "border-b border-line", className)} {...props}>
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
    const variant = React.useContext(VariantContext)
    return (
        <th
            className={cn(
                "whitespace-nowrap text-small font-normal text-fg-muted",
                variant === "grid"
                    ? "h-[34px] border-y border-l border-line px-2.5 first:border-l-0"
                    : "h-8 px-2 first:pl-1",
                className
            )}
            {...props}
        >
            <span className="inline-flex items-center gap-1.5 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:text-fg-subtle">
                {icon}
                {children}
            </span>
        </th>
    )
}

/** Header cell over the trailing actions column: no label, and no column line before it. */
export function NotionTableActionsHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
    const variant = React.useContext(VariantContext)
    return (
        <th
            aria-label="Actions"
            className={cn("w-px", variant === "grid" && "border-y border-line", className)}
            {...props}
        />
    )
}

export function NotionTableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
    const variant = React.useContext(VariantContext)
    // The grid keeps its last line, which closes it; the hairline style ends on the last row's text.
    return <tbody className={cn(variant === "hairline" && "[&>tr:last-child]:border-b-0", className)} {...props} />
}

export function NotionTableRow({
    className,
    selected,
    ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }) {
    const variant = React.useContext(VariantContext)
    return (
        <tr
            data-selected={selected ? "" : undefined}
            className={cn(
                "group/row transition-colors hover:bg-surface-hover data-[selected]:bg-surface-selected",
                variant === "grid" ? "h-[34px]" : "h-9 border-b border-line",
                props.onClick && "cursor-pointer",
                className
            )}
            {...props}
        />
    )
}

export function NotionTableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
    const variant = React.useContext(VariantContext)
    return (
        <td
            className={cn(
                "py-1 align-middle",
                variant === "grid" ? "border-b border-l border-line px-2.5 first:border-l-0" : "px-2 first:pl-1",
                className
            )}
            {...props}
        />
    )
}

/** Trailing cell whose contents (⋯ menu, quick actions) show only on row hover or keyboard focus. */
export function NotionTableActions({ className, children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
    const variant = React.useContext(VariantContext)
    return (
        <td
            className={cn("w-px whitespace-nowrap px-1 text-right align-middle", variant === "grid" && "border-b border-line", className)}
            onClick={(e) => e.stopPropagation()}
            {...props}
        >
            {/* Only the contents fade, so the grid's line under this cell stays put. */}
            <div className="opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100">{children}</div>
        </td>
    )
}
