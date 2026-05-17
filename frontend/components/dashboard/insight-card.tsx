"use client"

import { Zap, ArrowRight, LucideIcon } from "lucide-react"

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
    headerExtra
}: InsightCardProps) {
    const t = THEME_STYLES[theme]

    return (
        <div className={`bg-white border border-[#e5e7eb] rounded shadow-sm flex flex-col h-full ${className || ''}`}>

            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between rounded-t">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg border border-gray-100 shadow-sm ${t.iconBg}`}>
                        <Icon className={`h-4.5 w-4.5 ${t.iconColor}`} />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
                        {subtext && <p className="text-xs text-gray-500 font-medium">{subtext}</p>}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {action}
                    {headerExtra}
                    {count !== undefined && (
                        <span className="px-2.5 py-0.5 bg-gray-100 text-gray-600 text-xs font-bold rounded-full border border-gray-200">
                            {count}
                        </span>
                    )}
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 flex flex-col relative">
                {children ? (
                    <div className="p-0 flex-1">
                        {children}
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-2">
                        <div className="h-12 w-12 rounded-full bg-gray-50 flex items-center justify-center">
                            <Zap className="h-5 w-5 text-gray-300" />
                        </div>
                        <span className="text-xs font-medium text-gray-400 block px-4">
                            Analysis Pending...
                        </span>
                    </div>
                )}

                {/* Footer Action (Only if no children provided, usually) */}
                {!children && (
                    <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between group cursor-pointer hover:bg-[#f3f4f6] rounded-b transition-colors">
                        <span className="text-xs font-medium text-gray-500 group-hover:text-gray-900 transition-colors flex items-center gap-1">
                            View Details
                        </span>
                        <ArrowRight className="h-3 w-3 text-gray-400 group-hover:text-gray-900 group-hover:translate-x-1 transition-all" />
                    </div>
                )}
            </div>
        </div>
    )
}
