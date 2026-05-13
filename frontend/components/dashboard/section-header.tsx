"use client"

import { LucideIcon } from "lucide-react"
import { InsightTheme } from "./insight-card"

const THEME_STYLES: Record<InsightTheme, { iconColor: string, iconBg: string }> = {
    blue: { iconColor: 'text-blue-600', iconBg: 'bg-blue-50' },
    purple: { iconColor: 'text-purple-600', iconBg: 'bg-purple-50' },
    green: { iconColor: 'text-green-600', iconBg: 'bg-green-50' },
    amber: { iconColor: 'text-amber-600', iconBg: 'bg-amber-50' },
    red: { iconColor: 'text-red-600', iconBg: 'bg-red-50' },
}

interface SectionHeaderProps {
    icon: LucideIcon
    title: string
    description: string
    theme: InsightTheme
}

export function SectionHeader({ icon: Icon, title, description, theme }: SectionHeaderProps) {
    const t = THEME_STYLES[theme]

    return (
        <div className="mb-2 px-1 min-h-[80px]">
            <div className="flex items-center space-x-3 mb-1">
                <div className={`p-2 rounded-lg border border-gray-100 shadow-sm ${t.iconBg}`}>
                    <Icon className={`h-4.5 w-4.5 ${t.iconColor}`} />
                </div>
                <h2 className="text-base font-bold text-gray-900">{title}</h2>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed pl-11 pr-2 line-clamp-3">{description}</p>
        </div>
    )
}
