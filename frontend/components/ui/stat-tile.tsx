import type { LucideIcon } from 'lucide-react'

interface StatTileProps {
    icon: LucideIcon
    count: string | number
    label: string
    sub?: string
    colorClass: string
}

export function StatTile({ icon: Icon, count, label, sub, colorClass }: StatTileProps) {
    return (
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex items-center gap-3">
            <div className={`p-2.5 rounded-xl shrink-0 ${colorClass}`}>
                <Icon className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold text-gray-900 leading-none shrink-0">{count}</p>
            <div className="min-w-0">
                <p className="text-xs text-gray-500 font-medium leading-snug">{label}</p>
                {sub && <p className="text-[10px] text-gray-400 leading-snug">{sub}</p>}
            </div>
        </div>
    )
}
