import { Lock } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** Inert tab matching real TabsTrigger styling — shown for tabs that need live data, not wired to any page. */
export function DemoDeadTab({ icon: Icon, label, badgeText }: { icon: React.ComponentType<{ className?: string }>; label: string; badgeText?: string }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span className="relative group/lock h-full px-4 rounded-none font-medium text-sm text-[#45474c] opacity-60 border-b-2 border-transparent bg-transparent inline-flex items-center cursor-not-allowed">
                    <Icon className="w-4 h-4 mr-2" />
                    {label}
                    <span title="Internal only"><Lock className="w-2.5 h-2.5 ml-1 text-[#45474c]/40 shrink-0" /></span>
                    {badgeText && (
                        <span className="ml-1 rounded px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 leading-none">{badgeText}</span>
                    )}
                </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Not available in this demo</TooltipContent>
        </Tooltip>
    )
}
