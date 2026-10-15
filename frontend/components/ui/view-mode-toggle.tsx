'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { LayoutGrid, Table2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ViewMode = 'list' | 'grid'

/** Table / gallery switch for list pages (All clients, the workspace pickers). */
export function ViewModeToggle({ value, onChange }: { value: ViewMode; onChange: (mode: ViewMode) => void }) {
    const options: { mode: ViewMode; label: string; icon: ReactNode }[] = [
        { mode: 'list', label: 'Table view', icon: <Table2 className="h-3.5 w-3.5" /> },
        { mode: 'grid', label: 'Gallery view', icon: <LayoutGrid className="h-3.5 w-3.5" /> },
    ]
    return (
        <div className="inline-flex items-center rounded-control border border-line bg-surface-subtle p-0.5" role="group" aria-label="View">
            {options.map((o) => (
                <button
                    key={o.mode}
                    type="button"
                    onClick={() => onChange(o.mode)}
                    aria-pressed={value === o.mode}
                    aria-label={o.label}
                    title={o.label}
                    className={cn(
                        'flex h-6 w-7 items-center justify-center rounded-[4px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-action/30',
                        value === o.mode ? 'bg-surface text-fg shadow-sm' : 'text-fg-subtle hover:text-fg'
                    )}
                >
                    {o.icon}
                </button>
            ))}
        </div>
    )
}

/**
 * The view a list page opens in: the table by default, or whatever this viewer last picked there
 * (remembered per page in localStorage; storage being blocked just means the table every time).
 */
export function useViewMode(storageKey: string, fallback: ViewMode = 'list'): [ViewMode, (mode: ViewMode) => void] {
    const [mode, setMode] = useState<ViewMode>(fallback)
    useEffect(() => {
        try {
            const saved = localStorage.getItem(storageKey)
            if (saved === 'list' || saved === 'grid') setMode(saved)
        } catch { /* storage blocked */ }
    }, [storageKey])
    const choose = (next: ViewMode) => {
        setMode(next)
        try { localStorage.setItem(storageKey, next) } catch { /* storage blocked */ }
    }
    return [mode, choose]
}
