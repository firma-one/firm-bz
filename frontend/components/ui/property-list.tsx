import * as React from "react"
import { cn } from "@/lib/utils"

/*
 * New UI (v2) Notion-style property list: a column of label → value rows (Status, Lead, Due, …)
 * at the top of an engagement, client or document.
 */

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
