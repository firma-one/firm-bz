import type { LucideIcon } from 'lucide-react'

interface StatTileProps {
    icon: LucideIcon
    count: string | number
    label: string
    sub?: string
    colorClass: string
    countColorClass?: string
}

/** A flat Notion-style stat: muted label over a large number. `colorClass` tints only the icon. */
export function StatTile({ icon: Icon, count, label, sub, colorClass, countColorClass = 'text-fg' }: StatTileProps) {
    return (
        <div className="flex min-w-0 flex-col gap-1 py-1">
            <div className="flex items-center gap-1.5 text-small text-fg-muted">
                <Icon className={`h-3.5 w-3.5 shrink-0 ${colorClass.split(' ').filter((c) => c.startsWith('text-')).join(' ') || 'text-fg-subtle'}`} />
                <span className="truncate">{label}</span>
            </div>
            <p className={`text-h2 tabular-nums ${countColorClass}`}>{count}</p>
            {sub && <p className="text-caption font-normal text-fg-subtle">{sub}</p>}
        </div>
    )
}
