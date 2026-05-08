'use client'

import React from 'react'

type TipPosition = 'top' | 'top-right' | 'top-left' | 'bottom' | 'bottom-right' | 'bottom-left'

type TipProps = {
    label: string
    position?: TipPosition
    /** Override background color (hex). When provided, tooltip uses dark style (white text on colored bg). */
    color?: string
    children: React.ReactNode
}

/**
 * App-wide tooltip. Light-themed by default (white bg, slate border, dark text).
 * Pass `color` (hex) for a colored dark-text-on-color variant — useful inside branded panels.
 */
export function Tip({ label, position = 'top', color, children }: TipProps) {
    const isBottom = position.startsWith('bottom')
    const vClass = isBottom ? 'top-full mt-1.5' : 'bottom-full mb-1.5'
    const hClass =
        position === 'top-right' || position === 'bottom-right'
            ? 'right-0'
            : position === 'top-left' || position === 'bottom-left'
            ? 'left-0'
            : 'left-1/2 -translate-x-1/2'

    const style = color
        ? { background: color, color: '#fff' }
        : undefined
    const baseClass = color
        ? 'text-[11px] font-medium px-2.5 py-1 rounded-md whitespace-nowrap shadow-lg'
        : 'bg-white border border-slate-200 text-slate-800 text-[11px] font-medium px-2.5 py-1 rounded-md whitespace-nowrap shadow-md'

    return (
        <div className="relative group/tip inline-flex">
            {children}
            <div className={`pointer-events-none absolute ${vClass} ${hClass} z-[9999] hidden group-hover/tip:block`}>
                <div className={baseClass} style={style}>
                    {label}
                </div>
            </div>
        </div>
    )
}
