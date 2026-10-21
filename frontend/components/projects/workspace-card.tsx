'use client'

import type { ReactNode } from 'react'
import { Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { interactiveCardClass } from '@/components/ui/interactive-card'

const HEX = /^#[0-9A-Fa-f]{6}$/

/** A workspace's logo, else its icon on a tile tinted with its brand color. `sm` for table rows. */
export function WorkspaceMark({
    logoUrl,
    accent,
    icon,
    size = 'md',
}: {
    logoUrl?: string | null
    accent?: string | null
    icon?: ReactNode
    size?: 'sm' | 'md'
}) {
    const tint = accent && HEX.test(accent) ? accent : null
    const box = size === 'sm' ? 'h-5 w-5 [&_svg]:h-3 [&_svg]:w-3' : 'h-9 w-9 [&_svg]:h-4 [&_svg]:w-4'
    if (logoUrl) {
        return (
            <span className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-control border border-line bg-surface', box)}>
                <img src={logoUrl} alt="" className={cn('h-full w-full object-contain', size === 'md' && 'p-1')} />
            </span>
        )
    }
    return (
        <span
            className={cn('flex shrink-0 items-center justify-center rounded-control bg-surface-muted text-fg-subtle', box)}
            style={tint ? { backgroundColor: `${tint}1f`, color: tint } : undefined}
        >
            {icon ?? <Building2 />}
        </span>
    )
}

/**
 * A workspace (firm group, firm, or a firm you can join) in the pickers at `/d` and
 * `/d/{group}/f` — the same flat gallery card as All clients (.claude/plans/ui-ux-overhaul.md,
 * Phase 6): a logo or brand-tinted tile, the name, one line of context, and a footer.
 */
export function WorkspaceCard({
    name,
    meta,
    footer,
    badge,
    logoUrl,
    accent,
    icon,
    disabled,
    onClick,
}: {
    name: string
    /** One line under the name, e.g. "3 clients". */
    meta?: ReactNode
    /** Bottom row, e.g. the viewer's role. */
    footer?: ReactNode
    /** Top-right marker, e.g. "Current". */
    badge?: ReactNode
    logoUrl?: string | null
    /** Brand color for the tile tint; ignored unless it is a #rrggbb hex. */
    accent?: string | null
    /** Replaces the default building icon, e.g. a spinner while joining. */
    icon?: ReactNode
    disabled?: boolean
    onClick: () => void
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={cn(
                // The shared card shell: shadow, warm hover, focus ring, disabled state.
                interactiveCardClass(),
                'group flex h-40 flex-col p-3.5'
            )}
        >
            <div className="flex items-start justify-between gap-2">
                <WorkspaceMark logoUrl={logoUrl} accent={accent} icon={icon} />
                {badge}
            </div>
            <span className="mt-2.5 line-clamp-1 text-ui font-medium text-fg">{name}</span>
            {meta && <span className="mt-0.5 text-small text-fg-muted">{meta}</span>}
            {footer && <div className="mt-auto flex items-center gap-1.5 text-small text-fg-muted">{footer}</div>}
        </button>
    )
}
