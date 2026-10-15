'use client'

import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface OptionalFieldsSectionProps {
    open: boolean
    onToggle: () => void
    children: React.ReactNode
    label?: string
    className?: string
}

/**
 * Notion's "N more properties" disclosure for the create dialogs (.claude/plans/ui-ux-overhaul.md,
 * Phase 6): a quiet row that reveals the remaining property rows in place — no box, no header bar.
 */
export function OptionalFieldsSection({ open, onToggle, children, label = 'More properties', className = '' }: OptionalFieldsSectionProps) {
    return (
        <section className={cn('flex flex-col', className)}>
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                className="flex h-8 w-fit items-center gap-1.5 rounded-control px-2 text-small text-fg-muted outline-none transition-colors hover:bg-surface-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-action/30"
            >
                <ChevronRight className={cn('h-3.5 w-3.5 transition-transform duration-150', open && 'rotate-90')} aria-hidden />
                {open ? 'Fewer properties' : label}
            </button>
            <div className={cn('grid transition-[grid-template-rows] duration-200 ease-out', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                <div className="min-h-0 overflow-hidden">
                    <div className="pt-1">{children}</div>
                </div>
            </div>
        </section>
    )
}
