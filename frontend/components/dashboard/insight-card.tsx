"use client"

import { Zap, LucideIcon } from "lucide-react"

export type InsightTheme = 'blue' | 'purple' | 'green' | 'amber' | 'red'

const THEME_STYLES: Record<InsightTheme, { iconColor: string, iconBg: string }> = {
    blue: { iconColor: 'text-blue-600', iconBg: 'bg-blue-50' },
    purple: { iconColor: 'text-purple-600', iconBg: 'bg-purple-50' },
    green: { iconColor: 'text-green-600', iconBg: 'bg-green-50' },
    amber: { iconColor: 'text-amber-600', iconBg: 'bg-amber-50' },
    red: { iconColor: 'text-red-600', iconBg: 'bg-red-50' },
}

interface InsightCardProps {
    title: string
    icon: LucideIcon
    theme: InsightTheme
    count?: number
    subtext?: string
    children?: React.ReactNode
    className?: string
    action?: React.ReactNode
    headerExtra?: React.ReactNode
    /** Inline after the title, e.g. the Brio mark on an AI-written section. */
    titleAddon?: React.ReactNode
}

export function InsightCard({
    title,
    icon: Icon,
    theme,
    count,
    subtext,
    children,
    className,
    action,
    headerExtra,
    titleAddon
}: InsightCardProps) {
    // Notion section, not a card: a heading row and the content below it — no border, shadow or
    // colored icon chip. `theme` is kept for callers but no longer colors anything.
    void THEME_STYLES[theme]

    return (
        <section className={`flex flex-col h-full ${className || ''}`}>
            <div className="flex items-center justify-between gap-3 pb-2">
                <div className="flex min-w-0 items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0 text-fg-subtle" />
                    <h3 className="truncate text-h3 text-fg">{title}</h3>
                    {titleAddon}
                    {count !== undefined && <span className="text-small tabular-nums text-fg-subtle">{count}</span>}
                    {subtext && <span className="truncate text-small text-fg-muted">· {subtext}</span>}
                </div>
                <div className="flex items-center gap-2">
                    {action}
                    {headerExtra}
                </div>
            </div>

            <div className="flex-1 flex flex-col relative border-t border-line">
                {children ? (
                    <div className="flex-1">{children}</div>
                ) : (
                    <div className="flex flex-1 flex-col items-center justify-center gap-1 px-4 py-8 text-center">
                        <Zap className="h-5 w-5 text-fg-subtle" />
                        <span className="text-small text-fg-subtle">Analysis pending…</span>
                    </div>
                )}
            </div>
        </section>
    )
}
