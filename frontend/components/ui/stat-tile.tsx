import type { LucideIcon } from 'lucide-react'

interface StatTileProps {
    icon: LucideIcon
    count: string | number
    label: string
    sub?: string
    colorClass: string
    countColorClass?: string
}

export function StatTile({ icon: Icon, count, label, sub, colorClass, countColorClass = 'text-gray-900' }: StatTileProps) {
    return (
        <div className="bg-white rounded p-4 border border-[#e5e7eb] shadow-md flex flex-col gap-2 min-w-0 h-full">
            <div className="flex items-center gap-2">
                <div className={`p-2 rounded shrink-0 ${colorClass}`}>
                    <Icon className="h-3.5 w-3.5" />
                </div>
                <p className={`text-2xl font-bold leading-none ${countColorClass}`}>{count}</p>
            </div>
            <div className="min-w-0">
                <p className="text-xs text-gray-500 font-medium leading-snug">{label}</p>
                {sub && <p className="text-[10px] text-gray-400 leading-snug">{sub}</p>}
            </div>
        </div>
    )
}
