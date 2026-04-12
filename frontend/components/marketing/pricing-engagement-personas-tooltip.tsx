import { ENGAGEMENT_PERSONA_TOOLTIP_ROWS, ENGAGEMENT_PERSONAS_TOOLTIP_FOOTER } from '@/config/pricing'
import { cn } from '@/lib/utils'

/** Matches pricing hero inline marker (`KINETIC_LEAD_MARKER` on pricing page). */
const ROLE_MARKER =
    'box-decoration-clone rounded-sm bg-[#fdf6df] px-[0.2em] py-[0.05em] font-bold text-[#2a261c]'

export function PricingEngagementPersonasTooltip() {
    return (
        <div className="max-w-lg space-y-2.5">
            {ENGAGEMENT_PERSONA_TOOLTIP_ROWS.map((row) => (
                <p key={row.role} className="text-sm leading-snug text-[#45474c]">
                    <span className={cn(ROLE_MARKER)}>{row.role}</span>
                    <span className="font-semibold text-[#1b1b1d]"> — </span>
                    {row.body}
                </p>
            ))}
            <p className="border-t border-[#c6c6cc]/25 pt-2 text-sm leading-snug text-[#45474c]">
                {ENGAGEMENT_PERSONAS_TOOLTIP_FOOTER}
            </p>
        </div>
    )
}
