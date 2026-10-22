import type { ReactNode } from "react"

/*
 * One heading for every Home section (.claude/plans/app-design-refinements.md, section 13): its icon,
 * title and count over a hairline, any action at the right, then the content 12px below. Sections sit
 * 40px apart (HomeView), so these headings — not boxes or rules between sections — mark where each
 * one starts.
 */

export function HomeSection({
    icon,
    title,
    count,
    actions,
    children,
}: {
    icon: ReactNode
    title: ReactNode
    count?: number
    /** Trailing header content: a link, view toggles. */
    actions?: ReactNode
    children: ReactNode
}) {
    return (
        <section className="flex flex-col gap-3">
            <div className="flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line pb-2">
                <span className="flex shrink-0 text-fg-muted [&_svg]:h-4 [&_svg]:w-4" aria-hidden>
                    {icon}
                </span>
                <h2 className="text-ui font-semibold text-fg">{title}</h2>
                {count !== undefined && <span className="text-small tabular-nums text-fg-subtle">{count}</span>}
                {actions && <div className="ml-auto flex items-center gap-3">{actions}</div>}
            </div>
            {children}
        </section>
    )
}

/** A section with nothing in it says so in one quiet line, in line with the rows' text. */
export function HomeEmptyLine({ children }: { children: ReactNode }) {
    return <p className="px-2 text-small text-fg-muted">{children}</p>
}
