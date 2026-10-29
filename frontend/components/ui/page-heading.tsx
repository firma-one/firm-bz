import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * New UI (v2) page heading — Notion-style large left-aligned title with optional icon, description
 * and right-aligned actions. Breadcrumbs live in the shell's header bar, not here.
 */
export interface PageHeadingProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
    title: React.ReactNode
    description?: React.ReactNode
    /** Emoji, logo or icon shown before the title. */
    icon?: React.ReactNode
    actions?: React.ReactNode
    /** Quiet extras beside the title, such as the page's "How this works" link. */
    titleAside?: React.ReactNode
}

export function PageHeading({ title, description, icon, actions, titleAside, className, children, ...props }: PageHeadingProps) {
    return (
        <header className={cn("flex flex-col gap-1 pb-6", className)} {...props}>
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="flex min-w-0 items-center gap-3">
                    {icon && <span className="flex shrink-0 items-center text-fg-muted [&_svg]:h-7 [&_svg]:w-7">{icon}</span>}
                    <h1 className="min-w-0 truncate text-h1 text-fg">{title}</h1>
                    {titleAside}
                </div>
                {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
            </div>
            {description && <p className="max-w-2xl text-ui text-fg-muted">{description}</p>}
            {children}
        </header>
    )
}
