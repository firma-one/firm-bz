import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type AppShellHintStripAccent = 'emerald' | 'slate' | 'amber'

const accentBorder: Record<AppShellHintStripAccent, string> = {
    emerald: 'border-[#006e16]/40',
    slate: 'border-slate-200',
    amber: 'border-amber-300/80',
}

/**
 * Matches `ProfileSection` foot: `border-t border-slate-100`, outer `py-2`,
 * inner row `gap-2` + `py-1.5` like the profile trigger button.
 */
export const APP_SHELL_PROFILE_RAIL_FOOT_CLASS = 'border-t border-slate-100 bg-white py-2'

export type AppShellHintStripDensity = 'default' | 'profileRail'

export type AppShellHintStripProps = {
    title: ReactNode
    description?: ReactNode
    /** Renders before the text column (e.g. billing icon) — used with `profileRail` for sidebar symmetry. */
    leading?: ReactNode
    actions?: ReactNode
    accent?: AppShellHintStripAccent
    /**
     * `default` — comfortable padding, accent top border, shadow.
     * `profileRail` — same border + vertical rhythm as sidebar `ProfileSection` (expanded or collapsed foot).
     */
    density?: AppShellHintStripDensity
    /** Optional native tooltip on the strip root. */
    nativeTitle?: string
    'aria-label'?: string
    className?: string
    innerClassName?: string
}

/**
 * Bottom hint bar for the `/d` app shell **middle pane** only.
 * Render as the last child inside `<main>` (sibling below the scrollable content wrapper).
 */
export function AppShellHintStrip({
    title,
    description,
    leading,
    actions,
    accent = 'emerald',
    density = 'default',
    nativeTitle,
    'aria-label': ariaLabel,
    className,
    innerClassName,
}: AppShellHintStripProps) {
    const isRail = density === 'profileRail'

    return (
        <div
            className={cn(
                'relative z-10 shrink-0',
                isRail
                    ? cn(APP_SHELL_PROFILE_RAIL_FOOT_CLASS, 'shadow-none')
                    : cn(
                          'border-t bg-white/95 shadow-[0_-4px_24px_-4px_rgba(15,23,42,0.08)] backdrop-blur-sm',
                          accentBorder[accent],
                          'pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 sm:pt-3'
                      ),
                className
            )}
            role="region"
            aria-label={ariaLabel}
            title={nativeTitle}
        >
            <div
                className={cn(
                    isRail
                        ? 'flex w-full items-center gap-2 py-1.5'
                        : 'mx-auto flex max-w-6xl flex-col gap-2.5 px-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6',
                    innerClassName
                )}
            >
                {leading ? <div className="shrink-0">{leading}</div> : null}
                <div className="min-w-0 flex-1">
                    <div
                        className={cn(
                            isRail
                                ? 'truncate text-sm font-semibold text-slate-900'
                                : 'text-sm font-semibold text-slate-900 sm:text-base'
                        )}
                    >
                        {title}
                    </div>
                    {description ? (
                        isRail ? (
                            <p
                                className="truncate text-xs text-slate-500"
                                title={typeof description === 'string' ? description : undefined}
                            >
                                {description}
                            </p>
                        ) : (
                            <div className="mt-0.5 text-xs leading-snug text-slate-600 sm:text-sm">{description}</div>
                        )
                    ) : null}
                </div>
                {actions ? (
                    <div
                        className={cn(
                            'flex shrink-0 items-center self-center',
                            isRail ? 'gap-1.5' : 'flex-wrap gap-2 sm:justify-end'
                        )}
                    >
                        {actions}
                    </div>
                ) : null}
            </div>
        </div>
    )
}
