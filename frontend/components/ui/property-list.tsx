import * as React from "react"
import { cn } from "@/lib/utils"

/*
 * New UI (v2) Notion-style property list: a column of label → value rows (Status, Lead, Due, …)
 * at the top of an engagement, client or document.
 */

/**
 * Settings forms built from property rows (engagement, client, firm): borderless fields that tint
 * on hover and outline on focus, so a row reads as a value until you edit it.
 */
export const PROPERTY_FIELD_CLASS =
    "h-8 w-full border-transparent bg-transparent px-2 text-ui text-fg shadow-none hover:bg-surface-hover focus-visible:bg-surface disabled:hover:bg-transparent"
export const PROPERTY_TEXTAREA_CLASS =
    "min-h-[64px] border-transparent bg-transparent px-2 py-1.5 text-ui text-fg shadow-none hover:bg-surface-hover focus-visible:bg-surface disabled:hover:bg-transparent"
/** Hint under a property value, aligned with the field's text. */
export const PROPERTY_HINT_CLASS = "px-2 text-caption text-fg-subtle"
/** Section title over a group of property rows. */
export const SETTINGS_SECTION_HEADING_CLASS = "mb-2 border-b border-line pb-2 text-h3 text-fg"

export function PropertyList({ className, ...props }: React.HTMLAttributes<HTMLDListElement>) {
    return <dl className={cn("flex flex-col gap-0.5", className)} {...props} />
}

export interface PropertyRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
    label: React.ReactNode
    icon?: React.ReactNode
    children: React.ReactNode
}

export function PropertyRow({ label, icon, children, className, ...props }: PropertyRowProps) {
    return (
        <div className={cn("flex min-h-8 items-start gap-2 py-0.5", className)} {...props}>
            <dt className="flex h-8 w-28 shrink-0 items-center gap-1.5 text-small text-fg-muted sm:w-40 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0">
                {icon}
                <span className="truncate">{label}</span>
            </dt>
            <dd className="flex min-h-8 min-w-0 flex-1 items-center gap-1.5 text-small text-fg">{children}</dd>
        </div>
    )
}
